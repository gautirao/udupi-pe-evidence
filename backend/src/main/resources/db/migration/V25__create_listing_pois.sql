-- V25: Create listing_pois table for Overpass-sourced and dealer-added POIs.
-- approved_by stores Supabase auth.users UUID without FK (same pattern as created_by on property_listings).

CREATE TABLE public.listing_pois (
    id               uuid                     NOT NULL DEFAULT gen_random_uuid(),
    listing_id       uuid                     NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
    name             varchar(255),
    category         varchar(64),
    latitude         double precision,
    longitude        double precision,
    distance_meters  int,
    source           varchar(16)              NOT NULL,
    osm_id           varchar(32),
    approved         boolean                  NOT NULL DEFAULT false,
    pinned           boolean                  NOT NULL DEFAULT false,
    position         int,
    approved_by      uuid,
    created_at       timestamptz              NOT NULL DEFAULT now(),
    updated_at       timestamptz              NOT NULL DEFAULT now(),

    CONSTRAINT listing_pois_pkey PRIMARY KEY (id),
    CONSTRAINT listing_pois_source_check CHECK (source IN ('overpass', 'manual')),
    -- Prevent duplicate OSM node per listing (NULL osm_id allowed for manual POIs)
    CONSTRAINT listing_pois_listing_osm_unique UNIQUE NULLS NOT DISTINCT (listing_id, osm_id)
);

-- Primary read path: approved POIs for a listing
CREATE INDEX listing_pois_listing_approved_idx ON public.listing_pois (listing_id, approved);

-- Category-capped queries: top N per category
CREATE INDEX listing_pois_listing_category_idx ON public.listing_pois (listing_id, category);

-- Cache guard: find overpass rows younger than 14 days
CREATE INDEX listing_pois_listing_source_created_idx ON public.listing_pois (listing_id, source, created_at);
