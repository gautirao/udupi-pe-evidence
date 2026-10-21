# E2E retirement assertion map - PR-3 (agri + school slice)

Issue #2750, PR-3 of 7, Stage B1 (B1-prep). Map HEAD: `f3eed085` (branch `issue-2750-pr3-school-agri-retirement`, base `d4721bf1`).
This file is the tracked, squash-surviving record behind each PR-3 manifest rationale: a manifest row cites
`map: docs/testing/e2e-retirement-map-pr3.md#<anchor>` (anchors are listed in the table below and are stable).

Nothing in this file deletes a spec. A spec is deleted only when every assertion below is `COVERED_EXISTING`,
`COVERED_NEW` or `OBSOLETE` and the stage rules in the status column are met. An `UNCOVERED` assertion is never
re-labelled as covered (rule D7/D12 of the approved plan; owner rule: uncovered => KEEP the spec).

## Reconciled test counts (method in `evidence/b1/count-reconciliation.md`, kept in the PR evidence dir)

| figure | value | how it is measured |
|---|---:|---|
| Textual declarations (this file's authoritative "tests" figure) | **212** | lines starting `test(` / `test.only|skip|fixme|fail(` whose first argument is a string or template title (same line, or the next non-blank line). `test.describe`, `test.use`, `test.step`, hooks, `test.setTimeout` and the in-body conditional `test.skip(cond, ...)` calls are not declarations. Reproduces the PR-1 estimate (212) exactly. |
| Runtime (Playwright `--list`) | **226** | legacy `playwright.config.ts --project=full --list`, 39 files, dummy loopback URLs, no server, exit 0. Delta of +14 over the textual figure = parameterisation: `agri-destination-identity-2151` runs its describe for desktop and mobile (+7), `broker-agri-listing` AC4 is a 3-case loop (+2), `discover-2717` viewport loop (+2), `issue-2715` viewport loop (+2), `issue-2770` viewport loop (+1). |
| Naive regex figure in the C0 SUMMARY | 347 | over-counted: it matches every `test(` / `test.<word>(` text occurrence, not declarations. Re-derived at HEAD (`\btest(\.\w+)?\(`, global): 354 = 215 plain `test(` (210 line-start declarations; the rest sit in comments/strings/nested calls) + 56 `test.describe` + 35 `test.use` + 37 `test.skip(` (2 are titled declarations, 33 are conditional in-body skips such as `test.skip(!AUTH, ...)`, the rest comments) + 4 `test.setTimeout` + 7 hooks (`beforeAll`/`afterAll`/`beforeEach`). The C0 regex text was not recorded, so 347 vs 354 (3 files differ: broker +1, 1375 +1, school-journey +5 here) is not reconciled to the digit. 347 is not a count of tests. |

Per-file numbers for the 7 B1 candidates (textual = runtime): distance-sort-1974 2, school-badge-suppression 3,
school-empty-guidance 3, school-deep-link-error 3, issue-2767 1, school-panel-error-states 3, popular-schools 2 (17 tests).

## Rules used (D12 and the verdict words)

- `COVERED_EXISTING`: an existing `it` (or canonical journey / backend test) asserts the same property; counted only if it passed in the reporter at C0 (PASS or PASS-RF, `evidence/c0/covering-green.md`) - and, for the 7 B1 candidates, again at HEAD.
- `COVERED_NEW`: a new B1 `it` (id in its title, e.g. `G2-N4`) asserts it and a mutation of the product line turned it RED then GREEN (`evidence/mutation/MUT-nn.txt`).
- `OBSOLETE`: the targeted UI/contract no longer exists in current source (line cited), or the assertion is vacuous (cannot fail). A product behaviour that is merely hard to test is `UNCOVERED`, not obsolete.
- `UNCOVERED`: no test asserts the property (including browser-only layout / hit-testing, which jsdom cannot assert). The spec stays on disk.
- `(weak)` after a verdict: covered, but the covering assertion is containment/arg-level or its discrimination was not shown; the deletion gate must accept it explicitly.
- Citation format `File.test.ts:LINE` is the line at HEAD `f3eed085` (base lines are shifted by the B1 additions; `?` after a number = the base line sat inside a hunk that B1 edited).
- Pre-existing red `it`s (8 files red at base on main, follow-up #2813) are not edited; a cited `it` in such a file counts only when its own reporter line is a check mark (PASS-RF).

## Status vocabulary

`RETIRED_B1` (deleted in the B1 deletion commit; manifest row RETIRED) | `RETIRED_B2` (deleted in the B2 deletion commit after the owner deletion gate; manifest row RETIRED) | `KEPT_PR7` (kept in PR-3 per the owner rule; manifest row SCHEDULED(PR-7), reason in the status) | `B1_DELETE_CANDIDATE` (RECHECK_PASS at HEAD, eligible for the B1 deletion commit) | `B2_CANDIDATE` (firm-retire, every assertion covered/obsolete, needs the deletion gate) | `R4_B2` (security-labelled; security-reviewer APPROVE recorded at `f3eed085`, `gates/security-reviewer.toml`; still B2-only) | `CLOSE_OR_KEEP` (state closed/not closed below) | `KEEP` (owner rule: an uncovered assertion remains; row moves to SCHEDULED(PR-7)).

## Per-spec index (39 specs; anchors are stable)

| spec | anchor | status | tests (textual / runtime) | assertion rows: covered / obsolete / uncovered |
|---|---|---|---|---|
| `e2e/discover-school-homes-distance-sort-1974.spec.ts` | [`#discover-school-homes-distance-sort-1974`](#discover-school-homes-distance-sort-1974) | RETIRED_B1 (commit-to-be) | 2 textual / 2 runtime | 3 / 0 / 0 |
| `e2e/discover/school-badge-suppression.spec.ts` | [`#discover__school-badge-suppression`](#discover__school-badge-suppression) | KEPT_PR7 (SBS-1/SBS-2 UNCOVERED: rendered badge follows the school-radius count — controller wiring useDiscoverBadgeController.ts:109-162 school arm u) | 3 / 3 | 1 / 1 / 2 |
| `e2e/discover/school-empty-guidance.spec.ts` | [`#discover__school-empty-guidance`](#discover__school-empty-guidance) | RETIRED_B1 (commit-to-be) | 3 / 3 | 1 / 2 / 0 |
| `e2e/discover/school-deep-link-error.spec.ts` | [`#discover__school-deep-link-error`](#discover__school-deep-link-error) | RETIRED_B1 (commit-to-be) | 3 / 3 | 3 / 0 / 0 |
| `e2e/issue-2767-udupi-school-area-schoolareakey.spec.ts` | [`#issue-2767-udupi-school-area-schoolareakey`](#issue-2767-udupi-school-area-schoolareakey) | RETIRED_B1 (commit-to-be) | 1 / 1 | 3 / 0 / 0 |
| `e2e/discover/school-panel-error-states.spec.ts` | [`#discover__school-panel-error-states`](#discover__school-panel-error-states) | RETIRED_B1 (commit-to-be) | 3 / 3 | 0 / 3 / 0 |
| `e2e/popular-schools.spec.ts` | [`#popular-schools`](#popular-schools) | RETIRED_B1 (commit-to-be) | 2 / 2 | 1 / 3 / 0 |
| `e2e/agri-destination-identity-2151.spec.ts` | [`#agri-destination-identity-2151`](#agri-destination-identity-2151) | RETIRED_B2 | 8 textual / 15 runtime (desktop+mobile) | 8 / 1 / 0 |
| `e2e/broker-agri-listing.spec.ts` | [`#broker-agri-listing`](#broker-agri-listing) | KEPT_PR7 (AC4 >100 km^2 402: rejected PUT leaves the boundary unchanged) | 4 / 6 (AC4 is a 3-case loop) | 7 / 0 / 1 |
| `e2e/discover-agri-direction-first-1448.spec.ts` | [`#discover-agri-direction-first-1448`](#discover-agri-direction-first-1448) | KEPT_PR7 (AC11 776-877 (REAL_SEED): one-click direction, chip switch, peek over a live seeded stack) | 12 / 12 | 7 / 0 / 1 |
| `e2e/discover-agri-grouped-journey-1412.spec.ts` | [`#discover-agri-grouped-journey-1412`](#discover-agri-grouped-journey-1412) | KEPT_PR7 (weak: AC3 504-507: regional-area-groups fired with city + `propertyType=agricultural_land`) | 12 / 12 | 4 / 5 / 0 |
| `e2e/discover-agri-journey-1375.spec.ts` | [`#discover-agri-journey-1375`](#discover-agri-journey-1375) | KEPT_PR7 (AC6 709-741: browser Back from `/listing/:id` restores journey/city/areaKey; weak: AC9 763-768: agri-first shows no school panels) | 9 / 9 | 6 / 0 / 1 |
| `e2e/discover-agri-locality-marker-1468.spec.ts` | [`#discover-agri-locality-marker-1468`](#discover-agri-locality-marker-1468) | KEPT_PR7 (AC9 766-842 (REAL_SEED): live Udupi S/25 towns; drill-in rows >= 1) | 10 / 10 | 4 / 0 / 1 |
| `e2e/discover-agri-overlay-peek-journey-1431.spec.ts` | [`#discover-agri-overlay-peek-journey-1431`](#discover-agri-overlay-peek-journey-1431) | KEPT_PR7 (weak: AC3 481-489: cold-load peek URL; CTA -> `/listing/<id>`) | 9 / 9 | 5 / 1 / 0 |
| `e2e/discover-agri-polygons-1373.spec.ts` | [`#discover-agri-polygons-1373`](#discover-agri-polygons-1373) | RETIRED_B2 | 6 / 6 | 5 / 0 / 0 |
| `e2e/discover-agri-price-gate-1551.spec.ts` | [`#discover-agri-price-gate-1551`](#discover-agri-price-gate-1551) | RETIRED_B2 | 6 / 6 | 8 / 0 / 0 |
| `e2e/verify-agri-clusters-1372.spec.ts` | [`#verify-agri-clusters-1372`](#verify-agri-clusters-1372) | KEPT_PR7 (AC7 266-273: area-first authed markers fire) | 3 / 3 | 3 / 0 / 1 |
| `e2e/discover-school-first-journey.spec.ts` | [`#discover-school-first-journey`](#discover-school-first-journey) | KEPT_PR7 (weak: E2E-2 222-226: area marker badge "N schools") | 16 / 16 | 11 / 3 / 0 |
| `e2e/discover-school-journey.spec.ts` | [`#discover-school-journey`](#discover-school-journey) | KEPT_PR7 (E2E-7 538: exactly ONE by-area request; E2E-8 612-613: card click writes `schoolId` and `radiusKm=3`; weak: E2E-8 612-613: card click writes) | 10 / 10 (2 `test.skip`) | 6 / 4 / 2 |
| `e2e/discover-school-selected.spec.ts` | [`#discover-school-selected`](#discover-school-selected) | KEPT_PR7 (weak: E2E-6 325-326: URL keeps `schoolId`/`radiusKm` alongside `type=house`) | 6 / 6 | 6 / 2 / 0 |
| `e2e/discover-school-first-grouping-1485.spec.ts` | [`#discover-school-first-grouping-1485`](#discover-school-first-grouping-1485) | RETIRED_B2 | 12 / 12 | 6 / 1 / 0 |
| `e2e/discover-school-first-hardening.spec.ts` | [`#discover-school-first-hardening`](#discover-school-first-hardening) | RETIRED_B2 | 7 / 7 | 6 / 1 / 0 |
| `e2e/discover-school-first-markers.spec.ts` | [`#discover-school-first-markers`](#discover-school-first-markers) | RETIRED_B2 | 5 / 5 | 5 / 1 / 0 |
| `e2e/school-first-back-nav.spec.ts` | [`#school-first-back-nav`](#school-first-back-nav) | RETIRED_B2 | 5 / 5 | 6 / 0 / 0 |
| `e2e/school-first-map-focus.spec.ts` | [`#school-first-map-focus`](#school-first-map-focus) | RETIRED_B2 | 12 / 12 | 6 / 1 / 0 |
| `e2e/discover-2717-school-filters-touch-target.spec.ts` | [`#discover-2717-school-filters-touch-target`](#discover-2717-school-filters-touch-target) | KEPT_PR7 (194-195: visible chip height < 32 px; 199-201: `::before` hit rect >= 44x44; 208-219: Filters and Start over on one row; 234-243: desktop hi) | 2 / 4 (viewport loop) | 1 / 0 / 4 |
| `e2e/discover-anon-school-radius.spec.ts` | [`#discover-anon-school-radius`](#discover-anon-school-radius) | RETIRED_B2 | 5 / 5 | 10 / 1 / 0 |
| `e2e/discover-school-anon-parity.spec.ts` | [`#discover-school-anon-parity`](#discover-school-anon-parity) | RETIRED_B2 | 4 / 4 | 6 / 1 / 0 |
| `e2e/discover-school-board-filter.spec.ts` | [`#discover-school-board-filter`](#discover-school-board-filter) | RETIRED_B2 | 5 / 5 | 6 / 1 / 0 |
| `e2e/discover-school-bounded-search.spec.ts` | [`#discover-school-bounded-search`](#discover-school-bounded-search) | RETIRED_B2 | 4 / 4 | 6 / 0 / 0 |
| `e2e/discover-school-keyword-radius.spec.ts` | [`#discover-school-keyword-radius`](#discover-school-keyword-radius) | RETIRED_B2 | 5 / 5 | 7 / 1 / 0 |
| `e2e/discover-schools-mobile-cluster-2124.spec.ts` | [`#discover-schools-mobile-cluster-2124`](#discover-schools-mobile-cluster-2124) | KEPT_PR7 (230-233: mobile Map overlay mounts; 236-243: real cluster marker tap opens `mobile-cluster-sheet`; 257-260: school-first AREA member writes `areaKey` (canonical routing); weak:) | 1 / 1 | 2 / 0 / 3 |
| `e2e/discover/issue-2149-mobile-school-first-marker-preview.spec.ts` | [`#discover__issue-2149-mobile-school-first-marker-preview`](#discover__issue-2149-mobile-school-first-marker-preview) | KEPT_PR7 (tap A 341-346: real `touchscreen.tap` hit-testing opens the sheet) | 3 / 3 | 3 / 0 / 1 |
| `e2e/discover/issue-2205-schoolfirst-groupid-clear-browser-proof.spec.ts` | [`#discover__issue-2205-schoolfirst-groupid-clear-browser-proof`](#discover__issue-2205-schoolfirst-groupid-clear-browser-proof) | KEPT_PR7 (202-205: no console errors on the real-backend flow) | 1 / 1 | 4 / 1 / 1 |
| `e2e/discover/issue-2715-school-pin-vs-empty-pill.spec.ts` | [`#discover__issue-2715-school-pin-vs-empty-pill`](#discover__issue-2715-school-pin-vs-empty-pill) | KEPT_PR7 (57-58: selected-school pin and plum dashed ring visible per viewport) | 2 / 4 (viewport loop) | 1 / 0 / 1 |
| `e2e/discover/issue-2770-compact-school-context.spec.ts` | [`#discover__issue-2770-compact-school-context`](#discover__issue-2770-compact-school-context) | KEPT_PR7 (76-79: first card top <= 420 px; 82-84: summary band <= 107 px; 149-153: first card < 844 px (mobile); 111-115: back in the area, the "Schoo) | 3 / 4 (viewport loop) | 2 / 0 / 2 |
| `e2e/discover/school-deep-link-radius.spec.ts` | [`#discover__school-deep-link-radius`](#discover__school-deep-link-radius) | RETIRED_B2 | 2 / 2 | 3 / 0 / 0 |
| `e2e/discover/school-first-marker-parity.spec.ts` | [`#discover__school-first-marker-parity`](#discover__school-first-marker-parity) | RETIRED_B2 | 3 / 3 | 4 / 0 / 0 |
| `e2e/discover/school-radius-marker-click-repro-1738.spec.ts` | [`#discover__school-radius-marker-click-repro-1738`](#discover__school-radius-marker-click-repro-1738) | RETIRED_B2 | 3 / 3 | 2 / 1 / 0 |

Assertion rows are the grouped rows of the tables below (one row can carry several spec lines). A row counts as uncovered when any part of it is marked UNCOVERED. Specs found: 39.

---


## A. The 7 B1 deletion candidates (HEAD re-check done, `evidence/b1/b1-recheck.md`)

HEAD re-run (vitest `--reporter=verbose`, dummy loopback env, one run per file, exit codes in the re-check file): every cited `it` below shows a check mark at `f3eed085`; red-at-base files (`SchoolSelectedPanel.domOrder.test.tsx`, `SchoolSelectedPanel.test.tsx`) have a failing-name set identical to C0.

<a id="discover-school-homes-distance-sort-1974"></a>
### e2e/discover-school-homes-distance-sort-1974.spec.ts

**Status:** RETIRED_B1 (commit-to-be) | **Tests:** 2 textual / 2 runtime | **Manifest end-state:** MOVE_DOWN -> `sortListingsBySchoolDistance.test.ts` (exists) | **MUT:** MUT-01 (RED->GREEN)

| assertion (spec:line) | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| SORT-1 254-259: 3 cards, 3 distance badges | COVERED_EXISTING | SchoolSelectedPanel.domOrder.test.tsx:97 (card + distance-badge per listing); SchoolJourneyPanels.test.tsx:259 | - | structural DOM-order oracle; badge exists per card. File red at base for an unrelated skeleton `it` (set equal to C0). |
| SORT-1 266-271: badges non-decreasing (UI reorders server order) | COVERED_EXISTING | sortListingsBySchoolDistance.test.ts:28; rendered-panel: SchoolJourneyPanels.test.tsx:259 (selected), :376 (combined) | MUT-01; RECHECK-PROBE-2 | PROBE-2 (transient, reverted): stopping the sort at `sortListingsBySchoolDistance.ts:40` turns exactly the function test and the 6 panel-level #1974 `it`s red, so the rendered order is discriminated, not only the helper. |
| SORT-2 298-309: no-coords card last, no badge; others have one | COVERED_EXISTING | SchoolSelectedPanel.AreaSchoolCombinedPanel.differential.test.tsx:80; SchoolJourneyPanels.test.tsx:272,284,388,399 | MUT-01; RECHECK-PROBE-2 | differential `it` alone is not discriminating (its fixture already has the null row last and it only compares the two panels); the #1974 panel `it`s are. |

<a id="discover__school-badge-suppression"></a>
### e2e/discover/school-badge-suppression.spec.ts

**Status:** KEPT_PR7 (SBS-1/SBS-2 UNCOVERED: rendered badge follows the school-radius count — controller wiring useDiscoverBadgeController.ts:109-162 school arm untested; closing file useDiscoverBadgeController.issue2190.test.ts not in allowed_file_globs (Q/O/R/I to lane, default KEEP)); manifest row SCHEDULED(PR-7) | **Tests:** 3 / 3 | **Manifest end-state:** MOVE_DOWN -> `MapDiscovery.issue1175.test.ts` (exists) | **MUT:** MUT-02 (RED->GREEN, pure-function level only)

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| SBS-1 165-176: radius active, 0 results: badge visible, count 0, not area total 12 | UNCOVERED | pure-function only: MapDiscovery.issue1175.test.ts:50 | MUT-02 (`discoverBadge.ts:225`, pure function only) | the rendered-badge wiring, the controller school arm `useDiscoverBadgeController.ts:109-162`, is untested; MUT-02 does not reach it. Relabelled from COVERED_EXISTING at the code-reviewer READ_REJECT. Spec KEEP unless scope change/owner acceptance. |
| SBS-2 260-266: 2 results: badge shows 2 not 12 | UNCOVERED | pure-function only: MapDiscovery.issue1175.test.ts:68,83; MapDiscovery.anon-school-radius.test.ts:161 (anon count = filtered length) | MUT-02 (`discoverBadge.ts:225`, pure function only) | same gap: controller wiring `useDiscoverBadgeController.ts:109-162` school arm untested. Relabelled UNCOVERED. |
| SBS-3 281-289: no school: badge = city total 12 | COVERED_EXISTING | MapDiscovery.issue1175.test.ts:179 | - (negative/regression arm; reporter check mark only) | regression arm for the unscoped count. |
| SBS-3 293-295: no school heading | OBSOLETE | - | - | vacuous: the URL carries no schoolId, so the heading can never be present. |

<a id="discover__school-empty-guidance"></a>
### e2e/discover/school-empty-guidance.spec.ts

**Status:** RETIRED_B1 (commit-to-be) | **Tests:** 3 / 3 | **Manifest end-state:** MOVE_DOWN -> `MapEmptyGuidance.test.tsx` (exists) | **MUT:** MUT-03 (RED->GREEN)

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| SEG-1 116-117: school context, zero listings: city-wide banner suppressed | COVERED_EXISTING | MapEmptyGuidance.test.tsx:67 (AC2) | MUT-03 | `MapEmptyGuidance.tsx:93` `if (hasSchoolContext) return null` removed -> 4 `it`s red. |
| SEG-2 132-133: `empty-state-message` contains "No properties found within" | OBSOLETE | successor: SchoolSelectedPanel.test.tsx:362 (`school-radius-empty-state` shown on empty); copy pinned by G3-FOCUS4-COPY SchoolSelectedPanel.test.tsx:373 | MUT-105, MUT-106 (successor copy) | testid `empty-state-message` has zero occurrences in non-test `apps/web/src` at HEAD (re-verified); the live empty state is `SchoolRadiusEmptyState.tsx:67` (`school-radius-empty-state`), copy "No {noun} found within {r} km of {school}" at :76-78. |
| SEG-3 161-165: no school context: no school empty state, no school heading | OBSOLETE | intent: MapEmptyGuidance.test.tsx:108 (AC3 regression: city-wide message still renders) | - | the spec's assertions are vacuous (testid absent, no schoolId); the regression the title names ("banner still shows") is the AC3 `it`, which is checked at HEAD. |

<a id="discover__school-deep-link-error"></a>
### e2e/discover/school-deep-link-error.spec.ts

**Status:** RETIRED_B1 (commit-to-be) | **Tests:** 3 / 3 | **Manifest end-state:** MOVE_DOWN -> `MapDiscovery.school-deep-link.test.tsx` (exists) | **MUT:** MUT-04 + RECHECK-PROBE-3/4

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| DL-ERR-1 109-115: 500 clears schoolId and shows a destructive toast | COVERED_EXISTING | MapDiscovery.school-deep-link.test.tsx:163 (+184 network error) | MUT-04 (clear removed); PROBE-3a (toast removed) | both legs discriminated: MUT-04 turns the 500 + network `it`s red; PROBE-3a (`toast(` disabled at `useDiscoverJourneyTransitions.ts:533`) turns the same two red. |
| DL-ERR-2 132-137: 404 clears schoolId silently, no toast | COVERED_EXISTING | MapDiscovery.school-deep-link.test.tsx:204 | PROBE-3b (toast added on 404), PROBE-3c (404 no longer clears) | each mutation turns exactly this `it` red. |
| DL-OK-1 159-164: 200 keeps schoolId, no toast | COVERED_EXISTING | MapDiscovery.school-deep-link.test.tsx:222 | PROBE-4 (error effect fires on success) | turns exactly this `it` red. |

<a id="issue-2767-udupi-school-area-schoolareakey"></a>
### e2e/issue-2767-udupi-school-area-schoolareakey.spec.ts

**Status:** RETIRED_B1 (commit-to-be) | **Tests:** 1 / 1 | **Manifest end-state:** MOVE_DOWN -> `useDiscoverMapDataController.schoolAreaKey2767.test.ts` (exists) | **MUT:** MUT-05 + RECHECK-PROBE-1

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| 208-218, 250-255: listings request carries literal `schoolAreaKey`, school params, no `areaBbox`, no `polygon` | COVERED_EXISTING | useDiscoverMapDataController.schoolAreaKey2767.test.ts:134 (wire), :122 (effective filters), :163 (stale key never reused); discoverSearchParams.test.ts:126 | MUT-05 (injection removed -> 4 `it`s red) | trust-boundary property covered at controller and serializer level. |
| 211: `schoolAreaKey` single-valued (`getAll` equals `[KEY]`) | COVERED_EXISTING | discoverSearchParams.test.ts:322 (`guard against vacuous parity assertion`: `getAll('schoolAreaKey')` equals `['IN\|KA\|Udupi\|Manipal']` through the real listings hook) | RECHECK-PROBE-1 | the cited 2767 `it`s use `get`/`contains` and stay green if the key is emitted twice; PROBE-1 (`set` -> double `append` at `discoverSearchParams.ts:152`) is caught ONLY by discoverSearchParams.test.ts:322. Citation added at this re-check. |
| 248, 260-262: heading renders; response not 400 | COVERED_EXISTING | same as row 1 | MUT-05 | the stub 400s only on polygon/areaBbox, so "not 400" is equivalent to "no polygon / areaBbox sent". |

<a id="discover__school-panel-error-states"></a>
### e2e/discover/school-panel-error-states.spec.ts

**Status:** RETIRED_B1 (commit-to-be) | **Tests:** 3 / 3 | **Manifest end-state:** DELETE_OBSOLETE (R6; manifest MOVE_DOWN was wrong) | **MUT:** none (no destination)

| assertion | verdict | destination | MUT | reasoning (citations re-verified at HEAD) |
|---|---|---|---|---|
| ERR-1 118-120: `popular-schools-error-state`, "could not load popular schools", retry | OBSOLETE | none | - | URL `/discover?journey=school-first&city=udupi` is node level: `useDiscoverNavigationController.ts:99` `isSchoolsNavNodeLevel = nav.journey === 'school-first' && !nav.areaKey && !nav.schoolId`; `DiscoverPanelSurface.tsx:82-84` renders `SchoolFirstJourneyPanel` (-> `SchoolsNavigationJourneyPanel`) for it. `popular-schools-error-state` exists only at `SchoolBrowsePanel.tsx:304`, which is rendered only via `SchoolJourneyPanel.tsx:96,138` (legacy bridge). |
| ERR-2 136-138: `discover-areas-error-state`, "could not load school areas", retry | OBSOLETE | none | - | `discover-areas-error-state` only at `SchoolBrowsePanel.tsx:411`; same unreachability. |
| ERR-3 151-156: popular school + `area-card` render, no false error | OBSOLETE | none | - | `area-card` only at `AreaCard.tsx:18`, whose only importer is `SchoolBrowsePanel.tsx`. |

Note (not a loss of this spec): whether the live node shell has its own error state is a separate product question (plan Q6c, dead-code/legacy follow-up); no test asserts it today and this spec never did either.

<a id="popular-schools"></a>
### e2e/popular-schools.spec.ts

**Status:** RETIRED_B1 (commit-to-be) | **Tests:** 2 / 2 | **Manifest end-state:** DELETE_OBSOLETE (R6; manifest MOVE_DOWN was wrong) | **MUT:** G2-N4 MUT-49/MUT-51 for the live successor

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| setup 176-179: journey card click writes `journey=school-first` | COVERED_EXISTING | JourneySwitcher.test.tsx:61; URL leg: useDiscoverUrlState.test.ts:905-914 (`setJourney('school-first')` -> `journey` is `school-first`); canonical T7 `e2e/canonical/discover-school-first.canonical.ts:51` (real backend, lands on the school-first shell via `page.goto` to `journey=school-first`; NOTE: T7 navigates by URL, it is not a journey-card click, so the click itself rests on JourneySwitcher.test.tsx:61) | - | check mark at HEAD (C0 PASS). |
| setup 181-183: heading "Popular schools" | OBSOLETE | none | - | "Popular schools" is rendered only by `SchoolBrowsePanel.tsx:320` (unreachable at node level, same citation as above) and by `PopularSchoolsGrid.tsx:81,102`, which is mounted only inside `NearSchoolSheet` (`DiscoverOverlaySurface.tsx`, opens on an explicit near-school action, not on the journey-card path this spec drives). |
| cards 206-215: popular card name/board/address; no listing-count badge | OBSOLETE | none | - | popular list unreachable; the #968 "no count" constraint is contradicted by current source: `PopularSchoolCard.tsx:61-63` renders "{n} listings nearby" when `nearbyListingCount > 0`, and `PopularSchoolCard.test.tsx:65` asserts the count badge renders; school cards also show "N homes within X km" (SchoolsInAreaPanel.school-first-redesign.test.tsx:271 is the live "View homes" CTA card). |
| click 231-232: popular card click writes `schoolId` + `radiusKm=3` | OBSOLETE | live successor: SchoolsNavigationJourneyPanel.test.tsx:244,257 | MUT-49, MUT-50, MUT-51 | the live node-shell search-result card calls `setSchoolJourney` with exactly `{schoolId, radiusKm:3, lat, lon, zoom, areaKey}` (G2-N4, check mark at HEAD, 8/8 in file). |

---


## B. Agri specs (10)

Sources: `investigation/map-G1-agri.md` (base citations, shifted to HEAD here), new tests `evidence/b1/G1-tests.md`. History PUSH/REPLACE rows (G1-N3) use a declarative `MemoryRouter` with `useNavigate()(-1/1)`; each is mutation-proven by flipping the replace flag.

<a id="agri-destination-identity-2151"></a>
### e2e/agri-destination-identity-2151.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 8 textual / 15 runtime (desktop+mobile) | **Manifest end-state:** MOVE_DOWN -> `agriculturalUrlDomain.test.ts` | **MUT:** MUT-17..25, 26

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| (a) 318, 283-294, 324-335: landing list, corridor click writes region+maxKm, row click writes destKey, header = displayName, 2 parcel rows | COVERED_EXISTING | DiscoverRightPanel.agriLanding.test.tsx:149; useDiscoverUrlState.test.ts:2723-2734; DiscoverRightPanel.agriCorridor.test.tsx:190-200; AgriGroupSelectedPanel.test.tsx:391-403; agriculturalUrlDomain.test.ts:146-163; AgriGroupLocalityPanel.test.tsx:131-135; DiscoverRightPanel.agriGroupPeek.test.tsx:263-281 | - | C0 PASS / PASS-RF (file-level red `it`s unrelated). |
| (b) 381-384: row entry and direct destKey URL fetch the same singular `areaKey` | COVERED_EXISTING | useDiscoverAgriController.test.ts:125-138; useAgriMapListings.test.ts:219,222-232 | - | C0 PASS. |
| (b-desktop) 410-431: parcel-marker click selects the same listing as a row click | COVERED_NEW | PropertyMap.agri.test.tsx:642 | MUT-26 | legacy test self-returned when no marker was reachable (never falsifying); the new `it` asserts the marker click calls `onSelectListing` with that listing once. |
| (c) 441-465: direct destKey URL + reload restore panel, name, rows; URL not rewritten | COVERED_EXISTING | agriculturalUrlDomain.test.ts:165-170,180-185; DiscoverRightPanel.agriGroupPeek.test.tsx:277-278 | - | C0 PASS-RF. |
| (d) 477-499: close removes destKey with REPLACE, keeps region+maxKm; Back after row PUSH drops destKey, Forward restores | COVERED_NEW | agriculturalUrlDomain.test.ts:301; agriculturalUrlDomain.test.ts:311 | MUT-18, MUT-19 | no earlier test discriminated PUSH from REPLACE (D6). |
| (e) 519-538: Level-3 request carries areaKey; rows == fetched count; row click shows peek | COVERED_EXISTING | AgriGroupLocalityPanel.test.tsx:131-135,158-173; DiscoverMapCanvas.test.tsx:929; useDiscoverUrlState.test.ts:2653-2663; AgriGroupListingPeek.test.tsx:95-98 | - | C0 PASS-RF. |
| (f) 576-604: legacy area_key-shaped `locality=` migrates once; never resurrected | COVERED_EXISTING | agriculturalUrlDomain.test.ts:61-72,108-135,146-163 | - | C0 PASS. |
| (g) 615-636: raw `IN\|KA...` key never visible (header, Level-2 rows, peek) | COVERED_NEW | AgriGroupSelectedPanel.test.tsx:410; AgriGroupListingPeek.test.tsx:133; header DiscoverRightPanel.agriGroupPeek.test.tsx:279-280 | MUT-24, MUT-25 | the pre-existing Level-2 test is containment-only and stayed green under MUT-24; the new one is exact-text + negative. |
| 255-277: readiness gates (`.leaflet-container` / panel visible); 548-564 advisory `console.log` marker presence | OBSOLETE | - | - | readiness waits and a never-asserted log line, not properties. |

<a id="broker-agri-listing"></a>
### e2e/broker-agri-listing.spec.ts

**Status:** KEPT_PR7 (AC4 >100 km^2 402: rejected PUT leaves the boundary unchanged); manifest row SCHEDULED(PR-7) | **Tests:** 4 / 6 (AC4 is a 3-case loop) | **Manifest end-state:** MOVE_DOWN (was CANONICAL_GAP_CLOSED) | **MUT:** MUT-43, MUT-44, MUT-45 | backend IT executed: `Tests run: 4, Failures: 0` (G1-tests.md)

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC1 239: edit-listing `?step=4` for an agri draft mounts the boundary step | COVERED_NEW | EditListing.agri.test.tsx:269 (+ controls EditListing.agri.test.tsx:287, EditListing.agri.test.tsx:299) | MUT-43, MUT-44 | AG1 does not visit step 4. |
| AC1 240; AC2 271-283: disclaimer, computed + declared area text | COVERED_EXISTING | BoundaryDrawStep.test.tsx:94,211-230 | - | C0 PASS. |
| AC2 256-265: valid boundary PUT 200, persisted, computed area | COVERED_EXISTING | AgriListingBoundaryJourneyIT.java:204-226; ListingResponseMapperTest.java:871-880 | - | backend. |
| AC3 301-330: pre-submit PUT, submit -> PENDING_REVIEW, boundary survives, listed in /mine | COVERED_EXISTING | canonical AG1 `agri-lifecycle.canonical.ts:112-137`; AgriListingBoundaryJourneyIT.java:216-226 | - | canonical journey + IT. |
| AC4 bowtie 389,397: 422 BOUNDARY_INVALID_GEOMETRY | COVERED_EXISTING | AgriListingBoundaryJourneyIT.java:234-245; ListingControllerTest.java:1513-1518 | - | |
| AC4 London 389,397,402: 422 OUTSIDE_INDIA and boundary left unset | COVERED_NEW | AgriListingBoundaryJourneyIT.java:262; PolygonBoundaryValidatorTest.java:145; ListingControllerTest.java:1534-1539 | MUT-45 | |
| AC4 >100 km^2 389,395: 422 `BOUNDARY_*` | COVERED_EXISTING | PolygonBoundaryValidatorTest.java:174 (BOUNDARY_TOO_LARGE) + 422 envelope above | - | |
| AC4 >100 km^2 402: rejected PUT leaves the boundary unchanged | **UNCOVERED** | - | - | only the bowtie (existing) and London (G1-N12) assert "boundary unset"; the too-large case is not asserted anywhere. One additional `@Test` would close it (G1-tests.md note 6). Spec stays on disk (owner rule). |

<a id="discover-agri-direction-first-1448"></a>
### e2e/discover-agri-direction-first-1448.spec.ts

**Status:** KEPT_PR7 (AC11 776-877 (REAL_SEED): one-click direction, chip switch, peek over a live seeded stack); manifest row SCHEDULED(PR-7) | **Tests:** 12 / 12 | **Manifest end-state:** MOVE_DOWN (was DELETE_DUP; T8/T9 assert far less) | **MUT:** MUT-15, 16, 17, 21, 22, 23, 24, 10/11

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC1 271-299: landing list, one click writes region+maxKm, no intermediate chips | COVERED_EXISTING | DiscoverRightPanel.agriLanding.test.tsx:149; DiscoverRightPanel.agriCorridor.test.tsx:190-200; useDiscoverUrlState.test.ts:2723-2734; discoverPanelState.test.ts:510-516 | - | C0 PASS / PASS-RF. |
| AC2/AC3 318-334, 367-405: chip aria-pressed, chip click writes maxKm, rows stay, destination text has no pipe | COVERED_EXISTING / COVERED_NEW | AgriGroupSelectedPanel.test.tsx:505-533,329-341; AgriGroupSelectedPanel.test.tsx:410 for the no-pipe negative; useDiscoverUrlState.test.ts:2737-2748 | MUT-24 | |
| AC2/3/6 338-347 ... 573-580: sector overlay when agri + region + maxKm (incl. chip switch / cold load) | COVERED_NEW | PropertyMap.agri.test.tsx:365-379 (mount); DiscoverMapCanvas.test.tsx:1002,1014,1026 (gate) | MUT-15, MUT-16 | the value arm (`{N,25}`->`{N,50}`) stays green by design; the null arms pin the gate. |
| AC4 440-494: row click -> `listing=` PUSH, peek; close keeps region, maxKm, destKey | COVERED_NEW | agriculturalUrlDomain.test.ts:319; agriculturalUrlDomain.test.ts:327; AgriGroupLocalityPanel.test.tsx:158-173; AgriGroupListingPeek.test.tsx:280-286,348-356 | MUT-20, 21, 22 | |
| AC5 526-545: browser Back after corridor click -> landing | COVERED_NEW | agriculturalUrlDomain.test.ts:293 | MUT-17 | |
| AC6-AC10 558-699: cold load, legacy `group=`, clear, area-first/school-first exclusivity | COVERED_EXISTING / COVERED_NEW | useDiscoverUrlState.test.ts:2031-2036,useDiscoverUrlState.test.ts:1809-1830,useDiscoverUrlState.test.ts:2683-2697; discoverPanelState.test.ts:38-40,542-557; canonical T8/T9; overlay null: DiscoverMapCanvas.test.tsx:1026 | MUT-15 | |
| AC12 731-741: anon + null price -> peek sign-in label | COVERED_EXISTING | AgriGroupListingPeek.test.tsx:299-307 | - | label-only (R4 INFO finding: price rendered with no auth check if `pricePaise` is non-null; server withholds it, `security-reviewer.toml` finding 1). |
| AC11 776-877 (REAL_SEED): one-click direction, chip switch, peek over a live seeded stack | **UNCOVERED** | - | - | Level-3 locality/peek over REAL backend rows is asserted nowhere (T8 = Level-2, AG3 = API). Not closable inside PR-3 (needs a canonical extension). Owner Q3. |

<a id="discover-agri-grouped-journey-1412"></a>
### e2e/discover-agri-grouped-journey-1412.spec.ts

**Status:** KEPT_PR7 (weak: AC3 504-507: regional-area-groups fired with city + `propertyType=agricultural_land`); manifest row SCHEDULED(PR-7) | **Tests:** 12 / 12 | **Manifest end-state:** DELETE_OBSOLETE (was DELETE_DUP T9) + 3 new `it`s | **MUT:** MUT-10, 11, 37, 40

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC1 380-390: `agri-regional-groups` list | OBSOLETE | - | - | `AgriRegionalGroupsPanel` is unmounted; `AgriJourneyPanel.tsx:96-119` renders `CorridorLandingPanel` for `agri-landing`. |
| AC2 x3 407-483: `group=DIR:BAND` write / clear / Back-Forward | OBSOLETE | modern replacement: canonical T9 `discover-agri-first.canonical.ts:139-161` | - | `group=` is migrated away on mount (`agricultural.ts:156-185`). |
| AC3 504-507: regional-area-groups fired with city + `propertyType=agricultural_land` | COVERED_EXISTING (weak) | useDiscoverAgriController.test.ts:152-160 (called with city); useRegionalAreaGroups.test.ts (query key) | - | request-URL line for `agricultural_land` was not opened at map time; re-verify at B2. |
| AC3 515-518: agri-map-listings fires with `areaKeys=` | OBSOLETE | - | - | `areaKeys=` removed; `useAgriMapListings.test.ts:222-232` asserts the opposite (singular `areaKey`). |
| AC3 521: anon `/api/discover/markers` never fires | COVERED_NEW | useDiscoverMapDataController.test.ts:1388 | MUT-10 | R4. |
| AC4 573-578: agri-selected card click navigates to `/listing/:id` | COVERED_NEW | DiscoverRightPanel.routing.test.tsx:850 | MUT-40 | |
| AC5/AC5b/AC6 602-686, 798-803: AgriSpecRows fields, disclaimer, boundary path on the detail page | OBSOLETE | - | - | agri routes to `AgriListingDetail` (`ListingDetail.tsx:198,237-280`); `agri-survey-number` / `agri-land-area` / `agri-boundary-disclaimer` are not rendered for agri. The live page's fields never had a test: follow-up (plan Q4), not a loss caused by PR-3. |
| AC4+AC5 authed 756-782: polygon click -> panel -> CTA -> `/listing/:id` | COVERED_EXISTING / COVERED_NEW | PropertyMap.agriPolygon.test.tsx:307-324; AgriListingPanel.test.tsx:160-162,227-241; DiscoverRightPanel.agriGroupPeek.test.tsx:392; AgriSpecRows tail OBSOLETE | MUT-37 | |
| AC10/11 860-891 (REAL_SEED): live groups + `group=` + `areaKeys=` | OBSOLETE | - | - | all three contracts removed. |

<a id="discover-agri-journey-1375"></a>
### e2e/discover-agri-journey-1375.spec.ts

**Status:** KEPT_PR7 (AC6 709-741: browser Back from `/listing/:id` restores journey/city/areaKey; weak: AC9 763-768: agri-first shows no school panels); manifest row SCHEDULED(PR-7) | **Tests:** 9 / 9 | **Manifest end-state:** MOVE_DOWN (was DELETE_DUP T8) | **MUT:** MUT-10, 11, 13, 14, 23, 27, 28, 37, 40

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC1+AC2 431-447: journey card, landing list, intro copy | COVERED_EXISTING / COVERED_NEW (weak: copy only) | JourneySwitcher.test.tsx:12,103; DiscoverRightPanel.agriLanding.test.tsx:149; copy DiscoverRightPanel.agriLanding.test.tsx:159 | MUT-41, MUT-42 | N10 pins the copy only; it is not coverage for the journey rows. |
| AC3-5 484-505: agri-selected summary, count, acreage, list | COVERED_EXISTING | DiscoverRightPanel.routing.test.tsx:818-820,DiscoverRightPanel.routing.test.tsx:845,DiscoverRightPanel.routing.test.tsx:949 | - | |
| AC6+11 529-545: markers fire for agri-first + auth + zoom>12 with `propertyTypes=agricultural_land`; agri cluster, no residential cluster | COVERED_NEW | useDiscoverMapDataController.test.ts:1279; PropertyMap.agri.test.tsx:688 | MUT-11, MUT-27, MUT-28 | |
| AC7/AC8 580-654: polygon at zoom>=16, polygon click panel, CTA, card click | COVERED_EXISTING / COVERED_NEW | PropertyMap.agriPolygon.test.tsx:239-265,PropertyMap.agriPolygon.test.tsx:307-324; DiscoverRightPanel.agriGroupPeek.test.tsx:392; DiscoverRightPanel.routing.test.tsx:850 | MUT-37, MUT-40 | |
| AC9 763-768: agri-first shows no school panels | COVERED_EXISTING (weak) | discoverPanelState.test.ts:43-49 | - | the two `toHaveCount(0)` halves on `school-selected-panel` / `school-browse-panel` are vacuous (testids absent from `apps/web/src`). |
| AC10 834-842: area-first residential cluster, no agri cluster, no polygon | COVERED_NEW | PropertyMap.agri.test.tsx:715; PropertyMap.agriPolygon.test.tsx:337 | MUT-28 | |
| AC6 709-741: browser Back from `/listing/:id` restores journey/city/areaKey | **UNCOVERED** | - | - | hard-coded `http://localhost:5174` (env-failing, not obsolete); the full-page history restore is live and tested nowhere. Owner Q4/Q5. |

<a id="discover-agri-locality-marker-1468"></a>
### e2e/discover-agri-locality-marker-1468.spec.ts

**Status:** KEPT_PR7 (AC9 766-842 (REAL_SEED): live Udupi S/25 towns; drill-in rows >= 1); manifest row SCHEDULED(PR-7) | **Tests:** 10 / 10 | **Manifest end-state:** MOVE_DOWN -> `DiscoverRightPanel.agriGroupPeek.test.tsx` | **MUT:** MUT-24, 36, 18, 19, 21, 22

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC1 366-398: destination rows from agri-destinations; no pipe / `IN\|KA`; legacy row absent | COVERED_EXISTING / COVERED_NEW | AgriGroupSelectedPanel.test.tsx:329-341,428-434; AgriGroupSelectedPanel.test.tsx:410 | MUT-24 | |
| AC2/AC3 431-490: Shirva click writes destKey; locality panel; Level-3 request singular `areaKey`; header; exactly 1 row | COVERED_EXISTING / COVERED_NEW | AgriGroupSelectedPanel.test.tsx:391-403; agriculturalUrlDomain.test.ts:146-163; useDiscoverAgriController.test.ts:125-138; DiscoverRightPanel.agriGroupPeek.test.tsx:263-281; filter DiscoverRightPanel.agriGroupPeek.test.tsx:369 | MUT-36 | |
| AC4/AC5/AC5b 511-600: close removes destKey (REPLACE); cold-load deep link; legacy locality migration | COVERED_NEW / COVERED_EXISTING | agriculturalUrlDomain.test.ts:311,165-178,61-72,108-135; AgriGroupLocalityPanel.test.tsx:121-127 | MUT-19 | |
| AC6/AC7/AC8 627-740: row -> `listing=` PUSH, peek; close keeps destKey; anon price label; area-first exclusivity | COVERED_NEW / COVERED_EXISTING | agriculturalUrlDomain.test.ts:327; AgriGroupListingPeek.test.tsx:299-307; discoverPanelState.test.ts:542-548 | MUT-21, MUT-22 | |
| AC9 766-842 (REAL_SEED): live Udupi S/25 towns; drill-in rows >= 1 | **UNCOVERED** | - | - | drill-in over REAL Level-3 rows is asserted nowhere (T8 town rows = Level-2 only). Owner Q3. |

<a id="discover-agri-overlay-peek-journey-1431"></a>
### e2e/discover-agri-overlay-peek-journey-1431.spec.ts

**Status:** KEPT_PR7 (weak: AC3 481-489: cold-load peek URL; CTA -> `/listing/<id>`); manifest row SCHEDULED(PR-7) | **Tests:** 9 / 9 | **Manifest end-state:** MOVE_DOWN -> `DiscoverMapCanvas.test.tsx` | **MUT:** MUT-15, 16, 17

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC1a/b/c 301-385: overlay absent on landing, present after corridor click, gone after clear; one-click write | COVERED_NEW | DiscoverMapCanvas.test.tsx:1002,1014,1026; DiscoverRightPanel.agriCorridor.test.tsx:190-200; useDiscoverUrlState.test.ts:2186-2197 | MUT-15, MUT-16 | |
| AC2 424-463: peek first-paint fields, lazy media, description, view-details CTA | COVERED_EXISTING | AgriGroupListingPeek.test.tsx:95-117,200-211,242-246,348-356 | - | |
| AC3 481-489: cold-load peek URL; CTA -> `/listing/<id>` | COVERED_EXISTING (weak) | discoverPanelState.test.ts:578-590; AgriGroupListingPeek.test.tsx:269-278 (`onViewDetails(id)`) | - | the `commands.peek.viewDetails` -> navigate wiring is not separately asserted (G1-N8 agri-detail is the `agri-detail` panel CTA, not the peek). Re-verify at B2. |
| AC4 516-613: Back/Forward ladder built from full `page.goto` loads, panel per rung, overlay per rung | COVERED_EXISTING / COVERED_NEW | discoverPanelState.test.ts:38-40,510-516,564-575,578-590; overlay per rung DiscoverMapCanvas.test.tsx:1002,1014,1026 | MUT-15, MUT-16 | rungs are cold loads, so app PUSH semantics are not what this test exercises. |
| AC5/AC5b 628-651: area-first / school-first: no overlay, no peek | COVERED_EXISTING / COVERED_NEW | discoverPanelState.test.ts:542-557; DiscoverMapCanvas.test.tsx:1026 | MUT-15 | |
| AC6 679-754 (REAL_SEED): `corridor-distance-chips` visible after a card click | OBSOLETE | contradiction: 1448 AC1 :299 asserts the chips must NOT appear (one-click flow, `DiscoverRightPanel.agriCorridor.test.tsx:190-200` + `setRegionWithMaxKm` default 25) | - | the asserted two-step flow was replaced by one-click behaviour; product-source citation of the one-click path to be re-verified at B2. |

<a id="discover-agri-polygons-1373"></a>
### e2e/discover-agri-polygons-1373.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 6 / 6 | **Manifest end-state:** MOVE_DOWN -> `PropertyMap.agriPolygon.test.tsx` | **MUT:** MUT-28, MUT-29, MUT-10/11

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC1 310-322; AC5 357-366: polygon at zoom>=16, none below, marker/cluster still present | COVERED_EXISTING | PropertyMap.agriPolygon.test.tsx:239-265,PropertyMap.agriPolygon.test.tsx:225-237; PropertyMap.agri.test.tsx:168-177 | MUT-29 | |
| `.leaflet-overlay-pane path` count after zoom | COVERED_NEW | PropertyMap.agriPolygon.test.tsx:358 | MUT-29 | CoK closed: the new `it` asserts 0 polygons at zoom 15 and exactly 2 at zoom 16 from the same props; MUT-29 turns it and the existing zoom `it` red. Leaflet SVG paint itself is library behaviour (D8a). |
| AC4 397-406; AC3 438-470: no boundary -> no polygon; polygon click selects | COVERED_EXISTING | PropertyMap.agriPolygon.test.tsx:273-299,PropertyMap.agriPolygon.test.tsx:307-324; PropertyMap.agri.test.tsx:326-343 | - | |
| AC9 497-504: markers fire in agri-first with `propertyTypes=agricultural_land` | COVERED_NEW | useDiscoverMapDataController.test.ts:1279; useDiscoverFilteredMarkers.test.ts:77-90 | MUT-11 | |
| AC6 563-579: area-first residential cluster, no agri cluster, no polygon | COVERED_NEW | PropertyMap.agri.test.tsx:715; PropertyMap.agriPolygon.test.tsx:337 | MUT-28 | |

<a id="discover-agri-price-gate-1551"></a>
### e2e/discover-agri-price-gate-1551.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 6 / 6 | **Manifest end-state:** RETIRED, MOVE_DOWN -> `apps/web/src/components/discover/__tests__/DiscoverRightPanel.agriGroupPeek.test.tsx` | **MUT:** MUT-34, 35, 38, 39 (guards), MUT-32, 33 (CoK)

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC-ANON 507-524: anon locality card shows Lock + "Sign in to view price", no price | COVERED_EXISTING | AgriGroupLocalityPanel.test.tsx (panels/__tests__):243-255; AgriGroupLocalityPanel.test.tsx (panels):69-85 | MUT-38 (4 red) | guard `AgriGroupLocalityPanel.tsx:677`. |
| AC-AUTHED 566-577: authed: no Lock, price present | COVERED_EXISTING | AgriGroupLocalityPanel.test.tsx (panels/__tests__):257-263 | MUT-39 (5 red) | |
| `isAuthenticated` threaded from the journey to the card (the original #1551 bug) | COVERED_NEW | DiscoverRightPanel.agriGroupPeek.test.tsx:350,DiscoverRightPanel.agriGroupPeek.test.tsx:359 | MUT-34, MUT-35 | `AgriJourneyPanel.tsx:172` flipped to `{false}` / `{true}`. |
| backend: anon projection withholds price | COVERED_EXISTING | DiscoverAgriMapListingsServiceTest.java:278-359 (anon null) + :317-333 (authed control); DiscoverAgriMapListingsControllerIT.java:136-184 | - | `gates/security-reviewer.toml` anon_agri_price_withheld = YES. The peek renders price with no frontend auth check (INFO): server projection is the only control. |
| AC-CHIPS 600-615: #1551 field labels on the card | COVERED_EXISTING | AgriGroupLocalityPanel.test.tsx (panels):112-170 | - | |
| AC-MKR 676-692: authed school-first + schoolId + bounded search -> property markers; school circle coexists | COVERED_NEW | markers gate useDiscoverMapDataController.test.ts:1319,useDiscoverMapDataController.test.ts:1306; coexistence PropertyMap.agri.test.tsx:605 | MUT-10, MUT-12, MUT-32, MUT-33 | CoK closed: one school circle (2000 m) AND the residential layer with one marker at the listing coordinates are mounted together; each arm mutation-proven. Canvas overlap/visibility is geometry (D8b) and is not asserted. |
| AC-ZOOM 727-758: user zoom not snapped back (#1547) | COVERED_EXISTING | useDiscoverCameraOrchestration.test.tsx:164-194 | - | |
| AC-AREA 782-788: area browse renders >= 1 listing card | COVERED_EXISTING | canonical T6 `discover-area-first.canonical.ts:141-169` | - | |

<a id="verify-agri-clusters-1372"></a>
### e2e/verify-agri-clusters-1372.spec.ts

**Status:** KEPT_PR7 (AC7 266-273: area-first authed markers fire); manifest row SCHEDULED(PR-7) | **Tests:** 3 / 3 | **Manifest end-state:** MOVE_DOWN -> `PropertyMap.agri.test.tsx` | **MUT:** MUT-27, 28, 30, 31, 11

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC7 266-273: area-first authed markers fire | **UNCOVERED** (citation pending) | - | - | the new controller `it`s vary agri-first and school-first only; the controller test's default nav is area-first (`useDiscoverMapDataController.test.ts:106`) so an existing case may cover it, but none is cited. Closes when an `it` is cited and shown to bite. |
| AC7 276-278; AC1/AC4 301-313: residential `.custom-marker-cluster` vs agri `.agri-cluster` exclusivity | COVERED_EXISTING / COVERED_NEW | PropertyMap.agri.test.tsx:212-237,PropertyMap.agri.test.tsx:179-210; exclusivity PropertyMap.agri.test.tsx:688, PropertyMap.agri.test.tsx:715 | MUT-27, MUT-28 | |
| AC5 336-340: agri-first markers request has `propertyTypes=agricultural_land` | COVERED_EXISTING / COVERED_NEW | useDiscoverMapData.markersEnabled.test.ts:209-224; useDiscoverFilteredMarkers.test.ts:77-90; gate useDiscoverMapDataController.test.ts:1279 | MUT-11 | |
| markercluster dissolution at high zoom | COVERED_NEW | PropertyMap.agri.test.tsx:702 | MUT-30, MUT-31 | CoK closed for the product config (`disableClusteringAtZoom:16`, radius 50, spiderfy, zoom-on-click); the library's dissolution behaviour beyond that config is D8a. |

---


## C. School specs, core group (9)

Sources: `investigation/map-G2-school-core.md`, new tests `evidence/b1/G2G3-tests.md`. Facts used: F1 = the node shell is the only live `school-first` panel without `areaKey`/`schoolId` (`useDiscoverNavigationController.ts:99`, `DiscoverPanelSurface.tsx:82-84`), so `SchoolBrowsePanel` (popular list, zone cards, area cards) and `SchoolGroupAreasPanel` are unreachable; F3 = testids `combined-chips`, `clear-school-chip`, `clear-area-chip`, `increase-radius-btn`, `radius-option-*` have zero occurrences in `apps/web/src`; F4 = radius options are [3, 5, 10]; F5 = "Find properties your way" / "Select area" copy is gone; F6 = `setSchoolJourney` deletes `groupId` and is a PUSH.

<a id="discover-school-first-journey"></a>
### e2e/discover-school-first-journey.spec.ts

**Status:** KEPT_PR7 (weak: E2E-2 222-226: area marker badge "N schools"); manifest row SCHEDULED(PR-7) | **Tests:** 16 / 16 | **Manifest end-state:** MOVE_DOWN -> `SchoolsNavigationJourneyPanel.test.tsx` (was DELETE_DUP T7; T7 covers only search render) | **MUT:** MUT-49, 50, 51, 10, 75

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| E2E-1 199,203: journey card visible; click writes `journey=school-first` | COVERED_EXISTING | JourneySwitcher.test.tsx:8,61; useDiscoverUrlState.test.ts:905-914 | - | C0 PASS. |
| E2E-2 222-226: area marker badge "N schools" | COVERED_EXISTING (weak) | AreaMarkerLayer.test.tsx:371-372 | - | rule-level; whether the legacy marker layer still draws at node level is not proven (#2751 candidate). |
| E2E-3 247-249: marker click writes `areaKey=` | OBSOLETE | canonical `node=` write: SchoolFirstJourneyPanel.tsx:96-111 (#2216) | - | probable; citation to be re-read at B2. |
| E2E-3 253-254, E2E-5 298-302, E2E-8 483-485: school-card visible; card click writes `schoolId`; empty by-area state | COVERED_EXISTING | SchoolsInAreaPanel.school-first-redesign.test.tsx:243,SchoolsInAreaPanel.school-first-redesign.test.tsx:278-281; SchoolsInAreaPanel.test.tsx:187 | - | |
| E2E-4 273-278: board chip visible; click writes `board` | COVERED_EXISTING | SchoolsInAreaPanel.school-first-redesign.test.tsx:204,SchoolsInAreaPanel.school-first-redesign.test.tsx:213-218; useDiscoverUrlState.test.ts:1037-1046 | - | |
| E2E-5 305-307, E2E-6 329-333, E2E-7 361: `combined-chips`, `clear-area-chip`, `clear-school-chip` | OBSOLETE | - | - | F3: testids removed (titles already failing, #2751). |
| E2E-6 336,340; E2E-7 365-368: clear school keeps area; cold load keeps journey/areaKey/schoolId/radiusKm | COVERED_EXISTING | useDiscoverUrlState.test.ts:1504-1531,useDiscoverUrlState.test.ts:1683; AreaSchoolCombinedPanel.test.tsx:191; discoverPanelState.test.ts:249,270 | - | PASS-RF files. |
| E2E-9 385-395: search placeholder | COVERED_EXISTING | canonical T7 `discover-school-first.canonical.ts:99` | - | |
| E2E-9 385-395: header "Find homes near a school", popular "Manipal Public School", no "milestone 2"; E2E-10 413-416 popular click; E2E-12 463-467 `area-card` click | OBSOLETE | - | - | F1: `SchoolBrowsePanel` / `AreaCard` unreachable at node level. |
| E2E-11 435-442: search result visible; result click writes `schoolId` | COVERED_EXISTING / COVERED_NEW | canonical T7 `:99-105`; SchoolsNavigationJourneyPanel.test.tsx:244,257 | MUT-49, MUT-50, MUT-51 | exact args `{schoolId, radiusKm:3, lat, lon, zoom, areaKey}`, no `groupId`. |
| E2E-13 506-515: bare `schoolId` -> school-selected: name, radius group | COVERED_EXISTING | discoverPanelState.test.ts:259; SchoolSelectedPanel.test.tsx:139-141,204 | - | |
| E2E-8a/8b 539-579: by-area 500 -> `school-marker-error`; [] -> `school-marker-empty` + warn | COVERED_EXISTING | SchoolMarkerLayer.test.tsx:122-124,140-142,175-177,277 | - | |
| E2E-1118 675-703: cards, markers before/after select, re-goto | COVERED_EXISTING | resolveMarkerListings.test.ts:234,251,451 | - | |
| E2E-1118 695: anon never calls `/api/discover/markers` | COVERED_NEW | useDiscoverMapDataController.test.ts:1319 | MUT-10, MUT-75 | R4 discriminating anon arm with paired authed control. |

<a id="discover-school-journey"></a>
### e2e/discover-school-journey.spec.ts

**Status:** KEPT_PR7 (E2E-7 538: exactly ONE by-area request; E2E-8 612-613: card click writes `schoolId` and `radiusKm=3`; weak: E2E-8 612-613: card click writes `schoolId` and `radiusKm=3`); manifest row SCHEDULED(PR-7) | **Tests:** 10 / 10 (2 `test.skip`) | **Manifest end-state:** MOVE_DOWN -> `useDiscoverSchoolController.test.ts` (was DELETE_DUP T7+T18) | **MUT:** MUT-79, MUT-88..96

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| happy path 237-242: card writes `journey=school-first`; "Popular schools" heading | COVERED_EXISTING / OBSOLETE | JourneySwitcher.test.tsx:61 / (heading) | - | heading: F1. |
| happy path 289-292: popular pick writes `schoolId`, `radiusKm=3` | OBSOLETE | - | - | F1; live successor is G2-N4 (SchoolsNavigationJourneyPanel.test.tsx:244,257). |
| 296-304, 320-335, 357-366: Near-school filter chip; cold-load keeps params; chip clear removes `schoolId`/`radiusKm` | COVERED_EXISTING | MapFilters.test.tsx:305-307; useDiscoverUrlState.test.ts:1683; useDiscoverPageState.test.ts:605-619; useDiscoverListings.test.ts:204,useDiscoverListings.test.ts:227 | - | the `if (listings.lastRequest)` blocks are vacuous for an anon spec (F9); the mapping rule is covered. |
| city change 382-389: `areaKey` cleared on city change | COVERED_EXISTING | useDiscoverUrlState.test.ts:140-150 | - | |
| skip 396-465 (two `test.skip`) | OBSOLETE | - | - | skipped; trigger removed. |
| E2E-7 525-534: "schools in manipal", exactly 2 school-cards | COVERED_EXISTING | SchoolsInAreaPanel.school-first-redesign.test.tsx:196-197,243,247 | - | |
| E2E-7 538: exactly ONE by-area request | **UNCOVERED** | - | - | `useSchoolsByArea` is a hook invoked per render; `toHaveBeenCalledTimes(1)` would count renders, not requests (G2G3-tests.md open item 4). Existing `useDiscoverSchoolController.test.ts:104` pins call args only. |
| E2E-7 549; E2E-8 617,622: no listings request with `schoolLat` | OBSOLETE | - | - | vacuous for anon (F9). |
| E2E-8 612-613: card click writes `schoolId` and `radiusKm=3` | COVERED_EXISTING (weak) | schoolId: SchoolsInAreaPanel.school-first-redesign.test.tsx:278-281; node-shell path: SchoolsNavigationJourneyPanel.test.tsx:244,257 | MUT-49 | **UNCOVERED part:** `radiusKm=3` on the schools-in-area card path is asserted only with `objectContaining({schoolId})` (G2G3-tests.md open item 3). |
| E2E-9 652-661: area-first: 0 school-cards; 0 by-area calls without a canonical leaf | COVERED_EXISTING / COVERED_NEW | discoverPanelState.test.ts:166; canonical T18 `panel-exclusivity.canonical.ts:97-109`; useDiscoverSchoolController.test.ts:134,154 | MUT-79 | since #2124 a canonical AREA leaf does fetch; the `it` pairs a guard arm and a control arm. |
| #1142 703-713: Start Over clears `schoolId`/`radiusKm` | COVERED_NEW | useDiscoverUrlState.test.ts:1120; useDiscoverJourneyTransitions.test.tsx:120-154 | MUT-88..MUT-96 | the C0 cited `it` (`:1036`) is stale-red (journey null vs virtual area-first, #2088) and is NOT counted; R-1 replaces it (every key dropped individually, plus city). |
| #1142 721-731: "Find properties your way" heading | OBSOLETE | - | - | F5. |

<a id="discover-school-selected"></a>
### e2e/discover-school-selected.spec.ts

**Status:** KEPT_PR7 (weak: E2E-6 325-326: URL keeps `schoolId`/`radiusKm` alongside `type=house`); manifest row SCHEDULED(PR-7) | **Tests:** 6 / 6 | **Manifest end-state:** MOVE_DOWN -> `useDiscoverListings.test.ts` (was DELETE_DUP T7; T7 never sets `schoolId`) | **MUT:** MUT-76, 77, 86, 87

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| E2E-1 190-195: name heading, board badge "CBSE" | COVERED_EXISTING | SchoolSelectedPanel.test.tsx:139-146 | - | PASS-RF file. |
| E2E-1 198-205: `radius-btn-1/2` visible, 1 inactive | OBSOLETE | radius 3/5 active state: SchoolSelectedPanel.test.tsx:204,216-218 | - | F4: options are [3, 5, 10]. |
| E2E-2 220-233: click 5 -> `radiusKm=5` in URL; listings request `schoolRadiusKm=5` | COVERED_EXISTING | SchoolSelectedPanel.test.tsx:224-226; useDiscoverUrlState.test.ts:1670-1681; useDiscoverListings.test.ts:204 | - | |
| E2E-3 253-262: `increase-radius-btn` -> radius 5 | OBSOLETE | successor "Try 5 km": SchoolSelectedPanel.test.tsx:385-399 | - | F3. |
| E2E-4 282-290: exactly one dashed circle | COVERED_EXISTING | PropertyMap.schoolCircle.test.tsx:156,161-167 | MUT-104 | Leaflet SVG pixels not asserted (D8a); the circle count is pinned. |
| E2E-6 310-322: ONE listings request carries school coords + radius 3 + `propertyTypes=house` | COVERED_NEW | useDiscoverListings.test.ts:258 | MUT-76, MUT-77 | |
| E2E-6 325-326: URL keeps `schoolId`/`radiusKm` alongside `type=house` | COVERED_EXISTING (weak) | useDiscoverUrlState.test.ts:1683 | - | co-presence with `type` is not asserted; the params parse independently. Gate must accept or add one `it`. |
| E2E-5 342-352: no `radiusKm` -> 3 active; listings use 3 | COVERED_EXISTING / COVERED_NEW | SchoolSelectedPanel.test.tsx:236-238; useDiscoverPageState.test.ts:397,415 | MUT-86, MUT-87 | useDiscoverPageState.test.ts cannot run whole-file (one pre-existing `it` at :632 OOMs, #2813): evidence is by-name / excluded-run only. |

<a id="discover-school-first-grouping-1485"></a>
### e2e/discover-school-first-grouping-1485.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 12 / 12 | **Manifest end-state:** RETIRED, DELETE_OBSOLETE (R6, was MOVE_DOWN), destination none (R6 obsolete: zone/L2 levels unreachable) | **MUT:** MUT-97, 88..96, 59/60

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC1 182; AC8 363-365: search placeholder; invalid groupId shows the search shell | COVERED_EXISTING | canonical T7 `:99` | - | |
| AC1 185-193, AC2 204-241, AC5 L2->L1 314-322, AC9 371-388: zone cards, L2 list, popular card, "Select area" | OBSOLETE | - | - | F1/F5: zone/L2 levels unreachable; `groupId` is ignored by the gate at `useDiscoverNavigationController.ts:99`. |
| AC3 249-258: L2 row click writes `areaKey`; "Schools in Manipal" | OBSOLETE (entry) / COVERED_EXISTING (render) | SchoolsInAreaPanel.school-first-redesign.test.tsx:196-197 | - | |
| AC4 267-284: school click writes `schoolId`; `areaKey` kept; `groupId` kept | COVERED_EXISTING / OBSOLETE | SchoolsInAreaPanel.school-first-redesign.test.tsx:278-281; school.setSchoolJourney.test.ts:44; discoverPanelState.test.ts:270 | - | `groupId` kept is OBSOLETE: the product now deletes it on school select (F6, school.setSchoolJourney.test.ts:47-69). |
| AC5 L4->L3 295-308: Back clears `schoolId` only; `groupId` kept | COVERED_EXISTING / COVERED_NEW | useDiscoverJourneyTransitions.test.tsx:156-174; useDiscoverUrlState.test.ts:1549 | MUT-97 | |
| AC5 L3->L2 328-340: Back clears `areaKey`, keeps `groupId` | COVERED_NEW / OBSOLETE | useDiscoverJourneyTransitions.test.tsx:576 | MUT-59, MUT-60 | L2 list OBSOLETE (F1). |
| AC6 346-355: Start Over clears journey/groupId/areaKey | COVERED_NEW / OBSOLETE | useDiscoverUrlState.test.ts:1120 | MUT-88..MUT-96 | "Find properties your way" OBSOLETE (F5). |

<a id="discover-school-first-hardening"></a>
### e2e/discover-school-first-hardening.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 7 / 7 | **Manifest end-state:** MOVE_DOWN -> `ActiveContextChips.test.tsx` | **MUT:** MUT-48, 52..58, 88..96

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| HRD-1..3 205-244: `active-chip-board-cbse`, `active-chip-category-secondary`, both | COVERED_NEW | ActiveContextChips.test.tsx:501,508,515; useDiscoverFilterChromeController.area2459.test.tsx:188 | MUT-52, 53, 55 | URL-authoritative wiring. Residual (not asserted): that `SchoolsInAreaPanel` mounts the chips element (`SchoolJourneyPanel.tsx:184`). |
| HRD-4 262-269: dismiss removes `board` from the URL | COVERED_NEW / COVERED_EXISTING | ActiveContextChips.test.tsx:515; useDiscoverFilterChromeController.area2459.test.tsx:199,207; useDiscoverUrlState.test.ts:1025-1034 | MUT-54, 56, 57, 58 | |
| HRD-6 287-292: chips on first paint; params not reset | COVERED_NEW / COVERED_EXISTING | as HRD-1..3; useDiscoverPageState.test.ts:598-603; useDiscoverUrlState.test.ts:764 | MUT-55 | |
| HRD-5 331-346: board survives school selection | COVERED_NEW | school.setSchoolJourney.test.ts:138 | MUT-48 | |
| HRD-5 349-351: `clear-school-chip` visible | OBSOLETE | - | - | F3 (title cannot pass today). |
| HRD-5 354-360: clear keeps board and `areaKey` | COVERED_EXISTING | useDiscoverPageState.test.ts:605-623; useDiscoverUrlState.test.ts:1519-1531 | - | by-name evidence only for the page-state file. |
| HRD-7 381-406: Start Over clears journey/areaKey/board/category, keeps city | COVERED_NEW | useDiscoverUrlState.test.ts:1120 | MUT-88..MUT-96 | the C0 cited `:1036` / `useDiscoverPageState.test.ts:625` are stale-red and not counted. |

<a id="discover-school-first-markers"></a>
### e2e/discover-school-first-markers.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 5 / 5 | **Manifest end-state:** MOVE_DOWN -> `school.setSchoolJourney.test.ts` | **MUT:** MUT-46, 105, 106, 10/75

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| FOCUS-1 269-272: exactly one `.school-pin` when `schoolId` set | COVERED_EXISTING | SchoolMarkerLayer.test.tsx:412 | - | |
| FOCUS-2 304-305: >= 1 property marker (anon school-radius source) | COVERED_EXISTING | resolveMarkerListings.test.ts:234 | - | |
| FOCUS-2 309-311, FOCUS-3 338-342, FOCUS-4 383-386: `combined-chips`, `clear-school-chip` | OBSOLETE | - | - | F3. |
| FOCUS-3 346-353: clear school keeps `areaKey`, school-cards return | COVERED_EXISTING | useDiscoverUrlState.test.ts:1504-1531; discoverPanelState.test.ts:249 | - | |
| FOCUS-4 390: empty radius copy `/no properties/i` | OBSOLETE (copy) / COVERED_NEW (successor) | SchoolSelectedPanel.test.tsx:373; SchoolRadiusEmptyState.tsx:76-78 | MUT-105, MUT-106 | `/no properties/i` no longer exists in the school empty state; the new `it` pins the current copy (buy/rent) and asserts the old phrase is absent. |
| BACK-1 436-443: school select is a PUSH; Back drops `schoolId`, keeps `areaKey` | COVERED_NEW | school.setSchoolJourney.test.ts:104 | MUT-46 | |

<a id="school-first-back-nav"></a>
### e2e/school-first-back-nav.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 5 / 5 | **Manifest end-state:** RETIRED, MOVE_DOWN -> `apps/web/src/features/discover/state/url/__tests__/school.setSchoolJourney.test.ts` | **MUT:** MUT-46, 47, 59, 60, 65, 66, 88..96

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| BN-1 148-152: back chevron present at L2 | COVERED_NEW | SchoolSelectedPanel.test.tsx:186,195 | MUT-65, MUT-66 | present arm and absent arm each mutation-proven (one arm red per mutation). |
| BN-1 157-164, BN-2 190-194: Back clears `schoolId`/`radiusKm` (then `areaKey`), keeps journey/city | COVERED_EXISTING | useDiscoverJourneyTransitions.test.tsx:156-174; useDiscoverUrlState.test.ts:1504-1545,useDiscoverUrlState.test.ts:1588-1628 | - | |
| BN-2 181-185: back chevron at L1 | COVERED_NEW | useDiscoverJourneyTransitions.test.tsx:576; SchoolSelectedPanel.test.tsx:186,195 | MUT-59, 60, 65, 66 | |
| BN-3 207-213: no back chevron at L0 | COVERED_EXISTING / COVERED_NEW | useDiscoverJourneyTransitions.test.tsx:544-548; SchoolSelectedPanel.test.tsx:195 | MUT-66 | |
| BN-4 234-248: card click writes `schoolId`; browser Back drops it, keeps `areaKey` | COVERED_NEW | school.setSchoolJourney.test.ts:104,school.setSchoolJourney.test.ts:122 | MUT-46, MUT-47 | no earlier test discriminated PUSH from REPLACE (D6). |
| BN-5 269-281: Start Over from L2 clears journey/areaKey/schoolId/radiusKm, keeps city | COVERED_NEW | useDiscoverUrlState.test.ts:1120 | MUT-88..MUT-96 | |

<a id="school-first-map-focus"></a>
### e2e/school-first-map-focus.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 12 / 12 | **Manifest end-state:** MOVE_DOWN -> `useDiscoverMapDataController.test.ts` | **MUT:** MUT-46, 59, 60, 68..71, 108, 109, 10/75

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| MF-1 257-262 popular card writes `schoolId`; MF-2 300-317 `radius-option-*` click; MF-3 363, MF-4 390 `clear-school-chip` | OBSOLETE | - | - | F1 / F3. |
| MF-1/3/4 266-398: map focuses selected school; focus persists / re-fires on radius change | COVERED_EXISTING | MapDiscovery.issue1824-s7.camera.test.tsx:357-376; discoverPanelState.test.ts:270 | - | camera tick is the product property behind the debug-bridge read. |
| MF-5 424-446: card -> `schoolId`; Back drops it, `areaKey` kept; cards again | COVERED_NEW / COVERED_EXISTING | school.setSchoolJourney.test.ts:104; discoverPanelState.test.ts:249 | MUT-46 | |
| MF-6 473-486: `schoolMarkerFocusTick > 0` after listings settle | COVERED_EXISTING | useDiscoverCameraOrchestration.test.tsx:163-193; MapDiscovery.issue1824-s7.camera.test.tsx:381-410 | - | |
| MF-7/8/10 520-725: Back L2->L1, L1->L0, no-areaKey Back: restore ticks | COVERED_EXISTING / COVERED_NEW | useDiscoverJourneyTransitions.test.tsx:156-210,176-188; useDiscoverJourneyTransitions.test.tsx:576 | MUT-59, MUT-60 | |
| MF-9 662-671, MF-12 832-867: CTA -> markers request with exact school coords/radius; every call has `schoolLat` | COVERED_NEW | useDiscoverMapDataController.test.ts:1360,1374,useDiscoverMapDataController.test.ts:1387,1393; SchoolSelectedPanel.test.tsx:502 | MUT-108, MUT-109, MUT-69, MUT-70, MUT-71 | |
| MF-11 772-773: anon: 0 markers requests, 0 HTTP 401 | COVERED_NEW | useDiscoverMapDataController.test.ts:1319; SchoolSelectedPanel.test.tsx:484-491 | MUT-10, MUT-75, MUT-67 | R4: the 401 source is the auth-only markers call. |

<a id="discover-2717-school-filters-touch-target"></a>
### e2e/discover-2717-school-filters-touch-target.spec.ts

**Status:** KEPT_PR7 (194-195: visible chip height < 32 px; 199-201: `::before` hit rect >= 44x44; 208-219: Filters and Start over on one row; 234-243: desktop hit rect equals the visible box, < 32 px); manifest row SCHEDULED(PR-7) | **Tests:** 2 / 4 (viewport loop) | **Manifest end-state:** DELETE_OBSOLETE (R5), owner to accept | **MUT:** none

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| 188,194-195: Filters trigger visible with its label | COVERED_EXISTING | SchoolJourneyPanels.test.tsx:138-140 | - | presence only. |
| 194-195: visible chip height < 32 px | **UNCOVERED** | - | - | geometry; jsdom has no layout (D8b). |
| 199-201: `::before` hit rect >= 44x44 | **UNCOVERED** | - | - | pseudo-element geometry. |
| 208-219: Filters and Start over on one row | **UNCOVERED** | - | - | layout. |
| 234-243: desktop hit rect equals the visible box, < 32 px | **UNCOVERED** | - | - | layout; class-string containment would not prove geometry. |

---

## D. School specs, remainder (20)

Sources: `investigation/map-G3-school-rest.md`, new tests `evidence/b1/G2G3-tests.md` and `evidence/b1/S2-header-test.md`. R4 guards: S1 `useDiscoverMapDataController.ts:262`, S2 `useSchoolRadiusListings.ts:201` (`skipAuth: true`), S3 `SchoolSelectedPanel.tsx:226`.

<a id="discover-anon-school-radius"></a>
### e2e/discover-anon-school-radius.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 5 / 5 | **Manifest end-state:** MOVE_DOWN -> `useDiscoverMapDataController.test.ts` | **MUT:** MUT-10, 75, 72..74, 80, 81, 107, 110, 67

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| SR-1 296-304: anon calls the public endpoint with `schoolLat`, `schoolLon`, `schoolRadiusKm=3` | COVERED_EXISTING / COVERED_NEW | useSchoolRadiusListings.test.ts:123-127; enabled arg useDiscoverMapDataController.test.ts:1417,1426,1434,1442 | MUT-72, 73, 74 | |
| SR-1 310-318: cards from two areaKeys; exactly 2 cards | COVERED_EXISTING | MapDiscovery.anon-school-radius.test.ts:59-63; useSchoolListings.test.ts:102-112; SchoolSelectedPanel.domOrder.test.tsx:97 | - | |
| SR-2 343: `anon-school-radius-limit-note` absent | COVERED_EXISTING | SchoolJourneyPanels.anon-radius-note.test.tsx:123-126 | - | |
| SR-3 383: radius stub returned 200 | OBSOLETE | - | - | tautological (stub always 200). |
| SR-3 392-395: anon pins present (client-derived) | COVERED_EXISTING | MapDiscovery.anon-school-radius.test.ts:239-242; useSchoolListings.test.ts:155-156; resolveMarkerListings.test.ts:234 | - | |
| SR-3 398: **anon: `/api/discover/markers` never fires** | COVERED_NEW | useDiscoverMapDataController.test.ts:1319 (+ paired control useDiscoverMapDataController.test.ts:1306) | MUT-10, MUT-75 | discriminating setup (bounded search triggered, zoom above threshold). MUT-75 removes the `:262` term over the whole file: exactly the 2 anon arms go red. |
| SR-3 399: no 401 anywhere | COVERED_NEW | S1 (above); S2 header leg useSchoolRadiusListings.test.ts:173 | MUT-110 (header), MUT-107 (arg level) | the outgoing request carries no `Authorization` header even with a session token present. |
| SR-4 422-426: hint visible, text "Showing the first 2 homes" | COVERED_NEW / COVERED_EXISTING | DiscoverMapCanvas.test.tsx:1778,1795; MapDiscovery.anon-school-radius.test.ts:120-157 | MUT-80, MUT-81 | |
| AUTH-SR-1 470-472: auth pre-CTA still calls the public endpoint | COVERED_NEW | useDiscoverMapDataController.test.ts:1426 | MUT-73 | |
| AUTH-SR-1 477-478: auth pins visible without CTA | COVERED_EXISTING | useSchoolListings.test.ts:340-365 | - | spec premise stale (pins derive from unstubbed `/api/discover/listings` since #2184), so this title depends on a live backend. |
| S3: anon bounded-search CTA hidden (defence in depth) | COVERED_EXISTING | SchoolSelectedPanel.test.tsx:484-491 | MUT-67 | |

<a id="discover-school-anon-parity"></a>
### e2e/discover-school-anon-parity.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 4 / 4 | **Manifest end-state:** MOVE_DOWN -> `useDiscoverMapDataController.test.ts` | **MUT:** MUT-10, 75, 72..74, 82, 83, 84, 85

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| PAR-1 302-307: anon reaches panel; `school-card` from by-area | COVERED_EXISTING | SchoolsInAreaPanel.school-first-redesign.test.tsx:243; discoverPanelState.test.ts:249 | - | |
| PAR-1 310, PAR-3 430: anon never fires markers | COVERED_NEW | useDiscoverMapDataController.test.ts:1319 | MUT-10, MUT-75 | PAR-1's own state never discriminated the auth term (`!!nav.schoolId` already disables markers); the bounded arm does. |
| PAR-2 340-345: `board=CBSE` shows the CBSE school only | COVERED_EXISTING | useDiscoverSchoolController.test.ts:104,178-180; useSchoolsByArea.test.ts:77-89 | - | |
| PAR-2 348-350: `board-chip-cbse` aria-pressed from URL | COVERED_NEW | SchoolsInAreaPanel.school-first-redesign.test.tsx:224 | MUT-82 | |
| PAR-3 403, PAR-4 459,470-471: `combined-chips`, `clear-area-chip`, `clear-school-chip` | OBSOLETE | - | - | F3. |
| PAR-3 406-420, 427: public endpoint with school coords + radius 3; pins | COVERED_EXISTING / COVERED_NEW | useSchoolRadiusListings.test.ts:123-127; useDiscoverMapDataController.test.ts:1417,1426,1434,1442 | MUT-72..74 | |
| PAR-4 462-467: journey/areaKey/schoolId/radiusKm/board survive anon cold load | COVERED_EXISTING | useDiscoverUrlState.test.ts:1683-1694; useDiscoverPageState.test.ts:598-603; discoverPanelState.test.ts:270 | - | the page-state file runs by-name only (#2813). |

<a id="discover-school-board-filter"></a>
### e2e/discover-school-board-filter.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 5 / 5 | **Manifest end-state:** MOVE_DOWN -> `SchoolsInAreaPanel.school-first-redesign.test.tsx` | **MUT:** MUT-82, 83, 84, 85, 48, 06

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC12-A 179-186: chip click writes repeated `board=CBSE`; aria-pressed | COVERED_EXISTING / COVERED_NEW | SchoolsInAreaPanel.school-first-redesign.test.tsx:213-218,SchoolsInAreaPanel.school-first-redesign.test.tsx:224; useDiscoverPageState.test.ts:651 | MUT-82, 84, 85, MUT-06 | |
| AC12-B 205-209: only the CBSE school visible | COVERED_EXISTING | useDiscoverSchoolController.test.ts:104,178-180 | MUT-06 | |
| AC12-C 231-238: card click sets `schoolId`, board kept | COVERED_EXISTING / COVERED_NEW | SchoolsInAreaPanel.school-first-redesign.test.tsx:278-281; school.setSchoolJourney.test.ts:138 | MUT-48 | |
| AC12-C 241-243: `clear-school-chip` | OBSOLETE | - | - | F3. |
| AC12-C 246-250: clear keeps board | COVERED_EXISTING | useDiscoverPageState.test.ts:605-623 | - | by-name only (#2813). |
| AC12-D 266-275: cold load: chip pressed + CBSE-only list | COVERED_NEW / COVERED_EXISTING | SchoolsInAreaPanel.school-first-redesign.test.tsx:224; useDiscoverPageState.test.ts:598-603; useDiscoverSchoolController.test.ts:178-180 | MUT-82 | |
| AC4 290-302: click the active chip removes `board`; aria-pressed false | COVERED_NEW | SchoolsInAreaPanel.school-first-redesign.test.tsx:233; useDiscoverPageState.test.ts:651 | MUT-83, MUT-84, MUT-85 | |

<a id="discover-school-bounded-search"></a>
### e2e/discover-school-bounded-search.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 4 / 4 | **Manifest end-state:** RETIRED, MOVE_DOWN -> `apps/web/src/features/discover/controllers/useDiscoverMapDataController.test.ts` | **MUT:** MUT-61, 71, 104, 108, 109, 67

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| BSC-1 191-194, 205: heading, radius chips, CTA visible (auth) | COVERED_EXISTING | SchoolSelectedPanel.test.tsx:141,SchoolSelectedPanel.test.tsx:204-208,SchoolSelectedPanel.test.tsx:474-482 | - | |
| BSC-1 200-202: exactly one dashed radius circle | COVERED_EXISTING | PropertyMap.schoolCircle.test.tsx:156,161-167 | MUT-104 | CoK closed: `SchoolRadiusOverlay.tsx:51` rendering the ring twice turns the existing `toHaveLength(1)` red. SVG pixels are D8a. |
| BSC-1 210; BSC-2 246-252: no markers call before CTA; CTA gives exactly one call with school params | COVERED_NEW | useDiscoverMapDataController.test.ts:1360,1374,useDiscoverMapDataController.test.ts:1313 | MUT-71, 108, 109, 12 | |
| BSC-2 255-258: CTA hidden after trigger; count line | COVERED_EXISTING | SchoolSelectedPanel.test.tsx:513-523 | - | |
| BSC-3 300-310: radius 5 writes `radiusKm=5`; change re-gates (CTA back, no auto-refetch) | COVERED_EXISTING / COVERED_NEW | SchoolSelectedPanel.test.tsx:221-227; useDiscoverJourneyTransitions.test.tsx:912,929 | MUT-61 | |
| BSC-ANON-1 363,367: anon: no CTA; no markers call | COVERED_EXISTING / COVERED_NEW | SchoolSelectedPanel.test.tsx:484-491; useDiscoverMapDataController.test.ts:1319 | MUT-67, MUT-10 | |

<a id="discover-school-keyword-radius"></a>
### e2e/discover-school-keyword-radius.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 5 / 5 | **Manifest end-state:** RETIRED, MOVE_DOWN -> `apps/web/src/hooks/__tests__/useDiscoverUrlState.test.ts` | **MUT:** MUT-08, 77, 78, 98, 99

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| E2E-1 420-424: school heading, radius chips | COVERED_EXISTING | SchoolSelectedPanel.test.tsx:141,204 | - | |
| E2E-1 428-430: `chip-search` shows `villa` on cold load | COVERED_EXISTING | ActiveContextChips.test.tsx:318-321 | - | the C0-cited `MapDiscovery.issue1186.test.tsx:189/225` are stale-red and not counted. |
| E2E-1 433: `chip-school` visible | OBSOLETE | - | - | testid has zero occurrences in non-test `apps/web/src` (re-verified at HEAD). |
| E2E-1 439-451: ONE listings request has school params AND `q` | COVERED_NEW | useDiscoverListings.test.ts:285 | MUT-77, MUT-78, MUT-08 | |
| E2E-1 455: filtered card renders | COVERED_EXISTING | SchoolSelectedPanel.domOrder.test.tsx:97 | - | |
| E2E-2 477-487: dismiss removes chip and `q`; `schoolId`/`radiusKm` survive | COVERED_EXISTING / COVERED_NEW | ActiveContextChips.test.tsx:347-352; useDiscoverUrlState.test.ts:410,434 | MUT-98, MUT-99 | M8 was re-targeted to a file that is green at base for its own `it`s. |
| E2E-2 491-506: refetch without `q` | COVERED_EXISTING | useDiscoverListings.test.ts:542 | - | |
| E2E-3/4/5 536-669: markers URL has `q` after CTA; no `q` after dismiss; request counts | COVERED_EXISTING | useDiscoverFilteredMarkers.test.ts:427-440,458-471 | - | the "2 vs 5 markers" DOM-count claim is vacuous (the spec counts requests). |

<a id="discover-schools-mobile-cluster-2124"></a>
### e2e/discover-schools-mobile-cluster-2124.spec.ts

**Status:** KEPT_PR7 (230-233: mobile Map overlay mounts; 236-243: real cluster marker tap opens `mobile-cluster-sheet`; 257-260: school-first AREA member writes `areaKey` (canonical routing); weak: 257-260: school-first AREA member writes `areaKey` (canonical routing)); manifest row SCHEDULED(PR-7) | **Tests:** 1 / 1 | **Manifest end-state:** MOVE_DOWN -> `useDiscoverOverviewNavigationController.test.ts` | **MUT:** none

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| 230-233: mobile Map overlay mounts | **UNCOVERED** | - | - | cited `apps/web/src/pages/__tests__/MapDiscovery.issue2149.secondMarkerTap.test.tsx:281-287` lies inside the `it` at :275 ('tapping a second marker replaces (not closes) the mobile preview sheet'), red at base (frozen set; #2813) - not counted (D12). |
| 236-243: real cluster marker tap opens `mobile-cluster-sheet` | **UNCOVERED** | MobileClusterSheet.test.tsx:58-71 covers the sheet render only | - | real Leaflet cluster tap -> focus is browser-only (D8b). |
| 248-250: member row calls `journey.selectNode` | COVERED_EXISTING | MobileClusterSheet.test.tsx:100-112 | - | |
| 257-260: school-first AREA member writes `areaKey` (canonical routing) | COVERED_EXISTING (weak) | useDiscoverOverviewNavigationController.test.ts:117-119,191-193 | - | controller leg only. **UNCOVERED part (G3-M11, UNRESOLVED):** the forwarding of `activeAreasNavigationJourney` into `view.overlays.mobileCluster.journey` at `buildMapSurfaceModel.tsx:897`; its natural test file `buildMapSurfaceModel.test.ts` is not in the allowed list (SCOPE_CHANGE amendment_2 declined it). |
| 267-269: right panel visible | COVERED_EXISTING | discoverPanelState.test.ts:249 | - | |

<a id="discover__issue-2149-mobile-school-first-marker-preview"></a>
### e2e/discover/issue-2149-mobile-school-first-marker-preview.spec.ts

**Status:** KEPT_PR7 (tap A 341-346: real `touchscreen.tap` hit-testing opens the sheet); manifest row SCHEDULED(PR-7) | **Tests:** 3 / 3 | **Manifest end-state:** MOVE_DOWN -> `MapDiscovery.issue2149.secondMarkerTap.test.tsx` | **MUT:** MUT-100, MUT-101

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| tap A 299-300, 349-350; tap B 403-408: `schoolId`/`radiusKm` survive; URL unchanged; no desktop popover alongside the sheet | COVERED_NEW | MapDiscovery.issue2149.secondMarkerTap.test.tsx:339,378 | MUT-100 | |
| tap A 341-346: real `touchscreen.tap` hit-testing opens the sheet | **UNCOVERED** | the click -> sheet mechanism is jsdom-covered; real hit-testing is not | - | browser-only (D8b, the #2150 review point). The spec also targets the shared hosted DB at :5174 and is not safely runnable as written. |
| tap B 389-397: second tap swaps content, sheet stays open | COVERED_NEW | same `it` | MUT-100 | the C0/base-cited existing `it` (`:304-313`) is red at base (ambiguous `getByText`, finding F-A, #2813); the new `it` scopes its queries with `within(sheet)`. |
| desktop 430-439: school-first marker click shows popover, no mobile sheet | COVERED_NEW | MapDiscovery.issue2149.secondMarkerTap.test.tsx:378; markerPopoverEligibility.test.ts:29 | MUT-101 | |

<a id="discover__issue-2205-schoolfirst-groupid-clear-browser-proof"></a>
### e2e/discover/issue-2205-schoolfirst-groupid-clear-browser-proof.spec.ts

**Status:** KEPT_PR7 (202-205: no console errors on the real-backend flow); manifest row SCHEDULED(PR-7) | **Tests:** 1 / 1 | **Manifest end-state:** MOVE_DOWN -> `school.setSchoolJourney.test.ts` | **MUT:** MUT-49, 50, 46, 10

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| 128: `schools-journey-panel` for `groupId=...` | COVERED_EXISTING | canonical T7 `discover-school-first.canonical.ts:51-106` | - | `groupId` ignored by the gate (`useDiscoverNavigationController.ts:99`). |
| 130-132: initial URL params | OBSOLETE | - | - | trivial echo of `goto`. |
| 136-159: search, card click sets `schoolId`; `groupId` removed in the same write; journey kept; `areaKey` = school's area | COVERED_EXISTING / COVERED_NEW | school.setSchoolJourney.test.ts:43-44,47-68; SchoolsNavigationJourneyPanel.test.tsx:244,257 | MUT-49, MUT-50 | |
| 161-184: Change school clears `schoolId`; `groupId` not resurrected | COVERED_EXISTING | SchoolSelectedPanel.test.tsx:175-180; useDiscoverUrlState.test.ts:1504-1531 | - | |
| 196-199: no markers call across the sequence | COVERED_NEW | useDiscoverMapDataController.test.ts:1399; useDiscoverMapDataController.test.ts:1313 | MUT-68, MUT-12 | |
| 202-205: no console errors on the real-backend flow | **UNCOVERED** | - | - | real-runtime check; the spec runs in the legacy local suite (`BACKEND_BASE_URL` set by `run-e2e-local.sh`); no lower equivalent. |

<a id="discover__issue-2715-school-pin-vs-empty-pill"></a>
### e2e/discover/issue-2715-school-pin-vs-empty-pill.spec.ts

**Status:** KEPT_PR7 (57-58: selected-school pin and plum dashed ring visible per viewport); manifest row SCHEDULED(PR-7) | **Tests:** 2 / 4 (viewport loop) | **Manifest end-state:** DELETE_OBSOLETE (R5) | **MUT:** none

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| 57-58: selected-school pin and plum dashed ring visible per viewport | **UNCOVERED** | ring render rule PropertyMap.schoolCircle.test.tsx:156,161-167 | MUT-104 | real Leaflet pane visibility/occlusion per viewport is browser-only (D8b). |
| 67-68: empty pill absent while a school is selected | COVERED_EXISTING | SchoolMarkerLayer.test.tsx:199-213 | - | |

<a id="discover__issue-2770-compact-school-context"></a>
### e2e/discover/issue-2770-compact-school-context.spec.ts

**Status:** KEPT_PR7 (76-79: first card top <= 420 px; 82-84: summary band <= 107 px; 149-153: first card < 844 px (mobile); 111-115: back in the area, the "Schools in Manipal" row then the school list); manifest row SCHEDULED(PR-7) | **Tests:** 3 / 4 (viewport loop) | **Manifest end-state:** DELETE_OBSOLETE (R5) | **MUT:** none

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| 76-79: first card top <= 420 px; 82-84: summary band <= 107 px; 149-153: first card < 844 px (mobile) | **UNCOVERED** | - | - | layout budgets (D8b). |
| 104-110: no Filters button in the combined panel; Change school clears the school | COVERED_EXISTING | AreaSchoolCombinedPanel.compactContext2770.test.tsx:178,120 | - | |
| 111-115: back in the area, the "Schools in Manipal" row then the school list | **UNCOVERED** (citation pending) | - | - | return arm not located (candidate: area-leaf "Schools in <area>" row tests); no `it` cited. |
| 41-42: `combined-radius-btn-3` pressed; presence of band + change button | COVERED_EXISTING | AreaSchoolCombinedPanel.compactContext2770.test.tsx:85,111,144 | - | |

<a id="discover__school-deep-link-radius"></a>
### e2e/discover/school-deep-link-radius.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 2 / 2 | **Manifest end-state:** MOVE_DOWN -> `useDiscoverJourneyTransitions.test.tsx` | **MUT:** MUT-07, 62, 63, 64

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| DL-RAD-1 109: `radiusKm=5` survives cold load and restore | COVERED_EXISTING / COVERED_NEW | parse useDiscoverUrlState.test.ts:1683-1694; restore does not overwrite useDiscoverJourneyTransitions.test.tsx:966 | MUT-07, MUT-63 | |
| DL-RAD-2 127-129: school heading after lookup | COVERED_EXISTING | SchoolSelectedPanel.test.tsx:141 | - | |
| DL-RAD-2 132: absent `radiusKm` backfilled as 3 with REPLACE | COVERED_NEW | useDiscoverJourneyTransitions.test.tsx:946 | MUT-62, MUT-64 | |

<a id="discover__school-first-marker-parity"></a>
### e2e/discover/school-first-marker-parity.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 3 / 3 | **Manifest end-state:** MOVE_DOWN -> `SchoolsNavigationJourneyPanel.test.tsx` | **MUT:** MUT-49, MUT-50

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| PAR-1 344-353: search input, then result | COVERED_EXISTING | canonical T7 `discover-school-first.canonical.ts:99-105` | - | |
| PAR-1 356-371: pick writes `areaKey` (+ `schoolId`, `radiusKm`); city-listings call for the area | COVERED_NEW | SchoolsNavigationJourneyPanel.test.tsx:244,257 | MUT-49, MUT-50 | the spec's bbox-fallback premise is gone (`SchoolsNavigationJourneyPanel.tsx:99-108` passes `areaKey` straight through). |
| PAR-1/2 375-409: cards > 0, pins > 0 | COVERED_EXISTING | useSchoolListings.test.ts:102-112,155-156; resolveMarkerListings.test.ts:234 | - | |
| PAR-3 475-477: Flow A count equals Flow B count | COVERED_NEW | reduces to "Flow A writes the same URL state as Flow B" (N4-ext) | MUT-50 | |

<a id="discover__school-radius-marker-click-repro-1738"></a>
### e2e/discover/school-radius-marker-click-repro-1738.spec.ts

**Status:** RETIRED_B2 (deleted in the B2 deletion commit; deletion-gate ruling PR #2814 issuecomment-6099896083) | **Tests:** 3 / 3 | **Manifest end-state:** RETIRED, MOVE_DOWN -> `apps/web/src/pages/__tests__/MapDiscovery.issue2149.secondMarkerTap.test.tsx` | **MUT:** MUT-101, 102, 103

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| AC1 213: no radius circle without a school | COVERED_EXISTING | PropertyMap.schoolCircle.test.tsx:177-183 | - | the "renders no Circle when schoolCircle is undefined" `it` |
| AC1 216-224, AC2 246-262: area-first (area only / area + school): marker click opens the popover | COVERED_NEW | MapDiscovery.issue2149.secondMarkerTap.test.tsx:403; markerPopoverEligibility.test.ts:13,17 | MUT-102, MUT-103 | CoK closed: the page-level render is now asserted for both states. |
| AC5 284-300: school-first area + school: NO popover | OBSOLETE | contradiction: markerPopoverEligibility.test.ts:29; school-first desktop popover MapDiscovery.issue2149.secondMarkerTap.test.tsx:378 | MUT-101 | #1973 made school-first with a selected school popover-eligible (`useDiscoverMarkerPopoverController.ts:150`). |


---

## E. Open items the deletion gate must see (Question / Options / Recommendation / Impact)

1. **Question:** may `buildMapSurfaceModel.test.ts` be added so G3-M11 (`view.overlays.mobileCluster.journey` forwarding, `buildMapSurfaceModel.tsx:897`) is asserted? **Options:** (A) add it and write one `it`; (B) keep `discover-schools-mobile-cluster-2124` on disk. **Recommendation:** B for PR-3 (amendment_2 already declined the file); revisit in PR-7. **Impact:** only the 2124 spec's `selectNode` forwarding leg; the spec stays (KEEP).
2. **Question:** `broker-agri-listing` AC4 ">100 km^2 -> boundary unchanged" is asserted nowhere. **Options:** (A) add one `@Test` in `AgriListingBoundaryJourneyIT` (backend, mutation = persist-before-validate); (B) keep the spec. **Recommendation:** A as a follow-up in a later PR. **Impact:** until then the spec stays (KEEP).
3. **Question:** `discover-school-journey` has two open assertions (E2E-7 "exactly one by-area request" - a render count is not a request count; E2E-8 `radiusKm=3` on the schools-in-area card path). **Options:** (A) add an extra `it` asserting the card path's `setSchoolJourney` args include `radiusKm: 3`, accept E2E-7 as react-query dedupe (library behaviour); (B) keep the spec. **Recommendation:** A for the second, owner decision for the first. **Impact:** until decided the spec is CLOSE_OR_KEEP-not-closed.
4. **Question:** the anon peek price (`AgriGroupListingPeek.tsx:158-166`) has no frontend auth guard; server projection is the only control (security-reviewer INFO). **Options:** (A) accept, follow-up issue for a defence-in-depth guard + test; (B) add a guard in PR-3 (a product change). **Recommendation:** A. **Impact:** none on the retirement; 1551/1448/1468 peek legs rely on `DiscoverAgriMapListingsServiceTest` nulling.
5. Pre-existing red files (8, #2813) and the whole-file OOM of `useDiscoverPageState.test.ts` (one pre-existing `it` at :632) are not touched; evidence for that file is by-name / excluded-run only.
