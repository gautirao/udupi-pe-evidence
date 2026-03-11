-- V27: Allow dealers to delete their own REJECTED listings.
-- Aligns RLS DELETE policy with ListingService.deleteListing() which now permits
-- DRAFT and REJECTED status (added in RE-55).
--
-- Safety: DROP POLICY IF EXISTS is idempotent. The new policy name differs from
-- the old name so a re-run of this migration would not conflict at CREATE time
-- (Flyway checksums prevent re-runs in practice).

DROP POLICY IF EXISTS "Dealers can delete own draft listings" ON public.property_listings;

CREATE POLICY "Dealers can delete own draft or rejected listings"
    ON public.property_listings FOR DELETE
    TO authenticated
    USING (
        public.has_role(auth.uid(), 'dealer')
        AND created_by = auth.uid()
        AND status IN ('DRAFT', 'REJECTED')
    );
