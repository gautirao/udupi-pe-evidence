# E2E retirement assertion map - PR-4 (e2e/discover/** subdir family)

Issue #2750, PR-4 of 7, Stage B2. Base `079a3e47`; destination tests committed at `4316865c` (branch `issue-2750-pr4-discover-subdir-retirement`); B2 re-check at `1a664ad4`.
This file is the tracked, squash-surviving record behind each PR-4 manifest rationale: a manifest row cites
`map: docs/testing/e2e-retirement-map-pr4.md#<anchor>`. The anchors are stable.

Stage B1 deleted four specs (the `b1_deletable` set). Stage B2 deletes exactly seventeen more, named one by one by the owner at the deletion gate (PR #2815 issuecomment-6178433147; ruling only, not merge authorization). The other 36 PR-4 specs stay on disk, status SCHEDULED(PR-7). A spec is deleted only when
every assertion below is `COVERED_CANONICAL`, `COVERED_LOWER` or `OBSOLETE` (rule AC14); an uncovered, vacuous, unproven or env-failing row keeps the spec.

## Counts

PR-4 scope is 57 specs (the PR-4-owned rows within manifest lines 100-173, which also hold PR-3/PR-6 rows; all in `e2e/discover/**`): **21 retired** (4 in B1 + 17 in B2) and **36 kept on disk** (SCHEDULED(PR-7)). Legacy `--project=full --list` at the base: 288 runtime tests, 244 textual declarations (PR-1 estimated 243; +1 is a regex artefact in `thanisandra-hennur-belt-label-collision-1815`). Canonical gate at the base: 48/48 passed (`CANONICAL E2E GATE: PASS @ 079a3e47`).

## Verdict words and evidence rules

- `COVERED_CANONICAL`: a canonical journey that passed in the baseline gate and whose file is byte-identical at HEAD (`git diff --stat 079a3e47 HEAD -- e2e/canonical` is empty). No mutation by rule.
- `COVERED_LOWER`: an existing or new lower-level `it` that shows a check mark at HEAD (one run of its file, `--reporter=verbose --maxWorkers=1`, dummy loopback env) AND has a RED-then-GREEN mutation of the exact product line (`MUT-nnn`; RED captured before revert; `diff --exit-code` = 0; GREEN after). Backend: `Tests run: N`, N > 0.
- `OBSOLETE`: current source contradicts the asserted behaviour, or the assertion is a tautology that cannot fail (cited below at HEAD).
- `it` titles are authoritative; test line numbers drift and are not relied on. B2 cites each `it` by a distinctive fragment of its title; every fragment was machine-checked as a substring of a check-marked title in the covering file's own run at HEAD `1a664ad4`. "Recheck log" = `evidence/b2/recheck/<basename>.log` for the 17 B2 specs and `evidence/b1/recheck/<basename>.log` for the 4 B1 specs in the PR evidence directory (summaries: `evidence/b2/b2-recheck.md`, `evidence/b1/b1-recheck.md`).
- Mutation evidence: `evidence/mutation/MUT-nnn.{txt,red.log,green.log}` + `index.tsv`.

All paths below are under `apps/web/src/` unless they start with `e2e/` or `apps/api/`.

## Per-spec index

| spec | anchor | status | assertion rows: covered / obsolete / uncovered |
|---|---|---|---|
| `e2e/discover/issue-1956-pr2-count-copy.spec.ts` | [`#issue-1956-pr2-count-copy`](#issue-1956-pr2-count-copy) | RETIRED_B1 | 4 / 1 / 0 |
| `e2e/discover/issue-1956-pr2-destination-surface.spec.ts` | [`#issue-1956-pr2-destination-surface`](#issue-1956-pr2-destination-surface) | RETIRED_B1 | 6 / 2 / 0 |
| `e2e/discover/issue-2139-coincident-marker-overlap.spec.ts` | [`#issue-2139-coincident-marker-overlap`](#issue-2139-coincident-marker-overlap) | RETIRED_B1 | 4 / 0 / 0 |
| `e2e/discover/issue-2459-area-bounds-residential.spec.ts` | [`#issue-2459-area-bounds-residential`](#issue-2459-area-bounds-residential) | RETIRED_B1 | 4 / 0 / 0 |
| `e2e/discover/anon-zoom-past-area-guidance.spec.ts` | [`#anon-zoom-past-area-guidance`](#anon-zoom-past-area-guidance) | RETIRED_B2 | 5 / 0 / 0 |
| `e2e/discover/badge-context-precedence.spec.ts` | [`#badge-context-precedence`](#badge-context-precedence) | RETIRED_B2 | 4 / 0 / 0 |
| `e2e/discover/issue-1956-pr2-atomic-transition.spec.ts` | [`#issue-1956-pr2-atomic-transition`](#issue-1956-pr2-atomic-transition) | RETIRED_B2 | 7 / 1 / 0 |
| `e2e/discover/issue-1956-pr2-filters-survive-navigation.spec.ts` | [`#issue-1956-pr2-filters-survive-navigation`](#issue-1956-pr2-filters-survive-navigation) | RETIRED_B2 | 1 / 0 / 0 |
| `e2e/discover/issue-1956-pr2-guarded-hierarchy-back.spec.ts` | [`#issue-1956-pr2-guarded-hierarchy-back`](#issue-1956-pr2-guarded-hierarchy-back) | RETIRED_B2 | 5 / 0 / 0 |
| `e2e/discover/issue-1956-pr4-listings-error-state.spec.ts` | [`#issue-1956-pr4-listings-error-state`](#issue-1956-pr4-listings-error-state) | RETIRED_B2 | 4 / 0 / 0 |
| `e2e/discover/issue-1956-pr6-absence-discipline.spec.ts` | [`#issue-1956-pr6-absence-discipline`](#issue-1956-pr6-absence-discipline) | RETIRED_B2 | 3 / 1 / 0 |
| `e2e/discover/issue-1956-pr6-canonical-back-rehome.spec.ts` | [`#issue-1956-pr6-canonical-back-rehome`](#issue-1956-pr6-canonical-back-rehome) | RETIRED_B2 | 2 / 0 / 0 |
| `e2e/discover/issue-1956-pr6-composed-seam.spec.ts` | [`#issue-1956-pr6-composed-seam`](#issue-1956-pr6-composed-seam) | RETIRED_B2 | 4 / 1 / 0 |
| `e2e/discover/issue-1956-pr6-journey-switch-conversion.spec.ts` | [`#issue-1956-pr6-journey-switch-conversion`](#issue-1956-pr6-journey-switch-conversion) | RETIRED_B2 | 7 / 1 / 0 |
| `e2e/discover/issue-2083-nav-counts-purpose-badge.spec.ts` | [`#issue-2083-nav-counts-purpose-badge`](#issue-2083-nav-counts-purpose-badge) | RETIRED_B2 | 5 / 0 / 0 |
| `e2e/discover/issue-2086-bangalore-area-hierarchy.spec.ts` | [`#issue-2086-bangalore-area-hierarchy`](#issue-2086-bangalore-area-hierarchy) | RETIRED_B2 | 9 / 1 / 0 |
| `e2e/discover/issue-2142-hierarchy-back-direction-root.spec.ts` | [`#issue-2142-hierarchy-back-direction-root`](#issue-2142-hierarchy-back-direction-root) | RETIRED_B2 | 4 / 0 / 0 |
| `e2e/discover/issue-2494-mobile-return-camera-restore.spec.ts` | [`#issue-2494-mobile-return-camera-restore`](#issue-2494-mobile-return-camera-restore) | RETIRED_B2 | 5 / 0 / 0 |
| `e2e/discover/issue-2528-back-forward-filter-sync.spec.ts` | [`#issue-2528-back-forward-filter-sync`](#issue-2528-back-forward-filter-sync) | RETIRED_B2 | 5 / 0 / 0 |
| `e2e/discover/issue-2660-area-leaf-drilldown.spec.ts` | [`#issue-2660-area-leaf-drilldown`](#issue-2660-area-leaf-drilldown) | RETIRED_B2 | 7 / 0 / 0 |
| `e2e/discover/issue-2674-mobile-viewport-debounce-orphan.spec.ts` | [`#issue-2674-mobile-viewport-debounce-orphan`](#issue-2674-mobile-viewport-debounce-orphan) | RETIRED_B2 | 2 / 0 / 0 |

Security-labelled: only `anon-zoom-past-area-guidance` among the 21 retired (SEC=Y). The other 20 are SEC=N.

---

## issue-1956-pr2-count-copy

Manifest row: MOVE_DOWN, destination `components/discover/navigation/__tests__/NavigationChildCard.test.tsx`. Security: N. 7 spec tests.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L70-79 | heading "N areas with matches" reads matchingAreaCount, never the listing total | COVERED_LOWER | `components/discover/navigation/__tests__/NavigationLevelPanel.test.tsx`: `heading reads matchingAreaCount, never listingCount`; `pass 4 regression - the missing areas-with-matches line never suppresses the journey-aware listing count in the heading` | MUT-420 (NavigationLevelPanel.tsx:88-90), MUT-421 (:100) | NavigationLevelPanel.test.tsx.log |
| 1b | L70-79 | a Direction's matchingAreaCount counts member areas with a match, not its listing total | COVERED_LOWER | `features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`: `a DIRECTION node's own matchingAreaCount ... NOT its listing total` | MUT-422 (useAreasNavigationJourney.ts:564) | useAreasNavigationJourney.test.ts.log |
| 2 | L112-117 | Direction card and map marker show the same two lines from the same field | COVERED_LOWER | `components/discover/navigation/__tests__/NavigationChildCard.test.tsx`: `renders the true matchingAreaCount, never the listingCount`, `shows BOTH the areas-with-matches line and the listing count`; `components/map/__tests__/AreaMarkerLayer.destinations.test.tsx`: `count_display_defect_2026_07_29 (regression) ... marker caption`; `useAreasNavigationJourney.test.ts`: `a CHILD's matchingAreaCount is the server-computed AREA count, not its listing total` | MUT-423 (NavigationChildCard.tsx:104-106), MUT-424 (AreaMarkerLayer.tsx:860-862), MUT-425 (useAreasNavigationJourney.ts:498) | NavigationChildCard.test.tsx.log, AreaMarkerLayer.destinations.test.tsx.log |
| 3 | L131-138, L152-155 | a leaf with zero listings shows "No listings yet" and no structural line | COVERED_LOWER | `NavigationChildCard.test.tsx`: `an AREA leaf child with zero listings shows "No listings yet", not the structural zero literal`, `an AREA leaf child shows its own listing count and no structural count line` | MUT-426 (useAreasNavigationJourney.ts:95), MUT-427 (NavigationChildCard.tsx:114) | NavigationChildCard.test.tsx.log |
| 4 | L188, L200, L206 | never the "+N" form at Direction / cluster level | COVERED_LOWER | `features/discover/navigation/__tests__/journeyVisibility.test.ts`: `NEGATIVE TEST: never uses the +N form, at any count` | MUT-428 (journeyVisibility.ts:130-132) | journeyVisibility.test.ts.log |
| 5 | L158-168 "DOCUMENTED GAP" | `expect(NO_MATCHES_LITERAL).toBe('No matches with current filters')` | OBSOLETE | none needed. Re-opened at HEAD: `e2e/discover/issue-1956-pr2-count-copy.spec.ts` L158-168 compares a spec constant with its own literal and drives no page; it asserts no product property and cannot fail on a product change. | - | b1-recheck.md section 2 |

## issue-1956-pr2-destination-surface

Manifest row: MOVE_DOWN, destination `components/map/__tests__/AreaMarkerLayer.destinations.test.tsx`. Security: N. 6 spec tests.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L80-95 (AC3.1) | one card and one marker per Direction child, no whole-city marker | COVERED_LOWER | `components/map/__tests__/AreaMarkerLayer.destinations.test.tsx`: `renders exactly one marker per DIRECTION child at the city root, no whole-city marker` | MUT-431 (AreaMarkerLayer.tsx:1582) | AreaMarkerLayer.destinations.test.tsx.log |
| 2 | L107-108 (AC3.4) | heading names the node with the same node_key / count as the map | COVERED_LOWER | `components/discover/navigation/__tests__/NavigationLevelPanel.test.tsx`: `AC3.4 - heading names the node and shows the SAME nodeCount the map uses` | MUT-432 (NavigationLevelPanel.tsx:146) | NavigationLevelPanel.test.tsx.log |
| 3 | L119-124 (AC3.8) | a sparse group goes straight to AREA children, no fabricated cluster | COVERED_LOWER | `features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`: `AC2 - a sparse group whose server response returns AREA children directly (no CLUSTER level) renders straight to Areas` | MUT-435 (useAreasNavigationJourney.ts:489) | useAreasNavigationJourney.test.ts.log |
| 4 | L135-148 (AC3.5, CLUSTER child) | a CLUSTER child renders through the same card path | COVERED_LOWER | `features/discover/views/__tests__/DiscoverAreasJourneyPanel.test.tsx`: `renders the CLUSTER child through the SAME NavigationChildCard path as a DIRECTION child` | MUT-453 (NavigationChildList.tsx:51) | DiscoverAreasJourneyPanel.test.tsx.log |
| 4b | L135-148 (AC3.5, "<= 6 children") | at most six children shown | OBSOLETE | Re-opened at HEAD: `features/discover/navigation/useAreasNavigationJourney.ts` children memo maps all `node.children` with no cap (`warnIfChildrenExceedServerCap` only warns); `useAreasNavigationJourney.test.ts` has check marks for `AC12 (Issue #2086, inverted from the pre-#2086 5-cap) - ALL 6 server-sent Direction children render, none dropped`, `... ALL 8 server-sent Local Destination (CLUSTER) children render`, `AC12 - the server-guaranteed maximum of 15 children ALL render`. The cap was removed by #2086. | - | useAreasNavigationJourney.test.ts.log |
| 5 | L159-171 (AC3.9) | marker click and card click write the same node= | COVERED_LOWER | `AreaMarkerLayer.destinations.test.tsx`: `click calls the injected onSelect reference with the exact server nodeKey`; `useAreasNavigationJourney.test.ts`: `AC3.9 - selectNode is the SAME onSelectNode reference passed in, never wrapped` | MUT-429 (AreaMarkerLayer.tsx:1598), MUT-433 (useAreasNavigationJourney.ts:568) | AreaMarkerLayer.destinations.test.tsx.log, useAreasNavigationJourney.test.ts.log |
| 6 | L187-193 | card hover reports the same marker by node_key | COVERED_LOWER | `AreaMarkerLayer.destinations.test.tsx`: `hover/focus report the node_key via onHoverChange, and leave reports null`; `components/discover/navigation/__tests__/NavigationChildCard.test.tsx`: `forwards hover/focus changes for map<->panel sync by stable node_key` | MUT-430 (AreaMarkerLayer.tsx:1599), MUT-434 (NavigationChildCard.tsx:131) | AreaMarkerLayer.destinations.test.tsx.log, NavigationChildCard.test.tsx.log |
| 6b | L183, L188, L193 | marker border-width 1px -> 2px on hover | OBSOLETE | Re-opened at HEAD: `components/map/__tests__/AreaMarkerLayer.destinationCardGrammar.test.tsx` check-marks `(3) Issue #2330 - resting state uses the shared shell's Explore border (rgba(27,42,69,0.24)), a fixed 1.5px width` (asserts `border:1.5px solid rgba(27,42,69,0.24)`); `AreaMarkerLayer.destinations.test.tsx` records "Issue #2330 makes hover a pure CSS transform (no HTML diff)". Hover no longer changes the border width. | - | AreaMarkerLayer.destinationCardGrammar.test.tsx.log |

## issue-2139-coincident-marker-overlap

Manifest row: MOVE_DOWN (not DELETE_DUP: canonical T19/T20 cover only the mobile-tap row; the other rows are lower-level), destination `components/map/__tests__/PropertyMap.clusterTapFit.test.tsx`. Security: N. 2 spec tests.
Caveat for the owner: the spec crosses the z16 threshold by a manual `+` after a tap, the lower tests cross it by camera / zoom policy; same layer rebuild, different trigger.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L142-171 | a coincident cluster does not split on tap; plural label; clustering off at the zoom threshold | COVERED_LOWER | `components/map/__tests__/PropertyMap.clusterTapFit.test.tsx`: `non-splittable cluster (coincident bounds, no spatial spread): publishes nothing`; `lib/map/__tests__/areaClusterSplit.test.ts`: `coincident centres (no spatial spread) -> false`; `components/map/__tests__/PropertyMap.listingClusterMarker.test.tsx`: `sets role="button", tabindex="0", and a plural aria-label for count > 1`; `shared/map/zoomPolicy.issue1823.test.ts`: `equivalence with today's CLUSTER_DISABLE_AT_ZOOM boolean ...` | MUT-401 (areaClusterSplit.ts:79), MUT-402 (ResidentialMarkerClusterLayer.tsx:327), MUT-403 (zoomPolicy.ts:335) | PropertyMap.clusterTapFit.test.tsx.log, areaClusterSplit.test.ts.log, PropertyMap.listingClusterMarker.test.tsx.log, zoomPolicy.issue1823.test.ts.log |
| 2 | L203-212 | every coincident listing is present exactly once (none added or dropped) | COVERED_LOWER | `PropertyMap.clusterTapFit.test.tsx`: `does not add or drop markers - a mix of one coincident pair and one distinct listing still constructs ...`; `shared/map/__tests__/zoomPolicy.coincidentClusterMembership.test.ts`: `n=40 coincident listings ... remain in one cluster at zoom 15` | MUT-407 (ResidentialMarkerClusterLayer.tsx:388), MUT-405 (zoomPolicy.ts:617) | PropertyMap.clusterTapFit.test.tsx.log, zoomPolicy.coincidentClusterMembership.test.ts.log |
| 3 | L220-232 | coincident markers sit at distinct, non-overlapping positions | COVERED_LOWER | `shared/map/__tests__/zoomPolicy.coincidentOffset.test.ts`: `AC1: 3 listings sharing identical coordinates all resolve to distinct, pairwise non-overlapping ...`, `2-way coincidence also separates both members`; `PropertyMap.clusterTapFit.test.tsx`: `AC1: 3 listings sharing identical coordinates are constructed as 3 markers at 3 distinct [lat,lng]` | MUT-404 (zoomPolicy.ts:624), MUT-406 (ResidentialMarkerClusterLayer.tsx:361-363) | zoomPolicy.coincidentOffset.test.ts.log, PropertyMap.clusterTapFit.test.tsx.log |
| 4 | L253-292 | mobile tap reaches both coincident listings | COVERED_CANONICAL | `e2e/canonical/map-marker-interaction.canonical.ts` T19 (:68, unforced click + stepper reach both) and T20 (:218, selected marker stays); both passed in the baseline gate | none by rule | baseline gate-run-1 |

## issue-2459-area-bounds-residential

Manifest row: MOVE_DOWN, destination `features/discover/state/url/__tests__/areaBoundsSqft.test.ts` (backend counterpart `apps/api/src/test/java/com/example/realestate/discover/CityAreaListingsControllerTest.java`). Security: N. 4 spec tests.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L142 | the residential area-bounds round trip renders listings for an anonymous visitor | COVERED_CANONICAL | `e2e/canonical/anon-discover-teaser.canonical.ts` T10 (anon Discover, RR Nagar leaf, passed in the baseline gate) | none by rule | baseline gate-run-1 |
| 2 | L159 | a decimal sqft bound is dropped and never reaches the wire | COVERED_LOWER | `features/discover/state/url/__tests__/areaBoundsSqft.test.ts`: `DROPS a decimal bound`, `a dropped decimal never reaches the WIRE either`; `features/discover/filters/__tests__/areaBounds.test.ts`: `DROPS a decimal rather than rounding it` | MUT-408 (areaBounds.ts:186-189) | areaBoundsSqft.test.ts.log, areaBounds.test.ts.log |
| 3 | L179 | an inverted range is dropped | COVERED_LOWER | `areaBoundsSqft.test.ts`: `DROPS an inverted range`; `areaBounds.test.ts`: `drops BOTH bounds for an inverted pair` | MUT-409 (areaBounds.ts:224) | areaBoundsSqft.test.ts.log, areaBounds.test.ts.log |
| 4 | L198 | valid bounds are restored and reach the server intact | COVERED_LOWER | `areaBoundsSqft.test.ts`: `restores both bounds on load`; `areaBounds.test.ts`: `keeps a valid pair - the control arm`; backend `CityAreaListingsControllerTest`: `issue2450_areaBounds_reachTheServiceIntact` (`Tests run: 44, Failures: 0`, BUILD SUCCESS) | MUT-410 (areaBounds.ts:221), MUT-411 (CityAreaListingsController.java:217) | areaBoundsSqft.test.ts.log, areaBounds.test.ts.log, CityAreaListingsControllerTest.log |

---

## anon-zoom-past-area-guidance

Manifest row: MOVE_DOWN, destination `components/discover/__tests__/MapEmptyGuidance.test.tsx`. Security: Y.
SECURITY-LABELLED. Chain: (a) mutation proofs MUT-501..509 and MUT-547 on disk; (b) security-reviewer APPROVE on disk (transcripts/security-reviewer-anon-zoom.md); (c) owner by-name approval = PR #2815 issuecomment-6178433147. Residual (disclosed, not an uncovered row): the live-journey reachability of the prompt (non-area-first only) is pinned by the wiring `it`'s journey control, not by a browser.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L113 | an anonymous visitor zoomed past the area layer with no area selected and cityTotal > 0 sees the sign-in prompt with the exact `/auth?returnTo=/discover` href | COVERED_LOWER | `components/discover/__tests__/MapEmptyGuidance.test.tsx`: `#1156: anon + zoomed past threshold + no area + cityTotal > 0` | MUT-501 (MapEmptyGuidance.tsx:155 gate -> false; authed control stays green), MUT-505 (:194 href) | MapEmptyGuidance.test.tsx.log |
| 2 | L113 (wiring) | the real map canvas feeds that gate: prompt present (testid, text, exact href) for anon + school-first + zoomed past + no area; authed, threshold-zoom, selected-area and area-first controls render none | COVERED_LOWER | `features/discover/views/DiscoverMapCanvas.test.tsx`: `#2750 anon-zoom wiring` | MUT-506, MUT-507, MUT-508, MUT-509, MUT-547 (DiscoverMapCanvas.tsx:1397-1409) | DiscoverMapCanvas.test.tsx.log |
| 3 | L186 | an authenticated user (else identical) is NOT shown the prompt | COVERED_LOWER | `components/discover/__tests__/MapEmptyGuidance.test.tsx`: `#1156: authenticated user (else identical)` | MUT-502 (MapEmptyGuidance.tsx:155) | MapEmptyGuidance.test.tsx.log |
| 4 | L166 | a selected area suppresses the prompt | COVERED_LOWER | `components/discover/__tests__/MapEmptyGuidance.test.tsx`: `#1156: area selected (else identical)` | MUT-503 (:156) | MapEmptyGuidance.test.tsx.log |
| 5 | L133 | zoom exactly at the threshold shows no prompt (strictly greater only) | COVERED_LOWER | `components/discover/__tests__/MapEmptyGuidance.test.tsx`: `#1156: zoom at threshold boundary` | MUT-504 (:159 `>` -> `>=`) | MapEmptyGuidance.test.tsx.log |

## badge-context-precedence

Manifest row: MOVE_DOWN, destination `features/discover/controllers/useDiscoverBadgeController.issue2190.test.ts`. Security: N.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L137 (BCP-1) | city browse badge is the SUM of every area listing count (three-area fixture so the sum differs from any single area) | COVERED_LOWER | `features/discover/controllers/useDiscoverBadgeController.issue2190.test.ts`: `BCP-1: city browse badge is the SUM`; `pages/__tests__/MapDiscovery.issue1152.test.ts`: `shows cityTotal when areas are loaded` | MUT-701, MUT-730 | useDiscoverBadgeController.issue2190.test.ts.log, MapDiscovery.issue1152.test.ts.log |
| 2 | L152 (BCP-2) | a group-only badge is the member-area sum, not the city and not a non-member; an area selection beats the group | COVERED_LOWER | `features/discover/controllers/useDiscoverBadgeController.issue2190.test.ts`: `BCP-2: group-only badge is the member-area sum`; `pages/__tests__/MapDiscovery.issue1175.test.ts`: `AC2-G` | MUT-702, MUT-703, MUT-704, MUT-728 | useDiscoverBadgeController.issue2190.test.ts.log, MapDiscovery.issue1175.test.ts.log |
| 3 | L168-170 (BCP-3) | area + group context resolves to the area count | COVERED_LOWER | `features/discover/controllers/useDiscoverBadgeController.issue2190.test.ts`: `BCP-2: group-only badge is the member-area sum`; `pages/__tests__/MapDiscovery.issue1175.test.ts`: `PREC-AG` | MUT-704, MUT-727 | useDiscoverBadgeController.issue2190.test.ts.log, MapDiscovery.issue1175.test.ts.log |
| 4 | L252-254 (BCP-4) | a school-radius context shows the radius-scoped count (competing numbers 18/25/36/9 all differ from 2) and hides the badge while the radius query loads | COVERED_LOWER | `features/discover/controllers/useDiscoverBadgeController.issue2190.test.ts`: `BCP-4: school-radius badge is the radius-scoped count`; `pages/__tests__/MapDiscovery.issue1175.test.ts`: `PREC-SG` | MUT-705, MUT-706, MUT-729 | useDiscoverBadgeController.issue2190.test.ts.log, MapDiscovery.issue1175.test.ts.log |

## issue-1956-pr2-atomic-transition

Manifest row: MOVE_DOWN, destination `features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`. Security: N.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L174-246 | a stale delayed resolve response for a superseded node never repaints the current node | COVERED_LOWER | `features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`: `N7: a late resolve for a superseded node never repaints the current node` | MUT-516 (resolve queryKey drops resolveKey) | useAreasNavigationJourney.test.ts.log |
| 2 | L116-135 | a committed root shows one map marker per Direction | COVERED_LOWER | `components/map/__tests__/AreaMarkerLayer.destinations.test.tsx`: `renders exactly one marker per DIRECTION child at the city root` | MUT-431 (AreaMarkerLayer.tsx:1582) | AreaMarkerLayer.destinations.test.tsx.log |
| 3 | L116-135 | root destination cards render | COVERED_LOWER | `features/discover/views/__tests__/DiscoverAreasJourneyPanel.test.tsx`: `success state` | MUT-548 (NavigationChildList.tsx:50 slice) | DiscoverAreasJourneyPanel.test.tsx.log |
| 4 | L131-135 | the breadcrumb is ONE current crumb, not a link | COVERED_LOWER | `components/discover/navigation/__tests__/AreasBreadcrumbTrail.test.tsx`: `the terminal crumb is current and never a link` | MUT-541 (AreasBreadcrumbTrail.tsx:154) | AreasBreadcrumbTrail.test.tsx.log |
| 5 | L138-151 | URL, panel heading and breadcrumb converge on the same node (one PUSH; heading carries the node key; overlay mounts the trail for the resolved node) | COVERED_LOWER | `features/discover/state/url/__tests__/navigationCommandMatrix.test.ts`: `goToChild(direction)`; `components/discover/navigation/__tests__/NavigationLevelPanel.test.tsx`: `heading names the node and shows the SAME nodeCount`; `components/discover/__tests__/DiscoverMapContextOverlay.nodeBreadcrumb.test.tsx`: `renders AreasBreadcrumbTrail when canonicalNavigationNode is resolved` | MUT-523 (navigation.ts:368 PUSH -> REPLACE), MUT-432 (NavigationLevelPanel.tsx:146), MUT-546 (DiscoverMapContextOverlay.tsx) | navigationCommandMatrix.test.ts.log, NavigationLevelPanel.test.tsx.log, DiscoverMapContextOverlay.nodeBreadcrumb.test.tsx.log |
| 6 | L158-160 | no stale root markers after the level changes | COVERED_LOWER | `components/map/__tests__/AreaMarkerLayer.destinations.test.tsx`: `removes a single-AREA marker when levelKind transitions to` | MUT-543 (AreaMarkerLayer.tsx:1360 level gate removed) | AreaMarkerLayer.destinations.test.tsx.log |
| 7 | L170-171 | only the node's own children render (none dropped) | COVERED_LOWER | `features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`: `ALL 6 server-sent Direction children render, none dropped` | MUT-545 (children derivation sliced). MUT-544 on NavigationLevelPanel was VACUOUS and is not relied on | useAreasNavigationJourney.test.ts.log |
| 8 | L165-166 | breadcrumb li == 1 / no City crumb | OBSOLETE | City crumb is always present: `components/discover/navigation/AreasBreadcrumbTrail.tsx:113-120` (PR #2141); `AreasBreadcrumbTrail.test.tsx` `a city-root node (empty ancestry) renders a single, current, unlinked crumb` and `PR #2141 Fix 1` tick at HEAD | - | AreasBreadcrumbTrail.test.tsx.log |

## issue-1956-pr2-filters-survive-navigation

Manifest row: MOVE_DOWN, destination `features/discover/state/url/__tests__/navigation.applyNodeDelta.test.ts`. Security: N.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | whole spec | a node hop (goToNode, goToAncestorNode, buildNodeHrefFromParams) never drops the intent filter | COVERED_LOWER | `features/discover/state/url/__tests__/navigation.applyNodeDelta.test.ts`: `N1a` | MUT-520 (navigation.ts applyNodeDelta `next.delete('intent')`) | navigation.applyNodeDelta.test.ts.log |

## issue-1956-pr2-guarded-hierarchy-back

Manifest row: MOVE_DOWN, destination `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`. Security: N.
Owner Q-HBB (answered A): HierarchyBackButton's simulated history index/timing is accepted only together with the real `navigate(-1/1)` test over the real `goToNode` writer (N1).

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | AC5.10 | native Back x2 lands on [AREA, D, null]; Forward x2 restores (real navigate(-1/1) over the real goToNode) | COVERED_LOWER | `features/discover/state/url/__tests__/navigation.applyNodeDelta.test.ts`: `N1` | MUT-521 (navigation.ts:368 goToNode push -> replace) | navigation.applyNodeDelta.test.ts.log |
| 2 | AC5.3 / AC5.4 | guarded Back POPs a proven-adjacent entry; Forward still restores it; consecutive presses walk the ancestry | COVERED_LOWER | `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`: `a proven-adjacent child->Back does not destroy the child entry`, `AC5.3 — TWO CONSECUTIVE Back presses` | MUT-532 (HierarchyBackButton.tsx:180), MUT-533 (useAreasNavigationJourney.ts:243) | HierarchyBackButton.test.tsx.log |
| 3 | AC5.5 / AC5.6 | a cold deep link or untrusted index falls back to REPLACE (fail closed) | COVERED_LOWER | `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`: `cold-load convergence (AC5.5)`, `an unproven guard (cold-loaded Area` | MUT-534 (:233 fail-closed returns pop) | HierarchyBackButton.test.tsx.log |
| 4 | ~1.5 s | an async same-slot REPLACE does not corrupt the guard | COVERED_LOWER | `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`: `fix-verify cycle 4 (regression)` | MUT-535 (:240-241 predecessor ignores current slot) | HierarchyBackButton.test.tsx.log |
| 5 | AC5.7 | no Back control at the city root | COVERED_LOWER | `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`: `AC5.7 — renders nothing at the city root` | MUT-536 (hierarchyBackDestination.ts:56-58) | HierarchyBackButton.test.tsx.log |

## issue-1956-pr4-listings-error-state

Manifest row: MOVE_DOWN, destination `features/discover/navigation/__tests__/discoverAreasJourneyPanelFilterIdentityAndError.test.tsx`. Security: N.
The 404 `it` is proven by two mutants: MUT-731 (`apiRequest` stops throwing; goes RED as a render TypeError, still RED and GREEN on revert) and MUT-802 (the hook turns the ApiError into a well-formed empty success; RED on the missing `areas-journey-panel-listings-error` testid, an assertion failure). The legacy `area-empty-state` testid is stale (zero-result testid is `area-zero-result-recovery` since #2018); the absence of the current id was added to both `it`s.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L41, L46-49 | a listing-query error shows the error affordance and never the "0 results" empty state | COVERED_LOWER | `features/discover/navigation/__tests__/discoverAreasJourneyPanelFilterIdentityAndError.test.tsx`: `a listing-query error renders the existing error/retry affordance` | MUT-732 (AreaLeafListingsSurface.tsx first-load error branch) | discoverAreasJourneyPanelFilterIdentityAndError.test.tsx.log |
| 2 | L42 | error copy "We couldn't load properties" | COVERED_LOWER | `features/discover/navigation/__tests__/discoverAreasJourneyPanelFilterIdentityAndError.test.tsx`: `a listing-query error renders the existing error/retry affordance` | MUT-733 (error copy reworded) | discoverAreasJourneyPanelFilterIdentityAndError.test.tsx.log |
| 3 | L55-60 | Retry calls the refetch | COVERED_LOWER | `features/discover/navigation/__tests__/discoverAreasJourneyPanelFilterIdentityAndError.test.tsx`: `a listing-query error renders the existing error/retry affordance` | MUT-734 (Retry no longer calls refetch) | discoverAreasJourneyPanelFilterIdentityAndError.test.tsx.log |
| 4 | L63-71 | a real HTTP 404 from the city-listings endpoint is also an error, through the real `lib/api.ts`; a 200 with no listings still renders the empty state | COVERED_LOWER | `features/discover/navigation/__tests__/discoverAreasJourneyPanelFilterIdentityAndError.test.tsx`: `a real HTTP 404 from the city-listings endpoint` | MUT-731 (lib/api.ts `if (!response.ok)` -> `if (false)`), MUT-802 | discoverAreasJourneyPanelFilterIdentityAndError.test.tsx.log |

## issue-1956-pr6-absence-discipline

Manifest row: MOVE_DOWN, destination `features/discover/navigation/__tests__/staticSweep.test.ts`. Security: N.
N9 pins the CURRENT behaviour (group-focus wins, #2213); the spec's "legacy sole" expectation is stale. Decision relabelled DELETE_DUP -> MOVE_DOWN because two new lower-level `it`s were required.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | whole spec | no production module emits any of the 26 deleted-panel testids (positive control plants all 26 in three quoting styles; corpus > 300 files incl. DiscoverPanelSurface.tsx) | COVERED_LOWER | `features/discover/navigation/__tests__/staticSweep.test.ts`: `no production module emits any of the 26 deleted-panel testids` | MUT-528 (literal planted in NavigationResolutionNotice.tsx) | staticSweep.test.ts.log |
| 2 | whole spec | journey=school-first + a resolved groupId mounts exactly one primary surface (sum over 4 surface testids == 1) | COVERED_LOWER | `features/discover/surfaces/__tests__/DiscoverPanelSurface.test.tsx`: `N9: journey=school-first + a resolved groupId mounts exactly one primary surface` | MUT-529 (DiscoverPanelSurface.tsx:66 group-focus pre-emption disabled) | DiscoverPanelSurface.test.tsx.log |
| 3 | whole spec | area-first root shows its sole surface; agricultural shows its sole surface | COVERED_CANONICAL | canonical `panel-exclusivity.canonical.ts` T18 (passed in the baseline gate; `git diff --stat 079a3e47 HEAD -- e2e/canonical` empty) | none by rule | baseline gate |
| 4 | whole spec | bare, journey-less `groupId=` and journey-less `areaKey=` URL shapes | OBSOLETE | those URL shapes no longer mount a legacy sole panel (#2088 / #2213); `DiscoverPanelSurface.test.tsx` ticks `mounts AreaGroupFocusPanel — not the group-blind canonical hierarchy panel — for the journeyless groupId cold-load state` and `mounts canonical and ignores a stale bookmarked groupId/areaKey when journey=area-first` | - | DiscoverPanelSurface.test.tsx.log, AreasBreadcrumbTrail.test.tsx.log |

## issue-1956-pr6-canonical-back-rehome

Manifest row: MOVE_DOWN, destination `features/discover/state/url/__tests__/navigation.applyNodeDelta.test.ts`. Security: N.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | whole spec | native Back from the Area leaf lands on the Direction (not Area, not null) | COVERED_LOWER | `features/discover/state/url/__tests__/navigation.applyNodeDelta.test.ts`: `N1` | MUT-522 (navigation.ts:368 goToNode push -> replace) | navigation.applyNodeDelta.test.ts.log |
| 2 | whole spec | the panel is a function of the node: area-leaf with listings, and a level with children | COVERED_LOWER | `features/discover/views/__tests__/DiscoverAreasJourneyPanel.characterization2660.test.tsx`: `area-leaf (has-listings) takes precedence`, `level (has children)` | MUT-537 (selectAreasJourneyBranch.ts:41), MUT-538 (:43) | DiscoverAreasJourneyPanel.characterization2660.test.tsx.log |

## issue-1956-pr6-composed-seam

Manifest row: MOVE_DOWN, destination `features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`. Security: N.
MUT-440 (notice fabricated at a fresh root) was VACUOUS: no existing test went red. The new `it` V2 replaces it as the proof and has its own RED_GREEN mutation (MUT-531).

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L65 | a fresh area-first root shows NO resolution notice (real hook -> real panel; a stale-node ANCESTOR control does render the notice) | COVERED_LOWER | `features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`: `V2: a fresh area-first root shows NO resolution notice` | MUT-531 (navigationModel.ts:394 EXACT short-circuit disabled) | useAreasNavigationJourney.test.ts.log |
| 2 | seam | switching journeys writes one PUSH from the plain path | COVERED_LOWER | `features/discover/state/url/__tests__/navigationCommandMatrix.test.ts`: `setJourney(\'area-first\')`; `features/discover/controllers/__tests__/useDiscoverJourneySwitchController.test.ts`: `takes the plain setJourney PUSH` | MUT-436 (area.ts:392 PUSH -> REPLACE), MUT-437 (area.ts:377), MUT-438 | navigationCommandMatrix.test.ts.log, useDiscoverJourneySwitchController.test.ts.log |
| 3 | seam | canonical panel mounts instead of the legacy wrapper | COVERED_LOWER | `features/discover/surfaces/__tests__/DiscoverPanelSurface.test.tsx`: `mounts DiscoverAreasJourneyPanel instead of the legacy DiscoverRightPanel when journey=area-first` | MUT-439 (DiscoverPanelSurface.tsx) | DiscoverPanelSurface.test.tsx.log |
| 4 | T4 | non-blank root, exactly one shell | COVERED_CANONICAL | canonical `panel-exclusivity.canonical.ts` T4 / T18 (passed in the baseline gate; byte-identical at HEAD) | none by rule | baseline gate |
| 5 | precondition | a precondition URL shape the spec seeds | OBSOLETE | journey-less group/area URL shapes were retired by #2088 (see the absence-discipline section) | - | DiscoverPanelSurface.test.tsx.log, AreasBreadcrumbTrail.test.tsx.log |

## issue-1956-pr6-journey-switch-conversion

Manifest row: MOVE_DOWN, destination `features/discover/controllers/__tests__/useDiscoverJourneySwitchController.test.ts`. Security: N.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L90-95 | groupId/areaKey are cleared in the SAME transition when entering the Areas journey from a legacy scope/groupId/areaKey URL | COVERED_LOWER | `features/discover/state/url/__tests__/navigation.applyNodeDelta.test.ts`: `N2` | MUT-524 (navigation.ts:509 groupId delete), MUT-525 (:510 areaKey delete) | navigation.applyNodeDelta.test.ts.log |
| 2 | L118-124 | navigate(-1) restores the exact legacy URL; Forward re-converts | COVERED_LOWER | `features/discover/state/url/__tests__/navigation.applyNodeDelta.test.ts`: `N2` | MUT-526 (navigation.ts:521 enterAreasJourney PUSH -> REPLACE) | navigation.applyNodeDelta.test.ts.log |
| 3 | L106-113 | exactly one history entry is added by the conversion | COVERED_LOWER | `features/discover/state/url/__tests__/navigationCommandMatrix.test.ts`: `enter-journey-atomic` | MUT-527 (:521) | navigationCommandMatrix.test.ts.log |
| 4 | L77-92 | a resolvable areaKey is resolved, then the journey is entered AT THAT NODE in ONE write | COVERED_LOWER | `features/discover/controllers/__tests__/useDiscoverJourneySwitchController.test.ts`: `legacy areaKey + switch TO area-first` | MUT-539 (onSuccess writes setJourney instead of enterAreasJourney) | useDiscoverJourneySwitchController.test.ts.log |
| 5 | L144-167 | a stale key shows a toast, no navigation, no history entry | COVERED_LOWER | `features/discover/controllers/__tests__/useDiscoverJourneySwitchController.test.ts`: `an unresolved/stale areaKey (404) retains the current state` | MUT-540 (onError also navigates) | useDiscoverJourneySwitchController.test.ts.log |
| 6 | L106-113 | the legacy wrapper is gone and the canonical panel is mounted | COVERED_LOWER | `features/discover/surfaces/__tests__/DiscoverPanelSurface.test.tsx`: `mounts DiscoverAreasJourneyPanel instead of the legacy DiscoverRightPanel when journey=area-first` | MUT-530 (DiscoverPanelSurface.tsx:78) | DiscoverPanelSurface.test.tsx.log |
| 7 | L81-88 | canonical breadcrumb shows the ancestor and current crumbs | COVERED_LOWER | `components/discover/navigation/__tests__/AreasBreadcrumbTrail.test.tsx`: `AC14 — a real Direction` | MUT-542 (AreasBreadcrumbTrail.tsx:120 chain drops ancestry). A first attempt on DiscoverAreasJourneyPanel.areaLeafBreadcrumb was VACUOUS (different component) and is not relied on | AreasBreadcrumbTrail.test.tsx.log |
| 8 | `li == 2` | breadcrumb has exactly two list items | OBSOLETE | City crumb is always present (`AreasBreadcrumbTrail.tsx:113-120`, PR #2141) | - | AreasBreadcrumbTrail.test.tsx.log |

## issue-2083-nav-counts-purpose-badge

Manifest row: MOVE_DOWN, destination `features/discover/controllers/useDiscoverBadgeController.issue2190.test.ts`. Security: N.
Backend: `NavigationControllerTest` covers the `?purpose=` binding at the controller layer only; `NavigationCountParityAndScaleIT` (service-layer sale/rent isolation) is NOT_RUN and is not relied on. The spec's seed facts (RR Nagar rent > 0, Nagarbhavi == 0) are data, not code.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L117-128 | the ground-truth `?purpose=` param is bound into the count query; an absent purpose stays blended | COVERED_LOWER | backend `apps/api/src/test/java/com/example/realestate/discover/navigation/NavigationControllerTest.java`: `getCounts_purposeParam_isBoundIntoTheCountQuery_andAbsentPurposeStaysBlended` (`Tests run: 62, Failures: 0`, BUILD SUCCESS; log NavigationControllerTest.log) | MUT-606 (NavigationController.java:637 `.withListingPurpose(purpose)` -> `(null)`) | NavigationControllerTest.log |
| 2 | L137-150 | the live heading follows Buy -> Rent: purpose is threaded through the adapter, the controller and the wire | COVERED_LOWER | `features/discover/adapters/navigationCountsFilters.test.ts`: `threads purpose and forwards only the 7 fields`; `features/discover/controllers/useDiscoverNavigationController.test.ts`: `passes city with DEFAULT_CITY fallback`, `threads nav.filters through the navigationCountsFilters adapter`; `hooks/__tests__/useDiscoverNavigationCounts.test.ts`: `serialises every supported filter param` | MUT-602 (navigationCountsFilters.ts:22), MUT-603 (useDiscoverNavigationController.ts:140), MUT-604 (:148), MUT-605 (useDiscoverNavigationCounts.ts:155) | navigationCountsFilters.test.ts.log, useDiscoverNavigationController.test.ts.log, useDiscoverNavigationCounts.test.ts.log |
| 3 | L160-166 | a zero-listing AREA row reads "No listings yet" | COVERED_LOWER | `components/discover/navigation/__tests__/NavigationChildCard.test.tsx`: `an AREA leaf child with zero listings shows "No listings yet"` | MUT-426 (useAreasNavigationJourney.ts:95), MUT-427 (NavigationChildCard.tsx:114) (reused) | NavigationChildCard.test.tsx.log |
| 4 | L179-190 (RC_B) | an unfiltered node-journey AREA leaf badge shows the AREA count (18), never the city total (25) | COVERED_LOWER | `features/discover/controllers/useDiscoverBadgeController.issue2190.test.ts`: `#2083 RC_B` | MUT-601 (useDiscoverBadgeController.ts:141 `selectedArea: null`) | useDiscoverBadgeController.issue2190.test.ts.log |
| 5 | L199-231 (AC9) | an empty Rent AREA leaf reads "No listings here yet", never the city total | COVERED_LOWER | `features/discover/controllers/useDiscoverBadgeController.issue2190.test.ts`: `#2083 AC9` | MUT-601 (same edit) | useDiscoverBadgeController.issue2190.test.ts.log |

## issue-2086-bangalore-area-hierarchy

Manifest row: MOVE_DOWN, destination `features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`. Security: N.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | Back | Back goes to the immediate ancestor; two consecutive Back presses land on the group | COVERED_LOWER | `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`: `navigates to the immediate ancestor`; `features/discover/navigation/__tests__/hierarchyBackDestination.test.ts`: `2. top-level DIRECTION with empty ancestry` | MUT-441 (hierarchyBackDestination.ts) | HierarchyBackButton.test.tsx.log, hierarchyBackDestination.test.ts.log |
| 2 | Back/Forward | a proven-adjacent child -> Back does not destroy the child entry; Forward restores it | COVERED_LOWER | `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`: `a proven-adjacent child->Back does not destroy the child entry`; the spec's native Back x3 / Forward x3 across Direction -> Cluster -> Area: `features/discover/state/url/__tests__/navigation.applyNodeDelta.test.ts`: `City→Direction→Area then Back×2 yields [AREA, D, null] (Back from Area lands on the DIRECTION — not the Area, not null); Forward×2 restores` (N1: real `navigate(-1/1)` over the real `goToNode` writer; the Cluster hop uses the same writer) | MUT-442 (HierarchyBackButton.tsx:170), MUT-521 (navigation.ts) | HierarchyBackButton.test.tsx.log |
| 3 | crumbs | City + all three real crumbs render for a Direction > Local Destination > Area chain | COVERED_LOWER | `components/discover/navigation/__tests__/AreasBreadcrumbTrail.test.tsx`: `AC14 — a real Direction` | MUT-443 (AreasBreadcrumbTrail.tsx) | AreasBreadcrumbTrail.test.tsx.log |
| 4 | crumbs | an ancestry deeper than the cap surfaces a distinct overflow notice | COVERED_LOWER | `components/discover/navigation/__tests__/AreasBreadcrumbTrail.test.tsx`: `AC5.1 depth-guard` | MUT-444 | AreasBreadcrumbTrail.test.tsx.log |
| 5 | cards | goToChild(direction) and goToChild(area) write `node=` | COVERED_LOWER | `features/discover/state/url/__tests__/navigationCommandMatrix.test.ts`: `goToChild(direction)`, `goToChild(area)` | MUT-445 (navigation.ts:361), MUT-446 (:289) | navigationCommandMatrix.test.ts.log |
| 6 | AC12 | all 6 Direction, all 8 Local-Destination and the 15-child ceiling render with none dropped | COVERED_LOWER | `features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`: `ALL 6 server-sent Direction children render, none dropped`, `ALL 8 server-sent Local Destination (CLUSTER) children render, none dropped`, `the server-guaranteed maximum of 15 children ALL render` | MUT-447 (useAreasNavigationJourney.ts child derivation) | useAreasNavigationJourney.test.ts.log |
| 7 | AC10 | the section count is journey.children.length and the label reads Areas | COVERED_LOWER | `components/discover/navigation/__tests__/NavigationLevelPanel.test.tsx`: `AC10 — the section count is journey.children.length` | MUT-448, MUT-449 (NavigationLevelPanel.tsx) | NavigationLevelPanel.test.tsx.log |
| 8 | leaf | an AREA leaf with populated bounds renders the listings surface | COVERED_LOWER | `features/discover/navigation/__tests__/discoverAreasJourneyPanelAreaLeaf.test.tsx`: `AREA leaf (populated bounds) renders the listings surface` | MUT-450 | discoverAreasJourneyPanelAreaLeaf.test.tsx.log |
| 9 | L212-215 (V3) | a zero-listing AREA leaf child is not dropped from the child list beside non-zero siblings | COVERED_LOWER | `features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`: `#2086 V3 — a zero-listing AREA leaf child stays in the child list` | MUT-607 (useAreasNavigationJourney.ts:484 filter drops zero-count AREA; the same edit left MUT-451 VACUOUS against the older `it`s, so V3 is the proof) | useAreasNavigationJourney.test.ts.log |
| 10 | L143 | the spec :143 assertion (superseded by the #2142 Direction-root Back behaviour) | OBSOLETE | contradicted by #2142: a top-level Direction now resolves Back to the city root (`hierarchyBackDestination.test.ts` `2. top-level DIRECTION with empty ancestry — falls back to the synthetic ROOT`) | - | hierarchyBackDestination.test.ts.log |

## issue-2142-hierarchy-back-direction-root

Manifest row: MOVE_DOWN, destination `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`. Security: N.
Owner Q-HBB (answered A): the simulated history index in HierarchyBackButton is accepted together with the N1 real-navigate test (see issue-1956-pr2-guarded-hierarchy-back). The plan named `AreaHierarchyLevelPanel.tsx:42` for the new `it`'s mutation, but the school-first panel never renders that component; the mutation is at `SchoolsNavigationJourneyPanel.tsx:234`.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L46-48 | a top-level Direction (empty ancestry) shows `Back to Bangalore` | COVERED_LOWER | `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`: `bug fix — a top-level Direction with EMPTY ancestry`, `AC14 — two-hop Back`; `features/discover/navigation/__tests__/hierarchyBackDestination.test.ts`: `2. top-level DIRECTION with empty ancestry — falls back to the synthetic ROOT` | MUT-609 (hierarchyBackDestination.ts:65 fallback disabled) | HierarchyBackButton.test.tsx.log, hierarchyBackDestination.test.ts.log |
| 2 | L50-51 | clicking it reaches the root | COVERED_LOWER | `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`: `bug fix — a top-level Direction with EMPTY ancestry` | MUT-610 (hierarchyBackDestination.ts:66 key) | HierarchyBackButton.test.tsx.log |
| 3 | L56-57 | Forward restores the Direction | COVERED_LOWER | `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`: `a proven-adjacent child->Back does not destroy the child entry` | MUT-442, MUT-532 (prior) | HierarchyBackButton.test.tsx.log |
| 4 | L64-75 | the school-first shell mounts the same control: `Back to Bangalore` with href `/discover?node=root`; the city root mounts none | COVERED_LOWER | `features/discover/surfaces/panel/__tests__/SchoolFirstJourneyPanel.test.tsx`: `a top-level DIRECTION with empty ancestry mounts` | MUT-608 (SchoolsNavigationJourneyPanel.tsx:234) | SchoolFirstJourneyPanel.test.tsx.log |

## issue-2494-mobile-return-camera-restore

Manifest row: MOVE_DOWN, destination `features/discover/controllers/useDiscoverMapDataController.test.ts`. Security: N.
Residual: Leaflet remount delivery is outside the spec's own assertions. MUT-417 and MUT-452 were VACUOUS against the older `it`; the new V1 `it` replaces them as the proof of the no-spurious-re-publish control.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | N>1 | returning to an N>1 area-set signature already committed earlier re-fires the camera fit | COVERED_LOWER | `features/discover/controllers/useDiscoverMapDataController.test.ts`: `N>1 re-visit (#2494)` | MUT-415 (useDiscoverMapDataController.ts) | useDiscoverMapDataController.test.ts.log |
| 2 | mobile | on mobile the fit is delivered on remount | COVERED_LOWER | `features/discover/controllers/useDiscoverMapDataController.test.ts`: `N>1 mobile deliver-on-remount (#2494)` | MUT-416 | useDiscoverMapDataController.test.ts.log |
| 3 | L378, L412 | no spurious re-publish: re-running the effect for the SAME committed N>1 signature (areas data refreshed, no Return) publishes nothing | COVERED_LOWER | `features/discover/controllers/useDiscoverMapDataController.test.ts`: `no spurious re-publish (#2494)` | MUT-611 (useDiscoverMapDataController.ts:339 guard removed) | useDiscoverMapDataController.test.ts.log |
| 4 | scope | the outgoing scope is captured into `rprev` by name and round-trips exactly | COVERED_LOWER | `features/discover/state/url/resultScope.test.ts`: `commit_captures_the_outgoing_scope_into_rprev_by_name`, `J3.5 — restoring the previous scope` | MUT-418 (resultScope.ts:202) | state-url-resultScope.test.ts.log |
| 5 | label | the Return control labels the previous area-set with real area names joined by ", " | COVERED_LOWER | `components/discover/panels/__tests__/AreaSelectedPanel.scopeBar.test.tsx`: `labels Return with real area names joined by` | MUT-419 (area-selected previous-scope selector) | AreaSelectedPanel.scopeBar.test.tsx.log |

## issue-2528-back-forward-filter-sync

Manifest row: MOVE_DOWN, destination `hooks/__tests__/useDiscoverPageState.popFilterSyncHistory.2528.test.ts`. Security: N.
The plan's mutation line `useDiscoverPageState.ts:292` is the comment block; the effect is `:322-325`. `buildPanelSurfaceModel` no longer has `results.filters`; the page filters reach the leaf via `view.filters.filters` (`buildPanelSurfaceModel.ts:819`). The backend `DiscoverListingPredicateBuilderTest` IN-clause was not re-mutated and is not relied on; the spec's "cards 2 -> 1" is a seed fact.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L124-131 | clicking the Apartments chip leaves it pressed | COVERED_LOWER | `features/discover/buyer-filters/sections/__tests__/ResidentialTypeRow.test.tsx`: `calls onToggleType with the clicked type value` | MUT-614 (ResidentialTypeRow.tsx:76 `aria-pressed={false}`) | ResidentialTypeRow.test.tsx.log |
| 2 | L134-137, L154-174 | URL and filters restore together on a real Back and Forward | COVERED_LOWER | `hooks/__tests__/useDiscoverPageState.popFilterSyncHistory.2528.test.ts`: `restores_url_predicate_and_filters_together_on_back_and_forward`; `hooks/__tests__/useDiscoverPageState.popFilterSync.2528.test.ts`: `pop_restores_property_type_into_visible_filters` | MUT-612 (useDiscoverPageState.ts:322-325 sync neutered) | useDiscoverPageState.popFilterSyncHistory.2528.test.ts.log, useDiscoverPageState.popFilterSync.2528.test.ts.log |
| 3 | L144-152 | DISCRIMINATING: the chip is UNPRESSED after a real Back on the stale page-level path | COVERED_LOWER | `features/discover/navigation/__tests__/discoverAreasJourneyPanelAreaLeaf.test.tsx`: `Apartments chip is pressed after the click and UNPRESSED after a real Back` | MUT-612 (decisive failure: `aria-pressed` true at the post-Back assertion) | discoverAreasJourneyPanelAreaLeaf.test.tsx.log |
| 4 | chip feeder | the chip is fed by the page-level filters object itself, never `nav.filters` | COVERED_LOWER | `features/discover/surfaces/__tests__/buildPanelSurfaceModel.test.ts`: `view.filters.filters is the page-level filters object itself` | MUT-613 (buildPanelSurfaceModel.ts:819) | buildPanelSurfaceModel.test.ts.log |
| 5 | model -> panel | the model-to-panel link carries the same references | COVERED_LOWER | `features/discover/surfaces/panel/__tests__/AreaFirstJourneyPanel.contract2660.test.tsx`: `view groups carry the SAME references the flat call passed` | MUT-615 (AreaFirstJourneyPanel.tsx:254) | AreaFirstJourneyPanel.contract2660.test.tsx.log |

## issue-2660-area-leaf-drilldown

Manifest row: MOVE_DOWN, destination `features/discover/navigation/__tests__/discoverAreasJourneyPanelAreaLeaf.test.tsx`. Security: N.
The spec text "enter school picking = REPLACE" is contradicted by source: `school.ts` `enterSchoolPicking` is a PUSH (Back returns to area-selected) and `clearSchoolPicking` is the REPLACE. The tests pin the real contract.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L301-307 | a Direction or Area card click writes `node=` | COVERED_LOWER | `features/discover/state/url/__tests__/navigationCommandMatrix.test.ts`: `goToChild(direction)`, `goToChild(area)` | MUT-445, MUT-446 (reused) | navigationCommandMatrix.test.ts.log |
| 2 | L309-318 | the leaf renders its listing cards | COVERED_LOWER | `features/discover/navigation/__tests__/discoverAreasJourneyPanelAreaLeaf.test.tsx`: `AREA leaf (populated bounds) renders the listings surface` | MUT-624 (AreaLeafListingsSurface.tsx `listings: []`) | discoverAreasJourneyPanelAreaLeaf.test.tsx.log |
| 3 | L321-333 | leaf Back returns to the Direction level and its child card is visible | COVERED_LOWER | `components/discover/navigation/__tests__/HierarchyBackButton.test.tsx`: `navigates to the immediate ancestor`; `components/discover/navigation/__tests__/NavigationLevelPanel.test.tsx`: `renders the bounded child list when children are present` | MUT-441, MUT-442 (prior), MUT-625 (NavigationChildList.tsx:51) | HierarchyBackButton.test.tsx.log, NavigationLevelPanel.test.tsx.log |
| 4 | L347-354 | entering schools-in-area REPLACES the leaf listings (control arm: without schoolPicking the same leaf shows its cards) | COVERED_LOWER | `features/discover/navigation/__tests__/discoverAreasJourneyPanelAreaLeaf.test.tsx`: `schoolPicking=1 swaps the leaf listings for the schools-in-area picker` | MUT-616 (AreaLeafListingsSurface.tsx:303 `if (false)`) | discoverAreasJourneyPanelAreaLeaf.test.tsx.log |
| 5 | L347-349 | enter writes `schoolPicking=1` as ONE new history entry | COVERED_LOWER | `features/discover/state/url/__tests__/school.setSchoolJourney.test.ts`: `enterSchoolPicking adds schoolPicking=1` | MUT-617 (school.ts:114), MUT-618 (:117 PUSH -> REPLACE) | school.setSchoolJourney.test.ts.log |
| 6 | L365-366 | exit removes only `schoolPicking` as a single REPLACE, same node | COVERED_LOWER | `features/discover/state/url/__tests__/school.setSchoolJourney.test.ts`: `clearSchoolPicking removes ONLY schoolPicking` | MUT-619 (school.ts:127), MUT-620 (:130 REPLACE -> PUSH) | school.setSchoolJourney.test.ts.log |
| 7 | L357-366 | the header Back ladder: rung 2 is not area dismissal, rung 1 wins, rung 3 control | COVERED_LOWER | `features/discover/controllers/useDiscoverSchoolController.test.ts`: `handleAreaFirstBack ladder (#2660)` | MUT-621 (useDiscoverSchoolController.ts:223), MUT-622 (:206), MUT-623 (:225) | useDiscoverSchoolController.test.ts.log |

## issue-2674-mobile-viewport-debounce-orphan

Manifest row: MOVE_DOWN, destination `features/discover/views/DiscoverMapCanvas.test.tsx`. Security: N.
`DiscoverMapCanvas.test.tsx` keeps one pre-existing red `it` (#2456 owner ruling C2, unedited, frozen); the new `it` is not that one.

| # | spec line | property | verdict | covering file:`it` at HEAD | MUT | recheck log |
|---|---|---|---|---|---|---|
| 1 | L103 (canvas half) | unmounting the map canvas cancels the pending 300 ms viewport commit exactly once; a re-render does not | COVERED_LOWER | `features/discover/views/DiscoverMapCanvas.test.tsx`: `#2674: unmounting the canvas calls urlActions.cancelViewportCommit exactly once` | MUT-513 (DiscoverMapCanvas.tsx:334 call removed), MUT-514 (:336 deps `[]` -> none) | DiscoverMapCanvas.test.tsx.log |
| 2 | L103 (facade half) | an explicit cancelViewportCommit() after a pan really disarms the armed debounce | COVERED_LOWER | `features/discover/state/url/__tests__/postPopViewportCancellation.test.ts`: `#2674: an explicit cancelViewportCommit() after a pan disarms the debounce` | MUT-515 (useDiscoverUrlState.ts:883 -> no-op) | postPopViewportCancellation.test.ts.log |

---

## Kept on disk

36 PR-4 specs stay on disk with status SCHEDULED(PR-7): 33 KEEP specs (at least one assertion is browser-only: real layout, hit-testing, Leaflet paint or real history timing, with no lower-level or canonical proof of the same property), plus `issue-2089-marker-swap-fixture` (READY but HELD by the owner at the deletion gate: the two-oracle replacement is weaker and the canonical AREA-leaf sheet is not reproduced), `area-drilldown-stale-viewport-1821` (NOT_READY: AC2 bare-URL derivation uncovered, MUT-803) and `active-context-chips-and-badge` (Q-RADIX A: popover rows proven only against a stand-in). Owner answers (all A): Q-R5 KEEP + PR-7 relabels; Q-PE KEEP; Q-HBB accept the simulated index with the real navigate test; Q-2419 KEEP; Q-2089-parity KEEP; Q-RADIX KEEP.

Follow-up issues authorised by the owner and filed by the Main Agent: #2816 (possible product defect: anonymous school-first map markers are not narrowed by the property-type filter, `useSchoolListings.ts` ~L173-180; blocks the "Map shows exactly the 1 apartment marker" row of `issue-2089-filter-list-map-parity`) and #2817 (missing test for the anonymous no-Authorization-header guard, `lib/api.ts:66-68`; AC5.8 of `issue-1956-pr5-mobile-list-first`).

Where the PR-1 decision label is contradicted by evidence the label is kept and the manifest row says "PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A)": DELETE_OBSOLETE (R5) rows `control-bar-mobile-reachability-1953`, `desktop-control-bar-shell-1953`, `discover-mobile-guard`, `issue-2305-cluster-marker-skin`, `issue-2330-marker-reskin-visual`, `mobile-landing-journey-switcher-1953`, `mobile-list-map-shell-1953`, `mobile-map-filters-2712` (all target live UI); DELETE_DUP rows `issue-1956-areas-adaptive-journeys`, `issue-1956-pr6-no-blank-panel`, `issue-2129-mobile-marker-occlusion`, `issue-2150-cluster-tap-spiderfy-regression`, `issue-2204-canonical-node-browser-proof` (each has an assertion no canonical id proves).

Popover stand-in limits (`active-context-chips-and-badge`, `StartOverButton`): the new `ActiveContextChips.test.tsx` and `StartOverButton.test.tsx` describes install a minimal Popover stand-in with `vi.doMock` + dynamic import (`doUnmock` in `finally`). It models only "a trigger click calls `onOpenChange(!open)` and content renders while open", and it strips every `PopoverContent` prop except `data-testid`. It does NOT prove the Radix portal, focus return, Escape or outside-click dismissal, or `asChild` forwarding, so these `it`s are not Radix coverage and must not be counted as such (owner Q-RADIX answer A: KEEP the spec). Ordering dependency: the stand-in describes must stay ABOVE the real-Radix describes in each file, because the stalled real-Radix `it`s leave residue that breaks them if they run first; any reorder, shuffle or sharding change can flake them.

NOT_READY at the B2 gate, spec restored and kept on disk (status SCHEDULED(PR-7)): `area-drilldown-stale-viewport-1821` - needs a facade-level `it` proving the bare-URL derivation (useDiscoverPageState.ts:264-266) + MUT. The AC1 direction (groupId/scope present, not bare) is proven (`MapDiscovery.issue1821.test.tsx` AC1 + MUT-801; `useDiscoverJourneyTransitions.test.tsx` + MUT-412/413). The AC2 direction (a bare area-only URL must keep the viewport, so the URL shape must derive bare = true) is UNPROVEN: MUT-803 replaced the derivation with `false` and every passing test stayed green (MapDiscovery.issue1821 AC1, the four useDiscoverPageState hook test files, useDiscoverJourneyTransitions.test.tsx, which injects the ref directly); the only test of that direction, `MapDiscovery.issue1821.test.tsx` AC2, is red at the base and is not counted. The deleted spec asserted BOTH directions (AC1 re-fit, AC2 bare area-only zoom unchanged), so the earlier claim that it asserted only the AC1 direction was wrong.

Per spec (manifest row, gap named; every one is KEPT in PR-4 per owner rule, PR #2815 issuecomment-6178433147):

| spec | manifest row | uncovered assertion / gap |
|---|---|---|
| `active-context-chips-and-badge` | 100 | Q-RADIX A: popover rows proven only against a stand-in (real-Radix `it`s stall in jsdom and stay red/unedited); group-only chip mount not asserted (group+area used); chip-gone-after-reset proven only when both clears are removed (MUT-713/735 vacuous singly) |
| `area-drilldown-stale-viewport-1821` | 102 | AC2 bare-URL derivation uncovered (MUT-803) |
| `control-bar-mobile-reachability-1953` | 104 | city/area hit-test; control-bar row h-scroll; city listbox clip/hit-test; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `desktop-control-bar-shell-1953` | 105 | row/document h-scroll; listbox option hit-test (single + sweep); simultaneous real layout; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `discover-mobile-guard` | 106 | page h-scroll at 3 checkpoints; empty-state full-width geometry; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `issue-1762-listing-density-clustering` | 107 | real cluster counts 9/4, landing zoom, URL identity, progressive split/convergence, spiderfy DOM, fan persist/collapse, stress, radius circle, 2-marker hit-test |
| `issue-1823-camera-fit-policy` | 108 | school-radius zoom monotonicity under real Leaflet fit (T4); T3 needs a new `it` |
| `issue-1956-areas-adaptive-journeys` | 109 | J7c marker count == card count in real Leaflet; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `issue-1956-pr2-breadcrumb` | 111 | AC5.14 no-clip/overflow geometry at 390x844 |
| `issue-1956-pr3-area-clustering` | 116 | backend count parity (AC4.6/RC_D); real Back-history revisit |
| `issue-1956-pr4-listing-peek-camera-restore` | 117 | AC4.10 delayed-camera restore; AC4.5 real Back; destination cell is a PR-1 placeholder (no existing partial destination) |
| `issue-1956-pr4-mobile-listings-scroll` | 119 | scroll ancestor; viewport reach + click; Retry reach; destination cell is a PR-1 placeholder (no existing partial destination) |
| `issue-1956-pr5-desktop-breadcrumb-regression` | 121 | crumb fit (scrollWidth == clientWidth within 1366); destination cell is a PR-1 placeholder (no existing partial destination) |
| `issue-1956-pr5-mobile-cluster-sheet` | 122 | sheet z-order hit-test; reachability; focus survives Map->List->Map; destination cell is a PR-1 placeholder (no existing partial destination) |
| `issue-1956-pr5-mobile-list-first` | 123 | AC5.4 list == marker; real Back; history delta; breadcrumb geometry x2; reachability; AC5.8 anon header/scope has no lower test (follow-up #2817); destination cell is a PR-1 placeholder (no existing partial destination) |
| `issue-1956-pr5-s5-mobile-listing-preview` | 124 | on-top hit-test; compact geometry; map-above-sheet hit-test; real Back reopen; destination cell is a PR-1 placeholder (no existing partial destination) |
| `issue-1956-pr6-no-blank-panel` | 129 | async uncaught pageerror on load uncovered (Q-PE A); the canonical harness has no pageerror hook; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `issue-2083-camera-back-determinism` | 130 | settled root camera inside real city bounds (Leaflet fitBounds -> URL); destination cell is a PR-1 placeholder (no existing partial destination) |
| `issue-2083-home-breadcrumb-back-camera-race` | 131 | live two-writer Leaflet camera race 2.5 s after Back; destination cell is a PR-1 placeholder (no existing partial destination) |
| `issue-2089-breadcrumb-list-flex-layout` | 134 | no-overflow at 390; wrapped/capped box heights; List button and City crumb elementFromPoint |
| `issue-2089-filter-list-map-parity` | 135 | map shows exactly the 1 apartment marker is uncovered (possible product defect: anon school-first markers not narrowed by the property-type filter, useSchoolListings.ts ~L173-180); follow-up #2816 |
| `issue-2089-marker-swap-fixture` | 136 | HELD by owner at the deletion gate: two-oracle replacement weaker; canonical AREA-leaf sheet not reproduced (the sheet oracle and the URL oracle run on two different states) |
| `issue-2089-pan-preserves-listing-preview` | 137 | List<->Map remount keeps lat/lon (real Leaflet) |
| `issue-2129-mobile-marker-occlusion` | 138 | Close reachability + geometry restore + listing cleared; 2-marker real hit-test swap; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `issue-2150-cluster-tap-spiderfy-regression` | 142 | all 8 rows uncovered (real spiderfy/fit, touchscreen tap, school-radius overlay, fan persistence); PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `issue-2204-canonical-node-browser-proof` | 143 | flow-4 zoom-band marker-fetch narrowing; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `issue-2305-cluster-marker-skin` | 147 | painted visibility; `!important` focus-ring cascade; schools/residential hover tints; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `issue-2330-marker-reskin-visual` | 148 | focus-ring cascade x3 families; painted footprint <=172x140; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `issue-2419-pr1-polygon-scope` | 149 | `scopeBar.toBeInViewport()` at 1366x768 and 390x844 (Q-2419 A) |
| `issue-2711-map-filter-intent-commit` | 155 | AC1 history delta + debounce race; AC2 Back lands on the pre-open URL |
| `journey-switch-overlay-cleanup-1940` | 158 | Leaflet radius circle + school marker mount/unmount/redraw; agri control absence; destination cell is a PR-1 placeholder (no existing partial destination) |
| `mobile-landing-journey-switcher-1953` | 159 | one-row/height geometry; tab hit-test; page h-scroll; pinned compact 3rd-tab gap; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `mobile-list-map-shell-1953` | 160 | tile requests List=0/Map>0; Leaflet pane leak x10; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `mobile-map-filters-2712` | 161 | hit-test, forced paint order, pixel darkening, backdrop topmost, Map stays after backdrop/Escape, in-sheet tap reachability; PR-1 label contradicted by evidence; PR-7 relabels (owner Q-R5 A) |
| `thanisandra-hennur-belt-label-collision-1815` | 172 | R2 real pill gap; R5 chip-click URL/non-empty; R6 pill drill (3 further assertions OBSOLETE) |
| `thanisandra-hennur-belt-marker-degradation` | 173 | E3 chip-click URL; E4 pin-click popover contract (4 further assertions OBSOLETE) |

The per-assertion detail for the kept specs lives in the PR evidence (`T1-tests.md`, `T2-tests.md`, `T3-tests.md`, `per-spec-evidence-filled.md`); the manifest rows are the tracked record.
