-- V74: composite index to accelerate city-first area listings query (#886)
-- Supports: WHERE area_key = ? AND status = 'LIVE' ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_listing_area_key_status_created
    ON public.property_listings (area_key, status, created_at DESC);
