-- V18: Add full-text search vector column + GIN index to property_listings
-- Enables server-side FTS via plainto_tsquery / websearch_to_tsquery.
--
-- Generated column auto-populates on INSERT/UPDATE; backfilled on migration run.
-- No CONCURRENTLY — Supabase pgBouncer transaction-mode is incompatible with it.
-- IF NOT EXISTS on both statements ensures idempotency.

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector(
                'english',
                coalesce(title, '') || ' ' ||
                coalesce(locality, '') || ' ' ||
                coalesce(description, '')
            )
        ) STORED;

CREATE INDEX IF NOT EXISTS idx_property_listings_search_vector
    ON public.property_listings USING gin(search_vector);
