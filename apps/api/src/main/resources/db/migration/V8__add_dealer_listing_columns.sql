-- V8: Add dealer listing workflow columns
--
-- Adds fields needed for dealer listing creation, submission, and admin review.
-- All columns have safe defaults (NULL or false) so existing rows and
-- ingestion inserts are unaffected.
--
-- Note: 'title' already exists in V0, so it is NOT added here.

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS address_confirmed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID,
    ADD COLUMN IF NOT EXISTS created_by UUID;
