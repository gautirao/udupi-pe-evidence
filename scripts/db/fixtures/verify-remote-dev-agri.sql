-- scripts/db/fixtures/verify-remote-dev-agri.sql
-- Verification SQL queries for #1647 remote dev agricultural restoration.

-- 1. Verify count of LIVE agricultural listings (expected: 21)
SELECT COUNT(*) AS live_agri_count
FROM property_listings
WHERE status = 'LIVE'
  AND property_type = 'agricultural_land';

-- 2. Verify regional classifications grouping by direction and distance band for Udupi
SELECT direction_key, distance_band_key, COUNT(*) AS area_count
FROM regional_area_classifications
WHERE city_key = 'udupi'
GROUP BY direction_key, distance_band_key
ORDER BY distance_band_key, direction_key;
