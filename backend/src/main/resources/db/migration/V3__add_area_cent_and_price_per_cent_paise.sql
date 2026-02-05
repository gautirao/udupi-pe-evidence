-- Add normalized area and unit-price columns to property_listings
-- These are computed fields populated during listing assembly (PR-2B)

ALTER TABLE public.property_listings
    ADD COLUMN area_cent NUMERIC,
    ADD COLUMN price_per_cent_paise BIGINT;

-- Index for efficient filtering in rollup queries
CREATE INDEX idx_property_listings_price_per_cent_paise
    ON public.property_listings (price_per_cent_paise)
    WHERE price_per_cent_paise IS NOT NULL;

COMMENT ON COLUMN public.property_listings.area_cent IS 'Land area normalized to cents (1 cent = 435.6 sqft)';
COMMENT ON COLUMN public.property_listings.price_per_cent_paise IS 'Price per cent in paise (price_paise / area_cent)';
