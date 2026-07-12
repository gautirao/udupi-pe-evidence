# Issue #1850 Slice 3 — TypeScript Compiler-Baseline Restoration (TEST-ONLY)

Branch: `issue-1850-slice3-test-typing`
Scope: Option A (PLAN_REVIEW-approved). Fixes Cluster F, Cluster G, and the
TS2352 portion of Cluster H only. All Cluster H TS2740 errors (agri/house
fixture shape gaps) and the two TS2740 errors in
`PropertyMap.agriPolygon.test.tsx` are DEFERRED — out of scope for this
slice, entangled with a production `PropertyType` union gap.

## Before

Command:
```
node node_modules/.bin/tsc --noEmit -p tsconfig.app.json
```
Exit code: 2
Error count (`grep -c "error TS"`): **106**

Relevant baseline errors fixed in this slice:
- `src/hooks/__tests__/useListingImages.test.ts` — 7× TS2554 (lines 204, 240, 268, 297, 346, 393, 424)
- `src/components/map/__tests__/MapFilters.test.tsx` — 5× TS2769 (lines 101, 124, 125, 126, 127)
- `src/components/map/__tests__/PropertyMap.agri.test.tsx` — 3× TS2352 (lines 162, 190, 213)

Total fixed: 15 errors.

## Changes

### Cluster F — useListingImages.test.ts (TS2554, 7 errors)
`ApiError` constructor requires a 3rd `body: unknown` argument
(`src/lib/api.ts`, unchanged). Added a `null` third argument to each of the
7 `new ApiError('<msg>', <status>)` call sites. No assertion touched — the
tests only assert on toast/status/no-PUT/no-register side effects, never on
the error body.

### Cluster G — MapFilters.test.tsx (TS2769, 5 errors)
Removed the invalid `exact: true` option from 5 `getByRole(role, { name: <string> })`
calls (lines 101, 124-127). A string `name` is already an exact
accessible-name match in Testing Library, so this is behaviour-preserving.
No `name` values changed.

### Cluster H (TS2352 only) — PropertyMap.agri.test.tsx (3 errors)
Changed the leaflet `MarkerClusterGroup` partial-mock cast from
`as ReturnType<typeof L.markerClusterGroup>` to
`as unknown as ReturnType<typeof L.markerClusterGroup>` at the 3 sites
(lines 162, 190, 213 in the original file). This is the idiomatic
double-assertion for mocking a complex third-party class and is the ONLY
`as unknown as`-style cast introduced in this slice. No domain fixture
(agriListing/houseListing) cast was touched.

The 4 agri-fixture TS2740 errors (lines 145, 165, 240, 251) and 2
house-fixture TS2740 errors (193, 217) in this same file are DEFERRED per
Option A and remain unchanged after this slice.

## After

Command:
```
node node_modules/.bin/tsc --noEmit -p tsconfig.app.json
```
Exit code: 2
Error count (`grep -c "error TS"`): **91** (106 - 15 = 91, confirmed exact)

Per-file residual check:
- `useListingImages.test.ts`: 0 errors
- `MapFilters.test.tsx`: 0 errors
- `PropertyMap.agri.test.tsx`: 6 errors remaining, ALL TS2740 (lines 145, 165,
  193, 217, 240, 251) — matches the expected deferred set exactly. No TS2352
  remains in this file.
- No new error appeared in any other file; diffing the two full error
  listings shows every remaining error line is a pre-existing baseline
  error, only the 15 targeted lines were removed.

## Targeted vitest runs

Command:
```
vitest run src/hooks/__tests__/useListingImages.test.ts \
  src/components/map/__tests__/MapFilters.test.tsx \
  src/components/map/__tests__/PropertyMap.agri.test.tsx \
  --root <worktree>
```
(VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_API_BASE_URL
supplied inline as placeholders; all hooks/network mocked, no live calls.)

Result: exit 0.
```
✓ src/hooks/__tests__/useListingImages.test.ts (11 tests)
✓ src/components/map/__tests__/PropertyMap.agri.test.tsx (6 tests)
✓ src/components/map/__tests__/MapFilters.test.tsx (35 tests)

Test Files  3 passed (3)
     Tests  52 passed (52)
```

Test counts match pre-change suite sizes (no test added/removed/renamed;
no `.skip`/`.only`).

## git status --porcelain (worktree)

```
 M src/components/map/__tests__/MapFilters.test.tsx
 M src/components/map/__tests__/PropertyMap.agri.test.tsx
 M src/hooks/__tests__/useListingImages.test.ts
```

Diff scope confirmed limited to the 3 approved test files plus this
evidence file under `docs/audit/evidence/typescript-baseline-restoration/`.
No production file (`src/lib/api.ts`, `src/hooks/usePropertyListings.ts`,
`src/components/map/PropertyMap.tsx`) and no
`PropertyMap.agriPolygon.test.tsx` was touched. No `PropertyType` union
widening occurred.
