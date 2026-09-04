-- scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql
--
-- Issue #1956 PR-5 — additive navigation_nodes fixture for the LOCAL/TEST-ONLY fixture Postgres
-- only (scripts/dev/local-fixture-backend.sh). Never run against a production or shared Supabase
-- database.
--
-- WHY THIS EXISTS (per the explicit user ruling on PR #2056, comment 5139969300):
--   1. PR-3's e2e/discover/issue-1956-pr3-area-clustering.spec.ts depends on a dense-cluster
--      navigation shape (a Direction with >=2 close-together AREA children) that was previously
--      HAND-INSERTED into this same disposable fixture container during a prior session and NEVER
--      COMMITTED — so its evidence is not reproducible today. This script replaces that anti-pattern
--      with a committed, idempotent, additive seed.
--   2. PR-5's mobile full-depth breadcrumb case (City > Direction > Local Destination > AREA) is
--      currently unreachable: no existing Bangalore navigation_nodes AREA leaf has a CLUSTER
--      ("Local Destination") ancestor.
--
-- SAFETY / SCOPE (non-negotiable, see the ruling):
--   - TEST/LOCAL USE ONLY. This file must never be pointed at a production or shared database.
--   - ADDITIVE ONLY. No TRUNCATE, no DELETE, no UPDATE of any existing row in navigation_nodes or
--     any other table. Every INSERT below is guarded by `ON CONFLICT (city_id, node_key) DO NOTHING`
--     against the real uq_navigation_nodes_city_node_key constraint (V121), so a second run is a
--     true no-op — see the idempotency proof in the accompanying workdone evidence.
--   - d:w/Basaveshwara Nagar and d:s/Hosahalli, if present at all, are rows hand-seeded into a
--     disposable container by an earlier, UNCOMMITTED PR-2/3/4 session — they are NOT part of this
--     committed seed and DO NOT exist on a clean fixture restore. This script never inserts,
--     restores, or otherwise reproduces them, and never assumes their presence. All root DIRECTION
--     display_order values below are numbered as a GAPLESS 1..N sequence starting from a clean,
--     empty navigation_nodes table (1=d:southeast, 2=d:northeast, 3=d:southwest) — not continued
--     from any prior/uncommitted d:w(1)/d:s(2) numbering, which would leave a non-gapless root
--     sibling sequence on a clean restore and fail NavigationTreeValidationService's
--     INVALID_SIBLING_ORDERING check for the whole city tree.
--
-- WHAT THIS SCRIPT ADDS — two new DIRECTION (root) trees for Bangalore (city_id resolved by slug),
-- both structurally valid per NavigationTreeValidationService's checks #1-#14 (verified by hand:
-- gapless per-parent display_order, correct descendant_area_count, ancestor_keys equal to the
-- actual root->parent chain, CLUSTER never one-child, no node past depth 2, every AREA/CLUSTER's
-- region_key equal to its DIRECTION ancestor's region_key):
--
--   root
--     -> d:southeast "South-East Bangalore" (DIRECTION, region_key='southeast', NEW)
--          -> a:...RR Nagar     (AREA, depth 1)  \
--          -> a:...Vijayanagar  (AREA, depth 1)   |- 3 real Bangalore area_key rows (V106 geography),
--          -> a:...Nagarbhavi   (AREA, depth 1)  /   given deliberately close SYNTHETIC centre_lat/
--             lon (~10-15m apart, matching PR-3's own documented approach — navigation_nodes carries
--             its OWN centre columns, independent of areas.geo_center_*) so the client-side pixel-
--             grid clusterer (areaClustering.ts) groups all three into ONE visual cluster cell at
--             any zoom/viewport a test runs at. This closes gap #1 (mobile visual-cluster sheet).
--
--     -> d:northeast "North-East Bangalore" (DIRECTION, region_key='northeast', NEW)
--          -> c:northeast:hoskote-kannamangala-whitefield-hoskote-road
--             "Kannamangala - Hoskote Corridor" (CLUSTER = "Local Destination", depth 1, 2 children
--             so it is never a degenerate one-child cluster)
--               -> a:...Hoskote                              (AREA, depth 2)
--               -> a:...Kannamangala - Whitefield Hoskote Road (AREA, depth 2 — deliberately a REAL,
--                  LONG Bangalore area name (39 chars) so the full 4-crumb breadcrumb trail
--                  "Bangalore > North-East Bangalore > Kannamangala - Hoskote Corridor > Kannamangala
--                  - Whitefield Hoskote Road" is a genuinely hard case for AC5.9's un-clipped-at-
--                  390x844 assertion, never the shortest available fixture name.)
--          This closes gap #2 (full-depth City -> Direction -> Local Destination -> AREA path).
--
-- All five AREA leaves (RR Nagar, Vijayanagar, Nagarbhavi, Hoskote, Kannamangala - Whitefield
-- Hoskote Road) are REAL Bangalore geography rows already present in public.areas from the V106
-- migration — only their navigation_nodes position/parentage is fixture-only, non-committed-
-- elsewhere data. None of the five was previously used as a navigation_nodes AREA leaf for this
-- city (confirmed below by the pre-flight NOT EXISTS guards), so no uq_navigation_nodes_city_area
-- collision is possible.
--
-- NODE VISIBILITY (documented, not performed by this script): the backend's NavigationGraphCache
-- only reloads a city's tree on (a) its own eager startup preload, or (b) a
-- CityNavigationRevisionPromoted event — NEVER on a raw navigation_nodes write. This script does
-- NOT restart or otherwise mutate the shared backend process. See
-- scripts/dev/seed-navigation-hierarchy-fixture.sh for the safe way to make these rows visible: a
-- SEPARATE backend process on an unused port, started fresh (so its own eager preload picks up
-- these rows), against the SAME fixture database — never the shared 8081 process.
--
-- Listing counts: this script adds ONLY navigation_nodes rows, never property_listings. The new
-- areas' matchingAreaCount/listing counts will read 0 until a separate, explicitly-scoped listings
-- seed is added — out of scope for this fixture (navigation-shape-only) seed.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Resolve Bangalore's city_id once (fails loudly if the city row is ever renamed/removed,
--    rather than silently inserting nothing under a NULL city_id).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_city_id INTEGER;
BEGIN
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bangalore';
  IF v_city_id IS NULL THEN
    RAISE EXCEPTION 'navigation-hierarchy-fixture-seed: no cities row with slug=bangalore — aborting';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Direction d:southeast "South-East Bangalore" — dense AREA cluster (gap #1)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'southeast', 'DIRECTION', NULL, 'd:southeast', NULL, ARRAY[]::text[],
       'South-East Bangalore', 1, 0, ARRAY[]::text[], 3,
       12.95000, 77.52503, 12.94995, 77.52490, 12.95010, 77.52515,
       'e2e-1956-pr5-fixture-seed-v1', NOW()
FROM public.cities c
WHERE c.slug = 'bangalore'
ON CONFLICT (city_id, node_key) DO NOTHING;

-- 3 real Bangalore AREA leaves under d:southeast, given deliberately close synthetic centres
-- (~10-15m apart) so the client-side pixel-grid clusterer groups them into one visual cluster.
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'southeast', 'AREA', parent.id, v.node_key, v.area_key, ARRAY[v.area_key],
       v.display_label, v.display_order, 1, ARRAY['d:southeast']::text[], 1,
       v.centre_lat, v.centre_lon, v.centre_lat, v.centre_lon, v.centre_lat, v.centre_lon,
       'e2e-1956-pr5-fixture-seed-v1', NOW()
FROM (VALUES
    ('a:IN|KA|Bengaluru|RR Nagar',    'IN|KA|Bengaluru|RR Nagar',    'RR Nagar',    1, 12.94995::numeric, 77.52490::numeric),
    ('a:IN|KA|Bengaluru|Vijayanagar', 'IN|KA|Bengaluru|Vijayanagar', 'Vijayanagar', 2, 12.95005::numeric, 77.52505::numeric),
    ('a:IN|KA|Bengaluru|Nagarbhavi',  'IN|KA|Bengaluru|Nagarbhavi',  'Nagarbhavi',  3, 12.95000::numeric, 77.52515::numeric)
) AS v(node_key, area_key, display_label, display_order, centre_lat, centre_lon)
JOIN public.cities c ON c.slug = 'bangalore'
JOIN public.navigation_nodes parent ON parent.city_id = c.id AND parent.node_key = 'd:southeast'
-- pre-flight: only insert if this area_key has never been used as an AREA leaf for this city
WHERE NOT EXISTS (
    SELECT 1 FROM public.navigation_nodes existing
    WHERE existing.city_id = c.id AND existing.node_type = 'AREA' AND existing.area_key = v.area_key
)
ON CONFLICT (city_id, node_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Direction d:northeast "North-East Bangalore" -> Local Destination (CLUSTER) -> 2 AREA leaves
--    (gap #2: full-depth City -> Direction -> Local Destination -> AREA breadcrumb path)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'northeast', 'DIRECTION', NULL, 'd:northeast', NULL, ARRAY[]::text[],
       'North-East Bangalore', 2, 0, ARRAY[]::text[], 2,
       13.0311553, 77.7610742, 13.0304663, 77.7602705, 13.0318443, 77.7618779,
       'e2e-1956-pr5-fixture-seed-v1', NOW()
FROM public.cities c
WHERE c.slug = 'bangalore'
ON CONFLICT (city_id, node_key) DO NOTHING;

-- Local Destination CLUSTER under d:northeast (2 members — never a degenerate one-child cluster).
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'northeast', 'CLUSTER', parent.id,
       'c:northeast:hoskote-kannamangala-whitefield-hoskote-road', NULL,
       ARRAY['IN|KA|Bengaluru|Hoskote', 'IN|KA|Bengaluru|Kannamangala - Whitefield Hoskote Road'],
       'Kannamangala - Hoskote Corridor', 1, 1, ARRAY['d:northeast']::text[], 2,
       13.0311553, 77.7610742, 13.0304663, 77.7602705, 13.0318443, 77.7618779,
       'e2e-1956-pr5-fixture-seed-v1', NOW()
FROM public.cities c
JOIN public.navigation_nodes parent ON parent.city_id = c.id AND parent.node_key = 'd:northeast'
WHERE c.slug = 'bangalore'
ON CONFLICT (city_id, node_key) DO NOTHING;

-- 2 real Bangalore AREA leaves under the Local Destination cluster (depth 2 — the full-depth path).
-- Kannamangala - Whitefield Hoskote Road (39 chars) is deliberately the LONGEST available real
-- Bangalore area name, so the resulting 4-crumb breadcrumb trail is a genuinely hard un-clipping
-- case, not the shortest fixture available.
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'northeast', 'AREA', cluster.id, v.node_key, v.area_key, ARRAY[v.area_key],
       v.display_label, v.display_order, 2,
       ARRAY['d:northeast', 'c:northeast:hoskote-kannamangala-whitefield-hoskote-road']::text[], 1,
       v.centre_lat, v.centre_lon, v.centre_lat, v.centre_lon, v.centre_lat, v.centre_lon,
       'e2e-1956-pr5-fixture-seed-v1', NOW()
FROM (VALUES
    ('a:IN|KA|Bengaluru|Hoskote', 'IN|KA|Bengaluru|Hoskote', 'Hoskote', 1, 13.0318443::numeric, 77.7618779::numeric),
    ('a:IN|KA|Bengaluru|Kannamangala - Whitefield Hoskote Road',
     'IN|KA|Bengaluru|Kannamangala - Whitefield Hoskote Road',
     'Kannamangala - Whitefield Hoskote Road', 2, 13.0304663::numeric, 77.7602705::numeric)
) AS v(node_key, area_key, display_label, display_order, centre_lat, centre_lon)
JOIN public.cities c ON c.slug = 'bangalore'
JOIN public.navigation_nodes cluster
     ON cluster.city_id = c.id AND cluster.node_key = 'c:northeast:hoskote-kannamangala-whitefield-hoskote-road'
WHERE NOT EXISTS (
    SELECT 1 FROM public.navigation_nodes existing
    WHERE existing.city_id = c.id AND existing.node_type = 'AREA' AND existing.area_key = v.area_key
)
ON CONFLICT (city_id, node_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Direction d:southwest "South-West Bangalore" -> 4 AREA leaves, ONE deliberately
--    zero-listing (invariant-6 / journeyVisibility eligibility-exclusion scenario).
--
--    WHY THIS EXISTS (added AFTER the initial d:southeast/d:northeast seed above): the
--    zero-listing-sibling exclusion sub-case (originally the vanished hand-inserted d:s
--    fixture's Hosahalli role) cannot be added as a 4th child of d:southeast — that
--    Direction's descendant_area_count was already committed at 3 by an earlier run of
--    this exact file, and NavigationTreeValidationService check #9 requires that stored
--    value to equal the actual structural child count on every load; adding a 4th child
--    there without an UPDATE to that existing row would create a DESCENDANT_COUNT_MISMATCH
--    that fails validation for the WHOLE city tree on the next fresh load (any isolated
--    verification backend, or the shared backend if it ever restarts) — not just for
--    d:southeast. Fixing that requires an UPDATE, which this seed's contract forbids
--    unconditionally, including against its own previously-inserted rows.
--
--    The safe route: a BRAND-NEW root DIRECTION, correct from birth. Because every row
--    here is new, its descendant_area_count is written correctly in the SAME insert —
--    there is no pre-existing stored value to contradict, so check #9 is satisfied on the
--    very first load and there is never an inconsistent window. Nothing under d:w, d:s,
--    d:southeast or d:northeast is touched.
--
--      root
--        -> d:southwest "South-West Bangalore" (DIRECTION, region_key='southwest', NEW)
--             -> a:...Deepanjali Nagar        (AREA, depth 1, 1 listing)   \
--             -> a:...Gnana Bharathi          (AREA, depth 1, 1 listing)    |- synthetic
--             -> a:...Chandra Layout Extension (AREA, depth 1, 1 listing)  /   close centres
--                (deliberately ~10-15m apart, same technique as d:southeast, so the
--                client-side pixel-grid clusterer groups these three into ONE visual
--                cluster cell)
--             -> a:...Avalahalli              (AREA, depth 1, 0 listings — NO row inserted
--                for it in navigation-hierarchy-fixture-listings-seed.sql) — excluded from
--                the map/cluster entirely by journeyVisibility's eligibility filter (which
--                runs BEFORE clustering), but still renders in the un-focused panel's
--                normal child list as a "No listings yet" leaf AREA card.
--
--    display_order=3 for d:southwest is the next free slot after d:northeast(=2) in the
--    ROOT sibling group (1,2 already used by d:southeast/d:northeast on a clean fixture restore)
--    — gapless 1..N from a clean table, no renumbering of any existing sibling required. (d:w/d:s,
--    if present at all, are uncommitted hand-seeded rows outside this script's numbering — see the
--    file header.)
--
--    All four area_keys (Deepanjali Nagar, Gnana Bharathi, Chandra Layout Extension,
--    Avalahalli) are real Bangalore geography rows already present from the V106
--    migration, and — confirmed by pre-flight query before writing this file — NONE of
--    them was previously used as a navigation_nodes AREA leaf for this city, so no
--    uq_navigation_nodes_city_area collision is possible.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'southwest', 'DIRECTION', NULL, 'd:southwest', NULL, ARRAY[]::text[],
       'South-West Bangalore', 3, 0, ARRAY[]::text[], 4,
       12.9564991, 77.5327964, 12.9459464, 77.5300000, 12.9601000, 77.5409354,
       'e2e-1956-pr5-fixture-seed-v2', NOW()
FROM public.cities c
WHERE c.slug = 'bangalore'
ON CONFLICT (city_id, node_key) DO NOTHING;

INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'southwest', 'AREA', parent.id, v.node_key, v.area_key, ARRAY[v.area_key],
       v.display_label, v.display_order, 1, ARRAY['d:southwest']::text[], 1,
       v.centre_lat, v.centre_lon, v.centre_lat, v.centre_lon, v.centre_lat, v.centre_lon,
       'e2e-1956-pr5-fixture-seed-v2', NOW()
FROM (VALUES
    ('a:IN|KA|Bengaluru|Deepanjali Nagar',
     'IN|KA|Bengaluru|Deepanjali Nagar', 'Deepanjali Nagar', 1, 12.96000::numeric, 77.53000::numeric),
    ('a:IN|KA|Bengaluru|Gnana Bharathi',
     'IN|KA|Bengaluru|Gnana Bharathi', 'Gnana Bharathi', 2, 12.96010::numeric, 77.53010::numeric),
    ('a:IN|KA|Bengaluru|Chandra Layout Extension',
     'IN|KA|Bengaluru|Chandra Layout Extension', 'Chandra Layout Extension', 3, 12.95995::numeric, 77.53015::numeric),
    -- Deliberately ZERO-listing sibling — no row for this area_key in the companion
    -- listings seed file. Not part of the close synthetic cluster (its position is
    -- irrelevant: eligibility excludes it from the map before clustering ever runs), so
    -- its centre is simply its own real geo_center.
    ('a:IN|KA|Bengaluru|Avalahalli',
     'IN|KA|Bengaluru|Avalahalli', 'Avalahalli', 4, 12.9459464::numeric, 77.5409354::numeric)
) AS v(node_key, area_key, display_label, display_order, centre_lat, centre_lon)
JOIN public.cities c ON c.slug = 'bangalore'
JOIN public.navigation_nodes parent ON parent.city_id = c.id AND parent.node_key = 'd:southwest'
WHERE NOT EXISTS (
    SELECT 1 FROM public.navigation_nodes existing
    WHERE existing.city_id = c.id AND existing.node_type = 'AREA' AND existing.area_key = v.area_key
)
ON CONFLICT (city_id, node_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. Direction d:central -> Local Destination (CLUSTER) -> BTM Layout + Koramangala   (#2427)
--
-- WHY: e2e/discover-schools-canonical-2124.spec.ts (J5 and the #2124 "review gap 2" test) pins
-- these exact canonical node keys, and they existed only in the shared hosted database. When
-- PR #2423 correctly moved the pre-push E2E gate onto an isolated ephemeral fixture, both tests
-- became structurally unsatisfiable — the fixture has never contained a Central branch. The same
-- gap already fails four other unmocked specs against this fixture (issue-2142, #2189, issue-2016,
-- and probably issue-2015), so this is a fixture-contract repair, not a change made for one spec.
-- No spec is edited to accommodate this seed.
--
-- ── PROVENANCE: REAL CANONICAL VALUES, NOT INVENTED ──
-- node_key, display_label, representative_area_keys, centre and bounds for BOTH the DIRECTION and
-- the CLUSTER are copied VERBATIM from the real generated Bangalore candidate committed by merged
-- PR #2113 — docs/audit/evidence/issue-2112/candidate-evidence.toml — as mirrored in
-- apps/web/src/features/discover/navigation/__fixtures__/candidateNavigationTree.ts (DIRECTION
-- 'd:central' and CLUSTER 'c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala').
-- That candidate was generated by the merged #2086 NavigationTreeGenerator against real Bangalore
-- geography on Testcontainers PostGIS. Note the DIRECTION's real display_label is
-- 'Langford Gardens & Lavelle Road', NOT "Central Bangalore" — the specs address it by node_key,
-- so the real label is used unchanged rather than a friendlier invented one.
--
-- The two AREA leaves use their real rows from the migrations that own them:
--   IN|KA|Bengaluru|Koramangala  -> V71__cities_and_areas.sql:68
--   IN|KA|Bengaluru|BTM Layout   -> V106__seed_bangalore_macro_region_mapping.sql:76
--
-- ── WHAT IS DERIVED, AND WHY (never presented as real generator output) ──
-- Two fields cannot be copied verbatim without breaking NavigationTreeValidationService, which this
-- file's header commits to satisfying. Both are derived to match the subtree actually seeded here:
--   * display_order — the real candidate has d:central at 1 and this cluster at 3 (it is the third
--     of several clusters under that Direction). This fixture seeds ONE cluster and appends the
--     Direction after the three that already exist, so d:central takes 4 and the cluster takes 1,
--     keeping both sibling sequences gapless (INVALID_SIBLING_ORDERING).
--   * descendant_area_count — the real Direction covers 57 areas and the real cluster 7. This seeds
--     the 2 named representative AREA leaves the specs address, so both counts are 2. Synthesising
--     the other 5 cluster members purely to reach 7 would add rows no spec references and would
--     make the count honest only in appearance. Same call, same reason, as the DERIVED_TO_COUNT
--     labelling in candidateNavigationTree.ts.
-- Every other value is real.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'central', 'DIRECTION', NULL, 'd:central', NULL,
       ARRAY['IN|KA|Bengaluru|Langford Gardens', 'IN|KA|Bengaluru|Lavelle Road'],
       'Langford Gardens & Lavelle Road', 4, 0, ARRAY[]::text[], 4,
       12.971737, 77.595829, 12.89392, 77.522663, 13.047239, 77.663592,
       'e2e-2427-central-branch-seed-v1', NOW()
FROM public.cities c
WHERE c.slug = 'bangalore'
ON CONFLICT (city_id, node_key) DO NOTHING;

-- Local Destination CLUSTER under d:central (2 members — never a degenerate one-child cluster).
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'central', 'CLUSTER', parent.id,
       'c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala', NULL,
       ARRAY['IN|KA|Bengaluru|BTM Layout', 'IN|KA|Bengaluru|Koramangala'],
       'BTM Layout & Koramangala', 2, 1, ARRAY['d:central']::text[], 2,
       12.927119, 77.618755, 12.89392, 77.594911, 12.951664, 77.65,
       'e2e-2427-central-branch-seed-v1', NOW()
FROM public.cities c
JOIN public.navigation_nodes parent ON parent.city_id = c.id AND parent.node_key = 'd:central'
WHERE c.slug = 'bangalore'
ON CONFLICT (city_id, node_key) DO NOTHING;

-- A SECOND real Local Destination under d:central — 'Jayanagar & Sanjeevini Nagar', again verbatim
-- from the #2113 candidate (real display_order 2, one above BTM Layout & Koramangala's 3, so the
-- relative order below is the real one renumbered gaplessly to 1,2).
--
-- WHY A SECOND CLUSTER IS REQUIRED, not decoration: with only ONE child, the product auto-descends
-- straight through the Local Destination level and renders its AREA grandchildren instead — the
-- documented "collapse to leaves when the split isn't meaningful" rule (NavigationTreeGenerator),
-- the same behaviour issue-1956-pr2-destination-surface.spec.ts:111 pins as "a small/shallow path
-- goes DIRECTLY to AREA children, fabricating NO Local Destination level". Observed live: after
-- clicking d:central with a single cluster child, the panel rendered "Areas with schools in BTM
-- Layout & Koramangala" with the two AREA cards, and no cluster card existed to click. J5 needs the
-- cluster to be a genuine choice, which means a real sibling — matching the real hierarchy, where
-- d:central has several clusters.
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'central', 'CLUSTER', parent.id,
       'c:central:in-ka-bengaluru-jayanagar-in-ka-bengaluru-sanjeevini-nagar', NULL,
       ARRAY['IN|KA|Bengaluru|Jayanagar', 'IN|KA|Bengaluru|Sanjeevini Nagar'],
       'Jayanagar & Sanjeevini Nagar', 1, 1, ARRAY['d:central']::text[], 2,
       12.925166, 77.581303, 12.897549, 77.564851, 12.962302, 77.61,
       'e2e-2427-central-branch-seed-v1', NOW()
FROM public.cities c
JOIN public.navigation_nodes parent ON parent.city_id = c.id AND parent.node_key = 'd:central'
WHERE c.slug = 'bangalore'
ON CONFLICT (city_id, node_key) DO NOTHING;

-- Its 2 real AREA leaves. Neither carries schools, so they cannot perturb the Koramangala=4 /
-- BTM Layout=0 pair the #2124 tests assert.
--   IN|KA|Bengaluru|Jayanagar        -> V71__cities_and_areas.sql
--   IN|KA|Bengaluru|Sanjeevini Nagar -> V106__seed_bangalore_macro_region_mapping.sql
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'central', 'AREA', cluster.id, v.node_key, v.area_key, ARRAY[v.area_key],
       v.display_label, v.display_order, 2,
       ARRAY['d:central', 'c:central:in-ka-bengaluru-jayanagar-in-ka-bengaluru-sanjeevini-nagar']::text[], 1,
       v.centre_lat, v.centre_lon, v.min_lat, v.min_lon, v.max_lat, v.max_lon,
       'e2e-2427-central-branch-seed-v1', NOW()
FROM (VALUES
    ('a:IN|KA|Bengaluru|Jayanagar', 'IN|KA|Bengaluru|Jayanagar', 'Jayanagar', 1,
     12.9250::numeric, 77.5938::numeric,
     12.9100::numeric, 77.5800::numeric, 12.9400::numeric, 77.6100::numeric),
    ('a:IN|KA|Bengaluru|Sanjeevini Nagar', 'IN|KA|Bengaluru|Sanjeevini Nagar', 'Sanjeevini Nagar', 2,
     12.9162546::numeric, 77.5891812::numeric,
     12.9159946::numeric, 77.5884968::numeric, 12.9164517::numeric, 77.5895527::numeric)
) AS v(node_key, area_key, display_label, display_order,
       centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon)
JOIN public.cities c ON c.slug = 'bangalore'
JOIN public.navigation_nodes cluster
     ON cluster.city_id = c.id
    AND cluster.node_key = 'c:central:in-ka-bengaluru-jayanagar-in-ka-bengaluru-sanjeevini-nagar'
WHERE NOT EXISTS (
    SELECT 1 FROM public.navigation_nodes existing
    WHERE existing.city_id = c.id AND existing.node_type = 'AREA' AND existing.area_key = v.area_key
)
ON CONFLICT (city_id, node_key) DO NOTHING;

-- The 2 real AREA leaves, at depth 2 under the cluster. Real centres AND real bounds from the
-- migrations named above — not the degenerate centre-as-bounds shape the synthetic dense-cluster
-- leaves above use, because these two must sit far enough apart to de-cluster into individual
-- `area-single-marker`s when the map zooms in (J5 step 2c). Their real geometry already does that:
-- ~2.3 km apart, and each leaf's bounds nest inside the cluster's, which nest inside the
-- Direction's.
--
-- BTM Layout is deliberately left WITHOUT schools in the companion schools fixture, and
-- Koramangala deliberately has 4 — that mixed zero/non-zero sibling pair inside ONE cluster is the
-- exact shape the #2124 "review gap 2" test exists to prove (a schoolCount=0 canonical AREA stays
-- visible with an honest '0 schools' literal instead of being dropped or reparented).
INSERT INTO public.navigation_nodes
  (city_id, region_key, node_type, parent_node_id, node_key, area_key, representative_area_keys,
   display_label, display_order, depth, ancestor_keys, descendant_area_count,
   centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
   policy_fingerprint, generated_at)
SELECT c.id, 'central', 'AREA', cluster.id, v.node_key, v.area_key, ARRAY[v.area_key],
       v.display_label, v.display_order, 2,
       ARRAY['d:central', 'c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala']::text[], 1,
       v.centre_lat, v.centre_lon, v.min_lat, v.min_lon, v.max_lat, v.max_lon,
       'e2e-2427-central-branch-seed-v1', NOW()
FROM (VALUES
    -- V106__seed_bangalore_macro_region_mapping.sql:76
    ('a:IN|KA|Bengaluru|BTM Layout', 'IN|KA|Bengaluru|BTM Layout', 'BTM Layout', 1,
     12.916848::numeric, 77.6110997::numeric,
     12.909752::numeric, 77.606606::numeric, 12.924726::numeric, 77.618837::numeric),
    -- V71__cities_and_areas.sql:68
    ('a:IN|KA|Bengaluru|Koramangala', 'IN|KA|Bengaluru|Koramangala', 'Koramangala', 2,
     12.9352::numeric, 77.6245::numeric,
     12.9200::numeric, 77.6000::numeric, 12.9500::numeric, 77.6500::numeric)
) AS v(node_key, area_key, display_label, display_order,
       centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon)
JOIN public.cities c ON c.slug = 'bangalore'
JOIN public.navigation_nodes cluster
     ON cluster.city_id = c.id
    AND cluster.node_key = 'c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala'
WHERE NOT EXISTS (
    SELECT 1 FROM public.navigation_nodes existing
    WHERE existing.city_id = c.id AND existing.node_type = 'AREA' AND existing.area_key = v.area_key
)
ON CONFLICT (city_id, node_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Validation assertions (fail the transaction if the seed did not land as intended). These are
--    sanity checks on THIS seed's own rows only — never a re-implementation of
--    NavigationTreeValidationService's full 14-check suite, and never a mutation.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_city_id           INTEGER;
  v_se_area_children  INTEGER;
  v_ne_cluster_areas  INTEGER;
  v_long_area_depth   INTEGER;
  v_sw_area_children  INTEGER;
  v_sw_zero_area_id   BIGINT;
  v_central_cluster_areas INTEGER;
  v_btm_depth         INTEGER;
  v_kora_depth        INTEGER;
  v_root_orders       TEXT;
BEGIN
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bangalore';

  SELECT COUNT(*) INTO v_se_area_children
    FROM public.navigation_nodes n
    JOIN public.navigation_nodes p ON p.id = n.parent_node_id
    WHERE p.city_id = v_city_id AND p.node_key = 'd:southeast' AND n.node_type = 'AREA';

  SELECT COUNT(*) INTO v_ne_cluster_areas
    FROM public.navigation_nodes n
    JOIN public.navigation_nodes p ON p.id = n.parent_node_id
    WHERE p.city_id = v_city_id
      AND p.node_key = 'c:northeast:hoskote-kannamangala-whitefield-hoskote-road'
      AND n.node_type = 'AREA';

  SELECT depth INTO v_long_area_depth
    FROM public.navigation_nodes
    WHERE city_id = v_city_id AND node_key = 'a:IN|KA|Bengaluru|Kannamangala - Whitefield Hoskote Road';

  SELECT COUNT(*) INTO v_sw_area_children
    FROM public.navigation_nodes n
    JOIN public.navigation_nodes p ON p.id = n.parent_node_id
    WHERE p.city_id = v_city_id AND p.node_key = 'd:southwest' AND n.node_type = 'AREA';

  SELECT id INTO v_sw_zero_area_id
    FROM public.navigation_nodes
    WHERE city_id = v_city_id AND node_key = 'a:IN|KA|Bengaluru|Avalahalli';

  IF v_se_area_children < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 AREA children under d:southeast, got %',
      v_se_area_children;
  END IF;

  IF v_ne_cluster_areas < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected >= 2 AREA children under the northeast Local '
      'Destination cluster, got %', v_ne_cluster_areas;
  END IF;

  IF v_long_area_depth IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected the full-depth AREA leaf at depth=2, got %',
      v_long_area_depth;
  END IF;

  IF v_sw_area_children IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected exactly 4 AREA children under d:southwest, got %',
      v_sw_area_children;
  END IF;

  IF v_sw_zero_area_id IS NULL THEN
    RAISE EXCEPTION 'Seed assertion failed: expected Avalahalli AREA leaf under d:southwest to exist';
  END IF;

  -- #2427: the d:central branch the schools-canonical specs address.
  SELECT COUNT(*) INTO v_central_cluster_areas
    FROM public.navigation_nodes n
    JOIN public.navigation_nodes p ON p.id = n.parent_node_id
    WHERE p.city_id = v_city_id
      AND p.node_key = 'c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala'
      AND n.node_type = 'AREA';

  SELECT depth INTO v_btm_depth FROM public.navigation_nodes
    WHERE city_id = v_city_id AND node_key = 'a:IN|KA|Bengaluru|BTM Layout';
  SELECT depth INTO v_kora_depth FROM public.navigation_nodes
    WHERE city_id = v_city_id AND node_key = 'a:IN|KA|Bengaluru|Koramangala';

  IF (SELECT COUNT(*) FROM public.navigation_nodes n
        JOIN public.navigation_nodes p ON p.id = n.parent_node_id
        WHERE p.city_id = v_city_id AND p.node_key = 'd:central' AND n.node_type = 'CLUSTER') <> 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: d:central must have exactly 2 CLUSTER children. With '
      'one, the product auto-descends through the Local Destination level and J5 has no cluster '
      'card to click.';
  END IF;

  IF v_central_cluster_areas IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected exactly 2 AREA children under the central '
      'Local Destination cluster (BTM Layout + Koramangala), got %', v_central_cluster_areas;
  END IF;

  IF v_btm_depth IS DISTINCT FROM 2 OR v_kora_depth IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected BTM Layout and Koramangala at depth=2, got % and %',
      v_btm_depth, v_kora_depth;
  END IF;

  -- Root DIRECTION display_order must stay a gapless 1..N sequence, or
  -- NavigationTreeValidationService rejects the whole city tree (INVALID_SIBLING_ORDERING).
  -- Adding d:central makes this 1,2,3,4 — asserted rather than assumed.
  SELECT string_agg(display_order::text, ',' ORDER BY display_order) INTO v_root_orders
    FROM public.navigation_nodes
    WHERE city_id = v_city_id AND node_type = 'DIRECTION' AND parent_node_id IS NULL;

  IF v_root_orders IS DISTINCT FROM '1,2,3,4' THEN
    RAISE EXCEPTION 'Seed assertion failed: root DIRECTION display_order must be a gapless 1..4 '
      'sequence after adding d:central, got [%]', v_root_orders;
  END IF;

  RAISE NOTICE 'navigation-hierarchy-fixture-seed assertions passed: d:southeast has % AREA '
    'children, northeast Local Destination cluster has % AREA children, full-depth AREA leaf at '
    'depth=%, d:southwest has % AREA children (including zero-listing Avalahalli), central Local '
    'Destination cluster has % AREA children at depth 2, root DIRECTION orders [%]',
    v_se_area_children, v_ne_cluster_areas, v_long_area_depth, v_sw_area_children,
    v_central_cluster_areas, v_root_orders;
END $$;

-- ---------------------------------------------------------------------------
-- Issue #2419 PR-2 (PR #2452) + #2420 — ONE VALID canonical CITY boundary for
-- Bangalore, so the polygon ("Draw search area") flow is runnable on the
-- isolated E2E fixture:
--   * #2420's PolygonGeographicSafetyPolicy fails CLOSED without a VALID CITY
--     row (every polygon is rejected as polygon_outside_searchable_city), and
--   * #2419 PR-2's DiscoverSummaryService.hasValidCityBoundary reads the SAME
--     row to decide polygonSearchAvailable, so with zero rows the product entry
--     never becomes live and e2e/issue-2016-result-scope-contract.spec.ts's
--     signed-in draw arm cannot run at all.
-- A generous bounding box (not OSM geometry): lon 77.35..77.85, lat 12.75..13.20
-- covers every Bangalore AREA leaf this seed creates, leaves room to draw a
-- polygon "outside the city" by panning east, and is far larger than the
-- 12 km^2 too-broad ceiling so both #2420 rejection reasons stay reachable.
-- Guarded by NOT EXISTS on (city, CITY) so a second run is a no-op; never
-- touches an existing row. TEST/LOCAL fixture only, like everything above.
-- ---------------------------------------------------------------------------
INSERT INTO public.canonical_boundary_geometry
  (city_id, entity_type, area_key, status, geom, geometry_source, imported_at, updated_at)
SELECT c.id, 'CITY', NULL, 'VALID',
       ST_GeomFromText('POLYGON((77.35 12.75, 77.85 12.75, 77.85 13.20, 77.35 13.20, 77.35 12.75))', 4326),
       'e2e-fixture-seed-2419', now(), now()
  FROM public.cities c
 WHERE lower(c.slug) = 'bangalore'
   AND NOT EXISTS (
     SELECT 1 FROM public.canonical_boundary_geometry g
      WHERE g.city_id = c.id AND g.entity_type = 'CITY'
   );

COMMIT;
