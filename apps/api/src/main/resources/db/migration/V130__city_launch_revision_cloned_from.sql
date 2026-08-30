-- V130: provenance column for "Edit revision" candidates (#2121 requirement B).
--
-- ADDITIVE ONLY. One new nullable, self-referencing FK column on the existing
-- city_launch_revision table (V118). No backfill, no existing-row rewrite, no constraint change
-- on any other column.
--
-- Records that a revision was created by CityLaunchCandidateService.editFromLive(...) as a
-- byte-faithful copy of another revision's sandbox_* row set, rather than freshly derived from
-- canonical geography via CityLaunchPreparationService.prepare()/rerunSuperseding(). NULL for
-- every revision created by the existing prepare/rerun path.

ALTER TABLE public.city_launch_revision
    ADD COLUMN IF NOT EXISTS cloned_from_revision_id BIGINT NULL
        REFERENCES public.city_launch_revision (id);

COMMENT ON COLUMN public.city_launch_revision.cloned_from_revision_id IS
    'Non-null when this revision was created by admin "Edit revision" (#2121) as a byte-faithful '
    'copy of that revision''s sandbox_* row set. NULL for revisions freshly derived from canonical '
    'geography via CityLaunchPreparationService.prepare()/rerunSuperseding().';
