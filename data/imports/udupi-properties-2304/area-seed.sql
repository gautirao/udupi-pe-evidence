-- Area seed: new Udupi-district localities backed by OSM Nominatim evidence.
-- Issue #2304 Slice 1. Idempotent (ON CONFLICT DO NOTHING). No DDL.
-- Evidence: data/imports/udupi-properties-2304/area-bbox-evidence.json

BEGIN;

INSERT INTO public.areas (area_key, city_id, name, district,
                          geo_center_lat, geo_center_lon,
                          min_lat, min_lon, max_lat, max_lon)
SELECT v.area_key, c.id, v.name, v.district,
       v.geo_center_lat::DOUBLE PRECISION, v.geo_center_lon::DOUBLE PRECISION,
       v.min_lat::DOUBLE PRECISION, v.min_lon::DOUBLE PRECISION,
       v.max_lat::DOUBLE PRECISION, v.max_lon::DOUBLE PRECISION
FROM (VALUES
    ('IN|KA|Udupi|Santhekatte', 'udupi', 'Santhekatte', 'Udupi', 13.3876323, 74.7389702, 13.3756323, 74.7269702, 13.3996323, 74.7509702),
    ('IN|KA|Udupi|Brahmagiri', 'udupi', 'Brahmagiri', 'Udupi', 13.3412188, 74.7407976, 13.3262188, 74.72579759999999, 13.3562188, 74.7557976),
    ('IN|KA|Udupi|Kinnimulki', 'udupi', 'Kinnimulki', 'Udupi', 13.3234807, 74.7388074, 13.311480699999999, 74.7268074, 13.3354807, 74.7508074),
    ('IN|KA|Udupi|Kuthpady', 'udupi', 'Kuthpady', 'Udupi', 13.3203168, 74.727029, 13.3083168, 74.715029, 13.332316800000001, 74.739029),
    ('IN|KA|Udupi|Ambagilu', 'udupi', 'Ambagilu', 'Udupi', 13.3710379, 74.7464615, 13.359037899999999, 74.7344615, 13.3830379, 74.7584615),
    ('IN|KA|Udupi|Adi-Udupi', 'udupi', 'Adi-Udupi', 'Udupi', 13.3477889, 74.731205, 13.335788899999999, 74.719205, 13.3597889, 74.743205)
) AS v (area_key, city_slug, name, district,
        geo_center_lat, geo_center_lon, min_lat, min_lon, max_lat, max_lon)
JOIN public.cities c ON c.slug = v.city_slug
ON CONFLICT (area_key) DO NOTHING;

COMMIT;
