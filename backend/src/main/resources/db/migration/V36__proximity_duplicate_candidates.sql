-- V36: Data model foundation for proximity-based duplicate detection.
--
-- 1. Adds is_suspected_duplicate flag to property_listings so the detection
--    service can mark listings without altering the existing is_duplicate column
--    (which tracks exact-hash duplicates).
--
-- 2. Creates duplicate_candidates table to record proximity-detected pairs
--    awaiting admin review.  Status lifecycle: pending → confirmed | dismissed.
--
-- All DDL is idempotent (IF NOT EXISTS / IF NOT EXISTS guards).

-- ============================================================
-- 1. Add is_suspected_duplicate column to property_listings
-- ============================================================
ALTER TABLE property_listings
    ADD COLUMN IF NOT EXISTS is_suspected_duplicate BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 2. Create duplicate_candidates table
-- ============================================================
CREATE TABLE IF NOT EXISTS duplicate_candidates (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id_a     UUID NOT NULL REFERENCES property_listings(id),
    listing_id_b     UUID NOT NULL REFERENCES property_listings(id),
    similarity_score DECIMAL(3,2) NOT NULL CHECK (similarity_score >= 0.00 AND similarity_score <= 1.00),
    distance_meters  DECIMAL(8,2) NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'confirmed', 'dismissed')),
    reviewed_by      UUID,  -- references auth.users(id) — not enforced via FK to avoid cross-schema issues
    reviewed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (listing_id_a, listing_id_b)
);

-- ============================================================
-- 3. Indexes
-- ============================================================

-- Supports admin GET paginated pending pairs ordered by similarity DESC
CREATE INDEX IF NOT EXISTS idx_dup_candidates_pending
    ON duplicate_candidates(similarity_score DESC) WHERE status = 'pending';

-- Supports queries finding all pairs that involve a given listing (either side)
CREATE INDEX IF NOT EXISTS idx_dup_candidates_listing_a
    ON duplicate_candidates(listing_id_a);

CREATE INDEX IF NOT EXISTS idx_dup_candidates_listing_b
    ON duplicate_candidates(listing_id_b);
