-- V37: Fix status column casing mismatch in duplicate_candidates.
--
-- V36 created the status column with lowercase CHECK values ('pending', 'confirmed',
-- 'dismissed') and a lowercase partial index (WHERE status = 'pending').
--
-- DuplicateCandidate.java uses @Enumerated(EnumType.STRING), which writes uppercase
-- values (PENDING, CONFIRMED, DISMISSED).  Any INSERT or UPDATE from the Java service
-- is rejected by the V36 CHECK constraint — production-blocking.
--
-- This migration:
--   1. Drops the existing lowercase CHECK constraint (looked up dynamically to avoid
--      depending on Postgres auto-generated constraint names).
--   2. Updates any existing rows that carry lowercase values to uppercase (safe on
--      an empty table and safe on a non-empty one).
--   3. Changes the column DEFAULT to 'PENDING'.
--   4. Adds a new CHECK constraint with uppercase values.
--   5. Recreates the partial index with WHERE status = 'PENDING'.

-- ============================================================
-- 1. Drop the existing lowercase CHECK constraint on status
--    (name is Postgres-generated, so we find it dynamically)
-- ============================================================
DO $$
DECLARE
    v_constraint text;
BEGIN
    SELECT conname
      INTO v_constraint
      FROM pg_constraint
      JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
     WHERE pg_class.relname = 'duplicate_candidates'
       AND pg_constraint.contype = 'c'
       AND pg_get_constraintdef(pg_constraint.oid) LIKE '%status IN%';

    IF v_constraint IS NOT NULL THEN
        EXECUTE 'ALTER TABLE duplicate_candidates DROP CONSTRAINT ' || quote_ident(v_constraint);
    END IF;
END $$;

-- ============================================================
-- 2. Migrate any existing rows from lowercase to uppercase
--    (no-op on an empty table)
-- ============================================================
UPDATE duplicate_candidates
   SET status = UPPER(status)
 WHERE status IN ('pending', 'confirmed', 'dismissed');

-- ============================================================
-- 3. Change the column default to uppercase
-- ============================================================
ALTER TABLE duplicate_candidates
    ALTER COLUMN status SET DEFAULT 'PENDING';

-- ============================================================
-- 4. Add new CHECK constraint with uppercase values
-- ============================================================
ALTER TABLE duplicate_candidates
    ADD CONSTRAINT duplicate_candidates_status_check
    CHECK (status IN ('PENDING', 'CONFIRMED', 'DISMISSED'));

-- ============================================================
-- 5. Recreate the partial index with uppercase predicate
-- ============================================================
DROP INDEX IF EXISTS idx_dup_candidates_pending;

CREATE INDEX IF NOT EXISTS idx_dup_candidates_pending
    ON duplicate_candidates(similarity_score DESC)
 WHERE status = 'PENDING';
