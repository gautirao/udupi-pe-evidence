# Discovery entry — Udupi Property Tracker

The **public, first-touch landing** for the Udupi portal: a calm, trust-led page
whose single job is to help a first-time visitor **choose how they want to
search**. It sits *in front of* the deeper journeys (see `ui_kits/area-discovery/`)
— pick a journey here, then drop into that journey's flow.

```
discover_city.html → shell: public header + Preview switcher + responsive split
data.js           → Udupi groups/areas/listings (shared with area-discovery)
DiscoverMap.jsx   → Leaflet map: aggregated GROUP markers + low-data/empty + loading
JourneyPanel.jsx  → editorial hero, City + Buy/Rent controls, 3 journey cards, trust strip
```

Open it and use the dark **Preview** bar (demo chrome only — not part of the
product) to switch **Desktop / Mobile**, **Normal / Low-data** map, and **Replay
loading**.

---

## UX critique of the original screen

What the old Discover page got wrong, and how this redesign answers it:

| # | Problem in the original | Fix here |
|---|---|---|
| 1 | **Looked like an admin dashboard** — header carried Dashboard, My Listings, New Listing, Bookings, Listing Quality, a `99+` bell and a `TE` avatar. None of that belongs on a public first-visit page. | Public marketing header: wordmark + **Discover / Trends / Saved** + **Sign in**. Broker tooling removed. |
| 2 | **Right panel was mostly empty** with weak hierarchy — a lone "Find properties your way" floating over a void. | Editorial column: eyebrow → **serif hero** → value line → controls → three journeys → **trust strip**. The space now carries a story. |
| 3 | **Three journeys were near-identical thin rows** — same weight, tiny tinted icons, no explanation, no real CTA. | Three **distinct cards**, each with its own identity colour, a clear "what you get" line, **mono stat chips**, and an explicit CTA. One is marked **Recommended** to create a primary path. |
| 4 | **Map was a wall of "0 properties"** — overlapping pins, `[TEST]` areas, demoralising emptiness competing with the panel. | Map shows **aggregated neighbourhood-group markers** (non-zero counts) by default, so the city reads as full and legible. The messy per-area zeros only appear in the **low-data state**, handled gracefully (below). |
| 5 | **Buy/Rent toggle felt incidental** — tucked top-right, unclear what it changed. | Toggle lives **inside the controls card** with a live helper line ("Showing sale prices in ₹" / "Showing monthly rents") so its effect is explicit. |
| 6 | **City selector duplicated** the "Udupi" map pill and floated awkwardly. | One City `select` in the controls card; the map keeps a single **"Udupi" breadcrumb** pill. No duplication. |
| 7 | **No trust framing** — ReTrends' whole identity is verification, absent here. | A **shield-check trust strip** closes the panel: "Every listing is verified — documents checked, RERA registered." |
| 8 | **No mobile story.** | Genuine compact layout: journey panel first, **Browse / Map bottom tabs**, map on demand. |

---

## Suggested copy

- **Eyebrow:** `DISCOVER UDUPI`
- **Hero (serif):** *“Find your place in Udupi, your way.”*
- **Lead:** *“Browse verified properties across coastal Karnataka. Pick how you'd like to start — by neighbourhood, by school, or by farmland.”*
- **Buy/Rent helper:** Buy → *“Showing sale prices in ₹ across every journey.”* · Rent → *“Showing monthly rents — same properties, reworded for renting.”*

**Journey cards**

| Journey | Title | Stat chips | CTA |
|---|---|---|---|
| Area (primary) | **Explore by area** | `10 areas` · `30 properties` · `Locality insights` | `Explore areas →` |
| School | **Search near a school** | `5 or 10 km radius` · `Homes near schools` | `Find homes near schools →` |
| Agri | **Find agricultural land** | `By corridor & direction` · `Farmland only` | `Search farmland →` |

- **Trust strip:** *“**Every listing is verified.** Documents checked, RERA registered, broker confirmed — before it reaches you.”*

All copy is **sentence case**, plain and reassuring, no hype — per the ReTrends
content fundamentals. Counts are **real** (`10 areas · 30 properties`, derived from
`data.js`); nothing is invented. **Terminology** follows the platform:
“**properties**” / “listings” at the global and area level (the catalogue also
holds land), “homes” only where a journey is clearly residential (school-first),
and “**farmland / agricultural land**” for the agri journey. School/agri use
qualitative chips (`5 or 10 km radius`, `By corridor & direction`) rather than
fake numbers.

---

## Journey identity system (keep the three distinct)

Each journey owns one colour so it stays recognisable from this entry page all
the way into its own flow:

| Journey | Avatar / border accent | Tint | CTA style |
|---|---|---|---|
| **Area** | ink-navy `--navy-800` | `--navy-100` | **Solid copper button** (the one primary action) |
| **School** | plum `#6E4E96` | `#F0EAF6` | ghost text + arrow |
| **Agri** | evergreen `--evergreen-600` | `--evergreen-50` | ghost text + arrow |

**Copper stays reserved** for the single most important accent per view: the
*Recommended* tag and the primary **Start exploring** button. Identity colours
(navy/plum/evergreen) are used only for avatars, borders and selected rings — so
copper never loses its meaning.

### Card states
- **Rest:** white paper, hairline border, `--shadow-sm`.
- **Hover:** `translateY(-2px)` → `--shadow-lg`, border tints to the journey
  accent, CTA arrow shifts `+3px` and recolours to the accent.
- **Selected:** accent border + a `0 0 0 3px` accent ring, faint accent tint
  background, filled avatar, a check badge.

This is the same lift-and-tint motif the rest of the design system uses.

---

## Map treatment (individual localities)

The map shows **recognisable Udupi localities** — Malpe, Manipal, Brahmavar, Kaup,
Saligrama, Shirva, Padubidri, Hejamadi … — not abstract neighbourhood groups. Each
marker is a **premium warm-card pill**: a copper map-pin, the **locality name**
(primary), and a **count chip** (“5 properties”, mono, copper-tinted). It carries the
ReTrends card language onto the map instead of floating raw labels.

- **Non-zero localities** read strong: white paper, hairline border, `--shadow-md`,
  a copper count chip, and a small tail anchoring them to the point.
- **Zero localities** drop to a **quiet muted variant** — translucent, dashed
  hairline, grey text, hollow dot, `0 properties`, ~0.66 opacity, no tail. Present and
  honest, never alarming. `[TEST]` placeholders never reach this public view.
- **Avoiding overlap:** non-zero localities that sit close together (the Car
  Street / Brahmagiri / Kunjibettu cluster) collapse to a **compact count dot** at
  rest and **expand to the full card on hover** — so nothing overlaps until you
  reach for it.
- **Hover / selected:** any marker lifts (`scale` + `--shadow-lg`) and rises above
  its neighbours on hover; a selected locality fills **ink-navy** with white text.
- **Footer pill:** *Showing **30** verified properties across Udupi* (mono count,
  recomputed per state).
- **Legend** explains the markers, not regions: **● Areas with properties** /
  **○ Areas with no listings yet**.
- **Low-data state:** simulates an emerging market — most localities muted at
  `0 properties`, a couple live — with an ochre note: *“14 areas have no listings
  yet — we add more across Udupi weekly.”* and the footer recomputed to the homes
  actually shown. This is the graceful answer to the original “wall of 0s.”
- **Loading:** map shimmer + “Loading the Udupi map…” pill; panel shows skeletons.

Uses the existing **area-count marker data already in the app** (`data.js`
`areas[]` + their home counts) — no new API. `UPT_EMPTY_AREAS` in `DiscoverMap.jsx`
is the demo-only catalogue of not-yet-listed localities.

---

## Implementation notes (UPE / shadcn + existing tokens)

- **No new components, no new backend.** Everything maps to what you already ship:
  - Header → existing shell + shadcn `Button` (outline) for *Sign in*.
  - City selector → shadcn `Select`. Buy/Rent → a 2-segment `Tabs`/segmented
    control (the inset-track + white active segment pattern already in the kit).
  - Journey cards → `Card` + `Button`; the identity colour + ring are inline
    style on existing tokens (`--navy-800`, `--evergreen-600`, plum literal,
    `--accent`).
  - Icons → Lucide (`layers`, `graduation-cap`, `sprout`, `shield-check`,
    `arrow-right`, `map-pin`, `chevron-down`). The three journey glyphs are drawn
    inline here because the bundled `Icon` subset doesn't ship them yet — add
    `graduation-cap` + `sprout` to `components/Icon.jsx` to use `Icon` directly.
  - Map → existing Leaflet + CARTO Voyager setup; markers are `divIcon` HTML, same
    as `area-discovery`.
- **Tokens only** — every colour, radius, shadow, font and duration is a CSS var
  from `styles.css`. No magic values except the plum identity literal.
- **State → URL** (recommended for production): mirror `mode` and the chosen
  journey to the query string (`?city=udupi&mode=buy&journey=area`) so the entry
  selection carries into the journey flow and shared links restore it.
- **Responsive** is driven by a `compact` prop (not CSS media queries) so the
  layout is deterministic inside the framed mobile preview; in production swap to
  a `@media (max-width: 900px)` breakpoint with the same two arrangements.

---

## Reusable patterns for the area-/school-/agri-first journeys

Lift these straight out of here so the journeys stay a family:

1. **`JourneyCard`** — identity-coloured avatar + title + description + mono stat
   chips + arrow CTA, with the rest/hover/selected recipe above. Reuse for any
   "pick one of N" choice (zones, corridors, school sets).
2. **Editorial panel header** — eyebrow → serif hero → lead → controls card →
   live helper line. The standard top of every journey's right rail.
3. **Trust strip** — shield-check + one verification sentence. Belongs at the foot
   of every public surface.
4. **Locality count marker** — the premium warm-card pill (name + copper count
   chip + tail), its muted zero variant, and the compact-dot-expands-on-hover
   collision pattern. Reuse for any locality/area count on a map.
5. **Mono stat chip** (`Chip`) — the `5 or 10 km radius` / `30 properties` pill, in
   Geist Mono, for any factual count or qualifier.
