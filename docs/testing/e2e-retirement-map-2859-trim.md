# E2E Retirement Map — Issue #2859 `trim_rows` Batch (Plus `L211` from #2856)

- **Tracking issues:** `#2859` (`### Trim rows` — 15 mixed Playwright specs) + `#2856` (`L211` `e2e/residential-required-fields-2040.spec.ts` desktop trim seams)
- **Manifest reference:** `docs/testing/e2e-retirement-manifest.csv` (`disposition = trim_rows`)
- **Scope constraint:** Adds lower-level Vitest unit/component/controller seam coverage and documents per-`test()` retirement/retention mappings and transient mutation proofs (`M1..M10`). Does **not** edit or delete any `e2e/**` spec or `docs/testing/e2e-retirement-manifest.csv`.

---

## 1. Executive Summary

| Manifest Row | Spec File | Total `test()` Blocks | Retired (Existing Vitest) | Retired (New `#2859` Vitest) | Retained as Real-Browser Canary |
| --- | --- | :---: | :---: | :---: | :---: |
| `L52` | `e2e/discover-area-clustering-2615.spec.ts` | 6 | 4 (`C1`, `C2`, `C4`, `C5`) | 0 | 2 (`C3`, `C6`) |
| `L56` | `e2e/discover-area-hierarchy-2124.spec.ts` | 4 | 3 (Destination card, sub-cluster drill-down, cold-load `node=`) | 0 | 1 (Zone -> direction -> area -> Back ladder + fitBounds) |
| `L57` | `e2e/discover-area-intent-switch.spec.ts` | 4 | 3 (Area Selected Buy->Rent, Rent->Buy, filter sheet Apply) | 0 | 1 (Listing card click -> detail -> Back preserves `intent=rent`) |
| `L58` | `e2e/discover-area-selected-redesign.spec.ts` | 8 | 2 (`A1`, `A2`) | 6 (`A3`, `B-T2`, `B-T5`, `D-C1`, `D-C5`, `D-C6`) | 0 |
| `L60` | `e2e/discover-bangalore-entry-overhaul.spec.ts` | 2 | 0 | 2 (`B3`, `B7`) | 0 |
| `L66` | `e2e/discover-flow-Audit-N11-N21.spec.ts` | 4 | 2 (`N11`, `N16`) | 1 (`N15`) | 1 (`N21`) |
| `L70` | `e2e/discover-intent-price-bounds-reset-2201.spec.ts` | 4 | 3 (List Rent resets Buy bounds, List Buy resets Rent bounds, Map sheet switch) | 0 | 1 (Map filter sheet Apply after Rent switch keeps `intent=rent` without stale URL race) |
| `L71` | `e2e/discover-List-Audit-N1-N10.spec.ts` | 1 | 0 | 0 | 1 (`N3` mobile card list -> detail -> Back journey) |
| `L73` | `e2e/discover-map-info-dock-2748.spec.ts` | 5 | 0 | 4 (`D1a`, `D4`, `D7b`, `D9`) | 1 (`D2` 2D bounding-box non-overlap on live Leaflet canvas) |
| `L77` | `e2e/discover-multi-area-2017.spec.ts` | 4 | 3 (`MA-1`, `MA-3`, `MA-4`) | 0 | 1 (`MA-2` full 2-area commit + reload + Browser Back) |
| `L78` | `e2e/discover-multi-area-ux-2729.spec.ts` | 3 | 0 | 1 (Dismiss chip from 2-area header -> single-area collapse) | 2 (Full add-nearby -> Show listings -> overflow menu -> Clear; Mobile sheet map parity) |
| `L98` | `e2e/markers-truncation.spec.ts` | 3 | 0 | 3 (`MT-1`, `MT-2`, `MT-3`) | 0 |
| `L179` | `e2e/result-scope-2016.spec.ts` | 4 | 0 | 3 (`N6a`, `N13`, `N14`) | 1 (`N4` live Leaflet drag -> Search this area -> Return) |
| `L184` | `e2e/result-scope-candidate-callouts-2456.spec.ts` | 1 | 0 | 1 (Nearby candidate callout parity, non-interactive markup, Add promotion & Cancel restore) | 0 |
| `L185` | `e2e/result-scope-polygon-2018.spec.ts` | 2 | 0 | 1 (`N16` POLYGON panel scope bar & zero legacy chip) | 1 (`N5` live map polygon vertex click-draw -> Done -> Return) |
| `L211` | `e2e/residential-required-fields-2040.spec.ts` | 4 | 0 | 2 (desktop `AC1/AC2`, desktop `AC5`) | 2 (mobile `390x844` `AC1/AC2` visibility; mobile `390x844` `AC5` sticky-footer bounding-box non-occlusion) |
| **Total** | **16 specs** | **59** | **20** | **24** | **15** |

---

## 2. New Vitest Suites Added in `#2859`

1. `apps/web/src/components/discover/__tests__/MapInfoDockAndTruncation.2859Trim.test.tsx` (7 tests)
   - Covers `L73` (`D1a`, `D4`, `D7b`, `D9`) and `L98` (`MT-1`, `MT-2`, `MT-3`).
2. `apps/web/src/features/discover/__tests__/DiscoverTrimSeams.2859Trim.test.tsx` (12 tests)
   - Covers `L58` (`A3`/`D-C1`, `B-T2`/`D-C6`, `B-T5`/`D-C5`), `L60` (`B3`, `B7`), `L66` (`N15`), `L78` (chip dismiss collapse), `L179` (`N6a`, `N13`, `N14`), `L184` (candidate callout & draft member marker parity), and `L185` (`N16`).
3. `apps/web/src/components/broker/__tests__/ResidentialListingForm.requiredFields2040.2859Trim.test.tsx` (2 tests)
   - Covers `L211` desktop `AC1/AC2` (`#builtArea` visible in Section 3 before the collapsed `More details` disclosure and editable without expanding) and desktop `AC5` (blocked `Review` persists draft, keeps `mode === 'edit'`, focuses `#builtArea`, and proceeds to `Review your listing` once `#builtArea` is filled).

---

## 3. Per-Spec `test()` Disposition Tables

### `L52` — `e2e/discover-area-clustering-2615.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `C1: City landing renders zero overlaps between area cards, cluster pills, and dots` | `RETIRE_COVERED_EXISTING` | `apps/web/src/features/discover/navigation/__tests__/areaClustering.test.ts` (`computeAreaMarkers` zero-overlap invariant across card/cluster/dot footprints) |
| `C2: Direction landing renders zero overlaps` | `RETIRE_COVERED_EXISTING` | `apps/web/src/features/discover/navigation/__tests__/areaClustering.test.ts` (`computeAreaMarkers` direction-scoped clustering & collision resolution) |
| `C3: Clicking a cluster pill zooms in so constituent areas uncluster` | `RETAIN_AS_REAL_BROWSER_CANARY` | Real Leaflet zoom animation + tile/projection recalculation on cluster click |
| `C4: Hovering a cluster pill reveals constituent area names in tooltip` | `RETIRE_COVERED_EXISTING` | `apps/web/src/features/discover/navigation/__tests__/areaClustering.test.ts` (`formatClusterTooltip` / cluster member names) |
| `C5: Top area cards remain visible as full cards rather than collapsing into a single mega-cluster` | `RETIRE_COVERED_EXISTING` | `apps/web/src/features/discover/navigation/__tests__/areaClustering.test.ts` (`computeAreaMarkers` top-ranked anchor preservation) |
| `C6: Selected area card is never swallowed into a cluster pill` | `RETAIN_AS_REAL_BROWSER_CANARY` | Real map pan/zoom + selected marker z-index/unclustered visibility canary |

### `L56` — `e2e/discover-area-hierarchy-2124.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `City landing renders destination cards with area & listing counts` | `RETIRE_COVERED_EXISTING` | `apps/web/src/features/discover/navigation/__tests__/destinationCards.test.ts` + `useAreasNavigationJourney.test.ts` |
| `Zone -> direction -> area -> Back ladder steps cleanly with map fitBounds` | `RETAIN_AS_REAL_BROWSER_CANARY` | End-to-end hierarchy drill-down + real Leaflet `fitBounds` camera sync + Back ladder |
| `Sub-cluster drill-down resolves children and updates breadcrumb` | `RETIRE_COVERED_EXISTING` | `apps/web/src/features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts` (`selectNode`, breadcrumb trail, child resolution) |
| `Cold-loading ?node=a:... resolves directly to leaf area state` | `RETIRE_COVERED_EXISTING` | `apps/web/src/features/discover/navigation/__tests__/useAreasNavigationJourney.test.ts` (cold-load `node=a:...` leaf resolution) |

### `L57` — `e2e/discover-area-intent-switch.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `Switching Buy -> Rent on AreaSelectedPanel updates URL intent=rent and rental copy` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/panels/__tests__/AreaSelectedPanel.test.tsx` (intent pill toggle + `area-intent-helper` copy) |
| `Switching Rent -> Buy removes intent param and restores sale copy` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/panels/__tests__/AreaSelectedPanel.test.tsx` |
| `MapFilterSheet intent switch + Apply updates URL intent and resets incompatible types` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/filters/__tests__/intentPriceBounds.test.ts` + `city.ts` (`setIntent` with `filtersOverride`) |
| `Clicking a rental listing card -> detail -> Browser Back preserves intent=rent and areaKey` | `RETAIN_AS_REAL_BROWSER_CANARY` | Cross-route `/discover` -> `/listing/:id` -> Browser Back history restoration canary |

### `L58` — `e2e/discover-area-selected-redesign.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `A1: AreaSelectedPanel renders CompactResultsHeader with area name and count` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/panels/__tests__/AreaSelectedPanel.test.tsx` |
| `A2: AreaSelectedPanel renders nearby areas tile` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/panels/__tests__/AreaSelectedPanel.test.tsx` |
| `A3: AreaSelectedPanel renders "Schools in {Area}" tile and clicking enters schoolPicking=1` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`A3 & D-C1: AreaSetTwoTileRow renders "Schools in {Area}" tile with school count sub-label and fires onAddSchool`) |
| `B-T2: Two-rung Back from area-school-combined -> schools-in-area -> area-selected (legacy areaKey)` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`B-T2 & D-C6: two-rung handleAreaFirstBack steps from area-school-combined -> schools-in-area -> area-selected`) |
| `B-T5: Selecting a school in area-first schoolPicking=1 stays in area-first (legacy areaKey)` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`B-T5 & D-C5: selecting a school during area-first schoolPicking=1...`) |
| `D-C1: Canonical node=a:... renders "Schools in {Area}" tile` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`A3 & D-C1`) |
| `D-C5: Canonical node=a:... school selection preserves journey=area-first and node=` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`B-T5 & D-C5`) |
| `D-C6: Canonical node=a:... two-rung Back preserves node= across both steps` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`B-T2 & D-C6`) |

### `L60` — `e2e/discover-bangalore-entry-overhaul.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `B3: Clicking a Bangalore region card sets scope=<region> and Clear removes scope` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`B3: GuidedEntryPanel region card click writes scope=south with aria-pressed="true", and Clear removes scope`) |
| `B7: Region scope selection followed by area drill-down survives Browser Back and Forward` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`B7: selecting a region (scope=south) then pushing an area selection preserves scope=south across browser Back and Forward`) |

### `L66` — `e2e/discover-flow-Audit-N11-N21.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `N11: Cold-loading ?city=bangalore lands on GuidedEntryPanel` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/panels/__tests__/GuidedEntryPanel.test.tsx` |
| `N15: Start Over clears areaKey, journey, lat, lon, zoom=14 to bare ?city=udupi` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`L66 N15: startOver clears areaKey, journey param, lat, lon, and zoom=14, producing exact ?city=udupi and incrementing startOverTick`) |
| `N16: Filter chip removal updates URL and list` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/panels/__tests__/AreaSelectedPanel.test.tsx` |
| `N21: Deep-linked school-first journey restores school circle and listing cards` | `RETAIN_AS_REAL_BROWSER_CANARY` | Real browser cold-load of school-first map circle + listing cards |

### `L70` — `e2e/discover-intent-price-bounds-reset-2201.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `Switching Buy -> Rent in List view resets priceMin/priceMax` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/filters/__tests__/intentPriceBounds.test.ts` |
| `Switching Rent -> Buy in List view resets rental priceMin/priceMax` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/filters/__tests__/intentPriceBounds.test.ts` |
| `Switching intent inside MapFilterSheet resets draft price bounds immediately` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/filters/__tests__/intentPriceBounds.test.ts` |
| `MapFilterSheet intent switch + Apply commits intent=rent and cleared bounds in one atomic URL write` | `RETAIN_AS_REAL_BROWSER_CANARY` | Real browser sheet close + router navigation race canary (#2201) |

### `L71` — `e2e/discover-List-Audit-N1-N10.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `N3: Mobile list view renders property cards, navigates to detail, and returns via Back` | `RETAIN_AS_REAL_BROWSER_CANARY` | Single retained mobile viewport (`390x844`) list -> detail -> Back canary |

### `L73` — `e2e/discover-map-info-dock-2748.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `D1a: Single map-info-dock card with guidance, count (role=status), and recenter in order` | `RETIRE_COVERED_NEW` | `MapInfoDockAndTruncation.2859Trim.test.tsx` (`D1a: renders a single map-info-dock container without role="status" on the outer wrapper, role="status" on discover-badge, and strict guidance -> count -> recenter DOM order`) |
| `D2: Desktop map-info-dock bounding box does not overlap zoom controls, attribution, or legend` | `RETAIN_AS_REAL_BROWSER_CANARY` | Genuine 2D CSS layout / Leaflet control bounding-box collision check |
| `D4: Selecting a leaf area hides guidance row while keeping count and recenter` | `RETIRE_COVERED_NEW` | `MapInfoDockAndTruncation.2859Trim.test.tsx` (`D4: hides map-info-dock-guidance when a leaf area is selected (listingCapable=true) while keeping discover-badge and map-info-dock-recenter visible`) |
| `D7b: Recenter button label updates across City -> Area -> School-in-area -> City and triggers recenter` | `RETIRE_COVERED_NEW` | `MapInfoDockAndTruncation.2859Trim.test.tsx` (`D7b: updates recenter accessible name and scopeKey across City -> Area -> area-school-combined -> City transitions and invokes onRecenter`) |
| `D9: Mobile viewport renders a single consolidated map-info-dock with mobile guidance copy` | `RETIRE_COVERED_NEW` | `MapInfoDockAndTruncation.2859Trim.test.tsx` (`D9: renders a single map-info-dock and single map-info-dock-recenter on mobile (isMobile=true) with zero legacy duplicate buttons`) |

### `L77` — `e2e/discover-multi-area-2017.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `MA-1: Opening Add nearby areas seeds draft with primary area and lists candidates` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/panels/__tests__/AreaSetDraftPanel.test.tsx` |
| `MA-2: Adding a second area and clicking Show listings commits rscope=areas&rareas=... and survives reload + Back` | `RETAIN_AS_REAL_BROWSER_CANARY` | Canonical multi-area URL commit, page reload, and Browser Back canary |
| `MA-3: Removing a draft chip before commit keeps committed URL unchanged` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/panels/__tests__/AreaSetDraftPanel.test.tsx` |
| `MA-4: Cancel exits draft mode without mutating committed URL` | `RETIRE_COVERED_EXISTING` | `apps/web/src/components/discover/panels/__tests__/AreaSetDraftPanel.test.tsx` |

### `L78` — `e2e/discover-multi-area-ux-2729.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `Full multi-area UX flow: Add nearby -> Show listings -> overflow menu -> Clear selected areas` | `RETAIN_AS_REAL_BROWSER_CANARY` | Real browser Radix dropdown menu + map/panel multi-area lifecycle canary |
| `Dismissing one chip from a 2-area committed header collapses directly to single-area "Properties in <Area>"` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`renders 2 committed area chips with "&" title and collapses to single-area "Properties in <Area>" when second chip is dismissed`) |
| `Mobile bottom sheet multi-area draft & committed header parity` | `RETAIN_AS_REAL_BROWSER_CANARY` | Real mobile viewport sheet snap + map interaction canary |

### `L98` — `e2e/markers-truncation.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `MT-1 (N7 positive): Renders "Showing X of Y pins in this map area — zoom in to refine" when truncated=true` | `RETIRE_COVERED_NEW` | `MapInfoDockAndTruncation.2859Trim.test.tsx` (`MT-1 (N7 positive): renders formatted truncation notice inside an aria-live="polite" region when truncated=true`) |
| `MT-2 (N7 negative): Hides truncation card when truncated=false while keeping aria-live container mounted` | `RETIRE_COVERED_NEW` | `MapInfoDockAndTruncation.2859Trim.test.tsx` (`MT-2 (N7 negative): keeps the aria-live="polite" container mounted in the DOM when truncated=false so screen readers detect transitions, without rendering truncation copy`) |
| `MT-3 (N8): Right-panel property list renders all cards unaffected by map marker truncation` | `RETIRE_COVERED_NEW` | `MapInfoDockAndTruncation.2859Trim.test.tsx` (`MT-3 (N8): right-panel ListingsBody renders all areaListings cards unaffected when map markers are truncated`) |

### `L179` — `e2e/result-scope-2016.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `N4: Dragging the map reveals "Search this area", commits VIEWPORT scope, and Return restores AREA_SET` | `RETAIN_AS_REAL_BROWSER_CANARY` | Real Leaflet drag gesture -> `moveend` -> `Search this area` -> `Return` canary |
| `N6a: Anonymous shopper does not see Draw search area while rscope=areas round-trips cleanly` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`N6a: anonymous shopper does not see DrawSearchAreaEntry (area-set-draw-area count === 0) while rscope=areas & rareas round-trip cleanly across mount`) |
| `N13: Cold-loading rscope=vp&rvp=...&rprev=areas:... restores VIEWPORT scope and Return restores AREA_SET` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`N13: cold-loading rscope=vp&rvp=12.9,77.5,13.1,77.7&rprev=areas:IN|KA|Bengaluru|Koramangala restores VIEWPORT scope and Return restores previous AREA_SET`) |
| `N14: Navigating from committed rscope=areas to /listing/:id and pressing Back preserves rscope=areas` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`N14: navigating from committed rscope=areas to /listing/:id and pressing browser Back preserves rscope=areas and rareas intact`) |

### `L184` — `e2e/result-scope-candidate-callouts-2456.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `Candidate callout count matches panel rows, callouts are non-interactive, Add promotes to white draft member card, Cancel restores` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`maintains 1:1 parity between nearby candidates and map callout icons, renders non-interactive callout markup, promotes Added candidate to draft member marker, and restores on resetToCommitted`) |

### `L185` — `e2e/result-scope-polygon-2018.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `N5: Clicking map vertices in draw mode -> Done commits rscope=poly and Return restores previous scope` | `RETAIN_AS_REAL_BROWSER_CANARY` | Real Leaflet click-to-add-vertex polygon drawing & SVG overlay canary |
| `N16: Committed POLYGON scope renders in-panel scope bar with "Drawn area" heading and zero legacy floating chip` | `RETIRE_COVERED_NEW` | `DiscoverTrimSeams.2859Trim.test.tsx` (`L185 N16: committed POLYGON scope renders area-panel-scope-bar-polygon, Drawn area heading/summary copy, and zero legacy active-scope-chip-polygon`) |

### `L211` — `e2e/residential-required-fields-2040.spec.ts`

| Playwright `test()` | Disposition | Lower-Level Coverage / Retention Rationale |
| --- | --- | --- |
| `desktop > AC1/AC2 — Built-up area is visible in core Property details section without expanding any collapsed section` (L356–L383) | `RETIRE_COVERED_NEW` | `ResidentialListingForm.requiredFields2040.2859Trim.test.tsx` (`AC1 & AC2: apartment form renders #builtArea ("Built-up area") in Section 3 ("Property details") before the collapsed "More details" toggle and allows editing without expanding More details`) |
| `desktop > AC5 — blocked Review scrolls+focuses Built-up area, then filling it lets Review proceed` (L385–L415) | `RETIRE_COVERED_NEW` | `ResidentialListingForm.requiredFields2040.2859Trim.test.tsx` (`AC5: clicking Review on an apartment draft with every submit gate met EXCEPT #builtArea stays in edit mode, focuses #builtArea, and only enters "Review your listing" once #builtArea is filled`) |
| `mobile 390x844 > AC1/AC2 — Built-up area is visible without expanding any collapsed section (mobile)` (L421–L430) | `RETAIN_AS_REAL_BROWSER_CANARY` | Real mobile `390x844` viewport visibility check for `#builtArea` without expanding collapsed sections (`#2856` specialist suite) |
| `mobile 390x844 > AC5 mobile occlusion — focused Built-up area is not covered by the fixed sticky footer` (L432–L472) | `RETAIN_AS_REAL_BROWSER_CANARY` | Real mobile `390x844` viewport scroll-into-view + `boundingBox()` non-occlusion check comparing focused `#builtArea` bottom edge (`inputBox.y + inputBox.height`) against fixed sticky footer `div.fixed.inset-x-0.bottom-0` top edge (`footerBox.y`) (`[HIT_TEST][PAINT_GEOMETRY]` specialist canary in `#2856`) |

---

## 4. Transient Mutation Proof Register (`M1..M10`)

Each mutation was applied to production source in `/Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-2859-trim-rows`, verified to fail (`RED`) the targeted Vitest test, and immediately reverted (`GREEN`).

| ID | Target Row(s) | Production File Mutated | Mutation Applied | Failing Test (`RED` Proof) | Reverted (`GREEN`) |
| --- | --- | --- | --- | --- | :---: |
| `M1` | `L58` (`B-T2`, `D-C6`) | `apps/web/src/features/discover/controllers/useDiscoverSchoolController.ts` | Replaced `urlActions.backToSchoolPicking()` with `urlActions.clearSchoolSelection()` in `handleAreaFirstBack` | `DiscoverTrimSeams.2859Trim.test.tsx` -> `B-T2 & D-C6` failed (`expected undefined to be true` on `urlState.schoolPicking`) | Yes |
| `M2` | `L58` (`B-T5`, `D-C5`) | `apps/web/src/features/discover/state/useDiscoverJourneyTransitions.ts` | Removed `&& !hasResolvedCanonicalArea` guard in `handleSelectSchoolById` | `DiscoverTrimSeams.2859Trim.test.tsx` -> `B-T5 & D-C5` failed (`expected 'school-first' to be 'area-first'`) | Yes |
| `M3` | `L60` (`B3`, `B7`) | `apps/web/src/features/discover/state/url/city.ts` | Omitted `next.delete('scope')` when clearing scope in `setScope` | `DiscoverTrimSeams.2859Trim.test.tsx` -> `B3` failed (`Expected aria-pressed="false", Received aria-pressed="true"`) | Yes |
| `M4` | `L66` (`N15`) | `apps/web/src/features/discover/state/url/area.ts` | Preserved `zoom` param inside `startOver` | `DiscoverTrimSeams.2859Trim.test.tsx` -> `L66 N15` failed (`expected '?city=udupi&zoom=14' to be '?city=udupi'`) | Yes |
| `M5` | `L73` (`D1a`, `D4`, `D7b`, `D9`) | `apps/web/src/components/discover/MapInfoDock.tsx` | Added `role="status"` to outer `map-info-dock` container | `MapInfoDockAndTruncation.2859Trim.test.tsx` -> `D1a` failed (`expected 'status' to be null`) | Yes |
| `M6` | `L78` (chip dismiss) | `apps/web/src/features/discover/area-selected/controllers/useAreaSetScopeCommands.ts` | Made `removeCommittedArea` return early (no-op) | `DiscoverTrimSeams.2859Trim.test.tsx` -> `L78 Multi-area chip dismiss` failed (`Expected: Properties in Sanjeevini Nagar, Received: Sanjeevini Nagar · Koramangala`) | Yes |
| `M7` | `L98` (`MT-1`, `MT-2`) | `apps/web/src/components/discover/MapStatsBar.tsx` | Returned `null` when `!truncated` in `MarkersTruncationNotice` (unmounting live region) | `MapInfoDockAndTruncation.2859Trim.test.tsx` -> `MT-2` failed (`expected null not to be null` for `[aria-live="polite"]`) | Yes |
| `M8` | `L179` (`N6a`) | `apps/web/src/components/discover/panels/AreaSetSelectedExtras.tsx` | Bypassed `if (eligibility.status === 'HIDDEN') return null;` in `DrawSearchAreaEntry` | `DiscoverTrimSeams.2859Trim.test.tsx` -> `N6a` failed (`Found multiple elements by: [data-testid="area-set-draw-area"]`) | Yes |
| `M9` | `L184` (callout parity) | `apps/web/src/components/map/AreaSetCandidateCalloutLayer.tsx` | Removed `aria-hidden="true"` from `makeAreaSetCandidateCalloutIcon` | `DiscoverTrimSeams.2859Trim.test.tsx` -> `L184` failed (`Expected the element to have attribute: aria-hidden="true", Received: null`) | Yes |
| `M10` | `L211` (`AC5`) | `apps/web/src/components/broker/ResidentialListingForm.tsx` | Omitted `focusableTarget?.focus()` inside `handleGoToReview` | `ResidentialListingForm.requiredFields2040.2859Trim.test.tsx` -> `AC5` failed (`expected 'BUTTON' to be 'builtArea'` on `document.activeElement`) | Yes |
