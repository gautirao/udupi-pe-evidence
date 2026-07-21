# Discover V2 — Design & Interaction Intent

> **Scope of this document.** This describes the *approved product behaviour, visual rules and
> state transitions* represented by the exported Discover V2 design. It deliberately contains **no**
> repository-specific React component structure, backend, API, routing, database or test guidance —
> the design team does not have that context. Where the production repository must make a technical
> choice, this document says only what the *visible experience* must remain.

---

## 1. Design status

- **Discover V2 is design-frozen.** The exported HTML/CSS/JS under `ui_kits/new_discover/` is the
  **visual source of truth**.
- The implementation must **preserve the approved hierarchy and interaction model** exactly as the
  exported screens demonstrate them.
- **Minor technical adaptations are acceptable only where they do not alter the visible experience**
  (e.g. how state is stored, how data is fetched, component naming).
- **Missing or ambiguous states must be raised with the product/design owner rather than invented.**
  Any state this document marks `NOT DESIGNED` must be resolved by a product decision before build,
  not designed ad hoc in code.

The exported build is **Bangalore-only**. The city switcher lists Mumbai, Pune and Hyderabad as
*coming-soon* (disabled) entries; they are placeholders, not designed cities. The information
architecture below is written to be city-agnostic because the same generative model is intended to
drive every future city, but only Bangalore is frozen here.

---

## 2. Product objective

Discover serves two user intents and **both must resolve to the same selected geographic state**:

1. **Guided spatial exploration** — the user does not know exactly where to look and explores by
   direction, narrowing down the map.
2. **Direct area jump** — the user already knows an area name and wants to go straight there.

```text
Guided:
City
→ Direction
→ Optional local cluster
→ Area
→ Listings

Direct:
Search area
→ Area
→ Listings
```

The direct path resolves the searched area to its full generated directional path (region + any
generated sub-clusters) so that, after a jump, the map, breadcrumb, panel and Back behaviour are
**identical** to the state the guided drill-down would have produced. There is no "search result"
mode that behaves differently from browsing — search is just a faster way into the same tree.

---

## 3. Information architecture

Discover supports **two hierarchy depths**, and the depth is decided per region by the data, not by
the UI.

**Deep (with an optional local cluster):**

```text
City
→ Primary directional region
→ Optional local directional cluster   ← present only when the region is dense
→ Canonical area
→ Listings
```

**Shallow (no cluster needed):**

```text
City
→ Primary directional region
→ Canonical area
→ Listings
```

Rules:

- The **local-cluster level is optional**. It appears only when a region contains enough areas that a
  single flat list would be unusable. **The exported prototype uses a threshold of 8 areas *and* at
  least two directional sub-groups (`src/geo.js` `MIN_SPLIT`), but this is prototype evidence only —
  it is NOT the frozen production threshold.** The production rule for whether a region shows a
  cluster level must be finalised through engineering/product planning, and the **frontend must
  consume an explicit next-level type from the backend/city model** (e.g. "this region's next level
  is clusters" vs. "…is areas") rather than independently re-applying the prototype threshold.
- Some regions do **not** need it and skip straight from region → areas.
- The UI **must never display an artificial empty level**. If there is no meaningful cluster split,
  the region shows its areas directly.
- **Breadcrumbs show only the levels that actually exist** for the current path.

**Real examples from the exported Bangalore build:**

Deep — North is dense (~30 areas) and splits into a generated cluster before areas:

```text
Bangalore
→ North
→ <generated cluster>        (persisted representative-area label from the versioned city model)
→ Rajanukunte / Hebbal / …   (canonical area)
→ Listings
```

Shallow — South has few areas and skips the cluster level:

```text
Bangalore
→ South
→ Jayanagar
→ Listings
```

> The product brief also illustrates the shallow depth with a second-city example
> (`Udupi → North → Brahmavar → Listings`). That city is **not built** in this export; it is shown in
> the brief only to demonstrate the "skip the cluster when it isn't needed" rule. Do not treat it as
> an exported screen.

---

## 4. Directional navigation

Four object types make up the geographic tree:

| Level | What it is | How it is named | How direction is shown |
|---|---|---|---|
| **Primary directional region** | Stable city-relative directional region (North / East / South / West / Centre) | A **generic direction name**; representative canonical area names explain what the region contains | Compass position on the map + label |
| **Optional local directional cluster** | *Generated* from canonical geography relative to the parent | The **deterministic representative real-area names** of that sub-group | Compass position + small compass chip |
| **Canonical area** | A real neighbourhood | Its real name | Real map position |
| **Listing** | A real home / school / parcel | — | Real map position |

Principles that are frozen:

- **Primary regions are stable, city-relative directional regions** based on canonical geography —
  North / East / South / West / Centre — not manually authored marketing regions. They carry a
  **generic direction name**; representative canonical area names (and a short cue) describe what each
  region contains, but the region's identity is the direction, not an editorial label.
- **Direction organises the choices.** At the city and generated-cluster levels the layout is a
  compass: north sits at the top, east right, south bottom, west left, centre in the middle.
- **Deterministic representative names identify generated clusters (frozen rule):**
  - clusters are **generated from canonical geography**, not from live listing data;
  - representative areas are selected **deterministically** using geographic representativeness;
  - the **representative IDs and the display label are persisted as part of a versioned city model**;
  - **every user sees the same label** for the same cluster;
  - **live listing-count changes do not rename or reshape a cluster**;
  - labels **regenerate only** when approved geography changes, the model version changes, or an
    authorised city-generation revision is rerun;
  - a cluster's **property total includes listings from every member area**.
  > The exact production selection algorithm is subject to engineering/product planning. Do **not**
  > prescribe a runtime "largest listings" rule — the label is a persisted property of the city model,
  > not a value recomputed per render.
- **Invented corridor names are intentionally avoided.** The design never labels a group with a made-
  up marketing name; it always uses genuine destination names.
- **All member areas remain available after selecting a cluster** — the cluster is a lens, not a
  filter that hides areas.

> **Orientation vs. precision (frozen principle):**
> *At city and generated-cluster levels, orientation is more important than exact marker position.*
> *At area, school, town and listing levels, real geography becomes important* — markers sit on real
> coordinates and the map fits real bounds.

---

## 5. Search modes

Three **mutually exclusive** modes sit under the control bar. **Areas is selected by default.**

- **Areas** — residential neighbourhood discovery (recommended / default).
- **Schools** — find homes near a chosen school, reusing the selected urban area.
- **Agricultural** — explore farmland *outward* from an origin by direction and distance.

### Areas

```text
City → Direction → Optional cluster → Area → Residential listings
```

### Schools

Schools **reuse the selected urban geographic context**.

```text
City → Direction → Optional cluster → Area → School → Homes near the school
```

- Switching from **Areas to Schools retains the selected area where possible** (same region, sub-path
  and area carry over; only school-specific state resets).
- School regions/areas are filtered to those that actually contain schools.

### Agricultural

Agricultural **does not treat farmland as belonging to the selected urban area**. The selected city
or area becomes an **origin**.

```text
City or selected area as origin
→ Outbound direction
→ Distance band
→ Town or destination
→ Agricultural parcels
```

- The **origin** is the starting point farmland is measured *from*.
- **Direction and distance describe where farmland lies relative to the origin**, never which urban
  area "owns" it.
- The **directional sector is a search-scope visualisation** — a wedge showing which way and how far
  the current search reaches. **It is not a legal, administrative or parcel boundary.**

---

## 6. Global controls

The control bar and mode selector sit at the top of the results panel.

| Control | Role |
|---|---|
| **City switcher** | Changes the whole geographic context (city). Bangalore is live; others are coming-soon placeholders. |
| **Buy / Rent** | Switches residential intent; changes result nouns ("homes for sale" ↔ "rentals"). |
| **Direct area autocomplete** | Jumps straight to an area; behaviour depends on the active mode (see §7). |
| **Areas / Schools / Agricultural selector** | Chooses the mode; determines what happens *after* an area is picked. |
| **Contextual mode information (metadata strip)** | Small capability cues that change with the selected mode. |

**Two different search inputs — never conflate them:**

- The **global area input** (in the control bar) *changes geographic context* — it moves you to a new
  area / origin.
- The **property-results search** (inside a results page) *filters listings within the current area*.

These are visually and behaviourally distinct and must stay distinct.

---

## 7. Direct area search behaviour by mode

**Areas selected — pick "Hebbal":**
- opens Hebbal;
- fits the map to Hebbal;
- shows properties in Hebbal.

**Schools selected — pick "Hebbal":**
- preserves Hebbal as geographic context;
- shows schools in / near Hebbal;
- lets a school be selected;
- then shows homes near that school.
- (Autocomplete only offers areas that actually contain schools.)

**Agricultural selected — pick "Hebbal":**
- uses Hebbal as the **search origin**;
- shows agricultural opportunities *outward* from Hebbal;
- organises them by direction and distance from Hebbal.

In every mode the autocomplete resolves to the **same canonical state** the guided path would reach.

---

## 8. Map and panel synchronisation

The map and the right panel are **two views of one hierarchy level** — they always describe the same
level at the same time.

- Every navigation marker has a **corresponding right-panel card or row**, and vice versa.
- **Hovering either highlights the other.**
- **Focusing either highlights the other** (keyboard focus counts).
- **Selecting either performs the same navigation.**
- The **whole card and the whole marker are interactive** (not just an inner button or a pin dot).
- Selecting a marker also **scrolls the panel** to bring the matching card into view.

---

## 9. Results pages

Selected-area, school and agricultural-parcel pages are **results workspaces, not new landing
pages**. They are compact: the first result should be reachable high in the viewport, and there is no
oversized hero.

### Area results (Areas mode, area selected)
- compact geographic heading (area name + short description);
- **property search** (filters listings *within* this area);
- **essential filters** (type · bedrooms · verified) as a compact toolbar, not a tall form;
- **Schools shortcut** (jump into Schools for this area, keeping context);
- result count and sorting/summary;
- property cards.

### Schools results (Schools mode, area selected)
- **selected area retained** in heading and context;
- **school search** (by name);
- **school filters** (board, level);
- **school results** (compact rows);
- once a school is chosen: **selected school + radius** control (3 / 5 / 10 km);
- **homes shown beneath the school controls**, sorted by distance.

### Agricultural results
- **selected origin** (area or city centre), with a "change origin" affordance;
- **selected direction** (outbound corridor);
- **active distance band** (10 / 25 / 50 / 100 km, cumulative);
- **town / destination results** (compact rows) — or, one level deeper, **agricultural parcel cards**;
- **parcel search and filters** (size · price · soil · road · water).

---

## 10. Breadcrumb rules

Breadcrumbs appear as a pill over the map and reflect exactly the levels that exist.

Real examples from this build:

```text
Bangalore › North › <generated cluster> › Rajanukunte
Bangalore › South › Jayanagar
Bangalore › North › <generated cluster> › Hebbal › <selected school>
Bangalore › Origin: Udupi centre › North › Up to 25 km › Brahmavar   (illustrative city, not built)
Bangalore › Origin: Hebbal › North · 12–41 km                        (agri, area origin)
```

Rules (frozen):

- **Repeated labels such as `North › North` must not appear.** Sub-levels are labelled by their
  representative *area* names, never by repeating the compass word.
- **Optional hierarchy levels are omitted when absent** (shallow regions show no cluster crumb).
- **Local-cluster breadcrumbs use their persisted representative-area label** (the generated name
  that was shown when the cluster was chosen).
- **Agricultural breadcrumbs must not imply farmland belongs inside the origin area.** They read as
  `Origin: <name> › <direction> › <distance> › <town>`, framing direction + distance *from* the
  origin.

---

## 11. URL and restoration expectations

The following must be **shareable and restorable** (the exported build encodes them in the URL hash;
the production repository may use any equivalent mechanism, but the *visible* restoration must match):

- city;
- Buy / Rent;
- mode (Areas / Schools / Agricultural);
- direction (region);
- optional local cluster (directional sub-path);
- area;
- property query; property filters;
- school; school radius;
- Agricultural origin; Agricultural direction; Agricultural distance;
- selected town;
- selected listing where applicable.

Expectations:

- **Browser Back and Forward restore the visible state** step by step.
- **Refresh restores the map, panel and selected controls.**
- **Direct area search and guided navigation resolve to the same canonical state**, so a deep link
  produced either way behaves identically.

> Exact query-parameter names are **not prescribed**. (The exported prototype uses short hash keys —
> `m`, `br`, `r`, `p`, `a`, `s`, `rad`, `b`, `ao`, `c`, `cl`, `km` — for reference only.)

---

## 12. Loading, empty and error expectations

The exported design includes **empty states** (no matches) but does **not** include bespoke loading or
hard-error screens. Where a state is not designed, it is flagged for a product decision rather than
invented.

| Situation | Intended experience |
|---|---|
| Data is loading | `NOT DESIGNED — implementation must request a product decision.` Keep the shell (control bar, mode selector, map frame) stable; do not flash a different layout. |
| No listings in an area | Designed empty state: icon + "No homes match" + guidance + a "Clear search & filters" action. |
| No schools in an area | Designed empty state (plum accent): "No schools match" + clear-filters action. Areas without schools are excluded from Schools autocomplete/lists upstream. |
| No agricultural parcels within the distance | Designed empty state (evergreen accent): "No towns within N km" / "No parcels match" + a "Widen" or clear action. |
| Autocomplete has no matches | Designed inline message: "No area matches ‘…’" (plus "with schools" in Schools mode). |
| Saved deep link refers to unavailable data | `NOT DESIGNED — implementation must request a product decision.` Suggested intent: fall back to the nearest valid ancestor level rather than a blank screen — confirm with product. |
| Map data fails while panel data is available | `NOT DESIGNED — implementation must request a product decision.` The panel is fully usable without the map, so a graceful map-only failure should keep the panel operating — confirm the treatment with product. |

---

## 13. Responsive intent

Only behaviours represented in the exported design are documented. The build has **one** responsive
breakpoint that changes layout structure (map/panel stacking) at **≤ 820px**, plus minor content
reflow breakpoints (listing grid single-column ≤ 560px; the map instruction card and legend hide on
very narrow maps; the compass legend hides ≤ 760px).

| Class | Behaviour |
|---|---|
| **Large desktop / laptop (> 820px)** | Side-by-side: map fixed at 52% width on the left, results panel on the right. Full compass marker layout. Two-column result grids. |
| **Tablet (≈ 768–820px and below the breakpoint)** | Switches to the stacked layout: map on top (~42% height), panel below. Global controls wrap onto multiple rows within the control bar. |
| **Mobile (≤ 820px, phones)** | Map is a top band (~42% height, min 260px); the panel slides up beneath it as a rounded sheet with a grab handle. Result grids collapse to a single column (≤ 560px). The compass marker set re-centres for the narrower map. |

Additional represented rules:

- **Global controls wrap** (flex-wrap) rather than truncating; city · Buy/Rent · search reflow to new
  rows as width shrinks.
- **Breadcrumbs** stay a single pill with ellipsis on overflow (they do not collapse to a menu in this
  build).
- **Autocomplete** dropdown spans the input width on all sizes.
- On small screens the user moves between map and results by scrolling the stacked layout; the panel
  sheet sits above the map with elevation.

Anything beyond these (a dedicated mobile map/results toggle, a collapsed breadcrumb menu, etc.) is
`NOT DESIGNED` and must be a product decision.

---

## 14. Accessibility intent

Represented in the design and to be preserved:

- **Visible focus states** — cards, rows, mode cards and the autocomplete show a 2px accent outline
  on keyboard focus (distinct from hover).
- **Keyboard navigation** — nav cards/rows are `role="button"` with `tabIndex=0` and activate on
  Enter/Space; mode cards are `role="tab"` in a `role="tablist"`.
- **Selected state communicated beyond colour** — the selected mode card carries an explicit check
  icon (not colour alone); selected map markers change shape/scale and elevation.
- **Autocomplete keyboard behaviour** — `role="listbox"`/`option`, Arrow Up/Down to move the
  highlight, Enter to pick, Escape to close; results announced via `aria-selected`.
- **Full-card button semantics** — the entire card/row is the control and carries a descriptive
  `aria-label` (e.g. "Hebbal, 46 properties. … Activate to explore.").
- **Marker keyboard access** — map markers are keyboard-focusable and respond to Enter/Space; hover
  and focus drive the same highlight sync.
- **Tap targets** — control-bar segments, chips and rows meet comfortable touch sizes (control bar
  min-height 44px; rows are 60–82px tall).
- **Readable contrast** — dark navy markers on light basemap; body text uses the token text colours
  on paper/canvas.
- **Reduced motion** — `prefers-reduced-motion: reduce` disables marker caption transitions and the
  basemap fade.

---

## 15. Frozen decisions (must not be redesigned)

1. The **overall hierarchy** (city → direction → optional cluster → area → listings).
2. The **optional cluster level** and the rule that it appears only when a region is dense.
3. The **three search modes**, mutually exclusive.
4. **Areas is the default** mode.
5. **Direct search and guided exploration converge** on one canonical state.
6. The **city + generated-cluster marker model** (compass orientation, count as hero, representative
   names, "+N areas").
7. **Representative real-area naming** for generated clusters (no invented corridor names).
8. **Compact single-line panel navigation cards/rows** with whole-card interactivity.
9. **Results-page density** (no landing-page hero on results; first result high in view).
10. **Map ↔ panel synchronisation** (hover/focus/select mirrored both ways).
11. The **Agricultural origin / direction / distance model** (farmland measured outward from an
    origin; cumulative distance bands).
12. The **directional search-sector presentation** (translucent wedge + distance arcs = search scope,
    not a boundary).
13. The **visual system** (tokens, type, colour, card language — see `VISUAL_RULES.md`).
14. The **component hierarchy** (control bar, mode selector, nav cards, result cards, toolbars,
    origin/distance controls).

---

## 16. Flexible details (implementation's choice)

These are **not** design decisions and may be implemented however the repository prefers, provided the
visible experience is unchanged:

- React component names and file organisation.
- State-management approach (the exported hash encoding is illustrative only).
- Data-fetching / API-hook structure and caching.
- Internal module boundaries.
- Test-file placement and tooling.
- Exact query-parameter names and URL encoding.
- How counts are computed/sourced (the prototype derives them from mock records; production owns the
  real source — the *display rule* that counts are honest and aggregate correctly is what matters).
