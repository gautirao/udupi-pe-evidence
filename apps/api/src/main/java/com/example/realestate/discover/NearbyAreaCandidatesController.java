package com.example.realestate.discover;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.concurrent.TimeUnit;

/**
 * Backs {@code GET /api/discover/areas/nearby-candidates} — bounded, filter-aware "nearby area"
 * suggestions for the AREA_SET multi-area chip strip (#2017).
 *
 * <p>Public/anonymous (see {@code JwtConfig}'s permitAll rule for this exact path, mirroring
 * {@code /api/discover/areas}), and unknown/inactive {@code city} yields a 200 with an empty
 * {@code candidates} list — never a 404 — matching {@link AreaSummaryController}'s convention.
 *
 * <p>Filter {@code @RequestParam}s below mirror {@link DiscoverListingsController} verbatim (same
 * names, same parsing) so the frontend can reuse its existing filter serializer without a second,
 * drift-prone vocabulary. Unlike {@code DiscoverListingsController}, malformed/unrecognized filter
 * values here are silently normalized away (never a 400) by {@link DiscoverListingPredicateBuilder},
 * since this is a best-effort suggestion endpoint, not the primary listings query.
 */
@RestController
@RequestMapping("/api/discover/areas/nearby-candidates")
public class NearbyAreaCandidatesController {

    private static final Logger log = LoggerFactory.getLogger(NearbyAreaCandidatesController.class);

    private static final TypeReference<List<List<Double>>> POLYGON_TYPE = new TypeReference<>() {};

    private final NearbyAreaCandidatesService service;
    private final ObjectMapper objectMapper;

    public NearbyAreaCandidatesController(NearbyAreaCandidatesService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public ResponseEntity<NearbyAreaCandidatesResponse> getNearbyCandidates(
            @RequestParam(name = "city") String city,
            @RequestParam(name = "selected", required = false) List<String> selected,
            @RequestParam(name = "limit", required = false) Integer limit,
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
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose
    ) {
        log.debug("GET /api/discover/areas/nearby-candidates city={} selected={} limit={}",
                city, selected, limit);

        // Best-effort suggestion endpoint: unlike DiscoverListingsController, a malformed polygon
        // or bbox here is silently dropped (falls back to no geo-filter) rather than a 400 — this
        // is a suggestions strip, not the primary listings query, and must never surface an error
        // to the chip UI.
        List<List<Double>> polygon = parsePolygonSilently(polygonJson);
        DiscoverListingPredicateBuilder.Bbox bbox = parseBboxSilently(bboxParam);

        Long priceMinPaise = priceMin != null ? priceMin * 100L : null;
        Long priceMaxPaise = priceMax != null ? priceMax * 100L : null;

        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
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
                bbox,
                q,
                listingPurpose,
                null,  // excludePropertyTypes — not applicable to nearby-area suggestions
                null,  // areaKeys — not applicable to nearby-area suggestions
                null   // viewportScope (#2015) — nearby-area suggestions are not scoped by viewport
        );

        NearbyAreaCandidatesResponse response = service.findCandidates(city, selected, limit, filters);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS).cachePublic())
                .body(response);
    }

    private List<List<Double>> parsePolygonSilently(String polygonJson) {
        if (polygonJson == null || polygonJson.isBlank()) return null;
        try {
            List<List<Double>> polygon = objectMapper.readValue(polygonJson, POLYGON_TYPE);
            return (polygon == null || polygon.size() < 3) ? null : polygon;
        } catch (Exception e) {
            log.debug("Unparseable polygon param on nearby-candidates: {}", polygonJson, e);
            return null;
        }
    }

    private DiscoverListingPredicateBuilder.Bbox parseBboxSilently(String bboxParam) {
        try {
            return BboxParser.parse(bboxParam);
        } catch (ResponseStatusException e) {
            log.debug("Unparseable bbox param on nearby-candidates: {}", bboxParam, e);
            return null;
        }
    }
}
