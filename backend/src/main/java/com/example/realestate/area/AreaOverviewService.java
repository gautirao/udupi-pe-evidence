package com.example.realestate.area;

import com.example.realestate.school.SchoolResponse;
import com.example.realestate.school.SchoolService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Assembles the area overview composite response from {@code area_overview_stats}
 * and supporting tables.
 *
 * <p>Uses {@link JdbcOperations} (consistent with {@link com.example.realestate.analytics.AreaOverviewRollupJob})
 * rather than a new JPA repository.
 */
@Service
public class AreaOverviewService {

    private static final Logger log = LoggerFactory.getLogger(AreaOverviewService.class);

    private static final int SCHOOL_LIMIT = 5;
    private static final double SCHOOL_RADIUS_KM = 3.0;
    private static final int COMPARISON_APPROXIMATE_THRESHOLD = 5;

    private final JdbcOperations jdbcOperations;
    private final NamedParameterJdbcTemplate namedJdbcTemplate;
    private final SchoolService schoolService;
    private final ObjectMapper objectMapper;

    public AreaOverviewService(JdbcOperations jdbcOperations,
                               NamedParameterJdbcTemplate namedJdbcTemplate,
                               SchoolService schoolService,
                               ObjectMapper objectMapper) {
        this.jdbcOperations = jdbcOperations;
        this.namedJdbcTemplate = namedJdbcTemplate;
        this.schoolService = schoolService;
        this.objectMapper = objectMapper;
    }

    /**
     * Assembles the full overview response for a given areaKey.
     *
     * @param areaKey pipe-separated area key (e.g. "IN|KA|Udupi|Manipal")
     * @return assembled response
     * @throws AreaNotFoundException if no row exists for this areaKey
     */
    @Transactional(readOnly = true)
    public AreaOverviewResponse assembleResponse(String areaKey) {
        // 1. Look up the area row
        AreaRow row = queryAreaRow(areaKey);
        if (row == null) {
            log.warn("assembleResponse: no area_overview_stats row for areaKey={}", areaKey);
            throw new AreaNotFoundException(areaKey);
        }

        // 2. Derive labels
        String areaLabel = lastPipeSegment(areaKey);
        String districtKey = deriveDistrictKey(areaKey, row);
        String districtLabel = lastPipeSegment(districtKey);

        // 3. Build snapshot, fallback, and activity based on confidence tier
        AreaOverviewResponse.SnapshotData snapshot;
        AreaOverviewResponse.FallbackData fallback;
        AreaOverviewResponse.ActivityData activity;

        if ("fallback".equals(row.confidenceTier)) {
            // Locality has < 5 listings — show district snapshot as the price context
            AreaRow districtRow = districtKey != null ? queryAreaRow(districtKey) : null;
            snapshot = districtRow != null ? buildSnapshot(districtRow) : null;
            fallback = new AreaOverviewResponse.FallbackData(
                    "district",
                    districtKey,
                    districtLabel,
                    districtRow != null ? districtRow.listingCount90d : 0
            );
            activity = null;
        } else {
            // full or limited — use locality row directly
            snapshot = buildSnapshot(row);
            fallback = null;
            activity = queryActivity(areaKey);
        }

        // 4. Comparison neighbours
        List<AreaOverviewResponse.ComparisonEntry> comparison = queryComparison(row.nearbyAreaKeys);

        // 5. Nearby schools — guard null centroid
        List<AreaOverviewResponse.SchoolEntry> schools = querySchools(row.centroidLat, row.centroidLon);

        log.info("assembleResponse: areaKey={} confidence={} schools={} comparison={}",
                areaKey, row.confidenceTier, schools.size(), comparison.size());

        return new AreaOverviewResponse(
                areaKey,
                areaLabel,
                districtKey,
                districtLabel,
                row.confidenceTier,
                row.listingCount90d,
                snapshot,
                fallback,
                comparison,
                schools,
                activity
        );
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    private AreaRow queryAreaRow(String areaKey) {
        if (areaKey == null) {
            return null;
        }
        List<AreaRow> rows = jdbcOperations.query(
                """
                SELECT area_key, area_level, listing_count_90d,
                       median_price_paise, price_p10_paise, price_p90_paise,
                       property_type_dist, trend_direction, trend_pct_change,
                       confidence_tier, nearby_area_keys,
                       centroid_lat, centroid_lon, district_area_key
                FROM area_overview_stats
                WHERE area_key = ?
                """,
                (rs, rowNum) -> mapAreaRow(rs),
                areaKey
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    private AreaRow mapAreaRow(ResultSet rs) throws SQLException {
        AreaRow r = new AreaRow();
        r.areaKey = rs.getString("area_key");
        r.areaLevel = rs.getString("area_level");
        r.listingCount90d = rs.getInt("listing_count_90d");
        r.medianPricePaise = rs.getLong("median_price_paise");
        if (rs.wasNull()) r.medianPricePaise = null;
        r.priceP10Paise = rs.getLong("price_p10_paise");
        if (rs.wasNull()) r.priceP10Paise = null;
        r.priceP90Paise = rs.getLong("price_p90_paise");
        if (rs.wasNull()) r.priceP90Paise = null;
        r.propertyTypeDist = parseJsonbMap(rs.getString("property_type_dist"));
        r.trendDirection = rs.getString("trend_direction");
        BigDecimal tpc = rs.getBigDecimal("trend_pct_change");
        r.trendPctChange = tpc != null ? tpc.doubleValue() : null;
        r.confidenceTier = rs.getString("confidence_tier");
        r.nearbyAreaKeys = parseTextArray(rs.getArray("nearby_area_keys"));
        r.centroidLat = rs.getDouble("centroid_lat");
        if (rs.wasNull()) r.centroidLat = null;
        r.centroidLon = rs.getDouble("centroid_lon");
        if (rs.wasNull()) r.centroidLon = null;
        r.districtAreaKey = rs.getString("district_area_key");
        return r;
    }

    private AreaOverviewResponse.SnapshotData buildSnapshot(AreaRow row) {
        return new AreaOverviewResponse.SnapshotData(
                row.medianPricePaise,
                row.priceP10Paise,
                row.priceP90Paise,
                row.propertyTypeDist,
                row.trendDirection,
                row.trendPctChange
        );
    }

    private AreaOverviewResponse.ActivityData queryActivity(String areaKey) {
        String sql = """
                SELECT
                  COUNT(*) FILTER (WHERE status = 'LIVE') AS active_count,
                  COUNT(*) FILTER (WHERE status = 'LIVE'
                                   AND created_at >= NOW() - INTERVAL '30 days') AS new_30d
                FROM property_listings
                WHERE area_key = ?
                """;
        List<AreaOverviewResponse.ActivityData> result = jdbcOperations.query(
                sql,
                (rs, i) -> new AreaOverviewResponse.ActivityData(
                        rs.getInt("active_count"),
                        rs.getInt("new_30d")
                ),
                areaKey
        );
        // COUNT(*) always returns a row, so isEmpty() is a safety net only
        return result.isEmpty() ? new AreaOverviewResponse.ActivityData(0, 0) : result.get(0);
    }

    private List<AreaOverviewResponse.ComparisonEntry> queryComparison(List<String> nearbyAreaKeys) {
        if (nearbyAreaKeys == null || nearbyAreaKeys.isEmpty()) {
            return Collections.emptyList();
        }
        String sql = """
                SELECT area_key, listing_count_90d, median_price_paise, trend_direction
                FROM area_overview_stats
                WHERE area_key = ANY(:keys)
                """;
        return namedJdbcTemplate.query(
                sql,
                Map.of("keys", nearbyAreaKeys.toArray(String[]::new)),
                (rs, i) -> {
                    String key = rs.getString("area_key");
                    return new AreaOverviewResponse.ComparisonEntry(
                            key,
                            lastPipeSegment(key),
                            nullableLong(rs, "median_price_paise"),
                            rs.getInt("listing_count_90d"),
                            rs.getString("trend_direction"),
                            rs.getInt("listing_count_90d") < COMPARISON_APPROXIMATE_THRESHOLD
                    );
                }
        );
    }

    /** Reads a Long column, returning null when the value is SQL NULL. */
    private static Long nullableLong(ResultSet rs, String column) throws SQLException {
        long val = rs.getLong(column);
        return rs.wasNull() ? null : val;
    }

    private List<AreaOverviewResponse.SchoolEntry> querySchools(Double lat, Double lon) {
        if (lat == null || lon == null) {
            return Collections.emptyList();
        }
        List<SchoolResponse> nearby = schoolService.findNearby(lat, lon, SCHOOL_RADIUS_KM);
        return nearby.stream()
                .sorted(Comparator
                        .<SchoolResponse, Integer>comparing(
                                s -> "notable".equalsIgnoreCase(s.prominenceTier()) ? 0 : 1)
                        .thenComparing(s -> s.distanceKm() != null ? s.distanceKm() : Double.MAX_VALUE))
                .limit(SCHOOL_LIMIT)
                .map(s -> new AreaOverviewResponse.SchoolEntry(
                        s.id(),
                        s.name(),
                        s.distanceKm(),
                        s.board(),
                        s.prominenceTier()
                ))
                .toList();
    }

    // -------------------------------------------------------------------------
    // Label derivation
    // -------------------------------------------------------------------------

    /**
     * Returns the last pipe-separated segment of an area key.
     * For "IN|KA|Udupi|Manipal" → "Manipal".
     * For null or empty → empty string.
     */
    static String lastPipeSegment(String areaKey) {
        if (areaKey == null || areaKey.isEmpty()) {
            return "";
        }
        int lastPipe = areaKey.lastIndexOf('|');
        return lastPipe >= 0 ? areaKey.substring(lastPipe + 1) : areaKey;
    }

    /**
     * Derives the district key for a locality areaKey.
     * Uses the stored district_area_key column if present; falls back to
     * string slicing for locality rows (3 segments of a 4-segment key).
     */
    static String deriveDistrictKey(String areaKey, AreaRow row) {
        // Prefer stored district_area_key on locality rows
        if (row.districtAreaKey != null && !row.districtAreaKey.isEmpty()) {
            return row.districtAreaKey;
        }
        // Fallback: slice first 3 pipe segments from a 4-segment key
        if (areaKey == null) return null;
        String[] parts = areaKey.split("\\|", -1);
        if (parts.length < 3) return null;
        return parts[0] + "|" + parts[1] + "|" + parts[2];
    }

    // -------------------------------------------------------------------------
    // JSONB parsing — property_type_dist is stored as {"apartment":0.6,...}
    // The JDBC driver returns it as a raw JSON string.
    // -------------------------------------------------------------------------

    private Map<String, Double> parseJsonbMap(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Double>>() {});
        } catch (Exception e) {
            log.warn("Failed to parse property_type_dist JSONB: {}", json);
            return null;
        }
    }

    static List<String> parseTextArray(Array sqlArray) {
        if (sqlArray == null) {
            return Collections.emptyList();
        }
        try {
            Object[] arr = (Object[]) sqlArray.getArray();
            if (arr == null) return Collections.emptyList();
            List<String> result = new ArrayList<>(arr.length);
            for (Object o : arr) {
                if (o != null) result.add(o.toString());
            }
            return result;
        } catch (SQLException e) {
            log.warn("Failed to parse nearby_area_keys array", e);
            return Collections.emptyList();
        }
    }

    // -------------------------------------------------------------------------
    // Internal data holder — not exposed outside this class
    // -------------------------------------------------------------------------

    static class AreaRow {
        String areaKey;
        String areaLevel;
        Integer listingCount90d;
        Long medianPricePaise;
        Long priceP10Paise;
        Long priceP90Paise;
        Map<String, Double> propertyTypeDist;
        String trendDirection;
        Double trendPctChange;
        String confidenceTier;
        List<String> nearbyAreaKeys;
        Double centroidLat;
        Double centroidLon;
        String districtAreaKey;
    }
}
