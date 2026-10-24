# E2E Retirement Map — Issue #2855 Wave 1 (Anonymous Specialist Suite Admission)

- **Issue**: `#2855` (FU-ADMIT-ANON — Specialist suite Wave 1 admission for pure anonymous `RETAIN_SPECIALIST` specs) + `#2826` (`L147` repaired in `#2886`)
- **Base commit**: `366f5a808517cf6aa5a7f276e715e33d984ce9c3` (`main`)
- **Branch**: `test/2855-specialist-wave1`
- **Target suite**: `e2e/specialist/*.specialist.ts` (`playwright.specialist.config.ts`, invoked via `npm run test:e2e:specialist` -> `bash scripts/run-e2e-gate.sh --suite=specialist`)
- **Zero-deletion invariant**: **0 `test(...)` blocks deleted**, **0 assertions weakened**. Every admitted spec was moved whole via `git mv` with mechanical fixture import adaptation (`./support/specialist-test`) and comment-only host-literal sanitisation where required by the `SP5` static guard.

---

## 1. Wave 1 Admission Summary

Wave 1 evaluated all 17 pure, non-mixed, non-`#2751` anonymous `RETAIN_SPECIALIST` candidate specs (`16` tracked under `#2855` + `1` repaired under `#2826`) against:
1. Static estate and specialist guards (`npm run test:e2e:guard` + `npm run test:e2e:guard:unit`, `SP1`–`SP9`).
2. The live disposable specialist fixture stack (`E2E_GATE_FRONTEND_PORT=5380 E2E_GATE_BACKEND_PORT=8380 npm run test:e2e:specialist`, backed by `pg-gate-*` and the local GoTrue/PostgREST auth stack, with the two-layer loopback/allowlist network guard in `e2e/specialist/support/specialist-test.ts`).

**Result**:
- **6 candidate specs (19 tests)** passed all static guards and passed 100% of their browser assertions and runtime network-isolation checks against the local disposable specialist stack across **two consecutive full-suite runs**.
- Combined with the **5 existing S0 specialist specs (45 tests)** admitted in `#2854`, the specialist suite now comprises **11 files / 64 tests** (`passed=64 skipped=0 flaky=0 unexpected=0 interrupted=0`).
- **11 candidate specs** failed empirically against the local `pg-gate-*` fixture stack, post-spec UI/URL contract evolution, or the Layer-2 `placehold.co` runtime network guard; per the Wave 1 fail-closed rule, all 11 were un-admitted back to their original paths and remain `SCHEDULED(#2855)` with full failure diagnostics recorded in Section 4.

---

## 2. Admitted Specialist Specs (6 Files, 19 Tests)

| Manifest Row | Slice | Admitted Specialist Path (`e2e/specialist/`) | Original Path | `[CODE]` Rationale | Tests |
| :--- | :--- | :--- | :--- | :--- | ---: |
| `L74` | `#2855` | `e2e/specialist/discover-mobile-map-badge-zoom-2716.specialist.ts` | `e2e/discover-mobile-map-badge-zoom-2716.spec.ts` | `[HIT_TEST]` zoom-control `elementFromPoint`, pill/zoom boxes disjoint (`analysis #136`) | 3 |
| `L104` | `#2855` | `e2e/specialist/discover-control-bar-mobile-reachability-1953.specialist.ts` | `e2e/discover/control-bar-mobile-reachability-1953.spec.ts` | `[HIT_TEST][LAYOUT_OVERFLOW]` hit-test, row h-scroll, listbox clip in real layout (`analysis #69`) | 2 |
| `L121` | `#2855` | `e2e/specialist/discover-issue-1956-pr5-desktop-breadcrumb-regression.specialist.ts` | `e2e/discover/issue-1956-pr5-desktop-breadcrumb-regression.spec.ts` | `[LAYOUT_OVERFLOW]` crumb fit `scrollWidth == clientWidth` at 1366 (`analysis #78`) | 1 |
| `L124` | `#2855` | `e2e/specialist/discover-issue-1956-pr5-s5-mobile-listing-preview.specialist.ts` | `e2e/discover/issue-1956-pr5-s5-mobile-listing-preview.spec.ts` | `[HIT_TEST][PAINT_GEOMETRY]` on-top and map-above-sheet hit-tests, compact geometry (`analysis #81`) | 6 |
| `L147` | `#2826` | `e2e/specialist/discover-issue-2305-cluster-marker-skin.specialist.ts` | `e2e/discover/issue-2305-cluster-marker-skin.spec.ts` | `[PAINT_GEOMETRY]` painted visibility, `!important` focus-ring cascade, hover tints (`analysis #89`, repaired in `#2886`) | 6 |
| `L160` | `#2855` | `e2e/specialist/discover-mobile-list-map-shell-1953.specialist.ts` | `e2e/discover/mobile-list-map-shell-1953.spec.ts` | `[LEAFLET_REAL]` tile requests `List=0 / Map>0` and Leaflet pane leak x10 (`analysis #94`) | 1 |
| **Total Admitted (Wave 1)** | | **6 files** | | | **19** |

### Per-File Adaptation & Verification Details

#### 1. `L74` — `e2e/specialist/discover-mobile-map-badge-zoom-2716.specialist.ts`
- **Moved from**: `e2e/discover-mobile-map-badge-zoom-2716.spec.ts` (`#2855`)
- **Rationale (`[HIT_TEST]`)**: Verifies at three mobile viewports (`375x667`, `390x844`, `412x915`) that the mobile Map overlay's floating status badge and the Leaflet zoom controls (`+`/`-`) have disjoint bounding boxes and that `document.elementFromPoint` at the centre of both zoom buttons hits the button itself rather than the status pill.
- **Adaptations**:
  1. `git mv e2e/discover-mobile-map-badge-zoom-2716.spec.ts e2e/specialist/discover-mobile-map-badge-zoom-2716.specialist.ts`
  2. Replaced `import { test, expect, type Page } from '@playwright/test';` with `import { test, expect, type Page } from './support/specialist-test';`
  3. Sanitised `localhost:5181` in the header comment block (`SP5` raw-file forbidden-host-literal check).
- **Tests (3/3 passed)**:
  - `@integration-ui #2716 — mobile Map overlay: status pill does not cover zoom controls at 375x667 › zoom-in (+), zoom-out (-), and the status pill have disjoint boxes; + and - pass elementFromPoint hit-testing and a real click on + increments zoom`
  - `@integration-ui #2716 — mobile Map overlay: status pill does not cover zoom controls at 390x844 › zoom-in (+), zoom-out (-), and the status pill have disjoint boxes; + and - pass elementFromPoint hit-testing and a real click on + increments zoom`
  - `@integration-ui #2716 — mobile Map overlay: status pill does not cover zoom controls at 412x915 › zoom-in (+), zoom-out (-), and the status pill have disjoint boxes; + and - pass elementFromPoint hit-testing and a real click on + increments zoom`

#### 2. `L104` — `e2e/specialist/discover-control-bar-mobile-reachability-1953.specialist.ts`
- **Moved from**: `e2e/discover/control-bar-mobile-reachability-1953.spec.ts` (`#2855`)
- **Rationale (`[HIT_TEST][LAYOUT_OVERFLOW]`)**: Verifies mobile control-bar reachability across `375x667` and `390x844`, including horizontal scroll containment, `elementFromPoint` hit-testing across control-bar pills, and Radix Select listbox viewport clipping geometry.
- **Adaptations**:
  1. `git mv e2e/discover/control-bar-mobile-reachability-1953.spec.ts e2e/specialist/discover-control-bar-mobile-reachability-1953.specialist.ts`
  2. Replaced `import { test, expect, type Page } from '@playwright/test';` with `import { test, expect, type Page } from './support/specialist-test';`
- **Tests (2/2 passed)**:
  - `Issue #1953 PR-3 — Mobile 375–390px control bar reachability › mobile 375x667: every control in the bar is reachable and operable without horizontal page overflow`
  - `Issue #1953 PR-3 — Mobile 375–390px control bar reachability › mobile 390x844: every control in the bar is reachable and operable without horizontal page overflow`

#### 3. `L121` — `e2e/specialist/discover-issue-1956-pr5-desktop-breadcrumb-regression.specialist.ts`
- **Moved from**: `e2e/discover/issue-1956-pr5-desktop-breadcrumb-regression.spec.ts` (`#2855`)
- **Rationale (`[LAYOUT_OVERFLOW]`)**: Verifies at desktop `1366x768` that every breadcrumb segment along a 4-crumb drilldown (`All Bangalore -> South East Bangalore -> Outer Ring Road -> Bellandur`) fits its text without horizontal clipping (`scrollWidth == clientWidth`).
- **Adaptations**:
  1. `git mv e2e/discover/issue-1956-pr5-desktop-breadcrumb-regression.spec.ts e2e/specialist/discover-issue-1956-pr5-desktop-breadcrumb-regression.specialist.ts`
  2. Replaced `import { test, expect } from '@playwright/test';` with `import { test, expect } from './support/specialist-test';`
- **Tests (1/1 passed)**:
  - `@integration-ui #1956 PR-5 — desktop breadcrumb regression › 4-crumb trail renders in full on 1366x768 desktop without truncating parent crumbs; clicking an ancestor navigates back`

#### 4. `L124` — `e2e/specialist/discover-issue-1956-pr5-s5-mobile-listing-preview.specialist.ts`
- **Moved from**: `e2e/discover/issue-1956-pr5-s5-mobile-listing-preview.spec.ts` (`#2855`)
- **Rationale (`[HIT_TEST][PAINT_GEOMETRY]`)**: Verifies mobile listing preview sheet (`390x844`) z-order hit-testing (`elementFromPoint` on sheet vs map canvas above sheet), compact height budget (`<= 55%` of viewport), and marker tap -> preview -> full detail -> browser Back restoration.
- **Adaptations**:
  1. `git mv e2e/discover/issue-1956-pr5-s5-mobile-listing-preview.spec.ts e2e/specialist/discover-issue-1956-pr5-s5-mobile-listing-preview.specialist.ts`
  2. Replaced `import { test, expect, type Page } from '@playwright/test';` with `import { test, expect, type Page } from './support/specialist-test';`
- **Tests (6/6 passed)**:
  - `@integration-ui #1956 PR-5 S5 — mobile map listing preview sheet › S5.1 + S5.2: tapping a property marker on mobile Map opens the compact preview sheet on top of the map and sets ?listing=<id> without leaving the map`
  - `@integration-ui #1956 PR-5 S5 — mobile map listing preview sheet › S5.3: tapping the preview sheet (View full details) opens the full listing detail surface for the same listing`
  - `@integration-ui #1956 PR-5 S5 — mobile map listing preview sheet › S5.4a: dismissing via the close button clears ?listing= while keeping the mobile Map open at the same node and camera`
  - `@integration-ui #1956 PR-5 S5 — mobile map listing preview sheet › S5.4b: tapping the exposed map canvas above the compact sheet dismisses the preview and keeps the Map open`
  - `@integration-ui #1956 PR-5 S5 — mobile map listing preview sheet › S5.5: from full listing detail (opened via the mobile map preview), browser Back returns to the Discover context with node= intact`
  - `@integration-ui #1956 PR-5 S5 — mobile map listing preview sheet › Desktop regression guard (1366x768): clicking a property marker on desktop opens the side-panel detail directly and never mounts the mobile preview sheet`

#### 5. `L147` — `e2e/specialist/discover-issue-2305-cluster-marker-skin.specialist.ts`
- **Moved from**: `e2e/discover/issue-2305-cluster-marker-skin.spec.ts` (`#2826`, repaired in `#2886` / merge `44bf41a5`)
- **Rationale (`[PAINT_GEOMETRY]`)**: Verifies computed CSS styles, painted dimensions, hover background transitions, and `!important` `:focus-visible` outline cascade on Leaflet cluster/destination markers across Areas and Schools journeys.
- **Adaptations**:
  1. `git mv e2e/discover/issue-2305-cluster-marker-skin.spec.ts e2e/specialist/discover-issue-2305-cluster-marker-skin.specialist.ts`
  2. Replaced `import { test, expect, type Page } from '@playwright/test';` with `import { test, expect, type Page } from './support/specialist-test';`
  3. Sanitised `http://127.0.0.1:5174` in the header comment block (`SP5` raw-file forbidden-host-literal check).
- **Tests (6/6 passed)**:
  - `Issue #2305 — cluster / destination marker skin (Areas + Schools) › 1. Areas root (city=bangalore, journey=area-first): direction markers wear the terracotta skin`
  - `Issue #2305 — cluster / destination marker skin (Areas + Schools) › 2. Areas sub-cluster (node=d:southeast): sub-cluster markers wear the same terracotta skin with smaller min-width`
  - `Issue #2305 — cluster / destination marker skin (Areas + Schools) › 3. Schools journey: area-cluster markers wear the unified terracotta skin (no hero modifier) and never mount the legacy blue circle`
  - `Issue #2305 — cluster / destination marker skin (Areas + Schools) › 4. Selected state (Areas leaf node): selected marker flips to dark terracotta #A84A28 with the 4px ring`
  - `Issue #2305 — cluster / destination marker skin (Areas + Schools) › 5. Hover + keyboard focus-visible on a destination marker: background darkens on hover and the 2px terracotta focus ring wins over the reset`
  - `Issue #2305 — cluster / destination marker skin (Areas + Schools) › 6. Regression guard: drilling to an area with listings leaves .property-price-marker on the white card skin, not terracotta`

#### 6. `L160` — `e2e/specialist/discover-mobile-list-map-shell-1953.specialist.ts`
- **Moved from**: `e2e/discover/mobile-list-map-shell-1953.spec.ts` (`#2855`)
- **Rationale (`[LEAFLET_REAL]`)**: Verifies at mobile `390x844` that the List-default shell mounts zero `.leaflet-container` elements and issues zero tile requests until Map is opened, and that 10 rapid `List <-> Map` cycles leak zero detached Leaflet panes.
- **Adaptations**:
  1. `git mv e2e/discover/mobile-list-map-shell-1953.spec.ts e2e/specialist/discover-mobile-list-map-shell-1953.specialist.ts`
  2. Replaced `import { test, expect } from '@playwright/test';` with `import { test, expect } from './support/specialist-test';`
- **Tests (1/1 passed)**:
  - `Issue #1953 PR-2 — Mobile 390x844 List-default + full-screen Map toggle › mobile 390x844: List-first landing, single floating Map CTA, full-screen Map overlay, state preservation, and 10x rapid toggle stability`

---

## 3. Verification Evidence (Static Guards + 2x Back-to-Back Specialist Suite Runs)

### 3.1 Static & Unit Guards
- `python3 scripts/e2e/gen-e2e-inventory.py`: Regenerated `docs/testing/e2e-inventory.md` (`RETAIN_SPECIALIST` = 11 files, `SCHEDULED(#2855)` = 37 rows, `SCHEDULED(#2826)` = 2 rows).
- `npm run test:e2e:guard`:
  - `estate: files=129 rows=217 retired=77 scheduled=127 issue_2751_titles=66`
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
| `SPECIALIST list` | `PASS (11 files)` | `PASS (11 files)` |
| `SPECIALIST results` | `PASS (passed=64 skipped=0 flaky=0 unexpected=0 interrupted=0)` | `PASS (passed=64 skipped=0 flaky=0 unexpected=0 interrupted=0)` |
| Blocked / disallowed external requests | `0` | `0` |
| Duration | `1.4m` | `1.4m` |
| `.e2e-passed` stamp | untouched | untouched |

All 11 specialist files verified in both runs:
1. `e2e/specialist/buyer-journey-1960-back-navigation.specialist.ts` (3 tests, `#2854`)
2. `e2e/specialist/discover-control-bar-mobile-reachability-1953.specialist.ts` (2 tests, `#2855` Wave 1)
3. `e2e/specialist/discover-issue-1956-pr5-desktop-breadcrumb-regression.specialist.ts` (1 test, `#2855` Wave 1)
4. `e2e/specialist/discover-issue-1956-pr5-s5-mobile-listing-preview.specialist.ts` (6 tests, `#2855` Wave 1)
5. `e2e/specialist/discover-issue-2090- pills-and- sheet-polish.specialist.ts` (12 tests, `#2854`)
6. `e2e/specialist/discover-issue-2305-cluster-marker-skin.specialist.ts` (6 tests, `#2826` Wave 1)
7. `e2e/specialist/discover-Keyboard-And-Aria.specialist.ts` (6 tests, `#2854`)
8. `e2e/specialist/discover-mobile-list-map-shell-1953.specialist.ts` (1 test, `#2855` Wave 1)
9. `e2e/specialist/discover-mobile-map-badge-zoom-2716.specialist.ts` (3 tests, `#2855` Wave 1)
10. `e2e/specialist/discover-mobile-map-filters-2712.specialist.ts` (19 tests, `#2854`)
11. `e2e/specialist/issue-2759-consent-clickable.specialist.ts` (5 tests, `#2854`)

---

## 4. Complete Accounting of Remaining `SCHEDULED(#2855)` and `SCHEDULED(#2826)` Rows

After admitting the 6 Wave 1 specs above, **37 rows remain `SCHEDULED(#2855)`** and **2 rows remain `SCHEDULED(#2826)`** in `docs/testing/e2e-retirement-manifest.csv`. Every row is accounted for below.

### 4.1 Category A — 11 Pure Anonymous Candidates Empirically Tested in Wave 1 and Deferred (`SCHEDULED(#2855)`)

Each of these 11 specs was adapted to `./support/specialist-test` and executed live under `E2E_GATE_FRONTEND_PORT=5380 E2E_GATE_BACKEND_PORT=8380 npm run test:e2e:specialist`. Because Wave 1 forbids deleting `test(...)` blocks, weakening assertions, or modifying shared database fixtures, all 11 were restored to their original paths and kept `SCHEDULED(#2855)`.

| Manifest Row | Spec File | Empirical Result in `test:e2e:specialist` | Root Cause / Blocker for Follow-Up |
| :--- | :--- | :--- | :--- |
| `L37` | `e2e/discover-1738-regression.spec.ts` | `2 passed, 3 failed` (`dismiss via Escape`, `dismiss via background click`, `dismiss via X button` timed out at 30s waiting for `getByTestId('marker-popover-card')`) | Post-`#1956` PR-6 rework mounts canonical `DiscoverAreasJourneyPanel` unconditionally when `journey=area-first` is in the URL; `/discover?city=udupi&journey=area-first&areaKey=...&schoolId=...` no longer enters legacy `area-school-combined` panel state that gates `isAreaFirstPopoverEligible`. |
| `L67` | `e2e/discover-correctness-1067.spec.ts` | `0 passed, 2 failed` (Spec 1 failed waiting for `heading /Schools in Padubidri/i`; Spec 2 failed waiting for `.leaflet-marker-icon.area-marker`) | `discover-smoke-seed.sql` only seeds Udupi Manipal (`[E2E] Manipal Test College`), not Padubidri schools (`Kinara Global School`), and `/discover?city=udupi&journey=school-first` now mounts canonical `SchoolsNavigationJourneyPanel` + `area-destination-marker` instead of legacy `SchoolsInAreaPanel` + `.area-marker`. |
| `L106` | `e2e/discover/discover-mobile-guard.spec.ts` | `2 passed, 12 failed` (AC2/AC3/AC3b/AC4 timed out on `empty-state-message`, `increase-radius-btn`, `combined-empty-state-message`; AC4 triggered runtime guard on `https://placehold.co/800x600?text=E2E+Fixture+Photo+1`; AC5 failed on `journey` param `Received: "school-first"`) | Written for `#1218` against pre-`#1956`/`#2124` legacy `SchoolSelectedPanel` testids and legacy `Start Over` URL-clearing contract, plus Udupi fixture `placehold.co` image URLs. |
| `L111` | `e2e/discover/issue-1956-pr2-breadcrumb.spec.ts` | `0 passed, 5 failed` (all 5 tests timed out waiting for `getByTestId('navigation-child-card-d:e')`) | Written against a temporary PR-2 fixture (`d:e` East Bangalore -> `c:e:...domlur-layout` -> `Domlur Layout`); committed `navigation-hierarchy-fixture-seed.sql` (`#1956` PR-5 / `#2086`) seeds `d:northeast`, `d:southeast`, `d:southwest` instead of `d:e`/`d:w`. |
| `L119` | `e2e/discover/issue-1956-pr4-mobile-listings-scroll.spec.ts` | `0 passed, 2 failed` (timed out waiting for `areas-journey-panel-listings` and `areas-journey-panel-listings-error`) | Navigates to `node=a:IN|KA|Bengaluru|Basaveshwara Nagar`, which belonged to the pre-`#2086` `d:w` West Bangalore fixture and is absent from committed `navigation-hierarchy-fixture-seed.sql`. |
| `L131` | `e2e/discover/issue-2083-home-breadcrumb-back-camera-race.spec.ts` | Intermittent flake (`passed` in isolated run, `failed` in full suite Run 1: `Error: trial 1: Area camera must carry a real lat before Home is clicked \| expect(received).not.toBeNull() \| Received: null` at line 154) | `waitForSettledCamera(page)` only checks `node === expectedNode` across two 450ms samples without waiting for the debounced `lat`/`lon`/`zoom` URL write to land after area drilldown (same camera-URL timing family as `L130` `issue-2083-camera-back-determinism.spec.ts` in `#2826`). |
| `L134` | `e2e/discover/issue-2089-breadcrumb-list-flex-layout.spec.ts` | `3 passed, 1 failed` (`a deep/long trail wraps onto a second line; a shallow 2-crumb trail stays single-line` failed: `expect(44).toBeGreaterThan(47)`) | At `390x844` on current `main`, the 4-crumb wrapped trail height is `44px` vs `42px` for the 2-crumb single-line trail (`44 > 42`), which misses the spec's `shallowBox.height + 5` (`47px`) margin. |
| `L141` | `e2e/discover/issue-2149-mobile-school-first-marker-preview.spec.ts` | `0 passed, 3 failed` (`schoolId must be present on initial load: expect(null).toBe("666e457e-1bcc-4d1a-834d-dd250d23865b")`; desktop failed on `property markers must attach`) | Spec header explicitly notes: *"Do not run this spec against a fixture-seeded backend; it will find zero listings."* `schoolId=666e457e-...` is a hosted-DB Bellandur school UUID absent from `pg-gate-*` (404 clears `schoolId`). |
| `L148` | `e2e/discover/issue-2330-marker-reskin-visual.spec.ts` | `6 passed, 12 failed` (`area-destination-marker` count 0 on Schools journey root, `.rc-footer` color `rgb(176, 92, 58)`, `areas-cluster-focus-panel` not visible) | Post-`#2330` Schools journey / marker token drift (same class of drift repaired for `L147` `issue-2305-cluster-marker-skin.spec.ts` in `#2826` / `#2886`, not yet repaired for `issue-2330`). |
| `L156` | `e2e/discover/issue-2715-school-pin-vs-empty-pill.spec.ts` | `0 passed, 4 failed` (all DOM assertions passed across 4 viewports, but `specialist-test.ts` teardown failed with `specialist runtime guard: 1 request(s) to a non-allowed host: external: https://placehold.co/800x600?text=E2E+Fixture+Photo+1 (observed by layer 2: 1)`) | `scripts/db/fixtures/discover-smoke-seed.sql` seeds `https://placehold.co/800x600?text=E2E+Fixture+Photo+1` as `cover_image_url` for Udupi Manipal listings. Even when intercepted via `page.route`, `specialist-test.ts` Layer 2 (`context.on('request')`) observes browser image requests before route fulfillment and rejects `placehold.co` (not in `SPECIALIST_ALLOWED_EXTERNAL_HOSTS`). Requires either replacing `placehold.co` in `discover-smoke-seed.sql` with a loopback/data URI or updating the fixture seed in a dedicated PR. |
| `L182` | `e2e/issue-2426-search-this-area-cta-placement.spec.ts` | `0 passed, 1 failed, 2 skipped (serial)` (`desktop 1366x768: full lifecycle` timed out on `expect(getByTestId('search-this-area-cta')).toBeVisible()` after map pan) | Drilling `d:southeast -> a:IN|KA|Bengaluru|RR Nagar` sets a canonical `node=a:...` leaf rather than a committed `AREA_SET` (`rscope=areas`), so panning the map does not trigger `search-this-area-cta`. |

### 4.2 Category B — 4 Pure-Labeled `#2855` Specs Blocked by Static Guards / Unseeded Fixtures / Mixed Rows

| Manifest Row | Spec File | Blocker Reason |
| :--- | :--- | :--- |
| `L39` | `e2e/discover-1942-pin-price-band.spec.ts` | Contains `test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured')` at line 275 (`SP8` forbids `test.skip`), and mixes 4 pure helper unit tests + 1 authenticated test with the 1 `[LEAFLET_REAL]` cluster-absorption browser test. |
| `L40` | `e2e/discover-2049-resize-marker-skew.spec.ts` | Contains `https://example.com/resize-skew.jpg` in stub payload (`SP5`/`SP9` forbidden host literal) and is a diagnostic defect reproducer documented in its header as expected to fail on unfixed code (`PropertyMap` resize without `window` resize event). |
| `L109` | `e2e/discover/issue-1956-areas-adaptive-journeys.spec.ts` | Depends on manual ad-hoc SQL (`INSERT INTO property_listings` in `Basaveshwara Nagar` and `Hosahalli`, pre-`#2086` `d:w`/`d:s` fixture nodes absent from `navigation-hierarchy-fixture-seed.sql`), and mixes non-browser seam rows (`AC4.1/AC4.11`, `AC4.2`, `AC4.7`, `J7d`, `J7e`, `#2051`) with the single `J7c` `[LEAFLET_REAL]` row. |
| `L149` | `e2e/discover/issue-2419-pr1-polygon-scope.spec.ts` | Hardcodes `const FRONTEND = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5193'` (`SP5` forbidden host literal + wrong port under specialist gate `PLAYWRIGHT_BASE_URL=http://localhost:5380`), and mixes 7 URL/rejection/auth tests (including signed-in shopper injection) with the `Q-2419 A` `scopeBar.toBeInViewport` geometry check. |

### 4.3 Category C — 3 Baseline-Red `#2751` Specs Pinned by `ISSUE_2751_FILES` (`issue_2751_titles > 0`)

| Manifest Row | Spec File | `issue_2751_titles` | Blocker Reason |
| :--- | :--- | ---: | :--- |
| `L66` | `e2e/discover-correctness-1064.spec.ts` | `2` | Baseline-red in `#2751` (pinned by `FC-24` `ISSUE_2751_FILES` in `scripts/e2e/check-e2e-estate.mjs`) and mixed spec (`N15` exact-URL row scheduled for trimming to `#2859`). |
| `L105` | `e2e/discover/desktop-control-bar-shell-1953.spec.ts` | `1` | Baseline-red in `#2751` (pinned by `FC-24` `ISSUE_2751_FILES`; moving or renaming without `#2751` resolution fails `FC-24`). |
| `L159` | `e2e/discover/mobile-landing-journey-switcher-1953.spec.ts` | `2` | Baseline-red in `#2751` (pinned by `FC-24` `ISSUE_2751_FILES`; moving or renaming without `#2751` resolution fails `FC-24`). |

### 4.4 Category D — 19 Mixed `#2855` Specs Awaiting Lower-Level Seam Trimming (`#2857` / `#2858` / `#2859`) & Owner Deletion Gate

Per the manifest rationale and zero-deletion rule, these 19 specs contain both `[CODE]` browser-retained rows and non-browser seam rows scheduled for lower-level Vitest migration (`#2857`, `#2858`, `#2859`). Admitting them into `e2e/specialist/` requires trimming the non-browser `test(...)` blocks (which is gated on lower-level test landed proof + explicit owner deletion-gate approval):

1. `L52` — `e2e/discover-area-cards.spec.ts` (`[PAINT_GEOMETRY][LEAFLET_REAL]`; non-browser rows -> `#2859`)
2. `L56` — `e2e/discover-area-nav-journey.spec.ts` (`[LEAFLET_REAL][POINTER_REAL]`; non-browser rows -> `#2859`)
3. `L57` — `e2e/discover-area-reskin-mobile-2159.spec.ts` (`[LAYOUT_OVERFLOW]`; non-browser rows -> `#2859`)
4. `L58` — `e2e/discover-area-selected-filters.spec.ts` (`[LEAFLET_REAL][PAINT_GEOMETRY]`; 6 lower-level rows -> `#2859`)
5. `L60` — `e2e/discover-batch-b-journeys.spec.ts` (`[LEAFLET_REAL][LAYOUT_OVERFLOW]`; lower-level rows -> `#2859`)
6. `L70` — `e2e/discover-listing-detail-reskin-desktop-2159.spec.ts` (`[LAYOUT_OVERFLOW]`; non-browser rows -> `#2859`)
7. `L71` — `e2e/discover-listing-detail-reskin-mobile-2159.spec.ts` (`[LAYOUT_OVERFLOW]`; non-browser rows -> `#2859`)
8. `L73` — `e2e/discover-map-info-dock-2748.spec.ts` (`[HIT_TEST][PAINT_GEOMETRY]`; rows D1a/D4/D7b/D9 -> `#2859`)
9. `L77` — `e2e/discover-results-redesign-1547.spec.ts` (`[PAINT_GEOMETRY][LEAFLET_REAL]`; non-browser rows -> `#2859`)
10. `L91` — `e2e/discover-schools-mobile-cluster-2124.spec.ts` (`[POINTER_REAL][LEAFLET_REAL]`; jsdom-coverable rows -> `#2857`)
11. `L107` — `e2e/discover/issue-1762-listing-density-clustering.spec.ts` (`[LEAFLET_REAL][HIT_TEST]`; non-browser rows -> `#2858`)
12. `L108` — `e2e/discover/issue-1823-camera-fit-policy.spec.ts` (`[LEAFLET_REAL]`; T3 row -> `#2858`)
13. `L117` — `e2e/discover/issue-1956-pr4-listing-peek-camera-restore.spec.ts` (`[LEAFLET_REAL]`; non-browser rows -> `#2858`)
14. `L122` — `e2e/discover/issue-1956-pr5-mobile-cluster-sheet.spec.ts` (`[HIT_TEST]`; non-browser rows -> `#2858`)
15. `L137` — `e2e/discover/issue-2089-pan-preserves-listing-preview.spec.ts` (`[LEAFLET_REAL]`; non-browser rows -> `#2858`)
16. `L157` — `e2e/discover/issue-2770-compact-school-context.spec.ts` (`[PAINT_GEOMETRY]`; order row -> `#2857`)
17. `L158` — `e2e/discover/journey-switch-overlay-cleanup-1940.spec.ts` (`[LEAFLET_REAL]`; non-browser rows -> `#2858`)
18. `L172` — `e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts` (`[PAINT_GEOMETRY]`; R5/R6 rows -> `#2858`)
19. `L184` — `e2e/issue-2456-map-candidate-callouts.spec.ts` (`[POINTER_REAL]`; non-browser rows -> `#2859`)

*(Note: `L66` is counted in Category C above and is also a mixed spec with `N15` -> `#2859`, bringing the total remaining `SCHEDULED(#2855)` rows to `11 + 4 + 3 + 19 = 37`.)*

### 4.5 Category E — Remaining `SCHEDULED(#2826)` Rows (2 Rows)

| Manifest Row | Spec File | Status | Reason |
| :--- | :--- | :--- | :--- |
| `L100` | `e2e/discover/active-context-chips-and-badge.spec.ts` | `SCHEDULED(#2826)` | Red at base (`#2823` body); repair-or-delete owner decision tracked in `#2826` before any specialist admission. |
| `L130` | `e2e/discover/issue-2083-camera-back-determinism.spec.ts` | `SCHEDULED(#2826)` | Red at base (`#2823` body); repair-or-delete owner decision tracked in `#2826` before any specialist admission. |
