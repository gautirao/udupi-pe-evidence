Refine the ReTrends “Search by School Area” journey.

The current direction is much better, but I want to fine-tune the school-first flow so it feels more intuitive, more map-led, and less dependent on school-name search.

Important product context:
- ReTrends is a property discovery product.
- In school-first mode, users are exploring neighbourhoods through schools.
- The user may not know school names in advance.
- Therefore, school-name search should not be the primary interaction.
- The experience should help users discover schools area by area.

Core UX principle:
In school-first mode, the user should:
1. see area markers with school counts,
2. click an area,
3. zoom into that area,
4. clearly understand which area they are currently inside,
5. see all schools in that area,
6. choose a school,
7. then see homes near that school.

Please refine the design accordingly.

--------------------------------------------------
A. Area marker behaviour in school-first mode
--------------------------------------------------

When the user is in the “Search by school area” journey:

- The map should show area markers/cards with school counts.
- Example:
  - Brahmavara · 8 schools
  - Manipal · 12 schools
  - Kengeri · 15 schools

When the user clicks an area marker:
- The map must zoom into that area.
- The area becomes the active local context.
- The map should zoom into the area
- School markers for that area appear on the map.
- The right panel should update to show all schools in that area.

Important:
The area click must feel like entering that area, not just applying a hidden filter.

--------------------------------------------------
B. Area location indicator on the map
--------------------------------------------------

Add a clear area/location indicator at the top-left of the map.

Reason:
- The city switcher in the top-right already shows the city (for example Udupi).
- But once the user clicks an area such as Brahmavara, that local context gets lost.
- The user needs to know which area they are currently viewing.

Design requirement:
- Show the active area name in the top-left of the map.
- Example:
  - “Brahmavara”
  - or “Viewing: Brahmavara”
- This should be visually clear but not too heavy.
- It should feel like a map context label / breadcrumb.

Optional enhancement:
Show hierarchical context:
- Udupi / Brahmavara
or
- City: Udupi
- Area: Brahmavara

But make Brahmavara the visually dominant label.

--------------------------------------------------
C. Remove school-name search input as primary control
--------------------------------------------------

In the area-selected school-first state, remove the prominent “search school by name” input.

Reason:
- Users may not know school names in a given area.
- Typing assumes prior knowledge.
- The better UX is to let users browse all schools in the selected area.

Instead:
- Show all schools in the selected area as a list/grid/cards.
- This should be the main interaction.
- The user should be able to scan the available schools visually.

If search is retained at all, it should be secondary and much less prominent.
But the preferred solution is:
- no school-name search input in this journey.

--------------------------------------------------
D. Show all schools in the selected area
--------------------------------------------------

Once an area is selected in school-first mode:

Map:
- Zoomed into the area
- School markers visible across the area
- No property markers yet, to avoid clutter

Right panel:
Title:
- “Schools in Brahmavara”

Subtitle/helper:
- “Choose a school to view nearby homes”

Content:
- List or grid of all schools in the selected area
- Each school card should show:
  - school name
  - locality / short address
  - board badge if available (CBSE / ICSE / State)
  - school type/category if available
  - nearby homes count if available
  - CTA: “View homes nearby” or simply card click

Important:
This state is about discovery, not text search.

--------------------------------------------------
E. Add school-type filtering instead of search input
--------------------------------------------------

Instead of school-name search, add lightweight filtering by school type.

Possible filter groups:
1. Board:
- CBSE
- ICSE
- State
- International
- Other / Unknown

2. School category:
- Primary
- Secondary
- Higher Secondary

3. Management / type (if useful and data is available):
- Government
- Private
- Aided

These should be simple chips/toggles above the school list.

Example:
[CBSE] [ICSE] [State] [Primary] [Secondary] [Higher Secondary]

Behaviour:
- Filters should narrow the visible schools in the selected area.
- Map school markers should also update to match.
- Keep this lightweight and visually clean.

Important:
Do not make this feel like a heavy filter drawer.
It should be a small contextual refinement tool.

--------------------------------------------------
F. Selected school behaviour
--------------------------------------------------

When the user clicks a school from the selected area:

Map:
- Highlight the selected school marker
- Zoom/pan slightly if needed
- Show radius circle around the school
- Now show nearby property markers

Right panel:
Title:
- “Homes near [School Name]”

Content:
- School summary card
- Radius selector:
  - 1 km
  - 2 km
  - 3 km
  - 5 km
- Listings of nearby homes
- Optional CTA:
  - “Change school”
  - “Back to schools in Brahmavara”

Active chip:
- [Near School Name · 3 km x]

If area context is still active, make that visible:
- [Area: Brahmavara x] [Near School Name · 3 km x]

Combined title example:
- “Homes in Brahmavara near [School Name]”

--------------------------------------------------
G. Journey flow to optimise
--------------------------------------------------

Please optimise the school-first journey into this flow:

1. User chooses “Search by school area”
2. Map shows area markers with school counts
3. User clicks an area marker
4. Map zooms into that area
5. Top-left map label shows the selected area name ( with optional city name )
6. School markers appear on map
7. Right panel shows all schools in that area
8. User optionally filters schools by type / board
9. User clicks a school
10. Map highlights school and shows radius
11. Nearby homes appear

This should feel progressive and visually smooth.

--------------------------------------------------
H. Visual/UI improvements requested
--------------------------------------------------

Please make the school-first journey more visually appealing and polished.

Improve:
1. Area markers with school counts
- clearly readable
- attractive selected state
- school count easy to scan

2. Map top-left area label
- subtle but clear
- feels native to the map UI

3. School cards
- attractive discovery cards, not plain rows
- clean badge system
- easy scan hierarchy

4. Transition between states
- area selected → schools shown
- school selected → homes shown
These state transitions should feel deliberate and smooth.

5. Reduce clutter
- In school-area browsing state, show schools only
- Do not show property markers until a school is chosen

--------------------------------------------------
I. Exact states to update in Figma
--------------------------------------------------

Please update these school-first frames:

Desktop:
1. School-first default state
   - area markers with school counts

2. School-first area selected state
   - map zoomed into area
   - top-left map area label shown
   - school markers visible
   - right panel shows all schools in selected area
   - no school-name search input

3. School-first area selected + school filters
   - filter chips for board/type/category

4. School selected state
   - selected school marker
   - radius circle
   - nearby homes visible

5. Combined context state
   - area + selected school visible as chips/context

6. No schools in area state
   - clear empty state with suggestions

Mobile:
1. School-first default bottom sheet
2. Area selected bottom sheet with area label context
3. Schools-in-area list bottom sheet
4. School selected bottom sheet with nearby homes
5. No schools / empty state bottom sheet

--------------------------------------------------
J. Copy direction
--------------------------------------------------

Use simple copy:

- “Search by school area”
- “Choose an area to browse schools”
- “Schools in Brahmavara”
- “Filter schools”
- “Homes near [School Name]”
- “No schools found in this area”
- “Try another area”

Avoid:
- “Search school by name” as the main interaction
- technical words like mode, bounds, geospatial, query, predicate

--------------------------------------------------
K. Key design note
--------------------------------------------------

The school-first journey should help the user discover schools area-by-area.

Do not assume the user knows school names already.

The main interaction model should be:
area markers with school counts → area zoom → area label visible → schools in area → school selected → nearby homes