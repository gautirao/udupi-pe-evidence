# Issue #1798 — Hebbal add-school consistency: tests run

Branch: `fix/1798-hebbal-add-school-consistency`

## 1. TypeScript typecheck

```
npx tsc --noEmit -p .
```
Result: `TypeScript: No errors found` — exit 0. Ran twice (pre- and post-test-file-addition), same result both times.

## 2. New regression tests (this PR)

```
npx vitest run src/pages/__tests__/MapDiscovery.issue1798.test.tsx
```
Result: **PASS (4) FAIL (0)**

Covers:
1. Area-first "Add school" on the exact journeyless repro URL (no `journey=` param) shows the same 2 Hebbal schools as school-first.
2. School-first Hebbal shows the same 2 schools (comparison route, confirms unchanged).
3. Area-first "Add school" also works when `journey=area-first` is present explicitly (pre-existing #1157 path stays intact — no regression).
4. An area with zero schools still shows the clean "No schools found" empty state after clicking "Add school" (`EMPTY_AREA_KEY` case) — no all-city leakage; `Hebbal Public School` / `Hebbal Lake Academy` assert absent.

Encoded-areaKey decoding (`IN%7CKA%7CBengaluru%7CHebbal`) is exercised implicitly by every test above — all URLs are built via `MemoryRouter` with `encodeURIComponent(HEBBAL_AREA_KEY)`, mirroring the real repro URL, and all assertions depend on the decoded `areaKey` reaching `useSchoolsByArea` correctly.

`Bengaluru` vs `Bangalore` naming: confirmed NOT a root-cause split — the `areaKey` (`IN|KA|Bengaluru|Hebbal`) is identical in both journeys' mock data and URLs; `city=bangalore` is a separate, already-shared slug. No test needed to add a naming-divergence case because there is no naming-divergence code path to cover (see investigation notes in `issue-1798-hebbal-add-school-consistency.md`).

## 3. Existing school/panel regression suite (no regressions)

```
npx vitest run src/pages/__tests__/MapDiscovery.school-pill.test.tsx src/pages/__tests__/MapDiscovery.issue1064.test.tsx src/pages/__tests__/MapDiscovery.groupResults.test.tsx src/components/discover/panels/__tests__/SchoolsInAreaPanel.test.tsx src/components/discover/panels/__tests__/SchoolsInAreaPanel.school-first-redesign.test.tsx src/components/discover/__tests__/SchoolRadiusMapOverlay.test.tsx src/pages/__tests__/MapDiscovery.issue1798.test.tsx
```
Result: **PASS (87) FAIL (0)**

## 4. Full `src/pages/__tests__/` directory

```
npx vitest run src/pages/__tests__/
```
Result: **PASS (292) FAIL (1)**

The 1 failure is `LandingPage.test.tsx` (`TestingLibraryElementError: found multiple elements with role="button"`, unrelated file, no relationship to schools/discover/MapDiscovery). Confirmed **pre-existing**: re-ran the identical command with this branch's changes `git stash`-ed out (i.e. against the pre-fix baseline) — same failure, same error, same location. Restored the stash immediately after confirming. Not caused by this PR; not touched by this PR.

```
git stash
npx vitest run src/pages/__tests__/LandingPage.test.tsx   # same failure on baseline
git stash pop
```

## 5. Manual browser verification (user-approved)

Dev server: pre-existing local Vite server on `http://localhost:5174` (already running against this working tree; branch-checkout changes are picked up by Vite's filesystem watcher, no restart needed).

- **Area-first repro URL** (`.../discover?city=bangalore&lat=13.04500&lon=77.60000&zoom=14&scope=north&groupId=north-growth&areaKey=IN%7CKA%7CBengaluru%7CHebbal`): loaded area-selected Hebbal panel correctly; clicked "Add a school in this area"; URL became `...&schoolPicking=1` (no `journey=` — confirmed exact journeyless shape from the bug report); panel updated to "Schools in Hebbal · Area-first — Showing 2 of 2 schools" listing Orchids The International School and Vivekananda ORCHIDS The International School. **MANUAL_PASS.**
- **School-first comparison URL** (`.../discover?city=bangalore&lat=13.04503&lon=77.60004&zoom=14&scope=north&journey=school-first&groupId=north-growth&areaKey=IN%7CKA%7CBengaluru%7CHebbal`): "Find homes near a school · School-first" panel, "Schools in Hebbal" card shows 2 schools / 4 homes for sale, same two school names. **MANUAL_PASS.**

Both journeys now agree exactly for the same `city/scope/groupId/areaKey` identity. Labelled `MANUAL_PASS` per this repo's evidence-quality rule — visually confirmed in a running browser, not an automated assertion (the automated equivalent is the Vitest suite in section 2, which is what CI/regression protection relies on).

## Backend

No backend files were touched by this fix (confirmed via `git diff --stat` below); backend tests were not run because nothing backend-side changed.

```
git diff --stat main...fix/1798-hebbal-add-school-consistency
```
See PR diff — only `src/pages/MapDiscovery.tsx` (fix), `src/pages/__tests__/MapDiscovery.issue1798.test.tsx` (new test), and this evidence directory changed.
