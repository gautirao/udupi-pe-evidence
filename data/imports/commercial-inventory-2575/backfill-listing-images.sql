-- =============================================================================
-- #2624 — Materialize imported Commercial source images into listing_images
-- =============================================================================
-- Standalone idempotent backfill script for commercial_import_candidate rows.

WITH raw_imgs AS (
    SELECT
        coalesce(c.promoted_listing_id, (md5(c.source_platform || ':' || c.source_listing_id))::uuid) AS listing_id,
        elem.val AS img_url,
        elem.ord AS ord
    FROM public.commercial_import_candidate c
    CROSS JOIN LATERAL jsonb_array_elements_text(c.raw_payload->'images') WITH ORDINALITY AS elem(val, ord)
    WHERE jsonb_typeof(c.raw_payload->'images') = 'array'
      AND elem.val IS NOT NULL
      AND trim(elem.val) <> ''
      AND elem.val LIKE 'https://%'
),
deduped_imgs AS (
    SELECT
        listing_id,
        img_url,
        MIN(ord) AS first_ord
    FROM raw_imgs
    GROUP BY listing_id, img_url
),
ordered_imgs AS (
    SELECT
        listing_id,
        img_url,
        ROW_NUMBER() OVER (
            PARTITION BY listing_id
            ORDER BY first_ord ASC
        ) - 1 AS position
    FROM deduped_imgs
)
INSERT INTO public.listing_images (
    listing_id,
    storage_path,
    url,
    position
)
SELECT
    listing_id,
    'external:' || img_url,
    img_url,
    position
FROM ordered_imgs
WHERE position < 10
  AND EXISTS (
      SELECT 1 FROM public.property_listings pl WHERE pl.id = listing_id
  )
ON CONFLICT (listing_id, storage_path) DO NOTHING;
