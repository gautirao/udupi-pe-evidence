package com.example.realestate.discover;

import com.example.realestate.ai.PropertyType;
import com.example.realestate.geo.GeoCoarsener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Service for GET /api/discover/cities/{city}/listings.
 *
 * <p>Validation:
 * <ul>
 *   <li>Unknown city slug → 400 {@code {"error":"unknown_city"}}</li>
 *   <li>areaKeys and bbox cannot BOTH be absent → 400 {@code {"error":"areaKeys_required"}}
 *       (enforced at controller)</li>
 *   <li>limitPerArea clamped server-side to min(requested, 20), default 5</li>
 * </ul>
 *
 * <p>Query strategy — two paths, chosen by whether {@code areaKeys} is present (#2015):
 * <ul>
 *   <li><b>areaKeys present</b> (bbox absent or present): one SQL round-trip using
 *       IN (...) on areaKeys, grouped per requested area. When bbox is also present it
 *       narrows each area's joined listings to those intersecting the rectangle (existing
 *       behavior, unchanged). For each areaKey not belonging to the city, the response
 *       contains an entry with {@code unknown=true} and {@code listings=[]}.</li>
 *   <li><b>areaKeys absent, bbox present</b> — standalone anon "Search this area" viewport
 *       query (deliberately allowed to cross the originating area boundary). No per-area
 *       grouping in the request; the query is bounded solely by the bbox rectangle and a
 *       single global result cap ({@link #BBOX_ONLY_MAX_RESULTS}), then results are grouped
 *       in the response by each listing's own discovered {@code area_key}.</li>
 * </ul>
 */
@Service
public class CityAreaListingsService {

    private static final Logger log = LoggerFactory.getLogger(CityAreaListingsService.class);

    static final int DEFAULT_LIMIT = 5;
    static final int MAX_LIMIT = 20;

    // #2015 — global cap on rows returned by the bbox-only (areaKeys-absent) viewport path.
    // No existing viewport-specific row-count cap precedent was found on the authenticated
    // discover paths: DiscoverListingsController.MAX_SIZE=50 is a generic per-page pagination
    // cap (applies regardless of viewportScope), and DiscoverMarkersController's "first 5000"
    // is a generic authenticated-only per-endpoint cap, also unrelated to viewportScope
    // specifically. This value is therefore a conservative, self-chosen constant — mirroring
    // this file's own MAX_LIMIT (per-area cap) — rather than a reuse of prior art. This is a
    // fully public (permitAll) endpoint, so a low cap also limits anonymous bulk-harvest via
    // repeated bbox panning. FLAGGED for security-reviewer sign-off on the cap value.
    static final int BBOX_ONLY_MAX_RESULTS = 20;

    /**
     * The property type the area-first (Residential) journey NEVER shows — applied unconditionally
     * by both SQL paths in this service. Declared once so that every count that promises what
     * this panel will render (the AREA / AREA_SET relaxation previews in
     * {@link RelaxationPreviewsService}, #2457) excludes the SAME type from the SAME constant and
     * cannot drift from the panel: a preview must never count agricultural inventory the
     * Residential results panel will not display.
     */
    static final String AREA_FIRST_EXCLUDED_PROPERTY_TYPE = PropertyType.AGRICULTURAL_LAND.getValue();

    /** {@link #AREA_FIRST_EXCLUDED_PROPERTY_TYPE} in {@code Filters.excludePropertyTypes} shape. */
    static final List<String> AREA_FIRST_EXCLUDED_PROPERTY_TYPES = List.of(AREA_FIRST_EXCLUDED_PROPERTY_TYPE);

    private final JdbcOperations jdbc;

    public CityAreaListingsService(JdbcOperations jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The NO-SUBTYPE-FILTER shape of the query (#2509).
     *
     * <p><b>This is a legitimate entry point with a stated meaning, NOT a compatibility shim.</b>
     * The distinction matters: a "shim" invites deletion and invites new callers to treat it as the
     * default. This overload means one specific thing — <em>apply no Commercial-subtype narrowing</em>
     * — and every caller of it must genuinely mean that.
     *
     * <p><b>Who legitimately calls it:</b> {@code CityAreaListingsCommercialSubtype2433IT}, whose
     * subject is the subtype PROJECTION on the result card rather than any filtering, and whose
     * assertions require the unfiltered row set. <b>Production is not among them</b> —
     * {@link CityAreaListingsController} always calls the 13-argument form, and an arm asserts that
     * it does.
     *
     * <p><b>The hazard this overload creates, stated so it is not rediscovered as a defect.</b> A
     * call site that silently omits a filter field and loses it with no error is the same shape as
     * the {@code commercialSubtypes} commit-allowlist discards tracked in #2553, and as the #2023
     * {@code readyToMove} drop before it. An overload makes exactly that mistake COMPILE CLEANLY
     * forever: repoint the controller here and every subtype selection is dropped in silence with
     * no test failing. That is why the controller's use of the 13-argument form is pinned by
     * assertion rather than left to review.
     *
     * <p><b>Residual, not fixed here.</b> The root cause is a 12-going-on-13 positional parameter
     * list, which will recur at the 14th; a parameter object is the permanent fix and is out of
     * scope for this change. Recorded as a candidate for #2541's convergence work on this service,
     * which already owns its structural debt.
     */
    @Transactional(readOnly = true)
    public CityAreaListingsResponse getAreaListings(String city,
                                                    List<String> areaKeys,
                                                    Integer rawLimit,
                                                    Long minPrice,
                                                    Long maxPrice,
                                                    List<Integer> bedrooms,
                                                    List<String> propertyType,
                                                    String q,
                                                    String listingPurpose,
                                                    Boolean readyToMove,
                                                    DiscoverListingPredicateBuilder.Bbox bbox,
                                                    boolean isAuthenticated) {
        return getAreaListings(city, areaKeys, rawLimit, minPrice, maxPrice, bedrooms, propertyType,
                null, q, listingPurpose, readyToMove, bbox, isAuthenticated);
    }

    /**
     * The NO-AREA-BOUND shape of the query (#2450) — "Any size".
     *
     * <p>Same kind of entry point as the 12-argument overload above, and carrying the same hazard:
     * a caller that means to narrow by area but reaches this form loses both bounds silently and
     * COMPILES CLEANLY. That is exactly the shape of the defect being fixed here, one layer down,
     * so {@link CityAreaListingsController}'s use of the 15-argument form is pinned by assertion in
     * {@code CityAreaListingsControllerTest} rather than left to review.
     *
     * <p>Kept so the dozens of existing call sites with no concept of an area bound — every test
     * arm predating #2450 included — do not have to thread two literal {@code null}s through a
     * 15-argument list.
     */
    @Transactional(readOnly = true)
    @SuppressWarnings("java:S107") // mirrors the pre-#2450 signature verbatim
    public CityAreaListingsResponse getAreaListings(String city,
                                                    List<String> areaKeys,
                                                    Integer rawLimit,
                                                    Long minPrice,
                                                    Long maxPrice,
                                                    List<Integer> bedrooms,
                                                    List<String> propertyType,
                                                    List<String> commercialSubtypes,
                                                    String q,
                                                    String listingPurpose,
                                                    Boolean readyToMove,
                                                    DiscoverListingPredicateBuilder.Bbox bbox,
                                                    boolean isAuthenticated) {
        return getAreaListings(city, areaKeys, rawLimit, minPrice, maxPrice, bedrooms, propertyType,
                commercialSubtypes, q, listingPurpose, readyToMove, null, null, bbox,
                isAuthenticated);
    }

    /**
     * Returns the city-first area listings response.
     *
     * @param city         city slug (case-insensitive)
     * @param areaKeys     requested area keys; when null/empty, {@code bbox} must be present
     *                     (caller/controller enforces areaKeys and bbox cannot both be absent) —
     *                     routes to the standalone bbox-only viewport path, see class javadoc
     * @param rawLimit     client-requested limit per area (may be null → default 5). In the
     *                     bbox-only path this has no effect — the global
     *                     {@link #BBOX_ONLY_MAX_RESULTS} cap applies instead and the response's
     *                     {@code limitPerArea} field carries that cap value, not a per-area limit
     * @param minPrice     optional minimum price in paise (inclusive); null = no filter
     * @param maxPrice     optional maximum price in paise (inclusive); null = no filter
     * @param bedrooms     optional bedroom count; values >= 4 treated as "4 or more"; null = no filter
     * @param propertyType optional property types (case-insensitive, multi-value since #2533);
     *                     null/empty = no filter
     * @param commercialSubtypes optional Commercial buyer-subtype narrowing (#2509); null/empty =
     *                     no filter. When present, this and {@code propertyType} are emitted as ONE
     *                     union clause rather than two AND-ed clauses — see
     *                     {@link #appendFamilyAndSubtypeClause} for why that is load-bearing.
     *                     Unknown values are rejected with a 400 by the controller before reaching
     *                     here; the normaliser's unsatisfiable-preservation is the fail-closed
     *                     backstop for any non-controller caller.
     * @param q            optional keyword search query; null/blank = no FTS filter applied.
     *                     Passed to {@code websearch_to_tsquery('english', ?)} — malformed input
     *                     may cause a {@code DataAccessException} which propagates to the global
     *                     exception handler.
     * @param listingPurpose  optional listing purpose filter ('sale' or 'rent'); null/blank = no filter
     * @param readyToMove     optional; true = restrict to possession_status = 'READY'; null/false = no filter
     * @param bbox            viewport rectangle (#2015 "Search this area"); required when
     *                        {@code areaKeys} is absent (controller enforces). When
     *                        {@code areaKeys} is present, bbox is additive — it narrows each
     *                        area's joined listings to those whose {@code pl.geog} intersects
     *                        the rectangle, via the same {@code ST_MakeEnvelope(...)::geography}
     *                        predicate and GiST-indexed {@code idx_property_listings_geog}
     *                        column used by the authenticated viewportScope path in
     *                        {@link DiscoverListingPredicateBuilder}. When {@code areaKeys} is
     *                        absent, bbox alone drives a standalone query capped at
     *                        {@link #BBOX_ONLY_MAX_RESULTS} — see class javadoc.
     * @param areaMinSqft     optional inclusive lower bound, in sq ft, on the row's PRIMARY area
     *                        (#2459); null = "Any size". Resolved PER ROW — built-up for
     *                        dwellings/shops/offices/buildings, warehouse area for warehouses, plot
     *                        size for land — by {@link DiscoverPrimaryArea}, whose
     *                        {@code areaBoundSql} this path SHARES with
     *                        {@link DiscoverListingPredicateBuilder} rather than re-spelling. A row
     *                        whose primary area cannot be resolved matches NEITHER bound: visible
     *                        under "Any size", honestly excluded once a bound is active (AC5).
     *                        Validated (non-negative, non-inverted) by {@link AreaBoundsParam} at
     *                        the controller.
     * @param areaMaxSqft     optional inclusive upper bound in sq ft; same per-row resolution and
     *                        same UNRESOLVED handling as {@code areaMinSqft}
     * @param isAuthenticated true when the caller presented a valid JWT; false for anonymous callers.
     *                        When false, pricePaise is omitted and priceBand (coarse label) is returned
     *                        instead. Server-side price filtering (minPrice/maxPrice) always uses the
     *                        exact price_paise column regardless of this flag.
     * @throws ResponseStatusException 400 "unknown_city" when city slug is not in cities table
     */
    @Transactional(readOnly = true)
    public CityAreaListingsResponse getAreaListings(String city,
                                                    List<String> areaKeys,
                                                    Integer rawLimit,
                                                    Long minPrice,
                                                    Long maxPrice,
                                                    List<Integer> bedrooms,
                                                    List<String> propertyType,
                                                    List<String> commercialSubtypes,
                                                    String q,
                                                    String listingPurpose,
                                                    Boolean readyToMove,
                                                    Integer areaMinSqft,
                                                    Integer areaMaxSqft,
                                                    DiscoverListingPredicateBuilder.Bbox bbox,
                                                    boolean isAuthenticated) {

        int limit = clampLimit(rawLimit);

        // Normalise keyword query: blank/whitespace-only → treat as absent
        String normQ = (q != null && !q.isBlank()) ? q.trim() : null;

        // Normalise listingPurpose: blank/whitespace-only → treat as absent
        String normPurpose = (listingPurpose != null && !listingPurpose.isBlank())
                ? listingPurpose.trim() : null;

        // #2533 — canonicalise the multi-value filters through the SHARED normaliser rather than
        // reimplementing its rules here. That buys dedupe, canonicalisation to the stored
        // lower-case value, the exhaustive-selection collapse (selecting every known type is
        // provably equivalent to no clause), and unsatisfiable PRESERVATION — an impossible
        // request must match nothing, never silently widen to the whole city. Reimplementing any
        // of those locally is how the casing divergence #1956 PR1 removed came about.
        List<String> normPropertyTypes = DiscoverFilterNormalizer.normalizePropertyTypes(propertyType);
        List<Integer> normBedrooms = DiscoverFilterNormalizer.normalizeBedrooms(bedrooms);
        // #2509 — same shared normaliser, for the same reasons. Note it deliberately does NOT
        // apply an exhaustive-selection collapse (unlike property types): commercial_subtype is
        // nullable and legacy V102-backfilled rows carry NULL, so selecting every known subtype is
        // NOT equivalent to no filter — collapsing would readmit un-disambiguated legacy rows into
        // a set the buyer explicitly narrowed.
        //
        // No post-normalisation repetition cap is applied here, and that is deliberate rather than
        // an omission: the controller rejects values outside the vocabulary with a 400, and this
        // normaliser dedupes, so the surviving list is bounded by the vocabulary by construction.
        // Adding a cap derived from ALLOWED_COMMERCIAL_SUBTYPES.size() would import the
        // cache-bound-coupled-to-taxonomy-size defect tracked in #2523 onto a third endpoint.
        List<String> normSubtypes =
                DiscoverFilterNormalizer.normalizeCommercialSubtypes(commercialSubtypes);

        // #2533 AC7 — the SECOND and security-meaningful bound, applied to what actually reaches
        // SQL. The controller's raw-shape guard alone is not sufficient: because unrecognised
        // values are PRESERVED rather than dropped, a list that clears the raw guard can still
        // carry more values into the query than the vocabulary could ever match. Capping after
        // normalisation bounds the real quantity; capping only before it bounds the wrong one.
        if (normPropertyTypes.size() > DiscoverFilterNormalizer.MAX_PROPERTY_TYPE_VALUES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "too_many_property_type_values");
        }
        if (normBedrooms.size() > DiscoverFilterNormalizer.MAX_BEDROOM_VALUES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "too_many_bedroom_values");
        }

        // Validate city exists and is active — an inactive city must be indistinguishable
        // from an unknown one (#1935).
        Integer cityCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM cities WHERE slug = ? AND is_active = true",
                Integer.class,
                city.toLowerCase());
        if (cityCount == null || cityCount == 0) {
            log.debug("getAreaListings: unknown city slug={}", city);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown_city");
        }

        // #2015 — areaKeys absent, bbox present: standalone bbox-only viewport path (controller
        // guarantees bbox != null here — areaKeys and bbox cannot both be absent, see
        // CityAreaListingsController's areaKeys_required guard). Structurally distinct SQL
        // shape (no per-area grouping/ROW_NUMBER, single global LIMIT instead), so it is
        // delegated to a separate method rather than threaded through the area-grouped query
        // below, which is not correctness-safe against a null/empty areaKeys list.
        boolean areaKeysAbsent = areaKeys == null || areaKeys.isEmpty()
                || areaKeys.stream().allMatch(String::isBlank);
        if (areaKeysAbsent) {
            return getBboxOnlyListings(city, minPrice, maxPrice, normBedrooms, normPropertyTypes,
                    normSubtypes, normQ, normPurpose, readyToMove, areaMinSqft, areaMaxSqft, bbox,
                    isAuthenticated);
        }

        // Build IN-clause placeholders
        String placeholders = String.join(", ", Collections.nCopies(areaKeys.size(), "?"));

        // Build optional filter clauses placed on the LEFT JOIN ON condition — NOT in the inner
        // WHERE. Placing them in WHERE would convert the LEFT JOIN to an implicit inner join,
        // dropping areas that have zero LIVE listings matching the filter (they would not appear
        // in the response at all instead of returning listings: []). Placing them in ON means
        // only matching listings are joined; the area row itself always survives.
        ClauseBuilder join = new ClauseBuilder();
        if (minPrice != null) {
            join.add("\n                        AND pl.price_paise >= ?", minPrice);
        }
        if (maxPrice != null) {
            join.add("\n                        AND pl.price_paise <= ?", maxPrice);
        }
        appendBedroomsClause(join, "\n                        ", normBedrooms,
                normPropertyTypes, normSubtypes);
        appendFamilyAndSubtypeClause(join, "\n                        ", normPropertyTypes, normSubtypes);
        // #2015 — anon "Search this area" viewport narrowing. Same predicate (pl.geog &&
        // ST_MakeEnvelope(...)::geography, bind order west/south/east/north) and GiST-indexed
        // idx_property_listings_geog column used by the authenticated viewportScope path in
        // DiscoverListingPredicateBuilder — reused here so both paths hit the identical index
        // rather than reinventing the predicate.
        if (bbox != null) {
            join.add("\n                        AND pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography",
                    bbox.west(), bbox.south(), bbox.east(), bbox.north());
        }
        // Area-first journey never shows agricultural_land — always excluded unconditionally.
        join.add("\n                        AND LOWER(pl.property_type) != LOWER('"
                + AREA_FIRST_EXCLUDED_PROPERTY_TYPE + "')");
        if (normQ != null) {
            // FTS clause must be in the LEFT JOIN ON clause (not WHERE) so that areas with
            // zero keyword-matching listings still appear in the response with listings:[].
            join.add("\n                        AND pl.search_vector @@ websearch_to_tsquery('english', ?)", normQ);
        }
        if (normPurpose != null) {
            join.add("\n                        AND pl.listing_purpose = ?", normPurpose);
        }
        // readyToMove — #2023: same predicate DiscoverListingPredicateBuilder already applies
        // for markers/navigation-counts/authenticated Browse-all (possession_status = 'READY').
        // No bind param needed; 'READY' is a fixed literal, same pattern as the
        // agricultural_land exclusion above.
        if (Boolean.TRUE.equals(readyToMove)) {
            join.add("\n                        AND pl.possession_status = 'READY'");
        }
        // area bounds (#2459, reached from this endpoint by #2450) — the SAME fragment
        // DiscoverListingPredicateBuilder applies for markers/counts/authenticated Browse-all, taken
        // from DiscoverPrimaryArea rather than re-spelled. Re-spelling is what this issue IS: the
        // bound is on the row's PRIMARY area, not on built_area, and a second hand-written copy of
        // that resolution would recreate the listings-vs-markers disagreement one layer down, where
        // the only symptom is different numbers and nothing errors.
        appendAreaBoundsClause(join, "\n                        ", areaMinSqft, areaMaxSqft);

        // Single query: join areas → cities to enforce city ownership, lateral join to listing_images
        // Row shape: area_key, area_name, listing_id (nullable), price_paise, property_type,
        //            locality, primary_image_url, listing_purpose, bedrooms,
        //            title, bathrooms, built_area, built_area_unit,
        //            land_area, land_area_unit, total_floors, parking_count, furnishing_status,
        //            created_at, trust_tier
        //
        // The LEFT JOIN on property_listings means an area with no LIVE listings (or no listings
        // matching the active filter) still returns one row with listing_id = NULL. Filter clauses
        // are in the ON condition so they never hide an area from the response.
        //
        // ROW_NUMBER() OVER (PARTITION BY a.area_key ORDER BY pl.created_at DESC) is used to
        // limit listings per area without a separate round-trip.
        String sql = """
                SELECT
                    sub.area_key,
                    sub.area_name,
                    sub.listing_id,
                    sub.price_paise,
                    sub.property_type,
                    sub.locality,
                    sub.primary_image_url,
                    sub.listing_purpose,
                    sub.bedrooms,
                    sub.title,
                    sub.bathrooms,
                    sub.built_area,
                    sub.built_area_unit,
                    sub.land_area,
                    sub.land_area_unit,
                    sub.parking_count,
                    sub.furnishing_status,
                    sub.created_at,
                    sub.trust_tier,
                    sub.latitude,
                    sub.longitude,
                    sub.monthly_rent,
                    sub.commercial_subtype,
                    -- #2516: forwarded verbatim under the CommercialFactAuthority alias
                    -- contract. The outer projection must name every one of these: an alias
                    -- omitted here is not a compile error, it is a runtime
                    -- "column not found" on the first commercial row.
                    sub.floor_choice,
                    sub.floor_mode,
                    sub.hub_type,
                    sub.office_seats,
                    sub.occupancy_status,
                    sub.warehouse_clear_height_ft,
                    sub.warehouse_loading_bays,
                    sub.commercial_zoning,
                    sub.commercial_floor_number,
                    sub.legacy_floor_number,
                    sub.typed_total_floors,
                    sub.legacy_total_floors,
                    sub.typed_road_frontage_ft,
                    sub.legacy_road_frontage_ft
                FROM (
                    SELECT
                        a.area_key,
                        a.name                                                                  AS area_name,
                        pl.id                                                                   AS listing_id,
                        pl.price_paise,
                        pl.property_type,
                        pl.locality,
                        (SELECT li.url
                         FROM listing_images li
                         WHERE li.listing_id = pl.id
                         ORDER BY li.position ASC, li.id ASC
                         LIMIT 1)                                                               AS primary_image_url,
                        pl.listing_purpose,
                        pl.bedrooms,
                        pl.title,
                        pl.bathrooms,
                        pl.built_area,
                        pl.built_area_unit,
                        pl.land_area,
                        pl.land_area_unit,
                        pl.parking_count,
                        pl.furnishing_status,
                        pl.created_at,
                        pl.trust_tier,
                        pl.latitude,
                        pl.longitude,
                        pl.monthly_rent,
                        lcsd.commercial_subtype,
                        -- #2516 Commercial summary facts. Explicit allowlist; NOT a SELECT *
                        -- of the commercial columns — see DiscoverCommercialFacts for what is
                        -- deliberately excluded (ROI, lease, power, approvals). Identical
                        -- alias set to the authenticated feed's, because both are read by
                        -- CommercialFactAuthority.readFrom and that reader is what keeps the
                        -- two feeds from reporting different facts for the same listing.
                        pl.floor_choice,
                        pl.floor_mode,
                        pl.hub_type,
                        pl.office_seats,
                        pl.occupancy_status,
                        pl.warehouse_clear_height_ft,
                        pl.warehouse_loading_bays,
                        pl.commercial_zoning,
                        lcsd.floor_number AS commercial_floor_number,
                        pl.floor_number AS legacy_floor_number,
                        -- Coalesced across the per-family V102 projections. Each is PK-joined
                        -- on listing_id, so no join can merge two different listings' values.
                        --
                        -- NOT because a listing is keyed into at most ONE of them. That is
                        -- FALSE, and this comment asserted it until #2516 checked:
                        -- ListingCrudService.refreshTypedProjections (#1734) branches on
                        -- listing_FAMILY, not property_type, so it upserts
                        -- listing_commercial_space_details for EVERY Commercial-family
                        -- listing — warehouses and commercial_land included — and never
                        -- writes lcbd/lwd/lcld at all. A warehouse can therefore hold BOTH an
                        -- lcsd row and an lwd row.
                        --
                        -- lcsd is ordered FIRST for exactly that reason: it is the only
                        -- projection the write path keeps current, while lcbd/lwd/lcld are
                        -- V102 backfill remnants no writer refreshes. No other order beats it.
                        --
                        -- It carries today's value only when that value is NON-NULL, though.
                        -- COALESCE cannot tell "no lcsd row" from "lcsd row holding NULL", so
                        -- in principle a CLEARED value could yield to a stale remnant in
                        -- lcbd/lwd/lcld. Ordering cannot fix that; only presence-aware
                        -- selection could (CASE WHEN lcsd.listing_id IS NOT NULL THEN ...).
                        --
                        -- That path is UNREACHABLE through the API, and this was checked
                        -- rather than assumed. updateListing applies floor_number,
                        -- total_floors and road_frontage_ft as set-if-non-null
                        -- (ListingCrudService:1183; :348 on create), so null means "leave
                        -- untouched", never "clear". And clearStaleCommercialSubtypeFields
                        -- (:650), the #2289 subtype-switch nuller, nulls ONLY V104 fields and
                        -- never these three. The flat value is therefore monotone: it can go
                        -- null -> non-null, never back. "lcsd NULL while a remnant is
                        -- non-null" cannot be produced by any API path — only by a direct DB
                        -- write or bulk import, the same caveat class as the family gate.
                        --
                        -- The SQL limitation stays documented because it remains true of the
                        -- query: do not add a COALESCE arm on the assumption it is safe.
                        COALESCE(lcsd.total_floors, lcbd.total_floors, lwd.total_floors) AS typed_total_floors,
                        -- #2506: the V32 flat copy is carried ALONGSIDE the typed one, never
                        -- instead of it. Resolving between them is CommercialFactAuthority's
                        -- job, not this query's — that is the whole point of the rule living
                        -- in one place. This column previously fed the card's totalFloors
                        -- directly while the authenticated feed used the typed tables, which
                        -- is how one listing came to report two different floor counts.
                        pl.total_floors AS legacy_total_floors,
                        COALESCE(lcsd.road_frontage_ft, lcbd.road_frontage_ft,
                                 lwd.road_frontage_ft, lcld.road_frontage_ft) AS typed_road_frontage_ft,
                        pl.road_frontage_ft AS legacy_road_frontage_ft,
                        ROW_NUMBER() OVER (PARTITION BY a.area_key ORDER BY pl.created_at DESC) AS rn
                    FROM areas a
                    JOIN cities c ON c.id = a.city_id
                    LEFT JOIN property_listings pl
                        ON  pl.area_key = a.area_key
                        AND pl.status   = 'LIVE'""" + join.sql() + """

                    -- #2433: LEFT JOIN, and 1:0..1 on the projection table's listing_id PK, so
                    -- it can neither drop a row nor multiply one — the per-area ROW_NUMBER()
                    -- cap above would be silently wrong if it could. LEFT is also required in
                    -- the other direction: pl is itself LEFT JOINed here so that an area with
                    -- zero LIVE listings still returns a row, and an inner join to lcsd would
                    -- discard exactly those rows and delete empty areas from the response.
                    LEFT JOIN listing_commercial_space_details lcsd
                        ON lcsd.listing_id = pl.id
                    -- #2516: the same 1:0..1 PK join argument applies to each of these. They
                    -- carry the Building / Warehouse / Commercial-Land facts that
                    -- listing_commercial_space_details does not hold, and LEFT keeps every
                    -- non-matching listing — and every empty area — in the result.
                    LEFT JOIN listing_commercial_building_details lcbd
                        ON lcbd.listing_id = pl.id
                    LEFT JOIN listing_warehouse_details lwd
                        ON lwd.listing_id = pl.id
                    LEFT JOIN listing_commercial_land_details lcld
                        ON lcld.listing_id = pl.id

                    WHERE c.slug    = ?
                      AND a.area_key IN (""" + placeholders + """
                )
                ) sub
                WHERE sub.rn <= ? OR sub.listing_id IS NULL
                ORDER BY sub.area_key, sub.rn
                """;

        // Parameters: [filter params in ON-clause order], city, areaKey×N, limit
        // Filter params appear first because the LEFT JOIN ON clause precedes the WHERE clause
        // in the SQL text; JDBC binds ? positionally left-to-right.
        // Bind order mirrors the SQL text left-to-right. The LEFT JOIN ON clause binds travel with
        // their own fragments inside `join`, so only the WHERE tail is appended here: city, one
        // bind per areaKey, then the outer rn limit.
        List<Object> paramList = new ArrayList<>(join.params());
        paramList.add(city.toLowerCase());
        paramList.addAll(areaKeys);
        paramList.add(limit);
        Object[] params = paramList.toArray();

        // area_key → list of cards; LinkedHashMap preserves insertion (sorted) order per key
        Map<String, List<AreaListingCard>> cardsByArea = new LinkedHashMap<>();
        Map<String, String> nameByArea = new LinkedHashMap<>();

        jdbc.query(sql, rs -> {
            String areaKey = rs.getString("area_key");
            String areaName = rs.getString("area_name");
            nameByArea.putIfAbsent(areaKey, areaName);
            cardsByArea.computeIfAbsent(areaKey, k -> new ArrayList<>());

            String rawId = rs.getString("listing_id");
            if (rawId != null) {
                // listing row present
                cardsByArea.get(areaKey).add(mapListingCard(rs, isAuthenticated));
            }
            // if rawId is null: area exists but has no LIVE listings — leave the list empty
        }, params);

        log.debug("getAreaListings city={} areaKeys={} limit={} knownAreas={}",
                city, areaKeys.size(), limit, nameByArea.size());

        // Build response in the same order as the requested areaKeys list
        List<AreaListingsEntry> entries = new ArrayList<>(areaKeys.size());
        for (String key : areaKeys) {
            if (nameByArea.containsKey(key)) {
                entries.add(new AreaListingsEntry(
                        key,
                        nameByArea.get(key),
                        null,                        // known area — omit "unknown" field
                        cardsByArea.getOrDefault(key, List.of())
                ));
            } else {
                // areaKey not found for this city
                entries.add(new AreaListingsEntry(key, null, Boolean.TRUE, List.of()));
            }
        }

        return new CityAreaListingsResponse(city.toLowerCase(), limit, entries);
    }

    // ── helpers ─────────────────────────────────────────────────────────────────

    static int clampLimit(Integer raw) {
        if (raw == null || raw < 1) return DEFAULT_LIMIT;
        return Math.min(raw, MAX_LIMIT);
    }

    /**
     * Emits the area-bound narrowing (#2459) onto either assembly, by DELEGATING to
     * {@link DiscoverPrimaryArea#areaBoundSql} — the same fragment
     * {@link DiscoverListingPredicateBuilder} applies for markers, navigation counts and
     * authenticated Browse-all.
     *
     * <p><b>This method deliberately contains no SQL of its own.</b> The bound is not
     * {@code built_area >= ?}: the column it reads is chosen PER ROW from the row's
     * {@code property_type}, the value is converted from that row's own unit, and an unresolvable
     * row yields {@code NULL} so it matches neither bound (AC5). Writing any of that a second time
     * here would give this endpoint a different notion of "area" from the one the map and the
     * counts use — a divergence with no error and no symptom except different numbers, which is
     * precisely the class of defect #2450 was filed for. If this ever needs to change, change
     * {@link DiscoverPrimaryArea} so both surfaces move together.
     *
     * <p>Null bounds emit nothing at all, so "Any size" is byte-for-byte the pre-#2450 query.
     */
    private static void appendAreaBoundsClause(ClauseBuilder cb, String indent,
                                               Integer areaMinSqft, Integer areaMaxSqft) {
        DiscoverPrimaryArea.AreaBoundSql bound =
                DiscoverPrimaryArea.areaBoundSql("pl", areaMinSqft, areaMaxSqft, indent);
        if (!bound.sql().isEmpty()) {
            cb.add(bound.sql(), bound.params().toArray());
        }
    }

    /**
     * Emits the property-type narrowing clause (#2533). ONE implementation, used by both query
     * paths — the area-grouped ON clause and the bbox-only WHERE clause differ only in indent.
     *
     * <p>Three behaviours inherited from {@link DiscoverFilterNormalizer} rather than reinvented:
     * an empty list emits NO clause (which is also how an exhaustive selection arrives, since
     * selecting every known type is provably equivalent to no filter); an UNSATISFIABLE list emits
     * a literal {@code FALSE}, which Postgres plans as a One-Time Filter so it scans nothing and
     * binds nothing — a long garbage list therefore cannot push the statement toward the
     * 65535-parameter ceiling; and the comparison is case-SENSITIVE, which is correct only because
     * normalisation has already canonicalised every value to its stored lower-case form. That last
     * point is load-bearing: the previous {@code LOWER(...) = LOWER(?)} form was the shape #1956
     * PR1 removed elsewhere for drifting from this predicate on casing.
     */
    private static void appendPropertyTypeClause(ClauseBuilder cb, String indent, List<String> normTypes) {
        if (normTypes == null || normTypes.isEmpty()) {
            return;
        }
        if (DiscoverFilterNormalizer.isUnsatisfiable(
                normTypes, DiscoverFilterNormalizer.ALLOWED_PROPERTY_TYPES)) {
            cb.add(indent + "AND FALSE");
            return;
        }
        StringBuilder fragment = new StringBuilder(indent + "AND pl.property_type IN (");
        for (int i = 0; i < normTypes.size(); i++) {
            fragment.append(i == 0 ? "?" : ", ?");
        }
        fragment.append(")");
        cb.add(fragment.toString(), normTypes.toArray());
    }

    /**
     * Emits the Commercial family/subtype narrowing as ONE clause (#2509).
     *
     * <h2>Why this REPLACES the property-type clause rather than sitting beside it</h2>
     *
     * <p>Appending a subtype clause as a second independent fragment would AND it against
     * {@link #appendPropertyTypeClause}'s output, and that is exactly the defect #2458 removed from
     * the authenticated path: an approved MIXED selection such as Shop + Warehouse/Godown becomes
     * unexpressible, because the Warehouse row passes {@code property_type IN (...)} and is then
     * eliminated by {@code UPPER(commercial_subtype) IN ('SHOP')} — it carries no Shop/Office
     * projection. Each selected type must be matched the only way it CAN be matched: bearing types
     * by subtype, everything else by {@code property_type}, which is NOT NULL and always correct.
     *
     * <p>When no subtypes are selected this delegates to {@link #appendPropertyTypeClause} verbatim,
     * so the subtype-ABSENT SQL and bind order are byte-identical to #2550's merged behaviour.
     *
     * <h2>THE WRAPPING PARENTHESES ARE LOAD-BEARING</h2>
     *
     * <p>{@code OR} binds looser than {@code AND}, so an unparenthesised union lets every sibling
     * clause in the same {@code ON} clause bind to the right-hand disjunct alone:
     * {@code A AND B AND (X OR Y)} degrades to {@code (A AND B AND X) OR Y}. In the area-grouped
     * path those siblings include {@code pl.status = 'LIVE'} and {@code pl.area_key = a.area_key},
     * so the right disjunct would admit rows that are neither live nor in the requested area.
     *
     * <p><b>What proves this, precisely.</b>
     * {@code CityAreaListingsCommercialSubtype2433IT#theUnionCannotLeakARowThatFailsTheOtherPredicates}
     * seeds an ARCHIVED commercial SHOP row and asserts it never appears. That arm is only
     * discriminating because its selection is {@code SHOP + WAREHOUSE}: a subtype selection that
     * implies ONLY {@code commercial} leaves {@code nonBearing} empty, emits no {@code " OR "} at
     * all, and is unaffected by removing the outer parenthesis — an earlier version of that arm
     * used {@code SHOP} alone and therefore could not fail. The agricultural-land exclusion is a
     * sibling of the same kind, but it cannot discriminate here: {@code nonBearing} is intersected
     * with {@link DiscoverFilterNormalizer#impliedPropertyTypes}, which only ever yields
     * Commercial-family tokens, so agricultural land never enters this union on either branch.
     *
     * <h2>Properties preserved from the authenticated predicate</h2>
     *
     * <ol>
     *   <li>A legacy {@code property_type='commercial'} row whose {@code commercial_subtype} is NULL
     *       is NEVER classified as SHOP or OFFICE — {@code NULL IN ('SHOP')} is NULL, not TRUE.</li>
     *   <li>{@code UPPER()} goes on the COLUMN, not on a bind: the write path stamps canonical
     *       upper case, but no CHECK constraint enforces it, so a lower-case row is representable.</li>
     *   <li>Legacy Building/Warehouse/Land rows have NO {@code listing_commercial_space_details} row
     *       at all (V102 inserts only {@code WHERE property_type = 'commercial'}), so a subtype-only
     *       predicate would silently drop every one of them. The non-bearing branch matches them.</li>
     * </ol>
     *
     * <p>The vocabulary is DERIVED from {@link DiscoverFilterNormalizer} — the single declaration —
     * while the emission is deliberately hand-built here, because this service places its filters in
     * the {@code LEFT JOIN ON} clause and {@link DiscoverListingPredicateBuilder#build} emits
     * {@code WHERE}-shaped SQL; moving them would collapse the outer join and delete zero-match
     * areas from the response. Converging the emission is tracked as #2541.
     *
     * <p>The subquery alias is {@code lcsd2} rather than {@code lcsd} because the outer query already
     * binds {@code lcsd} for the projection join; reusing it would read as shadowing even where SQL
     * scoping makes it harmless.
     */
    private static void appendFamilyAndSubtypeClause(ClauseBuilder cb, String indent,
                                                     List<String> normTypes,
                                                     List<String> normSubtypes) {
        if (normSubtypes == null || normSubtypes.isEmpty()) {
            appendPropertyTypeClause(cb, indent, normTypes);
            return;
        }

        // A subtype-only request must not widen to every property type, nor drop the legacy rows of
        // the types it names — so the types are DERIVED rather than left unconstrained (#2458 AC11).
        List<String> effectiveTypes = (normTypes == null || normTypes.isEmpty())
                ? DiscoverFilterNormalizer.impliedPropertyTypes(normSubtypes)
                : normTypes;

        // Types the SUBTYPE SELECTION actually names. Without this intersection, propertyType=
        // [apartment] + subtype=[SHOP] would emit property_type IN ('apartment') and hand the
        // shopper the whole apartment inventory presented as though it matched a Shop filter.
        List<String> namedBySubtypes = DiscoverFilterNormalizer.impliedPropertyTypes(normSubtypes);

        List<String> bearing = effectiveTypes.stream()
                .filter(DiscoverFilterNormalizer.SUBTYPE_BEARING_PROPERTY_TYPES::contains)
                .toList();
        List<String> nonBearing = effectiveTypes.stream()
                .filter(t -> !DiscoverFilterNormalizer.SUBTYPE_BEARING_PROPERTY_TYPES.contains(t))
                .filter(namedBySubtypes::contains)
                .toList();

        // Neither branch satisfiable — the selection names no type that could match. A literal
        // FALSE rather than an empty "( )", which is a syntax error, or a bare TRUE, which widens.
        if (bearing.isEmpty() && nonBearing.isEmpty()) {
            cb.add(indent + "AND FALSE");
            return;
        }

        StringBuilder fragment = new StringBuilder(indent + "AND (");
        List<Object> binds = new ArrayList<>();

        if (!nonBearing.isEmpty()) {
            fragment.append("pl.property_type IN (");
            for (int i = 0; i < nonBearing.size(); i++) {
                fragment.append(i == 0 ? "?" : ", ?");
            }
            fragment.append(")");
            binds.addAll(nonBearing);
        }

        if (!bearing.isEmpty()) {
            if (!nonBearing.isEmpty()) {
                fragment.append(" OR ");
            }
            fragment.append("(pl.property_type IN (");
            for (int i = 0; i < bearing.size(); i++) {
                fragment.append(i == 0 ? "?" : ", ?");
            }
            fragment.append(") AND EXISTS (SELECT 1 FROM listing_commercial_space_details lcsd2")
                    .append(" WHERE lcsd2.listing_id = pl.id AND UPPER(lcsd2.commercial_subtype) IN (");
            for (int i = 0; i < normSubtypes.size(); i++) {
                fragment.append(i == 0 ? "?" : ", ?");
            }
            fragment.append(")))");
            binds.addAll(bearing);
            binds.addAll(normSubtypes);
        }

        fragment.append(")");
        cb.add(fragment.toString(), binds.toArray());
    }

    /**
     * Emits the bedrooms narrowing clause (#2533, made shape-aware by #2537). ONE implementation,
     * used by both query paths.
     *
     * <h2>The predicate applies PER SHAPE, never globally (#2537)</h2>
     *
     * <p>A Shop carries {@code bedrooms} NULL and a plot has none at all, so as a global conjunct
     * {@code AND pl.bedrooms IN (3)} evaluated to NULL — not TRUE — for every one of them and
     * silently eliminated the entire Commercial half of a mixed Apartment + Shop selection. The
     * owner ruling on #2537 requires this membership instead:
     *
     * <pre>{@code
     * (bedroom-capable selected shapes AND bedroom predicate) OR (selected non-bedroom-capable shapes)
     * }</pre>
     *
     * <p><b>Why the emitted SQL is the shorter {@code (predicate OR property_type IN (…))} rather
     * than that two-armed form literally.</b> This clause is ANDed with
     * {@link #appendFamilyAndSubtypeClause}'s output, which has already restricted the row set to
     * the selected shapes. Within that set, naming the incapable shapes on the right is equivalent
     * to the ruling's left arm naming the capable ones — and it stays equivalent in both directions
     * that matter: a capable-shape row whose {@code bedrooms} is NULL is still excluded (NULL
     * satisfies neither disjunct), and an incapable-shape row is admitted whatever its
     * {@code bedrooms} happens to hold. Every other active predicate — geography, purpose, price,
     * area, subtype, status — remains a sibling conjunct and so constrains BOTH arms, which is what
     * the ruling requires and what the wrapping parentheses preserve.
     *
     * <p><b>The wholly-capable case emits the pre-#2537 text byte-identically</b>, binds included.
     * That is not an optimisation: {@code CityAreaListingsServiceIT} is an explicitly immutable
     * byte-identical baseline, and a selection that changes no membership must change no SQL.
     *
     * <h2>The bind asymmetry this assembly already existed to contain (#2533)</h2>
     *
     * <p>{@code MAX_BEDROOMS} (4) means "4 or more", and {@link
     * DiscoverFilterNormalizer#normalizeBedrooms} clamps 5/8/9 down to it. So a selection
     * containing 4 contributes a LITERAL {@code >= 4} with NO bind, while every other value
     * contributes an exact match WITH one — the placeholder count varies per element.
     *
     * <p>That asymmetry is exactly what made the previous two-chain assembly fragile: a separate
     * param array had to predict which elements would and would not bind. Here the fragment and
     * its binds are handed over together, so the question cannot be got wrong. #2537 adds a SECOND
     * group of binds after the bedroom values, which is precisely the kind of change that assembly
     * makes safe.
     */
    private static void appendBedroomsClause(ClauseBuilder cb, String indent, List<Integer> normBedrooms,
                                             List<String> normTypes, List<String> normSubtypes) {
        if (normBedrooms == null || normBedrooms.isEmpty()) {
            return;
        }
        List<Integer> exact = new ArrayList<>();
        boolean fourOrMore = false;
        for (Integer value : normBedrooms) {
            if (value == null) {
                continue;
            }
            if (value >= DiscoverFilterNormalizer.MAX_BEDROOMS) {
                fourOrMore = true;
            } else {
                exact.add(value);
            }
        }

        // The bedroom test alone — no leading AND, no wrapping parentheses — so the two emission
        // shapes below can each place it without restating it.
        StringBuilder predicate = new StringBuilder();
        if (exact.isEmpty()) {
            predicate.append("pl.bedrooms >= ").append(DiscoverFilterNormalizer.MAX_BEDROOMS);
        } else {
            predicate.append("pl.bedrooms IN (");
            for (int i = 0; i < exact.size(); i++) {
                predicate.append(i == 0 ? "?" : ", ?");
            }
            predicate.append(")");
            if (fourOrMore) {
                predicate.append(" OR pl.bedrooms >= ").append(DiscoverFilterNormalizer.MAX_BEDROOMS);
            }
        }

        // Derived EXACTLY as appendFamilyAndSubtypeClause derives it, so the two clauses cannot
        // disagree about which shapes the buyer selected. A subtype-only request (reachable from a
        // hand-edited URL) names its types through the subtype axis alone.
        List<String> effectiveTypes = (normTypes == null || normTypes.isEmpty())
                ? DiscoverFilterNormalizer.impliedPropertyTypes(normSubtypes)
                : normTypes;
        List<String> nonCapable = BedroomApplicability.nonBedroomCapable(effectiveTypes);

        if (nonCapable.isEmpty()) {
            // Every selected shape can have bedrooms (or nothing was selected, which narrows
            // nothing) — emit the pre-#2537 clause BYTE-IDENTICALLY, binds included. The #2533
            // baseline arms pin this text and must keep passing unmodified.
            if (exact.isEmpty()) {
                cb.add(indent + "AND " + predicate);
                return;
            }
            cb.add(indent + "AND (" + predicate + ")", exact.toArray());
            return;
        }

        // The ruling's membership shape. The selected non-bedroom-capable shapes are admitted
        // without being judged against a predicate that cannot describe them.
        StringBuilder fragment = new StringBuilder(indent + "AND ((")
                .append(predicate)
                .append(") OR pl.property_type IN (");
        for (int i = 0; i < nonCapable.size(); i++) {
            fragment.append(i == 0 ? "?" : ", ?");
        }
        fragment.append("))");

        List<Object> binds = new ArrayList<>(exact);
        binds.addAll(nonCapable);
        cb.add(fragment.toString(), binds.toArray());
    }

    /**
     * A SQL fragment and the bind params that fragment consumes, appended together (#2533, AC8).
     *
     * <p><b>What this replaces, and why.</b> This assembly previously kept the clause text and the
     * positional bind array in two separate {@code if} chains — {@code joinFilterClauses} and a
     * {@code buildParams} method ~140 lines away, with the bbox-only path duplicating the same
     * split independently. Every condition was written twice, and the two copies had to agree on
     * both the NUMBER and the ORDER of {@code ?} placeholders with nothing enforcing it.
     *
     * <p>That is not a theoretical concern here. {@code bedrooms >= 4} emits a literal and
     * contributes NO placeholder while any other bedroom value contributes one, so the counts
     * legitimately differ per input. A count mismatch throws loudly; an ORDER mismatch between two
     * same-typed binds does not — {@code propertyType} and the FTS keyword are both Strings in
     * adjacent slots, so a swap returns plausible-looking wrong rows and no exception.
     *
     * <p>Appending the fragment and its binds in a single call makes both failures unrepresentable
     * rather than merely tested for: there is no second ordering to drift from. A clause with no
     * bind (a literal such as {@code >= 4}, the agricultural-land exclusion, or
     * {@code possession_status = 'READY'}) simply passes no binds, which is the same call shape
     * rather than a special case to remember.
     *
     * <p>Deliberately minimal, and deliberately local to this service: the shared predicate
     * vocabulary in {@link DiscoverListingPredicateBuilder} has 11 call sites including the
     * saved-search alert path, so converging on it is tracked separately (#2541) rather than
     * bundled into a correctness change.
     */
    private static final class ClauseBuilder {
        private final StringBuilder sql = new StringBuilder();
        private final List<Object> params = new ArrayList<>();

        /** Appends a clause and the binds it consumes. Pass no binds for a literal-only clause. */
        void add(String fragment, Object... binds) {
            sql.append(fragment);
            for (Object bind : binds) {
                params.add(bind);
            }
        }

        String sql() {
            return sql.toString();
        }

        List<Object> params() {
            return params;
        }
    }

    /**
     * Maps one result-set row (a LIVE listing) to an {@link AreaListingCard}, applying the
     * auth-aware price/rent projection (#2051) and unconditional lat/lng coarsening (#1726).
     * Shared by both the area-grouped path and the bbox-only path (#2015) so the projection
     * and coarsening logic is defined exactly once. Caller must have already confirmed the
     * row's {@code listing_id} column is non-null.
     */
    private static AreaListingCard mapListingCard(ResultSet rs, boolean isAuthenticated) throws SQLException {
        String rawId = rs.getString("listing_id");
        Long pricePaise = rs.getObject("price_paise") != null
                ? rs.getLong("price_paise") : null;
        Double builtArea = rs.getObject("built_area") != null ? rs.getDouble("built_area") : null;
        Double landArea = rs.getObject("land_area") != null ? rs.getDouble("land_area") : null;
        Timestamp createdTs = rs.getTimestamp("created_at");
        String createdAt = createdTs != null ? createdTs.toInstant().toString() : null;
        Double latitude = rs.getObject("latitude") != null ? rs.getDouble("latitude") : null;
        Double longitude = rs.getObject("longitude") != null ? rs.getDouble("longitude") : null;
        Long monthlyRent = rs.getObject("monthly_rent") != null ? rs.getLong("monthly_rent") : null;

        // #2051: the price source is selected BY listing_purpose, not by which column
        // happens to be non-null — a rent row may also carry a non-null price_paise
        // (AC14) and must never render a sale-derived band/price in that case.
        // 'rent' and 'lease' receive identical treatment (ruling OQ3).
        String purpose = rs.getString("listing_purpose");
        boolean isRentalPurpose = "rent".equals(purpose) || "lease".equals(purpose);

        Long projectedPricePaise;
        String projectedPriceBand;
        Long projectedMonthlyRentRupees;
        String projectedMonthlyRentBand;

        if (isRentalPurpose) {
            // Rent/lease: never expose a sale price/band, regardless of price_paise.
            projectedPricePaise = null;
            projectedPriceBand = null;
            // AC4/AC5: a null, zero or negative monthly_rent is invalid and takes the
            // same "unavailable" path for BOTH the exact and band projections — a stored
            // 0 must never surface as an exact 0 to authenticated callers either, only
            // as an absent field, exactly like a null value (R16).
            Long validMonthlyRent = (monthlyRent != null && monthlyRent > 0) ? monthlyRent : null;
            // Monthly-rent projection mirrors the sale price contract exactly:
            // authenticated callers get the exact rupee value, anon get the coarse band.
            // monthlyRent is wired through verbatim (RUPEES) — no /100 or *100 conversion.
            projectedMonthlyRentRupees = isAuthenticated ? validMonthlyRent : null;
            projectedMonthlyRentBand = isAuthenticated ? null : MonthlyRentBand.of(validMonthlyRent);
        } else {
            // Sale (or any other purpose): existing contract, byte-for-byte unchanged.
            // Authenticated callers get exact pricePaise (priceBand null/omitted).
            // Anonymous callers get priceBand (coarse label) and pricePaise null (omitted
            // by NON_NULL). Null price_paise → both fields null — price never fabricated.
            projectedPricePaise = isAuthenticated ? pricePaise : null;
            projectedPriceBand = isAuthenticated ? null : PriceBand.of(pricePaise);
            projectedMonthlyRentRupees = null;
            projectedMonthlyRentBand = null;
        }

        // #2516 — the Commercial projection, decided ONCE per row.
        //
        // Everything below keys on property_type rather than on whether a subtype resolved: a
        // legacy `property_type = 'commercial'` row whose Shop-vs-Office was never recorded is
        // still a Commercial listing, and treating it as Residential is the exact leak this
        // guards against.
        String propertyType = rs.getString("property_type");
        boolean isCommercial = CommercialFactAuthority.isCommercialFamily(propertyType);

        // #2516 — bathrooms is a RESIDENTIAL-ONLY fact and is suppressed for Commercial.
        // property_listings.bathrooms stores 0 rather than NULL for commercial inventory, so
        // passing it through put "0 bathrooms" on a live Showroom card — a Residential
        // semantic asserted about a property that has washrooms, not bathrooms. Suppressed
        // rather than substituted: washrooms are not in the #2433 allowlist, and widening
        // that allowlist is a privacy-review decision rather than part of this fix.
        Integer bathrooms = isCommercial || rs.getObject("bathrooms") == null
                ? null : rs.getInt("bathrooms");

        // #2506 — resolved through the shared authority, NOT read straight off
        // pl.total_floors as this path used to. Reading the flat column here while the
        // authenticated feed read the V102 typed tables is how one listing came to report two
        // different floor counts on two panels in the same session. Safe to call for every
        // row: a Residential listing has no commercial projection row, so the typed value is
        // null and the legacy flat value passes through exactly as before.
        Integer totalFloors = CommercialFactAuthority.resolveTotalFloors(
                rs.getObject("typed_total_floors", Integer.class),
                rs.getObject("legacy_total_floors", Integer.class));

        return new AreaListingCard(
                UUID.fromString(rawId),
                projectedPricePaise,
                projectedPriceBand,
                rs.getString("property_type"),
                rs.getString("locality"),
                rs.getString("primary_image_url"),
                rs.getString("listing_purpose"),
                rs.getObject("bedrooms") != null ? rs.getInt("bedrooms") : null,
                rs.getString("title"),
                bathrooms,
                builtArea,
                rs.getString("built_area_unit"),
                landArea,
                rs.getString("land_area_unit"),
                totalFloors,
                rs.getObject("parking_count") != null ? rs.getInt("parking_count") : null,
                rs.getString("furnishing_status"),
                createdAt,
                // #1567: project the raw internal letter grade to a public-safe badge
                // word before it leaves the server — never expose trust_tier directly.
                TrustBadge.publicBadge(rs.getString("trust_tier")),
                // #1726: this endpoint is permitAll (fully public) — always coarsen,
                // regardless of isAuthenticated. Unlike price, exact pin has no
                // buyer-vs-anon distinction on a browse/list surface with no ownership
                // concept.
                GeoCoarsener.coarsen(latitude),
                GeoCoarsener.coarsen(longitude),
                projectedMonthlyRentRupees,
                projectedMonthlyRentBand,
                // #2433: canonicalised here for the same reason TrustBadge.publicBadge and
                // GeoCoarsener.coarsen are — so this read path and DiscoverListingsService
                // cannot emit different spellings of the same subtype for the same listing.
                normalizeCommercialSubtype(rs.getString("commercial_subtype")),
                // #2516/#2506: the SAME reader the authenticated feed uses, so the two feeds
                // cannot report different facts for the same listing. Gated on the Commercial
                // family because the authority's legacy fallback reads flat columns that
                // Residential rows also populate — an ungated call would give a house a
                // commercialFacts object and a Commercial summary row on its card.
                isCommercial ? CommercialFactAuthority.readFrom(rs) : null
        );
    }

    /**
     * Canonicalises the stored subtype to UPPER case, mapping blank to {@code null} (#2431).
     *
     * <p>Deliberately a duplicate of {@code DiscoverListingsService#normalizeCommercialSubtype}
     * rather than a shared call: this is a separate hand-built SQL path by design (see #2509's
     * ownership ruling). Reaching across to the other SERVICE for four lines would be the first
     * coupling between the two services. The two are pinned to agree by
     * {@code CityAreaListingsCommercialSubtype2433IT#bothDiscoverReadPathsAgreeOnTheSubtypeSpelling},
     * which asserts equality rather than trusting that both were written the same way.
     *
     * <p>The column carries no CHECK constraint (V102 L82-92), so a lower-case or whitespace-only
     * value is representable even though the write path never produces one.
     */
    private static String normalizeCommercialSubtype(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return raw.trim().toUpperCase(Locale.ROOT);
    }

    /**
     * Standalone bbox-only "Search this area" query (#2015) — used when {@code areaKeys} is
     * absent and {@code bbox} is present. Unlike {@link #getAreaListings}, there is no
     * per-area grouping in the request: this queries {@code property_listings} directly,
     * filtered by the bbox rectangle and the same optional filters as the area-grouped path,
     * capped at a single global {@link #BBOX_ONLY_MAX_RESULTS} row limit (not a per-area
     * limit). Results are grouped in the response by each listing's own {@code area_key}
     * (joined from {@code areas} for display name), reusing the existing
     * {@link CityAreaListingsResponse}/{@link AreaListingsEntry}/{@link AreaListingCard} DTO
     * shapes — no breaking API contract change. {@code limitPerArea} in the response carries
     * the global cap value in this mode, not a true per-area value.
     */
    private CityAreaListingsResponse getBboxOnlyListings(String city,
                                                          Long minPrice,
                                                          Long maxPrice,
                                                          List<Integer> normBedrooms,
                                                          List<String> normPropertyTypes,
                                                          List<String> normSubtypes,
                                                          String normQ,
                                                          String normPurpose,
                                                          Boolean readyToMove,
                                                          Integer areaMinSqft,
                                                          Integer areaMaxSqft,
                                                          DiscoverListingPredicateBuilder.Bbox bbox,
                                                          boolean isAuthenticated) {

        // Same lockstep assembly as the area-grouped path (#2533, AC8): each clause carries its own
        // binds, so this path cannot drift between placeholder count/order and the param array
        // either. It kept its own separate copy of that split before, which is why a fix confined
        // to one path would have left the identical hazard live here.
        ClauseBuilder where = new ClauseBuilder();
        if (minPrice != null) {
            where.add("\n              AND pl.price_paise >= ?", minPrice);
        }
        if (maxPrice != null) {
            where.add("\n              AND pl.price_paise <= ?", maxPrice);
        }
        appendBedroomsClause(where, "\n              ", normBedrooms,
                normPropertyTypes, normSubtypes);
        appendFamilyAndSubtypeClause(where, "\n              ", normPropertyTypes, normSubtypes);
        // bbox is always non-null here (controller guarantees it — see getAreaListings caller
        // above), same predicate/bind order as the area-grouped path and the authenticated
        // viewportScope path in DiscoverListingPredicateBuilder.
        where.add("\n              AND pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography",
                bbox.west(), bbox.south(), bbox.east(), bbox.north());
        // Area-first journey never shows agricultural_land — always excluded unconditionally.
        where.add("\n              AND LOWER(pl.property_type) != LOWER('"
                + AREA_FIRST_EXCLUDED_PROPERTY_TYPE + "')");
        if (normQ != null) {
            where.add("\n              AND pl.search_vector @@ websearch_to_tsquery('english', ?)", normQ);
        }
        if (normPurpose != null) {
            where.add("\n              AND pl.listing_purpose = ?", normPurpose);
        }
        if (Boolean.TRUE.equals(readyToMove)) {
            where.add("\n              AND pl.possession_status = 'READY'");
        }
        // area bounds (#2459/#2450) — this path assembles its own WHERE clause and shares nothing
        // with the area-grouped ON clause but the helpers, so the bound has to be applied here
        // explicitly. Fixing one path demonstrably does not fix the other, which is why the IT
        // carries a separate arm for this one rather than assuming it.
        appendAreaBoundsClause(where, "\n              ", areaMinSqft, areaMaxSqft);

        String sql = """
                SELECT
                    a.area_key,
                    a.name AS area_name,
                    pl.id AS listing_id,
                    pl.price_paise,
                    pl.property_type,
                    pl.locality,
                    (SELECT li.url
                     FROM listing_images li
                     WHERE li.listing_id = pl.id
                     ORDER BY li.position ASC, li.id ASC
                     LIMIT 1) AS primary_image_url,
                    pl.listing_purpose,
                    pl.bedrooms,
                    pl.title,
                    pl.bathrooms,
                    pl.built_area,
                    pl.built_area_unit,
                    pl.land_area,
                    pl.land_area_unit,
                    pl.parking_count,
                    pl.furnishing_status,
                    pl.created_at,
                    pl.trust_tier,
                    pl.latitude,
                    pl.longitude,
                    pl.monthly_rent,
                    lcsd.commercial_subtype,
                    -- #2516: byte-for-byte the same alias contract as the area-grouped path,
                    -- because both are consumed by CommercialFactAuthority.readFrom. Each
                    -- path needs its own copy of the projection for the same reason each
                    -- needs its own test arm — they are separate hand-built SQL shapes, and
                    -- fixing one does not imply the other is correct.
                    pl.floor_choice,
                    pl.floor_mode,
                    pl.hub_type,
                    pl.office_seats,
                    pl.occupancy_status,
                    pl.warehouse_clear_height_ft,
                    pl.warehouse_loading_bays,
                    pl.commercial_zoning,
                    lcsd.floor_number AS commercial_floor_number,
                    pl.floor_number AS legacy_floor_number,
                    COALESCE(lcsd.total_floors, lcbd.total_floors, lwd.total_floors)
                        AS typed_total_floors,
                    pl.total_floors AS legacy_total_floors,
                    COALESCE(lcsd.road_frontage_ft, lcbd.road_frontage_ft,
                             lwd.road_frontage_ft, lcld.road_frontage_ft)
                        AS typed_road_frontage_ft,
                    pl.road_frontage_ft AS legacy_road_frontage_ft
                FROM property_listings pl
                JOIN areas a ON a.area_key = pl.area_key
                JOIN cities c ON c.id = a.city_id
                -- #2433: same 1:0..1 PK join as the area-keyed query above. LEFT so a
                -- non-Commercial listing keeps its row with a NULL subtype.
                LEFT JOIN listing_commercial_space_details lcsd ON lcsd.listing_id = pl.id
                -- #2516: same 1:0..1 PK argument; these carry the Building / Warehouse /
                -- Commercial-Land facts lcsd does not hold.
                LEFT JOIN listing_commercial_building_details lcbd ON lcbd.listing_id = pl.id
                LEFT JOIN listing_warehouse_details lwd ON lwd.listing_id = pl.id
                LEFT JOIN listing_commercial_land_details lcld ON lcld.listing_id = pl.id
                WHERE c.slug = ?
                  AND pl.status = 'LIVE'""" + where.sql() + """

                ORDER BY pl.created_at DESC
                LIMIT ?
                """;

        // City leads here — its ? sits in the WHERE clause BEFORE the filter clauses, the reverse
        // of the area-grouped path where the filters live in the LEFT JOIN ON clause and therefore
        // bind first. That asymmetry between the two paths is exactly why each needs its own test
        // arm: fixing the bind order in one does not imply the other is correct.
        List<Object> paramList = new ArrayList<>();
        paramList.add(city.toLowerCase());
        paramList.addAll(where.params());
        paramList.add(BBOX_ONLY_MAX_RESULTS);

        Map<String, List<AreaListingCard>> cardsByArea = new LinkedHashMap<>();
        Map<String, String> nameByArea = new LinkedHashMap<>();

        jdbc.query(sql, rs -> {
            String areaKey = rs.getString("area_key");
            String areaName = rs.getString("area_name");
            nameByArea.putIfAbsent(areaKey, areaName);
            cardsByArea.computeIfAbsent(areaKey, k -> new ArrayList<>());
            // #1726: coarsening is applied unconditionally inside mapListingCard — every row
            // returned by this bbox-only path is coarsened exactly like the area-grouped path.
            cardsByArea.get(areaKey).add(mapListingCard(rs, isAuthenticated));
        }, paramList.toArray());

        log.debug("getBboxOnlyListings city={} bbox=[present] cap={} discoveredAreas={}",
                city, BBOX_ONLY_MAX_RESULTS, nameByArea.size());

        List<AreaListingsEntry> entries = new ArrayList<>(nameByArea.size());
        for (Map.Entry<String, String> e : nameByArea.entrySet()) {
            entries.add(new AreaListingsEntry(
                    e.getKey(),
                    e.getValue(),
                    null,
                    cardsByArea.getOrDefault(e.getKey(), List.of())
            ));
        }

        return new CityAreaListingsResponse(city.toLowerCase(), BBOX_ONLY_MAX_RESULTS, entries);
    }
}
