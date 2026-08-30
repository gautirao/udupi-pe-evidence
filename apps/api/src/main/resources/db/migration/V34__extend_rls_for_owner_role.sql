-- V34: Extend RLS policies to allow 'user' role (owners) to manage their own listings.
--
-- WARNING: This migration requires elevated permissions (superuser or supabase-admin).
-- It references auth.uid() which is Supabase-specific.
--
-- Changes:
--   1. property_listings: expand dealer SELECT/INSERT/UPDATE/DELETE policies to include 'user' role
--   2. listing_images: expand dealer INSERT/SELECT/DELETE policies to include 'user' role
--
-- Strategy: DROP + re-CREATE each policy. Policy names updated to reflect broader scope.

-- ============================================================
-- 1. PROPERTY LISTINGS — extend to include 'user' (owner) role
-- ============================================================

-- SELECT: own listings in any status
DROP POLICY IF EXISTS "Dealers can view own listings" ON public.property_listings;

CREATE POLICY "Dealers and owners can view own listings"
    ON public.property_listings FOR SELECT
    TO authenticated
    USING (
        (public.has_role(auth.uid(), 'dealer') OR public.has_role(auth.uid(), 'user'))
        AND created_by = auth.uid()
    );

-- INSERT: create DRAFT listings
DROP POLICY IF EXISTS "Dealers can create listings" ON public.property_listings;

CREATE POLICY "Dealers and owners can create listings"
    ON public.property_listings FOR INSERT
    TO authenticated
    WITH CHECK (
        (public.has_role(auth.uid(), 'dealer') OR public.has_role(auth.uid(), 'user'))
        AND created_by = auth.uid()
        AND status = 'DRAFT'
    );

-- UPDATE: own DRAFT or REJECTED listings
DROP POLICY IF EXISTS "Dealers can update own draft or rejected listings" ON public.property_listings;

CREATE POLICY "Dealers and owners can update own draft or rejected listings"
    ON public.property_listings FOR UPDATE
    TO authenticated
    USING (
        (public.has_role(auth.uid(), 'dealer') OR public.has_role(auth.uid(), 'user'))
        AND created_by = auth.uid()
        AND status IN ('DRAFT', 'REJECTED')
    );

-- DELETE: own DRAFT or REJECTED listings
DROP POLICY IF EXISTS "Dealers can delete own draft or rejected listings" ON public.property_listings;

CREATE POLICY "Dealers and owners can delete own draft or rejected listings"
    ON public.property_listings FOR DELETE
    TO authenticated
    USING (
        (public.has_role(auth.uid(), 'dealer') OR public.has_role(auth.uid(), 'user'))
        AND created_by = auth.uid()
        AND status IN ('DRAFT', 'REJECTED')
    );

-- ============================================================
-- 2. LISTING IMAGES — extend to include 'user' (owner) role
-- ============================================================

-- SELECT: images of own listings (the visibility check)
DROP POLICY IF EXISTS "Authenticated users can view images of visible listings" ON public.listing_images;

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
                OR ((public.has_role(auth.uid(), 'dealer') OR public.has_role(auth.uid(), 'user'))
                    AND pl.created_by = auth.uid())
                OR public.is_admin(auth.uid())
            )
        )
    );

-- INSERT: upload images to own DRAFT or REJECTED listings
DROP POLICY IF EXISTS "Dealers can upload images to own listings" ON public.listing_images;

CREATE POLICY "Dealers and owners can upload images to own listings"
    ON public.listing_images FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_id
            AND pl.created_by = auth.uid()
            AND pl.status IN ('DRAFT', 'REJECTED')
            AND (public.has_role(auth.uid(), 'dealer') OR public.has_role(auth.uid(), 'user'))
        )
    );

-- DELETE: delete images from own DRAFT or REJECTED listings
DROP POLICY IF EXISTS "Dealers can delete images from own listings" ON public.listing_images;

CREATE POLICY "Dealers and owners can delete images from own listings"
    ON public.listing_images FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_id
            AND pl.created_by = auth.uid()
            AND pl.status IN ('DRAFT', 'REJECTED')
            AND (public.has_role(auth.uid(), 'dealer') OR public.has_role(auth.uid(), 'user'))
        )
    );
