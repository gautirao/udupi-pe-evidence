-- V68: Add coordinate provenance columns to public.schools.
-- These support the Phase 2 locality-centroid fallback pipeline
-- (scripts/prepare_schools_data.py Pass 2).
--
-- coordinate_source:    'hdx_school_poi' | 'hdx_place_centroid'
-- coordinate_precision: 'exact_school'   | 'approximate_village'

ALTER TABLE public.schools
    ADD COLUMN IF NOT EXISTS coordinate_source    VARCHAR(50),
    ADD COLUMN IF NOT EXISTS coordinate_precision VARCHAR(50);
