package com.example.realestate.discover;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.realestate.discover.navigation.NavigationGraphCache;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Authenticated endpoint for paginated listing discovery.
 *
 * <p>GET /api/discover/listings
 *
 * <p>All query params are optional except {@code city}. Pagination defaults: page=0, size=20.
 * Price params ({@code priceMin}/{@code priceMax}) are in rupees and converted to paise (×100).
 */
@RestController
@RequestMapping("/api/discover/listings")
public class DiscoverListingsController {

    private static final Logger log = LoggerFactory.getLogger(DiscoverListingsController.class);

    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 50;

    // Applies to both bbox and viewportScope — neither BboxParser's lat/lon-range check nor
    // the south<=north/west<=east checks reject an overly large rectangle (e.g. "-90,-180,90,180"
    // passes both). This is a shared safety cap so a single request cannot force an unbounded
    // sequential/bitmap scan over the whole geog index. 10 degrees comfortably covers a
    // city/metro-scale "Search this area" viewport with headroom to spare.
    private static final double MAX_BOUNDS_SPAN_DEGREES = 10.0;

    private static final TypeReference<List<List<Double>>> POLYGON_TYPE =
            new TypeReference<>() {};

    private final DiscoverListingsPort service;
    private final ObjectMapper objectMapper;
    private final NavigationGraphCache navigationGraphCache;
    private final PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;

    public DiscoverListingsController(DiscoverListingsPort service, ObjectMapper objectMapper,
            NavigationGraphCache navigationGraphCache, PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy) {
        this.service = service;
        this.objectMapper = objectMapper;
        this.navigationGraphCache = navigationGraphCache;
        this.polygonGeographicSafetyPolicy = polygonGeographicSafetyPolicy;
    }

    @GetMapping
    public ResponseEntity<DiscoverListingsPage> getListings(
            @RequestParam(name = "city") String city,
            @RequestParam(name = "propertyTypes", required = false) List<String> propertyTypes,
            @RequestParam(name = "priceMin", required = false) Long priceMin,
            @RequestParam(name = "priceMax", required = false) Long priceMax,
            @RequestParam(name = "dateFrom", required = false) String dateFrom,
            @RequestParam(name = "dateTo", required = false) String dateTo,
            @RequestParam(name = "bedrooms", required = false) List<Integer> bedrooms,
            @RequestParam(name = "sellerTypes", required = false) List<String> sellerTypes,
            @RequestParam(name = "backOnMarket", required = false) Boolean backOnMarket,
            @RequestParam(name = "newToMarket", required = false) Boolean newToMarket,
            @RequestParam(name = "reraRegistered", required = false) Boolean reraRegistered,
            @RequestParam(name = "readyToMove", required = false) Boolean readyToMove,
            @RequestParam(name = "polygon", required = false) String polygonJson,
            @RequestParam(name = "schoolLat", required = false) Double schoolLat,
            @RequestParam(name = "schoolLon", required = false) Double schoolLon,
            @RequestParam(name = "schoolRadiusKm", required = false) Double schoolRadiusKm,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "bbox", required = false) String bboxParam,
            @RequestParam(name = "page", required = false, defaultValue = "0") int page,
            @RequestParam(name = "size", required = false, defaultValue = "20") int size,
            @RequestParam(name = "includeAggregates", required = false, defaultValue = "false") boolean includeAggregates,
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose,
            @RequestParam(name = "areaKeys", required = false) List<String> areaKeys,
            @RequestParam(name = "nodeKey", required = false) String nodeKey,
            @RequestParam(name = "viewportScope", required = false) String viewportScopeParam,
            @RequestParam(name = "scopeFingerprint", required = false) String scopeFingerprint
    ) {
        log.debug("GET /api/discover/listings city={} page={} size={}", city, page, size);

        // Validate page
        if (page < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page_must_be_non_negative");
        }

        // Clamp size
        int effectiveSize = Math.max(1, Math.min(size, MAX_SIZE));

        // Validate q length
        if (q != null && q.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "q_exceeds_max_length");
        }

        // Validate partial school params
        if ((schoolLat == null) != (schoolLon == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "school_lat_and_lon_required_together");
        }

        // Parse and validate polygon
        List<List<Double>> polygon = parsePolygon(polygonJson);

        // Parse and validate bbox — the always-on render/perf viewport prefilter.
        DiscoverListingPredicateBuilder.Bbox bbox = BboxParser.parse(bboxParam);
        validateBoundsSpan(bbox, "bbox_span_exceeds_max");

        // Parse and validate viewportScope (#2015/#2016) — structurally distinct from bbox
        // above. Same "south,west,north,east" encoding (reuses BboxParser's validation), but
        // this is a candidate result SCOPE (one of AREA_SET/POLYGON/VIEWPORT), not the
        // render/perf prefilter: DiscoverListingPredicateBuilder applies it as an additional
        // pl.geog && ST_MakeEnvelope(...) predicate (#2015), and its presence also participates
        // in the exclusivity check below.
        DiscoverListingPredicateBuilder.Bbox viewportScope = BboxParser.parse(viewportScopeParam);
        validateBoundsSpan(viewportScope, "viewport_scope_span_exceeds_max");

        // areaKeys: absent (null) = no area filter; present-but-empty = client bug → reject.
        // Non-empty list is forwarded as-is and ANDed with the city subselect in the builder.
        List<String> effectiveAreaKeys = areaKeys;
        if (nodeKey != null) {
            // Issue #2087: Enforce bounded eligibility at the server boundary.
            // Root node is never eligible (city-wide browse is excluded by the owner contract).
            // Nodes with more than 15 canonical descendant Areas are also ineligible —
            // the CTA guards against this on the frontend, but URL/direct-API bypass
            // must be rejected here so the bounded scope rule is fail-closed.
            effectiveAreaKeys = NodeKeyResolver.resolveDescendantAreaKeys(navigationGraphCache, city, nodeKey, 15);
        }

        if (effectiveAreaKeys != null && effectiveAreaKeys.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "area_keys_must_not_be_empty");
        }

        // Result-scope exclusivity (#2016): AREA_SET (effectiveAreaKeys — from either the raw
        // areaKeys param OR a resolved nodeKey), POLYGON and VIEWPORT are three mutually
        // exclusive geographic result scopes — at most one may be active per request. Must run
        // AFTER effectiveAreaKeys is resolved above so nodeKey+polygon / nodeKey+viewportScope
        // are caught too, not just the raw-areaKeys combinations (#2016 review fix-cycle-1).
        // bbox is deliberately EXCLUDED from this check: it is the always-on render/perf
        // viewport prefilter and legitimately combines with any of the three scopes today.
        ResultScopeExclusivity.check(effectiveAreaKeys, polygon, viewportScope);

        // Geographic-safety/eligibility policy for a committed POLYGON scope (#2420): rejects a
        // polygon materially outside the selected city or too broad to be a meaningful
        // neighbourhood-level search. No-op when polygon is null.
        polygonGeographicSafetyPolicy.validate(city, polygon);

        // Convert rupees → paise
        Long priceMinPaise = priceMin != null ? priceMin * 100L : null;
        Long priceMaxPaise = priceMax != null ? priceMax * 100L : null;

        DiscoverListingsQuery query = new DiscoverListingsQuery(
                city,
                propertyTypes,
                priceMinPaise,
                priceMaxPaise,
                dateFrom,
                dateTo,
                bedrooms,
                sellerTypes,
                backOnMarket,
                newToMarket,
                reraRegistered,
                readyToMove,
                polygon,
                schoolLat,
                schoolLon,
                schoolRadiusKm,
                q,
                bbox,
                page,
                effectiveSize,
                includeAggregates,
                listingPurpose,
                effectiveAreaKeys,
                viewportScope,
                scopeFingerprint
        );

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.getListings(query));
    }

    /**
     * Rejects a bbox/viewportScope rectangle whose lat or lon span exceeds
     * {@link #MAX_BOUNDS_SPAN_DEGREES}. No-op when {@code bounds} is null (param absent).
     */
    private static void validateBoundsSpan(DiscoverListingPredicateBuilder.Bbox bounds, String errorCode) {
        if (bounds == null) return;
        double latSpan = bounds.north() - bounds.south();
        double lonSpan = bounds.east() - bounds.west();
        if (latSpan > MAX_BOUNDS_SPAN_DEGREES || lonSpan > MAX_BOUNDS_SPAN_DEGREES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorCode);
        }
    }

    /**
     * Parses a JSON polygon string (e.g. {@code [[13.3,74.7],[13.4,74.8],[13.3,74.8]]}).
     * Returns null when the param is absent/blank.
     * Throws 400 when polygon is present but has fewer than 3 vertices.
     */
    private List<List<Double>> parsePolygon(String polygonJson) {
        if (polygonJson == null || polygonJson.isBlank()) return null;
        try {
            List<List<Double>> polygon = objectMapper.readValue(polygonJson, POLYGON_TYPE);
            if (polygon == null || polygon.size() < 3) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_must_have_at_least_3_vertices");
            }
            return polygon;
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.debug("Unparseable polygon param: {}", polygonJson, e);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_invalid_json");
        }
    }

}
