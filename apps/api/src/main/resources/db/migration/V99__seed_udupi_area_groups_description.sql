-- V99: Backfill description for Udupi area groups.
--
-- DESIGN NOTES
-- ============
-- 1. SAFE: only updates rows where description IS NULL, protecting any previously set value.
-- 2. Idempotent: re-running on a DB where the values are already set is a no-op (0 rows updated).
-- 3. References only existing rows (slugs seeded by V78). No inserts; no schema changes.
-- 4. Does NOT touch Bangalore groups — descriptions for those are out of scope for this issue.

UPDATE public.area_groups ag
SET description = v.description
FROM (VALUES
    ('university-belt', 'Manipal''s academic spine stretches from the MAHE campus through Katapadi, creating strong demand for student accommodation, faculty housing, and compact service apartments. Property values are anchored by institutional tenure and low vacancy.'),
    ('coastal-strip',   'A narrow band of beachside villages between Malpe harbour and Kaup lighthouse. Plots here attract second-home buyers and resort developers; proximity to the Arabian Sea drives premium pricing while seasonal lettings supplement rental yield.'),
    ('city-centre',     'The temple precinct and commercial core of Udupi city, encompassing Kunjibettu and Amoghapura. High footfall from Krishna Matha pilgrims supports retail and hospitality uses; residential stock is older but benefits from civic infrastructure.'),
    ('north-udupi',     'Brahmavar and its surrounds form the fastest-growing belt in the district, with NH-66 access and a rising share of plotted developments targeting first-time buyers priced out of Udupi city.'),
    ('south-udupi',     'Shirva and Padubidri offer quiet residential options at lower price points. Industrial clusters near Padubidri draw a workforce rental segment, while Shirva appeals to families seeking greenery without sacrificing highway connectivity.')
) AS v (slug, description)
JOIN public.cities c ON c.slug = 'udupi'
WHERE ag.slug = v.slug
  AND ag.city_id = c.id
  AND ag.description IS NULL;
