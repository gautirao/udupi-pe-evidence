-- RE-94 fix: replace NUMERIC(15,2) rupee columns with BIGINT paise columns
-- This is a schema correction — the canonical price unit across this schema is paise (BIGINT).
-- The old columns are dropped and replaced atomically inside a transaction so the table
-- is never visible in a partially-migrated state.

ALTER TABLE price_change_log
    DROP COLUMN IF EXISTS old_price,
    DROP COLUMN IF EXISTS new_price,
    ADD COLUMN IF NOT EXISTS old_price_paise BIGINT,
    ADD COLUMN IF NOT EXISTS new_price_paise BIGINT;
