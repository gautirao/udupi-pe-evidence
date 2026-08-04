-- scripts/db/fixtures/navigation-active-revision-fixture-seed.sql
--
-- Issue #2083 — additive, idempotent seed for the LOCAL/TEST-ONLY fixture Postgres only
-- (scripts/dev/local-fixture-backend.sh). Never run against a production or shared Supabase
-- database.
--
-- WHY THIS EXISTS: NavigationGraphCache / NavigationCachePreloadRunner only ever loads a city's
-- navigation tree if PublicActiveCityRevisionReader finds a row in public.city_launch_revision
-- with lifecycle_status='PROMOTED' AND superseded_by IS NULL for that city (see
-- backend/src/main/java/com/example/realestate/discover/navigation/PublicActiveCityRevisionReader.java).
-- The existing navigation-hierarchy-fixture-seed.sql (#1956) populates public.navigation_nodes
-- rows for Bangalore, but never inserts the city_launch_revision "PROMOTED" pointer row that
-- makes those nodes reachable — so GET /api/discover/cities/bangalore/navigation/resolve returns
-- {"error":"City has no active navigation hierarchy"} on a fresh fixture, and every #2083 e2e spec
-- dies at its first assertion. This is a pre-existing gap in the fixture baseline (predates the
-- #1955/#2028 promotion-gating work), unrelated to the #2083 diff itself.
--
-- WHAT THIS SCRIPT DOES — and does NOT do:
--   - Inserts exactly ONE public.city_launch_revision row for Bangalore, with
--     lifecycle_status='PROMOTED' and superseded_by=NULL, so PublicActiveCityRevisionReader's
--     query matches it.
--   - Does NOT insert, update, or otherwise touch any public.navigation_nodes row. The existing
--     navigation_nodes table has NO revision_id column at all (confirmed against V121 — it is
--     keyed by city_id only) and NavigationCachePreloadRunner's node query
--     (NavigationNodeRepository#findByCityIdInOrderByCityIdAscDepthAscDisplayOrderAsc) reads by
--     city_id, not by revision_id — the revision_id carried through
--     PublicActiveCityRevisionReader/NavigationGraphCache is purely a cache-tagging identifier
--     for drift detection and invalidation, never a join key into navigation_nodes. So this seed's
--     only job is to make the ALREADY-SEEDED Bangalore hierarchy (#1956) reachable — it invents no
--     hierarchy content (no nodes, no counts, no bounds) of its own.
--   - Deliberately does NOT seed Udupi: Udupi (city_id resolved by slug='udupi') has ZERO
--     navigation_nodes rows in this fixture today, so adding a PROMOTED pointer for it would make
--     NavigationCachePreloadRunner attempt to validate/cache an empty navigation tree for that
--     city — an outcome this script cannot verify is "trivially correct" without risking a
--     misleading passing/failing signal for #2083's assertions. Out of scope; left for a
--     follow-up fixture PR if Udupi navigation e2e coverage is needed.
--   - ADDITIVE + IDEMPOTENT: guarded by `ON CONFLICT (city_id, revision_number) DO NOTHING` against
--     the real uq (city_id, revision_number) constraint on city_launch_revision (V118), so a
--     second run is a true no-op. No UPDATE, no DELETE, no TRUNCATE of any existing row.
--
-- SAFETY / SCOPE: TEST/LOCAL FIXTURE USE ONLY. Never point this file at a production or shared
-- database — it must only ever run against the disposable pg-test-fixture container.

BEGIN;

DO $$
DECLARE
  v_city_id INTEGER;
BEGIN
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bangalore';
  IF v_city_id IS NULL THEN
    RAISE EXCEPTION 'navigation-active-revision-fixture-seed: no cities row with slug=bangalore — aborting';
  END IF;
END $$;

-- Single PROMOTED revision pointer for Bangalore. revision_number is pinned to 1 (this fixture's
-- own first-and-only launch revision) so repeated runs hit the same (city_id, revision_number)
-- row and no-op via ON CONFLICT, rather than accumulating duplicate revision numbers.
INSERT INTO public.city_launch_revision
  (city_id, revision_number, lifecycle_status, superseded_by, promoted_at)
SELECT c.id, 1, 'PROMOTED', NULL, NOW()
FROM public.cities c
WHERE c.slug = 'bangalore'
ON CONFLICT (city_id, revision_number) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Validation assertion (fail the transaction if the seed did not land as intended).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_city_id      INTEGER;
  v_promoted_id  BIGINT;
BEGIN
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bangalore';

  SELECT id INTO v_promoted_id
    FROM public.city_launch_revision
    WHERE city_id = v_city_id AND lifecycle_status = 'PROMOTED' AND superseded_by IS NULL;

  IF v_promoted_id IS NULL THEN
    RAISE EXCEPTION 'Seed assertion failed: expected a PROMOTED, non-superseded city_launch_revision '
      'row for Bangalore (city_id=%) after insert', v_city_id;
  END IF;

  RAISE NOTICE 'navigation-active-revision-fixture-seed assertion passed: Bangalore (city_id=%) has '
    'PROMOTED city_launch_revision id=%', v_city_id, v_promoted_id;
END $$;

COMMIT;
