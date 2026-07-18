package com.example.realestate.area;

import com.example.realestate.discover.CityActivationGuard;
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

    static final int TRENDING_DEFAULT_LIMIT = 6;
    static final int TRENDING_MAX_LIMIT = 12;

    private final JdbcOperations jdbcOperations;
    private final NamedParameterJdbcTemplate namedJdbcTemplate;
    private final SchoolService schoolService;
    private final ObjectMapper objectMapper;
    private final CityActivationGuard cityActivationGuard;

    public AreaOverviewService(JdbcOperations jdbcOperations,
                               NamedParameterJdbcTemplate namedJdbcTemplate,
                               SchoolService schoolService,
                               ObjectMapper objectMapper,
                               CityActivationGuard cityActivationGuard) {
        this.jdbcOperations = jdbcOperations;
        this.namedJdbcTemplate = namedJdbcTemplate;
        this.schoolService = schoolService;
        this.objectMapper = objectMapper;
        this.cityActivationGuard = cityActivationGuard;
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
        // #1935: area_overview_stats has no FK/join to cities — gate via CityActivationGuard
        // BEFORE reading the denormalized snapshot so an inactive city's area throws the SAME
        // AreaNotFoundException (404) an unknown areaKey throws, never leaking that the city
        // once existed.
        if (!cityActivationGuard.isActiveForAreaKey(areaKey)) {
            log.debug("assembleResponse: areaKey={} — inactive or unknown city", areaKey);
            throw new AreaNotFoundException(areaKey);
        }

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
    // Trending areas
    // -------------------------------------------------------------------------

    /**
     * Returns the top areas by 30-day listing activity.
     *
     * <p>The {@code limit} parameter is silently clamped to [1, {@value #TRENDING_MAX_LIMIT}].
     * Rows with {@code listing_count_90d = 0} or NULL are excluded.
     * An empty table returns {@code {areas: []}} — never 404.
     *
     * @param limit requested result count (default {@value #TRENDING_DEFAULT_LIMIT})
     * @return response containing at most {@code clampedLimit} areas sorted desc by listing count
     */
    @Transactional(readOnly = true)
    public TrendingAreasResponse getTrending(int limit) {
        int clampedLimit = Math.max(1, Math.min(TRENDING_MAX_LIMIT, limit));
        log.debug("getTrending: limit={} (clamped={})", limit, clampedLimit);

        // #1935: area_overview_stats has no direct is_active gate — INNER JOIN through
        // areas -> cities so an inactive city's high-ranking area cannot leak into the
        // global trending feed (was previously reading area_overview_stats directly with
        // no city join at all). Column names/aliases are unchanged so the row mapper below
        // (and therefore the response DTO) is untouched.
        List<TrendingAreasResponse.TrendingAreaDto> areas = jdbcOperations.query(
                """
                SELECT aos.area_key, aos.listing_count_90d, aos.median_price_paise,
                       aos.district_area_key
                FROM area_overview_stats aos
                JOIN areas a ON a.area_key = aos.area_key
                JOIN cities c ON c.id = a.city_id
                WHERE c.is_active = true
                  AND aos.listing_count_90d IS NOT NULL
                  AND aos.listing_count_90d > 0
                ORDER BY aos.listing_count_90d DESC
                LIMIT ?
                """,
                (rs, rowNum) -> {
                    String areaKey       = rs.getString("area_key");
                    String areaLabel     = lastPipeSegment(areaKey);

                    // district_area_key is stored on locality rows; fall back to
                    // slicing the first 3 pipe segments when the column is NULL.
                    String storedDistrict = rs.getString("district_area_key");
                    String effectiveDistrict;
                    if (storedDistrict != null && !storedDistrict.isEmpty()) {
                        effectiveDistrict = storedDistrict;
                    } else if (areaKey != null) {
                        String[] parts = areaKey.split("\\|", -1);
                        effectiveDistrict = parts.length >= 3
                                ? parts[0] + "|" + parts[1] + "|" + parts[2]
                                : null;
                    } else {
                        effectiveDistrict = null;
                    }
                    // Guard: propagate null instead of emitting "" for missing district
                    String districtLabel = effectiveDistrict != null ? lastPipeSegment(effectiveDistrict) : null;

                    long medianRaw = rs.getLong("median_price_paise");
                    Long medianPricePaise = rs.wasNull() ? null : medianRaw;

                    return new TrendingAreasResponse.TrendingAreaDto(
                            areaKey,
                            areaLabel,
                            districtLabel,
                            medianPricePaise,
                            rs.getInt("listing_count_90d")
                    );
                },
                clampedLimit
        );

        log.info("getTrending: returned {} areas (requestedLimit={}, clampedLimit={})",
                areas.size(), limit, clampedLimit);
        return new TrendingAreasResponse(areas);
    }

    // -------------------------------------------------------------------------
    // Trends endpoints (public, city-scoped)
    // -------------------------------------------------------------------------

    static final int OPTIONS_DEFAULT_LIMIT = 3;
    static final int OPTIONS_MAX_LIMIT = 50;

    /**
     * Returns the top trending locality areas for the given city.
     *
     * <p>City matching is case-insensitive on the district segment of the areaKey
     * (e.g. city="udupi" matches keys starting with "IN|KA|Udupi|").
     *
     * @param city  lowercase city slug (e.g. "udupi", "mangalore")
     * @param limit maximum number of areas to return (silently clamped to [1, OPTIONS_MAX_LIMIT])
     */
    @Transactional(readOnly = true)
    public TrendsOptionsResponse getOptions(String city, int limit) {
        int clampedLimit = Math.max(1, Math.min(OPTIONS_MAX_LIMIT, limit));
        log.debug("getOptions: city={}, limit={} (clamped={})", city, limit, clampedLimit);

        // #1935: area_overview_stats has no FK/join to cities — gate via CityActivationGuard
        // BEFORE reading the denormalized snapshot so an inactive city yields the SAME empty
        // options response an unknown city yields.
        if (!cityActivationGuard.isActiveCitySlug(city)) {
            log.debug("getOptions: city={} — inactive or unknown city", city);
            return new TrendsOptionsResponse(city, List.of());
        }

        List<TrendsOptionsResponse.TrendsOptionDto> areas = jdbcOperations.query(
                """
                SELECT area_key
                FROM area_overview_stats
                WHERE listing_count_90d IS NOT NULL
                  AND listing_count_90d > 0
                  AND area_level = 'locality'
                  AND LOWER(split_part(area_key, '|', 3)) = LOWER(?)
                ORDER BY listing_count_90d DESC
                LIMIT ?
                """,
                (rs, rowNum) -> {
                    String areaKey = rs.getString("area_key");
                    return new TrendsOptionsResponse.TrendsOptionDto(areaKey, lastPipeSegment(areaKey));
                },
                city,
                clampedLimit
        );

        log.info("getOptions: city={}, returned {} areas", city, areas.size());
        return new TrendsOptionsResponse(city, areas);
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
