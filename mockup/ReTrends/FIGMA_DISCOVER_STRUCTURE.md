# Figma Discover Journey Structure Proposal

## Overview
This document proposes a Figma frame structure where every important Discover journey state is independently bookmarkable and auditable. Each frame represents a specific user-facing state with clear annotations.

---

## Frame Structure

### 1. Discover / 00 Guided Entry
**State**: No journey selected  
**Journey**: `null`  
**Expected URL**: `/discover?city={city}`  
**Map shows**: All area markers for selected city  
**Right panel shows**: 
- Journey switcher with two cards:
  - "Explore properties by area" (Building2 icon, blue)
  - "Search by school area" (GraduationCap icon, purple)

**User actions**:
- Click "Explore properties by area" → Navigate to `Discover / Area / 01 Area Groups Landing`
- Click "Search by school area" → Navigate to `Discover / School / 01 School Area Landing`
- Change city dropdown → Reload state with new city

**Dev notes**:
```
journey: null
selectedCity: "Bangalore" or "Udupi"
selectedArea: null
selectedSchool: null
focusedGroup: null
```

---

## Area-First Journey

### 2. Discover / Area / 01 Area Groups Landing
**State**: Area-first journey started, no group focused  
**Journey**: `area-first`  
**Expected URL**: `/discover?city={city}&journey=area-first`  
**Map shows**: All area markers for city  
**Right panel shows**:
- Header: "Explore by neighbourhood"
- Subheader: "Choose a region to focus the map, then click an area marker to see properties."
- **Area group cards** (this is the key missing state):
  - For Bangalore:
    - North Bangalore (sky gradient, "N" badge, "Airport access · IT parks")
    - IT Corridor (emerald gradient, "E" badge, "Tech hubs · modern apartments")
    - South Bangalore (amber gradient, "S" badge, "Established neighbourhoods")
    - West Bangalore (violet gradient, "W" badge, "Affordable · metro connected")
    - Central Bangalore (rose gradient, "C" badge, "Premium · prime location")
  - For Udupi:
    - Around Manipal (blue gradient, "M" badge, "University area · student rentals")
    - Coastal Udupi (cyan gradient, "C" badge, "Beach proximity · scenic views")
    - Central Udupi (purple gradient, "U" badge, "City centre · well connected")
    - Brahmavara Belt (amber gradient, "B" badge, "Quiet · growing areas")
    - South Udupi (lime gradient, "S" badge, "Emerging residential belt")
- Collapsible "Browse all areas" section (collapsed by default)

**User actions**:
- Click any group card → Navigate to `Discover / Area / 02 Focused Group` with `groupId={group.id}`
- Click "Browse all areas" → Expand/collapse list
- Click area from "Browse all areas" → Navigate to `Discover / Area / 03 Selected Area`
- Click area marker on map → Navigate to `Discover / Area / 03 Selected Area`

**Dev notes**:
```
journey: "area-first"
focusedGroup: null
selectedArea: null
browsingSchoolsInArea: false
Component: MapDiscoveryPage, panelContent: "area-selection", focusedGroup is null
```

---

### 3. Discover / Area / 02 Focused Group
**State**: One area group focused, showing its areas  
**Journey**: `area-first`  
**Expected URL**: `/discover?city={city}&journey=area-first&groupId={groupId}`  
**Example**: `/discover?city=bangalore&journey=area-first&groupId=it-corridor`  
**Map shows**: 
- Only area markers for the focused group (e.g., Whitefield, Marathahalli, Sarjapur Road, Bellandur for IT Corridor)
- Area markers highlighted with focused group's border color
- Top-left indicator: "Browsing region: IT Corridor. Click a marker to select area"

**Right panel shows**:
- Back link: "← All neighbourhoods" (returns to Area Groups Landing)
- Header: Group name (e.g., "IT Corridor")
- Subheader: Group subtitle (e.g., "Tech hubs · modern apartments")
- Instruction: "Click an area marker on the map to see properties" with MapPin icon
- **List of areas in this group**:
  - Each area shows: name, property count, avg price, trending badge if applicable
  - Clickable to select area

**User actions**:
- Click "All neighbourhoods" back link → Navigate to `Discover / Area / 01 Area Groups Landing`
- Click area from list → Navigate to `Discover / Area / 03 Selected Area`
- Click area marker on map → Navigate to `Discover / Area / 03 Selected Area`

**Dev notes**:
```
journey: "area-first"
focusedGroup: "it-corridor" (or other group ID)
selectedArea: null
Component: MapDiscoveryPage, panelContent: "area-selection", focusedGroup is not null
```

**Variants to create**:
- One example for Bangalore (e.g., IT Corridor)
- One example for Udupi (e.g., Coastal Udupi)

---

### 4. Discover / Area / 03 Selected Area
**State**: Area selected, showing properties  
**Journey**: `area-first`  
**Expected URL**: `/discover?city={city}&journey=area-first&areaKey={area}`  
**Example**: `/discover?city=bangalore&journey=area-first&areaKey=whitefield`  
**Map shows**:
- Area zoomed view (simplified map)
- Top-left indicator: City name + Building2 icon + Area name (e.g., "Bangalore > Whitefield")
- Property markers scattered in area (5+ small blue dots)

**Right panel shows**:
- Journey indicator: Building2 icon + "Exploring by area" + "Start over" button
- Active context badge: "Area: {areaName}" with X to clear
- Filters button (with count badge if filters active)
- Header: "You're viewing {areaName}"
- Subheader: "{count} properties found"
- **Quick filter chips**:
  - Apartments, Villas, Plots
  - 2 BHK, 3 BHK
- **CTA button**: "Add a school in this area" (GraduationCap icon)
- **Property cards** (3-5 example properties)

**User actions**:
- Click "Start over" → Navigate to `Discover / 00 Guided Entry`
- Click area badge X → Clear area, return to `Discover / Area / 01 Area Groups Landing`
- Click quick filter chip → Toggle filter, reload properties
- Click "Add a school in this area" → Navigate to `Discover / Area / 05 Schools In Area`
- Click property card → Navigate to listing detail
- Click "Filters" → Open filter sheet

**Dev notes**:
```
journey: "area-first"
selectedArea: "Whitefield" (or other area)
areaZoomed: true
browsingSchoolsInArea: false
selectedSchool: null
Component: MapDiscoveryPage, panelContent: "area-selected"
```

---

### 5. Discover / Area / 04 Area Empty State
**State**: Area selected but no properties match filters  
**Journey**: `area-first`  
**Expected URL**: Same as Area / 03 but with filters applied  
**Map shows**: Same as Area / 03  
**Right panel shows**:
- Same header structure as Area / 03
- Active filter badges visible
- **Empty state**:
  - Gray background rounded box
  - Text: "No properties match your filters"
  - "Clear filters" button

**User actions**:
- Click "Clear filters" → Reset filters, show all properties

**Dev notes**:
```
Same as Area / 03 but filteredProperties.length === 0
```

---

### 6. Discover / Area / 05 Schools In Area
**State**: Browsing schools within selected area (area-first journey)  
**Journey**: `area-first`  
**Expected URL**: `/discover?city={city}&journey=area-first&areaKey={area}&browsingSchools=true`  
**Example**: `/discover?city=udupi&journey=area-first&areaKey=manipal&browsingSchools=true`  
**Map shows**:
- Area zoomed
- School pins (5 purple markers with GraduationCap icons and abbreviated school names)
- Top-left: City + Building2 + Area name

**Right panel shows**:
- Journey indicator: Building2 icon + "Exploring by area" + "Start over"
- Active context badge: "Area: {areaName}" with X
- Header: "Schools in {areaName}"
- Subheader: "Choose a school to view nearby homes"
- **School filters**:
  - Board chips: CBSE, ICSE, State, International
  - Category chips: Primary, Secondary, Higher Secondary
  - "Clear filters" link if filters active
- **School cards** (purple gradient cards with school details)

**User actions**:
- Click school card → Navigate to `Discover / Area / 06 Combined Area + School`
- Click area badge X → Navigate to `Discover / Area / 01 Area Groups Landing`
- Toggle board/category filter → Filter schools
- Click school marker on map → Navigate to `Discover / Area / 06 Combined Area + School`

**Dev notes**:
```
journey: "area-first"
selectedArea: "Manipal"
browsingSchoolsInArea: true
selectedSchool: null
Component: MapDiscoveryPage, panelContent: "schools-in-area"
```

---

### 7. Discover / Area / 06 Combined Area + School
**State**: Both area and school selected in area-first journey  
**Journey**: `area-first`  
**Expected URL**: `/discover?city={city}&journey=area-first&areaKey={area}&schoolId={schoolId}&radiusKm={radius}`  
**Example**: `/discover?city=udupi&journey=area-first&areaKey=manipal&schoolId=mit-manipal&radiusKm=3`  
**Map shows**:
- Selected school marker (purple with name, radius indicator)
- Radius circle around school (purple transparent overlay)
- Property markers within radius (5+ blue dots around school)
- Top-left: City + Building2 + Area name

**Right panel shows**:
- Journey indicator: Building2 icon + "Exploring by area" + "Start over"
- **Two active context badges**:
  - "Area: {areaName}" with X
  - "Near {schoolName} · {radius} km" (purple badge) with X
- Filters button
- Header: "Homes in {areaName} near {schoolName}"
- Subheader: "Properties matching both your area and school criteria"
- **Radius selector**: 1 km, 2 km, 3 km, 5 km buttons
- Property count: "{count} properties found"
- **Property cards**

**User actions**:
- Click area badge X → Navigate to `Discover / School / 03 Selected School` (keep school, clear area)
- Click school badge X → Navigate to `Discover / Area / 03 Selected Area` (keep area, clear school)
- Adjust radius → Filter properties
- Click property card → Navigate to listing detail

**Back behavior**: Clearing area returns to school-only view; clearing school returns to area-only view

**Dev notes**:
```
journey: "area-first"
selectedArea: "Manipal"
selectedSchool: {school object}
schoolRadius: 3
Component: MapDiscoveryPage, panelContent: "area-school-combined"
```

---

## School-First Journey

### 8. Discover / School / 01 School Area Landing
**State**: School-first journey started, no area or school selected  
**Journey**: `school-first`  
**Expected URL**: `/discover?city={city}&journey=school-first`  
**Map shows**: 
- All area markers with **school count labels** (e.g., "Manipal: 8 schools")
- GraduationCap icon on each marker

**Right panel shows**:
- Journey indicator: GraduationCap icon + "Search by school area" + "Start over"
- Header: "Find homes near a school"
- Subheader: "Search for a school, or explore school areas on the map."
- **Search bar**: "Search schools by name" with Search icon
- **Popular schools section** (if available):
  - Header: "Popular schools"
  - 2-3 school cards
- **Explore by local region** (static regional cards, Udupi-specific):
  - Around Manipal (blue gradient)
  - Coastal Udupi (cyan gradient)
  - Central Udupi (purple gradient)
  - South Udupi (amber gradient)
- **Collapsible "Browse all school areas"** (collapsed):
  - Shows all areas with school count labels

**User actions**:
- Type in search → Show filtered school results, navigate to search results view (not a separate frame, inline)
- Click popular school card → Navigate to `Discover / School / 03 Selected School`
- Click regional card → Navigate to `Discover / School / 02 Schools In Area` with that area pre-selected
- Click area from "Browse all school areas" → Navigate to `Discover / School / 02 Schools In Area`
- Click area marker on map → Navigate to `Discover / School / 02 Schools In Area`

**Dev notes**:
```
journey: "school-first"
selectedArea: null
selectedSchool: null
browsingSchoolsInArea: false
Component: MapDiscoveryPage, panelContent: "school-browse"
```

---

### 9. Discover / School / 02 Schools In Area
**State**: Area selected in school-first journey, browsing schools  
**Journey**: `school-first`  
**Expected URL**: `/discover?city={city}&journey=school-first&areaKey={area}`  
**Example**: `/discover?city=udupi&journey=school-first&areaKey=manipal`  
**Map shows**:
- Area zoomed
- School pins (5+ purple markers)
- Top-left: City + Building2 + Area name

**Right panel shows**:
- Journey indicator: GraduationCap icon + "Search by school area" + "Start over"
- Active context badge: "Area: {areaName}" with X
- Header: "Schools in {areaName}"
- Subheader: "Choose a school to view nearby homes"
- **School filters** (board + category)
- **School cards**

**User actions**:
- Click school card → Navigate to `Discover / School / 03 Selected School`
- Click area badge X → Navigate to `Discover / School / 01 School Area Landing`
- Click school marker → Navigate to `Discover / School / 03 Selected School`

**Dev notes**:
```
journey: "school-first"
selectedArea: "Manipal"
browsingSchoolsInArea: true
selectedSchool: null
Component: MapDiscoveryPage, panelContent: "schools-in-area"
```

---

### 10. Discover / School / 03 Selected School
**State**: School selected, no area constraint  
**Journey**: `school-first`  
**Expected URL**: `/discover?city={city}&journey=school-first&schoolId={schoolId}&radiusKm={radius}`  
**Example**: `/discover?city=udupi&journey=school-first&schoolId=mit-manipal&radiusKm=3`  
**Map shows**:
- School marker at center (purple, with name)
- Radius circle (purple transparent overlay)
- Property markers (5+ blue dots within radius)

**Right panel shows**:
- Journey indicator: GraduationCap icon + "Search by school area" + "Start over"
- Active context badge: "Near {schoolName} · {radius} km" (purple) with X
- "Back to schools" button (with ArrowLeft icon) — returns to schools-in-area view
- Filters button
- Header: "Homes near {schoolName}"
- Subheader: School address
- **Radius selector**: 1 km, 2 km, 3 km, 5 km buttons
- Property count: "{count} properties found"
- **CTA button**: "Add area filter" (Building2 icon) — optional, shown if no area selected
- **Property cards**

**User actions**:
- Click "Back to schools" → Navigate to `Discover / School / 02 Schools In Area` (return to school browsing in the school's area)
- Click school badge X → Navigate to `Discover / School / 01 School Area Landing`
- Click "Add area filter" → Navigate to area browsing (implementation detail: sets browsingSchoolsInArea=false)
- Adjust radius → Filter properties

**Back behavior**: "Back to schools" returns to the area that contains this school

**Dev notes**:
```
journey: "school-first"
selectedSchool: {school object}
selectedArea: null (or the school's locality for "Back to schools" context)
schoolRadius: 3
Component: MapDiscoveryPage, panelContent: "school-selected"
```

---

### 11. Discover / School / 04 Combined Area + School
**State**: Both area and school selected in school-first journey  
**Journey**: `school-first`  
**Expected URL**: `/discover?city={city}&journey=school-first&areaKey={area}&schoolId={schoolId}&radiusKm={radius}`  
**Example**: `/discover?city=udupi&journey=school-first&areaKey=manipal&schoolId=mit-manipal&radiusKm=3`  
**Map shows**: Same as Area / 06  
**Right panel shows**:
- Journey indicator: GraduationCap icon + "Search by school area" + "Start over"
- **Two active context badges**:
  - "Area: {areaName}" with X
  - "Near {schoolName} · {radius} km" (purple) with X
- "Back to schools" button
- Filters button
- Header: "Homes in {areaName} near {schoolName}"
- Subheader: "Properties matching both your area and school criteria"
- **Radius selector**
- Property count
- **Property cards**

**User actions**:
- Click "Back to schools" → Navigate to `Discover / School / 02 Schools In Area`
- Click area badge X → Navigate to `Discover / School / 03 Selected School` (keep school, clear area)
- Click school badge X → Navigate to `Discover / Area / 03 Selected Area` (keep area, clear school, switch journey to area-first)

**Back behavior**: "Back to schools" returns to schools-in-area view

**Dev notes**:
```
journey: "school-first"
selectedArea: "Manipal"
selectedSchool: {school object}
schoolRadius: 3
Component: MapDiscoveryPage, panelContent: "area-school-combined"
Note: Same panel content as area-first combined, but different journey context
```

---

### 12. Discover / School / 05 Empty States
**State**: Various empty states in school journey  
**Expected URL**: Varies  

**Variants**:

#### 12a. No Schools In Area
- Header: "Schools in {areaName}"
- Empty state:
  - GraduationCap icon (gray)
  - "No schools found in this area"
  - "Try adjusting your filters" or "Try another area"
  - "Clear filters" button (if filters active)
  - "Pick a different area" button

#### 12b. No Properties Near School
- Header: "Homes near {schoolName}"
- Empty state:
  - "No homes found near this school"
  - "Try adjusting your search"
  - "Increase radius to {radius+1} km" button
  - "Clear filters" button

#### 12c. No Properties in Combined View
- Header: "Homes in {areaName} near {schoolName}"
- Empty state:
  - "No properties found for this combination"
  - "Try adjusting your filters or search criteria"
  - "Increase radius to {radius+1} km" button
  - "Clear area filter" button
  - "Clear school filter" button

---

## Mobile Variants

Create mobile (375px width) versions of these key frames:

### 13. Discover / Mobile / 00 Guided Entry
- Map section at top (h-64)
- Panel below in single column
- Journey cards stack vertically

### 14. Discover / Mobile / Area Groups Landing
- Map section at top
- Area group cards stack vertically
- Smaller padding

### 15. Discover / Mobile / Schools In Area
- Map section at top
- School cards stack vertically
- Filter chips wrap

### 16. Discover / Mobile / Selected School
- Map section at top
- Radius selector wraps
- Property cards stack

### 17. Discover / Mobile / Combined Area + School
- Map section at top
- Context badges wrap
- All content stacks

---

## Annotation Template

Each frame should have a **dev note block** (text layer or annotation) with:

```
Frame: [Frame name]
Journey: [area-first | school-first | null]
State variables:
  - selectedCity: [city name]
  - journey: [area-first | school-first | null]
  - focusedGroup: [groupId | null]
  - selectedArea: [area name | null]
  - selectedSchool: [schoolId | null]
  - schoolRadius: [1 | 2 | 3 | 5]
  - browsingSchoolsInArea: [true | false]
  - areaZoomed: [true | false]

Expected URL: [URL pattern]
Component: MapDiscoveryPage
panelContent: [guided-entry | area-selection | area-selected | schools-in-area | school-browse | school-selected | area-school-combined]

Primary user action: [description]
Next state: [frame name]
Back/clear behavior: [description]
Empty state: [Yes/No, description]
```

---

## Frame Naming Convention

Use this naming pattern:
- `Discover / {Journey} / {NN} {State Name}`
- Journey: `00` for entry, `Area` for area-first, `School` for school-first, `Mobile` for mobile
- NN: Two-digit sequence number
- State Name: Human-readable state description

Examples:
- ✅ `Discover / 00 Guided Entry`
- ✅ `Discover / Area / 01 Area Groups Landing`
- ✅ `Discover / Area / 02 Focused Group`
- ✅ `Discover / School / 03 Selected School`
- ✅ `Discover / Mobile / Area Groups Landing`

---

## Critical Notes

### Area Groups Landing (Frame 2)
**This is the most important missing frame.** It must show:
- All area group cards with gradients, badges, and area preview chips
- Clear visual distinction between groups (color-coded)
- Property counts and area counts per group
- Collapsible "Browse all areas" fallback
- For Bangalore: 5 groups (North, IT, South, West, Central)
- For Udupi: 5 groups (Manipal, Coastal, Central, Brahmavara, South)

### Focused Group vs. Area Groups Landing
- **Area Groups Landing** shows ALL groups as cards
- **Focused Group** shows ONE group's areas as a list, with map filtered to that group's markers

### Journey Context Matters
- `area-school-combined` panel content appears in BOTH journeys
- Journey indicator changes based on starting journey
- "Back to schools" button only in school-first journey
- "Add school in this area" only in area-first journey

### Map Visual States
1. **Overview** (no selection): All area markers
2. **Focused group** (group selected): Filtered area markers with special styling
3. **Area zoomed** (area selected, no school): Simplified map + area label
4. **Schools visible** (browsing schools): Area zoomed + school pins
5. **School radius** (school selected): School marker + radius circle + property dots

---

## Next Steps

1. **Create Figma file** with page structure:
   - Page: "Discover Journey - Desktop"
     - Frames 1-12 (all desktop states)
   - Page: "Discover Journey - Mobile"
     - Frames 13-17 (mobile key states)

2. **Use Auto Layout** for easy variant creation:
   - Create component for area group card
   - Create component for school card
   - Create component for property card
   - Create component for journey switcher

3. **Create variants** for cities:
   - Bangalore examples (larger dataset)
   - Udupi examples (smaller, coastal context)

4. **Add prototype links**:
   - Link journey cards to their respective landing pages
   - Link area cards to focused group or selected area
   - Link school cards to selected school
   - Link badges X buttons to clear actions

5. **Export for Claude inspection**:
   - Share Figma file with editing access
   - Use frame links for specific state review
   - Update this doc with actual Figma URLs

