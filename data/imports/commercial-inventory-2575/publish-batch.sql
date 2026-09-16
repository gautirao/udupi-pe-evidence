-- =============================================================================
-- #2608 — Phase B: Controlled Batch Publication Workflow (DRAFT -> LIVE)
-- =============================================================================
-- Transactional batch publication for promoted commercial DRAFT listings that
-- pass the Phase C data-quality gate.

BEGIN;

-- 1. Enforce Data-Quality Gate over candidate batch listings in DRAFT
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    SELECT count(*) INTO invalid_count
    FROM public.property_listings pl
    WHERE pl.status = 'DRAFT'
      AND pl.id IN (
          SELECT promoted_listing_id
          FROM public.commercial_import_candidate
          WHERE promoted_listing_id IS NOT NULL
      )
      AND (
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
            'Batch publication aborted: % listing(s) failed the Phase C data-quality gate.',
            invalid_count;
    END IF;
END
$$;

-- 2. Create temporary table of target listing IDs to publish
CREATE TEMP TABLE target_batch_listings ON COMMIT DROP AS
SELECT id
FROM public.property_listings
WHERE status = 'DRAFT'
  AND id IN (
      SELECT promoted_listing_id
      FROM public.commercial_import_candidate
      WHERE promoted_listing_id IS NOT NULL
  );

-- 3. Execute status transition: DRAFT -> LIVE
UPDATE public.property_listings
SET status = 'LIVE',
    status_changed_at = now(),
    updated_at = now()
WHERE id IN (SELECT id FROM target_batch_listings);

-- 4. Audit batch publication in commercial_publication_batch
INSERT INTO public.commercial_publication_batch (
    batch_name, batch_type, target_listing_count, listing_ids, previous_status, new_status
)
SELECT
    'BATCH_PUBLICATION_2608',
    'BATCH',
    count(*)::integer,
    coalesce(array_agg(id), ARRAY[]::uuid[]),
    'DRAFT',
    'LIVE'
FROM target_batch_listings;

COMMIT;
