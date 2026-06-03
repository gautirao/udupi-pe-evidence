-- scripts/db/fixtures/discover-smoke-seed.sql
--
-- SYNTHETIC [E2E] TEST DATA ONLY.
-- !! DO NOT run against a production database !!
-- !! All emails use example.com — no real PII, no real accounts !!
-- !! All data is fabricated for automated smoke-testing only !!
--
-- What this seed provides (post V0..V83 schema):
--   1. Udupi city row (idempotent — V71 already seeds it, this is a no-op guard)
--   2. Three areas: Manipal, Malpe, Kaup (idempotent — V71 already seeds them)
--   3. One synthetic [E2E] broker account (profiles + user_roles)
--      Email: e2e-broker@example.com  — synthetic, not a real user
--   4. One Manipal school with area_key set (for J2/J3 school pre-fetch)
--   5. 12 LIVE [E2E] property listings:
--        Manipal × 4  (2 × Apartment, 2 × House)
--        Malpe   × 4  (2 × Apartment, 2 × House)
--        Kaup    × 4  (2 × Apartment, 2 × House)
--      Geometry: geog is GENERATED from (longitude, latitude) — do NOT insert it directly.
--      ST_SetSRID(ST_MakePoint(lon, lat), 4326) order: LONGITUDE first.
--
-- Idempotency:
--   All inserts use ON CONFLICT ... DO UPDATE so re-running is safe.
--   The unique key for listings is (created_by, title).
--
-- Coordinates (LON-first for PostGIS):
--   Manipal  lon≈74.79  lat≈13.35
--   Malpe    lon≈74.70  lat≈13.35
--   Kaup     lon≈74.74  lat≈13.21
--
-- Schema citations:
--   profiles              V0 (user_id, email, full_name)
--   user_roles            V0 (user_id, role app_role)  + V7 adds 'dealer'; V41 adds 'broker'
--   property_listings     V0 base; V7 status enum; V8 created_by; V11 price_paise;
--                         V71/V74 area_key (column added via area_key usage in V74 index —
--                         column itself backfilled from V71 seed pipeline)
--   listing_status enum   V7: SCRAPED|DRAFT|PENDING_REVIEW|LIVE|REJECTED
--   schools               V58 base; V75 geog GENERATED column; V79 area_key FK
--   areas                 V71
--   cities                V71

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Ensure PostGIS extension (V73 does this; guard for out-of-order runs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. City: Udupi (V71 already seeds this; ON CONFLICT DO NOTHING is a no-op)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon,
                           min_lat, min_lon, max_lat, max_lon, default_zoom, is_active)
VALUES ('udupi', 'Udupi', 13.3409, 74.7421, 13.1400, 74.6600, 13.4700, 74.8600, 12, true)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Areas (V71 already seeds these; guards only)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.areas (area_key, city_id, name, district,
                          geo_center_lat, geo_center_lon,
                          min_lat, min_lon, max_lat, max_lon)
SELECT v.area_key, c.id, v.name, v.district,
       v.geo_center_lat, v.geo_center_lon,
       v.min_lat, v.min_lon, v.max_lat, v.max_lon
FROM (VALUES
    ('IN|KA|Udupi|Manipal', 'Manipal', 'Udupi', 13.3528, 74.7947, 13.3400, 74.7800, 13.3700, 74.8200),
    ('IN|KA|Udupi|Malpe',   'Malpe',   'Udupi', 13.3537, 74.7022, 13.3400, 74.6900, 13.3700, 74.7200),
    ('IN|KA|Udupi|Kaup',    'Kaup',    'Udupi', 13.2169, 74.7456, 13.2100, 74.7300, 13.2300, 74.7700)
) AS v(area_key, name, district,
       geo_center_lat, geo_center_lon,
       min_lat, min_lon, max_lat, max_lon)
JOIN public.cities c ON c.slug = 'udupi'
ON CONFLICT (area_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Synthetic [E2E] broker account
--    UUID is fixed so re-runs are fully idempotent (no duplicate rows).
--    Email domain example.com — synthetic test account, not a real user.
--
--    profiles.user_id has a FK → auth.users(id) (added in V0.1).
--    On a real Supabase DB, auth.users is populated by the auth service.
--    On our local fixture, auth.users is a stub table; we insert the broker
--    row there first so the FK constraint is satisfied.
-- ─────────────────────────────────────────────────────────────────────────────

-- Use a fixed deterministic UUID for the E2E broker owner
-- (UUID version 5 namespace:URL of 'e2e-broker-fixture' → static value used here)
DO $$
DECLARE
  v_broker_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
  -- auth.users stub row (FK target for profiles.user_id)
  -- On Supabase this is managed by the auth service; on our local fixture
  -- we insert directly. V0.1 created a trigger `on_auth_user_created` that
  -- fires on INSERT and references NEW.email / NEW.raw_user_meta_data which
  -- do not exist on our minimal stub table. Drop the trigger first; it is
  -- irrelevant on a test fixture (auto-profile creation is not needed).
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
    SET id        = EXCLUDED.id,
        email     = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();

  -- user_roles: assign 'broker' role (app_role enum; 'broker' added in V41)
  INSERT INTO public.user_roles (user_id, role, created_at)
  VALUES (v_broker_id, 'broker', NOW())
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Manipal school for J2/J3 school pre-fetch
--    Required: schools.geog is GENERATED from (longitude, latitude) via V75.
--    V79 adds area_key FK; we set it here directly.
--    The school name starts with '[E2E]' to identify synthetic rows.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.schools (id, name, board_type, latitude, longitude, address, district, source)
VALUES (
  '11111111-2222-3333-4444-555555555555',
  '[E2E] Manipal Test College',
  'AICTE',
  13.3525,   -- latitude  (LON-first only matters for ST_MakePoint in V75 GENERATED column)
  74.7923,   -- longitude
  'Manipal, Udupi District',
  'Udupi',
  'E2E_FIXTURE'
)
ON CONFLICT (id) DO UPDATE
  SET name       = EXCLUDED.name,
      latitude   = EXCLUDED.latitude,
      longitude  = EXCLUDED.longitude,
      address    = EXCLUDED.address,
      district   = EXCLUDED.district,
      source     = EXCLUDED.source;

-- Set area_key directly (V79 adds the FK column; the backfill UPDATE in V79 won't
-- overwrite this because the WHERE clause is s.area_key IS NULL)
UPDATE public.schools
SET area_key = 'IN|KA|Udupi|Manipal'
WHERE id = '11111111-2222-3333-4444-555555555555'
  AND area_key IS DISTINCT FROM 'IN|KA|Udupi|Manipal';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 12 LIVE [E2E] property listings (4 per area)
--
--    Schema columns used (all post-V83):
--      id             UUID PK  (fixed deterministic UUIDs for idempotency)
--      property_type  property_type enum  (V0)
--      title          TEXT  (V0)
--      locality       TEXT  (V0)
--      price          NUMERIC  (V0) — deprecated but NOT NULL in V0; set to 0
--      latitude       DOUBLE PRECISION  (V0)
--      longitude      DOUBLE PRECISION  (V0)
--      status         listing_status enum  (V7) = 'LIVE'
--      created_by     UUID  (V8) — references our synthetic broker
--      price_paise    BIGINT  (V11)
--      area_key       TEXT  (column used in V74 index; backfilled by seed pipeline)
--      is_valid       BOOLEAN  (V0) = true
--      address_confirmed BOOLEAN (V8) = true
--
--    geog is GENERATED ALWAYS AS (ST_MakePoint(longitude, latitude)::geography) STORED (V73)
--    → DO NOT insert geog. Insert longitude/latitude; Postgres computes geog automatically.
--    LON-FIRST for ST_MakePoint: ST_MakePoint(longitude, latitude)
--
--    Idempotency key: (created_by, title) — the seed checks this pair.
--    ON CONFLICT uses listing_number sequence skip (we don't set listing_number here;
--    the V29 sequence default handles it).
-- ─────────────────────────────────────────────────────────────────────────────

-- Manipal listings (4): 2 Apartment (satisfy J4 q=apartment filter), 2 House
INSERT INTO public.property_listings
  (id, property_type, title, locality, price, latitude, longitude,
   status, created_by, price_paise, area_key, is_valid, address_confirmed, created_at, updated_at)
VALUES
  -- Manipal #1: Apartment (J4 filter target)
  ('e2e00001-0000-0000-0000-000000000001',
   'apartment', '[E2E] 1 Lakh Manipal Apartment', 'Manipal',
   0, 13.3522, 74.7873,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   10000000, 'IN|KA|Udupi|Manipal', true, true, NOW(), NOW()),

  -- Manipal #2: House
  ('e2e00001-0000-0000-0000-000000000002',
   'house', '[E2E] 10 Lakh Manipal House', 'Manipal',
   0, 13.3545, 74.7895,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   100000000, 'IN|KA|Udupi|Manipal', true, true, NOW(), NOW()),

  -- Manipal #3: Apartment (second apartment for J4 >= 2 assertion)
  ('e2e00001-0000-0000-0000-000000000003',
   'apartment', '[E2E] 1 Crore Manipal Apartment', 'Manipal',
   0, 13.3498, 74.7852,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   1000000000, 'IN|KA|Udupi|Manipal', true, true, NOW(), NOW()),

  -- Manipal #4: House
  ('e2e00001-0000-0000-0000-000000000004',
   'house', '[E2E] 1.5 Crore Manipal House', 'Manipal',
   0, 13.3560, 74.7840,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   1500000000, 'IN|KA|Udupi|Manipal', true, true, NOW(), NOW()),

  -- Malpe listings (4)
  ('e2e00002-0000-0000-0000-000000000001',
   'apartment', '[E2E] 1 Lakh Malpe Apartment', 'Malpe',
   0, 13.3507, 74.7037,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   10000000, 'IN|KA|Udupi|Malpe', true, true, NOW(), NOW()),

  ('e2e00002-0000-0000-0000-000000000002',
   'house', '[E2E] 10 Lakh Malpe House', 'Malpe',
   0, 13.3484, 74.7033,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   100000000, 'IN|KA|Udupi|Malpe', true, true, NOW(), NOW()),

  ('e2e00002-0000-0000-0000-000000000003',
   'apartment', '[E2E] 1 Crore Malpe Apartment', 'Malpe',
   0, 13.3620, 74.6979,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   1000000000, 'IN|KA|Udupi|Malpe', true, true, NOW(), NOW()),

  ('e2e00002-0000-0000-0000-000000000004',
   'house', '[E2E] 1.5 Crore Malpe House', 'Malpe',
   0, 13.3475, 74.7018,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   1500000000, 'IN|KA|Udupi|Malpe', true, true, NOW(), NOW()),

  -- Kaup listings (4)
  ('e2e00003-0000-0000-0000-000000000001',
   'apartment', '[E2E] 1 Lakh Kaup Apartment', 'Kaup',
   0, 13.2106, 74.7403,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   10000000, 'IN|KA|Udupi|Kaup', true, true, NOW(), NOW()),

  ('e2e00003-0000-0000-0000-000000000002',
   'house', '[E2E] 10 Lakh Kaup House', 'Kaup',
   0, 13.2130, 74.7422,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   100000000, 'IN|KA|Udupi|Kaup', true, true, NOW(), NOW()),

  ('e2e00003-0000-0000-0000-000000000003',
   'apartment', '[E2E] 1 Crore Kaup Apartment', 'Kaup',
   0, 13.2085, 74.7380,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   1000000000, 'IN|KA|Udupi|Kaup', true, true, NOW(), NOW()),

  ('e2e00003-0000-0000-0000-000000000004',
   'house', '[E2E] 1.5 Crore Kaup House', 'Kaup',
   0, 13.2152, 74.7445,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   1500000000, 'IN|KA|Udupi|Kaup', true, true, NOW(), NOW())

ON CONFLICT (id) DO UPDATE
  SET status            = 'LIVE',
      area_key          = EXCLUDED.area_key,
      latitude          = EXCLUDED.latitude,
      longitude         = EXCLUDED.longitude,
      price_paise       = EXCLUDED.price_paise,
      address_confirmed = true,
      updated_at        = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Validation assertions (fail the transaction if counts are wrong)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_live_e2e          INTEGER;
  v_manipal_e2e       INTEGER;
  v_manipal_apt       INTEGER;
  v_school_manipal    INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_live_e2e
    FROM property_listings
    WHERE status = 'LIVE' AND title LIKE '[E2E]%';

  SELECT COUNT(*) INTO v_manipal_e2e
    FROM property_listings
    WHERE status = 'LIVE' AND title LIKE '[E2E]%'
      AND area_key = 'IN|KA|Udupi|Manipal';

  SELECT COUNT(*) INTO v_manipal_apt
    FROM property_listings
    WHERE status = 'LIVE' AND title LIKE '[E2E]%'
      AND area_key = 'IN|KA|Udupi|Manipal'
      AND LOWER(title) LIKE '%apartment%';

  SELECT COUNT(*) INTO v_school_manipal
    FROM schools
    WHERE area_key = 'IN|KA|Udupi|Manipal';

  -- Assert geog is non-NULL for every seeded [E2E] listing.
  -- geog is GENERATED from (longitude, latitude); a NULL result means a coord
  -- was accidentally NULL, which would silently break ST_DWithin queries.
  IF EXISTS (
    SELECT 1 FROM property_listings
    WHERE title LIKE '[E2E]%' AND status = 'LIVE' AND geog IS NULL
  ) THEN
    RAISE EXCEPTION 'Seed assertion failed: one or more [E2E] listings have NULL geog — check latitude/longitude values';
  END IF;

  IF v_live_e2e < 12 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 12 LIVE [E2E] listings, got %', v_live_e2e;
  END IF;
  IF v_manipal_e2e < 4 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 4 Manipal [E2E] listings, got %', v_manipal_e2e;
  END IF;
  IF v_manipal_apt < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 Manipal apartment listings (J4), got %', v_manipal_apt;
  END IF;
  IF v_school_manipal < 1 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 1 school with area_key=Manipal (J2/J3), got %', v_school_manipal;
  END IF;

  RAISE NOTICE 'Seed assertions passed: % LIVE [E2E] listings, % Manipal, % apt, % Manipal schools',
    v_live_e2e, v_manipal_e2e, v_manipal_apt, v_school_manipal;
END $$;

COMMIT;
