-- V79__add_school_area_key.sql
-- Adds area_key FK column to schools table and backfills with nearest_configured_area_within_district matching.
-- District normalisation rules:
--   'bengaluru urban' / 'bangalore urban' / 'bangalore' → 'bengaluru'
--   'dakshina kannada' / 'mangaluru' → 'mangalore'
--   everything else passes through

-- Add column (idempotent)
ALTER TABLE schools ADD COLUMN IF NOT EXISTS area_key TEXT NULL REFERENCES areas(area_key);

-- Index on area_key for schoolsByArea queries
CREATE INDEX IF NOT EXISTS idx_schools_area_key ON schools(area_key);

-- Backfill: for each school, assign to nearest area within same normalised district, within 10km.
-- MAX_ASSIGNMENT_METERS = 10000 (10 km hard cap).
-- Deterministic tiebreak by area_key ASC.
UPDATE schools s
SET area_key = (
    SELECT a.area_key
    FROM areas a
    WHERE (
        -- Normalise school district
        (CASE
            WHEN LOWER(TRIM(s.district)) IN ('bengaluru urban', 'bangalore urban', 'bangalore') THEN 'bengaluru'
            WHEN LOWER(TRIM(s.district)) IN ('dakshina kannada', 'mangaluru') THEN 'mangalore'
            ELSE LOWER(TRIM(s.district))
        END)
        =
        -- Normalise area district
        (CASE
            WHEN LOWER(TRIM(a.district)) IN ('bengaluru urban', 'bangalore urban', 'bangalore') THEN 'bengaluru'
            WHEN LOWER(TRIM(a.district)) IN ('dakshina kannada', 'mangaluru') THEN 'mangalore'
            ELSE LOWER(TRIM(a.district))
        END)
    )
    AND ST_DWithin(
        s.geog,
        ST_Point(a.geo_center_lon, a.geo_center_lat)::geography,
        10000  -- 10 km hard cap; uses idx_schools_geog_gist for pruning
    )
    ORDER BY
        ST_Distance(s.geog, ST_Point(a.geo_center_lon, a.geo_center_lat)::geography) ASC,
        a.area_key ASC
    LIMIT 1
)
WHERE s.district IS NOT NULL
  AND s.geog IS NOT NULL
  AND s.area_key IS NULL;  -- safely re-runnable: only assign unassigned rows, preserve operator overrides

-- Report results per district
DO $$
DECLARE
    v_district TEXT;
    v_count INT;
    v_assigned INT;
    v_total INT := 0;
    v_total_assigned INT := 0;
BEGIN
    FOR v_district IN
        SELECT DISTINCT district FROM schools WHERE district IS NOT NULL ORDER BY district
    LOOP
        SELECT COUNT(*) INTO v_count FROM schools WHERE district = v_district;
        SELECT COUNT(*) INTO v_assigned FROM schools WHERE district = v_district AND area_key IS NOT NULL;
        v_total := v_total + v_count;
        v_total_assigned := v_total_assigned + v_assigned;
        RAISE NOTICE 'District ''%'': % schools, % assigned', v_district, v_count, v_assigned;
    END LOOP;
    RAISE NOTICE 'Total: % schools, % assigned', v_total, v_total_assigned;
END $$;
