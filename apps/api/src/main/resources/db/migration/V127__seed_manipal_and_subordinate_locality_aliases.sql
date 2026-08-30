-- V127: seed curated area_alias rows for Manipal + representative subordinate-locality
-- aliases across the seeded city set (#2268).
--
-- Context: the hardcoded "manipal" -> "udupi" city-slug alias previously added to
-- GeocodedAreaKeyFormat.normalizeCityToSlug was removed in this same PR — a code-level
-- town->city mapping is a second, unreviewed authority parallel to this table. area_alias
-- (V115) is the canonical, reviewed authority for this kind of mapping, and
-- AreaResolutionService.resolveByAliasAnyCity (#2268) now derives the owning city FROM the
-- matched area, so a city-less curated alias is sufficient to resolve Manipal without any
-- code-level city-name alias.
--
-- Every area_key referenced below was verified to exist and be ACTIVE (V71 seed; V116 defaults
-- lifecycle_status to 'ACTIVE' for all pre-existing rows) before being inserted here.
--
-- Coverage: Udupi (Manipal, required) + one representative subordinate-locality alias each for
-- bangalore, mangalore, kundapur — genuinely real, verifiable alternate names/spellings for
-- existing seeded areas, not invented place names:
--   * Bangalore: "ITPL" (International Tech Park Bangalore) is the commonly used name for the
--     tech park that sits within/adjacent to the Whitefield locality.
--   * Mangalore: "Kadri Hills" is the well-known temple/hill locality within the broader Kadri
--     area.
--   * Kundapur: "Kundapur" (city name, no trailing "a") is the common alternate spelling of the
--     area's seeded name "Kundapura" — same real place, different accepted spelling.
--
-- Idempotent: ON CONFLICT (city_id, alias_normalised) DO NOTHING (V115's unique constraint).

INSERT INTO public.area_alias (city_id, area_key, alias, alias_normalised, source)
SELECT c.id, v.area_key, v.alias, v.alias_normalised, v.source
FROM (VALUES
    ('udupi',     'IN|KA|Udupi|Manipal',             'Manipal',      'manipal',       '2268_curated_alias'),
    ('bangalore', 'IN|KA|Bengaluru|Whitefield',       'ITPL',         'itpl',          '2268_curated_alias'),
    ('mangalore', 'IN|KA|Mangalore|Kadri',            'Kadri Hills',  'kadri hills',   '2268_curated_alias'),
    ('kundapur',  'IN|KA|Udupi|Kundapura',            'Kundapur',     'kundapur',      '2268_curated_alias')
) AS v (city_slug, area_key, alias, alias_normalised, source)
JOIN public.cities c ON c.slug = v.city_slug
JOIN public.areas a ON a.area_key = v.area_key AND a.city_id = c.id AND a.lifecycle_status = 'ACTIVE'
ON CONFLICT (city_id, alias_normalised) DO NOTHING;
