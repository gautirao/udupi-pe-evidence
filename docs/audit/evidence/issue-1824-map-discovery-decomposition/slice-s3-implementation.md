# Issue #1824 — Slice S3 Implementation Note

Branch `issue-1824-s3-marker-resolution` @ base `53f4c736`. Verbatim pure-selector
extraction of the `currentMapMarkerListings` resolution IIFE (previously inline
`MapDiscovery.tsx` L3244-3337) into `src/features/discover/map/resolveMarkerListings.ts`.
See `slice-s3-design.md` for the full contract and transposition rules this
implementation follows.

## What changed

- **New**: `src/features/discover/map/resolveMarkerListings.ts` — exports
  `ResolveMarkerListingsInput` (15 required fields) and `resolveMarkerListings()`, a
  plain pure function containing the moved IIFE body (all 11 return branches,
  including both FIX-2 nested ternaries, verbatim, with the original #1806/#1261/#1597
  comments carried over with their branches).
- **New**: `src/features/discover/map/resolveMarkerListings.test.ts` — 24 unit tests
  (exceeds the ~16-case matrix; some rows split into multiple assertions, e.g. the
  zoom-boundary `<=` check got its own "not suppressed one above threshold" case)
  covering every one of the 11 return branches, both FIX-2 halves, all 3 school tiers,
  the FIX-1 leak-source-present-but-not-returned assertion, and the
  authed/anon `isAuthenticated` gate.
- **Modified**: `src/pages/MapDiscovery.tsx` — the 94-line IIFE (L3244-3337) replaced
  with a 16-line call to `resolveMarkerListings({ …15 fields… })`; one import line
  added (`resolveMarkerListings` from the new module, placed alongside the other
  S2a/S2b/S2c `@/features/discover/...` imports at L48).

## Types reused (no new types invented)

- `PropertyListingWithImages` (from `@/components/map/PropertyMap`) — the marker
  element type already used by `PropertyMap.listings` and `selectedMarkerListing`.
  Structurally compatible with the hook-returned element type
  `PropertyListing & { images?: PropertyImage[] }` (all of
  `PropertyListingWithImages`'s extra fields over `PropertyListing` are optional), so
  `markerListings` / `areaMarkerListings` / `groupResultsMarkers` /
  `schoolRadiusFallbackMarkers` all flow through the selector's typed parameters
  without a cast.
- `DiscoverMapLayerKind` (from `@/utils/discoverLayerRegistry`) — the existing
  `mapLayerCategory` union (reused as-is; matches the original IIFE's exhaustive
  string-literal comparisons).
- `AreaPoint` (from `@/components/map/AreaMarkerLayer`) — the existing `selectedArea`
  state type (`AreaPoint | null`, sourced from `useDiscoverPageState`).
- `DiscoverJourney` (from `@/hooks/useDiscoverUrlState`) — the existing
  `urlState.journey` type (`'area-first' | 'school-first' | 'agri-first' | null`).

`AREA_LAYER_MAX_ZOOM` is **not** imported or duplicated — it stays a MapDiscovery-local
`const` (L82) and is passed into the selector as the 15th required input field
`areaLayerMaxZoom`, per the design doc's #1823-avoidance boundary note.

## Transposition verification

All 11 branches transposed in original top-to-bottom order:
1. Layer-category suppression (4-way OR) → `[]`
2. Zoom/landing suppression, `<=` (not `<`) preserved exactly
3. FIX-1 group-scope guard (`isGroupResultsState`) — placed before both
   school-first/area-first branches, unchanged
4-7. School-first + schoolId: Tier 1 → Tier 2 → Tier 3 → exhausted, strict order preserved
8. School-first + selectedArea, no schoolId — FIX-2 ternary transposed character-for-character
9. Area-first / area-selected — FIX-2 ternary transposed character-for-character (identical structure to #8)
10. No area, no group — `isAuthenticated ? markerListings : []`, the field the
    original explorer-planner inventory missed

All 4 `.length > 0` / boolean-gate checks and both nested `isLoadingAreaListings ? [] :
(areaMarkerListings.length > 0 ? areaMarkerListings : (isErrorAreaListings ?
markerListings : []))` ternaries are unmodified expressions copy-pasted from the
original source (not reconstructed from scratch), so evaluation order is
byte-identical.

Every array returned is a source reference — no `.slice()`/`.map()`/`.filter()`/spread
anywhere in the module. Unit tests assert `toBe` (reference identity) wherever a
non-empty source array is the expected return.

`schoolRadiusFallbackMarkers` computation (L1842-1848, `useMemo` in the page) is
untouched and stays in `MapDiscovery.tsx` — the selector only receives its resolved
value as an input. `markerPopoverStepper` (uses `.findIndex` on the array) and
`PropertyMap.listings` both consume `currentMapMarkerListings` unchanged; neither file
was touched.

## Line count

`src/pages/MapDiscovery.tsx`: **4194 lines → 4118 lines** (−76 net; the IIFE removal
took out 94 lines, the call site + new import added 18).

## Validation evidence

| Command | Result |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | Exit 2, 121 errors — same baseline count as pre-slice; zero errors cite `MapDiscovery.tsx` or `resolveMarkerListings.*` |
| `vitest run src/features/discover/map/resolveMarkerListings.test.ts` | Exit 0, 24/24 passed |
| `vitest run src/pages/__tests__/MapDiscovery.issue1806.groupScope.test.tsx` | Exit 0, 5/5 passed — UNCHANGED |
| `vitest run src/pages/__tests__/MapDiscovery.issue1798.markerPopup.test.tsx src/pages/__tests__/MapDiscovery.groupResults.test.tsx src/pages/__tests__/MapDiscovery.school-deep-link.test.tsx` | Exit 0, 31/31 passed (13+13+5) — UNCHANGED |
| `eslint` on the 3 touched files | 0 errors; 16 pre-existing warnings on `MapDiscovery.tsx` only (react-refresh/only-export-components + stale eslint-disable directives — all pre-existing, none in the new selector/test files) |
| `npm run build` (`vite build`) | Exit 0 |

No existing test file was edited. No consumer files (`PropertyMap.tsx`,
`AreaMarkerLayer.tsx`, `SchoolMarkerLayer.tsx`, `markerPopoverStepper`) were touched.
