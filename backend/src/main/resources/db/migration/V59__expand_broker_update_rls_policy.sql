-- V59: Expand broker/owner UPDATE policy to allow status transitions on all owned listings.
--
-- V34 restricted updates to status IN ('DRAFT', 'REJECTED'), which silently blocked
-- archive (LIVE->ARCHIVED) and reopen (ARCHIVED->DRAFT) when the backend connects
-- via Supabase connection pooler (port 6543, enforces RLS).
--
-- The backend already validates status transitions in ListingWorkflowService,
-- so the RLS policy only needs to enforce ownership, not status constraints.

DROP POLICY IF EXISTS "Dealers and owners can update own draft or rejected listings" ON public.property_listings;

CREATE POLICY "Dealers and owners can update own listings"
    ON public.property_listings FOR UPDATE
    TO authenticated
    USING (
        (public.has_role(auth.uid(), 'dealer') OR public.has_role(auth.uid(), 'user'))
        AND created_by = auth.uid()
    );
