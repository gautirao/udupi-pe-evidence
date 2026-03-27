-- V61: Convert property_type column on property_listings from custom enum to VARCHAR.
--
-- Root cause: Hibernate binds property_type parameters as VARCHAR, but PostgreSQL
-- silently rejects WHERE comparisons between VARCHAR and custom enum types,
-- causing UPDATEs to affect 0 rows without any error.
--
-- No RLS policies reference property_listings.property_type, so no policy
-- drop/recreate cycle is needed (contrast with V60 which required it for status).
--
-- This migration:
-- 0. Cleans any failed Flyway history entry for V61 (idempotent retry)
-- 1. Converts property_listings.property_type from property_type enum to VARCHAR(30)
-- 2. Adds a CHECK constraint to maintain valid values
-- 3. Drops the property_type enum type (cleanup)

-- ============================================================
-- 0. Clean failed Flyway history entry (safe: no-op if row does not exist)
-- ============================================================

DELETE FROM flyway_schema_history WHERE version = '61' AND success = false;

-- ============================================================
-- 1. Convert property_listings.property_type to VARCHAR(30)
-- ============================================================

ALTER TABLE public.property_listings
    ALTER COLUMN property_type TYPE VARCHAR(30) USING property_type::text;

-- The DEFAULT was set in V0 as 'other'::property_type.
-- After ALTER TYPE the internal default expression still references the enum.
-- Drop it and re-set as a plain VARCHAR default so DROP TYPE succeeds.
ALTER TABLE public.property_listings
    ALTER COLUMN property_type DROP DEFAULT;

ALTER TABLE public.property_listings
    ALTER COLUMN property_type SET DEFAULT 'other';

-- ============================================================
-- 2. Add CHECK constraint on property_type column
-- ============================================================

ALTER TABLE public.property_listings
    ADD CONSTRAINT chk_listing_property_type
    CHECK (property_type IN (
        'house', 'apartment', 'land', 'commercial',
        'commercial_building', 'warehouse', 'commercial_land', 'other'
    ));

-- ============================================================
-- 3. Drop the old enum type
-- ============================================================

DROP TYPE IF EXISTS public.property_type;
