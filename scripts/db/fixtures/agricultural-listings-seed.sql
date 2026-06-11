-- scripts/db/fixtures/agricultural-listings-seed.sql
--
-- SYNTHETIC [AGRI] TEST DATA ONLY — DO NOT run against production.
-- !! Add-on seed; run AFTER discover-smoke-seed.sql / restore-test-fixture.sh !!
-- !! All data is fabricated for local Discover development and testing only !!
-- v2 (2026-06-11): locality-specific realistic titles; ON CONFLICT now updates title/locality.
--
-- Requires schema through V87 (V84 agri fields, V85 boundary, V86 property_type CHECK,
--                              V87 regional_area_classifications for the #1408 backfill).
-- What this seed provides:
--   21 LIVE [AGRI] agricultural_land listings across 9 areas:
--     Original 3 areas (from V71 migrations):
--       Brahmavar × 4  (3 with boundary polygon + 1 without → near-band fallback marker test)
--       Shirva    × 3  (all with boundary polygon)
--       Padubidri × 2  (all with boundary polygon)
--     Additional 6 areas (3 existing V71 + 3 synthetic test-only):
--       Manipal       × 2  (all with boundary — E/0_10 vs Udupi)
--       Malpe         × 2  (all with boundary — W/0_10 vs Udupi)
--       NorthMidTest  × 2  (1 with boundary + 1 without → far-band fallback test — N/25_50 vs Udupi)
--       SouthFarTest  × 2  (all with boundary — S/25_50 vs Udupi)
--       EastFarTest   × 2  (all with boundary — E/50_up vs Udupi)
--       Kundapura     × 2  (all with boundary — NW/0_10 vs Kundapur city)
--   Also inserts 3 synthetic test-only area rows (NorthMidTest, SouthFarTest, EastFarTest)
--   under Udupi city — required for 25_50/50_up band coverage in the #1408 backfill.
--
-- Idempotency:
--   Listing inserts use ON CONFLICT (id) DO UPDATE so re-running is safe.
--   Area inserts use ON CONFLICT (area_key) DO UPDATE so centroid edits propagate.
--   V71 areas (Brahmavar/Shirva/Padubidri/Manipal/Malpe/Kundapura) are already present
--   after restore-test-fixture.sh; synthetic areas are created by this seed.
--
-- Broker account:
--   Reuses the SAME synthetic broker UUID 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
--   from discover-smoke-seed.sql. The broker-ensure DO-block below is fully
--   self-contained so this seed is runnable standalone OR after the residential seed.
--
-- Geometry notes:
--   boundary  geography(Polygon,4326) — inserted via ST_GeogFromText
--   geog      GENERATED ALWAYS AS (ST_MakePoint(longitude, latitude)::geography)
--             DO NOT insert geog. Insert latitude + longitude; Postgres computes it.
--   POLYGON coordinate order inside WKT: "lon lat" (longitude first).
--
-- Schema citations:
--   property_listings V0 base (incl. land_area, land_area_unit); V7 status enum;
--                     V8 created_by + address_confirmed; V11 price_paise; V71/V74 area_key;
--                     V84 agri columns (water_source, soil_type, road_access,
--                     cultivation_status, ownership_type, survey_number);
--                     V85 boundary geography(Polygon,4326);
--                     V86 property_type CHECK allows 'agricultural_land'
--   areas             V71 (area rows already seeded by migrations + restore-test-fixture.sh)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Ensure PostGIS extension (V73 does this; guard for out-of-order runs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Broker-ensure DO-block
--    Reuses the fixed synthetic broker UUID from discover-smoke-seed.sql.
--    Safe to run standalone (auth.users stub inserted here) OR after the
--    residential seed (ON CONFLICT guards make it a no-op in that case).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_broker_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
  -- auth.users stub row (FK target for profiles.user_id)
  -- V0.1 created a trigger `on_auth_user_created` that fires on INSERT and
  -- references NEW.email / NEW.raw_user_meta_data which do not exist on our
  -- minimal stub table. Drop the trigger first; it is irrelevant on a test
  -- fixture (auto-profile creation is not needed here).
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

  INSERT INTO auth.users (id)
  VALUES (v_broker_id)
  ON CONFLICT (id) DO NOTHING;

  -- profiles row
  INSERT INTO public.profiles (id, user_id, email, full_name, created_at, updated_at)
  VALUES (
    v_broker_id,
    v_broker_id,
    'e2e-broker@example.com',
    '[E2E] Test Broker',
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET id         = EXCLUDED.id,
        email      = EXCLUDED.email,
        full_name  = EXCLUDED.full_name,
        updated_at = NOW();

  -- user_roles: assign 'broker' role (app_role enum; 'broker' added in V41)
  INSERT INTO public.user_roles (user_id, role, created_at)
  VALUES (v_broker_id, 'broker', NOW())
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 9 LIVE [AGRI] agricultural_land listings
--
--    UUID pattern: a621000X-0000-0000-0000-00000000000Y
--      X=1 → Brahmavar (rows Y=1..4)
--      X=2 → Shirva    (rows Y=1..3)
--      X=3 → Padubidri (rows Y=1..2)
--
--    Boundary polygons: realistic small irregular quadrilateral (NOT a perfect
--    square) centered on each row's lat/lon. Each corner is offset by a
--    slightly different amount. Polygon ring is closed (first vertex = last).
--    WKT coordinate order: "lon lat" inside POLYGON((...)).
--    All vertices verified to lie inside the stated area bbox.
--
--    Brahmavar bbox: lat 13.4100–13.4500, lon 74.7400–74.7700
--    Shirva bbox:    lat 13.1900–13.2200, lon 74.7700–74.8000
--    Padubidri bbox: lat 13.1700–13.2000, lon 74.7700–74.8000
--
--    Row a6210001-...-0004 intentionally has boundary = NULL (fallback marker test).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.property_listings
  (id, property_type, title, locality,
   price, latitude, longitude,
   status, created_by, price_paise,
   area_key, is_valid, is_duplicate, address_confirmed,
   created_at, updated_at,
   land_area, land_area_unit,
   water_source, soil_type, road_access, cultivation_status,
   ownership_type, survey_number,
   boundary)
VALUES

  -- ── Brahmavar #1: 5.0 acre, WITH boundary ──────────────────────────────────
  -- Center: lat 13.4250, lon 74.7480
  -- ~0.0015 deg half-side (≈5 acres); corners vary by ±0.0002 to avoid square
  -- NW(74.7463,13.4265) SW(74.7461,13.4233) SE(74.7497,13.4235) NE(74.7499,13.4267)
  ('a6210001-0000-0000-0000-000000000001',
   'agricultural_land', '[AGRI] 5-Acre Irrigated Coconut Farm, Brahmavar', 'Brahmavar',
   0, 13.4250, 74.7480,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   12500000,
   'IN|KA|Udupi|Brahmavar', true, false, true, NOW(), NOW(),
   5.0, 'acre',
   'Borewell', 'Red loam', 'Tar road', 'Coconut plantation',
   'Freehold', '124/3A',
   ST_GeogFromText('SRID=4326;POLYGON((74.7463 13.4265, 74.7461 13.4233, 74.7497 13.4235, 74.7499 13.4267, 74.7463 13.4265))')),

  -- ── Brahmavar #2: 3.5 acre, WITH boundary ──────────────────────────────────
  -- Center: lat 13.4300, lon 74.7560
  -- ~0.0012 deg half-side (≈3.5 acres)
  -- NW(74.7546,13.4313) SW(74.7548,13.4287) SE(74.7574,13.4285) NE(74.7572,13.4315)
  ('a6210001-0000-0000-0000-000000000002',
   'agricultural_land', '[AGRI] 3.5-Acre Areca Plantation, Brahmavar', 'Brahmavar',
   0, 13.4300, 74.7560,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   8750000,
   'IN|KA|Udupi|Brahmavar', true, false, true, NOW(), NOW(),
   3.5, 'acre',
   'Open well', 'Laterite', 'Mud road', 'Areca plantation',
   'Inherited', '87/2B',
   ST_GeogFromText('SRID=4326;POLYGON((74.7546 13.4313, 74.7548 13.4287, 74.7574 13.4285, 74.7572 13.4315, 74.7546 13.4313))')),

  -- ── Brahmavar #3: 8.0 acre, WITH boundary ──────────────────────────────────
  -- Center: lat 13.4350, lon 74.7600
  -- ~0.0020 deg half-side (≈8 acres)
  -- NW(74.7578,13.4370) SW(74.7580,13.4328) SE(74.7622,13.4330) NE(74.7620,13.4372)
  ('a6210001-0000-0000-0000-000000000003',
   'agricultural_land', '[AGRI] 8-Acre Riverside Farmland, Brahmavar', 'Brahmavar',
   0, 13.4350, 74.7600,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   16000000,
   'IN|KA|Udupi|Brahmavar', true, false, true, NOW(), NOW(),
   8.0, 'acre',
   'River', 'Alluvial', 'Highway frontage', 'Fallow',
   'Freehold', '45/1',
   ST_GeogFromText('SRID=4326;POLYGON((74.7578 13.4370, 74.7580 13.4328, 74.7622 13.4330, 74.7620 13.4372, 74.7578 13.4370))')),

  -- ── Brahmavar #4: 2.0 acre, NO boundary (NULL) — fallback marker test ──────
  ('a6210001-0000-0000-0000-000000000004',
   'agricultural_land', '[AGRI] 2-Acre Fenced Farm Plot, Brahmavar', 'Brahmavar',
   0, 13.4220, 74.7520,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   4000000,
   'IN|KA|Udupi|Brahmavar', true, false, true, NOW(), NOW(),
   2.0, 'acre',
   'Rain-fed', 'Red loam', 'Mud road', 'Cultivated',
   'Inherited', '210/6C',
   NULL),

  -- ── Shirva #1: 4.0 acre, WITH boundary ────────────────────────────────────
  -- Center: lat 13.1980, lon 74.7820
  -- ~0.0013 deg half-side (≈4 acres)
  -- NW(74.7806,13.1993) SW(74.7807,13.1965) SE(74.7834,13.1967) NE(74.7833,13.1995)
  ('a6210002-0000-0000-0000-000000000001',
   'agricultural_land', '[AGRI] 4-Acre Irrigated Paddy Field, Shirva', 'Shirva',
   0, 13.1980, 74.7820,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   7200000,
   'IN|KA|Udupi|Shirva', true, false, true, NOW(), NOW(),
   4.0, 'acre',
   'Borewell', 'Alluvial', 'Tar road', 'Cultivated',
   'Freehold', '312/4A',
   ST_GeogFromText('SRID=4326;POLYGON((74.7806 13.1993, 74.7807 13.1965, 74.7834 13.1967, 74.7833 13.1995, 74.7806 13.1993))')),

  -- ── Shirva #2: 6.5 acre, WITH boundary ────────────────────────────────────
  -- Center: lat 13.2050, lon 74.7880
  -- ~0.0018 deg half-side (≈6.5 acres)
  -- NW(74.7860,13.2068) SW(74.7862,13.2030) SE(74.7898,13.2032) NE(74.7896,13.2070)
  ('a6210002-0000-0000-0000-000000000002',
   'agricultural_land', '[AGRI] 6.5-Acre Coconut Grove, Shirva', 'Shirva',
   0, 13.2050, 74.7880,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   14300000,
   'IN|KA|Udupi|Shirva', true, false, true, NOW(), NOW(),
   6.5, 'acre',
   'Open well', 'Red loam', 'Mud road', 'Coconut plantation',
   'Inherited', '56/7B',
   ST_GeogFromText('SRID=4326;POLYGON((74.7860 13.2068, 74.7862 13.2030, 74.7898 13.2032, 74.7896 13.2070, 74.7860 13.2068))')),

  -- ── Shirva #3: 1.5 acre, WITH boundary ────────────────────────────────────
  -- Center: lat 13.2100, lon 74.7780
  -- ~0.0007 deg half-side (≈1.5 acres)
  -- NW(74.7772,13.2107) SW(74.7773,13.2092) SE(74.7788,13.2093) NE(74.7787,13.2108)
  ('a6210002-0000-0000-0000-000000000003',
   'agricultural_land', '[AGRI] 1.5-Acre Homestead Farmland, Shirva', 'Shirva',
   0, 13.2100, 74.7780,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   3750000,
   'IN|KA|Udupi|Shirva', true, false, true, NOW(), NOW(),
   1.5, 'acre',
   'Rain-fed', 'Laterite', 'Tar road', 'Fallow',
   'Freehold', '99/2C',
   ST_GeogFromText('SRID=4326;POLYGON((74.7772 13.2107, 74.7773 13.2092, 74.7788 13.2093, 74.7787 13.2108, 74.7772 13.2107))')),

  -- ── Padubidri #1: 10.0 acre, WITH boundary ────────────────────────────────
  -- Center: lat 13.1800, lon 74.7820
  -- ~0.0022 deg half-side (≈10 acres)
  -- NW(74.7797,13.1822) SW(74.7798,13.1776) SE(74.7843,13.1778) NE(74.7842,13.1824)
  ('a6210003-0000-0000-0000-000000000001',
   'agricultural_land', '[AGRI] 10-Acre Areca Estate, Padubidri', 'Padubidri',
   0, 13.1800, 74.7820,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   25000000,
   'IN|KA|Udupi|Padubidri', true, false, true, NOW(), NOW(),
   10.0, 'acre',
   'River', 'Alluvial', 'Highway frontage', 'Areca plantation',
   'Freehold', '178/1A',
   ST_GeogFromText('SRID=4326;POLYGON((74.7797 13.1822, 74.7798 13.1776, 74.7843 13.1778, 74.7842 13.1824, 74.7797 13.1822))')),

  -- ── Padubidri #2: 7.0 acre, WITH boundary ─────────────────────────────────
  -- Center: lat 13.1880, lon 74.7900
  -- ~0.0018 deg half-side (≈7 acres)
  -- NW(74.7880,13.1898) SW(74.7882,13.1860) SE(74.7918,13.1862) NE(74.7916,13.1900)
  ('a6210003-0000-0000-0000-000000000002',
   'agricultural_land', '[AGRI] 7-Acre Rain-fed Farmland, Padubidri', 'Padubidri',
   0, 13.1880, 74.7900,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   17500000,
   'IN|KA|Udupi|Padubidri', true, false, true, NOW(), NOW(),
   7.0, 'acre',
   'Borewell', 'Red loam', 'Tar road', 'Cultivated',
   'Inherited', '203/5B',
   ST_GeogFromText('SRID=4326;POLYGON((74.7880 13.1898, 74.7882 13.1860, 74.7918 13.1862, 74.7916 13.1900, 74.7880 13.1898))'))

ON CONFLICT (id) DO UPDATE
  SET title              = EXCLUDED.title,
      locality           = EXCLUDED.locality,
      status             = 'LIVE',
      is_valid           = true,
      area_key           = EXCLUDED.area_key,
      latitude           = EXCLUDED.latitude,
      longitude          = EXCLUDED.longitude,
      price_paise        = EXCLUDED.price_paise,
      boundary           = EXCLUDED.boundary,
      land_area          = EXCLUDED.land_area,
      land_area_unit     = EXCLUDED.land_area_unit,
      water_source       = EXCLUDED.water_source,
      soil_type          = EXCLUDED.soil_type,
      road_access        = EXCLUDED.road_access,
      cultivation_status = EXCLUDED.cultivation_status,
      ownership_type     = EXCLUDED.ownership_type,
      survey_number      = EXCLUDED.survey_number,
      address_confirmed  = true,
      updated_at         = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Synthetic test-only area rows (Section A)
--    Three areas that do NOT exist in V71 migrations; required for 25_50 / 50_up
--    distance-band coverage when running the #1408 regional classification backfill.
--    Idempotent: ON CONFLICT (area_key) DO UPDATE propagates centroid edits.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon,
                          min_lat, min_lon, max_lat, max_lon)
SELECT v.area_key, c.id, v.name, v.district,
       v.geo_center_lat::DOUBLE PRECISION, v.geo_center_lon::DOUBLE PRECISION,
       v.min_lat::DOUBLE PRECISION, v.min_lon::DOUBLE PRECISION,
       v.max_lat::DOUBLE PRECISION, v.max_lon::DOUBLE PRECISION
FROM (VALUES
    ('IN|KA|Udupi|NorthMidTest', 'Hebri Area [TEST]',  'Udupi', 13.6112, 74.7421, 13.5612, 74.6921, 13.6612, 74.7921),
    ('IN|KA|Udupi|SouthFarTest', 'Uchila Area [TEST]', 'Udupi', 13.0706, 74.7421, 13.0206, 74.6921, 13.1206, 74.7921),
    ('IN|KA|Udupi|EastFarTest',  'Agumbe Area [TEST]', 'Udupi', 13.3409, 75.2516, 13.2909, 75.2016, 13.3909, 75.3016)
) AS v(area_key, name, district, geo_center_lat, geo_center_lon, min_lat, min_lon, max_lat, max_lon)
JOIN public.cities c ON c.slug = 'udupi'
ON CONFLICT (area_key) DO UPDATE SET
    geo_center_lat = EXCLUDED.geo_center_lat,
    geo_center_lon = EXCLUDED.geo_center_lon,
    min_lat        = EXCLUDED.min_lat,
    min_lon        = EXCLUDED.min_lon,
    max_lat        = EXCLUDED.max_lat,
    max_lon        = EXCLUDED.max_lon,
    name           = EXCLUDED.name,
    district       = EXCLUDED.district;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 12 additional LIVE [AGRI] agricultural_land listings (Section B)
--
--    UUID pattern: a621000X-0000-0000-0000-00000000000Y
--      X=4 → Manipal      (rows Y=1..2) — existing V71 area, E/0_10 vs Udupi
--      X=5 → Malpe        (rows Y=1..2) — existing V71 area, W/0_10 vs Udupi
--      X=6 → NorthMidTest (rows Y=1..2) — synthetic area (Section A), N/25_50 vs Udupi
--      X=7 → SouthFarTest (rows Y=1..2) — synthetic area (Section A), S/25_50 vs Udupi
--      X=8 → EastFarTest  (rows Y=1..2) — synthetic area (Section A), E/50_up vs Udupi
--      X=9 → Kundapura    (rows Y=1..2) — existing V71 area, NW/0_10 vs Kundapur city
--
--    Row a6210006-...-0002 intentionally has boundary = NULL (far-band fallback marker test).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.property_listings
  (id, property_type, title, locality,
   price, latitude, longitude,
   status, created_by, price_paise,
   area_key, is_valid, is_duplicate, address_confirmed,
   created_at, updated_at,
   land_area, land_area_unit,
   water_source, soil_type, road_access, cultivation_status,
   ownership_type, survey_number,
   boundary)
VALUES

  -- ── Manipal #1: 4.0 acre, WITH boundary ───────────────────────────────────
  -- Center: lat 13.3510, lon 74.7900
  -- Manipal bbox: lat 13.3400–13.3700, lon 74.7800–74.8200
  ('a6210004-0000-0000-0000-000000000001',
   'agricultural_land', '[AGRI] 4-Acre Coconut Farm, Manipal', 'Manipal',
   0, 13.3510, 74.7900,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   9000000,
   'IN|KA|Udupi|Manipal', true, false, true, NOW(), NOW(),
   4.0, 'acre',
   'Borewell', 'Red loam', 'Tar road', 'Coconut plantation',
   'Freehold', '201/3B',
   ST_GeogFromText('SRID=4326;POLYGON((74.7887 13.3523, 74.7886 13.3496, 74.7913 13.3497, 74.7914 13.3524, 74.7887 13.3523))')),

  -- ── Manipal #2: 6.5 acre, WITH boundary ───────────────────────────────────
  -- Center: lat 13.3570, lon 74.7980
  ('a6210004-0000-0000-0000-000000000002',
   'agricultural_land', '[AGRI] 6.5-Acre Areca Plantation, Manipal', 'Manipal',
   0, 13.3570, 74.7980,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   15600000,
   'IN|KA|Udupi|Manipal', true, false, true, NOW(), NOW(),
   6.5, 'acre',
   'Open well', 'Laterite', 'Mud road', 'Areca plantation',
   'Inherited', '88/1A',
   ST_GeogFromText('SRID=4326;POLYGON((74.7966 13.3583, 74.7964 13.3556, 74.7994 13.3558, 74.7996 13.3585, 74.7966 13.3583))')),

  -- ── Malpe #1: 5.0 acre, WITH boundary ─────────────────────────────────────
  -- Center: lat 13.3500, lon 74.6970
  -- Malpe bbox: lat 13.3400–13.3700, lon 74.6900–74.7200
  ('a6210005-0000-0000-0000-000000000001',
   'agricultural_land', '[AGRI] 5-Acre Coastal Farmland, Malpe', 'Malpe',
   0, 13.3500, 74.6970,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   11000000,
   'IN|KA|Udupi|Malpe', true, false, true, NOW(), NOW(),
   5.0, 'acre',
   'River', 'Alluvial', 'Highway frontage', 'Cultivated',
   'Freehold', '67/4C',
   ST_GeogFromText('SRID=4326;POLYGON((74.6957 13.3514, 74.6959 13.3486, 74.6985 13.3488, 74.6983 13.3516, 74.6957 13.3514))')),

  -- ── Malpe #2: 3.5 acre, WITH boundary ─────────────────────────────────────
  -- Center: lat 13.3570, lon 74.7050
  ('a6210005-0000-0000-0000-000000000002',
   'agricultural_land', '[AGRI] 3.5-Acre Fenced Farm Plot, Malpe', 'Malpe',
   0, 13.3570, 74.7050,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   7000000,
   'IN|KA|Udupi|Malpe', true, false, true, NOW(), NOW(),
   3.5, 'acre',
   'Rain-fed', 'Red loam', 'Mud road', 'Fallow',
   'Freehold', '112/2A',
   ST_GeogFromText('SRID=4326;POLYGON((74.7038 13.3582, 74.7040 13.3558, 74.7062 13.3560, 74.7060 13.3584, 74.7038 13.3582))')),

  -- ── NorthMidTest #1: 7.0 acre, WITH boundary ──────────────────────────────
  -- Center: lat 13.6100, lon 74.7400
  -- Near centroid 13.6112, 74.7421 (N / 25_50 vs Udupi)
  ('a6210006-0000-0000-0000-000000000001',
   'agricultural_land', '[AGRI] 7-Acre Areca Plantation, Hebri', 'Hebri',
   0, 13.6100, 74.7400,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   17500000,
   'IN|KA|Udupi|NorthMidTest', true, false, true, NOW(), NOW(),
   7.0, 'acre',
   'Borewell', 'Laterite', 'Tar road', 'Areca plantation',
   'Freehold', '334/1A',
   ST_GeogFromText('SRID=4326;POLYGON((74.7381 13.6118, 74.7383 13.6080, 74.7421 13.6082, 74.7419 13.6120, 74.7381 13.6118))')),

  -- ── NorthMidTest #2: 4.0 acre, NO boundary (NULL) — far-band fallback test ─
  -- Center: lat 13.6150, lon 74.7450
  ('a6210006-0000-0000-0000-000000000002',
   'agricultural_land', '[AGRI] 4-Acre Dryland Farmland, Hebri', 'Hebri',
   0, 13.6150, 74.7450,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   8000000,
   'IN|KA|Udupi|NorthMidTest', true, false, true, NOW(), NOW(),
   4.0, 'acre',
   'Open well', 'Red loam', 'Mud road', 'Fallow',
   'Inherited', '210/5B',
   NULL),

  -- ── SouthFarTest #1: 9.0 acre, WITH boundary ──────────────────────────────
  -- Center: lat 13.0700, lon 74.7400
  -- Near centroid 13.0706, 74.7421 (S / 25_50 vs Udupi)
  ('a6210007-0000-0000-0000-000000000001',
   'agricultural_land', '[AGRI] 9-Acre Coconut Plantation, Uchila', 'Uchila',
   0, 13.0700, 74.7400,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   22500000,
   'IN|KA|Udupi|SouthFarTest', true, false, true, NOW(), NOW(),
   9.0, 'acre',
   'River', 'Alluvial', 'Highway frontage', 'Coconut plantation',
   'Freehold', '445/2C',
   ST_GeogFromText('SRID=4326;POLYGON((74.7381 13.0718, 74.7383 13.0681, 74.7420 13.0683, 74.7418 13.0720, 74.7381 13.0718))')),

  -- ── SouthFarTest #2: 5.5 acre, WITH boundary ──────────────────────────────
  -- Center: lat 13.0750, lon 74.7450
  ('a6210007-0000-0000-0000-000000000002',
   'agricultural_land', '[AGRI] 5.5-Acre Irrigated Farmland, Uchila', 'Uchila',
   0, 13.0750, 74.7450,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   11000000,
   'IN|KA|Udupi|SouthFarTest', true, false, true, NOW(), NOW(),
   5.5, 'acre',
   'Borewell', 'Red loam', 'Tar road', 'Cultivated',
   'Freehold', '189/7A',
   ST_GeogFromText('SRID=4326;POLYGON((74.7437 13.0763, 74.7439 13.0736, 74.7463 13.0738, 74.7461 13.0765, 74.7437 13.0763))')),

  -- ── EastFarTest #1: 12.0 acre, WITH boundary ──────────────────────────────
  -- Center: lat 13.3400, lon 75.2500
  -- Near centroid 13.3409, 75.2516 (E / 50_up vs Udupi, ~55 km east, inland Karnataka)
  ('a6210008-0000-0000-0000-000000000001',
   'agricultural_land', '[AGRI] 12-Acre Dryland Estate, Agumbe', 'Agumbe',
   0, 13.3400, 75.2500,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   18000000,
   'IN|KA|Udupi|EastFarTest', true, false, true, NOW(), NOW(),
   12.0, 'acre',
   'Borewell', 'Black cotton', 'Tar road', 'Cultivated',
   'Freehold', '78/3A',
   ST_GeogFromText('SRID=4326;POLYGON((75.2479 13.3418, 75.2481 13.3380, 75.2521 13.3382, 75.2519 13.3420, 75.2479 13.3418))')),

  -- ── EastFarTest #2: 8.5 acre, WITH boundary ───────────────────────────────
  -- Center: lat 13.3450, lon 75.2560
  ('a6210008-0000-0000-0000-000000000002',
   'agricultural_land', '[AGRI] 8.5-Acre Areca Plantation, Agumbe', 'Agumbe',
   0, 13.3450, 75.2560,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   12750000,
   'IN|KA|Udupi|EastFarTest', true, false, true, NOW(), NOW(),
   8.5, 'acre',
   'Open well', 'Red loam', 'Mud road', 'Areca plantation',
   'Inherited', '156/6B',
   ST_GeogFromText('SRID=4326;POLYGON((75.2547 13.3467, 75.2549 13.3431, 75.2573 13.3433, 75.2571 13.3469, 75.2547 13.3467))')),

  -- ── Kundapura #1: 5.0 acre, WITH boundary ─────────────────────────────────
  -- Center: lat 13.6220, lon 74.6880
  -- Kundapura bbox: lat 13.6100–13.6400, lon 74.6700–74.7100 (NW/0_10 vs Kundapur city)
  ('a6210009-0000-0000-0000-000000000001',
   'agricultural_land', '[AGRI] 5-Acre Coconut Plantation, Kundapura', 'Kundapura',
   0, 13.6220, 74.6880,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   13500000,
   'IN|KA|Udupi|Kundapura', true, false, true, NOW(), NOW(),
   5.0, 'acre',
   'Borewell', 'Laterite', 'Tar road', 'Coconut plantation',
   'Freehold', '56/2A',
   ST_GeogFromText('SRID=4326;POLYGON((74.6867 13.6233, 74.6869 13.6206, 74.6895 13.6208, 74.6893 13.6235, 74.6867 13.6233))')),

  -- ── Kundapura #2: 3.5 acre, WITH boundary ─────────────────────────────────
  -- Center: lat 13.6260, lon 74.6920
  ('a6210009-0000-0000-0000-000000000002',
   'agricultural_land', '[AGRI] 3.5-Acre Areca Plantation, Kundapura', 'Kundapura',
   0, 13.6260, 74.6920,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   7875000,
   'IN|KA|Udupi|Kundapura', true, false, true, NOW(), NOW(),
   3.5, 'acre',
   'Open well', 'Red loam', 'Mud road', 'Areca plantation',
   'Inherited', '89/4B',
   ST_GeogFromText('SRID=4326;POLYGON((74.6907 13.6273, 74.6909 13.6246, 74.6933 13.6248, 74.6931 13.6275, 74.6907 13.6273))'))

ON CONFLICT (id) DO UPDATE
  SET title              = EXCLUDED.title,
      locality           = EXCLUDED.locality,
      status             = 'LIVE',
      is_valid           = true,
      area_key           = EXCLUDED.area_key,
      latitude           = EXCLUDED.latitude,
      longitude          = EXCLUDED.longitude,
      price_paise        = EXCLUDED.price_paise,
      boundary           = EXCLUDED.boundary,
      land_area          = EXCLUDED.land_area,
      land_area_unit     = EXCLUDED.land_area_unit,
      water_source       = EXCLUDED.water_source,
      soil_type          = EXCLUDED.soil_type,
      road_access        = EXCLUDED.road_access,
      cultivation_status = EXCLUDED.cultivation_status,
      ownership_type     = EXCLUDED.ownership_type,
      survey_number      = EXCLUDED.survey_number,
      address_confirmed  = true,
      updated_at         = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Validation assertions (fail the transaction if counts are wrong)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_agri           INTEGER;
  v_with_boundary  INTEGER;
  v_no_boundary    INTEGER;
  v_brahmavar      INTEGER;
  v_shirva         INTEGER;
  v_padubidri      INTEGER;
  v_manipal        INTEGER;
  v_malpe          INTEGER;
  v_northmidtest   INTEGER;
  v_southfartest   INTEGER;
  v_eastfartest    INTEGER;
  v_kundapura      INTEGER;
BEGIN
  -- Total LIVE [AGRI] agricultural_land listings
  SELECT COUNT(*) INTO v_agri
    FROM property_listings
    WHERE status = 'LIVE'
      AND title LIKE '[AGRI]%'
      AND property_type = 'agricultural_land';

  -- With boundary polygon
  SELECT COUNT(*) INTO v_with_boundary
    FROM property_listings
    WHERE status = 'LIVE'
      AND title LIKE '[AGRI]%'
      AND property_type = 'agricultural_land'
      AND boundary IS NOT NULL;

  -- Without boundary polygon (fallback marker test rows)
  SELECT COUNT(*) INTO v_no_boundary
    FROM property_listings
    WHERE status = 'LIVE'
      AND title LIKE '[AGRI]%'
      AND property_type = 'agricultural_land'
      AND boundary IS NULL;

  -- Per-area counts using the AreaSummaryService predicate
  -- (status=LIVE, archived_at IS NULL, is_duplicate=false, LOWER(property_type)='agricultural_land')
  SELECT COUNT(*) INTO v_brahmavar
    FROM property_listings
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false
      AND LOWER(property_type::text) = 'agricultural_land'
      AND area_key = 'IN|KA|Udupi|Brahmavar';

  SELECT COUNT(*) INTO v_shirva
    FROM property_listings
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false
      AND LOWER(property_type::text) = 'agricultural_land'
      AND area_key = 'IN|KA|Udupi|Shirva';

  SELECT COUNT(*) INTO v_padubidri
    FROM property_listings
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false
      AND LOWER(property_type::text) = 'agricultural_land'
      AND area_key = 'IN|KA|Udupi|Padubidri';

  SELECT COUNT(*) INTO v_manipal
    FROM property_listings
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false
      AND LOWER(property_type::text) = 'agricultural_land'
      AND area_key = 'IN|KA|Udupi|Manipal';

  SELECT COUNT(*) INTO v_malpe
    FROM property_listings
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false
      AND LOWER(property_type::text) = 'agricultural_land'
      AND area_key = 'IN|KA|Udupi|Malpe';

  SELECT COUNT(*) INTO v_northmidtest
    FROM property_listings
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false
      AND LOWER(property_type::text) = 'agricultural_land'
      AND area_key = 'IN|KA|Udupi|NorthMidTest';

  SELECT COUNT(*) INTO v_southfartest
    FROM property_listings
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false
      AND LOWER(property_type::text) = 'agricultural_land'
      AND area_key = 'IN|KA|Udupi|SouthFarTest';

  SELECT COUNT(*) INTO v_eastfartest
    FROM property_listings
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false
      AND LOWER(property_type::text) = 'agricultural_land'
      AND area_key = 'IN|KA|Udupi|EastFarTest';

  SELECT COUNT(*) INTO v_kundapura
    FROM property_listings
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false
      AND LOWER(property_type::text) = 'agricultural_land'
      AND area_key = 'IN|KA|Udupi|Kundapura';

  -- Guard: no invalid boundary geometries
  IF EXISTS (
    SELECT 1 FROM property_listings
    WHERE title LIKE '[AGRI]%'
      AND status = 'LIVE'
      AND boundary IS NOT NULL
      AND NOT ST_IsValid(boundary::geometry)
  ) THEN
    RAISE EXCEPTION 'Seed assertion failed: one or more [AGRI] listings have invalid boundary geometry — check WKT polygons';
  END IF;

  -- Guard: geog must be non-NULL for all [AGRI] listings (GENERATED column;
  -- NULL means latitude/longitude was accidentally NULL)
  IF EXISTS (
    SELECT 1 FROM property_listings
    WHERE title LIKE '[AGRI]%'
      AND status = 'LIVE'
      AND geog IS NULL
  ) THEN
    RAISE EXCEPTION 'Seed assertion failed: one or more [AGRI] listings have NULL geog — check latitude/longitude values';
  END IF;

  -- Count assertions
  IF v_agri < 21 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 21 LIVE [AGRI] agricultural_land listings, got %', v_agri;
  END IF;
  IF v_with_boundary < 19 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 19 [AGRI] listings with boundary, got %', v_with_boundary;
  END IF;
  IF v_no_boundary < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 [AGRI] listings with NULL boundary (fallback marker tests), got %', v_no_boundary;
  END IF;
  IF v_brahmavar < 4 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 4 Brahmavar [AGRI] listings, got %', v_brahmavar;
  END IF;
  IF v_shirva < 3 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 3 Shirva [AGRI] listings, got %', v_shirva;
  END IF;
  IF v_padubidri < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 Padubidri [AGRI] listings, got %', v_padubidri;
  END IF;
  IF v_manipal < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 Manipal [AGRI] listings, got %', v_manipal;
  END IF;
  IF v_malpe < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 Malpe [AGRI] listings, got %', v_malpe;
  END IF;
  IF v_northmidtest < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 NorthMidTest [AGRI] listings, got %', v_northmidtest;
  END IF;
  IF v_southfartest < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 SouthFarTest [AGRI] listings, got %', v_southfartest;
  END IF;
  IF v_eastfartest < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 EastFarTest [AGRI] listings, got %', v_eastfartest;
  END IF;
  IF v_kundapura < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 Kundapura [AGRI] listings, got %', v_kundapura;
  END IF;

  RAISE NOTICE 'Seed assertions passed: % LIVE [AGRI] listings total (% with boundary, % without), Brahmavar=%, Shirva=%, Padubidri=%, Manipal=%, Malpe=%, NorthMidTest=%, SouthFarTest=%, EastFarTest=%, Kundapura=%',
    v_agri, v_with_boundary, v_no_boundary,
    v_brahmavar, v_shirva, v_padubidri,
    v_manipal, v_malpe, v_northmidtest, v_southfartest, v_eastfartest, v_kundapura;
END $$;

COMMIT;
