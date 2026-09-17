-- =============================================================================
-- Issue #2575 Phase 2 — Class A Exact Canonical Matches Remediation Script
-- =============================================================================
-- Target Cohort: #2575 Housing commercial listings
--   created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
--   AND listing_family = 'COMMERCIAL'
--   AND parsed_data->>'source' = 'housing.com'
--
-- Maps each listing's locality to its canonical area_key & area_label in public.areas
-- where areas.lifecycle_status = 'ACTIVE'.
--
-- Sets:
--   area_key = canonical_area_key
--   area_label = canonical_area_label
--   area_resolution_status = 'RESOLVED'
--   area_resolution_method = 'CANONICAL_KEY'
--   updated_at = now()
--
-- Executed inside a single transaction (BEGIN ... COMMIT).
-- =============================================================================

BEGIN;

-- Update constraint to permit standard vocabulary
ALTER TABLE public.property_listings DROP CONSTRAINT IF EXISTS property_listings_area_resolution_method_check;
ALTER TABLE public.property_listings ADD CONSTRAINT property_listings_area_resolution_method_check 
    CHECK (area_resolution_method IS NULL OR area_resolution_method IN ('PROVIDER_ID', 'CANONICAL_KEY', 'ALIAS', 'NEW_CANONICAL_AREA', 'INVALID_OR_OUT_OF_SCOPE', 'OTHER_PROVEN_REASON'));

WITH matched_canonical AS (
    SELECT DISTINCT ON (pl.id)
        pl.id AS listing_id,
        a.area_key AS canonical_area_key,
        a.name AS canonical_area_label
    FROM public.property_listings pl
    JOIN public.areas a ON lower(trim(pl.locality)) = lower(trim(a.name))
    WHERE pl.created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
      AND pl.listing_family = 'COMMERCIAL'
      AND pl.parsed_data->>'source' = 'housing.com'
      AND a.lifecycle_status = 'ACTIVE'
    ORDER BY pl.id, a.area_key
)
UPDATE public.property_listings pl
SET
    area_key = mc.canonical_area_key,
    area_label = mc.canonical_area_label,
    area_resolution_status = 'RESOLVED',
    area_resolution_method = 'CANONICAL_KEY',
    updated_at = now()
FROM matched_canonical mc
WHERE pl.id = mc.listing_id;

COMMIT;
