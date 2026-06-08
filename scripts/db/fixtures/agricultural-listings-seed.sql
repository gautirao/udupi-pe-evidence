-- scripts/db/fixtures/agricultural-listings-seed.sql
--
-- SYNTHETIC [AGRI] TEST DATA ONLY — DO NOT run against production.
-- !! Add-on seed; run AFTER discover-smoke-seed.sql / restore-test-fixture.sh !!
-- !! All data is fabricated for local Discover development and testing only !!
--
-- Requires schema through V86 (V84 agri fields, V85 boundary, V86 property_type CHECK).
-- What this seed provides:
--   9 LIVE [AGRI] agricultural_land listings across 3 areas:
--     Brahmavar × 4  (3 with boundary polygon + 1 without → fallback marker test)
--     Shirva    × 3  (all with boundary polygon)
--     Padubidri × 2  (all with boundary polygon)
--   Total acreage: Brahmavar 18.5 ac, Shirva 12.0 ac, Padubidri 17.0 ac
--
-- Idempotency:
--   All inserts use ON CONFLICT (id) DO UPDATE so re-running is safe.
--   Areas come from V71 (already present after restore-test-fixture.sh runs
--   migrations) — this seed does NOT insert city or area rows.
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
   'agricultural_land', '[AGRI] 5-Acre Coconut Farm, Brahmavar', 'Brahmavar',
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
   'agricultural_land', '[AGRI] 8-Acre Fallow Land, Brahmavar', 'Brahmavar',
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
   'agricultural_land', '[AGRI] 2-Acre Cultivated Plot, Brahmavar', 'Brahmavar',
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
   'agricultural_land', '[AGRI] 4-Acre Rice Field, Shirva', 'Shirva',
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
   'agricultural_land', '[AGRI] 1.5-Acre Homestead Plot, Shirva', 'Shirva',
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
   'agricultural_land', '[AGRI] 7-Acre Cultivated Land, Padubidri', 'Padubidri',
   0, 13.1880, 74.7900,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   17500000,
   'IN|KA|Udupi|Padubidri', true, false, true, NOW(), NOW(),
   7.0, 'acre',
   'Borewell', 'Red loam', 'Tar road', 'Cultivated',
   'Inherited', '203/5B',
   ST_GeogFromText('SRID=4326;POLYGON((74.7880 13.1898, 74.7882 13.1860, 74.7918 13.1862, 74.7916 13.1900, 74.7880 13.1898))'))

ON CONFLICT (id) DO UPDATE
  SET status             = 'LIVE',
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
-- 3. Validation assertions (fail the transaction if counts are wrong)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_agri           INTEGER;
  v_with_boundary  INTEGER;
  v_no_boundary    INTEGER;
  v_brahmavar      INTEGER;
  v_shirva         INTEGER;
  v_padubidri      INTEGER;
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

  -- Without boundary polygon (fallback marker test row)
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
  IF v_agri < 9 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 9 LIVE [AGRI] agricultural_land listings, got %', v_agri;
  END IF;
  IF v_with_boundary < 8 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 8 [AGRI] listings with boundary, got %', v_with_boundary;
  END IF;
  IF v_no_boundary < 1 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 1 [AGRI] listing with NULL boundary (fallback marker test), got %', v_no_boundary;
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

  RAISE NOTICE 'Seed assertions passed: % LIVE [AGRI] listings total (% with boundary, % without), Brahmavar=%, Shirva=%, Padubidri=%',
    v_agri, v_with_boundary, v_no_boundary, v_brahmavar, v_shirva, v_padubidri;
END $$;

COMMIT;
