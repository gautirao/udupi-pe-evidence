package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Public (unauthenticated) endpoint: city-first area listings.
 *
 * <p>GET /api/discover/cities/{city}/listings
 * <pre>
 *   ?areaKeys=IN|KA|Udupi|Malpe&areaKeys=IN|KA|Udupi|Manipal&limitPerArea=5
 * </pre>
 *
 * <p>No JWT required — see JwtConfig for the permitAll rule on this path.
 */
@RestController
@RequestMapping("/api/discover")
public class CityAreaListingsController {

    private static final Logger log = LoggerFactory.getLogger(CityAreaListingsController.class);

    // Applies to bbox only (this endpoint has no separate viewportScope — bbox IS the
    // anon "Search this area" candidate scope here, additive within the required areaKeys
    // set). Mirrors the identical cap/rationale duplicated in DiscoverListingsController and
    // DiscoverMarkersController: neither BboxParser's lat/lon-range check nor the
    // south<=north/west<=east checks reject an overly large rectangle (e.g. "-90,-180,90,180"
    // passes both). This is a safety cap so a single request cannot force an unbounded
    // sequential/bitmap scan over the whole geog index. 10 degrees comfortably covers a
    // city/metro-scale "Search this area" viewport with headroom to spare.
    private static final double MAX_BOUNDS_SPAN_DEGREES = 10.0;

    private final CityAreaListingsService service;

    public CityAreaListingsController(CityAreaListingsService service) {
        this.service = service;
    }

    /**
     * Returns per-area LIVE listings for the given city, limited to {@code limitPerArea}
     * entries per area (server-clamped to 20).
     *
     * <p>Optional filter params (all absent = no filter applied):
     * <ul>
     *   <li>{@code minPrice} — minimum price in paise (inclusive)</li>
     *   <li>{@code maxPrice} — maximum price in paise (inclusive)</li>
     *   <li>{@code bedrooms} — exact bedroom count (values &ge; 4 treated as "4 or more")</li>
     *   <li>{@code propertyType} — property type string (case-insensitive)</li>
     *   <li>{@code q} — full-text keyword search (max 500 chars); matched against
     *       {@code search_vector} via {@code websearch_to_tsquery}</li>
     * </ul>
     *
     * @param city         city slug (e.g. {@code udupi})
     * @param areaKeys     one or more canonical area keys (e.g. {@code IN|KA|Udupi|Malpe})
     * @param limitPerArea max listings per area; default 5, max 20 server-side
     * @param minPrice     optional minimum price in paise
     * @param maxPrice     optional maximum price in paise
     * @param bedrooms     optional bedroom count filter
     * @param propertyType optional property type filter
     * @param q            optional keyword search query (blank treated as absent; max 500 chars)
     * @param readyToMove  optional; when {@code true}, restricts to listings whose
     *                     {@code possession_status = 'READY'} (#2023 parity with the
     *                     authenticated Browse-all / markers / navigation-count paths,
     *                     which already filter on this via {@code DiscoverListingPredicateBuilder})
     * @param bbox         viewport rectangle ({@code "south,west,north,east"}, see
     *                     {@link BboxParser}) for the anonymous "Search this area" flow (#2015).
     *                     <b>Required when {@code areaKeys} is absent</b> — {@code areaKeys} and
     *                     {@code bbox} cannot both be absent. When both are present, bbox narrows
     *                     each area's results to those intersecting the rectangle (existing
     *                     behavior, unchanged). When {@code areaKeys} is absent and {@code bbox}
     *                     is present, this is a standalone bbox-only viewport query — no per-area
     *                     grouping, results are capped globally at
     *                     {@value CityAreaListingsService#BBOX_ONLY_MAX_RESULTS} (see
     *                     {@link CityAreaListingsService}). Span is capped at
     *                     {@value #MAX_BOUNDS_SPAN_DEGREES} degrees per axis (see
     *                     {@link #validateBoundsSpan}) in every case.
     */
    @GetMapping("/cities/{city}/listings")
    public ResponseEntity<CityAreaListingsResponse> getCityAreaListings(
            @PathVariable("city") String city,
            @RequestParam(name = "areaKeys", required = false) List<String> areaKeys,
            @RequestParam(name = "limitPerArea", required = false) Integer limitPerArea,
            @RequestParam(required = false) Long minPrice,
            @RequestParam(required = false) Long maxPrice,
            @RequestParam(required = false) Integer bedrooms,
            @RequestParam(required = false) String propertyType,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String listingPurpose,
            @RequestParam(required = false) Boolean readyToMove,
            @RequestParam(required = false) String bbox) {

        boolean areaKeysAbsent = areaKeys == null || areaKeys.isEmpty() || areaKeys.stream().allMatch(String::isBlank);
        boolean bboxAbsent = bbox == null || bbox.isBlank();

        // #2015 — bbox-only "Search this area" is allowed when areaKeys is absent, provided a
        // bbox is supplied instead. areaKeys and bbox cannot BOTH be absent — that remains a 400
        // exactly as before. (The bbox-only VIEWPORT is deliberately allowed to cross the
        // originating AREA boundary — see issue #2015 design ruling.)
        if (areaKeysAbsent && bboxAbsent) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "areaKeys_required");
        }

        if (q != null && q.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "query_too_long");
        }

        // #2015 — anon "Search this area" viewport narrowing. Reuses BboxParser (shared with
        // DiscoverListingsController/DiscoverMarkersController) so the parsing/validation contract
        // is defined exactly once; the span cap below is duplicated locally (see
        // MAX_BOUNDS_SPAN_DEGREES javadoc) rather than refactoring those two untouched controllers.
        DiscoverListingPredicateBuilder.Bbox parsedBbox = BboxParser.parse(bbox);
        validateBoundsSpan(parsedBbox, "bbox_span_exceeds_max");

        // Determine auth state using the canonical pattern from PublicListingController.
        // permitAll skips authorization but the Bearer filter still populates SecurityContext
        // when a valid JWT is present — so this check is reliable.
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean isAuthenticated = auth != null
                && auth.isAuthenticated()
                && !(auth instanceof AnonymousAuthenticationToken);

        log.debug("GET /api/discover/cities/{}/listings areaKeys={} limitPerArea={} minPrice={} maxPrice={} bedrooms={} propertyType={} q={} bbox={} authenticated={}",
                city, areaKeys != null ? areaKeys.size() : 0, limitPerArea, minPrice, maxPrice, bedrooms, propertyType,
                q != null ? "[present]" : null, parsedBbox != null ? "[present]" : null, isAuthenticated);

        CityAreaListingsResponse response = service.getAreaListings(
                city, areaKeys, limitPerArea, minPrice, maxPrice, bedrooms, propertyType, q, listingPurpose,
                readyToMove, parsedBbox, isAuthenticated);

        // Cache-control split by auth state:
        //   anon  → coarsened response; safe to share via public cache (maxAge 60s)
        //   authed → exact price data; MUST NOT be stored in a shared cache
        CacheControl cacheControl = isAuthenticated
                ? CacheControl.noStore()
                : CacheControl.maxAge(60, TimeUnit.SECONDS).cachePublic();

        return ResponseEntity.ok()
                .cacheControl(cacheControl)
                .body(response);
    }

    // Mirrors the identical helper duplicated in DiscoverListingsController and
    // DiscoverMarkersController (see MAX_BOUNDS_SPAN_DEGREES javadoc above).
    private static void validateBoundsSpan(DiscoverListingPredicateBuilder.Bbox bounds, String errorCode) {
        if (bounds == null) return;
        double latSpan = bounds.north() - bounds.south();
        double lonSpan = bounds.east() - bounds.west();
        if (latSpan > MAX_BOUNDS_SPAN_DEGREES || lonSpan > MAX_BOUNDS_SPAN_DEGREES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorCode);
        }
    }
}
