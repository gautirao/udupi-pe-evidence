package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Fetches area groups for a given city slug from the area_groups / area_group_members tables.
 * Uses a single SQL query with LEFT JOIN to avoid N+1; assembles areaKeys list in Java.
 * is_active filter is applied in SQL (not Java). areaKeys ordered by area_group_members.display_order.
 *
 * <p>Also derives each group's {@code regionKey} AT READ time from {@code
 * city_region_memberships} (materialized by {@code CityRegionOnboardingService.apply}, #1882
 * Track A PR1) — never a stored column, so it always reflects the group's CURRENT membership
 * even if {@code area_group_members} has been edited since the last onboarding apply(). The
 * derivation reuses {@link CityRegionOnboardingReport.GroupCategorization}'s existing
 * UNIFIED/SPLIT/DEGENERATE semantics (distinct region_keys among a group's classified members) —
 * it is NOT a second algorithm: see {@link #deriveRegionKey}.
 */
@Service
public class AreaGroupsService {

    private static final Logger log = LoggerFactory.getLogger(AreaGroupsService.class);

    private final JdbcOperations jdbcOperations;

    public AreaGroupsService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    @Transactional(readOnly = true)
    public AreaGroupsResponse getGroupsByCity(String city) {
        String normalizedCity = city.toLowerCase();
        log.debug("getGroupsByCity city={}", normalizedCity);

        // Single query: join area_groups → area_group_members.
        // Each row represents one (group, member) pair; rows for the same group are consecutive
        // because of the ORDER BY ag.display_order, agm.display_order.
        // If a group has no members the LEFT JOIN still returns the group row with null area_key.
        List<GroupRow> rows = jdbcOperations.query(
                GROUPS_BY_CITY_SQL,
                (rs, rowNum) -> new GroupRow(
                        rs.getString("slug"),
                        rs.getString("name"),
                        rs.getString("subtitle"),
                        rs.getString("region_label"),
                        rs.getInt("display_order"),
                        rs.getString("area_key"),
                        nullableDouble(rs.getObject("focus_lat")),
                        nullableDouble(rs.getObject("focus_lon")),
                        nullableDouble(rs.getObject("min_lat")),
                        nullableDouble(rs.getObject("min_lon")),
                        nullableDouble(rs.getObject("max_lat")),
                        nullableDouble(rs.getObject("max_lon")),
                        rs.getString("description"),
                        rs.getString("member_region_key"),
                        nullableInteger(rs.getObject("member_region_display_order"))
                ),
                normalizedCity
        );

        // Assemble: fold (group, member) rows into AreaGroupResponse objects.
        // LinkedHashMap preserves insertion order (ORDER BY in SQL guarantees group order).
        // city_region_memberships/city_regions are both joined on their primary keys
        // (city_id, area_key) / (city_id, region_key) respectively, so each (group, member) row
        // still yields AT MOST one membership match — no fan-out beyond the pre-existing
        // area_group_members LEFT JOIN, and the areaKeys fold is unaffected.
        Map<String, GroupAccumulator> accumulators = new LinkedHashMap<>();
        for (GroupRow row : rows) {
            GroupAccumulator acc = accumulators.computeIfAbsent(
                    row.slug(),
                    k -> new GroupAccumulator(
                            row.slug(), row.name(), row.subtitle(), row.regionLabel(),
                            row.displayOrder(), row.focusLat(), row.focusLon(),
                            row.minLat(), row.minLon(), row.maxLat(), row.maxLon(),
                            row.description()
                    )
            );
            if (row.areaKey() != null) {
                acc.areaKeys().add(row.areaKey());
                if (row.memberRegionKey() != null) {
                    acc.memberRegions().add(
                            new RegionMembership(row.memberRegionKey(), row.memberRegionDisplayOrder()));
                }
            }
        }

        List<AreaGroupResponse> groups = accumulators.values().stream()
                .map(acc -> new AreaGroupResponse(
                        acc.slug(), acc.name(), acc.subtitle(), acc.regionLabel(),
                        acc.displayOrder(), List.copyOf(acc.areaKeys()),
                        deriveRegionKey(acc.memberRegions()),
                        acc.focusLat(), acc.focusLon(),
                        acc.minLat(), acc.minLon(), acc.maxLat(), acc.maxLon(),
                        acc.description()
                ))
                .toList();

        log.debug("getGroupsByCity city={} returned {} groups", normalizedCity, groups.size());
        return new AreaGroupsResponse(normalizedCity, groups);
    }

    /**
     * Region-scoped area-group projections (#1910 PR1) —
     * {@code GET /api/discover/cities/{citySlug}/regions/{regionKey}/groups}.
     *
     * <p>For each {@code area_groups} row with &ge;1 member classified into {@code regionKey}
     * (via {@code city_region_memberships}), returns a {@link RegionScopedAreaGroup} carrying
     * ONLY that region's subset of member {@code area_keys} — never the group's full unscoped
     * membership, bounds, or listing count (contrast with {@link #getGroupsByCity}). Groups with
     * zero members in {@code regionKey} are excluded entirely (the INNER JOIN on
     * {@code city_region_memberships} below drops them before they ever reach the fold).
     *
     * <p>One bounded SQL query, no N+1: {@code area_groups} → {@code area_group_members} →
     * {@code city_region_memberships} (filtered {@code region_key = ?}) → {@code areas} (bbox
     * columns, PK join) → {@code LEFT JOIN property_listings} guarded by
     * {@link DiscoverListingPredicateBuilder}. Grouped by {@code (group, area)} — NOT
     * {@code (group)} alone — so {@code COUNT(DISTINCT pl.id)} is computed per-area first, then
     * summed per group in Java; because {@code area_group_members} only guarantees
     * {@code UNIQUE(area_group_id, area_key)} (not exclusivity of an area to one group, V77), an
     * area shared by two groups legitimately contributes its listings to BOTH groups' sums — by
     * design, not a double-counting bug — while listings within a single area are never
     * double-counted because each area's own {@code COUNT(DISTINCT pl.id)} is computed once.
     *
     * <p>Unknown {@code citySlug} or {@code regionKey} (or a region with no groups) naturally
     * yields zero SQL rows — via the {@code JOIN cities c ON ... WHERE c.slug = ?} and
     * {@code JOIN city_region_memberships crm ON ... AND crm.region_key = ?} filters — and
     * therefore an empty {@code groups} list, 200 OK, never a 404/500.
     *
     * <p>{@code boundsStatus} is computed per group from ONLY the region-subset's valid-bbox
     * members (via {@link CityRegionProjection#hasCompleteValidBbox}) — never falling back to an
     * area's centroid the way {@link RegionSummaryService} does — because a member area with no
     * bbox contributes nothing to this projection's bounds union at all:
     * COMPLETE (every subset member has a complete bbox) / APPROXIMATE (some do, bounds computed
     * from the valid subset only) / UNAVAILABLE (zero do — all six coordinate fields null, never
     * a fabricated (0,0) or degenerate point).
     */
    @Transactional(readOnly = true)
    public RegionScopedAreaGroup.Response getRegionScopedGroupsByCity(
            String citySlug, String regionKey, String listingPurpose) {
        String normalizedPurpose = RegionSummaryService.normalizeListingPurpose(listingPurpose);
        log.debug("getRegionScopedGroupsByCity citySlug={} regionKey={} listingPurpose={}",
                citySlug, regionKey, normalizedPurpose);

        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                citySlug, null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null, normalizedPurpose, null, null
        );
        DiscoverListingPredicateBuilder.Sql predicate = DiscoverListingPredicateBuilder.build(filters);

        String sql = REGION_SCOPED_GROUPS_SQL.replace("__PREDICATE__", predicate.whereFragment());

        List<Object> params = new ArrayList<>();
        params.add(regionKey);
        params.addAll(predicate.params());
        params.add(citySlug);

        List<RegionScopedGroupRow> rows = jdbcOperations.query(
                sql,
                (rs, rowNum) -> new RegionScopedGroupRow(
                        rs.getString("group_slug"),
                        rs.getString("group_name"),
                        rs.getString("group_subtitle"),
                        rs.getInt("region_display_order"),
                        rs.getString("area_key"),
                        nullableDouble(rs.getObject("area_min_lat")),
                        nullableDouble(rs.getObject("area_min_lon")),
                        nullableDouble(rs.getObject("area_max_lat")),
                        nullableDouble(rs.getObject("area_max_lon")),
                        rs.getLong("area_listing_count")
                ),
                params.toArray()
        );

        // Fold (group, area) rows into per-group accumulators — mirrors getGroupsByCity()'s
        // fold-into-record pattern. LinkedHashMap + the SQL's ORDER BY ag.display_order, ag.slug,
        // agm.display_order, agm.area_key together guarantee deterministic, repeatable
        // group/areaKey ordering. ag.slug is the GROUP-level tie-breaker (applied right after
        // ag.display_order, before any member-level column) so it can never be influenced by a
        // group's own members' display_order values; agm.area_key is the separate MEMBER-level
        // tie-breaker for agm.display_order within a group. Two groups or two members sharing a
        // display_order never yield nondeterministic ordering across runs/replicas (PR #1912
        // review finding).
        Map<String, RegionScopedAccumulator> accumulators = new LinkedHashMap<>();
        for (RegionScopedGroupRow row : rows) {
            RegionScopedAccumulator acc = accumulators.computeIfAbsent(
                    row.groupSlug(),
                    k -> new RegionScopedAccumulator(
                            row.groupSlug(), row.groupName(), row.groupSubtitle(), row.regionDisplayOrder())
            );
            acc.areaKeys.add(row.areaKey());
            acc.listingCount += row.areaListingCount();
            if (CityRegionProjection.hasCompleteValidBbox(
                    row.areaMinLat(), row.areaMaxLat(), row.areaMinLon(), row.areaMaxLon())) {
                acc.validMemberCount++;
                acc.minLat = acc.minLat == null ? row.areaMinLat() : Math.min(acc.minLat, row.areaMinLat());
                acc.maxLat = acc.maxLat == null ? row.areaMaxLat() : Math.max(acc.maxLat, row.areaMaxLat());
                acc.minLon = acc.minLon == null ? row.areaMinLon() : Math.min(acc.minLon, row.areaMinLon());
                acc.maxLon = acc.maxLon == null ? row.areaMaxLon() : Math.max(acc.maxLon, row.areaMaxLon());
            }
        }

        List<RegionScopedAreaGroup> groups = accumulators.values().stream()
                .map(acc -> acc.toResponse(regionKey))
                .toList();

        log.debug("getRegionScopedGroupsByCity citySlug={} regionKey={} returned {} groups",
                citySlug, regionKey, groups.size());
        return new RegionScopedAreaGroup.Response(citySlug, regionKey, groups);
    }

    // Raw row returned from JDBC for getRegionScopedGroupsByCity — one per (group, area) pair,
    // already listing-count-aggregated for that single area by the SQL's GROUP BY.
    private record RegionScopedGroupRow(
            String groupSlug,
            String groupName,
            String groupSubtitle,
            int regionDisplayOrder,
            String areaKey,
            Double areaMinLat,
            Double areaMinLon,
            Double areaMaxLat,
            Double areaMaxLon,
            long areaListingCount
    ) {}

    // Mutable per-group accumulator for getRegionScopedGroupsByCity's fold.
    private static final class RegionScopedAccumulator {
        private final String slug;
        private final String name;
        private final String subtitle;
        private final int regionDisplayOrder;
        private final List<String> areaKeys = new ArrayList<>();
        private long listingCount = 0;
        private int validMemberCount = 0;
        private Double minLat;
        private Double minLon;
        private Double maxLat;
        private Double maxLon;

        RegionScopedAccumulator(String slug, String name, String subtitle, int regionDisplayOrder) {
            this.slug = slug;
            this.name = name;
            this.subtitle = subtitle;
            this.regionDisplayOrder = regionDisplayOrder;
        }

        RegionScopedAreaGroup toResponse(String scopingRegionKey) {
            String boundsStatus;
            Double focusLat = null;
            Double focusLon = null;
            Double outMinLat = null;
            Double outMinLon = null;
            Double outMaxLat = null;
            Double outMaxLon = null;
            if (validMemberCount == 0) {
                boundsStatus = RegionScopedAreaGroup.BOUNDS_UNAVAILABLE;
            } else {
                boundsStatus = validMemberCount == areaKeys.size()
                        ? RegionScopedAreaGroup.BOUNDS_COMPLETE
                        : RegionScopedAreaGroup.BOUNDS_APPROXIMATE;
                outMinLat = minLat;
                outMinLon = minLon;
                outMaxLat = maxLat;
                outMaxLon = maxLon;
                focusLat = (minLat + maxLat) / 2.0;
                focusLon = (minLon + maxLon) / 2.0;
            }
            return new RegionScopedAreaGroup(
                    slug, name, subtitle, scopingRegionKey, regionDisplayOrder,
                    List.copyOf(areaKeys), listingCount,
                    focusLat, focusLon,
                    outMinLat, outMinLon, outMaxLat, outMaxLon,
                    boundsStatus
            );
        }
    }

    // Single query, no N+1: area_groups -> area_group_members -> city_region_memberships
    // (filtered to the requested region_key, INNER JOIN so groups with zero members in that
    // region never appear in the result at all) -> city_regions (region's display_order) ->
    // areas (PK join on area_key, bbox columns, no fan-out) -> LEFT JOIN property_listings
    // guarded by the DiscoverListingPredicateBuilder fragment substituted at __PREDICATE__.
    // Grouped by (group, area) so COUNT(DISTINCT pl.id) is a per-area distinct count; the Java
    // fold above sums these per group, which is intentionally NOT the same as a single
    // group-level COUNT(DISTINCT pl.id) across a UNION of all group rows — see this method's
    // javadoc for why a shared area between two groups must legitimately count in both.
    // ag.id is grouped on (area_groups' actual primary key) alongside the plain columns selected
    // from ag, so every (group, area) combination collapses to exactly one row.
    private static final String REGION_SCOPED_GROUPS_SQL = """
            SELECT
                ag.slug AS group_slug,
                ag.name AS group_name,
                ag.subtitle AS group_subtitle,
                cr.display_order AS region_display_order,
                agm.area_key AS area_key,
                a.min_lat AS area_min_lat,
                a.min_lon AS area_min_lon,
                a.max_lat AS area_max_lat,
                a.max_lon AS area_max_lon,
                COUNT(DISTINCT pl.id) AS area_listing_count
            FROM area_groups ag
            JOIN cities c ON c.id = ag.city_id
            JOIN area_group_members agm
                ON agm.area_group_id = ag.id
            JOIN city_region_memberships crm
                ON crm.city_id = ag.city_id AND crm.area_key = agm.area_key AND crm.region_key = ?
            JOIN city_regions cr
                ON cr.city_id = crm.city_id AND cr.region_key = crm.region_key
            JOIN areas a
                ON a.area_key = agm.area_key
            LEFT JOIN property_listings pl
                ON pl.area_key = agm.area_key
               AND __PREDICATE__
            WHERE c.slug = ?
              AND c.is_active = true
              AND ag.is_active = true
            GROUP BY ag.id, ag.slug, ag.name, ag.subtitle, ag.display_order, cr.display_order,
                     agm.area_key, agm.display_order, a.min_lat, a.min_lon, a.max_lat, a.max_lon
            ORDER BY ag.display_order, ag.slug, agm.display_order, agm.area_key
            """;

    // ── regionKey derivation ─────────────────────────────────────────────────
    //
    // Reuses CityRegionOnboardingReport.GroupCategorization's UNIFIED/SPLIT/DEGENERATE
    // semantics (distinct region_keys among a group's classified/materialized members) —
    // this is NOT a second algorithm:
    //   DEGENERATE (no member has a city_region_memberships row)        -> null
    //   UNIFIED    (exactly one distinct member region_key)             -> that key
    //   SPLIT      (>= 2 distinct member region_keys)                   -> PLURALITY
    //     (highest member count), ties broken deterministically by
    //     city_regions.display_order ASC, then region_key ASC.
    // A group mixing classified and unclassified members categorizes on the classified
    // subset only (unclassified members simply contribute nothing to memberRegions).
    private static String deriveRegionKey(List<RegionMembership> memberRegions) {
        if (memberRegions.isEmpty()) {
            return null;
        }
        Map<String, Integer> countByRegion = new LinkedHashMap<>();
        Map<String, Integer> displayOrderByRegion = new LinkedHashMap<>();
        for (RegionMembership m : memberRegions) {
            countByRegion.merge(m.regionKey(), 1, Integer::sum);
            displayOrderByRegion.putIfAbsent(m.regionKey(), m.displayOrder());
        }
        // With exactly one distinct region_key this trivially returns it (UNIFIED); with two
        // or more it picks the plurality winner (SPLIT), deterministically and idempotently —
        // the comparator is a total order (count, then display_order, then region_key), so
        // repeated calls over the same memberships always yield the same result.
        return countByRegion.keySet().stream()
                .sorted(Comparator
                        .comparingInt((String r) -> -countByRegion.get(r))
                        .thenComparingInt(r -> displayOrderByRegion.getOrDefault(r, Integer.MAX_VALUE))
                        .thenComparing(Comparator.naturalOrder()))
                .findFirst()
                .orElse(null);
    }

    // One member's materialized region membership, with the region's canonical display_order
    // (used only for the SPLIT-group deterministic tie-break).
    private record RegionMembership(String regionKey, Integer displayOrder) {}

    // ── helpers ───────────────────────────────────────────────────────────────

    private static Double nullableDouble(Object val) {
        return val == null ? null : ((Number) val).doubleValue();
    }

    private static Integer nullableInteger(Object val) {
        return val == null ? null : ((Number) val).intValue();
    }

    // Raw row returned from JDBC — one per (group, member) pair.
    private record GroupRow(
            String slug,
            String name,
            String subtitle,
            String regionLabel,
            int displayOrder,
            String areaKey,
            Double focusLat,
            Double focusLon,
            Double minLat,
            Double minLon,
            Double maxLat,
            Double maxLon,
            String description,
            String memberRegionKey,
            Integer memberRegionDisplayOrder
    ) {}

    // Mutable accumulator used while folding rows.
    private static final class GroupAccumulator {
        private final String slug;
        private final String name;
        private final String subtitle;
        private final String regionLabel;
        private final int displayOrder;
        private final Double focusLat;
        private final Double focusLon;
        private final Double minLat;
        private final Double minLon;
        private final Double maxLat;
        private final Double maxLon;
        private final String description;
        private final List<String> areaKeys = new ArrayList<>();
        private final List<RegionMembership> memberRegions = new ArrayList<>();

        GroupAccumulator(String slug, String name, String subtitle, String regionLabel,
                         int displayOrder,
                         Double focusLat, Double focusLon,
                         Double minLat, Double minLon,
                         Double maxLat, Double maxLon,
                         String description) {
            this.slug = slug;
            this.name = name;
            this.subtitle = subtitle;
            this.regionLabel = regionLabel;
            this.displayOrder = displayOrder;
            this.focusLat = focusLat;
            this.focusLon = focusLon;
            this.minLat = minLat;
            this.minLon = minLon;
            this.maxLat = maxLat;
            this.maxLon = maxLon;
            this.description = description;
        }

        String slug()         { return slug; }
        String name()         { return name; }
        String subtitle()     { return subtitle; }
        String regionLabel()  { return regionLabel; }
        int displayOrder()    { return displayOrder; }
        Double focusLat()     { return focusLat; }
        Double focusLon()     { return focusLon; }
        Double minLat()       { return minLat; }
        Double minLon()       { return minLon; }
        Double maxLat()       { return maxLat; }
        Double maxLon()       { return maxLon; }
        String description()  { return description; }
        List<String> areaKeys() { return areaKeys; }
        List<RegionMembership> memberRegions() { return memberRegions; }
    }

    // Single query — no N+1. is_active filter applied in SQL.
    // LEFT JOIN on area_group_members so groups with no members still appear.
    // LEFT JOIN on city_region_memberships (#1882, keyed on its PK (city_id, area_key)) and
    // city_regions (keyed on its PK (city_id, region_key)) — both are 1:1 joins, so neither
    // introduces row fan-out beyond the pre-existing area_group_members LEFT JOIN; a member
    // area with no materialized region membership simply yields NULL member_region_key.
    private static final String GROUPS_BY_CITY_SQL = """
            SELECT
                ag.slug,
                ag.name,
                ag.subtitle,
                ag.region_label,
                ag.display_order,
                agm.area_key,
                ag.focus_lat,
                ag.focus_lon,
                ag.min_lat,
                ag.min_lon,
                ag.max_lat,
                ag.max_lon,
                ag.description,
                crm.region_key AS member_region_key,
                cr.display_order AS member_region_display_order
            FROM area_groups ag
            JOIN cities c ON c.id = ag.city_id
            LEFT JOIN area_group_members agm
                ON agm.area_group_id = ag.id
            LEFT JOIN city_region_memberships crm
                ON crm.city_id = ag.city_id AND crm.area_key = agm.area_key
            LEFT JOIN city_regions cr
                ON cr.city_id = crm.city_id AND cr.region_key = crm.region_key
            WHERE c.slug = ?
              AND c.is_active = true
              AND ag.is_active = true
            ORDER BY ag.display_order, agm.display_order
            """;
}
