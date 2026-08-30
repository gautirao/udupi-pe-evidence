-- V80__school_area_key_trigger.sql
-- Creates BEFORE INSERT OR UPDATE trigger on schools table to auto-assign area_key
-- using nearest_configured_area_within_district matching (replicates V79 backfill logic).
-- IS DISTINCT FROM guard preserves operator-set area_key values.

CREATE OR REPLACE FUNCTION assign_school_area_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_norm_district TEXT;
    v_computed_area_key TEXT;
BEGIN
    -- Only proceed if district and coordinates are provided
    IF NEW.district IS NULL OR NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
        RETURN NEW;
    END IF;

    -- Normalise district (exact same logic as V79 backfill)
    v_norm_district := CASE
        WHEN LOWER(TRIM(NEW.district)) IN ('bengaluru urban', 'bangalore urban', 'bangalore') THEN 'bengaluru'
        WHEN LOWER(TRIM(NEW.district)) IN ('dakshina kannada', 'mangaluru') THEN 'mangalore'
        ELSE LOWER(TRIM(NEW.district))
    END;

    -- Find nearest configured area within same normalised district, within 10km
    -- Uses NEW.latitude/longitude directly (geog is GENERATED ALWAYS, not yet set in BEFORE trigger)
    SELECT a.area_key
    INTO v_computed_area_key
    FROM areas a
    WHERE (
        CASE
            WHEN LOWER(TRIM(a.district)) IN ('bengaluru urban', 'bangalore urban', 'bangalore') THEN 'bengaluru'
            WHEN LOWER(TRIM(a.district)) IN ('dakshina kannada', 'mangaluru') THEN 'mangalore'
            ELSE LOWER(TRIM(a.district))
        END
    ) = v_norm_district
    AND a.geo_center_lon IS NOT NULL
    AND a.geo_center_lat IS NOT NULL
    AND ST_DWithin(
        ST_Point(NEW.longitude, NEW.latitude)::geography,
        ST_Point(a.geo_center_lon, a.geo_center_lat)::geography,
        10000  -- 10 km hard cap; matches V79 MAX_ASSIGNMENT_METERS
    )
    ORDER BY
        ST_Distance(
            ST_Point(NEW.longitude, NEW.latitude)::geography,
            ST_Point(a.geo_center_lon, a.geo_center_lat)::geography
        ) ASC,
        a.area_key ASC  -- deterministic tiebreak
    LIMIT 1;

    -- IS DISTINCT FROM guard (AC7): only write area_key if the computed value actually differs
    -- from what is already set. Prevents unnecessary no-op writes.
    -- NULL IS DISTINCT FROM NULL = FALSE → skips write when no area found and area_key is already NULL.
    -- Operator overrides are protected by the trigger's OF clause scope (UPDATE OF latitude, longitude,
    -- district): a direct UPDATE to area_key without touching those columns does not fire this trigger.
    IF v_computed_area_key IS DISTINCT FROM NEW.area_key THEN
        NEW.area_key := v_computed_area_key;
    END IF;

    RETURN NEW;
END;
$$;

-- Drop existing trigger if present (idempotent re-run safety)
DROP TRIGGER IF EXISTS trg_school_area_key ON schools;

-- Create trigger: fires BEFORE INSERT or UPDATE of location/district columns only
CREATE TRIGGER trg_school_area_key
    BEFORE INSERT OR UPDATE OF latitude, longitude, district
    ON schools
    FOR EACH ROW
    EXECUTE FUNCTION assign_school_area_key();
