-- =============================================================================
-- Reference copy only. Run in Supabase SQL editor. NOT a Flyway migration.
-- Safe to re-run: all operations are idempotent (CREATE OR REPLACE + ON CONFLICT DO UPDATE).
-- =============================================================================
-- Functions created:
--   refresh_area_price_weekly(p_lookback_weeks INT) → VOID
--   refresh_area_stats_latest()                     → VOID
-- pg_cron schedules:
--   weekly-area-price-refresh  — Mondays 02:00 UTC
--   weekly-area-stats-refresh  — Mondays 02:00 UTC
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 0 — Verify pg_cron is available (must be enabled in Supabase Dashboard →
--   Database → Extensions → pg_cron). Only required once.
-- -----------------------------------------------------------------------------
-- SELECT * FROM pg_extension WHERE extname = 'pg_cron';


-- -----------------------------------------------------------------------------
-- STEP 1 — refresh_area_price_weekly
--
-- Aggregates land listing prices into weekly buckets per area.
-- Groups by COALESCE(area_key, locality) to capture all listings regardless of
-- geocoding status.  p_lookback_weeks controls how many weeks back to refresh
-- (default 52).  Pass a large value (e.g. 260) for a full historical backfill.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_area_price_weekly(
  p_lookback_weeks INT DEFAULT 52
)
RETURNS VOID
LANGUAGE SQL
AS $$
  INSERT INTO area_price_weekly (
    area_key,
    week_start_date,
    listing_count,
    median_price_per_cent_paise,
    p25_price_per_cent_paise,
    p75_price_per_cent_paise,
    updated_at
  )
  SELECT
    COALESCE(area_key, locality)                                             AS area_key,
    DATE_TRUNC('week', created_at)::DATE                                     AS week_start_date,
    COUNT(*)::INTEGER                                                        AS listing_count,
    PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY price_per_cent_paise)::BIGINT AS median_price_per_cent_paise,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_per_cent_paise)::BIGINT AS p25_price_per_cent_paise,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_per_cent_paise)::BIGINT AS p75_price_per_cent_paise,
    NOW()
  FROM property_listings
  WHERE is_valid = true
    AND price_per_cent_paise IS NOT NULL
    AND COALESCE(area_key, locality) IS NOT NULL
    AND created_at >= NOW() - (p_lookback_weeks || ' weeks')::INTERVAL
  GROUP BY
    COALESCE(area_key, locality),
    DATE_TRUNC('week', created_at)::DATE
  ON CONFLICT (area_key, week_start_date)
  DO UPDATE SET
    listing_count               = EXCLUDED.listing_count,
    median_price_per_cent_paise = EXCLUDED.median_price_per_cent_paise,
    p25_price_per_cent_paise    = EXCLUDED.p25_price_per_cent_paise,
    p75_price_per_cent_paise    = EXCLUDED.p75_price_per_cent_paise,
    updated_at                  = NOW();
$$;


-- -----------------------------------------------------------------------------
-- STEP 2 — refresh_area_stats_latest
--
-- Upserts per-area summary stats (rolling 90 days) into area_stats_latest.
-- Powers /api/insights/avg-price-by-area (bar chart).
-- City-wide median is computed across all valid land listings in the window.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_area_stats_latest()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_city_median BIGINT;
BEGIN
  -- City-wide median across all areas (land listings, rolling 90 days)
  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise)::BIGINT
  INTO   v_city_median
  FROM   property_listings
  WHERE  is_valid = true
    AND  price_per_cent_paise IS NOT NULL
    AND  created_at >= NOW() - INTERVAL '90 days';

  -- Per-area upsert
  INSERT INTO area_stats_latest (
    area_key,
    listing_count,
    median_price_per_cent_paise,
    city_median_price_per_cent_paise,
    price_index,
    updated_at
  )
  SELECT
    COALESCE(area_key, locality)                                              AS area_key,
    COUNT(*)::INTEGER                                                         AS listing_count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise)::BIGINT AS median_price_per_cent_paise,
    v_city_median                                                             AS city_median_price_per_cent_paise,
    CASE
      WHEN v_city_median IS NOT NULL AND v_city_median > 0 THEN
        ROUND(
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise)::NUMERIC
          / v_city_median,
          4
        )
      ELSE NULL
    END                                                                       AS price_index,
    NOW()
  FROM property_listings
  WHERE  is_valid = true
    AND  price_per_cent_paise IS NOT NULL
    AND  COALESCE(area_key, locality) IS NOT NULL
    AND  created_at >= NOW() - INTERVAL '90 days'
  GROUP BY COALESCE(area_key, locality)
  ON CONFLICT (area_key)
  DO UPDATE SET
    listing_count                    = EXCLUDED.listing_count,
    median_price_per_cent_paise      = EXCLUDED.median_price_per_cent_paise,
    city_median_price_per_cent_paise = EXCLUDED.city_median_price_per_cent_paise,
    price_index                      = EXCLUDED.price_index,
    updated_at                       = NOW();
END;
$$;


-- =============================================================================
-- STEP 3 — BACKFILL (run once after creating the functions)
-- Populates all historical data since the first listing.
-- p_lookback_weeks = 260 covers ~5 years.
-- =============================================================================

-- SELECT refresh_area_price_weekly(260);
-- SELECT refresh_area_stats_latest();

-- Verify:
-- SELECT COUNT(*), MIN(week_start_date), MAX(week_start_date) FROM area_price_weekly;
-- SELECT COUNT(*), MIN(updated_at) FROM area_stats_latest;


-- =============================================================================
-- STEP 4 — SCHEDULE with pg_cron (run after backfill is confirmed)
-- =============================================================================

-- SELECT cron.schedule('weekly-area-price-refresh', '0 2 * * 1', 'SELECT refresh_area_price_weekly(52)');
-- SELECT cron.schedule('weekly-area-stats-refresh',  '0 2 * * 1', 'SELECT refresh_area_stats_latest()');

-- Verify scheduled:
-- SELECT jobid, jobname, schedule, command, active FROM cron.job;


-- =============================================================================
-- ROLLBACK — unschedule and optionally clear data
-- =============================================================================

-- SELECT cron.unschedule('weekly-area-price-refresh');
-- SELECT cron.unschedule('weekly-area-stats-refresh');
-- DROP FUNCTION IF EXISTS refresh_area_price_weekly(INT);
-- DROP FUNCTION IF EXISTS refresh_area_stats_latest();
-- TRUNCATE area_price_weekly;    -- caution: destroys all weekly history
-- TRUNCATE area_stats_latest;    -- caution: destroys all area summary stats


-- =============================================================================
-- IDEMPOTENCY CHECK
-- Running either function twice must produce identical row counts:
-- =============================================================================
-- SELECT refresh_area_price_weekly(52); -- run once
-- SELECT COUNT(*) AS before FROM area_price_weekly;
-- SELECT refresh_area_price_weekly(52); -- run again
-- SELECT COUNT(*) AS after  FROM area_price_weekly;  -- must equal before
