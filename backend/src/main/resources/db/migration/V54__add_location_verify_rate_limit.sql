-- V54: Add per-listing sliding-window rate-limit columns for location verification.
-- location_verify_attempts: incremented on every attempt (success or fail); reset when window expires.
-- location_verify_window_start: timestamp of the first attempt in the current 24-hour window; null = no window open.
ALTER TABLE public.listing_verification_dimension
    ADD COLUMN IF NOT EXISTS location_verify_attempts     INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS location_verify_window_start TIMESTAMPTZ;
