-- V45: Add cancellation_reason to viewing_requests and expand unique booking index
--
-- Part of RE-136 / Phase 2.1 — schema foundation for booking cascade.
--
-- 1. cancellation_reason: nullable, max 100 chars. Written when a booking is
--    cancelled by either party so the reason is preserved for audit purposes.
--
-- 2. The unique partial index that prevents duplicate active bookings is
--    expanded to include NEEDS_RESOLUTION. NEEDS_RESOLUTION is introduced in
--    Phase 2.3 (RE-138). This migration must land first so that uniqueness is
--    enforced from the moment the new status starts being set by the service.

-- Add the nullable cancellation_reason column
ALTER TABLE viewing_requests
  ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(100);

-- Drop the old partial unique index (created in V15)
DROP INDEX IF EXISTS idx_one_active_booking_per_user_listing;

-- Recreate the index with NEEDS_RESOLUTION included in the active-status filter.
-- A user may not have more than one active booking (REQUESTED, CONFIRMED, or
-- NEEDS_RESOLUTION) for the same listing at the same time.
CREATE UNIQUE INDEX idx_one_active_booking_per_user_listing
  ON viewing_requests (listing_id, requester_id)
  WHERE status IN ('REQUESTED', 'CONFIRMED', 'NEEDS_RESOLUTION');
