-- Add area_key and area_label columns to property_listings
-- area_key is a canonical area identifier (country|region|city|locality) computed from geocoding
-- area_label is a human-readable version of the area

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS area_key TEXT,
    ADD COLUMN IF NOT EXISTS area_label TEXT;

-- Index for rollup queries that filter/group by area_key
CREATE INDEX IF NOT EXISTS idx_property_listings_area_key
    ON public.property_listings (area_key)
    WHERE area_key IS NOT NULL;
