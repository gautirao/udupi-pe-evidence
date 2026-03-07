-- V25: Create listing_pois table for nearby points-of-interest per property listing.
-- Ordering is handled at query time: ORDER BY pinned DESC, distance_meters ASC

CREATE TABLE IF NOT EXISTS public.listing_pois (
    id               uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id       uuid             NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
    name             varchar(255)     NOT NULL,
    category         varchar(64)      NOT NULL,
    latitude         double precision,
    longitude        double precision,
    distance_meters  int,
    source           varchar(16)      NOT NULL CHECK (source IN ('overpass', 'manual')),
    osm_id           varchar(32),
    approved         boolean          NOT NULL DEFAULT false,
    pinned           boolean          NOT NULL DEFAULT false,
    approved_by      uuid,
    created_at       timestamptz      NOT NULL DEFAULT now(),
    updated_at       timestamptz      NOT NULL DEFAULT now(),

    -- Prevent duplicate Overpass entries per listing; NULLs (manual rows) do not conflict.
    CONSTRAINT listing_pois_listing_osm_unique UNIQUE NULLS NOT DISTINCT (listing_id, osm_id)
);

-- Primary read path: fetch approved POIs for a listing
CREATE INDEX idx_listing_pois_listing_approved
    ON public.listing_pois (listing_id, approved);

-- Category-capped queries (e.g., "show me hospitals near this listing")
CREATE INDEX idx_listing_pois_listing_category
    ON public.listing_pois (listing_id, category);

-- Cache guard: detect whether an Overpass fetch has already run recently for a listing+source
CREATE INDEX idx_listing_pois_listing_source_created
    ON public.listing_pois (listing_id, source, created_at);

-- Keep updated_at current on every row modification
CREATE TRIGGER update_listing_pois_updated_at
    BEFORE UPDATE ON public.listing_pois
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
