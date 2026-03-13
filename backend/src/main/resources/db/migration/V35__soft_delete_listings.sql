-- V35: Soft delete for property_listings.
--
-- Adds ARCHIVED status and archived_at column so that dealer/owner "deletes"
-- preserve the full listing record and its related data (listing_images, pois,
-- viewing_requests). Hard deletes are no longer issued by the application for
-- dealer-facing delete operations.
--
-- NOTE: The V34 DELETE RLS policy ("Dealers and owners can delete own draft or
-- rejected listings") becomes dead code after this migration because Spring Boot
-- no longer issues DELETE statements for dealer-facing soft deletes.  It is left
-- in place intentionally as defense in depth: it prevents direct-DB hard deletes
-- by non-owners should anyone bypass the application layer.

-- ============================================================
-- 1. Add ARCHIVED to listing_status enum
-- ============================================================
ALTER TYPE public.listing_status ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- ============================================================
-- 2. Add archived_at column
-- ============================================================
ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================================
-- 3. Partial index for dealer queries that filter archived_at IS NULL
--    (covers the WHERE archived_at IS NULL predicate on high-frequency paths)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_property_listings_not_archived
    ON public.property_listings (created_by, status)
    WHERE archived_at IS NULL;
