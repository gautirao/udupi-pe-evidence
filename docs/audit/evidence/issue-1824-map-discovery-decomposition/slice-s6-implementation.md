# Issue #1824 — Slice S6 Implementation Note (journey-transition orchestration R10 → useDiscoverJourneyTransitions)

Stage B execution record. Branch `issue-1824-s6-journey-transitions` off `origin/main @ 830abaa6`. HIGH risk, behaviour-preserving VERBATIM extraction. Companion: `slice-s6-design.md` (Phase 0.7 design).

## What shipped

- NEW `src/features/discover/state/useDiscoverJourneyTransitions.ts` (593 lines) — the R10 journey-transition hook. `ControllerResult<TView, TCommands>`. Inject-not-import (URL/page-state hooks NOT imported; only `import type` for `DiscoverUrlActions`/`DiscoverUrlState`/`ControllerResult`).
  - View: `{ startOverTick, composedResetMapTick, areaRestoreTick, cityRestoreTick, boundedSearchTriggered, schoolFirstOnBack }`.
  - Commands: `{ startOver, selectSchoolById, clearSchool, clearArea, changeRadius, backLevel2, backLevel1, backLevel0, resetBoundedSearch, wrappedSchoolSelect }`.
  - Moved VERBATIM (byte-for-byte, statement order preserved): handleStartOver; composedResetMapTick = resetMapTick + startOverTick; handleSelectSchoolById; handleRadiusChange; handleSchoolFirstBackLevel2/1/0; schoolFirstOnBack derivation; onClearSchool/onClearArea; wrappedSchoolSelect; the board-filter sync effect; the schoolById restore + error effects; the deferred areaKey-hydration effect (+ cityRef/urlCityRef relocated in). Both essential eslint-disable suppressions + the pre-existing third carried with identical dep arrays + comments.
- NEW `src/features/discover/state/useDiscoverJourneyTransitions.test.tsx` (504 lines, 23 tests) — the AC5(i)-(ix) concrete spec, incl. the first-class restore-tick coverage AC5(iii)-(vi).
- `src/pages/MapDiscovery.tsx`: 4027 → 3760 lines (**−267, −6.6%**; diff +142/−409). Readers rewired to `journeyView.*` / `journeyCommands.*`; the `window.__debug.mapState` object shape byte-identical (areaRestoreTick/cityRestoreTick from the hook view, schoolMarkerFocusTick still page-owned). The R9/S7 camera surface (schoolFocusTick, schoolMarkerFocusTick, group/scope/agri fitBounds, city-bbox reset, mapBbox/handleBoundsChange) UNCHANGED.

## Deviations (documented, all behaviour-neutral, code-reviewer-APPROVED)

- **DEV-1** — `selectedSchool` + `filters` added as injected params: the schoolById restore effect reads them in its guard + dep array (pre-existing behaviour). Not in the qa-fast digest's dep list; compile-necessary. No `useDiscoverPageState` import introduced.
- **DEV-2** — `boundedSearchTriggered`'s raw `useState` kept PAGE-LOCAL and injected (value + setter) into the hook, rather than owned internally. Reason: a real circular dependency — `useDiscoverMapData` (out-of-scope file) reads `boundedSearchTriggered` synchronously in its `markersEnabled` param BEFORE the hook can be called, but the hook's moved effects need `useDiscoverMapData` outputs AFTER. All write sites remain exclusively in the hook's commands via the injected setter (the two remaining page-local writes — `handleAreaFirstBack`, `handleBoundedSearch` — are pre-existing UNMOVED handlers, never in the R10 move list, byte-identical to 830abaa6). Ownership/behaviour invariant holds; only the raw `useState` declaration location differs from the plan's literal wording. This is exactly OQ1 the plan flagged.
- **DEV-3 (advisory, non-blocking)** — 6 dep arrays (handleStartOver, handleSelectSchoolById, handleRadiusChange, handleSchoolFirstBackLevel2, onClearSchool, schoolById error effect) mechanically WIDENED by adding `setBoundedSearchTriggered`: a behaviour-neutral consequence of DEV-2 (the setter is now a function param, so eslint `exhaustive-deps` requires it listed; React-guaranteed referentially stable → zero runtime effect — no extra re-memo, no extra effect re-runs). Flagged by the opus code-reviewer as ADVISORY only.

- **Self-caught bug during implementation:** the first pass left the schoolById + deferred-areaKey effects duplicated in BOTH the page and the hook (both compiled). The engineer detected it via an eslint unused-disable-directive count mismatch, removed the stale page copies, and verified no other duplicates. Caught before review.

## Validation evidence (commands + exit codes)

| Check | Command | Exit | Result |
|---|---|---|---|
| tsc (branch vs 830abaa6 baseline) | `npx tsc -p tsconfig.app.json --noEmit` | 2 (both) | 185-line output **byte-identical** to baseline → **zero net-new type errors** |
| Production build | `env -C <worktree> npm run build` | **0** | `✓ built in 6.81s` |
| Lint (touched files) | `npx eslint <3 files>` | 0 | 16 warnings (== baseline, line-shifted), **0 errors**; 3 eslint-disable == baseline (none added/removed) |
| Hook unit test | `npx vitest run …/useDiscoverJourneyTransitions.test.tsx` | 0 | **23/23 PASS**, real expect() |
| AC7 regression guards (5 files) | `npx vitest run <5 guard files>` | 0 | **15/15 PASS**; `git diff --stat 830abaa6 -- <5 files>` EMPTY → UNEDITED |
| Broader batch | `npx vitest run src/pages/__tests__/ src/features/discover/state/` | 0 | 44 files / **407 tests, 0 failures** (no OOM) |

- code-reviewer: **opus / frontend, APPROVE** (0 must-fix, 0 blocking). Verbatim-move confirmed via `git show 830abaa6` line-by-line; restore-tick branch not inverted; #1821 gate + cityRef/urlCityRef relocation verbatim; Start Over dual-tick unchanged; R9/S7 camera surface untouched; no duplicate declarations; DEV-1/DEV-2 both APPROVE.
- AC5(iii)-(vi) confirmed as real regression gates (assert the incremented tick === 1 AND the other tick === 0 — catches an inverted branch), the only CI-runnable guard for R1 until the live 7A.

## Phase 7A

REQUIRED GENUINE LIVE on port 5174 — run by the Main Agent AFTER this workdone-candidate (gate order Phase 6 → 7A → 7C). Covers: school-first 3-level Back ladder (BN-1..BN-5), restore-tick increments (MF-7/8/10), Start Over dual-tick, #1821 cold-load fit vs bare-viewport no-override. Journeys/URLs in the handoff `[browser_validation_7a]`.

**Result: PASS**, with one finding. Live on real Udupi (Manipal school data) + Bangalore (Devanahalli) data via `window.__debug.mapState` before/after reads at each interaction:
- L2→L1 Back (school-selected → area): `areaRestoreTick` 0→1, `cityRestoreTick` unchanged — PASS (BN-1/MF-7).
- L1→L0-equivalent Back (schools-in-area → zone): `areaRestoreTick` unchanged, `cityRestoreTick` 0→1 — PASS (BN-2/3/MF-8).
- Bug-B (top-level school-selected, no `areaKey`): `cityRestoreTick` 0→1 only — PASS (MF-10).
- Start Over: full URL reset, both restore ticks left untouched — PASS.
- #1821 AC1 (tight fit, different prior viewport) + AC2 (bare-viewport preserved, no override) — both PASS on Bangalore/Devanahalli.
- Console clean (only pre-existing React Router v7 future-flag advisories).

**Finding (pre-existing, not an S6 regression):** the school-group-areas "Back to school zones" button does not fire `cityRestoreTick` live. Traced to `SchoolGroupAreasPanel`'s Back button being wired to `DiscoverRightPanel.tsx`'s hardcoded `onClearGroup={() => urlActions.selectGroup(null)}` prop instead of `journeyView.schoolFirstOnBack`/`backLevel0`. Confirmed via `git show 830abaa6:src/pages/MapDiscovery.tsx` that the responsible line is byte-identical to the pre-S6 baseline — `DiscoverRightPanel.tsx` is outside S6's `allowed_file_globs`. Filed separately as **[#1864](https://github.com/gautirao/udupi-property-explorer/issues/1864)**, kept out of PR #1861's scope per the user's explicit direction. Full record: `.claude/handoffs/issue-1824/product-verification.toml`.
