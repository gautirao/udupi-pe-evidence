# Agri journey — upgrade audit note

The agricultural journey inside the unified Discover portal now matches the spatial UX
of the old `ui_kits/agri-discovery` kit — direction-first browsing, distance-band
catchment, an expanding map wedge, and grouped towns — all inside the **same one shell**
(top bar, 50/50 map + panel, Buy/Rent, Start over, breadcrumb). Area and school journeys
were not touched.

## 1 · What was reused from `ui_kits/agri-discovery`

- **Direction-first model** — four compass corridors (`N towards Doddaballapur`,
  `E towards Hoskote & Kolar`, `S towards Kanakapura`, `W towards Magadi & Ramanagara`),
  exactly the N/E/S/W pattern of the old kit's `corridor-data.js`.
- **Distance chips** — `Within 10 / Up to 25 / Up to 50 / Up to 100 km`, active chip =
  evergreen fill + check, others outline (the old kit's treatment).
- **Map region boundary** — the corridor **wedge polygon** (evergreen dashed stroke,
  ~8% fill) drawn from the city centre out along the bearing, from the old kit's
  region-polygon idea.
- **High-contrast town markers** — white-haloed evergreen gradient disc (`#2E9B74 →
  #1C5B43`, 3px white ring, bold mono white count) with a name chip below
  (`Kanakapura · 2 agri`) mirroring the panel — the exact fix the old README describes
  for "invisible" green-on-green markers.
- **Count + acreage summary band** — the evergreen result band (big mono parcel count,
  "grouped into N towns", total acres) from the old grouped-result state.
- **Evergreen visual system** and a **state-aware legend** (boundary + group markers).

## 2 · How distance expansion works

`maxKm` is portal state (URL `&maxKm=`). Choosing a chip:

- redraws the map **wedge to that radius** (`BLR_WEDGE(city, bearing, half, maxKm)` — a
  fan of arc points from the city centre), so a bigger band = a visibly bigger boundary;
- recomputes the panel: `dirProps / dirGroups / dirAcres(corridor, maxKm)` update the
  summary band and header stats live;
- filters which town discs appear on the map and which town cards appear in the panel.

Verified: East at 25 km shows a small wedge and **0 towns** (nearest town Hoskote is
28 km out); widening to 50/100 km grows the wedge and pulls in more towns.

## 3 · How towns/groups are derived per distance

Each town carries a straight-line `distKm` from the city centre. For a corridor at band
`maxKm`, visible towns = `townsOf(dir).filter(distKm <= maxKm)`. Smaller band → fewer
towns; larger → more. "Includes properties at closer distances too" — bands are
cumulative (≤ maxKm), matching the old kit's helper copy.

## 4 · How map overlay and panel stay in sync

Both are views of `(corridorId, maxKm, clusterId)`:

- **Direction selected** → map draws the wedge + a town disc per *visible* town; panel
  lists a town card per *visible* town. Same set, 1:1.
- Clicking a town disc === clicking its town card (`pickCluster`).
- **Town selected** → map zooms to the town, shows parcel pins (acre labels), keeps a
  faint wedge for context; panel shows the matching parcel cards.
- Breadcrumb chip on the map mirrors the panel (`Bangalore › Agri land › S ›
  Kanakapura`). The "Showing N parcels" pill counts the visible parcels.

## 5 · Agri clickable actions checked

- Agricultural-land card (neutral landing) → `?journey=agri` (direction bubbles).
- Direction card **and** direction map bubble → same `pickCorridor` (direction selected).
- Distance chips → update wedge extent + panel counts + visible towns.
- Town card **and** town map disc → same `pickCluster` (parcels).
- Back from parcels → direction (towns) · back from direction → agri landing · back from
  landing → neutral Discover. Start over → neutral landing.
- Agri filters (land size, price, road access, water, soil) update parcel cards + count.
- Buy/Rent persists; wording adapts ("parcels for sale" / "leases") without implying a
  residential filter.

## 6 · Separation from residential (unchanged, re-verified)

Agri is its own model (`data.agri`: corridors → clusters(towns) → parcels) and its own
counts (`BLR_AGRI`). It never enters region property counts, the area journey, or the
school journey; its map layers are evergreen-only (no schools, no residential groups, no
home price pins). Opening agri from a residential region **clears the residential scope**
and shows all corridors.

## 7 · URL / state examples (all round-trip; invalid ids fall back)

- `?journey=agri` — agri landing (direction bubbles)
- `?journey=agri&corridorId=s-kanakapura` — direction selected (default 100 km)
- `?journey=agri&corridorId=s-kanakapura&maxKm=50` — direction + distance band
- `?journey=agri&corridorId=s-kanakapura&maxKm=100&clusterId=t-kanakapura` — town + parcels

A town id beyond the current band auto-raises `maxKm` to include it; unknown
corridor/cluster ids drop to the nearest valid agri level.

## Deliverable states (open these)

1. Agri landing — `?journey=agri`
2. Direction selected — `?journey=agri&corridorId=s-kanakapura`
3. Distance changed — `?journey=agri&corridorId=e-hoskote&maxKm=25` (vs `&maxKm=100`)
4. Town/group selected — `?journey=agri&corridorId=s-kanakapura&clusterId=t-kanakapura`
5. Filtered agri result — town state with land-size/price/water filters applied

## Files touched (agri only)

`src/data.js` (agri model + `BLR_AGRI` + `BLR_WEDGE`), `src/components/shared.jsx`
(`DPDistanceChips`, agri filters + price, wedge helper), `src/components/cards.jsx`
(direction / town / parcel cards), `src/PortalMap.jsx` (wedge overlay + direction
bubbles + town discs), `src/DiscoverPanel.jsx` (agri panel states), `src/DiscoverPortal.jsx`
(`maxKm` state + URL). No area/school code changed.
