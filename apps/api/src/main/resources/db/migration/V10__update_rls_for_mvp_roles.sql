-- V10: Update RLS policies for MVP roles and listing status lifecycle
--
-- WARNING: This migration requires elevated permissions (superuser or supabase-admin).
-- It references auth.uid() which is Supabase-specific.
-- On non-Supabase databases, skip this migration or adapt the auth references.
--
-- Changes:
--   1. property_listings: replace SELECT policy to use status; add dealer CRUD policies
--   2. listing_images: enable RLS, add policies
--   3. notifications: enable RLS, add policies
--   4. user_saved_areas: enable RLS, add policies
--
-- Backward compatibility:
--   Existing listings have status='SCRAPED'. The new SELECT policy
--   (status='SCRAPED' AND is_valid=true) is equivalent to the old (is_valid=true).

-- ============================================================
-- 1. PROPERTY LISTINGS — update SELECT, add dealer policies
-- ============================================================

-- Drop the old SELECT policy (was: is_valid = true)
DROP POLICY IF EXISTS "Authenticated users can view valid listings"
    ON public.property_listings;

-- New public SELECT: LIVE listings + valid SCRAPED listings
CREATE POLICY "Authenticated users can view visible listings"
    ON public.property_listings FOR SELECT
    TO authenticated
    USING (
        status = 'LIVE'
        OR (status = 'SCRAPED' AND is_valid = true)
    );

-- Dealer can view own listings in any status
CREATE POLICY "Dealers can view own listings"
    ON public.property_listings FOR SELECT
    TO authenticated
    USING (
        public.has_role(auth.uid(), 'dealer')
        AND created_by = auth.uid()
    );

-- Dealer can create listings (status must be DRAFT, created_by must be self)
CREATE POLICY "Dealers can create listings"
    ON public.property_listings FOR INSERT
    TO authenticated
    WITH CHECK (
        public.has_role(auth.uid(), 'dealer')
        AND created_by = auth.uid()
        AND status = 'DRAFT'
    );

-- Dealer can update own DRAFT or REJECTED listings
CREATE POLICY "Dealers can update own draft or rejected listings"
    ON public.property_listings FOR UPDATE
    TO authenticated
    USING (
        public.has_role(auth.uid(), 'dealer')
        AND created_by = auth.uid()
        AND status IN ('DRAFT', 'REJECTED')
    );

-- Dealer can delete own DRAFT listings only
CREATE POLICY "Dealers can delete own draft listings"
    ON public.property_listings FOR DELETE
    TO authenticated
    USING (
        public.has_role(auth.uid(), 'dealer')
        AND created_by = auth.uid()
        AND status = 'DRAFT'
    );

-- NOTE: "Admins can manage all listings" (FOR ALL) from V0.1 is unchanged.

-- ============================================================
-- 2. LISTING IMAGES
-- ============================================================

ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view images of visible listings
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
                OR (public.has_role(auth.uid(), 'dealer') AND pl.created_by = auth.uid())
                OR public.is_admin(auth.uid())
            )
        )
    );

-- Dealer can insert images on own DRAFT or REJECTED listings
CREATE POLICY "Dealers can upload images to own listings"
    ON public.listing_images FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_id
            AND pl.created_by = auth.uid()
            AND pl.status IN ('DRAFT', 'REJECTED')
            AND public.has_role(auth.uid(), 'dealer')
        )
    );

-- Dealer can delete images from own DRAFT or REJECTED listings
CREATE POLICY "Dealers can delete images from own listings"
    ON public.listing_images FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_id
            AND pl.created_by = auth.uid()
            AND pl.status IN ('DRAFT', 'REJECTED')
            AND public.has_role(auth.uid(), 'dealer')
        )
    );

-- Admin can manage all images
CREATE POLICY "Admins can manage all listing images"
    ON public.listing_images FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- ============================================================
-- 3. NOTIFICATIONS
-- ============================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view own notifications
CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can mark own notifications as read (UPDATE is_read only)
CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

-- Admin can manage all notifications (needed for backend service inserts)
CREATE POLICY "Admins can manage all notifications"
    ON public.notifications FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- ============================================================
-- 4. USER SAVED AREAS
-- ============================================================

ALTER TABLE public.user_saved_areas ENABLE ROW LEVEL SECURITY;

-- Users can view own saved areas
CREATE POLICY "Users can view own saved areas"
    ON public.user_saved_areas FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can save areas (user_id must be self)
CREATE POLICY "Users can save areas"
    ON public.user_saved_areas FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Users can remove own saved areas
CREATE POLICY "Users can remove own saved areas"
    ON public.user_saved_areas FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
