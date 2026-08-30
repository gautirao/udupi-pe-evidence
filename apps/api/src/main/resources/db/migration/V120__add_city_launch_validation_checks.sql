-- V120: per-check validation flags for city_launch_revision (#1911 PR4).
--
-- ADDITIVE ONLY. Adds five boolean "validated" checklist columns plus a validated_at timestamp
-- to the existing city_launch_revision table (V118). No backfill needed — every existing row
-- gets the DEFAULT false / NULL values below. Does NOT touch uq_clr_inflight or
-- uq_clr_current_promoted (V118); those partial indexes key off lifecycle_status only and are
-- unaffected by this column set.
--
-- Rollback (manual, not run automatically):
--   ALTER TABLE public.city_launch_revision
--     DROP COLUMN IF EXISTS landing_validated,
--     DROP COLUMN IF EXISTS regions_validated,
--     DROP COLUMN IF EXISTS area_groups_validated,
--     DROP COLUMN IF EXISTS areas_validated,
--     DROP COLUMN IF EXISTS listing_validated,
--     DROP COLUMN IF EXISTS validated_at;

ALTER TABLE public.city_launch_revision
    ADD COLUMN IF NOT EXISTS landing_validated       BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS regions_validated        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS area_groups_validated     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS areas_validated           BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS listing_validated         BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS validated_at              TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.city_launch_revision.landing_validated IS
    'Admin has manually confirmed the landing/preview map for this revision looks correct '
    '(#1911 PR4 validation checklist). Written only via CityLaunchRevisionRepository''s guarded '
    '@Modifying queries, never via save().';
COMMENT ON COLUMN public.city_launch_revision.regions_validated IS
    'Admin has manually confirmed the region breakdown for this revision looks correct '
    '(#1911 PR4 validation checklist). Written only via guarded @Modifying queries.';
COMMENT ON COLUMN public.city_launch_revision.area_groups_validated IS
    'Admin has manually confirmed the area-group breakdown for this revision looks correct '
    '(#1911 PR4 validation checklist). Written only via guarded @Modifying queries.';
COMMENT ON COLUMN public.city_launch_revision.areas_validated IS
    'Admin has manually confirmed the area list for this revision looks correct '
    '(#1911 PR4 validation checklist). Written only via guarded @Modifying queries.';
COMMENT ON COLUMN public.city_launch_revision.listing_validated IS
    'Admin has manually confirmed the simulated listing preview for this revision looks correct '
    '(#1911 PR4 validation checklist). Written only via guarded @Modifying queries.';
COMMENT ON COLUMN public.city_launch_revision.validated_at IS
    'Set atomically with the PREPARED -> VALIDATED lifecycle transition (all five checklist '
    'columns true); cleared atomically the moment ANY checklist column is unticked or reset while '
    'the revision is VALIDATED, demoting lifecycle_status back to PREPARED in the SAME guarded '
    'UPDATE — never a separate write, so the two can never observably disagree.';
