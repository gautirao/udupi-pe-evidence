# Slice S11d — useDiscoverJourneyPredicates (FINAL slice of #1824)

## What moved

Extracted the pre-layer "C1" predicate cluster (the block immediately preceding
the `useDiscoverMapPresentation` call, base `f91da546` L1362–1403) verbatim
into a new pure presenter hook:

`src/features/discover/presentation/useDiscoverJourneyPredicates.ts`

Predicates moved (byte-identical bodies + rationale comments):
- `isAreaFirstCityLanding`
- `liveAreas` (kept as a bare `.filter()` — NOT memoized; feeds
  `useDiscoverMapPresentation` → `overviewAreas` → `PropertyMap`, so wrapping
  it in `useMemo` would change referential identity — a behaviour change)
- `cityHasNoListings`
- `isTopGroupedAreaOrSchool`
- `isTopGroupedAgri`
- `discoverLayerInput` (internalized as a hook-body local, not returned)
- `mapLayerCategory` (typed `DiscoverMapLayerKind`)
- `mapLayerKind` (typed `DiscoverMapLayerKind`)

## Hook contract

```ts
function useDiscoverJourneyPredicates({
  resolvedPanelContent, focusedGroup, selectedArea, selectedSchool,
  discoverAreas, areasLoading, cityTotal, urlState, isAgriJourney, mapZoom,
}: UseDiscoverJourneyPredicatesParams): UseDiscoverJourneyPredicatesResult
```

Returns a flat object with exactly 7 fields: `{ mapLayerKind, mapLayerCategory,
isAreaFirstCityLanding, liveAreas, cityHasNoListings, isTopGroupedAreaOrSchool,
isTopGroupedAgri }`. No React hooks inside — a pure derivation that returns a
fresh object literal every render, matching the page's previous per-render
`const` semantics exactly (AC3-equivalent: no memo-identity change for
anything the caller previously computed inline).

## Deviation from the plan: AREA_LAYER_MAX_ZOOM

The plan instructed importing `AREA_LAYER_MAX_ZOOM` "from the SAME source
module MapDiscovery imports them from." In reality `AREA_LAYER_MAX_ZOOM` is
**not** an import in `MapDiscovery.tsx` — it's a page-local module constant
(`const AREA_LAYER_MAX_ZOOM = 12;`, line 94 in the base file), not exported
anywhere. There is no shared module to import it from.

Two options were considered:
1. Export it from `MapDiscovery.tsx` and import it into the new hook —
   rejected: this creates a page→hook circular import (`MapDiscovery.tsx`
   already imports `useDiscoverJourneyPredicates`), which is an explicit
   pitfall called out for this slice.
2. Mirror the constant as a local module-level const in the new hook file,
   with a comment pointing back to the canonical definition — this is the
   exact pattern already used throughout the codebase's own e2e specs (e.g.
   `e2e/discover-area-nav-journey.spec.ts:26`: `const AREA_LAYER_MAX_ZOOM = 12;`
   with a "mirrors AREA_LAYER_MAX_ZOOM in the application code" comment).

Went with option 2 — a documented, precedented deviation. The value (12) is
unchanged and the comment states the sync obligation. This does not touch any
file outside the approved scope.

## Files changed

- `src/pages/MapDiscovery.tsx` (rewire only): replaced the L1362–1403 block
  with a single destructured call to `useDiscoverJourneyPredicates`, placed
  in the same position (immediately before `useDiscoverMapPresentation`).
  Removed the now-unused `selectDiscoverMapLayer` and `DiscoverMapLayerKind`
  imports from `@/utils/discoverLayerRegistry` (no other call site in the
  file references them). `toLayerInput`, `AREA_LAYER_MAX_ZOOM`,
  `resolveActiveDiscoverGroup`, `resolveDiscoverGroupForAreaKey` are all still
  referenced elsewhere in the file and were left untouched. Added the new
  hook's import.
- `src/features/discover/presentation/useDiscoverJourneyPredicates.ts` (NEW)
- `src/features/discover/presentation/useDiscoverJourneyPredicates.test.ts` (NEW)

Line count: `src/pages/MapDiscovery.tsx` 1774 → 1751 lines (base `f91da546` →
this slice).

## Validation

- `npx vitest run src/features/discover/presentation/useDiscoverJourneyPredicates.test.ts`
  → 19 passed, 0 failed.
- `npx tsc -p tsconfig.app.json --noEmit` → 30 errors total (unchanged from the
  `f91da546` baseline; 0 net-new; 0 errors in any touched file).
- `npx eslint src/pages/MapDiscovery.tsx src/features/discover/presentation/useDiscoverJourneyPredicates.ts src/features/discover/presentation/useDiscoverJourneyPredicates.test.ts`
  → 0 errors, 13 warnings (all pre-existing `react-refresh/only-export-components`
  warnings on MapDiscovery.tsx's re-export shims, unrelated to this change).
