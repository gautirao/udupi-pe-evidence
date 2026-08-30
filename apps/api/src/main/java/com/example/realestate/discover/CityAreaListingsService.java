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
 *   <li>Empty/absent areaKeys → 400 {@code {"error":"areaKeys_required"}} (enforced at controller)</li>
 *   <li>limitPerArea clamped server-side to min(requested, 20), default 5</li>
 * </ul>
 *
 * <p>Query strategy: one SQL round-trip per call using IN (...) on areaKeys.
 * For each areaKey not belonging to the city, the service produces an entry with
 * {@code unknown=true} and {@code listings=[]}.
 */
@Service
public class CityAreaListingsService {

    private static final Logger log = LoggerFactory.getLogger(CityAreaListingsService.class);

    static final int DEFAULT_LIMIT = 5;
    static final int MAX_LIMIT = 20;

    private final JdbcOperations jdbc;

    public CityAreaListingsService(JdbcOperations jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Returns the city-first area listings response.
     *
     * @param city         city slug (case-insensitive)
     * @param areaKeys     requested area keys, must be non-empty (caller enforces)
     * @param rawLimit     client-requested limit per area (may be null → default 5)
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
                minPrice, maxPrice, bedrooms, propertyType, normQ, normPurpose);

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

                cardsByArea.get(areaKey).add(new AreaListingCard(
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
                ));
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
                                        Integer bedrooms, String propertyType, String normQ,
                                        String normPurpose) {
        List<Object> params = new ArrayList<>();
        // Parameter order mirrors the left-to-right ? placeholder order in the SQL:
        //
        //   LEFT JOIN ON clause params (in order appended to joinFilterClauses):
        //     1. minPrice           (if non-null)
        //     2. maxPrice           (if non-null)
        //     3. bedrooms           (if non-null AND < 4; bedrooms >= 4 uses literal, no placeholder)
        //     4. propertyType       (if non-null/non-blank)
        //     5. normQ              (if non-null/non-blank — FTS via websearch_to_tsquery)
        //     6. normPurpose        (if non-null/non-blank — listing_purpose filter)
        //
        //   WHERE clause params:
        //     7. city               (always)
        //     8. areaKey × N        (one per element in areaKeys)
        //     9. limit              (outer rn bound, always)
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
}
