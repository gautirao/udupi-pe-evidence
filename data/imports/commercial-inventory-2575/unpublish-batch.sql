-- =============================================================================
-- #2608 — Phase B: Controlled Batch Unpublish Workflow (LIVE -> DRAFT)
-- =============================================================================
-- Transactional batch unpublish for commercial LIVE listings back to DRAFT.

BEGIN;

-- 1. Create temporary table of target listing IDs to unpublish
CREATE TEMP TABLE target_unpublish_batch ON COMMIT DROP AS
SELECT id
FROM public.property_listings
WHERE status = 'LIVE'
  AND id IN (
      SELECT promoted_listing_id
      FROM public.commercial_import_candidate
      WHERE promoted_listing_id IS NOT NULL
  );

-- 2. Execute status transition: LIVE -> DRAFT
UPDATE public.property_listings
SET status = 'DRAFT',
    status_changed_at = now(),
    updated_at = now()
WHERE id IN (SELECT id FROM target_unpublish_batch);

-- 3. Audit batch unpublish in commercial_publication_batch
INSERT INTO public.commercial_publication_batch (
    batch_name, batch_type, target_listing_count, listing_ids, previous_status, new_status
)
SELECT
    'BATCH_UNPUBLISH_2608',
    'UNPUBLISH',
    count(*)::integer,
    coalesce(array_agg(id), ARRAY[]::uuid[]),
    'LIVE',
    'DRAFT'
FROM target_unpublish_batch;

COMMIT;
