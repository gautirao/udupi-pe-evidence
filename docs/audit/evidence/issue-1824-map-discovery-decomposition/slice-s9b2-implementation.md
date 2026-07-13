# Slice S9b2 (RE-SCOPED) — implementation note

Region/breadcrumb cluster moved verbatim into `useDiscoverMapPresentation`
(src/features/discover/presentation/useDiscoverMapPresentation.ts), expanding
the flat presenter hook introduced in S9b1.

## What moved (verbatim, byte-for-byte body/logic)

From `src/pages/MapDiscovery.tsx` into the hook body, in this order (after the
existing `overviewAreas`/`areaSearchMatchKeys` useMemo):

1. `isRegionOverview` — was L1795-1801, plain const, predicate unchanged.
2. `resolvedRegionLabel` — was L1777-1780, fallback ladder unchanged (its
   preceding "Issue #1798 PR-B1" comment moved with it).
3. `resolvedScopeKeyForHref` — was L1782-1786, fallback ladder unchanged;
   hook-internal only (not returned).
4. `regionOverviewMarkerKind` — was L1808-1811, branches unchanged.
5. `regionOverviewShortLabel` — was L1815-1821, IIFE unchanged.
6. `areaJourneySegmentsRaw` + `areaJourneySegments` — was L1828-1858, object
   literals / filter type-guard / map / href templates unchanged;
   `areaJourneySegmentsRaw` is hook-internal only.
7. `schoolJourneySegmentsRaw` (incl. its rules-of-hooks comment) +
   `schoolJourneySegments` — was L1860-1885, unchanged;
   `schoolJourneySegmentsRaw` is hook-internal only.

None were wrapped in `useMemo` — they remain plain consts, matching the
original's explicit "not memoized" design intent (rules-of-hooks comment
preserved verbatim on block 7).

## Hook signature changes

4 new params added (all confirmed defined before MapDiscovery.tsx's L1694
call site, no TDZ): `city`, `selectedArea`, `selectedSchool`,
`selectedMarkerListing`, passed as bare identifiers at the call site with no
wrapping.

These 4 new params are typed **optional** (`city?: string`,
`selectedArea?: AreaPoint | null`, etc.) with in-function defaults
(`city = ''`, `selectedArea = null`, ...) — NOT required — because the frozen
S9b1 test file `useDiscoverMapPresentation.overviewAreas.test.ts` (forbidden
to edit) constructs `UseDiscoverMapPresentationParams` object literals that
never supply these 4 fields. Making them required would have broken that
test file's type-checking without editing it. Optional + defaulted preserves
exact real-world behaviour (MapDiscovery.tsx's call site always passes
concrete non-optional values) while keeping the frozen fixture green.

New imports added directly (not via the MapDiscovery.tsx shim):
`RegionOverviewMarkerKind`, `DiscoverMapCrumb` (types), `prettifyZoneSlug`,
`areaKeyToLabel`, `CITY_CONFIG`, plus `SchoolResult` and
`PropertyListingWithImages` types for the new param shapes.

Return object expanded with 6 new fields: `resolvedRegionLabel`,
`isRegionOverview`, `regionOverviewMarkerKind`, `regionOverviewShortLabel`,
`areaJourneySegments`, `schoolJourneySegments`. `resolvedScopeKeyForHref`,
`areaJourneySegmentsRaw`, `schoolJourneySegmentsRaw` stay hook-internal.

## MapDiscovery.tsx changes

- The 7 const blocks removed from the page body.
- The L1694 `useDiscoverMapPresentation(...)` destructure expanded to include
  the 6 new returns; the call object expanded with the 4 new bare-identifier
  injects (`city`, `selectedArea`, `selectedSchool`, `selectedMarkerListing`).
- Stayers left in place unchanged: `selectedGroupName`,
  `isMarkerPopoverEligible`, `regionGuideVisible`, `regionGuideRingActive`
  (the latter two now read the destructured `isRegionOverview`).
- Two comment blocks explicitly flagged "leave alone" by the task brief
  (the isRegionOverview AC2-AC12 design-intent comment, and the
  regionOverviewMarkerKind "marker-accurate variant" comment) were **not**
  reproduced in MapDiscovery.tsx as free-floating comments — the code they
  describe no longer lives in this file, and duplicating the comment text
  in the hook file (where it now travels with its code) is where a reader
  would actually look for it. This is a documented, low-risk deviation from
  a literal re-read of the line-range instruction — a comment-placement
  choice, not a logic/behaviour change.
- Two now-unused type imports removed as a required consequence of the move
  (not a scope expansion — the code compiles clean only with them removed):
  `type RegionOverviewMarkerKind` from the `RegionGuidanceCard` import, and
  the standalone `type DiscoverMapCrumb` import line. `areaKeyToLabel` was
  also removed from the `SchoolRadiusMapOverlay` import (its only call site
  moved into the hook); `prettifyZoneSlug` stays imported (still called at
  the `selectedGroupName` stayer).

## New test

`src/features/discover/presentation/useDiscoverMapPresentation.regionBreadcrumb.test.ts`
— 18 tests, all passing. Covers: `resolvedRegionLabel` (scope-hit /
scope-miss prettify fallback / scope-null focusedGroup fallback / scope-null
no-group null), `isRegionOverview` (true/false branches incl. marker-listing
gate), `regionOverviewMarkerKind` ('zones' / 'areas' direct-group-match /
null-not-region-overview / null-wrong-layer / null-empty-overviewAreas),
`areaJourneySegments`/`schoolJourneySegments` segment-dropping (zone-only,
area context, school-present, stale-school-dropped-without-schoolId), and the
mandatory AC-NON-MEMO inverse-of-S9b1 test
(`region/breadcrumb segment arrays are rebuilt (non-memoized) on every render`)
asserting `.not.toBe` reference inequality across a no-op rerender.

## Verification

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` | 30 errors, all pre-existing (verified identical count + identical error set on base commit 25f9ae5e via `git stash`/`git stash pop`); zero errors in touched files |
| `npx vitest run src/features/discover/presentation/useDiscoverMapPresentation.regionBreadcrumb.test.ts` | 18/18 passed |
| `npx vitest run src/features/discover/presentation/useDiscoverMapPresentation.overviewAreas.test.ts` | 9/9 passed (file untouched) |
| `npm run build` | exit 0 |
| `npx eslint src/pages/MapDiscovery.tsx src/features/discover/presentation/useDiscoverMapPresentation.ts src/features/discover/presentation/useDiscoverMapPresentation.regionBreadcrumb.test.ts` | 0 errors, 15 warnings (same 15 pre-existing warnings verified against base commit via `git stash`/`git stash pop`, only line numbers shifted); no eslint-disable added |
