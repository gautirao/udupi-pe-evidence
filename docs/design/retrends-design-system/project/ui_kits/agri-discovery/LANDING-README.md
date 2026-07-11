# Agricultural-land discovery — corridor-selection landing (design notes)

A polished, premium redesign of the Udupi Property Tracker **agricultural** journey in
its **corridor-selection landing** state: the user is in *Agricultural land* and must
choose one of four directional corridors — **N / E / S / W** towards Brahmavar /
Manipal / Padubidri / Malpe, each searching **up to 100 km** — before exploring.

Open `landing.html`. This is the guided *choose-a-corridor* step — **not** the
selected-corridor result page (`index.html`) and **not** a listing-card page.
Design-only. No backend features, prices, photos, owner, soil, water, crop, road,
per-corridor counts or demand data are introduced.

Built on the **ReTrends design system** (ink-navy + restrained copper + warm
off-white), with **evergreen** as the earthy *agricultural* journey accent — the same
family as the system's verified/positive hue, so it reads regional and credible rather
than decorative. It shares the exact TopNav, map controls, accent scale and card
motifs with the sibling result state, so the two screens feel like one product.

---

## Design rationale

**Page hierarchy.** The panel answers the user's three questions top-to-bottom, in
order: *(1) where am I?* — a sticky **journey-identity header** (sprout avatar,
*Agricultural land* in Fraunces, *Agricultural land* tag, Buy/Rent, Start over, X);
*(2) what do I do?* — a clearly promoted instruction block with a numbered **"1 ·
Choose a direction"** step, the heading **"Select a corridor to explore,"** and one
supporting line that each corridor searches up to 100 km from Udupi; *(3) what are my
options?* — the four corridor cards. The faint live instruction line is now a real
guided step with visible hierarchy between title, instruction and options.

**Corridor card treatment.** Each option is a full-width, clearly clickable card
(white paper, `--radius-xl`, hairline border, `--shadow-sm`). A **directional compass
badge** carries the cardinal letter (N/E/S/W, mono 800) with a small pointer at the
matching edge — a subtle directional cue, not a gimmick. The bearing (*North*…) sits
as an eyebrow above the corridor name; the **Up to 100 km** radius is a mono pill.
Hover lifts the card −2px to `--shadow-md`, brightens the badge to the evergreen
gradient, fills the chevron and reveals a faint **field-furrow texture** (an
agricultural land cue at ~3.5% opacity). Selecting a corridor adds the evergreen
selection rail + tint and reveals the single next action — an **Explore this corridor**
CTA — so clickability and the path forward are unmistakable.

**Map / panel balance.** A true **48 / 52 split** keeps the map a calm, equal half.
Udupi sits at the centre as a navy **search-origin** anchor; the four corridors appear
as compact directional cues at their named towns, joined to Udupi by faint dashed
spokes. Hovering or selecting a corridor card brightens the matching spoke and enlarges
its map cue to the evergreen fill (and vice-versa) — map and panel are one synced
surface. Nothing covers the map: only the preserved pill, selector, zoom, attribution,
a state-aware legend and the "Showing 24 properties" badge.

**Agricultural visual language.** Earthy **evergreen** accent (`#1C5B43 → #2E9B74`),
warm off-white surfaces, hairline borders and the sprout journey mark — plus the
barely-there furrow texture on active cards. Restrained: clarity over decoration.

---

## Implementation handoff

**Layout & spacing.** Shell = `grid` `48fr 52fr`, `height: calc(100vh - 60px)`. Panel
= `flex flex-col` with a sticky header (`16px 36px 20px`) and a scrolling body
(`28px 36px 40px`), content capped ~720px. Card stack gap `13px`; section gap `20px`.
4px base grid throughout.

**Corridor card styling.** White paper, `--radius-xl`, `1px var(--border)`,
`--shadow-sm`. Hover/selected → `translateY(-2px)`, `--shadow-md`, furrow texture
(`repeating-linear-gradient(0deg, transparent 10px, rgba(28,91,67,0.035) 10px 11px)`).
Selected adds a 4px `--agri-600` left rail, `--agri-tint` fill and the gradient CTA.
Compass badge 58px `--radius-lg`: idle `--agri-tint` + `--agri-100` border with the
cardinal letter in `--agri-700`; active = evergreen gradient, white letter, edge
pointer. All distances in `font-mono`. Motion: 120ms hover, 200ms card, standard ease.

**Map badge styling.** "Showing N properties" = white pill, `--radius-full`,
`--shadow-lg`, hairline border, a 7px copper dot, label in body grey, **N** in
`font-mono 700`. Corridor cues = `L.divIcon` from an HTML string (hard-coded hex):
white/tint disc with the cardinal letter, evergreen-fill + 3px white ring when active,
town chip beneath mirroring the card. Spokes = `L.polyline` Udupi→town, evergreen
dashed at ~0.32 opacity, solid + 0.9 when active.

**Reusable components / tokens.** `Icon` (map-pin, chevron-right/down, route, x,
arrow-right, building, layers, plus, calendar, message-circle), the shared **TopNav**
chrome (1:1 with `index.html`), `Button`/`Badge` for Start-over / Filters / tags, and
the **agri accent scale** below — used *only* on the agricultural journey:

```
--agri-700: #1C5B43   /* deep — letters, marker base */
--agri-600: #1F7A5C   /* mid  — rails, spokes (== evergreen-600) */
--agri-500: #2E9B74   /* bright — gradient top */
--agri-100: #CFE5D8   /* hairline on tint */
--agri-tint:#EAF3EF   /* selected card fill */
```

Buy/Rent → shadcn `ToggleGroup` styled as a pill. Cards → `Card` + hover lift.

---

## No new data requirements

Nothing here needs a new backend field. The four corridors (N/E/S/W towards Brahmavar /
Manipal / Padubidri / Malpe), the **Up to 100 km** radius, Buy/Rent, the city, the
Udupi origin and the **24**-property map indicator are all already present on the
current page. Town coordinates are approximate real places used only as direction
anchors. No price, photo, owner, soil, water, crop, road, school, per-corridor count or
demand-score data is introduced, and the state remains the **corridor-selection
landing** view — not a results or listing page.
