-- Create area_stats_latest table for area-level comparison metrics
-- Populated by scheduled rollup job from property_listings

CREATE TABLE public.area_stats_latest (
    area_key TEXT PRIMARY KEY,
    listing_count INTEGER NOT NULL,
    median_price_per_cent_paise BIGINT,
    city_median_price_per_cent_paise BIGINT,
    price_index NUMERIC(10, 4),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for sorting/filtering by price_index
CREATE INDEX idx_area_stats_latest_price_index
    ON public.area_stats_latest (price_index)
    WHERE price_index IS NOT NULL;

-- Index for filtering by listing activity
CREATE INDEX idx_area_stats_latest_listing_count
    ON public.area_stats_latest (listing_count DESC);

COMMENT ON TABLE public.area_stats_latest IS 'Area-level comparison metrics computed from recent listings';
COMMENT ON COLUMN public.area_stats_latest.area_key IS 'Canonical area identifier (country|region|city|locality)';
COMMENT ON COLUMN public.area_stats_latest.listing_count IS 'Number of valid listings in rolling window';
COMMENT ON COLUMN public.area_stats_latest.median_price_per_cent_paise IS 'Median price per cent in paise for this area';
COMMENT ON COLUMN public.area_stats_latest.city_median_price_per_cent_paise IS 'Median price per cent in paise for the city (null if city cannot be derived)';
COMMENT ON COLUMN public.area_stats_latest.price_index IS 'Ratio of area median to city median (null if city median unavailable)';
