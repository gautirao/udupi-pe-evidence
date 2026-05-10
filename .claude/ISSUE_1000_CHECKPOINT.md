# Issue #1000 Checkpoint — Selected-school radius panel

**Status:** ✅ COMPLETE / MERGED (2026-05-08)

## PR
- **Number:** #1024
- **Title:** feat(discover): selected-school radius panel + nearby homes (#1000)
- **Squash-merged:** 2026-05-08 05:58 UTC
- **Merge commit on main:** `30e031c`
- **Closes:** #1000 (verified — issue state CLOSED at 2026-05-08T05:58:41Z)
- **Branch:** `feat/1000-school-selected-panel` (deleted on remote via `--delete-branch`)
- **Pre-merge commit:** `3d64c58`
- **Base main pre-merge:** `8138f06`

## Tests verified before merge
- **Focused unit:** 34/34 PASS (17 SchoolSelectedPanel + 17 DiscoverRightPanel routing)
- **Focused E2E:** 5/5 PASS (`e2e/discover-school-selected.spec.ts`, 11.5s)

## Files merged (8)
- `e2e/discover-school-selected.spec.ts` (new, +311)
- `src/components/discover/panels/SchoolJourneyPanels.tsx` (+208 / -31)
- `src/components/discover/panels/__tests__/SchoolSelectedPanel.test.tsx` (new, +189)
- `src/pages/MapDiscovery.tsx` (+49 / -3)
- `src/components/discover/DiscoverRightPanel.tsx` (+25 / -1)
- `src/components/discover/__tests__/DiscoverRightPanel.routing.test.tsx` (+14 / -3)
- `src/components/discover/MapStatsBar.tsx` (+1 / -1)
- `src/hooks/useDiscoverPageState.ts` (+2 / -2)

Total: +799 / -41.

## Acceptance criteria — all merged
- ✅ Real `SchoolSelectedPanel` (no Milestone 2 placeholder)
- ✅ Radius selector [1, 2, 3, 5] km, default 3
- ✅ Property cards via canonical `/api/discover/listings` flow
- ✅ School proximity params (`schoolLat` / `schoolLon` / `schoolRadiusKm`) reach listings + markers
- ✅ Map circle + minimal selected-school marker (PropertyMap.tsx:500–520)
- ✅ Empty state with "Increase radius" + "Clear property filters" CTAs
- ✅ Clear filters preserves city, journey, schoolId, radiusKm
- ✅ No #999 broad school-marker layer changes
- ✅ No #998 redesign changes
- ✅ No CI

## Known unrelated (pre-existing, NOT from #1000)
- `src/pages/__tests__/Index.invalidCity.test.tsx` flake on `main`
- Supabase auth-storage shim unhandled rejection in unit test environment

## Next recommended issue
- **A6.5 #1001** — Property filters compose with selected school + radius context
  (per SPRINT_CHECKPOINT.md A6 sequence; A6.4 #1000 was the last selected-school AC, A6.5 #1001 closes the loop on filter composition)
