-- V7: Add dealer role and listing status lifecycle
--
-- Changes:
--   1. Add 'dealer' to app_role enum
--   2. Create listing_status enum (SCRAPED, DRAFT, PENDING_REVIEW, LIVE, REJECTED)
--   3. Add status column to property_listings (DEFAULT 'SCRAPED')
--
-- Safety:
--   - IF NOT EXISTS guards make this idempotent
--   - DEFAULT 'SCRAPED' means existing rows and ingestion inserts are unaffected
--   - No columns removed or renamed

-- 1. Extend app_role enum with 'dealer'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dealer';

-- 2. Create listing_status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_status') THEN
        CREATE TYPE public.listing_status AS ENUM (
            'SCRAPED',
            'DRAFT',
            'PENDING_REVIEW',
            'LIVE',
            'REJECTED'
        );
    END IF;
END
$$;

-- 3. Add status column to property_listings
ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS status public.listing_status NOT NULL DEFAULT 'SCRAPED';

-- 4. Index for status-based queries (public listing filter, admin review queue)
CREATE INDEX IF NOT EXISTS idx_property_listings_status
    ON public.property_listings(status);
