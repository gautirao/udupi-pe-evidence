# Issue #1824 Slice S10b — Implementation Note

**Module**: `src/features/discover/map/resolveMarkerPopover.ts` (NEW, PURE)
**Test**: `src/features/discover/map/resolveMarkerPopover.test.ts` (NEW)
**Rewire**: `src/pages/MapDiscovery.tsx`
**Base**: `b287cfd7` · **Branch**: `issue-1824-s10b-resolve-marker-popover`

## What moved

1. **`currentMapMarkerListings` block** (b287cfd7 L1792-1808) and **`markerPopoverStepper` IIFE**
   (b287cfd7 L1816-1823) were extracted verbatim into `resolveMarkerPopover.ts`. The module:
   - Extends `ResolveMarkerListingsInput` (the existing 15-field S3 input, imported unchanged
     from `./resolveMarkerListings`) with `isMarkerPopoverEligible: boolean` and
     `selectedMarkerListing: PropertyListingWithImages | null`.
   - Calls the existing `resolveMarkerListings(...)` with all 15 fields passed through by the
     same names (no field added/dropped/reordered/renamed — see AC-VERBATIM below).
   - Computes `markerPopoverStepper` with the IIFE copied character-for-character (only the
     free variables became same-name destructured params/locals).
   - Returns `{ currentMapMarkerListings, markerPopoverStepper }` — no memoization, a plain
     function that returns fresh objects/arrays on every invocation.

2. **MapDiscovery.tsx** (post the `L1781` `!isCityValid` early return): the two `const` blocks
   were replaced with a single destructure:
   ```ts
   const { currentMapMarkerListings, markerPopoverStepper } = resolveMarkerPopover({
     mapLayerCategory, selectedArea, isGroupResultsState, mapZoom,
     areaLayerMaxZoom: AREA_LAYER_MAX_ZOOM, isAuthenticated,
     journey: urlState.journey, schoolId: urlState.schoolId,
     groupResultsMarkers, markerListings, areaMarkerListings,
     schoolRadiusFallbackMarkers, isLoadingAreaListings, isErrorAreaListings,
     markersLoading, isMarkerPopoverEligible, selectedMarkerListing,
   });
   ```
   The page's explanatory comments for the cluster were consolidated into one updated header
   comment above the destructure (rather than duplicated verbatim in two places), pointing at
   this note and referencing the #1810 MODEL A user-locked model.

3. **Import swap**: `import { resolveMarkerListings } from '.../resolveMarkerListings'` →
   `import { resolveMarkerPopover } from '.../resolveMarkerPopover'`. The page no longer calls
   `resolveMarkerListings` directly (only the new module does), so the old import was removed
   rather than left dead.

## What stayed unchanged

- **`resolveMarkerListings.ts`** (the S3 module) — imported and called unchanged. Confirmed via
  `git diff --stat b287cfd7 -- src/features/discover/map/resolveMarkerListings.ts` → empty.
- **`handleStepMarkerListing`** (b287cfd7 L1830-1835) — stays inline in the page, unchanged, as a
  plain arrow reading the destructured `currentMapMarkerListings`/`markerPopoverStepper` and
  calling `selectMarkerSibling`. NOT moved into the module, NOT wrapped in `useCallback`, NO
  camera call added — preserves the user-locked #1810 MODEL A no-camera invariant.
- **`AREA_LAYER_MAX_ZOOM`** — stays a module-level `const` in `MapDiscovery.tsx` (L111), passed
  into `resolveMarkerPopover` as the `areaLayerMaxZoom` field. `PropertyMap.areaPanner.test.tsx`
  (source-read) verified still green, unedited.
- **Consumers**: `PropertyMap`'s `listings={currentMapMarkerListings}` and
  `DiscoverMapMarkerPopover`'s `markerPopoverStepper`/`handleStepMarkerListing` props now read
  the destructured values — no consumer prop wiring changed.

## AC-VERBATIM confirmation

- The 15-field `resolveMarkerListings` call in the module matches
  `[ac_verbatim_detail].currentMapMarkerListings_call_verbatim` 1:1 (all 15 keys, same order,
  each bound to a same-name param; `areaLayerMaxZoom`/`journey`/`schoolId` correctly receive the
  page's `AREA_LAYER_MAX_ZOOM`/`urlState.journey`/`urlState.schoolId` values at the page call
  site, module receives them as plain same-name params per the plan's `fields_mapping`).
- The `markerPopoverStepper` IIFE in the module is character-identical to
  `[ac_verbatim_detail].markerPopoverStepper_iife_verbatim` (identifiers became same-name
  params/locals — zero semantic delta to the eligibility gate, `findIndex`, the
  `idx === -1 || length <= 1` guard, or the `{ index, total }` return).

## Verification results (cwd = worktree root for every command)

1. **tsc baseline vs after** — `npx tsc -p tsconfig.app.json --noEmit`, compared via
   `git stash` / `git stash pop`: baseline (b287cfd7 + no S10b changes) = 30 `error TS` lines;
   after (S10b applied) = 30 `error TS` lines. `diff` of the two full outputs: **files
   identical** (byte-for-byte) — zero net-new errors, zero errors in touched files.
2. **New pure-module test** — `npx vitest run src/features/discover/map/resolveMarkerPopover.test.ts`
   → **10/10 passed**.
3. **Build** — `npm run build` → exit 0.
   **Lint** — `npx eslint src/features/discover/map/resolveMarkerPopover.ts
   src/features/discover/map/resolveMarkerPopover.test.ts src/pages/MapDiscovery.tsx` →
   **0 errors**, 14 pre-existing warnings unrelated to the touched lines (react-refresh export
   warnings + 3 unused-eslint-disable warnings, all pre-existing in MapDiscovery.tsx and not on
   any line this slice touched). No `eslint-disable` added or removed by this slice.
4. **`resolveMarkerListings.ts` unchanged** — `git diff --stat b287cfd7 --
   src/features/discover/map/resolveMarkerListings.ts` → empty.
5. **No existing test edited** — `git diff --stat b287cfd7 -- '**/*.test.ts' '**/*.test.tsx'` →
   empty (the new `resolveMarkerPopover.test.ts` is untracked/new, not a diff against an
   existing tracked test).

### Regression guards (existing, unedited)

`npx vitest run` on the #1798/#1810/#1815/#1069/#1370/#1821 MapDiscovery suites +
`PropertyMap.areaPanner.test.tsx`:
- `MapDiscovery.issue1798.markerPopup.test.tsx`, `MapDiscovery.issue1798.test.tsx`,
  `MapDiscovery.issue1815.test.tsx`, `MapDiscovery.issue1815.r3b.test.tsx`,
  `MapDiscovery.issue1069.test.tsx`, `MapDiscovery.issue1370.test.tsx`,
  `MapDiscovery.issue1821.test.tsx` → **7 files, 29/29 tests passed**.
- `PropertyMap.areaPanner.test.tsx` → **13/13 tests passed**.
- `resolveMarkerListings.test.ts` (S3 module's own suite) → **24/24 tests passed**, confirming
  the unmodified module still behaves identically when called through the new wrapper.

All suites green with only pre-existing React `act()` console warnings (not failures).

## AC-LINES (documented variance)

`git diff --stat b287cfd7 -- src/pages/MapDiscovery.tsx` → `37 +++++++++++--------------------------`,
**1 file changed, 11 insertions(+), 26 deletions(-)** → net **-15** lines. The plan projected
~-24 to -32. Shortfall reason: the two original explanatory comment blocks (about 14 lines
combined) were consolidated into one updated comment above the new destructure rather than
deleted outright, so the extraction reads clearly at the call site without requiring a reader to
jump to the module for context. This is a documented variance, not a scope deviation — no logic,
field, or test was affected.

## No camera coupling (AC-NO-CAMERA)

Neither `resolveMarkerPopover` (pure, no side effects, no React import) nor the inline
`handleStepMarkerListing` gained any camera/`panInside`/`CameraIntent` call. The user-locked
#1810 MODEL A invariant (no camera move on marker-to-marker stepping) is preserved.
