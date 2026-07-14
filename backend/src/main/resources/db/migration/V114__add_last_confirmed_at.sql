-- V114: property_listings.last_confirmed_at — nullable freshness/reconfirmation signal (#1794 Phase 1).
--
-- DESIGN NOTES
-- ============
-- 1. EXPAND-ONLY: adds a single nullable timestamptz column. No existing rows are modified by
--    this migration — last_confirmed_at stays NULL for every currently-LIVE listing until it
--    next transitions into LIVE (a fresh approval/reconfirmation), at which point the workflow
--    layer (ListingWorkflowService) sets it to the transition timestamp. It is NEVER backfilled
--    here or anywhere else — a NULL value honestly means "never confirmed since this column
--    existed," not "confirmed a long time ago."
-- 2. Safe to apply on a live DB: adding a nullable column with no DEFAULT requires only an
--    AccessShareLock (Postgres catalog write); it does not rewrite the table.
-- 3. Idempotent guard: IF NOT EXISTS on the column add protects against double-apply.
-- 4. Phase 1 scope only: this migration adds the signal column. Phase 2 automation (scheduled
--    staleness sweeps, auto-archive, one-tap reconfirm, back-on-market) is explicitly out of
--    scope and is NOT introduced by this migration.
--
ALTER TABLE property_listings
    ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz NULL;

COMMENT ON COLUMN property_listings.last_confirmed_at IS
    'Set to the transition timestamp every time the listing enters LIVE status (publish or reconfirm). '
    'NULL until the listing is first confirmed after this column was introduced — never backfilled for '
    'pre-existing rows. Used to surface listing freshness/staleness (#1794 Phase 1).';
