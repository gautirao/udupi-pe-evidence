-- V11: Close schema drift — add price_paise and dedupe_hash to property_listings.
--
-- These columns exist in the Listing JPA entity and in the production Supabase DB
-- but were never captured as Flyway migrations. This migration closes the drift
-- so that Flyway is the single source of truth for the schema.
--
-- Uses IF NOT EXISTS for idempotency on environments where the columns already exist.

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS price_paise BIGINT,
    ADD COLUMN IF NOT EXISTS dedupe_hash TEXT;

-- Index for deduplication lookups (existsByDedupeHash, countByDedupeHash).
-- Partial index excludes NULLs since only hashed listings need lookup.
CREATE INDEX IF NOT EXISTS idx_property_listings_dedupe_hash
    ON public.property_listings (dedupe_hash)
    WHERE dedupe_hash IS NOT NULL;

COMMENT ON COLUMN public.property_listings.price_paise IS 'Price in paise (1/100 rupee). Source of truth for price; replaces deprecated price column.';
COMMENT ON COLUMN public.property_listings.dedupe_hash IS 'Hash of (description, locality, price) used for duplicate detection and repost counting.';
