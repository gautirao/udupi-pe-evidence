-- V9: Create new MVP tables — listing_images, notifications, user_saved_areas
--
-- These tables support dealer image uploads, in-app notifications, and
-- user area tracking for insights. They do not affect existing tables.

-- 1. Listing images (dealer-uploaded photos for a listing)
CREATE TABLE IF NOT EXISTS public.listing_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    url TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_images_listing_id
    ON public.listing_images(listing_id);

CREATE INDEX IF NOT EXISTS idx_listing_images_listing_position
    ON public.listing_images(listing_id, position);

-- 2. Notifications (in-app notifications for users)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON public.notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications(user_id, is_read)
    WHERE is_read = false;

-- 3. User saved areas (areas a user follows for insights)
CREATE TABLE IF NOT EXISTS public.user_saved_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    area_key TEXT NOT NULL,
    area_label TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, area_key)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_areas_user_id
    ON public.user_saved_areas(user_id);

-- Timestamp trigger for listing_images (no updated_at needed — immutable after upload)
-- Notifications and saved_areas are also append/read/delete — no update triggers needed.
