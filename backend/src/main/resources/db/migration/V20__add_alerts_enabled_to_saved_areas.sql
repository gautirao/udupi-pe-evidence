-- V20: Add alerts_enabled flag to user_saved_areas
-- Allows users to toggle per-area new-listing notifications.
-- Defaults to true so existing saved areas continue receiving alerts.

ALTER TABLE public.user_saved_areas
    ADD COLUMN IF NOT EXISTS alerts_enabled boolean NOT NULL DEFAULT true;
