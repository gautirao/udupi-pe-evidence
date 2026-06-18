-- V92: Listing quality foundation — additive/backward-compatible schema changes.
--
-- DESIGN NOTES
-- ============
-- 1. All three new columns on property_listings are nullable with NO DEFAULT and NO backfill
--    UPDATE. Rows created before #1521 (backfill job) simply have NULL quality_score /
--    quality_breakdown / quality_computed_at. The application must treat NULL as "not yet
--    computed" and handle it gracefully. Scores become populated once #1521 runs.
--
-- 2. listing_quality_history is CREATED here but never written by this migration.
--    The insert path is owned by #1521 (scheduled backfill) and future score-recompute
--    triggers. Having the table present now lets qa wire up @DataJpaTest IT without waiting
--    for #1521.
--
-- 3. idx_listing_quality_history_listing_computed is a PLAIN (non-CONCURRENTLY) index.
--    Rationale: the table is brand-new and empty at migration time, so a plain index
--    completes instantly inside the transaction. Using CONCURRENTLY on an empty table
--    would require the "flyway:no-transaction" pragma (as in V90) and would cause the
--    same @DataJpaTest Hikari-transaction hang that V90 exhibited. Avoid it here.
--
-- 4. gen_random_uuid() is available natively in PostgreSQL 13+ (pgcrypto no longer
--    required). The postgis:15-3.4 test container satisfies this. The beforeMigrate.sql
--    test stub already enables pgcrypto for older environments; this migration relies
--    on the PG13+ built-in.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: extend property_listings with quality columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE property_listings
    ADD COLUMN quality_score        smallint,
    ADD COLUMN quality_breakdown    jsonb,
    ADD COLUMN quality_computed_at  timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: history table (append-only audit log of every score computation)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE listing_quality_history (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id   uuid        NOT NULL REFERENCES property_listings(id) ON DELETE CASCADE,
    score        smallint,
    breakdown    jsonb,
    computed_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: index for efficient "latest score for a listing" queries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_listing_quality_history_listing_computed
    ON listing_quality_history (listing_id, computed_at DESC);
