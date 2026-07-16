-- V116.9 (TEST-ONLY): relax areas.geo_center_lat/lon to nullable for Testcontainers fixtures.
--
-- WHY THIS EXISTS
--   Production `areas.geo_center_lat`/`geo_center_lon` are DOUBLE PRECISION NOT NULL (V71).
--   RegionalClassificationBackfillService's AREAS_FOR_CITY_SQL (#1899) defensively filters out
--   areas with a NULL geo-center, guarding the RegionalGeo.bearingDeg()/haversineKm() call sites
--   that previously required a per-row try/catch WARN-and-skip for this case. That guard can only
--   be proven by an IT that actually seeds a NULL-geo-center row, which the production NOT NULL
--   constraint forbids inserting on a real database.
--
--   This test-stub relaxes the constraint ONLY inside the ephemeral Testcontainers Postgres
--   instance used by @DataJpaTest ITs, so RegionalClassificationBackfillIT can seed exactly the
--   fixture the exclusion filter is meant to guard against, without touching the production
--   schema or any deployed migration.
--
-- NEVER deploy this migration to production. It exists only in
-- src/test/resources/db/test-stubs/ for Testcontainers @DataJpaTest tests.
ALTER TABLE public.areas
    ALTER COLUMN geo_center_lat DROP NOT NULL,
    ALTER COLUMN geo_center_lon DROP NOT NULL;
