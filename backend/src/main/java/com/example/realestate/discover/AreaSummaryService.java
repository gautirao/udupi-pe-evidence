package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AreaSummaryService {

    private static final Logger log = LoggerFactory.getLogger(AreaSummaryService.class);

    private final JdbcOperations jdbcOperations;

    public AreaSummaryService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    public AreaSummaryResponse getAreasByCity(String city) {
        log.debug("getAreasByCity city={}", city);

        List<AreaSummary> areas = jdbcOperations.query(AREAS_BY_CITY_SQL,
                (rs, rowNum) -> new AreaSummary(
                        rs.getString("area_key"),
                        rs.getString("name"),
                        rs.getDouble("geo_center_lat"),
                        rs.getDouble("geo_center_lon"),
                        nullableDouble(rs.getObject("min_lat")),
                        nullableDouble(rs.getObject("min_lon")),
                        nullableDouble(rs.getObject("max_lat")),
                        nullableDouble(rs.getObject("max_lon")),
                        rs.getLong("listing_count"),
                        nullableLong(rs.getObject("median_price_paise")),
                        rs.getString("trend_direction"),
                        rs.getString("confidence_tier"),
                        rs.getLong("school_count")
                ),
                city);

        log.debug("getAreasByCity city={} returned {} areas", city, areas.size());
        return new AreaSummaryResponse(city, areas);
    }

    private static Double nullableDouble(Object val) {
        return val == null ? null : ((Number) val).doubleValue();
    }

    private static Long nullableLong(Object val) {
        return val == null ? null : ((Number) val).longValue();
    }

    private static final String AREAS_BY_CITY_SQL = """
            SELECT
                a.area_key,
                a.name,
                a.geo_center_lat,
                a.geo_center_lon,
                a.min_lat,
                a.min_lon,
                a.max_lat,
                a.max_lon,
                COALESCE(pl.listing_count, 0)        AS listing_count,
                aos.median_price_paise,
                aos.trend_direction,
                aos.confidence_tier,
                (SELECT COUNT(*) FROM schools s WHERE s.area_key = a.area_key)
                                                     AS school_count
            FROM areas a
            JOIN cities c ON c.id = a.city_id
            LEFT JOIN area_overview_stats aos
                ON  aos.area_key   = a.area_key
                AND aos.area_level = 'locality'
            LEFT JOIN (
                SELECT area_key, COUNT(*) AS listing_count
                FROM property_listings
                WHERE status = 'LIVE'
                  AND archived_at IS NULL
                  AND is_duplicate = false
                GROUP BY area_key
            ) pl ON pl.area_key = a.area_key
            WHERE c.slug = ?
              AND array_length(string_to_array(a.area_key, '|'), 1) = 4
            ORDER BY COALESCE(pl.listing_count, 0) DESC, a.name
            """;
}
