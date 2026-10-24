# E2E Specialist Suite Admission Map — Issues `#2856` (`FU-ADMIT-AUTH`) & `#2826` (`FU-ADMIT-RED`)

## Overview

- **Issues:** `#2856` (authenticated `RETAIN_SPECIALIST` admission via local-auth stack) and `#2826` (red-at-base `RETAIN_SPECIALIST` repair/defer evaluation).
- **Base Commit:** `76e0b78ac12cf6ab8b68079f9ed5c440fc4749e8` (`main`).
- **Specialist Suite Verification:** Two consecutive full runs of `E2E_GATE_FRONTEND_PORT=5385 E2E_GATE_BACKEND_PORT=8385 npm run test:e2e:specialist` passed (`passed=88 skipped=0 flaky=0 unexpected=0 interrupted=0`, `SPECIALIST SUITE: PASS`).
- **Coverage Preservation:** **0 `test(...)` blocks deleted** across all admitted specialist specs (23/23 `test(...)` blocks preserved and green).

---

## Summary Table

| Manifest Line | Original Spec Path | Issue | Disposition | Target Path / Status | Browser Property Tags | Tests |
|---|---|---|---|---|---|---|
| `L36` | `e2e/commercial-subtype-wrap-2450.spec.ts` | `#2856` | **ADMITTED** (`RETAIN_SPECIALIST`) | `e2e/specialist/commercial-subtype-wrap-2450.specialist.ts` | `[LAYOUT_OVERFLOW]` | 3/3 PASS |
| `L78` | `e2e/discover-results-reskin-2729.spec.ts` | `#2856` | **ADMITTED** (`RETAIN_SPECIALIST`) | `e2e/specialist/discover-results-reskin-2729.specialist.ts` | `[RADIX_REAL]` | 6/6 PASS |
| `L98` | `e2e/discover-viewport-truncation.spec.ts` | `#2856` | **ADMITTED** (`RETAIN_SPECIALIST`) | `e2e/specialist/discover-viewport-truncation.specialist.ts` | `[LEAFLET_REAL]` | 4/4 PASS |
| `L179` | `e2e/issue-2016-result-scope-contract.spec.ts` | `#2856` | **ADMITTED** (`RETAIN_SPECIALIST`) | `e2e/specialist/issue-2016-result-scope-contract.specialist.ts` | `[LEAFLET_REAL]` | 6/6 PASS |
| `L211` | `e2e/residential-required-fields-2040.spec.ts` | `#2856` | **ADMITTED** (`RETAIN_SPECIALIST`) | `e2e/specialist/residential-required-fields-2040.specialist.ts` | `[PAINT_GEOMETRY]` | 4/4 PASS |
| `L123` | `e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts` | `#2856` | **DEFERRED** (`SCHEDULED(#2856)`) | Kept at `e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts` | `[PAINT_GEOMETRY][HIT_TEST]` | Deferred (post-`#1956` product contract drift) |
| `L181` | `e2e/issue-2419-mobile-invalid-polygon.spec.ts` | `#2856` | **DEFERRED** (`SCHEDULED(#2856)`) | Kept at `e2e/issue-2419-mobile-invalid-polygon.spec.ts` | `[LEAFLET_REAL][PAINT_GEOMETRY][HIT_TEST]` | Deferred (`test.fixme` `SP5` + `#2472` Undo contract change) |
| `L185` | `e2e/issue-2461-polygon-panel-parity.spec.ts` | `#2856` | **DEFERRED** (`SCHEDULED(#2856)`) | Kept at `e2e/issue-2461-polygon-panel-parity.spec.ts` | `[LEAFLET_REAL]` | Deferred (`FC-24` `ISSUE_2751_FILES` pin) |
| `L100` | `e2e/discover/active-context-chips-and-badge.spec.ts` | `#2826` | **DEFERRED** (`SCHEDULED(#2826)`) | Kept at `e2e/discover/active-context-chips-and-badge.spec.ts` | `[RADIX_REAL]` | Deferred (retired `DiscoverRightPanel` surface) |
| `L130` | `e2e/discover/issue-2083-camera-back-determinism.spec.ts` | `#2826` | **DEFERRED** (`SCHEDULED(#2826)`) | Kept at `e2e/discover/issue-2083-camera-back-determinism.spec.ts` | `[LEAFLET_REAL]` | Deferred (post-`#2016` AREA leaf URL camera write drift) |

---

## Admitted Specs (`#2856` — 5 files, 23 test cases)

### 1. `L36` — `e2e/specialist/commercial-subtype-wrap-2450.specialist.ts`
- **Moved from:** `e2e/commercial-subtype-wrap-2450.spec.ts` (`git mv`).
- **Browser property (`[LAYOUT_OVERFLOW]`):** Verifies at `390x844` that the Commercial subtype chip row (`quick-subtype-row`) does not scroll horizontally (`scrollWidth <= clientWidth`), wraps onto multiple lines (`Set(tops).size > 1`), and renders every chip label in full without ellipsis (`scrollWidth <= clientWidth` across ancestors and descendants).
- **Adaptations (`SP1–SP9` & Local Auth):**
  - Imported `test, expect` from `./support/specialist-test` (`SP7`).
  - Replaced legacy hosted `test.use({ storageState })` (`SP6`) and `readSmokeUserEmailFromStorageState()` (`fs` read of `.auth/smoke-user.json`) with local-auth `loginAsUser(page, process.env.SMOKE_USER_EMAIL!, process.env.SMOKE_USER_PASSWORD!)` and a live `localStorage` `sb-*-auth-token` assertion.
  - Updated the area-leaf container readiness wait from the non-existent `area-selected-panel` testid to `areas-journey-panel-listings`.
  - Added an `addInitScript` image-`src` guard rewriting the seeded Udupi fixture listing placeholder photo (`800x600?text=E2E+Fixture+Photo`) to an inline `data:` URI so the specialist runtime guard never observes an outbound request to `placehold.co`.
- **Tests preserved:** 3/3 (`does not scroll horizontally`, `wraps onto more than one line rather than fitting by shrinking`, `shows every label in full — nothing ellipsised to make it fit`).

### 2. `L78` — `e2e/specialist/discover-results-reskin-2729.specialist.ts`
- **Moved from:** `e2e/discover-results-reskin-2729.spec.ts` (`git mv`).
- **Browser property (`[RADIX_REAL]`):** Exercises `CompactResultsHeader`, filter pill popovers (`filter-pill-budget`, `filter-pill-family`), multi-area chip removal, global search input `Escape` / outside-click blur / browser `Back`, and signed-in `ScopeActionsMenu` (`Options` -> `Draw search area` closes menu and arms `draw-mode-overlay`; `Escape` closes menu and returns focus to `scope-actions-menu-trigger`).
- **Adaptations (`SP1–SP9` & Local Auth):**
  - Imported `test, expect` from `./support/specialist-test` (`SP7`).
  - Replaced `test.use({ storageState: 'e2e/.auth/broker.json' })` (`SP6`) in the signed-in `Options` scope menu describe block with `loginAsBroker(page, process.env.BROKER_EMAIL!, process.env.BROKER_PASSWORD!)` in `test.beforeEach`.
- **Tests preserved:** 6/6.

### 3. `L98` — `e2e/specialist/discover-viewport-truncation.specialist.ts`
- **Moved from:** `e2e/discover-viewport-truncation.spec.ts` (`git mv`).
- **Browser property (`[LEAFLET_REAL]`):** Exercises `MarkersTruncationNotice` on `MapDiscovery` (`MT-1` truncated notice visibility, `MT-2` non-truncated absence, `MT-3` listing-card count independence from marker truncation, `MT-4` non-blocking Leaflet `.leaflet-control-zoom-in` clickability).
- **Adaptations (`SP1–SP9` & Local Auth):**
  - Imported `test, expect` from `./support/specialist-test` (`SP7`).
  - Removed `import { USER_STORAGE_STATE } from './playwright.config'` (`SP3`) and `test.use({ storageState: USER_STORAGE_STATE })` (`SP6`); authenticated via `loginAsUser(page, process.env.SMOKE_USER_EMAIL!, process.env.SMOKE_USER_PASSWORD!)` in `stubSupportingEndpoints(page)`.
  - Added `centreLat: AREA_LAT, centreLon: AREA_LON` to `NAVIGATION_RESOLVE_FIXTURE.node.bounds` so `deriveAreaPointFromNode` resolves a non-null `AreaPoint` for `AreaLeafListingsSurface`, and updated `MT-3` to wait for `areas-journey-panel-listings`.
- **Tests preserved:** 4/4 (`MT-1`, `MT-2`, `MT-3`, `MT-4`).

### 4. `L179` — `e2e/specialist/issue-2016-result-scope-contract.specialist.ts`
- **Moved from:** `e2e/issue-2016-result-scope-contract.spec.ts` (`git mv`).
- **Browser property (`[LEAFLET_REAL]`):** Exercises real Leaflet.Draw polygon vertex placement (`drawPolygonOnMap`), `ReplaceResultScopeDialog` (`rscope=poly` / `rpoly` commit), single-step Browser `Back` restoring `rscope=areas`, reload persistence for `POLYGON` and `AREA_SET`, `VIEWPORT` URL round-trip without 400 exclusivity rejections, and listing-detail navigation -> Browser `Back` scope preservation.
- **Adaptations (`SP1–SP9` & Local Auth):**
  - Imported `test, expect` from `./support/specialist-test` (`SP7`).
  - Removed `test.use({ storageState: 'e2e/.auth/smoke-user.json' })` (`SP6`) and `fs.existsSync` skip guard (`SP5`), authenticating the signed-in shopper describe block via `loginAsUser(page, process.env.SMOKE_USER_EMAIL!, process.env.SMOKE_USER_PASSWORD!)` in `test.beforeEach`.
  - Tightened triangle vertex offsets in `drawPolygonOnMap` (`0.45 / 0.55 / 0.5` width, `0.45 / 0.47 / 0.55` height) so the drawn triangle never exceeds the maximum polygon area limit (`"This search area is too large"`) when the map is at city-wide zoom.
  - Pointed test 5 (`opening a listing detail and returning via Browser Back preserves the exact prior AREA_SET scope`) at `reachCommittedRrNagarAreaSet(page)` (which has 2 seeded listings in the local fixture DB, removing the banned `test.skip(!hasCard)` call) and asserted returning to `/discover` with `node`, `rscope=areas`, and `rareas=IN|KA|Bengaluru|RR Nagar` intact.
- **Tests preserved:** 6/6 (`1`, `2`, `3b`, `3a`, `4`, `5`).

### 5. `L211` — `e2e/specialist/residential-required-fields-2040.specialist.ts`
- **Moved from:** `e2e/residential-required-fields-2040.spec.ts` (`git mv`).
- **Browser property (`[PAINT_GEOMETRY]`):** Proves on desktop (`1280x800`) and mobile (`390x844`) that the apartment `Built-up area` field is visible in the core `Property details` section without expanding collapsed sections (`AC1/AC2`), that clicking `Review` with `builtArea` empty scrolls and focuses `#builtArea` without overlapping the fixed sticky mobile footer (`AC5` bounding-box non-intersection check), and that filling `builtArea` proceeds to the Review screen.
- **Adaptations (`SP1–SP9` & Local Auth):**
  - Imported `test, expect` from `./support/specialist-test` (`SP7`).
  - Removed `test.use({ storageState: { cookies: [], origins: [] } })` (`SP6`).
  - Replaced external `nominatim.openstreetmap.org` and `example.invalid` URL literals (`SP4`) with loopback paths (`**/nominatim-Reverse**`, `**/nominatim-Search**`, `/e2e-mock-storage/upload`, `/e2e-mock-public/listing-2040.png`) intercepted via `page.route`.
  - Updated `mockSupabaseAuth(page)` to inject the synthetic broker session under `sb-localhost-auth-token` and `sb-127-auth-token` (matching the local `--suite=specialist` bundle's `VITE_SUPABASE_URL` storage key) and rewrite `AddressPicker`'s default Leaflet marker icon `src` (`ajax/libs/leaflet/`) to an inline `data:` URI so opening the map-pin dialog does not trigger an outbound request to `cdnjs.cloudflare.com`.
- **Tests preserved:** 4/4 (2 desktop + 2 mobile).

---

## Deferred Specs (`#2856` & `#2826` — 5 files)

### 6. `L123` — `e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts` (`SCHEDULED(#2856)`)
- **Status:** Left at original path `e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts` (`SCHEDULED(#2856)`).
- **Root Cause (Empirical Local Stack Run):**
  1. **Post-`#1956` Product Contract Drift in `S4/AC5.3/AC5.8/AC5.12` (lines 186–195):** The test asserts that a single AREA leaf (`node=a:IN|KA|Bengaluru|RR Nagar`) renders zero matches for `/add nearby areas/i` (`for (const forbidden of [..., /add nearby areas/i, ...]) await expect(page.getByText(forbidden)).toHaveCount(0)`). Issue `#2017` (`AreaSelectedPanel.tsx` / `WorkflowGroup`) intentionally added the `"Add nearby areas"` recommendation tile to single-area `AREA_SET` leaves, causing `S4` to fail against current product behavior.
  2. **Post-`#1956` Marker Clustering Drift in `AC5.4` (lines 380–386):** At `node=c:northeast:hoskote-kannamangala-whitefield-hoskote-road` on a `390x844` viewport, `AC5.4` waits for `[data-testid="area-single-marker"][data-node-key="a:IN|KA|Bengaluru|Hoskote"]`, which times out because `#1943` containment camera-fit and `#1956 PR-3` client-side visual clustering merge the cluster's children at the initial mobile zoom.
  - Because resolving these requires an owner decision on updating or trimming the superseded `S4` and `AC5.4` assertions, the spec remains `SCHEDULED(#2856)`.

### 7. `L181` — `e2e/issue-2419-mobile-invalid-polygon.spec.ts` (`SCHEDULED(#2856)`)
- **Status:** Left at original path `e2e/issue-2419-mobile-invalid-polygon.spec.ts` (`SCHEDULED(#2856)`).
- **Root Cause:**
  1. Contains `test.fixme('C2. Undo with a single point removes it and disables Undo (reproduced defect — see PR)', ...)` at line 617, which is a hard static failure under `SP5` (`check-e2e-estate.mjs`) and `SP-RESULTS` (`verifySpecialistResults`).
  2. Test `C1` (line 585) asserts `await expect(undo, '1 vertex -> Undo enabled').toBeEnabled()`, whereas Issue `#2472` (`apps/web/src/features/discover/components/map/DrawModeOverlay.tsx:116`, `disabled={vertexCount <= 1}`) intentionally keeps `Undo` disabled at 1 vertex because Leaflet.Draw's `deleteLastVertex()` is a no-op at 1 vertex.
  - Admitting `L181` requires an owner decision on retiring/updating `C1` and `C2` to match `#2472`.

### 8. `L185` — `e2e/issue-2461-polygon-panel-parity.spec.ts` (`SCHEDULED(#2856)`)
- **Status:** Left at original path `e2e/issue-2461-polygon-panel-parity.spec.ts` (`SCHEDULED(#2856)`).
- **Root Cause:** Pinned in `ISSUE_2751_FILES` in `scripts/e2e/check-e2e-estate.mjs` (`e2e/issue-2461-polygon-panel-parity.spec.ts: 1`). Moving the file out of `e2e/issue-2461-polygon-panel-parity.spec.ts` triggers estate guard `FC-24` (`issue #2751 spec missing on disk`) unless `scripts/e2e/check-e2e-estate.mjs` (outside `#2856` scope) is modified.

### 9. `L100` — `e2e/discover/active-context-chips-and-badge.spec.ts` (`SCHEDULED(#2826)`)
- **Status:** Left at original path `e2e/discover/active-context-chips-and-badge.spec.ts` (`SCHEDULED(#2826)`).
- **Root Cause:** All 7 tests (`CHIP-1` through `CHIP-5`, `BADGE-1`, `BADGE-2`) navigate to `/discover?city=udupi&journey=area-first&groupId=coastal-strip...` and assert on `DiscoverRightPanel`'s `active-context-chips`, `chip-type`, `chips-overflow-trigger`, and `start-over-button`. Commit `1bd4ae0f` (`#1956 PR-6`) replaced `journey=area-first` unconditionally with `AreaFirstJourneyPanel` (`DiscoverAreasJourneyPanel`), and `#2213` replaced `groupId=` group focus (`CHIP-2`) with `AreaGroupFocusPanel`. Neither surface mounts `DiscoverRightPanel`, `ActiveContextChips`, or `StartOverButton`. Needs an owner decision in `#2826` to retire as `OBSOLETE` or re-scope.

### 10. `L130` — `e2e/discover/issue-2083-camera-back-determinism.spec.ts` (`SCHEDULED(#2826)`)
- **Status:** Left at original path `e2e/discover/issue-2083-camera-back-determinism.spec.ts` (`SCHEDULED(#2826)`).
- **Root Cause (Empirical Local Stack Run):**
  - In Trial 1 (`5x real-timer trials — settled URL after Back x2 is byte-identical across all trials, contains no stale lat/lon/zoom, and lands at real city bounds`), after clicking `navigation-child-card-d:southeast` and then `navigation-child-card-a:IN|KA|Bengaluru|RR Nagar`, line 109 fails with:
    `Error: trial 1: area camera must carry a real lat before Back — expect(received).not.toBeNull() Received: null`
  - Post-`#2016`/`#2017`/`#2494`, clicking an AREA leaf card on the default Areas journey commits `rscope=areas&rareas=IN|KA|Bengaluru|RR Nagar` while `writeNode` clears `lat`/`lon`/`zoom` from the URL, and the anonymous leaf transition does not flush a new `lat`/`lon`/`zoom` to the URL within `SETTLE_MS` (`1200ms`). Needs an owner decision in `#2826` (linked to the URL-sync behavior documented in `#2494`).
