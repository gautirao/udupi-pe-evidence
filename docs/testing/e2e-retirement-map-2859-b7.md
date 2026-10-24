# #2859 batch B7 — Discover URL state, Back/Forward and navigation hops: per-assertion retirement map

Issue #2859 (umbrella #2750), batch B7, handoff 285907. Plan: PLAN_REVIEW rev2 APPROVED (approved-plan sha256 `d053815a…`).
Rows (manifest, keyed by file path): `e2e/discover-1939-listing-peek-url-restore.spec.ts`, `e2e/discover-area-first-drilldown-1483.spec.ts`,
`e2e/discover-bounded-listing-2087.spec.ts`, `e2e/discover-city-listings-empty-city-guard-2189.spec.ts`, `e2e/discover-city-switch.spec.ts`,
`e2e/discover-cluster-focus-back.spec.ts`, `e2e/discover-group-results-1597.spec.ts`, `e2e/discover-map-hierarchy.spec.ts`,
`e2e/discover-url-state.spec.ts`, `e2e/issue-2015-search-this-area-viewport.spec.ts`, `e2e/issue-2017-multi-area-areaset-commit-regression.spec.ts`.

No spec is deleted, moved or edited; manifest status stays `SCHEDULED(#2859)`; only the destination cells of these 11 rows change.
Retiring any spec still needs the owner's own by-name approval on the PR that deletes it.

Evidence base: every run below was made at `44bf41a5`. **Actual base after rebase: `d4a46abdb48aa687e5f08944e0b75d6d20bb98d8`.** `git diff --name-only 44bf41a5 d4a46abd` lists only the manifest,
so every cited test and mutated product blob is identical at both SHAs and all base runs and mutation results stand unchanged
(`.claude/handoffs/issue-285907/evidence/provenance-actual-base.md`). Mutation register:
`.claude/handoffs/issue-285907/evidence/mutation/register.tsv`; base runs: `evidence/base-runs/base-runs.tsv`; Team Lead COVERED sweep:
`evidence/sweep/sweep-r2.tsv`. Codex: NOT RUN (usage exhausted).

Dispositions: `COVERED_NEW`, `COVERED_EXISTING`, `RETAIN`, `STALE`, `OBSOLETE`. A composed hop is `COVERED` only when ONE it() observes
before, the action through the real relay, and after, and the seam mutation reddens that it. Every negative claimed as covered has its
positive control in the same it(). Outbound-request claims are covered only by tests running the real `lib/api` with a fetch stub;
tests that mock the API or the data hook give API-call argument coverage only. Canonical specs are named as context only, never as coverage.

## Team Lead adjudications (override the slice drafts below)

- `2087-1` (stale click recipe): **STALE**, not OBSOLETE. The text still exists (`JourneySwitcher.tsx:120-122`), so there is no removal
  evidence; the product contradicts the recipe because `/discover?city=bangalore` lands on the area-first city root, which lists the
  Direction nodes directly (`area.ts:92-98`, `NavigationLevelPanel.tsx:114-125,150-162`).
- `url-state-1`, probe-200 branch (a city WITH a navigation hierarchy): **RETAIN + owner question OQ2**, not STALE. The observed
  area-first panel sat on `areas-journey-panel-loading`, which may be a stub artefact, so it is not a supported product contradiction.
  `N11` covers the probe-404 branch only.
- `2015-3`, `2015-4`, `url-state-5`: the sweep's `MUT-… NOT_IN_REGISTER` flags are naming only. The cited PR-5 id is the one re-proven by the
  RED rerun in the same cell (`MA10` = MUT-1818, `MA12` = MUT-1458, `MC16`/`MC17` = MUT-1434/1432).
- `MH-2b`: the earlier "possible product divergence" was not confirmed. At the spec's own URL (`/discover?city=udupi&scope=`) a bubble click
  writes `scope=south-udupi` and no `areaKey` (`MD1` RED). The existing `MapDiscovery.issue1745-batchB-overviewClick.test.tsx`
  :242 uses `/discover?city=udupi`, which predates the area-first default, so it is red at base and is not cited. OQ1 is closed.
- `useAuth` is mocked in every new page-level file. All of them run as an anonymous viewer except `MapDiscovery.listingSelectedMarker2859`
  (N1), which runs a mocked authenticated non-admin user (`listingSelectedMarker2859.test.tsx:326`). N1 asserts nothing about gating, and
  this batch proves no gating of the authenticated surface.
- Not changed by this batch: the manifest `rationale` column of `e2e/discover-map-hierarchy.spec.ts` still carries the PR-7 wording
  "possible product divergence, R2 owner question". B7 edits only destination cells; this map (MH-2b above) supersedes that wording.
- Reroute cycle 1 (fix pass F1-F5, base `d4a46abd`): F1 non-null icon asserts in `listingSelectedMarker2859`, F2 `waitFor` in
  `cityListingsRequest2859` arm B, F3 pending-timer control in `viewportTimer2859`, F4 fail-closed fetch stub in four page files,
  F5 comment on the undriven 200 arm in `areaKeyColdLoad2859`. Re-proven by new mutation ids `MF1`-`MF7` (aliases of MA4, MA1, MC20, MC21, MA8, MA10, MD1).

## Web slice A — map / canvas family (csv 38, csv 64, csv 178)

Handoff 285907, batch B7. Draft section for `docs/testing/e2e-retirement-map-2859-b7.md`. Worktree `issue-2859-b7-discover-url-navigation`, HEAD `44bf41a5888ecade25369708cfef444f095288dc`. Specs stay on disk, byte-identical; this section claims no spec is retired. Manifest status stays `SCHEDULED(#2859)`.

Dispositions: `COVERED_NEW`, `COVERED_EXISTING`, `RETAIN`, `STALE`, `OBSOLETE` (as in the B4 map). A hop marked "composed" is `COVERED` only because ONE it() observes before, action through the real relay, and after, and the seam mutation reddens that it (R_composed). Mutation ids `MAn` are rows in `.claude/handoffs/issue-285907/evidence/mutation/register.tsv`; `MUT-nnnn` in a cell is the PR-5 mutation id the row inherits (R_prior_mut) or the id the `MAn` run re-proves.

### New tests (slice A)

- `N1` = `apps/web/src/pages/__tests__/MapDiscovery.listingSelectedMarker2859.test.tsx > #2859 B7 1939-14 / 1939-7 — URL listing= reaches the REAL marker layer > cold listing=A renders A (not B) with the selected icon on the real layer, hydration writes no other URL param (same-probe X control), and dropping/moving listing= moves the selected icon`
- `N2` = `apps/web/src/pages/__tests__/MapDiscovery.clusterFocusRelay2859.test.tsx > #2859 B7 cfb-8 (canvas half) — PropertyMap onClusterFocusChange -> clusterFocus URL writer > a cluster-focus callback from PropertyMap writes clusterFocus=<members> as ONE REPLACE, leaves node= unchanged, and flows back as focusedClusterMemberAreaKeys`
- `N3` = `apps/web/src/pages/__tests__/MapDiscovery.searchThisAreaRelay2859.test.tsx > #2859 B7 2015-12 — real Search-this-area CTA click -> DiscoverMapCanvas onActivate -> VIEWPORT commit in the URL > no CTA and no rscope=vp before drift; a gesture + bbox drift past tolerance shows the REAL CTA; clicking it commits rscope=vp with 4-part rvp, rprev=areas:..., and hides the CTA`

What each mounts:

- `N1`: the REAL `MapDiscovery` + `DiscoverProvider` + router, the REAL `PropertyMap` + `MarkerClusterLayer` (`ResidentialMarkerClusterLayer.tsx`) + `markerIcons`, with only `leaflet` / `react-leaflet` replaced. The leaflet double records each `L.marker(...)` and the `L.divIcon({html})` the layer chose, so "the rendered marker" is the icon HTML the real layer built for a listing (`createSelectedMarkerIcon` adds `data-selected="true"`). The double also emulates Leaflet's paint with one element per marker so the popover hydration lookup (`[data-listing-id]`) can resolve: that is an INJECTED boundary (R_injected) and is not claimed.
- `N2`: the REAL `MapDiscovery` -> `DiscoverMapSurface` -> `DiscoverMapCanvas` -> real clusterFocus URL domain; `PropertyMap` is a recording double. Proves the canvas half only.
- `N3`: the REAL `MapDiscovery` -> `DiscoverMapCanvas` -> real `SearchThisAreaCta` -> real `useDiscoverViewportSearch` / `useDiscoverViewportTracker` -> real URL facade; `PropertyMap` is a recording double whose `onBoundsChange` / `onUserCameraGesture` props the test calls (the BoundsWatcher contract).

### Base runs (R_base_red) — `evidence/base-runs/base-runs.tsv`, every file run ALONE at `44bf41a5`

| File | Exit | Result | Citation consequence |
|---|---|---|---|
| MapDiscovery.issue2149.secondMarkerTap.test.tsx | 1 | 10/11, 1 red | PASS-RF. Frozen red it: `tapping a second marker replaces (not closes) the mobile preview sheet` (not cited). The 1939 describe (4 its) is green and cited |
| useDiscoverUrlState.test.ts | 1 | PASS-RF (frozen reds named in base-runs.tsv) | only `useDiscoverUrlState — selectedListing (Issue #1430) > clearSelectedListing removes listing= only…` and `useDiscoverUrlState — boolean status flags > reads ntm=1 as newToMarket=true` are cited (both green) |
| DiscoverMapCanvas.test.tsx | 1 | 75/76, 1 red | frozen `…Issue #2456 (owner ruling C2)… editor OPEN: every draft member reaches PropertyMap…`; NOT cited |
| all other cited files (useMarkerSelection, useDiscoverMarkerPopoverController, MapDiscovery.issue1973, PropertyMap.clusterTapFit, areaClustering, AreaMarkerLayer.visualClusterNodeKey, clusterFocus, DiscoverAreasJourneyPanel, useDiscoverViewportSearch, SearchThisAreaCta, useDiscoverViewportTracker, useDiscoverMapDataController, DiscoverRightPanel, DiscoverAreasJourneyPanel.characterization2660, AreaZeroResultRecovery, resultScope, resultScope.viewportRprevPreservation, resultScope.atomicCommit, useResultScopeController.differential.c2, ScopeActionsMenu, AreaSelectedPanel.scopeBar, mobileToggleHistorySafety.integration, useDiscoverNavigationController, PropertyMap.boundsWatcherResizeGuard) | 0 | all green | cited per row below |

### R_prior_mut (`evidence/mutation/reuse_check.tsv`)

PR-5 run head `8a142a39` vs `44bf41a5`, per cited test file and per mutated product file. Identical blobs -> the PR-5 mutation result is REUSED (blobs recorded in the tsv). Differing blobs -> RERUN at `44bf41a5` (rows `MA2 MA4 MA5 MA6 MA7 MA12 MA13 MA14`). Files that differ: `MapDiscovery.issue2149.secondMarkerTap.test.tsx`, `DiscoverRightPanel.test.tsx`, `useDiscoverMapDataController.test.ts`, `resultScope.atomicCommit.test.ts`, `PropertyMap.tsx`. A cited it whose test file differs and whose mutation was not re-run is dropped from the citation (see 2015-2, 2015-3, 2015-8, 2015-11). The actual base after the later rebase may differ again: the Team Lead re-runs `ACTUAL=<sha> python3 -I evidence/mutation/reuse_check.py` and re-runs any row that flips.

### csv 38 — e2e/discover-1939-listing-peek-url-restore.spec.ts

`T2149` = `apps/web/src/pages/__tests__/MapDiscovery.issue2149.secondMarkerTap.test.tsx > #2149 repro — second marker tap in mobile school-first Map mode > #2750 PR-5 T3 1939 listing peek URL restore`

| Id | Disposition | Destination (file > it) | Mutation | Same-it control for a negative | RETAIN / STALE / OBSOLETE reason |
|---|---|---|---|---|---|
| 1939-1 cold `listing=` opens the popover (dialog + title) | COVERED_EXISTING | T2149 > cold deep link ?listing=<id> hydrates the marker popover (dialog + title) and writes no other URL param (the dialog/title half only) | MA5 (MUT-1101/1103, `useDiscoverMarkerPopoverController.ts:290` hydrate call removed) — RERUN | positive claim | — |
| 1939-2 `data-selected` for the URL id, mock-forwarding half | COVERED_EXISTING | same T2149 it: `listing=` -> `selectedListingId` -> mock marker `data-selected`; control arm without `listing=` is in the same it | MA2 (MUT-1704, `DiscoverMapCanvas.tsx:1018` -> `undefined`) — RERUN | same it: the no-`listing=` arm asserts the marker has no `data-selected` | marker-layer half is 1939-14. The it asserts a MOCK PropertyMap forward, so it proves the URL -> prop hop only |
| 1939-3 / 1939-4 / 1939-9 View details -> Back reopens; Forward / Back again; Forward restores | COVERED_EXISTING | T2149 > View details -> Back reopens the popover and restores listing=; Forward then Back reopens it again (real router) | MA5 (MUT-1103), MA6 (MUT-1104, `…Controller.ts:299` reverse-clear removed, reddens the Forward/Back leg) — RERUN | positive claims | the real browser history stack is RETAIN (R_injected): this proves the react-router navigate(-1)/(1) contract in jsdom |
| 1939-5 X closes the card and removes `listing=` | COVERED_EXISTING (construction only) | `features/discover/state/useMarkerSelection.test.tsx > (vi) handlePopoverDismiss clears both local states and calls clearSelectedListing`; `hooks/__tests__/useDiscoverUrlState.test.ts > useDiscoverUrlState — selectedListing (Issue #1430) > clearSelectedListing removes listing= only, preserves region= and maxKm= (REPLACE)` | MUT-1419 (`useMarkerSelection.ts:359`), MUT-1437 (`agricultural.ts:412`) — REUSE (blobs identical) | positive claims | the composed X path is 1939-13 (below); these two its are hook / facade only |
| 1939-6 unresolvable `listing=`: no popover, URL keeps the id (negative) | RETAIN | — | — | `useDiscoverMarkerPopoverController.test.ts > LEAVE_PARAM_NO_POPOVER…` (L133) and `useMarkerSelection.test.tsx > (c) DOM-miss no-op…` (L367) assert only the negative: no same-it positive control, so R_control rejects them | downgrade logged: no compliant new it written (no page-level product mutation located that makes the URL drop an unresolvable id); the isolated its are not claimed |
| 1939-7 hydration writes no other URL param (negative) | COVERED_NEW | N1 (cold URL: the SAME LocationProbe saw exactly 1 location, key `default`, the 7 cold params unchanged, after outlasting the 300 ms debounce) | MA3 (MUT-1102, injected `setSelectedListing(listing.id)` in `useMarkerSelection.ts` hydration: negative RED at `expected [ …(3) ] to have a length of 1 but got 3`) | same it, same probe: the popover X removes `listing=` and the probe observes a 2nd location with a new key. MA4 (X dismiss -> no-op) is red at that control line (`expected 1 to be 2`) while the negative lines before it stay green | existing `T2149 > cold deep link…` (`location.key` default check) is NOT cited for this negative: its control arm is a second mount, not a URL write observed by the same probe |
| 1939-8 Back removes `listing=` and closes the popover | COVERED_EXISTING | `pages/__tests__/MapDiscovery.issue1973.schoolFirstMarkerPopup.test.tsx > AC11 (rev-2, non-regression): a URL-backed area-first popover STILL CLOSES when the URL loses 'li…' (L499)`; `features/discover/controllers/__tests__/useDiscoverMarkerPopoverController.test.ts > reverse-clears the URL param when a URL-backed popover is showing and the URL genuinely drops the listing id (nav.selectedListing == null)` (L95) | MUT-1431 (`…Controller.ts:299`), MUT-1428 (`useMarkerSelection.ts:500`) — REUSE; MA6 re-confirms the :299 edit reddens the page-level Forward/Back leg | positive claims | — |
| 1939-10 marker DOM arrives late; bounded rAF retry still restores the popover | COVERED_EXISTING | `features/discover/state/useMarkerSelection.test.tsx > (f2-a) marker absent on first checks, appears after N rAF ticks — popover eventually restores` | MUT-1421 (`useMarkerSelection.ts:628`) — REUSE | positive claim | `(f2-b)…(f2-f)` are extra invariants of the retry loop (cancel on unmount, bounded cap, suppression, reorder pin); they are not part of the spec claim and are not cited. Real ~250 ms paint delay is RETAIN (injected) |
| 1939-11 A -> unresolvable B closes A, URL keeps B | COVERED_EXISTING | `…Controller.test.ts > F3: clears a DIFFERENT, currently-displayed local popover when the URL has moved to an unresolvable id (stale-different-id clear)` (L154); `useMarkerSelection.test.tsx > (f3-a) URL moves from open listing A to a DIFFERENT unresolvable id B: clearMarkerPopoverFromUrl …` | MUT-1430 (`…Controller.ts:303`), MUT-1427 (`useMarkerSelection.ts:498`) — REUSE | positive claims (a clear is observed) | — |
| 1939-12 A -> not-yet-resolvable B closes A, then opens B with B's title | COVERED_EXISTING | T2149 > in-app switch from open A to a not-yet-resolvable B closes A, keeps listing=B, then opens B (title B, never A) | MA7 (MUT-1105, `…Controller.ts:304` stale-id clear removed) — RERUN | positive claims | — |
| 1939-13 X button composed through the page (real router) | COVERED_EXISTING | T2149 > the popover X button closes the card, removes listing= from the URL and clears the marker highlight (real router) | MA4 (MUT-1812, `DiscoverMapMarkerPopover.tsx:58` `onDismiss` -> no-op) — RERUN | positive claim | — |
| 1939-14 composed: URL `listing=` -> REAL marker layer `data-selected` | COVERED_NEW | N1 (cold `listing=A`: A's rendered icon carries `data-selected="true"`, B's does not; the popover X drops `listing=` and A loses it; navigating to `listing=B` selects B only) | MA1 (PropertyMap.tsx `<MarkerClusterLayer … selectedListingId>` -> `undefined`, MUT-1901 on the exercised source; RED), MA2 (MUT-1704; RED) | after-state is asserted in the same it as the before-state | painted Leaflet DOM, the real pointer on a painted marker and the real marker CSS are RETAIN (R_injected) |

R_double_guard (`PropertyMap.tsx` passes `selectedListingId` from three sources). The non-agri fixture exercises the `MarkerClusterLayer` source (`:3223`). `MA1b` mutates the `AgriMarkerClusterLayer` source (`:3189`) and `MA1c` the `AgriDestinationMarkerLayer` source (`:3201`): both leave N1 GREEN (SURVIVED, as predicted) because the residential fixture never mounts those layers. They are reported, not claimed.

### csv 64 — e2e/discover-cluster-focus-back.spec.ts

| Id | Disposition | Destination (file > it) | Mutation | Same-it control for a negative | RETAIN / STALE / OBSOLETE reason |
|---|---|---|---|---|---|
| cfb-1 7 co-located leaves form ONE cluster marker | COVERED_EXISTING | `features/discover/navigation/__tests__/areaClustering.test.ts > breaks ties by areaKey when every member sits at the identical coordinate` (L112); `components/map/__tests__/AreaMarkerLayer.visualClusterNodeKey.test.tsx > a spatially-grouped visual cluster renders data-node-key="visual-cluster:<member areaKeys joined>"` (L119) | MUT-1345, 1347, 1348, 1349 — REUSE | positive claims | painted dashed cluster marker is RETAIN |
| cfb-2 cell size keeps ~300 px members single | COVERED_EXISTING | `areaClustering.test.ts > cell size: members ~300 px apart stay singles by default and group once cellSizePx is enlarged` (L145) | MUT-1008, 1008b — REUSE | same it: members group once `cellSizePx` is enlarged | the lower side of the 64 px default is unobservable (areaClustering.ts:220-221); not claimed |
| cfb-3 click leaves `node=` and adds `clusterFocus=` | COVERED_EXISTING (construction) | `features/discover/state/url/__tests__/clusterFocus.test.ts > the written param name is 'clusterFocus', never 'node'` (L42); `… > applyClusterFocusDelta only ever adds/removes the clusterFocus key` (L50) | MUT-1343, 1344 — REUSE | param add is observed in the same its | composed in cfb-8 |
| cfb-4 / cfb-7 cluster select REPLACE; Back restores the focused entry | COVERED_EXISTING | `clusterFocus.test.ts > selecting a cluster REPLACEs the current entry: Back skips it and lands on the entry before` (L201); `… > replace(cluster focus) then push(area) then Back restores the cluster-focused entry exactly` (L227) | MUT-1006, 1007 — REUSE; MA9 re-proves the REPLACE arm at `clusterFocus.ts:221` against both this it and N2 | positive claims | the real browser history stack is RETAIN (jsdom react-router contract only) |
| cfb-5 focus panel lists the members, zero-content member excluded | COVERED_EXISTING (narrowed: "eligible focused members", the spec's 7 is a fixture count) | `features/discover/views/__tests__/DiscoverAreasJourneyPanel.test.tsx > excludes a focused member with listingCount 0 from BOTH the list and the count — never a stale "0 properties" row (AC4.12)` (L434) | MUT-1350 (`AreaClusterFocusPanel.tsx:77`), MUT-1352 (`deriveFocusedAreaClusterSummary.ts:84`) — REUSE | same it: members alpha and bravo are asserted present, charlie absent | — |
| cfb-6 area select from focus is a PUSH and clears `clusterFocus` | COVERED_EXISTING | `DiscoverAreasJourneyPanel.test.tsx > selecting a focused member calls journey.selectNode with its nodeKey — the SAME action every other child uses` (L385); `clusterFocus.test.ts > replace(cluster focus) then push(area) then Back restores the cluster-focused entry exactly` (L227) | MUT-1351 (`AreaClusterFocusPanel.tsx:94`), MUT-1007 (`navigation.ts:361`) — REUSE | positive claims | the spy-only `history.length` it at DiscoverAreasJourneyPanel L410 is not counted |
| cfb-8 composed: cluster marker click -> PropertyMap -> canvas `onClusterFocusChange` -> `clusterFocus` URL | COVERED_NEW (canvas half) / RETAIN (PropertyMap -> marker hop) | N2 (before: relay present, URL has `node=` and no `clusterFocus`, map gets no focus; action: the `onClusterFocusChange` prop is invoked; after: the probe's new location carries `clusterFocus=<3 members>`, `node=` unchanged, the focus flows back as `focusedClusterMemberAreaKeys`, and one `navigate(-1)` lands on the entry BEFORE the node entry = REPLACE) | MA8 (MUT-1814, `DiscoverMapCanvas.tsx:953` prop -> `undefined`; RED), MA9 (`clusterFocus.ts:221` replace -> push; RED) | negative "`node=` unchanged" has its positive (the `clusterFocus` write) observed in the same it by the same probe | RETAIN: the PropertyMap -> `AreaDestinationMarkerLayer` -> cluster-marker click hop (`PropertyMap.tsx:3246` `onClusterFocusChange={onClusterFocusChange}`). It needs the navigation hierarchy resolve plus a projected Leaflet map for a real visual-cluster card; PropertyMap is mocked in N2, so that relay is construction-only and no mutation was run on it. The painted cluster marker and the real pointer are RETAIN (R_injected) |

### csv 178 — e2e/issue-2015-search-this-area-viewport.spec.ts

| Id | Disposition | Destination (file > it) | Mutation | Same-it control for a negative | RETAIN / STALE / OBSOLETE reason |
|---|---|---|---|---|---|
| 2015-1 CTA absent before drift (negative) | COVERED_NEW (composed, with control) | N3 (BEFORE block: eligible `rscope=areas` committed, baseline seeded, CTA query empty, no `rscope=vp` in any observed location) | MA11 (`SearchThisAreaCta.tsx` drops the `!isDirty` gate = MUT-1449 variant; N3 RED and `SearchThisAreaCta.test.tsx > renders nothing while the viewport is not dirty` RED) | same it: after a gesture + drift the same query finds the CTA | `useDiscoverViewportSearch.test.tsx > is not dirty on first render` (L76) is a lone negative and is not cited |
| 2015-2 drift shows the CTA; panning alone does not commit | COVERED_EXISTING | `useDiscoverViewportSearch.test.tsx > is true once the center drifts past the tolerance ratio` (L57); `… > is true once the area changes past the tolerance ratio (zoom)` (L63); `… > drift past tolerance with a user gesture sets isDirty but never calls commitResultScope until activate()` (L571); `useDiscoverViewportTracker.test.ts > handleBoundsChange debounces 300ms before setting mapBbox` (L18) | MUT-1440, 1441 (`useDiscoverViewportSearch.ts:112/:118`), MUT-1454 (`useDiscoverViewportTracker.ts:72`), MUT-1110 (`:216` inserted auto-commit) — REUSE | L571 same it: a within-tolerance arm (not dirty, no commit), the drifted arm (dirty, no commit) and `activate()` (exactly one commit) | `useDiscoverMapDataController.test.ts` L520 (no refetch on pan) is NOT cited: its blob differs from the PR-5 run head and it mocks the data layer (R_wire). N3 also asserts the URL stays `rscope=areas` after the drift (panning alone commits nothing) |
| 2015-3 CTA click commits `rscope=vp` + 4-part `rvp` + `rprev=areas:…`; CTA hides; one scoped fetch | COVERED_NEW (URL + CTA outcome, composed) / RETAIN (outbound fetch) | N3 (AFTER block); hook / facade its stay as construction: `useDiscoverViewportSearch.test.tsx > activate() commits a VIEWPORT scope from the live bbox with replace-style history (AC2/AC7)` (L127), `… > re-baselines and clears isDirty once activeScope.kind changes (CTA hides right after activation)` (L143), `resultScope.test.ts > commit_captures_the_outgoing_scope_into_rprev_by_name` (L110), `resultScope.viewportRprevPreservation.test.ts > a second consecutive VIEWPORT commit preserves rprev …` (L56) | MA10 (MUT-1818, `DiscoverMapCanvas.tsx:776` `onActivate` -> no-op; N3 RED); MUT-1445/1447/1448 and MUT-1450..1453 — REUSE for the hook / facade its | positive claims | RETAIN: "one scoped fetch" — no test runs the real `lib/api` with a fetch stub for the VIEWPORT request (R_wire); `useDiscoverMapDataController.test.ts` L485 (`MUT-1455/1456`) mocks the data layer and its blob differs, so it is not cited |
| 2015-4 heading stops naming the area; displayed set changes | COVERED_EXISTING | `components/discover/__tests__/DiscoverRightPanel.test.tsx > control: a committed AUTHENTICATED VIEWPORT still substitutes authViewportListings, never polygon…` (L625); `features/discover/views/__tests__/DiscoverAreasJourneyPanel.characterization2660.test.tsx > authenticated-viewport: renders the viewport-sourced card, …` (L100); `components/discover/panels/__tests__/AreaZeroResultRecovery.test.tsx > VIEWPORT names the visible map area, never a previously-selected area` (L309) | MA12 (MUT-1458, `areaSelectedResults.ts:74`) — RERUN; MUT-1459 (`areaLeafResultSources.ts:156`), MUT-1460 (`AreaZeroResultRecovery.tsx:316`) — REUSE | positive claims | — |
| 2015-5 `Return to <area>` restores the AREA_SET | COVERED_EXISTING | `resultScope.test.ts > J3.5 — restoring the previous scope (Return to selected areas) round-trips it exactly, by name` (L138); `resultScope.viewportRprevPreservation.test.ts > "Return to <area>" (re-committing the AREA_SET rprev pointed at) does not leave rprev self-referential` (L87); `useResultScopeController.differential.c2.test.ts > returnLabel: three shapes, delegating to resolveReturnLabel` (L104); `ScopeActionsMenu.test.tsx > VIEWPORT scope with a returnLabel: Return shown; Draw-search-area entry excluded (isViewportScope)` (L176); `AreaSelectedPanel.scopeBar.test.tsx > labels Return "Return to previous search area" when the previous scope is POLYGON` (L143) | MUT-1451, 1453, 1461, 1463, 1478 — REUSE | positive claims | — |
| 2015-6 VIEWPORT activation REPLACEs; Return PUSHes | COVERED_EXISTING | `resultScope.atomicCommit.test.ts > VIEWPORT commit with { history: 'replace' } REPLACEs: one Back skips to the entry before the AREA_SET…` (L337); `… > Return to previous over a VIEWPORT is a PUSH: one Back lands on the VIEWPORT again` (L363) | MA13 (MUT-1108, `state/url/resultScope.ts:254` replace -> false), MA14 (MUT-1109, `useResultScopeController.ts:88` Return -> replace) — RERUN | REPLACE vs PUSH are the two sides of one comparison, not a negative | — |
| 2015-7 mobile Map/List toggle survives activation | COVERED_EXISTING | `features/discover/views/mobile/__tests__/mobileToggleHistorySafety.integration.test.tsx > committing a VIEWPORT scope while in MAP view keeps mobileView MAP (and a LIST view stays LIST)` (L111) | MUT-1111 (`DiscoverContext.tsx:269-275`) — REUSE | positive claim (LIST stays LIST) | — |
| 2015-8 `ntm=1` under `rscope=vp` keeps scope; refetch fires | COVERED_EXISTING (scope / param half) / RETAIN (refetch) | `resultScope.test.ts > reads_an_inert_VIEWPORT_scope_from_a_hand_edited_or_restored_URL` (L59); `hooks/__tests__/useDiscoverUrlState.test.ts > useDiscoverUrlState — boolean status flags > reads ntm=1 as newToMarket=true` (L639, green in a PASS-RF file) | MUT-1450 (`resultScope.ts:137`), MUT-1457 (`filters.ts:322`) — REUSE | positive claims | RETAIN: the refetch half — `useDiscoverMapDataController.test.ts` L568/L485 (`MUT-1455/1456/1705/1706/1707`) mock the data layer and the file blob differs from the PR-5 run head, so they are not cited (R_wire, R_prior_mut) |
| 2015-9 `node=` deep link auto-commits `rscope=areas` | RETAIN | — | — | — | formerly COVERED_CANONICAL (`e2e/canonical/auth-session.canonical.ts` T2); canonical is context only, and the `useDiscoverNavigationController.test.ts` L233 it asserts the guard arm and the commit, but no slice-A mutation was run for the commit arm |
| 2015-10 explicit `rscope=vp` not clobbered (negative) | COVERED_EXISTING | `features/discover/controllers/useDiscoverNavigationController.test.ts > an AREA leaf node= deep link with an already-active rscope=vp is not auto-committed to AREA_SET (and with no scope it is, once, as REPLACE)` (L233) | MUT-1112 (`useDiscoverNavigationController.ts:223`) — REUSE | same it: the `active: null` control arm commits exactly once as REPLACE and `isNodeAreaLeafActive` is true in both | — |
| 2015-11 resize after commit does not re-show the CTA (negative) | COVERED_EXISTING (hook level) / RETAIN (PropertyMap handler, ResizeObserver chain) | `useDiscoverViewportSearch.test.tsx > a settle pending at commit time must not fabricate isDirty after it lands; a genuine new pan still does` (L258); `… > a genuine new settle landing after commit with no further user gesture must not fabricate isDirty (Issue #2426 fix cycle 4)` (L367) | MUT-1442 (`useDiscoverViewportSearch.ts:214`), MUT-1443 (`:228`) — REUSE | both its end with "a genuine new pan still marks dirty" in the same it | `PropertyMap.boundsWatcherResizeGuard.test.tsx` L147 / L175 assert only `onBoundsChange` NOT called (positive control lives in L206, a different it) and `PropertyMap.tsx` differs from the PR-5 run head, so MUT-1464..1469 are not reused: RETAIN. The real ResizeObserver chain is RETAIN |
| 2015-12 composed: CTA click -> `DiscoverMapCanvas` `onActivate` -> viewport commit URL | COVERED_NEW | N3 | MA10 (MUT-1818; RED at the `rscope=vp` wait) | before / action / after in one it; the absent-CTA before state is paired with the CTA appearing after drift | a real Leaflet pan / bounds event is RETAIN (the test calls the `onBoundsChange` / `onUserCameraGesture` props directly, R_injected) |

### Counts (slice A)

Rows with at least one claim: csv 38 = 14 ids (COVERED_NEW 2: 1939-7, 1939-14; COVERED_EXISTING 11 including 1939-5 construction; RETAIN 1: 1939-6). csv 64 = 8 ids (COVERED_NEW 1 partial: cfb-8 canvas half; COVERED_EXISTING 7; the PropertyMap -> marker hop of cfb-8 is RETAIN). csv 178 = 12 ids (COVERED_NEW 2: 2015-1, 2015-12, plus 2015-3 URL half; COVERED_EXISTING 8; RETAIN 2015-9 and the 2015-3 / 2015-8 outbound-fetch halves, 2015-11 PropertyMap handler).

### Owner questions / disclosures

- No product, spec, existing test, manifest or config file was edited. All three tests are new `*2859*` files; mutations edited product files in place and restored them byte-identical (see `final-restore-check.txt`).
- Codex review NOT RUN (usage exhausted), disclosed.

## Web slice B1 — URL / page family, part 1 (csv 53, csv 61, csv 63, csv 69)

Handoff 285907, batch B7. Draft section for `docs/testing/e2e-retirement-map-2859-b7.md`. Worktree `issue-2859-b7-discover-url-navigation`, HEAD `44bf41a5888ecade25369708cfef444f095288dc`. Specs stay on disk, byte-identical; this section claims no spec is retired. Manifest status stays `SCHEDULED(#2859)`.

Dispositions: `COVERED_NEW`, `COVERED_EXISTING`, `RETAIN`, `STALE`, `OBSOLETE` (same words as A.md / the B4 map). A hop marked "composed" is `COVERED` only because ONE it() observes before, action through the real relay, and after, and the seam mutation reddens that it (R_composed). Mutation ids `MBn` are rows in `.claude/handoffs/issue-285907/evidence/mutation/register.tsv`; `MUT-nnnn` in a cell is the PR-5 mutation id the row inherits (R_prior_mut) or the id the `MBn` run re-proves. Per-assertion source: `docs/testing/e2e-retirement-map-pr5.md` sections `#discover-area-first-drilldown-1483`, `#discover-bounded-listing-2087`, `#discover-city-switch`, `#discover-group-results-1597`.

### Counts (assertion rows; sub-claims split where a row carries more than one disposition)

| Spec | COVERED_NEW | COVERED_EXISTING | OBSOLETE | RETAIN | STALE |
|---|---|---|---|---|---|
| csv 53 drilldown-1483 | 2 (1483-5 cancel arm, 1483-11) | 3 (1483-6, 1483-8 card half, 1483-9) + 1483-5 confirm arm | 2 groups (1483-1/2/3/4/10, 1483-7) | 3 sub-claims | 0 |
| csv 61 bounded-listing-2087 | 2 (2087-2/3 negatives, 2087-8) | 5 (2087-2/3 positive, 2087-4, 2087-5, 2087-6 API-arg, 2087-7) | 2 (2087-1 recipe, 2087-6 anon form) | 1 (2087-6 outbound request) | 0 |
| csv 63 city-switch | 1 (city-switch-5) | 4 (city-switch-1, 2, 3, 4) | 0 | 0 (selector note is a recorded non-claim) | 0 |
| csv 69 group-results-1597 | 1 (1597-7, URL survival only) | 1 (1597-3 facade) | 1 group (1597-1/2/4/5/6) | 0 | 0 |

### New tests (slice B1)

- `N4` = `apps/web/src/pages/__tests__/MapDiscovery.startOverUrl2859.test.tsx > #2859 B7 1483-11 — Start Over control -> handleStartOver -> urlActions.startOver -> URL > clicking the real Start Over control and its confirm drops journey/groupId/areaKey/beds, keeps city + rent intent, as ONE REPLACE`
- `N5` = `apps/web/src/components/discover/__tests__/StartOverButton.cancel2859.test.tsx > #2859 B7 1483-5 — StartOverButton: Cancel never resets, Confirm resets exactly once (one it, one spy) > Cancel closes the confirm without calling onStartOver; reopening and confirming then calls the SAME spy exactly once`
- `N6` = `apps/web/src/pages/__tests__/MapDiscovery.nodeListingsBack2859.test.tsx > #2859 B7 2087-8 — NodeListingsSurface Back click -> DiscoverAreasJourneyPanel onClearNodeListings -> URL > with nodeListings=1 the real Back-to-<label> button is shown; clicking it drops nodeListings, keeps node, as a REPLACE`
- `N7` = `apps/web/src/components/discover/navigation/__tests__/NavigationLevelPanel.eligibility2859.test.tsx > #2859 B7 2087-2/2087-3 — Browse-all CTA eligibility bound, positive control + both negatives in one it > the CTA shows at 15 descendant areas (control), is absent at 16, and is absent at the city ROOT even with 10 descendant areas`
- `N8` = `apps/web/src/components/discover/__tests__/DiscoverControlBar.kundapur2859.test.tsx > #2859 B7 city-switch-5 — ?city=kundapur reaches the city control through the REAL DiscoverProvider > ?city=kundapur labels the control Kundapur (not Udupi, not the raw slug); a ?city=udupi remount labels it Udupi (not Kundapur)`
- `N9` = `apps/web/src/pages/__tests__/MapDiscovery.groupResultsCold2859.test.tsx > #2859 B7 1597-7 — cold groupResults=1 URL survives through the mounted page (URL survival only) > after the page settles, groupResults=1 and groupId remain in the URL, and the same probe has seen the page perform its own mount-time scope= write`

What each mounts:

- `N4`: the REAL `MapDiscovery` + `DiscoverProvider` + REAL `useDiscoverUrlState`, `DiscoverPanelSurface` -> `LegacyRightPanelBridge` -> REAL `DiscoverRightPanel` -> school journey panel `PanelHeader` -> REAL `StartOverButton`, the confirm click, the real `useDiscoverJourneyTransitions.handleStartOver` and `urlActions.startOver`, observed through a LocationProbe over a two-entry MemoryRouter (`navigate(-1)` after the write lands on the entry BEFORE the loaded one, which proves REPLACE). `PropertyMap`, `AppLayout` and the data hooks are stubs; the area-first default-journey probe (`GET .../navigation/resolve`) is answered 503 by a fetch stub so it writes nothing (a 404 would REPLACE-write `scope=`).
  - **R_double_guard — which shell hosts Start Over for this fixture:** the LEGACY shell (`journey=school-first` -> `LegacyRightPanelBridge` -> `DiscoverRightPanel` -> `PanelHeader` -> `StartOverButton`). The AREA-FIRST shell (`AreaFirstJourneyPanel` -> `DiscoverAreasJourneyPanel` -> `commands.navigation.startOver`) is a second host and is NOT driven; both shells receive the same `journeyCommands.startOver` built by `useDiscoverJourneyTransitions`, so `MB1` (MUT-1817) is single-sourced for the handler, and the shell-specific button wiring of the area-first shell is RETAIN.
  - Radix Popover is replaced by a file-scoped stateful stand-in (`@radix-ui/react-popover`, the `AgriGroupLocalityPanel.test.tsx` pattern); the trigger and the confirm button are real components, the Popover open/close/portal behaviour is RETAIN (injected).
- `N5`: the real `StartOverButton` with `@/components/ui/popover` replaced by a file-scoped context-driven stand-in (same contract as the PR-5 inline stand-in). Cancel and Confirm in one it, one spy.
- `N6`: the REAL `MapDiscovery` -> `AreaFirstJourneyPanel` -> `DiscoverAreasJourneyPanel` -> `NodeListingsSurface` at `?city=bangalore&node=c:domlur&nodeListings=1`; the real `useAreasNavigationJourney` and `lib/api` run against a global fetch stub that answers the navigation `resolve` and `counts` endpoints (the node has 3 descendant areas, so it is eligible for Browse-all and the #2087 eligibility-clear effect does NOT fire by itself). The anon city-listings hook is mocked to an empty teaser (server-side node membership is excluded from the claim, R_stub_ui).
- `N7`: the real `NavigationLevelPanel`, three renders in one it.
- `N8`: the REAL `DiscoverProvider` over a MemoryRouter at `?city=kundapur` (harness copied from the composed it in `DiscoverControlBar.test.tsx`, but with NO discover-context mock at all) and the real `DiscoverControlBar`. Kundapur confirmed selectable at base: `CITY_CONFIG.kundapur` at `apps/web/src/lib/localityUtils.ts:13`, from which `CONTROL_BAR_CITIES` is derived (`DiscoverControlBar.tsx:51`), so city-switch-5 is live, not STALE.
- `N9`: the REAL `MapDiscovery` + `DiscoverProvider` + REAL `useDiscoverUrlState` at a cold `?city=udupi&groupId=coastal-strip&groupResults=1`; the default-journey probe is answered 404 so the page REPLACE-writes `scope=` at mount (`area.ts:237-247`): that mount-time write is the same-it positive control observed by the same probe.

### Base runs (R_base_red) — `evidence/base-runs/base-runs.tsv` rows 29-36 (this slice); slice-A rows cover `resultScope.atomicCommit` and `DiscoverRightPanel`; every file run ALONE at `44bf41a5`

| File | Exit | Result | Citation consequence |
|---|---|---|---|
| StartOverButton.test.tsx | 1 | 4/7, 3 red | PASS-RF. Frozen reds (Radix popover stall, not cited): `deep state (hasSubstantialState=true): shows confirm popover, does NOT reset until confirmed`, `confirming in the popover calls onStartOver exactly once and closes the popover`, `Cancel in the popover does NOT call onStartOver`. Cited and green: the two `#2750 B1 T3 deep state` its (inline stand-in) |
| MapDiscovery.issue1178.test.tsx | 0 | 4/4 | context only (1483-7), no coverage claimed |
| staticSweep.test.ts | 0 | 119/119 | OBSOLETE evidence (L674 `no file under src/ (production, non-test) contains any deleted-panel testid as a string literal`) |
| DiscoverRightPanel.routing.test.tsx | 0 | 50/50 | OBSOLETE evidence (L537 `a resolved groupId no longer renders Level-2 area rows or group cards — renders the AreaSelectionPanel fallback`) |
| NavigationLevelPanel.test.tsx | 0 | 21/21 | cited |
| NodeListingsSurface.2087.test.tsx | 0 | 15/15 | cited |
| DiscoverControlBar.test.tsx | 0 | 51/51 | cited |
| crossCityResultScope.2611.test.ts | 0 | 9/9 | cited |
| resultScope.atomicCommit.test.ts, DiscoverRightPanel.test.tsx | 0 | all green | slice-A base rows |

### R_prior_mut (`evidence/mutation/reuse_check_b1.tsv`; `append_reuse_rows_b1.py` appends the REUSE rows to `register.tsv`)

PR-5 run head `8a142a39` vs `44bf41a5`, per cited test file and per mutated product file. REUSE (8 register rows): 1483-5 (MUT-1313, MUT-1314), 2087-2/3 positive (MUT-1325, MUT-1324), 2087-4 (MUT-914, MUT-915), city-switch-3 (MUT-920, MUT-921, MUT-922). RERUN at `44bf41a5` because the cited test blob differs: `resultScope.atomicCommit.test.ts` (1483-6, 1483-9, 1597-3: `MB13 MB14 MB15 MB16`), `DiscoverRightPanel.test.tsx` (1483-8: `MB17`), `NodeListingsSurface.2087.test.tsx` (2087-5/6/7: `MB18 MB19 MB20 MB21 MB22`), `DiscoverControlBar.test.tsx` (city-switch-1/2/4: `MB23 MB24 MB25 MB26 MB27`). Every product blob was identical. After the later rebase the Team Lead re-runs `ACTUAL=<sha> python3 -I evidence/mutation/reuse_check_b1.py` and `append_reuse_rows_b1.py` and re-runs any row that flips.

### csv 53 — e2e/discover-area-first-drilldown-1483.spec.ts

| Id | Disposition | Destination (file > it) | Mutation | Same-it control for a negative | RETAIN / STALE / OBSOLETE reason |
|---|---|---|---|---|---|
| 1483-1 / 1483-2 / 1483-3 / 1483-4 / 1483-10 Level-2 group UI, area rows, back-to-all, agri negative | OBSOLETE | none (deleted UI). Evidence re-run at base: `features/discover/navigation/__tests__/staticSweep.test.ts > … no file under src/ (production, non-test) contains any deleted-panel testid as a string literal` (L674; list L602-632 holds `area-group-level2`, `area-group-back-to-all`, `area-group-selected-card`, `area-group-view-all`) and `components/discover/__tests__/DiscoverRightPanel.routing.test.tsx > a resolved groupId no longer renders Level-2 area rows or group cards — renders the AreaSelectionPanel fallback` (L537, asserts no `browse-all-area-*`) | — | not claimed | the testids `area-group-level2`, `browse-all-area-*`, `area-group-back-to-all` have 0 production hits at `44bf41a5` (`git grep` over `apps/web/src` lists only the three test files `staticSweep.test.ts`, `DiscoverRightPanel.routing.test.tsx`, `MapDiscovery.issue1178.test.tsx`) |
| 1483-5 Start Over: confirm resets once | COVERED_EXISTING | `components/discover/__tests__/StartOverButton.test.tsx > StartOverButton — confirm popover state machine (inline Popover stand-in; #2750 PR-5 B1 T3) > #2750 B1 T3 deep state: the popover is absent until the click, the click does NOT reset, the confirm resets exactly once and closes it` | MUT-1313, MUT-1314 (REUSE, blobs identical) + `MB29` (N5, confirm never resets) | the "click does NOT reset" negative is guarded in the same it by the popover appearing and the confirm then calling the spy once | file is PASS-RF (3 frozen Radix its, not cited). Radix Popover behaviour RETAIN (injected) |
| 1483-5 Start Over: cancel never resets (negative) | COVERED_NEW | N5 | `MB28` (Cancel also calls `onStartOver`; red) | same it: reopen -> Confirm moves the SAME spy to exactly 1 (the existing cancel it `…Cancel closes the popover and never resets` (L83) has its positive only in the previous it, so it is NOT cited) | Radix focus return / Escape / outside-click RETAIN (injected) |
| 1483-6 startOver clears journey/groupId/areaKey/filters in one REPLACE | COVERED_EXISTING | `features/discover/state/url/__tests__/resultScope.atomicCommit.test.ts > #2750 PR-5 T1 — area URL domain (startOver / explicit scope= / groupResults) > startOver clears journey, groupId, areaKey and filters in one REPLACE, keeping city and rent intent` | `MB13` (MUT-910, `area.ts` `new URLSearchParams()` -> `(prev)`) and `MB14` (MUT-911, `replace:true` -> `false`) — RERUN, both RED | full-literal `toBe('?city=udupi&intent=rent')` on a URL that carried all dropped params, the key changed, `navigationType` REPLACE | facade construction; the composed hop is 1483-11 |
| 1483-7 invalid / blank `groupId` notice | OBSOLETE | none. Contract replaced: `area-group-invalid-message` is in the deleted-testid list (`staticSweep.test.ts:608`, 0 production hits) | — | not claimed | the replacement behaviour (`MapDiscovery.issue1178.test.tsx` L224 / L235, green at base) is NOT claimed as coverage: no mutation was run for it (plan: "only with a mutation, else not claimed") |
| 1483-8 `scope=` lands on guided entry with `journey-card-school-first` — the guided-entry card half | COVERED_EXISTING | `components/discover/__tests__/DiscoverRightPanel.test.tsx > … shows guided-entry state when panelContent="guided-entry"` (renders `guided-entry-panel`, the heading and `journey-card-school-first`) | `MB17` (MUT-1315, `JourneySwitcher.tsx` testid renamed; RED, 4 its in the file go red) — RERUN | positive claim | the URL `scope=` -> `panelContent='guided-entry'` hop is NOT proven by this it (it passes `panelContent` directly): RETAIN (no page-level `scope=` render it was added) |
| 1483-9 explicit empty `scope=` suppresses the default journey, not rewritten (negative) | COVERED_EXISTING | `resultScope.atomicCommit.test.ts > … an explicit empty scope= suppresses the area-first default journey and is not rewritten` | `MB15` (MUT-912, `hasExplicitScope` -> `false`; RED) — RERUN | same it: control arm `?city=udupi` -> journey `area-first` (the default exists) | — |
| 1483-11 COMPOSED Start Over control -> handleStartOver -> urlActions.startOver -> URL | COVERED_NEW | N4 | `MB1` (MUT-1817 `useDiscoverJourneyTransitions.ts` `urlActions.startOver()` -> no-op; RED), `MB2` (`area.ts` REPLACE arm; RED, caught by the `navigate(-1)` landing), `MB3` (`StartOverButton.tsx` confirm -> `onStartOver` relay removed; RED), `MB4` (Start Over keeps `prev` params; RED) | same it: before URL carries `journey groupId areaKey beds intent=rent`; the write is observed by the same probe (location key changed, `journey` gone) before `groupId areaKey beds scope` are asserted absent and `city` + `intent=rent` present | Popover open/close/portal RETAIN (injected stand-in); the area-first-shell host of Start Over RETAIN (R_double_guard above) |

### csv 61 — e2e/discover-bounded-listing-2087.spec.ts

| Id | Disposition | Destination (file > it) | Mutation | Same-it control for a negative | RETAIN / STALE / OBSOLETE reason |
|---|---|---|---|---|---|
| 2087-1 click recipe `Explore by area` -> region -> cluster | STALE (Team Lead; was OBSOLETE in the draft) | none; context only: `e2e/canonical/discover-area-first.canonical.ts` T4 (canonical is context, never coverage) | — | not claimed | recipe-only: `/discover?city=bangalore` already lands on the area-first city root (default journey, `area.ts:92-98`, `isEligibleForBrowse`/root branch `NavigationLevelPanel.tsx:114-125,150-162`: root lists Direction nodes under `Explore <city>`), so the `Explore by area` journey card click is not part of the flow. The text still exists in `JourneySwitcher.tsx:120-122` (journey-less guided entry), so this is a stale recipe, not a deleted element; the CTA / Back / URL values the recipe led to are carried by 2087-2 .. 2087-8. Owner may re-class it as STALE |
| 2087-2 / 2087-3 CTA shows for <= 15 descendant areas | COVERED_EXISTING | `components/discover/navigation/__tests__/NavigationLevelPanel.test.tsx > Issue #2087 — Browse listings CTA eligibility > is eligible when the canonical descendant area count is 15 (inclusive boundary)` | MUT-1325, MUT-1324 (REUSE, blobs identical) | positive claim | — |
| 2087-2 / 2087-3 CTA absent at 16 and at the city ROOT (negatives) | COVERED_NEW | N7 | `MB30` (`NavigationLevelPanel.tsx:118` `<= 15` -> `<= 16`; RED), `MB31` (MUT-913 coupled: `!isCityRoot` operand removed AND the `isCityRoot ?` branch -> `false ?`; RED) | same it: 15-area arm renders the CTA; both negative arms assert the panel itself rendered (`data-node-key`) | `MB31b` (MUT-1326 alone, the `!isCityRoot` operand only) SURVIVED as expected: the root exclusion is enforced twice (the `:150` branch hosts the CTA only for non-root), so the operand alone is dead. The existing negatives at L299 / L329 are NOT cited (their positive is in L286, a different it) |
| 2087-4 CTA click writes `nodeListings=1` as a PUSH | COVERED_EXISTING | `NavigationLevelPanel.test.tsx > Issue #2087 — Browse listings CTA writes nodeListings through the real URL facade > clicking Browse-all writes nodeListings=1 as a PUSH through the real URL facade` | MUT-914, MUT-915 (REUSE, blobs identical) | same it: 10-area arm shows the CTA and writes; 16-area control arm shows no CTA and leaves the URL at the initial search | — |
| 2087-5 `Back to <label>` visible | COVERED_EXISTING | `features/discover/views/__tests__/NodeListingsSurface.2087.test.tsx > NodeListingsSurface — #2087 > renders Back-to button referencing the node label` | `MB18` (MUT-1328, label text; RED) — RERUN | positive claim | — |
| 2087-6 listings request carries `nodeKey` not `areaKeys` — API-call argument | COVERED_EXISTING | `NodeListingsSurface.2087.test.tsx > … calls useDiscoverListings with the canonical nodeKey (not areaKeys)` | `MB19` (MUT-1327, `nodeKey: undefined`; RED) — RERUN | same it: the positive `objectContaining({ nodeKey: 'c:domlur' })` precedes the `not … areaKeys` negative | `useDiscoverListings` is mocked: ARGUMENT coverage only (R_wire). |
| 2087-6 outbound request path / query | RETAIN | none | — | — | no fetch-boundary test reads the captured URL for the node-listings request (R_wire). |
| 2087-6 anonymous form of the request | OBSOLETE | none | — | — | #2089: the anon path now uses the public teaser endpoint scoped by `descendantAreaKeys` (`apps/web/src/features/discover/views/NodeListingsSurface.tsx:169`, `:183`) |
| 2087-7 Back click removes `nodeListings` (REPLACE) — construction | COVERED_EXISTING | `NodeListingsSurface.2087.test.tsx > … calls onClearNodeListings when the Back-to button is clicked` and `… Back-to-node writes through the real URL facade > Back-to-node clears nodeListings with a REPLACE and keeps node` | `MB20` (MUT-1329, `onClick={undefined}`; both RED), `MB21` (MUT-916, `navigation.ts` delete removed; RED), `MB22` (MUT-917, `replace:false`; RED) — RERUN | the facade it asserts `after.has('nodeListings') === false` after the URL initially carried it, and `node` kept, `REPLACE` | the composed hop is 2087-8 |
| 2087-8 COMPOSED Back click -> panel `onClearNodeListings` -> URL | COVERED_NEW | N6 | `MB5` (MUT-1813 `DiscoverAreasJourneyPanel.tsx:148` prop -> `undefined`; RED), `MB6` (`navigation.ts:627` REPLACE arm; RED, caught by the `navigate(-1)` landing), `MB7` (clearNodeListings also drops `node`; RED) | same it: before — the Back control is visible, the URL carries `nodeListings=1` after a 50 ms settle (the eligibility-clear effect did not fire); after — `nodeListings` gone, `node` and `city` kept, location key changed, surface unmounted | the AREA-leaf listings surface (`AreaLeafListingsSurface`) is a different branch and is not driven (R_double_guard) |

### csv 63 — e2e/discover-city-switch.spec.ts

| Id | Disposition | Destination (file > it) | Mutation | Same-it control for a negative | RETAIN / STALE / OBSOLETE reason |
|---|---|---|---|---|---|
| city-switch-1 control shows the URL city (Udupi) | COVERED_EXISTING | `components/discover/__tests__/DiscoverControlBar.test.tsx > DiscoverControlBar > city selector > the city control shows the URL city (Udupi), not a fixed default` | `MB23` (MUT-918, `selectedCity` -> constant; RED) — RERUN | same it: `getByRole('button', /udupi/)` precedes `queryByRole('button', /bangalore/)` absent | Udupi only; the Kundapur arm is city-switch-5 |
| city-switch-2 choosing Mangalore calls `changeCity('mangalore')` once | COVERED_EXISTING | `DiscoverControlBar.test.tsx > … choosing Mangalore calls changeCity('mangalore') exactly once` | `MB24` (MUT-919, `actions.changeCity(city.key)` removed; RED, with the composed it) — RERUN | `setCity` not called, with `changeCity` called once in the same it | — |
| city-switch-3 switching drops `areaKey` + viewport, keeps filters, one PUSH Back undoes | COVERED_EXISTING | `features/discover/state/url/__tests__/crossCityResultScope.2611.test.ts > … switching city drops areaKey and viewport, keeps filters, and is one PUSH that Back undoes` | MUT-920, MUT-921, MUT-922 (REUSE, blobs identical) | same it: initial `areaKey` present, new `city`, retained `type=apartment`, PUSH, Back restores | — |
| city-switch-4 composed Mangalore through the REAL DiscoverProvider | COVERED_EXISTING | `DiscoverControlBar.test.tsx > … composed: clicking Mangalore through the REAL DiscoverProvider writes ?city=mangalore, drops a stale areaKey, and the control re-renders as Mangalore` | `MB24` (MUT-1902), `MB25` (MUT-1903 `city.ts:83` reset removed), `MB26` (MUT-1904 `city.ts:37` -> constant), `MB27` (MUT-1905 `DiscoverContext.tsx:250` memo deps -> `[]`) — each RED on this it, RERUN | the `areaKey` absence is read after `city=mangalore` was observed in the same it | Udupi -> Mangalore only |
| city-switch-5 COMPOSED `?city=kundapur` -> label Kundapur | COVERED_NEW | N8 | `MB8` (MUT-1904 `city.ts:37` -> constant `'udupi'`; RED: control shows Udupi) and `MB9` (MUT-918 `DiscoverControlBar.tsx:724` -> constant; RED) | same it: a `?city=udupi` remount shows Udupi and not Kundapur; the Kundapur arm also rejects the raw-slug fallback (`DiscoverControlBar.tsx:178`) | the spec's `[role=combobox]` selector is stale (the control is a `button`): noted, not claimed |

### csv 69 — e2e/discover-group-results-1597.spec.ts

| Id | Disposition | Destination (file > it) | Mutation | Same-it control for a negative | RETAIN / STALE / OBSOLETE reason |
|---|---|---|---|---|---|
| 1597-1 / 1597-2 / 1597-4 / 1597-5 / 1597-6 group-results panels, CTA, Level-2 rows | OBSOLETE | none. Evidence re-run at base: `staticSweep.test.ts` L674 (`area-group-results-*`, `area-group-view-all`, `area-group-selected-card`, `area-group-back-to-all` in `DELETED_PANEL_TESTIDS`) and `DiscoverRightPanel.routing.test.tsx` L537 | — | not claimed | `group-results-listing-*` and `browse-all-area-*` have 0 production hits (`git grep` over `apps/web/src` lists only test files) |
| 1597-3 cold `groupResults=1` read + `enterGroupResults` PUSH (facade) | COVERED_EXISTING | `resultScope.atomicCommit.test.ts > … groupResults=1 is read from a cold-load URL and enterGroupResults PUSHes it` | `MB16` (MUT-923 `area.ts:52` read -> `undefined`; RED) — RERUN | same it: control arm without the param -> `undefined`, then PUSH | facade only; the param has no rendering consumer |
| 1597-7 COMPOSED cold `groupResults=1` survives the mounted page — URL SURVIVAL ONLY | COVERED_NEW | N9 | `MB10` (tripwire: `groupResults` stripped inside the mount-time URL write at `area.ts:243`; RED), `MB11` (control liveness: the page's own `scope=` mount write removed; RED, so the same-it control can fail) | same it: the page performs a mount-time `scope=` REPLACE write (404 probe) and the same probe observes it, before `groupResults=1` / `groupId` survival is read | worded as URL survival only. `MB12` (MUT-923 read -> `undefined`) SURVIVED: the URL survival does not depend on the facade read (no rendering consumer, as the PR-5 note said). `MB10` is a tripwire: it proves detection of an injected strip, not a product behaviour (R8). At base the page does NOT strip `groupResults`, so the row is not STALE |

### Downgrades and non-claims (logged)

- 1483-8 URL `scope=` -> panel hop: RETAIN (the cited unit it passes `panelContent` directly).
- 1483-11 area-first-shell Start Over host: RETAIN (R_double_guard); Popover behaviour RETAIN (R_injected).
- 2087-2/3 negatives: the existing L299 / L329 its are not cited (R_control); replaced by N7.
- 1483-5 cancel negative: the existing L83 it is not cited (R_control); replaced by N5.
- 2087-6 outbound request: RETAIN (R_wire).
- 2087-1: OBSOLETE as a stale recipe, flagged for the owner to re-class as STALE.

## Web slice B2 — URL / page family, part 2 (csv 62, csv 97, csv 180)

Handoff 285907, batch B7. Draft section for `docs/testing/e2e-retirement-map-2859-b7.md`. Worktree `issue-2859-b7-discover-url-navigation`, HEAD `44bf41a5888ecade25369708cfef444f095288dc`. Specs stay on disk, byte-identical; no spec is claimed retired. Manifest status stays `SCHEDULED(#2859)`.

Dispositions: `COVERED_NEW`, `COVERED_EXISTING`, `RETAIN`, `STALE`, `OBSOLETE`. A hop marked "composed" is COVERED only because ONE it() observes before, action through the real relay, and after, and the seam mutation reddens that it (R_composed). `MCn` = a row in `evidence/mutation/register.tsv`; `MUT-nnnn` = the PR-5 id a row inherits (R_prior_mut, blob-identical, row recorded `REUSE`) or re-proves (row recorded `RERUN`). Per-assertion source: `docs/testing/e2e-retirement-map-pr5.md` sections `#discover-city-listings-empty-city-guard-2189`, `#discover-url-state`, `#issue-2017-multi-area-areaset-commit-regression`.

### Counts (assertion rows; sub-claims split where a row carries more than one disposition)

| Spec | COVERED_NEW | COVERED_EXISTING | OBSOLETE | RETAIN | STALE |
|---|---|---|---|---|---|
| csv 62 2189 | 3 (2189-1 and 2189-2 outbound-wire halves, 2189-5) | 2 (2189-1/2 hook ARGUMENT halves, via L69 only) | 0 | 2 (2189-3, 2189-4) | 0 |
| csv 97 url-state | 2 (url-state-1 narrowed to the 404 branch, url-state-6 control replacement) | 3 (url-state-4, -5, -7) | 2 (url-state-2, -3) | 0 (url-state-1 200 branch = owner question OQ2, not a RETAIN row) | 0 |
| csv 180 2017 | 1 (2017-9 URL/commit/cancel half; also supplies the 2017-8 "no CTA" control) | 5 (2017-2/3, 2017-4, 2017-5 ARGUMENT half, 2017-6, 2017-7/8 chips half) | 0 | 4 (2017-1, 2017-5 outbound request, 2017-6 composed count, 2017-9 request+count composed halves) | 0 |

### New tests (slice B2)

- `N10` = `apps/web/src/pages/__tests__/MapDiscovery.cityListingsRequest2859.test.tsx > #2859 B7 2189-5 — page URL city -> real useDiscoverCityListings -> outbound request (real lib/api, fetch stub) > arm A: ?city=bangalore&node=<leaf> sends GET /api/discover/cities/bangalore/listings and never /cities//listings; arm B (no city) also never sends /cities//listings`
- `N11` = `apps/web/src/pages/__tests__/MapDiscovery.areaKeyColdLoad2859.test.tsx > #2859 B7 url-state-1 — cold journey-less ?areaKey= (city without a hierarchy) renders cards + back-button, then Back drops areaKey > renders listing-card(s) and the back-button with areaKey kept, no interaction; clicking back-button drops areaKey`
- `N12` = `apps/web/src/features/discover/components/__tests__/AreaSetDraftPanel.realCommit2859.test.tsx > #2859 B7 2017-9 — AreaSetDraftPanel -> REAL commitAreaSet -> URL (real DiscoverProvider, no action mocks) > Add leaves the URL unchanged; Cancel leaves it unchanged and a reopen shows only A; Add + Show listings writes rscope=areas, rareas=A,B, areaKey=A as ONE PUSH`
- `N13` = `apps/web/src/hooks/__tests__/useDiscoverUrlState.viewportTimer2859.test.ts > #2859 B7 url-state-6 — a pending viewport debounce cannot re-write the viewport after deselectArea (control in the same it) > deselect is visibly applied (areaKey + viewport cleared) BEFORE the timers fire, and after they fire the viewport is still null`

What each mounts:

- `N10`: REAL `MapDiscovery` + `DiscoverProvider`, REAL `useDiscoverCityListings`, REAL `lib/api` (`API_BASE_URL` = `http://localhost:8085`), global fetch stub reading every captured URL (R_wire); `supabase.auth.getSession` mocked (anon). `PropertyMap`, `AppLayout`, the other data hooks are stubs. Arm A (`?city=bangalore&node=a:IN|KA|Bangalore|Domlur`, resolve answered with an AREA leaf): the captured listings request is `GET /api/discover/cities/bangalore/listings?areaKeys=IN|KA|Bangalore|Domlur&limitPerArea=50...`, and zero captured URLs match `/cities\/\/listings/`. Arm B (same it, remount, `/discover?areaKey=...` with NO `city=`): the request that fires is the well-formed `/api/discover/cities/bangalore/listings` and zero match `/cities\/\/listings/`.
- `N11`: REAL `MapDiscovery` + `DiscoverProvider` + REAL `useDiscoverUrlState` + REAL `useDiscoverCityListings` + REAL `lib/api` with a fetch stub; the default-journey probe `GET .../navigation/resolve?node=root` is answered 404.
- `N12`: `AreaSetDraftPanel` inside the REAL `DiscoverProvider` (real nav/actions/shell) + real `AreaSetDraftProvider`, MemoryRouter `[PREV, COMMITTED]` + LocationProbe. No discover-context mock. Only `useDiscoverAreas` and `useNearbyAreaCandidates` are stubbed. Open/close comes from the real shell (`openAreaSetDraft` / `closeAreaSetDraft`).
- `N13`: `renderHook(useDiscoverUrlState)` with fake timers; the positive control (deselect visibly applied: areaKey null, viewport null, BEFORE the timers run) is in the same it as the negative.

### Base runs (R_base_red) — `evidence/base-runs/base-runs.tsv` rows 37-46 (this slice); every file run ALONE at `44bf41a5`

| File | Exit | Result | Citation consequence |
|---|---|---|---|
| useDiscoverCityListings.test.ts | 0 | 26/26 | cited only L69 (see R_control) |
| DiscoverRightPanel.issue1064.test.tsx | 0 | 7/7 | cited (L122) |
| AreaSetDraftPanel.test.tsx | 0 | 3/3 | cited |
| useAreaSetDraft.test.ts | 0 | 25/25 | cited |
| commitAreaSet.test.ts | 0 | 6/6 | cited |
| AreaSetChips.test.tsx | 0 | 19/19 | green, but L296 NOT cited (negative-only, no same-it control) |
| MapDiscovery.cityListingsRequest2859 / areaKeyColdLoad2859 / AreaSetDraftPanel.realCommit2859 / useDiscoverUrlState.viewportTimer2859 | 0 | 1/1 each | new |
| (slice A rows reused, not re-run) useDiscoverUrlState.test.ts | 1 | 261, 16 red | PASS-RF: the 16 frozen reds (journey short-name / changeCity / startOver / locality) do not include L180 or L199, which are the only cited its |
| (slice A rows reused) resultScope.atomicCommit.test.ts 13/13, useDiscoverMapDataController.test.ts 42/42, DiscoverRightPanel.test.tsx 63/63 | 0 | green | cited |

No frozen red is cited anywhere in this slice.

### R_prior_mut decision (`evidence/mutation/reuse_check_b2.tsv`; PR-5 head `8a142a39` vs base `44bf41a5`)

REUSE (test blob AND product blob(s) identical; rows appended by `append_reuse_rows_b2.py`, `reuse_or_rerun = REUSE`): MUT-1433 (url-state-5 L180 half), MUT-1435 (url-state-6 PR-5 it, context only), MUT-1436 (url-state-7), MUT-1113/1119/1471/1470 (2017-2/3), MUT-1114/1115/1476/1477 (2017-4), MUT-1116/1472 (2017-7/8). 13 reuse rows. (MUT-1473/1475 were in the PR-5 cell for 2017-4 but target the AreaSetChips `it`s I do not cite; not reused, not claimed.)

RERUN (a cited TEST blob differs, product identical): `useDiscoverCityListings.test.ts` (MUT-804 -> MC2, MUT-805 -> MC805), `resultScope.atomicCommit.test.ts` (MUT-1107 -> MC15, MUT-1434 -> MC16, MUT-1432-equivalent -> MC17), `useDiscoverMapDataController.test.ts` (MUT-1117 -> MC18), `DiscoverRightPanel.test.tsx` (MUT-1118 -> MC19). All five re-ran RED with the cited it in the observed set.

### 2189 — `e2e/discover-city-listings-empty-city-guard-2189.spec.ts` (csv 62)

| id | disposition | destination (file : it) | mutation | R_control / R_wire |
|---|---|---|---|---|
| 2189-1 no `//listings` request (negative) | COVERED_NEW (outbound wire) + COVERED_EXISTING (hook ARGUMENT half) | `N10` arm A; `useDiscoverCityListings.test.ts > never issues a request with an empty city path segment, even transiently (Issue #2189)` (L69) | MC3 (page -> hook city `''` AND guard removed: `/cities//listings` is issued, `N10` RED at the pathname assertion), MC2 (MUT-804 re-run: L60 + L69 RED, guard-only) | N10: the arm-A positive (`pathname === /api/discover/cities/bangalore/listings`, `areaKeys` carries the leaf) is in the SAME it. L69 has the positive in the same it (rerender to `udupi` fires once). L60 (`does not fetch when city is empty ...`) has NO positive control: NOT cited. Hook file mocks `@/lib/api`: ARGUMENT coverage only; the wire half is `N10` |
| 2189-2 well-formed request fires | COVERED_NEW (wire) + COVERED_EXISTING (argument) | `N10` arm A and arm B; L69 | MC1 (page -> hook city `''`, guard intact: arm A RED, no request), MC805 (URL segment `/listings` -> `/listing`: `N10` + L69 RED; MUT-805 re-run) | positive is the assertion itself |
| 2189-3 cards >= 1 | RETAIN | - | - | the stub returns zero cards; no rendered-card subclaim asserted (R_stub_ui: UI subclaim not claimed). Canonical T6 = context only |
| 2189-4 no console error | RETAIN (rev2 F2) | - | - | unsupported negative without a positive control; no evidence the behaviour was removed, no product-contract contradiction |
| 2189-5 COMPOSED page URL city -> hook -> request | COVERED_NEW | `N10` | MC1 RED, MC3 RED, MC805 RED, MC20 RED (arm B) | arm A positive + arm B positive in one it; see AC7 finding |

### AC7 finding — how the page passes `city` to the hook

- The page does NOT pass the raw URL city. `useDiscoverPageState.ts:245` `useState(() => resolveEffectiveCity(urlState.city))` with `resolveEffectiveCity(rawCity) = rawCity || DEFAULT_CITY` (`features/discover/selectors/effectiveDiscoverContext.ts:110-112`), then re-synced at `:276-290`. `useDiscoverPageComposition.ts:355` hands that `city` to `useDiscoverMapDataController` -> `useDiscoverMapData.ts:859-861` (`useDiscoverCityListings({ city, areaKeys: activeAreaListingKeys ...})`) and, for the anon bbox path, `:1078-1079`. The AREA-leaf surface has a second call site `useAreaLeafResultSource.ts:87-88` (`city: params.city`), disabled when the map supplies the area listings.
- Observed at base: no `city=` in the URL -> the request that fires is `http://localhost:8085/api/discover/cities/bangalore/listings?areaKeys=IN%7CKA%7CBangalore%7CDomlur&limitPerArea=50&propertyType=apartment...&listingPurpose=sale` (DEFAULT_CITY is bangalore); with `?city=bangalore&node=a:IN|KA|Bangalore|Domlur` the same path. Zero `/cities//listings`.
- So arm B is a TRIPWIRE on the page's defaulting, and the empty city is only reachable at the hook, not from a stable page state. Mutation results (`register.tsv`):
  - MC20 (`resolveEffectiveCity` returns the raw empty city): `N10` RED (arm B positive dies). This is the tripwire's discriminating mutation.
  - MC2 / MUT-804 (hook guard removed alone): the hook tests RED, `N10` stays GREEN (the page never hands the hook an empty city). Reported, not hidden.
  - MC11 (page state initialises to the raw URL city, guard intact): SURVIVED (expected). MC12 (same, plus guard removed): SURVIVED. The transient raw-empty first render did not issue `//listings` in this fixture, so I do NOT claim the transient shape is covered at page level. `survive_expected` rows recorded as SURVIVED.
  - MC1b (leaf-source call site city `''`): SURVIVED (R_double_guard: that query is disabled when the map supplies the area listings; the fixture exercises the map-hook site `useDiscoverMapData.ts:859`).

### url-state — `e2e/discover-url-state.spec.ts` (csv 97)

| id | disposition | destination | mutation | notes |
|---|---|---|---|---|
| url-state-1 cold journey-less `?areaKey=` | COVERED_NEW, NARROWED to "a city WITHOUT a navigation hierarchy (probe 404)" | `N11` | MC5 RED (`rightPanelRoute.ts:84` `&& !hasArea` dropped -> `back-button` missing), MC6 RED (`area.ts:48` areaKey read -> null), MC13 RED (`area.ts:324` deselectArea no longer deletes areaKey -> `expected true to be false` after the click) | the plan-named line `rightPanelRoute.ts:86` (MUT-1436 line) is MC4: SURVIVED. It is unreachable when the area is found (`hasArea` true), so it cannot redden a cards test; MUT-1436 stays attached to url-state-7. Same-it controls: the probe sees the page's own `scope=''` REPLACE; the back-button click is observed by the same LocationProbe |
| url-state-2 `Select an area to explore` absent | OBSOLETE | - | - | re-scan at base: `git grep -i "select an area to explore" -- apps/web/src` = 1 hit, `pages/__tests__/Trends.issue1528.test.tsx:216` (a Trends-page NEGATIVE assertion); 0 production hits |
| url-state-3 `quick-select-chip` | OBSOLETE | - | - | `git grep "quick-select-chip" -- apps/web/src` = 3 hits, all `components/discover/__tests__/DiscoverRightPanel.test.tsx:148/157/176` `queryByTestId(...).not.toBeInTheDocument()`; 0 production hits |
| url-state-4 selectArea PUSH, `navigate(-1)/(1)` | COVERED_EXISTING | `resultScope.atomicCommit.test.ts > selectArea is a PUSH: real navigate(-1) removes areaKey and navigate(1) restores it` | MC15 (MUT-1107 re-run, RED, the cited it in the observed set) | RERUN (test blob differs) |
| url-state-5 panel Back drops areaKey + lat/lon/zoom as REPLACE | COVERED_EXISTING | `resultScope.atomicCommit.test.ts > deselectArea(resultScope) clears areaKey/lat/lon/zoom AND the AREA_SET scope in ONE replace ...` (L119); `useDiscoverUrlState.test.ts > clears lat, lon, and zoom when deselecting an area` (L180, PASS-RF file, L180 green) | MC16 (MUT-1434 re-run RED), MC17 (MUT-1432-equivalent RED); MUT-1433 REUSE | MUT-1432's exact PR-5 edit is not recorded in the map; MC17 is an equivalent edit on the resultScope arm of `deselectArea` |
| url-state-6 pending debounce cannot re-write after Back (negative) | COVERED_NEW (R_control replacement) | `N13` | MC21 RED (timer cancel removed) | existing `useDiscoverUrlState.test.ts` L199 asserts only the negative (no deselect-applied assertion before the timers run): NOT cited. `N13` carries the control in the same it |
| url-state-7 guided entry when areaKey absent | COVERED_EXISTING | `DiscoverRightPanel.issue1064.test.tsx > falls back to GuidedEntryPanel only when urlAreaKey is absent (no regression for empty state)` (L122) | MUT-1436 REUSE (`rightPanelRoute.ts:86`) | positive claim (`guided-entry-panel` present); sibling (a)-(c) its supply the rest |

### AC12 finding — url-state-1, both probe arms (OQ2 evidence)

Both arms: `/discover?city=udupi&areaKey=IN|KA|Udupi|Manipal`, areas mocked with Manipal, city listings real-wire stubbed with 2 cards.

- Probe 404 (`area.ts:196-229`: `ApiError` 404 -> `hierarchyConfirmedUnavailable`; `:237-247` REPLACE-writes `scope=''`; `:250-257` `journey = null`): the legacy shell renders. Observed testids (N11 asserts these): `listing-card` (2) and `back-button` render without interaction; the URL keeps `areaKey` and gains `scope=`; clicking `back-button` drops `areaKey` (`area.ts:324`). Product path: `rightPanelRoute.ts:84-99` -> `{kind:'journey', journey:'area'}`.
- Probe 200 (the D18 case; `area.ts:250-257`: `journey = 'area-first'`, no `scope=` write): the page renders the area-first shell, NOT the area panel. Observed testids (scratch run, deleted): `discover-areas-journey-panel-shell`, `areas-breadcrumb-trail`, `breadcrumb-seg-root`, `journey-switcher-section`, `journey-card-area-first(-selected-check)`, `journey-card-school-first`, `journey-card-agri-first`, `journey-metadata-strip`, `areas-journey-panel-loading`, `control-bar-*`, `map-info-dock`. NO `listing-card`, NO `back-button`. `areaKey` stays in the URL, zero URL writes after mount (`seen.length === 1`). The listings request still fires (`GET /api/discover/cities/udupi/listings?areaKeys=IN|KA|Udupi|Manipal...`), but no card renders; the panel sits on `areas-journey-panel-loading` (my counts stub returned empty children for `root`; I did not chase whether richer counts would resolve it).
- So the legacy spec's expectation ("cold journey-less `?areaKey=` shows cards") holds only for a city whose hierarchy probe is a 404. For a city WITH a hierarchy it is not what the product renders. This is the OQ2 evidence. I did not force or assert the 200 arm; the claim in `N11` is the 404 branch and is worded so. OQ2 (owner): is the 200-branch expectation STALE (default) or a regression to file?

### 2017 — `e2e/issue-2017-multi-area-areaset-commit-regression.spec.ts` (csv 180)

| id | disposition | destination | mutation | notes |
|---|---|---|---|---|
| 2017-1 single-area baseline | RETAIN | - | - | UI subclaim not cheap in the N12 tree (no listing surface mounted); server membership excluded (R_stub_ui); canonical T15b context only |
| 2017-2/3 Add = draft chip, no commit (negative) | COVERED_EXISTING (construction) + composed in `N12` | `AreaSetDraftPanel.test.tsx > Add on a nearby suggestion adds a draft chip and does not commit` (L127); `useAreaSetDraft.test.ts > appends a new area key, preserving insertion order` (L43) | MUT-1113/1119/1471/1470 REUSE; composed: MC14 RED (Add also commits on the REAL wiring) | L127 has the chip positive in the same it. `N12` is RED under MC14 at the downstream `commit-cta` lookup (the draft is no longer dirty after an Add that already committed), not at the URL-unchanged line itself |
| 2017-4 CTA only when dirty; FULL draft, FIRST key primary, ONE PUSH | COVERED_EXISTING + composed in `N12` | `AreaSetDraftPanel.test.tsx > Show listings appears only when dirty ...` (L152); `commitAreaSet.test.ts` L50/L73/L140 | MUT-1114/1115/1476/1477 REUSE; composed: MC7 (panel -> `commitAreaSet` call removed), MC9 (`commitAreaSet` dropped from the context action proxy list, `DiscoverContext.tsx:139`), MC8 (`area.ts:307` PUSH -> REPLACE, Back then lands on PREV) all RED on `N12` | `AreaSetChips.test.tsx` L296 (`does not render the commit CTA when the draft is not dirty`) is negative-only: NOT cited |
| 2017-5 request scoped to both keys | COVERED_EXISTING (ARGUMENT half) + RETAIN (outbound) | `useDiscoverMapDataController.test.ts > a committed AREA_SET [A,B] sends BOTH area keys on the city-listings request` (L1603) | MC18 (MUT-1117 re-run, RED) | that file mocks `@/lib/api` (R_wire): API-call argument only. `N12` does not mount `useDiscoverMapData`: the request-after-commit composed half is RETAIN |
| 2017-6 header count == cards | COVERED_EXISTING (construction) + RETAIN (composed) | `DiscoverRightPanel.test.tsx > multi-area committed set: area-header-count equals the number of rendered listing cards` (L1497) | MC19 (MUT-1118 re-run, RED) | `N12` does not mount the right-panel header |
| 2017-7/8 Cancel discards; reopen shows only A, `1 of 3`, no CTA | COVERED_EXISTING (chips/header) + COVERED_NEW (`N12`: composed Cancel + reopen, CTA absent with the CTA-present control in the same it) | `AreaSetDraftPanel.test.tsx > Cancel discards the draft ...` (L172); `useAreaSetDraft.test.ts` L191/L245; `N12` | MUT-1116/1472 REUSE; composed: MC10 (`resetToCommitted` removed from the Cancel handler) RED on `N12` | L172 asserts `no commit CTA` without ever showing the CTA in that it (no same-it control); the CTA-absent negative is claimed by `N12`, not by L172 |
| 2017-9 COMPOSED panel -> REAL commitAreaSet -> URL | COVERED_NEW (URL half) | `N12` | MC7, MC8, MC9, MC10, MC14 RED | request-scoped-to-both-keys and header-count-equals-cards composed subclaims: RETAIN (`useDiscoverMapData` and the header are not in the `N12` tree). The existing separate its are labelled construction-only |

### Mutation register (this slice; all rows restored byte-identical, `green_after = true`, `restored_sha_ok = true`)

| id | product edit | tests run | predicted RED | observed | verdict |
|---|---|---|---|---|---|
| MC1 | `useDiscoverMapData.ts:860` city -> `''` | N10 | N10 | N10 RED (`expected 0 to be greater than 0`) | RED |
| MC1b | `useAreaLeafResultSource.ts:88` city -> `''` | N10 | none (R_double_guard) | green | SURVIVED (expected) |
| MC2 | `useDiscoverCityListings.ts:421` drop `Boolean(city)` (MUT-804 re-run) | hook test + N10 | hook L60, L69 | hook L60, L69 RED; N10 green | RED |
| MC3 | MC1 + MC2 together | N10 | N10 | N10 RED at the arm-A pathname assertion (`/cities//listings` issued) | RED |
| MC805 | `useDiscoverCityListings.ts:411` `/listings` -> `/listing` (MUT-805 re-run) | hook test + N10 | hook L69, N10 | both RED | RED |
| MC11 | `useDiscoverPageState.ts:245` raw URL city | N10 | none | green | SURVIVED (guard holds) |
| MC12 | MC11 + guard removed | N10 | N10 (predicted) | green | SURVIVED (prediction NOT met; transient `//listings` not reproduced; not claimed) |
| MC20 | `effectiveDiscoverContext.ts:111` no default | N10 | N10 | N10 RED (arm B) | RED |
| MC4 | `rightPanelRoute.ts:86` | N11 | none | green | SURVIVED (unreachable when area found) |
| MC5 | `rightPanelRoute.ts:84` `&& !hasArea` dropped | N11 | N11 | RED (`back-button` missing) | RED |
| MC6 | `area.ts:48` areaKey read -> null | N11 | N11 | RED | RED |
| MC13 | `area.ts:324` deselectArea keeps areaKey | N11 | N11 | RED (`expected true to be false`) | RED |
| MC7 | `AreaSetDraftPanel.tsx:90` commit call removed | N12 | N12 | RED (rareas stays `A`) | RED |
| MC8 | `area.ts:307` PUSH -> REPLACE | N12 | N12 | RED (Back lands on PREV, `areaKey` null) | RED |
| MC9 | `DiscoverContext.tsx:139` `commitAreaSet` dropped from the actions list | N12 | N12 | RED | RED |
| MC10 | `AreaSetDraftPanel.tsx:100` `resetToCommitted` removed | N12 | N12 | RED (CTA still shown after reopen) | RED |
| MC14 | `AreaSetDraftPanel.tsx:233` Add also commits | N12 | N12 | RED | RED |
| MC15 | `area.ts:277` PUSH -> REPLACE (MUT-1107 re-run) | atomicCommit | `selectArea is a PUSH` | RED | RED |
| MC16 | `area.ts:339` REPLACE -> PUSH (MUT-1434 re-run) | atomicCommit | L119 it | RED | RED |
| MC17 | `area.ts` deselectArea drops the resultScope fold (MUT-1432-equivalent) | atomicCommit | L119 it | RED | RED |
| MC18 | `useDiscoverMapData.ts:828` first key only (MUT-1117 re-run) | controller test | L1603 it | RED | RED |
| MC19 | `AreaSetSelectedExtras.tsx:423` `{count + 1}` (MUT-1118 re-run) | RightPanel test | L1497 it | RED | RED |
| MC21 | `area.ts:318` timer cancel removed | N13 | N13 | RED | RED |

### Owner questions

- OQ2 (url-state-1): see the AC12 finding. Team Lead: the 200 branch is RETAIN + owner question OQ2 (not STALE); `N11` claims the 404 branch only.
- No product, spec, existing test, config or manifest edit was needed or made. Mutation edits were applied and restored by `run_mutation.py` only; `verify_restore.py` = `BYTE_IDENTICAL`.

## Web slice C — map-hierarchy (csv 72, AC11)

Handoff 285907, batch B7. Draft section for `docs/testing/e2e-retirement-map-2859-b7.md`. Worktree `issue-2859-b7-discover-url-navigation`, HEAD `44bf41a5888ecade25369708cfef444f095288dc`. `e2e/discover-map-hierarchy.spec.ts` stays on disk byte-identical; no spec is retired; manifest status stays `SCHEDULED(#2859)`.

Dispositions and mutation-id conventions as in A.md. Mutation ids `MDn` are rows in `.claude/handoffs/issue-285907/evidence/mutation/register.tsv` (anchors in `mutations.py`, diffs `evidence/mutation/MMDn.diff`, predicted red sets in `predicted/`, observed in `observed/`). `MUT-nnnn` is the PR-5 mutation id a row inherits.

### New test (slice C)

`NC` = `apps/web/src/pages/__tests__/MapDiscovery.mapHierarchy2859.test.tsx > #2859 B7 L72 map-hierarchy (page-level, spec URL ?city=udupi&scope=)`; its (suffixes of the full title):

- `NC1` = `MH-1: the empty-scope landing renders BOUNDED macro-region bubbles (2 groups, not 4 areas) with the summary counts and keeps scope=; scope=<group> renders its member pills`
- `NC1b` = `MH-1 control (same claim, other arm): scope=south-udupi renders the 3 member pills, not bubbles`
- `NC1c` = `MH-1 composed (one it): bounded bubbles BEFORE, then the scope=<group> arm in the SAME mount shows members (positive control for the bubble negatives)`
- `NC2` = `MH-2: right-panel region card click writes the literal scope=south-udupi, drills to the 3 member pills (Malpe / Coastal absent), panel stays guided-entry`
- `NC2b` = `MH-2b: a map bubble click at the spec URL writes scope=south-udupi (not areaKey=) and drills to the member pills`
- `NC3` = `MH-3: Back from scope=south-udupi to the scope= entry clears the real scope and the bubbles return (react-router contract only)`
- `NCA` = `MH-AGRI: agri corridor landing renders the corridor bubble (positive) and no residential region/area pills (negative)`
- `NC4` = `MH-4L: Bangalore 4-level lockstep city -> macro-region -> zone -> area; the non-member area (Hebbal) never appears in airport-belt`

What it mounts: the REAL `MapDiscovery` + `DiscoverProvider` + real `useDiscoverUrlState` + real right panel (`GuidedEntryPanel`) inside a `MemoryRouter` with a `LocationProbe` (harness copied from `MapDiscovery.issue1745-batchB-overviewClick.test.tsx`, which is not edited). `PropertyMap` is a recording double capturing `areas` + `onAreaClick`; data hooks (`useDiscoverAreas`, `useAreaGroups`, `useDiscoverRegionSummary`, `useRegionScopedAreaGroups`, `useRegionalAreaGroups`) return fixtures shaped like the spec's `DISCOVER_AREAS_FIXTURE` / `AREA_GROUPS_FIXTURE` / `SUMMARY_FIXTURE` (Udupi: 4 areas, 2 groups; Bangalore: 3 areas, 2 groups, 1 region, a region projection with a zero-listing zone as discriminating non-member; agri: 1 corridor + 1 agri area). Claim scope is R_stub_ui: the captured `areas` GIVEN those stubbed responses; server-side membership is excluded. URL assertions read exact param values via `URLSearchParams` (no substring match).

### Base runs (R_base_red) — `evidence/base-runs/base-runs.tsv`, every file run ALONE at `44bf41a5`

| File | Exit | Result | Citation consequence |
|---|---|---|---|
| NC (MapDiscovery.mapHierarchy2859.test.tsx) | 0 | 8/8 | new, green at base |
| MapDiscovery.issue1745-batchB-overviewClick.test.tsx | 1 | 5/8, 3 red | the MH-2b (i) run; red its named below; NOT cited |
| map-layer-derivation.test.ts, useDiscoverMapPresentation.overviewAreas.test.ts, GuidedEntryPanel.summary.test.tsx, useDiscoverOverviewNavigationController.test.ts, useDiscoverUrlState.scope.test.ts, useDiscoverMapPresentation.scopeAliasFallback.test.ts | 0 | 27 / 11 / 12 / 8 / 6 / 4, all green | cited for MH-prior below |

### MH-2b — the two base runs (AC11, OQ1)

Both runs at HEAD `44bf41a5`, product untouched, command `env -C apps/web VITE_SUPABASE_URL=http://127.0.0.1:1 VITE_SUPABASE_PUBLISHABLE_KEY=dummy npx vitest run <file> --maxWorkers=1`.

- (i) existing `MapDiscovery.issue1745-batchB-overviewClick.test.tsx :242` (`macro-region bubble click (journeyless landing, scope=null) sets scope=<groupId>, NOT areaKey`) at `/discover?city=udupi`: exit 1, 3 of 8 red. Failure of :242: `Expected element to have text content: scope=coastal-homes / Received: /discover?city=udupi&areaKey=coastal-homes&rscope=areas&rareas=coastal-homes`. The other two reds (not cited): `no-city-param default…` (`expected [ 'bangalore' ] to include 'udupi'`: the defaulted city is now bangalore) and `region-bubble click still routes through setScope…` (same `areaKey=coastal-homes&rscope=areas…` URL). Consistent with the product code, not a defect in the click wiring: the URL has no `scope=`, so `area.ts:250-257` resolves the default `journey = 'area-first'` (the hierarchy probe `area.ts:196-213` is unstubbed in that harness, a non-404 keeps the default, `area.ts:176-179`), `discoverLayerRegistry.ts:396-413` selects `area-group-bubbles` (not `macro-region-bubbles`), so `handleOverviewAreaClick` (`useDiscoverOverviewNavigationController.ts:65`) does not take the macro-region branch and falls to `handleAreaClick` (`:74`), which writes `areaKey=`. The harness URL predates the #2088 item-3 area-first default (the comment at `area.ts:129-133` names this spec's `scope=` sentinel as the suppressor). Recorded; :242 is NOT cited while red.
- (ii) NEW `NC2b` at the spec URL `/discover?city=udupi&scope=`: exit 0, 8/8 green. Bubble click (captured `onAreaClick` on the `south-udupi` bubble) -> probe `/discover?city=udupi&scope=south-udupi`; `areaKey` absent, `rscope` absent; captured `areas` become the 3 member areas. Mutation `MD1` (`useDiscoverOverviewNavigationController.ts` macro branch `actions.setScope(area.areaKey)` -> `handleAreaClick(area)`) turns `NC2b` RED (observed red set `{NC2b, NC4}`), restored sha == base blob, green after.
- Verdict: MH-2b is `COVERED_NEW` (NC2b + MD1). No product divergence at the spec's own URL (no areaKey= and scope= present). OQ1 is NOT raised; the PR-5 note ("shows the page writing `areaKey=`") is explained by the pre-area-first harness URL, not by `scope=` URL behaviour.

### csv 72 — e2e/discover-map-hierarchy.spec.ts

| Id | Disposition | Destination (file > it) | Mutation | Same-it control for a negative | RETAIN / STALE / OBSOLETE reason |
|---|---|---|---|---|---|
| MH-1 journeyless landing (`?city=udupi&scope=`) renders a BOUNDED set of macro-region bubbles (2 groups, never the 4 areas), keeps `scope=`, guided-entry panel shown | COVERED_NEW | `NC1`, `NC1c` (captured `areas` keys == `[coastal-belt, south-udupi]`, count 2, labels + listingCount 10 / 4, none of the 4 area keys; `scope=` is the empty string; no `journey=`) | MD2 (`useDiscoverMapPresentation.ts` macro-region branch `return summaryRegions…` -> `return liveAreas`): RED; observed set includes `NC1`, `NC1c` (also `NC2`, `NC2b`, `NC3`, `NC4`); `NC1b` stays green | negatives (not the 4 areas) have their positive in the SAME it: the exact 2 bubble keys / labels / counts; `NC1c` additionally moves the same mount to `scope=south-udupi` and observes the 3 member pills | painted `.area-marker` DOM, the `N properties` pill text, `page.screenshot` RETAIN (R_injected: Leaflet paint). Right-panel card counts (`10 properties` / `4 properties`): `NC2` reads them but no new mutation targets them; the card-count claim is the PR-5 CE `GuidedEntryPanel.summary…:190` (MUT-1337) — construction. Map pill listingCount is CE MUT-1334 (construction) |
| MH-2 region card click sets literal `scope=south-udupi`, drills to the 3 member pills (Malpe, Coastal Belt absent) | COVERED_NEW | `NC2` (real `GuidedEntryPanel` card click -> probe `scope` param === `south-udupi`, `areaKey` absent; captured `areas` keys == 3 members; labels exclude Malpe and Coastal Belt) | MD3 (`GuidedEntryPanel.tsx` `handleRegionClick` `setScope(…regionKey)` -> `regionKey + '-x'`): RED; observed `{NC1c, NC2}` | before arm (`scope` === `''`, 2 bubbles) and after arm in the same it | the PR-5 card `it` asserted `aria-pressed` only (MUT-1338); `NC2` asserts the literal param |
| MH-2 "panel routing unchanged" (guided-entry panel still shown after scope selection) | RETAIN | `NC2` asserts `guided-entry-panel` present and the card `aria-pressed=true`, but no mutation targets it | — | — | downgrade logged: the assertion is present but unproven by a seam mutation, so it is not claimed |
| MH-2b macro-region bubble click sets `scope=` (not `areaKey`) and drills | COVERED_NEW | `NC2b` (see the two-run block above) | MD1: RED (set `{NC2b, NC4}`) | before (`scope=''`, 2 bubbles) -> click -> after (`scope=south-udupi`, 3 members) in one it; the `areaKey` / `rscope` negatives have the positive `scope=south-udupi` in the SAME it | `overviewClick :242` (red at base, harness URL predates the area-first default) is not cited |
| MH-3 Back from `scope=south-udupi` to the `scope=` entry clears the real scope; bubbles return | COVERED_NEW | `NC3` (two `MemoryRouter` entries, `navigate(-1)` through a `useNavigate` probe: before = member pills + `scope=south-udupi`; after = `scope` === `''`, bubbles `[coastal-belt, south-udupi]`) | MD4 (`compatibility.ts:47` scope read -> `null`): RED; observed set includes `NC3` (also `NC1b`, `NC1c`, `NC2`, `NC2b`, `NC4`) | before / after states in the same it | the real browser history stack (`page.goBack()`) is RETAIN (R_injected); `NC3` proves only the react-router `navigate(-1)` contract in jsdom. PR-5 `useDiscoverUrlState.scope.test.ts` REPLACE its are CE (MUT-1342) |
| MH-AGRI agri corridor landing shows corridor bubbles only; no residential region / area pills (negative) | COVERED_NEW | `NCA` (`journey=agri-first&scope=`: captured `areas` == the single corridor bubble `N`, label `North Corridor — 10–25 km`, listingCount 6, `isGroup`; none of `south-udupi` / `coastal-belt` / the 4 area keys / their labels) | MD5 (corridor branch `if (corridorGroups.length === 0) return []` -> `return []`): RED (positive arm). MD6 (agri branch result `.concat(liveAreas)`, residential leak): RED (negative arm) | the positive (corridor bubble present) is in the SAME it as every negative | `.leaflet-container` visible is painted-DOM RETAIN. Layer-kind selection is CE MUT-1332/1333 (construction) |
| MH-4L Bangalore 4-level lockstep (city -> macro-region -> zone -> area), L2/L3 membership | COVERED_NEW | `NC4` (one it: `North Bangalore` bubble only -> click -> `scope=north`, zone bubbles `[Airport Belt, Hebbal Belt]` (zero-listing `Empty Belt` absent) -> click `Airport Belt` -> `groupId=airport-belt`, area pills `[Devanahalli, Yelahanka]`, discriminating non-member `Hebbal` absent) | MD7 (`useDiscoverMapPresentation.ts` focused-group member filter `memberKeySet.has` -> all `discoverAreas`): RED, set `{NC4}` only. MD8 (L2 zone filter drops `listingCount > 0`): RED, set `{NC4}` only | each level asserts its positive set before the negatives | The PR-5 L2/L3 mutations MUT-1364/1365 (`useDiscoverMapPresentation.ts:378`, group-name / `region_key` match in the L1 bubble derivation) were VACUOUS and are re-derived here: that predicate only affects macro-bubble position / bbox (focus coordinates), not which areas or bubbles are rendered, so no spec-observable membership claim exists at `:378`; RETAIN (position-only, spec does not assert it). The observable membership predicates (L3 filter, L2 zero-listing filter) are proven by MD7 / MD8. Server-side membership is excluded (R_stub_ui). Bubble clicks are driven through the captured `onAreaClick` (real pointer on painted markers is RETAIN) |
| MH-prior (the PR-5 RED_GREEN rows MUT-1330..1342, 1363) | COVERED_EXISTING (construction) | see the table below | REUSE (all blobs identical) | see below | — |

### MH-prior — PR-5 rows (inventory located: `.claude/handoffs/issue-2750/evidence/mutation/index.tsv` lines 85-97, 118 (PR #2819 evidence); run commit `8a142a39`)

`evidence/mutation/reuse_check_c.tsv`: for each row both the cited test blob and the mutated product blob are identical between `8a142a39` and `44bf41a5`, so the PR-5 result is REUSED (register rows `MUT-13nn [MH-prior…]`, `reuse_or_rerun=REUSE`). Each cited file is green at base (table above). The 14 ids cover the "9 RED_GREEN" PR-5 summary (the map counts rows, the index lists ids).

| MUT | Claim | Destination (file > it) | Product line mutated | Same-it control |
|---|---|---|---|---|
| MUT-1330 | layer kind = macro-region-bubbles / region-zone-areas | `tests/discover/map-layer-derivation.test.ts` L62, L70 | `discoverLayerRegistry.ts:417` | `toBe` on the exact kind (positive) |
| MUT-1331 | detail zoom -> zoom-gated | same, L66, L76 | `discoverLayerRegistry.ts:376` | positive `toBe` |
| MUT-1332, 1333 | agri layer kind / scope ignored | same, L195, L207, L252 | `discoverLayerRegistry.ts:387`, `:380` | positive `toBe` |
| MUT-1334 | macro bubble listingCount from summary | `useDiscoverMapPresentation.overviewAreas.test.ts` L106 | `useDiscoverMapPresentation.ts:438` | positive `toMatchObject` |
| MUT-1335 | scoped group member areas | same, L87 | `useDiscoverMapPresentation.ts:209` | positive |
| MUT-1336 | corridor bubbles | same, L135 | `useDiscoverMapPresentation.ts:449` | positive |
| MUT-1337 | region cards show backend counts | `tests/discover/GuidedEntryPanel.summary.test.tsx` L190 | `GuidedEntryPanel.tsx:330` | positive |
| MUT-1338 | card click selects (`aria-pressed`; not the literal `scope=`) | same, L309 | `GuidedEntryPanel.tsx:131` | other card stays `aria-pressed=false` in the same it |
| MUT-1339 | zero regions -> no grid | same, L219 | `GuidedEntryPanel.tsx:285` | `journey-card-area-first` present in the same it |
| MUT-1340, 1341 | controller routes macro bubbles via `setScope`; plain area -> `handleAreaClick` | `useDiscoverOverviewNavigationController.test.ts` L47, L60 | `useDiscoverOverviewNavigationController.ts:66`, `:74` | positive `toHaveBeenCalledWith` |
| MUT-1342 | scope switches are REPLACE (no phantom Back steps) | `tests/discover/useDiscoverUrlState.scope.test.ts` L82, L107 | `city.ts:193` | `navTypesAfterMount.length > 0` positive in the same it |
| MUT-1363 | scope equal to a group name-slug alias resolves to that group's members | `useDiscoverMapPresentation.scopeAliasFallback.test.ts` L74 | `resolveScope.ts:172` | positive `toEqual([AREA_1])`; the L105 no-match arm is a separate it and is not cited |

These are lower-level (construction) proofs; the composed page-level claims are the `NC*` rows above.

### Mutation summary (slice C, `evidence/mutation/register.tsv`)

| id | seam | predicted red | observed red its | verdict | restored sha == base | green after |
|---|---|---|---|---|---|---|
| MD1 | `useDiscoverOverviewNavigationController.ts` macro branch `setScope` -> `handleAreaClick` | NC2b | NC2b, NC4 | RED | true | true (8/8) |
| MD2 | `useDiscoverMapPresentation.ts` macro-region branch -> `liveAreas` | NC1, NC1c | NC1, NC1c, NC2, NC2b, NC3, NC4 | RED | true | true |
| MD3 | `GuidedEntryPanel.tsx` `handleRegionClick` setScope argument | NC2, NC1c | NC1c, NC2 | RED | true | true |
| MD4 | `compatibility.ts:47` scope read -> `null` | NC3 | NC1b, NC1c, NC2, NC2b, NC3, NC4 | RED | true | true |
| MD5 | agri branch drops corridor bubbles (positive arm) | NCA | NCA | RED | true | true |
| MD6 | agri branch leaks `liveAreas` (negative arm) | NCA | NCA | RED | true | true |
| MD7 | L3 focused-group member filter -> all areas | NC4 | NC4 | RED | true | true |
| MD8 | L2 zone filter drops `listingCount > 0` | NC4 | NC4 | RED | true | true |

`verify_restore.py` after all runs: `VERDICT: BYTE_IDENTICAL`; `git diff --stat` empty; `git status --short` lists only `*2859*` untracked test files.

### Downgrades (logged)

- MH-2 "panel routing unchanged": RETAIN (asserted, not mutation-proven).
- MH-4L `:378` predicate (MUT-1364/1365 lines): RETAIN (position-only, not spec-observable).
- Painted `.area-marker`, `N properties` pill text, real pointer clicks, `.leaflet-container`, `page.goBack()` browser stack, screenshots: RETAIN (R_injected).

