-- V60: Convert status columns from custom enum listing_status to VARCHAR.
--
-- Root cause: Hibernate binds status parameters as VARCHAR, but PostgreSQL
-- silently rejects WHERE comparisons between VARCHAR and custom enum types,
-- causing UPDATEs to affect 0 rows without any error.
--
-- IMPORTANT: PostgreSQL blocks ALTER TYPE on a column if ANY RLS policy
-- (even on other tables) references that column. We must drop ALL policies
-- that reference property_listings.status — both on property_listings itself
-- and on listing_images / listing_verification_dimension which use EXISTS
-- subqueries that reference pl.status.
--
-- This migration:
-- 0. Cleans any failed Flyway history entry for V60 (idempotent retry)
-- 1. Drops all RLS policies that reference property_listings.status
-- 2. Converts property_listings.status from listing_status to VARCHAR(30)
-- 3. Recreates all dropped RLS policies with identical logic
-- 4. Converts listing_status_history columns from listing_status to VARCHAR(30)
-- 5. Adds CHECK constraints on status columns to maintain valid values
-- 6. Drops the listing_status enum type (cleanup)

-- ============================================================
-- 0. Clean failed Flyway history entry (safe: no-op if row does not exist)
-- ============================================================

DELETE FROM flyway_schema_history WHERE version = '60' AND success = false;

-- ============================================================
-- 1a. Drop RLS policies on property_listings that reference 'status'
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can view visible listings"
    ON public.property_listings;

DROP POLICY IF EXISTS "Dealers and owners can create listings"
    ON public.property_listings;

DROP POLICY IF EXISTS "Dealers and owners can delete own draft or rejected listings"
    ON public.property_listings;

-- ============================================================
-- 1b. Drop RLS policies on listing_images that reference pl.status
--     via EXISTS subquery into property_listings
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can view images of visible listings"
    ON public.listing_images;

DROP POLICY IF EXISTS "Dealers and owners can upload images to own listings"
    ON public.listing_images;

DROP POLICY IF EXISTS "Dealers and owners can delete images from own listings"
    ON public.listing_images;

-- ============================================================
-- 1c. Drop RLS policy on listing_verification_dimension that
--     references pl.status via EXISTS subquery
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can view dimensions of visible listings"
    ON public.listing_verification_dimension;

-- ============================================================
-- 2. Convert property_listings.status to VARCHAR(30)
-- ============================================================

ALTER TABLE public.property_listings
    ALTER COLUMN status TYPE VARCHAR(30) USING status::text;

-- The DEFAULT was set in V7 as 'SCRAPED'::listing_status.
-- After ALTER TYPE the internal default expression still references the enum.
-- Drop it and re-set as a plain VARCHAR default so DROP TYPE succeeds.
ALTER TABLE public.property_listings
    ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.property_listings
    ALTER COLUMN status SET DEFAULT 'SCRAPED';

-- ============================================================
-- 3a. Recreate property_listings policies (same names, same logic)
-- ============================================================

-- SELECT: LIVE listings + valid SCRAPED listings (from V10)
CREATE POLICY "Authenticated users can view visible listings"
    ON public.property_listings FOR SELECT
    TO authenticated
    USING (
        status = 'LIVE'
        OR (status = 'SCRAPED' AND is_valid = true)
    );

-- INSERT: brokers/dealers/owners create DRAFT listings (from V42)
CREATE POLICY "Dealers and owners can create listings"
    ON public.property_listings FOR INSERT
    TO authenticated
    WITH CHECK (
        (   public.has_role(auth.uid(), 'dealer')
         OR public.has_role(auth.uid(), 'broker')
         OR public.has_role(auth.uid(), 'user')
        )
        AND created_by = auth.uid()
        AND status = 'DRAFT'
    );

-- DELETE: brokers/dealers/owners delete own DRAFT or REJECTED (from V42)
CREATE POLICY "Dealers and owners can delete own draft or rejected listings"
    ON public.property_listings FOR DELETE
    TO authenticated
    USING (
        (   public.has_role(auth.uid(), 'dealer')
         OR public.has_role(auth.uid(), 'broker')
         OR public.has_role(auth.uid(), 'user')
        )
        AND created_by = auth.uid()
        AND status IN ('DRAFT', 'REJECTED')
    );

-- ============================================================
-- 3b. Recreate listing_images policies (from V42)
-- ============================================================

-- SELECT: images of visible listings (own + public)
CREATE POLICY "Authenticated users can view images of visible listings"
    ON public.listing_images FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_id
            AND (
                pl.status = 'LIVE'
                OR (pl.status = 'SCRAPED' AND pl.is_valid = true)
                OR (
                    (   public.has_role(auth.uid(), 'dealer')
                     OR public.has_role(auth.uid(), 'broker')
                     OR public.has_role(auth.uid(), 'user')
                    )
                    AND pl.created_by = auth.uid()
                )
                OR public.is_admin(auth.uid())
            )
        )
    );

-- INSERT: upload images to own DRAFT or REJECTED listings
CREATE POLICY "Dealers and owners can upload images to own listings"
    ON public.listing_images FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_id
            AND pl.created_by = auth.uid()
            AND pl.status IN ('DRAFT', 'REJECTED')
            AND (   public.has_role(auth.uid(), 'dealer')
                 OR public.has_role(auth.uid(), 'broker')
                 OR public.has_role(auth.uid(), 'user')
                )
        )
    );

-- DELETE: delete images from own DRAFT or REJECTED listings
CREATE POLICY "Dealers and owners can delete images from own listings"
    ON public.listing_images FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_id
            AND pl.created_by = auth.uid()
            AND pl.status IN ('DRAFT', 'REJECTED')
            AND (   public.has_role(auth.uid(), 'dealer')
                 OR public.has_role(auth.uid(), 'broker')
                 OR public.has_role(auth.uid(), 'user')
                )
        )
    );

-- ============================================================
-- 3c. Recreate listing_verification_dimension policy (from V47)
-- ============================================================

CREATE POLICY "Authenticated users can view dimensions of visible listings"
    ON public.listing_verification_dimension FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_verification_dimension.listing_id
              AND (pl.status = 'LIVE'
                   OR (pl.status = 'SCRAPED' AND pl.is_valid = true))
        )
    );

-- ============================================================
-- 4. Convert listing_status_history.from_status and to_status
-- ============================================================

ALTER TABLE public.listing_status_history
    ALTER COLUMN from_status TYPE VARCHAR(30) USING from_status::text;

ALTER TABLE public.listing_status_history
    ALTER COLUMN to_status TYPE VARCHAR(30) USING to_status::text;

-- ============================================================
-- 5. Add CHECK constraints on status columns
-- ============================================================

ALTER TABLE public.property_listings
    ADD CONSTRAINT chk_listing_status
    CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'LIVE', 'REJECTED', 'ARCHIVED', 'SCRAPED'));

ALTER TABLE public.listing_status_history
    ADD CONSTRAINT chk_lsh_from_status
    CHECK (from_status IS NULL OR from_status IN ('DRAFT', 'PENDING_REVIEW', 'LIVE', 'REJECTED', 'ARCHIVED', 'SCRAPED'));

ALTER TABLE public.listing_status_history
    ADD CONSTRAINT chk_lsh_to_status
    CHECK (to_status IN ('DRAFT', 'PENDING_REVIEW', 'LIVE', 'REJECTED', 'ARCHIVED', 'SCRAPED'));

-- ============================================================
-- 6. Drop the old enum type
-- ============================================================

DROP TYPE IF EXISTS public.listing_status;
