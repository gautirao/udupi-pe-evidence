# Issue #2855 Wave 4 — Mixed-Spec Specialist Admission & Obsolescence Map

## 1. Summary

Wave 4 of `#2855` (`FU-ADMIT-ANON`) completes the evaluation and admission of the remaining `#2855` / `#2089` browser-only candidate specs in `docs/testing/e2e-retirement-manifest.csv`:

- **8 browser-only specs admitted** into `e2e/specialist/*.specialist.ts` (`L70`, `L107`, `L108`, `L122`, `L135`, `L136`, `L158`, `L184`), preserving **100% of `test(...)` blocks** (0 tests deleted) and adding **46 tests** across the 8 files (bringing `e2e/specialist/` from 34 files / 194 tests at `main` `ea47cf59` to **42 files / 240 tests** in this worktree).
- **Explicit disclosure of contract-aligned assertion updates in admitted Wave 4 specs**:
  - `L122` (`e2e/specialist/discover-issue-1956-pr5-mobile-cluster-sheet.specialist.ts`, Test 2): updated the post-dismissal URL comparison to compare against `urlBefore` with `clusterFocus` deleted rather than raw `urlBefore.toString()`, so that Leaflet's debounced `lat`/`lon`/`zoom` URL write before the click does not cause a false mismatch while still asserting `clusterFocus === null`, `node=` unchanged, and `window.history.length` unchanged.
  - `L184` (`e2e/specialist/issue-2456-map-candidate-callouts.specialist.ts`, `assertMemberCardContract`): updated the secondary-copy assertion from `/Selected/i` to `/\d+\s*LISTINGS?|Selected/i` to match the current count-aware `AreaSetCandidateCalloutLayer` member card contract (`AreaSetCandidateCalloutLayer.test.tsx`).
- **2 Wave 2 timing races hardened (`L73`, `L131`)**:
  - `L73` (`e2e/specialist/discover-map-info-dock-2748.specialist.ts`): awaited `map-info-dock-guidance` (`toHaveCount(0)`) and `discover-badge` (`toBeVisible`) before reading `schoolRadiusLegend.boundingBox()` and `dock.boundingBox()` so async count-row mount does not grow `dockBox` mid-measurement.
  - `L131` (`e2e/specialist/discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts`): seeded `rscope=areas&rareas=IN%7CKA%7CBengaluru%7CRR%20Nagar` on the initial `goto` (matching `L108` `T2` so `#2015` load-time `commitResultScope` `REPLACE` does not clobber `AreaPanner`'s `reportViewport` timer) and awaited `readCamera(page).lat` after clicking `D_SE` before clicking `AREA_RR_NAGAR`.
- **Direct browser-only assertion migrations added to existing admitted specialist specs (`L57`, `L60/B8`)**:
  - `L57` (`e2e/discover-area-reskin-mobile-2159.spec.ts` → `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts` `L119`): added the 3 mobile `390×844` area-leaf reskin guards (`document.documentElement.scrollWidth <= 390 && document.body.scrollWidth <= 390`, single-column vertical card stacking where `card[1].y >= card[0].y + card[0].height - 2` and `|card[0].x - card[1].x| <= 2`, and `node=` byte-identically surviving the `List -> Map -> List` round-trip via `control-bar-map-trigger` / `mobile-map-close-list-button`).
  - `L60/B8` (`e2e/discover-batch-b-journeys.spec.ts` `B8` → `e2e/specialist/discover-issue-2770-compact-school-context.specialist.ts` `L157`): added the 3 mobile `390×844` selected-school-state reflow guards (`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`, `school-summary-band` bounding box within `0..391`px, and `document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1` proving no page-level double-scroll).
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

Each of the remaining 7 mixed `#2855` specs fails against the current product UI or canonical local fixture for architectural reasons (superseded components, removed testids, or unseeded fixture rows) and is covered by existing canonical E2E, admitted specialist E2E, or lower-level Vitest suites. Every file path cited below is verified on disk.

### 3.1 `L52` — `e2e/discover-area-cards.spec.ts` (8 tests)

- **Why non-admissible**:
  - Tests 1–3 (`area markers appear on the map for default Udupi city`, `clicking an area marker selects the area`, `switching city replaces area markers`) and `A1`–`A5` assume a bare `/discover?city=udupi` URL renders the pre-`#1956`/`#2088` legacy `GuidedEntryPanel` (`Find properties your way`, `journey-card-area-first`), `.leaflet-marker-icon.area-marker` legacy ring markers from `/api/discover/areas`, and `back-button` / `div.h-44.relative` card selectors removed by `#1956` and `#2729`.
- **Existing replacement coverage**:
  - **Canonical E2E**: `e2e/canonical/discover-area-first.canonical.ts` (`T4`, `T5`, `T6`) and `e2e/canonical/anon-discover-teaser.canonical.ts` (`T10`).
  - **Specialist E2E**: `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts` (`L108`, camera fit & `lat`/`lon`/`zoom` URL write on area selection), `e2e/specialist/discover-issue-2305-cluster-marker-skin.specialist.ts` (`L147`, real `.area-marker` painted geometry), and `e2e/specialist/discover-listing-detail-reskin-desktop-2159.specialist.ts` (`L70`, area card click -> `/listing/:id`).
  - **Lower-level Vitest**: `apps/web/src/components/map/__tests__/AreaMarkerLayer.destinations.test.tsx`, `apps/web/src/components/discover/__tests__/DiscoverControlBar.kundapur2859.test.tsx`, `apps/web/src/pages/__tests__/MapDiscovery.areaKeyColdLoad2859.test.tsx`.

### 3.2 `L56` — `e2e/discover-area-nav-journey.spec.ts` (7 tests)

- **Why non-admissible**:
  - Drives the pre-`#1956` `scope=` guided-entry state (`Where do you want to explore?`, `journey-card-area-first`, `back-button`, and legacy `?areaKey=` URL transitions) superseded by the `#1956` canonical `node=` hierarchy (`d:*` -> `c:*` -> `a:*`).
- **Existing replacement coverage**:
  - **Canonical E2E**: `e2e/canonical/discover-area-first.canonical.ts` (`T4`, `T5`, `T6`) and `e2e/canonical/panel-exclusivity.canonical.ts` (`T18`).
  - **Specialist E2E**: `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts` (`L108`, `T1`–`T6` camera fit & URL `lat`/`lon`/`zoom` preservation) and `e2e/specialist/discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts` (`L131`, hierarchy drilldown + Back camera restoration).
  - **Lower-level Vitest**: `apps/web/src/pages/__tests__/MapDiscovery.areaKeyColdLoad2859.test.tsx`, `apps/web/src/pages/__tests__/MapDiscovery.nodeListingsBack2859.test.tsx`, `apps/web/src/features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts`.

### 3.3 `L57` — `e2e/discover-area-reskin-mobile-2159.spec.ts` (1 test)

- **Why non-admissible as a standalone file**:
  - Hard-codes `a:IN|KA|Bengaluru|JP Nagar` (which has 0 seeded listings in the canonical gate fixture) and queries `.area-listings-grid`, a CSS class removed when `#2729` reskinned the area-leaf results surface (`ListingsBody.tsx`).
- **Direct browser replacement coverage (migrated into `L119`)**:
  - **Specialist E2E**: `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts` (`L119`) now directly asserts all 3 `L57` browser invariants at `390×844` on `a:IN|KA|Bengaluru|RR Nagar` (2 real seeded listings):
    1. `document.documentElement.scrollWidth <= 390` and `document.body.scrollWidth <= 390` (no horizontal overflow at 390px).
    2. Single-column vertical card layout (`|firstCardBox.x - secondCardBox.x| <= 2` and `secondCardBox.y >= firstCardBox.y + firstCardBox.height - 2`).
    3. Canonical `node=` parameter survives the `List -> Map -> List` toggle round-trip (`control-bar-map-trigger` -> `mobile-map-close-list-button`) byte-identically.
  - **Specialist E2E**: `e2e/specialist/discover-listing-detail-reskin-mobile-2159.specialist.ts` (`L71`) and `e2e/specialist/discover-issue-2089-filter-list-map-parity.specialist.ts` (`L135`).

### 3.4 `L58` — `e2e/discover-area-selected-filters.spec.ts` (22 tests)

- **Why non-admissible**:
  - Tests 1–12 and `T1`–`T8` cold-load bare `/discover?areaKey=IN|KA|Udupi|Manipal` and assert legacy testids (`quick-chip-apartment`, `quick-chip-2-bhk`, `combined-chips`, `panel-header-back-button`) that were removed by `#2660` (`AreaFirstJourneyPanel`) and `#2729` (`ListingsBody` / `DiscoverControlBar` popovers).
- **Existing replacement coverage**:
  - **Canonical E2E**: `e2e/canonical/discover-area-first.canonical.ts` (`T4`, `T5`, `T6`, `T24`, `T25`, `T26`) and `e2e/canonical/discover-school-first.canonical.ts` (`T7`, `T7b`).
  - **Specialist E2E**:
    - `e2e/specialist/discover-issue-2715-school-pin-vs-empty-pill.specialist.ts` (`L156` — school-pin vs empty-pill rendering and selected-school pin + dashed radius circle on real Leaflet map).
    - `e2e/specialist/discover-journey-switch-overlay-cleanup-1940.specialist.ts` (`L158` `AC1`–`AC5` — real Leaflet `.school-marker` pin + `path.leaflet-interactive` radius circle mount, redraw, and unmount across `area-first` / `school-first` transitions).
    - `e2e/specialist/discover-issue-2089-filter-list-map-parity.specialist.ts` (`L135` — property-type filter chip narrowing on canonical `node=a:IN|KA|Bengaluru|RR Nagar` across List and Map).
    - `e2e/specialist/discover-results-reskin-2729.specialist.ts` (`L78` — `#2729` filter popovers and quick-filter controls).
  - **Lower-level Vitest**: `apps/web/src/features/discover/navigation/__tests__/discoverAreasJourneyPanelAreaLeaf.test.tsx`, `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx`.

### 3.5 `L60` — `e2e/discover-batch-b-journeys.spec.ts` (7 tests: `B1`, `B2`, `B3`, `B5`, `B6`, `B7`, `B8`)

- **Why non-admissible as a standalone file**:
  - `B1`, `B2`, `B3`, `B6`, `B7` drive the superseded pre-`#1956`/`#2715` `journey-switcher` tabs (`journey-tab-area-first`, `journey-tab-school-first`, `journey-tab-agri-first`), `region-scope-south`, and `purpose-toggle-rent` testids removed when `#1953`/`#2715` replaced the panel journey switcher with `DiscoverControlBar`.
- **Direct browser replacement coverage for `B5` and `B8`**:
  - **For `B5` (`[LEAFLET_REAL]` school-radius pins & circle)**:
    - `e2e/specialist/discover-issue-2715-school-pin-vs-empty-pill.specialist.ts` (`L156`)
    - `e2e/specialist/discover-issue-2149-mobile-school-first-marker-preview.specialist.ts` (`L141`)
    - `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts` (`L108` `T4`)
  - **For `B8` (`[LAYOUT_OVERFLOW]` mobile `390×844` selected-school-state reflow, `school-summary-band` width, and no page-level double-scroll — migrated into `L157`)**:
    - `e2e/specialist/discover-issue-2770-compact-school-context.specialist.ts` (`L157`, test `mobile 390x844: first listing card is inside the viewport in List view`) now directly asserts all 3 `B8` invariants in the mobile `390×844` selected-school state (`school-summary-band` + `combined-radius-btn-3` + `listing-card` visible):
      1. `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1` (no horizontal page overflow).
      2. `school-summary-band` bounding box fits within the `390px` viewport (`box.x >= 0` and `box.x + box.width <= 391`).
      3. `document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1` (no document-level vertical scroll / double-scroll).
    - Complemented by `e2e/specialist/discover-control-bar-mobile-reachability-1953.specialist.ts` (`L104`) and `e2e/specialist/discover-issue-2089-breadcrumb-list-flex-layout.specialist.ts` (`L134`).

### 3.6 `L77` — `e2e/discover-results-redesign-1547.spec.ts` (8 tests)

- **Why non-admissible**:
  - Targets the pre-`#1956`/`#2729` legacy `?areaKey=IN|KA|Udupi|Manipal` right-panel results surface (`discover-right-panel`) and old `PropertyCard` selected-state DOM contract (`data-selected="true"` in-place selection on marker click, and `grid-cols-1 2xl:grid-cols-2` two-column card grid removed in `#2729`).
- **Existing replacement coverage**:
  - **Specialist E2E**:
    - `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts` (`L119` — scroll container geometry, single-column card layout, viewport reachability, card click)
    - `e2e/specialist/discover-issue-1956-pr4-listing-peek-camera-restore.specialist.ts` (`L117` — card peek, camera restore)
    - `e2e/specialist/discover-listing-detail-reskin-desktop-2159.specialist.ts` (`L70`) & `e2e/specialist/discover-listing-detail-reskin-mobile-2159.specialist.ts` (`L71`)
    - `e2e/specialist/discover-results-reskin-2729.specialist.ts` (`L78`)
  - **Canonical E2E**: `e2e/canonical/discover-area-first.canonical.ts` (`T6`) and `e2e/canonical/anon-discover-teaser.canonical.ts` (`T10`).
  - **Lower-level Vitest**: `apps/web/src/pages/__tests__/MapDiscovery.listingSelectedMarker2859.test.tsx`.

### 3.7 `L172` — `e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts` (3 tests)

- **Why non-admissible**:
  - Hard-codes `groupId=thanisandra-hennur-belt` (`Thanisandra & Hennur Belt`), which belonged to the pre-`#1956` `area_groups` table and is not part of the canonical `#1956` navigation hierarchy (`d:north` / `c:north:...`).
  - Furthermore, issue `#2213` (`AreaGroupFocusPanel`) replaced the `groupId=` map marker layer with `AreaGroupFocusLayer` / `AreaGroupFocusPanel`, retiring the old `AreaMarkerLayer` `groupId=` pill-collision path (`R2`) and group-chip URL toggle (`R5`/`R6`).
- **Existing replacement coverage**:
  - **Specialist E2E**:
    - `e2e/specialist/discover-issue-2305-cluster-marker-skin.specialist.ts` (`L147` — painted cluster/area marker geometry, focus ring, hover state)
    - `e2e/specialist/discover-issue-2330-marker-reskin-visual.specialist.ts` (`L148` — painted marker footprint `<= 172x140`, focus ring cascade)
  - **Lower-level Vitest**: `apps/web/src/components/map/__tests__/AreaMarkerLayer.destinations.test.tsx`, `apps/web/src/components/map/__tests__/AreaMarkerLayer.test.tsx`.
