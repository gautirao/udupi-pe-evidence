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

    /**
     * #2533 — cheap upper bound on the RAW size of a repeatable filter param, rejected before any
     * normalisation work is done.
     *
     * <p>This is not the security-meaningful cap; {@link DiscoverFilterNormalizer}'s own
     * {@code MAX_PROPERTY_TYPE_VALUES} / {@code MAX_BEDROOM_VALUES} bound what actually reaches
     * SQL, and the service applies those AFTER normalisation. This guard exists because
     * normalisation is not free: {@code preserveUnsatisfiable} deliberately KEEPS unrecognised
     * values (so an impossible request matches nothing rather than silently widening), which means
     * a 10,000-element list of garbage is not filtered down — it is carried. Bounding request
     * SHAPE here stops that work being done at all.
     *
     * <p>Deliberately generous: it is an abuse guard, not a product constraint. No legitimate
     * client sends anywhere near this many values, and the narrower vocabulary caps do the real
     * narrowing downstream.
     */
    private static final int MAX_RAW_FILTER_VALUES = 50;

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
     *   <li>{@code commercialSubtypes} — Commercial buyer subtype narrowing (#2509), repeatable;
     *       unknown values are rejected with a 400 rather than ignored</li>
     *   <li>{@code q} — full-text keyword search (max 500 chars); matched against
     *       {@code search_vector} via {@code websearch_to_tsquery}</li>
     *   <li>{@code areaMinSqft} / {@code areaMaxSqft} — inclusive bounds, in sq ft, on the row's
     *       PRIMARY area (#2459, wired to this endpoint by #2450). The meaning follows the row —
     *       built-up for dwellings/shops/offices/buildings, warehouse area for warehouses, plot
     *       size for land — and a row whose primary area cannot be resolved matches NEITHER bound.
     *       A negative or inverted range is a 400, via the same {@link AreaBoundsParam} the
     *       listings and markers endpoints use</li>
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
            // #2533 — widened from Integer/String so a multi-value narrowing is expressible at all.
            // The param NAMES are deliberately unchanged: Spring binds a single
            // ?propertyType=apartment to a one-element list and the repeated form to an N-element
            // list, so every request shape the current frontend sends behaves exactly as before.
            // Renaming these to the sibling endpoint's plural spelling (DiscoverListingsController
            // :62 uses propertyTypes) would break the unchanged frontend and force this work back
            // into a single cross-layer PR. Do not "fix" that asymmetry without reading this.
            @RequestParam(required = false) List<Integer> bedrooms,
            @RequestParam(required = false) List<String> propertyType,
            // #2509 — the anon path could not express a Commercial subtype AT ALL: an unknown query
            // param is silently discarded by Spring, so the control responded and the results
            // ignored it. Named with the sibling endpoints' plural spelling (commercialSubtypes)
            // because this param is NEW here — there is no existing frontend request shape or saved
            // URL to preserve, which is exactly the constraint that forced propertyType to keep its
            // singular name above.
            @RequestParam(required = false) List<String> commercialSubtypes,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String listingPurpose,
            @RequestParam(required = false) Boolean readyToMove,
            // #2459/#2450 — the AREA (SQ FT) control was UNGATED in the UI (it renders for every
            // buyer, not just Commercial) and the frontend has sent these since #2585, but this
            // endpoint never declared them, so Spring discarded them silently: the chip latched,
            // looked applied, and the results did not move. Same silent-discard shape as the
            // commercialSubtypes gap #2509 closed on this very method. Named with the sibling
            // endpoint's spelling (DiscoverListingsController already binds these exact names)
            // because the frontend emits that spelling on both paths.
            @RequestParam(required = false) Integer areaMinSqft,
            @RequestParam(required = false) Integer areaMaxSqft,
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

        // #2533 AC7 — the FIRST of two bounds. Making these params repeatable is what creates the
        // exposure: as scalars they could not express an over-long list at all. See
        // MAX_RAW_FILTER_VALUES for why a raw-shape guard is needed in addition to the
        // post-normalisation cap the service applies.
        if (propertyType != null && propertyType.size() > MAX_RAW_FILTER_VALUES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "too_many_property_type_values");
        }
        if (bedrooms != null && bedrooms.size() > MAX_RAW_FILTER_VALUES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "too_many_bedroom_values");
        }
        validateCommercialSubtypes(commercialSubtypes);

        // #2459 — the SHARED validator, not a local copy, so this endpoint and
        // DiscoverListingsController reject exactly the same inputs. A URL the shopper can reach
        // hits both; if one 400s on an inverted range and the other returns an empty page, the
        // cards and the markers disagree about what the request even meant.
        AreaBoundsParam.validate(areaMinSqft, areaMaxSqft);

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

        // #2509 — the 13-ARGUMENT form, deliberately. The 12-argument overload exists for callers
        // that genuinely apply no subtype narrowing; repointing this call at it would drop every
        // subtype selection silently and COMPILE CLEANLY, which is the #2553/#2023 allowlist-discard
        // shape. CityAreaListingsControllerTest pins this call's subtype argument for that reason.
        // #2450 — the 15-ARGUMENT form, for the same reason the 13-argument form is used above
        // rather than the 12: the shorter overload means "Any size" and would drop both bounds
        // silently while compiling cleanly. CityAreaListingsControllerTest pins both bound
        // arguments of this call so a swap or a drop fails a test rather than a shopper.
        CityAreaListingsResponse response = service.getAreaListings(
                city, areaKeys, limitPerArea, minPrice, maxPrice, bedrooms, propertyType,
                commercialSubtypes, q, listingPurpose, readyToMove, areaMinSqft, areaMaxSqft,
                parsedBbox, isAuthenticated);

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

    /**
     * Boundary validation for {@code commercialSubtypes} on THIS endpoint (#2509).
     *
     * <h2>Why this does not call {@link CommercialSubtypeParam#validate}</h2>
     *
     * <p>That shared validator rejects on {@code raw.size() > MAX_COMMERCIAL_SUBTYPE_VALUES}, and
     * that constant is declared as {@code ALLOWED_COMMERCIAL_SUBTYPES.size()} — a cache-cardinality
     * bound derived from the TAXONOMY size, which is the coupling tracked in #2523. Calling it here
     * would carry that coupling onto a THIRD public unauthenticated endpoint, and at 5 it is
     * strictly tighter than {@link #MAX_RAW_FILTER_VALUES}, so it would silently BECOME this
     * endpoint's effective cache bound. Describing the result as decoupled would then be false.
     *
     * <p>So the two questions are answered by two constants, one each:
     * <ul>
     *   <li><b>How many repetitions before we stop minting cache keys</b> —
     *       {@link #MAX_RAW_FILTER_VALUES}, a literal with its own rationale, unchanged from #2533.
     *       On this endpoint that bound is doing ALL the work: the response is cached with
     *       {@code Cache-Control: public, max-age=60}, and an HTTP shared cache is keyed on the
     *       request URL, which the CLIENT chooses. No server-side dedupe or sort can collapse
     *       {@code ?commercialSubtypes=SHOP&commercialSubtypes=SHOP} and {@code ?commercialSubtypes=SHOP}
     *       into one entry — normalisation makes those entries hold identical BODIES, it does not
     *       stop them existing. Canonicalisation downstream bounds bind count, placeholder count
     *       and plan-cache entries; it does not bound this.</li>
     *   <li><b>Which values are meaningful</b> — {@link DiscoverFilterNormalizer#ALLOWED_COMMERCIAL_SUBTYPES},
     *       the single declaration, reused rather than reimplemented. Sharing the SET is what makes
     *       vocabulary drift structurally impossible, which is the objection
     *       {@link CommercialSubtypeParam}'s javadoc raises against a second validator; only the
     *       coupled integer is declined. {@code CityAreaListingsSubtypeVocabularyParityTest} asserts
     *       both validators accept and reject the same values.</li>
     * </ul>
     *
     * <p>Unknown values 400 rather than being preserved, matching the authenticated endpoints: this
     * param is new here, so no live URL carries an unrecognised value — the reason
     * {@code propertyTypes} must instead preserve them.
     *
     * <p>Splitting the shared validator into a vocabulary check plus a caller-supplied cap is the
     * better permanent fix and is recorded on #2523 as its preferred direction; it is declined here
     * on scope, because it edits a class shared by two controllers this change otherwise leaves
     * alone.
     */
    private static void validateCommercialSubtypes(List<String> raw) {
        if (raw == null) {
            return;
        }
        // Present-but-empty is a client bug, not "no filter" — same treatment as areaKeys.
        if (raw.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "commercial_subtypes_must_not_be_empty");
        }
        if (raw.size() > MAX_RAW_FILTER_VALUES) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "too_many_commercial_subtype_values");
        }
        for (String value : raw) {
            if (value == null || value.isBlank()
                    || DiscoverFilterNormalizer.ALLOWED_COMMERCIAL_SUBTYPES.stream()
                            .noneMatch(allowed -> allowed.equalsIgnoreCase(value.trim()))) {
                // The rejected value is NOT echoed into the reason phrase: it is unvalidated client
                // input on a public endpoint, and the allowed set alone tells the caller how to fix
                // the request.
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "commercial_subtypes_invalid_value");
            }
        }
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
