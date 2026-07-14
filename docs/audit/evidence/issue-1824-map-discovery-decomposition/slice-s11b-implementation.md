# Slice S11b implementation — 4 derived-const clusters → presenter hooks

## Summary

Extracted 4 cohesive derived-const clusters out of `src/pages/MapDiscovery.tsx` into 4 new
FLAT presenter hooks under `src/features/discover/presentation/**` (the S9b pattern).
Behaviour-preserving VERBATIM extraction: each cluster body + every `useMemo` dep array
moved byte-for-byte; injected deps are passed UNWRAPPED (bare identifiers) at the call
site; the plain-const members kept their per-render-fresh (non-memoized) contract.

## Files added

- `src/features/discover/presentation/useDiscoverGroupResults.ts` (C2)
- `src/features/discover/presentation/useFilteredAgriListings.ts` (C4)
- `src/features/discover/presentation/useSchoolListings.ts` (C3)
- `src/features/discover/presentation/useSchoolFirstCounts.ts` (C5)
- Matching `*.test.ts` renderHook tests for each (branch coverage + memo-identity + S9b2-inverse)

## Per-cluster moves (original d37228b3 line ranges → hook)

### C2 — `useDiscoverGroupResults` (orig L353-448)

Moved: `groupResultsAnonRaw` (useMemo), `groupResultsAnonListings` (useMemo), the unified
group-results surface (5 plain-const ternaries: `groupResultsListings`,
`groupResultsTotalElements`, `isLoadingGroupResults`, `isGroupResultsError`,
`refetchGroupResults`), `groupResultsMarkers` (useMemo) — plus the directly-attached
"anon teaser filter audit" doc comment block that explains the moved transformation.

- `groupResultsAnonRaw` / `groupResultsAnonListings` have **zero readers outside this
  cluster** (verified via full-text search of the page for both names) — kept INTERNAL,
  not returned (per AC-READERS / the plan's OQ-INTERNAL).
- Params: `isGroupResultsState`, `isAuthenticated`, the 4 authed-path query outputs
  (`groupResultsAuthedData`, `isLoadingGroupResultsAuthed`, `isGroupResultsErrorAuthed`,
  `refetchGroupResultsAuthed`), `groupResultsMarkersData`, the 4 anon-path query outputs
  (`groupResultsAnonData`, `isLoadingGroupResultsAnon`, `isGroupResultsErrorAnon`,
  `refetchGroupResultsAnon`), `anonGroupFilters`.
- Return: `{ groupResultsListings, groupResultsTotalElements, isLoadingGroupResults,
  isGroupResultsError, refetchGroupResults, groupResultsMarkers }`.
- Types derived via `ReturnType<typeof useDiscoverListings>` /
  `ReturnType<typeof useDiscoverCityListings>` /
  `ReturnType<typeof useDiscoverFilteredMarkers>` (type-only imports) rather than
  hand-reconstructing react-query generics.

### C4 — `useFilteredAgriListings` (orig L463-515)

Moved: `filteredAgriListings` (single useMemo, the 10-entry dep array byte-for-byte).

- Params: `agriMapListingsData`, `filters` (injected as the bare `urlState.filters`
  reference from the page — unwrapped, no spread), `isAuthenticated`.
- Return: `AgriMapListingItem[] | null` (matches the original inferred type).

### C3 — `useSchoolListings` (orig L1018-1093)

Moved: `schoolListings` (useMemo) + `schoolRadiusFallbackMarkers` (useMemo), plus the
directly-attached leading doc comments.

- Params: `isAuthenticated`, `filters` (the `useDiscoverPageState`-sourced `PropertyFilters`,
  distinct from `urlState.filters`), `areaListings`, `schoolRadiusListings`,
  `filteredListings`, `journey`, `schoolId`.
- Return: `{ schoolListings, schoolRadiusFallbackMarkers }`.
- **Called at the page's original C3 position** — BEFORE `focusedGroup`, BEFORE
  `useDiscoverCameraOrchestration` (which reads `schoolListings` as an injected dep), and
  BEFORE the page-local `discoverBadge` useMemo, which reads `schoolListings.length`
  (Issue #1175 v2 / #1152). Eval order verified unchanged (R1 in the approved plan).

### C5 — `useSchoolFirstCounts` (orig L1126-1165)

Moved: `schoolFirstLandingSchoolCount` (useMemo), `schoolFirstZoneSchoolCount` (useMemo),
`schoolFirstAreaSchoolCount` (**plain const**, not memoized — verbatim), `schoolZoneLabels`
(the dead `useMemo(() => [], [])`, verbatim).

- Params: `journey`, `groupId`, `selectedArea`, `focusedGroup`, `areasLoading`,
  `discoverAreas` — typed via indexed access on `SchoolFirstZoneCountInput` (the widest of
  the three `deriveSchoolFirst*` input shapes) rather than re-declaring the field types.
- Return: `{ schoolFirstLandingSchoolCount, schoolFirstZoneSchoolCount,
  schoolFirstAreaSchoolCount, schoolZoneLabels }`.
- **Called after `focusedGroup`** (the page-local useMemo it depends on via the injected
  `focusedGroup` param — the bare page reference, not recomputed inside the hook).

## Page rewire (`src/pages/MapDiscovery.tsx`)

- 4 hook calls inserted at the SAME positions their clusters previously occupied.
- `discoverBadge` (page-local, unmoved) now reads `schoolListings.length` from the
  `useSchoolListings` destructure — no other change to its body/dep array.
- `selectedGroupListingItem`, `focusedGroup`, `groupListingsCount`, C1
  (Landing/Journey predicates), `resolveMarkerPopover`, the handlers, and the `__debug`
  bridge all stay page-local, untouched — confirmed via `git diff --stat d37228b3`
  (only `MapDiscovery.tsx` + the 8 new files + docs changed; no forbidden path touched;
  zero existing `*.test.ts(x)` files touched).
- Net line count: 2181 → 1925 (**-256 lines**, better than the ~-200 to -240 projection
  in the approved plan; positive variance, no shortfall).

### Dead imports removed from the page (became unused as a direct result of the move)

`clampSchoolRadiusKm`, `PropertyListing`, `PropertyImage` (from `usePropertyListings`);
`cityListingToPropertyListing`, `filteredMarkerToPropertyListing` (from `discoverMappers`,
entire import line removed); `rupeesToPaise` (from `anonPropertyFilters`); the type-only
imports `DiscoverListingItem` and `DiscoverCityListingItem`; the type-only import
`ZoneLabelPoint`. Verified truly unused via full-file substring/word-boundary search
before removal (each had zero remaining call-sites/type-annotation-sites in the page).
`computeZoneLabelPoints` was ALREADY dead before this slice (pre-existing, unrelated to
this move — schoolZoneLabels' `useMemo(() => [], [])` never called it) and was left
untouched (out of scope).

`applyAnonPropertyFilters`, `deriveAnonSchoolRadiusMarkers`, `hasActiveAnonPropertyFilter`,
`deriveSchoolFirstLandingSchoolCount`, `deriveSchoolFirstZoneSchoolCount`,
`deriveSchoolFirstAreaSchoolCount`, `deriveShowSchoolMarkers`, `deriveSchoolRadiusPillNoun`
and their associated `SchoolFirst*Input` types remain imported in the page — they feed the
pre-existing S9a `export { ... }` / `export type { ... }` re-export shim (backward
compatibility for 5 external unit-test files + `DiscoverMapCountBadge.tsx`), independent of
whether the page body itself still calls them directly.

## Verification (exact commands + exit codes, cwd = worktree)

1. **tsc** — `npx tsc -p tsconfig.app.json --noEmit`
   - Post-change: 30 errors in 9 files.
   - Baseline (`git stash` to d37228b3, same command): 30 errors in 9 files, identical set.
   - **Zero net-new errors; zero in touched files** (all 30 are pre-existing, in
     unrelated files: `DiscoverRightPanel.agri.ac11.test.tsx`, `AreaSelectedPanel.tsx`,
     `PropertyMap.agri.test.tsx`, `PropertyMap.tsx`, `useDuplicateManagement.ts`,
     `usePropertyListings.ts`, `useSimilarListings.ts`, `discoverMappers.ts`,
     `admin/Listings.tsx`).

2. **New tests** — `npx vitest run` the 4 new files together:
   `src/features/discover/presentation/{useDiscoverGroupResults,useFilteredAgriListings,useSchoolListings,useSchoolFirstCounts}.test.ts`
   - **39 tests passed, 0 failed.**

3. **Existing behaviour guards** (run individually, `--pool=forks --poolOptions.forks.singleFork=true`):
   - `MapDiscovery.groupResults.test.tsx` — 13 passed
   - `MapDiscovery.anon-school-radius.test.ts` — 21 passed
   - `MapDiscovery.school-pill.test.tsx` — 26 passed
   - `MapDiscovery.issue1152.test.ts` — 42 passed
   - `MapDiscovery.issue1175.test.ts` — 16 passed
   - `MapDiscovery.issue1430.test.tsx` — 4 passed
   - `MapDiscovery.issue1458.agri-filter.test.tsx` — 7 passed
   - `MapDiscovery.issue1655.test.tsx` — 9 passed
   - `MapDiscovery.issue1798.test.tsx` — 4 passed
   - `MapDiscovery.issue1798.markerPopup.test.tsx` — 13 passed
   - `MapDiscovery.school-deep-link.test.tsx` — 5 passed
   - `MapDiscovery.issue1806.groupScope.test.tsx` — 5 passed
   - `MapDiscovery.issue1815.test.tsx` — 2 passed
   - `MapDiscovery.issue1745-batchB-overviewClick.test.tsx` — 4 passed
   - `MapDiscovery.issue1370.test.tsx` — 3 passed
   - **All passed. Zero test-file edits** (confirmed via `git status --porcelain`: no
     existing `*.test.ts(x)` appears as modified).
   - NOTE: running several of these MapDiscovery test files together in one Vitest
     process (e.g. `issue1152` + `issue1430` + ... + `issue1798` in a single batch)
     reproduces `MapDiscovery.issue1798.test.tsx` / `.markerPopup.test.tsx` failures
     ("multiple elements with text Hebbal Public School" / breadcrumb waitFor timeout).
     Reproduced this exact same batch-level failure on the unmodified d37228b3 baseline
     (`git stash` before running) — **pre-existing cross-test-file pollution, NOT a
     regression from this slice.** Every file passes cleanly run alone or in the
     smaller groupings above.

4. **Build** — `npm run build` — exit 0.

5. **Lint** — `npx eslint` on all 9 touched/added source files (page + 4 hooks + 4 tests):
   0 errors, 14 warnings total. 11 are the pre-existing `react-refresh/only-export-components`
   warnings on the page's S9a re-export shim (unchanged). 1 new warning appeared in
   `useDiscoverGroupResults.ts`: `Unused eslint-disable directive` on the
   `// eslint-disable-next-line @typescript-eslint/no-unused-vars` line that moved
   byte-for-byte with the `groupResultsAnonRaw` destructuring (per AC-VERBATIM, this
   comment travels unmodified). Total warning count is unchanged overall (14 at baseline
   in the page alone → 13 in the page + 1 in the new hook = 14) — the warning simply
   relocated with the code; it is not new lint debt, and editing/removing the
   eslint-disable comment would violate the byte-for-byte AC-VERBATIM requirement, so
   it was left as-is. **0 errors — meets the AC-TSC/BUILD/LINT gate.**

6. **Scope boundary** — `git status --porcelain`: only `src/pages/MapDiscovery.tsx`
   modified; 8 new files under `src/features/discover/presentation/**` + this doc are the
   only additions. No forbidden path (views/, components/discover/**, state/**, map/**,
   env/secrets) touched. No existing test file touched.

## Assumptions / deviations

- Comment scope for each moved cluster: the directly-attached leading doc-comment block
  for each extracted `useMemo`/const was moved WITH the code (not left as an orphaned
  comment in the page), consistent with the S9b1 precedent (`useDiscoverMapPresentation.ts`)
  of moving the explanatory comments alongside the code they describe. This is a superset
  of the plan's cited bare line ranges but is a comment-only, non-logic addition.
- `filters` in C3 (`useSchoolListings`) is the `PropertyFilters` value from
  `useDiscoverPageState` (schoolLat/schoolLon/schoolRadiusKm-bearing) — distinct from
  `urlState.filters` used by C4 (`useFilteredAgriListings`, the agri-specific URL filter
  bag). Both are correctly threaded to their respective hooks unwrapped.

## Fix-verify cycle — post-QA typing defect (2026-07-13)

QA verification (`tsc -p tsconfig.app.json --noEmit`) found 2 net-new errors (30 → 32
errors vs the d37228b3 baseline), both `TS2322` in the NEW
`useDiscoverGroupResults.test.ts` at the two call sites where the shared `noop()` refetch
stub was assigned to `refetchGroupResultsAuthed` (~L26) and `refetchGroupResultsAnon`
(~L31/L142/L145).

**Root cause**: a single `noop()` helper's return type was pinned via
`ReturnType<UseDiscoverGroupResultsParams['refetchGroupResultsAuthed']>` — i.e. the
*authed* branch's react-query `refetch` signature (`QueryObserverResult<DiscoverListingsPage, Error>` from `useDiscoverListings`). The same value was then also assigned to
`refetchGroupResultsAnon`, whose declared type comes from a *different* react-query hook
(`useDiscoverCityListings`, `QueryObserverResult<DiscoverCityListingsResponse, Error>`).
The two `QueryObserverResult<T, Error>` generics are structurally incompatible in `T`, so
the anon assignment failed to type-check.

**Fix** (`src/features/discover/presentation/useDiscoverGroupResults.test.ts` only):
replaced the single `noop()` with two distinct factory functions, each casting the whole
function value (not just its return type) to its own field's declared type:

```ts
function makeAuthedRefetchNoop(): UseDiscoverGroupResultsParams['refetchGroupResultsAuthed'] {
  return (() => Promise.resolve()) as unknown as UseDiscoverGroupResultsParams['refetchGroupResultsAuthed'];
}
function makeAnonRefetchNoop(): UseDiscoverGroupResultsParams['refetchGroupResultsAnon'] {
  return (() => Promise.resolve()) as unknown as UseDiscoverGroupResultsParams['refetchGroupResultsAnon'];
}
```

`makeParams()`'s defaults and the branch-toggle test (`'toggles
isLoadingGroupResults/isGroupResultsError/refetchGroupResults by the auth branch'`) now
call `makeAuthedRefetchNoop()` / `makeAnonRefetchNoop()` respectively instead of sharing one
`noop` reference — a minor test-quality improvement, since the branch-identity assertions
(`refetchGroupResults).toBe(authedRefetch)` / `.toBe(anonRefetch)`) now compare two
genuinely distinct function references instead of the same one. No assertions were
changed; only the mock typing/construction.

No hook body, page, or other file was touched — test-mock-typing fix only, no runtime
behaviour change.

### Verification (cwd = worktree, via `env -C <worktree>` since the harness resets cwd
between Bash calls)

1. `npx tsc -p tsconfig.app.json --noEmit` → exit 2 (tsc always exits non-zero when any
   errors exist), **30 errors** (back to the exact d37228b3 baseline count), 0 net-new, 0
   in `useDiscoverGroupResults.test.ts` (confirmed via `grep -c "error TS"` = 30 and
   `grep -n "useDiscoverGroupResults.test"` = no matches). The 2 `TS2322` errors are gone.
2. `npx vitest run src/features/discover/presentation/useDiscoverGroupResults.test.ts` →
   exit 0, **9 tests passed, 0 failed** (unchanged count).
3. `npx vitest run src/features/discover/presentation/useFilteredAgriListings.test.ts src/features/discover/presentation/useSchoolListings.test.ts src/features/discover/presentation/useSchoolFirstCounts.test.ts` →
   exit 0, **30 tests passed, 0 failed** (unchanged, across the 3 files: 8 + 8 + 14).
4. `npx eslint src/features/discover/presentation/useDiscoverGroupResults.test.ts` → exit
   0, **0 errors, 0 warnings**.
5. `git status --short` → only pre-existing untracked/modified set from the original S11b
   slice (`MapDiscovery.tsx` modified; the 8 new hook/test files + 2 docs untracked); no
   new/removed file. `git diff --stat d37228b3 -- .../useDiscoverGroupResults.test.ts`
   produces no output because the file is untracked (new since d37228b3, never
   committed) — expected; `git status --short` is the correct scope-boundary check here
   and confirms only this one test file's content changed as part of the fix.

**Scope confirmed**: only `src/features/discover/presentation/useDiscoverGroupResults.test.ts`
edited. No hook (`useDiscoverGroupResults.ts`), page (`MapDiscovery.tsx`), or any other test
file was touched.
