package com.example.realestate.discover;

import com.example.realestate.discover.navigation.AreaCountQuery;
import com.example.realestate.discover.navigation.PostgresAreaCountProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Postgres implementation of {@link DiscoverSummaryPort} (#1745 P5).
 *
 * <p>Reuses {@link DiscoverListingPredicateBuilder#build} for the shared LIVE / not-archived /
 * not-duplicate / city core predicate for {@link #queryTotal}. Two additional guards are applied
 * by this service directly:
 * <ol>
 *   <li>the 4-segment {@code area_key} guard (not present in the builder), and</li>
 *   <li>a case-insensitive {@code LOWER(pl.property_type) = LOWER(?)} match, applied ONLY when
 *       {@code propertyType} is non-blank — mirroring {@link AreaSummaryService}'s type-filtered
 *       query exactly so per-area/per-region counts reconcile with {@code /api/discover/areas}.</li>
 * </ol>
 *
 * <p><b>#1955 Areas PR A, SLICE 2e (AC13).</b> {@code queryHotspots}/{@code
 * queryAreaGroupRegions}/{@code queryCorridorRegions} no longer run their own per-region SQL
 * aggregation. All three are now derived from ONE shared whole-city {@code area_key -> count} map
 * fetched via {@link PostgresAreaCountProvider#countsByAreaKey} (the same guarded predicate as
 * before, applied once), then rolled up in memory against each grouping's own membership table
 * ({@code area_groups}/{@code area_group_members} or {@code regional_area_classifications}) — so
 * every response field is still internally consistent (regions/hotspots sum to the SAME total) by
 * construction, now via ONE query instead of three. This also retires the whole-response Caffeine
 * TTL cache {@code CachingDiscoverSummaryService} (D6, #1760) — the per-region SQL cost this class
 * previously amortised via that 120s cache no longer exists to amortise.
 *
 * <p>{@code listingPurpose} (#1745 P5-addendum) is a separate, independent optional filter —
 * {@code "sale"}/{@code "rent"} — passed to the shared predicate builders (never conflated with
 * {@code propertyType}). See {@link #normalizeListingPurpose(String)}.
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
    private final PostgresAreaCountProvider areaCountProvider;

    public DiscoverSummaryService(
            JdbcOperations jdbcOperations,
            CityActivationGuard cityActivationGuard,
            PostgresAreaCountProvider areaCountProvider) {
        this.jdbcOperations = jdbcOperations;
        this.cityActivationGuard = cityActivationGuard;
        this.areaCountProvider = areaCountProvider;
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

        // #1955 Areas PR A, SLICE 2e (AC13): ONE area-level GROUP BY, shared by all three
        // region/hotspot rollups below — replaces three independent per-region SQL aggregations.
        Map<String, Long> areaCounts = areaCountProvider.countsByAreaKey(
                new AreaCountQuery(city, normalizedPurpose, normalizedType, "public"));

        List<DiscoverSummaryResponse.RegionCount> regions = "corridor".equals(query.groupBy())
                ? queryCorridorRegions(city, areaCounts)
                : queryAreaGroupRegions(city, areaCounts);

        List<DiscoverSummaryResponse.Hotspot> hotspots = queryHotspots(areaCounts, query.hotspotLimit());

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

    // ── Hotspots (#1955 Areas PR A, SLICE 2e: rolled up from the shared area-count map) ────────

    private List<DiscoverSummaryResponse.Hotspot> queryHotspots(Map<String, Long> areaCounts, int hotspotLimit) {
        if (areaCounts.isEmpty()) {
            return List.of();
        }
        Map<String, AreaMeta> metaByAreaKey = loadAreaMeta(areaCounts.keySet());

        List<DiscoverSummaryResponse.Hotspot> hotspots = new ArrayList<>();
        for (Map.Entry<String, Long> e : areaCounts.entrySet()) {
            AreaMeta meta = metaByAreaKey.get(e.getKey());
            if (meta == null) {
                continue; // unreachable in practice — every counted area_key resolves via `areas`
            }
            hotspots.add(new DiscoverSummaryResponse.Hotspot(e.getKey(), meta.name(), e.getValue(), meta.lat(), meta.lon()));
        }

        hotspots.sort(Comparator
                .comparingLong(DiscoverSummaryResponse.Hotspot::listingCount).reversed()
                .thenComparing(DiscoverSummaryResponse.Hotspot::name, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(DiscoverSummaryResponse.Hotspot::areaKey));

        return hotspots.size() > hotspotLimit ? hotspots.subList(0, hotspotLimit) : hotspots;
    }

    private Map<String, AreaMeta> loadAreaMeta(Set<String> areaKeys) {
        if (areaKeys.isEmpty()) {
            return Map.of();
        }
        List<String> keys = new ArrayList<>(areaKeys);
        StringBuilder sb = new StringBuilder(
                "SELECT area_key, name, geo_center_lat, geo_center_lon FROM areas WHERE area_key IN (");
        for (int i = 0; i < keys.size(); i++) {
            sb.append(i == 0 ? "?" : ",?");
        }
        sb.append(')');

        List<AreaMeta> rows = jdbcOperations.query(sb.toString(),
                (rs, rowNum) -> new AreaMeta(rs.getString("area_key"), rs.getString("name"),
                        nullableDouble(rs.getObject("geo_center_lat")), nullableDouble(rs.getObject("geo_center_lon"))),
                keys.toArray());

        Map<String, AreaMeta> map = new HashMap<>();
        for (AreaMeta m : rows) {
            map.put(m.areaKey(), m);
        }
        return map;
    }

    private record AreaMeta(String areaKey, String name, Double lat, Double lon) {}

    // ── Regions: area_group (#1955 Areas PR A, SLICE 2e: rolled up from the shared area-count map) ─

    private List<DiscoverSummaryResponse.RegionCount> queryAreaGroupRegions(String city, Map<String, Long> areaCounts) {
        List<GroupMemberRow> memberRows = jdbcOperations.query("""
                SELECT ag.slug AS region_key, ag.name AS region_label, agm.area_key AS area_key
                FROM area_groups ag
                JOIN cities c ON c.id = ag.city_id
                JOIN area_group_members agm ON agm.area_group_id = ag.id
                WHERE c.slug = ? AND c.is_active = true AND ag.is_active = true
                """,
                (rs, rowNum) -> new GroupMemberRow(
                        rs.getString("region_key"), rs.getString("region_label"), rs.getString("area_key")),
                city);

        return foldRegions(memberRows, areaCounts);
    }

    // ── Regions: corridor (#1955 Areas PR A, SLICE 2e: rolled up from the shared area-count map) ──

    private List<DiscoverSummaryResponse.RegionCount> queryCorridorRegions(String city, Map<String, Long> areaCounts) {
        // #1935: regional_area_classifications.city_key stores the city SLUG (see
        // RegionalClassificationBackfillService.UPSERT_SQL) but has NO FK/join to cities —
        // an inactive city's rows would otherwise still be readable via rac.city_key = ?.
        // Short-circuit BEFORE the denormalized classification table so an inactive city
        // yields the exact same empty regions list an unknown city yields.
        if (!cityActivationGuard.isActiveCitySlug(city)) {
            log.debug("queryCorridorRegions city={} — inactive or unknown city", city);
            return List.of();
        }

        List<GroupMemberRow> memberRows = jdbcOperations.query("""
                SELECT rac.direction_key AS region_key,
                       COALESCE(l.group_name, rac.direction_key) AS region_label,
                       rac.area_key AS area_key
                FROM regional_area_classifications rac
                LEFT JOIN city_regional_direction_labels l
                       ON l.direction_code = rac.direction_key AND l.city_key = ?
                WHERE rac.city_key = ?
                """,
                (rs, rowNum) -> new GroupMemberRow(
                        rs.getString("region_key"), rs.getString("region_label"), rs.getString("area_key")),
                city, city);

        return foldRegions(memberRows, areaCounts);
    }

    /** Groups {@code memberRows} by {@code regionKey}, summing each member area's count from the
     *  shared area-count map — a region with member areas but zero matching listings still appears
     *  (with count 0), mirroring the pre-#1955 LEFT-JOIN-aggregate behaviour exactly. */
    private List<DiscoverSummaryResponse.RegionCount> foldRegions(List<GroupMemberRow> memberRows, Map<String, Long> areaCounts) {
        Map<String, String> labelByRegionKey = new LinkedHashMap<>();
        Map<String, Long> totalByRegionKey = new LinkedHashMap<>();
        for (GroupMemberRow r : memberRows) {
            labelByRegionKey.putIfAbsent(r.regionKey(), r.regionLabel());
            totalByRegionKey.merge(r.regionKey(), areaCounts.getOrDefault(r.areaKey(), 0L), Long::sum);
        }

        List<DiscoverSummaryResponse.RegionCount> regions = new ArrayList<>();
        for (Map.Entry<String, Long> e : totalByRegionKey.entrySet()) {
            regions.add(new DiscoverSummaryResponse.RegionCount(e.getKey(), labelByRegionKey.get(e.getKey()), e.getValue()));
        }
        regions.sort(Comparator
                .comparingLong(DiscoverSummaryResponse.RegionCount::listingCount).reversed()
                .thenComparing(DiscoverSummaryResponse.RegionCount::regionLabel, Comparator.nullsLast(Comparator.naturalOrder())));
        return regions;
    }

    private record GroupMemberRow(String regionKey, String regionLabel, String areaKey) {}

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
