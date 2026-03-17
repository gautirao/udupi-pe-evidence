-- Reference copy only. Run this in the Supabase SQL editor (not via Flyway).
-- Bucket: listing-images
-- Sets up the Storage bucket and all RLS policies for listing image objects.
-- Updated in V41 (expand phase): 'broker' added alongside 'dealer' in INSERT/DELETE policies.
--
-- Upload path format (from src/hooks/useListingImages.ts line 101):
--   listings/{userId}/{listingId}/{timestamp}-{random}.{ext}
--
-- storage.foldername(name) returns TEXT[] split on '/':
--   [1] = 'listings'  (literal prefix)
--   [2] = userId      (auth.uid() of the uploader)
--   [3] = listingId
--   [4] = filename
--
-- No UPDATE policy: images are immutable. Delete + re-upload is the intended pattern.
-- Admin role included in INSERT/DELETE policies so admins can act via their own JWT.
-- For service-role server-side operations (RE-46), RLS is bypassed entirely.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Bucket
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates the bucket if it does not exist; ensures public=true if it already does.
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Drop existing policies (idempotent re-run safety)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "listing_images_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "listing_images_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "listing_images_owner_delete" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SELECT — public read (anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
-- Listing card and detail page <img> tags use Supabase CDN public URLs without
-- auth headers. Bucket-level public alone is not sufficient for all Supabase
-- plan tiers; an explicit policy guarantees the behaviour.
CREATE POLICY "listing_images_public_read" ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'listing-images');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. INSERT — authenticated owner only
-- ─────────────────────────────────────────────────────────────────────────────
-- Enforces:
--   • path must start with the 'listings' prefix (segment [1])
--   • segment [2] must equal the caller's own user id
-- This prevents a dealer from uploading into another dealer's path.
CREATE POLICY "listing_images_owner_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-images'
    AND (storage.foldername(name))[1] = 'listings'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND (public.has_role(auth.uid(), 'dealer') OR public.has_role(auth.uid(), 'broker') OR public.has_role(auth.uid(), 'user') OR public.has_role(auth.uid(), 'admin'))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. DELETE — authenticated owner only
-- ─────────────────────────────────────────────────────────────────────────────
-- Same ownership constraint as INSERT. Required for RE-46 (Storage DELETE calls
-- from frontend/backend). Admins delete via service_role key server-side; no
-- separate admin clause is needed here.
CREATE POLICY "listing_images_owner_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'listing-images'
    AND (storage.foldername(name))[1] = 'listings'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND (public.has_role(auth.uid(), 'dealer') OR public.has_role(auth.uid(), 'broker') OR public.has_role(auth.uid(), 'user') OR public.has_role(auth.uid(), 'admin'))
  );
