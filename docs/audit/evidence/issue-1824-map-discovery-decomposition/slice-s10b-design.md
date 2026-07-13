# Slice S10b — Design (resolveMarkerPopover pure module)

Base: origin/main @ `b287cfd7` (MapDiscovery.tsx ~2436 after S10a #1880 merged). The S10 boundary
(S10a hook + S10b module, defer S10c) was ratified 2026-07-13; this is the second + final S10 sub-slice.
Line numbers refreshed by explorer-planner @ b287cfd7 (no structural drift from the ed0def53 design).

## Cluster (current @ b287cfd7)

- Early return: `if (!isCityValid) return <CityNotSupported/>` at **L1781**.
- `currentMapMarkerListings` **L1792-1808** — a call to the existing pure `resolveMarkerListings` (S3 module)
  with 15 fields (mapLayerCategory, selectedArea, isGroupResultsState, mapZoom, areaLayerMaxZoom:
  AREA_LAYER_MAX_ZOOM, isAuthenticated, journey: urlState.journey, schoolId: urlState.schoolId,
  groupResultsMarkers, markerListings, areaMarkerListings, schoolRadiusFallbackMarkers, isLoadingAreaListings,
  isErrorAreaListings, markersLoading).
- `markerPopoverStepper` **L1816-1823** — a plain IIFE: `isMarkerPopoverEligible && selectedMarkerListing !=
  null ? (() => { const idx = currentMapMarkerListings.findIndex((l) => l.id === selectedMarkerListing.id); if
  (idx === -1 || currentMapMarkerListings.length <= 1) return null; return { index: idx, total:
  currentMapMarkerListings.length }; })() : null`.
- `handleStepMarkerListing` **L1830-1835** — a plain arrow; steps the popup with NO camera call (user-locked
  #1810 MODEL A). **Stays inline** (not moved, not useCallback).
- `AREA_LAYER_MAX_ZOOM` **L110** (=12) — **must stay** a module-level const in MapDiscovery.tsx;
  PropertyMap.areaPanner.test.tsx **L172** source-reads it via fs.readFileSync/regex.

## Module shape (pure, NOT a hook)

`src/features/discover/map/resolveMarkerPopover.ts` (sibling to `resolveMarkerListings.ts`):
- Input: the 15 resolveMarkerListings fields + `isMarkerPopoverEligible` + `selectedMarkerListing`.
- Body: `const currentMapMarkerListings = resolveMarkerListings({...15...});` then the `markerPopoverStepper`
  IIFE **byte-for-byte** (its identifiers become same-name params/locals). Returns `{ currentMapMarkerListings,
  markerPopoverStepper }`.
- PURE — no React, no hooks, no side effects; returns **fresh** objects each call (per-render identity, as
  today). `resolveMarkerListings.ts` is **unchanged** (imported + called).

Why a module not a hook: the cluster is post the L1781 early return and contains zero hooks; hoisting it into a
pre-early-return hook would run marker resolution on the invalid-city `<CityNotSupported>` return path. The S3
`resolveMarkerListings` precedent.

## Page rewire

Replace the two blocks with:
`const { currentMapMarkerListings, markerPopoverStepper } = resolveMarkerPopover({ mapLayerCategory,
selectedArea, isGroupResultsState, mapZoom, areaLayerMaxZoom: AREA_LAYER_MAX_ZOOM, isAuthenticated, journey:
urlState.journey, schoolId: urlState.schoolId, groupResultsMarkers, markerListings, areaMarkerListings,
schoolRadiusFallbackMarkers, isLoadingAreaListings, isErrorAreaListings, markersLoading,
isMarkerPopoverEligible, selectedMarkerListing });`
`handleStepMarkerListing` stays inline (reads the destructured cluster). Consumers: PropertyMap.listings
(~L1886), DiscoverMapMarkerPopover markerPopoverStepper + handleStepMarkerListing (~L2180-2181).

## Gates (MED risk, OPUS review, FULL matrix)

AC-VERBATIM (15-field set 1:1 + the stepper IIFE byte-for-byte; resolveMarkerListings.ts unchanged),
AC-IDENTITY (two equal-input calls → .toEqual value, .not.toBe refs — fresh, not memoized), AC-BRANCH (stepper
null branches + {index,total}), AC-READERS, AC-AREA-ZOOM (const stays module-scoped; areaPanner unedited),
AC-NO-CAMERA (#1810 invariant — no camera/panInside gained), AC-EXISTING-TESTS (#1798/#1810/#1815 + areaPanner).

## Projection

MapDiscovery.tsx 2436 → ~2408 (net ~-28). Not <800 — **S11 (the ~575-line JSX return) is the only lever that
reaches the target.**
