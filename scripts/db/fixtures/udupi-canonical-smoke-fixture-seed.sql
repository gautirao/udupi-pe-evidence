-- scripts/db/fixtures/udupi-canonical-smoke-fixture-seed.sql
--
-- Issue #2446 — DEDICATED, ISOLATED canonical-Udupi fixture profile (owner ruling: Option 2).
--
-- WHAT THIS IS
--   The minimum truthful canonical navigation hierarchy for Udupi, so that ONE dedicated smoke
--   spec (e2e/discover-udupi-canonical-smoke.spec.ts) can exercise the real
--   Direction -> Area -> listings, school-radius and keyword journeys against a real, isolated
--   backend for the product's home city.
--
-- WHAT THIS IS NOT
--   This is NOT applied by the default fixture. scripts/db/restore-test-fixture.sh only loads it
--   when E2E_FIXTURE_PROFILE=udupi-canonical is set, and scripts/run-e2e-local.sh passes that
--   through unchanged. The default profile keeps Udupi in LEGACY rendering, exactly as before, so
--   the six legacy Udupi specs measured in docs/pr-evidence/issue-2427/option-1-blast-radius.md
--   (discover-area-cards, discover-area-nav-journey, discover-correctness-1064/1067,
--   discover-viewport, discover-opensearch-parity) keep asserting against `.area-marker`.
--
--   This is FIXTURE ISOLATION, not a product decision. Whether Udupi ships canonical navigation
--   in production is decided by the real onboarding pipeline (CityRegionOnboardingService +
--   NavigationHierarchy promotion), not by this file. See docs/pr-evidence/issue-2446/.
--
-- PROVENANCE OF THE ROWS (real Udupi geography, truthful labels)
--   * Udupi city row: already seeded by discover-smoke-seed.sql (slug 'udupi', centre
--     13.3409 N 74.7421 E, bbox lat 13.14..13.47 / lon 74.66..74.86). This file asserts it exists.
--   * Brahmavar: the taluk headquarters ~13 km NORTH of Udupi town on NH-66, at approximately
--     13.4276 N 74.7449 E. It is inside the Udupi city bbox above, north of the city centre, so a
--     Direction keyed 'n' ("North Udupi") holding Brahmavar is geographically honest. The area
--     bbox used here (lat 13.410..13.445, lon 74.725..74.765) is a ~4 km box around the town —
--     a bounding-box approximation like every other `areas` row in this repo (V113 header).
--   * Node keys: 'd:n' and 'a:IN|KA|Udupi|Brahmavar' — the exact identities the original J1
--     (e2e/discover-real-data-smoke.spec.ts before PR #2435) pinned for Udupi, so this restores
--     the ORIGINAL Udupi smoke intent rather than inventing a new one.
--   * Kaup + 'd:s' ("South Udupi"): Kaup is a real coastal town ~14 km SOUTH of Udupi on NH-66
--     whose `areas` row (13.2169 N 74.7456 E) and four LIVE [E2E] listings are ALREADY seeded by
--     discover-smoke-seed.sql. It is attached here as the single AREA under a second Direction so
--     the Udupi city root has TWO Direction destinations. Measured on the first run of this
--     profile (docs/pr-evidence/issue-2446/): with `d:n` as the ONLY root child the app lands
--     straight on `node=d:n` at zoom 18 and never renders a Direction marker at the root, so the
--     Direction -> Area hop the owner ruling asks the smoke to exercise could not be clicked.
--     Two Directions give a real root, exactly like the Bangalore fixture's `d:southeast` /
--     `d:northeast` / `d:southwest`. Kaup carries no school and sits ~23 km from the Brahmavar
--     school, so J2/J3's 2 km radius and J4's Brahmavar-scoped keyword journey are unaffected.
--   * Listings (3, all LIVE, all Brahmavar, all owned by the synthetic [E2E] broker that
--     discover-smoke-seed.sql creates): exactly ONE title contains the token "apartment", so the
--     keyword journey provably NARROWS the area's result set instead of matching everything.
--   * School (1): '[E2E] Brahmavar Fixture Government High School' placed at the SAME coordinates
--     as the apartment listing (0.000 km) with the two houses ~0.30 km east and ~0.27 km north, so
--     a 2 km school radius reaches all three while the nearest OTHER Udupi listings (Manipal /
--     Malpe, both ~9 km south) stay excluded — a passing radius assertion is genuinely about
--     Brahmavar.
--
-- IDEMPOTENCY
--   Every INSERT is guarded (ON CONFLICT DO NOTHING or NOT EXISTS) against the real unique
--   constraints, so re-running is a no-op. The closing DO block RAISEs if any row failed to land.
--
-- Column shapes mirror navigation-hierarchy-fixture-seed.sql (nodes), navigation-active-revision-
-- fixture-seed.sql (revision), discover-smoke-seed.sql (areas / schools / listings).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Pre-flight: the Udupi city row and the synthetic broker must already exist
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_city_id INTEGER;
BEGIN
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'udupi';
  IF v_city_id IS NULL THEN
    RAISE EXCEPTION 'udupi-canonical-smoke-fixture-seed: no cities row with slug=udupi — apply discover-smoke-seed.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') THEN
    RAISE EXCEPTION 'udupi-canonical-smoke-fixture-seed: synthetic [E2E] broker profile missing — apply discover-smoke-seed.sql first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Brahmavar AREA row (real geography, bbox approximation)
-- ---------------------------------------------------------------------------
INSERT INTO public.areas (area_key, city_id, name, district,
                          geo_center_lat, geo_center_lon,
                          min_lat, min_lon, max_lat, max_lon)
SELECT 'IN|KA|Udupi|Brahmavar', c.id, 'Brahmavar', 'Udupi',
       13.4276, 74.7449,
       13.4100, 74.7250, 13.4450, 74.7650
FROM public.cities c
WHERE c.slug = 'udupi'
ON CONFLICT (area_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. city_regions row 'n' ("North") + Brahmavar membership
--    Inert for the canonical journey (the map reads navigation_nodes), but it is
--    the region the Direction below is keyed on, so the hierarchy is internally
--    consistent rather than dangling.
-- ---------------------------------------------------------------------------
INSERT INTO public.city_regions
  (city_id, region_key, display_label, display_order,
   centre_lat, centre_lon, min_lat, max_lat, min_lon, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'n', 'North', 1,
       13.4276, 74.7449, 13.4100, 13.4450, 74.7250, 74.7650,
       'e2e-2446-udupi-canonical-fixture-v1', NOW()
FROM public.cities c
WHERE c.slug = 'udupi'
ON CONFLICT (city_id, region_key) DO NOTHING;

INSERT INTO public.city_region_memberships (city_id, area_key, region_key, assignment_source, generated_at)
SELECT c.id, 'IN|KA|Udupi|Brahmavar', 'n', 'AUTO', NOW()
FROM public.cities c
WHERE c.slug = 'udupi'
ON CONFLICT (city_id, area_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Canonical navigation nodes: DIRECTION d:n -> AREA a:IN|KA|Udupi|Brahmavar
-- ---------------------------------------------------------------------------
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'n', 'DIRECTION', NULL, 'd:n', NULL, ARRAY[]::text[],
       'North Udupi', 1, 0, ARRAY[]::text[], 1,
       13.4276, 74.7449, 13.4100, 74.7250, 13.4450, 74.7650,
       'e2e-2446-udupi-canonical-fixture-v1', NOW()
FROM public.cities c
WHERE c.slug = 'udupi'
ON CONFLICT (city_id, node_key) DO NOTHING;

INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'n', 'AREA', parent.id, 'a:IN|KA|Udupi|Brahmavar', 'IN|KA|Udupi|Brahmavar',
       ARRAY['IN|KA|Udupi|Brahmavar']::text[],
       'Brahmavar', 1, 1, ARRAY['d:n']::text[], 1,
       13.4276, 74.7449, 13.4100, 74.7250, 13.4450, 74.7650,
       'e2e-2446-udupi-canonical-fixture-v1', NOW()
FROM public.cities c
JOIN public.navigation_nodes parent ON parent.city_id = c.id AND parent.node_key = 'd:n'
WHERE c.slug = 'udupi'
  AND NOT EXISTS (
    SELECT 1 FROM public.navigation_nodes existing
    WHERE existing.city_id = c.id AND existing.node_type = 'AREA'
      AND existing.area_key = 'IN|KA|Udupi|Brahmavar'
  )
ON CONFLICT (city_id, node_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3b. Second Direction: d:s ("South Udupi") -> AREA a:IN|KA|Udupi|Kaup (existing area,
--     existing listings). Gives the city root two Direction destinations — see header.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.areas WHERE area_key = 'IN|KA|Udupi|Kaup') THEN
    RAISE EXCEPTION 'udupi-canonical-smoke-fixture-seed: areas row IN|KA|Udupi|Kaup missing — apply discover-smoke-seed.sql first';
  END IF;
END $$;

INSERT INTO public.city_regions
  (city_id, region_key, display_label, display_order,
   centre_lat, centre_lon, min_lat, max_lat, min_lon, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 's', 'South', 2,
       13.2169, 74.7456, 13.2100, 13.2300, 74.7300, 74.7700,
       'e2e-2446-udupi-canonical-fixture-v1', NOW()
FROM public.cities c
WHERE c.slug = 'udupi'
ON CONFLICT (city_id, region_key) DO NOTHING;

INSERT INTO public.city_region_memberships (city_id, area_key, region_key, assignment_source, generated_at)
SELECT c.id, 'IN|KA|Udupi|Kaup', 's', 'AUTO', NOW()
FROM public.cities c
WHERE c.slug = 'udupi'
ON CONFLICT (city_id, area_key) DO NOTHING;

INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 's', 'DIRECTION', NULL, 'd:s', NULL, ARRAY[]::text[],
       'South Udupi', 2, 0, ARRAY[]::text[], 1,
       13.2169, 74.7456, 13.2100, 74.7300, 13.2300, 74.7700,
       'e2e-2446-udupi-canonical-fixture-v1', NOW()
FROM public.cities c
WHERE c.slug = 'udupi'
ON CONFLICT (city_id, node_key) DO NOTHING;

INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 's', 'AREA', parent.id, 'a:IN|KA|Udupi|Kaup', 'IN|KA|Udupi|Kaup',
       ARRAY['IN|KA|Udupi|Kaup']::text[],
       'Kaup', 1, 1, ARRAY['d:s']::text[], 1,
       13.2169, 74.7456, 13.2100, 74.7300, 13.2300, 74.7700,
       'e2e-2446-udupi-canonical-fixture-v1', NOW()
FROM public.cities c
JOIN public.navigation_nodes parent ON parent.city_id = c.id AND parent.node_key = 'd:s'
WHERE c.slug = 'udupi'
  AND NOT EXISTS (
    SELECT 1 FROM public.navigation_nodes existing
    WHERE existing.city_id = c.id AND existing.node_type = 'AREA'
      AND existing.area_key = 'IN|KA|Udupi|Kaup'
  )
ON CONFLICT (city_id, node_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Promote the Udupi revision — THIS is the switch that makes /navigation/resolve
--    answer canonically for Udupi. It only ever runs inside this profile.
-- ---------------------------------------------------------------------------
INSERT INTO public.city_launch_revision
  (city_id, revision_number, lifecycle_status, superseded_by, promoted_at)
SELECT c.id, 1, 'PROMOTED', NULL, NOW()
FROM public.cities c
WHERE c.slug = 'udupi'
ON CONFLICT (city_id, revision_number) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Brahmavar school (J2/J3 school-radius). geog is GENERATED from (longitude,
--    latitude) — never insert it. Mirrors discover-smoke-seed.sql's Manipal school.
-- ---------------------------------------------------------------------------
INSERT INTO public.schools (id, name, board_type, latitude, longitude, address, district, source, state)
VALUES (
  '24460000-1111-4111-8111-000000000001',
  '[E2E] Brahmavar Fixture Government High School',
  'State Board',
  13.4280,   -- latitude
  74.7455,   -- longitude
  'Brahmavar, Udupi District',
  'Udupi',
  'E2E_FIXTURE',
  'Karnataka'
)
ON CONFLICT (id) DO UPDATE
  SET name      = EXCLUDED.name,
      latitude  = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      address   = EXCLUDED.address,
      district  = EXCLUDED.district,
      source    = EXCLUDED.source;

UPDATE public.schools
SET area_key = 'IN|KA|Udupi|Brahmavar'
WHERE id = '24460000-1111-4111-8111-000000000001'
  AND area_key IS DISTINCT FROM 'IN|KA|Udupi|Brahmavar';

-- ---------------------------------------------------------------------------
-- 6. Three LIVE Brahmavar listings for the synthetic [E2E] broker
--    #1 sits ON the school (0.000 km); #2 is +0.0028 deg lon east (~0.30 km at
--    13.43 N, where 1 deg lon = 111.320 * cos(13.428 deg) = 108.28 km);
--    #3 is +0.0024 deg lat north (~0.27 km).
-- ---------------------------------------------------------------------------
INSERT INTO public.property_listings
  (id, property_type, title, locality, price, latitude, longitude,
   status, created_by, price_paise, area_key, is_valid, address_confirmed, created_at, updated_at)
VALUES
  ('e2e02446-0000-4000-8000-000000000001',
   'apartment', '[E2E] Brahmavar Fixture Apartment', 'Brahmavar',
   0, 13.4280, 74.7455,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   450000000, 'IN|KA|Udupi|Brahmavar', true, true, NOW(), NOW()),
  ('e2e02446-0000-4000-8000-000000000002',
   'house', '[E2E] Brahmavar Fixture House', 'Brahmavar',
   0, 13.4280, 74.7483,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   850000000, 'IN|KA|Udupi|Brahmavar', true, true, NOW(), NOW()),
  ('e2e02446-0000-4000-8000-000000000003',
   'house', '[E2E] Brahmavar Fixture Riverside House', 'Brahmavar',
   0, 13.4304, 74.7455,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   1200000000, 'IN|KA|Udupi|Brahmavar', true, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Assertions — fail the seed loudly if the profile did not land
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_city_id     INTEGER;
  v_direction   INTEGER;
  v_root_dirs   INTEGER;
  v_area_leaf   INTEGER;
  v_kaup_leaf   INTEGER;
  v_promoted    INTEGER;
  v_listings    INTEGER;
  v_apartments  INTEGER;
  v_school_area TEXT;
BEGIN
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'udupi';

  SELECT COUNT(*) INTO v_direction FROM public.navigation_nodes
    WHERE city_id = v_city_id AND node_key = 'd:n' AND node_type = 'DIRECTION' AND parent_node_id IS NULL;
  SELECT COUNT(*) INTO v_area_leaf FROM public.navigation_nodes n
    JOIN public.navigation_nodes p ON p.id = n.parent_node_id
    WHERE n.city_id = v_city_id AND n.node_key = 'a:IN|KA|Udupi|Brahmavar'
      AND n.node_type = 'AREA' AND p.node_key = 'd:n';
  SELECT COUNT(*) INTO v_root_dirs FROM public.navigation_nodes
    WHERE city_id = v_city_id AND node_type = 'DIRECTION' AND parent_node_id IS NULL;
  SELECT COUNT(*) INTO v_kaup_leaf FROM public.navigation_nodes n
    JOIN public.navigation_nodes p ON p.id = n.parent_node_id
    WHERE n.city_id = v_city_id AND n.node_key = 'a:IN|KA|Udupi|Kaup'
      AND n.node_type = 'AREA' AND p.node_key = 'd:s';
  SELECT COUNT(*) INTO v_promoted FROM public.city_launch_revision
    WHERE city_id = v_city_id AND lifecycle_status = 'PROMOTED' AND superseded_by IS NULL;
  SELECT COUNT(*) INTO v_listings FROM public.property_listings
    WHERE status = 'LIVE' AND area_key = 'IN|KA|Udupi|Brahmavar' AND title LIKE '[E2E]%';
  SELECT COUNT(*) INTO v_apartments FROM public.property_listings
    WHERE status = 'LIVE' AND area_key = 'IN|KA|Udupi|Brahmavar' AND title LIKE '[E2E]%'
      AND LOWER(title) LIKE '%apartment%';
  SELECT area_key INTO v_school_area FROM public.schools
    WHERE id = '24460000-1111-4111-8111-000000000001';

  IF v_direction <> 1 THEN
    RAISE EXCEPTION 'udupi-canonical-smoke-fixture-seed: expected 1 root DIRECTION d:n for Udupi, got %', v_direction;
  END IF;
  IF v_area_leaf <> 1 THEN
    RAISE EXCEPTION 'udupi-canonical-smoke-fixture-seed: expected AREA a:IN|KA|Udupi|Brahmavar under d:n, got %', v_area_leaf;
  END IF;
  IF v_root_dirs <> 2 THEN
    RAISE EXCEPTION 'udupi-canonical-smoke-fixture-seed: expected exactly 2 root DIRECTIONs (d:n, d:s) for Udupi, got %', v_root_dirs;
  END IF;
  IF v_kaup_leaf <> 1 THEN
    RAISE EXCEPTION 'udupi-canonical-smoke-fixture-seed: expected AREA a:IN|KA|Udupi|Kaup under d:s, got %', v_kaup_leaf;
  END IF;
  IF v_promoted <> 1 THEN
    RAISE EXCEPTION 'udupi-canonical-smoke-fixture-seed: expected exactly 1 PROMOTED non-superseded revision for Udupi, got %', v_promoted;
  END IF;
  IF v_listings < 3 THEN
    RAISE EXCEPTION 'udupi-canonical-smoke-fixture-seed: expected >= 3 LIVE [E2E] Brahmavar listings, got %', v_listings;
  END IF;
  IF v_apartments <> 1 THEN
    RAISE EXCEPTION 'udupi-canonical-smoke-fixture-seed: expected exactly 1 Brahmavar "apartment" listing (keyword must narrow), got %', v_apartments;
  END IF;
  IF v_school_area IS DISTINCT FROM 'IN|KA|Udupi|Brahmavar' THEN
    RAISE EXCEPTION 'udupi-canonical-smoke-fixture-seed: expected the Brahmavar fixture school to carry area_key IN|KA|Udupi|Brahmavar, got %', v_school_area;
  END IF;

  RAISE NOTICE 'udupi-canonical-smoke-fixture-seed assertions passed: % root DIRECTIONs (d:n -> Brahmavar, d:s -> Kaup), PROMOTED revision, % Brahmavar listings (% apartment), school area_key=%',
    v_root_dirs, v_listings, v_apartments, v_school_area;
END $$;

COMMIT;
