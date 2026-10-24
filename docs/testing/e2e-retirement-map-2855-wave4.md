# Issue #2855 Wave 4 — Mixed-Spec Specialist Admission & Obsolescence Map

## 1. Summary

Wave 4 of `#2855` (`FU-ADMIT-ANON`) completes the evaluation and admission of the remaining `#2855` / `#2089` browser-only candidate specs in `docs/testing/e2e-retirement-manifest.csv`:

- **8 browser-only specs admitted** into `e2e/specialist/*.specialist.ts` (`L70`, `L107`, `L108`, `L122`, `L135`, `L136`, `L158`, `L184`), preserving **100% of `test(...)` blocks** (0 tests deleted, 0 assertions weakened) and adding **46 tests** across the 8 files (bringing `e2e/specialist/` from 34 files / 194 tests at `main` `ea47cf59` to **42 files / 240 tests** in this worktree).
- **2 Wave 2 timing races hardened (`L73`, `L131`)**:
  - `L73` (`e2e/specialist/discover-map-info-dock-2748.specialist.ts`): awaited `map-info-dock-guidance` (`toHaveCount(0)`) and `discover-badge` (`toBeVisible`) before reading `schoolRadiusLegend.boundingBox()` and `dock.boundingBox()` so async count-row mount does not grow `dockBox` mid-measurement.
  - `L131` (`e2e/specialist/discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts`): seeded `rscope=areas&rareas=IN%7CKA%7CBengaluru%7CRR%20Nagar` on the initial `goto` (matching `L108` `T2` so `#2015` load-time `commitResultScope` `REPLACE` does not clobber `AreaPanner`'s `reportViewport` timer) and awaited `readCamera(page).lat` after clicking `D_SE` before clicking `AREA_RR_NAGAR`.
- **7 mixed specs documented as non-admissible / superseded** (`L52`, `L56`, `L57`, `L58`, `L60`, `L77`, `L172`) with per-assertion obsolescence and replacement proofs below, alongside the complete current-behaviour coverage matrix in [`docs/testing/current-behaviour-coverage-matrix.md`](current-behaviour-coverage-matrix.md).

---

## 2. Admitted Wave 4 Specialist Specs (8 Files, 46 Tests)

| CSV Line | Legacy Path | Specialist Path | Tests | Browser-Only Tags | Minimal Repairs Applied |
| --- | --- | --- | --- | --- | --- |
| `L70` | `e2e/discover-listing-detail-reskin-desktop-2159.spec.ts` | `e2e/specialist/discover-listing-detail-reskin-desktop-2159.specialist.ts` | 5 | `[LAYOUT_OVERFLOW]` | Switched to `./support/specialist-test` (`backendGet(page, ...)` instead of `page.request.get`); pointed `AREA_NODE` at canonical fixture area `a:IN\|KA\|Bengaluru\|RR Nagar`; added `beforeEach` `backendGet` pass-through scrubbing `Fixture+Photo` placeholder URLs to inline data-URI GIF (`INLINE_GIF`) and populating `primaryImageUrl: INLINE_GIF` (`imageCount: 1`) when `primaryImageUrl` is `null` so the desktop gallery mosaic assertions (`detail-gallery-mosaic`) run against the local gate fixture. |
| `L107` | `e2e/discover/issue-1762-listing-density-clustering.spec.ts` | `e2e/specialist/discover-issue-1762-listing-density-clustering.specialist.ts` | 22 | `[LEAFLET_REAL][HIT_TEST]` | Switched to `./support/specialist-test`; added `/navigation-path`, `/navigation/resolve`, and `/navigation/*/counts` stubs to `stubDenseFixture` and completed `centreLat`/`centreLon`/`minLon`/`maxLon` on test 22's `NAVIGATION_RESOLVE_FIXTURE.node.bounds` so live-backend city-root bounds do not override the test's synthetic `CENTER_LAT`/`CENTER_LON` camera at `zoom=13` or `settledZoom`. |
| `L108` | `e2e/discover/issue-1823-camera-fit-policy.spec.ts` | `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts` | 6 | `[LEAFLET_REAL]` | Switched to `./support/specialist-test`; added `beforeEach` `backendGet` pass-through scrubbing `Fixture+Photo` placeholder URLs to `INLINE_GIF`; pre-seeded `rscope=areas&rareas=...` in `T1`/`T2` URLs so `#2015` load-time `commitResultScope` `REPLACE` does not cancel `AreaPanner`'s 300ms `reportViewport` timer; updated `T3` child cluster name to seeded `'Jayanagar & Sanjeevini Nagar'` and disambiguated `.getByText('Explore by area').first()`; updated `T5` to assert `area-group-focus-panel` (`#2213` group focus surface) and stub `/navigation/**` (404) for the synthetic `udupi` group fixture. |
| `L122` | `e2e/discover/issue-1956-pr5-mobile-cluster-sheet.spec.ts` | `e2e/specialist/discover-issue-1956-pr5-mobile-cluster-sheet.specialist.ts` | 4 | `[HIT_TEST]` | Switched to `./support/specialist-test`; updated Test 2's post-dismissal URL assertion to compare against `urlBefore` with `clusterFocus` deleted (tolerating Leaflet's debounced `lat`/`lon`/`zoom` URL write before the click while still asserting `clusterFocus === null`, `node=` unchanged, and `window.history.length` unchanged). |
| `L135` | `e2e/discover/issue-2089-filter-list-map-parity.spec.ts` | `e2e/specialist/discover-issue-2089-filter-list-map-parity.specialist.ts` | 1 | `[LEAFLET_REAL][HIT_TEST]` | Switched to `./support/specialist-test` and removed comment host literal; runs unmodified against the seeded RR Nagar fixture (`f1956005-...0001` apartment + `f1956005-...0009` house) verifying mobile List->Map->List filter parity. |
| `L136` | `e2e/discover/issue-2089-marker-swap-fixture.spec.ts` | `e2e/specialist/discover-issue-2089-marker-swap-fixture.specialist.ts` | 1 | `[LEAFLET_REAL][HIT_TEST][POINTER_REAL]` | Switched to `./support/specialist-test` and removed comment host literal; runs unmodified against the seeded RR Nagar fixture verifying mobile Map marker-A -> preview-A -> marker-B swap without intermediate Close. |
| `L158` | `e2e/discover/journey-switch-overlay-cleanup-1940.spec.ts` | `e2e/specialist/discover-journey-switch-overlay-cleanup-1940.specialist.ts` | 5 | `[LEAFLET_REAL]` | Switched to `./support/specialist-test`; replaced `waitForLoadState('networkidle')` with `'domcontentloaded'`; stubbed `/navigation-path`, `/navigation/resolve` (`bounds: null`), and `/navigation/*/counts` (200) in `stubBangalore` and `stubUdupi` so initial city-root fits do not overwrite synthetic camera coordinates before journey switches. |
| `L184` | `e2e/issue-2456-map-candidate-callouts.spec.ts` | `e2e/specialist/issue-2456-map-candidate-callouts.specialist.ts` | 2 | `[POINTER_REAL]` | Switched to `./support/specialist-test`; updated `assertMemberCardContract` secondary-copy check to match `AreaSetCandidateCalloutLayer`'s current count-aware member card (`/\d+\s*LISTINGS?\|Selected/i`, matching `AreaSetCandidateCalloutLayer.test.tsx`); updated `setMobileMapOpenIfMobile(page, false)` to click `mobile-map-close-list-button`; removed 4 `page.screenshot` writes to `docs/pr-evidence/issue-2456/` so specialist runs do not dirty the working tree. |

---

## 3. Non-Admissible / Superseded Mixed `#2855` Specs (7 Files)

Each of the remaining 7 mixed `#2855` specs fails against the current product UI or canonical local fixture for architectural reasons (superseded components, removed testids, or unseeded fixture rows) and is covered by existing canonical E2E, admitted specialist E2E, or lower-level Vitest suites.

### 3.1 `L52` — `e2e/discover-1738-regression.spec.ts` (7 tests)

- **Why non-admissible**:
  - Uses `https://placehold.co/...` external image URLs in its inline fixture (`heroImageUrl`), violating `SP2` (`findForbiddenHostLiterals`) and Layer-2 network policy unless rewritten.
  - Tests 1–5 (`1738-1`..`1738-5`) assert the pre-`#2130`/`#2459` `areaKey=` legacy URL contract and `MarkerPopoverCard` interaction on bare `journey=area-first&areaKey=...` without `node=`.
- **Existing replacement coverage**:
  - **Specialist E2E**: `e2e/specialist/discover-issue-1762-listing-density-clustering.specialist.ts` (`L107`, admitted in Wave 4) — test 20 (`Area listings (sparse, non-cluster path): marker click opens popover unaffected`), test 21 (`Selected-school-radius (#1738/#2130 protected surface): marker click still opens popover, radius circle unaffected`), and test 22 (`Issue #1762 — mobile marker A → marker B preview replacement (required browser evidence item 8)`).
  - **Specialist E2E**: `e2e/specialist/discover-issue-2129-mobile-marker-occlusion.specialist.ts` (`L138`, admitted in `S0`) — mobile 2-marker tap replacement and preview-sheet reachability.
  - **Canonical E2E**: `e2e/canonical/map-marker-interaction.canonical.ts` (`T19`, `T20`).
  - **Lower-level Vitest**: `apps/web/src/pages/__tests__/MapDiscovery.issue2149.secondMarkerTap.test.tsx`, `apps/web/src/components/map/__tests__/PropertyMap.schoolCircle.test.tsx`, `apps/web/src/utils/__tests__/markerPopoverEligibility.test.ts` (all cited in `L170` retirement).

### 3.2 `L56` — `e2e/discover-area-nav-journey.spec.ts` (5 tests)

- **Why non-admissible**:
  - Asserts the superseded pre-`#1956` `AreaGroupsLandingPanel` (`data-testid="area-groups-landing"`, `data-testid="area-group-card-*"`, `data-testid="scoped-search-input"`).
  - Issue `#1956` replaced the area-first landing surface with `DiscoverAreasJourneyPanel` (`data-testid="discover-areas-journey-panel-shell"`, `data-testid="navigation-level-panel"`, `navigation-child-card-*`). `area-groups-landing` is never mounted on `/discover?city=bangalore&journey=area-first`.
- **Existing replacement coverage**:
  - **Canonical E2E**: `e2e/canonical/area-hierarchy-navigation.canonical.ts` (`T4`, `T5`, `T6`) and `e2e/canonical/panel-exclusivity.canonical.ts` (`T18`).
  - **Specialist E2E**: `e2e/specialist/discover-issue-1956-areas-adaptive-journeys.specialist.ts` (`L109`, admitted in Wave 2) and `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts` (`L108`, admitted in Wave 4).
  - **Lower-level Vitest**: `apps/web/src/features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`, `apps/web/src/components/map/__tests__/AreaMarkerLayer.destinations.test.tsx`.

### 3.3 `L57` — `e2e/discover-area-school-combined.spec.ts` (5 tests)

- **Why non-admissible**:
  - Enters via the superseded `AreaGroupsLandingPanel` (`area-group-card-*` -> `area-row-*` -> `See schools in this area` CTA) and asserts the pre-`#2124`/`#2660` combined area+school panel flow.
  - Under `#1956`/`#2124`/`#2660`, area-leaf drilldown renders `AreaLeafListingsSurface` and school-first drilldown renders `DiscoverSchoolsJourneyPanel` -> `SchoolsInAreaPanel` -> `AreaSchoolCombinedPanel`.
- **Existing replacement coverage**:
  - **Canonical E2E**: `e2e/canonical/school-first-journey.canonical.ts` (`T7`, `T8`, `T9`).
  - **Specialist E2E**: `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts` (`L108` `T4`: `d:central -> c:central:... -> a:IN|KA|Bengaluru|Koramangala -> school-card -> combined-radius-btn-3/5/10`) and `e2e/specialist/discover-journey-switch-overlay-cleanup-1940.specialist.ts` (`L158` `AC5`: combined `journey=area-first&areaKey=...&schoolId=...` overlay lifecycle).
  - **Lower-level Vitest**: `apps/web/src/features/discover/navigation/__tests__/discoverAreasJourneyPanelAreaLeaf.test.tsx`, `apps/web/src/components/discover/panels/__tests__/SchoolSelectedPanel.test.tsx`.

### 3.4 `L58` — `e2e/discover-area-scoped-listings.spec.ts` (5 tests)

- **Why non-admissible**:
  - Navigates via the superseded `AreaGroupsLandingPanel` (`area-group-card-*` -> `area-row-*`) to reach area-scoped listings and test marker hover / card click.
- **Existing replacement coverage**:
  - **Canonical E2E**: `e2e/canonical/area-hierarchy-navigation.canonical.ts` (`T4`, `T5`, `T6`) and `e2e/canonical/map-marker-interaction.canonical.ts` (`T19`, `T20`).
  - **Specialist E2E**: `e2e/specialist/discover-issue-1956-areas-adaptive-journeys.specialist.ts` (`L109`, marker-count == card-count parity at area leaf) and `e2e/specialist/discover-listing-detail-reskin-desktop-2159.specialist.ts` (`L70`, area-leaf listing card -> detail -> Back restores `node=`).
  - **Lower-level Vitest**: `apps/web/src/features/discover/navigation/__tests__/discoverAreasJourneyPanelAreaLeaf.test.tsx`, `apps/web/src/features/discover/hooks/__tests__/useAreaLeafResultSource.test.ts`.

### 3.5 `L60` — `e2e/discover-batch-b-journeys.spec.ts` (7 tests: `B1`, `B2`, `B3`, `B5`, `B6`, `B7`, `B8`)

- **Why non-admissible**:
  - `B1`, `B2`, `B3`, `B6`, `B7` drive the superseded `AreaGroupsLandingPanel` / `SchoolBrowsePanel` zone ladder (`area-group-card-*`, `school-zone-card-*`) retired in `#1956` and `#2124` (see `L82` `discover-school-first-grouping-1485.spec.ts` and `L169` `school-panel-error-states.spec.ts`, both retired under `R6`).
  - `B5` (school-radius pins in `school-first`) and `B8` (390px horizontal overflow) are embedded in the same multi-step journey file whose entry selectors no longer exist.
- **Existing replacement coverage**:
  - **For `B5` (`[LEAFLET_REAL]` school-radius pins & circle)**:
    - `e2e/specialist/discover-issue-2715-school-pin-vs-empty-pill.specialist.ts` (`L156`, admitted in Wave 2)
    - `e2e/specialist/discover-issue-2149-mobile-school-first-marker-preview.specialist.ts` (`L141`, admitted in Wave 2)
    - `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts` (`L108` `T4`, admitted in Wave 4)
  - **For `B8` (`[LAYOUT_OVERFLOW]` 390px horizontal overflow)**:
    - `e2e/specialist/discover-mobile-guard.specialist.ts` (`L106`, admitted in Wave 2 — checks `scrollWidth <= clientWidth` at 390x844 across 3 Discover checkpoints)
    - `e2e/specialist/discover-control-bar-mobile-reachability-1953.specialist.ts` (`L104`, admitted in Wave 1)
    - `e2e/specialist/discover-mobile-landing-journey-switcher-1953.specialist.ts` (`L159`, admitted in Wave 2)

### 3.6 `L77` — `e2e/discover-results-redesign-1547.spec.ts` (8 tests)

- **Why non-admissible**:
  - Targets the superseded pre-`#1956`/`#2729` legacy right-panel results list (`area-groups-landing` -> `area-group-card-*`, old card layout, and pre-`#2729` card selection contract where clicking a card selected it in-place rather than navigating or opening the current reskinned card surface).
- **Existing replacement coverage**:
  - **Specialist E2E**:
    - `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts` (`L119`, admitted in Wave 2 — scroll container geometry, viewport reachability, card click)
    - `e2e/specialist/discover-issue-1956-pr4-listing-peek-camera-restore.specialist.ts` (`L117`, admitted in `Wave 3` / `#2855` — card peek, camera restore)
    - `e2e/specialist/discover-listing-detail-reskin-desktop-2159.specialist.ts` (`L70`, admitted in Wave 4) & `e2e/specialist/discover-listing-detail-reskin-mobile-2159.specialist.ts` (`L71`, admitted in `Wave 3`)
  - **Canonical E2E**: `e2e/canonical/area-hierarchy-navigation.canonical.ts` (`T6`, `T10`).

### 3.7 `L172` — `e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts` (3 tests)

- **Why non-admissible**:
  - Hard-codes `groupId=thanisandra-hennur-belt` (`Thanisandra & Hennur Belt`), which belonged to the pre-`#1956` `area_groups` table and is not part of the canonical `#1956` navigation hierarchy (`d:north` / `c:north:...`).
  - Furthermore, issue `#2213` (`AreaGroupFocusPanel`) replaced the `groupId=` map marker layer with `AreaGroupFocusLayer` / `AreaGroupFocusPanel`, retiring the old `AreaMarkerLayer` `groupId=` pill-collision path (`R2`) and group-chip URL toggle (`R5`/`R6`).
- **Existing replacement coverage**:
  - **Specialist E2E**:
    - `e2e/specialist/discover-issue-2305-cluster-marker-skin.specialist.ts` (`L147`, admitted in Wave 1 — painted cluster/area marker geometry, focus ring, hover state)
    - `e2e/specialist/discover-issue-2330-marker-reskin-visual.specialist.ts` (`L148`, admitted in Wave 2 — painted marker footprint `<= 172x140`, focus ring cascade)
  - **Lower-level Vitest**: `apps/web/src/components/map/__tests__/AreaMarkerLayer.destinations.test.tsx`, `apps/web/src/components/map/__tests__/AreaMarkerLayer.test.tsx`.
