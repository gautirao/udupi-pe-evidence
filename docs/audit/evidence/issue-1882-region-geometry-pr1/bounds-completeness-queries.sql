-- #1882 Track A PR1 additive amendment — bounds-completeness evidence queries.
--
-- READ-ONLY diagnostic SQL. These are SELECT statements only, intended to be run manually
-- against a local/Testcontainers Postgres for evidence-gathering. They are NOT executed by
-- any application code path and MUST NOT be run against the shared hosted Supabase database
-- without separate explicit authorization (see CLAUDE.md "No live smoke vs shared Supabase").
--
-- Context: RegionSummaryService now surfaces, per region, whether every member area
-- contributed a complete bbox to that region's bounds union (boundsStatus=COMPLETE) or whether
-- one or more member areas lacked one and fell back to their centroid point
-- (boundsStatus=APPROXIMATE / missingBoundsAreaCount). The completeness predicate mirrored here
-- is CityRegionProjection.hasCompleteValidBbox: min_lat, max_lat, min_lon, max_lon all non-null
-- (no degeneracy/min<max check — see query (d) below for that separate, currently-undetected
-- data-quality concern, which belongs to #1887, not this predicate).

-- (a) Total active areas by city.
SELECT c.slug AS city_slug, COUNT(*) AS total_areas
FROM public.areas a
JOIN public.cities c ON c.id = a.city_id
WHERE c.is_active = true
GROUP BY c.slug
ORDER BY c.slug;

-- (b) Areas with a complete, valid bbox (all 4 corners present).
SELECT c.slug AS city_slug, COUNT(*) AS areas_with_complete_bbox
FROM public.areas a
JOIN public.cities c ON c.id = a.city_id
WHERE a.min_lat IS NOT NULL AND a.max_lat IS NOT NULL
  AND a.min_lon IS NOT NULL AND a.max_lon IS NOT NULL
GROUP BY c.slug
ORDER BY c.slug;

-- (c) Areas with a missing (null) bbox value in at least one corner.
SELECT c.slug AS city_slug, a.area_key, a.name,
       a.min_lat, a.max_lat, a.min_lon, a.max_lon
FROM public.areas a
JOIN public.cities c ON c.id = a.city_id
WHERE a.min_lat IS NULL OR a.max_lat IS NULL
   OR a.min_lon IS NULL OR a.max_lon IS NULL
ORDER BY c.slug, a.area_key;

-- (d) Areas with a malformed/zero-size bbox (min >= max on either axis). Separate from the
--     null-based completeness predicate above — not currently detected/surfaced by #1882;
--     tracked as a data-quality follow-up under #1887.
SELECT c.slug AS city_slug, a.area_key, a.name,
       a.min_lat, a.max_lat, a.min_lon, a.max_lon
FROM public.areas a
JOIN public.cities c ON c.id = a.city_id
WHERE a.min_lat IS NOT NULL AND a.max_lat IS NOT NULL
  AND a.min_lon IS NOT NULL AND a.max_lon IS NOT NULL
  AND (a.min_lat >= a.max_lat OR a.min_lon >= a.max_lon)
ORDER BY c.slug, a.area_key;

-- (e) Areas with centre only (geo_center present — always required NOT NULL — but bbox null).
SELECT c.slug AS city_slug, a.area_key, a.name,
       a.geo_center_lat, a.geo_center_lon
FROM public.areas a
JOIN public.cities c ON c.id = a.city_id
WHERE a.geo_center_lat IS NOT NULL AND a.geo_center_lon IS NOT NULL
  AND (a.min_lat IS NULL OR a.max_lat IS NULL OR a.min_lon IS NULL OR a.max_lon IS NULL)
ORDER BY c.slug, a.area_key;

-- (f) Areas not represented in regional_area_classifications (i.e. never got a region
--     assignment at all — a prerequisite gap distinct from bbox completeness).
SELECT c.slug AS city_slug, a.area_key, a.name
FROM public.areas a
JOIN public.cities c ON c.id = a.city_id
LEFT JOIN regional_area_classifications rac
       ON rac.city_key = c.slug AND rac.area_key = a.area_key
WHERE rac.area_key IS NULL
ORDER BY c.slug, a.area_key;
