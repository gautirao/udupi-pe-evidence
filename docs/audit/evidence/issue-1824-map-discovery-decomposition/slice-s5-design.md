# Issue #1824 — Slice S5 Design (marker-click/panel/popover routing → useMarkerSelection)

Phase 0.7 for S5 (HIGH risk — R8; panel/map scope agreement + marker-popup #1738/#1798 + URL coupling #1547). Baseline `origin/main @ 9a7120d0` (S1-S4 merged). Branch `issue-1824-s5-marker-selection`. Read-only: explorer-planner inventory + architect design. No production code changed.

## Key structural finding — R8 is TWO clusters
| | EARLY cluster (L1098-1186) | LATE cluster (L3237-3293) |
|---|---|---|
| Members | selectedMarkerListing L1098, markerPixelPos L1104, markerListingCtxRef L1110-1111, handleSelectMarkerListing L1113-1155, handleMarkerClickWithPosition L1164-1176, handlePopoverDismiss L1180-1186 | currentMapMarkerListings (S3 selector output) L3237, isMarkerPopoverEligible L3103, markerPopoverStepper IIFE L3261-3268, handleStepMarkerListing L3275-3281, handleShowMarkerInList L3289-3293 |
| Identity | 3 handlers useCallback([]) — STABLE identity is LOAD-BEARING (PropertyMap/MarkerClusterLayer capture onSelectListing/onMarkerClickWithPosition) | plain fns, recreated per render |
| URL reads | via ctxRef | isMarkerPopoverEligible reads urlState DIRECTLY + is ALSO consumed by the JSX render gate L3835 |
| Cross-file | none | depends on currentMapMarkerListings reference identity (findIndex) |

`isMarkerPopoverEligible` is the pivot: shared by the stepper AND the render gate, depends only on urlState → cannot cleanly move into a marker-selection hook.

## 1. Scope + hook contract — Option A (decisive)
The hook owns the EARLY cluster ONLY. currentMapMarkerListings, isMarkerPopoverEligible, markerPopoverStepper, handleStepMarkerListing STAY in the page. Consolidate all URL writes inside the hook via action methods.
- Name/path: `src/features/discover/state/useMarkerSelection.ts` (+ `.test.tsx`). Reject `orchestration/` dir — `state/` is the S1-S4 convention.
- Params (inject; do NOT import useDiscoverUrlState): `useMarkerSelection({ urlActions, urlState })` — pass the WHOLE objects (verbatim mirror of the current ctxRef which holds `{urlActions, urlState}`).
- Return: `{ selectedMarkerListing, markerPixelPos, handleSelectMarkerListing (STABLE), handleMarkerClickWithPosition (STABLE), handlePopoverDismiss (STABLE), selectMarkerSibling(listing) [stepper write], showMarkerInList(id) [clear popover, KEEP URL] }`.
- Page after: handleStepMarkerListing STAYS (computes sibling from currentMapMarkerListings[stepper.index±1], then calls selectMarkerSibling(sibling)); handleShowMarkerInList → replaced by showMarkerInList passed to MarkerPopoverCard; markerPopoverStepper IIFE STAYS (reads destructured selectedMarkerListing + page currentMapMarkerListings/isMarkerPopoverEligible).
Why A over B: currentMapMarkerListings never crosses the hook boundary → the stepper's findIndex closes over the same page-scoped array (zero reference-identity risk); don't fracture the isMarkerPopoverEligible render-gate/stepper trio; lower churn for a High-risk behaviour-preserving slice.

## 2. markerListingCtxRef pattern — keep INTERNAL to the hook
The hook maintains its own ctxRef holding `{urlActions, urlState}`, mutated UNCONDITIONALLY every render (at hook top), and returns useCallback([]) handlers. Do NOT convert to normal-deps useCallback — urlActions gets a new identity every render, so normal deps would re-bind the 3 map handlers each render → marker-handler churn (identity-sensitive memo break / perf+functional regression). The ref is the mechanism that keeps identity stable while reading latest URL state — preserve VERBATIM.
Verbatim-preservation points: ctxRef init + `ctxRef.current = { urlActions, urlState }` unconditionally every render at hook top; handleSelectMarkerListing both branches (agri-first L1122-1130 + residential L1145-1152) + the early return; handleMarkerClickWithPosition gate L1167-1173; handlePopoverDismiss incl. `clearSelectedListing?.()` optional-chain L1185; all 3 deps arrays stay `[]`.

## 3. Stepper currentMapMarkerListings dependency — preserved by never crossing the boundary
currentMapMarkerListings stays in the page (S3 pure selector, closes over page vars). markerPopoverStepper IIFE stays (reads page isMarkerPopoverEligible + page currentMapMarkerListings + the destructured hook selectedMarkerListing). handleStepMarkerListing stays (reads stepper + currentMapMarkerListings, delegates the 2 writes to selectMarkerSibling). The only hook-sourced values the late cluster uses are the READ of selectedMarkerListing + the WRITE delegate selectMarkerSibling — neither touches the array identity/findIndex contract. Behaviour-preserving by construction.

## 4. URL coupling (#1547) — all preserved
| Current call | Condition | After S5 |
|---|---|---|
| setSelectedListing(id) L1128 | agri-first + selectedRegion + selectedMaxKm | hook handleSelectMarkerListing |
| setSelectedListing(id) L1151 | journey!==agri-first + areaKey!=null + (schoolId==null \|\| area-first) | hook handleSelectMarkerListing |
| clearSelectedListing?.() L1185 | dismiss | hook handlePopoverDismiss |
| setSelectedListing(sibling.id) L3280 | stepper step | hook selectMarkerSibling (called by page handleStepMarkerListing) |
| setSelectedListing(id) L3292 | "Show in list" (NO clear) | hook showMarkerInList |
| read selectedListingId={urlState.selectedListing} L3444 | persistent highlight | STAYS in page, unchanged |
Identical params/conditions/clear-vs-no-clear asymmetry. No URL-contract change.

## 5. #1738 / #1798 invariant preservation
- #1738 area-first area+school-combined eligibility `(schoolId==null || journey==='area-first')` — verbatim in hook handleSelectMarkerListing (L1149) + handleMarkerClickWithPosition (L1170); the SAME clause in isMarkerPopoverEligible (L3103) STAYS in page. Pinned by tests/discover/marker-popover-1738-gating.test.ts.
- #1798 journeyless area-selected + 3 handlers — verbatim gating; page still renders MarkerPopoverCard under `isMarkerPopoverEligible && selectedMarkerListing!=null && markerPixelPos!=null` (L3835). Pinned by src/pages/__tests__/MapDiscovery.issue1798.markerPopup.test.tsx.
Any forced edit to keep either green = BEHAVIOUR_CHANGE_DETECTED → STOP. Gates move byte-for-byte; no functional fix folded in.

## 6. Sub-split — ONE PR (decisive)
The late cluster + currentMapMarkerListings coupling STAYS in the page — there is nothing to move in a "5b". Diff = (1) new useMarkerSelection.ts; (2) replace the L1098-1186 block with one hook call + destructure; (3) rewire handleStepMarkerListing → selectMarkerSibling + delete handleShowMarkerInList (pass showMarkerInList). A 5a/5b split would fragment the #1547 URL-coupling across two PRs — the opposite of "reviewable in one diff." Mirrors S3/S4.

## 7. Test strategy
NEW useMarkerSelection.test.tsx (renderHook + injected urlActions spies): initial null/null; handleSelectMarkerListing sets state + setSelectedListing spy in the agri branch + the area-first areaKey branch + NOT for school-first (pins #1738/#1547); handleMarkerClickWithPosition sets markerPixelPos only when eligible; handlePopoverDismiss clears both + clearSelectedListing; showMarkerInList clears local + setSelectedListing but NOT clearSelectedListing (the load-bearing asymmetry); selectMarkerSibling sets state + setSelectedListing; IDENTITY-STABILITY assertion — rerender with a NEW urlActions object identity → the 3 map handlers keep === identity AND still read the LATEST injected urlActions (ctxRef freshness — pins both halves of the pattern).
EXISTING (green UNCHANGED): marker-popover-1738-gating.test.ts, MapDiscovery.issue1798.markerPopup.test.tsx, any stepper test, the #1547 panel-sync test. Batched runner (whole-suite OOMs).

## 8. 7A — GENUINE LIVE (feasible + high-value)
CORRECTION: real data IS available (the "no seeded data" belief was a CORS port bug — backend allowlists 5173/5174/3000, NOT 5220; Bangalore has 1736 listings/313 areas on :5174). Marker-click→popover is the ideal visual/interactive surface; S5 has NO migration (pure FE) so a READ-ONLY live 7A against shared backend is safe (the no-live-smoke rule is about migration writes).
- Port 5174 (Vite launched cd'd INTO the worktree for correct root/Tailwind cwd + VITE_SUPABASE_* in env). Backend up.
- URL: http://localhost:5174/discover?city=bangalore&journey=area-first → drill to an area with ≥2 residential listings (use a thanisandra-hennur-belt member so stepper total>1).
- Checks (parity vs pre-S5 main): (1) click listing marker → MarkerPopoverCard at pixel pos; (2) stepper index/total (total>1), prev/next advances + URL listing= updates + panel copper-highlight follows; (3) "Show in list" → popover closes, card stays highlighted + scrolled, URL listing= RETAINED; (4) dismiss (X/Esc/background) → popover closes, local cleared, URL listing= CLEARED, highlight clears; (5) console clean, no re-render storm.
- Discipline (memory): one clean tab, throttle, 3× each (console tool pools by domain not tab). Label MANUAL_PASS (CLAUDE.md §11), distinct from unit PASS.

## 9. Risks + completion criteria
R1 identity churn (highest — any slip to normal-deps useCallback re-binds the 3 map handlers; mitigate ctxRef + useCallback([]) + identity-stability test). R2 stale-closure (ctxRef.current write must be unconditional at hook top; freshness test). R3 missed read-back (enumerate ALL readers of selectedMarkerListing — resolvedPanelContent L1193, selectedPolygonListing L3427, stepper L3262/3264, render gate L3835 — and markerPixelPos — container onClick L3301/3304, render gate L3835 — all must resolve to the hook return; TS catches a dropped binding). R4 ordering (hook call above resolvedPanelContent L1193). R5 verbatim scrutiny (all gate logic byte-for-byte; only structural change = consolidating writes into selectMarkerSibling/showMarkerInList with identical effects).
Completion: new useMarkerSelection.ts + consumed; early block removed; handleShowMarkerInList→showMarkerInList; all existing marker/popover/stepper/panel-sync tests green UNCHANGED; new hook unit test incl identity-stability+freshness+URL-coupling spies; tsc no-new; build 0; lint no-new; live 7A on :5174 parity MANUAL_PASS; no URL-contract/#1738/#1798/#1547 behaviour change.

## Open question (non-blocking)
Whole-object vs narrow-field injection for the hook params. Architect recommends WHOLE-object for verbatim fidelity (the ctxRef already bundles {urlActions, urlState}; the handlers read 6 urlState fields + 2 actions). PLAN_REVIEW may prefer narrow-field for an explicit contract (S4 precedent) — either is behaviour-preserving; whole-object is lower translation risk here.
