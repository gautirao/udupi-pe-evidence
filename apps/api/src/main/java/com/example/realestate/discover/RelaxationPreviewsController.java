package com.example.realestate.discover;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Backs {@code GET /api/discover/areas/relaxation-previews} — deterministic single-filter
 * relaxation offers with real count previews for the zero-result recovery panel (#2018 slice 2).
 *
 * <p><b>Why this path, and not {@code /api/discover/listings/relaxation-previews}.</b> The scope
 * vocabulary here is canonical AREA keys, exactly like its sibling
 * {@code /api/discover/areas/nearby-candidates} (#2017): both are anonymous, bounded, best-effort
 * suggestion endpoints serving the same recovery panel, so they belong side by side. Placing it
 * under {@code /api/discover/listings/} would put an anonymous endpoint inside the prefix of
 * {@code /api/discover/listings}, which is the AUTHENTICATED listings query (it is deliberately
 * absent from {@code JwtConfig}'s permitAll list and falls through to
 * {@code anyRequest().authenticated()}). That would not have broken anything on its own —
 * {@code DiscoverRateLimitFilter}'s exclusion list is matched by EXACT path, not by prefix, so this
 * endpoint would still have been correctly rate-limited there — but it would leave a public path
 * nested under an authenticated one, which is a trap for the next person editing either list.
 *
 * <p>Public/anonymous, mirroring {@code /api/discover/areas/nearby-candidates}: see
 * {@code JwtConfig}'s permitAll rule for this exact path. Rate-limited by
 * {@code DiscoverRateLimitFilter} like the rest of the public discover GET family.
 *
 * <p>Filter {@code @RequestParam}s mirror {@link NearbyAreaCandidatesController} verbatim so the
 * frontend reuses its existing filter serializer, with one addition: {@code areaKeys}, the
 * committed AREA/AREA_SET scope the counts are computed over. As on the nearby-candidates endpoint,
 * malformed polygon/bbox values are silently normalized away rather than raising a 400 — this is a
 * suggestions strip, not the primary listings query, and must never surface an error into the
 * recovery panel that is already explaining a zero result.
 */
@RestController
@RequestMapping("/api/discover/areas/relaxation-previews")
public class RelaxationPreviewsController {

    private static final Logger log = LoggerFactory.getLogger(RelaxationPreviewsController.class);

    private static final TypeReference<List<List<Double>>> POLYGON_TYPE = new TypeReference<>() {};

    private final RelaxationPreviewsService service;
    private final ObjectMapper objectMapper;

    public RelaxationPreviewsController(RelaxationPreviewsService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public ResponseEntity<RelaxationPreviewsResponse> getRelaxationPreviews(
            @RequestParam(name = "city") String city,
            @RequestParam(name = "areaKeys", required = false) List<String> areaKeys,
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
        log.debug("GET /api/discover/areas/relaxation-previews city={} areaKeys={} limit={}",
                city, areaKeys, limit);

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
                null,  // excludePropertyTypes — not applicable to relaxation previews
                null,  // areaKeys — the service re-scopes to the `areaKeys` param below
                null   // viewportScope — an AREA/AREA_SET scope is never also a viewport scope
        );

        RelaxationPreviewsResponse response = service.findPreviews(city, areaKeys, limit, filters);

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
            log.debug("Unparseable polygon param on relaxation-previews: {}", polygonJson, e);
            return null;
        }
    }

    private DiscoverListingPredicateBuilder.Bbox parseBboxSilently(String bboxParam) {
        try {
            return BboxParser.parse(bboxParam);
        } catch (ResponseStatusException e) {
            log.debug("Unparseable bbox param on relaxation-previews: {}", bboxParam, e);
            return null;
        }
    }
}
