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
     * @param propertyType optional property type string (case-insensitive); null/blank = no filter
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
                                                    String q,
                                                    String listingPurpose,
                                                    Boolean readyToMove,
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
                    normQ, normPurpose, readyToMove, bbox, isAuthenticated);
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
        appendBedroomsClause(join, "\n                        ", normBedrooms);
        appendPropertyTypeClause(join, "\n                        ", normPropertyTypes);
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
                    sub.total_floors,
                    sub.parking_count,
                    sub.furnishing_status,
                    sub.created_at,
                    sub.trust_tier,
                    sub.latitude,
                    sub.longitude,
                    sub.monthly_rent,
                    sub.commercial_subtype
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
                        pl.total_floors,
                        pl.parking_count,
                        pl.furnishing_status,
                        pl.created_at,
                        pl.trust_tier,
                        pl.latitude,
                        pl.longitude,
                        pl.monthly_rent,
                        lcsd.commercial_subtype,
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
     * Emits the bedrooms narrowing clause (#2533). ONE implementation, used by both query paths.
     *
     * <p>{@code MAX_BEDROOMS} (4) means "4 or more", and {@link
     * DiscoverFilterNormalizer#normalizeBedrooms} clamps 5/8/9 down to it. So a selection
     * containing 4 contributes a LITERAL {@code >= 4} with NO bind, while every other value
     * contributes an exact match WITH one — the placeholder count varies per element.
     *
     * <p>That asymmetry is exactly what made the previous two-chain assembly fragile: a separate
     * param array had to predict which elements would and would not bind. Here the fragment and
     * its binds are handed over together, so the question cannot be got wrong.
     */
    private static void appendBedroomsClause(ClauseBuilder cb, String indent, List<Integer> normBedrooms) {
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
        if (exact.isEmpty()) {
            cb.add(indent + "AND pl.bedrooms >= " + DiscoverFilterNormalizer.MAX_BEDROOMS);
            return;
        }
        StringBuilder fragment = new StringBuilder(indent + "AND (pl.bedrooms IN (");
        for (int i = 0; i < exact.size(); i++) {
            fragment.append(i == 0 ? "?" : ", ?");
        }
        fragment.append(")");
        if (fourOrMore) {
            fragment.append(" OR pl.bedrooms >= ").append(DiscoverFilterNormalizer.MAX_BEDROOMS);
        }
        fragment.append(")");
        cb.add(fragment.toString(), exact.toArray());
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
                rs.getObject("bathrooms") != null ? rs.getInt("bathrooms") : null,
                builtArea,
                rs.getString("built_area_unit"),
                landArea,
                rs.getString("land_area_unit"),
                rs.getObject("total_floors") != null ? rs.getInt("total_floors") : null,
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
                normalizeCommercialSubtype(rs.getString("commercial_subtype"))
        );
    }

    /**
     * Canonicalises the stored subtype to UPPER case, mapping blank to {@code null} (#2431).
     *
     * <p>Deliberately a duplicate of {@code DiscoverListingsService#normalizeCommercialSubtype}
     * rather than a shared call: this service imports neither {@code DiscoverListingPredicateBuilder}
     * nor {@code DiscoverFilterNormalizer} and is a separate hand-built SQL path by design (see
     * #2509's ownership ruling). Reaching across to the other service for four lines would be the
     * first coupling between them. The two are pinned to agree by
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
                                                          String normQ,
                                                          String normPurpose,
                                                          Boolean readyToMove,
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
        appendBedroomsClause(where, "\n              ", normBedrooms);
        appendPropertyTypeClause(where, "\n              ", normPropertyTypes);
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
                    pl.total_floors,
                    pl.parking_count,
                    pl.furnishing_status,
                    pl.created_at,
                    pl.trust_tier,
                    pl.latitude,
                    pl.longitude,
                    pl.monthly_rent,
                    lcsd.commercial_subtype
                FROM property_listings pl
                JOIN areas a ON a.area_key = pl.area_key
                JOIN cities c ON c.id = a.city_id
                -- #2433: same 1:0..1 PK join as the area-keyed query above. LEFT so a
                -- non-Commercial listing keeps its row with a NULL subtype.
                LEFT JOIN listing_commercial_space_details lcsd ON lcsd.listing_id = pl.id
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
