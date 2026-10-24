# #2857 (`FU-LOWER-A`): lower-level replacement map for school-first and agri legacy specs

Base: `366f5a80`. Issue `#2857` (`FU-LOWER-A`, Lane C of `#2750`). Includes targeted `PolygonBoundaryValidator.java` fix preserving `ListingValidationException` (`BOUNDARY_TOO_LARGE`) instead of swallowing it as `BOUNDARY_INVALID_GEOMETRY`, plus lower-level replacement tests and this doc.

No `e2e/**` spec is deleted, moved, edited, or skipped in this PR; deletion requires a separate owner by-name retirement approval.
The manifest (`docs/testing/e2e-retirement-manifest.csv`) is NOT edited by this PR; intended row updates are recorded in Section 13.

## Scope Summary

| Manifest row | Legacy spec | Manifest disposition | Target lower-level destination(s) | New tests added in `#2857` |
|---|---|---|---|---|
| `L12` | `e2e/broker-agri-listing.spec.ts` | `MOVE_DOWN` (`SCHEDULED(#2857)`) | `apps/api/src/test/java/com/example/realestate/listing/api/AgriListingBoundaryJourneyIT.java`, `apps/api/src/test/java/com/example/realestate/listing/geometry/PolygonBoundaryValidatorTest.java`, `apps/api/src/test/java/com/example/realestate/listing/api/ListingControllerTest.java` | `G1-N1` (`agriBoundaryJourney_oversizedPolygon_isRejectedAndLeavesBoundaryUnchanged` asserting exact `BOUNDARY_TOO_LARGE` against real PostGIS + `PolygonBoundaryValidatorTest#validate_areaTooLarge_throwsBoundaryTooLarge` AssertJ exact-code check + `ListingControllerTest#updateListing_oversizedBoundary_returns422BoundaryTooLargeAndLeavesPersistedBoundaryUnchanged`) |
| `L45` | `e2e/discover-agri-journey-1375.spec.ts` | `MOVE_DOWN` (`SCHEDULED(#2857)`) | `apps/web/src/pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx`, `apps/web/src/components/discover/__tests__/DiscoverRightPanel.agri.test.tsx`, `apps/web/src/hooks/__tests__/useDiscoverAreas.test.ts` | `G1-N15`, `G1-N16` (`AC6` peek/card -> `/listing/:id` -> browser Back), `G1-N17` (`AC9` agri panel renders with zero school panels + school-first control) |
| `L47` | `e2e/discover-agri-overlay-peek-journey-1431.spec.ts` | `MOVE_DOWN` (`SCHEDULED(#2857)`) | `apps/web/src/pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx`, `apps/web/src/components/map/__tests__/AgriPolygonLayer.test.tsx`, `apps/web/src/components/discover/panels/__tests__/AgriGroupSelectedPanel.test.tsx`, `apps/web/src/components/discover/panels/__tests__/AgriGroupListingPeek.test.tsx` | `G1-N15` (`AC3` cold-load Level-3 peek URL -> `AgriGroupListingPeek` -> `View full details` navigates to `/listing/:id`) |
| `L84` | `e2e/discover-school-first-journey.spec.ts` | `MOVE_DOWN` (`SCHEDULED(#2857)`) | `apps/web/src/components/map/__tests__/AreaMarkerLayer.schoolBadge2857.test.tsx`, `apps/web/src/pages/__tests__/MapDiscovery.schoolFirst.test.tsx` | `G3-N4` (`E2E-2` `"N schools"` / `"1 school"` badge on `AreaMarkerLayer` in `school-first`, paired with `area-first` and `selectedSchool` controls) |
| `L87` | `e2e/discover-school-journey.spec.ts` | `MOVE_DOWN` (`SCHEDULED(#2857)`) | `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx`, `apps/web/src/components/discover/__tests__/SchoolsInAreaPanel.test.tsx` | `G3-N5` (`E2E-7` single `/api/public/schools/by-area` HTTP call on area selection), `G3-N6` (`E2E-8` clicking `school-card` writes `schoolId` + `radiusKm=3` alongside `areaKey`) |
| `L89` | `e2e/discover-school-selected.spec.ts` | `MOVE_DOWN` (`SCHEDULED(#2857)`) | `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx`, `apps/web/src/components/discover/__tests__/SchoolSelectedPanel.test.tsx` | `G3-N7` (`E2E-6` URL preserves `schoolId` + `radiusKm=3` + `type=house` and `/api/discover/listings` sends `schoolLat`, `schoolLon`, `schoolRadiusKm=3`, `propertyTypes=house`) |
| `L164` | `e2e/discover/school-badge-suppression.spec.ts` | `MOVE_DOWN` (`SCHEDULED(#2857)`) | `apps/web/src/features/discover/controllers/__tests__/useDiscoverBadgeController.issue2190.test.ts`, `apps/web/src/utils/__tests__/discoverBadge.test.ts` | `G3-N2` (`SBS-1` 0-listing school radius keeps badge visible with `count: 0`, never area total 12), `G3-N3` (`SBS-2` + `SBS-3` control: 2-listing school radius shows `count: 2`, no-school control shows `12`) |
| `L217` | `e2e/verify-agri-clusters-1372.spec.ts` | `MOVE_DOWN` (`SCHEDULED(#2857)`) | `apps/web/src/features/discover/controllers/__tests__/useDiscoverMapDataController.areaFirstMarkers2857.test.ts`, `apps/web/src/components/map/__tests__/AgriMarkerClusterLayer.test.tsx` | `G1-N14` (`AC7` `area-first` authed at `mapZoom > 12` fires `GET /api/discover/markers`, paired with anon, `mapZoom <= 12`, and top-grouped negative controls) |
| `L91` (trim) | `e2e/discover-schools-mobile-cluster-2124.spec.ts` | `RETAIN_SPECIALIST` (trim duplicate assertions) | `apps/web/src/features/discover/surfaces/__tests__/buildMapSurfaceModel.mobileCluster2857.test.tsx`, `apps/web/src/features/discover/controllers/__tests__/useDiscoverOverviewNavigationController.test.ts`, `apps/web/src/features/discover/views/mobile/__tests__/MobileClusterSheet.test.tsx` | `G3-N9` (`G3-M11` `buildMapSurfaceModel` forwards `activeAreasNavigationJourney` into `mobileCluster.journey` so school-first member click routes via `handleAreaSelect`), `G3-N10` (`230-233` `mobileMapOpen` gates `mobile-map-close-list-button` and `mobile-cluster-sheet`) |
| `L157` (trim) | `e2e/discover/issue-2770-compact-school-context.spec.ts` | `RETAIN_SPECIALIST` (trim non-geometry assertions) | `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx`, `apps/web/src/components/discover/__tests__/AreaSchoolCombinedPanel.issue2770.test.tsx` | `G3-N8` (`111-115` clicking `change-school-btn` in `AreaSchoolCombinedPanel` clears `schoolId` and returns to `"Schools in Manipal"` header preceding `school-card` list) |

---

## 1. `L12` — `e2e/broker-agri-listing.spec.ts`

| Assertion ID | Legacy assertion (`e2e/broker-agri-listing.spec.ts`) | Lower-level coverage (file + test) | Status |
|---|---|---|---|
| `L12-AC1` | Broker creates agri listing with valid polygon boundary and persists GeoJSON | `apps/api/src/test/java/com/example/realestate/listing/api/AgriListingBoundaryJourneyIT.java` `agriBoundaryJourney_survivesCreatePutSubmit`; `ListingControllerTest.java` | COVERED |
| `L12-AC2` | Broker updates polygon boundary on existing agri listing and reads updated GeoJSON | `AgriListingBoundaryJourneyIT.java` `agriBoundaryJourney_survivesCreatePutSubmit` | COVERED |
| `L12-AC3` | Self-intersecting bowtie polygon is rejected (`422 BOUNDARY_INVALID_GEOMETRY`) and leaves persisted boundary unchanged | `AgriListingBoundaryJourneyIT.java` `agriBoundaryJourney_bowtie_throwsInvalidGeometryFromRealPostgis`; `PolygonBoundaryValidatorTest.java` `validate_stIsValidFalse_throwsBoundaryInvalidGeometry` | COVERED |
| `L12-AC4` | Oversized polygon (`> 100 km²`, e.g. 2° × 2° box) is rejected on `PUT /api/listings/{id}` with `422 BOUNDARY_TOO_LARGE` and leaves previously persisted boundary unchanged | `AgriListingBoundaryJourneyIT.java` `agriBoundaryJourney_oversizedPolygon_isRejectedAndLeavesBoundaryUnchanged` (asserting `.containsExactly("BOUNDARY_TOO_LARGE")` against real PostGIS); `PolygonBoundaryValidatorTest.java` `validate_areaTooLarge_throwsBoundaryTooLarge` (AssertJ exact-code check); `ListingControllerTest.java` `updateListing_oversizedBoundary_returns422BoundaryTooLargeAndLeavesPersistedBoundaryUnchanged` | NEW in this PR (`G1-N1`, `M1`) |
| `L12-AC5` | Outside-India polygon is rejected with `BOUNDARY_OUTSIDE_INDIA` and leaves persisted boundary unset | `AgriListingBoundaryJourneyIT.java` `agriBoundaryJourney_outsideIndia_isRejectedAndBoundaryStaysUnset`; `PolygonBoundaryValidatorTest.java` `validate_coordOutsideIndia_throwsBoundaryOutsideIndia` | COVERED |

---

## 2. `L45` — `e2e/discover-agri-journey-1375.spec.ts`

| Assertion ID | Legacy assertion (`e2e/discover-agri-journey-1375.spec.ts`) | Lower-level coverage (file + test) | Status |
|---|---|---|---|
| `L45-AC1..AC5` | `agri-first` URL state, corridor/area summary strip (`agri-selected-summary`, `agri-count`, `agri-acreage`), agri-only `/api/discover/areas?propertyType=agricultural_land` & `/listings` | `apps/web/src/components/discover/__tests__/DiscoverRightPanel.agri.test.tsx`; `apps/web/src/hooks/__tests__/useDiscoverAreas.test.ts`; `apps/web/src/hooks/__tests__/useDiscoverCityListings.test.ts` | COVERED |
| `L45-AC6` | Clicking an agri listing / peek CTA navigates to `/listing/:id`, and browser Back (`navigate(-1)`) returns to `/discover` with `journey=agri-first`, `city=udupi`, and agri geography (`region`/`maxKm`/`destKey` or `areaKey`) intact | `apps/web/src/pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx` `"L47 AC3 + L45 AC6 (G1-N15): cold-loading peek URL renders AgriGroupListingPeek, clicking View full details navigates to /listing/:id, and browser Back restores /discover with agri-first state and panel"` and `"L45 AC6 areaKey arm (G1-N16): clicking an agri parcel card from areaKey-scoped agri-first navigates to /listing/:id and browser Back restores journey=agri-first, city=udupi, and areaKey"` | NEW in this PR (`G1-N15`, `G1-N16`, `M4a`, `M4b`) |
| `L45-AC7..AC8` | Empty state (`agri-empty-state`) vs loading skeleton (`agri-listing-skeleton`) keyed on authoritative `agriCount` | `apps/web/src/components/discover/__tests__/DiscoverRightPanel.agri.test.tsx` | COVERED |
| `L45-AC9` | In `agri-first`, the agri panel renders and zero school panels (`discover-schools-journey-panel-shell`, `school-card`, `school-selected-scroll`, `school-summary-band`) mount | `apps/web/src/pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx` `"L45 AC9 (G1-N17): agri-first renders the agri panel and zero school panels, paired with school-first positive control"` | NEW in this PR (`G1-N17`, `M4c`) |

---

## 3. `L47` — `e2e/discover-agri-overlay-peek-journey-1431.spec.ts`

| Assertion ID | Legacy assertion (`e2e/discover-agri-overlay-peek-journey-1431.spec.ts`) | Lower-level coverage (file + test) | Status |
|---|---|---|---|
| `L47-AC1..AC2` | Polygon overlay (`AgriPolygonLayer`) click/selection and `AgriGroupSelectedPanel` / `AgriGroupLocalityPanel` row selection open `AgriGroupListingPeek` (`listing=<id>`) | `apps/web/src/components/map/__tests__/AgriPolygonLayer.test.tsx`; `apps/web/src/components/discover/panels/__tests__/AgriGroupSelectedPanel.test.tsx`; `apps/web/src/components/discover/panels/__tests__/AgriGroupListingPeek.test.tsx` | COVERED |
| `L47-AC3` | Cold-loading `/discover?city=udupi&journey=agri-first&region=N&maxKm=25&destKey=IN|KA|Udupi|Manipal&listing=<id>` mounts `AgriGroupListingPeek` (`agri-listing-peek`), and clicking `agri-listing-peek-view-details` navigates to `/listing/:id` | `apps/web/src/pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx` `"L47 AC3 + L45 AC6 (G1-N15): cold-loading peek URL renders AgriGroupListingPeek, clicking View full details navigates to /listing/:id, and browser Back restores /discover with agri-first state and panel"` | NEW in this PR (`G1-N15`, `M4a`) |
| `L47-AC4` | Closing `AgriGroupListingPeek` (`agri-listing-peek-close`) clears `listing` param and restores group/locality panel | `apps/web/src/components/discover/panels/__tests__/AgriGroupListingPeek.test.tsx`; `apps/web/src/features/discover/surfaces/__tests__/buildPanelSurfaceModel.test.ts` | COVERED |

---

## 4. `L84` — `e2e/discover-school-first-journey.spec.ts`

| Assertion ID | Legacy assertion (`e2e/discover-school-first-journey.spec.ts`) | Lower-level coverage (file + test) | Status |
|---|---|---|---|
| `L84-E2E-1` | Entering `school-first` mounts school browse / navigation panel and updates URL `journey=school-first` | `apps/web/src/pages/__tests__/MapDiscovery.schoolFirst.test.tsx`; `apps/web/src/components/discover/__tests__/SchoolBrowsePanel.test.tsx` | COVERED |
| `L84-E2E-2` | In `school-first` with no school selected, `AreaMarkerLayer` renders `"N schools"` / `"1 school"` badge on area markers instead of `"N properties"` | `apps/web/src/components/map/__tests__/AreaMarkerLayer.schoolBadge2857.test.tsx` `"E2E-2 (G3-N4): renders \"N schools\" / \"1 school\" badge in school-first mode when no school is selected, paired with area-first and selectedSchool controls"` | NEW in this PR (`G3-N4`, `M5`) |
| `L84-E2E-3..5` | Selecting a school or switching back to `area-first` updates panel state and area marker badges | `apps/web/src/components/map/__tests__/AreaMarkerLayer.schoolBadge2857.test.tsx` (`Control A` + `Control B`); `apps/web/src/pages/__tests__/MapDiscovery.schoolFirst.test.tsx` | COVERED |

---

## 5. `L87` — `e2e/discover-school-journey.spec.ts`

| Assertion ID | Legacy assertion (`e2e/discover-school-journey.spec.ts`) | Lower-level coverage (file + test) | Status |
|---|---|---|---|
| `L87-E2E-1..6` | School search, board/category filters, and area-level school list rendering | `apps/web/src/components/discover/__tests__/SchoolsInAreaPanel.test.tsx`; `apps/web/src/components/discover/__tests__/SchoolBrowsePanel.test.tsx` | COVERED |
| `L87-E2E-7` | Selecting an area in `school-first` (`?city=udupi&journey=school-first&areaKey=IN|KA|Udupi|Manipal`) fires `GET /api/public/schools/by-area` exactly once (no duplicate fetch from `SchoolsInAreaPanel`) and renders `school-card` items | `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` `"L87 E2E-7 & E2E-8 (G3-N5, G3-N6): school-first area selection fires GET /api/public/schools/by-area exactly once, renders school cards, and clicking a card writes schoolId and radiusKm=3 alongside areaKey"` | NEW in this PR (`G3-N5`, `M6a`) |
| `L87-E2E-8` | Clicking a `school-card` in `SchoolsInAreaPanel` writes both `schoolId=<id>` and `radiusKm=3` alongside `areaKey` in the URL | `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` `"L87 E2E-7 & E2E-8 (G3-N5, G3-N6): school-first area selection fires GET /api/public/schools/by-area exactly once, renders school cards, and clicking a card writes schoolId and radiusKm=3 alongside areaKey"` | NEW in this PR (`G3-N6`, `M6b`) |

---

## 6. `L89` — `e2e/discover-school-selected.spec.ts`

| Assertion ID | Legacy assertion (`e2e/discover-school-selected.spec.ts`) | Lower-level coverage (file + test) | Status |
|---|---|---|---|
| `L89-E2E-1..5` | `SchoolSelectedPanel` summary band (`school-summary-band`, `school-summary-name`), radius chip switching (`1 km`, `2 km`, `3 km`, `5 km`), and distance-sorted listing cards | `apps/web/src/components/discover/__tests__/SchoolSelectedPanel.test.tsx`; `apps/web/src/hooks/__tests__/useSchoolRadiusListings.test.ts` | COVERED |
| `L89-E2E-6` | With `schoolId`, `radiusKm=3`, and `type=house` active, URL preserves all three params and `GET /api/discover/listings` sends `schoolLat`, `schoolLon`, `schoolRadiusKm=3`, and `propertyTypes=house` | `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` `"L89 E2E-6 (G3-N7): with schoolId and radiusKm=3 active alongside type=house, preserves all three in URL and sends schoolLat, schoolLon, schoolRadiusKm=3, and propertyTypes=house in the listings request"` | NEW in this PR (`G3-N7`, `M6c`) |

---

## 7. `L164` — `e2e/discover/school-badge-suppression.spec.ts`

| Assertion ID | Legacy assertion (`e2e/discover/school-badge-suppression.spec.ts`) | Lower-level coverage (file + test) | Status |
|---|---|---|---|
| `L164-SBS-1` | In `school-first` with `areaKey` + `schoolId` active and 0 listings inside radius, `discoverBadge` stays visible with `count: 0` (`state: 'zero-empty'`) and never leaks the parent area's total (`12`) | `apps/web/src/features/discover/controllers/__tests__/useDiscoverBadgeController.issue2190.test.ts` `"SBS-1 (G3-N2): school radius active with 0 listings keeps badge visible with count 0 (never area total 12)"` | NEW in this PR (`G3-N2`, `M2`) |
| `L164-SBS-2` | In `school-first` with `areaKey` + `schoolId` active and 2 listings inside radius, `discoverBadge` shows `count: 2` (`n: 2, m: 2`), while the no-school control (`schoolId: null`) shows the parent area's `listingCount: 12` | `apps/web/src/features/discover/controllers/__tests__/useDiscoverBadgeController.issue2190.test.ts` `"SBS-2 + SBS-3 control (G3-N3): school radius active with 2 listings shows count 2 (not 12), while no-school control shows area count 12"` | NEW in this PR (`G3-N3`, `M2`) |

---

## 8. `L217` — `e2e/verify-agri-clusters-1372.spec.ts`

| Assertion ID | Legacy assertion (`e2e/verify-agri-clusters-1372.spec.ts`) | Lower-level coverage (file + test) | Status |
|---|---|---|---|
| `L217-AC1..AC6` | `AgriMarkerClusterLayer` clusters agri markers at low zoom, expands on click, and renders individual parcel markers at high zoom | `apps/web/src/components/map/__tests__/AgriMarkerClusterLayer.test.tsx`; `apps/web/src/hooks/__tests__/useDiscoverMapData.test.ts` | COVERED |
| `L217-AC7` | In `area-first` at a non-top-grouped level with an authenticated user at `mapZoom > 12`, `useDiscoverMapDataController` enables `GET /api/discover/markers?city=udupi...` (and suppresses it for anon, `mapZoom <= 12`, or top-grouped level) | `apps/web/src/features/discover/controllers/__tests__/useDiscoverMapDataController.areaFirstMarkers2857.test.ts` `"AC7 (G1-N14): fires GET /api/discover/markers in area-first when authenticated at zoom > 12, and suppresses it for anon, zoom <= 12, or top-grouped level"` | NEW in this PR (`G1-N14`, `M3`) |

---

## 9. `L91` (trim) — `e2e/discover-schools-mobile-cluster-2124.spec.ts`

| Assertion ID | Legacy assertion (`e2e/discover-schools-mobile-cluster-2124.spec.ts`) | Lower-level coverage (file + test) | Status |
|---|---|---|---|
| `L91-G3-M11` | `buildMapSurfaceModel.tsx:895-900` forwards `activeAreasNavigationJourney` into `view.overlays.mobileCluster.journey` with `eligibilityJourney: 'schools'` in `school-first`, so clicking an `AREA` member in `MobileClusterSheet` routes via `handleAreaSelect(area)` (`areaKey`), paired with `area-first` `goToNode` control | `apps/web/src/features/discover/surfaces/__tests__/buildMapSurfaceModel.mobileCluster2857.test.tsx` `"G3-M11 (G3-N9): forwards activeAreasNavigationJourney into view.overlays.mobileCluster.journey so clicking a school-first AREA member in MobileClusterSheet routes via handleAreaSelect (areaKey), paired with area-first goToNode control"` | NEW in this PR (`G3-N9`, `M7a`) |
| `L91-230-233` | When `mobileMapOpen === true`, `buildMapSurfaceModel` mounts `mobile-map-close-list-button` (wiring `setMobileView('LIST')`) and sets `mobileCluster.visible = true` so `mobile-cluster-sheet` mounts (and suppresses both when `mobileMapOpen === false`) | `apps/web/src/features/discover/surfaces/__tests__/buildMapSurfaceModel.mobileCluster2857.test.tsx` `"230-233 (G3-N10): mounts mobile Map overlay (mobile-map-close-list-button) and mobile-cluster-sheet when mobileMapOpen is true, and suppresses both when mobileMapOpen is false"` | NEW in this PR (`G3-N10`, `M7b`) |
| `L91-Leaflet-mobile` | Real Leaflet cluster marker tap inside mobile viewport (`390×844`) opening the sheet over the live map | Kept in `e2e/discover-schools-mobile-cluster-2124.spec.ts` (`RETAIN_SPECIALIST`) | BROWSER_ONLY |

---

## 10. `L157` (trim) — `e2e/discover/issue-2770-compact-school-context.spec.ts`

| Assertion ID | Legacy assertion (`e2e/discover/issue-2770-compact-school-context.spec.ts`) | Lower-level coverage (file + test) | Status |
|---|---|---|---|
| `L157-111-115` | Clicking `Change school` (`change-school-btn`) in `AreaSchoolCombinedPanel` clears `schoolId` from URL, preserves `areaKey` + `journey=school-first`, and returns to the area view where `"Schools in Manipal"` (`selected-area-summary-title`) precedes `school-card` items in DOM order | `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` `"L157 111-115 (G3-N8): clicking Change school in AreaSchoolCombinedPanel clears schoolId and returns to the area view with \"Schools in Manipal\" header preceding the school cards list"` | NEW in this PR (`G3-N8`, `M6d`) |
| `L157-geometry` | Real desktop viewport bounding-box geometry (`<= 107px` compact header height, first listing card `boundingBox().y` improvement) | Kept in `e2e/discover/issue-2770-compact-school-context.spec.ts` (`RETAIN_SPECIALIST`) | BROWSER_ONLY |

---

## 11. Transient Mutation Register (`M1`..`M7`)

Every mutation below was applied transiently against the production file, verified to turn the target test RED (exit code 1), and then reverted byte-identically (`git diff` on all production files is empty).

| Mutation ID | Target test file & `it` | Production file & line mutated | Transient mutation applied | RED result (exit 1) | GREEN after revert |
|---|---|---|---|---|---|
| `M1` (`G1-N1`) | `apps/api/src/test/java/com/example/realestate/listing/api/ListingControllerTest.java` `#updateListing_oversizedBoundary_returns422BoundaryTooLargeAndLeavesPersistedBoundaryUnchanged` | `apps/api/src/main/java/com/example/realestate/listing/crud/ListingCrudService.java:1207` | Commented out `polygonBoundaryValidator.validate(boundaryGeoJson, effectivePropertyType);` | 1 failed (`Expecting actual throwable to be an instance of: ListingValidationException`) | `Tests run: 1, Failures: 0` (`BUILD SUCCESS`) |
| `M2` (`G3-N2`, `G3-N3`) | `apps/web/src/features/discover/controllers/__tests__/useDiscoverBadgeController.issue2190.test.ts` (`SBS-1`, `SBS-2`) | `apps/web/src/features/discover/controllers/useDiscoverBadgeController.ts:161` | Changed `: schoolListings.length` to `: undefined` | 2 failed (`expected { count: 12 } to match { count: 0 }` and `{ count: 2 }`) | 2/2 passed |
| `M3` (`G1-N14`) | `apps/web/src/features/discover/controllers/__tests__/useDiscoverMapDataController.areaFirstMarkers2857.test.ts` (`AC7`) | `apps/web/src/features/discover/controllers/useDiscoverMapDataController.ts:263` | Replaced `nav.journey === 'area-first'` with `false` in `markersEnabled` | 1 failed (`expected 0 to be greater than or equal to 1` on `markersCalls()`) | 1/1 passed |
| `M4a` (`G1-N15`) | `apps/web/src/pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx` (`L47 AC3 + L45 AC6`) | `apps/web/src/components/discover/panels/AgriGroupListingPeek.tsx:241` | Changed `onClick={() => onViewDetails(listingId)}` to `onClick={() => undefined}` | 1 failed (`location-probe` stayed on `/discover?...` instead of `/listing/agri-1448-listing-001`) | 3/3 passed |
| `M4b` (`G1-N16`) | `apps/web/src/pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx` (`L45 AC6 areaKey arm`) | `apps/web/src/features/discover/right-panel/agri/AgriSelectedAreaPanel.tsx:150` | Changed `onClick={() => navigate(\`/listing/\${listing.id}\`)}` to `onClick={() => undefined}` | 1 failed (`location-probe` stayed on `/discover?...` instead of `/listing/agri-1448-listing-001`) | 3/3 passed |
| `M4c` (`G1-N17`) | `apps/web/src/pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx` (`L45 AC9`) | `apps/web/src/features/discover/right-panel/agri/AgriJourneyPanel.tsx:192` | Rendered `<div data-testid="school-card" />` inside `agri-group-selected` branch | 1 failed (`expect(screen.queryByTestId('school-card')).toBeNull()`) | 3/3 passed |
| `M5` (`G3-N4`) | `apps/web/src/components/map/__tests__/AreaMarkerLayer.schoolBadge2857.test.tsx` (`E2E-2`) | `apps/web/src/components/map/AreaMarkerLayer.tsx:369` | Changed `const isSchoolMode =` to `const isSchoolMode = false &&` | 1 failed (`expected schoolFirstHtml to contain '4 schools'`, received `'12 properties'`) | 1/1 passed |
| `M6a` (`G3-N5`) | `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` (`L87 E2E-7`) | `apps/web/src/components/discover/panels/SchoolsInAreaPanel.tsx:168` | Passed `urlState.areaKey` unconditionally to `useSchoolsByArea` (bypassing `schoolsProp !== undefined ? null :`) | 1 failed (`byAreaCalls()` fired twice instead of `toHaveLength(1)`) | 3/3 passed |
| `M6b` (`G3-N6`) | `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` (`L87 E2E-8`) | `apps/web/src/components/discover/panels/SchoolsInAreaPanel.tsx:317` | Changed `radiusKm: DEFAULT_SCHOOL_RADIUS_KM` (`3`) to `radiusKm: 5` | 1 failed (`expected params.get('radiusKm') '5' to be '3'`) | 3/3 passed |
| `M6c` (`G3-N7`) | `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` (`L89 E2E-6`) | `apps/web/src/hooks/useDiscoverListings.ts:207` | Passed `filters: {}` into `buildDiscoverSearchParams` | 1 failed (`matchingCalls` with `schoolLat`, `schoolLon`, `schoolRadiusKm=3`, `propertyTypes=house` was empty) | 3/3 passed |
| `M6d` (`G3-N8`) | `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` (`L157 111-115`) | `apps/web/src/components/discover/panels/schools/combined/AreaSchoolCombinedPanel.tsx:283,295` | Changed `onChangeSchool={onClearSchool}` to `onChangeSchool={() => undefined}` | 1 failed (`expected params.get('schoolId') "school-manipal-1" to be null`) | 3/3 passed |
| `M7a` (`G3-N9`) | `apps/web/src/features/discover/surfaces/__tests__/buildMapSurfaceModel.mobileCluster2857.test.tsx` (`G3-M11`) | `apps/web/src/features/discover/surfaces/buildMapSurfaceModel.tsx:897` | Overrode `journey: { ...activeAreasNavigationJourney, selectNode: () => undefined }` | 1 failed (`Object.is equality` + `handleAreaSelect` not called) | 2/2 passed |
| `M7b` (`G3-N10`) | `apps/web/src/features/discover/surfaces/__tests__/buildMapSurfaceModel.mobileCluster2857.test.tsx` (`230-233`) | `apps/web/src/features/discover/surfaces/buildMapSurfaceModel.tsx:896` | Changed `visible: mobileMapOpen` to `visible: false` | 1 failed (`expected openView.overlays.mobileCluster.visible false to be true`) | 2/2 passed |

---

## 12. Dispositions

- **8 `#2857` `MOVE_DOWN` specs (`L12`, `L45`, `L47`, `L84`, `L87`, `L89`, `L164`, `L217`):** All lower-level replacement gaps identified in the audit are now covered by unit/controller/component/page/IT tests with transient mutation proofs (`M1`..`M6`). None of the `e2e/**` files are deleted in this PR (awaiting separate owner by-name retirement step).
- **2 `RETAIN_SPECIALIST` trim specs (`L91`, `L157`):** Non-browser-only assertions (`G3-M11` + `230-233` in `L91`; `111-115` in `L157`) are now covered at surface/page level with mutation proofs (`M6d`, `M7a`, `M7b`). The spec files remain on disk untouched.

---

## 13. Intended Manifest Row Updates (NOT applied by this PR)

| Row | Spec file | Intended decision | Intended status | Intended destination / rationale |
|---|---|---|---|---|
| `L12` | `e2e/broker-agri-listing.spec.ts` | `MOVE_DOWN` | `REPLACED_LOWER_LEVEL(#2857)` | Covered by `AgriListingBoundaryJourneyIT` + `ListingControllerTest#updateListing_oversizedBoundary_returns422BoundaryTooLargeAndLeavesPersistedBoundaryUnchanged` (`M1`). |
| `L45` | `e2e/discover-agri-journey-1375.spec.ts` | `MOVE_DOWN` | `REPLACED_LOWER_LEVEL(#2857)` | Covered by `MapDiscovery.agriOverlayPeek2857.test.tsx` (`AC6` + `AC9`, `M4a`..`M4c`) + `DiscoverRightPanel.agri.test.tsx` + `useDiscoverAreas.test.ts`. |
| `L47` | `e2e/discover-agri-overlay-peek-journey-1431.spec.ts` | `MOVE_DOWN` | `REPLACED_LOWER_LEVEL(#2857)` | Covered by `MapDiscovery.agriOverlayPeek2857.test.tsx` (`AC3`, `M4a`) + `AgriPolygonLayer.test.tsx` + `AgriGroupSelectedPanel.test.tsx` + `AgriGroupListingPeek.test.tsx`. |
| `L84` | `e2e/discover-school-first-journey.spec.ts` | `MOVE_DOWN` | `REPLACED_LOWER_LEVEL(#2857)` | Covered by `AreaMarkerLayer.schoolBadge2857.test.tsx` (`E2E-2`, `M5`) + `MapDiscovery.schoolFirst.test.tsx`. |
| `L87` | `e2e/discover-school-journey.spec.ts` | `MOVE_DOWN` | `REPLACED_LOWER_LEVEL(#2857)` | Covered by `MapDiscovery.schoolJourney2857.test.tsx` (`E2E-7`, `E2E-8`, `M6a`, `M6b`) + `SchoolsInAreaPanel.test.tsx`. |
| `L89` | `e2e/discover-school-selected.spec.ts` | `MOVE_DOWN` | `REPLACED_LOWER_LEVEL(#2857)` | Covered by `MapDiscovery.schoolJourney2857.test.tsx` (`E2E-6`, `M6c`) + `SchoolSelectedPanel.test.tsx`. |
| `L164` | `e2e/discover/school-badge-suppression.spec.ts` | `MOVE_DOWN` | `REPLACED_LOWER_LEVEL(#2857)` | Covered by `useDiscoverBadgeController.issue2190.test.ts` (`SBS-1`, `SBS-2`, `M2`) + `discoverBadge.test.ts`. |
| `L217` | `e2e/verify-agri-clusters-1372.spec.ts` | `MOVE_DOWN` | `REPLACED_LOWER_LEVEL(#2857)` | Covered by `useDiscoverMapDataController.areaFirstMarkers2857.test.ts` (`AC7`, `M3`) + `AgriMarkerClusterLayer.test.tsx`. |
| `L91` | `e2e/discover-schools-mobile-cluster-2124.spec.ts` | `RETAIN_SPECIALIST` | `TRIM_READY(#2857)` | `G3-M11` and `230-233` moved down to `buildMapSurfaceModel.mobileCluster2857.test.tsx` (`M7a`, `M7b`). |
| `L157` | `e2e/discover/issue-2770-compact-school-context.spec.ts` | `RETAIN_SPECIALIST` | `TRIM_READY(#2857)` | `111-115` (`Change school` -> area view DOM order) moved down to `MapDiscovery.schoolJourney2857.test.tsx` (`M6d`). |
