-- V52: add verification_asset_url column to listing_verification_dimension
-- RE-163: stores the Supabase Storage URL of an uploaded verification
-- asset (photo, mandate document) for ops review.
-- Nullable: rows created before RE-163 do not have an asset.

ALTER TABLE public.listing_verification_dimension
    ADD COLUMN IF NOT EXISTS verification_asset_url VARCHAR(2048);
