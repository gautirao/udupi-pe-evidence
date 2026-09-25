-- scripts/db/fixtures/area-trends-2581-udupi-navigation-seed.sql
--
-- Issue #2581 / #2702 — Udupi navigation hierarchy (PROMOTED city_launch_revision + 3
-- DIRECTION -> AREA pairs for Manipal/Brahmavar/Kaup), loaded PRE-BOOT alongside the other
-- default-profile navigation-hierarchy fixture files in this directory.
--
-- WHY THIS EXISTS (root cause, #2702 investigation)
--   AreaIntelligenceSnapshotRollupJobE2ESeedIT (apps/api/src/test/.../intelligence/) seeds this
--   SAME navigation_nodes/city_launch_revision data via JDBC, but it runs as a SEPARATE `mvn test`
--   JVM process, invoked from e2e/journey/area-trends-2581.spec.ts's `beforeAll` AFTER the E2E
--   backend has already booted and is serving traffic. That seed writes real rows to the shared
--   fixture Postgres, but the ALREADY-RUNNING backend's NavigationGraphCache (an in-memory,
--   per-city cache loaded once at boot by NavigationCachePreloadRunner) has no way to learn about
--   it: NavigationGraphRefreshListener only reacts to a CityNavigationRevisionPromoted Spring
--   ApplicationEvent published IN-PROCESS by CityLaunchPromotionService — a raw cross-JVM JDBC
--   INSERT publishes no such event — and NavigationHierarchySafetyPoller (the only other refresh
--   path) is a @Scheduled poller, which scripts/run-e2e-local.sh disables entirely
--   (SPRING_TASK_SCHEDULING_ENABLED=false, #2114/SchedulingSuppressionConfig, the same flag that
--   suppresses AreaIntelligenceSnapshotRollupJob's own nightly cron). So GET
--   /api/discover/cities/udupi/navigation/... 404s for the whole Playwright run regardless of the
--   JDBC seed succeeding — verified live: the fixture DB has the correct udupi city_launch_revision
--   (PROMOTED) and navigation_nodes rows mid-run, yet the running backend still 404s every
--   navigation request for city=udupi.
--
--   Moving this same data into a file NavigationCachePreloadRunner reads BEFORE the backend
--   process starts (this file, applied during scripts/db/restore-test-fixture.sh, same as the
--   Bangalore navigation-hierarchy-fixture-seed.sql this mirrors) fixes it with zero new
--   production code: the cache's normal boot-time load path already reads exactly this data.
--   AreaIntelligenceSnapshotRollupJobE2ESeedIT keeps its own (idempotent, ON CONFLICT DO NOTHING)
--   navigation seed as a harmless no-op backstop for anyone running that JPA test standalone
--   without this file having been applied first.
--
-- SAFETY / SCOPE
--   - TEST/LOCAL USE ONLY, additive only (ON CONFLICT ... DO NOTHING against the real
--     uq_navigation_nodes_city_node_key / (city_id, revision_number) constraints), mirrors
--     navigation-hierarchy-fixture-seed.sql's own conventions.
--   - Udupi (city_id resolved by slug) is a DIFFERENT city from Bangalore's fixture rows above, so
--     its root-level DIRECTION display_order sequence is independent and starts fresh at 1,2,3 —
--     NavigationTreeValidationService's gapless-sibling check is scoped per (city_id,
--     parent_node_id IS NULL), never cross-city.
--   - node_key values use the standard "a:"-prefixed AREA_NODE_KEY_PREFIX format
--     (NavigationController.AREA_NODE_KEY_PREFIX), the same format AreaIntelligenceSnapshot-
--     RollupJobE2ESeedIT's own AREA insert now uses (see that file's own #2702 comment) — required
--     for the frontend's legacy areaKey-driven resolve path to reach an EXACT (not ANCESTOR) match.

DO $$
DECLARE
  v_city_id INT;
BEGIN
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'udupi';
  IF v_city_id IS NULL THEN
    RAISE EXCEPTION 'area-trends-2581-udupi-navigation-seed: no cities row with slug=udupi — run discover-smoke-seed.sql first';
  END IF;

  INSERT INTO public.city_launch_revision
    (city_id, revision_number, lifecycle_status, superseded_by, promoted_at)
  VALUES (v_city_id, 1, 'PROMOTED', NULL, NOW())
  ON CONFLICT (city_id, revision_number) DO NOTHING;

  -- Manipal (FULL band, 32 LIVE listings seeded separately by the JPA rollup job seed)
  INSERT INTO public.navigation_nodes
    (city_id, region_key, node_type, parent_node_id, node_key, area_key,
     representative_area_keys, display_label, display_order, depth,
     ancestor_keys, descendant_area_count,
     centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
     policy_fingerprint, generated_at)
  VALUES (v_city_id, 'e2e2581:d:full', 'DIRECTION', NULL, 'e2e2581:d:full', NULL, ARRAY[]::text[],
          'Manipal Direction', 1, 0, ARRAY[]::text[], 1,
          13.3525, 74.7864, 13.3425, 74.7764, 13.3625, 74.7964,
          'e2e-2581-2702-fixture-v1', NOW())
  ON CONFLICT (city_id, node_key) DO NOTHING;

  INSERT INTO public.navigation_nodes
    (city_id, region_key, node_type, parent_node_id, node_key, area_key,
     representative_area_keys, display_label, display_order, depth,
     ancestor_keys, descendant_area_count,
     centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
     policy_fingerprint, generated_at)
  SELECT v_city_id, 'e2e2581:d:full', 'AREA', parent.id, 'a:IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Manipal',
         ARRAY['IN|KA|Udupi|Manipal']::text[], 'Manipal', 1, 1, ARRAY['e2e2581:d:full']::text[], 1,
         13.3525, 74.7864, 13.3425, 74.7764, 13.3625, 74.7964,
         'e2e-2581-2702-fixture-v1', NOW()
  FROM public.navigation_nodes parent
  WHERE parent.city_id = v_city_id AND parent.node_key = 'e2e2581:d:full'
    AND NOT EXISTS (
      SELECT 1 FROM public.navigation_nodes existing
      WHERE existing.city_id = v_city_id AND existing.node_type = 'AREA' AND existing.area_key = 'IN|KA|Udupi|Manipal'
    )
  ON CONFLICT (city_id, node_key) DO NOTHING;

  -- Brahmavar (LIMITED band, 15 LIVE listings)
  INSERT INTO public.navigation_nodes
    (city_id, region_key, node_type, parent_node_id, node_key, area_key,
     representative_area_keys, display_label, display_order, depth,
     ancestor_keys, descendant_area_count,
     centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
     policy_fingerprint, generated_at)
  VALUES (v_city_id, 'e2e2581:d:limited', 'DIRECTION', NULL, 'e2e2581:d:limited', NULL, ARRAY[]::text[],
          'Brahmavar Direction', 2, 0, ARRAY[]::text[], 1,
          13.4534, 74.7402, 13.4434, 74.7302, 13.4634, 74.7502,
          'e2e-2581-2702-fixture-v1', NOW())
  ON CONFLICT (city_id, node_key) DO NOTHING;

  INSERT INTO public.navigation_nodes
    (city_id, region_key, node_type, parent_node_id, node_key, area_key,
     representative_area_keys, display_label, display_order, depth,
     ancestor_keys, descendant_area_count,
     centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
     policy_fingerprint, generated_at)
  SELECT v_city_id, 'e2e2581:d:limited', 'AREA', parent.id, 'a:IN|KA|Udupi|Brahmavar', 'IN|KA|Udupi|Brahmavar',
         ARRAY['IN|KA|Udupi|Brahmavar']::text[], 'Brahmavar', 1, 1, ARRAY['e2e2581:d:limited']::text[], 1,
         13.4534, 74.7402, 13.4434, 74.7302, 13.4634, 74.7502,
         'e2e-2581-2702-fixture-v1', NOW()
  FROM public.navigation_nodes parent
  WHERE parent.city_id = v_city_id AND parent.node_key = 'e2e2581:d:limited'
    AND NOT EXISTS (
      SELECT 1 FROM public.navigation_nodes existing
      WHERE existing.city_id = v_city_id AND existing.node_type = 'AREA' AND existing.area_key = 'IN|KA|Udupi|Brahmavar'
    )
  ON CONFLICT (city_id, node_key) DO NOTHING;

  -- Kaup (INSUFFICIENT band, 3 LIVE listings)
  INSERT INTO public.navigation_nodes
    (city_id, region_key, node_type, parent_node_id, node_key, area_key,
     representative_area_keys, display_label, display_order, depth,
     ancestor_keys, descendant_area_count,
     centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
     policy_fingerprint, generated_at)
  VALUES (v_city_id, 'e2e2581:d:insufficient', 'DIRECTION', NULL, 'e2e2581:d:insufficient', NULL, ARRAY[]::text[],
          'Kaup Direction', 3, 0, ARRAY[]::text[], 1,
          13.2244, 74.7423, 13.2144, 74.7323, 13.2344, 74.7523,
          'e2e-2581-2702-fixture-v1', NOW())
  ON CONFLICT (city_id, node_key) DO NOTHING;

  INSERT INTO public.navigation_nodes
    (city_id, region_key, node_type, parent_node_id, node_key, area_key,
     representative_area_keys, display_label, display_order, depth,
     ancestor_keys, descendant_area_count,
     centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon,
     policy_fingerprint, generated_at)
  SELECT v_city_id, 'e2e2581:d:insufficient', 'AREA', parent.id, 'a:IN|KA|Udupi|Kaup', 'IN|KA|Udupi|Kaup',
         ARRAY['IN|KA|Udupi|Kaup']::text[], 'Kaup', 1, 1, ARRAY['e2e2581:d:insufficient']::text[], 1,
         13.2244, 74.7423, 13.2144, 74.7323, 13.2344, 74.7523,
         'e2e-2581-2702-fixture-v1', NOW()
  FROM public.navigation_nodes parent
  WHERE parent.city_id = v_city_id AND parent.node_key = 'e2e2581:d:insufficient'
    AND NOT EXISTS (
      SELECT 1 FROM public.navigation_nodes existing
      WHERE existing.city_id = v_city_id AND existing.node_type = 'AREA' AND existing.area_key = 'IN|KA|Udupi|Kaup'
    )
  ON CONFLICT (city_id, node_key) DO NOTHING;

  ASSERT (SELECT COUNT(*) FROM public.navigation_nodes WHERE city_id = v_city_id AND node_type = 'AREA') >= 3,
    'area-trends-2581-udupi-navigation-seed: expected >=3 Udupi AREA navigation_nodes rows after seed';
  RAISE NOTICE 'area-trends-2581-udupi-navigation-seed: assertions passed — Udupi (city_id=%) has PROMOTED revision and 3 DIRECTION/AREA pairs (Manipal/Brahmavar/Kaup)', v_city_id;
END $$;
