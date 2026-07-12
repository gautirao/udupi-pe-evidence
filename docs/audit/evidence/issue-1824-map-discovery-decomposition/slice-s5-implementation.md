# Issue #1824 — Slice S5 Implementation Notes

Branch `issue-1824-s5-marker-selection` @ base `9a7120d0`. Option A per slice-s5-design.md — EARLY marker-selection cluster only. LATE cluster (currentMapMarkerListings, isMarkerPopoverEligible, markerPopoverStepper IIFE, handleStepMarkerListing) stays in the page, untouched except for its two URL writes being consolidated into the new hook.

## Files

- **Created** `src/features/discover/state/useMarkerSelection.ts` — the EARLY cluster (selectedMarkerListing/markerPixelPos useState, the internal `ctxRef` identity-stable-handler pattern, handleSelectMarkerListing/handleMarkerClickWithPosition/handlePopoverDismiss as `useCallback([])`), plus two consolidated URL-write methods (`selectMarkerSibling`, `showMarkerInList`) and one small addition (`clearSelectedMarkerListing`, see below).
- **Created** `src/features/discover/state/useMarkerSelection.test.tsx` — 10 tests covering AC5 (i)-(x): initial null/null, agri-first URL write, area-first URL write, school-first exclusion (#1738), position-capture eligibility gate, dismiss (clear+URL clear), show-in-list (clear, URL write, NO URL clear — the asymmetry), sibling step, identity stability across a urlActions identity change, and freshness (the new urlActions is the one actually called post-rerender).
- **Modified** `src/pages/MapDiscovery.tsx` — removed the EARLY cluster (was L1098-1186), replaced with one `useMarkerSelection({ urlActions, urlState })` call placed above `resolvedPanelContent` (ordering preserved). `handleStepMarkerListing` stays in the page, now delegates its URL write to `selectMarkerSibling(sibling)`. `handleShowMarkerInList` was removed; `MarkerPopoverCard`'s `onShowInList` now receives the hook's `showMarkerInList` directly.

## Deviation from the design doc's exact hook contract (documented, not silent)

The design doc's Task prompt listed 7 return keys. During rewiring I found one additional writer of `setSelectedMarkerListing` that the design doc's reader/writer enumeration did not call out: `DiscoverRightPanel`'s `onClearAgriSelection={() => setSelectedMarkerListing(null)}` (pre-extraction L3863). This is a distinct flow from the marker-popup click/step/dismiss cluster — it's the agri-polygon-selection "clear" affordance, has no URL coupling, and pre-extraction called the bare setter directly. Since the hook no longer exposes a raw setter, I added one minimal additional method to the return object:

```ts
clearSelectedMarkerListing: () => void   // setSelectedMarkerListing(null), no URL write
```

This is a verbatim-preserving, zero-logic-change addition (same effect as the code it replaces) — flagged here per the prompt's own admission that "qa-fast found MORE than the design listed — rewire EVERY one." No other contract deviation.

## Reader/writer rewiring — every site confirmed

`selectedMarkerListing` / `markerPixelPos` / `setSelectedMarkerListing` / `setMarkerPixelPos` / `markerListingCtxRef` were searched for across the whole file post-edit (jCodemunch `search_text`, index refreshed via `index_file` first — the pre-refresh search returned a stale hit set). Zero leftover local declarations. Confirmed resolved sites:

- L1122 (post-edit) `resolvedPanelContent` reads `selectedMarkerListing` (hook return).
- `isRegionOverview` gate reads `selectedMarkerListing == null` (hook return).
- `markerPopoverStepper` IIFE reads `selectedMarkerListing` (hook return) + page `currentMapMarkerListings`/`isMarkerPopoverEligible` (untouched, LATE cluster).
- `handleStepMarkerListing` reads `markerPopoverStepper`/`currentMapMarkerListings` (page, untouched), calls `selectMarkerSibling(sibling)` (hook).
- `selectedPolygonListing={selectedMarkerListing}` prop to `PropertyMap` (hook return).
- `onSelectListing={handleSelectMarkerListing}`, `onMarkerClickWithPosition={handleMarkerClickWithPosition}` props to `PropertyMap` (hook return, stable identity).
- Container `onClick` gate: `markerPixelPos != null ? handlePopoverDismiss : undefined` (hook return).
- Render gate `isMarkerPopoverEligible && selectedMarkerListing != null && markerPixelPos != null` (page `isMarkerPopoverEligible` untouched; `selectedMarkerListing`/`markerPixelPos` hook return).
- `MarkerPopoverCard` props: `listing={selectedMarkerListing}`, `markerPixelPos={markerPixelPos}`, `onDismiss={handlePopoverDismiss}`, `onShowInList={showMarkerInList}` (all hook return).
- `DiscoverRightPanel` props: `selectedMarkerListing={selectedMarkerListing}` (hook return), `onClearAgriSelection={clearSelectedMarkerListing}` (hook return, new method — see deviation above).

## MapDiscovery.tsx line count

- Before: 4110 lines.
- After: 4027 lines (net -83; the removed EARLY-cluster block plus the trimmed `handleStepMarkerListing`/deleted `handleShowMarkerInList` outweigh the added hook-call/import lines).

## Validation

| Command | Exit | Notes |
|---|---|---|
| `tsc --noEmit -p tsconfig.app.json` | 0 (108 pre-existing errors) | Baseline was ~112; my own test file introduced 4 self-inflicted errors on first pass (`result.result.current` typo), fixed, re-ran → 108, net LOWER than the initial 112 baseline capture. No error cites `MapDiscovery.tsx` or `useMarkerSelection.*`. |
| `vitest run src/features/discover/state/useMarkerSelection.test.tsx` | 0 | 10/10 pass, incl. identity-stability (ix) and freshness (x). |
| `vitest run tests/discover/marker-popover-1738-gating.test.ts src/pages/__tests__/MapDiscovery.issue1798.markerPopup.test.tsx` | 0 | **Guard suite green, UNCHANGED** — 5 + 13 = 18/18 pass. Neither test file was edited. |
| `eslint` on the 3 touched files (via `env -C <worktree> node_modules/.bin/eslint <files>`) | 0 errors | 16 pre-existing warnings in `MapDiscovery.tsx` (fast-refresh export warnings + unused eslint-disable directives), none in the new hook/test files, none newly introduced. |
| `npm run build` | 0 | Production build succeeds, 4046 modules transformed. |

No URL-contract change, no #1738/#1798/#1547 behaviour change, no popover-eligibility-gate edit, no LATE-cluster move, no existing test edited.
