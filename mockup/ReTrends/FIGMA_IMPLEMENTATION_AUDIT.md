# Figma to Implementation Audit Map

This document maps proposed Figma frames to the actual app implementation in `MapDiscoveryPage.tsx`.

## Audit Status Legend
- ✅ **Implemented**: Feature fully implemented and matches design intent
- ⚠️ **Partial**: Core functionality exists but may need refinement
- 🔍 **Hidden**: Implemented but not easily visible/testable
- ❌ **Missing**: Not implemented
- 📋 **Needs Design**: Implementation exists but no Figma frame

---

## Core Entry & Navigation

| Figma Frame | Journey State | Expected App URL | Implementation Component | Implementation Status | Notes |
|-------------|---------------|------------------|-------------------------|----------------------|-------|
| `Discover / 00 Guided Entry` | No journey selected | `/discover?city={city}` | MapDiscoveryPage<br/>`panelContent='guided-entry'` | ✅ Implemented | Lines 859-896.<br/>Shows journey switcher with 2 cards.<br/>Journey cards trigger `handleStartJourney()` |

---

## Area-First Journey

| Figma Frame | Journey State | Expected App URL | Implementation Component | Implementation Status | Notes |
|-------------|---------------|------------------|-------------------------|----------------------|-------|
| `Discover / Area / 01 Area Groups Landing` | area-first started,<br/>no group focused | `/discover?city={city}&journey=area-first` | MapDiscoveryPage<br/>`panelContent='area-selection'`<br/>`focusedGroup=null` | 🔍 **Hidden in Figma** | Lines 898-997.<br/>**This is the missing middle state!**<br/>Shows area group cards (lines 956-992).<br/>Group data: BANGALORE_AREA_GROUPS (lines 40-96), UDUPI_AREA_GROUPS (lines 98-154).<br/>Cards show: gradient, badge, subtitle, property count, area chips.<br/>Collapsible "Browse all areas" (lines 456-495). |
| `Discover / Area / 02 Focused Group` | One group focused,<br/>showing areas in group | `/discover?city={city}&journey=area-first&groupId={groupId}` | MapDiscoveryPage<br/>`panelContent='area-selection'`<br/>`focusedGroup={groupId}` | ✅ Implemented | Lines 901-946.<br/>Shows:<br/>- Back link "All neighbourhoods" (line 903-909)<br/>- Group name & subtitle (lines 910-915)<br/>- Instruction to click map marker (lines 916-919)<br/>- List of areas in group (lines 920-945)<br/>Map filters to `focusedGroupData.areas` (lines 239-242).<br/>Triggers `handleGroupClick()` (lines 284-288). |
| `Discover / Area / 03 Selected Area` | Area selected,<br/>showing properties | `/discover?city={city}&journey=area-first&areaKey={area}` | MapDiscoveryPage<br/>`panelContent='area-selected'` | ✅ Implemented | Lines 1001-1068.<br/>Shows:<br/>- Title "You're viewing {area}" (line 1004)<br/>- Property count (line 1005)<br/>- Quick filter chips (lines 1008-1039)<br/>- "Add a school in this area" CTA (lines 1041-1044)<br/>- Property cards (lines 1047-1051)<br/>Triggers `handleAreaClick()` (lines 290-302). |
| `Discover / Area / 04 Area Empty State` | No properties match filters | Same as 03 with filters | MapDiscoveryPage<br/>`panelContent='area-selected'`<br/>`filteredProperties.length === 0` | ✅ Implemented | Lines 1054-1066.<br/>Empty state shows:<br/>- "No properties match your filters"<br/>- "Clear filters" button |
| `Discover / Area / 05 Schools In Area` | Browsing schools<br/>within area (area-first) | `/discover?city={city}&journey=area-first&areaKey={area}&browsingSchools=true` | MapDiscoveryPage<br/>`panelContent='schools-in-area'`<br/>`journey='area-first'` | ✅ Implemented | Lines 1072-1154.<br/>Shows:<br/>- "Schools in {area}" (line 1074)<br/>- School filters (board + category, lines 1077-1128)<br/>- School cards (lines 1132-1135)<br/>- Empty state for no schools (lines 1137-1153)<br/>Triggers `handleAddSchoolFilter()` (lines 313-315).<br/>SchoolCard component (lines 423-453). |
| `Discover / Area / 06 Combined Area + School` | Both area & school selected<br/>(area-first journey) | `/discover?city={city}&journey=area-first&areaKey={area}&schoolId={schoolId}&radiusKm={radius}` | MapDiscoveryPage<br/>`panelContent='area-school-combined'`<br/>`journey='area-first'` | ✅ Implemented | Lines 1334-1383.<br/>Shows:<br/>- "Homes in {area} near {school}" (lines 1337-1338)<br/>- Radius selector (lines 1342-1359)<br/>- Property count (line 1361)<br/>- Property cards or empty state (lines 1364-1382)<br/>Note: Same panel for both journeys, context differs.<br/>Triggers `handleSchoolClick()` (lines 304-311). |

---

## School-First Journey

| Figma Frame | Journey State | Expected App URL | Implementation Component | Implementation Status | Notes |
|-------------|---------------|------------------|-------------------------|----------------------|-------|
| `Discover / School / 01 School Area Landing` | school-first started,<br/>no selections | `/discover?city={city}&journey=school-first` | MapDiscoveryPage<br/>`panelContent='school-browse'` | ✅ Implemented | Lines 1158-1270.<br/>Shows:<br/>- "Find homes near a school" (line 1160)<br/>- Search bar (lines 1164-1172)<br/>- Filtered results if searching (lines 1173-1181)<br/>- Popular schools (lines 1186-1192)<br/>- "Explore by local region" cards (lines 1195-1226, **static/non-functional**)<br/>- Collapsible "Browse all school areas" (lines 1229-1266)<br/>Map shows area markers with school counts (lines 563-603). |
| `Discover / School / 02 Schools In Area` | Area selected,<br/>browsing schools<br/>(school-first) | `/discover?city={city}&journey=school-first&areaKey={area}` | MapDiscoveryPage<br/>`panelContent='schools-in-area'`<br/>`journey='school-first'` | ✅ Implemented | Lines 1072-1154 (same component as Area/05).<br/>Shared component for both journeys.<br/>Journey indicator changes based on `journey` state (lines 700-711).<br/>Map shows school pins (lines 606-636). |
| `Discover / School / 03 Selected School` | School selected,<br/>no area constraint | `/discover?city={city}&journey=school-first&schoolId={schoolId}&radiusKm={radius}` | MapDiscoveryPage<br/>`panelContent='school-selected'` | ✅ Implemented | Lines 1273-1330.<br/>Shows:<br/>- "Homes near {school}" (line 1277)<br/>- School address (line 1278)<br/>- Radius selector (lines 1280-1297)<br/>- Property count (line 1299)<br/>- "Add area filter" CTA (lines 1301-1306)<br/>- Property cards or empty state (lines 1310-1328)<br/>Map shows school marker + radius + properties (lines 639-675). |
| `Discover / School / 04 Combined Area + School` | Both area & school selected<br/>(school-first journey) | `/discover?city={city}&journey=school-first&areaKey={area}&schoolId={schoolId}&radiusKm={radius}` | MapDiscoveryPage<br/>`panelContent='area-school-combined'`<br/>`journey='school-first'` | ✅ Implemented | Lines 1334-1383.<br/>Same component as Area/06.<br/>Journey indicator differs (lines 700-711).<br/>"Back to schools" button shown in school-first context (lines 843-848). |
| `Discover / School / 05 Empty States` | Various empty states | Varies | MapDiscoveryPage<br/>Various empty state blocks | ✅ Implemented | Multiple empty states:<br/>- No schools in area (lines 1137-1153)<br/>- No properties near school (lines 1317-1328)<br/>- No combined results (lines 1370-1382)<br/>Each shows contextual empty state with recovery actions. |

---

## Mobile Variants

| Figma Frame | Journey State | Expected App URL | Implementation Component | Implementation Status | Notes |
|-------------|---------------|------------------|-------------------------|----------------------|-------|
| `Discover / Mobile / 00 Guided Entry` | Mobile version of entry | `/discover?city={city}` | MapDiscoveryPage<br/>(responsive layout) | ✅ Implemented | Lines 498-499: `flex flex-col lg:flex-row`<br/>Map: `h-64 lg:h-full` (line 500)<br/>Panel: `order-1 lg:order-2` (line 695)<br/>Responsive padding: `p-4 lg:p-6` (line 698) |
| `Discover / Mobile / Area Groups Landing` | Mobile area groups | `/discover?city={city}&journey=area-first` | MapDiscoveryPage<br/>(responsive layout) | ✅ Implemented | Same responsive classes.<br/>Area group cards stack naturally with flex layout. |
| `Discover / Mobile / Schools In Area` | Mobile schools list | `/discover?city={city}&journey=school-first&areaKey={area}` | MapDiscoveryPage<br/>(responsive layout) | ✅ Implemented | School cards stack in `space-y-3` container (line 1132).<br/>Filter chips wrap with `flex-wrap` (lines 1084, 1101). |
| `Discover / Mobile / Selected School` | Mobile school view | `/discover?city={city}&journey=school-first&schoolId={schoolId}&radiusKm={radius}` | MapDiscoveryPage<br/>(responsive layout) | ✅ Implemented | Radius selector wraps with flex `gap-2` (line 1282).<br/>Property cards stack. |
| `Discover / Mobile / Combined Area + School` | Mobile combined view | `/discover?city={city}&journey=school-first&areaKey={area}&schoolId={schoolId}&radiusKm={radius}` | MapDiscoveryPage<br/>(responsive layout) | ✅ Implemented | Context badges wrap with `flex-wrap` (line 715).<br/>All content stacks on mobile. |

---

## Component Deep Dive

### State Management
Located in `MapDiscoveryPage.tsx` lines 208-231:

```typescript
const [selectedCity, setSelectedCity] = useState('Bangalore');
const [journey, setJourney] = useState<JourneyType | null>(null);
const [selectedArea, setSelectedArea] = useState<string | null>(null);
const [areaZoomed, setAreaZoomed] = useState(false);
const [focusedGroup, setFocusedGroup] = useState<string | null>(null);
const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
const [schoolRadius, setSchoolRadius] = useState(3);
const [browsingSchoolsInArea, setBrowsingSchoolsInArea] = useState(false);
// ... filters
```

### Panel Content Logic
Lines 398-422 (`getPanelContent()` function):

Determines which content to show based on state:
- Returns `'guided-entry'` if no journey
- Returns `'area-selection'` for area-first with no area selected
- Returns `'schools-in-area'` when browsing schools in an area
- Returns `'area-selected'` when area selected without school browsing
- Returns `'school-browse'` for school-first initial state
- Returns `'school-selected'` when school selected without area
- Returns `'area-school-combined'` when both area and school selected

### Map Visual States
Lines 500-692 implement map rendering:

1. **Overview state**: All area markers (lines 563-603)
2. **Focused group indicator**: Shows group name when focused (lines 523-534)
3. **Area zoomed indicator**: Shows city + area name (lines 512-520)
4. **School pins**: Rendered when browsing schools (lines 606-636)
5. **School radius**: Shows selected school + radius circle + property markers (lines 639-675)

### Key Handlers
- `handleStartJourney()`: Lines 279-282
- `handleGroupClick()`: Lines 284-288
- `handleAreaClick()`: Lines 290-302
- `handleSchoolClick()`: Lines 304-311
- `handleClearArea()`: Lines 327-333
- `handleClearSchool()`: Lines 335-339
- `handleStartOver()`: Lines 341-354

---

## Critical Implementation Gaps

### ⚠️ Static Regional Cards in School Browse
**Location**: Lines 1195-1226  
**Issue**: "Explore by local region" cards in school-first browse are **non-functional** — `onClick={() => {}}` is empty.  
**Expected behavior**: Should trigger area selection or group focus.  
**Fix needed**: Wire up to `handleAreaClick()` or create group-based navigation.

### 🔍 Hidden Area Groups Landing State
**Location**: Lines 898-997 (exists in implementation)  
**Issue**: This critical state showing ALL area group cards is **not easily inspectable in Figma** because it's hidden as an internal component state.  
**Expected**: Should be a separate, named Figma frame showing:
- 5 Bangalore group cards (North, IT, South, West, Central)
- 5 Udupi group cards (Manipal, Coastal, Central, Brahmavara, South)
- Each with gradient, badge, subtitle, property count, area chips

**This is THE most important missing Figma frame.**

---

## Consistency Check

### ✅ Journey Indicators
Both journeys show consistent indicators:
- Area-first: Building2 icon + "Exploring by area"
- School-first: GraduationCap icon + "Search by school area"
- Both show "Start over" button

Implementation: Lines 700-711

### ✅ Context Badges
Active selections show as removable badges:
- Area badge: Building2 icon + "Area: {name}" + X button
- School badge: GraduationCap icon + "Near {name} · {radius} km" + X button (purple styling)

Implementation: Lines 714-733

### ✅ Filter System
Property filters consistent across all property-showing states:
- Price range slider
- Bedroom toggles (1, 2, 3, 4)
- Property type checkboxes (apartment, villa, plot)

Implementation: Lines 754-850 (filter sheet)

### ✅ Empty States
All list views have empty states:
- No properties: "No properties match your filters" + "Clear filters"
- No schools: "No schools found in this area" + recovery actions
- No combined results: "No properties found for this combination" + multiple recovery options

### ⚠️ Back Navigation
"Back to schools" button appears in school-first journey but implementation could be clearer:
- Implementation: Lines 843-848 (conditional render)
- Triggers: `handleBackToSchools()` (lines 317-320)
- Expected: Only in school-first + school-selected states
- **Audit needed**: Verify this doesn't appear incorrectly in area-first combined view

---

## Implementation Maturity Assessment

| Feature Category | Status | Notes |
|-----------------|--------|-------|
| Journey switching | ✅ Complete | Entry, area-first, school-first all work |
| Area group cards | 🔍 Hidden | Implemented but not visible in Figma |
| Focused group | ✅ Complete | Group focus + area filtering works |
| Area selection | ✅ Complete | Area zoom, properties, filters |
| School browsing | ✅ Complete | School filters, cards, selection |
| School radius | ✅ Complete | 1/2/3/5 km options work |
| Combined area+school | ✅ Complete | Both journeys support combination |
| Empty states | ✅ Complete | All states have empty handling |
| Mobile responsive | ✅ Complete | Flex layout, wrap, stack |
| Map indicators | ✅ Complete | All 5 visual states implemented |
| Static regional cards | ⚠️ Non-functional | School browse region cards do nothing |
| Figma auditability | ❌ Missing | Area Groups Landing hidden in Figma |

---

## Recommendations

### 1. Create Missing Figma Frame: Area Groups Landing ⚠️ HIGH PRIORITY
This frame is **critical** and currently hidden. Create it showing:
- Frame name: `Discover / Area / 01 Area Groups Landing`
- Full area group card grid
- Bangalore variant + Udupi variant
- Clear annotations with state variables

### 2. Fix Static Regional Cards in School Browse
Lines 1195-1226 need wiring:
```typescript
// Current (non-functional):
onClick={() => {}}

// Should be:
onClick={() => handleGroupClick('around-manipal')}
// OR
onClick={() => handleAreaClick('Manipal')}
```

### 3. Create Figma Variants for Cities
Currently implementation supports both Bangalore and Udupi, but Figma should show:
- Bangalore examples (5 groups, larger areas)
- Udupi examples (5 groups, coastal/university context)

### 4. Add State Annotations to Existing Frames
Use the annotation template from `FIGMA_DISCOVER_STRUCTURE.md` to document:
- State variables
- Expected URLs
- panelContent value
- Component reference
- User actions
- Next state
- Back behavior

### 5. Link Prototypes for Navigation Testing
Wire up prototype links so flows can be tested:
- Journey cards → landing pages
- Group cards → focused group
- Area cards → selected area
- School cards → selected school
- Badge X buttons → clear actions
- "Start over" → guided entry

### 6. Create Mobile-Specific Frames
While responsive implementation exists, create dedicated mobile frames at 375px width to:
- Show map height changes
- Show panel reordering
- Show filter chip wrapping
- Show badge wrapping
- Validate touch targets

---

## URL Routing Gap

**Current implementation**: State-driven, no URL routing  
**Proposed Figma URLs**: Include query params for bookmarking  

**Recommendation**: Implement URL sync with React Router or similar:
```typescript
// Pseudocode
useEffect(() => {
  const params = new URLSearchParams(location.search);
  setSelectedCity(params.get('city') || 'Bangalore');
  setJourney(params.get('journey') as JourneyType);
  setSelectedArea(params.get('areaKey'));
  // ... etc
}, [location.search]);
```

This would make URLs match the Figma proposal and enable:
- Bookmarkable states
- Shareable links
- Browser back/forward
- Deep linking from external sources

---

## Success Criteria

The Figma structure will be complete when:

✅ Each `panelContent` value maps to at least one named Figma frame  
✅ Area Groups Landing is visible and inspectable  
✅ Mobile variants exist for key states  
✅ Annotations include state variables and URLs  
✅ Prototypes link states correctly  
✅ Both cities (Bangalore + Udupi) have example frames  
✅ Empty states are represented  

The implementation will match Figma when:

✅ URL routing syncs with state (enables bookmarking)  
✅ Static regional cards in school-browse are functional  
✅ "Back to schools" button appears only in correct contexts  
✅ All navigation matches prototype links  

---

## Appendix: State Variable Reference

| Variable | Type | Purpose | Lines |
|----------|------|---------|-------|
| `selectedCity` | `string` | Current city (Bangalore/Udupi) | 208 |
| `journey` | `JourneyType \| null` | area-first, school-first, or null | 209 |
| `selectedArea` | `string \| null` | Currently selected area name | 212 |
| `areaZoomed` | `boolean` | Whether map is zoomed to area | 213 |
| `focusedGroup` | `string \| null` | ID of focused area group | 214 |
| `showAllAreas` | `boolean` | Browse all areas expanded | 215 |
| `selectedSchool` | `School \| null` | Currently selected school | 218 |
| `schoolRadius` | `number` | School search radius in km | 219 |
| `schoolSearchQuery` | `string` | School name search input | 220 |
| `browsingSchoolsInArea` | `boolean` | Viewing schools list in area | 221 |
| `showAllSchoolAreas` | `boolean` | School areas list expanded | 222 |
| `selectedBoards` | `SchoolBoard[]` | School board filters | 225 |
| `selectedCategories` | `SchoolCategory[]` | School category filters | 226 |
| `priceRange` | `[number, number]` | Property price filter | 229 |
| `bedrooms` | `number[]` | Bedroom count filters | 230 |
| `propertyTypes` | `string[]` | Property type filters | 231 |

---

## Appendix: panelContent Mapping

| panelContent Value | Figma Frame(s) | Implementation Lines | Conditions |
|-------------------|----------------|---------------------|------------|
| `'guided-entry'` | `Discover / 00 Guided Entry` | 859-896 | `journey === null` |
| `'area-selection'` (no focus) | `Discover / Area / 01 Area Groups Landing` | 948-997 | `journey === 'area-first' && !selectedArea && !focusedGroup` |
| `'area-selection'` (focused) | `Discover / Area / 02 Focused Group` | 901-946 | `journey === 'area-first' && !selectedArea && focusedGroup` |
| `'area-selected'` | `Discover / Area / 03 Selected Area`<br/>`Discover / Area / 04 Area Empty State` | 1001-1068 | `journey === 'area-first' && selectedArea && !browsingSchoolsInArea && !selectedSchool` |
| `'schools-in-area'` | `Discover / Area / 05 Schools In Area`<br/>`Discover / School / 02 Schools In Area` | 1072-1154 | `browsingSchoolsInArea === true` (either journey) |
| `'school-browse'` | `Discover / School / 01 School Area Landing` | 1158-1270 | `journey === 'school-first' && !selectedSchool && !browsingSchoolsInArea && !selectedArea` |
| `'school-selected'` | `Discover / School / 03 Selected School` | 1273-1330 | `journey === 'school-first' && selectedSchool && !selectedArea` |
| `'area-school-combined'` | `Discover / Area / 06 Combined Area + School`<br/>`Discover / School / 04 Combined Area + School` | 1334-1383 | `selectedArea && selectedSchool` (either journey) |

