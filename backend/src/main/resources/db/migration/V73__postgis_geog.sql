-- flyway:no-transaction
-- V73: PostGIS extension + geog GENERATED column + GiST index on property_listings.
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, hence no-transaction mode.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE property_listings
    ADD COLUMN IF NOT EXISTS geog geography(Point, 4326)
        GENERATED ALWAYS AS (
            CASE
                WHEN latitude IS NOT NULL AND longitude IS NOT NULL
                    THEN ST_MakePoint(longitude, latitude)::geography
                ELSE NULL
            END
        ) STORED;

CREATE INDEX ${concurrently_keyword}IF NOT EXISTS idx_property_listings_geog
    ON property_listings USING GIST (geog)
    WHERE geog IS NOT NULL;
