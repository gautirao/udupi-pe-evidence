-- V78: Seed area groups for Bangalore and Udupi.
-- Idempotent: parent rows use ON CONFLICT (city_id, slug) DO NOTHING.
-- Member rows use ON CONFLICT (area_group_id, area_key) DO NOTHING.
-- All area_key values are verified to exist in areas table (seeded by V71).
-- All city slugs are verified to exist in cities table (seeded by V71).

-- ── Bangalore groups ────────────────────────────────────────────────────────

WITH bangalore AS (SELECT id FROM public.cities WHERE slug = 'bangalore')
INSERT INTO public.area_groups
    (city_id, slug, name, subtitle, region_label, display_order, is_active,
     focus_lat, focus_lon, min_lat, min_lon, max_lat, max_lon)
SELECT
    bangalore.id,
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
    v.max_lon    :: DOUBLE PRECISION
FROM bangalore, (VALUES
    ('tech-corridor',  'Tech Corridor',    'IT hubs and tech parks',          'East Bangalore',  1, 12.9645, 77.7000, 12.9000, 77.6200, 13.0000, 77.7800),
    ('north-growth',   'North Growth',     'Emerging residential corridors',  'North Bangalore', 2, 13.0700, 77.5970, 12.9600, 77.5800, 13.1200, 77.6200),
    ('south-premium',  'South Premium',    'Established premium localities',  'South Bangalore', 3, 12.9200, 77.6000, 12.9000, 77.5800, 12.9400, 77.6200),
    ('outer-ring',     'Outer Ring Road',  'High-density development belt',   'East Bangalore',  4, 12.9370, 77.6700, 12.9100, 77.6200, 12.9600, 77.7200),
    ('airport-belt',   'Airport Belt',     'Near-airport residential zones',  'North Bangalore', 5, 13.1000, 77.5963, 13.0700, 77.5800, 13.1200, 77.6200)
) AS v (slug, name, subtitle, region_label, display_order,
        focus_lat, focus_lon, min_lat, min_lon, max_lat, max_lon)
ON CONFLICT (city_id, slug) DO NOTHING;

-- Bangalore group members (area_keys from V71, district = Bengaluru)
INSERT INTO public.area_group_members (area_group_id, area_key, display_order)
SELECT ag.id, v.area_key, v.display_order
FROM public.area_groups ag
JOIN public.cities c ON c.id = ag.city_id
CROSS JOIN (VALUES
    -- tech-corridor: Whitefield, Marathahalli, Electronic City, Sarjapur Road
    ('tech-corridor', 'IN|KA|Bengaluru|Whitefield',      1),
    ('tech-corridor', 'IN|KA|Bengaluru|Marathahalli',    2),
    ('tech-corridor', 'IN|KA|Bengaluru|Electronic City', 3),
    ('tech-corridor', 'IN|KA|Bengaluru|Sarjapur Road',   4),
    -- north-growth: Hebbal, Yelahanka
    ('north-growth',  'IN|KA|Bengaluru|Hebbal',          1),
    ('north-growth',  'IN|KA|Bengaluru|Yelahanka',       2),
    -- south-premium: Koramangala, Jayanagar, HSR Layout
    ('south-premium', 'IN|KA|Bengaluru|Koramangala',     1),
    ('south-premium', 'IN|KA|Bengaluru|Jayanagar',       2),
    ('south-premium', 'IN|KA|Bengaluru|HSR Layout',      3),
    -- outer-ring: Marathahalli, Indiranagar
    ('outer-ring',    'IN|KA|Bengaluru|Marathahalli',    1),
    ('outer-ring',    'IN|KA|Bengaluru|Indiranagar',     2),
    -- airport-belt: Yelahanka, Hebbal
    ('airport-belt',  'IN|KA|Bengaluru|Yelahanka',       1),
    ('airport-belt',  'IN|KA|Bengaluru|Hebbal',          2)
) AS v (group_slug, area_key, display_order)
WHERE c.slug = 'bangalore'
  AND ag.slug = v.group_slug
ON CONFLICT (area_group_id, area_key) DO NOTHING;

-- ── Udupi groups ─────────────────────────────────────────────────────────────

WITH udupi AS (SELECT id FROM public.cities WHERE slug = 'udupi')
INSERT INTO public.area_groups
    (city_id, slug, name, subtitle, region_label, display_order, is_active,
     focus_lat, focus_lon, min_lat, min_lon, max_lat, max_lon)
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
    v.max_lon    :: DOUBLE PRECISION
FROM udupi, (VALUES
    ('university-belt',  'University Belt',  'Academic and student housing',     'Central Udupi',  1, 13.3528, 74.7947, 13.3200, 74.7700, 13.3700, 74.8200),
    ('coastal-strip',    'Coastal Strip',    'Beachside and fishing villages',   'West Udupi',     2, 13.3537, 74.7022, 13.3400, 74.6900, 13.3700, 74.7200),
    ('city-centre',      'City Centre',      'Core urban and temple precinct',   'Central Udupi',  3, 13.3409, 74.7421, 13.3200, 74.7200, 13.3700, 74.7700),
    ('north-udupi',      'North Udupi',      'Rapidly developing northern belt', 'North Udupi',    4, 13.4286, 74.7540, 13.4100, 74.7400, 13.4500, 74.7700),
    ('south-udupi',      'South Udupi',      'Quiet residential southern belt',  'South Udupi',    5, 13.2012, 74.7842, 13.1700, 74.7700, 13.2200, 74.8000)
) AS v (slug, name, subtitle, region_label, display_order,
        focus_lat, focus_lon, min_lat, min_lon, max_lat, max_lon)
ON CONFLICT (city_id, slug) DO NOTHING;

-- Udupi group members (area_keys from V71, district = Udupi)
INSERT INTO public.area_group_members (area_group_id, area_key, display_order)
SELECT ag.id, v.area_key, v.display_order
FROM public.area_groups ag
JOIN public.cities c ON c.id = ag.city_id
CROSS JOIN (VALUES
    -- university-belt: Manipal, Katapadi
    ('university-belt', 'IN|KA|Udupi|Manipal',    1),
    ('university-belt', 'IN|KA|Udupi|Katapadi',   2),
    -- coastal-strip: Malpe, Kaup (using Kaup from V71)
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
ON CONFLICT (area_group_id, area_key) DO NOTHING;
