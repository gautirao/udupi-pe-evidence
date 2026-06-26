-- scripts/db/fixtures/regional-classifications-backfill.sql
--
-- Pure SQL backfill of regional_area_classifications for remote development DB.
-- Parity with RegionalClassificationBackfillService.java and RegionalGeo.java.
-- Idempotent: uses ON CONFLICT (city_key, area_key) DO UPDATE.

BEGIN;

WITH calc AS (
  SELECT 
    c.slug AS city_key,
    a.area_key,
    (ST_Distance(ST_MakePoint(c.geo_center_lon, c.geo_center_lat)::geography, ST_MakePoint(a.geo_center_lon, a.geo_center_lat)::geography) / 1000.0)::double precision AS distance_km,
    ((degrees(ST_Azimuth(ST_MakePoint(c.geo_center_lon, c.geo_center_lat), ST_MakePoint(a.geo_center_lon, a.geo_center_lat))) + 360)::numeric % 360)::double precision AS bearing_deg
  FROM cities c
  JOIN areas a ON a.city_id = c.id
  WHERE c.is_active = true
    AND array_length(string_to_array(a.area_key, '|'), 1) = 4
    AND c.geo_center_lat IS NOT NULL AND c.geo_center_lon IS NOT NULL
    AND a.geo_center_lat IS NOT NULL AND a.geo_center_lon IS NOT NULL
),
mapped AS (
  SELECT
    city_key,
    area_key,
    CASE
      WHEN bearing_deg >= 337.5 OR bearing_deg < 22.5 THEN 'N'
      WHEN bearing_deg < 67.5 THEN 'NE'
      WHEN bearing_deg < 112.5 THEN 'E'
      WHEN bearing_deg < 157.5 THEN 'SE'
      WHEN bearing_deg < 202.5 THEN 'S'
      WHEN bearing_deg < 247.5 THEN 'SW'
      WHEN bearing_deg < 292.5 THEN 'W'
      ELSE 'NW'
    END AS direction_key,
    CASE
      WHEN distance_km < 10.0 THEN '0_10'
      WHEN distance_km < 25.0 THEN '10_25'
      WHEN distance_km < 50.0 THEN '25_50'
      ELSE '50_up'
    END AS distance_band_key,
    bearing_deg,
    distance_km
  FROM calc
)
INSERT INTO regional_area_classifications
    (city_key, area_key, direction_key, distance_band_key, bearing_deg, distance_km, computed_at)
SELECT
    city_key, area_key, direction_key, distance_band_key, bearing_deg, distance_km, now()
FROM mapped
ON CONFLICT (city_key, area_key)
DO UPDATE SET
    direction_key     = EXCLUDED.direction_key,
    distance_band_key = EXCLUDED.distance_band_key,
    bearing_deg       = EXCLUDED.bearing_deg,
    distance_km       = EXCLUDED.distance_km,
    computed_at       = now();

COMMIT;
