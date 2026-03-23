-- Composite index on latitude/longitude for spatial bounding-box queries.
-- Partial index: excludes rows where either coordinate is NULL (they cannot participate in spatial queries).
CREATE INDEX IF NOT EXISTS idx_property_listings_lat_lon
    ON property_listings (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
