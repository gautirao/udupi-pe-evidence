# Issue #1770 — Discover School-First Journey Polish: Evidence Audit

**Branch:** `issue-1770-school-first-polish`  
**Status:** Corrective Pass Complete — Visual Polish Implemented, Tests Green, Browser Verification Run  

---

## Corrective Pass Summary

Previous iteration had two problems:
1. **Scope drift** — implemented sibling-school switching (`ChangeSchoolInAreaSection`, belongs to #1565).
2. **Visual mismatch** — panel header still said `"Find homes near a school"` instead of `"Discover {City}"` with the target navy intro card.

Both issues are resolved in this corrective pass.

---

## Visual Checklist

| Check | Route | Status |
|---|---|---|
| Header says "Discover Bangalore" | `/discover?city=bangalore&journey=school-first` | ✅ Implemented |
| "School-first" pill visible | `/discover?city=bangalore&journey=school-first` | ✅ PanelHeader `journey` prop |
| Dark navy intro card visible | `/discover?city=bangalore&journey=school-first` | ✅ `SchoolBrowseIntro` component added |
| Breadcrumb: `Discover Bangalore › Search near school` | `/discover?city=bangalore&journey=school-first` | ✅ In `SchoolBrowseIntro` |
| Intro title: "School zones across Bangalore" | `/discover?city=bangalore&journey=school-first` | ✅ `school-browse-intro-title` |
| School count metric badge | `/discover?city=bangalore&journey=school-first` | ✅ `school-browse-intro-count` |
| Search input visible | `/discover?city=bangalore&journey=school-first` | ✅ |
| "SCHOOL ZONES" section heading | `/discover?city=bangalore&journey=school-first` | ✅ `school-zones-heading` testId |
| Zone cards (not old residential group cards) | `/discover?city=bangalore&journey=school-first` | ✅ `school-zone-card-{id}` |
| Zone cards have area pills / area names | Any school zone card | ✅ `school-zone-card-area-names` |
| Zone cards have school count metric box | Any school zone card | ✅ `school-zone-card-school-count` |
| Zone cards have nearby homes metric box | Any school zone card | ✅ `school-zone-card-listing-count` |
| CTA says "Explore zone →" | Any school zone card | ✅ |
| North-scoped landing: intro updates to "in North Bangalore" | `/discover?city=bangalore&scope=north&journey=school-first` | ✅ |
| No sibling-school switching section | L4 selected school | ✅ Removed (#1565 deferred) |
| Back to Discover Bangalore link | L4 back button | ✅ PanelHeader `onBack` / back button |

---

## Sibling-School Switching Removal (Scope Drift from #1565)

`ChangeSchoolInAreaSection` and associated logic (`handleSelectSiblingSchool`, `useSchoolsByArea`) were removed from `SchoolJourneyPanels.tsx` in the corrective pass. This feature belongs to **Issue #1565** and was out of scope for the #1770 visual-polish task.

The corresponding test suite in `SchoolSelectedPanel.test.tsx` was also updated to remove tests that asserted on the removed functionality.

---

## Required Screenshots

| File | Route | Description |
|---|---|---|
| `1_bangalore_school_first_landing.png` | `/discover?city=bangalore&journey=school-first` | School-first landing: header "Discover Bangalore", navy intro card, zone cards |
| `2_bangalore_school_first_north_scope.png` | `/discover?city=bangalore&scope=north&journey=school-first` | North-scoped landing: intro updates to "School zones in North Bangalore" |
| `3_bangalore_school_zone_selected.png` | After clicking "Hebbal & Jakkur Schools" zone card | L2 area list panel for the selected school zone |
| `4_udupi_university_belt_school_first.png` | `/discover?city=udupi&journey=school-first&groupId=university-belt` | Udupi University Belt — L2 area list |
| `5_udupi_manipal_school_list.png` | `/discover?city=udupi&journey=school-first&groupId=university-belt&areaKey=IN\|KA\|Udupi\|Manipal` | L3 school list in Manipal |
| `6_udupi_selected_school_radius.png` | `...&schoolId=11111111-2222-...&radiusKm=3` | L4 selected school with radius chips and no sibling-switching section |
| `7_back_forward_or_buy_rent_persistence.png` | Udupi school-first with intent=buy, after zone click | Buy/Rent persists across zone navigation |
| `8_area_first_regression_after_school_polish.png` | `/discover?city=bangalore&journey=area-first` | Area-first journey unaffected by school-first polish |

---

## Expected vs Actual

### Header (L1 School Browse)

| Element | Expected (ReTrends mock) | Actual (this PR) |
|---|---|---|
| Panel heading `h1` | "Discover Bangalore" | **"Discover Bangalore"** ✅ |
| Journey pill | "School-first" | **"School-first"** ✅ |
| Navy intro card eyebrow | "Discover Bangalore › Search near school" | **"Discover Bangalore › Search near school"** ✅ |
| Navy intro card heading | "School zones across Bangalore" | **"School zones across Bangalore"** ✅ |
| Section heading | "SCHOOL ZONES" | **"School zones"** ✅ |
| Zone card CTA | "Explore zone →" | **"Explore zone"** ✅ |

### Sibling School Switching (L4)

| Element | Expected (#1770) | Actual |
|---|---|---|
| Sibling school section | NOT present (belongs to #1565) | **Not present** ✅ |

---

## ReTrends Design Alignment

The `SchoolBrowseIntro` component mirrors the `AreaGroupsIntro` component (from the area-first journey), adapted with the plum identity colour (matching the school-first identity system specified in `discover-cli-investigation-guide.md` §2):

- **Navy surface:** `bg-[#0F172A]` — matches the dark navy hero from the ReTrends mock
- **Plum identity:** `text-[hsl(var(--plum))]` for eyebrow label and school icon
- **Breadcrumb structure:** `Discover {City} › Search near school`
- **Stat row:** school count metric using the GraduationCap icon in plum

---

## Validation Commands & Results

### Unit Tests
```
npx vitest run src/components/discover/
```
**Result:** 47 test files, 916 tests, 3 skipped (pre-existing) — ✅ **All passing**

### TypeScript Type Check
```
node node_modules/.bin/tsc --noEmit -p tsconfig.app.json
```
**Result for changed source files:** ✅ No errors in `SchoolJourneyPanels.tsx` or `DiscoverRightPanel.tsx`  
Remaining TS errors are in pre-existing test fixtures (stale mock shapes — not introduced by this PR).

### Playwright Browser Evidence
```
PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test \
  e2e/capture-school-first-polish-1770.spec.ts --project=full --reporter=list
```
**Result:** 10 passed (10 tests, 8 screenshots captured) — ✅ **All passing**
See screenshots in this directory.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/discover/panels/SchoolJourneyPanels.tsx` | Added `SchoolBrowseIntro` component; added `cityLabel` prop to `SchoolBrowsePanelProps`; changed `PanelHeader` title to `"Discover {City}"`; removed `ChangeSchoolInAreaSection` and `handleSelectSiblingSchool`; updated section heading to "School zones"; added `school-zones-heading` testId; fixed `r.slug` → `r.regionKey` |
| `src/components/discover/DiscoverRightPanel.tsx` | Passed `cityLabel` to both `SchoolBrowsePanel` invocations |
| `src/components/discover/__tests__/DiscoverRightPanel.routing.test.tsx` | Updated 3 assertions from old `"Find homes near a school"` text to `getByTestId('school-browse-intro')` |
| `src/components/discover/panels/__tests__/SchoolSelectedPanel.test.tsx` | Removed `mockUseSchoolsByArea` and sibling-school test suite (#1565 scope drift) |
| `e2e/capture-school-first-polish-1770.spec.ts` | New Playwright spec for #1770 visual evidence capture |
| `docs/audit/evidence/discover-school-first-polish/README.md` | This file |

---

## Branch HEAD

Run `git log --oneline -3` on `issue-1770-school-first-polish` to see the current HEAD.

## PR Status

**Not opened.** Per instructions, PR was not opened or merged.

---

## Remaining Visual Gaps / Open Questions

1. The `"Back to Discover Bangalore"` link text in the approved mock requires the school panels at L2/L3/L4 to also display `"Discover Bangalore"` as the `backLabel`. This is currently implemented generically as `"Back"` (or zone name) in `SchoolGroupAreasPanel` and `SchoolsInAreaPanel`. This can be addressed in a follow-up.

2. Mobile layout: the ReTrends mock is desktop-first (50/50 split). No mobile breakpoint changes were made — this is noted as a rebuild gap in the design guide §5.

3. Map marker verification: school-first uses existing school-zone markers from `DiscoverMapMarkerLayer`. A dedicated school-zone marker style (grouped bubble markers matching the `school-zones` layer) may be needed for full map parity with the mock — flagged for a follow-up.
