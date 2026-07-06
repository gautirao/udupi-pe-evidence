-- Issue #1761 — read-only analysis queries archived for evidence.
-- All queries below were run SELECT-only against the shared/hosted Supabase DB to
-- establish the baseline and the pre-change unmapped-locality report. No mutation
-- was executed pre-merge; the only mutation path is Flyway V106 on merge/deploy.
-- See README.md in this directory for the curated taxonomy and reconciliation proof.

-- ============================================================
-- Q1: pre-change report of unmapped Bangalore localities (read-only)
-- Source: .claude/handoffs/issue-1761/analysis/q1-unmapped.sql
-- ============================================================

-- Q1: unmapped Bangalore localities with LIVE listing counts (read-only)
SELECT a.area_key, a.name, COUNT(pl.id) AS live_listings
FROM public.areas a
JOIN public.cities c ON c.id = a.city_id
JOIN public.property_listings pl ON pl.area_key = a.area_key
  AND pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
  AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
WHERE c.slug = 'bangalore'
  AND NOT EXISTS (SELECT 1 FROM public.area_group_members agm WHERE agm.area_key = a.area_key)
GROUP BY a.area_key, a.name
ORDER BY live_listings DESC;

-- ============================================================
-- Q2: baseline reconciliation of existing V78 group membership (read-only)
-- Source: .claude/handoffs/issue-1761/analysis/q2-baseline.sql
-- ============================================================

-- Q2a: baseline per-group counts (sale), replicating DiscoverSummaryService predicate
SELECT ag.slug AS region_key, ag.region_label, COUNT(pl.id) AS listing_count
FROM public.area_groups ag
JOIN public.cities c ON c.id = ag.city_id
JOIN public.area_group_members agm ON agm.area_group_id = ag.id
LEFT JOIN public.property_listings pl ON pl.area_key = agm.area_key
  AND pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
  AND pl.listing_purpose = 'sale'
  AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
WHERE c.slug = 'bangalore' AND ag.is_active = true
GROUP BY ag.slug, ag.region_label
ORDER BY ag.slug;

-- Q2b: total active sale listings for bangalore (summary totalActiveListings)
SELECT COUNT(pl.id) AS total_active_sale
FROM public.property_listings pl
WHERE pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
  AND pl.listing_purpose = 'sale'
  AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
  AND pl.area_key IN (SELECT a.area_key FROM public.areas a JOIN public.cities c ON c.id = a.city_id WHERE c.slug = 'bangalore');

-- Q2c: overlap quantification — listings counted in >1 group / >1 region_label (sale)
SELECT
  COUNT(DISTINCT pl.id) FILTER (WHERE cnt.groups > 1) AS listings_in_multiple_groups,
  COUNT(DISTINCT pl.id) FILTER (WHERE cnt.labels > 1) AS listings_in_multiple_region_labels
FROM public.property_listings pl
JOIN LATERAL (
  SELECT COUNT(DISTINCT agm.area_group_id) AS groups,
         COUNT(DISTINCT ag.region_label) AS labels
  FROM public.area_group_members agm
  JOIN public.area_groups ag ON ag.id = agm.area_group_id AND ag.is_active = true
  WHERE agm.area_key = pl.area_key
) cnt ON true
WHERE pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
  AND pl.listing_purpose = 'sale'
  AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
  AND pl.area_key IN (SELECT a.area_key FROM public.areas a JOIN public.cities c ON c.id = a.city_id WHERE c.slug = 'bangalore');

-- Q2d: rent totals for completeness
SELECT COUNT(pl.id) AS total_active_rent
FROM public.property_listings pl
WHERE pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
  AND pl.listing_purpose = 'rent'
  AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
  AND pl.area_key IN (SELECT a.area_key FROM public.areas a JOIN public.cities c ON c.id = a.city_id WHERE c.slug = 'bangalore');

-- ============================================================
-- Q3: bearing-from-city-center classification draft used as the geographic
-- basis for the curated taxonomy in V106 (read-only)
-- Source: .claude/handoffs/issue-1761/analysis/q3-curation-draft.sql
-- ============================================================

-- Q3: curation draft — bearing-based macro-region classification of unmapped localities
-- Bearing from Bangalore city center (12.9716, 77.5946), quadrants:
--   N: -45..45, E: 45..135, S: >135 or <-135, W: -135..-45
WITH unmapped AS (
  SELECT a.area_key, a.name, a.geo_center_lat AS lat, a.geo_center_lon AS lon,
         COUNT(pl.id) FILTER (WHERE pl.listing_purpose = 'sale') AS sale_cnt,
         COUNT(pl.id) AS all_cnt
  FROM public.areas a
  JOIN public.cities c ON c.id = a.city_id
  JOIN public.property_listings pl ON pl.area_key = a.area_key
    AND pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
    AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
  WHERE c.slug = 'bangalore'
    AND NOT EXISTS (SELECT 1 FROM public.area_group_members agm WHERE agm.area_key = a.area_key)
  GROUP BY a.area_key, a.name, a.geo_center_lat, a.geo_center_lon
),
classified AS (
  SELECT *,
    degrees(atan2((lon - 77.5946) * cos(radians(12.9716)), lat - 12.9716)) AS bearing,
    CASE
      WHEN degrees(atan2((lon - 77.5946) * cos(radians(12.9716)), lat - 12.9716)) BETWEEN -45 AND 45 THEN 'North Bangalore'
      WHEN degrees(atan2((lon - 77.5946) * cos(radians(12.9716)), lat - 12.9716)) BETWEEN 45 AND 135 THEN 'East Bangalore'
      WHEN degrees(atan2((lon - 77.5946) * cos(radians(12.9716)), lat - 12.9716)) BETWEEN -135 AND -45 THEN 'West Bangalore'
      ELSE 'South Bangalore'
    END AS proposed_region
  FROM unmapped
)
SELECT proposed_region, area_key, name, round(bearing::numeric,1) AS bearing_deg,
       round(lat::numeric,4) AS lat, round(lon::numeric,4) AS lon, sale_cnt, all_cnt
FROM classified
ORDER BY proposed_region, sale_cnt DESC, name;

-- Q3b: projected macro-region totals if ALL unmapped were classified by bearing (sale)
WITH unmapped AS (
  SELECT a.area_key, a.geo_center_lat AS lat, a.geo_center_lon AS lon,
         COUNT(pl.id) FILTER (WHERE pl.listing_purpose = 'sale') AS sale_cnt
  FROM public.areas a
  JOIN public.cities c ON c.id = a.city_id
  JOIN public.property_listings pl ON pl.area_key = a.area_key
    AND pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
    AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
  WHERE c.slug = 'bangalore'
    AND NOT EXISTS (SELECT 1 FROM public.area_group_members agm WHERE agm.area_key = a.area_key)
  GROUP BY a.area_key, a.geo_center_lat, a.geo_center_lon
)
SELECT CASE
      WHEN degrees(atan2((lon - 77.5946) * cos(radians(12.9716)), lat - 12.9716)) BETWEEN -45 AND 45 THEN 'North Bangalore'
      WHEN degrees(atan2((lon - 77.5946) * cos(radians(12.9716)), lat - 12.9716)) BETWEEN 45 AND 135 THEN 'East Bangalore'
      WHEN degrees(atan2((lon - 77.5946) * cos(radians(12.9716)), lat - 12.9716)) BETWEEN -135 AND -45 THEN 'West Bangalore'
      ELSE 'South Bangalore'
    END AS proposed_region,
    COUNT(*) AS localities, SUM(sale_cnt) AS sale_listings
FROM unmapped
GROUP BY 1 ORDER BY sale_listings DESC;
