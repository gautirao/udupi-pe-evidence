-- =============================================================================
-- #2608 — Phase A Rollback: Ownership Remediation Rollback
-- =============================================================================
-- Reverts ownership of promoted #2575 commercial listings back to nil UUID
-- ('00000000-0000-0000-0000-000000000000') for DRAFT listings.

BEGIN;

UPDATE public.property_listings
SET created_by = '00000000-0000-0000-0000-000000000000'::uuid,
    updated_at = now()
WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'::uuid
  AND status = 'DRAFT'
  AND id IN (
      SELECT promoted_listing_id
      FROM public.commercial_import_candidate
      WHERE promoted_listing_id IS NOT NULL
  );

COMMIT;
