# Discover — Map ↔ Panel Alignment Guide

How the left map journey and the right panel journey stay one connected journey.
Every state below is live in the prototype (`index.html` + deep links) and
captured in `../screenshots/`. Companion to `MARKER_PLACEMENT_SPEC.md` and
`AREA_MARKER_UX.md`.

**Principles**
- The **panel is the complete source of truth**; the map shows a legible,
  decluttered subset of the same scope — never a different scope.
- Map actions and panel actions land on the **same state** (same URL), so the
  two sides can never disagree.
- Camera moves only on **level/selection change** (fit once); hover, scroll,
  typing and filtering never move it.

## Journey 1 — navigate from the MAP
Click a region bubble → panel becomes that region's overview (breadcrumb + scope
chip + journeys + top areas). Click a group/zone pill → panel becomes the group
detail with the full area list. Click an area pin → drills to that area's
listings (panel: area hero + cards). Click a "+N nearby areas" chip → map zooms
to split it (panel list unchanged — it already shows all areas); if it can't
split, the panel highlights + scrolls to the member rows instead. Click a
listing marker → popup opens on the map AND the matching card highlights +
scrolls into view. Click a school pin → school context (ring + homes).

## Journey 2 — navigate from the PANEL
Click a journey/group/area card → same state as the equivalent map click; the
camera fits the new scope once. Hover an area row → its marker (or containing
chip) highlights, **no camera move**. "Show on map" on a demoted row → the area
is force-promoted to a labeled pin + `panInside` (no full refit). Search →
result click jumps straight to the area/school context. Scroll → soft marker
emphasis only.

## State-by-state alignment table

| # | Current state | User action | Map response | Panel response | Camera | URL / breadcrumb | Notes / edge cases |
|---|---|---|---|---|---|---|---|
| 1a | City landing (`/`) | Click **North** bubble | North scope; top-area pins (one per group) | North overview: journeys in North, top areas, scoped search | Fit North bounds once | `?region=north` · Bangalore › North | Bubble decluttered directionally; leader if offset |
| 1b | City landing | Panel: **Explore by area** | Group pills appear (decluttered, leaders) | Area-groups list | Fit city (no scope) or region | `?journey=area` · Bangalore › By area | Same state as map path; order-independent |
| 2a | North + By area (`?region=north&journey=area`) | Click **Thanisandra–Hennur Belt** pill | Belt scope: rep pins + "+N nearby areas" chips only (nothing outside group) | Group detail: hero (29 areas · 181 homes), full sorted list, "Showing X of 29" note | Fit group bounds once | `…&groupId=north-growth` · … › Thanisandra–Hennur Belt | Selected pill = highest priority, never offset |
| 2b | Same | Panel: click group card | Identical to 2a | Identical to 2a | Same fit, once | Same | — |
| 3a | Belt selected | Click **Thanisandra** pin | Drills to area listings (46 homes, clustered) | Area hero + listing cards | Fit area bounds once | `…&areaId=thanisandra` | Pin = navigation, one level down |
| 3b | Belt selected | Click **"+13 nearby areas"** chip | Zooms to split into pins/smaller chips; never empty (members are real in-scope areas) | List unchanged (already complete); "Showing X of 29" updates | Fly to member bounds (maxZoom 16) | unchanged | If camera can't get closer: no fly — panel highlights + scrolls member rows |
| 3c | Belt selected | Panel: hover area row | Marker promotes (dot→label; chip shows "Includes ‹name›") | Row lifts | **None** | unchanged | Deterministic, no reshuffle |
| 3d | Belt selected | Panel: **Show on map** (demoted row) | Area force-kept as labeled pin; `panInside` if off-screen | Row stays highlighted | panInside only, no refit | unchanged | Never a duplicate marker |
| 3e | Belt selected | Panel: **View listings** on row | Switches to that area's listing clusters | Area hero + cards | Fit area once | `…&areaId=…` | Works for 1-property areas without finding the pin first |
| 4a | Area selected (`…&areaId=thanisandra`) | Click home marker / cluster | Cluster: zoom-split. Leaf: infographic popup (photo, tier, price, facts, ‹ n/N ›, Show in list) + marker fills copper | Matching card outlines + scrolls into view | Cluster: fly into bounds. Leaf: panInside only | unchanged | Captions only on largest cluster; overlapping discs merge |
| 4b | Area selected | Panel: hover/click listing card | Marker highlights (copper fill, scaled) | Card outlined | panInside only if off-screen | unchanged | No jitter — focus is outside camera key |
| 4c | Area selected | Panel: Area/School toggle → school search | — (until pick) | School results scoped to area/group | none | unchanged | See §5 |
| 5 | Belt selected, School tab | Search **"hebbal"** | — (until pick) | All schools in group areas first; no group match → auto-widen labeled "· outside Thanisandra–Hennur Belt"; never past the city (no Udupi leakage) | none on keystroke | unchanged | Result click = 6a |
| 6a | Any | Click school result ("Homes near it") | School pin + dashed radius ring + clustered homes | School hero, radius chips (3/5/10 km), homes list, Change school | Fit ring bounds once | `?journey=school&…&schoolId=…&radiusKm=5` | Empty radius → panel empty state, no fabricated pins |
| 6b | School selected | Click home cluster/marker | Same as 4a | Card highlights; popup on leaf | Same as 4a | unchanged | — |
| 6c | School selected | Panel: **Change school** | Back to school pins in the current area | Schools-in-area list | Fit area once | drops `schoolId` | Context (area/zone/region) preserved |

## Direct access (bypass the funnel)

1. **Area from city landing** — search "hebbal" on the landing (Area tab) →
   result "Hebbal · Area · North Bangalore · View listings ›" → one click lands
   on Hebbal's listing context (`screenshots/01/02-prb-direct-access.png`).
2. **School from city landing** — School tab, search a school → result
   "School · ‹area› · N homes within 5 km · Homes near it ›" → one click lands
   on the school context with ring + homes (`screenshots/02-prb-school-jump.png`).
3. **School from group context** — inside the belt, School tab, "hebbal" →
   group-area schools first; matches outside the group but inside the city are
   returned with an explicit "outside Thanisandra–Hennur Belt" label
   (`screenshots/02-prb-school-search.png`). City boundary is strict.

## Prototype screens

- `guide-01-city-declutter.png` — decluttered city landing (directional bubbles)
- `guide-02-group-overview.png` — decluttered group pills + leader/anchor dot
- `01-guide-03-belt.png` — belt: rep pins + neutral chips, leaders, no overlap
- `02-guide-03-belt.png` — area cluster expanded (chip split after tap)
- `guide-05-area-listings.png` — listing clusters, merged discs, quiet captions
- `03-prb-listing-popup.png` — listing marker popup
- `02-prb-school-search.png` — group-level school search with widen label
- `02-prb-school-jump.png` — school selected (ring + homes)
- `01/02-prb-direct-access.png` — direct area search jump
- `guide-11-mobile.png` — mobile map + bottom sheet (`?mobile=1`)

## Implementation acceptance checklist (Claude Code)

**Alignment**
- [ ] Map and panel always render the same scope; map subset ⊆ panel list; the panel lists 100%.
- [ ] Every row in the table above reproduces: same target state from map path and panel path.
- [ ] Deep links restore level, markers, camera and breadcrumb (`region, journey, groupId, zoneId, areaId, schoolId, radiusKm, mode`).
- [ ] Breadcrumb chip on the map mirrors the panel crumb at every level.

**Coordination**
- [ ] Panel hover ⇒ marker/chip emphasis; map hover ⇒ row outline; neither moves the camera or re-places markers.
- [ ] Marker click ⇒ popup (leaf) or drill (navigation) + panel card highlight/scroll.
- [ ] "Show on map" promotes without duplicate markers; panInside only.
- [ ] Chip click never yields an empty map; non-splittable chips highlight + scroll panel rows.

**Placement** — see `MARKER_PLACEMENT_SPEC.md` §8.

**Search**
- [ ] Scope = narrowest active context; auto-widen is labeled; city boundary strict.
- [ ] Area/school results jump directly to their context from any level, including the landing.

**Guardrails**
- [ ] Coordinates + counts backend-owned; screen-space offsets never persisted; no fabricated counts.
- [ ] Coordinate privacy (clusters until zoom), saved homes, trust badges unchanged.
- [ ] Navigation clusters (area counts, dashed) ≠ inventory clusters (home counts, solid) — visually and semantically.
- [ ] ReTrends tokens only; no console errors; reduced-motion still functional.
