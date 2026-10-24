# E2E Retirement Map — Issue #2855 Wave 2 (Anonymous Specialist Suite Admission)

- **Issue**: `#2855` (FU-ADMIT-ANON — Specialist suite Wave 2 admission for mixed and repairable anonymous `RETAIN_SPECIALIST` specs after `#2857`/`#2858`/`#2859` merged)
- **Base commit**: `76e0b78ac12cf6ab8b68079f9ed5c440fc4749e8` (`main`, after PRs `#2901`–`#2904`)
- **Branch**: `test/2855-specialist-wave2`
- **Target suite**: `e2e/specialist/*.specialist.ts` (`playwright.specialist.config.ts`, invoked via `npm run test:e2e:specialist` -> `bash scripts/run-e2e-gate.sh --suite=specialist`)
- **Zero-deletion invariant**: **0 `test(...)` blocks deleted**, **0 assertions weakened**. Every admitted spec was moved whole via `git mv` with mechanical fixture/import adaptations only.

---

## 1. Wave 2 Admission Summary

With lower-level seam coverage landed in `#2857` (PR `#2901`), `#2858` (PR `#2903`), and `#2859` (PR `#2902`), Wave 2 evaluated all 19 mixed `#2855` specs plus the 3 repairable pure `#2855` specs from Wave 1 (`L119`, `L131`, `L156`) by moving them whole into `e2e/specialist/*.specialist.ts` (0 deleted `test(...)` blocks) and running them against the live disposable specialist fixture stack (`pg-gate-*` + local GoTrue/PostgREST auth stack).

**Result**:
- **9 specs (59 tests)** passed all static guards (`SP1`–`SP9`) and passed 100% of their browser assertions and runtime network-isolation checks across **two consecutive full-suite runs**.
- Combined with the **11 existing specialist specs (64 tests)** from `#2854` S0 and `#2855`/`#2826` Wave 1, the specialist suite now comprises **20 files / 123 tests** (`passed=123 skipped=0 flaky=0 unexpected=0 interrupted=0`).
- **13 mixed candidate specs** failed empirically against the local `pg-gate-*` fixture stack or post-spec UI/testid evolution; per the fail-closed rule, all 13 were un-admitted back to their original paths and remain `SCHEDULED(#2855)` with exact failure diagnostics recorded in Section 4.

---

## 2. Admitted Wave 2 Specialist Specs (9 Files, 59 Tests)

| Manifest Row | Slice | Admitted Specialist Path (`e2e/specialist/`) | Original Path | `[CODE]` Rationale | Tests |
| :--- | :--- | :--- | :--- | :--- | ---: |
| `L71` | `#2855` | `e2e/specialist/discover-listing-detail-reskin-mobile-2159.specialist.ts` | `e2e/discover-listing-detail-reskin-mobile-2159.spec.ts` | `[LAYOUT_OVERFLOW]` no h-overflow at 390, share button in viewport; Back restores `node=` (`analysis #134`) | 1 |
| `L73` | `#2855` | `e2e/specialist/discover-map-info-dock-2748.specialist.ts` | `e2e/discover-map-info-dock-2748.spec.ts` | `[HIT_TEST][PAINT_GEOMETRY]` 7 geometry/hit-test groups of the map info dock (`analysis #135`) | 37 |
| `L91` | `#2855` | `e2e/specialist/discover-schools-mobile-cluster-2124.specialist.ts` | `e2e/discover-schools-mobile-cluster-2124.spec.ts` | `[POINTER_REAL][LEAFLET_REAL]` real cluster marker tap opens the mobile cluster sheet (`analysis #57`) | 1 |
| `L117` | `#2855` | `e2e/specialist/discover-issue-1956-pr4-listing-peek-camera-restore.specialist.ts` | `e2e/discover/issue-1956-pr4-listing-peek-camera-restore.spec.ts` | `[LEAFLET_REAL]` AC4.10 delayed real camera restore and AC4.5 real Back (`analysis #76`) | 6 |
| `L119` | `#2855` | `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts` | `e2e/discover/issue-1956-pr4-mobile-listings-scroll.spec.ts` | `[LAYOUT_OVERFLOW][POINTER_REAL]` scroll ancestor, viewport reach + click, Retry reach (`analysis #77`) | 2 |
| `L131` | `#2855` | `e2e/specialist/discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts` | `e2e/discover/issue-2083-home-breadcrumb-back-camera-race.spec.ts` | `[LEAFLET_REAL]` live two-writer Leaflet camera race 2.5 s after Back (`analysis #83`) | 1 |
| `L137` | `#2855` | `e2e/specialist/discover-issue-2089-pan-preserves-listing-preview.specialist.ts` | `e2e/discover/issue-2089-pan-preserves-listing-preview.spec.ts` | `[LEAFLET_REAL]` List<->Map remount keeps lat/lon and pan preserves mobile preview (`analysis #86`) | 3 |
| `L156` | `#2855` | `e2e/specialist/discover-issue-2715-school-pin-vs-empty-pill.specialist.ts` | `e2e/discover/issue-2715-school-pin-vs-empty-pill.spec.ts` | `[PAINT_GEOMETRY]` selected-school pin + dashed ring painted visibility per viewport (`analysis #59`) | 4 |
| `L157` | `#2855` | `e2e/specialist/discover-issue-2770-compact-school-context.specialist.ts` | `e2e/discover/issue-2770-compact-school-context.spec.ts` | `[PAINT_GEOMETRY]` first card top <=420px and summary band <=107px in real layout (`analysis #60`) | 4 |
| **Total Admitted (Wave 2)** | | **9 files** | | | **59** |

### Per-File Adaptation & Verification Details

#### 1. `L71` — `e2e/specialist/discover-listing-detail-reskin-mobile-2159.specialist.ts` (1 test)
- **Moved from**: `e2e/discover-listing-detail-reskin-mobile-2159.spec.ts` (`#2855`)
- **Adaptations**:
  1. `git mv` to `e2e/specialist/discover-listing-detail-reskin-mobile-2159.specialist.ts`
  2. Imported `{ test, expect }` from `./support/specialist-test`
  3. Updated `AREA_NODE` from `'a:IN|KA|Bengaluru|JP Nagar'` (0 listings in `pg-gate-*`) to `'a:IN|KA|Bengaluru|RR Nagar'` (committed 2-listing Bangalore leaf in `navigation-hierarchy-fixture-listings-seed.sql`).

#### 2. `L73` — `e2e/specialist/discover-map-info-dock-2748.specialist.ts` (37 tests)
- **Moved from**: `e2e/discover-map-info-dock-2748.spec.ts` (`#2855`)
- **Adaptations**:
  1. `git mv` to `e2e/specialist/discover-map-info-dock-2748.specialist.ts`
  2. Imported `{ test, expect }` from `./support/specialist-test`
  3. Sanitised `e2e/fixtures/user-auth.json` in the trailing comment block at line 1104 (`SP6` raw-file check).

#### 3. `L91` — `e2e/specialist/discover-schools-mobile-cluster-2124.specialist.ts` (1 test)
- **Moved from**: `e2e/discover-schools-mobile-cluster-2124.spec.ts` (`#2855`)
- **Adaptations**:
  1. `git mv` to `e2e/specialist/discover-schools-mobile-cluster-2124.specialist.ts`
  2. Imported `{ test, expect }` from `./support/specialist-test`.

#### 4. `L117` — `e2e/specialist/discover-issue-1956-pr4-listing-peek-camera-restore.specialist.ts` (6 tests)
- **Moved from**: `e2e/discover/issue-1956-pr4-listing-peek-camera-restore.spec.ts` (`#2855`)
- **Adaptations**:
  1. `git mv` to `e2e/specialist/discover-issue-1956-pr4-listing-peek-camera-restore.specialist.ts`
  2. Imported `{ test, expect }` from `./support/specialist-test`
  3. Updated `AREA_BASAVESHWARA` (`a:IN|KA|Bengaluru|Basaveshwara Nagar`, uncommitted PR-4 hand-seeded row) and `SALE_LISTING_A_ID` (`e2e19560-0003-0000-0000-000000000001`) to the committed 2-listing Bangalore fixture in `navigation-hierarchy-fixture-listings-seed.sql` (`a:IN|KA|Bengaluru|RR Nagar` and `f1956005-0000-0000-0000-000000000001`).

#### 5. `L119` — `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts` (2 tests)
- **Moved from**: `e2e/discover/issue-1956-pr4-mobile-listings-scroll.spec.ts` (`#2855`)
- **Adaptations**:
  1. `git mv` to `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts`
  2. Imported `{ test, expect }` from `./support/specialist-test`
  3. Updated `AREA_BASAVESHWARA` from `'a:IN|KA|Bengaluru|Basaveshwara Nagar'` to the committed 2-listing Bangalore leaf `'a:IN|KA|Bengaluru|RR Nagar'`.

#### 6. `L131` — `e2e/specialist/discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts` (1 test, 3x real-timer trials)
- **Moved from**: `e2e/discover/issue-2083-home-breadcrumb-back-camera-race.spec.ts` (`#2855`)
- **Adaptations**:
  1. `git mv` to `e2e/specialist/discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts`
  2. Imported `{ test, expect }` from `./support/specialist-test`
  3. Added `await expect.poll(() => readCamera(page).lat, { timeout: 10_000 }).not.toBeNull();` after drilling into `AREA_RR_NAGAR` before starting the `SETTLE_MS` (2.5 s) window so cold-load initial camera fit and debounced URL write complete before `areaCameraBeforeHome` is sampled.

#### 7. `L137` — `e2e/specialist/discover-issue-2089-pan-preserves-listing-preview.specialist.ts` (3 tests)
- **Moved from**: `e2e/discover/issue-2089-pan-preserves-listing-preview.spec.ts` (`#2855`)
- **Adaptations**:
  1. `git mv` to `e2e/specialist/discover-issue-2089-pan-preserves-listing-preview.specialist.ts`
  2. Imported `{ test, expect }` from `./support/specialist-test`.

#### 8. `L156` — `e2e/specialist/discover-issue-2715-school-pin-vs-empty-pill.specialist.ts` (4 tests)
- **Moved from**: `e2e/discover/issue-2715-school-pin-vs-empty-pill.spec.ts` (`#2855`)
- **Adaptations**:
  1. `git mv` to `e2e/specialist/discover-issue-2715-school-pin-vs-empty-pill.specialist.ts`
  2. Imported `{ test, expect, backendGet }` from `./support/specialist-test`
  3. Added a `test.beforeEach` pass-through handler on `**/api/discover/**` using `backendGet` that replaces `discover-smoke-seed.sql`'s external `Fixture+Photo` placeholder image URL with an inline `data:image/gif;base64,...` URI before React renders `<img>`, preventing `specialist-test.ts` Layer 2 from observing external requests while preserving 100% of real backend responses.

#### 9. `L157` — `e2e/specialist/discover-issue-2770-compact-school-context.specialist.ts` (4 tests)
- **Moved from**: `e2e/discover/issue-2770-compact-school-context.spec.ts` (`#2855`)
- **Adaptations**:
  1. `git mv` to `e2e/specialist/discover-issue-2770-compact-school-context.specialist.ts`
  2. Imported `{ test, expect, backendGet }` from `./support/specialist-test`
  3. Replaced `{ browser }` + `browser.newContext({ viewport })` with `{ page }` + `await page.setViewportSize(vp)` so `SP9` passes and every test runs under the `specialist-test.ts` request guard
  4. Updated `SCHOOL` from `'Aloysius PU College'` (hosted DB) to `'[E2E] Manipal Test College'` (seeded in `discover-smoke-seed.sql`) and applied the same `backendGet` inline-GIF sanitiser for `Fixture+Photo` image URLs.

---

## 3. Verification Evidence (Static Guards + 2x Back-to-Back Specialist Suite Runs)

### 3.1 Static & Unit Guards
- `python3 -I scripts/e2e/gen-e2e-inventory.py --check`: PASS (`specialist_spec_files` = 20, `legacy_spec_files` = 118).
- `npm run test:e2e:guard`:
  - `estate: files=120 rows=217 retired=77 scheduled=118 issue_2751_titles=66`
  - `E2E ESTATE GUARD: PASS`
  - `CANONICAL JOURNEYS STATIC: PASS`
- `npm run test:e2e:guard:unit`:
  - `tests 480 | pass 480 | fail 0`

### 3.2 Consecutive Live Specialist Suite Runs (`--workers=1`, `retries=0`)
Command executed twice back-to-back:
```bash
E2E_GATE_FRONTEND_PORT=5380 E2E_GATE_BACKEND_PORT=8380 npm run test:e2e:specialist
```

| Metric | Run 1 | Run 2 |
| :--- | :--- | :--- |
| Command exit code | `0` | `0` |
| `SPECIALIST list` | `PASS (20 files)` | `PASS (20 files)` |
| `SPECIALIST results` | `PASS (passed=123 skipped=0 flaky=0 unexpected=0 interrupted=0)` | `PASS (passed=123 skipped=0 flaky=0 unexpected=0 interrupted=0)` |
| Blocked / disallowed external requests | `0` | `0` |
| Duration | `3.3m` | `3.2m` |
| `.e2e-passed` stamp | untouched | untouched |

---

## 4. Complete Accounting of Remaining `SCHEDULED(#2855)` Rows (28 Rows)

After admitting 6 specs in Wave 1 and 9 specs in Wave 2 (**15 admitted specs total**), **28 rows remain `SCHEDULED(#2855)`** in `docs/testing/e2e-retirement-manifest.csv`.

### 4.1 Mixed Specs Empirically Tested in Wave 2 and Deferred (`13` Rows)

Each of these 13 mixed specs was moved whole (`0` deleted `test(...)` blocks), adapted to `./support/specialist-test`, and run against `pg-gate-*`. Because Wave 2 forbids deleting `test(...)` blocks, weakening assertions, or touching `scripts/db/**`, all 13 were restored to their original paths and kept `SCHEDULED(#2855)`:

| Manifest Row | Spec File | Empirical Result in `test:e2e:specialist` | Root Cause / Blocker |
| :--- | :--- | :--- | :--- |
| `L52` | `e2e/discover-area-cards.spec.ts` | `0 passed, 8 failed` (`getByTestId('discover-right-panel')` not visible) | Written for `#887` against legacy `discover-right-panel` + `.area-marker` before canonical `DiscoverAreasJourneyPanel` replaced the right-panel container on `/discover?city=udupi`. |
| `L56` | `e2e/discover-area-nav-journey.spec.ts` | `3 passed, 4 failed` (`J2b`, `J2d`, `panel Back`, `switching city` failed waiting for `getByTestId('discover-right-panel')`) | Written for `#914` against legacy `?areaKey=` + `discover-right-panel` DOM contract. |
| `L57` | `e2e/discover-area-reskin-mobile-2159.spec.ts` | `0 passed, 1 failed` (`locator('.area-listings-grid')` not visible) | Targets `JP Nagar` (unseeded in `pg-gate-*`), and on `RR Nagar` `.area-listings-grid` is not mounted in the current mobile list layout. |
| `L58` | `e2e/discover-area-selected-filters.spec.ts` | `8 passed, 24 failed` (`quick-chip-apartment`, `quick-chip-2-bhk`, `area-set-schools-tile` not visible on `/discover?areaKey=IN|KA|Udupi|Manipal`) | Legacy `?areaKey=` URL no longer mounts the pre-`#1956` `AreaSelectedPanel` quick-filter chips directly without canonical `node=` navigation. |
| `L60` | `e2e/discover-batch-b-journeys.spec.ts` | `0 passed, 8 failed` (`getByTestId('guided-entry-regions-grid')` timeout) | Written for `#1745` Batch B against legacy `guided-entry-regions-grid` landing surface superseded by `#1956` canonical navigation panels. |
| `L70` | `e2e/discover-listing-detail-reskin-desktop-2159.spec.ts` | `0 passed, 1 failed` (`expect(locator('img[alt="Property image"]').first()).toBeVisible()` failed) | Targets `JP Nagar` (0 listings in `pg-gate-*`); when pointed at `RR Nagar`, the seeded listing in `navigation-hierarchy-fixture-listings-seed.sql` has `cover_image_url = NULL`, so no `<img alt="Property image">` renders without a fixture seed or PostgREST image stub. |
| `L77` | `e2e/discover-results-redesign-1547.spec.ts` | `0 passed, 9 failed` (`getByTestId('discover-right-panel')` and `agri-group-locality-panel` not visible) | Written for `#1547` against legacy `?areaKey=` / `?region=S&maxKm=25` panels superseded by canonical `#1956` / `#2124` journey panels. |
| `L107` | `e2e/discover/issue-1762-listing-density-clustering.spec.ts` | `8 passed, 14 failed` (`Expected: 9` clusters on initial load, `Expected: 13` zoom after cluster tap) | Stubs legacy `/api/discover/areas` + `/api/discover/cities/*/listings` on `?areaKey=IN|KA|Bangalore|DenseClusterTest` without canonical `/navigation/resolve` nodes, so canonical `DiscoverAreasJourneyPanel` camera/cluster orchestration differs from the pre-`#1956` `?areaKey=` path. |
| `L108` | `e2e/discover/issue-1823-camera-fit-policy.spec.ts` | `2 passed, 4 failed` (T1/T2 cold-load `lat` null, T3 strict-mode violation on `getByText('Explore by area')` matching 2 elements, T5 timeout) | T3 uses `page.getByText('Explore by area')` which now matches 2 elements in strict mode, and T5 stubs legacy `?groupId=` routes. |
| `L122` | `e2e/discover/issue-1956-pr5-mobile-cluster-sheet.spec.ts` | `3 passed, 1 failed` (test 4 failed on `expect(page.url()).toBe(urlBeforeShowAll)`) | Since `#2076`, focusing a cluster writes `clusterFocus=...` to the URL and clicking `Show all areas` removes `clusterFocus=`, whereas PR-5's 4th test asserts `page.url()` before `Show all areas` (which carries `clusterFocus=`) equals `page.url()` after `Show all areas`. |
| `L158` | `e2e/discover/journey-switch-overlay-cleanup-1940.spec.ts` | `1 passed, 4 failed` (AC1/AC2/AC3/AC4 timed out at 30s) | Stubs legacy pre-`#2124` `/api/public/schools/by-city` + `/api/discover/regional-area-groups` routes without canonical `/navigation/resolve` endpoints required by the current Schools and Agricultural journeys. |
| `L172` | `e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts` | `0 passed, 1 failed, 5 skipped (serial)` (`getByTestId('area-group-level2')` not visible) | Navigates to legacy `?groupId=thanisandra-hennur-belt` (`area-group-level2` testid removed) and depends on the 29-area hosted DB group absent from `pg-gate-*`. |
| `L184` | `e2e/issue-2456-map-candidate-callouts.spec.ts` | `0 passed, 2 failed` (`RR Nagar identity has no digits` failed; candidate count `Expected: 6`) | Current `AreaSetCandidateCalloutLayer` member card text and candidate count on `pg-gate-*` differ from `#2456`'s assertions. |

### 4.2 Pure Specs Deferred from Wave 1 (`8` Rows)
Documented with full empirical failure logs in `docs/testing/e2e-retirement-map-2855-wave1.md`:
- `L37` — `e2e/discover-1738-regression.spec.ts` (`2 passed, 3 failed`: `marker-popover-card` not mounted on `?journey=area-first&areaKey=...&schoolId=...`)
- `L67` — `e2e/discover-correctness-1067.spec.ts` (`0 passed, 2 failed`: unseeded Padubidri schools + legacy `.area-marker`)
- `L106` — `e2e/discover/discover-mobile-guard.spec.ts` (`2 passed, 12 failed`: legacy `#1218` testids `empty-state-message`, `increase-radius-btn`)
- `L111` — `e2e/discover/issue-1956-pr2-breadcrumb.spec.ts` (`0 passed, 5 failed`: uncommitted PR-2 `d:e` / `Domlur Layout` fixture + PR-2 3-crumb assertion superseded by PR-5 4-crumb root crumb)
- `L134` — `e2e/discover/issue-2089-breadcrumb-list-flex-layout.spec.ts` (`3 passed, 1 failed`: `expect(44).toBeGreaterThan(47)` height margin at `390x844`)
- `L141` — `e2e/discover/issue-2149-mobile-school-first-marker-preview.spec.ts` (`0 passed, 3 failed`: hosted Bellandur `schoolId=666e457e-...` absent from `pg-gate-*`)
- `L148` — `e2e/discover/issue-2330-marker-reskin-visual.spec.ts` (`6 passed, 12 failed`: post-`#2330` Schools journey / marker token drift)
- `L182` — `e2e/issue-2426-search-this-area-cta-placement.spec.ts` (`0 passed, 1 failed, 2 skipped`: `search-this-area-cta` not triggered by map pan on single `node=a:...` leaf)

### 4.3 Specs Blocked by Static Guards / Unseeded SQL / Mixed Rows (`4` Rows)
- `L39` — `e2e/discover-1942-pin-price-band.spec.ts` (`SP5` `test.skip(!hasUserCreds)` + mixes 4 unit tests and 1 authed test with 1 browser test)
- `L40` — `e2e/discover-2049-resize-marker-skew.spec.ts` (`SP4` `https://example.com` + diagnostic reproducer documented as expected to fail on unfixed code)
- `L109` — `e2e/discover/issue-1956-areas-adaptive-journeys.spec.ts` (depends on uncommitted manual SQL in `Basaveshwara Nagar` / `Hosahalli`)
- `L149` — `e2e/discover/issue-2419-pr1-polygon-scope.spec.ts` (hardcodes `http://localhost:5193` + includes signed-in shopper injection)

### 4.4 Baseline-Red `#2751` Specs Pinned by `FC-24` `ISSUE_2751_FILES` (`3` Rows)
- `L66` — `e2e/discover-correctness-1064.spec.ts` (`issue_2751_titles = 2`)
- `L105` — `e2e/discover/desktop-control-bar-shell-1953.spec.ts` (`issue_2751_titles = 1`)
- `L159` — `e2e/discover/mobile-landing-journey-switcher-1953.spec.ts` (`issue_2751_titles = 2`)
