-- scripts/db/fixtures/navigation-hierarchy-schools-agri-fixture-seed.sql
--
-- Issue #1713 slice PR-3 — additive, idempotent seed for the LOCAL/TEST-ONLY fixture Postgres only
-- (scripts/dev/local-fixture-backend.sh). Never run against a production or shared Supabase database.
--
-- WHY THIS EXISTS (team-lead-plan.toml correction c2/c7, deliverables.d2_fixture_and_docs): the
-- existing navigation_nodes/navigation-hierarchy-fixture-*.sql pair seeds a real Bangalore AREA
-- hierarchy under d:southeast/d:northeast/d:southwest, but NEITHER the schools dataset (27 rows,
-- none inside the seeded nav-node areas) NOR the agri dataset (21 rows, all in Udupi/Kundapur) line
-- up with it, and `agri_destination_classification` (V125) is EMPTY for every city — the backend
-- fails closed with 503 AGRI_DESTINATIONS_NOT_YET_PROMOTED whenever that table has zero rows for an
-- active city, and does NOT fall back to the legacy `regional_area_classifications` table (see
-- AgriDestinationPortPostgresAdapter#AGRI_DESTINATIONS_NOT_YET_PROMOTED / #2151 PR B decision.d2).
-- This file closes both gaps for BANGALORE ONLY, so T4-T9 (#1713 PR-3 canonical E2E specs) share one
-- city and one graph.
--
-- WHAT THIS FILE DOES NOT DO: it does not add any additional residential [E2E] listing inside the
-- seeded nav-node AREA leaves. `navigation-hierarchy-fixture-listings-seed.sql` (#1956 PR-5) already
-- seeds 9 LIVE [E2E] listings across those exact leaves — 4 under d:southeast (RR Nagar x2,
-- Vijayanagar, Nagarbhavi), 2 under d:northeast's Local Destination cluster (Hoskote,
-- Kannamangala - Whitefield Hoskote Road), 3 under d:southwest (Deepanjali Nagar, Gnana Bharathi,
-- Chandra Layout Extension) — live-verified present in the fixture DB before writing this file
-- (`SELECT id, title, area_key FROM property_listings WHERE title LIKE '[E2E]%'`). That set already
-- gives T6 a clean cross-Direction positive/negative pair (e.g. a d:southeast RR Nagar listing vs. a
-- d:northeast Hoskote listing), so duplicating listings here would add fixture surface with no new
-- test coverage. This file only adds what does NOT already exist: schools and agri data.
--
-- SAFETY / SCOPE — identical contract to navigation-hierarchy-fixture-seed.sql:
--   - TEST/LOCAL USE ONLY. ADDITIVE ONLY. No TRUNCATE/DELETE/UPDATE of any row this script did not
--     itself insert. Every INSERT is guarded by ON CONFLICT DO NOTHING against fixed, deterministic
--     UUIDs / the real unique constraints, so a second run is a true no-op.
--   - Reuses the SAME synthetic [E2E] broker account already seeded by discover-smoke-seed.sql
--     (a1b2c3d4-e5f6-7890-abcd-ef1234567890) for the agri listings' created_by — verified present
--     before writing this file (navigation-hierarchy-fixture-listings-seed.sql's own broker-ensure
--     DO-block already asserts it).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- PART (b) — SCHOOLS. Places 2 school rows so their V80 BEFORE INSERT trigger-computed area_key
-- resolves to seeded Bangalore AREA leaves under d:southeast.
--
-- V80 trigger mechanism (apps/api/src/main/resources/db/migration/V80__school_area_key_trigger.sql,
-- read in full before writing this file): on INSERT, if district + lat/lon are present, it
-- normalises district ('bengaluru urban'/'bangalore urban'/'bangalore' -> 'bengaluru'; 'Bengaluru'
-- itself already lowercases to that same token) and assigns area_key = the NEAREST areas row in the
-- SAME normalised district within 10km (ORDER BY ST_Distance ASC, area_key ASC tiebreak). To make
-- the resolution UNAMBIGUOUS against Bangalore's 300+ other `areas` rows in the same district, each
-- school below is placed at the EXACT geo_center_lat/lon of its target area (distance = 0), which is
-- always strictly closer than any other area — live-verified by reading
-- `SELECT area_key, geo_center_lat, geo_center_lon, district FROM areas WHERE area_key IN
-- ('IN|KA|Bengaluru|RR Nagar', 'IN|KA|Bengaluru|Vijayanagar')` against this fixture DB:
--   IN|KA|Bengaluru|RR Nagar      -> 12.9314733, 77.5290964, district='Bengaluru'
--   IN|KA|Bengaluru|Vijayanagar   -> 12.9687771, 77.5298306, district='Bengaluru'
-- Both are AREA leaves under d:southeast (navigation-hierarchy-fixture-seed.sql), so a school-first
-- node=d:southeast query aggregates both schools' counts, and the school-search box (same shell,
-- same node) surfaces their literal names — see discover-school-first.canonical.ts's docstring for
-- why this is the assertable surface at node level (SchoolsInAreaPanel's per-area school LIST is
-- out of scope — already component-tested at SchoolsInAreaPanel.school-first-redesign.test.tsx).
--
-- Fixed UUIDs (deterministic, idempotent via ON CONFLICT (id) DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
  v_city_id INTEGER;
BEGIN
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bangalore';
  IF v_city_id IS NULL THEN
    RAISE EXCEPTION 'navigation-hierarchy-schools-agri-fixture-seed: no cities row with slug=bangalore — aborting';
  END IF;
END $$;

INSERT INTO public.schools (id, name, board_type, latitude, longitude, address, district, source, state)
VALUES
  ('f1713003-0000-0000-0000-000000000001',
   '[E2E] RR Nagar Fixture Public School', 'State Board',
   12.9314733, 77.5290964, 'RR Nagar, Bengaluru', 'Bengaluru', 'E2E-FIXTURE', 'Karnataka'),
  ('f1713003-0000-0000-0000-000000000002',
   '[E2E] Vijayanagar Fixture Public School', 'CBSE',
   12.9687771, 77.5298306, 'Vijayanagar, Bengaluru', 'Bengaluru', 'E2E-FIXTURE', 'Karnataka'),
  -- #2427: 4 schools inside Koramangala, for the d:central branch added to
  -- navigation-hierarchy-fixture-seed.sql. e2e/discover-schools-canonical-2124.spec.ts documents
  -- the real hosted shape it was written against as "Koramangala schoolCount=4" alongside a
  -- schoolCount=0 BTM Layout sibling, so 4 is the real count, not a round number chosen here.
  --
  -- Coordinates sit tightly around Koramangala's real centre (12.9352, 77.6245 --
  -- V71__cities_and_areas.sql:68) with +/-0.001 offsets. That keeps all four inside Koramangala's
  -- real bbox (12.9200-12.9500, 77.6000-77.6500) and, critically, well clear of BTM Layout's
  -- (12.909752-12.924726, 77.606606-77.618837), whose box overlaps Koramangala's south-west corner.
  -- BTM Layout must resolve to ZERO schools for the #2124 "review gap 2" test to mean anything, so
  -- the separation is deliberate and is asserted below rather than assumed.
  ('f1713003-0000-0000-0000-000000000003',
   '[E2E] Koramangala Fixture Public School', 'State Board',
   12.9352, 77.6245, 'Koramangala, Bengaluru', 'Bengaluru', 'E2E-FIXTURE', 'Karnataka'),
  ('f1713003-0000-0000-0000-000000000004',
   '[E2E] Koramangala Fixture CBSE School', 'CBSE',
   12.9362, 77.6255, 'Koramangala, Bengaluru', 'Bengaluru', 'E2E-FIXTURE', 'Karnataka'),
  ('f1713003-0000-0000-0000-000000000005',
   '[E2E] Koramangala Fixture ICSE School', 'ICSE',
   12.9342, 77.6235, 'Koramangala, Bengaluru', 'Bengaluru', 'E2E-FIXTURE', 'Karnataka'),
  ('f1713003-0000-0000-0000-000000000006',
   '[E2E] Koramangala Fixture International School', 'CBSE',
   12.9345, 77.6252, 'Koramangala, Bengaluru', 'Bengaluru', 'E2E-FIXTURE', 'Karnataka')
ON CONFLICT (id) DO NOTHING;

-- Query-back validation: the V80 trigger must have resolved area_key to the expected AREA leaves.
-- This is NOT optional — per the escalation_rules.fixture_geometry_vacuous_pass_risk guardrail, a
-- wrong FK fails loud (good) but a silently-wrong GEOMETRY produces an empty-but-valid result,
-- which this assertion exists to catch at seed time rather than at E2E time.
DO $$
DECLARE
  v_rr_nagar_area_key TEXT;
  v_vijayanagar_area_key TEXT;
  v_koramangala_schools INTEGER;
  v_btm_schools INTEGER;
BEGIN
  SELECT area_key INTO v_rr_nagar_area_key FROM public.schools
    WHERE id = 'f1713003-0000-0000-0000-000000000001';
  SELECT area_key INTO v_vijayanagar_area_key FROM public.schools
    WHERE id = 'f1713003-0000-0000-0000-000000000002';

  IF v_rr_nagar_area_key IS DISTINCT FROM 'IN|KA|Bengaluru|RR Nagar' THEN
    RAISE EXCEPTION 'Seed assertion failed: expected RR Nagar fixture school to resolve area_key='
      '''IN|KA|Bengaluru|RR Nagar'' via the V80 trigger, got %', v_rr_nagar_area_key;
  END IF;

  IF v_vijayanagar_area_key IS DISTINCT FROM 'IN|KA|Bengaluru|Vijayanagar' THEN
    RAISE EXCEPTION 'Seed assertion failed: expected Vijayanagar fixture school to resolve area_key='
      '''IN|KA|Bengaluru|Vijayanagar'' via the V80 trigger, got %', v_vijayanagar_area_key;
  END IF;

  -- #2427: the Koramangala/BTM Layout pair the #2124 specs depend on. Both halves are asserted,
  -- because the zero half is the one that can silently rot: if a future geometry change pulled one
  -- of these four schools into BTM Layout's overlapping box, "review gap 2" would still PASS while
  -- no longer testing a zero-school AREA at all. That is exactly the vacuous pass this file's
  -- fixture_geometry_vacuous_pass_risk guardrail exists to catch at seed time.
  SELECT COUNT(*) INTO v_koramangala_schools FROM public.schools
    WHERE area_key = 'IN|KA|Bengaluru|Koramangala' AND source = 'E2E-FIXTURE';
  SELECT COUNT(*) INTO v_btm_schools FROM public.schools
    WHERE area_key = 'IN|KA|Bengaluru|BTM Layout';

  IF v_koramangala_schools IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected exactly 4 E2E fixture schools to resolve to '
      '''IN|KA|Bengaluru|Koramangala'' via the V80 trigger, got %', v_koramangala_schools;
  END IF;

  IF v_btm_schools IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected ZERO schools in ''IN|KA|Bengaluru|BTM Layout'' '
      '(the #2124 review-gap-2 zero-school AREA), got %', v_btm_schools;
  END IF;

  RAISE NOTICE 'navigation-hierarchy-schools-agri-fixture-seed: schools resolved area_key % / %; '
    'Koramangala=% schools, BTM Layout=% schools',
    v_rr_nagar_area_key, v_vijayanagar_area_key, v_koramangala_schools, v_btm_schools;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- PART (c) — AGRI-ELIGIBLE LISTINGS. property_type='agricultural_land', LIVE, inside the same RR
-- Nagar AREA leaf (area_key already FK-valid — used by both the residential and agri seeds; no
-- collision, different table). Matches the shared eligibility predicate
-- (AgriDestinationPortPostgresAdapter#AGRI_BASE_PREDICATE_GUARDS): 4-segment area_key (confirmed —
-- 'IN|KA|Bengaluru|RR Nagar' splits into exactly 4 pipe-delimited segments) and
-- area_resolution_status='RESOLVED' (table DEFAULT — confirmed via
-- `information_schema.columns` against this fixture DB: area_resolution_status TEXT NOT NULL
-- DEFAULT 'RESOLVED', so no explicit value needed on INSERT).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_broker_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_broker_id) THEN
    RAISE EXCEPTION 'navigation-hierarchy-schools-agri-fixture-seed: expected synthetic [E2E] broker % '
      'from discover-smoke-seed.sql to already exist — aborting rather than creating a new identity',
      v_broker_id;
  END IF;
END $$;

INSERT INTO public.property_listings
  (id, property_type, title, locality, price, latitude, longitude,
   status, created_by, price_paise, area_key, is_valid, address_confirmed, listing_purpose,
   created_at, updated_at)
VALUES
  ('f1713004-0000-0000-0000-000000000001',
   'agricultural_land', '[E2E] RR Nagar Fixture Agri Parcel One', 'RR Nagar',
   0, 12.9316000, 77.5292000,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   35000000, 'IN|KA|Bengaluru|RR Nagar', true, true, 'sale', NOW(), NOW()),

  ('f1713004-0000-0000-0000-000000000002',
   'agricultural_land', '[E2E] RR Nagar Fixture Agri Parcel Two', 'RR Nagar',
   0, 12.9313000, 77.5289000,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   42000000, 'IN|KA|Bengaluru|RR Nagar', true, true, 'sale', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- PART (d) — agri_destination_classification (V125). NORMALLY written only by
-- CityLaunchPromotionService.promoteAgriDestinationClassification — this table is EMPTY for every
-- city on this fixture (confirmed by `SELECT COUNT(*) FROM agri_destination_classification` before
-- writing this file: 0 rows). Without at least one row for an active city, the backend fails closed
-- with 503 AGRI_DESTINATIONS_NOT_YET_PROMOTED (correction c7). PRECEDENT for seeding a normally-
-- service-generated table directly: navigation-hierarchy-fixture-seed.sql already does exactly this
-- for navigation_nodes.
--
-- FK verification (read before writing, never guessed):
--   regional_directions.direction_key  seeded 8 rows (V87): N, NE, E, SE, S, SW, W, NW.
--   regional_distance_bands.band_key   seeded 4 rows (V87): 0_10, 10_25, 25_50, 50_up.
--   cities.geo_center_lat/lon for bangalore (city_id=1, confirmed via SELECT): 12.9716, 77.5946 —
--     used verbatim as origin_lat/origin_lon per V125's "PREPARE time snapshot" column contract.
--
-- direction_key / distance_km / bearing_deg are NOT invented: computed via the standard great-circle
-- initial-bearing formula (bearing = atan2(sin(dlon)*cos(lat2), cos(lat1)*sin(lat2) -
-- sin(lat1)*cos(lat2)*cos(dlon))) and haversine distance from the Bangalore origin above to each
-- area's REAL geo_center_lat/lon (read from `areas`, same values cited in PART (b) for RR Nagar; +
-- Vijayanagar 12.9687771,77.5298306):
--   RR Nagar     -> bearing=237.85 deg -> SW sector [202.5,247.5) -> distance=8.384 km -> band 0_10
--   Vijayanagar  -> bearing=267.45 deg -> W  sector [247.5,292.5) -> distance=7.025 km -> band 0_10
-- (8-sector compass boundaries per V87's own header comment.)
--
-- T8/T9 (discover-agri-first.canonical.ts) deliberately query region=SW&maxKm=25: RR Nagar (SW,
-- 8.384km) matches; Vijayanagar is direction W and is correctly EXCLUDED by the direction_key
-- filter, giving T8/T9 a single, unambiguous, non-empty destination bucket backed by the 2 RR Nagar
-- agri parcels seeded in PART (c) above.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agri_destination_classification
  (city_id, area_key, origin_lat, origin_lon, distance_km, bearing_deg, direction_key,
   distance_band_key, generator_version, generated_at)
SELECT c.id, v.area_key, 12.9716, 77.5946, v.distance_km, v.bearing_deg, v.direction_key,
       v.distance_band_key, 'e2e-1713-pr3-fixture-seed-v1', NOW()
FROM (VALUES
    ('IN|KA|Bengaluru|RR Nagar',    8.384::double precision, 237.85::double precision, 'SW', '0_10'),
    ('IN|KA|Bengaluru|Vijayanagar', 7.025::double precision, 267.45::double precision, 'W',  '0_10')
) AS v(area_key, distance_km, bearing_deg, direction_key, distance_band_key)
JOIN public.cities c ON c.slug = 'bangalore'
ON CONFLICT (city_id, area_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Validation assertions — sanity-check THIS seed's own rows only.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_city_id             INTEGER;
  v_agri_dest_count     INTEGER;
  v_rr_nagar_agri_count INTEGER;
BEGIN
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bangalore';

  SELECT COUNT(*) INTO v_agri_dest_count
    FROM public.agri_destination_classification WHERE city_id = v_city_id;

  SELECT COUNT(*) INTO v_rr_nagar_agri_count
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND property_type = 'agricultural_land'
      AND area_key = 'IN|KA|Bengaluru|RR Nagar';

  IF v_agri_dest_count < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 agri_destination_classification rows for '
      'Bangalore, got %', v_agri_dest_count;
  END IF;

  IF v_rr_nagar_agri_count < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 LIVE agricultural_land listings for RR '
      'Nagar, got %', v_rr_nagar_agri_count;
  END IF;

  RAISE NOTICE 'navigation-hierarchy-schools-agri-fixture-seed assertions passed: % agri_destination_'
    'classification rows for Bangalore, % LIVE agri listings for RR Nagar',
    v_agri_dest_count, v_rr_nagar_agri_count;
END $$;

COMMIT;
