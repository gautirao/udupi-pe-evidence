# #2858 batch 2: lower-level replacement map for five e2e/discover specs (Lane C of #2750)

Base: `44bf41a5` (main). Issue #2858 batch 2. Zero product change; test-only plus this doc.
No spec is deleted, moved or skipped; deletion needs the owner's own by-name comment on the PR.
The manifest (`docs/testing/e2e-retirement-manifest.csv`) is NOT edited by this PR; intended row text is in section 7.
Model: `docs/testing/e2e-retirement-map-2858-b1.md`. Approved plan: `.claude/handoffs/issue-2858-b2/plan.md` (+ `revision_1` for B2-N3, N11, N12).

Summary of dispositions (section 6): NO retirement candidates. All five specs STAY (L102, L116, L143, L155, L173).
Two specs carry STALE premises (source-read, spec NOT run): L173 (thanisandra) and L143 flow 5. They are flagged only.

## Coverage standard (Codex r2, inherited from B1)

A row is COVERED / NEW only if the cited tests cover the REAL chain the legacy spec exercises. Not counted as covering a
composed chain: injected props or state, a stubbed child, a mocked hook where the legacy observes HTTP, a callback-only check
where the legacy observes a re-issued request, leaf-only gating. Failing rows are PARTIAL (seam named), UNCOVERED,
BROWSER_ONLY, OBSOLETE-UI or STALE. Where in doubt the row was downgraded.
Citations are test file + exact `it` title (paths relative to `apps/web/src/` unless they start with `apps/api/`).
Cited existing titles were copied from the plan, which read them on `44bf41a5`. ONLY 8 of them were re-verified by `git grep -F` in this lane
(ScopedSearch, AreaMarkerLayer x3, AreaMarkerLayer.destinations, useDiscoverInteractionController, DiscoverPanelSurface x2); the rest are plan-cited and not re-checked.
Status legend: COVERED / NEW (an `it` added here with a credited mutation) / PARTIAL / UNCOVERED / BROWSER_ONLY / OBSOLETE-UI / STALE (source-read, not run).

## Facts found while implementing (read before the tables)

1. `MapDiscovery.issue1821.test.tsx` "AC2 (#1160/#1069 non-regression) ..." is RED on base `44bf41a5` (fails with the same assertion before and after this PR:
   `selectedArea` never reaches the mocked right panel within the `waitFor`). So the 1821 AC2 rows below are NOT counted as covered by that `it`.
2. `DiscoverMapCanvas.test.tsx` "DiscoverMapCanvas — Issue #2456 (owner ruling C2) ... editor OPEN: every draft member reaches PropertyMap ..." is RED on base
   (member records carry `count` and `schoolCount`; the test expects none). Pre-existing; unrelated; file exits 1 on base.
3. `useDiscoverUrlState.test.ts` has 17 pre-existing failures on base (journey default / startOver / changeCity group); identical list before and after this PR.
4. `useDiscoverPageState.test.ts` as a whole file runs out of heap (4 GB and 8 GB) on base, so a test in a pre-existing describe loops. The new describe was run with `-t`.
5. The plan's mutation B2-M1c does not discriminate for the "groupId only" row (`!groupId` already makes it false). A fifth row "no areaKey, no groupId, no scope" was added; it is the row that kills B2-M1c.
6. B2-M2 does NOT redden B2-N3 (the source URL never carries `clusterFocus`), exactly as revision_1 anticipated. B2-N3 is kept as an UN-CREDITED end-state check.
7. B2-M9 (`replace:false`) does not redden B2-N10; only B2-M6 and B2-M8 do. Credit is claimed accordingly.
9. FILE-GATE CAVEAT (option chosen: new tests stay in place, credit stated as `-t`-scoped). These new tests live in files that cannot gate as a whole on this base:
   B2-N1 (`useDiscoverPageState.test.ts`, whole-file OOM), B2-N2 (`MapDiscovery.issue1821.test.tsx`, red AC2 at base), B2-N11/N12 (`useDiscoverUrlState.test.ts`, 17 failures at base),
   B2-N13 (`DiscoverMapCanvas.test.tsx`, red #2456 test at base). Their mutation credit is valid ONLY when run under `-t <test name>`; none of those files can serve as a
   passing gate until the pre-existing failures are fixed or the tests are moved to dedicated files (follow-up, not done here). Healthy files: clusterFocus, useDiscoverMapDataController,
   navigation.applyNodeDelta, MapFilterSheet.history2711.
8. B2-N6's mutation B2-M5 is ALSO killed by the existing "#2750 N1a" `it`; N6 is credited only for its Back/Forward + entry-count legs on top.

## 1. `e2e/discover/area-drilldown-stale-viewport-1821.spec.ts` (manifest L102)

| id | legacy assertion | covering test | status |
|---|---|---|---|
| 1821-AC1-load | cold load region->group->area: leaflet + `area-result-summary` visible | `pages/__tests__/MapDiscovery.issue1821.test.tsx` "AC1: cold mount with groupId + areaKey + an inherited viewport from a DIFFERENT prior scope fits tightly to the resolved area's own bounds" | PARTIAL (PropertyMap mocked, url state injected; real seed, Leaflet, `area-result-summary` DOM not composed) |
| 1821-AC1-zoom | settled zoom > 12 | AC1 `it` above; `features/discover/state/useDiscoverJourneyTransitions.test.tsx` "fresh non-bare viewport: match found -> setSelectedArea + setPanToArea fires"; `components/map/__tests__/PropertyMap.areaPanner.test.tsx` "clamps maxZoom to AREA_PANNER_GROUP_MAX_ZOOM for synthetic group bounds" | PARTIAL + BROWSER_ONLY residual (Leaflet settle, `moveend` -> `reportViewport` -> URL zoom write-back) |
| 1821-AC1-derive | group/region drill-down classed NOT bare, per operand | AC1 sets groupId AND scope together; dropping one survives it | NEW B2-N1 (hook) + NEW B2-N2 (page) |
| 1821-AC2-load | bare area-only cold load | `MapDiscovery.issue1821.test.tsx` "AC2 (#1160/#1069 non-regression): ..." | PARTIAL, and that `it` is RED on base (fact 1): not counted |
| 1821-AC2-zoom | settled zoom unchanged (15) | `useDiscoverJourneyTransitions.test.tsx` "bare area-only prior viewport (#1821 AC2): match found -> setSelectedArea fires but setPanToArea is NOT overridden" | PARTIAL + BROWSER_ONLY residual |
| 1821-AC2-derive | bare URL -> `initialViewportWasBareAreaRef.current === true`; no areaKey -> false | none before this PR (every test injected the ref) | NEW B2-N1 |

Disposition: STAYS. Residual: real Leaflet settle + URL write-back (BROWSER_ONLY), real backend/seed, `area-result-summary` DOM.

## 2. `e2e/discover/issue-1956-pr3-area-clustering.spec.ts` (manifest L116)

Cluster focus is URL state on main (`state/url/clusterFocus.ts`), not component state as the spec header says; #2750 PR-5 added router-level history tests.

| id | legacy assertion | covering test | status |
|---|---|---|---|
| 1956-T1 | lone Direction child -> `area-single-marker`, count parity with `/counts` | `components/map/__tests__/AreaMarkerLayer.destinations.test.tsx` "renders a lone (spatially isolated) AREA as a single-AREA marker with its exact schoolCount, no \"+N\" line"; `markerPrimitives.byteIdentity.test.tsx`; `AreaCountRollupServiceTest` `countForNode_clusterSumsUniqueDescendantAreasOnly_noDoubleCounting`; `NavigationControllerTest` `getCounts_node_returnsRolledUpTotalsOnly_structurallySeparateFromGetNode` | COVERED per layer; PARTIAL as one chain (no test feeds one count payload through hook -> marker). Java not run here. |
| 1956-T2 | cluster tap focuses panel without changing `node=` / history | `AreaMarkerLayer.destinations.test.tsx` (cluster click `it`s); `DiscoverAreasJourneyPanel.test.tsx` "does not mutate node/browser-history state when focusing or clearing a cluster (AC4.5 item 4)"; `clusterFocus.test.ts` "selecting a cluster REPLACEs the current entry: Back skips it and lands on the entry before" | PARTIAL (marker -> URL -> panel not composed; pixel-grid clustering + real tap BROWSER_ONLY) |
| 1956-T3 | "Show all areas" restores the full child list | `DiscoverAreasJourneyPanel.showAll.test.tsx` "clicking \"Show all 3 areas\" clears focus AND restores exactly node.children.length (3) rows in the normal navigation-level-panel"; `clusterFocus.test.ts` "applyClusterFocusDelta(null) clears an existing focus (BR6 — \"Show all\")" | PARTIAL (callback -> URL write -> list not composed) |
| 1956-T4 | focused panel subset == map cluster member set | `AreaMarkerLayer.destinations.test.tsx` (controlled-subset `it`); `DiscoverAreasJourneyPanel.test.tsx` "shows exactly the focused member subset (identical areaKey set, AC4.12) — never the third, unfocused member" | PARTIAL (same injected set on both sides) |
| 1956-T5 | AC4.7: focus a cluster, leave, revisit: no stale subset | single hops: `navigation.applyNodeDelta.test.ts` "goToNode clears an existing clusterFocus param from the real URL"; `clusterFocus.test.ts` "replace(cluster focus) then push(area) then Back restores the cluster-focused entry exactly" | PARTIAL. B2-N3 adds the legacy legs end to end but is NOT mutation-credited (fact 6): the clearing line is unexercised by the legacy legs |
| 1956-T6 | selecting a member removes stale cluster/single markers | `AreaMarkerLayer.destinations.test.tsx` "removes a single-AREA marker when levelKind transitions to \"listings\"" | COVERED at the layer; real-Leaflet DOM absence BROWSER_ONLY |
| 1956-T7 | cluster-focus panel keeps region heading + node count | `DiscoverAreasJourneyPanel.test.tsx` "AC12: retains the region heading (journey.node.displayLabel)", "AC12: retains the node-level listing-count subtitle, from the SAME journey.nodeCount source NavigationLevelPanel uses" | PARTIAL (count injected via `journey.nodeCount`) |

Disposition: STAYS. No Java test added (optional B2-N0 not written).

## 3. `e2e/discover/issue-2204-canonical-node-browser-proof.spec.ts` (manifest L143)

| id | legacy assertion | covering test | status |
|---|---|---|---|
| 2204-F1-uri | node identity per hop, no areaKey/groupId written, 3 PUSH entries | `navigation.applyNodeDelta.test.ts` "#2750 N1 ... City→Direction→Area then Back×2 yields [AREA, D, null] ..."; `clusterFocus.test.ts` push test | PARTIAL (click -> card -> `goToNode` not composed) |
| 2204-F1-scope | AREA leaf: marker `nodeKey` == "a:" + panel `areaKeys` | `useDiscoverMapDataController.test.ts` "a resolved canonical AREA leaf scopes the marker request to that node — nodeKey=... is present on the URL (THE core fix)" and the N3 pair | PARTIAL (resolved node injected) |
| 2204-F1-intent | `intent=rent` survives every PUSH and every Back/Forward leg, 3 added entries | single forward hops: `navigation.applyNodeDelta.test.ts` "#2750 N1a ... all keep intent=rent"; Back/Forward + entry count: NEW B2-N6 | NEW B2-N6 (mutation also killed by N1a, fact 8) |
| 2204-F2 | school-first area re-pick: one PUSH, schoolId/areaKey cleared, no markers request | `navigation.journeyPreservingNodeSelection.test.ts` "writes node=, keeps journey=school-first, and clears an existing schoolId — in ONE write"; `useDiscoverMapDataController.test.ts` "G2-N9 schoolId guard ..." | PARTIAL (writer and gate separate) |
| 2204-F3 | agri-first re-pick: region/maxKm kept, unscoped markers | `navigation.journeyPreservingNodeSelection.test.ts` agri `it`s; `useDiscoverMapDataController.test.ts` "rule 3 / AC6: agri-first marker request is byte-identical to pre-#2185 behaviour ..." | PARTIAL |
| 2204-F4-panel | journeyless `groupId=` cold load shows `area-group-focus-panel` | `DiscoverPanelSurface.test.tsx` "mounts AreaGroupFocusPanel — not the group-blind canonical hierarchy panel — for the journeyless groupId cold-load state" | PARTIAL (group injected) |
| 2204-F4-map | past zoom 12 the marker fetch narrows to exactly the group's 3 areaKeys; below it no markers fetch | none before this PR (no live group-scope arm, no zoom arm for group scope) | PARTIAL, mutation-credited B2-N4 (below band, zero calls) + B2-N5 (past band, exact keys). Seam: `nav` and `groupAreaKeysForMapData` are INJECTED into the controller; real group resolution (`/area-groups` -> `groupId` -> keys) -> controller is not composed |
| 2204-F4-tail | member click / "All areas" / Direction click, 2 PUSH, Back/Forward | `DiscoverPanelSurface.test.tsx` "\"All areas\" dispatches the atomic groupId-clearing city-root entry ..."; `useDiscoverJourneySwitchController.test.ts` "an unresolved/stale areaKey (404) never navigates and raises an honest destructive toast" | PARTIAL (dispatch-level) |
| 2204-F5 | school-first + groupId: schools panel mounts | `DiscoverPanelSurface.test.tsx` "school-first + groupId (group resolved, no area): the sum over every primary-surface testid is exactly 1, and that one is the group-focus panel" contradicts the premise | STALE (source-read, not run): flagged for the owner; manifest already says stale DELETE_DUP |

Disposition: STAYS (flows 1-4 PARTIAL compositions; flow 5 flagged stale; spec runs against the real fixture backend).

## 4. `e2e/discover/issue-2711-map-filter-intent-commit.spec.ts` (manifest L155)

| id | legacy assertion | covering test | status |
|---|---|---|---|
| 2711-AC1-delta | open -> Rent -> budget -> Apply adds exactly ONE history entry | none observed `pushState`/`back` before this PR | PARTIAL, mutation-credited B2-N7 (sheet) + B2-N9. Seam: N9/N10's `SheetHarness` (`MapFilterSheet.history2711.test.tsx`, the `SheetHarness` function) HAND-WIRES `onApply`/`onIntentChange` to the real `useDiscoverUrlState` actions; the page's own wiring (`useDiscoverPageState.handleFiltersChange` -> `buildMapSurfaceModel` -> pill -> sheet) is not composed |
| 2711-AC1-race | settled URL carries intent=rent AND the filter after the 300 ms debounce | callback level: `MapFilterSheet.test.tsx` "calls onIntentChange with the new intent and the transitioned filters, and does NOT also call onApply" | PARTIAL, mutation-credited B2-N9 (real BrowserRouter + real `useDiscoverUrlState`; race reproduced under jsdom by B2-M8). Seam: hand-wired harness, see 2711-AC1-delta |
| 2711-AC2 | Back after Apply lands on the pre-open URL, sheet closed | none | PARTIAL, mutation-credited B2-N10 (via B2-M6 and B2-M8 only). Seam: hand-wired harness, see 2711-AC1-delta |
| 2711-AC3a | List and Map Buy->Rent identical URLs (Plot dropped) | `intentTransition.test.ts` "Buy → Rent: drops residential_plot when it is the only selected type"; `MapFilterSheet.test.tsx` "Buy→Rent resets the budget and drops Residential Plot" | PARTIAL, mutation-credited B2-N12 (parity + absolute, row 1). Seam: the Map-arm override is built IN THE TEST (`applyIntentTransition` + `toDiscoverUrlFilters`), mirroring `MapFilterSheet.handleApply`; the sheet itself is not in the loop |
| 2711-AC3b | Rent->Buy with a rent budget: identical URLs, budget reset | `useDiscoverUrlState.test.ts` "AC2/budget-reset: Rent → Buy also resets both priceMin and priceMax" (List arm only) | PARTIAL, mutation-credited B2-N12 (row 2); same seam as row 1 |
| 2711-AC4 | Cancel (Escape) commits nothing; reopen re-seeds | `MapFilterSheet.test.tsx` "Cancel never calls onIntentChange even after staging a Rent switch", "reopen re-seeds the draft from whatever is currently applied (selections preserved)" | PARTIAL: callback-only at the component (the legacy observes the pre-open URL); the history half is NEW B2-N8 (Cancel pops the pushed entry once, sheet-level `history` spies) |
| 2711-AC5 | a bedrooms edit staged with the intent switch is not dropped (`beds=2`) | `MapFilterSheet.test.tsx` "a bedrooms edit staged in the SAME visit as an intent switch is NOT dropped — filtersOverride carries the full draft" (callback-level) | PARTIAL, mutation-credited B2-N11 (override -> URL serialization in ONE REPLACE). Seam: the override is passed DIRECTLY to `setIntent`, not produced by the sheet |
| 2711-env | mobile 390x844 overlay reachability, real vaul gestures, overlay lat/lon/zoom | `DiscoverMapCanvas.test.tsx` flat-prop fixtures only | BROWSER_ONLY (pill -> sheet -> page wiring remains PARTIAL) |

Disposition: STAYS. Trim candidate for AC1/AC2/AC5 rows only after an owner-approved follow-up; not claimed here.

## 5. `e2e/discover/thanisandra-hennur-belt-marker-degradation.spec.ts` (manifest L173)

Stale evidence is SOURCE-READ ONLY; the spec was NOT run (no Playwright in this batch).

| id | legacy assertion | covering test | status |
|---|---|---|---|
| E1 | 29-area group: fewer pins than areas; panel `area-group-level2` | `components/map/__tests__/AreaMarkerLayer.test.tsx` "dense group (29 areas) + enableDegradation → renders <=12 representative labelled pins, not all 29"; page gate `enableAreaMarkerDegradation={mapZoom <= areaLayerMaxZoom && !!focusedGroupAreas}` | PARTIAL: layer proved; gate NEW B2-N13; panel half STALE (source-read, not run) |
| E2 | `area-cluster-marker` chip text `+N areas` | `AreaMarkerLayer.test.tsx` "dense group + enableDegradation → renders area-cluster chip(s) with an AREA-count label (\"+N nearby areas\"), never a property-count sum" | COVERED at the layer; legacy regex `/\+\d+ areas?/` STALE vs current copy "+N nearby areas · Tap to expand" |
| E3 | chip click never writes `areaKey=`, keeps `groupId=` | `AreaMarkerLayer.test.tsx` "clicking an area-cluster chip does NOT call onAreaClick (never drills straight to listings) — it flies to split + fires onAreaClusterClick"; `useDiscoverInteractionController.test.ts` "handleAreaClusterClick highlights exactly the cluster member areaKeys (issue #1806 FIX-5d)" | COVERED by structure; PARTIAL as a chain |
| E4 | pin click opens `marker-popover-card` | `AreaMarkerLayer.test.tsx` "clicking a representative pin in the degraded layer still calls onAreaClick (same click contract as the legacy full pin)" | STALE-premise / PARTIAL (source-read: `isMarkerPopoverEligible` is false for `area-first&groupId` with no areaKey) |
| E5 | panel lists all areas, "Showing X of N areas" | `AreaMarkerLayer.test.tsx` "onMarkersComputed fires with (shownRepresentativeCount, totalAreaCount) after bucketing" | OBSOLETE-UI (`browse-all-area-*`, `area-marker-shown-of-total-note` not rendered by any component; source-read) |
| E6 | panel search promotes the pin | `AreaMarkerLayer.test.tsx` "forced-always: searchMatchKeys promotes a matching clustered area to a full labelled pin" | PARTIAL / OBSOLETE-UI (search input not rendered) |
| E7 | school search scoped to the deep-linked city | `components/discover/__tests__/ScopedSearch.test.tsx` "passes areaKeys through to useSchoolSearch as the 3rd argument" | COVERED in isolation; OBSOLETE-UI (component mounted nowhere; source-read) |

Disposition: STAYS on disk. The owner may rule on delete-as-stale by name; nothing is deleted here.

## 6. New tests, mutation proof and dispositions

Evidence logs (one per mutation run, captured BEFORE restore): `.claude/handoffs/issue-2858-b2/mutation/B2-M*.log` (untracked; not committed).
After every restore, `git diff --stat -- apps/web/src ':!**/__tests__/**' ':!**/*.test.*'` was empty.
"Red" means the new `it` turned red under that mutation in the log; "Green" means it stayed green (the mutation targets a different row/test).

| New test | File | Mutation (transient) | New `it` result | Credited |
|---|---|---|---|---|
| B2-N1 "initialViewportWasBareAreaRef derivation (#1821): <shape> -> <expected>" (5 rows) | `hooks/__tests__/useDiscoverPageState.test.ts` | M1a drop `!urlState.groupId &&` | red: row "areaKey + groupId" only (exit 1) | Y |
| | | M1b drop `!urlState.scope &&` | red: row "areaKey + scope" only (exit 1) | Y |
| | | M1c `!!urlState.areaKey` -> `true` | red: row "no areaKey, no groupId, no scope" only (exit 1); first attempt with 4 rows stayed green (exit 0), hence the 5th row | Y |
| B2-N2 "AC1b/AC1c (#1821): groupId alone / scope alone plus an inherited viewport still fits tightly ..." (2 rows) | `pages/__tests__/MapDiscovery.issue1821.test.tsx` | M1a | red: "groupId alone" row only (exit 1; the base-red AC2 `it` is also red, unrelated) | Y |
| | | M1b | red: "scope alone" row only (exit 1) | Y |
| B2-N3 "revisit (#2858/#1956 AC4.7): focus a cluster on SW, Back to root, visit W, Back to root, re-enter SW ..." | `state/url/__tests__/clusterFocus.test.ts` | M2 delete `clearClusterFocusParam(next)` in `applyNodeDelta` | Green; only the existing "replace(cluster focus) then push(area) then Back ..." went red (exit 1) | N (un-credited end-state check, per revision_1) |
| B2-N4 "2204-F4 group focus below the area-layer zoom band ... ZERO markers calls" | `controllers/useDiscoverMapDataController.test.ts` | M3 `shouldShowMarkers(mapZoom)` -> `true` | red (exit 1); N5 green | Y |
| B2-N5 "2204-F4 group focus past the zoom band: exactly one markers call at mapZoom 14 ..." | same | M4a `groupAreaKeys: groupAreaKeysForMapData` -> `undefined` | red (exit 1); N4 green | Y |
| | | M4b live `{ kind: 'areas', areaKeys }` -> `{ kind: 'city' }` in `markerScope.ts` | red, N5 alone (exit 1) | Y |
| B2-N6 "2204-F1: an active intent=rent survives 3 deliberate node PUSHes and 3 Back + 3 Forward legs ..." | `state/url/__tests__/navigation.applyNodeDelta.test.ts` | M5 add `next.delete('intent')` in `applyNodeDelta` | red (exit 1); existing N1a also red | Y (overlap with N1a stated) |
| B2-N7 "opening pushes exactly one history entry and Apply with an intent switch neither pushes a second nor calls history.back()" | `components/map/__tests__/MapFilterSheet.history2711.test.tsx` (new) | M6 `consumeHistoryEntry()` in `handleApply` | red (exit 1) | Y |
| B2-N8 "Cancel (Escape) consumes the pushed entry: history.back() exactly once, then a re-open pushes a fresh entry" | same | M7 drop `consumeHistoryEntry()` in `handleCancel` | red, N8 alone (exit 1) | Y |
| B2-N9 "AC1: Rent + a staged filter + Apply: after the 300 ms debounce window the URL carries intent=rent AND the filter, and window.history.length grew by exactly 1" | same | M8 intent-changed Apply also calls `onApply(draft)` | red (exit 1): the debounced race DOES reproduce under jsdom | Y |
| | | M9 `setIntent` `{ replace: true }` -> `{ replace: false }` | red (exit 1) | Y |
| | | M6 | red (exit 1) | Y |
| B2-N10 "AC2: after Apply, one browser Back lands exactly on the pre-open URL and the sheet is closed" | same | M8 | red (exit 1) | Y |
| | | M6 | red (exit 1) | Y |
| | | M9 | Green (plan expected red; it is not) | N for M9 |
| B2-N11 "setIntent('rent', override) serializes the whole staged set (beds, priceMax, intent) in ONE REPLACE with no history growth" | `hooks/__tests__/useDiscoverUrlState.test.ts` | M10 `if (filtersOverride)` -> `if (false)` | red, N11 alone (exit 1) | Y |
| | | M9 | red (exit 1; existing AC6 single-REPLACE `it` also red) | Y |
| B2-N12 "List and Map arms produce an identical URL ... and the absolute outcome holds" (2 rows) | same | M11 drop `next.delete('priceMin')` in the List branch | red, both rows (exit 1; existing budget-reset `it`s also red) | Y |
| B2-N13 "dense-group degradation is enabled only for a focused group at or below the area-layer zoom ..." (3 rows) | `views/DiscoverMapCanvas.test.tsx` (+1 additive `data-enable-area-marker-degradation` attribute on the PropertyMap mock) | M12a drop `&& !!focusedGroupAreas` | red: row 3 only (exit 1) | Y |
| | | M12b `<=` -> `>` | red: rows 1 and 2 (exit 1) | Y |

Per-spec disposition (all STAY):

| spec | new | PARTIAL | other | disposition |
|---|---|---|---|---|
| area-drilldown-stale-viewport-1821 | N1, N2 | load/zoom rows | BROWSER_ONLY residual; existing AC2 `it` RED on base | STAYS |
| issue-1956-pr3-area-clustering | N3 (un-credited) | T2, T3, T4, T5, T7 | T1, T6 COVERED per layer | STAYS |
| issue-2204-canonical-node-browser-proof | N4, N5, N6 | F1-uri, F1-scope, F2, F3, F4-panel, F4-tail | F5 STALE (source-read) | STAYS |
| issue-2711-map-filter-intent-commit | N7-N12 | pill wiring; AC4 (Cancel is callback-level and history-spy only; the legacy pre-open URL is not verified) | env BROWSER_ONLY | STAYS |
| thanisandra-hennur-belt-marker-degradation | N13 | E1, E4, E6 | E2, E3, E7 covered per layer; E5/E6/E7 OBSOLETE-UI; E4 STALE | STAYS pending owner ruling |
| property-request-card (L163) | N22-N28, N30-N32 | T1e, T1g, T1h, T2d, T3a, T3d, T4a-2, T4a-3, T4b-3, T4c-3, T5a, T9b, T9c, T9d, T6c, T8a, T11c, T13c | 33 EXISTING; T12c, T12d, T13a, T13e BROWSER_ONLY (x9 viewports) | STAYS (D5 MOVE_DOWN + BROWSER_ONLY geometry probes retained) |

## 7. Intended manifest row text (NOT applied by this PR)

Decision stays MOVE_DOWN, status stays SCHEDULED(#2858).

- L102: "#2858 batch 2 added B2-N1/N2 (bare-area derivation, per operand, hook- and page-level; mutation-proven). The camera gate was already covered; the existing 1821 AC2 page `it` is red on main. Leaflet settle + URL zoom write-back and the real backend/seed are BROWSER_ONLY. NOT a retirement candidate; the spec STAYS."
- L116: "#2858 batch 2 added B2-N3, a router-level revisit of the URL-backed clusterFocus (not mutation-credited: the clearing line is unexercised by the legacy legs). Marker, panel, count and rollup layers are covered separately; the marker -> URL -> panel chain and real-Leaflet clustering are not composed. NOT a retirement candidate; the spec STAYS."
- L143: "#2858 batch 2 added B2-N4/N5 (group-focus marker fetch below/above the area-layer zoom band) and B2-N6 (intent survives node PUSH + Back/Forward). Flows 1-4 remain PARTIAL compositions; flow 5 is contradicted by DiscoverPanelSurface.test (group-focus panel wins) and appears stale (source-read, not run). NOT a retirement candidate; the spec STAYS."
- L155: "#2858 batch 2 added B2-N7..N12 (history entry accounting, Cancel pops, debounce race and Back-to-pre-open through the real router and setIntent, setIntent filtersOverride, List/Map parity). Mobile overlay reachability and real vaul gestures are BROWSER_ONLY; the pill -> sheet wiring is flat-prop. NOT a retirement candidate; the spec STAYS."
- L173: "#2858 batch 2 added B2-N13 (DiscoverMapCanvas degradation gate). E1-E3, E7 are covered at the layer; E4-E6 depend on UI production no longer renders and E2's regex no longer matches the chip copy (source-read, spec not run). STAYS pending an owner ruling."
- L163: "#2858 batch 2 (L163 add-on) added B2-N22..N28 and B2-N30..N32 (10 web tests, 16 transient mutations: host context line across single/multi/POLYGON/VIEWPORT/rent, school BUY/RENT submit + context line across both panels, unticked consent hint + aria-describedby + submit-handler guard, 429 exclusivity, focus-geometry clientHeight/3 fallback and non-overflowing ancestor skip, refetch dim OFF/release arms on area and school hosts; B2-N20/N21 Java removed per revision_1, B2-N29 deferred). 33 rows EXISTING, 7 NEW, 18 PARTIAL, 4 BROWSER_ONLY (T12c, T12d, T13a, T13e across 9 journey/viewport combinations). Spec STAYS per owner ruling D5."

## 8. Final GREEN runs (this branch, restored product code)

Run from `apps/web` with `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=dummy-local-key VITE_API_BASE_URL=http://127.0.0.1:8080 npx vitest run <file>`.

| file | exit | counts |
|---|---|---|
| `src/features/discover/views/DiscoverMapCanvas.test.tsx` | 1 | 78 passed / 1 failed (pre-existing #2456 failure, fact 2); `-t "dense-group degradation"`: exit 0, 3 passed |
| `src/pages/__tests__/MapDiscovery.issue1821.test.tsx` | 1 | 3 passed / 1 failed (pre-existing AC2, fact 1); both new rows pass |
| `src/hooks/__tests__/useDiscoverPageState.test.ts` | OOM whole file (pre-existing, fact 4) | `-t initialViewportWasBareAreaRef`: exit 0, 5 passed / 31 skipped |
| `src/features/discover/state/url/__tests__/clusterFocus.test.ts` | 0 | 19 passed |
| `src/features/discover/controllers/useDiscoverMapDataController.test.ts` | 0 | 44 passed |
| `src/features/discover/state/url/__tests__/navigation.applyNodeDelta.test.ts` | 0 | 11 passed |
| `src/features/discover/components/map/__tests__/MapFilterSheet.history2711.test.tsx` | 0 | 4 passed |
| `src/features/discover/components/map/__tests__/MapFilterSheet.test.tsx` (unchanged, regression) | 0 | 18 passed |
| `src/hooks/__tests__/useDiscoverUrlState.test.ts` | 1 | 247 passed / 17 failed (the same 17 fail on base, fact 3); `-t setIntent`: exit 0, 13 passed |
| `src/features/discover/area-selected/sections/__tests__/ListingsBody.requestCard.test.tsx` | 0 | 33 passed (base: 27 passed) |
| `src/components/discover/panels/__tests__/SchoolRadiusRequestCard.test.tsx` | 0 | 32 passed (base: 26 passed) |
| `src/components/discover/__tests__/RequestPropertyCard.test.tsx` | 0 | 63 passed (base: 59 passed) |
| `src/components/discover/__tests__/RequestPropertyCard.focusGeometry.test.tsx` (new) | 0 | 2 passed |

eslint on the changed test files: exit 0, 0 errors.
Not run: Playwright/E2E (not required), Java tests, differential tsc.

## 9. `e2e/discover/property-request-card.spec.ts` (manifest L163)

Approved plan: `.claude/handoffs/issue-2858-b2/plan-review-l163.toml` (`revision_1`).
15 test blocks (33 generated tests; T12 and T13 are 3 journeys × 3 viewports each).
Row totals across 62 assertions: EXISTING 33, NEW 7, PARTIAL 18, BROWSER_ONLY 4.

### 9.1 Per-assertion replacement map (62 rows)

| id | legacy assertion | covering test | status |
|---|---|---|---|
| 163-T1a | By Area genuine zero reached via the real request; no error surface | `AreaLeafListingsSurface.requestCardSettled1793.test.tsx` "settled zero: the card renders"; `ListingsBody.requestCard.test.tsx` "settled success + zero results: the card renders as a sibling AFTER the zero-result recovery" | EXISTING |
| 163-T1b | card visible, CTA aria-expanded false then true, Send visible | `RequestPropertyCard.test.tsx` "renders the collapsed card when the flag is \"true\"" and "expands inline, shows the read-only context line and the consent copy with the exact deletion address" | EXISTING |
| 163-T1c | prefill line starts Buy/Rent and names the area | `ListingsBody.requestCard.test.tsx` "request card context line comes from the scope: %s -> %s" | NEW B2-N22 |
| 163-T1d | exactly one POST, application/json, NO Authorization header | `RequestPropertyCard.test.tsx` "201: posts the context + buyer fields + consentVersion WITHOUT an Authorization header, then shows an inline status and moves focus to it" | EXISTING |
| 163-T1e | success status visible, card gone (testid count 0) | 201 `it` asserts `role=status` and Send gone, not testid absence | PARTIAL |
| 163-T1f | payload: AREA, BUY, city, areaKey, areaLabel, WHATSAPP, budgets, consentVersion | `RequestPropertyCard.test.tsx` "201: posts ..." and "normalises a spaced +91 phone and honours the WhatsApp choice and RENT/MAP context (no area key/label)"; `ListingsBody.requestCard.test.tsx` "AREA scope: journey AREA with the real area key/label, city and BUY intent" | EXISTING |
| 163-T1g | DB row columns and status RECEIVED | `PropertyRequestControllerTest` "B3: valid POST -> 201 {id,status,createdAt} and nothing else; phone never echoed"; `PropertyRequestPersistenceIT` "B5/B6..." (Docker-gated, not run here) | PARTIAL |
| 163-T1h | phone_enc starts ENC: and has no plaintext digits | `PropertyRequestPersistenceIT` "B5: raw phone_enc starts with ENC: and lacks the plaintext digits; phone_hash is present and is not the digits" (Docker-gated, not run here) | PARTIAL |
| 163-T1i | admin row shows masked phone +91******last4, WhatsApp, area | `PropertyRequestControllerTest` "B6: admin GET -> 200 with phoneMasked, and no plaintext/ciphertext/hash anywhere in the body"; `PropertyRequests.test.tsx` "requests the capped list with the authenticated client and renders the masked phone only" | EXISTING |
| 163-T1j | plaintext phone absent from admin text and HTML | Same two tests (whole JSON body; `document.body.textContent`) | EXISTING |
| 163-T2a | Schools genuine zero: empty state plus card | `SchoolRadiusRequestCard.test.tsx` "settled zero result: card renders inside the empty state" (both panels); `LegacyRightPanelBridge.schoolRadiusZeroCount1793.test.tsx` "settled, uncapped zero: the card renders in the empty state" | EXISTING |
| 163-T2b | payload journey SCHOOL, intent BUY, city, school and radius in areaLabel | `SchoolRadiusRequestCard.test.tsx` "school card submits journey SCHOOL with intent %s -> %s and shows the exact context line %s" | NEW B2-N23 |
| 163-T2c | submit -> Request received (schools) | `SchoolRadiusRequestCard.test.tsx` "a background refetch does not unmount the card: typed phone and the success state survive" | EXISTING |
| 163-T2d | DB journey=SCHOOL, intent BUY, city, ENC | Web payload is 163-T2b; no executed persistence round-trip in this batch (B2-N20 Java removed in `revision_1`) | PARTIAL |
| 163-T3a | rscope=vp committed; zero text 'No matching homes in the visible map area' | `AreaZeroResultRecovery.test.tsx` "VIEWPORT names the visible map area, never a previously-selected area"; `rscope=vp` commit covered in viewport-search rows | PARTIAL |
| 163-T3b | payload journey MAP, no invented areaKey/areaLabel, city | `ListingsBody.requestCard.test.tsx` "%s scope: journey MAP and NO invented area key/label" (POLYGON and VIEWPORT rows) | EXISTING |
| 163-T3c | submit -> Request received (map) | Same component C2 helper (201 POST for both MAP kinds) | EXISTING |
| 163-T3d | DB journey=MAP, area_key NULL | Web payload is 163-T3b; no executed persistence round-trip in this batch (`revision_1`) | PARTIAL |
| 163-T4a-1 | area 500: error surface + Retry, recovery absent, card absent | `ListingsBody.requestCard.test.tsx` "settled=true + error + nothing to fall back on: error and Retry render, and NO request card"; `AreaLeafListingsSurface.requestCardSettled1793.test.tsx` "hidden while %s" (error row) | EXISTING |
| 163-T4a-2 | Retry re-issues the area request | Callback level (`onRetryListings` called once) | PARTIAL |
| 163-T4a-3 | MutationObserver: card never rendered at any frame | RTL asserts per-state renders; card lives only in the zero-result branch (`ListingsBody.tsx:240`) | PARTIAL |
| 163-T4b-1 | school-radius 500: error block + Retry, empty state absent, card absent | `SchoolRadiusListings.error1793.test.tsx` "error + no listings renders the error block with Retry, NOT the \"no homes within N km\" empty state"; `SchoolRadiusRequestCard.test.tsx` "hidden when %s" (error row) | EXISTING |
| 163-T4b-2 | Retry re-issues the school-radius request | `AreaFirstJourneyPanel.errorSignals1793.test.tsx` "a failed school-radius query renders the error block (not \"no homes within N km\") and Retry calls the REAL refetch once"; `LegacyRightPanelBridge.schoolRadiusError1793.test.tsx` | EXISTING |
| 163-T4b-3 | card never rendered at any frame | As 163-T4a-3 | PARTIAL |
| 163-T4c-1 | viewport 500: error + Retry, 'No matching homes' absent, card absent | `AreaFirstJourneyPanel.errorSignals1793.test.tsx` "a failed anon viewport request with nothing retained renders the error + Retry, NOT the zero-result recovery, and Retry re-issues the VIEWPORT query" | EXISTING |
| 163-T4c-2 | Retry re-issues the viewport request | Same test + `LegacyRightPanelBridge.anonViewportRetry.test.tsx` | EXISTING |
| 163-T4c-3 | card never rendered at any frame | As 163-T4a-3 | PARTIAL |
| 163-T5a | response held: skeleton visible, card and CTA absent on every sample | Per-state gate from injected props in `ListingsBody.requestCard.test.tsx` `it.each` "hidden when %s"; temporal every-sample claim downgraded (`revision_1`) | PARTIAL |
| 163-T5b | after the real 200-empty: recovery and card visible, skeleton gone | `AreaLeafListingsSurface.requestCardSettled1793.test.tsx` "F1a: an anonymous keepPreviousData placeholder [] (fetching false) shows NO card; it appears when the new key settles"; `useDiscoverMapData.requestCardSettled1793.test.ts` | EXISTING |
| 163-T9a | at 3 km a settled zero shows the card | As 163-T2a | EXISTING |
| 163-T9b | click Try 5 km: radiusKm=5; previous [] stays; no skeleton | `useDiscoverMapData.requestCardSettled1793.test.ts` "F1a: a radius change over a placeholder [] is NOT settled while the new radius loads, though panel loading and isFetching read false" (hook -> panel seam not composed) | PARTIAL |
| 163-T9c | card absent for the whole hold | Panel gates EXISTING (`SchoolRadiusRequestCard`, `AreaLeafListingsSurface`) + hook derivation EXISTING; composition injected | PARTIAL |
| 163-T9d | after the real 200-empty the card appears | Separately tested seams (panel gate + hook settled-true arm); composition gap (`revision_1`) | PARTIAL |
| 163-T6a | consent unticked: aria-checked false, Send disabled | `RequestPropertyCard.test.tsx` "keeps submit disabled until consent is ticked, and a click on it sends nothing" | EXISTING |
| 163-T6b | hint 'Tick the box above to send' visible while unticked | `RequestPropertyCard.test.tsx` B2-N24 (hint text visible/removed) + B2-N25 (`aria-describedby` wired/removed) | NEW B2-N24 + B2-N25 |
| 163-T6c | Enter in the phone field sends no POST | B2-N26 Leg A pins the submit-handler guard (`fireEvent.submit(form)` with consent unticked sends 0 POSTs); Enter key journey across disabled button is uncredited (`revision_1`) | PARTIAL (handler guard NEW B2-N26) |
| 163-T6d | positive control: tick enables Send; the tick alone sends nothing | Existing disabled-until-ticked `it` + B2-N26 Leg C (`fireEvent.submit(form)` after tick sends 1 POST with `consent: true`) | EXISTING (+ B2-N26 Leg C) |
| 163-T7a | 500 -> 'could not send' + Retry, never success | `RequestPropertyCard.test.tsx` `it.each` "%s: error alert + Retry; Retry re-submits the same payload and only then shows success" (500 and 404 rows) | EXISTING |
| 163-T7b | Retry re-sends and is still not success | Same `it.each` + "500 -> edit the phone -> Retry sends the CURRENT phone, not the stale one (CR F4)" | EXISTING |
| 163-T7c | 429 -> rate-limit message; the 'could not send' text absent; never success | `RequestPropertyCard.test.tsx` "429 shows only the rate-limit alert: no 'We could not send your request' text and no Retry button" | NEW B2-N32 |
| 163-T7d | 400 with fields: server phone message on the field, summary, aria-invalid | `RequestPropertyCard.test.tsx` "400: maps fields[] to per-field errors (budgetRangeValid -> budget) plus a summary; no success state" | EXISTING |
| 163-T8a | hostile requirement stored verbatim in the DB row | Web sends trimmed text verbatim; no executed persistence round-trip in this batch (`revision_1`, B2-N21 removed) | PARTIAL |
| 163-T8b | admin shows the hostile string as literal text; no img/script; window.__xss undefined | `PropertyRequests.test.tsx` "renders hostile free text as literal text: no element is created from it" | EXISTING |
| 163-T10a | phone in requirement: exact inline error, aria-invalid, focus, describedby, no success | `RequestPropertyCard.test.tsx` `it.each` "rejects %j: exact inline error on the requirement field, focus moves there, NO POST" (17 inputs) | EXISTING |
| 163-T10b | no POST in the 1.5 s negative window | Same `it.each` (`fetchMock` not called) | EXISTING |
| 163-T10c | no DB row for the rejected requirement | `PropertyRequestControllerTest` "PR-C r2: phone-like text in requirement/areaLabel/city -> 400 on that field, exact message, no echo, no log, service not called" | EXISTING |
| 163-T10d | positive control: corrected requirement clears the error and sends | `RequestPropertyCard.test.tsx` "the inline error clears when the buyer edits the requirement, and a corrected requirement then sends"; `it.each` "accepts %j: the request is sent" | EXISTING |
| 163-T11a | server 400 on requirement, exact message, number never echoed | Same Java PR-C r2 test | EXISTING |
| 163-T11b | no row persisted | Same Java test (service not called) | EXISTING |
| 163-T11c | client message constant equals the server message | Two literals (`RequestPropertyCard.tsx:119` and Java validator), no cross-language pin | PARTIAL |
| 163-T12a | (x9) after Send: message visible and the requirement is focused | As 163-T10a (`toHaveFocus` via `waitFor`) | EXISTING |
| 163-T12b | (x9) focus without the default scroll; only the nearest scroller moves, clear of the sticky header; never scrollIntoView/window.scrollTo | Existing sticky-dominant and no-scroller `it`s in `RequestPropertyCard.test.tsx` + `RequestPropertyCard.focusGeometry.test.tsx` B2-N27 (`clientHeight/3` fallback with no sticky header) and B2-N28 (skip non-overflowing `overflow:auto` ancestor; B2-N29 containing-sticky deferred) | NEW B2-N27 + B2-N28 |
| 163-T12c | (x9) 5 edge points pass elementFromPoint and the textarea is inside the viewport | Needs real layout; jsdom has none | BROWSER_ONLY (RETAIN) |
| 163-T12d | (x9) window.scrollY, scrollingElement.scrollTop and root/main/header/body tops unchanged | Real shell element tops need a browser | BROWSER_ONLY (RETAIN) |
| 163-T12e | (x9) typing keeps focus in the requirement and clears aria-invalid | `RequestPropertyCard.test.tsx` "typing in the requirement after a submit error keeps focus there (clearing an error never moves focus)" | EXISTING |
| 163-T13a | (x9) same-key refetch provoked by clock.fastForward(61 s) + window focus, held in flight | Browser clock/focus harness; hook semantics EXISTING in `useDiscoverMapData.requestCardSettled1793.test.ts` F1c | BROWSER_ONLY (RETAIN) |
| 163-T13b | (x9) surrounding zero-state content dims while the refetch is in flight | Existing true arm + B2-N30 (`ListingsBody.requestCard.test.tsx`) and B2-N31 (`SchoolRadiusRequestCard.test.tsx`) OFF/on arms | NEW B2-N30 + B2-N31 |
| 163-T13c | (x9) card effective opacity ~1 and no pointer-events:none ancestor | Class chain walked ancestor by ancestor in `ListingsBody.requestCard.test.tsx` and `SchoolRadiusRequestCard.test.tsx`; computed CSS needs a browser | PARTIAL |
| 163-T13d | (x9) same DOM node after the refetch (no remount) | Same two r4 tests (`expect(card).toBe(cardBefore)`) | EXISTING |
| 163-T13e | (x9) elementFromPoint at the textarea centre hits it | Real hit test | BROWSER_ONLY (RETAIN) |
| 163-T13f | (x9) values, consent, focus preserved; typing works in flight | Same two r4 tests | EXISTING |
| 163-T13g | (x9) after release the dim clears and the card is intact | B2-N30 leg (d) and B2-N31 release-to-idle leg | NEW B2-N30 + B2-N31 |

### 9.2 L163 new tests & transient mutation proof (10 tests, 16 mutations)

Evidence logs and diffs (captured BEFORE restore): `.claude/handoffs/issue-2858-b2/mutation/B2-M22a..B2-M32a.{diff,log}` (untracked).
After every restore, `git diff --exit-code` on product files was empty and SHA-256 matched the original bytes.

| New test | File | Mutation (transient) | Actual red set | Credited |
|---|---|---|---|---|
| B2-N22 "request card context line comes from the scope: %s -> %s" (5 rows) | `features/discover/area-selected/sections/__tests__/ListingsBody.requestCard.test.tsx` | B2-M22a `ListingsBody.tsx:252` `'Drawn area'` -> `'Visible map area'` | N22 row 3 (`POLYGON`) only (exit 1) | Y (row 3) |
| | | B2-M22b `ListingsBody.tsx:254` `'Visible map area'` -> `'Drawn area'` | N22 row 4 (`VIEWPORT`) only (exit 1) | Y (row 4) |
| | | B2-M22c `ListingsBody.tsx:256` `${resolvedCityLabel \|\| resolvedAreasCity}` -> `${resolvedAreasCity}` | N22 all 5 rows (`Udupi` vs `udupi`, exit 1) | Y (all 5 rows) |
| | | B2-M22d `ListingsBody.tsx:217` `.join(', ')` -> `.join(' / ')` | N22 row 5 (`two areas`) only (exit 1) | Y (row 5) |
| | | B2-M22e `RequestPropertyCard.tsx:341` `context.intent === 'RENT' ? 'Rent' : 'Buy'` -> `'Buy'` | N22 row 2 (`single area rent`) + overlap N23 `rent` rows in both panels (exit 1) | Y (N22 row 2; N23 overlap stated) |
| B2-N23 "school card submits journey SCHOOL with intent %s -> %s and shows the exact context line %s" (2 intents × 2 panels) | `components/discover/panels/__tests__/SchoolRadiusRequestCard.test.tsx` | B2-M23a `SchoolRadiusEmptyState.tsx:132` `intent: intent === 'rent' ? 'RENT' : 'BUY'` -> `intent: 'RENT'` | N23 `buy` rows in both panels (exit 1; `rent` rows green) | Y (`buy` rows) |
| | | B2-M23b `SchoolRadiusEmptyState.tsx:133` `` `${school.name}, within ${effectiveRadius} km` `` -> `` `${school.name}` `` | N23 context-line assertion in all 4 rows (exit 1) | Y (context-line leg) |
| B2-N24 "consent unticked shows the hint 'Tick the box above to send'; ticking removes it" | `components/discover/__tests__/RequestPropertyCard.test.tsx` | B2-M24a `RequestPropertyCard.tsx:600` `{!consent && (` -> `{false && (` | N24 (exit 1) | Y |
| B2-N25 "while consent is unticked the Send button is described by the hint element; after ticking it has no aria-describedby" | same | B2-M24b `RequestPropertyCard.tsx:589` `aria-describedby={!consent ? id('submit-hint') : undefined}` -> `aria-describedby={undefined}` | N25 only; N24 stayed green (exit 1) | Y |
| B2-N26 "the submit HANDLER refuses a submit event while consent is unticked (no POST); the same form sends exactly once after ticking" | same | B2-M26a `RequestPropertyCard.tsx:307` `if (isPending \|\| !consent) return;` -> `if (isPending) return;` | N26 Leg A (exit 1; Leg B uncredited) | Y (Leg A handler protection) |
| B2-N27 "with no sticky header the invalid field lands a third of the way down the nearest scrollable container" | `components/discover/__tests__/RequestPropertyCard.focusGeometry.test.tsx` (new) | B2-M27a `RequestPropertyCard.tsx:214` `Math.max(container.clientHeight / 3, stickyBottom + STICKY_CLEARANCE_PX)` -> `stickyBottom + STICKY_CLEARANCE_PX` | N27 + overlap N28 (exit 1) | Y (N27; N28 overlap stated) |
| B2-N28 "an overflow:auto ancestor that does not overflow is skipped; the next overflowing ancestor is scrolled" | same | B2-M28a `RequestPropertyCard.tsx:187` drop `&& node.scrollHeight > node.clientHeight` | N28 only; N27 stayed green (exit 1) | Y |
| B2-N30 "the zero-result recovery is dimmed only while a refetch is in flight (idle: not dimmed; isFetching: dimmed; isFetching during initial page load: not dimmed; back to idle: not dimmed)" | `features/discover/area-selected/sections/__tests__/ListingsBody.requestCard.test.tsx` | B2-M30a `ListingsBody.tsx:133` `'opacity-100'` -> `'pointer-events-none opacity-50'` | N30 legs (a), (c), (d) (exit 1) | Y (legs a, c, d) |
| | | B2-M30b `ListingsBody.tsx:133` `isFetching && !isInitialLoading` -> `isFetching` | N30 leg (c) (exit 1; leg a green) | Y (leg c) |
| B2-N31 "idle options are not dimmed; during a refetch they are; after the refetch releases (fetching true -> false) they are not dimmed again" | `components/discover/panels/__tests__/SchoolRadiusRequestCard.test.tsx` | B2-M31a `SchoolRadiusEmptyState.tsx:72` `'opacity-100'` -> `'pointer-events-none opacity-50'` | N31 legs (a), (c) in both panels (exit 1) | Y (legs a, c) |
| B2-N32 "429 shows only the rate-limit alert: no 'We could not send your request' text and no Retry button" | `components/discover/__tests__/RequestPropertyCard.test.tsx` | B2-M32a `RequestPropertyCard.tsx:568` `failure?.kind === 'unavailable' && (` -> `(failure?.kind === 'unavailable' \|\| failure?.kind === 'rate-limit') && (` | N32 only; existing 429 `it` stayed green (exit 1) | Y |

