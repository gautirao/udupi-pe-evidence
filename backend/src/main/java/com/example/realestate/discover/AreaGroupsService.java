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
              AND ag.is_active = true
            ORDER BY ag.display_order, agm.display_order
            """;
}
