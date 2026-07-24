# Phase 0 — Full Baseline Validation Record

**Recorded against:** `main` @ `475785d0` (post PR #1982 + PR #1984 merge)
**Date:** 2026-07-24
**Purpose:** the accepted-failure fingerprint baseline for the frontend architecture
refactoring roadmap. Every slice (1A onward) must leave this baseline unchanged or
smaller — never larger. New fingerprints appearing in a later slice are a stop condition.

> **Superseded revision note.** An earlier version of this record was captured against
> `main@95d77909` (post PR #1982 only) and reported 43 typecheck errors, incorrectly
> describing the `DiscoverDataSourceProviderProps`-required-`children` cluster within
> those 43 as an *accepted* 8-error baseline entry. On review, that was rejected: the
> cluster was a genuine regression introduced by PR #1978, not pre-existing debt, and
> the correct count was **12 errors across 8 files**, not 8. PR #1984 fixed all 12 sites
> before this baseline was seeded, per the rule that newly introduced regressions must
> be fixed first regardless of whether they only touch test files. This document
> reflects the corrected, post-#1984 baseline. The superseded 95d77909 evidence files
> have been removed from this directory; this revision is the operative one.

Raw command output preserved alongside this file:
- `tsc-baseline-475785d0.txt` — full `npx tsc -p tsconfig.app.json --noEmit` output
- `vitest-baseline-475785d0.txt` — full `npx vitest run --reporter=basic` output
- `eslint-baseline-475785d0.txt` — full `npx eslint .` output (rtk-summarised)
- `build-baseline-475785d0.txt` — full `npx vite build` output

---

## 1. Typecheck — 31 errors, 10 files

```
Command: npx tsc -p tsconfig.app.json --noEmit
Result:  31 errors in 10 files
Top codes: TS2339 (10), TS2345 (10), TS2740 (7), TS2322 (3), TS2352 (1)
```

History: 42/17 at original audit time → 44/19 immediately post-PR #1978 (new TS2554 regression)
→ 43/18 post-PR #1982 (TS2554 fixed, but the 12-error `DiscoverDataSourceProviderProps`
`children`-required cluster from #1978 was still present and had been mis-scoped as 8 errors)
→ **31/10 post-PR #1984** (all 12 `children`-required TS2769 fingerprints removed; `TS2769`
no longer appears anywhere in the output). All 31 remaining errors are pre-existing and
accepted into this baseline.

### Accepted fingerprints (file + TS code, line/col excluded per the roadmap's
### fingerprint-baseline methodology — §1A.2)

| # | File | Code | Category |
|---|---|---|---|
| 1 | `src/components/discover/__tests__/DiscoverRightPanel.agri.ac11.test.tsx` | TS2345 (×2) | test fixture missing `agriAcreage` field |
| 2 | `src/components/discover/panels/AreaSelectedPanel.tsx` | TS2345 | `string` not assignable to `PropertyType` |
| 3 | `src/components/discover/panels/AreaSelectedPanel.tsx` | TS2322 | `string[]` not assignable to `PropertyType[]` |
| 4 | `src/components/map/__tests__/PropertyMap.agri.test.tsx` | TS2740 (×6) | test fixtures missing `PropertyListingWithImages` fields |
| 5 | `src/components/map/PropertyMap.tsx` | TS2740 | fixture-shape drift, same cluster as #4 |
| 6 | `src/hooks/__tests__/useDiscoverPageState.radiusClamp.test.ts` | TS2352 | mock missing `clearAllFiltersAndSearch` action |
| 7 | `src/hooks/useDuplicateManagement.ts` | TS2345 (×2) | `agricultural_land` not in `PropertyType` union (audit §1A.3b) |
| 8 | `src/hooks/usePropertyListings.ts` | TS2345 (×2) | `agricultural_land` union cluster |
| 9 | `src/hooks/usePropertyListings.ts` | TS2339 (×9) | Supabase generated-types drift on `area_key`/`locality` (audit §1A.3a) |
| 10 | `src/hooks/useSimilarListings.ts` | TS2345, TS2322 | `agricultural_land` union + `Json`→`PropertyImage` mismatch |
| 11 | `src/lib/discoverMappers.ts` | TS2322 | `seller_type` union drift (`dealer`/`broker`/`owner`/`builder`) |
| 12 | `src/pages/admin/Listings.tsx` | TS2345 (×2) | `seller_type` union drift, same cluster as #11 |

**Removed by PR #1984 (no longer present, confirmed 0 occurrences of `TS2769` or
`DiscoverDataSourceProviderProps` in the current output):** the 12-site `children`-required
cluster across `DiscoverDataSourceContext.test.tsx`, `useAreaGroups.test.ts`,
`useDiscoverAreas.test.ts` (×2), `useDiscoverCityListings.test.ts` (×2),
`useDiscoverFilteredMarkers.test.ts` (×2), `useDiscoverRegionSummary.test.tsx` (×2),
`useCityLaunchNavigation.test.ts`, `useRegionScopedAreaGroups.test.ts` — introduced by PR
#1978's change to `DiscoverDataSourceContext.tsx` requiring `children`, fixed by moving
`children` into each call site's props object without weakening the production contract.

Slice 1A.2 (typecheck fingerprint gate) should seed its `typecheck-baseline.json` from this
**31/10** count, using the fingerprint scheme `sha1(relativeFilePath + " " + tsErrorCode + " " +
normalisedMessage)` per the roadmap's own specification.

---

## 2. Unit/integration tests — 5 failed, 309/311 files, 4627/4635 tests

```
Command: npx vitest run --reporter=basic
Result:  Test Files  2 failed | 309 passed (311)
         Tests       5 failed | 4627 passed | 3 skipped (4635)
```

Unchanged by PR #1984 (test-only prop-passing fix, no effect on these suites).

### Accepted fingerprints

| File | Test | Error | Status |
|---|---|---|---|
| `src/components/map/__tests__/PropertyMap.jitterDiagnostic.test.tsx` | 4 tests under "Issue #1801 — camera consolidation fixes the multi-call jitter" | `TypeError: map.getSize is not a function` at `src/components/map/AreaMarkerLayer.tsx:486` | **Pre-existing.** Documented in the original audit (§2.9) as an incomplete Leaflet mock. Confirmed unrelated to PR #1982/#1984's diffs. |
| `src/hooks/useCityLaunchNavigation.test.ts` | `useNavigationTree > fetches GET .../navigation/tree in preview mode and Zod-validates the response` | `AssertionError: expected false to be true` (`isSuccess` never becomes `true`) | **Pre-existing.** Confirmed identical failure on a disposable clean-`main` worktree during PR #1982's qa verification pass. |

Both are accepted into this baseline as documented pre-existing debt, per explicit user
decision during Phase 0A — not fixed in this stabilisation slice.

**Fixed by PR #1982, no longer present:**
- `tests/discover/panels-parity.test.tsx` — 2 assertions (was 8/10, now 10/10)
- `src/pages/admin/__tests__/CityLaunchPreview.test.tsx` — 4 tests (was 14/18, now 18/18)

---

## 3. Lint — 11 errors, 92 warnings, 103 problems, 54 files

```
Command: npx eslint . -f json
Result:  ESLint: 11 errors, 92 warnings in 54 files
Top rules: react-refresh/only-export-components (56×), @typescript-eslint/no-explicit-any (11×),
           react-hooks/exhaustive-deps (8×)
```

Unchanged by PR #1984 (verified — identical counts to the pre-#1984 capture). Original audit
baseline: 97 problems (11 errors, 86 warnings). Current: 103 (11 errors, 92 warnings) — +6
warnings, +0 errors, attributable to new files shipped by PR #1978/#1982, not a regression from
this stabilisation work. Roadmap §1B.3's `--max-warnings` / non-source-path `ignores` items
remain unimplemented.

---

## 4. Production build — succeeds, unminified as before

```
Command: npx vite build
Result:  ✓ built in 7.35s
Entry chunk: dist/assets/index-CAlbNN_A.js  1,534.25 kB │ gzip: 299.34 kB
```

Unchanged by PR #1984 (test-only diff). Consistent with the original audit's 1,529 kB / 298 kB
gzip entry chunk. `vite.config.ts`'s `minify: false` is still in effect — §1A.1 (enable
minification) remains unimplemented and is the recommended first Slice 1A item.

---

## 5. Dependency-boundary / architecture checks

No dedicated import-boundary lint rule exists yet (roadmap §1B.2 — not yet implemented). The
one known inverted dependency (`DiscoverMapCanvas.tsx:37` → `@/pages/MapDiscovery`) is
unchanged and remains an open Slice 1B.2/2.1 item.

---

## 6. CI infrastructure note

GitHub Actions CI is currently non-functional repository-wide due to a billing/spending-limit
block (confirmed via check-run annotation: *"The job was not started because recent account
payments have failed or your spending limit needs to be increased"* — zero steps executed on
any CI job). Unrelated to code correctness. **Local validation (this document's commands) is
the operative baseline and merge gate** until CI billing is resolved (outside this
initiative's scope).

---

## Summary — what "unchanged or improved" means for Slice 1A onward

| Gate | Baseline to hold or shrink |
|---|---|
| Typecheck | **31 errors / 10 files** (fingerprinted list above) |
| Vitest | 5 failed tests / 2 failed files (2 named fingerprints above) |
| ESLint | 11 errors / 92 warnings / 103 problems / 54 files |
| Build | succeeds; entry chunk ≤ ~1,534 kB / ~299 kB gzip until §1A.1 lands |
| Local E2E smoke (pre-push) | must stay green |

Any slice PR that increases any of these counts, or introduces a fingerprint not in this
list, is a stop condition per the roadmap's baseline rule.
