-- perf_db_apply_geog.sql
-- Idempotent script to provision the NON-PRODUCTION perf DB to the V73 schema.
--
-- Apply against the throwaway perf container only:
--   psql postgresql://postgres:perf@localhost:5434/postgres -f scripts/perf_db_apply_geog.sql
--
-- WARNING: Never run against the production database.
-- This is NOT a Flyway migration — it is a manual provisioning helper for the
-- local perf container (postgres:14 on port 5434). The equivalent schema change
-- is already applied to production via V73__add_geog_column.sql.

-- 1. PostGIS extension (required for geography type and ST_* functions)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. geog generated column (mirrors V73 migration)
--    GENERATED ALWAYS AS ... STORED: auto-populated from lat/lon on every INSERT/UPDATE.
--    generator correctly omits this column from INSERT_COLUMNS.
ALTER TABLE property_listings
    ADD COLUMN IF NOT EXISTS geog geography(Point,4326)
    GENERATED ALWAYS AS (
        CASE
            WHEN latitude IS NOT NULL AND longitude IS NOT NULL
            THEN ST_MakePoint(longitude, latitude)::geography
            ELSE NULL
        END
    ) STORED;

-- 3. GiST spatial index on geog (partial — only non-null rows)
CREATE INDEX IF NOT EXISTS idx_property_listings_geog
    ON property_listings USING GIST (geog)
    WHERE geog IS NOT NULL;
