-- Create area_price_weekly table for storing pre-aggregated weekly price statistics per area.
-- This table is queried by the dashboard API and should NOT be populated from raw_posts directly.
-- A separate aggregation job or materialized view refresh populates this table.

CREATE TABLE IF NOT EXISTS public.area_price_weekly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_key TEXT NOT NULL,
    week_start_date DATE NOT NULL,
    listing_count INTEGER NOT NULL DEFAULT 0,
    median_price_per_cent_paise BIGINT,
    p25_price_per_cent_paise BIGINT,
    p75_price_per_cent_paise BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT uq_area_price_weekly_area_week UNIQUE (area_key, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_area_price_weekly_area_key
    ON public.area_price_weekly (area_key);

CREATE INDEX IF NOT EXISTS idx_area_price_weekly_week_start_date
    ON public.area_price_weekly (week_start_date DESC);

COMMENT ON TABLE public.area_price_weekly IS 'Pre-aggregated weekly price statistics per area for dashboard queries';
COMMENT ON COLUMN public.area_price_weekly.median_price_per_cent_paise IS 'Median price per cent in paise (1/100 rupee)';
COMMENT ON COLUMN public.area_price_weekly.p25_price_per_cent_paise IS '25th percentile price per cent in paise';
COMMENT ON COLUMN public.area_price_weekly.p75_price_per_cent_paise IS '75th percentile price per cent in paise';
