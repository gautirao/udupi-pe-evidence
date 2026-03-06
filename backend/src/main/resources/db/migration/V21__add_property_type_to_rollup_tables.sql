-- V21: Add property_type column to rollup tables for per-type Insights segmentation.
-- 'all' is a reserved sentinel value for aggregate rows; it is NOT a real property_type
-- value from property_listings. Existing rows become the 'all' aggregate rows.

-- ─── area_price_weekly ─────────────────────────────────────────────────────

ALTER TABLE public.area_price_weekly
    ADD COLUMN IF NOT EXISTS property_type varchar(32) NOT NULL DEFAULT 'all';

-- Drop old unique constraint (area_key, week_start_date) and replace with 3-column version.
ALTER TABLE public.area_price_weekly
    DROP CONSTRAINT IF EXISTS uq_area_price_weekly_area_week;

ALTER TABLE public.area_price_weekly
    ADD CONSTRAINT uq_area_price_weekly_area_week_type
        UNIQUE (area_key, week_start_date, property_type);

-- ─── area_stats_latest ─────────────────────────────────────────────────────

ALTER TABLE public.area_stats_latest
    ADD COLUMN IF NOT EXISTS property_type varchar(32) NOT NULL DEFAULT 'all';

-- Promote primary key from (area_key) to (area_key, property_type).
-- Existing rows retain area_key as before; property_type defaults to 'all'.
ALTER TABLE public.area_stats_latest
    DROP CONSTRAINT IF EXISTS area_stats_latest_pkey;

ALTER TABLE public.area_stats_latest
    ADD CONSTRAINT area_stats_latest_pkey PRIMARY KEY (area_key, property_type);
