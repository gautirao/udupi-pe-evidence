# Area-first discovery — Udupi Property Tracker

A guided, map-first property discovery journey for the ReTrends portal. The user
narrows from the whole city down to a single neighbourhood before ever seeing a
list of homes — so the page answers *“where in Udupi should I start?”* instead of
dumping a flat list of groups.

> **Journey identity:** this is the **area-first** journey. It uses an **ink-navy +
> restrained copper** treatment. It is deliberately *not* the school-first journey
> (plum/lavender + school radius) and *not* the agri-first journey (land/corridor).
> See **“Keeping the three journeys distinct”** below.

```
index.html            → shell: consumer top bar + mounts <UPTAreaDiscovery/>
data.js               → groups, areas, listings (residential only) + helpers
AreaDiscovery.jsx     → main app: the 3 journey states + journey header
Cards.jsx             → GroupCard · AreaCard · ListingCard · EmptyState
Map.jsx               → Leaflet map: group → area → home markers, legend, summary
```

---

## Layout hierarchy

A fixed **50 / 50 split** below the 60px top bar:

- **Left — map.** Always present and always coordinated with the panel. Markers,
  breadcrumb, legend and the “Showing N properties” pill all reflect the current
  selection.
- **Right — guided panel.** A sticky **journey header** (Buy/Rent · title · *By
  area* tag · Start over · helper line) over a scrolling body that swaps between
  three states.

The panel body is the only thing that changes between states; the header and map
frame stay put so the user never loses their place.

---

## The three journey states

| State | Shows | Map |
|---|---|---|
| **A · Landing** | Intro/guidance card (totals) + **neighbourhood group cards** | Group markers (navy pills, home count) |
| **B · Group selected** | Group summary card + **area cards** inside it | Area markers (paper pills, copper pin) |
| **C · Area selected** | Navy area summary band + **two-column property cards** | Home price pins (copper when active) |

**Selecting a group never jumps to listings.** Areas are the mandatory
intermediary step — this is the core of the redesign. A secondary “View all N
homes across {group}” escape hatch exists on the group summary for users who
genuinely want the whole group at once, but areas remain the primary path.

State is mirrored to the URL (`?journey=area-first&groupId=…&areaId=…&mode=rent`)
so shared links restore the exact view.

---

## Card hierarchy

1. **Group card** (landing) — the richest card. Name, subtitle, description,
   location cue pill, an **areas / homes** stat row (homes chip tinted copper),
   a **Best for** cue, and a quiet `Explore group →` CTA. Replaces the old plain
   rows entirely.
2. **Area card** (group selected) — lighter. Copper map-pin avatar, name,
   description, Buy/Rent-aware home count, `View homes →`.
3. **Listing card** (area selected) — the premium two-column property card:
   image, trust badge, optional “New” tag, price (mono), property-type pill,
   title, sublocality, bed/bath/sqft specs, `View details`.

All three use the same interaction motif: white paper, hairline border, rest
shadow → **lift `translateY(-2px)` to a stronger shadow on hover**, CTA arrow
shifts from navy to copper.

### Group card component — props
`{ group, mode, onView: { open(id), hover(id) } }`. Reads
`group.{name,subtitle,blurb,cue,bestFor,areas,homes}`.

### Area card component — props
`{ area, mode, onView: { open(id), hover(id) } }`. Reads
`area.{name,blurb,homes}`. Renders a “No homes yet” badge + muted CTA when
`area.homes === 0`.

---

## Map coordination

The map is a peer to the panel, not decoration:

- **Markers mirror the panel state** 1:1 — groups ↔ group cards, areas ↔ area
  cards, homes ↔ listing cards. Clicking any marker drives the same selection as
  clicking its card.
- **Hover sync** — hovering a listing card sets `activeListing`, which flips that
  home’s price pin to the copper accent. (Group/area hover hooks are wired via
  `onView.hover` for teams whose architecture supports highlighting markers.)
- **Selected style** — selected area/home markers go solid navy / copper; the
  breadcrumb chip (`Udupi › Group › Area`) updates with the copper leaf.
- **Summary pill** — bottom-center “Showing **N** properties” in mono, matching
  the card stat styling. N scopes to the current selection.
- **Legend** is state-aware and minimal: **Neighbourhood groups** on landing,
  **Areas** in a group, **Homes** in an area. *No school or radius legend ever.*

The map flies to the relevant bounds on each selection (`flyToBounds`) so the
markers you’re reading about are the markers in view.

---

## Buy / Rent wording rules

`mode` (`"Buy"` | `"Rent"`) only changes **wording**, never the inventory — the
same homes show under both, reworded. Use the helper, never a vague “listings”:

```js
UPT_AREA_NOUN("Buy", 8)  // "homes for sale"   → "8 homes for sale"
UPT_AREA_NOUN("Rent", 8) // "rentals"           → "8 rentals available"
UPT_AREA_NOUN(mode, 1)   // singular handled    → "home for sale" / "rental"
UPT_AREA_TITLE(mode)     // section heading      → "Homes for sale" / "Rentals"
```

Stat-chip micro-labels follow suit: “for sale” / “to rent”.

---

## Empty / low-data states (`UPTAreaEmptyState`)

Designed, never blank or broken-looking. Dashed card, muted icon, serif title,
plain-English body, recovery actions:

- **Area has zero homes for the mode** → *“No homes listed in {area} yet.”*
  Actions: **Explore nearby areas** · **Switch to Rent/Buy**.
- **Group has zero homes** → group summary hides the “view all” link; area cards
  carry a muted “No homes yet” badge and a `View area` CTA (the area still
  exists, it just has no inventory).
- **Group has no mapped areas** → *“No areas mapped here yet.”* → **Browse other
  groups**.

Copy stays in the ReTrends voice: plain, reassuring, never hypey.

---

## Hover / selected states (quick reference)

- **Cards:** hover → `translateY(-2px)` + `--shadow-md/-lg`, CTA arrow navy→copper.
- **Buy/Rent toggle:** active segment is white paper on the inset track with
  `--shadow-sm`.
- **Map markers:** hover/active scale ~1.06–1.08; selected = solid fill (navy for
  area, copper for home).
- **Copper is reserved** for the single most important accent per view — the
  active CTA, the *By area* tag, the active home pin. Structure stays ink-navy.

---

## Keeping the three journeys distinct

These boundaries are product rules, not just styling:

| | **Area-first** (this kit) | **School-first** | **Agri-first** |
|---|---|---|---|
| Accent | Ink-navy + copper | Plum / lavender | Land / corridor treatment |
| Intermediary | Group → **area** | Zone → area → school | Corridor → parcel |
| Listings | **Residential homes only** | Homes near a school | Agricultural land |
| Special controls | none | **school radius** (5/10 km ring) | land/yield filters |
| Map legend | Areas · Homes | Schools · Homes · radius | parcels / corridor |

**Area-first must not** show agricultural land, school records, or a radius
control — and must not adopt the plum accent. If a buyer wants schools or land,
that is a different journey; switching journeys is an explicit user action.
