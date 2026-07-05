# Agricultural-land discovery — design notes

A polished, premium redesign of the Udupi Property Tracker **agricultural** journey,
in the **grouped agri-region result** state: the user is in *Agricultural land*, has
picked **E towards Manipal**, is viewing **Up to 100 km**, and sees **4 agri
properties** grouped into **Agumbe** and **Manipal**. Built on the **ReTrends design
system** (ink-navy + restrained copper + warm off-white), with **evergreen** as the
earthy *agricultural* journey accent — the same family as the system's
verified/positive hue, so it reads regional and credible rather than decorative.

Open `index.html`. Design-only: no backend features, prices, photos, owner, soil,
water, crop, road or demand data are introduced. Every number on screen is real or a
simple roll-up of the two visible group rows.

---

## What was wrong, and what changed

**The headline problem — invisible map markers.** The live page renders group counts
as a faint "4" lost against the green Ghats forest. The redesign replaces them with a
**high-contrast cluster marker**:

- A **white-haloed evergreen disc** (gradient `#2E9B74 → #1C5B43`, 3px white ring,
  soft drop shadow) so it separates cleanly from any green/forest tile underneath.
- The **count is bold mono white** (`Geist Mono`, 19–22px) — unambiguous and legible.
- A small **sprout identity badge** ties the marker to the agricultural journey.
- A **name chip beneath** (`Agumbe · 2 agri`) mirrors the panel row, so map and panel
  are one synced surface. Selecting a group enlarges + brightens its marker.

**Region boundary.** Kept but calmed: an evergreen dashed stroke (`#1F7A5C`, 2px,
fine dash) with a 6%-opacity fill — visible framing without competing with markers.

**Right panel — a guided result state, not a raw table.** Top-to-bottom hierarchy now
answers the five questions in order:

1. **Journey identity** (sticky header) — Buy/Rent toggle, *Agricultural land* title
   (Fraunces) + *Land journey* tag, Start over, close (X).
2. **Selected group summary** — sprout avatar, **E towards Manipal**, mono *Up to 100
   km · Direction E*, **Filters** button, clear (X).
3. **Distance chips** — *Within 10 / Up to 25 / Up to 50 / Up to 100 km*. The active
   chip is now an unmistakable **evergreen fill with a check**, the rest are calm
   outline pills. Helper line preserved verbatim.
4. **Results summary** — a calm evergreen-tint band with a large mono **4**, "Agri
   properties for sale · grouped into 2 areas", and a derived **116.28 acres total**.
5. **Group rows** — Agumbe and Manipal as **selectable cards** (hover lift +2px,
   selection rail + tint, chevron affordance) with mono acres + property tiles.

A calm guidance strip at the bottom absorbs the previous dead whitespace without
inventing data.

---

## Map ↔ panel coordination

- **48 / 52 split** — map stays a true half, never dominated by the panel.
- **Top-left breadcrumb** (`Udupi › 🌱 E towards Manipal`) mirrors the panel.
- **City selector**, **zoom controls** (bottom-right), **attribution** (bottom-left),
  and a polished **"Showing 24 properties"** pill (bottom-centre) are all preserved.
- **State-aware legend** (bottom-left) shows only existing layers: *Agri region
  boundary* and *Property group · count* — no invented map layers.
- Selecting a group card `flyTo`s its marker and highlights it; selecting again clears.

---

## Implementation handoff

**Tokens / accent.** Map ReTrends CSS vars to your Tailwind `@theme` as usual. Add the
**agri accent** as its own small scale and use it *only* for the agricultural journey:

```
--agri-700: #1C5B43   /* deep — marker base, big numerals */
--agri-600: #1F7A5C   /* mid  — chips, accents (== evergreen-600) */
--agri-500: #2E9B74   /* bright — marker gradient top */
--agri-100: #CFE5D8   /* hairline on tint */
--agri-tint:#EAF3EF   /* result band / selected card fill */
```

**Marker / cluster styling.** Render as `L.divIcon` from an HTML string so it reuses
tokens. Disc 48px (56px selected), 3px white border, evergreen gradient, layered soft
shadow, plus an outer translucent halo for separation from busy tiles. Count =
`font-mono 800` white. Sprout badge top-right. Name chip below = white pill,
`shadow-sm`, mirrors the panel. **Hard-code the marker's hex values** (don't rely on
`var()` inside SVG presentation attributes). Boundary = `L.polygon`, evergreen dashed
stroke + ~6% fill.

**Right panel.** `flex flex-col`, sticky header + scrolling body, content capped at
~760px. Cards: white, `--radius-lg/xl`, hairline border, `--shadow-sm`, hover
`-translate-y-0.5 → shadow-md`. Active distance chip = `--agri-600` fill; result band
= `--agri-tint`. All counts/areas in `font-mono`.

**Components to reuse from the DS.** `Icon` (map-pin, chevron-right/down, check,
sliders-horizontal, x, route, building, layers, plus, calendar, message-circle),
`Button`/`Badge` for the Filters/Start-over controls and tags, and the existing
**TopNav** chrome (shared 1:1 with `school-discovery`). Buy/Rent → a shadcn
`ToggleGroup` styled as a pill. Group cards → `Card` + hover lift.

**Motion.** 120ms hovers, 200ms card transitions, 700ms map fly; standard ease. No
infinite/bouncy animation.

---

## No new data requirements

Nothing here needs a new backend field. The two groups (Agumbe 70.85 ac / 2 props,
Manipal 45.43 ac / 2 props), the **4**-property summary, the **116.28-acre** total
(a sum of the two rows), the **2**-group count, the **24**-property map indicator, the
region polygon, distance chips, and Buy/Rent are all already present on the current
page. No price, photo, owner, soil, water, crop, school or demand-score data is
introduced, and the state remains the grouped agri-region result view — not a
listing-card page.
