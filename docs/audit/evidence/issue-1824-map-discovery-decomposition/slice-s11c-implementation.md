# Slice S11c implementation note — DiscoverRightPanelContainer

Issue #1824, Slice S11c. Branch `issue-1824-s11c-discover-right-panel-container`, base `7e598574`.

## What moved

`MapDiscovery.tsx` L1684-1908 (the `<DiscoverRightPanel ... />` call site: every
DiscoverRightPanel prop, the ~25 inline closures — including
`onSelectAreaKey`, `onApplyAgriFilters`, `onBackToRegion` — and the inline
footer pager JSX `footerContent`, plus the `cityLabel` expression and the
`onBack` ternary) was lifted **verbatim** into a new container component:

- `src/features/discover/views/DiscoverRightPanelContainer.tsx` (new)
- `src/features/discover/views/DiscoverRightPanelContainer.test.tsx` (new)

The container's function body is a byte-for-byte copy of the moved JSX
region: only the source of each read value changed (a page-body identifier
became a same-name container prop, or — for the closures — the container
prop the closure now closes over). No comment, no JSX structure, no prop
value expression, and no rationale comment (#1067/#1178/#1483/#1485/#1547/
#1588/#1597/#1606/#1798/#1806/#1808/#1817/#1425-1464) was altered.

The container returns the `<DiscoverRightPanel {...} />` element as its
**root** — no wrapper `<div>` or `<>...</>` — so the rendered DOM is
identical to before the extraction.

## Props interface

`DiscoverRightPanelContainerProps` is an explicit, `any`-free interface with
74 named fields — the deduplicated set of every page-body value the moved
JSX/closures/footer read. Several DiscoverRightPanel props share a single
container prop by design (whole-object threads, matching the approved
[prop_parity_table]):

- `urlState` / `urlActions` — every `urlState.*` / `urlActions.*` read in the
  closures (journey, areaKey, groupId, scope, radiusKm, filters.\*, intent,
  selectedListing, selectedLocality) resolves through these two props.
- `journeyView` / `journeyCommands` — `onBack`, `onStartOver`,
  `boundedSearchTriggered`, `onRadiusChange`, `onClearSchool`, `onClearArea`,
  `onSelectSchool`.
- `interactionCommands` — `onHoverResultListing`, `onAreaHover`.
- `schoolsQuery` — `schoolsLoading` / `schoolsError` / `onSchoolsRetry` /
  `schoolsFetching`.
- `areaMarkerCounts` — `shownAreaCount` / `totalAreaMarkerCount`.
- `areaGroupsData` / `agriMapListingsData` — the raw query-hook `data`
  objects the `areaGroups={...}` / `agriGroupTruncated={...}` /
  `agriGroupListingsLimit={...}` expressions read from.

One deviation from the plan's literal prop typing: `AreaGroupsResponse` is
declared but **not exported** by `useAreaGroups.ts` (a forbidden file — out
of S11c's edit boundary). `areaGroupsData` is typed as the equivalent
structural shape `{ groups: AreaGroup[] } | undefined` (`AreaGroup` IS
exported) instead of importing the unexported response type. This is a
type-only substitution with no runtime effect and does not touch the
forbidden file.

## Imports

The container imports directly (not as props): `DiscoverRightPanel` (the
wrapped leaf), `Button` + `ChevronLeft` + `ChevronRight` (footer),
`CITY_CONFIG` (cityLabel), `resolveScopeKeyFromLabel` (onBackToRegion).

**S8 badge-fork guard preserved** — the container imports NONE of
`formatDiscoverBadgeCopy` / `deriveSchoolRadiusPillNoun` /
`hasActiveAnonPropertyFilter`. The precomputed copy (`areaResultSummaryText`,
etc.) is received as props only. Enforced by an import-guard test (see
below) mirroring the S11a `DiscoverMapCanvas.test.tsx` pattern.

Not React.memo'd, no state/effects/refs — a pure prop→JSX wrapper, matching
the S11a `DiscoverMapCanvas` precedent.

## Page rewire

`MapDiscovery.tsx` L1684-1908 was replaced with a single
`<DiscoverRightPanelContainer {...} />` call threading every value listed
above as a bare identifier prop (or whole-object thread). The
`DiscoverMapCanvas` sibling, the `DiscoverOverlaySheets` sibling, the flex
wrapper, and `PublicDiscoverLayout` are byte-unchanged.

`activeContextChips` (page `useMemo`) and `filtersContent` (page-computed,
not memoized) are threaded through as-is — the container does not recompute
them, so their identity is unchanged versus the pre-extraction inline call.

### Dead imports removed from the page

Once the JSX moved into the container, these became unused on
`MapDiscovery.tsx` and were removed:

- `import { DiscoverRightPanel } from '@/components/discover/DiscoverRightPanel';`
- `resolveScopeKeyFromLabel` (kept `aggregateMacroRegions` from the same
  `@/utils/macroRegionResolver` import — still used elsewhere on the page)
- `import { Button } from '@/components/ui/button';`
- `import { ChevronLeft, ChevronRight } from 'lucide-react';`

`CITY_CONFIG` stays imported on the page (still used at L543 `isCityValid`
and L1568 inside `filtersContent`'s badge-copy computation).

## Verification (worktree cwd for every command)

1. **tsc, full project, stash-verified against 7e598574** — baseline: 30
   pre-existing errors (none touching Discover files — PropertyType/
   PropertyListing mismatches in unrelated hooks/tests). Post-change: 30
   errors, **byte-identical** to baseline (`diff` reports files identical).
   Zero net-new. Command: `npx tsc -p tsconfig.app.json --noEmit`.
2. **New container test** —
   `npx vitest run src/features/discover/views/DiscoverRightPanelContainer.test.tsx`
   → 7/7 passed (panelContent variants, prop-forwarding incl.
   `cityLabel`/`searchQuery`/`areaResultSummaryText`, footer pager
   page/totalPages/totalElements + prev/next disabled-state permutations,
   the S8 import-guard).
3. **Existing regression battery** (all 28 `MapDiscovery.*.test.tsx` files
   under `src/pages/__tests__/` + `src/pages/MapDiscovery.test.tsx`) —
   `npx vitest run "src/pages/__tests__/MapDiscovery." "src/pages/MapDiscovery.test.tsx"`
   → **31 test files, 235 tests, all passed, zero edits**. Covers the
   area/school/agri-first journey mounts, #1547 card↔marker, #1798 popover,
   the agri-filter panel, the pager (`groupResults.test.tsx`), #1178
   groupId highlighting, #1808 region guidance.
4. `npm run build` → exit 0.
5. `npx eslint src/pages/MapDiscovery.tsx src/features/discover/views/DiscoverRightPanelContainer.tsx src/features/discover/views/DiscoverRightPanelContainer.test.tsx` → 0 errors/warnings, no `eslint-disable` added.
6. `git diff --stat 7e598574` → only `src/pages/MapDiscovery.tsx` modified
   (+43/-194, net -151 lines); `git status --porcelain` shows the 2 new
   container files + this doc as the only untracked additions.
   `git diff --stat 7e598574 -- '*.test.ts' '*.test.tsx'` → empty (no
   existing test file touched).

## Line count

`MapDiscovery.tsx` is now **1774 lines** (from ~1925 pre-slice), slightly
better than the ~1795-1815 projection in the approved plan — no shortfall.

## No behaviour change

The container is a pure lift-and-shift: the DOM tree is identical (verified
by the unedited 235-test regression battery), no logic moved beyond the
already-inline closures/footer, and no badge/copy helper was pulled into the
container (S8 fork guard intact, both by code inspection and by the new
import-guard test).
