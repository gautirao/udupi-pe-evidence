# Issue #2858 (`trim_rows` batch) — Lower-Level Seam Coverage & Retirement Map

**Issue:** `#2858` (`### Trim rows` — 8 mixed specs: `L107`, `L108`, `L117`, `L122`, `L123`, `L137`, `L158`, `L172`)  
**Manifest Slice:** `docs/testing/e2e-retirement-manifest.csv` lines `107`, `108`, `117`, `122`, `123`, `137`, `158`, `172`  
**New Lower-Level Test Suite:** `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` (13 tests, all GREEN)

---

## Classification Legend

- **`COVERED_EXISTING`**: Non-browser seam assertion already proven at a lower level (Vitest unit / hook / component test) in `main`.
- **`COVERED_NEW`**: Non-browser seam assertion newly proven in `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` with a transient production mutation proof (`M1..M10`).
- **`RETAIN_SPECIALIST`**: Browser-only visual / geometry / pixel-overlap / tile-settle / multi-breakpoint layout assertion that genuinely requires Playwright and is retained for the specialist trimming lanes (`#2855` visual/layout specialist or `#2856` journey/smoke specialist).
- **`OBSOLETE`**: Assertion tied to a retired UI surface (`MarkerClusterPopover` `#1809`), unshipped fixture state, or diagnostic debug log.

---

## 1. `L107` — `e2e/discover/issue-1762-listing-density-clustering.spec.ts`

**Manifest target:** `trim_to_1_test` (`#2855` visual specialist)  
**Summary:** All non-browser clustering policy, zoom-tier threshold, and cluster-tap fit seams are already covered in existing Vitest suites; no new Vitest test was required for `L107`.

| E2E Test / Assertion | Classification | Lower-Level Coverage / Specialist Routing |
| --- | --- | --- |
| `T1`: Area selection lands inside `AREA_AUTO_FIT_MAX_ZOOM = 15` (`zoom <= 15`) and renders `listing-cluster-marker` pills when co-located listings collide | `COVERED_EXISTING` | `apps/web/src/components/map/__tests__/zoomPolicy.issue1762.test.ts` (`AREA_AUTO_FIT_MAX_ZOOM === 15`, `clusterListings` enabled below `LISTING_CLUSTER_DISABLE_ZOOM = 16`) + `apps/web/src/components/map/__tests__/PropertyMap.clusterTapFit.test.tsx` |
| `T1` (visual pill collision / viewport layout): `listing-cluster-marker` vs `listing-marker` bounding-box non-overlap in real Leaflet layout | `RETAIN_SPECIALIST` | Retain 1 visual density check in `#2855` |
| `T2`: Clicking a `listing-cluster-marker` fits cluster member bounds (capped at `CLUSTER_EXPAND_MAX_ZOOM = 17`) or steps zoom by `+2` when tightly co-located | `COVERED_EXISTING` | `apps/web/src/components/map/__tests__/PropertyMap.clusterTapFit.test.tsx` (`tightly-co-located` `+2` step vs `spread-out` `fitBounds(..., { maxZoom: 17 })`) |
| `T2` (obsolete branch): `MarkerClusterPopover` (`marker-cluster-popover`) fallback assertion | `OBSOLETE` | `MarkerClusterPopover` was retired in issue `#1809` in favor of camera-zoom cluster expansion + `MarkerPopoverCard` stepper (`#1810`) |
| `T3`: At `zoom >= 16` (`LISTING_CLUSTER_DISABLE_ZOOM`), clustering is disabled (`clusters = []`, all individual markers rendered) | `COVERED_EXISTING` | `apps/web/src/components/map/__tests__/zoomPolicy.issue1762.test.ts` (`zoom >= 16` returns `clusters: []` and all `singles`) |
| `T4`: Diagnostic `console.log` overlap counter | `OBSOLETE` | Non-gating diagnostic telemetry |

---

## 2. `L108` — `e2e/discover/issue-1823-camera-fit-policy.spec.ts`

**Manifest target:** `trim_to_1_test` (`#2855` visual specialist)

| E2E Test / Assertion | Classification | Lower-Level Coverage / Specialist Routing | Mutation Proof |
| --- | --- | --- | --- |
| `T1`: City / region / direction / cluster / area hierarchy drill calls `setPanToArea` once per canonical `navigationNodeKey` transition (`MAX_ZOOM_BY_INTENT`) | `COVERED_EXISTING` | `apps/web/src/features/discover/state/__tests__/useDiscoverCameraOrchestration.canonicalNodeFit.test.tsx` + `apps/web/src/components/map/__tests__/cameraController.intents.test.ts` | — |
| `T2`: Selecting a listing (`listing=<id>`) or stepping the popover does not re-fit the canonical node camera | `COVERED_EXISTING` | `apps/web/src/features/discover/state/__tests__/useDiscoverCameraOrchestration.canonicalNodeFit.test.tsx` | — |
| `T3`: Entering Bounded Browse (`nodeListings=true`) on an already-fitted canonical `navigationNodeKey` reuses the existing fit (`prevNodeKey === navigationNodeKey` -> `transitioned = false`) and does NOT call `setPanToArea` a second time | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L108 > T3` | `M1` |
| `T4`: Cold load with `nodeListings=true` + persisted URL viewport suppresses canonical node fit (`isViewportRestoredRef` guard); clearing `nodeListings` on the same `node=` does not re-fit | `COVERED_EXISTING` + `COVERED_NEW` | `useDiscoverCameraOrchestration.canonicalNodeFit.test.tsx` + `discoverTrimRows2858Trim.test.tsx` -> `L108 > T3` | `M1` |
| `T5`: Selecting an area group (`groupId`) calls unguarded `publishPanToArea(bounds, 'group')` so member bounds fit even on an in-app `POP` with a persisted viewport, whereas canonical-node `guardedSetPanToArea` suppresses refit on `POP` restore | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L108 > T5` | `M2` |
| `T6` (hook/controller seam): Mobile Map mode (`mobileMapOpen = true`) on a listing-capable state (`isMarkerPopoverEligible = true` via AREA leaf or `nodeListings=1`) proactively computes `bottomOcclusionPx = 150` (`MOBILE_LISTING_PREVIEW_OCCLUSION_PX`) before any marker tap while keeping desktop popover ineligible | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L108 > T6` | `M3` |
| `T6` (visual occlusion geometry): Real viewport bounding-box check that fitted markers sit above the mobile bottom sheet occlusion zone | `RETAIN_SPECIALIST` | Retain 1 mobile visual occlusion geometry check in `#2855` | — |

---

## 3. `L117` — `e2e/discover/issue-1956-pr4-listing-peek-camera-restore.spec.ts`

**Manifest target:** `trim_to_1_test` (`#2856` journey specialist)

| E2E Test / Assertion | Classification | Lower-Level Coverage / Specialist Routing | Mutation Proof |
| --- | --- | --- | --- |
| `AC4.1 / AC4.2`: Clicking a card in Bounded Browse or AREA leaf opens `MarkerPopoverCard` without mutating camera intent | `COVERED_EXISTING` | `apps/web/src/features/discover/state/__tests__/useMarkerSelection.test.ts` + `apps/web/src/features/discover/controllers/__tests__/useDiscoverMarkerPopoverController.test.ts` | — |
| `AC4.3`: Sibling stepper (`prev` / `next`) cycles `listing=<id>` within `currentMapMarkerListings` and keeps popover open | `COVERED_EXISTING` | `apps/web/src/features/discover/controllers/__tests__/useDiscoverMarkerPopoverController.test.ts` | — |
| `AC4.4 / AC4.5`: Deep-linking to `node=<AREA>&listing=<id>` hydrates `selectedMarkerListing` from `areaMarkerListings`, renders `DiscoverMapMarkerPopover` (`marker-popover-card`), dismissing (`marker-popover-close`) calls `clearSelectedListing` (`listing=` cleared) while keeping `node=` and viewport intact without re-firing canonical node fit, and clicking `marker-popover-view-details` navigates to `/listing/:id` | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L117 > AC4.4 / AC4.5` | `M4` |
| `AC4.6 / AC4.7` (browser history `goBack` / `goForward` camera restore): Browser back/forward from `/listing/:id` restores exact Leaflet camera center/zoom and re-hydrates `listing=` peek | `RETAIN_SPECIALIST` | Retain 1 browser back/forward history restore smoke test in `#2856` | — |

---

## 4. `L122` — `e2e/discover/issue-1956-pr5-mobile-cluster-sheet.spec.ts`

**Manifest target:** `trim_to_1_test` (`#2855` visual specialist)

| E2E Test / Assertion | Classification | Lower-Level Coverage / Specialist Routing | Mutation Proof |
| --- | --- | --- | --- |
| `S1 / S2`: Tapping an unsplittable `area-cluster-marker` on mobile opens `MobileClusterSheet` (`mobile-cluster-sheet`) with member rows and selecting a member calls `journey.selectNode(memberNodeKey)` | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/MobileClusterSheet.test.tsx` | — |
| `S3 / S4`: `buildMapSurfaceModel` preserves `focusedClusterMemberAreaKeys` across mobile `MAP -> LIST -> MAP` (`mobileMapOpen: true -> false -> true`) and clicking `mobile-cluster-sheet-show-all` ("Show all areas") clears `focusedClusterMemberAreaKeys` to `null` without mutating `node=` (`journey.selectNode` not called) | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L122 > S3 / S4` | `M5` |
| Mobile bottom-sheet visual presentation & touch viewport layout (`390x844`) | `RETAIN_SPECIALIST` | Retain 1 mobile cluster sheet visual layout check in `#2855` | — |

---

## 5. `L123` — `e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts`

**Manifest target:** `trim_to_1_test` (`#2856` journey specialist)

| E2E Test / Assertion | Classification | Lower-Level Coverage / Specialist Routing | Mutation Proof |
| --- | --- | --- | --- |
| `AC5.1 – AC5.6`: Mobile list-first default (`mobileView = 'LIST'`), sticky Map/List pill toggle, hierarchy drill in List view without mounting Leaflet map overlay | `COVERED_EXISTING` | `apps/web/src/features/discover/controllers/__tests__/useDiscoverMobilePresentationController.test.ts` + `apps/web/src/components/discover/__tests__/AreasNavigationPanel.test.tsx` | — |
| `AC5.7`: Mobile marker tap opens `MobileListingPreviewSheet` (`mobile-listing-preview-sheet`) instead of desktop `MarkerPopoverCard` | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/MobileListingPreviewSheet.test.tsx` + `discoverTrimRows2858Trim.test.tsx` (`L108 > T6`, `L137`) | — |
| `AC5.8`: Resolved canonical `AREA` leaf (`node=<AREA>`) bridges through `deriveAreaPointFromNode` -> `resolveEffectiveSelectedArea` -> `useDiscoverMapDataController` -> `useDiscoverMapData` -> `useDiscoverCityListings` -> `apiGet` -> `fetch('/api/discover/cities/bangalore/listings?areaKeys=IN|KA|Bengaluru|Basaveshwara+Nagar...')` with single `areaKeys` param, omitting `Authorization` when anonymous and attaching `Bearer <token>` when authenticated | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L123 > AC5.8` | `M6` |
| Mobile List -> Map -> Listing detail end-to-end buyer journey smoke | `RETAIN_SPECIALIST` | Retain 1 mobile list-first buyer journey smoke test in `#2856` | — |

---

## 6. `L137` — `e2e/discover/issue-2089-pan-preserves-listing-preview.spec.ts`

**Manifest target:** `trim_to_1_test` (`#2855` visual specialist)

| E2E Test / Assertion | Classification | Lower-Level Coverage / Specialist Routing | Mutation Proof |
| --- | --- | --- | --- |
| Map pan drag (`Math.hypot(dx, dy) > 10px` `BACKGROUND_TAP_DRAG_THRESHOLD_PX`) does NOT dismiss `MobileListingPreviewSheet` (`handlePopoverDismiss` not called on drag-tail click) | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L137` (test 1) | `M7` |
| Clicking another `[data-listing-id]` marker element is ignored by the background-tap handler so marker selection owns the gesture | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L137` (test 1) | `M7` |
| Stationary background tap (`Math.hypot(dx, dy) <= 10px`) invokes `handlePopoverDismiss` and unmounts `MobileListingPreviewSheet` | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L137` (tests 1 & 2) | `M7` |
| Clicking `mobile-listing-preview-close` explicitly dismisses `MobileListingPreviewSheet` | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L137` (test 1) | `M7` |
| Real Leaflet touch-pan gesture physics vs mobile preview sheet viewport anchoring | `RETAIN_SPECIALIST` | Retain 1 real browser drag/pan gesture check in `#2855` | — |

---

## 7. `L158` — `e2e/discover/journey-switch-overlay-cleanup-1940.spec.ts`

**Manifest target:** `trim_to_2_tests` (`#2856` journey specialist)

| E2E Test / Assertion | Classification | Lower-Level Coverage / Specialist Routing | Mutation Proof |
| --- | --- | --- | --- |
| `AC1`: Switching `school-first -> agri-first` with an active school selection clears `selectedSchool` + `schoolLat`/`schoolLon`/`schoolRadiusKm`, unmounts `school-radius-more-hint`, and sets `showSchoolMarkers = false` & `schoolCircle = null` | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L158 > AC1` | `M8` |
| `AC2`: Switching `school-first -> area-first` clears `selectedSchool` + `schoolLat`/`schoolLon`/`schoolRadiusKm`, unmounts `school-radius-more-hint`, and sets `showSchoolMarkers = false` & `schoolCircle = null` | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L158 > AC2` | `M8` |
| `AC3`: Cold landing on `agri-first` with no prior school selection renders zero school overlays and no `school-radius-more-hint` banner | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L158 > AC3 control` | `M8` |
| `AC4`: Rapid `school-first -> agri-first -> school-first` abort / race-safety for in-flight `/api/schools/search` and `/api/discover/listings/near-school` requests | `RETAIN_SPECIALIST` | Retain 1 in-flight network race / overlay cleanup browser test in `#2856` | — |
| `AC5`: Combined `area-first` (`areaKey` + `schoolId` + `radiusKm`) -> `agri-first` clears school state, unmounts `school-radius-more-hint`, and clears `showSchoolMarkers` & `schoolCircle` | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L158 > AC5` | `M8` |

---

## 8. `L172` — `e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts`

**Manifest target:** `trim_to_2_tests` (`#2855` visual specialist)

| E2E Test / Assertion | Classification | Lower-Level Coverage / Specialist Routing | Mutation Proof |
| --- | --- | --- | --- |
| `R1 – R4`: Greedy collision placer (`placeLabelsWithLeaderLines`), zoom-adaptive consolidation (`consolidateByPixelProximity`), and leader-line offset math | `COVERED_EXISTING` | `apps/web/src/components/map/__tests__/AreaMarkerLayer.collisionPlacer.test.ts` | — |
| `R1 – R4` (real browser font metrics & pixel bounding boxes): Zero DOM pill overlap across zoom 11–14 on `groupId=thanisandra-hennur-belt` | `RETAIN_SPECIALIST` | Retain in `#2855` visual collision specialist suite | — |
| `R5`: Clicking an `area-cluster-marker` chip calls `onAreaClusterCameraIntent` + `handleAreaClusterClick` (populating `focusedClusterMemberAreaKeys`), does NOT call `onAreaClick`, keeps `areaKey = null` and `groupId = 'thanisandra-hennur-belt'`, and keeps `areaResultSummaryText = null` | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L172 > R5 & R6` | `M9` |
| `R6`: Clicking a named `area-marker` pill calls `onAreaClick`, updates `areaKey` to the selected member area, clears `focusedClusterMemberAreaKeys`, and populates `useDiscoverBadgeController().areaResultSummaryText` with the area-scoped verified properties summary | `COVERED_NEW` | `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` -> `L172 > R5 & R6` | `M10` |

---

## Transient Mutation Proof Register (`M1..M10`)

Every new test in `apps/web/src/features/discover/__tests__/discoverTrimRows2858Trim.test.tsx` was verified against a transient production mutation (`RED -> revert -> GREEN`), and all 10 mutated production files were verified via `sha256` against their pre-mutation baseline (`git diff` empty).

| ID | Spec / Seam | Production File & Line Mutated | Transient Mutation Applied | Failing Test & Exact Failure Message (RED) | Reverted (`sha256` Match) |
| --- | --- | --- | --- | --- | --- |
| `M1` | `L108 T3` (Bounded Browse no-refit on same `navigationNodeKey`) | `apps/web/src/features/discover/state/useDiscoverCameraOrchestration.ts:625` | Changed `if (!transitioned) return;` to `if (!transitioned && !urlState.nodeListings) return;` | `L108 > T3` failed at `discoverTrimRows2858Trim.test.tsx:435`: `AssertionError: expected "spy" to be called 1 times, but got 2 times` | Verified (`931f45ec...`) |
| `M2` | `L108 T5` (Group focus unguarded `publishPanToArea` on `POP`) | `apps/web/src/features/discover/state/useDiscoverCameraOrchestration.ts:503` | Changed `publishPanToArea(bounds, 'group');` to `guardedSetPanToArea(bounds, 'group');` | `L108 > T5` failed at `discoverTrimRows2858Trim.test.tsx:505`: `AssertionError: expected "spy" to be called 1 times, but got 0 times` | Verified (`931f45ec...`) |
| `M3` | `L108 T6` (Mobile proactive `bottomOcclusionPx = 150` before marker tap) | `apps/web/src/features/discover/controllers/useDiscoverMobilePresentationController.ts:79` | Changed `mobileMapOpen && isMarkerPopoverEligible` to `mobileMapOpen && isMarkerPopoverEligible && !!selectedListingPreview` | `L108 > T6` failed at `discoverTrimRows2858Trim.test.tsx:569`: `AssertionError: expected +0 to be 150 // Object.is equality` | Verified (`fb55fa13...`) |
| `M4` | `L117 AC4.4/AC4.5` (Popover dismiss clears `listing=` without refit) | `apps/web/src/features/discover/state/useMarkerSelection.ts:359` | Commented out `actions.clearSelectedListing?.();` in `handlePopoverDismiss` | `L117 > AC4.4 / AC4.5` failed at `discoverTrimRows2858Trim.test.tsx:703`: `AssertionError: expected "spy" to be called 1 times, but got 0 times` | Verified (`dc2f99eb...`) |
| `M5` | `L122 S3/S4` (`focusedClusterMemberAreaKeys` preserved across `MAP -> LIST -> MAP`) | `apps/web/src/features/discover/surfaces/buildMapSurfaceModel.tsx:898` | Changed `focusedClusterMemberAreaKeys,` to `focusedClusterMemberAreaKeys: mobileMapOpen ? focusedClusterMemberAreaKeys : null,` | `L122 > S3 / S4` failed at `discoverTrimRows2858Trim.test.tsx:992`: `AssertionError: expected null to deeply equal [ 'IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Jakkur' ]` | Verified (`c942c577...`) |
| `M6` | `L123 AC5.8` (`node=<AREA>` single-`areaKeys` wire seam) | `apps/web/src/hooks/useDiscoverMapData.ts:830` | Changed `return selectedArea ? [selectedArea.areaKey] : [];` to `return selectedArea ? [selectedArea.areaKey, 'IN|KA|Bengaluru'] : [];` | `L123 > AC5.8` failed at `discoverTrimRows2858Trim.test.tsx:1215`: `AssertionError: expected [ 'IN|KA|Bengaluru', 'IN|KA|Bengaluru|Basaveshwara Nagar' ] to deeply equal [ 'IN|KA|Bengaluru|Basaveshwara Nagar' ]` | Verified (`a47fbd8c...`) |
| `M7` | `L137` (`DiscoverMapCanvas` pan-drag `>10px` guard preserves mobile preview) | `apps/web/src/features/discover/views/DiscoverMapCanvas.tsx:738` | Changed `if (Math.hypot(dx, dy) > BACKGROUND_TAP_DRAG_THRESHOLD_PX)` to `if (false && Math.hypot(dx, dy) > BACKGROUND_TAP_DRAG_THRESHOLD_PX)` | `L137` failed at `discoverTrimRows2858Trim.test.tsx:1506`: `AssertionError: expected 1 to be +0 // Object.is equality` | Verified (`3ddcc1cc...`) |
| `M8` | `L158 AC1/AC2/AC5/AC3` (Journey switch unmounts `school-radius-more-hint`) | `apps/web/src/components/discover/DiscoverMapStatusHints.tsx:75` | Changed `schoolRadiusHint.schoolRadiusActive &&` to `true &&` | `L158` (all 4 tests) failed at `discoverTrimRows2858Trim.test.tsx:1718` & `1728`: `Error: expect(element).not.toBeInTheDocument()` | Verified (`6251ecec...`) |
| `M9` | `L172 R5` (`area-cluster-marker` click does not select `areaKey`) | `apps/web/src/components/map/AreaMarkerLayer.tsx:2534` | Added `onAreaClick?.(clusterAreas[0]);` inside the cluster marker click handler | `L172 > R5 & R6` failed at `discoverTrimRows2858Trim.test.tsx:1859`: `AssertionError: expected "spy" to not be called at all, but actually been called 1 times` | Verified (`6cf65025...`) |
| `M10` | `L172 R6` (Representative `area-marker` click populates `areaResultSummaryText`) | `apps/web/src/features/discover/controllers/useDiscoverBadgeController.ts:207` | Changed `effectiveSelectedArea ? formatDiscoverBadgeCopy(...)` to `false && effectiveSelectedArea ? formatDiscoverBadgeCopy(...)` | `L172 > R5 & R6` failed at `discoverTrimRows2858Trim.test.tsx:1910`: `AssertionError: expected null to be truthy` | Verified (`e2d5f3a8...`) |

---

## Governance Note

- **Zero E2E Spec Deletions / Edits in This Batch:** In accordance with `#2858` scope boundaries, no files under `e2e/**` and no rows in `docs/testing/e2e-retirement-manifest.csv` were modified or deleted in this commit.
- **Downstream Handoff:** The browser-only rows marked `RETAIN_SPECIALIST` above (`L107`, `L108`, `L122`, `L137`, `L172` -> `#2855`; `L117`, `L123`, `L158` -> `#2856`) are now ready for the specialist trimming lanes to trim each Playwright spec down to its target manifest test count (`trim_to_1_test` / `trim_to_2_tests`).
