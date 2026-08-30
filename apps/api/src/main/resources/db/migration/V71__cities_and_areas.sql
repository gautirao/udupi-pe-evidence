-- V71: geography source-of-truth tables: cities + areas.
-- Seed covers bangalore, mangalore, udupi, kundapur (33 areas).
-- Kundapur areas carry district='Udupi' (administrative) but city_slug='kundapur' (app city).
-- geo_center = geometric polygon center; NOT listing-weighted. Use for map marker placement.
-- centroid on area_overview_stats = AVG(listing coords) = analytics only; never use for UI.

CREATE TABLE IF NOT EXISTS public.cities (
    id             SERIAL PRIMARY KEY,
    slug           TEXT UNIQUE NOT NULL,
    name           TEXT NOT NULL,
    geo_center_lat DOUBLE PRECISION NOT NULL,
    geo_center_lon DOUBLE PRECISION NOT NULL,
    min_lat        DOUBLE PRECISION,
    min_lon        DOUBLE PRECISION,
    max_lat        DOUBLE PRECISION,
    max_lon        DOUBLE PRECISION,
    default_zoom   INTEGER,
    is_active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.areas (
    area_key       TEXT PRIMARY KEY,
    city_id        INTEGER NOT NULL REFERENCES public.cities (id),
    name           TEXT NOT NULL,
    district       TEXT,
    geo_center_lat DOUBLE PRECISION NOT NULL,
    geo_center_lon DOUBLE PRECISION NOT NULL,
    min_lat        DOUBLE PRECISION,
    min_lon        DOUBLE PRECISION,
    max_lat        DOUBLE PRECISION,
    max_lon        DOUBLE PRECISION
);

COMMENT ON COLUMN public.cities.geo_center_lat IS 'Geometric center of city polygon — not listing-weighted';
COMMENT ON COLUMN public.areas.geo_center_lat  IS 'Geometric center of area polygon — use for map marker placement, not centroid_lat from area_overview_stats';

-- ── Cities seed ───────────────────────────────────────────────────────────────

INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon,
                           min_lat, min_lon, max_lat, max_lon, default_zoom, is_active)
VALUES
    ('bangalore', 'Bangalore', 12.9716, 77.5946, 12.8340, 77.3770, 13.1411, 77.7800, 11, true),
    ('mangalore', 'Mangalore', 12.9141, 74.8560, 12.7900, 74.7500, 13.0200, 74.9600, 12, true),
    ('udupi',     'Udupi',     13.3409, 74.7421, 13.1400, 74.6600, 13.4700, 74.8600, 12, true),
    ('kundapur',  'Kundapur',  13.6218, 74.6943, 13.4700, 74.5800, 13.9100, 74.7600, 12, true)
ON CONFLICT (slug) DO NOTHING;

-- ── Areas seed ────────────────────────────────────────────────────────────────
-- city_id is resolved via JOIN on slug so the INSERT is idempotent across re-runs.

INSERT INTO public.areas (area_key, city_id, name, district,
                          geo_center_lat, geo_center_lon,
                          min_lat, min_lon, max_lat, max_lon)
SELECT
    v.area_key,
    c.id,
    v.name,
    v.district,
    v.geo_center_lat :: DOUBLE PRECISION,
    v.geo_center_lon :: DOUBLE PRECISION,
    v.min_lat        :: DOUBLE PRECISION,
    v.min_lon        :: DOUBLE PRECISION,
    v.max_lat        :: DOUBLE PRECISION,
    v.max_lon        :: DOUBLE PRECISION
FROM (VALUES
    -- Bangalore (district = Bengaluru)
    ('IN|KA|Bengaluru|Whitefield',      'bangalore', 'Whitefield',      'Bengaluru', 12.9698, 77.7500, 12.9500, 77.7200, 12.9900, 77.7800),
    ('IN|KA|Bengaluru|Koramangala',     'bangalore', 'Koramangala',     'Bengaluru', 12.9352, 77.6245, 12.9200, 77.6000, 12.9500, 77.6500),
    ('IN|KA|Bengaluru|Indiranagar',     'bangalore', 'Indiranagar',     'Bengaluru', 12.9784, 77.6408, 12.9700, 77.6300, 12.9900, 77.6600),
    ('IN|KA|Bengaluru|Hebbal',          'bangalore', 'Hebbal',          'Bengaluru', 13.0451, 77.5977, 13.0300, 77.5800, 13.0600, 77.6200),
    ('IN|KA|Bengaluru|HSR Layout',      'bangalore', 'HSR Layout',      'Bengaluru', 12.9121, 77.6446, 12.9000, 77.6300, 12.9300, 77.6600),
    ('IN|KA|Bengaluru|Sarjapur Road',   'bangalore', 'Sarjapur Road',   'Bengaluru', 12.9157, 77.6851, 12.8900, 77.6600, 12.9500, 77.7100),
    ('IN|KA|Bengaluru|Yelahanka',       'bangalore', 'Yelahanka',       'Bengaluru', 13.1007, 77.5963, 13.0800, 77.5800, 13.1200, 77.6200),
    ('IN|KA|Bengaluru|Jayanagar',       'bangalore', 'Jayanagar',       'Bengaluru', 12.9250, 77.5938, 12.9100, 77.5800, 12.9400, 77.6100),
    ('IN|KA|Bengaluru|Marathahalli',    'bangalore', 'Marathahalli',    'Bengaluru', 12.9591, 77.7003, 12.9500, 77.6900, 12.9700, 77.7200),
    ('IN|KA|Bengaluru|Electronic City', 'bangalore', 'Electronic City', 'Bengaluru', 12.8458, 77.6632, 12.8300, 77.6500, 12.8600, 77.6800),
    -- Mangalore (district = Mangalore)
    ('IN|KA|Mangalore|Kadri',           'mangalore', 'Kadri',           'Mangalore', 12.8810, 74.8404, 12.8700, 74.8300, 12.8900, 74.8600),
    ('IN|KA|Mangalore|Attavar',         'mangalore', 'Attavar',         'Mangalore', 12.8669, 74.8495, 12.8600, 74.8400, 12.8800, 74.8600),
    ('IN|KA|Mangalore|Balmatta',        'mangalore', 'Balmatta',        'Mangalore', 12.8668, 74.8350, 12.8600, 74.8200, 12.8800, 74.8500),
    ('IN|KA|Mangalore|Hampankatta',     'mangalore', 'Hampankatta',     'Mangalore', 12.8698, 74.8388, 12.8600, 74.8300, 12.8800, 74.8500),
    ('IN|KA|Mangalore|Pumpwell',        'mangalore', 'Pumpwell',        'Mangalore', 12.8900, 74.8500, 12.8800, 74.8400, 12.9000, 74.8600),
    ('IN|KA|Mangalore|Kankanady',       'mangalore', 'Kankanady',       'Mangalore', 12.8754, 74.8579, 12.8700, 74.8500, 12.8900, 74.8700),
    ('IN|KA|Mangalore|Surathkal',       'mangalore', 'Surathkal',       'Mangalore', 12.9977, 74.7973, 12.9800, 74.7800, 13.0100, 74.8200),
    ('IN|KA|Mangalore|Falnir',          'mangalore', 'Falnir',          'Mangalore', 12.8675, 74.8456, 12.8600, 74.8400, 12.8800, 74.8600),
    -- Udupi (district = Udupi)
    ('IN|KA|Udupi|Manipal',             'udupi',     'Manipal',         'Udupi',     13.3528, 74.7947, 13.3400, 74.7800, 13.3700, 74.8200),
    ('IN|KA|Udupi|Kunjibettu',          'udupi',     'Kunjibettu',      'Udupi',     13.3382, 74.7454, 13.3200, 74.7300, 13.3500, 74.7600),
    ('IN|KA|Udupi|Amoghapura',          'udupi',     'Amoghapura',      'Udupi',     13.3328, 74.7354, 13.3200, 74.7200, 13.3500, 74.7500),
    ('IN|KA|Udupi|Katapadi',            'udupi',     'Katapadi',        'Udupi',     13.3568, 74.7783, 13.3400, 74.7600, 13.3700, 74.8000),
    ('IN|KA|Udupi|Malpe',               'udupi',     'Malpe',           'Udupi',     13.3537, 74.7022, 13.3400, 74.6900, 13.3700, 74.7200),
    ('IN|KA|Udupi|Saligrama',           'udupi',     'Saligrama',       'Udupi',     13.3131, 74.7822, 13.3000, 74.7700, 13.3300, 74.8000),
    ('IN|KA|Udupi|Brahmavar',           'udupi',     'Brahmavar',       'Udupi',     13.4286, 74.7540, 13.4100, 74.7400, 13.4500, 74.7700),
    ('IN|KA|Udupi|Padubidri',           'udupi',     'Padubidri',       'Udupi',     13.1843, 74.7841, 13.1700, 74.7700, 13.2000, 74.8000),
    ('IN|KA|Udupi|Udupi',               'udupi',     'Udupi',           'Udupi',     13.3409, 74.7421, 13.3200, 74.7200, 13.3700, 74.7700),
    ('IN|KA|Udupi|Hejamadi',            'udupi',     'Hejamadi',        'Udupi',     13.1693, 74.8139, 13.1600, 74.8000, 13.1800, 74.8300),
    ('IN|KA|Udupi|Shirva',              'udupi',     'Shirva',          'Udupi',     13.2012, 74.7842, 13.1900, 74.7700, 13.2200, 74.8000),
    ('IN|KA|Udupi|Kaup',                'udupi',     'Kaup',            'Udupi',     13.2169, 74.7456, 13.2100, 74.7300, 13.2300, 74.7700),
    -- Kundapur (administrative district = Udupi; app city = kundapur)
    ('IN|KA|Udupi|Kundapura',           'kundapur',  'Kundapura',       'Udupi',     13.6236, 74.6899, 13.6100, 74.6700, 13.6400, 74.7100),
    ('IN|KA|Udupi|Byndoor',             'kundapur',  'Byndoor',         'Udupi',     13.8717, 74.6508, 13.8600, 74.6400, 13.8900, 74.6700),
    ('IN|KA|Udupi|Navunda',             'kundapur',  'Navunda',         'Udupi',     13.6800, 74.6400, 13.6700, 74.6200, 13.6900, 74.6600)
) AS v (area_key, city_slug, name, district,
        geo_center_lat, geo_center_lon,
        min_lat, min_lon, max_lat, max_lon)
JOIN public.cities c ON c.slug = v.city_slug
ON CONFLICT (area_key) DO NOTHING;
