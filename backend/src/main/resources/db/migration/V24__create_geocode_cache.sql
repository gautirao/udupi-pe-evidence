-- Geocode cache: stores Nominatim lookup results keyed by locality string.
-- Used by the backend geocoding service to avoid redundant Nominatim API calls.
CREATE TABLE IF NOT EXISTS public.geocode_cache (
    id           uuid         NOT NULL DEFAULT gen_random_uuid(),
    locality     text         NOT NULL,
    latitude     double precision NOT NULL,
    longitude    double precision NOT NULL,
    display_name text,
    fetched_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT geocode_cache_pkey PRIMARY KEY (id),
    CONSTRAINT geocode_cache_locality_key UNIQUE (locality)
);
