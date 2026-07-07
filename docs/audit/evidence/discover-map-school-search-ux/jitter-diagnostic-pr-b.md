# Issue #1798 PR-B — Camera Jitter Diagnostic (Regression 1)

Mode: diagnostic only. No fix implemented, no `PropertyMap.tsx` camera/tick-panner
logic edited. This document is the deliverable.

## User report (authoritative, verbatim)

> "the map jitteriness is primarily the map zooming in and out when clicked on
> the region, zone and area markers... the transition is not smooth and it
> doesn't zoom to the correct boundary immediately, looks like it goes
> somewhere and then it is pulled back."

## Verdict: **CONFIRMED**

A single area/zone marker click produces **two independent, uncoordinated
camera calls on the same live Leaflet map instance**, landing at different
times with different target bounds — the "goes somewhere, then pulled back"
pattern. For non-region/group markers there is a **third** chained call.

## Static analysis — call sites

All line numbers as of this worktree (`issue-1798-pr-b-area-marker-degradation`,
`PropertyMap.tsx` / `AreaMarkerLayer.tsx` — drift-check before reuse).

### Call #1 — `AreaMarkerLayer.tsx` marker click handler (immediate, imperative)

`src/components/map/AreaMarkerLayer.tsx:205-219` (inside `AreaMarkerLayer`,
line 180-235):

```ts
marker.on('click', () => {
  onAreaClick?.(area);
  const isOverviewGroupOrRegion = area.isMacroRegion || area.isGroup;
  if (area.bbox) {
    map.fitBounds(area.bbox, { padding: [40, 40], maxZoom: isOverviewGroupOrRegion ? 12 : 16 });
  } else {
    map.flyTo([area.geo_center_lat, area.geo_center_lon], isOverviewGroupOrRegion ? 12 : 13);
  }
  if (!isOverviewGroupOrRegion) {
    map.once('zoomend', () => {
      if (map.getZoom() <= 12) map.setZoom(13, { animate: true });
    });
  }
});
```

Trigger: raw Leaflet `click` DOM event on the marker — fires **synchronously**,
entirely outside React's render cycle. It does not go through any prop; it
holds `map` via `useMap()` in its own closure. This is the FIRST camera call
for any region/zone/area marker click, targeting the marker's own
`area.bbox` (or centre).

### Call #2 (chained) — `AreaMarkerLayer.tsx` zoomend correction (non-region/group only)

Same block, `map.once('zoomend', ...)`, lines 213-215. Fires once the FIRST
`fitBounds`/`flyTo` animation settles. If the resulting zoom is `<= 12`
(common for a wide-ish bbox clamped against a small viewport), it issues a
**second, corrective** `map.setZoom(13, { animate: true })`. This only
applies when `area.isMacroRegion` and `area.isGroup` are both false — i.e.
**zone and area** marker clicks, not region/group-overview clicks. This is
itself a self-contained "goes somewhere [zoom 11-ish], then pulled back
[snapped to 13]" motion, independent of anything below.

### Call #3 — `PropertyMap.tsx` `MapController`'s `focusBounds` effect (delayed, React-driven)

`src/components/map/PropertyMap.tsx:990-1022` (`MapController`, focusBounds
effect at ~1013-1021):

```ts
useEffect(() => {
  if (!focusBounds) return;
  const [[s, w], [n, e]] = focusBounds;
  if (s === n && w === e) {
    map.flyTo([s, w], 15, { duration: 1 });
  } else {
    map.fitBounds(focusBounds, { padding: [50, 50] });
  }
}, [focusBounds, map]);
```

`focusBounds` is passed into `PropertyMap` from `MapDiscovery.tsx:2861`:

```tsx
focusBounds={agriGroupFocusBounds ?? activeFocusBounds}
```

`activeFocusBounds` (`src/hooks/useDiscoverMapData.ts:349-359`) is:

```ts
const focusBounds = useMemo(
  () => computeFocusBounds(filteredMarkersData?.markers ?? [], filters.localities ?? []),
  [filteredMarkersData, filters.localities],
);
const activeFocusBounds = useMemo(() => { void fitTick; return focusBounds; }, [focusBounds, fitTick]);
```

Chain: marker click → `onAreaClick(area)` → `handleAreaClick`/
`handleOverviewAreaClick` (`src/hooks/useDiscoverPageState.ts:276+`, and
`src/pages/MapDiscovery.tsx` overview handler) → updates URL/selected-area
state and `filters.localities` (confirmed by the existing unit test name
`handleAreaClick_drops_localities_but_keeps_other_filters`,
`useDiscoverPageState.test.ts:175`) → the area's listings query
(`filteredMarkersData`) refetches over the network for the new
area/zoom-band → **once that resolves**, `focusBounds`/`activeFocusBounds`
recomputes to the bbox of the *actual filtered markers* in the new area
(not the area's static geographic bbox) → `PropertyMap` re-renders with a
new `focusBounds` prop → `MapController`'s effect fires **its own**
independent `map.fitBounds`/`flyTo`.

This is a SECOND, separately-timed (network-latency-delayed) camera call on
the same `map` object that `AreaMarkerLayer` already moved synchronously on
click, usually landing on a **different** (tighter, marker-derived) bounds
than `AreaMarkerLayer`'s area-bbox fit.

### Note on `AreaPanner` / `panToArea`

`AreaPanner` (`PropertyMap.tsx:620-639`) is driven by `panToArea` state,
which `handleAreaClick` explicitly does **not** set on a real marker click
(inline comment in `useDiscoverPageState.ts`: *"AreaMarkerLayer owns
fitBounds on marker click — do NOT set panToArea here"*). `panToArea` is
reserved for the group-bounds / overview-bubble path
(`MapDiscovery.tsx:2048/2114/2153`), so `AreaPanner` does **not** collide on
the region→zone→area marker-click path this diagnostic targets. It is a
correctly-guarded fourth mechanism, not part of this collision.

## Per-click camera-call count and order (area-first drill path)

| Click | Call 1 (sync, on click) | Call 2 (chained zoomend) | Call 3 (delayed, focusBounds effect) |
|---|---|---|---|
| Region marker (`isMacroRegion=true`) | `AreaMarkerLayer` `fitBounds`/`flyTo` → region bbox @ maxZoom 12 | none (guarded off for region/group) | `MapController` `fitBounds`/`flyTo` → `activeFocusBounds` once markers refetch |
| Zone marker (group, `isGroup=true`) | `AreaMarkerLayer` `fitBounds` → zone bbox @ maxZoom 12 | none | `MapController` fit once markers refetch |
| Area marker (`isMacroRegion=false, isGroup=false`) | `AreaMarkerLayer` `fitBounds`/`flyTo` → area bbox @ maxZoom 16 | `setZoom(13)` if landed ≤12 | `MapController` fit once markers refetch |

Region and zone clicks get 2 camera calls; a plain area-marker click can get
**3**. All three cases satisfy "more than one distinct camera call per
single marker click."

## Diagnostic test

File added (allowed glob `src/components/map/__tests__/**`):
`src/components/map/__tests__/PropertyMap.jitterDiagnostic.test.tsx`

Unlike the sibling `PropertyMap.areaPanner.test.tsx`, this test does **not**
mock `AreaMarkerLayer` to `null` — it uses the real implementation so its
own imperative click-driven `fitBounds` call is observed landing on the same
mocked Leaflet `map` object that `MapController`'s `focusBounds` effect also
targets. This is a portable jsdom/mocked-map unit test; no backend, no
Supabase.

Command:
```
/Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-1798-discover-map-ux/node_modules/.bin/vitest run \
  --root /Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-1798-discover-map-ux \
  src/components/map/__tests__/PropertyMap.jitterDiagnostic.test.tsx
```

Result: **exit code 0**, 2/2 tests passed.

```
✓ src/components/map/__tests__/PropertyMap.jitterDiagnostic.test.tsx (2 tests) 44ms
Test Files  1 passed (1)
     Tests  2 passed (2)
```

Observed call counts/order (from test assertions, both passing):

1. `CONFIRMED: AreaMarkerLayer click fitBounds + a later MapController
   focusBounds fitBounds = 2 independent camera calls for one logical click`
   — mount → 0 calls. Simulated marker click → `fitBounds` call #1 targets
   `area.bbox` with `{padding:[40,40], maxZoom:16}`. Simulated later
   `focusBounds` prop update (representing the post-fetch
   `activeFocusBounds` recompute) → `fitBounds` call #2 targets a
   **different** bbox with `{padding:[50,50]}`. Total: 2 calls, different
   targets, sequential.

2. `CONFIRMED: non-region/group area click chains a THIRD camera call via
   zoomend when the fit lands at zoom <= 12` — click → `fitBounds` call #1
   + a `map.once('zoomend', ...)` registration. Simulating the fit settling
   at zoom 11 and firing the captured zoomend callback → `setZoom(13,
   {animate:true})` fires. Confirms the chained correction is real and
   wired to live at the map level, not just present in source.

LIVE_BROWSER = NOT_RUN (env). No local dev stack was stood up for this
diagnostic; per CLAUDE.md §11 and the run's no-shared-Supabase-smoke
constraint, only the mocked-map unit test and static analysis are used as
evidence. The static + mocked-test evidence is sufficient to CONFIRM the
hypothesis without a live browser pass.

## Fix recommendation

**Not a trivial one-liner — recommend FOLLOW-UP, not a PR-B change.**

The root cause is architectural: two separate call sites
(`AreaMarkerLayer`'s imperative click handler and `MapController`'s
`focusBounds` React effect) both hold independent references to the same
Leaflet map and both believe they own "the" camera move for an area
selection, with no shared gating/dedupe key between them. A correct fix
needs to pick a single source of truth for camera moves on marker click —
e.g. either:

- have `AreaMarkerLayer`'s click handler stop calling `map.fitBounds`/
  `flyTo` directly and instead let `MapController`'s `focusBounds` effect
  (already React-driven, already fires post-fetch) own the camera move,
  accepting a fetch-latency delay before the camera moves at all, or
- have `MapController` skip its `focusBounds` fit when the target bounds
  are contained within (or close to) the bounds `AreaMarkerLayer` already
  fit to, via a shared "last camera target" ref/key.

Either direction touches the interaction between two components across two
files and changes the *animation semantics* users see on every marker
click across region/zone/area/group modes — this is exactly the "reworking
multiple ticks" category the run's user decision excludes from PR-B. The
zoomend-chained `setZoom(13)` correction (Call #2 in the area-marker case)
is a second, smaller piece of the same problem and should be resolved in
the same follow-up, not patched separately, since a fix to Call #1/#3 may
change whether Call #2 ever needs to fire at all.

No `PropertyMap.tsx` or `AreaMarkerLayer.tsx` camera/tick-panner logic was
edited to produce this diagnostic.
