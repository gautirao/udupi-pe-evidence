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
                                                    Integer bedrooms,
                                                    String propertyType,
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
            return getBboxOnlyListings(city, minPrice, maxPrice, bedrooms, propertyType,
                    normQ, normPurpose, readyToMove, bbox, isAuthenticated);
        }

        // Build IN-clause placeholders
        String placeholders = String.join(", ", Collections.nCopies(areaKeys.size(), "?"));

        // Build optional filter clauses placed on the LEFT JOIN ON condition — NOT in the inner
        // WHERE. Placing them in WHERE would convert the LEFT JOIN to an implicit inner join,
        // dropping areas that have zero LIVE listings matching the filter (they would not appear
        // in the response at all instead of returning listings: []). Placing them in ON means
        // only matching listings are joined; the area row itself always survives.
        StringBuilder joinFilterClauses = new StringBuilder();
        if (minPrice != null) {
            joinFilterClauses.append("\n                        AND pl.price_paise >= ?");
        }
        if (maxPrice != null) {
            joinFilterClauses.append("\n                        AND pl.price_paise <= ?");
        }
        if (bedrooms != null) {
            if (bedrooms >= 4) {
                joinFilterClauses.append("\n                        AND pl.bedrooms >= 4");
            } else {
                joinFilterClauses.append("\n                        AND pl.bedrooms = ?");
            }
        }
        if (propertyType != null && !propertyType.isBlank()) {
            joinFilterClauses.append("\n                        AND LOWER(pl.property_type) = LOWER(?)");
        }
        // #2015 — anon "Search this area" viewport narrowing. Same predicate (pl.geog &&
        // ST_MakeEnvelope(...)::geography, bind order west/south/east/north) and GiST-indexed
        // idx_property_listings_geog column used by the authenticated viewportScope path in
        // DiscoverListingPredicateBuilder — reused here so both paths hit the identical index
        // rather than reinventing the predicate.
        if (bbox != null) {
            joinFilterClauses.append("\n                        AND pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography");
        }
        // Area-first journey never shows agricultural_land — always excluded unconditionally.
        joinFilterClauses.append("\n                        AND LOWER(pl.property_type) != LOWER('"
                + PropertyType.AGRICULTURAL_LAND.getValue() + "')");
        if (normQ != null) {
            // FTS clause must be in the LEFT JOIN ON clause (not WHERE) so that areas with
            // zero keyword-matching listings still appear in the response with listings:[].
            joinFilterClauses.append("\n                        AND pl.search_vector @@ websearch_to_tsquery('english', ?)");
        }
        if (normPurpose != null) {
            joinFilterClauses.append("\n                        AND pl.listing_purpose = ?");
        }
        // readyToMove — #2023: same predicate DiscoverListingPredicateBuilder already applies
        // for markers/navigation-counts/authenticated Browse-all (possession_status = 'READY').
        // No bind param needed; 'READY' is a fixed literal, same pattern as the
        // agricultural_land exclusion above.
        if (Boolean.TRUE.equals(readyToMove)) {
            joinFilterClauses.append("\n                        AND pl.possession_status = 'READY'");
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
                    sub.monthly_rent
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
                        ROW_NUMBER() OVER (PARTITION BY a.area_key ORDER BY pl.created_at DESC) AS rn
                    FROM areas a
                    JOIN cities c ON c.id = a.city_id
                    LEFT JOIN property_listings pl
                        ON  pl.area_key = a.area_key
                        AND pl.status   = 'LIVE'""" + joinFilterClauses + """

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
        Object[] params = buildParams(city.toLowerCase(), areaKeys, limit,
                minPrice, maxPrice, bedrooms, propertyType, bbox, normQ, normPurpose);

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

    private static Object[] buildParams(String city, List<String> areaKeys, int limit,
                                        Long minPrice, Long maxPrice,
                                        Integer bedrooms, String propertyType,
                                        DiscoverListingPredicateBuilder.Bbox bbox, String normQ,
                                        String normPurpose) {
        List<Object> params = new ArrayList<>();
        // Parameter order mirrors the left-to-right ? placeholder order in the SQL:
        //
        //   LEFT JOIN ON clause params (in order appended to joinFilterClauses):
        //     1. minPrice           (if non-null)
        //     2. maxPrice           (if non-null)
        //     3. bedrooms           (if non-null AND < 4; bedrooms >= 4 uses literal, no placeholder)
        //     4. propertyType       (if non-null/non-blank)
        //     5. bbox               (if non-null — ST_MakeEnvelope(west, south, east, north, 4326);
        //                            #2015, same bind order as DiscoverListingPredicateBuilder)
        //     6. normQ              (if non-null/non-blank — FTS via websearch_to_tsquery)
        //     7. normPurpose        (if non-null/non-blank — listing_purpose filter)
        //
        //   WHERE clause params:
        //     8. city               (always)
        //     9. areaKey × N        (one per element in areaKeys)
        //    10. limit              (outer rn bound, always)
        if (minPrice != null) {
            params.add(minPrice);
        }
        if (maxPrice != null) {
            params.add(maxPrice);
        }
        if (bedrooms != null && bedrooms < 4) {
            params.add(bedrooms);
        }
        if (propertyType != null && !propertyType.isBlank()) {
            params.add(propertyType);
        }
        if (bbox != null) {
            params.add(bbox.west());
            params.add(bbox.south());
            params.add(bbox.east());
            params.add(bbox.north());
        }
        if (normQ != null) {
            params.add(normQ);
        }
        if (normPurpose != null) {
            params.add(normPurpose);
        }
        // WHERE clause params: city, areaKeys, then the outer WHERE rn limit
        params.add(city);
        params.addAll(areaKeys);
        params.add(limit);
        return params.toArray();
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
                projectedMonthlyRentBand
        );
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
                                                          Integer bedrooms,
                                                          String propertyType,
                                                          String normQ,
                                                          String normPurpose,
                                                          Boolean readyToMove,
                                                          DiscoverListingPredicateBuilder.Bbox bbox,
                                                          boolean isAuthenticated) {

        StringBuilder whereClauses = new StringBuilder();
        if (minPrice != null) {
            whereClauses.append("\n              AND pl.price_paise >= ?");
        }
        if (maxPrice != null) {
            whereClauses.append("\n              AND pl.price_paise <= ?");
        }
        if (bedrooms != null) {
            if (bedrooms >= 4) {
                whereClauses.append("\n              AND pl.bedrooms >= 4");
            } else {
                whereClauses.append("\n              AND pl.bedrooms = ?");
            }
        }
        if (propertyType != null && !propertyType.isBlank()) {
            whereClauses.append("\n              AND LOWER(pl.property_type) = LOWER(?)");
        }
        // bbox is always non-null here (controller guarantees it — see getAreaListings caller
        // above), same predicate/bind order as the area-grouped path and the authenticated
        // viewportScope path in DiscoverListingPredicateBuilder.
        whereClauses.append("\n              AND pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography");
        // Area-first journey never shows agricultural_land — always excluded unconditionally.
        whereClauses.append("\n              AND LOWER(pl.property_type) != LOWER('"
                + PropertyType.AGRICULTURAL_LAND.getValue() + "')");
        if (normQ != null) {
            whereClauses.append("\n              AND pl.search_vector @@ websearch_to_tsquery('english', ?)");
        }
        if (normPurpose != null) {
            whereClauses.append("\n              AND pl.listing_purpose = ?");
        }
        if (Boolean.TRUE.equals(readyToMove)) {
            whereClauses.append("\n              AND pl.possession_status = 'READY'");
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
                    pl.monthly_rent
                FROM property_listings pl
                JOIN areas a ON a.area_key = pl.area_key
                JOIN cities c ON c.id = a.city_id
                WHERE c.slug = ?
                  AND pl.status = 'LIVE'""" + whereClauses + """

                ORDER BY pl.created_at DESC
                LIMIT ?
                """;

        List<Object> paramList = new ArrayList<>();
        paramList.add(city.toLowerCase());
        if (minPrice != null) {
            paramList.add(minPrice);
        }
        if (maxPrice != null) {
            paramList.add(maxPrice);
        }
        if (bedrooms != null && bedrooms < 4) {
            paramList.add(bedrooms);
        }
        if (propertyType != null && !propertyType.isBlank()) {
            paramList.add(propertyType);
        }
        paramList.add(bbox.west());
        paramList.add(bbox.south());
        paramList.add(bbox.east());
        paramList.add(bbox.north());
        if (normQ != null) {
            paramList.add(normQ);
        }
        if (normPurpose != null) {
            paramList.add(normPurpose);
        }
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
