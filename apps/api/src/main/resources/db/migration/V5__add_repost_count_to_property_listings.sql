-- Add repost_count to property_listings for tracking how many times
-- a listing with the same dedupe_hash has been seen before.
-- listing_age_days and is_fresh are intentionally NOT persisted;
-- they will be computed at query/response time.

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS repost_count INTEGER NOT NULL DEFAULT 0;
