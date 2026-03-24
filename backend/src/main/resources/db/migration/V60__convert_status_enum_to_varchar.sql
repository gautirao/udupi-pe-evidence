-- V60: Convert status columns from custom enum listing_status to VARCHAR.
--
-- Root cause: Hibernate binds status parameters as VARCHAR, but PostgreSQL
-- silently rejects WHERE comparisons between VARCHAR and custom enum types,
-- causing UPDATEs to affect 0 rows without any error.
--
-- This migration:
-- 1. Converts property_listings.status from listing_status to VARCHAR(30)
-- 2. Converts listing_status_history.from_status and to_status from listing_status to VARCHAR(30)
-- 3. Adds a CHECK constraint on property_listings.status to maintain valid values
-- 4. Adds a CHECK constraint on listing_status_history columns to maintain valid values
-- 5. Drops the listing_status enum type (cleanup)

-- ============================================================
-- 1. Convert property_listings.status to VARCHAR(30)
-- ============================================================

ALTER TABLE public.property_listings
    ALTER COLUMN status TYPE VARCHAR(30) USING status::text;

-- ============================================================
-- 2. Convert listing_status_history.from_status and to_status to VARCHAR(30)
-- ============================================================

ALTER TABLE public.listing_status_history
    ALTER COLUMN from_status TYPE VARCHAR(30) USING from_status::text;

ALTER TABLE public.listing_status_history
    ALTER COLUMN to_status TYPE VARCHAR(30) USING to_status::text;

-- ============================================================
-- 3. Add CHECK constraint on property_listings.status
-- ============================================================

ALTER TABLE public.property_listings
    ADD CONSTRAINT chk_listing_status
    CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'LIVE', 'REJECTED', 'ARCHIVED', 'SCRAPED'));

-- ============================================================
-- 4. Add CHECK constraints on listing_status_history columns
-- ============================================================

ALTER TABLE public.listing_status_history
    ADD CONSTRAINT chk_lsh_from_status
    CHECK (from_status IS NULL OR from_status IN ('DRAFT', 'PENDING_REVIEW', 'LIVE', 'REJECTED', 'ARCHIVED', 'SCRAPED'));

ALTER TABLE public.listing_status_history
    ADD CONSTRAINT chk_lsh_to_status
    CHECK (to_status IN ('DRAFT', 'PENDING_REVIEW', 'LIVE', 'REJECTED', 'ARCHIVED', 'SCRAPED'));

-- ============================================================
-- 5. Drop the old enum type
-- ============================================================

DROP TYPE IF EXISTS public.listing_status;
