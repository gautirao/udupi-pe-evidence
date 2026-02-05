-- Add normalized area fields and price per cent to property_listings
-- These fields are computed from landArea + landAreaUnit via AreaNormalizer

ALTER TABLE property_listings
    ADD COLUMN IF NOT EXISTS area_sqm NUMERIC(19, 6),
    ADD COLUMN IF NOT EXISTS area_sqft NUMERIC(19, 6),
    ADD COLUMN IF NOT EXISTS area_cent NUMERIC(19, 6),
    ADD COLUMN IF NOT EXISTS price_per_cent_paise BIGINT;

-- Index on price_per_cent_paise for analytics queries
CREATE INDEX IF NOT EXISTS idx_property_listings_price_per_cent_paise
    ON property_listings (price_per_cent_paise)
    WHERE price_per_cent_paise IS NOT NULL;

COMMENT ON COLUMN property_listings.area_sqm IS 'Normalized land area in square meters (canonical unit)';
COMMENT ON COLUMN property_listings.area_sqft IS 'Normalized land area in square feet (derived from sqm)';
COMMENT ON COLUMN property_listings.area_cent IS 'Normalized land area in cents (1 cent = 435.6 sqft)';
COMMENT ON COLUMN property_listings.price_per_cent_paise IS 'Price per cent in paise (price_paise / area_cent)';
