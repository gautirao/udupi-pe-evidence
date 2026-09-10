package com.example.realestate.discover;

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
 * frontend reuses its existing filter serializer, plus the scope params: {@code areaKeys}, the
 * committed AREA/AREA_SET scope, or (#2454) {@code viewportScope}, a committed VIEWPORT bbox —
 * mutually exclusive per {@link ResultScopeExclusivity}. As on the nearby-candidates endpoint,
 * malformed non-scope values ({@code bbox}) are silently normalized away rather than raising a 400
 * — this is a suggestions strip, not the primary listings query, and must never surface an error
 * into the recovery panel that is already explaining a zero result. A scope, by contrast, is
 * validated strictly: a {@code viewportScope} that fails {@link BboxParser}'s rules or the #2015
 * span cap is a 400 with the same reason the listings query would give, because a silently
 * "repaired" scope would count a different geometry than the one being searched.
 *
 * <p><b>No polygon here, by construction (#2454).</b> Polygon search is signed-in-only for MVP,
 * so this anonymous endpoint rejects ANY {@code polygon} param with 400
 * {@code polygon_scope_requires_authentication} and never builds a filter set containing one;
 * the POLYGON variant lives on the authenticated sibling
 * {@link PolygonRelaxationPreviewsController} ({@code /api/discover/listings/relaxation-previews}),
 * which is absent from {@code JwtConfig}'s permitAll list. Before #2454 a polygon was accepted
 * into the filter set and ANDed with the area keys; that was an anonymous polygon count path
 * (bounded by the areas, but a path), and it is closed rather than kept.
 */
@RestController
@RequestMapping("/api/discover/areas/relaxation-previews")
public class RelaxationPreviewsController {

    private static final Logger log = LoggerFactory.getLogger(RelaxationPreviewsController.class);

    private final RelaxationPreviewsService service;

    public RelaxationPreviewsController(RelaxationPreviewsService service) {
        this.service = service;
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
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose,
            @RequestParam(name = "viewportScope", required = false) String viewportScopeParam
    ) {
        log.debug("GET /api/discover/areas/relaxation-previews city={} areaKeys={} limit={}",
                city, areaKeys, limit);

        // #2454: fail closed on any polygon, well-formed or not — see the class Javadoc.
        if (polygonJson != null && !polygonJson.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_scope_requires_authentication");
        }

        // #2454 VIEWPORT scope: the #2015 bounds rules (BboxParser + span cap), same reason
        // codes as /api/discover/listings, applied strictly. Exclusive with areaKeys (#2016).
        DiscoverListingPredicateBuilder.Bbox viewportScope = BboxParser.parse(viewportScopeParam);
        BboxParser.requireSpanWithin(viewportScope, "viewport_scope_span_exceeds_max");
        ResultScopeExclusivity.check(areaKeys, null, viewportScope);

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
                null,  // polygon — never accepted on this anonymous endpoint (rejected above)
                schoolLat,
                schoolLon,
                schoolRadiusKm,
                bbox,
                q,
                listingPurpose,
                null,  // excludePropertyTypes — not applicable to relaxation previews
                null,  // areaKeys — the service re-scopes to the committed scope below
                null   // viewportScope — likewise
        );

        RelaxationPreviewsResponse response = viewportScope != null
                ? service.findPreviewsForScope(city, new RelaxationScope.Viewport(viewportScope), limit, filters)
                : service.findPreviews(city, areaKeys, limit, filters);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS).cachePublic())
                .body(response);
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
