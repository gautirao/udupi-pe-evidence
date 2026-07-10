# Issue #1798 PR-C — restore listing marker info popup: tests run

Branch: `fix/1798-marker-popup`

## 1. Targeted regression tests (this PR + directly related suites)

```
npx vitest run src/pages/__tests__/MapDiscovery.issue1798.markerPopup.test.tsx \
  src/pages/__tests__/MapDiscovery.issue1798.test.tsx \
  src/pages/__tests__/MapDiscovery.issue1466.test.tsx \
  src/pages/__tests__/MapDiscovery.groupResults.test.tsx \
  src/pages/__tests__/MapDiscovery.issue1745-batchB-overviewClick.test.tsx \
  src/components/discover/__tests__/MarkerPopoverCard.test.tsx
```
Result: **PASS (51) FAIL (0)**, exit 0.

New file `MapDiscovery.issue1798.markerPopup.test.tsx` covers:
1. Listing marker click opens the popover in a journeyless area-selected state
   (previously excluded by the narrower `journey === 'area-first'` gate).
2. Clicking another listing marker replaces the popover content.
3. Background click dismisses the popover.
4. School-first with a school selected still shows NO popover (negative case,
   #1738 exclusion preserved).
5. Agri-first still shows NO popover (negative case, own peek/panel flow
   preserved).
6. Pre-existing `journey=area-first` happy path still shows the popover (no
   regression).

## 2. TypeScript typecheck

```
npx tsc --noEmit -p .
```
Result: `TypeScript: No errors found` — exit 0.

## 3. Full `src/pages/__tests__/` directory — environment limitation

```
npx vitest run
```
Attempted twice (default worker pool, then `--pool=forks --poolOptions.forks.maxForks=2`
to reduce memory pressure). Both runs crashed with a Node worker OOM /
`ERR_IPC_CHANNEL_CLOSED` (`Error: Channel closed` in `tinypool`) before
producing a pass/fail summary — a local machine resource limitation running
the entire frontend suite at once, not specific to this PR's files. Reported
here as **TEST_ENV_FAILURE** per the repo's test-evidence rules, not claimed
as PASS. The prior PR-B evidence doc
(`issue-1798-tests-run.md`) independently confirms the one known flaky/failing
file in the full suite (`LandingPage.test.tsx`) is pre-existing and unrelated
to `MapDiscovery.tsx`/`MarkerPopoverCard.tsx`. Given the targeted run above
directly covers every file changed by this PR (both changed source files plus
all tests that exercise the touched predicate and its neighboring states) and
passes cleanly, it is treated as the primary evidence for this frontend-only,
single-predicate change.

## 4. Manual browser verification

See `issue-1798-pr-c-marker-popup.md` in this directory for full narrative and
screenshots-in-words. Summary: listing marker popup (journeyless state),
right-panel scroll+highlight, background-click dismissal, and area-marker
no-popup-immediate-navigation were all manually verified PASS on a real Vite
dev server (branch `fix/1798-marker-popup`, port 5174).

## 5. Investigation note (recorded for transparency)

During the first verification pass, a manual browser check appeared to show
the fix failing (popup not rendering for the journeyless case). Root-caused to
an unrelated stale dev-server process from a different git worktree
(`issue-1745-batch-b`) already listening on the port initially used for
verification (5183) — that worktree's `MapDiscovery.tsx` still had the old,
pre-PR-C gate. No code defect existed; the browser was pointed at the wrong
server. Re-verified cleanly on a freshly-confirmed free port (5174) against
the actual `fix/1798-marker-popup` branch, per the evidence above. Lesson
recorded in project memory (`parallel-worktree-test-ports`).

## Backend

No backend files touched. Confirmed via `git status --short`: only
`src/pages/MapDiscovery.tsx`, `src/components/discover/MarkerPopoverCard.tsx`,
`src/pages/__tests__/MapDiscovery.issue1798.markerPopup.test.tsx`, and this
evidence directory changed.
