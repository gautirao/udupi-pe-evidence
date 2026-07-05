# Handoff: Discover — Area-First Journey (Udupi Property Tracker)

## Overview

This package covers the **public, first-touch property-discovery flow** for the
Udupi Property Tracker (a ReTrends real-estate portal for coastal Karnataka). It
is the calm, trust-led, map-led path a first-time buyer takes to get from "I want
to find a property in Udupi" down to a specific locality's listings.

Three connected screens are documented here — they form one continuous journey:

```
1. Discover landing            → choose HOW to search (pick a journey)
2. Area-first: choose an area  → pick a neighbourhood GROUP (or a map locality)
3. University Belt drill-down   → pick a LOCALITY inside the chosen group
                                  → (next, not in scope) listing results
```

The full journey model:

> **Discover → Choose an area → University Belt → Choose a locality → See properties**

Screen 3 (the University Belt drill-down) is the newest and the reason for this
handoff; screens 1 and 2 are included because screen 3 must feel like the natural,
visually-consistent next step in the same flow.

---

## About the Design Files

The files in `designs/` are **design references created in HTML/React-via-Babel** —
runnable prototypes that show the intended look, layout, copy, and behaviour. They
are **not** production code to copy directly.

The task is to **recreate these designs in the target codebase's existing
environment** (the product is described as UPE / shadcn + React with established
tokens) using its established components and patterns. If no front-end environment
exists yet, pick the most appropriate framework for the project and implement
there. Do **not** ship the HTML prototypes as-is.

Specifically for this product:

- Build on the **existing UPE / shadcn component library** — `Button`, `Card`,
  `Select`, `Tabs`/segmented control, etc. Do not introduce a new component
  library.
- Use the **existing design tokens** (the CSS custom properties documented below
  and shipped in `tokens/`). Every colour, radius, shadow, font, and duration in
  the prototypes is already a token — map them 1:1.
- **No new backend API.** All counts come from data the app already has
  (neighbourhood groups → areas → listing records). The mock data files
  (`data.js`, `uni-belt-data.js`) show the exact shape and the data-honesty rules.
- ReTrends styling is **visual inspiration only** — implement against this product's
  own tokens/components.
- Do **not** change the route concept or journey behaviour. Keep agricultural land
  out of the area-first journey (it is a separate journey).

---

## Fidelity

**High-fidelity (hifi).** These are pixel-level mockups with final colours,
typography, spacing, interactions, loading/empty states, and responsive layouts.
Recreate the UI faithfully using the codebase's existing libraries and tokens.
Exact values are listed in **Design Tokens** below; the prototypes are the source
of truth for anything not spelled out.

---

## The journey & route model

These map to query-string state on a single `/discover` route (recommended to
mirror to the URL so shared links restore the state):

| Screen | URL (illustrative) | What the user picks |
|---|---|---|
| Landing | `/discover?city=udupi` | a **journey** (area / school / agri) |
| Area-first | `/discover?city=udupi&journey=area-first` | a **neighbourhood group** |
| Drill-down | `/discover?city=udupi&journey=area-first&groupId=university-belt` | a **locality** |

Shared state that persists across all three: **`city`** (default `Udupi`) and
**`mode`** (`Buy` / `Rent` — wording-only, same inventory).

---

## Terminology (important — enforce in all copy)

The catalogue also holds agricultural land, so **never use "homes" as a generic
term** on these public surfaces. Use:

- **properties**, **listings**, **verified properties**
- **areas**, **localities**
- **neighbourhood group**

"homes" is acceptable only inside a clearly-residential journey (not here).
Counts are **always real record counts** — never invented or rounded up.

---

## Screens / Views

### Shared chrome (all three screens)

**Preview bar (DEMO ONLY — do not ship):** the dark `--navy-900` bar at the very
top with Layout / Data / Replay-loading toggles is showcase chrome for reviewing
states. It is **not** part of the product; omit it in implementation.

**Public marketing header** (`TopNav`) — height 60px desktop / 52px mobile,
`--paper` background, 1px `--border` bottom:
- Left: 32px `--navy-800` rounded-`--radius-md` square with a white `map-pin`
  icon, then wordmark **"Udupi Property Tracker"** (15px / 700 / `--text-strong`)
  over **"Real estate trends"** (11px / `--text-muted`, hidden on mobile).
- Nav (desktop only): **Discover** (active — `--surface-subtle` pill) · **Trends** ·
  **Saved** (13.5px / 600; active `--text-strong`, rest `--text-muted`).
- Right: **Sign in** outline button (1px `--border-strong`, `--radius-md`,
  13.5px / 600; hover background `--grey-50`).
- This is a **public** header — it must NOT show broker/admin tooling (no
  Dashboard, My Listings, New Listing, Bookings, Listing Quality, notification
  bell, or user avatar). Removing that admin chrome was a core fix.

**Breadcrumb** (`Crumb`) — below header, `--paper`, 1px `--border` bottom,
12.5px / 600, items separated by a 14px `chevron-right` in `--grey-400`:
- Landing: *(no breadcrumb — the landing is the entry)*
- Area-first: **Discover › Choose an area**
- Drill-down: **Discover › Choose an area › University Belt** (the last crumb is
  `--text-strong`; earlier crumbs are `--text-muted` and clickable to navigate up).

**Desktop layout** for screens 2 & 3: a horizontal split — **map fills the left**
(`flex: 1`, 1px `--border` right divider), **decision panel on the right**
(`width: clamp(440px, 42%, 560px)`, independently scrolling). Screen 1 (landing)
uses the same split.

**Mobile layout** (all three): single column — header, breadcrumb, then a
swappable body with a **bottom tab bar** (`--paper`, 1px `--border` top, two
buttons). Active tab = solid `--navy-800` with white label; inactive = `--paper`
with 1px `--border-strong`. Tabs:
- Screens 1 & 2: **Areas** (`layers`) / **Map** (`map-pin`)
- Screen 3: **Localities** (`map-pin`) / **Map** (`layers`)
Panel shows first by default.

---

### Screen 1 — Discover landing (`discover_city.html`)

**Purpose:** help a first-time visitor choose *how* to search.

**Right panel** (editorial column, `max-width: 560px`, centered):
- Eyebrow `DISCOVER UDUPI` (uppercase, 11px / 700, `--tracking-caps`).
- Serif hero (`--font-serif` Fraunces, 600, ~38px desktop, `--tracking-tight`):
  *"Find your place in Udupi, your way."*
- Lead paragraph (16px / `--text-body`).
- **Controls card** (`--paper`, 1px `--border`, `--radius-lg`, `--shadow-xs`):
  City `Select` + **Buy / Rent** segmented control, with a live helper line
  beneath ("Showing sale prices in ₹…" / "Showing monthly rents…").
- **Three journey cards** (pick-one-of-N), each with an identity colour:
  - **Explore by area** — primary; navy avatar, `10 areas · 30 properties ·
    Locality insights` chips, solid copper CTA. Marked **Recommended**.
  - **Search near a school** — plum `#6E4E96` avatar, `5 or 10 km radius` chips,
    ghost CTA.
  - **Find agricultural land** — evergreen avatar, `By corridor & direction`
    chips, ghost CTA.
- **Trust strip** — `shield-check` in an `--evergreen-50` tile + "Every listing is
  verified…" sentence.

**Map (left)** — aggregated **neighbourhood-group** markers (non-zero counts), so
the city reads full. Single "Udupi" breadcrumb pill top-left. Footer pill
*"Showing N verified properties across Udupi"*. Low-data state degrades gracefully.

> Journey identity system (keep distinct across all journeys): **Area = ink-navy
> `--navy-800` / tint `--navy-100`**, **School = plum `#6E4E96` / `#F0EAF6`**,
> **Agri = evergreen `--evergreen-600` / `--evergreen-50`**. **Copper
> (`--accent`) is reserved** for the single most important accent per view
> (Recommended tag, primary CTA, live counts) — never spent on identity.

---

### Screen 2 — Area-first: choose an area (`discover_city_journey_area_first.html`)

**Purpose:** pick a **neighbourhood group** (or click a locality marker) before
seeing listings.

**Right panel** (`max-width: 560px`):
- Eyebrow row: `AREA-FIRST` tag (navy-100 pill with `layers` icon) on the left;
  **Start over** pill (✕) pushed right (secondary).
- Serif hero: *"Choose an area in Udupi"* + lead.
- Controls card (City + Buy/Rent) + helper line — identical pattern to screen 1.
- **Summary card** "Explore by area" — `map-pin` in `--accent-tint` tile, blurb,
  and a 3-up stat strip (`groups` · `areas` · `properties`; properties value in
  `--copper-600`).
- Section label **NEIGHBOURHOOD GROUPS** + count.
- **Group cards** (`NeighbourhoodCard`) — one per group, lift-and-tint motif (see
  Card states below). Groups with `homes === 0` drop to the muted, non-actionable
  variant ("No listings yet" / "Coming soon").
- Trust strip.

**Map (left)** — individual **locality** markers (premium warm-card pills: copper
`map-pin` + locality name + mono count chip). Hovering a group card **highlights
that group's localities and dims the rest** (panel↔map are linked). Zero-localities
use the muted variant. Compact-dot-expands-on-hover for tight clusters. Legend
(● Areas with properties / ○ Areas with no listings yet). Footer pill. Low-data
state shows an ochre honest note.

---

### Screen 3 — University Belt drill-down (`discover_city_journey_area_unversity_belt.html`) ★ new

**Purpose:** inside the chosen **University Belt** group, pick a **locality**
(Manipal or Katapadi) before seeing properties. The user should immediately
understand: *"I am inside University Belt. I can choose Manipal or Katapadi, and
Manipal currently has properties available."*

**Right panel** (`max-width: 560px`, scrolls), top → bottom:

1. **Eyebrow row** — `AREA-FIRST` tag (navy-100 pill, `layers` icon, uppercase
   11px / 700) on the left; **Start over** pill pushed right — kept **visually
   secondary** here (transparent background, 1px `--border`, `--text-muted`, ✕
   icon). It resets the journey.
2. **Back to all groups** — the **primary up-navigation**. A pill button:
   `--paper`, 1px `--border-strong`, `--radius-full`, `--shadow-xs`, 13px / 600
   `--text-strong`, with a left-chevron (drawn inline — the Icon set ships
   `chevron-right` only; rotate or use the inline `m15 18-6-6 6-6` path).
   Returns to screen 2.
3. **Serif hero** — *"Choose a locality in University Belt"* (`--font-serif`, 600,
   37px desktop / 27px mobile, `--tracking-tight`, line-height 1.12).
4. **Subheading** — *"Pick a locality around Manipal and nearby areas, then open
   the properties available there."* (16px / `--text-body`, max-width 50ch).
5. **Controls card** — identical to screens 1 & 2: City `Select` + **Buy / Rent**
   segmented control (`--input-bg` track, white active segment with `--shadow-sm`),
   then a helper line ("Showing sale prices in ₹ across these localities." /
   "Showing monthly rents — same properties, reworded for renting.").
6. **Selected-group context card** — the focused drill-down context (NOT a generic
   summary). Structure:
   - Outer: `--radius-lg`, overflow hidden, 1px `--navy-100` border, **`--navy-100`
     background** (tinted to signal "selected").
   - Header row (padding 18px 20px): 46px `--navy-800` filled square avatar with a
     white `layers` icon; then an uppercase **SELECTED GROUP** micro-label
     (`--navy-600`), the title **"University Belt"** (18px / 700 / `--navy-900`),
     and the description *"Academic and student housing around Manipal, with strong
     rental demand and walk-to-campus flats."* (13.5px / `--navy-700`).
   - **Stats strip** on `--paper` (1px `--border` top): two **metrics** —
     **`2` areas** and **`8` properties** (mono 21px / 700; the properties value in
     `--copper-600`), separated by a 1px 30px-tall divider — then **`Central Udupi`
     as a location/context tag pushed right** (a `--surface-subtle` pill with a
     `map-pin` icon, 12px / 600 / `--text-body`). *Central Udupi is a tag, not a
     third metric — do not render it as a large mono number.*
   - In the all-zero state the properties metric reads `0` (not copper).
7. **Section label** — `map-pin` icon + **LOCALITIES IN THIS GROUP** (uppercase
   12px / 700 / `--text-muted`) + right-aligned mono count **"2 localities"**.
   *(Keep this label and the count wording consistent: "Localities in this group" /
   "2 localities".)*
8. **Locality cards** (`LocalityCard`) — two, stacked, 11px gap:
   - **Manipal** (has properties → strong, interactive): `--paper`, 1px `--border`,
     `--radius-lg`, `--shadow-sm`. 44px avatar = `--navy-100` tile with a
     `--navy-800` `map-pin`. Title **Manipal** (16.5px / 700). Right-aligned cue tag
     **"Walk to campus"** (`--surface-subtle` pill). Description *"Academic hub with
     apartments and student-focused rentals."* (13px / `--text-body`). Footer (1px
     `--border` top): left = **`8` properties** (count mono / 700); right = CTA
     **"View properties"** (13.5px / 600) + `arrow-right`.
   - **Katapadi** (zero → muted, **passive/disabled**): the `<button>` carries
     `disabled` + `aria-disabled` so it is non-interactive, `cursor: default`, no
     hover lift. Background `--surface-subtle`, **transparent border**, no shadow,
     opacity 0.9. Avatar = transparent tile with a **1px dashed `--stone-400`**
     border and a `--grey-400` `map-pin`. Title **Katapadi** in `--text-muted`.
     Cue tag **"NH-66 junction"**. Muted description *"No verified properties listed
     here yet."* Footer: left = hollow-dot + **"0 properties"** (`--text-muted`);
     right = a passive **"No listings yet"** pill (`--surface-subtle`, 1px
     `--border`, `--grey-500`). **No CTA, no "Notify me"** — the app has no
     notification/save-search feature, so do not imply one.
9. **All-zero empty state** (only when every locality is 0): an ochre note card
   (`--ochre-50`, 1px `rgba(169,116,28,0.22)`, `--radius-lg`) — *"No verified
   properties in University Belt yet. We add new listings across Udupi every week —
   check back soon, or browse another neighbourhood group."*
10. **Trust strip** — `shield-check` in an `--evergreen-50` tile + *"Every listing
    is verified. Documents checked, RERA registered, broker confirmed — before it
    reaches you."*

**Map (left)** — `UniBeltMap`, CARTO Voyager tiles (`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`), zoom controls bottom-right, fit-bounds to the group's localities:
- **Context breadcrumb pill** top-left: `--paper` rounded-full, `layers` (`--accent`)
  + **"Udupi › University Belt"** (the group you're inside, subtly highlighted).
- **Subtle group-context ring**: a dashed `--copper-500` `L.circle` (weight 1.5,
  opacity 0.5, `dashArray "3 5"`, `fillOpacity 0.05`, ~2.6 km) centered on the
  group — a soft highlight, not a hard region.
- **Manipal marker (8 → strong):** warm paper card pill, copper `map-pin`, name
  (13px / 700), copper count chip (`--accent-tint` bg / `--copper-600`), `--shadow-md`,
  a small rotated tail anchoring it. Hover → `--accent` border + `--shadow-lg` +
  scale 1.05. Selected (clicked) → fills `--navy-800` with white text + scale 1.08.
- **Katapadi marker (0 → muted):** translucent pill, **1px dashed `--stone-400`**,
  hollow `--grey-400` dot, `--grey-400` `0`, ~0.7 opacity, no tail, `cursor: default`.
- **Nearby orientation labels:** faint (opacity 0.5) grey dot + name for Udupi
  City, Udyavara, Brahmavar — recognisable context, never competing, non-interactive.
- **Legend** bottom-left (translucent `--paper`, blur): ● **Areas with properties**
  / ○ **Areas with no listings yet**.
- **Footer pill** bottom-center: **"Showing `8` verified properties in University
  Belt"** (mono count). *(Keep this exact footer.)* In the all-zero state it reads
  *"No properties listed in University Belt yet"* and an ochre note appears.
- **Loading:** map shimmer + "Loading University Belt…" pill; panel shows skeletons.

**Panel ↔ map linking:** hovering Manipal's card highlights its map marker and
vice-versa (shared `hoverLocality` state); selecting it tints the card
(`--accent-tint` + a `0 0 0 3px rgba(176,92,58,0.18)` ring) and fills the marker
navy.

---

## Interactions & Behavior

- **Navigation:** "Back to all groups" → screen 2. Breadcrumb crumbs navigate up.
  "Start over" → resets the journey (back to landing / cleared selection).
  Manipal card / marker click → (next step, out of scope) the listing results for
  Manipal.
- **Buy / Rent:** wording-only — same inventory, mode-aware noun + helper line.
  Does not change counts.
- **City select:** options Udupi / Mangaluru / Kundapura / Karkala (Udupi default).
- **Hover (cards):** `translateY(-2px)`, shadow → `--shadow-lg`, border → `--accent`,
  CTA arrow shifts `+3px` and recolours to `--accent`. Transition
  `.2s cubic-bezier(.4,0,.2,1)`.
- **Selected (cards):** `--accent-tint` background + `0 0 0 3px rgba(176,92,58,0.18)`
  ring + filled navy avatar.
- **Map markers:** hover lifts + raises z-index; selected fills navy. Zero markers
  never respond to hover/click.
- **Loading state:** skeleton shimmer (`@keyframes` sliding gradient, 1.25s) for
  hero, cards, and the context card; map shimmer + spinner pill.
- **Empty / zero-data:** Katapadi-style muted card (passive); all-zero shows the
  ochre note card + map note. Never render zeros as errors.
- **Responsive:** driven by a `compact` boolean in the prototype; in production use
  a `@media (max-width: 900px)` breakpoint with the same two arrangements (split →
  stacked-with-bottom-tabs).
- **Accessibility:** zero-listing cards are real `disabled` buttons; ensure focus
  rings (`--ring` / `--ring-color`), and that the map markers have accessible
  equivalents (the panel cards are the primary interactive path).

---

## State Management

Per the drill-down screen (`UniBelt` component):

| State | Type | Purpose |
|---|---|---|
| `mode` | `"Buy" \| "Rent"` | wording toggle (shared across journey) |
| `city` | string | selected city (shared) |
| `hoverLocality` | `localityId \| null` | links panel card ↔ map marker; also set on click to show the selected treatment |
| `mTab` (mobile) | `"browse" \| "map"` | bottom-tab selection |
| `dataState` | `"normal" \| "low"` | demo data switch (in prod, derived from real counts) |
| `loading` | boolean | demo loading replay (in prod, real fetch status) |

**Data:** no new API. The shape (see `uni-belt-data.js`): a `group`
(`{ id, name, description, cue, areas, properties, center, radiusM }`), an array of
`localities` (`{ id, name, properties, blurb, cue, lat, lon }`), and `nearby`
orientation places. **Data-honesty rules:** `group.areas === localities.length`,
`group.properties === Σ localities[].properties`, and each `properties` count is a
real record count. Manipal carries all 8; Katapadi is a real locality with 0
verified listings (shown muted, never as an error). `data.js` shows the broader
groups→areas→listings model the journey shares.

---

## Design Tokens

All values are CSS custom properties shipped in `tokens/` (entry `tokens/styles.css`
→ `@import`s fonts, colors, typography, spacing, elevation). Reference the semantic
aliases, not the raw primitives.

### Colours

| Token | Hex | Use |
|---|---|---|
| `--background` (`--canvas-100`) | `#F6F5F2` | app background (warm off-white) |
| `--canvas-200` / `--surface-subtle` | `#EEEDE9` | subtle surfaces, chips, muted cards |
| `--paper` | `#FFFFFF` | cards, header, pills |
| `--stone-300` | `#E6E5E0` | skeleton fill |
| `--stone-400` | `#D7D6D0` | dashed hairlines (zero markers/avatars) |
| `--navy-900` | `#0E1626` | preview bar, deepest ink, context-card title |
| `--navy-800` (`--primary`) | `#1B2A45` | brand ink — avatars, active tab, primary buttons |
| `--navy-700` | `#26395B` | navy body text on tint, primary hover |
| `--navy-600` | `#34496E` | "selected group" micro-label |
| `--navy-100` | `#E9ECF2` | navy tint — eyebrow pill, context-card bg, avatar tile |
| `--accent` (`--copper-500`) | `#B05C3A` | THE accent — CTAs, active borders, map pins, ring |
| `--accent-hover` (`--copper-600`) | `#934B2D` | accent hover, live count numbers |
| `--accent-tint` (`--copper-100`) | `#F2E8E1` | selected card bg, count chip bg |
| `--text-strong` (`--grey-900`) | `#111827` | headings, strong text |
| `--text-body` (`--grey-700`) | `#374151` | body copy |
| `--text-muted` (`--grey-500`) | `#6B7280` | muted text, labels |
| `--grey-400` | `#9CA3AF` | zero-state glyphs, breadcrumb chevrons |
| `--grey-50` | `#F9FAFB` | Sign-in hover |
| `--border` | `rgba(17,24,39,0.09)` | hairline borders |
| `--border-strong` | `rgba(17,24,39,0.15)` | input / strong borders |
| `--input-bg` | `#F1F0EC` | select + segmented-control track |
| `--evergreen-600` | `#1F7A5C` | verified / trust |
| `--evergreen-50` | `#E8F2EE` | trust tile bg |
| `--ochre-600` | `#A9741C` | limited-data note text |
| `--ochre-50` | `#F6EFDE` | limited-data note bg |
| Selected ring | `rgba(176,92,58,0.18)` | `0 0 0 3px` accent ring on selected cards |
| Plum (school identity, screen 1) | `#6E4E96` / tint `#F0EAF6` | school journey only |

### Typography

- **Sans:** `--font-sans` = "Plus Jakarta Sans" (UI text, weights 400–800).
- **Serif:** `--font-serif` = "Fraunces" (hero headlines, 600, `--tracking-tight`).
- **Mono:** `--font-mono` = "Geist Mono" (all counts, stat chips, count chips).
- Scale: `--text-xs` 12 · `sm` 14 · `base` 16 · `lg` 18 · `xl` 20 · `2xl` 24 ·
  `3xl` 30 · `4xl` 36 · `5xl` 48 · `6xl` 60 (rem @16px). Hero in prototype ≈ 37px.
- Line-heights: `--leading-tight` 1.15 · `snug` 1.3 · `normal` 1.5 · `relaxed` 1.65.
- Tracking: `--tracking-tight` -0.02em (display) · `--tracking-caps` 0.08em
  (eyebrows/uppercase labels).
- Eyebrows/section labels: 11–12px / 700, uppercase, `--tracking-caps`, `--text-muted`.

### Spacing (4px grid)

`--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 ·
`-12` 48 · `-16` 64 · `-24` 96. Panel padding ≈ 30px 44px desktop / 20px mobile.

### Radii

`--radius-xs` 4 · `--radius-sm` 6 · `--radius-md` 8 (controls) · `--radius-lg` 12
(cards) · `--radius-xl` 16 · `--radius-2xl` 24 · `--radius-full` 9999 (pills, avatars).

### Shadows

`--shadow-xs` `0 1px 2px rgba(17,24,39,.05)` · `--shadow-sm` · `--shadow-md`
`0 4px 10px rgba(17,24,39,.07), 0 2px 4px rgba(17,24,39,.05)` · `--shadow-lg`
`0 12px 28px rgba(17,24,39,.10), 0 4px 10px rgba(17,24,39,.05)` · `--shadow-xl`.

### Motion

`--dur-fast` 120ms · `--dur-normal` 200ms · `--dur-slow` 320ms ·
`--ease-standard` `cubic-bezier(.4,0,.2,1)` · `--ease-out` `cubic-bezier(.16,1,.3,1)`.
Card lift/hover uses `.2s` standard easing; marker transitions `.15s`.

### Control sizes

`--control-sm` 32 · `--control-md` 36 · `--control-lg` 40. Header 60/52px.

---

## Assets

- **Map tiles:** CARTO Voyager raster tiles (OpenStreetMap data) via Leaflet
  1.9.4. Attribution "© OpenStreetMap · © CARTO" is required and shown bottom-left.
  Swap to the codebase's existing map provider if one is standardised.
- **Icons:** Lucide (https://lucide.dev), 1.75–2.2px stroke, round caps, 24px grid.
  Used: `map-pin`, `layers`, `chevron-right`, `chevron-down`, `arrow-right`,
  `shield-check`, `x`. A **left chevron** is needed for "Back to all groups" — the
  bundled subset ships `chevron-right` only, so rotate it or use the inline path
  `m15 18-6-6 6-6`. Prefer `lucide-react` in production. `designs/Icon.jsx` is the
  exact subset used by the prototypes.
- **Fonts:** Plus Jakarta Sans, Fraunces, Geist Mono (load via the codebase's font
  pipeline / Google Fonts).
- **No raster imagery** on these locality-selection screens (listing photos belong
  to the out-of-scope results step).

---

## Files

In `designs/`:

| File | Role |
|---|---|
| `discover_city.html` | Screen 1 — Discover landing (prototype) |
| `discover_city_journey_area_first.html` | Screen 2 — choose an area (prototype) |
| `discover_city_journey_area_unversity_belt.html` | **Screen 3 — University Belt drill-down (prototype)** |
| `DiscoverMap.jsx.txt` / `JourneyPanel.jsx.txt` | Screen 1 map + panel |
| `AreaFirstMap.jsx.txt` / `AreaFirstPanel.jsx.txt` | Screen 2 map + panel |
| `UniBeltMap.jsx.txt` / `UniBeltPanel.jsx.txt` | Screen 3 map + panel |
| `data.js` | shared Udupi groups → areas → listings mock data + honesty rules |
| `uni-belt-data.js` | screen-3 drill-down data (group + localities + nearby) |
| `Icon.jsx.txt` | exact Lucide subset used |
| `ORIGINAL_KIT_README.md` | extra context: original-screen UX critique + reusable patterns |

In `tokens/`:

| File | Role |
|---|---|
| `styles.css` | entry — `@import`s all token files |
| `tokens/fonts.css` `colors.css` `typography.css` `spacing.css` `elevation.css` | the full token set (map these to the codebase's tokens) |

> The prototypes reference a compiled design-system bundle (`_ds_bundle.js`,
> `window.ReTrendsDesignSystem_*`) and tokens via relative paths in the original
> project layout (`../../styles.css`). In implementation, ignore the bundle/CDN
> plumbing and build against the codebase's own components + the tokens above.
>
> **Note on `.jsx.txt`:** the React component sources carry a `.txt` suffix only so
> the host design-system project doesn't double-compile these reference copies
> alongside the live originals. Drop the `.txt` to restore them to `.jsx`. The
> canonical, runnable versions live in the original project at
> `ui_kits/discover/` (`DiscoverMap.jsx`, `AreaFirstPanel.jsx`, `UniBeltMap.jsx`, …).
