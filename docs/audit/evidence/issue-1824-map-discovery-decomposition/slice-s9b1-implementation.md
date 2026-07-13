# Issue #1824 Slice S9b1 — Implementation Note

Branch `issue-1824-s9b1-overview-areas-presenter` (base `21a7f475`, S1-S9a merged).
Plan: `.claude/handoffs/issue-1824/approved-plan.toml` (gate `PLAN_REVIEW`, revision R1).
Design: `docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s9b-design.md`.

## What moved

- `overviewAreas` (original MapDiscovery.tsx L1689-1925, 237 LOC, 6 layer branches + the
  16-element dep array) and `areaSearchMatchKeys` (L1948-1955) moved VERBATIM into a new
  hook `src/features/discover/presentation/useDiscoverMapPresentation.ts`, returning the
  FLAT shape `{ overviewAreas, areaSearchMatchKeys }`.
- `focusedGroup` stays in the page (L1112-1114 unchanged) and is injected into the hook.
- `regionOverviewMarkerKind` stays in the page and reads the hook's returned
  `overviewAreas` (no code change required — it already referenced the same identifier,
  now sourced from the hook's destructure).
- Consumers (`PropertyMap.areas`, `PropertyMap.areaSearchMatchKeys`, `DiscoverMapLegend`)
  are unchanged — they already read the `overviewAreas`/`areaSearchMatchKeys` identifiers,
  which now come from the hook destructure instead of local `useMemo`s.

## Call-site injection (AC3 — memo identity-stability)

At the `useDiscoverMapPresentation({...})` call site in MapDiscovery.tsx, every injected
value is passed as the bare identifier — no `?? []`/`?? {}`/`|| []`, no `.filter()`/
`.map()`/`.slice()`/`.concat()`, no spread, no new object/array literal:

| Injected param | Expression at call site | Source |
|---|---|---|
| `mapLayerKind` | `mapLayerKind` | `selectDiscoverMapLayer(...)` page const |
| `isLoadingAreaGroups` | `isLoadingAreaGroups` | `useAreaGroups()` destructure |
| `isLoadingRegionalAreaGroups` | `isLoadingRegionalAreaGroups` | `useRegionalAreaGroups()` destructure |
| `isLandingState` | `isLandingState` | page const |
| `isAreaFirstCityLanding` | `isAreaFirstCityLanding` | page const |
| `areaGroupsData` | `areaGroupsData` | `useAreaGroups()` destructure (bare, not `?? []`) |
| `discoverAreas` | `discoverAreas` | `useDiscoverMapData()` destructure (bare) |
| `corridorGroups` | `corridorGroups` | `useRegionalAreaGroups()` destructure (bare) |
| `agriAreasData` | `agriAreasData` | `useDiscoverMapData()` destructure (bare, not `?? []`) |
| `liveAreas` | `liveAreas` | page memo (L1648, bare) |
| `urlState` | `urlState` | whole object, passed by reference |
| `summaryRegions` | `summaryRegions` | page memo (bare, not `?? []`) |
| `cityCenter` | `cityCenter` | `useDiscoverMapData()` destructure (bare) |
| `focusedGroup` | `focusedGroup` | page memo (L1112-1114, bare, not a re-derive) |
| `debouncedAreaSearchQuery` | `debouncedAreaSearchQuery` | `useAreaSearchState()` destructure (bare) |

Inside the hook, the 16-element `overviewAreas` dep array lists `urlState.viewport`,
`urlState.scope`, `urlState.areaKey` (sub-fields), never the whole `urlState` object —
matching the original dep array verbatim.

## Validation

- `npx tsc -p tsconfig.app.json --noEmit`: 52 pre-existing errors (verified identical via
  `git stash`/baseline diff, all unrelated files: PropertyMap/PropertyListings/admin/
  duplicate-management). Zero net-new errors from this slice.
- New test `useDiscoverMapPresentation.overviewAreas.test.ts`: 9/9 pass (7 branch cases +
  the negative identity case + the positive-control recompute case).
- `[regression_test_map]` mount guards (default vitest pool): issue1655,
  issue1745-batchB-overviewClick, issue1815, issue1815.r3b, issue1806.groupScope,
  issue1458.agri-filter, issue1069, groupResults — 8 files / 45 tests, all PASS,
  files UNEDITED (`git diff --stat` shows no changes to any of these test files).
  Note: a `--pool=forks --poolOptions.forks.singleFork=true` run showed order-dependent
  cross-file mock leakage (a different file fails each run) — reproduced identically on
  the unmodified baseline (via `git stash`), confirming it is a pre-existing test-harness
  flake unrelated to this change. The default pool run (specialist_sequence's mandated
  mode) is green.
- `npx eslint src/pages/MapDiscovery.tsx src/features/discover/presentation/useDiscoverMapPresentation.ts src/features/discover/presentation/useDiscoverMapPresentation.overviewAreas.test.ts`:
  0 errors, 15 warnings — identical warning set/count to the baseline (verified via
  `git stash`), no eslint-disable added or removed.
- `npm run build`: exit 0.

## Line count

`src/pages/MapDiscovery.tsx`: 2787 → 2542 lines (**-245**), within the projected
~-235 to -245 range (`git diff --stat`: 11 insertions, 256 deletions — includes
removing the `matchesMacroRegion`/`labelToSlug`/`computeGroupBounds` imports that
became unused once `overviewAreas` moved out of the page).

## Deviations from plan

- `AreaGroupsResponse` (the type of `useAreaGroups()`'s `data`) is not exported from
  `src/hooks/useAreaGroups.ts` (a file outside this slice's ALLOWED FILES). The hook's
  `areaGroupsData` param is typed inline as `{ groups: AreaGroup[] } | undefined` (using
  the exported `AreaGroup` type) instead of importing the response wrapper type. This is
  a type-only annotation choice with no behaviour impact — not a forbidden-file edit.
