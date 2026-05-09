# Figma Discover Journey - Quick Reference

**Purpose**: Make every Discover journey state independently bookmarkable and auditable.

---

## 🎯 The Critical Missing Frame

### `Discover / Area / 01 Area Groups Landing`
**Why it matters**: This is the "grouped exploration" entry point that Claude cannot currently inspect.

**What it shows**:
- **Bangalore**: 5 area group cards (North, IT Corridor, South, West, Central)
- **Udupi**: 5 area group cards (Around Manipal, Coastal, Central, Brahmavara, South)

Each card displays:
- Gradient background (color-coded by region)
- Region badge (N, E, S, W, C, M, U, B)
- Group name + subtitle
- Property count + area count
- Preview chips showing 4 area names
- Hover state with border color change

**User action**: Click a group card → Zoom to that region on map + show its areas  
**Implementation**: ✅ Already built (lines 956-992 in MapDiscoveryPage.tsx)  
**Status**: 🔍 Hidden in Figma — needs dedicated frame

---

## 📋 Complete Frame Checklist

### Entry
- [ ] `Discover / 00 Guided Entry` — Journey switcher (2 cards)

### Area-First Journey (5 frames)
- [ ] `Discover / Area / 01 Area Groups Landing` ⚠️ **PRIORITY**
- [ ] `Discover / Area / 02 Focused Group` (with back link)
- [ ] `Discover / Area / 03 Selected Area` (properties + CTA)
- [ ] `Discover / Area / 04 Area Empty State` (no properties)
- [ ] `Discover / Area / 05 Schools In Area` (school cards + filters)
- [ ] `Discover / Area / 06 Combined Area + School` (both filters active)

### School-First Journey (5 frames)
- [ ] `Discover / School / 01 School Area Landing` (search + popular + regions)
- [ ] `Discover / School / 02 Schools In Area` (school list)
- [ ] `Discover / School / 03 Selected School` (radius + properties)
- [ ] `Discover / School / 04 Combined Area + School` (both filters active)
- [ ] `Discover / School / 05 Empty States` (3 variants)

### Mobile (5 frames)
- [ ] `Discover / Mobile / 00 Guided Entry`
- [ ] `Discover / Mobile / Area Groups Landing`
- [ ] `Discover / Mobile / Schools In Area`
- [ ] `Discover / Mobile / Selected School`
- [ ] `Discover / Mobile / Combined Area + School`

**Total frames needed**: 17 (12 desktop + 5 mobile)

---

## 🗺️ Map Visual States

Each frame should show the correct map state:

| Frame Type | Map Shows | Example |
|------------|-----------|---------|
| Guided Entry | All area markers | Bangalore: 18 markers, Udupi: 6 markers |
| Area Groups Landing | All area markers | Same as guided entry |
| Focused Group | Filtered markers for group | IT Corridor: 4 markers (Whitefield, Marathahalli, Sarjapur, Bellandur) |
| Selected Area (no school) | Zoomed simplified map | Top-left: "Bangalore > Whitefield" |
| Schools In Area | School pins on map | 5 purple markers with GraduationCap icons |
| Selected School | School marker + radius + properties | Center: school marker, circle: radius, dots: properties |
| Combined Area + School | Same as Selected School | Both badges visible in panel |

---

## 🎨 Visual Elements to Include

### Area Group Card (for Frame 01)
```
┌─────────────────────────────────────────┐
│ [Badge]  IT Corridor               2.4K │
│   E      Tech hubs · modern apartments  │
│                                 4 areas  │
│                                          │
│  Whitefield  Marathahalli                │
│  Sarjapur Road  Bellandur                │
└─────────────────────────────────────────┘
Gradient: emerald-50 to teal-50
Border: emerald-200
Hover: emerald-400
```

### Journey Switcher (for Frame 00)
```
┌─────────────────────────────────────────┐
│ [🏢]  Explore properties by area        │
│       Browse homes in Whitefield,       │
│       Indiranagar, Jayanagar, and more  │
└─────────────────────────────────────────┘
Blue gradient, blue border

┌─────────────────────────────────────────┐
│ [🎓]  Search by school area             │
│       Choose an area to browse schools, │
│       then find nearby properties       │
└─────────────────────────────────────────┘
Purple gradient, purple border
```

### Context Badges (for all selected states)
```
Area badge:
┌─────────────────────┐
│ 🏢 Area: Whitefield [×] │
└─────────────────────┘
Gray background

School badge:
┌──────────────────────────────┐
│ 🎓 Near MIT Manipal · 3 km [×] │
└──────────────────────────────┘
Purple background
```

### School Card
```
┌─────────────────────────────────────────┐
│ [🎓]  MIT School of Engineering          │
│       Manipal University Road, Manipal  │
│                                          │
│  CBSE  Higher Secondary  42 nearby homes │
└─────────────────────────────────────────┘
Purple gradient background
```

---

## 📝 Annotation Template

Add this text block to each frame:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Frame: Discover / Area / 01 Area Groups Landing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Journey: area-first
State:
  selectedCity: "Bangalore"
  journey: "area-first"
  focusedGroup: null
  selectedArea: null
  selectedSchool: null

URL: /discover?city=bangalore&journey=area-first

Component: MapDiscoveryPage
panelContent: "area-selection"
Lines: 948-997

User Action:
  → Click group card → Focused Group (Frame 02)
  → Click "Browse all areas" → Expand/collapse
  → Click area from list → Selected Area (Frame 03)

Back: Click "Start over" → Guided Entry (Frame 00)
Empty State: No
```

---

## 🔄 Navigation Flow

### Area-First Journey
```
00 Guided Entry
    ↓ (click "Explore properties by area")
01 Area Groups Landing
    ↓ (click group card)
02 Focused Group
    ↓ (click area)
03 Selected Area
    ↓ (click "Add a school in this area")
05 Schools In Area
    ↓ (click school)
06 Combined Area + School
```

### School-First Journey
```
00 Guided Entry
    ↓ (click "Search by school area")
01 School Area Landing
    ↓ (click area)
02 Schools In Area
    ↓ (click school)
03 Selected School
    ↓ (click "Add area filter")
04 Combined Area + School
```

---

## 🎯 Success Metrics

The Figma structure is complete when:

1. ✅ Claude can inspect the Area Groups Landing frame directly
2. ✅ Each `panelContent` value has a corresponding Figma frame
3. ✅ All 5 map visual states are represented
4. ✅ Both cities (Bangalore + Udupi) have example frames
5. ✅ Mobile variants exist for key states
6. ✅ Empty states are visible
7. ✅ Annotations include state variables and expected URLs
8. ✅ Prototypes link navigation flows correctly

---

## 🚀 Quick Start for Designers

### Step 1: Create Area Groups Landing Frame
1. Duplicate the Guided Entry frame
2. Rename to `Discover / Area / 01 Area Groups Landing`
3. Replace journey switcher with area group cards:
   - For Bangalore: 5 cards (North, IT, South, West, Central)
   - For Udupi: 5 cards (Manipal, Coastal, Central, Brahmavara, South)
4. Use data from `BANGALORE_AREA_GROUPS` and `UDUPI_AREA_GROUPS`
5. Add collapsible "Browse all areas" section at bottom
6. Add annotation block with state variables

### Step 2: Create Focused Group Frame
1. Duplicate Area Groups Landing
2. Rename to `Discover / Area / 02 Focused Group`
3. Add "← All neighbourhoods" back link at top
4. Replace group cards with:
   - Header: Group name (e.g., "IT Corridor")
   - Subheader: Group subtitle (e.g., "Tech hubs · modern apartments")
   - List of 4 areas in that group
5. Update map: filter markers to show only group's areas
6. Add focused group indicator on map (top-left)

### Step 3: Create Remaining Frames
Follow the structure in `FIGMA_DISCOVER_STRUCTURE.md`

### Step 4: Add Prototypes
Link frames according to navigation flows above

### Step 5: Export & Share
Share Figma file URL for Claude inspection

---

## 📚 Reference Documents

- **Full Structure**: `FIGMA_DISCOVER_STRUCTURE.md` — Complete frame definitions with all details
- **Implementation Audit**: `FIGMA_IMPLEMENTATION_AUDIT.md` — Comparison with app code
- **This Document**: `FIGMA_QUICK_REFERENCE.md` — Quick checklist and visual guide

---

## ⚠️ Known Implementation Issues

1. **Static regional cards in School Browse** (lines 1195-1226):
   - Currently non-functional: `onClick={() => {}}`
   - Should wire to area selection or group focus
   - Affects Frame: `Discover / School / 01 School Area Landing`

2. **No URL routing**:
   - App is state-driven, URLs don't change
   - Proposed URLs in Figma are for clarity only
   - Future enhancement: sync state with URL query params

3. **"Back to schools" button context**:
   - Should only appear in school-first journey
   - Currently: lines 843-848
   - Verify correct conditional rendering

---

## 📊 Data Reference

### Bangalore Area Groups (5 groups, 18 areas)
- **North**: Yelahanka, Hebbal, Sahakar Nagar, Vidyaranyapura
- **IT Corridor**: Whitefield, Marathahalli, Sarjapur Road, Bellandur
- **South**: JP Nagar, Jayanagar, Banashankari, Kanakapura Road
- **West**: Kengeri, Rajajinagar, Nagarbhavi, Vijayanagar
- **Central**: Indiranagar, MG Road, Richmond Town

### Udupi Area Groups (5 groups, 6 areas)
- **Around Manipal**: Manipal, Kunjibettu, Katapadi
- **Coastal Udupi**: Kundapur
- **Central Udupi**: Udupi Central, Kunjibettu
- **Brahmavara Belt**: Brahmavara
- **South Udupi**: Katapadi, Kundapur

(Note: Some areas appear in multiple groups)

---

## 🎨 Color Palette

### Area Group Gradients

| Group | From | To | Border | Hover | Badge |
|-------|------|-----|--------|-------|-------|
| North Bangalore | sky-50 | blue-50 | sky-200 | sky-400 | N |
| IT Corridor | emerald-50 | teal-50 | emerald-200 | emerald-400 | E |
| South Bangalore | amber-50 | yellow-50 | amber-200 | amber-400 | S |
| West Bangalore | violet-50 | purple-50 | violet-200 | violet-400 | W |
| Central Bangalore | rose-50 | pink-50 | rose-200 | rose-400 | C |
| Around Manipal | blue-50 | indigo-50 | blue-200 | blue-400 | M |
| Coastal Udupi | cyan-50 | teal-50 | cyan-200 | cyan-400 | C |
| Central Udupi | purple-50 | pink-50 | purple-200 | purple-400 | U |
| Brahmavara Belt | amber-50 | orange-50 | amber-200 | amber-400 | B |
| South Udupi | lime-50 | green-50 | lime-200 | lime-400 | S |

### Journey Colors
- **Area-first**: Blue (blue-600, blue-50, blue-200)
- **School-first**: Purple (purple-600, purple-50, purple-200)

---

**Last Updated**: 2026-05-09  
**Implementation Reference**: `/workspaces/default/code/src/app/components/pages/MapDiscoveryPage.tsx`
