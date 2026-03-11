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
 * Scheduled job that computes weekly area-level rollups from listings.
 * <p>
 * Rollup rules:
 * - Groups by (area_key, week_start_date) where week_start_date = DATE_TRUNC('week', created_at)
 * - Excludes duplicates (is_duplicate = true)
 * - Excludes listings with null area_key or null price_per_cent_paise
 * - Filters to status IN ('SCRAPED', 'LIVE') — excludes DRAFT, PENDING_REVIEW, REJECTED
 * - Computes median, P25, P75 price_per_cent_paise using PERCENTILE_CONT
 * <p>
 * The job is idempotent: running it multiple times updates existing rows via UPSERT.
 */
@Component
public class AreaPriceWeeklyRollupJob {

    private static final Logger log = LoggerFactory.getLogger(AreaPriceWeeklyRollupJob.class);

    /**
     * Rolling window in weeks for recomputation.
     */
    private static final int ROLLING_WINDOW_WEEKS = 12;

    private final JdbcOperations jdbcOperations;

    public AreaPriceWeeklyRollupJob(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Runs every hour by default. Computes rollups for the last 12 weeks.
     */
    @Scheduled(fixedDelayString = "${app.analytics.rollup-interval-ms:3600000}")
    public void computeWeeklyRollups() {
        log.info("Starting weekly area price rollup computation");

        LocalDate cutoffDate = LocalDate.now().minusWeeks(ROLLING_WINDOW_WEEKS);
        int rowsUpserted = computeRollupsFromDate(cutoffDate);

        log.info("Weekly area price rollup complete rowsUpserted={}", rowsUpserted);
    }

    /**
     * Computes rollups for all weeks starting from the given date.
     * Produces two row types per (area_key, week_start_date):
     *   - one row per distinct property_type present in listings
     *   - one aggregate 'all' row covering all property types
     * Exposed for testing.
     *
     * @param fromDate the earliest week_start_date to include
     * @return total number of rows upserted across both queries
     */
    @Transactional
    public int computeRollupsFromDate(LocalDate fromDate) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        // 1. Grand aggregate: property_type='all', bedrooms=0
        String allSql = """
            INSERT INTO public.area_price_weekly (
                area_key, week_start_date, property_type, bedrooms,
                listing_count, median_price_per_cent_paise,
                p25_price_per_cent_paise, p75_price_per_cent_paise,
                created_at, updated_at
            )
            SELECT
                area_key,
                DATE_TRUNC('week', created_at)::date AS week_start_date,
                'all' AS property_type,
                0 AS bedrooms,
                COUNT(*) AS listing_count,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS median_price_per_cent_paise,
                ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS p25_price_per_cent_paise,
                ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS p75_price_per_cent_paise,
                ? AS created_at, ? AS updated_at
            FROM public.property_listings
            WHERE area_key IS NOT NULL
              AND price_per_cent_paise IS NOT NULL
              AND is_duplicate = false
              AND status IN ('SCRAPED', 'LIVE')
              AND DATE_TRUNC('week', created_at)::date >= ?
            GROUP BY area_key, DATE_TRUNC('week', created_at)::date
            ON CONFLICT (area_key, week_start_date, property_type, bedrooms)
            DO UPDATE SET
                listing_count = EXCLUDED.listing_count,
                median_price_per_cent_paise = EXCLUDED.median_price_per_cent_paise,
                p25_price_per_cent_paise = EXCLUDED.p25_price_per_cent_paise,
                p75_price_per_cent_paise = EXCLUDED.p75_price_per_cent_paise,
                updated_at = EXCLUDED.updated_at
            """;

        // 2. Per-type aggregate: property_type=<type>, bedrooms=0
        String perTypeSql = """
            INSERT INTO public.area_price_weekly (
                area_key, week_start_date, property_type, bedrooms,
                listing_count, median_price_per_cent_paise,
                p25_price_per_cent_paise, p75_price_per_cent_paise,
                created_at, updated_at
            )
            SELECT
                area_key,
                DATE_TRUNC('week', created_at)::date AS week_start_date,
                property_type,
                0 AS bedrooms,
                COUNT(*) AS listing_count,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS median_price_per_cent_paise,
                ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS p25_price_per_cent_paise,
                ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS p75_price_per_cent_paise,
                ? AS created_at, ? AS updated_at
            FROM public.property_listings
            WHERE area_key IS NOT NULL
              AND price_per_cent_paise IS NOT NULL
              AND is_duplicate = false
              AND property_type IS NOT NULL
              AND status IN ('SCRAPED', 'LIVE')
              AND DATE_TRUNC('week', created_at)::date >= ?
            GROUP BY area_key, DATE_TRUNC('week', created_at)::date, property_type
            ON CONFLICT (area_key, week_start_date, property_type, bedrooms)
            DO UPDATE SET
                listing_count = EXCLUDED.listing_count,
                median_price_per_cent_paise = EXCLUDED.median_price_per_cent_paise,
                p25_price_per_cent_paise = EXCLUDED.p25_price_per_cent_paise,
                p75_price_per_cent_paise = EXCLUDED.p75_price_per_cent_paise,
                updated_at = EXCLUDED.updated_at
            """;

        // 3. Per-bedrooms aggregate: property_type='all', bedrooms=<n> (n > 0)
        String perBedroomsSql = """
            INSERT INTO public.area_price_weekly (
                area_key, week_start_date, property_type, bedrooms,
                listing_count, median_price_per_cent_paise,
                p25_price_per_cent_paise, p75_price_per_cent_paise,
                created_at, updated_at
            )
            SELECT
                area_key,
                DATE_TRUNC('week', created_at)::date AS week_start_date,
                'all' AS property_type,
                bedrooms,
                COUNT(*) AS listing_count,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS median_price_per_cent_paise,
                ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS p25_price_per_cent_paise,
                ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS p75_price_per_cent_paise,
                ? AS created_at, ? AS updated_at
            FROM public.property_listings
            WHERE area_key IS NOT NULL
              AND price_per_cent_paise IS NOT NULL
              AND is_duplicate = false
              AND bedrooms IS NOT NULL AND bedrooms > 0
              AND status IN ('SCRAPED', 'LIVE')
              AND DATE_TRUNC('week', created_at)::date >= ?
            GROUP BY area_key, DATE_TRUNC('week', created_at)::date, bedrooms
            ON CONFLICT (area_key, week_start_date, property_type, bedrooms)
            DO UPDATE SET
                listing_count = EXCLUDED.listing_count,
                median_price_per_cent_paise = EXCLUDED.median_price_per_cent_paise,
                p25_price_per_cent_paise = EXCLUDED.p25_price_per_cent_paise,
                p75_price_per_cent_paise = EXCLUDED.p75_price_per_cent_paise,
                updated_at = EXCLUDED.updated_at
            """;

        // 4. Per-type-per-bedrooms: property_type=<type>, bedrooms=<n> (n > 0)
        String perTypePerBedroomsSql = """
            INSERT INTO public.area_price_weekly (
                area_key, week_start_date, property_type, bedrooms,
                listing_count, median_price_per_cent_paise,
                p25_price_per_cent_paise, p75_price_per_cent_paise,
                created_at, updated_at
            )
            SELECT
                area_key,
                DATE_TRUNC('week', created_at)::date AS week_start_date,
                property_type,
                bedrooms,
                COUNT(*) AS listing_count,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS median_price_per_cent_paise,
                ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS p25_price_per_cent_paise,
                ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_per_cent_paise))::BIGINT AS p75_price_per_cent_paise,
                ? AS created_at, ? AS updated_at
            FROM public.property_listings
            WHERE area_key IS NOT NULL
              AND price_per_cent_paise IS NOT NULL
              AND is_duplicate = false
              AND property_type IS NOT NULL
              AND bedrooms IS NOT NULL AND bedrooms > 0
              AND status IN ('SCRAPED', 'LIVE')
              AND DATE_TRUNC('week', created_at)::date >= ?
            GROUP BY area_key, DATE_TRUNC('week', created_at)::date, property_type, bedrooms
            ON CONFLICT (area_key, week_start_date, property_type, bedrooms)
            DO UPDATE SET
                listing_count = EXCLUDED.listing_count,
                median_price_per_cent_paise = EXCLUDED.median_price_per_cent_paise,
                p25_price_per_cent_paise = EXCLUDED.p25_price_per_cent_paise,
                p75_price_per_cent_paise = EXCLUDED.p75_price_per_cent_paise,
                updated_at = EXCLUDED.updated_at
            """;

        int r1 = jdbcOperations.update(allSql, now, now, fromDate);
        int r2 = jdbcOperations.update(perTypeSql, now, now, fromDate);
        int r3 = jdbcOperations.update(perBedroomsSql, now, now, fromDate);
        int r4 = jdbcOperations.update(perTypePerBedroomsSql, now, now, fromDate);
        return r1 + r2 + r3 + r4;
    }
}
