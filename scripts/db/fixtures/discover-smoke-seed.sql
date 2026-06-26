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
-- 5b. Demo Records for Broker Listing-Quality Dashboard (Issue #1652)
--     Populates high (BUYER_READY), medium (NEEDS_IMPROVEMENT), and low (PRIORITY_FIX)
--     examples across Manipal, Malpe, and Kaup. Leaves 2 listings unscored for empty states.
-- ─────────────────────────────────────────────────────────────────────────────

-- High quality (Score >= 80 -> BUYER_READY)
UPDATE public.property_listings
SET quality_score = 90,
    quality_computed_at = NOW(),
    quality_breakdown = '{"overall":90,"computedAt":"2026-06-26T12:00:00Z","components":[{"type":"TRUST","score":90,"applied":true,"finding":"Verified broker identity","weightBp":2000},{"type":"PHOTOS","score":90,"applied":true,"finding":"12 high-resolution photos","weightBp":2000},{"type":"DESCRIPTION","score":90,"applied":true,"finding":"Detailed description provided","weightBp":2000},{"type":"KEY_FIELDS","score":90,"applied":true,"finding":"All key fields complete","weightBp":2000},{"type":"LOCATION","score":90,"applied":true,"finding":"Exact coordinates verified","weightBp":2000}]}'
WHERE id IN ('e2e00001-0000-0000-0000-000000000001', 'e2e00002-0000-0000-0000-000000000001', 'e2e00003-0000-0000-0000-000000000001');

-- Medium quality (50 <= Score < 80 -> NEEDS_IMPROVEMENT)
UPDATE public.property_listings
SET quality_score = 65,
    quality_computed_at = NOW(),
    quality_breakdown = '{"overall":65,"computedAt":"2026-06-26T12:00:00Z","components":[{"type":"TRUST","score":80,"applied":true,"finding":"Identity verified","weightBp":2000},{"type":"PHOTOS","score":50,"applied":true,"finding":"Only 3 photos uploaded","weightBp":2000},{"type":"DESCRIPTION","score":60,"applied":true,"finding":"Short description","weightBp":2000},{"type":"KEY_FIELDS","score":80,"applied":true,"finding":"Key fields complete","weightBp":2000},{"type":"LOCATION","score":55,"applied":true,"finding":"Approximate location pin","weightBp":2000}]}'
WHERE id IN ('e2e00001-0000-0000-0000-000000000002', 'e2e00002-0000-0000-0000-000000000002', 'e2e00003-0000-0000-0000-000000000002');

-- Low quality (Score < 50 -> PRIORITY_FIX)
UPDATE public.property_listings
SET quality_score = 40,
    quality_computed_at = NOW(),
    quality_breakdown = '{"overall":40,"computedAt":"2026-06-26T12:00:00Z","components":[{"type":"TRUST","score":40,"applied":true,"finding":"Unverified account","weightBp":2000},{"type":"PHOTOS","score":20,"applied":true,"finding":"Only 1 low-res photo","weightBp":2000},{"type":"DESCRIPTION","score":30,"applied":true,"finding":"Missing description","weightBp":2000},{"type":"KEY_FIELDS","score":60,"applied":true,"finding":"Some fields missing","weightBp":2000},{"type":"LOCATION","score":50,"applied":true,"finding":"Location unverified","weightBp":2000}]}'
WHERE id IN ('e2e00001-0000-0000-0000-000000000003', 'e2e00001-0000-0000-0000-000000000004', 'e2e00002-0000-0000-0000-000000000003', 'e2e00003-0000-0000-0000-000000000003');

-- Note: e2e00002-0000-0000-0000-000000000004 and e2e00003-0000-0000-0000-000000000004 remain unscored (quality_score IS NULL)

-- ─────────────────────────────────────────────────────────────────────────────
-- 5c. Demo Records for Area-Insights Dashboard (Issue #1652)
--     Populates area snapshots, demand signals (opportunities to act), and viewing enquiries.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.area_intelligence_snapshot (
    city_slug, area_key, area_label, computed_at, active_listing_count,
    median_price_paise, dominant_property_type, fresh_listing_count,
    avg_listing_quality, price_comparison_sample_count, price_comparison_supported,
    confidence, demand_score
) VALUES
('udupi', 'IN|KA|Udupi|Manipal', 'Manipal', NOW(), 34, 650000000, 'apartment', 8, 78.50, 34, true, 'full', 82.40),
('udupi', 'IN|KA|Udupi|Malpe',   'Malpe',   NOW(), 28, 550000000, 'house',     5, 71.20, 28, true, 'full', 75.10),
('udupi', 'IN|KA|Udupi|Kaup',    'Kaup',    NOW(), 19, 450000000, 'house',     4, 68.00, 19, true, 'full', 69.80)
ON CONFLICT (city_slug, area_key) DO UPDATE SET
    area_label                    = EXCLUDED.area_label,
    computed_at                   = EXCLUDED.computed_at,
    active_listing_count          = EXCLUDED.active_listing_count,
    median_price_paise            = EXCLUDED.median_price_paise,
    dominant_property_type        = EXCLUDED.dominant_property_type,
    fresh_listing_count           = EXCLUDED.fresh_listing_count,
    avg_listing_quality           = EXCLUDED.avg_listing_quality,
    price_comparison_sample_count = EXCLUDED.price_comparison_sample_count,
    price_comparison_supported    = EXCLUDED.price_comparison_supported,
    confidence                    = EXCLUDED.confidence,
    demand_score                  = EXCLUDED.demand_score;

-- Clear previous demo demand signals to keep count deterministic across multi-hour runs
DELETE FROM public.area_demand_signal WHERE city_slug = 'udupi' AND window_days = 30;

INSERT INTO public.area_demand_signal (
    city_slug, area_key, property_type, listing_purpose, budget_band,
    period_start, period_end, window_days, search_count, panel_open_count,
    lead_intent_count, listing_count, gap_score, signal_type, confidence, computed_at
) VALUES
-- Manipal (10 qualifying buckets -> 10 qualifying signals MINUS 4 live listings = 6 opportunities to act)
('udupi', 'IN|KA|Udupi|Manipal', 'apartment', 'sale', 'UNDER_5L',    NOW() - INTERVAL '1 hour', NOW(), 30, 40, 10, 5, 1, 1.5, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Manipal', 'apartment', 'sale', '5L_20L',      NOW() - INTERVAL '1 hour', NOW(), 30, 45, 12, 6, 1, 1.8, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Manipal', 'apartment', 'sale', '20L_50L',     NOW() - INTERVAL '1 hour', NOW(), 30, 50, 15, 8, 1, 2.1, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Manipal', 'apartment', 'sale', '50L_1CR',     NOW() - INTERVAL '1 hour', NOW(), 30, 55, 18, 9, 1, 2.4, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Manipal', 'apartment', 'sale', '1CR_2CR',     NOW() - INTERVAL '1 hour', NOW(), 30, 35, 8,  4, 0, 1.6, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Manipal', 'apartment', 'sale', 'ABOVE_2CR',   NOW() - INTERVAL '1 hour', NOW(), 30, 30, 6,  3, 0, 1.4, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Manipal', 'apartment', 'sale', 'UNSPECIFIED', NOW() - INTERVAL '1 hour', NOW(), 30, 32, 7,  3, 0, 1.3, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Manipal', 'house',     'sale', '50L_1CR',     NOW() - INTERVAL '1 hour', NOW(), 30, 38, 9,  4, 0, 1.7, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Manipal', 'house',     'sale', '1CR_2CR',     NOW() - INTERVAL '1 hour', NOW(), 30, 42, 11, 5, 0, 1.9, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Manipal', 'villa',     'sale', 'ABOVE_2CR',   NOW() - INTERVAL '1 hour', NOW(), 30, 31, 5,  2, 0, 1.2, 'supply_gap', 'enough_data', NOW()),

-- Malpe (8 qualifying buckets -> 8 - 4 = 4 opportunities to act)
('udupi', 'IN|KA|Udupi|Malpe', 'house', 'sale', '5L_20L',      NOW() - INTERVAL '1 hour', NOW(), 30, 35, 8, 3, 1, 1.4, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Malpe', 'house', 'sale', '20L_50L',     NOW() - INTERVAL '1 hour', NOW(), 30, 40, 10, 4, 1, 1.6, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Malpe', 'house', 'sale', '50L_1CR',     NOW() - INTERVAL '1 hour', NOW(), 30, 45, 12, 5, 1, 1.8, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Malpe', 'house', 'sale', '1CR_2CR',     NOW() - INTERVAL '1 hour', NOW(), 30, 30, 6, 2, 0, 1.2, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Malpe', 'apartment', 'sale', '20L_50L', NOW() - INTERVAL '1 hour', NOW(), 30, 32, 7, 3, 0, 1.3, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Malpe', 'apartment', 'sale', '50L_1CR', NOW() - INTERVAL '1 hour', NOW(), 30, 34, 8, 4, 0, 1.5, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Malpe', 'villa', 'sale', '1CR_2CR',     NOW() - INTERVAL '1 hour', NOW(), 30, 31, 6, 2, 0, 1.1, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Malpe', 'plot',  'sale', '20L_50L',     NOW() - INTERVAL '1 hour', NOW(), 30, 33, 7, 3, 0, 1.3, 'supply_gap', 'enough_data', NOW()),

-- Kaup (8 qualifying buckets -> 8 - 4 = 4 opportunities to act)
('udupi', 'IN|KA|Udupi|Kaup', 'house', 'sale', 'UNDER_5L',    NOW() - INTERVAL '1 hour', NOW(), 30, 32, 6, 2, 1, 1.2, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Kaup', 'house', 'sale', '5L_20L',      NOW() - INTERVAL '1 hour', NOW(), 30, 36, 8, 3, 1, 1.4, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Kaup', 'house', 'sale', '20L_50L',     NOW() - INTERVAL '1 hour', NOW(), 30, 42, 11, 5, 1, 1.7, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Kaup', 'house', 'sale', '50L_1CR',     NOW() - INTERVAL '1 hour', NOW(), 30, 38, 9, 4, 0, 1.5, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Kaup', 'apartment', 'sale', '20L_50L', NOW() - INTERVAL '1 hour', NOW(), 30, 30, 5, 2, 0, 1.1, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Kaup', 'apartment', 'sale', '50L_1CR', NOW() - INTERVAL '1 hour', NOW(), 30, 35, 8, 3, 0, 1.4, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Kaup', 'plot',  'sale', '5L_20L',      NOW() - INTERVAL '1 hour', NOW(), 30, 31, 6, 2, 0, 1.2, 'supply_gap', 'enough_data', NOW()),
('udupi', 'IN|KA|Udupi|Kaup', 'plot',  'sale', '20L_50L',     NOW() - INTERVAL '1 hour', NOW(), 30, 34, 7, 3, 0, 1.3, 'supply_gap', 'enough_data', NOW());

-- Synthetic requester for viewing enquiries
INSERT INTO auth.users (id) VALUES ('b2c3d4e5-f6a7-8901-bcde-f23456789012') ON CONFLICT (id) DO NOTHING;

-- Synthetic viewing requests (enquiries on broker listings: 3 in Manipal, 3 in Malpe, 3 in Kaup)
INSERT INTO public.viewing_requests (
    id, listing_id, requester_id, broker_id, requested_date, requested_time_slot, status, created_at, updated_at
) VALUES
-- Manipal
('e2e00004-0000-0000-0000-000000000001', 'e2e00001-0000-0000-0000-000000000001', 'b2c3d4e5-f6a7-8901-bcde-f23456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', CURRENT_DATE + 1, '10:00 AM - 11:00 AM', 'REQUESTED', NOW(), NOW()),
('e2e00004-0000-0000-0000-000000000002', 'e2e00001-0000-0000-0000-000000000002', 'b2c3d4e5-f6a7-8901-bcde-f23456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', CURRENT_DATE + 1, '11:00 AM - 12:00 PM', 'REQUESTED', NOW(), NOW()),
('e2e00004-0000-0000-0000-000000000003', 'e2e00001-0000-0000-0000-000000000003', 'b2c3d4e5-f6a7-8901-bcde-f23456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', CURRENT_DATE + 1, '02:00 PM - 03:00 PM', 'REQUESTED', NOW(), NOW()),
-- Malpe
('e2e00004-0000-0000-0000-000000000004', 'e2e00002-0000-0000-0000-000000000001', 'b2c3d4e5-f6a7-8901-bcde-f23456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', CURRENT_DATE + 1, '10:00 AM - 11:00 AM', 'REQUESTED', NOW(), NOW()),
('e2e00004-0000-0000-0000-000000000005', 'e2e00002-0000-0000-0000-000000000002', 'b2c3d4e5-f6a7-8901-bcde-f23456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', CURRENT_DATE + 1, '11:00 AM - 12:00 PM', 'REQUESTED', NOW(), NOW()),
('e2e00004-0000-0000-0000-000000000006', 'e2e00002-0000-0000-0000-000000000003', 'b2c3d4e5-f6a7-8901-bcde-f23456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', CURRENT_DATE + 1, '02:00 PM - 03:00 PM', 'REQUESTED', NOW(), NOW()),
-- Kaup
('e2e00004-0000-0000-0000-000000000007', 'e2e00003-0000-0000-0000-000000000001', 'b2c3d4e5-f6a7-8901-bcde-f23456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', CURRENT_DATE + 1, '10:00 AM - 11:00 AM', 'REQUESTED', NOW(), NOW()),
('e2e00004-0000-0000-0000-000000000008', 'e2e00003-0000-0000-0000-000000000002', 'b2c3d4e5-f6a7-8901-bcde-f23456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', CURRENT_DATE + 1, '11:00 AM - 12:00 PM', 'REQUESTED', NOW(), NOW()),
('e2e00004-0000-0000-0000-000000000009', 'e2e00003-0000-0000-0000-000000000003', 'b2c3d4e5-f6a7-8901-bcde-f23456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', CURRENT_DATE + 1, '02:00 PM - 03:00 PM', 'REQUESTED', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    updated_at = NOW();

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
