-- V89.9 (TEST-ONLY): Pre-create V90's functional index WITHOUT CONCURRENTLY.
--
-- WHY THIS EXISTS
--   Production V90 (V90__idx_property_listings_agri_live.sql) builds
--   idx_property_listings_live_lower_type_area with CREATE INDEX CONCURRENTLY
--   under `-- flyway:no-transaction`. CONCURRENTLY blocks until every other
--   transaction that can see the table commits. In the @DataJpaTest +
--   Testcontainers harness the Hikari pool holds concurrent connections, so the
--   concurrent build never completes and Spring context init hangs forever.
--
--   The repo's other CONCURRENTLY migration (V73) uses the ${concurrently_keyword}
--   placeholder, which tests empty (spring.flyway.placeholders.concurrently_keyword=)
--   to drop CONCURRENTLY. V90 hardcoded the keyword instead, so that override has
--   no effect on it.
--
-- HOW THIS FIXES THE HANG (without touching production V90)
--   This migration runs at version 89.9 — immediately before V90 — and creates an
--   index with the SAME name, non-concurrently (instant on a fresh test DB). When
--   V90 then runs `CREATE INDEX CONCURRENTLY IF NOT EXISTS <same name>`, Postgres
--   sees the name already exists, emits a NOTICE, and returns immediately WITHOUT
--   entering the concurrent build → no hang.
--
--   IF NOT EXISTS keys on the index name only, so the definition below is kept
--   identical to V90's purely for correctness/clarity.
--
-- NEVER deploy this migration to production. It exists only in
-- src/test/resources/db/test-stubs/ for Testcontainers @DataJpaTest tests.
CREATE INDEX IF NOT EXISTS idx_property_listings_live_lower_type_area
    ON property_listings (LOWER(property_type), area_key)
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false;
