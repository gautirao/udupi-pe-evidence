-- V86: Expand chk_listing_property_type constraint to include 'agricultural_land'.
-- V84 added agricultural land columns; V85 added the boundary geometry column.
-- Neither expanded the CHECK constraint, so property_type='agricultural_land' raises
-- a DataIntegrityViolationException (HTTP 500) on INSERT/UPDATE.
-- This migration drops and re-adds the constraint preserving all 8 existing values
-- plus 'agricultural_land'.
ALTER TABLE public.property_listings
    DROP CONSTRAINT IF EXISTS chk_listing_property_type;

ALTER TABLE public.property_listings
    ADD CONSTRAINT chk_listing_property_type
    CHECK (property_type IN (
        'house', 'apartment', 'land', 'commercial',
        'commercial_building', 'warehouse', 'commercial_land', 'other',
        'agricultural_land'
    ));
