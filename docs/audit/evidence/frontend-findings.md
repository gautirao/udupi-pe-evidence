# Frontend Hot-Path Audit (Issue #1046)

> Read-only static analysis. All findings labelled MEASURED | PLANNER_ESTIMATE | STATIC_CODE_RISK | PROJECTION per audit plan.

## Summary

The Discover page is built on a URL-driven dual-hook architecture (`useDiscoverUrlState` + `useDiscoverPageState`), with data hooks composed in `useDiscoverMapData`. Several React-Query hooks fire concurrently in every authenticated journey state, and most query keys embed mutable object references (`filters`, `discoverListingsPage`, etc.) rather than serialized primitives. Filter changes therefore generate new query-key tuples on identity, not content. Bbox is debounced (300 ms in `MapDiscovery`), snapped (`snapBbox` 0.02°), but filter writes flow through a 300 ms URL replace and the state update is unbatched: each filter mutation triggers (a) `useDiscoverListings` refetch, (b) `useDiscoverFilteredMarkers` refetch, and (c) `useDiscoverCityListings` refetch when an area is selected. Marker counts can include up to ~50 (paged listings) + up to N (filtered markers, server-truncated) drawn into a Leaflet markercluster — bounded but not memoised at the icon-creation layer. The dominant scale risk at "~100 listings feels slow" is concurrent unstable-keyed queries firing per pan/zoom + initial sequential waterfall on cold load (areas → markers → listings), not raw render volume.

## Q1 — Hooks per journey state

`derivePanelContent` (`src/utils/discoverPanelState.ts:45-83`) selects the panel; `useDiscoverMapData` (`src/hooks/useDiscoverMapData.ts:100-158`) and top-level `MapDiscovery` (`src/pages/MapDiscovery.tsx:46-167`) call hooks unconditionally — none are gated by panel state. The `enabled` flag controls firing.

| Journey state | Hooks that actually issue a request (enabled=true) |
|---|---|
| City landing (`guided-entry`) | `useDiscoverAreas` (always) · `useAreaGroups` (always, city>0) · `useTrendsOptions` · `useDiscoverListings` (auth & !q) · `useDiscoverFilteredMarkers` (auth & zoom>12) · `useDiscoverCityListings` (DISABLED — areaKeys empty) · `useSchoolsByArea` (DISABLED — areaKey undef) · `useSchoolById` (DISABLED) |
| Area-groups-landing | Same as above; groupId only changes derived `focusedGroupAreas` memo (`MapDiscovery.tsx:331-337`) — no new query |
| Area-marker-selected (`area-selected`) | + `useDiscoverCityListings` becomes enabled (`useDiscoverMapData.ts:144-152`) (areaKeys = [selectedArea.areaKey]) |
| Area + filters | Same set as area-selected; every filter change re-fires `useDiscoverListings` + `useDiscoverFilteredMarkers` + `useDiscoverCityListings` because all three include filter fields in their key |
| School-first landing (`school-browse`) | Base set; `useSchoolsByArea` still gated on `urlState.areaKey` (`MapDiscovery.tsx:157-162`) — fires once area chosen |
| Schools-in-area | + `useSchoolsByArea` (infinite query, page 0) (`useSchoolsByArea.ts:21`) |
| School-selected nearby-homes (`school-selected`) | + `useSchoolById` (`MapDiscovery.tsx:154-158` via `useDiscoverMapData.ts:154-158`); `useDiscoverListings` + `useDiscoverFilteredMarkers` now include `schoolLat/schoolLon/schoolRadiusKm` in their key (`useDiscoverListings.ts:105-107`, `useDiscoverFilteredMarkers.ts:60-62`) |
| Back/Forward | `useDiscoverUrlState` re-reads URL params (no memo guard on returned `state` — `useDiscoverUrlState.ts:352-362`); city or areaKey change re-fires the dependent queries; viewport-only popstate still rebuilds `filters` object → fires queries (see Q3) |

**STATIC_CODE_RISK:** hooks fire unconditionally — `enabled` is the only gate. No journey-driven elision (e.g. school-browse still runs listings/markers queries the moment the user authenticates).

## Q2 — `useDiscoverMarkers` vs `useDiscoverFilteredMarkers`

`useDiscoverMarkers` (`src/hooks/useDiscoverMarkers.ts:17-38`) is defined but is NOT imported by `useDiscoverMapData.ts` (only `useDiscoverFilteredMarkers` at line 4). No simultaneous firing in the same view.

**STATIC_CODE_RISK:** `useDiscoverMarkers` appears to be dead in the Discover hot path.

## Q3 — queryKeys with unstable object references

CONFIRMED — multiple offenders embed the **raw filters object** in the key:

- `src/hooks/useDiscoverListings.ts:77` — `queryKey: ['discover-listings', city, page, size, filters, includeAggregates, snapped]` — `filters` is a new object on every `setFilters(...)` in `useDiscoverPageState.ts` (e.g. lines 138, 170-175, 200-205, 209, 220, 244, 249, 259-262, 273-275) because each handler spreads `{...prev, ...}`. **STATIC_CODE_RISK.**
- `src/hooks/useDiscoverFilteredMarkers.ts:36` — `queryKey: ['discover-filtered-markers', city, filters, snapped]` — same `filters` instance. **STATIC_CODE_RISK.**
- `src/hooks/useDiscoverMapData.ts:228-235` — `focusBounds` memo depends on `filteredMarkersData` AND `filters.localities ?? []` — the `?? []` creates a new empty array on every render when `localities` is undefined, breaking memo identity. **STATIC_CODE_RISK.**
- `src/pages/MapDiscovery.tsx:130-136` — `effectiveFilters` is `useMemo`'d but `filters` itself is the unstable input.
- `src/hooks/useDiscoverCityListings.ts:69-81` — keys spread `...sortedKeys` (good — primitives) + scalar params (good). **NO ISSUE.**
- `src/hooks/useSchoolsByArea.ts:22` — `queryKey: ['schools-by-area', areaKey, board, category, size]` — `board`/`category` arrays passed via `?? []` from `MapDiscovery.tsx:159-160`, fresh array each render. **STATIC_CODE_RISK.**

Note: React Query's default `hashKey` does structural equality, so identical-content re-references do NOT trigger network refetches — but the hashing cost is paid every render.

## Q4 — Filter serialisation before query key

ABSENT for `useDiscoverListings` and `useDiscoverFilteredMarkers`. No explicit `useMemo` on the filters input at the call sites in `useDiscoverMapData.ts:117-132`.

**STATIC_CODE_RISK:** every parent re-render in `MapDiscovery` re-invokes `useDiscoverMapData`, which re-passes `filters` reference; React Query re-hashes internally each render.

## Q5 — Debounce / coalesce on pan/zoom/filter/URL change

Mixed:

- Bbox debounced 300 ms — `MapDiscovery.tsx:60-68`. CONFIRMED.
- Bbox snapped to 0.02° grid — `useDiscoverListings.ts:74` and `useDiscoverFilteredMarkers.ts:33`. CONFIRMED.
- Viewport URL writes debounced 300 ms — `useDiscoverUrlState.ts:430-447`. CONFIRMED.
- Live filter URL writes debounced 300 ms — `useDiscoverUrlState.ts:449-463`. CONFIRMED.
- Search debounced 250 ms — `MapDiscovery.tsx:86-89`. CONFIRMED.
- **Filter STATE update is NOT debounced** — `handleFiltersChange` (`useDiscoverPageState.ts:218-241`) calls `setFilters(next)` synchronously. The two query hooks therefore re-key immediately on filter change while only the URL write is debounced. **STATIC_CODE_RISK.**
- `useDiscoverCityListings` has `placeholderData: keepPreviousData` (`useDiscoverCityListings.ts:97`). CONFIRMED.
- `useDiscoverListings` and `useDiscoverFilteredMarkers` do NOT use `keepPreviousData` — every filter change shows a loading state. **STATIC_CODE_RISK.**

## Q6 — Loading-state accuracy per panel

- `AreaSelectedPanel`: gated by `isLoadingListings` (`DiscoverRightPanel.tsx:166-167`) which is `isLoadingAreaListings` from `useDiscoverCityListings`. Skeleton renders during initial load only (no `isFetching` overlay).
- `SchoolsInAreaPanel`: `schools` + `schoolsLoading` (`DiscoverRightPanel.tsx:207-208`) — `schoolsLoading` is `schoolsQuery.isLoading` (`MapDiscovery.tsx:484`), not `isFetching`. CONFIRMED — does not show loading on background refetch.
- `SchoolSelectedPanel`: `schoolListings` + `schoolListingsLoading` (`DiscoverRightPanel.tsx:216-217`); same gap. **STATIC_CODE_RISK** for perceived performance.
- Right panel uses `isFetching` (`MapDiscovery.tsx:564`) at the container level for an overlay opacity effect (good).
- Map: `showLoader` is a 200 ms delayed spinner (`MapDiscovery.tsx:255-260`). CONFIRMED accurate.

**PLANNER_ESTIMATE:** users will perceive filter changes as "the cards didn't update" until network round-trip completes — at low data volumes the round-trip is ~the entire perceived latency.

## Q7 — O(n)/O(n²) computations in hot paths

- `MapDiscovery.tsx:186-189` — `cityTotal = discoverAreas.reduce(...)`. O(areas) ~30. Negligible.
- `MapDiscovery.tsx:194-219` — `schoolListings` maps `filteredListings` (size ≤50). O(n).
- `useDiscoverMapData.ts:168-175` — `filteredListings` maps page (size=50). Bounded.
- `useDiscoverMapData.ts:202-204` — `areaListings = cityListingsData?.areas.find(...)?.listings`. O(areas) ~30.
- `useDiscoverMapData.ts:206-210` — `markerListings` maps `filteredMarkersData.markers`. **STATIC_CODE_RISK if cap > ~5000.**
- `useDiscoverMapData.ts:244-251` — `localityToAreaKey` Map build. Bounded.
- `PropertyMap.tsx:467-479` (`MarkerClusterLayer`) — O(n) per cluster rebuild; rebuilds on every `listings` reference change. Icons cached at module level. CONFIRMED memoised icons; marker churn driven by upstream array identity.
- `SchoolMarkerLayer.tsx:77-105` — `schools.forEach`, O(schools), bounded by infinite query size=20.
- `MapDiscovery.tsx:368-369` — `discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey))` is O(areas × groupAreaKeys). LOW at MVP.

## Q8 — Memoisation gaps on marker/card arrays

- `markerListings` (`useDiscoverMapData.ts:206-210`): memoised on `filteredMarkersData` — invalidates on every refetch.
- **`MapDiscovery.tsx:447-458` — the `listings` prop passed to `PropertyMap` is built INSIDE the JSX with an IIFE every render: `listings={(() => { … return … })()}` — creates a new array reference on every render, propagates to `MarkerClusterLayer.tsx:438-486` (deps `[listings, map, onSelectListing]`) and rebuilds the entire cluster layer on every parent render. CONFIRMED HIGH-IMPACT STATIC_CODE_RISK.**
- `schools` (`MapDiscovery.tsx:163-167`) — memoised on `schoolsQuery.data?.pages`. CONFIRMED.
- `activeContextChips` (`MapDiscovery.tsx:396-418`) — memoised, but deps include `urlActions` and `filters` (both unstable).
- `effectiveFilters` (`MapDiscovery.tsx:130-136`) — memoised on `[filters, selectedArea, urlState.schoolId]`. **STATIC_CODE_RISK:** `filters` reference changes every filter mutation so the memo provides no benefit.
- `memoizedInitialCenter` (`MapDiscovery.tsx:421-424`) — CONFIRMED stable.

## Q9 — Map movement → URL writes / refetches

- `onViewportChange` (URL writes) — debounced 300 ms (`useDiscoverUrlState.ts:430-447`) — REPLACE not PUSH. CONFIRMED.
- `onBoundsChange` — debounced 300 ms (`MapDiscovery.tsx:60-68`).
- `ViewportWatcher` (`PropertyMap.tsx:210-235`) fires both `moveend` and `zoomend`; debounce collapses. CONFIRMED.
- `BoundsWatcher` (`PropertyMap.tsx:246-281`) skips first mount fire. CONFIRMED.
- `URLViewportController` (`PropertyMap.tsx:296-354`) has tolerance + lastApplied ref to prevent feedback loop. CONFIRMED.

**PLANNER_ESTIMATE:** pan/zoom path is well-instrumented — not a primary cliff.

## Q10 — Duplicate rendering between map markers and right-panel cards

Two distinct datasets feeding map vs cards. CONFIRMED **3 parallel endpoints fetch overlapping/intersecting predicates** when an area is selected + filters applied + zoom>12 + authenticated:

- `/api/discover/listings` (paged, full DTO) — for cards
- `/api/discover/markers` (slim) — for map (via `useDiscoverFilteredMarkers`)
- `/api/discover/cities/{city}/listings` (5-per-area) — for area card list

All three accept overlapping filter dimensions (price/beds/type). When user is in `school-selected` state, listings + markers + schools-by-area + school-by-id can be in-flight simultaneously. **STATIC_CODE_RISK** at scale.

## Q11 — Marker payload shape (FE)

CONFIRMED slim. `DiscoverFilteredMarker` (`useDiscoverFilteredMarkers.ts:6-12`):
```
{ id, latitude, longitude, pricePaise, locality }
```
`DiscoverListingItem` (full DTO, used for cards) is heavy — ~25 fields (`useDiscoverListings.ts:6-35`). `areaMarkerListings` is mapped from `cityListingToPropertyListing` (full payload), but only 5 per area, so volume small.

## Q12 — PROJECTION at scale

| Listings | Behavior | Dominant mechanism |
|---|---|---|
| 10 | Sub-second; perceived snappy. | None binding. |
| 100 | "Feels slow" symptom plausible from: (a) `IIFE listings={…}` rebuilding the entire markercluster layer every parent render, even when listing content is unchanged; (b) initial waterfall: areas → markers → listings → cityListings (3-4 sequential network round-trips on cold load); (c) loading-state ambiguity: filter changes show stale cards without spinner because panels read `isLoading` not `isFetching`. | **Marker array rebuild** (`MapDiscovery.tsx:447-458` IIFE) + **request waterfall** + **loading-state ambiguity**. |
| 10k | Cluster rebuild O(n) per parent render becomes painful; `markerListings.map(...)` per refetch is O(n); right-panel pagination protects card lists but markers are not paginated. | **Marker array rebuild** + **unmemoised derived state** (`effectiveFilters`, `activeContextChips`). |
| 1M | Backend must enforce viewport+filter truncation (`truncated` flag exists in marker response). FE will collapse if markers > ~20k due to Leaflet DOM cost regardless of clustering. | **Unbounded marker rendering** if backend truncation absent; **duplicate hook firing** (listings + markers + cityListings) compounds. |

## Findings table

| # | Title | File:Line | Severity | Label | Mechanism (PROJECTION) |
|---|---|---|---|---|---|
| 1 | `PropertyMap.listings` rebuilt by inline IIFE on every render → `MarkerClusterLayer` tears down + re-adds entire cluster layer | `src/pages/MapDiscovery.tsx:447-458` | HIGH | STATIC_CODE_RISK | Marker array rebuild |
| 2 | `filters` raw object embedded in query keys (no memo, no serialisation) | `src/hooks/useDiscoverListings.ts:77`; `src/hooks/useDiscoverFilteredMarkers.ts:36` | MEDIUM | STATIC_CODE_RISK | Unstable queryKey (hashing cost) |
| 3 | `filters` state set synchronously while URL write is debounced → query refetches fire 300 ms before URL settles | `src/hooks/useDiscoverPageState.ts:218-241` | MEDIUM | STATIC_CODE_RISK | Duplicate hook firing |
| 4 | No `keepPreviousData` on listings/markers queries → loading flicker on every filter change | `src/hooks/useDiscoverListings.ts:76-113`; `src/hooks/useDiscoverFilteredMarkers.ts:35-68` | MEDIUM | STATIC_CODE_RISK | Loading-state ambiguity |
| 5 | Panels gate on `isLoading` not `isFetching` — refetches render stale data with no spinner | `src/components/discover/DiscoverRightPanel.tsx:166-167, 207-208, 216-217` | MEDIUM | STATIC_CODE_RISK | Loading-state ambiguity |
| 6 | Cold-load waterfall: areas → markers → listings → cityListings → schoolById on `school-selected` deep link | `src/hooks/useDiscoverMapData.ts:100-158`; `src/pages/MapDiscovery.tsx:157-162, 271-285` | MEDIUM | PLANNER_ESTIMATE | Request waterfall |
| 7 | `useSchoolsByArea` queryKey contains array params from `?? []` fresh literals | `src/pages/MapDiscovery.tsx:157-162`; `src/hooks/useSchoolsByArea.ts:22` | LOW | STATIC_CODE_RISK | Unstable queryKey |
| 8 | `focusBounds` memo dep `filters.localities ?? []` allocates fresh empty array | `src/hooks/useDiscoverMapData.ts:228-235` | LOW | STATIC_CODE_RISK | Unmemoised derived state |
| 9 | `effectiveFilters` memo depends on `filters` reference → no stability gain | `src/pages/MapDiscovery.tsx:130-136` | LOW | STATIC_CODE_RISK | Unmemoised derived state |
| 10 | `activeContextChips` memo includes `urlActions` + `filters` (both unstable) | `src/pages/MapDiscovery.tsx:396-418` | LOW | STATIC_CODE_RISK | Unmemoised derived state |
| 11 | `useDiscoverMarkers` appears unused in Discover hot path (dead code candidate) | `src/hooks/useDiscoverMarkers.ts:17-38` | LOW | STATIC_CODE_RISK | Dead code |
| 12 | `discoverAreas.filter(includes(...))` is O(n×m) for group member resolution | `src/pages/MapDiscovery.tsx:368-369` | LOW | STATIC_CODE_RISK | O(n²) compute (bounded) |
| 13 | Three overlapping fetch endpoints active in area-selected + filters state | `src/hooks/useDiscoverMapData.ts:111-152` | MEDIUM | STATIC_CODE_RISK | Duplicate hook firing |
| 14 | Marker truncation behaviour not surfaced in UI — `truncated` flag in response is ignored | `src/hooks/useDiscoverFilteredMarkers.ts:17` (consumer absent) | LOW | STATIC_CODE_RISK | Unbounded marker rendering (FE side) |
| 15 | `useDiscoverUrlState` returns a fresh `state` object every render → all consumers re-render | `src/hooks/useDiscoverUrlState.ts:352-362` | MEDIUM | STATIC_CODE_RISK | Unmemoised derived state |

## Top-5 likely culprits for "feels slow at <100 listings"

1. **Inline IIFE rebuilds `PropertyMap` listings prop on every parent render** (`MapDiscovery.tsx:447-458`). At 100 markers this is the single biggest UI-thread cost.
2. **Panels show stale cards without spinner on filter change** (`DiscoverRightPanel.tsx:166-167, 207-208, 216-217`). Perceived as unresponsive.
3. **Triple-endpoint fan-out in area-selected state** (`listings` + `markers` + `cityListings`, all keyed off unstable `filters`). Cold-start latency on Render compounds.
4. **No `keepPreviousData` on listings/markers** — every filter change blanks the result set, then re-paints.
5. **`useDiscoverUrlState` returns a fresh `state` object every render** (`useDiscoverUrlState.ts:352-362`); combined with #1 many "this didn't change" updates trigger expensive renders.

## Verdict

**Measure first**, with one immediate-action exception: Finding #1 (`MapDiscovery.tsx:447-458` IIFE) is structurally confirmable and is the most likely single contributor to "feels slow at <100 listings." All other findings are STATIC_CODE_RISK or PLANNER_ESTIMATE and should be confirmed with React Profiler / Network waterfall captures before action.
