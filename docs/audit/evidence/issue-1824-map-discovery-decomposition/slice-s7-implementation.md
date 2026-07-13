# Issue #1824 — Slice S7 Implementation Note (camera panner/tick orchestration R9 → useDiscoverCameraOrchestration)

Stage B execution record. Branch `issue-1824-s7-camera-orchestration` off `origin/main @ c4d6ee2d`. HIGH risk (the camera-owner surface). Companion: `slice-s7-design.md`.

## What shipped

- NEW `src/features/discover/state/useDiscoverCameraOrchestration.ts` — the R9 camera hook. FLAT return, inject-not-import (type-only `DiscoverUrlState`; no runtime `useDiscoverUrlState`/`useDiscoverPageState`/`useDiscoverJourneyTransitions`).
  - Moved VERBATIM (byte-for-byte, statement order + dep arrays + one-shot ref-advance placement preserved — code-reviewer git-show confirmed): schoolFocusTick + writer effect (journey + lat/lon guard, tick-not-in-deps); schoolMarkerFocusTick + listingsReadyKey memo (`${selectedSchoolId}_${urlState.radiusKm ?? 0}_ready`) + lastFittedListingsKeyRef fit-once (#1547); group-fit effect + prevGroupIdRef/prevAreaKeyRef (readiness gate before ref advance, #1815; areaKey!==null precedence, #1821); scope-fit effect + prevScopeRef; agri-fit effect + agriGroupFocusBounds (null-coord filter, locality-priority, clear-on-empty). Both eslint-disable suppressions (group/scope) carried verbatim.
  - FLAT return: `{ schoolFocusTick, schoolMarkerFocusTick, schoolFocusLat, schoolFocusLon, agriGroupFocusBounds }` (see DEV-1: mapBbox/handleBoundsChange NOT included).
- NEW `src/features/discover/state/useDiscoverCameraOrchestration.test.tsx` (14 renderHook unit tests).
- NEW `src/pages/__tests__/MapDiscovery.issue1824-s7.camera.test.tsx` (3 props-log tests: schoolFocusTick guard + AC9 fit-once + AC10 scope one-shot), modelled on the existing issue1069/1815/1447/1064 mount+props-log harness.
- `src/pages/MapDiscovery.tsx`: 3760 → 3561 (**−199**). Panner props read the hook view; the `window.__debug.mapState` effect stays page-owned (byte-identical shape, only relocated after the hook call so it reads the hook's schoolMarkerFocusTick); focusedGroupAreas + resetMapTick/fitTick + the S6 journeyView ticks untouched (injected read-only).

## Deviations (documented; code-reviewer-APPROVED)

- **DEV-1 (MATERIAL — mapBbox NOT extracted):** the plan's move-list named mapBbox + bboxTimerRef + handleBoundsChange + cleanup + the city-change bbox reset, and the FLAT contract listed mapBbox/handleBoundsChange. These were NOT moved. Reason: a genuine hook-call-ORDER circular dependency — `useDiscoverMapData({ bbox: mapBbox })` (MapDiscovery.tsx L1408) reads mapBbox as a plain JS variable and must be called BEFORE the camera hook (L1866), which needs useDiscoverMapData's outputs (discoverAreas/areasLoading/isLoadingAreaGroups/isLoadingAreaListings + the page-derived schoolListings/focusedGroup). A JS variable cannot be read before the call that produces it. Duplicating useDiscoverMapData's fetch earlier to reorder would be a NEW behaviour (double-fetch/cache-key duplication) — an OUT_OF_SCOPE_FUNCTIONAL_FIX. The engineer chose the behaviour-preserving path: leave mapBbox/handleBoundsChange/cleanup/city-reset BYTE-IDENTICAL in the page. SAME CLASS as S6's DEV-2 (boundedSearchTriggered). Verified real + byte-identical + adjudicated ACCEPTABLE by the opus code-reviewer.
  - Consequence: the FLAT contract lacks mapBbox/handleBoundsChange, and net LOC is **−199** (not the AC8 projection of −400/−450 — the ~20 mapBbox lines + comment stubs account for the shortfall). This is a variance from the PLAN_REVIEW-approved contract + line target; surfaced for WORKDONE_REVIEW/PLAN_REVIEW adjudication.
- **DEV-2 (benign):** the `__debug.mapState` effect was physically relocated to after the hook call (still page-owned, body/deps/shape byte-identical) because it reads the hook-sourced schoolMarkerFocusTick.
- **GLOB-GAP (Main Agent reconciling):** the plan-required NEW test `src/pages/__tests__/MapDiscovery.issue1824-s7.camera.test.tsx` is not covered by the handoff's `allowed_file_globs` (which lists only the specific file `src/pages/MapDiscovery.tsx`). Flagged to the Main Agent to widen the handoff glob before WORKDONE_REVIEW scope-lock.

## Validation evidence (commands + exit codes)

| Check | Command | Exit | Result |
|---|---|---|---|
| tsc (branch vs c4d6ee2d disposable baseline) | `npx tsc -p tsconfig.app.json --noEmit` | 2 (both) | 134-line output **byte-identical** → zero net-new errors |
| Hook unit test | `npx vitest run …/useDiscoverCameraOrchestration.test.tsx` | 0 | **14/14 PASS** |
| Camera guards (AC9 + AC10 + schoolFocusTick) | `npx vitest run …/MapDiscovery.issue1824-s7.camera.test.tsx` | 0 | **3/3 PASS**; AC9/AC10 verbatim titles + genuine same-key/identity assertions (qa-confirmed non-vacuous) |
| AC7 regression guards (6 files) | `npx vitest run <6 guard files>` | 0 | **16/16 PASS**; `git diff --stat c4d6ee2d` empty → UNEDITED |
| Broad batch | `npx vitest run src/pages/__tests__ src/features/discover/state` | 0 | 46 files / **424 tests, 0 failures** |
| Production build | `env -C <worktree> npm run build` | **0** | built (engineer; subsequent change was a test-title string only, no build surface) |
| Lint | `npx eslint <touched files>` | 0 | 0 errors, 15 warns == baseline; 2 eslint-disable == baseline |

- code-reviewer: **opus / frontend, APPROVE** (0 must-fix). Verbatim-move confirmed via full-file git-show diff (only the import swap + 6 camera blocks→comments+hook call + __debug relocated; zero stray hunks); one-shot ref placement intact; DEV-1 adjudicated ACCEPTABLE (circular dep verified real, mapBbox byte-identical); AC9 same-key assertion + AC10 identity assertion genuine.
- The one non-blocking reviewer note (AC10 title casing `does not`→`does NOT`) was fixed and the camera test re-ran green (exit 0) — the title now matches the approved required-evidence string verbatim.

## Phase 7A

REQUIRED GENUINE LIVE on :5174, run by the Main Agent AFTER this candidate (gate order Phase 6 → 7A → 7C): school focus, schoolMarkerFocus fit-once, group/scope/agri fit, #1821 cold-load, + the CRITICAL jitter/loop check. Journeys in the handoff `[browser_validation_7a]`.
