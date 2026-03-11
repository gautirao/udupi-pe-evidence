-- Reference copy only. Run this in the Supabase SQL editor (not via Flyway).
-- Table: public.property_listings
-- Replaces the original "Dealers can delete own draft listings" policy (V10 line 64)
-- with one that also permits deletion of REJECTED listings, aligning RLS with
-- ListingService.deleteListing() (updated in RE-55).
--
-- The USING clause mirrors the UPDATE policy already present in V10:
--   public.has_role(auth.uid(), 'dealer')
--   AND created_by = auth.uid()
--   AND status IN ('DRAFT', 'REJECTED')
--
-- The Flyway migration V27 is the authoritative source for this change.
-- This file is provided for manual verification or emergency rollback in the
-- Supabase SQL editor only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop existing policy (idempotent re-run safety)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Dealers can delete own draft listings"          ON public.property_listings;
DROP POLICY IF EXISTS "Dealers can delete own draft or rejected listings" ON public.property_listings;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DELETE — dealer owns row, status must be DRAFT or REJECTED
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "Dealers can delete own draft or rejected listings"
    ON public.property_listings FOR DELETE
    TO authenticated
    USING (
        public.has_role(auth.uid(), 'dealer')
        AND created_by = auth.uid()
        AND status IN ('DRAFT', 'REJECTED')
    );
