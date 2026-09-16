-- =============================================================================
-- #2608 — Phase B & D: Controlled Canary Publication Workflow (DRAFT -> LIVE)
-- =============================================================================
-- Publishes the 10 deterministically selected commercial canary listings across
-- Udupi, Bengaluru, and Mangalore covering SHOP, OFFICE, WAREHOUSE, and LAND.
--
-- DATA QUALITY GATE ENFORCED:
--   - Non-nil owner (created_by != '00000000-0000-0000-0000-000000000000')
--   - Valid non-empty title
--   - RESOLVED canonical area resolution
--   - COMMERCIAL listing family (zero residential projection)
--   - Purpose / money field agreement
--   - Valid commercial subtype

BEGIN;

-- 1. Data-quality gate check: fail loudly if any canary fails buyer contract requirements
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    SELECT count(*) INTO invalid_count
    FROM public.property_listings pl
    WHERE pl.id IN (
        '15bd7df2-b578-6405-ca23-8f39f794d572'::uuid, -- Udupi SHOP
        '8e0896c4-bb5d-a9d8-0dd8-29a87f52380c'::uuid, -- Udupi OFFICE
        '05be37a2-6eca-2193-4cad-14109b966d87'::uuid, -- Udupi LAND
        'bbfe8c07-3fd2-90e0-c194-cb8607dff8c3'::uuid, -- Bengaluru SHOP
        'f335fc24-0ef8-cbf0-bfa8-177c94b5b8f5'::uuid, -- Bengaluru OFFICE
        'ea2b6b68-87f6-4f5e-b34c-59b2c082321a'::uuid, -- Bengaluru WAREHOUSE
        'c3b513e7-ee12-46c6-a1bc-513d66f22c22'::uuid, -- Bengaluru LAND
        'f96a87cd-8670-815b-e35d-bdbaadfb78ce'::uuid, -- Mangalore SHOP
        'a3bad877-bc47-deba-c588-9d5b7e136c20'::uuid, -- Mangalore OFFICE
        '964bb405-df45-1f7b-4d7d-4eaab56def14'::uuid  -- Mangalore WAREHOUSE
    ) AND (
        pl.created_by = '00000000-0000-0000-0000-000000000000'::uuid
        OR pl.title IS NULL OR trim(pl.title) = ''
        OR pl.area_resolution_status <> 'RESOLVED'
        OR pl.listing_family <> 'COMMERCIAL'
        OR pl.commercial_subtype IS NULL
        OR pl.commercial_subtype NOT IN ('SHOP', 'OFFICE', 'BUILDING', 'WAREHOUSE', 'LAND')
        OR (pl.listing_purpose = 'sale' AND pl.price IS NULL)
        OR (pl.listing_purpose = 'rent' AND pl.monthly_rent IS NULL)
        OR (pl.listing_purpose = 'sale' AND pl.monthly_rent IS NOT NULL)
        OR (pl.listing_purpose = 'rent' AND pl.price IS NOT NULL)
    );

    IF invalid_count > 0 THEN
        RAISE EXCEPTION
            'Canary publication aborted: % target listing(s) failed the Phase C data-quality gate.',
            invalid_count;
    END IF;
END
$$;

-- 2. Execute status transition: DRAFT -> LIVE
UPDATE public.property_listings
SET status = 'LIVE',
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
) AND status = 'DRAFT';

-- 3. Write durable publication audit batch entry
INSERT INTO public.commercial_publication_batch (
    batch_name, batch_type, target_listing_count, listing_ids, previous_status, new_status
) VALUES (
    'CANARY_2608',
    'CANARY',
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
    'DRAFT',
    'LIVE'
);

COMMIT;
