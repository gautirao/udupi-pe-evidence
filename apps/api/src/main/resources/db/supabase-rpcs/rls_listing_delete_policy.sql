-- Reference copy only. Run this in the Supabase SQL editor (not via Flyway).
-- Table: public.property_listings
-- Reflects the state after V41 (expand phase: broker added alongside dealer).
--
-- History:
--   V10  — "Dealers can delete own draft listings" (DRAFT only)
--   V27  — extended to "Dealers can delete own draft or rejected listings" (DRAFT + REJECTED)
--   V34  — extended to also include 'user' (owner) role
--   V41  — extended to also include 'broker' role (expand phase)
--
-- The Flyway migration V41 is the authoritative source for this change.
-- This file is provided for manual verification or emergency rollback in the
-- Supabase SQL editor only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop existing policy variants (idempotent re-run safety)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Dealers can delete own draft listings"                        ON public.property_listings;
DROP POLICY IF EXISTS "Dealers can delete own draft or rejected listings"            ON public.property_listings;
DROP POLICY IF EXISTS "Dealers and owners can delete own draft or rejected listings" ON public.property_listings;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DELETE — dealer, broker, or owner; own row; status DRAFT or REJECTED
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "Dealers and owners can delete own draft or rejected listings"
    ON public.property_listings FOR DELETE
    TO authenticated
    USING (
        (   public.has_role(auth.uid(), 'dealer')
         OR public.has_role(auth.uid(), 'broker')
         OR public.has_role(auth.uid(), 'user')
        )
        AND created_by = auth.uid()
        AND status IN ('DRAFT', 'REJECTED')
    );
