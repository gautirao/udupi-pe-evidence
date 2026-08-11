-- scripts/db/fixtures/navigation-hierarchy-fixture-listings-seed.sql
--
-- Issue #1956 PR-5 — companion to navigation-hierarchy-fixture-seed.sql.
-- LOCAL/TEST-ONLY fixture Postgres only. Never run against production or shared Supabase.
--
-- WHY THIS EXISTS: the navigation-hierarchy-fixture-seed.sql nodes alone are NOT sufficient to
-- exercise the mobile visual-cluster sheet or the full-depth breadcrumb scenario, because
-- `isMemberEligible` (src/features/discover/navigation/journeyVisibility.ts:55) requires
-- `eligibleListingCount > 0` for the 'areas' journey, and `clusterVisibleAreaMembers`
-- (src/features/discover/navigation/areaClustering.ts) applies that eligibility filter BEFORE
-- clustering — a zero-listing AREA never reaches a visual cluster. The five AREA leaves this file
-- adds listings for would otherwise be silently excluded from browse, defeating the seed's purpose.
--
-- SAFETY / SCOPE — identical contract to navigation-hierarchy-fixture-seed.sql:
--   - TEST/LOCAL USE ONLY. ADDITIVE ONLY. No TRUNCATE/DELETE/UPDATE of any row this script did not
--     itself insert. Every INSERT is guarded by `ON CONFLICT (id) DO NOTHING` against fixed,
--     deterministic UUIDs, so a second run is a true no-op.
--   - Reuses the SAME synthetic [E2E] broker account already seeded by
--     scripts/db/fixtures/discover-smoke-seed.sql (a1b2c3d4-e5f6-7890-abcd-ef1234567890) — verified
--     present before writing this file. No new auth.users/profiles row is created here.
--
-- WHAT THIS SCRIPT ADDS — one minimal LIVE [E2E] listing per new AREA leaf (never a bulk dataset):
--   RR Nagar, Vijayanagar, Nagarbhavi   (d:southeast children — dense-cluster scenario)
--   Hoskote, Kannamangala - Whitefield Hoskote Road (d:northeast -> Local Destination children —
--     full-depth breadcrumb scenario)
--   Deepanjali Nagar, Gnana Bharathi, Chandra Layout Extension (d:southwest children — dense-cluster
--     scenario, mirrors the d:southeast pattern)
--
-- Issue #2129 (PR #2134 follow-up) — SECOND independently hit-testable listing marker within the
-- RR Nagar AREA leaf itself (id ...0009). Every other AREA leaf in this file has exactly ONE
-- listing, which made a real marker-A -> preview-A -> marker-B (no Close) -> preview-B Playwright
-- proof structurally infeasible: there was no second, independently hit-testable LISTING marker
-- inside any single AREA leaf's own map view to tap (the only place 2+ AREA leaves' markers
-- coexist is their shared DIRECTION parent, where markers are deliberately ~10-15m apart so the
-- client-side clusterer merges them at any zoom — see this file's header discussion above and
-- navigation-hierarchy-fixture-seed.sql's own header).
--
-- Live-verified camera behaviour for THIS node (re-checked directly against the running app, not
-- assumed from source reading alone): RR Nagar's own `navigation_nodes` row has a DEGENERATE
-- (zero-area, single-point) bbox — `min_lat/min_lon` equal `max_lat/max_lon` equal
-- `centre_lat/centre_lon` (12.94995, 77.52490) — and `AreaPoint.bbox` (built from `public.areas`'
-- own min/max columns, `useDiscoverMapData.ts`'s `discoverAreas` derivation) is likewise
-- degenerate for this area. `AreaPanner` (src/components/map/PropertyMap.tsx) therefore ALWAYS
-- takes its `fitBounds` branch (not the flat `flyTo` branch — bbox is present, just zero-area),
-- which zero-area `fitBounds` call always lands at the `maxZoom` cap, `LEAF_FIT_MAX_ZOOM`=16
-- (src/shared/map/zoomPolicy.ts) — NOT the [13,16] range a non-degenerate bbox would allow.
-- Listing ...0001 above (`geo_center_lat/lon` from `public.areas`, ~2057m south of the node's own
-- centre point) already proves individual listing markers well outside that centre still render
-- correctly at this zoom. Listing ...0009 is offset +300m EAST of listing ...0001 (same latitude,
-- so the offset is purely horizontal) — live-verified in a real browser to render as a second,
-- fully independent, non-clustered `property-marker` DOM node (an EARLIER, larger 2km-east offset
-- was tried first and, live-verified, did NOT render as a marker at all — empirically too far
-- from the fitBounds-derived viewport for leaflet.markercluster's chunked-loading marker
-- construction to include it; do not re-widen this offset without re-verifying live). At zoom 16
-- (~2.33 m/px at this latitude) 300m is ~129px on screen — comfortably clear of
-- leaflet.markercluster's maxClusterRadius=50px (`CLUSTER_MAX_RADIUS_PX`, zoomPolicy.ts), and
-- disableClusteringAtZoom=16 (`CLUSTER_DISABLE_AT_ZOOM`) independently forces individual pins at
-- this exact zoom regardless. Deterministic and reproducible from a fresh fixture restore — no
-- reliance on incidental clustering/viewport behaviour.
--
-- Deepanjali Nagar/Gnana Bharathi/Chandra Layout Extension get a listing each; Avalahalli
-- (d:southwest's 4th AREA child, in navigation-hierarchy-fixture-seed.sql) deliberately gets NONE —
-- it is the invariant-6/journeyVisibility zero-listing-sibling exclusion case, and must stay at
-- eligibleListingCount=0 for that scenario to be real. Do not add a listing for it here.
--
-- Column set and defaults mirror discover-smoke-seed.sql's proven pattern exactly: status='LIVE',
-- is_valid=true, address_confirmed=true, price_paise set; listing_purpose/is_duplicate/archived_at
-- are left to their table defaults ('sale' / false / NULL), which already satisfy
-- DiscoverListingPredicateBuilder's blended predicate
-- (`pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false`) and the
-- 4-segment area_key guard PostgresAreaCountProvider requires.
--
-- Latitude/longitude use each area's REAL geo_center_lat/lon from public.areas (V106) — listing
-- position is unrelated to navigation_nodes' own synthetic centre columns used for map clustering.

BEGIN;

DO $$
DECLARE
  v_broker_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_broker_id) THEN
    RAISE EXCEPTION 'navigation-hierarchy-fixture-listings-seed: expected synthetic [E2E] broker % '
      'from discover-smoke-seed.sql to already exist — aborting rather than creating a new identity',
      v_broker_id;
  END IF;
END $$;

INSERT INTO public.property_listings
  (id, property_type, title, locality, price, latitude, longitude,
   status, created_by, price_paise, area_key, is_valid, address_confirmed, created_at, updated_at)
VALUES
  ('f1956005-0000-0000-0000-000000000001',
   'apartment', '[E2E] RR Nagar Fixture Apartment', 'RR Nagar',
   0, 12.9314733, 77.5290964,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   50000000, 'IN|KA|Bengaluru|RR Nagar', true, true, NOW(), NOW()),

  ('f1956005-0000-0000-0000-000000000002',
   'house', '[E2E] Vijayanagar Fixture House', 'Vijayanagar',
   0, 12.9687771, 77.5298306,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   80000000, 'IN|KA|Bengaluru|Vijayanagar', true, true, NOW(), NOW()),

  ('f1956005-0000-0000-0000-000000000003',
   'apartment', '[E2E] Nagarbhavi Fixture Apartment', 'Nagarbhavi',
   0, 12.9512353, 77.519054,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   60000000, 'IN|KA|Bengaluru|Nagarbhavi', true, true, NOW(), NOW()),

  ('f1956005-0000-0000-0000-000000000004',
   'house', '[E2E] Hoskote Fixture House', 'Hoskote',
   0, 13.0318443, 77.7618779,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   45000000, 'IN|KA|Bengaluru|Hoskote', true, true, NOW(), NOW()),

  ('f1956005-0000-0000-0000-000000000005',
   'apartment', '[E2E] Kannamangala Whitefield Hoskote Road Fixture Apartment',
   'Kannamangala - Whitefield Hoskote Road',
   0, 13.0304663, 77.7602705,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   70000000, 'IN|KA|Bengaluru|Kannamangala - Whitefield Hoskote Road', true, true, NOW(), NOW()),

  ('f1956005-0000-0000-0000-000000000006',
   'apartment', '[E2E] Deepanjali Nagar Fixture Apartment', 'Deepanjali Nagar',
   0, 12.952226, 77.529864,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   55000000, 'IN|KA|Bengaluru|Deepanjali Nagar', true, true, NOW(), NOW()),

  ('f1956005-0000-0000-0000-000000000007',
   'house', '[E2E] Gnana Bharathi Fixture House', 'Gnana Bharathi',
   0, 12.9529035, 77.5158003,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   65000000, 'IN|KA|Bengaluru|Gnana Bharathi', true, true, NOW(), NOW()),

  ('f1956005-0000-0000-0000-000000000008',
   'apartment', '[E2E] Chandra Layout Extension Fixture Apartment', 'Chandra Layout Extension',
   0, 12.958707, 77.520393,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   58000000, 'IN|KA|Bengaluru|Chandra Layout Extension', true, true, NOW(), NOW()),

  -- Issue #2129 follow-up — second, independently hit-testable RR Nagar listing marker (see
  -- header note above, incl. the live-verified zoom-16/degenerate-bbox camera behaviour and why
  -- 300m (not the initially-tried 2km) is the right offset). Same latitude as listing ...0001,
  -- +0.002696 deg longitude (~300m EAST) — purely HORIZONTAL so it stays vertically level with
  -- listing ...0001.
  ('f1956005-0000-0000-0000-000000000009',
   'house', '[E2E] RR Nagar Fixture House Two', 'RR Nagar',
   0, 12.9314733, 77.5318614,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   72000000, 'IN|KA|Bengaluru|RR Nagar', true, true, NOW(), NOW())

-- NOTE: deliberately NO row for area_key 'IN|KA|Bengaluru|Avalahalli' — see file header.

ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Validation assertions — sanity-check THIS seed's own rows only.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_se_live_count       INTEGER;
  v_ne_live_count       INTEGER;
  v_sw_live_count       INTEGER;
  v_sw_zero_live_count  INTEGER;
  v_rr_nagar_live_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_se_live_count
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND area_key IN ('IN|KA|Bengaluru|RR Nagar', 'IN|KA|Bengaluru|Vijayanagar', 'IN|KA|Bengaluru|Nagarbhavi');

  SELECT COUNT(*) INTO v_rr_nagar_live_count
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND area_key = 'IN|KA|Bengaluru|RR Nagar';

  SELECT COUNT(*) INTO v_ne_live_count
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND area_key IN ('IN|KA|Bengaluru|Hoskote', 'IN|KA|Bengaluru|Kannamangala - Whitefield Hoskote Road');

  SELECT COUNT(*) INTO v_sw_live_count
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND area_key IN ('IN|KA|Bengaluru|Deepanjali Nagar', 'IN|KA|Bengaluru|Gnana Bharathi',
                        'IN|KA|Bengaluru|Chandra Layout Extension');

  SELECT COUNT(*) INTO v_sw_zero_live_count
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND area_key = 'IN|KA|Bengaluru|Avalahalli';

  IF v_se_live_count < 4 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected at least 4 LIVE listings across the '
      'd:southeast AREA leaves (3 original + the #2129 second RR Nagar listing), got %',
      v_se_live_count;
  END IF;

  IF v_rr_nagar_live_count < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected 2 LIVE listings for RR Nagar (issue #2129 '
      'two-independent-marker scenario), got %', v_rr_nagar_live_count;
  END IF;

  IF v_ne_live_count < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected 2 LIVE listings across the d:northeast Local '
      'Destination AREA leaves, got %', v_ne_live_count;
  END IF;

  IF v_sw_live_count < 3 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected 3 LIVE listings across the d:southwest AREA '
      'leaves, got %', v_sw_live_count;
  END IF;

  IF v_sw_zero_live_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected ZERO LIVE listings for Avalahalli (the '
      'invariant-6 zero-listing-sibling case), got %', v_sw_zero_live_count;
  END IF;

  RAISE NOTICE 'navigation-hierarchy-fixture-listings-seed assertions passed: % LIVE listings across '
    'd:southeast AREA leaves (% of which are RR Nagar), % LIVE listings across d:northeast Local '
    'Destination AREA leaves, % LIVE listings across d:southwest AREA leaves, % for zero-listing '
    'Avalahalli',
    v_se_live_count, v_rr_nagar_live_count, v_ne_live_count, v_sw_live_count, v_sw_zero_live_count;
END $$;

COMMIT;
