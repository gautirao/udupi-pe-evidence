# #2858 batch 1: lower-level replacement map for four e2e/discover specs (Lane C of #2750)

Base: `0d17841c`. Issue #2858 batch 1. Zero product change; test-only plus this doc.

No spec is deleted, moved or skipped; deletion needs the owner's own by-name comment on the PR.

The manifest (`docs/testing/e2e-retirement-manifest.csv`) is NOT edited by this PR; intended row text below (section 7).

Summary of dispositions (section 6): there are NO retirement candidates in this batch. All four specs (2205, 2207,
2795, sr024) STAY. Each has at least one row that is PARTIAL, UNCOVERED or BROWSER_ONLY under the coverage standard
below. 2207 stopped being a candidate in Codex round 2: 2207-T6c (REASSIGN through the real create + regeneration
path) and several tree/remove rows are PARTIAL.

## Coverage standard (Codex r2)

A row is COVERED (or NEW) only if the cited tests cover the REAL chain the legacy spec exercises. None of these counts
as covering a composed chain:

- injected props or state where the legacy spec drives a real composition;
- a stubbed child component;
- a mocked hook where the legacy spec observes HTTP;
- a callback-only check where the legacy spec observes a re-issued request;
- leaf-only gating.

A row that fails is PARTIAL (part of the chain is proved; the uncovered seam is named) or UNCOVERED. Where in doubt
the row was downgraded. Rows marked "r2" were downgraded in the Codex round-2 sweep.

Citations are by test file plus the exact `it` title. Paths are relative to `apps/web/src/` unless they start with
`apps/api/`. Line numbers drift (the branch adds `it`s to some cited files), so they are not the primary citation.
Status legend: COVERED (an existing `it` asserts the real chain), NEW in this PR (an `it` added by this batch, with a
mutation proof), PARTIAL (only part of the chain is proved; the unproved seam is named), UNCOVERED (nothing asserts it),
BROWSER_ONLY (needs a real browser; reason given).

## 1. `e2e/discover/issue-2205-admin-preview-node-scoping-browser-proof.spec.ts`

| assertion id | legacy assertion | covering test (file + exact `it` title) | status |
|---|---|---|---|
| 2205-T1a | preview + resolved AREA node: `/preview/markers` carries `node=<key>` | `features/discover/selectors/__tests__/markerScope.test.ts` "preview mode with a resolved node and no legacy group -> node scope (preview now has a node wire representation, #2202/#2215)"; `hooks/__tests__/useDiscoverFilteredMarkers.test.ts` "preview mode + node scope requests the admin preview /markers path with only ?node= (#2215)"; `features/discover/controllers/useDiscoverMapDataController.test.ts` "preview source + resolved AREA node: the marker request path is .../preview/markers?node=<key> only — no areaKeys (#2858/#2205)" | PARTIAL (r2) + NEW in this PR (N1). Uncovered seam: N1 injects `nav` and the resolved node into the controller; the legacy spec resolves it from real panel clicks (see 2205-real-drill) |
| 2205-T1b | no `areaKeys=` alongside a resolved `node=` | same N1 `it` (exact path equality); `markerScope.test.ts` "preview mode ignores journey state, and a resolved node wins over a resolved legacy group" | PARTIAL (r2) + NEW in this PR (N1). Same seam as T1a: resolved node injected |
| 2205-T2a | `?groupId=<slug>` preview, no node: `areaKeys` = exactly the group's members | `markerScope.test.ts` "preview mode + non-empty groupAreaKeys -> resolves to areas scope with those exact keys, not city"; `useDiscoverFilteredMarkers.test.ts` "preview mode requests the admin preview /markers path with only ?areaKeys="; `useDiscoverMapDataController.test.ts` "preview source + legacy group members and no node: the marker request carries exactly the group's areaKeys and no node= (#2858/#2205)"; `features/discover/controllers/__tests__/useDiscoverAreaGroupsController.test.ts` "?groupId resolves groupAreaKeysForMapData to that group's area_keys (preview area-groups path served via api.get)" | PARTIAL (Codex 4317365997) + NEW in this PR (N2, N3). Uncovered seam: N3 proves the group controller output and N2 injects `groupAreaKeysForMapData`; nothing composes them through `useDiscoverPageComposition` (?groupId -> marker request) |
| 2205-T2b | no `node=` while no node is resolved | `useDiscoverFilteredMarkers.test.ts` "preview mode requests the admin preview /markers path with only ?areaKeys="; N2 `it` (exact path) | PARTIAL (Codex 4317365997) + NEW in this PR (N2). Same seam as T2a |
| 2205-real-drill | drill via real navigation-level-panel clicks, Zoom-in crosses the zoom>12 gate, and the resolved node scopes the emitted preview request | the zoom gate alone: `hooks/__tests__/useDiscoverMapData.markersEnabled.test.ts` "R1: passes enabled=true to useDiscoverFilteredMarkers when markersEnabled=true" and "R2: passes enabled=false to useDiscoverFilteredMarkers when markersEnabled=false". The composition (real navigation-panel clicks -> resolved node -> scoped request) is untested: N1/N2 inject `nav` and `areasNavigationJourney.node` directly, and R1/R2 exercise only a boolean query gate | PARTIAL (gate) / UNCOVERED (click -> node -> request composition) |

N1 note: the N1 mutation targets the markerScope preview node branch (`features/discover/selectors/markerScope.ts`, rule 1
returns `{ kind: 'city' }`). The `useDiscoverMapDataController.ts` `sourceMode` line (~:165) does not discriminate for the
area-first case and is NOT claimed by N1.

2205-real-drill note (Codex thread 4317098872): no allowed file can drive the real composition without mocking.
`pages/admin/__tests__/CityLaunchPreview.test.tsx` stubs `@/pages/MapDiscovery`, so the navigation-level panel is never
rendered there, and the controller tests inject the resolved node. If the real panel clicks stopped resolving the
selected node into the controller, every cited lower-level test would still pass. The 2205 spec is the only test that
exercises that path, so it is NOT a retirement candidate and stays (section 6).

## 2. `e2e/discover/issue-2207-admin-hierarchy-node-selection.spec.ts`

Paths below are under `components/discover/cityLaunchPreview/__tests__/` unless stated.

| assertion id | legacy assertion | covering test (file + exact `it` title) | status |
|---|---|---|---|
| 2207-T1 | AREA leaf select: `aria-selected` true, panel label, Exclude/Reassign/Move present, Relabel/SetReps absent | `NavigationHierarchyTree.test.tsx` "selecting a node does not expand/collapse it, and toggling expand does not change/clear selection", "is keyboard-operable: Enter on a focused row selects it, with aria-selected on the same element that owns focus", "offers only Area-subject actions for an AREA node, and only Node-subject actions for a non-AREA node"; `navigationHierarchyOverrideRules.test.ts` "returns only Area-subject kinds for AREA nodes"; page level, presence only: N11 (Exclude/Reassign/Move actions rendered for the AREA row) | PARTIAL (r2). Uncovered seam: `aria-selected`, the panel label and the absence of Relabel/SetReps are asserted only on the tree rendered with injected nodes, not through the page's HTTP-served tree |
| 2207-T2 | non-AREA select: Relabel/SetReps present, Area actions absent | `NavigationHierarchyTree.test.tsx` "offers only Area-subject actions for an AREA node, and only Node-subject actions for a non-AREA node"; `navigationHierarchyOverrideRules.test.ts` "returns only Node-subject kinds for CLUSTER nodes", "returns only Node-subject kinds for DIRECTION nodes"; page level, Relabel presence only: N10 | PARTIAL (r2). Uncovered seam: SetReps presence and Area-action absence for a non-AREA node are tree-level only (injected nodes) |
| 2207-T3 | selection survives collapsing the row | `NavigationHierarchyTree.test.tsx` "selecting a node does not expand/collapse it, and toggling expand does not change/clear selection", "persists selection across search filtering, even once collapse hides the selected row" | PARTIAL (r2). Uncovered seam: tree-level only with injected nodes; no page-level collapse-then-selection check |
| 2207-T4 | Exclude action: Overrides tab active, `#override-kind` 'Exclude area', `#subjectAreaKey` prefilled | `pages/admin/__tests__/CityLaunchPreview.test.tsx` "Hierarchy tree: selecting an AREA node and clicking Exclude area switches to the Overrides tab with subjectAreaKey prefilled (#2858/#2207)": real page, tab switch, `#subjectAreaKey` equals the area key, and (Codex 4317365978) the exact `textContent` of the closed `#override-kind` Select trigger is 'Exclude area', proved by mutation N4c (AREA prefill kind forced to REASSIGN_AREA_REGION). Kind seed: `NavigationOverridesPanel.test.tsx` "seeds an Area-subject kind + subjectAreaKey from the prefill" | NEW in this PR (N4, N4c) |
| 2207-T5 | Relabel on non-AREA: Overrides tab, kind 'Relabel node', `#subjectNodeKey` prefilled | `pages/admin/__tests__/CityLaunchPreview.test.tsx` "Hierarchy tree: selecting a non-AREA node and clicking Relabel switches to the Overrides tab with subjectNodeKey prefilled (#2858/#2207)" (real page: selects the CLUSTER row, clicks RELABEL, asserts the Overrides tab is active, `#subjectNodeKey` equals the CLUSTER nodeKey, `#subjectAreaKey` is absent or empty, and the closed `#override-kind` trigger text is 'Relabel node'), proved by mutations N10 and N10b | NEW in this PR (N10, N10b) |
| 2207-T6a | REASSIGN_AREA_REGION + targetRegionKey: POST `{kind, subjectAreaKey, targetRegionKey}` | `CityLaunchPreview.test.tsx` "REASSIGN_AREA_REGION from the Hierarchy tree: Apply posts { kind, subjectAreaKey, targetRegionKey } to /navigation/overrides (#2858/#2207)" | NEW in this PR (N5) |
| 2207-T6b | after Apply, the list shows 'Reassign <key> → region N' | `CityLaunchPreview.test.tsx` "applying a REASSIGN_AREA_REGION override refetches the overrides list and shows 'Reassign <areaKey> → region <key>' (#2858/#2207)" (Codex 4317365961: GET overrides serves [] until the POST succeeds, then the REASSIGN row; applied through the real tree flow; proved by mutation N12, which drops only the overrides-query invalidation); render of the line: "an applied REASSIGN_AREA_REGION override is listed as 'Reassign <areaKey> → region <key>' (#2858/#2207)" | NEW in this PR (N12, N6) |
| 2207-T6c | backend applies the override, regenerates, delete removes it | see the backend table below | PARTIAL (Codex 4317365968). Uncovered seam: the create/regenerate/delete IT uses only EXCLUDE_AREA; REASSIGN_AREA_REGION reaches the applier only as a hand-built domain object, never through `createOverride` (request -> entity incl. `targetRegionKey`) + regeneration. `apps/api` is outside this PR's allowed files |
| 2207-T6d | remove via AlertDialog confirm | `NavigationOverridesPanel.test.tsx` "deleting requires the AlertDialog confirm click before calling the mutation" (that file mocks the override hooks); HTTP leg: `hooks/useCityLaunchNavigation.test.ts` "DELETEs .../navigation/overrides/{overrideId} and invalidates on success" | PARTIAL (r2). Uncovered seam: the confirm click is proved against a mocked hook; confirm -> DELETE request -> row removed is not composed in one test |
| 2207-gating | non-PREPARED revision disables actions | page-level derivation (`overridesEditable` from `validation.lifecycleStatus === 'PREPARED'`): `pages/admin/__tests__/CityLaunchPreview.test.tsx` "a non-PREPARED revision (validation lifecycleStatus != PREPARED): the page disables the Hierarchy tree override actions (#2858/#2207)" (validation served over the HTTP mock as VALIDATED with `editable` still true; the enabled PREPARED control is N4's `toBeEnabled()`); leaf rendering: `NavigationHierarchyTree.test.tsx` "disables override actions when the revision is not PREPARED (overridesEditable=false)"; `NavigationOverridesPanel.test.tsx` "editable=false disables the kind select, all inputs, and Apply" | NEW in this PR (N11). Residual: page-level proof covers the tree actions; the Overrides-panel disabling is leaf-only |

N4/N5/N6/N10/N11/N12 placement: they live in `pages/admin/__tests__/CityLaunchPreview.test.tsx`, not in
`NavigationOverridesPanel.test.tsx`. `NavigationOverridesPanel.test.tsx` mocks the override hooks
(`vi.mock('@/hooks/useCityLaunchNavigation')`), so a test there would mock the unit's own data path. In
`CityLaunchPreview.test.tsx` the override hooks are real and only `@/lib/api` (the HTTP boundary) serves the tree,
validation and override endpoints.

### 2207-T6c backend coverage (verified by reading; mvn NOT run in this batch)

| test (file + method) | what it asserts |
|---|---|
| `apps/api/src/test/java/com/example/realestate/discover/citylaunch/CityLaunchNavigationOverrideServiceIT.java` `createOverrideRegeneratesAndRestamps` ("POST override regenerates the tree and re-stamps persisted_revision_checksum, one transaction") | Testcontainers IT on a PREPARED revision: after `createOverride(EXCLUDE_AREA, area-1)` the revision's `persisted_revision_checksum` differs from before, `overridesFingerprint` is non-null, and the regenerated sandbox tree has no AREA node for the excluded key |
| same IT, `deleteOverrideRegenerates` ("DELETE override regenerates back toward the un-overridden tree") | after create then `deleteOverride`, `listOverrides` is empty and the area's node is present again in the regenerated tree |
| same IT, `mutationOnNonPreparedRevisionIsConflict`, `duplicateOverrideIsConflict` | override mutation on a non-PREPARED revision and a duplicate (area, kind) both throw 409 CONFLICT |
| `apps/api/src/test/java/com/example/realestate/discover/citylaunch/AdminCityLaunchNavigationOverrideControllerTest.java` (`@WebMvcTest`, service mocked) `listOverrides_wireShape_bareArrayWithIdFieldNoAppliedAt`, `createOverride_duplicate_returns409`, `createOverride_nonPreparedRevision_returns409`, `createOverride_blockingValidation_returns422WithValidationReport`, `deleteOverride_unknown_returns404` | controller wire shape (bare array, `id` not `overrideId`, no `appliedAt`) and status mapping for POST 409/409/422 and DELETE 404 |
| `apps/api/src/test/java/com/example/realestate/discover/navigation/NavigationTreeOverrideApplierTest.java` `reassignMovesAreaAcrossRegions` ("REASSIGN_AREA_REGION moves the area from its source region to the target region") | the REASSIGN kind moves the area from its source region into the target region, on a directly constructed domain object |

Scope note: the create/regenerate/delete ITs use `EXCLUDE_AREA` only. REASSIGN is proved at the applier unit level only,
so a regression that drops `targetRegionKey` between request and entity, or fails to feed a persisted REASSIGN to the
applier during regeneration, would pass every cited test. 2207-T6c is therefore PARTIAL (Codex 4317365968).

## 3. `e2e/discover/property-request-card-legacy-and-browse-all-2795.spec.ts`

| assertion id | legacy assertion | covering test (file + exact `it` title) | status |
|---|---|---|---|
| 2795-L1-card | legacy `?areaKey=` genuine zero shows zero-result recovery AND the card | `features/discover/area-selected/sections/__tests__/ListingsBody.requestCard.test.tsx` "settled success + zero results: the card renders as a sibling AFTER the zero-result recovery"; `features/discover/right-panel/area/__tests__/AreaJourneyPanel.requestCardSettled2795.test.tsx` "passes a settled result through as settled" | PARTIAL (r2). Uncovered seam: `ListingsBody` gets the settled zero as injected props, and the `AreaJourneyPanel` test stubs `AreaSelectedPanel`; the legacy route -> listings HTTP -> card chain is not composed |
| 2795-L1-payload | submit `{city, areaKey, journey AREA, intent BUY, consent, consentVersion, areaLabel~Kadri}` | `ListingsBody.requestCard.test.tsx` "AREA scope: journey AREA with the real area key/label, city and BUY intent"; `components/discover/__tests__/RequestPropertyCard.test.tsx` "201: posts the context + buyer fields + consentVersion WITHOUT an Authorization header, then shows an inline status and moves focus to it" | PARTIAL (Codex 4317365985). Uncovered seam: `areaLabel`/`fallbackAreaKey` are injected into `ListingsBody`, and the `AreaJourneyPanel` test stubs `AreaSelectedPanel` and never submits; the selected-area -> `ListingsBody` handoff is untested |
| 2795-L1-route | city with no navigation hierarchy + `?areaKey=` reaches the 'area-selected' panel | `features/discover/state/url/__tests__/defaultJourney.test.ts` "root-resolve 404s (\"City has no active navigation hierarchy\") -> journey settles to null, not \"area-first\""; existing `utils/__tests__/discoverPanelState.test.ts` "Case 5: no journey + areaKey (no schoolId) → area-selected (infer area-first)"; `features/discover/selectors/panelContent.test.ts` "legacy ?areaKey= in a city with no active navigation hierarchy (journey null) resolves panel content 'area-selected' (#2858/#2795)" | PARTIAL (r2) + NEW in this PR (N7). Uncovered seam: the two units are not composed into "the page renders AreaJourneyPanel" (below) |
| 2795-L2 | card absent while pending, present after a settled 200-empty | `ListingsBody.requestCard.test.tsx` "settled success + zero results: the card renders as a sibling AFTER the zero-result recovery", "F1a/b: hidden while the scope's own query is NOT settled (keepPreviousData placeholder), even though the shared isFetching is false"; `features/discover/areas-journey/results/__tests__/AreaLeafListingsSurface.requestCardSettled1793.test.tsx` "F1a: an anonymous keepPreviousData placeholder [] (fetching false) shows NO card; it appears when the new key settles" | PARTIAL (r2). Uncovered seam: pending/settled is injected or query-level state on the leaf surfaces; the legacy-route pending -> 200-empty HTTP transition on the real panel is not composed |
| 2795-L3 | 500: Error+Retry, card never present | `ListingsBody.requestCard.test.tsx` "settled=true + error + nothing to fall back on: error and Retry render, and NO request card", "a settled own query never overrides loading / error / undefined data" | PARTIAL (r2). Uncovered seam: the error is injected into `ListingsBody` props; a real listings 500 through the legacy route is not composed |
| 2795-L3-retry-callback | clicking Retry invokes the listings retry handler | `ListingsBody.requestCard.test.tsx` "settled=true + error + nothing to fall back on: error and Retry render, and NO request card": it clicks `area-listings-error-retry` and asserts the `onRetryListings` prop (a `vi.fn`) was called exactly once | PARTIAL (r2). Uncovered seam: callback-only; the legacy spec observes the re-issued request (see L3-retry-http) |
| 2795-L3-retry-http | Retry re-issues the city-listings HTTP request, and a rejected retry returns the real surface to its error state | none: no test observes a second listings `api.get` or a refetch-driven return to the error state; only the callback is proved | PARTIAL |
| 2795-LM1 | mobile 390x844 genuine zero shows the card (PR #2803: map never ready, page loader true) | gate: `ListingsBody.requestCard.test.tsx` "shown on a settled zero even while the page-level initial loader is true (mobile: map never ready)"; control: "still hidden on that same page-level loader when the own query is NOT settled" | PARTIAL (r2: leaf-only gate with injected loader/settled props) + BROWSER_ONLY residual: the real phone-viewport "map never ready" lifecycle is a real-Leaflet/layout condition jsdom cannot produce |
| 2795-LM2 | mobile 500: Retry, card never present | `ListingsBody.requestCard.test.tsx` "settled=true + error + nothing to fall back on: error and Retry render, and NO request card", "hidden when there are results (populated grid, including stale results with a refresh error)" | PARTIAL (r2). Uncovered seam: injected error props on the leaf; no mobile-composed listings 500 |
| 2795-B1 | Browse-all node genuine zero: card; payload areaKey null + node label | `ListingsBody.requestCard.test.tsx` "node scope (Browse all): areaKey null, journey AREA, label names the node"; `features/discover/views/__tests__/NodeListingsSurface.requestCardSettled2795.test.tsx` "settled on a loaded successful result", "marks the scope as a navigation node so the card never submits a node key as an area key". Not covered: the label handoff `NodeListingsSurface` `syntheticAreaPoint.areaLabel = node.displayLabel` -> the card's `areaLabel` (the `NodeListingsSurface` `it`s mock `AreaSelectedPanel`; Codex thread 4317098893) | PARTIAL |
| 2795-B2 | control: node with inventory shows listings, no card | `ListingsBody.requestCard.test.tsx` "hidden when there are results (populated grid, including stale results with a refresh error)" | PARTIAL (r2). Uncovered seam: results injected into `ListingsBody`; the node listings path (`NodeListingsSurface` with real data) is not composed |
| 2795-B3 | node listings 500: node error, card never present | `NodeListingsSurface.requestCardSettled2795.test.tsx` "error: the surface renders its own error state and no panel (so no card host)", "error with stale data is not settled either (the error state wins)", "error: error state, no panel" | PARTIAL (r2). Uncovered seam: that file stubs `AreaSelectedPanel` and drives the error as query state, not a node-listings HTTP 500 |

2795-L1-route chain: "no hierarchy -> journey null" is covered by `defaultJourney.test.ts` (the root-resolve 404 `it` above),
and "journey null + areaKey -> area-selected" is covered by the existing Case 5 in `utils/__tests__/discoverPanelState.test.ts`
and, through the selectors re-export, by N7 in `panelContent.test.ts`. N7 duplicates Case 5 and adds a pin on the re-export path
only. The N7 mutation was run against `panelContent.test.ts` alone, so "no other failing it" in its evidence holds within that
file only; Case 5 would also fail under it. These are two separate units.
N7's input has `journey: null` and no schoolId/schoolPicking/groupId, so the area-first branch of `derivePanelContent` is not
the path taken; only the no-journey `areaKey` fall-through is. No test composes the two into "the page renders
AreaJourneyPanel", so "AreaJourneyPanel reached" stays a composition gap. The 2795 spec stays.

## 4. `e2e/discover/sr024-error-vs-empty.spec.ts`

Sweep note (r2): every sr024 row cites leaf renders, bridge renders or pure surface-model builders that receive the
error/loading/zero state as injected input (props, a built model, or a mocked `refetch`). The legacy spec drives a
real HTTP 500 / 200-empty through the page. So no sr024 row meets the coverage standard; the state and rendering
logic is pinned, but the HTTP -> query -> model -> surface chain is not composed in any lower-level test.

| assertion id | legacy assertion | covering test (file + exact `it` title) | status |
|---|---|---|---|
| SR-A1 | school-radius 500: `school-radius-listings-error` + retry; never 'No homes within'/empty state; no school-summary-count; no '0 homes' | `features/discover/surfaces/panel/__tests__/LegacyRightPanelBridge.schoolRadiusError1793.test.tsx` "a failed school-radius query renders the error block (not \"no homes within N km\") and Retry calls the REAL refetch exactly once", "loading window: a pending (or retrying) anon school-radius query renders the skeleton, NOT the empty state or the error block", "pending -> failure -> Retry: skeleton, then the error block, then the skeleton again (the data-less refetch is pending) and never the empty state"; `.../LegacyRightPanelBridge.schoolRadiusZeroCount1793.test.tsx` "error (anon): the header band and radius chips do not claim \"0 homes\" next to the error block" | PARTIAL (r2). Uncovered seam: bridge renders with injected query state; no school-radius HTTP 500 composed |
| SR-A1-dock | dock never 'Showing 0 verified properties' on error/loading | `features/discover/surfaces/__tests__/buildMapSurfaceModel.test.ts` "anon + request error with no listings: status flag set and the dock count is omitted", "anon + loading: the dock count is omitted" | PARTIAL (r2). Uncovered seam: pure model builder with injected state; dock render from a real failure not composed |
| SR-A1-retry-callback | clicking school-radius Retry invokes the query's refetch | `LegacyRightPanelBridge.schoolRadiusError1793.test.tsx` "a failed school-radius query renders the error block (not \"no homes within N km\") and Retry calls the REAL refetch exactly once"; `features/discover/surfaces/__tests__/buildPanelSurfaceModel.test.ts` "#1793 A1: schools.isErrorSchoolRadiusListings mirrors the controller signal and the real refetch reaches commands.geography" | PARTIAL (r2). Uncovered seam: callback-only; the legacy spec observes the re-issued request |
| SR-A1-retry-http | Retry re-issues the school-radius listings HTTP request | none: no test observes a second `api.get`; only the callback is proved | PARTIAL |
| SR-A1-control | same school, no failure: real homes render, no error | none (see note) | UNCOVERED |
| SR-A1-zero | genuine zero: empty state, school-summary-count 0, '0 homes', dock 'Showing 0 ... near' | `LegacyRightPanelBridge.schoolRadiusZeroCount1793.test.tsx` "control: a genuine zero (200, no listings, not loading) still shows the zero counts"; `buildMapSurfaceModel.test.ts` "control: a settled genuine zero keeps \"Showing 0 verified properties near …\"" | PARTIAL (r2). Uncovered seam: injected zero state; no 200-empty HTTP composed |
| SR-A1m-pill | mobile `map-results-heading-text` never zero on failure/loading; genuine zero shows 0 | `features/discover/views/DiscoverMapCanvas.test.tsx` "A1 error, no listings: no count heading and no \"0 matching\" block", "A1 loading with an active filter: still no zero count (heading and zero-results block both absent)", "genuine zero (settled, nothing pending): the heading still states 0", "signed-in control: the heading states the map count unchanged" | PARTIAL (r2). Uncovered seam: `DiscoverMapCanvas` with injected model/props |
| SR-A1m-toggle | List/Map toggle + retry sequence keeps no zero at any frame | none | BROWSER_ONLY: real Leaflet container mount and tap landing across a List/Map remount inside the react-query retry window. RETAIN_SPECIALIST sub-row candidate |
| SR-A1m-sheet | Filters sheet on failure: status 'Not applied yet', no digit, before/after Apply | `DiscoverMapCanvas.test.tsx` "A1 pending, sheet open and edited: no zero / no digit in the status line"; `features/discover/components/map/__tests__/MapFilterSheetAppliedCount.test.tsx` "pending: omits the number entirely", "pending: the Apply button carries no digit either (draftResultCount unwired)" | PARTIAL (r2). Uncovered seam: injected pending state; failure-driven sheet state not composed |
| SR-A1m-sheet-zero | genuine zero: 'the map still shows 0 homes' | `DiscoverMapCanvas.test.tsx` "settled genuine zero: the status line still says 0 homes"; `MapFilterSheetAppliedCount.test.tsx` "not pending, genuine zero: still says the map shows 0 homes" | PARTIAL (r2). Uncovered seam: injected zero state |
| SR-A2 | anon viewport 500: error/retry surface, never zero | `components/discover/__tests__/DiscoverRightPanel.test.tsx` "first-load failure with zero retained listings shows the full-replace error state with Retry", "transient failure with retained listings keeps rendering the cards AND shows the retry banner"; `features/discover/surfaces/panel/__tests__/AreaFirstJourneyPanel.errorSignals1793.test.tsx` "a failed anon viewport request with nothing retained renders the error + Retry, NOT the zero-result recovery, and Retry re-issues the VIEWPORT query", "a failed refresh with results retained keeps the stale cards and shows the retry banner (never a silent success), wired to the VIEWPORT refetch" | PARTIAL (r2). Uncovered seam: injected error props / mocked refetch; no viewport HTTP 500 composed |
| SR-A2-retry-callback | clicking the anon viewport Retry invokes the retry handler | `DiscoverRightPanel.test.tsx` "clicking Retry calls onRetryAnonViewport exactly once"; `features/discover/surfaces/panel/__tests__/LegacyRightPanelBridge.anonViewportRetry.test.tsx` "forwards isErrorAnonViewport/refetchAnonViewport through the real surface->bridge seam: shows the retained-results retry banner and calls the real DiscoverRightPanel retry handler exactly once"; `hooks/__tests__/useDiscoverMapData.markersEnabled.test.ts` "I4: on a query error, isErrorAnonViewport is true but the last successful cards/markers are RETAINED (review fix 5087672619), and refetchAnonViewport drives a real retry" | PARTIAL (r2). Uncovered seam: callback-only; the legacy spec observes the re-issued request |
| SR-A2-retry-http | Retry re-issues the viewport listings HTTP request | none: the I4 `it` and the errorSignals1793 "re-issues the VIEWPORT query" `it` both assert a mocked `refetch` / `refetchAnonViewport` call; no test observes a second `api.get` | PARTIAL |
| SR-A2-zero | anon viewport 200-empty: zero state 'No listings found in this map area', no error | `DiscoverRightPanel.test.tsx` "anon viewport genuine zero (200, no listings, no error): shows anon-viewport-empty-state 'No listings found in this map area' and no error/retry"; duplicate positive (whole-DOM snapshot): `components/discover/__tests__/DiscoverRightPanel.leafSnapshots2657.test.tsx` "C2a snapshot — anon viewport listings" > "empty"; absence-only control: `AreaFirstJourneyPanel.errorSignals1793.test.tsx` "control: a genuine zero anon viewport (no error) still renders the zero state, not the error block" | PARTIAL (r2) + NEW in this PR (N8). Uncovered seam: N8 is props-only on the leaf; no 200-empty HTTP composed |
| SR-A3 | `/api/discover/areas` 500: `map-areas-error` + retry button, never 'No properties listed in' | `components/discover/__tests__/MapEmptyGuidance.test.tsx` "areas error + cityTotal 0: does NOT claim the city is empty, shows an error with Retry", "loading never renders the error (or any zero) state"; `DiscoverMapCanvas.test.tsx` "#1793 A3: areas request failure shows the error + Retry (the real refetch), never \"No properties listed\""; `buildMapSurfaceModel.test.ts` "#1793 A3: view.areas.isErrorDiscoverAreas mirrors the controller's /api/discover/areas error signal" | PARTIAL (r2). Uncovered seam: injected error flag on leaf/model; no areas HTTP 500 composed |
| SR-A3-retry-callback | clicking `map-areas-error-retry` invokes the areas refetch | `MapEmptyGuidance.test.tsx` "areas error + cityTotal 0: does NOT claim the city is empty, shows an error with Retry"; `DiscoverMapCanvas.test.tsx` "#1793 A3: areas request failure shows the error + Retry (the real refetch), never \"No properties listed\""; `buildMapSurfaceModel.test.ts` "#1793 A3: commands.areas.refetchDiscoverAreas is the controller's own refetch (same reference)" | PARTIAL (r2). Uncovered seam: callback/reference-only; the legacy spec observes the re-issued request |
| SR-A3-retry-http | Retry re-issues the `/api/discover/areas` HTTP request | none: no test observes a second `api.get` | PARTIAL |
| SR-A3-zero | genuine empty city: 'No properties listed in', no error | `MapEmptyGuidance.test.tsx` "control: a genuine zero (no areas error) still shows the \"No properties listed\" copy and no error"; `DiscoverMapCanvas.test.tsx` "#1793 A3 control: a genuinely empty city (no areas error) still shows \"No properties listed\"" | PARTIAL (r2). Uncovered seam: injected zero state |

SR-A1-control is UNCOVERED (planned N9 dropped). Reasons:

- No existing `it` asserts card presence for settled, non-empty school-radius results.
- The nearest, `components/discover/panels/__tests__/SchoolRadiusListings.error1793.test.tsx` "results retained alongside an error: the cards stay (no full-replace error block)", is an error case and asserts only absences.
- The allowed destination (`LegacyRightPanelBridge.schoolRadiusError1793.test.tsx`) would need an edit to a shared `buildParams` helper, which would touch existing `it`s.
- It is a control arm that needs real data to mean anything.

`sr024-error-vs-empty.spec.ts` stays on disk regardless.

## 5. New tests in this PR

Mutation evidence: `.claude/handoffs/issue-2858/mutation/N1.txt` .. `N8.txt` (N4 has `N4a.txt`, `N4b.txt` and `N4c.txt`),
plus `N10.txt`, `N10b.txt`, `N11.txt` and `N12.txt` (N9 was dropped; see section 4). Every mutation was transient and
reverted, and the product file's `git diff --stat` was empty afterwards.

| N# | file | `it` title | mutation (product file: what changed) | RED (exit 1) | GREEN after revert |
|---|---|---|---|---|---|
| N1 | `features/discover/controllers/useDiscoverMapDataController.test.ts` | preview source + resolved AREA node: the marker request path is .../preview/markers?node=<key> only — no areaKeys (#2858/#2205) | `features/discover/selectors/markerScope.ts` (~:148): preview node branch returns `{ kind: 'city' }` instead of `{ kind: 'node', nodeKey }` | N1 `it` only (1 failed / 41 passed) | exit 0, 42/42 |
| N2 | `features/discover/controllers/useDiscoverMapDataController.test.ts` | preview source + legacy group members and no node: the marker request carries exactly the group's areaKeys and no node= (#2858/#2205) | `markerScope.ts` (~:152): preview group branch returns `{ kind: 'city' }` | N2 `it` only (1 failed / 41 passed) | exit 0, 42/42 |
| N3 | `features/discover/controllers/__tests__/useDiscoverAreaGroupsController.test.ts` (new file) | ?groupId resolves groupAreaKeysForMapData to that group's area_keys (preview area-groups path served via api.get) | `features/discover/controllers/useDiscoverAreaGroupsController.ts` (~:95): returns `[]` instead of `group.area_keys` | N3 `it` (1 failed / 1) | exit 0, 1/1 |
| N4 | `pages/admin/__tests__/CityLaunchPreview.test.tsx` | Hierarchy tree: selecting an AREA node and clicking Exclude area switches to the Overrides tab with subjectAreaKey prefilled (#2858/#2207) | `pages/admin/CityLaunchPreview.tsx` (~:220), two separate runs: (a) `setSubView('overrides')` dropped; (b) `setOverridePrefill(prefill)` dropped | (a) and (b) each: N4 `it` and N5 `it` (2 failed / 40 passed) | exit 0, 42/42 after each |
| N4c | `pages/admin/__tests__/CityLaunchPreview.test.tsx` | same N4 `it`; its added kind assertion `#override-kind` textContent === 'Exclude area' (Codex 4317365978) | `components/discover/cityLaunchPreview/navigationHierarchyOverrideRules.ts` (~:38, `buildPrefillForKind` AREA branch): `kind` -> `kind: 'REASSIGN_AREA_REGION'` (subjectAreaKey kept) | N4 `it` only (1 failed / 44 passed); "expected 'Reassign area to region' to be 'Exclude area'". N5 stayed green (it expects REASSIGN) | exit 0, 45/45 |
| N5 | `pages/admin/__tests__/CityLaunchPreview.test.tsx` | REASSIGN_AREA_REGION from the Hierarchy tree: Apply posts { kind, subjectAreaKey, targetRegionKey } to /navigation/overrides (#2858/#2207) | `components/discover/cityLaunchPreview/NavigationOverridesPanel.tsx` (~:101): REASSIGN payload omits `targetRegionKey` | N5 `it` only (1 failed / 41 passed) | exit 0, 42/42 |
| N6 | `pages/admin/__tests__/CityLaunchPreview.test.tsx` | an applied REASSIGN_AREA_REGION override is listed as 'Reassign <areaKey> → region <key>' (#2858/#2207) | `NavigationOverridesPanel.tsx` (~:57): describe line drops the region | N6 `it` only (1 failed / 41 passed) | exit 0, 42/42 |
| N7 | `features/discover/selectors/panelContent.test.ts` | legacy ?areaKey= in a city with no active navigation hierarchy (journey null) resolves panel content 'area-selected' (#2858/#2795) | `features/discover/utils/discoverPanelState.ts` (~:166, `derivePanelContent` no-journey fall-through): `if (areaKey)` bypassed, so it falls through to 'guided-entry' | N7 `it` only (1 failed / 2 passed); "expected 'guided-entry' to be 'area-selected'" | exit 0, 3/3 |
| N8 | `components/discover/__tests__/DiscoverRightPanel.test.tsx` (anon viewport describe) | anon viewport genuine zero (200, no listings, no error): shows anon-viewport-empty-state 'No listings found in this map area' and no error/retry | `features/discover/right-panel/entry/AnonViewportListings.tsx` (~:80-92): empty branch returns `null` instead of `anon-viewport-empty-state` | N8 `it` only (1 failed / 62 passed); "Unable to find an element by: [data-testid=\"anon-viewport-empty-state\"]" | exit 0, 63/63 |
| N10 | `pages/admin/__tests__/CityLaunchPreview.test.tsx` | Hierarchy tree: selecting a non-AREA node and clicking Relabel switches to the Overrides tab with subjectNodeKey prefilled (#2858/#2207) | `components/discover/cityLaunchPreview/navigationHierarchyOverrideRules.ts` (~:40, `buildPrefillForKind` non-AREA branch): `subjectNodeKey: node.nodeKey` -> `subjectNodeKey: ''` | N10 `it` only (1 failed / 43 passed); "expected '' to be 'c:north:manipal'" | exit 0, 44/44 |
| N10b | `pages/admin/__tests__/CityLaunchPreview.test.tsx` | same N10 `it`; its kind assertion `#override-kind` textContent === 'Relabel node' | `navigationHierarchyOverrideRules.ts` (~:40, `buildPrefillForKind` non-AREA branch): `kind` -> `kind: 'SET_REPRESENTATIVES'` (subjectNodeKey kept) | N10 `it` only (1 failed / 43 passed); "expected 'Change representative areas' to be 'Relabel node'" | exit 0, 44/44 |
| N11 | `pages/admin/__tests__/CityLaunchPreview.test.tsx` | a non-PREPARED revision (validation lifecycleStatus != PREPARED): the page disables the Hierarchy tree override actions (#2858/#2207) | `pages/admin/CityLaunchPreview.tsx` (~:147): `overridesEditable = validation?.lifecycleStatus === 'PREPARED'` -> `overridesEditable = true` | N11 `it` only (1 failed / 43 passed); "expect(element).toBeDisabled()" | exit 0, 44/44 |
| N12 | `pages/admin/__tests__/CityLaunchPreview.test.tsx` | applying a REASSIGN_AREA_REGION override refetches the overrides list and shows 'Reassign <areaKey> → region <key>' (#2858/#2207) | `hooks/useCityLaunchNavigation.ts` (~:151, `useCreateNavigationOverride` onSuccess): ONLY the overrides-query invalidation removed; diff (BASE, PREVIOUS_REVISION) and tree invalidations kept (Codex 4317365961) | N12 `it` only (1 failed / 44 passed); "Unable to find an element by: [data-testid=\"override-12\"]" | exit 0, 45/45 |

Counts: N1-N11 were recorded at the file's size at the time (42 or 44 `it`s); N4c and N12 at 45.

Not claimed: N8 does not claim the `isErrorAnonViewport && anonViewportListings.length === 0` guard (~:58). That condition
is true for its fixture, so N8 cannot kill a mutation of it. N1 does not claim the controller `sourceMode` line (section 1).

N7 destination: `derivePanelContent` imports cleanly through `features/discover/selectors/panelContent` (a re-export of
`features/discover/utils/discoverPanelState`), so the primary file was used and the `defaultJourney.test.ts` fallback was
not needed. Nothing is mocked in N7. It is a pure function call.

N8 mocking: props only. It uses the file's existing `renderPanel` provider stack and `anonViewportBaseProps`, with no new
mock.

N10/N11/N12 mocking: HTTP boundary only. All reuse the #2207 hand-off describe's fixtures and its existing `@/lib/api`
mock. N11 adds a per-test `api.get` implementation that serves the validation state with `lifecycleStatus: 'VALIDATED'`
and leaves `editable` true, so only the lifecycle drives the result. N11 also has a test-only discrimination run: with its
fixture switched to `PREPARED` (product unmutated) it goes RED on `toBeDisabled()`, so the assertion runs after the
validation state resolved and is not satisfied by the pre-load state. N12 adds a per-test `api.post` implementation that
flips the GET overrides fixture from [] to the REASSIGN row when the POST resolves, so the row can appear only through a
post-success refetch of the overrides query.

## 6. Residuals and dispositions

No spec in this batch is a retirement candidate. All four STAY.

| spec | disposition |
|---|---|
| `issue-2205-admin-preview-node-scoping-browser-proof.spec.ts` | STAYS. NOT a retirement candidate. T1a/T1b PARTIAL (resolved node injected into the controller), T2a/T2b PARTIAL (Codex 4317365997: ?groupId -> group keys -> marker request not composed through `useDiscoverPageComposition`), 2205-real-drill PARTIAL/UNCOVERED (real navigation-panel click -> resolved node -> scoped request). |
| `issue-2207-admin-hierarchy-node-selection.spec.ts` | STAYS. NO LONGER a retirement candidate (Codex r2). NEW: T4 (N4, N4c), T5 (N10, N10b), T6a (N5), T6b (N12, N6), gating (N11). PARTIAL: T1, T2, T3 (tree-level with injected nodes), T6c (Codex 4317365968: REASSIGN never goes through `createOverride` + regeneration; `apps/api` outside this PR), T6d (confirm click proved against a mocked hook; confirm -> DELETE -> row removed not composed). |
| `property-request-card-legacy-and-browse-all-2795.spec.ts` | STAYS. Every row is PARTIAL: L1-card, L1-payload (Codex 4317365985), L2, L3, LM2, B2 (injected `ListingsBody` props or stubbed `AreaSelectedPanel`), L1-route (two units, not composed), L3-retry-callback (callback-only), L3-retry-http (re-issue unproved), LM1 (leaf gate + BROWSER_ONLY lifecycle), B1 (label handoff untested), B3 (stubbed panel, query-state error). |
| `sr024-error-vs-empty.spec.ts` | STAYS. Every row is PARTIAL except SR-A1-control (UNCOVERED) and SR-A1m-toggle (BROWSER_ONLY, RETAIN_SPECIALIST sub-row candidate): all cited tests inject the error/loading/zero state or a mocked refetch; no HTTP -> surface chain is composed. |

## 7. Intended manifest row text (NOT applied by this PR)

The manifest at `0d17841c` already has a row for each file with decision `MOVE_DOWN` and status `SCHEDULED(#2858)`.
They were read, not edited. The text below is the intended new decision/status/rationale for a later, separately
approved manifest change. No row in this batch proposes retirement.

| file | intended decision | intended status | intended rationale |
|---|---|---|---|
| `e2e/discover/issue-2205-admin-preview-node-scoping-browser-proof.spec.ts` | MOVE_DOWN | SCHEDULED(#2858) | #2858 batch 1 added N1/N2 (useDiscoverMapDataController preview node vs group marker path) and N3 (useDiscoverAreaGroupsController ?groupId -> group area_keys), but each injects its input: the node and group-key compositions (real panel clicks -> node; ?groupId -> useDiscoverPageComposition -> marker request) are not composed at any lower level, so every row is PARTIAL (map doc section 1). NOT a retirement candidate; the spec STAYS. |
| `e2e/discover/issue-2207-admin-hierarchy-node-selection.spec.ts` | MOVE_DOWN | SCHEDULED(#2858) | #2858 batch 1 added page-level, HTTP-boundary-only N4/N4c/N5/N6/N10/N11/N12 (tree action -> Overrides prefill incl. kind, REASSIGN payload, apply -> refetch -> listed line, non-PREPARED gating). Still PARTIAL: T1-T3 (tree-level with injected nodes), T6c (REASSIGN not exercised through createOverride + regeneration; backend IT is EXCLUDE_AREA only), T6d (remove confirm proved against a mocked hook). NOT a retirement candidate; the spec STAYS (map doc section 2). |
| `e2e/discover/property-request-card-legacy-and-browse-all-2795.spec.ts` | MOVE_DOWN | SCHEDULED(#2858) | #2858 batch 1 added N7 (no hierarchy + ?areaKey= -> 'area-selected'). Every row is PARTIAL: the cited ListingsBody/AreaJourneyPanel/NodeListingsSurface tests inject props or stub AreaSelectedPanel, so the legacy route -> listings HTTP -> card/payload chain, the Browse-all label handoff and the Retry HTTP re-issue are not composed; 2795-LM1's real-phone "map never ready" lifecycle is BROWSER_ONLY. NOT a retirement candidate; the spec STAYS (map doc section 3). |
| `e2e/discover/sr024-error-vs-empty.spec.ts` | MOVE_DOWN | SCHEDULED(#2858) | #2858 batch 1 added N8 (anon viewport genuine zero, props-only). Every row is PARTIAL (leaf/bridge/model tests with injected error, loading or zero state; Retry proved as callback only) except SR-A1-control (UNCOVERED) and SR-A1m-toggle (BROWSER_ONLY, RETAIN_SPECIALIST sub-row candidate). NOT a retirement candidate; the spec STAYS; trim candidate (map doc section 4). |

## 8. Not in batch 1

| file | disposition |
|---|---|
| `e2e/discover/property-request-card.spec.ts` | Deferred to #2858 batch 2. 15 tests, including the T12/T13 journey x viewport geometry matrices that need an R5 ruling. Its manifest row is unchanged. |
