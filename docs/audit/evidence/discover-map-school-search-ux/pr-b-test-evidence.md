# Issue #1798 PR-B — area-marker degradation — QA test evidence

Worktree: `issue-1798-discover-map-ux` (branch `issue-1798-pr-b-area-marker-degradation`)
Reserved ports: fe=5196, be=8096

## Files authored

| File | Purpose |
|---|---|
| `src/components/map/__tests__/AreaMarkerLayer.test.tsx` (extended) | Dense-group degradation, forced-always promotion, cluster-click contract, `onMarkersComputed` wiring |
| `src/components/discover/panels/__tests__/AreaGroupSelectedPanel.shownOfTotal.test.tsx` (new) | "Showing X of N areas" note render contract + `onAreaHover` + search pass-through |
| `tests/discover/marker-popover-1798-group-results-gating.test.ts` (new) | `isGroupResultsPopoverEligible` / `isSelectedGroupState` gating, append-only alongside the untouched #1738 file |
| `e2e/discover/thanisandra-hennur-belt-marker-degradation.spec.ts` (new) | Thanisandra-Hennur Belt (29-area) stress scenario, authored + collected, NOT executable in this environment (see below) |

No production source files were modified.

## Required-evidence-item status

**1. Popup restoration in group-results state + #1738 gate not regressed**
STATUS: DONE (component-level).
`tests/discover/marker-popover-1798-group-results-gating.test.ts` (7/7 pass) locks down
`isGroupResultsPopoverEligible` (MapDiscovery.tsx L2780-2782) and `isSelectedGroupState`
(L2742-2743): area-first + resolved `groupResults` flag → eligible; area-first + focused
group with no area selected (Level-2 dense-group state) → eligible; school-first/agri-first
→ not eligible; the pre-existing `tests/discover/marker-popover-1738-gating.test.ts` is
**byte-for-byte unmodified** and reverified green (5/5) in the same run.
Live-browser confirmation of the actual popup open/dismiss is authored as E4 in the E2E
spec but could not execute in this environment (see NOT_RUN reason below).

**2. Area-marker density adjustments (dense group → capped reps + clusters, not all-N labels)**
STATUS: DONE (component-level, primary durable evidence).
`AreaMarkerLayer.test.tsx`'s new "dense-group degradation" describe block renders a
29-area fixture (6 spatial clusters spanning all 4 quadrants) through the real
`AreaMarkerLayer` + real `computeAreaMarkers` bucketing (only `L.marker`/`L.divIcon`/
`useMap` are mocked): asserts ≤12 representative labelled pins (not 29), at least one
area-cluster chip with an AREA-count label (`+N areas`, regex-matched, never a summed
property count), clicking a cluster chip does NOT call `onAreaClick` (fires
`onAreaClusterClick` + `map.fitBounds` instead), clicking a representative pin still
calls `onAreaClick`, and `enableDegradation=false` still renders one full pin per area
(regression guard for every other existing call site).

**3. E2E results for the Thanisandra-Hennur Belt scenario**
STATUS: AUTHORED, NOT_RUN — see below.

## Commands run + exact results

```
$ npm --prefix <worktree> test -- \
    tests/discover/marker-popover-1738-gating.test.ts \
    src/components/map/__tests__/AreaMarkerLayer.test.tsx \
    src/lib/map/areaMarkerBucketing.test.ts \
    src/components/discover/panels/__tests__/AreaGroupSelectedPanel.shownOfTotal.test.tsx \
    tests/discover/marker-popover-1798-group-results-gating.test.ts \
    --run

 ✓ tests/discover/marker-popover-1798-group-results-gating.test.ts (7 tests)
 ✓ src/lib/map/areaMarkerBucketing.test.ts (20 tests)
 ✓ tests/discover/marker-popover-1738-gating.test.ts (5 tests)
 ✓ src/components/map/__tests__/AreaMarkerLayer.test.tsx (27 tests)
 ✓ src/components/discover/panels/__tests__/AreaGroupSelectedPanel.shownOfTotal.test.tsx (8 tests)

 Test Files  5 passed (5)
      Tests  67 passed (67)
exit code: 0
```

Breakdown: AreaMarkerLayer.test.tsx = 17 pre-existing (untouched, still green) + 10 new
(#1798 PR-B degradation/forced-always/cluster-click/onMarkersComputed). All other files
in the list above are entirely new.

### Known pre-existing gap (not a regression, not touched)

`MapDiscovery.test.tsx`, `AreaGroupsLandingPanel.test.tsx`, and the pre-existing
`AreaGroupSelectedPanel.test.tsx` fail at **module load** with `supabaseUrl is required`
when run via `npx vitest`/`npm test` in this worktree — reproduced directly:

```
$ npm --prefix <worktree> test -- src/components/discover/panels/__tests__/AreaGroupSelectedPanel.test.tsx --run
FAIL  .../AreaGroupSelectedPanel.test.tsx
Error: supabaseUrl is required.
 at validateSupabaseUrl node_modules/@supabase/supabase-js/...
 at src/integrations/supabase/client.ts:11:25
```

Root cause: this worktree has no `.env`/`VITE_SUPABASE_URL`. Any test file that
transitively imports `src/lib/api.ts` → `src/integrations/supabase/client.ts` (which
calls `createClient(...)` eagerly at module scope) throws before any test body runs.
`AreaGroupSelectedPanel.tsx` → `ScopedSearch` → `useSchoolSearch` → `@/lib/api` is that
chain. **Confirmed to be a project-env-loading gap, not a #1798 PR-B regression** — it
reproduces identically on the pre-existing test file with zero PR-B changes.

Worked around for new tests (not by editing implementation code): the new
`AreaGroupSelectedPanel.shownOfTotal.test.tsx` calls `vi.mock('@/hooks/useSchoolSearch', ...)`
**before** importing the panel, so Vitest never evaluates the real `useSchoolSearch`
module (and therefore never touches the real Supabase client). This is a standard
test-isolation technique, not a change to any production file, and the panel's real
`ScopedSearch`/`onSearchQueryChange`/`onAreaHover` render paths are still exercised for
real — only the school-search network hook itself is stubbed.

## E2E — RAN, then root-caused as environment-blocked

Unlike a pure "could not start", the spec was actually attempted end-to-end:

1. Started `npx vite --port 5196` in the worktree (bg) — server came up clean, no
   startup errors in the Vite log.
2. `PLAYWRIGHT_BASE_URL=http://localhost:5196 npx playwright test
   e2e/discover/thanisandra-hennur-belt-marker-degradation.spec.ts --project=full`
   ran real Chromium and executed real HTTP/`page.route` stubbing — **all 6 tests
   failed** waiting on `getByTestId('area-group-level2')`/`area-cluster-marker`.
3. Screenshots showed a **blank white page** (`#root` empty in the served HTML).
4. Direct console-capture (`page.on('pageerror', ...)`) against the same dev server
   isolated the exact failure:

   ```
   [pageerror] supabaseUrl is required. Error: supabaseUrl is required.
       at validateSupabaseUrl .../@supabase_supabase-js.js
       at new SupabaseClient .../@supabase_supabase-js.js
       at createClient .../@supabase_supabase-js.js
       at http://localhost:5196/src/integrations/supabase/client.ts:7:25
   ```

**Conclusion**: the ENTIRE app fails to boot in this worktree at runtime without
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — the exact same root cause as the Vitest
module-load gap above, now confirmed at the browser-runtime layer too. This matches the
`tests/discover/marker-popover-1738-gating.test.ts` file header's own prior finding
("Invalid hook call... every page, not just Discover" when bringing up this worktree's
dev server) and the `.claude` mandate to **never create `.env`/`.env.e2e`** and **never
run against the shared hosted Supabase**. There is no compliant way to get this specific
worktree's live app to render in this session.

**STATUS: NOT_RUN** (environment-blocked — confirmed root cause, not a guess; not a
Batch B / #1798 regression). The E2E spec is syntactically valid (`tsc --noEmit` clean)
and collects correctly under Playwright (`--list` → 6 tests found, correct
`@integration-ui` tag, correct file/line mapping). It is ready to run unmodified as soon
as this worktree has a working Supabase env (e.g. via the project's normal
`scripts/run-e2e-local.sh` + `.env.e2e` on a machine/session where that file legitimately
exists) — it needs no further changes.

Cleanup performed: dev server killed (`lsof -ti:5196 | xargs kill`), the one-off
console-check script removed from the worktree, `test-results/`/`playwright-report/`
left untouched (gitignored, not part of the allowed evidence paths).

## New vs pre-existing failure split

- **New failures caused by this work: NONE.** Every new test file passes (67/67 across
  the 5 files listed above).
- **Pre-existing, unrelated to this issue:** `MapDiscovery.test.tsx`,
  `AreaGroupsLandingPanel.test.tsx`, `AreaGroupSelectedPanel.test.tsx` (module-load
  Supabase env gap, documented above, reproduces identically without any #1798 PR-B
  change).
- **E2E: NOT_RUN**, root-caused to the same pre-existing env gap (no `.env` in this
  worktree) — not a code defect, not something this task is permitted to fix (no
  `.env`/`.env.e2e` creation allowed).

## What's automated vs manual vs NOT_RUN

- **Automated (ran, passed):** all 4 new/extended unit+component test files — 67/67.
- **Manual browser verification:** NONE performed (no live app render was achievable in
  this environment — see above). No PASS is claimed for anything not actually observed.
- **NOT_RUN:** the E2E spec (`thanisandra-hennur-belt-marker-degradation.spec.ts`) —
  authored, syntactically verified, Playwright-collected, but blocked from execution by
  the worktree's missing Supabase env, confirmed via direct root-cause investigation
  (not assumed).

## Coverage gaps / follow-up

- The E2E spec's exact pin-count assertions (`≤15`, `>0`, `<29`) are necessarily
  tolerant of real browser/zoom variance since they were never actually exercised
  against a live app in this session — once run in a working env, the fixture's 6-cluster
  layout should reliably produce ~6 representative pins + several cluster chips, but this
  has not been empirically confirmed against real Leaflet zoom/projection.
- `E7` (citySlug scoping) asserts the school-search request's `city` query param; this is
  the same contract already covered structurally by `AreaGroupSelectedPanel.tsx`'s
  `citySlug={city}` prop threading (confirmed by reading `AreaGroupsLandingPanel.tsx`
  L604), but has no direct unit-level assertion in this PR's new files — only the E2E
  spec (NOT_RUN) exercises it end-to-end.
