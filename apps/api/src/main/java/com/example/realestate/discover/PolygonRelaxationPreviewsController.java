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

/**
 * Backs {@code GET /api/discover/listings/relaxation-previews} — the POLYGON variant of the
 * zero-result relaxation previews (#2454, #2018 slice 4).
 *
 * <p><b>Why a sibling endpoint, and why this path.</b> Polygon search is signed-in-only for MVP:
 * the anonymous listings path never sends a polygon and {@code /api/discover/listings} is the
 * AUTHENTICATED query. A polygon count endpoint must therefore be unreachable anonymously
 * <em>by construction</em>, not by a runtime principal check inside the public
 * {@link RelaxationPreviewsController} that a later edit could drop. This path is deliberately
 * absent from {@code JwtConfig}'s permitAll list, so it falls through to
 * {@code anyRequest().authenticated()} exactly like its parent {@code /api/discover/listings}; the
 * public endpoint, for its part, rejects any {@code polygon} param outright. It is listed in
 * {@code DiscoverRateLimitFilter}'s authenticated-path exclusions, paired with that JwtConfig
 * fallthrough per that filter's contract.
 *
 * <p><b>Same gate as the listings path.</b> The polygon is parsed with the listings controller's
 * rules ({@code polygon_invalid_json}, {@code polygon_must_have_at_least_3_vertices}) and then
 * validated by the same {@link PolygonGeographicSafetyPolicy} (#2420) with the same reason codes,
 * BEFORE any count query runs. An unvalidated polygon never reaches
 * {@link RelaxationPreviewsService}.
 *
 * <p>Filter {@code @RequestParam}s mirror {@link RelaxationPreviewsController} verbatim (minus its
 * scope params) so the frontend reuses the same filter serializer, and so
 * {@code RelaxationPreviewsFilterParityTest} can prove both endpoints parse a query string
 * identically. Malformed non-scope values ({@code bbox}) are normalized away as on the sibling;
 * the polygon itself is the scope and is never silently dropped.
 */
@RestController
@RequestMapping("/api/discover/listings/relaxation-previews")
public class PolygonRelaxationPreviewsController {

    private static final Logger log = LoggerFactory.getLogger(PolygonRelaxationPreviewsController.class);

    private static final TypeReference<List<List<Double>>> POLYGON_TYPE = new TypeReference<>() {};

    private final RelaxationPreviewsService service;
    private final ObjectMapper objectMapper;
    private final PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;

    public PolygonRelaxationPreviewsController(
            RelaxationPreviewsService service,
            ObjectMapper objectMapper,
            PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy) {
        this.service = service;
        this.objectMapper = objectMapper;
        this.polygonGeographicSafetyPolicy = polygonGeographicSafetyPolicy;
    }

    @GetMapping
    public ResponseEntity<RelaxationPreviewsResponse> getPolygonRelaxationPreviews(
            @RequestParam(name = "city") String city,
            @RequestParam(name = "polygon") String polygonJson,
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
            @RequestParam(name = "schoolLat", required = false) Double schoolLat,
            @RequestParam(name = "schoolLon", required = false) Double schoolLon,
            @RequestParam(name = "schoolRadiusKm", required = false) Double schoolRadiusKm,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "bbox", required = false) String bboxParam,
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose
    ) {
        log.debug("GET /api/discover/listings/relaxation-previews city={} limit={}", city, limit);

        // Scope: the listings path's parse rules, then the listings path's safety policy. Both
        // run before the service is touched, so a rejected polygon is never counted.
        List<List<Double>> polygon = parsePolygon(polygonJson);
        polygonGeographicSafetyPolicy.validate(city, polygon);

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
                null,  // polygon — the service re-scopes to the validated scope below
                schoolLat,
                schoolLon,
                schoolRadiusKm,
                bbox,
                q,
                listingPurpose,
                null,  // excludePropertyTypes — not applicable to relaxation previews
                null,  // areaKeys — a POLYGON scope is never also an area scope
                null   // viewportScope — a POLYGON scope is never also a viewport scope
        );

        RelaxationPreviewsResponse response = service.findPreviewsForScope(
                city, new RelaxationScope.Polygon(polygon), limit, filters);

        // Authenticated, like /api/discover/listings: never shared-cacheable.
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(response);
    }

    /** Mirrors {@code DiscoverListingsController#parsePolygon}: same reasons, same thresholds. */
    private List<List<Double>> parsePolygon(String polygonJson) {
        if (polygonJson == null || polygonJson.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_must_have_at_least_3_vertices");
        }
        try {
            List<List<Double>> polygon = objectMapper.readValue(polygonJson, POLYGON_TYPE);
            if (polygon == null || polygon.size() < 3) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_must_have_at_least_3_vertices");
            }
            return polygon;
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.debug("Unparseable polygon param on polygon relaxation-previews: {}", polygonJson, e);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_invalid_json");
        }
    }

    private DiscoverListingPredicateBuilder.Bbox parseBboxSilently(String bboxParam) {
        try {
            return BboxParser.parse(bboxParam);
        } catch (ResponseStatusException e) {
            log.debug("Unparseable bbox param on polygon relaxation-previews: {}", bboxParam, e);
            return null;
        }
    }
}
