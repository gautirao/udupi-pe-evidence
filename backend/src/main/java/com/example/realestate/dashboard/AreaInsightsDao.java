package com.example.realestate.dashboard;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

public interface AreaInsightsDao {

    Set<String> VALID_SORTS = Set.of("median_desc", "median_asc", "activity_desc");

    record AreaInsightRow(
            String areaKey,
            int listingCount,
            Long medianPricePerCentPaise,
            Long cityMedianPricePerCentPaise,
            BigDecimal priceIndex,
            OffsetDateTime updatedAt
    ) {}

    static boolean isValidSort(String sort) {
        return VALID_SORTS.contains(sort);
    }

    List<AreaInsightRow> findInsights(String sort, int limit, int minCount);
}

@Repository
class JdbcAreaInsightsDao implements AreaInsightsDao {

    private final JdbcOperations jdbc;

    JdbcAreaInsightsDao(JdbcOperations jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<AreaInsightRow> findInsights(String sort, int limit, int minCount) {
        String orderBy = switch (sort) {
            case "median_desc" -> "median_price_per_cent_paise DESC NULLS LAST";
            case "median_asc" -> "median_price_per_cent_paise ASC NULLS LAST";
            case "activity_desc" -> "listing_count DESC";
            default -> throw new IllegalArgumentException("Unknown sort: " + sort);
        };

        String sql = """
                SELECT area_key, listing_count, median_price_per_cent_paise,
                       city_median_price_per_cent_paise, price_index, updated_at
                FROM area_stats_latest
                WHERE listing_count >= ?
                ORDER BY %s
                LIMIT ?
                """.formatted(orderBy);

        return jdbc.query(sql, (rs, rowNum) -> new AreaInsightRow(
                rs.getString("area_key"),
                rs.getInt("listing_count"),
                rs.getObject("median_price_per_cent_paise", Long.class),
                rs.getObject("city_median_price_per_cent_paise", Long.class),
                rs.getBigDecimal("price_index"),
                rs.getObject("updated_at", OffsetDateTime.class)
        ), minCount, limit);
    }
}
