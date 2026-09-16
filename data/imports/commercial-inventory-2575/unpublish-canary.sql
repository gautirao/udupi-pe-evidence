-- =============================================================================
-- #2608 — Phase B: Canary Unpublish Mechanism (LIVE -> DRAFT)
-- =============================================================================
-- Reverts the 10 canary commercial listings from LIVE back to DRAFT.
-- Writes a durable audit entry to commercial_publication_batch.

BEGIN;

-- 1. Execute status transition: LIVE -> DRAFT
UPDATE public.property_listings
SET status = 'DRAFT',
    status_changed_at = now(),
    updated_at = now()
WHERE id IN (
    '15bd7df2-b578-6405-ca23-8f39f794d572'::uuid,
    '8e0896c4-bb5d-a9d8-0dd8-29a87f52380c'::uuid,
    '05be37a2-6eca-2193-4cad-14109b966d87'::uuid,
    'bbfe8c07-3fd2-90e0-c194-cb8607dff8c3'::uuid,
    'f335fc24-0ef8-cbf0-bfa8-177c94b5b8f5'::uuid,
    'ea2b6b68-87f6-4f5e-b34c-59b2c082321a'::uuid,
    'c3b513e7-ee12-46c6-a1bc-513d66f22c22'::uuid,
    'f96a87cd-8670-815b-e35d-bdbaadfb78ce'::uuid,
    'a3bad877-bc47-deba-c588-9d5b7e136c20'::uuid,
    '964bb405-df45-1f7b-4d7d-4eaab56def14'::uuid
) AND status = 'LIVE';

-- 2. Write publication audit batch entry for unpublish
INSERT INTO public.commercial_publication_batch (
    batch_name, batch_type, target_listing_count, listing_ids, previous_status, new_status
) VALUES (
    'UNPUBLISH_CANARY_2608',
    'UNPUBLISH',
    10,
    ARRAY[
        '15bd7df2-b578-6405-ca23-8f39f794d572'::uuid,
        '8e0896c4-bb5d-a9d8-0dd8-29a87f52380c'::uuid,
        '05be37a2-6eca-2193-4cad-14109b966d87'::uuid,
        'bbfe8c07-3fd2-90e0-c194-cb8607dff8c3'::uuid,
        'f335fc24-0ef8-cbf0-bfa8-177c94b5b8f5'::uuid,
        'ea2b6b68-87f6-4f5e-b34c-59b2c082321a'::uuid,
        'c3b513e7-ee12-46c6-a1bc-513d66f22c22'::uuid,
        'f96a87cd-8670-815b-e35d-bdbaadfb78ce'::uuid,
        'a3bad877-bc47-deba-c588-9d5b7e136c20'::uuid,
        '964bb405-df45-1f7b-4d7d-4eaab56def14'::uuid
    ],
    'LIVE',
    'DRAFT'
);

COMMIT;
