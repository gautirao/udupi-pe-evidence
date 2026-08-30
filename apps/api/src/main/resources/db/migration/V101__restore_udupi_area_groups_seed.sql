-- V101: Restore Udupi area groups and memberships seed data after Flyway repair.
-- Idempotent repair migration: restores canonical Udupi area groups, their metadata,
-- descriptions, and area memberships. Uses natural keys (city slug and area_key).

-- 1. Upsert Udupi area groups
WITH udupi AS (SELECT id FROM public.cities WHERE slug = 'udupi')
INSERT INTO public.area_groups
    (city_id, slug, name, subtitle, region_label, display_order, is_active,
     focus_lat, focus_lon, min_lat, min_lon, max_lat, max_lon, description)
SELECT
    udupi.id,
    v.slug,
    v.name,
    v.subtitle,
    v.region_label,
    v.display_order,
    true,
    v.focus_lat  :: DOUBLE PRECISION,
    v.focus_lon  :: DOUBLE PRECISION,
    v.min_lat    :: DOUBLE PRECISION,
    v.min_lon    :: DOUBLE PRECISION,
    v.max_lat    :: DOUBLE PRECISION,
    v.max_lon    :: DOUBLE PRECISION,
    v.description
FROM udupi, (VALUES
    ('university-belt',  'University Belt',  'Academic and student housing',     'Central Udupi',  1, 13.3528, 74.7947, 13.3200, 74.7700, 13.3700, 74.8200, 'Manipal''s academic spine stretches from the MAHE campus through Katapadi, creating strong demand for student accommodation, faculty housing, and compact service apartments. Property values are anchored by institutional tenure and low vacancy.'),
    ('coastal-strip',    'Coastal Strip',    'Beachside and fishing villages',   'West Udupi',     2, 13.3537, 74.7022, 13.3400, 74.6900, 13.3700, 74.7200, 'A narrow band of beachside villages between Malpe harbour and Kaup lighthouse. Plots here attract second-home buyers and resort developers; proximity to the Arabian Sea drives premium pricing while seasonal lettings supplement rental yield.'),
    ('city-centre',      'City Centre',      'Core urban and temple precinct',   'Central Udupi',  3, 13.3409, 74.7421, 13.3200, 74.7200, 13.3700, 74.7700, 'The temple precinct and commercial core of Udupi city, encompassing Kunjibettu and Amoghapura. High footfall from Krishna Matha pilgrims supports retail and hospitality uses; residential stock is older but benefits from civic infrastructure.'),
    ('north-udupi',      'North Udupi',      'Rapidly developing northern belt', 'North Udupi',    4, 13.4286, 74.7540, 13.4100, 74.7400, 13.4500, 74.7700, 'Brahmavar and its surrounds form the fastest-growing belt in the district, with NH-66 access and a rising share of plotted developments targeting first-time buyers priced out of Udupi city.'),
    ('south-udupi',      'South Udupi',      'Quiet residential southern belt',  'South Udupi',    5, 13.2012, 74.7842, 13.1700, 74.7700, 13.2200, 74.8000, 'Shirva and Padubidri offer quiet residential options at lower price points. Industrial clusters near Padubidri draw a workforce rental segment, while Shirva appeals to families seeking greenery without sacrificing highway connectivity.')
) AS v (slug, name, subtitle, region_label, display_order,
        focus_lat, focus_lon, min_lat, min_lon, max_lat, max_lon, description)
ON CONFLICT (city_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    subtitle = EXCLUDED.subtitle,
    region_label = EXCLUDED.region_label,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    focus_lat = EXCLUDED.focus_lat,
    focus_lon = EXCLUDED.focus_lon,
    min_lat = EXCLUDED.min_lat,
    min_lon = EXCLUDED.min_lon,
    max_lat = EXCLUDED.max_lat,
    max_lon = EXCLUDED.max_lon,
    description = EXCLUDED.description;

-- 2. Upsert Udupi group members
INSERT INTO public.area_group_members (area_group_id, area_key, display_order)
SELECT ag.id, v.area_key, v.display_order
FROM public.area_groups ag
JOIN public.cities c ON c.id = ag.city_id
CROSS JOIN (VALUES
    -- university-belt: Manipal, Katapadi
    ('university-belt', 'IN|KA|Udupi|Manipal',    1),
    ('university-belt', 'IN|KA|Udupi|Katapadi',   2),
    -- coastal-strip: Malpe, Kaup
    ('coastal-strip',   'IN|KA|Udupi|Malpe',      1),
    ('coastal-strip',   'IN|KA|Udupi|Kaup',       2),
    -- city-centre: Udupi, Kunjibettu, Amoghapura
    ('city-centre',     'IN|KA|Udupi|Udupi',      1),
    ('city-centre',     'IN|KA|Udupi|Kunjibettu', 2),
    ('city-centre',     'IN|KA|Udupi|Amoghapura', 3),
    -- north-udupi: Brahmavar
    ('north-udupi',     'IN|KA|Udupi|Brahmavar',  1),
    -- south-udupi: Shirva, Padubidri
    ('south-udupi',     'IN|KA|Udupi|Shirva',     1),
    ('south-udupi',     'IN|KA|Udupi|Padubidri',  2)
) AS v (group_slug, area_key, display_order)
WHERE c.slug = 'udupi'
  AND ag.slug = v.group_slug
ON CONFLICT (area_group_id, area_key) DO UPDATE SET
    display_order = EXCLUDED.display_order;
