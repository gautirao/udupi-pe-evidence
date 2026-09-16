-- =============================================================================
-- #2575 — rollback for promote.sql. Provenance-keyed DELETE.
-- =============================================================================
-- Run inside a transaction:
--
--   BEGIN;
--   \i promote-rollback.sql
--   COMMIT;
--
-- ── KEYED ON PROVENANCE, NOT ON created_by ───────────────────────────────────
-- Matching on created_by would be wrong for the same reason #2304's rollback.sql
-- records: the owning account is a real, shared identity that may own listings this
-- import did not create. Deleting by owner would take those with it.
--
-- parsed_data->>'importIssue' = '2575' is written by promote.sql on every row it
-- creates and on every row it updates, so it identifies exactly this pipeline's rows.
--
-- ── WHAT IS DELIBERATELY NOT DELETED ─────────────────────────────────────────
-- * The owner's profiles row — it is a pre-existing account, not something this
--   import created.
-- * The staging tables' own rows. Rollback undoes the PROMOTION, not the acquisition;
--   the capture, the candidates and the reject report remain, which is the whole
--   point of staging being separate. Promoted candidates are returned to STAGED so a
--   corrected promotion can be re-run.
--
-- ── THE DETAIL TABLES NEED NO EXPLICIT DELETE ────────────────────────────────
-- Every V102 commercial detail table's listing_id PRIMARY KEY is
-- REFERENCES property_listings(id) ON DELETE CASCADE, so removing the listing removes
-- its projection. Stated explicitly because a reader checking that those tables are
-- empty afterwards should know the mechanism, not be surprised by it.
--
-- ORDER MATTERS. The candidate reset runs BEFORE the listing delete: it reads
-- promoted_listing_id, and clearing the listings first would leave nothing to match
-- if a future revision keys this on a join rather than on the id it already holds.
-- =============================================================================

-- 1. Return promoted candidates to STAGED so a corrected promotion can re-run.
UPDATE public.commercial_import_candidate
SET outcome             = 'STAGED',
    promoted_listing_id = NULL,
    promoted_at         = NULL,
    updated_at          = now()
WHERE outcome = 'PROMOTED';

-- 2. Images, if any were ever attached to these listings.
DELETE FROM public.listing_images
WHERE listing_id IN (
    SELECT id FROM public.property_listings
    WHERE parsed_data->>'importIssue' = '2575'
);

-- 3. The listings themselves. Detail rows cascade.
DELETE FROM public.property_listings
WHERE parsed_data->>'importIssue' = '2575';
