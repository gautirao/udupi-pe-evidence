-- V23: Add bedrooms segmentation to rollup tables.
-- bedrooms=0 is the sentinel for aggregate rows (all bedrooms combined).
-- Listings with bedrooms > 0 get their own segmented rollup rows.

-- ─── area_price_weekly ─────────────────────────────────────────────────────

ALTER TABLE public.area_price_weekly
    ADD COLUMN IF NOT EXISTS bedrooms integer NOT NULL DEFAULT 0;

-- Drop 3-column unique constraint and replace with 4-column version.
ALTER TABLE public.area_price_weekly
    DROP CONSTRAINT IF EXISTS uq_area_price_weekly_area_week_type;

ALTER TABLE public.area_price_weekly
    ADD CONSTRAINT uq_area_price_weekly_area_week_type_beds
        UNIQUE (area_key, week_start_date, property_type, bedrooms);

-- ─── area_stats_latest ─────────────────────────────────────────────────────

ALTER TABLE public.area_stats_latest
    ADD COLUMN IF NOT EXISTS bedrooms integer NOT NULL DEFAULT 0;

-- Promote primary key from (area_key, property_type) to (area_key, property_type, bedrooms).
ALTER TABLE public.area_stats_latest
    DROP CONSTRAINT IF EXISTS area_stats_latest_pkey;

ALTER TABLE public.area_stats_latest
    ADD CONSTRAINT area_stats_latest_pkey PRIMARY KEY (area_key, property_type, bedrooms);
