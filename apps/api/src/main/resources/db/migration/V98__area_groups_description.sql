-- V98: area_groups.description — nullable long-form description for area groups.
--
-- DESIGN NOTES
-- ============
-- 1. EXPAND-ONLY: adds a single nullable TEXT column. No existing rows are modified by
--    this migration; existing callers see NULL until V99 backfills the value.
-- 2. Safe to apply on a live DB: adding a nullable column with no DEFAULT requires only
--    an AccessShareLock (Postgres catalog write); it does not rewrite the table.
-- 3. Idempotent guard: IF NOT EXISTS on the column add protects against double-apply.
--
ALTER TABLE area_groups
    ADD COLUMN IF NOT EXISTS description TEXT NULL;
