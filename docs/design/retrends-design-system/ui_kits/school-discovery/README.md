# School-first discovery — design notes

A redesign of the Udupi Property Tracker *school-first* journey: help a parent (or
investor) start from a **school zone**, drill into a **neighbourhood**, then a
**school**, and only then see homes — calm, premium, and guided rather than a raw
search list. Built on the **ReTrends design system** (ink-navy + restrained copper +
warm off-white), with purple used sparingly as the school-journey accent.

Open `index.html`. The app **lands directly on the University Belt intermediary
page** (`journey=school-first&groupId=university-belt`) — areas inside the zone, *not*
houses. Click an area → State C. Click a school → State D. **Back to all school
zones** / **Start over** step back out.

---

## Correct journey model

The previous build skipped a step — selecting a zone jumped straight to property
listings. The corrected model inserts the **areas-inside-the-zone** step:

```
1. Landing            schools + zones
2. Zone selected      AREAS inside the zone        ← the missing intermediary page
3. Area selected      schools + homes in that area
4. School selected    homes within a chosen radius (5 km / 10 km / area-wide)
```

**Selecting a zone never shows houses as the primary result.** A zone resolves to a
list of *areas*; only after the user picks an area do schools and homes appear; only
after they pick a school are homes radius-filtered. A secondary **"View all homes in
{zone}"** escape hatch exists but is visually subordinate to the areas list.

**Agricultural land is excluded** from every school-first state (`UPT_HOME_LISTINGS`
filters any `propType` matching agri / farm / plot / land). **Buy/Rent wording** is
respected everywhere — counts read "homes for sale" or "rentals".

## Visual principles

1. **Calm over loud.** Copper is the single property accent (area CTAs, save-on, home
   pins). Purple is the *school* accent only — the School-first tag, school map pins,
   the radius ring, and the "How it works" panel. No gradients, no purple washes.
2. **Map and panel are one surface.** Shared warm canvas, one hairline divider, and a
   synced selection. The map's top-left **breadcrumb chip mirrors the panel**
   (Udupi › University Belt › Manipal › school), so the selected group is always
   visually connected to the right panel.
3. **Guided, not listy.** Eyebrow section labels, a strong selected-state header, and
   an explicit "How school search works" block keep the user oriented: choose zone →
   choose area → choose school → see homes.
4. **Trust is visible.** Every listing keeps the ReTrends Verified / Trusted / Listed
   badge. **Numbers are mono** (Geist Mono) so counts and prices read as data.

## Component hierarchy

```
TopNav (product chrome)
└─ SchoolDiscovery  (split: 46% map · 54% panel)
   ├─ UPTMap        Leaflet, CARTO Voyager tiles, breadcrumb chip, state-aware pins
   └─ Panel
      ├─ Journey header   Buy/Rent · "Find homes near a school" · School-first tag · Start over
      └─ Scroll body
         ├─ State 1 Landing  Search · SchoolCard×n · ZoneCard×n
         ├─ State 2 Zone     BackLink · ZoneSummaryCard · HowItWorks · AreaCard×n   ← intermediary
         ├─ State 3 Area     SelectedSummary(navy) · SchoolCard list · ListingCard grid (or ZeroHomesNotice)
         └─ State 4 School    SelectedSummary(navy, radius cue) · ListingCard grid · change-school list
```

New journey components: `AreaCard`, `ZoneSummaryCard`, `HowItWorks`,
`SelectedSummary`, `ZeroHomesNotice`, `BackLink`, `BuyRentToggle`. Reused DS
components: `Button`, `Badge`, `Input`, `TrustBadge`, `Icon`.

---

## Zone intermediary page structure (State 2 — the deliverable)

Top → bottom in the right panel:

1. **Journey header** (sticky) — Buy/Rent toggle, "Find homes near a school", the
   purple **School-first** tag, and **Start over**.
2. **Back link** — "Back to all school zones".
3. **Zone summary card** (see below).
4. **How school search works** — the guidance block.
5. **Areas inside this zone** — an eyebrow + a stack of **AreaCards** (one per area).

The map shows **area markers only** (no home pins) fitted to the zone bounds, so the
page never implies that property listings are the primary result yet. Each area
marker maps 1:1 to an area card and carries its school·listing counts.

### Zone summary card guidance

Light premium card (white surface, soft shadow — *not* the navy results band):

- **Title** — `University Belt`.
- **Subtitle pill** — `Academic and student housing`.
- **Description** — one plain-English sentence on the character of the zone.
- **Metrics row** (mono) — Total **areas**, total **schools**, total **listings**,
  rolled up from the areas.
- **Helper strip** — "Choose an area to see nearby schools and homes."

### Area card guidance

Polished cards, never plain rows. Each card shows:

- **Area name** + (if applicable) a "Schools only" pill.
- **Short description** (plain English).
- **Two metric tiles**: schools (purple tint) and listings (copper tint).
- **Adaptive CTA**: `Explore {area}` normally; `View schools in {area}` when there are
  no homes.

The stack is a single column so it scales cleanly to **five or more areas** — the
University Belt ships with four (Manipal, Katapadi, Udyavara, Parkala) to prove it.

### Zero-listing area guidance

An area with schools but **zero listings** (e.g. Katapadi) must read as a valid
school area, not a broken one:

- Listing tile greys out (`0 listings`) instead of an empty/error state.
- A "Schools only" pill flags it at a glance.
- Helper line on the card: *"No homes listed yet — view schools in this area, or try
  nearby Manipal."*
- CTA flips to **View schools in {area}** — focus on schools, not homes.
- Inside the area (State 3), the homes section is replaced by a soft
  **ZeroHomesNotice** with an "Explore Manipal instead" action.

## Area selected state guidance (State 3)

- **Back link** "Back to {zone}" + a navy **SelectedSummary** with the breadcrumb
  (`University Belt → Manipal`), area description, and schools / homes metrics.
- **"Find a school in {area}"**: a search input + grouped filter chips, then the
  filtered list. Hint: *"Narrow by board or level, then pick a school to filter homes
  within 5–10 km of it."*
- **Homes alongside**: a two-column **ListingCard** grid below — or the
  ZeroHomesNotice when the area has none. Selecting a school advances to State 4.

### School filter chips (selected-area page)

Two **grouped** chip rows sit between the search box and the school list — never a
flat row of buttons:

- **Board** — CBSE · ICSE · State · International
- **Level** — Primary · Secondary · Higher Secondary

Visual treatment (premium, calm — not raw form controls):

- Large rounded **pills** with a warm `--surface-card` background, hairline border,
  and a tiny mono **availability count** baked into each chip ("CBSE 2").
- **States**: default (off-white) · hover (`--surface-subtle`) · **selected**
  (`--plum-tint` fill, plum border + text, subtle shadow — purple as a *quiet* accent,
  never a heavy wash) · **disabled** (greyed, `not-allowed`) when applying that chip
  would yield zero schools given the other active filters.
- Chips are **multi-select** within and across groups (Board = OR, Level = OR, the two
  groups AND together). They wrap cleanly on narrow panels.

Behaviour:

- **Search + chips compose** — the result set respects both.
- **Result count** updates live: *"Showing 6 of 12 schools."*
- **Clear filters** appears once any chip is active.
- **Empty state** when nothing matches: *"No schools match these filters."* with a
  **Clear filters** action. (The disabled-chip logic usually prevents reaching it via
  chips; search can still empty the list.)
- The list collapses to the first four schools with a **"Show all N schools"** toggle
  when no filter/search is active.

### School card (selected-area)

Each card shows the school **name**, **address/locality**, a tone-mapped **board/type
badge**, a **level badge** (highest level offered) where available, and a
**homes-nearby** count. The whole card is the hit target; selecting it advances to the
**school-selected radius** state (State 4).

## School selected radius-filter state guidance (State 4)

- **Back actions**: "Back to {area}" link, **Change school** (on the summary), and
  **Start over** (header).
- Navy **SelectedSummary** with the full breadcrumb, the school's type badge and
  address.
- **Radius selector** (segmented) directly under the summary — **5 km · 10 km · All
  in area** — each chip shows its live count ("8 homes"). Default is **5 km**. The map
  circle resizes to match (5 km vs 10 km); "All in area" drops the circle and shows
  the administrative area set.
- **Filtered homes** in the two-column grid, **nearest first**. Filtering is a real
  haversine test (`UPT_DIST`) from the school's coordinates — so it pulls in homes
  from adjacent areas that genuinely fall inside the circle, which is why the radius
  count can exceed the area's own listing count.
- **Proximity on cards**: each card shows a computed **"X.X km from school"** chip
  (real distance). No travel-time is fabricated — the editorial `walk` caption is
  suppressed in this context in favour of the measured distance.
- A "Change school in {area}" list at the bottom for one-tap switching.

### Empty / fallback states (State 4)

- **No homes within the chosen radius** → a centred fallback: *"No homes within 5 km
  of {school}. Try 10 km (N homes), or view all homes in {area}."* with **Try 10 km**
  / **View all in {area}** / **Change school** actions.
- **No homes area-wide** → "No homes in this area yet" with the same recovery actions.
- **Missing school coordinates** → distance filtering is impossible, so the radius UI
  is replaced by *"Distance filtering unavailable"* with a **View homes in {area}**
  fallback. The app degrades honestly rather than inventing a distance.

## Map coordination notes

- **Balance**: map and panel are **50 / 50** — the panel never dominates the map.
- **State-aware markers**: landing = school + zone pins; **zone = area pins only**
  (no homes) — or home pins when "View all homes" is active; area = school pins + home
  price pins; school = selected school + purple dashed **radius ring sized to the
  chosen km** + home pins.
- **Breadcrumb chip** (top-left) mirrors the panel selection exactly.
- **Legend** is state-aware (Areas / Schools / Homes / "5 km radius" / "10 km radius"
  / "Area-wide").
- Selection drives `flyToBounds` (zone, area, radius circle) or `flyTo` (school) at
  0.7s; hovering a listing activates its price pin.

## URL / shared-link state

The whole journey is reflected in the URL via `history.replaceState`, so a shared
link restores the exact view:
`?journey=school-first&groupId=<zone>&areaId=<area>&schoolId=<school>&radiusKm=<5|10|area>&mode=<rent>&view=homes`.
On load the app reads these params; the selected school **and radius** are preserved.

## Data honesty (what is real vs. illustrative)

- **Distances are real** — `UPT_DIST` haversine over actual `lat/lon`; nothing is
  hard-coded. Radius counts and the per-card "km from school" come from this math.
- **Area `schools`/`listings` counts equal the real records** in `data.js` (no
  inflated catalogue numbers), so "showing N of M" is truthful.
- **`walk` is editorial copy** ("6 min walk to campus"), not a computed travel time —
  shown only as flavour outside the radius context, never presented as measured.
- **Gap to close in production**: real travel-time/drive-time needs a routing API
  (e.g. OSRM / Google Distance Matrix). Until then only straight-line km is shown.

---

## Implementation notes — React / Tailwind / shadcn

Production build of the same journey in React + Tailwind v4 + shadcn/ui.

**Tokens.** Map the ReTrends CSS variables to your Tailwind `@theme`:
`--color-primary: var(--navy-800)`, `--color-accent: var(--copper-500)`,
`--background`, `--border`, `--radius-lg`, etc. Add the **school accent** as its own
scale (`--plum-600/500/100/tint`) and use it *only* for school-journey UI. Keep Geist
Mono as `font-mono` for every price/count.

**Routing / state.** Drive everything from the URL so the intermediary page is a real
destination:
`?journey=school-first&groupId=<zone>` → State 2 (areas),
`&areaId=<area>` → State 3, `&schoolId=<school>` → State 4. A guard ensures
`groupId` alone **never** renders listings — it resolves to `areas.filter(a => a.zone === groupId)`.

**Layout.** `grid grid-cols-[1fr_1fr] h-[calc(100dvh-3.75rem)]` — a balanced 50/50
split. Left = map; right = `flex flex-col` with a sticky header and a scrolling body.
On `<lg`, stack with a map/list segmented toggle.

**Map.** `react-leaflet` + CARTO Voyager tiles. Render pins as `L.divIcon` from a
React-rendered HTML string so markers reuse tokens. Per state, swap the marker set
(area / school / home) and recolor selection. The radius ring is `L.circle` at
`radiusKm * 1000` m with a dashed plum stroke, **resized when the radius chip
changes**; skipped entirely when coordinates are missing or radius is "area".

**Components (shadcn).**
- `Button` variants `primary | accent | outline | ghost` → shadcn Button + CVA.
- `Badge` (tone-driven) → shadcn Badge variants (trust tiers, type, "Schools only").
- Buy/Rent → shadcn `ToggleGroup` styled as a pill.
- AreaCard / SchoolCard / ListingCard / ZoneCard → shadcn `Card` +
  `hover:-translate-y-0.5 hover:shadow-md transition`.
- ZeroHomesNotice → `Card` with `border-dashed`.

**Data shape.** See `data.js`:
`zones[] {id,name,subtitle,blurb,center,bounds}`,
`areas[] {id,zone,name,blurb,schools,listings,lat,lon,bounds}` (the intermediary
layer), `schools[] {…,zone,areaId,lat,lon}`, `listings[] {…,zone,areaId,schoolIds[],lat,lon}`.
Selection logic: zone → `areas.filter(a => a.zone === id)`; area →
`schools.filter(s => s.areaId === id)` + `listings.filter(l => l.areaId === id)`;
school → `UPT_HOME_LISTINGS` then `filter(l => UPT_DIST(school, l) <= radiusKm)`
sorted by distance (or `areaId` match for "All in area"). `UPT_IS_AGRI` /
`UPT_HOME_LISTINGS` strip agricultural land from every school-first query.

**Motion.** 120ms hovers, 200ms card transitions, 320ms photo zoom, 700ms map fly;
standard ease `cubic-bezier(.4,0,.2,1)`. No infinite or bouncy animation.

**Scope.** School-first discovery only — listing detail, saved searches and the
broker side are out of scope here.
