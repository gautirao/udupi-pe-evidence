package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Fetches area groups for a given city slug from the area_groups / area_group_members tables.
 * Uses a single SQL query with LEFT JOIN to avoid N+1; assembles areaKeys list in Java.
 * is_active filter is applied in SQL (not Java). areaKeys ordered by area_group_members.display_order.
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
                        nullableDouble(rs.getObject("max_lon"))
                ),
                normalizedCity
        );

        // Assemble: fold (group, member) rows into AreaGroupResponse objects.
        // LinkedHashMap preserves insertion order (ORDER BY in SQL guarantees group order).
        Map<String, GroupAccumulator> accumulators = new LinkedHashMap<>();
        for (GroupRow row : rows) {
            GroupAccumulator acc = accumulators.computeIfAbsent(
                    row.slug(),
                    k -> new GroupAccumulator(
                            row.slug(), row.name(), row.subtitle(), row.regionLabel(),
                            row.displayOrder(), row.focusLat(), row.focusLon(),
                            row.minLat(), row.minLon(), row.maxLat(), row.maxLon()
                    )
            );
            if (row.areaKey() != null) {
                acc.areaKeys().add(row.areaKey());
            }
        }

        List<AreaGroupResponse> groups = accumulators.values().stream()
                .map(acc -> new AreaGroupResponse(
                        acc.slug(), acc.name(), acc.subtitle(), acc.regionLabel(),
                        acc.displayOrder(), List.copyOf(acc.areaKeys()),
                        acc.focusLat(), acc.focusLon(),
                        acc.minLat(), acc.minLon(), acc.maxLat(), acc.maxLon()
                ))
                .toList();

        log.debug("getGroupsByCity city={} returned {} groups", normalizedCity, groups.size());
        return new AreaGroupsResponse(normalizedCity, groups);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static Double nullableDouble(Object val) {
        return val == null ? null : ((Number) val).doubleValue();
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
            Double maxLon
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
        private final List<String> areaKeys = new ArrayList<>();

        GroupAccumulator(String slug, String name, String subtitle, String regionLabel,
                         int displayOrder,
                         Double focusLat, Double focusLon,
                         Double minLat, Double minLon,
                         Double maxLat, Double maxLon) {
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
        List<String> areaKeys() { return areaKeys; }
    }

    // Single query — no N+1. is_active filter applied in SQL.
    // LEFT JOIN on area_group_members so groups with no members still appear.
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
                ag.max_lon
            FROM area_groups ag
            JOIN cities c ON c.id = ag.city_id
            LEFT JOIN area_group_members agm
                ON agm.area_group_id = ag.id
            WHERE c.slug = ?
              AND ag.is_active = true
            ORDER BY ag.display_order, agm.display_order
            """;
}
