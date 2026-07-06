-- V104.9 (TEST-ONLY): Pre-create V105's index WITHOUT CONCURRENTLY.
--
-- WHY THIS EXISTS
--   Production V105 (V105__idx_property_listings_purpose_live.sql) builds
--   idx_property_listings_live_purpose_area with CREATE INDEX CONCURRENTLY under
--   `-- flyway:no-transaction`. CONCURRENTLY blocks until every other transaction that can see
--   the table commits. In the @DataJpaTest + Testcontainers harness the Hikari pool holds
--   concurrent connections, so the concurrent build never completes and Spring context init
--   hangs forever (same failure mode documented in V89.9 for V90).
--
-- HOW THIS FIXES THE HANG (without touching production V105)
--   This migration runs at version 104.9 — immediately before V105 — and creates an index with
--   the SAME name, non-concurrently (instant on a fresh test DB). When V105 then runs
--   `CREATE INDEX CONCURRENTLY IF NOT EXISTS <same name>`, Postgres sees the name already
--   exists, emits a NOTICE, and returns immediately WITHOUT entering the concurrent build ->
--   no hang.
--
--   IF NOT EXISTS keys on the index name only, so the definition below is kept identical to
--   V105's purely for correctness/clarity.
--
-- NEVER deploy this migration to production. It exists only in
-- src/test/resources/db/test-stubs/ for Testcontainers @DataJpaTest tests.
CREATE INDEX IF NOT EXISTS idx_property_listings_live_purpose_area
    ON property_listings (listing_purpose, area_key)
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false;
