# Issue #1824 — Slice S7 Design (camera panner/tick orchestration R9 → useDiscoverCameraOrchestration)

Phase 0.7 for S7 (HIGH risk — the CAMERA-OWNER surface, the highest-risk correctness area of the programme; #1801/#1806/#1118/#1064/#1821/#1547/#1815 cluster here). Baseline `origin/main @ c4d6ee2d` (S1-S6 merged). Read-only: explorer-planner inventory + architect design (line numbers verified directly against the 3760-line post-S6 file). No production code changed.

## Decision summary

- **ONE hook** `useDiscoverCameraOrchestration` in `src/features/discover/state/`, **FLAT return** (reject ControllerResult — no atomic multi-field transition exists; matches S2a/S4 precedent). **ONE PR** (do not carve out agri-fit).
- Reads the S6 `journeyView` ticks read-only via injection (does NOT move them); `resetMapTick`/`fitTick` stay owned by `useDiscoverPageState` (injected). Inject-not-import (no `useDiscoverUrlState`/`useDiscoverPageState`/`useDiscoverJourneyTransitions` import; pure utils imported normally).

## Moves (verbatim) vs stays-in-page

**Moves:** schoolFocusTick + writer effect (journey==='school-first' + lat/lon guard, tick-not-in-deps); schoolFocusLat/Lon derivation (expose from hook — OQ1); schoolMarkerFocusTick + listingsReadyKey memo + lastFittedListingsKeyRef + writer effect (one-shot #1547); mapBbox + bboxTimerRef + handleBoundsChange + cleanup effect; city-change bbox reset; group-fit effect + prevGroupIdRef/prevAreaKeyRef (eslint-disable); scope-fit effect + prevScopeRef (eslint-disable); agri-fit effect + agriGroupFocusBounds.

**Stays in page:** resetMapTick/fitTick (useDiscoverPageState, injected); journeyView ticks (S6, injected read-only); the `window.__debug.mapState` effect (spans both hook views — re-sourced from the hook view + journeyView; shape byte-identical, E2E contract MF-6/7/8/10); focusedGroupAreas (marker-fade PRESENTATION, not camera); schoolMarkerPositions/areaRestoreArea/all PropertyMap panner wiring.

## FLAT contract

`useDiscoverCameraOrchestration({...injected}): { schoolFocusTick, schoolMarkerFocusTick, schoolFocusLat, schoolFocusLon, mapBbox, agriGroupFocusBounds, handleBoundsChange }`. Injected: urlState/urlActions (value) + useDiscoverPageState values/setters (city, setPanToArea, selectedSchool, selectedArea, isLoadingAreaListings) + useDiscoverMapData outputs (discoverAreas, areasLoading, areaGroupsData, isLoadingAreaGroups, agriMapListingsData, cityCenter, focusedGroup, summaryRegions) + page-derived (selectedRegion, selectedMaxKm, schoolListings) + journeyView ticks (read-only).

## Camera-owner invariant preservation (byte-for-byte — anti-jitter/anti-loop)

| Guard | Why load-bearing |
|---|---|
| schoolFocusTick journey guard + lat/lon guard + tick-not-in-deps | prevents wrong-journey focus jump / NaN fitBounds / increment feedback loop |
| **lastFittedListingsKeyRef fit-once (#1547)** | THE anti-snap guard: a bbox refetch toggles isLoadingAreaListings true→false → listingsReadyKey null→same-key → without the ref, schoolMarkerFocusTick re-increments and the panner re-fires fitBounds, snapping the map mid-pan. Ref gates increment to a CHANGED key only. |
| group-fit readiness gate (areasLoading + isLoadingAreaGroups) BEFORE ref advance (#1815) | two async fetches race; gating both before advancing prevGroupIdRef/prevAreaKeyRef prevents burning the one-shot (bimodal pill-count bug). Ref advance MUST stay after both gates. |
| group-fit areaKey!==null precedence early-return | per-area fit (S6 hydration) wins; group-fit yields (#1821 depends on this) |
| scope-fit prevScopeRef one-shot + groupId/areaKey yield + readiness gate | once-per-scope; yields to deeper drill-down |
| agri-fit null-coord filter (Math.min/max(undefined)=NaN) | NaN bounds crash/fly-to-origin |
| agri-fit locality-priority early-return + clear-on-empty | locality framing wins; no stale agri fit persists |
| mapBbox 300ms debounce + bboxTimerRef cleanup | coalesces pan/zoom storm; no setState-after-unmount |
| city-change setMapBbox(null) | prevents previous city's bbox clipping the new fetch |

**Coordination invariant:** three fit sinks stay SEPARATE — group/scope → setPanToArea; agri → setAgriGroupFocusBounds; bbox → setMapBbox. Never unify. Both eslint-disables (group/scope one-shot refs) are ESSENTIAL — carry verbatim.

## Regression test map + the zero-JSDOM-guard gaps

**Covered (JSDOM, unchanged):** group producer → issue1069 (panToArea.areaKey===GROUP_BOUNDS_SYNTHETIC_KEY); group one-shot race → issue1815 + r3b (both resolution orders); agri focusBounds → issue1447 (AC1 sector-only / AC2 union / AC3 larger maxKm / AC4 region-cleared null / AC5 cityCenter-unavailable fallback); #1821 area-yield → issue1821 (AC1 tight area fit + AC2 bare-viewport no-override); resetMapTick → issue1064.

**GAPS (Playwright-only today → 3 MANDATORY new JSDOM tests in `MapDiscovery.issue1824-s7.camera.test.tsx`, props-log pattern):**
1. schoolFocusTick — fire on schoolId/radiusKm change (school-first) + NOT when journey!=='school-first' or lat/lon null. (only e2e MF-1..MF-5)
2. **schoolMarkerFocusTick FIT-ONCE (#1547) — HIGHEST RISK, no fit-once guard anywhere** — increment once when listingsReadyKey first non-null, and NO re-increment on a same-`${schoolId}_${radiusKm}`-key isLoadingAreaListings true→false toggle. The single most important new test. (e2e MF-6 only asserts >0)
3. scope fitBounds one-shot — panToArea gets macro-region bounds once, no re-fire on refetch, yields when groupId/areaKey present. (ZERO guard; issue1745-batchB tests the click handler, not the fit effect)

## Sub-split / sequencing

ONE PR (S3-S6 precedent; ~400-450 lines; agri-fit self-contained, carving it out orphans agriGroupFocusBounds). **SEQUENCING FLAG:** S7 lands MapDiscovery.tsx ~3300 lines; the <800-line composition-root target will NOT be reached by S8 alone — the programme likely needs S8 + S9. Not an S7 blocker. #1864 SchoolGroupAreasPanel Back-button rewire lands in S8 (DiscoverRightPanel wiring), not S7.

## tsc baseline + 7A

- tsc baseline @c4d6ee2d: `npx tsc -p tsconfig.app.json --noEmit` (fallback `npx tsc --noEmit`); assert no net-new.
- **7A REQUIRED GENUINE LIVE on :5174**: school focus; schoolMarkerFocus fit-once; group/scope/agri fit; #1821 cold-load; + a CRITICAL jitter/loop check (rapid journey switches + school select then zoom-in bbox refetch → NO repeated fit / NO snap-back). One clean tab, throttle, 3×, MANUAL_PASS.

## Open questions (for PLAN_REVIEW)

1. schoolFocusLat/Lon: expose from hook (recommended) vs keep page derivation + inject.
2. focusedGroup/summaryRegions: inject page memos (recommended) — confirm stable references so dep arrays behave identically.
3. <800 sequencing (S8+S9) — end-of-programme expectation, not an S7 scope question.
