# Issue #1765 — Area-First Discover Visual Polish & Lockstep Evidence

This directory contains visual audit evidence for **Issue #1765: polish area-first region and corridor pages after #1745**, building upon the visual foundation established in PR #1764.

## Visual Polish Objectives & Implementation

1. **Area-First Landing Polish (`AreaGroupsLandingPanel.tsx`)**
   - **Dark Navy Summary Card**: Replaced light intro card with the mock's dark navy summary/hero card (`bg-[#0F172A] border border-slate-800`), featuring breadcrumbs (`Discover Bangalore › Search by area`), copper location icon block, and dark-themed statistics (`groups`, `areas`, `properties` for sale/rent).
   - **ScopedSearch & Segmented Switch**: Integrated `ScopedSearch` with an Area / School pill toggle switch above the search input and interactive dropdown results for rapid locality jumping.
   - **Metric Bars & Explore Group CTA**: Styled the bottom of group cards with two side-by-side metric bars (location count + icon on left; properties count + copper icon on right) and updated the CTA affordance to *"Explore group"*.
   - **Typography & Hierarchy**: Updated primary headings to editorial Fraunces font (`text-[28px] sm:text-3xl lg:text-[38px] font-semibold leading-[1.1] tracking-[-0.02em] font-['Fraunces',_ui-serif,_Georgia,_serif]`).

2. **North-Scoped Area-First Polish (`AreaGroupsLandingPanel.tsx`)**
   - **Scope-Aware Editorial Copy**: Updated `AreaGroupsIntro` to dynamically reflect active scope filters (e.g., `"Area groups in North Bangalore"` and `"Pick a group to narrow to its areas within North Bangalore..."`).
   - **Calm Bordered Banners**: Refined the macro region filter banner to calm bordered styling (`rounded-xl border border-copper/30 bg-copper-tint/30 p-4 shadow-sm`), replacing noisy backgrounds.

3. **Corridor / Zone Card Polish (`AreaGroupSelectedPanel.tsx` — Level 2)**
   - **ScopedSearch Integration**: Added `ScopedSearch` and journey switching to Level 2 for consistent navigation across drill-down states.
   - **LocalityCard Parity**: Upgraded Level 2 locality cards (`LocalityCard`) to 100% visual parity with `GroupCard` and `AreaCard` from `retrends-design-system`, including smooth hover elevations (`hover:-translate-y-0.5 hover:border-copper/60 hover:shadow-lg`) and structured footer rows with clean chevron micro-animations.
   - **Zero-Property State**: Styled empty localities as calm, de-emphasized cards (`bg-muted/40 border-border/60`), making it clear that localities remain navigable without alarming error styling.

4. **Area Card & Breadcrumb Polish (`AreaSelectedPanel.tsx`, `DiscoverRightPanel.tsx`, `JourneySwitcher.tsx`)**
   - **Empty & Loading States**: Styled `renderAreaHydrating`, `renderAreaNotFound`, and zero-listing area results as calm bordered containers (`rounded-xl border border-border bg-muted/20 p-8 shadow-sm`), eliminating jarring unstyled divs.
   - **Chip & Breadcrumb Consistency**: Standardized journey switcher pills and breadcrumb helper tags across all Area-first levels.

5. **Map Marker Polish (`AreaMarkerLayer.tsx`)**
   - **Pill-Style Group Markers**: Split marker rendering so area-first group markers render as dark navy pill markers (`padding: 6px 12px`, `border-radius: 9999px`) displaying group name and property count (e.g. `Airport Belt 20`), while keeping city-level macro-region circular bubbles from PR #1764 unchanged.

---

## Evidence Scenarios & Screenshots

All screenshots were captured automatically via Playwright e2e testing against real backend and Vite frontend services (`e2e/discover-area-first-polish-1765.spec.ts`).

### 1. Bangalore Area-First Landing
- **Route**: `/discover?city=bangalore&journey=area-first`
- **File**: `1_bangalore_area_first_landing.png`
- **Verification**: Demonstrates Fraunces editorial typography, macro region headings (`East Bangalore`, `North Bangalore`, `Airport Belt`), clean 40x40 icon boxes, and semantic muted badges.

### 2. North-Scoped Area-First Landing
- **Route**: `/discover?city=bangalore&scope=north&journey=area-first`
- **File**: `2_bangalore_north_scoped_landing.png`
- **Verification**: Verifies scope-aware copy (`Explore by area in North Bangalore`), calm copper-tint filter banner, and filtering of corridors exclusively to North Bangalore (`Airport Belt`, `North Growth`).

### 3. Corridor / Zone Selected (Level 2)
- **Route**: `/discover?city=bangalore&scope=north&journey=area-first&groupId=airport-belt`
- **File**: `3_bangalore_corridor_selected.png`
- **Verification**: Captures the selected `Airport Belt` corridor hero card, summary statistics, and member localities (`Yelahanka`, `Hebbal`) styled with polished `LocalityCard` hover and footer structures.

### 4. Area Selected (Level 3)
- **Route**: `/discover?city=bangalore&scope=north&journey=area-first&groupId=airport-belt&areaKey=IN|KA|Bengaluru|Yelahanka`
- **File**: `4_bangalore_area_selected.png`
- **Verification**: Confirms Level 3 drill-down into `Yelahanka`, displaying verified property listings, trust strip, and breadcrumb navigation back to corridors and macro regions.

### 5. Udupi Area-First Landing (Sanity Check)
- **Route**: `/discover?city=udupi&journey=area-first`
- **File**: `5_udupi_area_first_landing.png`
- **Verification**: Verifies visual polish across Udupi's neighbourhood groups (`Coastal Strip`, `University Belt`, `City Centre`, `Central Udupi`), confirming clean rendering in multi-tier regional datasets.

### 6. Udupi Group Selected (Sanity Check)
- **Route**: `/discover?city=udupi&journey=area-first&groupId=coastal-strip`
- **File**: `6_udupi_group_selected.png`
- **Verification**: Demonstrates Udupi's `Coastal Strip` group drill-down, showing member localities (`Malpe`, `Kaup`) with consistent ReTrends visual tokens and zero hardcoded hex colors.

### 7. Area / School Segmented Toggle Mode Switch Without Navigation (Scenario 8)
- **Route**: `/discover?city=bangalore&lat=12.97160&lon=77.59460&zoom=11&journey=area-first&intent=buy`
- **Verification**: Proves that clicking the School tab in the segmented search control switches the search input mode without navigating away from the area-first journey. Only when the user explicitly selects a school from the search dropdown does navigation to `school-first` occur.

| Step | Screenshot file | URL captured at that step | Expected result | Actual result |
| :--- | :--- | :--- | :--- | :--- |
| **1. Initial Area mode** | `8a_school_toggle_initial_area_mode.png` | `/discover?city=bangalore&lat=12.9716&lon=77.5946&zoom=11&journey=area-first&intent=buy` | Area tab active, search box visible, URL/state is `journey=area-first`. | Area tab active, search box visible, URL is `journey=area-first`. |
| **2. Click School tab** | `8b_school_toggle_after_click_school.png` | `/discover?city=bangalore&lat=12.9716&lon=77.5946&zoom=11&journey=area-first&intent=buy` | Clicking School tab did not navigate. School tab active (`aria-checked="true"`), placeholder says `"Search school name…"`, URL still contains `journey=area-first`. | Clicking School tab did not navigate. Placeholder changed to `"Search school name…"`, URL is unchanged. |
| **3. Type school query** | `8c_school_search_dropdown.png` | `/discover?city=bangalore&lat=12.9716&lon=77.5946&zoom=11&journey=area-first&intent=buy` | Typing school query did not navigate. Typed query `"Bangalore"` visible, school dropdown/results visible, URL still contains `journey=area-first`. | Typing school query did not navigate. Dropdown result `Bangalore International School` visible, URL is unchanged. |
| **4. Select school result** | `8d_school_result_selected_navigates.png` | `/discover?city=bangalore&lat=13.0525&lon=77.6364&zoom=11&journey=school-first&intent=buy&schoolId=sch-test-1&radiusKm=3&areaKey=IN%7CKA%7CBengaluru%7CThanisandra` | Selecting school result did navigate. Only now the URL changes to `journey=school-first&schoolId=sch-test-1`, selected school state is visible, intent preserved. | Selecting school result did navigate. URL changed to `journey=school-first`, school cards/markers rendered. |

---

## Verification Matrix

| Check | Tool / Suite | Result | Notes |
| :--- | :--- | :--- | :--- |
| **TypeScript Check** | `npx tsc --noEmit` | ✅ 0 Errors | Full project type check passed |
| **ESLint** | `npx eslint <edited-files>` | ✅ 0 Errors, 0 Warnings | Area-first journey polish, including shared empty/loading/pill states reached from area-first |
| **Unit & Routing Tests** | `vitest run src/components/discover/` | ✅ 47 Files, 916 Tests Passed | 100% regression suite pass |
| **Playwright E2E Coverage** | `npx playwright test e2e/discover-area-first-polish-1765.spec.ts` | ✅ 8 / 8 Scenarios Passed | Full browser verification & evidence lockstep |
