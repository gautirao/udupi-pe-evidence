-- V108: remove the mis-geocoded "Mukkidipeta" locality from the "north-emerging"
-- (North Bangalore Emerging) Bengaluru area group and re-derive the group's stored
-- bounds (#1819).
--
-- Root cause: V106 seeded IN|KA|Bengaluru|Mukkidipeta with coordinates
-- 13.826627/77.490273 -- a village near the Gauribidanur/Andhra-Pradesh border,
-- ~55km north of Bengaluru city and ~0.5 deg beyond the next legitimate
-- north-emerging member (Kodalagurki, 13.311576). The Discover map computes
-- macro-region fitBounds by unioning member area bounding boxes at render time
-- (src/utils/discoverGroupBounds.ts), so this single outlier stretches the
-- "North Bangalore" map framing far past real North Bangalore neighbourhoods,
-- toward Tumkur/Kolar/Chikballapura/the AP border.
--
-- V106 is an already-applied migration and is immutable -- it must not be edited.
-- This is therefore a corrective follow-up migration, not a fix inside V106.
--
-- No reliable Bengaluru coordinate is available for Mukkidipeta, so per the
-- REMOVE_EXCLUDE fix decision (see .claude/handoffs/issue-1819/approved-plan.toml)
-- it is removed from the group (and, if now orphaned, from `areas`) rather than
-- having its coordinates corrected.
--
-- Idempotent / safe to re-run:
--   STEP 1 is a WHERE-scoped DELETE (mirrors V106's own overlap-repair DELETE
--     pattern) -- a second run matches zero rows and is a no-op.
--   STEP 2 re-derives min/max bounds from the group's current remaining members
--     every time it runs; re-running after STEP 1 has already removed
--     Mukkidipeta recomputes the same (already-correct) bounds.
--   STEP 3 is a guarded DELETE -- a second run matches zero rows once the area
--     row is gone.
-- Every statement is scoped to city slug 'bangalore' + group slug 'north-emerging'
-- (or, for STEP 3, the specific area_key) so no other city/group can be affected.

-- ── STEP 1: remove Mukkidipeta's north-emerging membership ─────────────────────
DELETE FROM public.area_group_members agm
USING public.area_groups ag, public.cities c
WHERE agm.area_group_id = ag.id
  AND ag.city_id = c.id
  AND c.slug = 'bangalore'
  AND ag.slug = 'north-emerging'
  AND agm.area_key = 'IN|KA|Bengaluru|Mukkidipeta';

-- ── STEP 2: re-derive north-emerging's stored bounds from its REMAINING members ─
-- Only min_lat/min_lon/max_lat/max_lon are touched -- focus_lat/focus_lon (the map
-- centering point) are intentionally left untouched. The WHEN EXISTS guard ensures
-- the bounds are never nulled out even if a future change left the group with zero
-- members.
UPDATE public.area_groups ag
SET min_lat = bounds.min_lat,
    min_lon = bounds.min_lon,
    max_lat = bounds.max_lat,
    max_lon = bounds.max_lon
FROM (
    SELECT ag2.id AS area_group_id,
           MIN(a.min_lat) AS min_lat,
           MIN(a.min_lon) AS min_lon,
           MAX(a.max_lat) AS max_lat,
           MAX(a.max_lon) AS max_lon
    FROM public.area_groups ag2
    JOIN public.cities c2 ON c2.id = ag2.city_id
    JOIN public.area_group_members agm2 ON agm2.area_group_id = ag2.id
    JOIN public.areas a ON a.area_key = agm2.area_key
    WHERE c2.slug = 'bangalore'
      AND ag2.slug = 'north-emerging'
    GROUP BY ag2.id
) AS bounds
WHERE ag.id = bounds.area_group_id;

-- ── STEP 3: guarded orphan-area delete ──────────────────────────────────────────
-- Mukkidipeta is a V106-only area with zero other repo references; all three
-- guards must hold for the delete to run. If any reference existed (or existed
-- in the future), this step safely no-ops and steps 1-2 alone still fix the
-- visible map bug. schools.area_key is a FK to areas(area_key) with no ON DELETE
-- rule (default RESTRICT, V79) so it must be guarded explicitly.
DELETE FROM public.areas a
WHERE a.area_key = 'IN|KA|Bengaluru|Mukkidipeta'
  AND NOT EXISTS (SELECT 1 FROM public.area_group_members m WHERE m.area_key = a.area_key)
  AND NOT EXISTS (SELECT 1 FROM public.property_listings pl WHERE pl.area_key = a.area_key)
  AND NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.area_key = a.area_key);
