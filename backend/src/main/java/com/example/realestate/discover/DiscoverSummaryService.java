package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Postgres implementation of {@link DiscoverSummaryPort} (#1745 P5).
 *
 * <p>Reuses {@link DiscoverListingPredicateBuilder#build} for the shared LIVE / not-archived /
 * not-duplicate / city core predicate (with {@code propertyTypes = null} — the builder's IN clause
 * is case-sensitive and is NOT used for this endpoint's property-type filter). Two additional
 * guards are applied by this service directly:
 * <ol>
 *   <li>the 4-segment {@code area_key} guard (not present in the builder), and</li>
 *   <li>a case-insensitive {@code LOWER(pl.property_type) = LOWER(?)} match, applied ONLY when
 *       {@code propertyType} is non-blank — mirroring {@link AreaSummaryService}'s type-filtered
 *       query exactly so per-area/per-region counts reconcile with {@code /api/discover/areas}.</li>
 * </ol>
 *
 * <p>All three query shapes (total, regions, hotspots) share the same guarded predicate so the
 * numbers are internally consistent by construction.
 *
 * <p>{@code listingPurpose} (#1745 P5-addendum) is a separate, independent optional filter —
 * {@code "sale"}/{@code "rent"} — passed to the shared {@link DiscoverListingPredicateBuilder}'s
 * {@code listingPurpose} predicate (never conflated with {@code propertyType}). See
 * {@link #normalizeListingPurpose(String)}.
 */
@Service
public class DiscoverSummaryService implements DiscoverSummaryPort {

    private static final Logger log = LoggerFactory.getLogger(DiscoverSummaryService.class);

    private static final String FOUR_SEGMENT_GUARD =
            "array_length(string_to_array(pl.area_key, '|'), 1) = 4";

    /**
     * Allowed {@code listingPurpose} values (#1745 P5-addendum) — mirrors the {@code chk_listing_purpose}
     * DB CHECK constraint (V32) and {@link DiscoverListingPredicateBuilder}'s case-sensitive
     * {@code pl.listing_purpose = ?} equality clause exactly. Independent of {@code propertyType}'s
     * filter — see {@link #normalizeListingPurpose(String)}.
     */
    private static final Set<String> ALLOWED_LISTING_PURPOSES = Set.of("sale", "rent");

    private final JdbcOperations jdbcOperations;
    private final CityActivationGuard cityActivationGuard;

    public DiscoverSummaryService(JdbcOperations jdbcOperations, CityActivationGuard cityActivationGuard) {
        this.jdbcOperations = jdbcOperations;
        this.cityActivationGuard = cityActivationGuard;
    }

    @Override
    @Transactional(readOnly = true)
    public DiscoverSummaryResponse getSummary(SummaryQuery query) {
        String city = query.city();
        String normalizedType = normalizeFilter(query.propertyType());
        String normalizedPurpose = normalizeListingPurpose(query.listingPurpose());
        log.debug("getSummary city={} propertyType={} groupBy={} hotspotLimit={} listingPurpose={}",
                city, normalizedType, query.groupBy(), query.hotspotLimit(), normalizedPurpose);

        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                city, null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null, normalizedPurpose, null, null
        );
        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(filters);

        long total = queryTotal(sql, normalizedType);

        List<DiscoverSummaryResponse.RegionCount> regions = "corridor".equals(query.groupBy())
                ? queryCorridorRegions(city, sql, normalizedType)
                : queryAreaGroupRegions(city, sql, normalizedType);

        List<DiscoverSummaryResponse.Hotspot> hotspots =
                queryHotspots(sql, normalizedType, query.hotspotLimit());

        return new DiscoverSummaryResponse(
                city, normalizedType, query.groupBy(), total, regions, hotspots, Instant.now());
    }

    // ── Total ─────────────────────────────────────────────────────────────────

    private long queryTotal(DiscoverListingPredicateBuilder.Sql sql, String normalizedType) {
        StringBuilder sb = new StringBuilder(
                "SELECT COUNT(*) FROM property_listings pl WHERE ")
                .append(sql.whereFragment())
                .append(" AND ").append(FOUR_SEGMENT_GUARD);

        List<Object> params = new ArrayList<>(sql.params());
        appendTypeFilter(sb, params, normalizedType);

        Long count = jdbcOperations.queryForObject(sb.toString(), Long.class, params.toArray());
        return count != null ? count : 0L;
    }

    // ── Hotspots ──────────────────────────────────────────────────────────────

    private List<DiscoverSummaryResponse.Hotspot> queryHotspots(
            DiscoverListingPredicateBuilder.Sql sql, String normalizedType, int hotspotLimit) {

        StringBuilder sb = new StringBuilder("""
                SELECT pl.area_key AS area_key, a.name AS name,
                       a.geo_center_lat AS geo_center_lat, a.geo_center_lon AS geo_center_lon,
                       COUNT(*) AS listing_count
                FROM property_listings pl
                JOIN areas a ON a.area_key = pl.area_key
                WHERE
                """)
                .append(sql.whereFragment())
                .append(" AND ").append(FOUR_SEGMENT_GUARD);

        List<Object> params = new ArrayList<>(sql.params());
        appendTypeFilter(sb, params, normalizedType);

        sb.append("""

                GROUP BY pl.area_key, a.name, a.geo_center_lat, a.geo_center_lon
                ORDER BY listing_count DESC, a.name ASC, pl.area_key ASC
                LIMIT ?
                """);
        params.add(hotspotLimit);

        return jdbcOperations.query(sb.toString(),
                (rs, rowNum) -> new DiscoverSummaryResponse.Hotspot(
                        rs.getString("area_key"),
                        rs.getString("name"),
                        rs.getLong("listing_count"),
                        nullableDouble(rs.getObject("geo_center_lat")),
                        nullableDouble(rs.getObject("geo_center_lon"))
                ),
                params.toArray());
    }

    // ── Regions: area_group ──────────────────────────────────────────────────

    private List<DiscoverSummaryResponse.RegionCount> queryAreaGroupRegions(
            String city, DiscoverListingPredicateBuilder.Sql sql, String normalizedType) {

        StringBuilder sb = new StringBuilder("""
                SELECT ag.slug AS region_key, ag.name AS region_label,
                       COUNT(pl.id) AS listing_count
                FROM area_groups ag
                JOIN cities c ON c.id = ag.city_id
                JOIN area_group_members agm ON agm.area_group_id = ag.id
                LEFT JOIN property_listings pl
                       ON pl.area_key = agm.area_key
                      AND
                """)
                .append(sql.whereFragment())
                .append(" AND ").append(FOUR_SEGMENT_GUARD);

        List<Object> params = new ArrayList<>(sql.params());
        appendTypeFilter(sb, params, normalizedType);

        sb.append("""

                WHERE c.slug = ?
                  AND c.is_active = true
                  AND ag.is_active = true
                GROUP BY ag.slug, ag.name
                ORDER BY listing_count DESC, ag.name ASC
                """);
        params.add(city);

        return jdbcOperations.query(sb.toString(),
                (rs, rowNum) -> new DiscoverSummaryResponse.RegionCount(
                        rs.getString("region_key"),
                        rs.getString("region_label"),
                        rs.getLong("listing_count")
                ),
                params.toArray());
    }

    // ── Regions: corridor ─────────────────────────────────────────────────────

    private List<DiscoverSummaryResponse.RegionCount> queryCorridorRegions(
            String city, DiscoverListingPredicateBuilder.Sql sql, String normalizedType) {

        // #1935: regional_area_classifications.city_key stores the city SLUG (see
        // RegionalClassificationBackfillService.UPSERT_SQL) but has NO FK/join to cities —
        // an inactive city's rows would otherwise still be readable via rac.city_key = ?.
        // Short-circuit BEFORE the denormalized classification table so an inactive city
        // yields the exact same empty regions list an unknown city yields.
        if (!cityActivationGuard.isActiveCitySlug(city)) {
            log.debug("queryCorridorRegions city={} — inactive or unknown city", city);
            return List.of();
        }

        List<Object> params = new ArrayList<>();
        params.add(city); // l.city_key

        StringBuilder sb = new StringBuilder("""
                SELECT rac.direction_key AS region_key,
                       COALESCE(l.group_name, rac.direction_key) AS region_label,
                       COUNT(pl.id) AS listing_count
                FROM regional_area_classifications rac
                LEFT JOIN city_regional_direction_labels l
                       ON l.direction_code = rac.direction_key AND l.city_key = ?
                LEFT JOIN property_listings pl
                       ON pl.area_key = rac.area_key
                      AND
                """)
                .append(sql.whereFragment())
                .append(" AND ").append(FOUR_SEGMENT_GUARD);

        params.addAll(sql.params());
        appendTypeFilter(sb, params, normalizedType);

        sb.append("""

                WHERE rac.city_key = ?
                GROUP BY rac.direction_key, l.group_name
                ORDER BY listing_count DESC, region_label ASC
                """);
        params.add(city);

        return jdbcOperations.query(sb.toString(),
                (rs, rowNum) -> new DiscoverSummaryResponse.RegionCount(
                        rs.getString("region_key"),
                        rs.getString("region_label"),
                        rs.getLong("listing_count")
                ),
                params.toArray());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static void appendTypeFilter(StringBuilder sb, List<Object> params, String normalizedType) {
        if (normalizedType != null) {
            sb.append(" AND LOWER(pl.property_type) = LOWER(?)");
            params.add(normalizedType);
        }
    }

    /** Trims and null/empty/whitespace-collapses the filter; returns null when no filter applies. */
    private static String normalizeFilter(String propertyType) {
        if (propertyType == null) {
            return null;
        }
        String trimmed = propertyType.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Normalises {@code listingPurpose} (#1745 P5-addendum) — an independent filter, separate from
     * {@code propertyType}/{@link #normalizeFilter(String)}. Blank/whitespace-only values and any
     * value outside {@link #ALLOWED_LISTING_PURPOSES} fall back to {@code null} (blended,
     * all-purposes) — preserving current behaviour for every existing caller that omits the param.
     */
    private static String normalizeListingPurpose(String listingPurpose) {
        if (listingPurpose == null) {
            return null;
        }
        String trimmed = listingPurpose.trim();
        return ALLOWED_LISTING_PURPOSES.contains(trimmed) ? trimmed : null;
    }

    private static Double nullableDouble(Object val) {
        return val == null ? null : ((Number) val).doubleValue();
    }
}
