-- V44: Add last_approved_snapshot JSONB column to property_listings
--
-- Purpose:
--   Stores a point-in-time snapshot of the listing's content at the moment it was
--   last approved (transitioned to LIVE status).
--
--   Phase 2 — fast-restore guard: when a broker re-submits a listing for review,
--   the backend compares the current content against this snapshot to determine
--   whether the changes are trivial (e.g. contact phone only) or substantive,
--   guiding the reviewer's risk assessment.
--
--   Phase 5 — trust badge invalidation: if the live listing's content drifts
--   materially from this snapshot, the trust badge is downgraded or hidden until
--   the next admin approval cycle completes.
--
-- Design notes:
--   - Nullable with no default: existing rows receive NULL, representing "never
--     approved under the snapshot scheme".  Consumers must treat NULL as "no
--     baseline available".
--   - No GIN index in this migration; index is deferred to Phase 2 once the
--     query patterns on this column are known.
--   - Idempotent via IF NOT EXISTS.

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS last_approved_snapshot JSONB;
