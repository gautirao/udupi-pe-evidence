-- =============================================================================
-- #2608 — Phase A: Ownership Remediation for Promoted Commercial Inventory
-- =============================================================================
-- Remediates created_by from nil UUID ('00000000-0000-0000-0000-000000000000')
-- to the canonical service principal ('e7b61f70-d087-44d8-a81d-7f8a057d2775', Test Dealer).
--
-- SCOPE: Target ONLY promoted commercial listings derived from #2575 candidates.
-- IDEMPOTENT: Safe to run repeatedly; re-executing has zero side-effects.

BEGIN;

-- 1. Ensure canonical service principal user and profile exist
INSERT INTO auth.users (id, email)
VALUES ('e7b61f70-d087-44d8-a81d-7f8a057d2775'::uuid, 'testdealer@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (user_id, email, full_name)
VALUES ('e7b61f70-d087-44d8-a81d-7f8a057d2775'::uuid, 'testdealer@example.com', 'Test Dealer')
ON CONFLICT (user_id) DO NOTHING;

-- 2. Remediate property_listings.created_by for promoted #2575 listings
UPDATE public.property_listings
SET created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'::uuid,
    updated_at = now()
WHERE created_by = '00000000-0000-0000-0000-000000000000'::uuid
  AND id IN (
      SELECT promoted_listing_id
      FROM public.commercial_import_candidate
      WHERE promoted_listing_id IS NOT NULL
  );

COMMIT;
