## Problem statement

On the selected school-first discovery results page, once a user has drilled into a
specific school (e.g. **University Belt → Manipal → Manipal Institute of Technology**),
there is **no in-panel control to switch to a different school within the same area
(Manipal)** without losing context. The only affordance today is the **"Change school"**
link in the summary band, which navigates *back* (clears `schoolId`) to the
school-selection step — it does not let the user pick a sibling school inline.

The Claude Design reference for this state shows a **"Change school in Manipal"** section
listing the other schools in the area (with board/type tags and a "homes nearby" count),
each with a **"View homes →"** action that re-runs the radius search for that school.
This is currently **absent** from the implementation (`SchoolSelectedPanel` renders the
summary band, radius chips, result heading and listings only — no sibling-school list).

Design reference (selected-school state):
https://claude.ai/design/p/f3796631-064b-4956-94ba-14baa7af9bcf?file=ui_kits%2Fschool-discovery%2Findex.html&present=1
(reach the target state via `University Belt` → `Manipal` → `Manipal Institute of Technology`;
look for `Selected school`, `University`, `Manipal Institute of Technology`).

Route where the gap is visible:
`/discover?city=udupi&journey=school-first&groupId=university-belt&lat=13.35346&lon=74.79106&zoom=13&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=11111111-2222-3333-4444-555555555555&radiusKm=3`

## User story

As a buyer searching for a home near a school, when I'm viewing results for
**Manipal Institute of Technology**, I want to **switch to another school in Manipal**
directly from the results panel, so I can compare nearby-home options across schools in
the same area without going back to the school-selection step and losing my place.

## Scope

- Add a **"Change school in Manipal"** (area-scoped) section to the selected
  school-first results panel (`SchoolSelectedPanel`).
- List the **other schools in the current area** (exclude the currently selected school),
  each showing: school name, board/type tag(s), and a real **"N homes nearby"** count.
- Each row has a **"View homes →"** action that selects that school
  (updates URL `schoolId` + recenters the radius search) and refreshes the results,
  staying within the school-first journey and the current area context.
- Reuse existing data sources only:
  - sibling schools from the existing **`/api/public/schools/by-area`** query
    (`useSchoolsByArea`), already used by the map's `SchoolMarkerLayer`.
  - "homes nearby" must come from a **real** backend count; if no such count exists per
    school today, this becomes a backend sub-task (do **not** fabricate counts).
- Reuse the existing school-select handler (`setSchoolJourney` / `handleSelectSchoolById`)
  so URL state, map focus, and radius listings all update consistently.

## Out of scope

- Cross-area school switching (only schools within the current `areaKey`).
- Changing the area, group, journey, radius semantics, or any backend contract beyond an
  (optional) per-school "homes nearby" count if one does not already exist.
- Map/marker redesign, new school metadata (ratings, reviews, travel time, transport).
- The visual polish already shipped in `feat/school-results-design-polish`
  (scroll fix, copper summary band, distance-badge treatment).

## Acceptance criteria

1. On the selected school-first results page, a **"Change school in Manipal"** section is
   rendered below the listings when the current area has **>1** school.
2. The section lists **sibling schools only** (the currently selected school is excluded).
3. Each row shows the school name, its board/type tag(s), and a **real** "N homes nearby"
   count (never fabricated; hidden if no count is available).
4. Clicking **"View homes →"** (or the row) selects that school: URL `schoolId` updates,
   the map recenters/refocuses on the new school, and the radius listings refresh — all
   without leaving the school-first journey or the current area.
5. The currently selected school remains highlighted in the summary band; the new school
   becomes the selected school after the action.
6. Keyboard accessible (rows are buttons/links, focus-visible, Enter/Space activate);
   ARIA labels describe the action.
7. Empty/edge states handled: area with exactly one school → section hidden; loading and
   error states for the sibling-school query are surfaced (reuse existing diagnostics).
8. No regression to the existing **"Change school"** back-affordance in the summary band.

## Definition of Done

- Implementation behind the school-first journey only; area-first and agri journeys
  untouched.
- TypeScript strict: `node node_modules/.bin/tsc --noEmit -p tsconfig.app.json` shows
  **0 net-new** errors vs `main` baseline.
- `npm run lint` shows 0 net-new problems for changed files.
- Unit/integration tests for the new section (render, sibling exclusion, real-count
  display/hide, select-school wiring, a11y, single-school hidden state).
- Manual verification on the target route (FE/BE/CORS as per the polish task) with a
  screenshot showing the section and a successful school switch.
- No new backend fields invented; if a per-school "homes nearby" count is required and
  absent, it is implemented as a real backend endpoint/aggregate with its own tests.

## Test plan

- **Unit/JSDOM (`SchoolSelectedPanel`)**: section renders only when area has >1 school;
  selected school excluded; each row shows real count or hides it when absent;
  "View homes" invokes the school-select handler with the correct `schoolId`;
  single-school area → section absent; loading/error states.
- **Integration (`DiscoverRightPanel` / `MapDiscovery`)**: selecting a sibling school
  updates URL `schoolId`, recenters the map, and refreshes radius listings.
- **a11y**: rows are focusable, Enter/Space activate, accessible names present.
- **Manual browser**: navigate the target route, confirm the "Change school in Manipal"
  section matches the design reference, switch schools, confirm results + map update.

## Routing

This task should be routed **separately through `/mode3-run`** (it is cross-layer:
panel UI + school-select wiring, and potentially a backend "homes nearby" count).
It is intentionally **not** implemented in `feat/school-results-design-polish`, which is
scoped to visual/scroll polish of the existing selected-school results page only.
