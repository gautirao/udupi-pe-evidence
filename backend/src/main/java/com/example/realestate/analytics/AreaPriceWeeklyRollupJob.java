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
 * - Excludes listings with null area_key
 * - Stores listing_count; price fields left null until unit-price derivation is implemented
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

        // 'all' aggregate row — covers all listings regardless of property_type
        String allSql = """
            INSERT INTO public.area_price_weekly (
                area_key,
                week_start_date,
                property_type,
                listing_count,
                median_price_per_cent_paise,
                p25_price_per_cent_paise,
                p75_price_per_cent_paise,
                created_at,
                updated_at
            )
            SELECT
                area_key,
                DATE_TRUNC('week', created_at)::date AS week_start_date,
                'all' AS property_type,
                COUNT(*) AS listing_count,
                NULL AS median_price_per_cent_paise,
                NULL AS p25_price_per_cent_paise,
                NULL AS p75_price_per_cent_paise,
                ? AS created_at,
                ? AS updated_at
            FROM public.property_listings
            WHERE area_key IS NOT NULL
              AND is_duplicate = false
              AND DATE_TRUNC('week', created_at)::date >= ?
            GROUP BY area_key, DATE_TRUNC('week', created_at)::date
            ON CONFLICT (area_key, week_start_date, property_type)
            DO UPDATE SET
                listing_count = EXCLUDED.listing_count,
                updated_at = EXCLUDED.updated_at
            """;

        // Per-type rows — one row per (area_key, week_start_date, property_type)
        String perTypeSql = """
            INSERT INTO public.area_price_weekly (
                area_key,
                week_start_date,
                property_type,
                listing_count,
                median_price_per_cent_paise,
                p25_price_per_cent_paise,
                p75_price_per_cent_paise,
                created_at,
                updated_at
            )
            SELECT
                area_key,
                DATE_TRUNC('week', created_at)::date AS week_start_date,
                property_type,
                COUNT(*) AS listing_count,
                NULL AS median_price_per_cent_paise,
                NULL AS p25_price_per_cent_paise,
                NULL AS p75_price_per_cent_paise,
                ? AS created_at,
                ? AS updated_at
            FROM public.property_listings
            WHERE area_key IS NOT NULL
              AND is_duplicate = false
              AND property_type IS NOT NULL
              AND DATE_TRUNC('week', created_at)::date >= ?
            GROUP BY area_key, DATE_TRUNC('week', created_at)::date, property_type
            ON CONFLICT (area_key, week_start_date, property_type)
            DO UPDATE SET
                listing_count = EXCLUDED.listing_count,
                updated_at = EXCLUDED.updated_at
            """;

        int allRows = jdbcOperations.update(allSql, now, now, fromDate);
        int perTypeRows = jdbcOperations.update(perTypeSql, now, now, fromDate);
        return allRows + perTypeRows;
    }
}
