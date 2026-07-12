# TypeScript Compiler Baseline — Investigation Report (issue #1850)

## 1. Reproduction (authoritative)

- **Command:** `node node_modules/.bin/tsc --noEmit -p tsconfig.app.json` (run from worktree root)
- **Worktree:** `issue-1850-typescript-baseline-restoration` (fresh off `origin/main`)
- **Commit SHA:** `7aed80eb46d61dbf5f68873bbaeb94231037b4ac`
- **TypeScript version:** 5.8.3
- **Exit code:** 2
- **Total errors:** **121** across **45 unique files** (matches assignment baseline exactly)
- No compiler settings were weakened to produce this count; the run used the repo's own `tsconfig.app.json` unchanged.

Raw output: `tsc-baseline-raw.txt`. Machine inventory: `baseline-inventory.json` / `baseline-inventory.csv`.

## 2. Error-code frequency

| Count | Code | Meaning |
|---|---|---|
| 20 | TS2556 | Spread argument must be a tuple / rest parameter |
| 19 | TS2352 | Unsafe conversion between non-overlapping types |
| 18 | TS2339 | Property does not exist on type |
| 15 | TS2345 | Argument type not assignable to parameter |
| 15 | TS2322 | Type not assignable |
| 9  | TS2353 | Object literal specifies unknown property |
| 7  | TS2740 | Type missing many properties from target |
| 7  | TS2554 | Wrong argument count |
| 5  | TS2769 | No overload matches call |
| 2  | TS2307 | Cannot find module |
| 2  | TS2589 | Type instantiation excessively deep |
| 1  | TS2561 | Unknown property (with suggestion) |
| 1  | TS2367 | Comparison of non-overlapping types |

## 3. App-area grouping

| Count | Area |
|---|---|
| 28 | test: map (`src/components/map/__tests__`, `*.test.tsx`) |
| 23 | test: discover (`src/components/discover/**/__tests__`) |
| 20 | src: hooks (`src/hooks/*.ts`) |
| 19 | test: MapDiscovery pages (`src/pages/__tests__/MapDiscovery.*`) |
| 10 | src: pages/admin (`src/pages/admin/*.tsx`) |
| 7  | test: hooks |
| 6  | src: discover panels |
| 4  | src: map |
| 2  | test: pages |
| 1  | src: broker |
| 1  | src: lib |

~83 of 121 errors (69%) are in **test files**; ~38 are in production `src`.

## 4. Root-cause clusters & taxonomy classification

| # | Cluster | Codes | ~Count | Taxonomy | Runtime risk | #1824/#1838 ownership |
|---|---|---|---|---|---|---|
| A | Vitest-3 spread-mock `(...args: unknown[]) => mock(...args)` | TS2556 | 20 | test-env typing / config-version incompat; **one root cause duplicated inline** per file | none (test) | **17 in active #1824** (`MapDiscovery.*.test.tsx`) → DEFER; ~3 non-owned |
| B | React-Query v5 mock-result cast (`as UseQueryResult<...>` missing union fields) | TS2352 | 13 | incomplete mock types | none (test) | **isolated** (SchoolBrowsePanel.error-states.test, SchoolsInAreaPanel.test) |
| C | PropertyType enum drift (`villa`/`commercial_building`/`agricultural_land` vs narrowed unions) | TS2345/2322/2367/2740 | ~30 | **real contract mismatch / DTO drift** | medium (prod hooks + panels) | cross-cutting; some discover-adjacent |
| D | Stale test fixtures (unknown object-literal props: `lat`/`city`/`area_count`/`category`/`property_type`) | TS2353/2561 | 10 | stale test-fixture | none (test) | mixed |
| E | Leaflet / MarkerCluster / `Default` icon mock casts | TS2352 | 6 | incomplete mock types / unsafe cast | low | map (some src: AddressPicker, PropertyMap) |
| F | `useListingImages` test signature drift (3rd arg added) | TS2554 | 7 | stale test-fixture (signature drift) | none (test) | **isolated** (broker/hooks) |
| G | testing-library `exact` option not in `ByRoleOptions` | TS2769 | 5 | test-env typing (lib API drift) | none (test) | MapFilters.test (not #1824) |
| H | `PropertyListingWithImages` incomplete mock (missing ~30 props) | TS2740 | 7 | incomplete mock types | none (test) | PropertyMap.agri.test |
| I | Stale import path `@/types/discover` (module does not exist) | TS2307 | 2 | **stale import-export** | low (real src compile break) | **isolated** (AreaGroupSelectedPanel, AreaGroupsLandingPanel) |
| J | Supabase `SelectQueryError` — `area_key`/`locality` not on `property_listings` | TS2339 | 10 | **DB-generated type drift / real signal** | **high** (prod query) | src hook `usePropertyListings` |
| K | Admin `raw_posts`-derived type missing `status`/`rera_number`/`reraValid` | TS2339/2345 | 9 | **real contract mismatch** | medium (admin prod) | `src/pages/admin/Listings.tsx` |
| L | `Type instantiation excessively deep` (Supabase query depth) | TS2589 | 2 | generated-type depth | low | usePropertyListings, PendingListings |

(Cluster boundaries are narrative; per-error exact data is in the CSV/JSON. Some errors span clusters C/D/E/H.)

### Real-signal (product/runtime-relevant) items to surface, not silently fix
- **Cluster J** (`area_key`/`locality` on `SelectQueryError`): the Supabase typed query selects columns the generated types say are absent on `property_listings`. Either the generated types are stale or the query references a wrong column — a genuine signal requiring supabase/backend involvement. **Defer to a dedicated slice.**
- **Cluster C** (PropertyType enum drift): the canonical `PropertyType` union and several narrower/DB-derived unions have diverged (`villa`, `commercial_building`, `agricultural_land`). Fixing this is a real contract-alignment task, not mechanical. **Defer; may need architect.**
- **Cluster K** (admin `raw_posts` typing): admin listing rows are typed from an inferred `raw_posts` shape missing product fields. **Defer.**

## 5. `@/types/discover` finding (Cluster I)

`DiscoverJourney` is canonically exported from `@/hooks/useDiscoverUrlState` (line 82) and imported from there by every consumer **except** `AreaGroupSelectedPanel.tsx` and `AreaGroupsLandingPanel.tsx`, which import from `@/types/discover` — a module that does not exist (`src/types/` contains only `brokerAreaInsights.ts` and `listingQuality.ts`). Fix = repoint the two imports to `@/hooks/useDiscoverUrlState`. Trivial, real-src.

## 6. History pass

- **No `tsc --noEmit` gate exists anywhere.** CI (`.github/workflows/ci.yml` → `frontend` job) runs only `npm run lint` (eslint), `npm run test` (vitest, esbuild/swc transform — no type-check), and `npm run build` (`vite build`, esbuild — transpile only, no type-check). The `.githooks/pre-push` hook does not run tsc either.
- This explains why the build/tests pass while `tsc` reports 121 errors, and why the baseline drifted: nothing ever enforced full program type-checking, so type errors accumulated across many feature PRs (test files reference issues #1064–#1821).
- A precise "last green tsc" commit is not worth bisecting (per assignment guidance): with no enforcing gate, the baseline has been continuously red; several clusters share a single root cause (e.g. vitest-3 mock signature tightening, react-query v5 result shape), so the drift is systemic rather than traceable to one regression commit.
- **#1838 (EditListing) overlap: NONE** — no error file is an `EditListing` file.
- **#1824 (MapDiscovery) overlap:** the 17 `src/pages/__tests__/MapDiscovery.*.test.tsx` TS2556 errors are in actively-decomposed test files (open PR #1851, recent slices #1841–#1848 edit these). **Classify + defer; do not race.**

## 7. Recommended first slice

**Cluster B — React-Query v5 mock-result typing in Discover panel tests** (13 errors; `SchoolBrowsePanel.error-states.test.tsx` ×12 + `SchoolsInAreaPanel.test.tsx` ×1). Rationale: single cohesive root cause, test-only (zero buyer/broker runtime risk), fully isolated from #1824/#1838, ~11% of the baseline, highly reviewable, and it establishes a reusable typed React-Query mock helper that later test-typing slices (F, G, H) can reuse. Real-signal clusters (C/J/K) are deferred to later, care-heavy slices with the appropriate specialists.
