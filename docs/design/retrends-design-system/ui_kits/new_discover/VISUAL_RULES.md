# Discover V2 — Visual Rules

All values below are taken directly from the exported design files. Token names reference the
ReTrends design-system CSS in the project root; component values reference the JSX in
`ui_kits/new_discover/src/`. **Do not guess or substitute values** — reference the tokens, and where a
component uses a literal, the literal is quoted here.

**Source files**

| Concern | File |
|---|---|
| Global token entry | `styles.css` → `@import` of `tokens/*.css` |
| Colour tokens | `tokens/colors.css` |
| Typography tokens | `tokens/typography.css` |
| Spacing / radii / layout | `tokens/spacing.css` |
| Elevation / motion | `tokens/elevation.css` |
| Fonts | `tokens/fonts.css` |
| Shell (control bar, mode selector, rows) | `src/NDPanel.jsx` |
| Map + markers | `src/NDMap.jsx` |
| Cards | `src/components/cards.jsx` |
| Shared primitives (filters, radius, distance) | `src/components/shared.jsx` |
| Orchestrator (layout, breakpoints) | `src/NewDiscover.jsx` |
| Local overrides / popup styles | `index.html` `<style>` block |

---

## 1. Tokens

### Colours (`tokens/colors.css`)

**Brand primitives**

| Token | Value | Role |
|---|---|---|
| `--navy-900` | `#0E1626` | deepest ink; headings / CTA bands |
| `--navy-800` | `#1B2A45` | **primary** brand ink-navy; selected markers |
| `--navy-700` | `#26395B` | primary hover |
| `--navy-600` | `#34496E` | |
| `--navy-100` | `#E9ECF2` | navy tint surface |
| `--copper-600` | `#934B2D` | accent hover / pressed |
| `--copper-500` | `#B05C3A` | **accent** (Areas mode) |
| `--copper-400` | `#C2734F` | |
| `--copper-100` | `#F2E8E1` | accent tint |
| `--gold-600` / `--gold-100` | `#8A6A22` / `#F4EEDD` | premium highlight (unused in Discover) |

**Neutrals**

| Token | Value |
|---|---|
| `--canvas-100` | `#F6F5F2` (app background) |
| `--canvas-200` | `#EEEDE9` |
| `--stone-300` | `#E6E5E0` (muted surface) |
| `--stone-400` | `#D7D6D0` (hairline on canvas) |
| `--paper` | `#FFFFFF` (cards) |

**Text / greys** — `--grey-900 #111827` (strong), `--grey-700 #374151` (body), `--grey-500 #6B7280`
(muted), `--grey-400 #9CA3AF`, `--grey-300 #D1D5DB`, `--grey-200 #E5E7EB`, `--grey-100 #F3F4F6`,
`--grey-50 #F9FAFB`.

**Semantic hues** — `--evergreen-600 #1F7A5C` (verified / Agricultural), `--evergreen-50 #E8F2EE`,
`--ochre-600 #A9741C`, `--ochre-50 #F6EFDE`, `--brick-600 #B23A2E`, `--brick-50 #F6E9E7`.

**Semantic aliases (reference these, not primitives):**

- Surfaces: `--background: var(--canvas-100)`, `--surface-card: var(--paper)`,
  `--surface-muted: var(--stone-300)`, `--surface-subtle: var(--canvas-200)`,
  `--surface-navy: var(--navy-800)`.
- Text: `--text-strong: var(--grey-900)`, `--text-body: var(--grey-700)`,
  `--text-muted: var(--grey-500)`, `--text-on-navy: #FFFFFF`.
- Actions: `--primary: var(--navy-800)`, `--primary-hover: var(--navy-700)`,
  `--accent: var(--copper-500)`, `--accent-hover: var(--copper-600)`,
  `--accent-tint: var(--copper-100)`.
- Lines/inputs: `--border: rgba(17,24,39,0.09)`, `--border-strong: rgba(17,24,39,0.15)`,
  `--input-bg: #F1F0EC`, `--ring: var(--navy-800)`.
- Trust tiers: verified `--trust-verified-fg #1F7A5C` / `--trust-verified-bg #E8F2EE`;
  trusted `--trust-trusted-fg var(--navy-700)` / `--trust-trusted-bg var(--navy-100)`;
  listed `--trust-listed-fg var(--grey-600)` / `--trust-listed-bg var(--grey-100)`.

### Journey / mode accent colours

The mode drives one accent throughout its screens (`src/NDPanel.jsx` `MODE_TINT` / `MODE_BG`, mirrored
in map + cards):

| Mode | Accent | Tint background | Where |
|---|---|---|---|
| **Areas** | `var(--accent)` = copper `#B05C3A` | `var(--accent-tint)` `#F2E8E1` | default; copper CTAs, area markers |
| **Schools** | `var(--plum-600)` `#5E5286` | `var(--plum-tint)` `#F1EDF7` | plum school markers, school rows/filters |
| **Agricultural** | `var(--evergreen-600)` `#1F7A5C` | `var(--evergreen-50)` `#E8F2EE` | evergreen corridors, sector, parcels |

> **Plum + evergreen literals** are defined locally in `index.html`'s `<style>` `:root` block, since
> they are Discover-specific extensions of the base palette:
> `--plum-600 #5E5286`, `--plum-500 #7E6BA8`, `--plum-100 #DED7EC`, `--plum-tint #F1EDF7`,
> `--evergreen-100 #CFE6D9`, `--evergreen-700 #1F694A`. The map uses two additional evergreen
> literals for filled shapes: corridor `#1F7A5C`/selected `#154834`, sector fill `#2E9B74`.

### Typography (`tokens/typography.css`)

- **Families:** `--font-sans: "Plus Jakarta Sans", …` (UI + body); `--font-serif: "Fraunces", …`
  (panel headings only); `--font-mono: "Geist Mono", …` (prices, counts, metrics).
- **Weights:** 400 / 500 / 600 / 700 / 800 (`--fw-regular … --fw-extra`).
- **Scale (rem @ 16px):** `--text-xs .75/12`, `--text-sm .875/14`, `--text-base 1/16`,
  `--text-lg 1.125/18`, `--text-xl 1.25/20`, `--text-2xl 1.5/24`, `--text-3xl 1.875/30`,
  `--text-4xl 2.25/36`, `--text-5xl 3/48`, `--text-6xl 3.75/60`.
- **Line-heights:** tight 1.15, snug 1.3, normal 1.5, relaxed 1.65.
- **Letter-spacing:** `--tracking-tight -0.02em`, `--tracking-caps 0.08em` (uppercase eyebrows/labels).
- Fonts loaded from Google Fonts in `tokens/fonts.css`.

### Spacing, radii, layout (`tokens/spacing.css`)

- **Spacing (4px grid):** `--space-1 4` … `--space-2 8`, `--space-3 12`, `--space-4 16`,
  `--space-5 20`, `--space-6 24`, `--space-8 32`, `--space-10 40`, `--space-12 48`, `--space-16 64`,
  `--space-24 96`.
- **Radii:** `--radius-xs 4`, `--radius-sm 6`, `--radius-md 8` (default control),
  `--radius-lg 12` (cards), `--radius-xl 16` (feature), `--radius-2xl 24`, `--radius-full 9999`.
- **Control heights:** `--control-sm 32`, `--control-md 36`, `--control-lg 40`.
- **Layout:** `--container-max 1280`, `--gutter 1.5rem`, `--header-h 64`.

### Elevation & motion (`tokens/elevation.css`)

- **Shadows:** `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl` (soft,
  low-contrast, tuned for white cards on warm canvas). Exact:
  `--shadow-md: 0 4px 10px rgba(17,24,39,.07), 0 2px 4px rgba(17,24,39,.05)`;
  `--shadow-lg: 0 12px 28px rgba(17,24,39,.10), 0 4px 10px rgba(17,24,39,.05)`.
- **Focus ring:** `--ring-width 3px`, `--ring-color rgba(28,43,74,0.35)`.
- **Motion:** `--ease-standard cubic-bezier(.4,0,.2,1)`, `--ease-out cubic-bezier(.16,1,.3,1)`;
  `--dur-fast 120ms`, `--dur-normal 200ms`, `--dur-slow 320ms`.

### Breakpoints (from component media queries)

| Breakpoint | Effect | Where |
|---|---|---|
| `≤ 820px` | map/panel switch from side-by-side to stacked sheet | `src/NewDiscover.jsx` `matchMedia("(max-width: 820px)")` |
| `≤ 760px` | compass legend hidden | `index.html` `@media (max-width:760px) .nd-legend` |
| `< 560px` | listing/parcel grid → single column | `src/NDPanel.jsx` `ListingGrid` |
| map width `< 560px` | map instruction card hidden | `src/NDMap.jsx` `mapW >= 560` |

---

## 2. Component rules

Selectors below refer to the stable `data-design-component` attributes added to the export.

### Canonical component vocabulary

These are the **only** approved `data-design-component` names. Every manifest component uses a name
from this list, and every name here is documented below and appears in at least one manifest state.

| Name | Where authored |
|---|---|
| `map-surface` | `src/NewDiscover.jsx` (map column) |
| `results-panel` | `src/NewDiscover.jsx` (panel column) |
| `global-control-bar` | `src/NDPanel.jsx` |
| `city-switcher` | `src/NDPanel.jsx` |
| `buy-rent-toggle` | `src/NDPanel.jsx` |
| `area-autocomplete` | `src/NDPanel.jsx` |
| `mode-selector` | `src/NDPanel.jsx` |
| `metadata-strip` | `src/NDPanel.jsx` |
| `directional-card` | `src/NDPanel.jsx` (panel nav row) |
| `school-shortcut` | `src/NDPanel.jsx` |
| `property-search` | `src/NDPanel.jsx` |
| `filter-toolbar` | `src/NDPanel.jsx` |
| `school-filters` | `src/NDPanel.jsx` |
| `school-result` | `src/NDPanel.jsx` |
| `agricultural-origin` | `src/NDPanel.jsx` |
| `agricultural-search` | `src/NDPanel.jsx` |
| `town-row` | `src/NDPanel.jsx` |
| `trust-strip` | `src/NDPanel.jsx` |
| `radius-selector` | `src/components/shared.jsx` |
| `distance-selector` | `src/components/shared.jsx` |
| `listing-card` | `src/components/cards.jsx` |
| `parcel-card` | `src/components/cards.jsx` |
| `directional-marker` | `src/NDMap.jsx` (region + cluster map card) |
| `area-marker` | `src/NDMap.jsx` |
| `school-marker` | `src/NDMap.jsx` |
| `corridor-marker` | `src/NDMap.jsx` |
| `town-marker` | `src/NDMap.jsx` |
| `breadcrumb` | `src/NDMap.jsx` (map overlay) |
| `agricultural-sector` | `src/NDMap.jsx` (sector legend + `drawSector` overlay) |

> `mapIntent.markerType` values in the manifest (`listing-pin`, `parcel-pin`, `school-radius`) are
> **descriptive**, not component identifiers — the dense leaf pins carry no `data-design-component`;
> they are covered under §4 Map rules.

### Layout regions — `data-design-component="map-surface"` / `"results-panel"` (`src/NewDiscover.jsx`)
- **map-surface** — the map column. Desktop: `flex 0 0 52%`, `border-right 1px var(--border)`.
  Mobile (≤ 820px): top band `flex 0 0 42%`, `min-height 260px`, `border-bottom 1px var(--border)`.
- **results-panel** — the panel column, `flex 1`, `background var(--background)`, a fixed control
  header + a scrolling body. Mobile: rounded top (`16px 16px 0 0`), `-14px` overlap and elevation so
  it reads as a sheet above the map. Both regions are present in every state.

### Global control bar — `data-design-component="global-control-bar"`
- One horizontal bar: `border 1px var(--border)`, `border-radius var(--radius-md)`,
  `background var(--surface-card)`, `box-shadow var(--shadow-xs)`, `min-height 44px`, `flex-wrap`.
- Contains three seamless segments separated by `border-right 1px var(--border)`:
  **city-switcher**, **buy-rent-toggle**, **area-autocomplete**.

### City switcher — `data-design-component="city-switcher"`
- Button: `padding 0 13px`, gap 8px, `map-pin` icon in `var(--accent)`, city name 14px/700, chevron.
- Hover/open background `var(--surface-subtle)`; left radius only (`var(--radius-md) 0 0 …`).
- Dropdown: `role="listbox"`, width 230px, `var(--surface-card)`, `--radius-lg`, `--shadow-lg`;
  live city row highlighted `var(--accent-tint)` + check; disabled cities show "Soon".

### Buy/Rent toggle — `data-design-component="buy-rent-toggle"`
- Two pill buttons, `padding 6px 13px`, 12.5px/600. Selected: `background var(--navy-800)`, `#fff`.
  Unselected: transparent, `var(--text-muted)`.

### Autocomplete — `data-design-component="area-autocomplete"`
- Input: flexible tail (`flex 1 1 210px`, min 150px), `min-height 42px`, leading search icon
  (accent when open), clear "×" chip when text present.
- Dropdown: `role="listbox"`, `--radius-lg`, `--shadow-lg`, max-height 340px; up to **6** results.
- Each option: 32px mode-tinted icon tile, area name 14px/700, "`region · city`" 12px muted, and a
  mode-specific action label ("Open area" / "View schools" / "Use as origin") + arrow.
- Highlighted option (keyboard/hover): `background var(--surface-subtle)`; `aria-selected`.
- Empty: "No area matches ‘…’" (+ " with schools" in Schools mode).

### Mode cards / selector — `data-design-component="mode-selector"` (grid of `role="tab"` cards)
- `role="tablist"`, `grid-template-columns repeat(3, 1fr)`, gap 8px.
- Card: `padding 10px 11px`, `--radius-lg`, `border 1.5px`. Selected: `1.5px solid <tint>` +
  `background <MODE_BG>` + **check badge** top-right (18px circle, tint bg, white check).
- Icon tile 28px `--radius-md` (tint bg + white icon when selected, else subtle bg + tint icon).
- Title 13.5px/700; "Rec" pill on Areas; sub-label 11px muted. Focus: `2px solid <tint>` outline.

### Metadata strip — `data-design-component="metadata-strip"`
- Row of capability cues on `MODE_BG[mode]`, `padding 7px 11px`, `--radius-md`; items 11.5px/600 with
  a 13px tinted icon, separated by 3px dots. Content changes per mode.

### Directional marker (map) — `data-design-component="directional-marker"` (`src/NDMap.jsx` `dirCard`)
- A region/cluster **card**, not a pin. Width scales with inventory: `130 + weight*40` → **130–170px**.
  `padding 9px 15px 10px`, `--radius-lg`, background navy (`--navy-800`/`--navy-900` selected;
  central uses `--navy-700`), border `rgba(255,255,255,0.42–0.95)`, `--shadow-lg`.
- Content: optional "Central" eyebrow (concentric-ring glyph), representative names 12.5px/700 white,
  **count as hero** in mono `22–31px/800`, unit label ("homes"/"schools"), and a `+N areas` pill when
  more members exist.
- Hover/selected: brighter border, `--shadow-lg`, `scale(1.06)`; a "Tap to explore ›" caption fades
  in below (accent-coloured). Selected marker also scales.
- Positioned by **compass bearing** around the map centre, not exact centroid (see §5 Map rules).

### Local-cluster marker
- Uses the **same `directional-marker` (`dirCard`) treatment** as regions — a generated cluster is
  visually a directional card, labelled by representative names, positioned by bearing. There is no
  separate "cluster pill" style; the narrow one-line pill is explicitly a **rejected** pattern (§7).

### Area marker (map) — `data-design-component="area-marker"` (`areaPinHTML`)
- Leaf-level, one **connected split capsule** (`am-leaf`): navy identity half (pin glyph + bold
  white area name, truncated with ellipsis if long) flush against a `--canvas-100` action half
  (`View {n} home(s)` in `--copper-600` + chevron). Single shared `--radius-full` border/shadow
  around both halves, small navy downward tail beneath. Whole capsule is one `role="button"` —
  activating it opens listings for that area directly, **never** a further zoom.
- States: hover/selected lift `translateY(-2px)` + deeper shadow, pale-copper tint on the action
  half, `:active` scale-down, `focus-visible` 3px accent ring around the whole shell.
- **Schools journey** uses a separate pill+tail treatment (`schoolsMode` branch): `--paper` pill,
  plum count, "View schools" caption — unchanged by this component.
- Draft candidate areas render as a dashed label (`area-candidate-label`), never this capsule.

### School marker (map) — `data-design-component="school-marker"` (`schoolPinHTML`)
- Individual school point pin — same pill+tail family, plum-accented graduation-cap glyph.
  Selected `--plum-600` + white. Distinct from the schools-journey **area** marker below.

### Schools-journey area marker (map) — `data-design-component="area-marker"` (`areaPinHTML`, `schoolsMode`)
- Same `am-leaf` split-capsule family as the homes area marker, plum-accented, at the **same
  compact scale** as the homes marker (areas sit at real, often close, coordinates — an
  oversized capsule collides with neighbours): identity half on `--plum-600` — graduation-cap
  glyph beside a stacked name (13.5px/800 white) + listings count (10px/600 muted white) —
  flush against a "View N schools" action half on `--canvas-100` in `--plum-600` (12.5px/800 +
  chevron). One shared shell/shadow/tail; hover tints the action half `--plum-100`
  (`am-leaf-school` override).

### Panel navigation row (directional card) — `data-design-component="directional-card"` (`DirNavCard`)
- Single-line clickable row. `padding 12px 14px`, `--radius-lg`, `border 1px var(--border)`
  (→ `--border-strong` on emphasis), `--shadow-xs` (→ `--shadow-md` + `translateY(-1px)` on hover).
- 38px icon tile (navy-100 → navy-800 on hover), title 15.5px/700 (nowrap), count in mono 16px + unit,
  representative names line (up to 4, `+N areas`) clamped to 2 lines, chevron.
- **Whole row is `role="button"`** with `aria-label`; hover/focus sync to the marker;
  focus/`hover-from-map` outline `2px solid <accent>`.
- Area rows (`data-nd-area`) and school rows (`school-result`) and town rows (`town-row`) follow the
  same 60–82px single-line row grammar, tinted per mode.

### Breadcrumb — `data-design-component="breadcrumb"` (map overlay)
- Pill over map top-left: `padding 9px 14px`, `--radius-full`, `--paper`, `--shadow-md`, `--border`,
  13.5px/600. Segments joined by chevrons; last segment coloured (`--text-strong` at city level, else
  the mode crumb colour); overflow ellipsis, `max-width calc(100% - 36px)`.

### Property search — `data-design-component="property-search"` (`PropSearch`)
- Row: search input (leading icon, clear chip) + a `--navy-800` "Search" button. Placeholder scopes
  to the current area ("Search within <Area> properties…"). **Distinct from the global autocomplete.**

### Filter toolbar — `data-design-component="filter-toolbar"` (`ListingToolbar`)
- Compact chips, not a tall form: **Type** row (All/Apartments/Villas/Plots) + **Beds** row
  (Any/1/2/3+) + a right-aligned **"Verified only"** chip (evergreen when on).
- `FChip`: `padding 6px 12px`, `--radius-full`, 12.5px/600; on = accent bg + white.

### Schools shortcut — `data-design-component="school-shortcut"` (`SchoolsShortcut`)
- Full-width plum affordance on the **Areas** area-results page that switches to Schools mode while
  keeping the current area. `padding 10px 13px`, `--radius-md`, `background var(--plum-tint)`,
  `border 1px var(--plum-200)` (→ `--plum-500` on hover). 32px plum icon tile, title
  "Find homes near a school" 13.5px/700, sub "Explore schools in <area> — keeps this area", arrow.

### Listing card — `data-design-component="listing-card"` (`ListingCard`)
- `--surface-card`, `--radius-lg`, `--shadow-sm` (→ `--shadow-lg` + `translateY(-2px)` hover).
- Image 168px with trust badge (top-left), save heart (top-right), and either a distance chip
  (plum, school journey) or a "New" tag (bottom-left). Body: price mono 19px/600 + type badge, title
  14.5px/600, locality row, beds/baths/sqft row, full-width "View details" outline button.
- Grid: `repeat(2, minmax(0,1fr))`, gap 16px; single column `< 560px`.

### School controls — `data-design-component="school-filters"` (`SchoolFilters`) + `radius-selector` (`Radius`)
- School filters: name search + **Board** chips (CBSE/ICSE/State/International, only those present) +
  **Level** chips (Primary/Secondary/Higher Secondary), plum accent.
- Radius selector: three equal buttons **3 / 5 / 10 km**, each showing the live home count; selected
  `--plum-tint` + `--plum-500` border. A dashed plum radius circle is drawn on the map.

### School result — `data-design-component="school-result"` (`SchoolRow`)
- Single-line row, 36px plum icon tile, school name 14px/700 (ellipsis), board + levels meta,
  "View homes →" affordance; plum hover border + outline sync.

### Agricultural origin control — `data-design-component="agricultural-origin"`
- Inline evergreen bar: `target` icon + "Search origin: **<name>**" + a "Change"/"Use <city> centre"
  action. `background var(--evergreen-50)`, `border 1px var(--evergreen-100)`, `--radius-md`.

### Distance selector — `data-design-component="distance-selector"` (`DistanceChips`)
- Evergreen chips **Within 10 / Up to 25 / 50 / 100 km**, each with a live count; selected
  `--evergreen-600` + white + check. Caption: "Includes properties at closer distances too."

### Directional sector — `data-design-component="agricultural-sector"` (`drawSector` + legend)
- A translucent evergreen **wedge** from the origin toward the corridor's real bearing (`half` ≈ 33°),
  with a muted full-extent wedge (fill 0.04, dashed) and an **active wedge** to the selected distance
  (stroke `#1F7A5C` 1.6px @ .85, fill `#2E9B74` @ 0.12). Cumulative **distance arcs** at 10/25/50/100
  km; the active band is emphasised (2.2px), others dashed and faded. Small `N km` labels ride the
  wedge's leading edge. A legend card explains "Search sector — direction & distance from <origin>".
  **Non-interactive; a scope overlay, never a boundary.**

### Town row — `data-design-component="town-row"` (`TownRow`)
- Single-line evergreen row: 36px tile, town name + "· N km" (origin-relative distance), parcel count
  (mono) + acreage, blurb (ellipsis), chevron. Map counterpart = `town-marker` disc (44/52px gradient
  circle with count + name-count caption).

### Parcel card — `data-design-component="parcel-card"` (`ParcelCard`)
- Like the listing card but evergreen: image 150px with trust badge + acreage chip
  (`rgba(31,105,74,.92)`), price mono 18px + crop badge, title, a 2-col detail grid
  (distance · water · road · soil · survey), full-width "View parcel" button.

### Trust strip — `data-design-component="trust-strip"` (`TrustStrip`)
- Reassurance band below city-level region cards: `--trust-verified-bg` + `--evergreen-100` border,
  34px evergreen shield circle, "Every listing is verified…" copy 12.5px.

---

## 3. Density rules

The first screen must feel like a compact control surface, not a marketing page:

- **All five urban directions (N/E/S/W/Central) are visible in a laptop viewport** at the Areas city
  overview — as compass markers on the map and as rows in the panel — without scrolling the map.
- **All four agricultural directions are visible without unnecessary scrolling** at the Agricultural
  overview.
- **Results pages expose the first property or parcel row high in the viewport** — compact headers
  (21–24px serif), compact toolbars (chip rows), no hero band.
- **Compactness must not reduce readability or interaction target sizes** — control bar min-height
  44px; rows 60–82px; chips ≥ 30px tall; body text ≥ 11.5px, counts in mono for legibility.

---

## 4. Map rules

Document these map layers separately (all in `src/NDMap.jsx`):

- **Structured compass-style city/region markers** — `directional-marker` cards laid out by bearing
  around the map centre (North top, East right, South bottom, West left, Central middle). Card width
  encodes relative inventory. This is an *orientation canvas*, not exact pins.
- **Local-cluster markers** — same `directional-marker` treatment, generated per sub-group, still
  compass-positioned relative to the parent.
- **Real positions** — area (`area-marker`), school (`school-marker`), town (`town-marker`),
  listing/parcel pins sit on **real coordinates**; the camera fits real bounds (`fitBounds` per view).
- **Agricultural sector colours & opacity** — wedge stroke `#1F7A5C`; active fill `#2E9B74` @ 0.12;
  muted context wedge fill @ 0.04 (dashed); arcs `#1F7A5C` with active 0.9 / inactive 0.22–0.4.
- **Distance arcs** — cumulative bands at 10/25/50/100 km; the active band is the heaviest stroke.
- **Origin marker** — evergreen `#154834` concentric-ring pin labelled "Origin · <name>",
  non-interactive.
- **Marker / panel linked states** — hover, focus and selection toggle the `.nd-nav-on` class and
  z-index on the matching marker; the class is toggled (never the marker recreated) so sync is smooth.
- **Basemap** — CARTO Voyager raster tiles; nav levels fade/desaturate the tile pane
  (`.nd-navmode`) so the markers read as the primary layer.

---

## 5. Visual anti-patterns (avoid)

- **Copying production colours** — use the ReTrends tokens above, not the current app's palette.
- **Oversized landing-page heroes on results screens** — results are compact workspaces.
- **Repeated City or Buy/Rent controls** — they live once, in the control bar.
- **Narrow one-line city-cluster pills** — clusters use the full directional card treatment, not a
  thin pill.
- **Invented corridor names** — always use representative real area/town names.
- **Excessive white space** — keep the compact density described in §3.
- **Excessive card footer rows** — nav cards are single-line; result cards have one action.
- **Selection represented only by colour** — always pair colour with a shape/check/scale change.
- **Map overlays that obscure geographic context** — the sector and tints stay translucent; the
  basemap must remain readable.
