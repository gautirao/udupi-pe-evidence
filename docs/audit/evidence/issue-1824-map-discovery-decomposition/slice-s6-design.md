# Issue #1824 — Slice S6 Design (journey-transition orchestration R10 → useDiscoverJourneyTransitions)

Phase 0.7 for S6 (HIGH risk — R10; journey ENTER/EXIT/SWITCH for area/school/agri + journeyless↔journey; camera ordering #1801/#1806/#1118; school-first Back ladder #1143; restore ticks MF-7/8/10; #1821 cold-load fit; #1145 school-deep-link; __debug E2E contract). Baseline `origin/main @ 830abaa6` (S1-S5 merged). Worktree branch reset to origin/main. Read-only: explorer-planner inventory + architect design (line numbers verified directly against the 4027-line file @830abaa6). No production code changed.

## Headline — S6/S7/S8 remain THREE separate slices (answers the Main Agent's scope-consolidation question)

The explorer-planner initially flagged four effects as **MIXED** (journey-state write AND camera write in one body), which would have threatened the S6 (R10 journey) / S7 (R9 camera) split. The architect **verified every flagged effect line-by-line and corrected the premise**: three fitBounds effects (group L2319-2368, macro-region scope L2374-2407, agri-group L2414-2493) and schoolMarkerFocusTick (L1975-1980) only bump a tick or call `setPanToArea`/`setAgriGroupFocusBounds` — they **read** journey-derived urlState but **do not mutate journey state**. The actual `fitBounds` runs inside PropertyMap's panner components. So there is nothing to bisect.

**Cut line — by tick WRITER ownership, not tick type:**
- **S6 (this slice)** owns the ticks whose ONLY writers are journey-transition handlers: `startOverTick`, `areaRestoreTick`, `cityRestoreTick`, plus `boundedSearchTriggered`.
- **S7 (later)** owns the ticks whose ONLY writers are reactive camera effects: `schoolFocusTick`, `schoolMarkerFocusTick`, and the group/scope/agri fitBounds effects + `mapBbox` + city-change bbox reset.

Because the genuinely journey+camera code is confined to whole handlers (`handleStartOver`, the three school-first Back handlers) + one effect (deferred areaKey hydration) that all move as **intact units**, R10 and R9 separate **without any mid-body bisection**. **Decision: Option A (keep two independent slices).** Reject Option B (consolidate — no safety gain, produces the single largest slice) and Option C (R10-only-leaving-all-camera — collapses S6 to near-empty since area-first/agri have negligible page-level R10 code).

## Scope + hook contract

**ONE hook** `useDiscoverJourneyTransitions` in `src/features/discover/state/` (the S1-S5 convention; reject the roadmap's `journeys/{area,school,agri}` three-module idea — the journeys share one state surface and the school-first Back ladder branches on `panelContent` across journeys, so three modules = premature fragmentation of shared-state ownership).

**Return: `ControllerResult<TView, TCommands>`** (atomic multi-field transitions: Back = clear-journey + tick-bump; Start Over = ~6 fields — the condition the programme reserves ControllerResult for).
- **View:** `{ startOverTick, composedResetMapTick, areaRestoreTick, cityRestoreTick, boundedSearchTriggered, schoolFirstOnBack }`.
- **Commands:** `{ startOver, selectSchoolById, clearSchool, clearArea, changeRadius, backLevel2, backLevel1, backLevel0, resetBoundedSearch, wrappedSchoolSelect }`.

**Injected — do NOT import `useDiscoverUrlState`/`useDiscoverPageState` inside the hook** (S5 rule): `urlState`, `urlActions`; the `useDiscoverPageState` setters/refs (`setSelectedArea`, `setSelectedSchool`, `setFilters`, `setPanToArea`, `setSchoolBoardFilter`, `resetMapTick`, `deselectArea`, `pendingAreaKeyRef`, `initialViewportRef`, `initialViewportWasBareAreaRef`, `resolveSignal`, `handleSchoolSelect`); plus `schools`, `queryClient`, `toast`, `discoverAreas`, `areasLoading`, `urlBoardFilters`, `schoolBoardFilter`, `panelContent`, `city`. The definitive injected list is enumerated by qa-fast pre-implementation and confirmed by the engineer (constraint: inject-not-import; tsc bounds it).

## Moves (intact units) vs stays-in-page

**Moves to the hook:** `boundedSearchTriggered` (~L1131), `startOverTick` (~L1139), `areaRestoreTick` (~L1203), `cityRestoreTick` (~L1204); `handleStartOver` (~L1261-1278); `composedResetMapTick = resetMapTick + startOverTick` (~L1260, computed in-hook); `handleSelectSchoolById` (~L1599-1645); `handleRadiusChange` (~L1983-1995); `handleSchoolFirstBackLevel2/1/0` (~L2008-2057); `schoolFirstOnBack` derivation (~L2067-2076); `onClearSchool`/`onClearArea` (~L2080-2102); `handleSchoolSelect` wrapper (~L2495+); board-filter sync effect (~L1555-1561, incl. the `eslint-disable-next-line` L1560 + comment verbatim); schoolById restore/error effect (~L2220-2253); deferred areaKey hydration effect (~L2265-2289, incl. the `eslint-disable-next-line` L2288 + comment verbatim, under the #1821 initialViewport gate).

**Stays in the page (S7 or composition root):** `schoolFocusTick` + effect (~L1189/L1320-1324, the `journey==='school-first'` guard is S7's); `schoolMarkerFocusTick` + effect (~L1196/L1975-1980); group/scope/agri fitBounds effects (~L2319-2368, ~L2374-2407, ~L2414-2493) + `agriGroupFocusBounds` (~L2412); city-change bbox reset (~L1297-1299) + `mapBbox`/`handleBoundsChange` (~L1208-1226); `window.__debug.mapState` object effect (~L1479-1510, reads BOTH views — re-sourced from `view.*`); Start-Over a11y focus effect (~L1287-1294, reads `view.startOverTick`); `useDiscoverMapData` call + `markersEnabled` (~L1416-1476, reads `view.boundedSearchTriggered`); `useDiscoverPageState` + all setters (SCOPE-LOCKED, injected).

## Invariants + verbatim-preservation points

1. **`window.__debug.mapState` shape (L1479-1510)** — E2E contract; `schoolMarkerFocusTick`/`areaRestoreTick`/`cityRestoreTick`/`schoolCenter` byte-identical (MF-6/7/8/10 read `getDebugMapState`). Stays in page, re-sourced from both views.
2. **Camera ordering (#1801/#1806/#1118)** — preserved by moving each handler/effect INTACT (no statement reordering).
3. **areaRestoreTick/cityRestoreTick fire-only-on-Back guard** — the `if (urlState.areaKey != null) setAreaRestoreTick else setCityRestoreTick` branch + the never-from-Start-Over rule (MF-7/MF-10). Verbatim.
4. **schoolFocusTick `journey==='school-first'` guard** — S7's, do NOT touch here.
5. **Start Over dual-tick composition** — `composedResetMapTick = resetMapTick + startOverTick`; #1064 asserts the net increase. Additive composition preserved.
6. **#1821 areaKey-hydration gate** — `if (!initialViewportRef.current || !initialViewportWasBareAreaRef.current) setPanToArea(match)` + the re-arm branch (AC1/AC2). Verbatim.

**Suppression essentiality:** L1560 board-filter sync (single-dep `[urlBoardKey]`; adding `schoolBoardFilter` = infinite loop) and L2288 areaKey hydration (deliberately omits `pendingAreaKeyRef`/`initialViewportRef`/`cityRef`/`setPanToArea`, read via refs; adding them misfires the one-shot) — both ESSENTIAL, carried verbatim with their exact dep arrays + comments.

## Regression test map (verbatim titles + critical gaps)

**Runnable JSDOM guards (green unchanged, no edits):**
- `MapDiscovery.issue1064.test.tsx` — Start Over resetMapTick (`Symptom 2 (AC2) … › clicking Start Over increments resetMapTick passed to PropertyMap`) + Malpe school-first hydration (`Symptom 3 (AC3) … › renders SchoolsInAreaPanel (not GuidedEntryPanel) for resolved Malpe deep link`).
- `MapDiscovery.startOver-chip.test.tsx` — `Issue #1153 … › BHK chip disappears after clicking Start Over`.
- `MapDiscovery.issue1821.test.tsx` — `AC1: cold mount … fits tightly to the resolved area's own bounds` + `AC2 (#1160/#1069 non-regression): … preserves the user's own restored viewport — no fit override`.
- `MapDiscovery.school-deep-link.test.tsx` — `Issue #1145 …` 5 cases (500 clears+toast; TypeError clears+toast; 404 clears WITHOUT toast; success no-clear/no-toast; absent no-op).
- `MapDiscovery.issue1806.groupScope.test.tsx` — scope-correctness suite (adjacent; S6 must not regress the panelContent-gated `schoolsAreaKey`).

**CRITICAL GAP — no runnable JSDOM guard (Playwright-only, un-runnable in CI vs shared Supabase):**
- school-first 3-level Back ladder → `e2e/school-first-back-nav.spec.ts` BN-1..BN-5.
- areaRestoreTick/cityRestoreTick increments on Back → `e2e/school-first-map-focus.spec.ts` MF-7/8/10.

→ **Required NEW JSDOM unit tests (MapDiscovery-mounted, PropertyMap props-log pattern from #1064/#1821):** (a) Back from school-selected with areaKey set → areaRestoreTick increments, cityRestoreTick does not; (b) Back from school-selected with NO areaKey → cityRestoreTick increments, areaRestoreTick does not (Bug B); (c) Back from schools-in-area → cityRestoreTick increments. Plus these characterised in the hook unit test AC5(iii)-(vi). Backed by a live Phase 7A pass of BN-1..BN-5 + MF-7/8/10.

## Sub-split — ONE PR (reject roadmap's "3 PRs")

Three per-journey modules would fragment `selectedArea`/`selectedSchool`/`filters`/`boundedSearchTriggered`/tick ownership across PRs; area-first/agri have near-empty page-level R10 code; the restore-tick + Back-ladder invariants are relational. One cohesive concern → one reviewable diff (S3/S4/S5 precedent).

## tsc baseline + 7A

- tsc baseline @830abaa6: `npx tsc -p tsconfig.app.json --noEmit` (fallback `npx tsc --noEmit`); record count; assert no net-new errors. No `typecheck` npm script exists.
- **7A: REQUIRED GENUINE LIVE on :5174** — the Back-ladder/restore-tick invariants are guarded ONLY by live Playwright. Journeys: school-first `?city=udupi&journey=school-first&areaKey=IN|KA|Udupi|Manipal&schoolId=sch-1&radiusKm=3` (L2→L1→L0 Back; watch `__debug.mapState.areaRestoreTick/cityRestoreTick`); top-level school-selected (Bug-B cityRestoreTick-only); Start Over dual-tick + #1817 confirm; area-first #1821 cold-load fit vs bare-viewport no-override on `?city=bangalore&scope=north&groupId=airport-belt&…&areaKey=IN|KA|Bengaluru|Devanahalli`. One clean tab, throttle, 3×, MANUAL_PASS.

## Open questions (for PLAN_REVIEW)

1. **boundedSearchTriggered ownership** — written by S6 handlers, read by page `markersEnabled`; plan assigns to the hook view. Widest S6↔page coupling; PLAN_REVIEW to confirm.
2. **ControllerResult vs flat** — plan proposes ControllerResult (command-bearing, programme-consistent); flat is also behaviour-preserving.
3. **Exact injected-dep list** — constraint given (inject-not-import); definitive list enumerated by qa-fast pre-implementation.
4. **useDiscoverPageState scope-lock** — confirm it stays frozen; S6 injects its setters, never moves them (a future S9 may absorb it — not S6).
