# Selected school-zone state — University Belt

A focused redesign of the **school-first** journey *after a zone is selected* in the
Udupi Property Tracker. It turns a sparse two-row panel into a premium, guided
real-estate discovery surface, built on the **ReTrends design system** (ink-navy +
restrained copper + warm off-white) and deliberately moving away from the old heavy
purple. Purple survives only as a *light journey accent* (the school-first tag and
school counts).

Open `index.html`. It loads on **State 1** with `groupId=university-belt` selected.
Click an **area card** or **area pin** → State 2 (Manipal, has homes) or State 3
(Katapadi, no homes). Click **View all homes in this zone** → State 4. **Start over**
returns to State 1.

```
TopNav (product chrome)
└─ ZoneSelected           split: 46% map · 54% panel
   ├─ UPTZMap             Leaflet · soft zone boundary · area pins · area focus ring · price pins
   └─ Panel
      ├─ Journey header   Buy/Rent · "Find homes near a school" · School-first tag · Start over
      ├─ "All school zones" back link
      └─ Body (per state)
         ├─ State 1  Zone landing  ZoneSummaryCard · AreaCard×2 · Popular schools · What to know
         ├─ State 2  Area (homes)  ContextStrip · sort · ListingCard grid (2-col)
         ├─ State 3  Area (empty)  ContextStrip · ZeroListingPanel · school list
         └─ State 4  Zone-wide     ContextStrip · sort · ListingCard grid (all 8)
```

---

## Visual principles

1. **Calm, premium, warm.** White cards on warm off-white, hairline borders, soft
   shadows, generous rhythm. One structural accent — copper — for the single most
   important CTA and selected map state. No gradients, no purple washes.
2. **Guided, never listy.** Every state opens with a strong summary that tells the
   user *where they are* (zone → area → homes) before showing options. No blank panel.
3. **School-first as a light accent.** A muted lavender (`#5B4FA0` on `#EFEDF8`) marks
   only what's about *schools* — the journey tag and the "N schools" pills — so the
   journey reads clearly without becoming a purple UI.
4. **Numbers are data.** Prices, counts and areas use Geist Mono.
5. **Trust stays visible.** Every listing keeps the ReTrends Verified / Trusted /
   Listed badge.

## Layout hierarchy

- **Split preserved:** map left (46%), panel right. Panel = sticky journey header +
  scrolling body. 28px horizontal padding; 22–30px between sections; 12px between
  stacked cards; section eyebrows 14px above content.
- **Radii:** controls 8px, cards 12px (`--radius-lg`), hero/summary & empty state
  16px (`--radius-xl`), pills full.
- **Elevation:** cards rest at `--shadow-xs/sm`, lift `translateY(-2px)` to
  `--shadow-md/lg` on hover — the system's signature motif.

## Zone summary card guidance

The hero of State 1. An **ink-navy band** (the brand's "area header" treatment) with:

- A 3px top hairline that fades lavender→copper — the only place the two accents meet.
- Eyebrow `SCHOOL ZONE` + a `School-first` chip (lavender dot).
- Serif title **University Belt**, subtitle *Academic and student housing*, and a
  plain-English description.
- Three mono metric tiles — **16 schools · 8 for sale · 2 areas** (the middle label
  flips to "to rent" under Rent).
- "Best for" chips (parents near a campus / student-let investors / walk-to-college).
- A single **copper** CTA: *View all 8 homes in this zone* → State 4. Show the CTA
  only when the zone has listings.

## Area card guidance

White cards, hover-lift, whole card is the hit target.

- Pin avatar (navy tint when homes exist, neutral when empty), area name, one-line
  description, then a stat row: a **lavender "N schools" pill** + a **copper "N homes"
  pill**.
- **Has homes** → CTA "View homes →" (copper on hover) → State 2.
- **No homes** → the homes pill becomes a neutral "No homes yet", CTA becomes
  "Explore schools →" → State 3. Still feels useful, never broken.

## Selected-area state (State 2)

- **ContextStrip** anchors results: crumb *University Belt*, serif area title, the
  area blurb, and the schools/homes pills — with a one-tap **Back to University Belt**.
- A sort control (Recommended / price / newest) appears only because the app already
  sorts; no invented filters.
- Homes render in the **two-column premium ListingCard** grid. Hovering a card
  activates its copper price pin on the map.

## Zero-listing area state (State 3)

Never a dead end. The ContextStrip still summarises the area (schools pill + "No
homes yet"), then a polished panel:

- Friendly serif headline *No homes listed in {area} yet* and a plain explanation
  that names the school count and frames it as an *emerging pocket*.
- Recovery actions: **View all University Belt homes** (primary), **Try Manipal**
  (outline), **Save this area** (heart → "We'll alert you"), **Start over**.
- Below it, the area's **schools are still listed** as rows, so the visit pays off.

## Zone-wide listings (State 4)

- ContextStrip becomes a compact **zone strip**: crumb *School zone*, title *All
  University Belt homes*, "2 areas · 16 schools nearby", schools/homes pills, and
  **Back to zone overview**.
- Same sort affordance, then all 8 homes in the two-column grid.

## Map coordination notes

- The selected zone is always drawn as a **soft dashed navy boundary** with a faint
  fill, so the panel and map agree on scope.
- **State 1:** area pins (name + lavender school count + home count) sit inside the
  boundary; no home pins yet. Map fits the zone bounds.
- **State 2 / 3:** the chosen area gets a **copper focus ring**, its pin highlights to
  navy, the other area dims to 55%. Home pins (price, mono) drop for areas that have
  them; the map flies to the area bounds. Clicking any area pin re-selects it.
- **State 4:** all home pins show across the zone with both area pins subdued.
- Zoom/pan controls stay bottom-right; legend bottom-left adapts (Areas / Homes /
  Zone). Selection is fully synced both directions (panel ↔ map).

## React / Tailwind / shadcn implementation notes

**Tokens.** Map the ReTrends CSS variables (`tokens/*.css`) into your Tailwind
`@theme`: `--color-primary: var(--navy-800)`, `--color-accent: var(--copper-500)`,
`--background`, `--border`, radii, shadows. Keep Geist Mono as `font-mono` for every
price/count. Add one journey token, e.g. `--color-journey: #5B4FA0` /
`--color-journey-tint: #EFEDF8`, and use it *only* for school-first cues.

**Layout.** `grid grid-cols-[46%_1fr] h-[calc(100dvh-3.75rem)]`. Right column =
`flex flex-col` with a sticky header and a scrolling body. Collapse to a stacked
layout with a map/list toggle under `lg`.

**State & routing.** Drive everything off the URL, extending the existing pattern:
`?journey=school-first&groupId=university-belt` (State 1), `&areaId=manipal`
(State 2/3), `&view=all` (State 4). A small reducer maps `{view, areaId}` to both the
panel branch and the map's `flyTo`/`flyToBounds` + ring.

**Components (shadcn).**
- `ZoneSummaryCard` → `Card` with a navy surface variant; metric tiles as a 3-col grid.
- `AreaCard` → `Card` + `hover:-translate-y-0.5 hover:shadow-md`; the two pills are
  `Badge` variants (`journey` tint + `accent` tint, plus a `muted` "No homes yet").
- `ContextStrip` → `Card` + breadcrumb + `Select` (shadcn) for sort.
- `ZeroListingPanel` → `Card` with a centred empty layout and a `Button` cluster;
  reuse the school `Row` beneath it.
- `ListingCard` → existing premium card (image + `TrustBadge` + save `heart` + frosted
  proximity caption, mono price, specs, full-width "View details").
- Buy/Rent → shadcn `ToggleGroup` styled as a pill.

**Map.** `react-leaflet` + CARTO Voyager tiles. Render pins as `L.divIcon` from a
React-rendered HTML string so markers reuse the tokens. Zone boundary =
`Rectangle`/`Polygon` from `zone.bounds`; area focus = `Circle` in copper.

**Data shape.** See `data.js`:
`zone {id,name,subtitle,blurb,bestFor[],schools,listings,areasCount,center,bounds}`,
`areas[] {id,name,blurb,schools,listings,center,bounds}`,
`schools[] {id,name,type,area,students,lat,lon}`,
`listings[] {id,title,locality,area,price,beds,baths,sqft,propType,trustTier,image,walk,postedDays,lat,lon}`.
Area homes = `listings.filter(l => l.area === area.name)`; zero-state when empty;
zone-wide = all listings.

**Motion.** 120ms hovers, 200ms card transitions, 320ms photo zoom / map fly;
`cubic-bezier(.4,0,.2,1)`. No infinite/bouncy animation.

**Scope.** This covers the school-first **selected-zone/group** state only — the
all-zones browse, listing detail, saved searches and the broker side are out of scope.
