-- V83__listing_search_outbox_retry.sql
-- Adds bounded-retry support to the listing_search_outbox table.
-- Issue #1345 — durable retry with max-attempts, delay, and terminal DEAD state.
--
-- Changes:
--   1. Add retry_count (INT NOT NULL DEFAULT 0) — incremented on each failure attempt.
--   2. Add next_attempt_at (TIMESTAMPTZ, nullable) — NULL means "eligible now" (first
--      attempt or never-failed). Set to a future instant after a retryable failure.
--   3. Backfill: existing FAILED rows transition to DEAD (terminal, never re-polled).
--      This preserves the pre-V83 behaviour of never reprocessing already-failed events.
--   4. Drop and recreate idx_listing_search_outbox_pending (added in V82) because the
--      old predicate (status IS NULL OR status <> 'FAILED') no longer covers the new
--      query shape.
--      New predicate excludes BOTH terminal values (DEAD and FAILED):
--        published_at IS NULL AND (status IS NULL OR status NOT IN ('DEAD','FAILED'))
--      DEAD is the primary terminal state written by the poller since V83.
--      FAILED is excluded defensively to guard against any legacy, manual, or future
--      rows carrying that value (V82 wrote FAILED; the backfill above converts existing
--      ones, but belt-and-suspenders exclusion keeps the index predicate safe forever).
--
-- Design notes:
--   * Plain (non-concurrent) DROP/CREATE INDEX is used intentionally. The table is new
--     and small; the poller is disabled by default (search.indexer.enabled=false).
--     CONCURRENTLY cannot run inside a Flyway transaction.
--   * Flyway runs this migration in a single transaction, so the backfill and index
--     recreation are atomic.
-- ---------------------------------------------------------------------------

-- 1. Add new columns to listing_search_outbox.
ALTER TABLE listing_search_outbox
    ADD COLUMN retry_count      INT         NOT NULL DEFAULT 0,
    ADD COLUMN next_attempt_at  TIMESTAMPTZ;

COMMENT ON COLUMN listing_search_outbox.retry_count IS
    'Number of failed processing attempts so far. Incremented on each failure before deciding to retry or go terminal.';
COMMENT ON COLUMN listing_search_outbox.next_attempt_at IS
    'Earliest instant this entry may be re-polled after a retryable failure. NULL = eligible immediately (first attempt or re-arm not pending).';

-- 2. Backfill: existing FAILED rows → DEAD (terminal, skip forever).
--    Rows that have never been attempted (status IS NULL) are unaffected.
UPDATE listing_search_outbox
    SET status = 'DEAD'
    WHERE status = 'FAILED';

-- 3. Drop the V82 partial index whose predicate no longer matches the new eligibility query.
DROP INDEX IF EXISTS idx_listing_search_outbox_pending;

-- 4. Recreate with the updated predicate matching the rewritten findUnpublishedBatch JPQL:
--    WHERE publishedAt IS NULL
--      AND (status IS NULL OR status NOT IN ('DEAD','FAILED'))
--      AND (nextAttemptAt IS NULL OR nextAttemptAt <= :now)
--    The partial index covers the first two predicates; Postgres applies the
--    nextAttemptAt filter as a residual on the index-qualified rows.
--    Both DEAD and FAILED are excluded to match the JPQL predicate exactly.
CREATE INDEX idx_listing_search_outbox_pending
    ON listing_search_outbox (id)
    WHERE published_at IS NULL
      AND (status IS NULL OR status NOT IN ('DEAD', 'FAILED'));
