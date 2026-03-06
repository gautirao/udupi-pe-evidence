package com.example.realestate.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Scheduled job that computes area-level comparison metrics from listings.
 * <p>
 * Rollup rules:
 * - Uses a rolling 12-week window for "latest" stats
 * - Excludes duplicates (is_duplicate = true)
 * - Excludes listings with null area_key or null price_per_cent_paise
 * - Computes listing_count and median_price_per_cent_paise per area
 * - Derives city_key from area_key if format is country|region|city|locality
 * - Computes city_median and price_index when city derivation succeeds
 * <p>
 * The job is idempotent: running it multiple times updates existing rows via UPSERT.
 */
@Component
public class AreaStatsLatestRollupJob {

    private static final Logger log = LoggerFactory.getLogger(AreaStatsLatestRollupJob.class);

    /**
     * Rolling window in weeks for computing "latest" stats.
     */
    private static final int ROLLING_WINDOW_WEEKS = 12;

    private final JdbcOperations jdbcOperations;

    public AreaStatsLatestRollupJob(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Runs every hour by default. Computes area stats from the last 12 weeks of listings.
     */
    @Scheduled(fixedDelayString = "${app.analytics.stats-rollup-interval-ms:3600000}")
    public void computeAreaStats() {
        log.info("Starting area stats latest rollup computation");

        LocalDate cutoffDate = LocalDate.now().minusWeeks(ROLLING_WINDOW_WEEKS);
        int rowsUpserted = computeStatsFromDate(cutoffDate);

        log.info("Area stats latest rollup complete rowsUpserted={}", rowsUpserted);
    }

    /**
     * Computes area stats for listings created on or after the given date.
     * Produces two row types per area_key:
     *   - one 'all' aggregate row with city_median and price_index (full CTE logic)
     *   - one row per distinct property_type (listing_count + median only; no city context)
     * Exposed for testing.
     *
     * @param fromDate the earliest created_at date to include
     * @return total number of rows upserted across both queries
     */
    @Transactional
    public int computeStatsFromDate(LocalDate fromDate) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        OffsetDateTime fromDateOdt = fromDate.atStartOfDay().atOffset(ZoneOffset.UTC);

        // 1. Grand aggregate: property_type='all', bedrooms=0
        String allSql = """
            WITH filtered_listings AS (
                SELECT area_key, price_per_cent_paise
                FROM public.property_listings
                WHERE area_key IS NOT NULL
                  AND price_per_cent_paise IS NOT NULL
                  AND is_duplicate = false
                  AND created_at >= ?
            ),
            area_stats AS (
                SELECT area_key, COUNT(*) AS listing_count,
                    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT
                        AS median_price_per_cent_paise
                FROM filtered_listings GROUP BY area_key
            ),
            city_keys AS (
                SELECT area_key,
                    CASE WHEN array_length(string_to_array(area_key, '|'), 1) = 4
                         THEN (string_to_array(area_key, '|'))[1] || '|' ||
                              (string_to_array(area_key, '|'))[2] || '|' ||
                              (string_to_array(area_key, '|'))[3]
                         ELSE NULL END AS city_key
                FROM area_stats
            ),
            city_medians AS (
                SELECT ck.city_key,
                    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fl.price_per_cent_paise))::BIGINT
                        AS city_median_price_per_cent_paise
                FROM filtered_listings fl
                JOIN city_keys ck ON fl.area_key = ck.area_key
                WHERE ck.city_key IS NOT NULL
                GROUP BY ck.city_key
            )
            INSERT INTO public.area_stats_latest (
                area_key, property_type, bedrooms, listing_count,
                median_price_per_cent_paise, city_median_price_per_cent_paise,
                price_index, created_at, updated_at
            )
            SELECT a.area_key, 'all' AS property_type, 0 AS bedrooms,
                a.listing_count, a.median_price_per_cent_paise,
                cm.city_median_price_per_cent_paise,
                CASE WHEN cm.city_median_price_per_cent_paise IS NOT NULL
                          AND cm.city_median_price_per_cent_paise > 0
                     THEN ROUND(a.median_price_per_cent_paise::NUMERIC / cm.city_median_price_per_cent_paise, 4)
                     ELSE NULL END AS price_index,
                ? AS created_at, ? AS updated_at
            FROM area_stats a
            LEFT JOIN city_keys ck ON a.area_key = ck.area_key
            LEFT JOIN city_medians cm ON ck.city_key = cm.city_key
            ON CONFLICT (area_key, property_type, bedrooms)
            DO UPDATE SET
                listing_count = EXCLUDED.listing_count,
                median_price_per_cent_paise = EXCLUDED.median_price_per_cent_paise,
                city_median_price_per_cent_paise = EXCLUDED.city_median_price_per_cent_paise,
                price_index = EXCLUDED.price_index,
                updated_at = EXCLUDED.updated_at
            """;

        // 2. Per-type aggregate: property_type=<type>, bedrooms=0
        String perTypeSql = """
            WITH filtered_listings AS (
                SELECT area_key, property_type, price_per_cent_paise
                FROM public.property_listings
                WHERE area_key IS NOT NULL
                  AND property_type IS NOT NULL
                  AND price_per_cent_paise IS NOT NULL
                  AND is_duplicate = false
                  AND created_at >= ?
            )
            INSERT INTO public.area_stats_latest (
                area_key, property_type, bedrooms, listing_count,
                median_price_per_cent_paise, city_median_price_per_cent_paise,
                price_index, created_at, updated_at
            )
            SELECT area_key, property_type, 0 AS bedrooms, COUNT(*) AS listing_count,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT,
                NULL, NULL, ? AS created_at, ? AS updated_at
            FROM filtered_listings
            GROUP BY area_key, property_type
            ON CONFLICT (area_key, property_type, bedrooms)
            DO UPDATE SET
                listing_count = EXCLUDED.listing_count,
                median_price_per_cent_paise = EXCLUDED.median_price_per_cent_paise,
                city_median_price_per_cent_paise = EXCLUDED.city_median_price_per_cent_paise,
                price_index = EXCLUDED.price_index,
                updated_at = EXCLUDED.updated_at
            """;

        // 3. Per-bedrooms aggregate: property_type='all', bedrooms=<n> (n > 0)
        String perBedroomsSql = """
            WITH filtered_listings AS (
                SELECT area_key, bedrooms, price_per_cent_paise
                FROM public.property_listings
                WHERE area_key IS NOT NULL
                  AND price_per_cent_paise IS NOT NULL
                  AND is_duplicate = false
                  AND bedrooms IS NOT NULL AND bedrooms > 0
                  AND created_at >= ?
            )
            INSERT INTO public.area_stats_latest (
                area_key, property_type, bedrooms, listing_count,
                median_price_per_cent_paise, city_median_price_per_cent_paise,
                price_index, created_at, updated_at
            )
            SELECT area_key, 'all' AS property_type, bedrooms, COUNT(*) AS listing_count,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT,
                NULL, NULL, ? AS created_at, ? AS updated_at
            FROM filtered_listings
            GROUP BY area_key, bedrooms
            ON CONFLICT (area_key, property_type, bedrooms)
            DO UPDATE SET
                listing_count = EXCLUDED.listing_count,
                median_price_per_cent_paise = EXCLUDED.median_price_per_cent_paise,
                city_median_price_per_cent_paise = EXCLUDED.city_median_price_per_cent_paise,
                price_index = EXCLUDED.price_index,
                updated_at = EXCLUDED.updated_at
            """;

        // 4. Per-type-per-bedrooms: property_type=<type>, bedrooms=<n> (n > 0)
        String perTypePerBedroomsSql = """
            WITH filtered_listings AS (
                SELECT area_key, property_type, bedrooms, price_per_cent_paise
                FROM public.property_listings
                WHERE area_key IS NOT NULL
                  AND property_type IS NOT NULL
                  AND price_per_cent_paise IS NOT NULL
                  AND is_duplicate = false
                  AND bedrooms IS NOT NULL AND bedrooms > 0
                  AND created_at >= ?
            )
            INSERT INTO public.area_stats_latest (
                area_key, property_type, bedrooms, listing_count,
                median_price_per_cent_paise, city_median_price_per_cent_paise,
                price_index, created_at, updated_at
            )
            SELECT area_key, property_type, bedrooms, COUNT(*) AS listing_count,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT,
                NULL, NULL, ? AS created_at, ? AS updated_at
            FROM filtered_listings
            GROUP BY area_key, property_type, bedrooms
            ON CONFLICT (area_key, property_type, bedrooms)
            DO UPDATE SET
                listing_count = EXCLUDED.listing_count,
                median_price_per_cent_paise = EXCLUDED.median_price_per_cent_paise,
                city_median_price_per_cent_paise = EXCLUDED.city_median_price_per_cent_paise,
                price_index = EXCLUDED.price_index,
                updated_at = EXCLUDED.updated_at
            """;

        int r1 = jdbcOperations.update(allSql, fromDateOdt, now, now);
        int r2 = jdbcOperations.update(perTypeSql, fromDateOdt, now, now);
        int r3 = jdbcOperations.update(perBedroomsSql, fromDateOdt, now, now);
        int r4 = jdbcOperations.update(perTypePerBedroomsSql, fromDateOdt, now, now);
        return r1 + r2 + r3 + r4;
    }
}
