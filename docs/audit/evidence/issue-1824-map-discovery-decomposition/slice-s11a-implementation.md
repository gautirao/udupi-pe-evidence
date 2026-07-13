# Slice S11a — Implementation Note

**DiscoverMapCanvas + DiscoverOverlaySheets sub-views**

## What moved

1. **`src/features/discover/views/DiscoverMapCanvas.tsx`** (new) — the map-half
   return-tree region, moved VERBATIM from `MapDiscovery.tsx` @ 838f620e
   L1850-2169 (~320 lines): the `mapContainerRef` div, `DiscoverMapStatusHints`
   (loader), the `error ? errorCard : <PropertyMap/>` ternary, and the ~11
   overlay children (`DiscoverMapContextOverlay`, `DiscoverMapLegend` ×2,
   `CitySelect` gate, `RegionGuidanceCard`, the sr-only aria-live announce,
   `DiscoverMapCountBadge`, `DiscoverMapStatusHints` (hint), `MapStatsBar`,
   `MarkersTruncationNotice`, `MapEmptyGuidance`, `DiscoverMapMarkerPopover`).
   Root: the `mapContainerRef` div (no wrapper added).

2. **`src/features/discover/views/DiscoverOverlaySheets.tsx`** (new) — the
   sheets/overlays group moved VERBATIM from L2397-2418 (~22 lines):
   `NearSchoolSheet` (gated `!isAgriJourney`), `DiscoverConsentBanner`,
   `DiscoverPrivacyToggle`. Root: a fragment (no wrapper added).

3. **`src/pages/MapDiscovery.tsx`** — the two regions replaced by
   `<DiscoverMapCanvas {...} />` / `<DiscoverOverlaySheets {...} />`, threading
   every value the moved JSX reads as an explicit prop (bare identifiers;
   `urlState`/`urlActions`/`journeyView`/`journeyCommands`/`filters`/
   `schoolListings`/`areaRestoreArea`/`schoolsQuery` threaded whole per the
   plan's `threading_special_cases`; `areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}`;
   `mapContainerRef={mapContainerRef}`). Dead imports removed after the move
   (verified each had zero remaining usages before removal): `PropertyMap`,
   `RegionGuidanceCard`/`RegionOverviewMarkerKind`, `DiscoverMapContextOverlay`,
   `DiscoverMapLegend`, `DiscoverMapCountBadge`, `DiscoverMapMarkerPopover`,
   `DiscoverMapStatusHints`, `CitySelect`, `MapStatsBar`/
   `MarkersTruncationNotice`, `MapEmptyGuidance`, `NearSchoolSheet`,
   `DiscoverConsentBanner`, `DiscoverPrivacyToggle`, `Card`,
   `DEFAULT_SCHOOL_RADIUS_KM`. `clampSchoolRadiusKm` and `ZoneLabelPoint` stay
   imported (still used by page-body logic outside the moved regions).
   `PublicDiscoverLayout` wrapper, the outer flex container, and the
   `DiscoverRightPanel` call-site are byte-for-byte unchanged.

## No body-logic moved

Every inline-computed expression that reads raw props (schoolCircle,
agriGroupListings ternary, focusBounds `??`, focusedGroupAreas ternary,
enableAreaMarkerDegradation, selectedAreaKey, areaSearchMatchKeys,
schoolFocusRadiusKm IIFE, areaRestoreBbox, sectorOverlay, the
schoolRadiusChrome/variants/schoolRadiusHint objects) moved INTO the canvas
**verbatim** and recomputes from the canvas's own props each render — nothing
was pre-computed in the page. `clampSchoolRadiusKm` + `DEFAULT_SCHOOL_RADIUS_KM`
are imported directly as module utils in the two new files (not threaded as
props). No derived `const`, handler, effect, or hook moved.

## S8 badge-fork guard

`DiscoverMapCanvas` imports `DiscoverBadgeResult` as a **type-only** import
from `@/pages/MapDiscovery` (same pattern already used by
`DiscoverMapCountBadge.tsx`/`DiscoverMapContextOverlay.tsx`) and receives
`discoverBadge`, `areaResultSummaryText`, `groupSelectedBadgeCopy`,
`fallbackBadgeCopy`, and `schoolRadiusPillNoun` as **props only**. It never
imports `formatDiscoverBadgeCopy`, `deriveSchoolRadiusPillNoun`, or
`hasActiveAnonPropertyFilter` — verified by an automated import-guard test
(`DiscoverMapCanvas.test.tsx`, scoped to actual `import` lines so it can't
false-positive on this file's own doc comments, which legitimately name the
three helpers while explaining the guard).

## Props interface sizes

- `DiscoverMapCanvasProps`: **91** fields (incl. the `mapContainerRef` ref prop
  and `areaLayerMaxZoom`).
- `DiscoverOverlaySheetsProps`: **11** fields.

## Verification results

| # | Command | Result |
|---|---------|--------|
| 1 | `tsc -p tsconfig.app.json --noEmit` (branch) | 30 errors |
| 1 | `tsc -p tsconfig.app.json --noEmit` (838f620e via `git stash`) | 30 errors (same set) — **0 net-new**, 0 in touched files |
| 2 | `vitest run src/features/discover/views/DiscoverMapCanvas.test.tsx src/features/discover/views/DiscoverOverlaySheets.test.tsx` | **11/11 PASS** |
| 3 | Representative journey/regression batch: `MapDiscovery.issue1798*.test.tsx`, `issue1806.groupScope`, `issue1808.regionGuidance`, `school-pill`, `issue1588.cityDynamic`, `issue1655`, `groupResults`, `issue1745-batchB-overviewClick`, `issue1815*`, `issue1821` | **91/91 PASS**, unedited |
| 4 | `npm run build` | exit 0 |
| 4 | `eslint` (touched files) | 0 errors; 14 pre-existing warnings (identical set to baseline, no eslint-disable added) |
| 5 | `git diff --stat 838f620e` | only `src/pages/MapDiscovery.tsx` modified; new files are untracked (views/tests/docs); no forbidden path touched; no existing test edited |

## Lines

`MapDiscovery.tsx`: 2421 → 2181 (**-240**). Below the plan's projected
-330/-400 (~2020-2090) — a **documented variance**: the map-half region was
~320 JSX lines, replaced by ~99 lines of explicit prop-threading in the page
(net ~-221), and the sheets region (~22 lines) replaced by an ~12-line call
(net ~-11) ≈ -232, close to the observed -240. The threading overhead for a
~91-prop interface is inherent to the JSX-only decomposition approach
documented in `[acceptance_rebaseline]` — no further reduction is available
without moving body logic (out of S11a's scope; deferred to S11b/S11c).
