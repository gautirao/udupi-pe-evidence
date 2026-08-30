-- V22: Add optional price threshold to user_saved_areas
-- Null means no threshold (all listings pass through)
ALTER TABLE public.user_saved_areas
    ADD COLUMN IF NOT EXISTS price_threshold_rupees bigint;
