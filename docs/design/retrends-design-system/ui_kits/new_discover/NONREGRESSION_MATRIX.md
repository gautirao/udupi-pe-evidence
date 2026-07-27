# Discover — existing product → candidate non-regression matrix

**Existing product = `ui_kits/new_discover/index.html`** (`src/NewDiscover.jsx`, `src/NDPanel.jsx`, `src/NDMap.jsx`, `src/data.js`, `src/geo.js`, `src/components/{shared,cards}.jsx`).
**Candidate = `ui_kits/new_discover/experience.html`** (`src/Experience.jsx`, `ExpPanel.jsx`, `ExpMap.jsx`, `ExpModeBar.jsx`, `ExpSchools.jsx`, `ExpAgri.jsx`, `exp-data.js`, `exp-journeys.js`).
Reference for the older portal: `ui_kits/discover/index.html`.

Governing rule:

```
existing Discover product
+ improved directional Areas navigation
+ new multi-area / result-scope / recovery / alert features
= experience.html
```

## Main shell

| Existing capability | Source | Candidate before this pass | Verdict | Action |
|---|---|---|---|---|
| Journey (mode) selector — Areas · Schools · Agricultural, mutually exclusive, check-marked selection, "Rec" badge | `NDPanel.Setup` → `ModeCard` | **absent** (Areas only) | MISSING | **Restored** as `ExpModeBar` → `MBModeCard`: same tokens, tints (`--accent` / `--plum-600` / `--evergreen-600`), tint backgrounds, check badge, Rec badge — evolved to one compact horizontal row so it never eats the panel |
| Selected-journey state | `mode` in `NewDiscover` | absent | MISSING | `st.journey`; card filled + top-nav badge follows |
| Journey switching keeps context | `setMode` (areas ⇄ schools keep the area; agri carries the area in as origin) | absent | MISSING | `act.setJourney` — each journey owns its state; Areas↔Schools carry the selected area, Agri inherits it as origin |
| City switcher (Bangalore live; Mumbai / Pune / Hyderabad "Soon") | `NDPanel.CityPill` | static "Bangalore" text | CHANGED | **Restored** verbatim in behaviour: popover, live/Soon states, check mark |
| Buy / Rent segment | `NDPanel.BuyRentSeg` | present (`filters.purpose`) | PRESERVED | same control, now shared by all three journeys (agri copy reads it too) |
| Journey-aware direct search | `NDPanel.AreaSearch` (Open area / View schools / Use as origin) | area-only autocomplete | CHANGED | **Restored + extended**: Areas → Open area, Schools → school **names** *and* areas, Agri → Use as origin; keyboard nav preserved |
| Capability cues strip | `NDPanel.CapabilityCues` | absent | MISSING | **Restored** as `MBCues`, shown at journey roots only (density) |
| Browse all listings | `NewDiscover.browseAll` (`browse` level) | absent | MISSING | **Restored** as a `CITY` result scope: city-wide filterable list, own heading, Draw search area + Create alert still available |
| Summary metadata / stats | `NavHeader` stat, map summary chip | heading + stat | PRESERVED | merged into the single result header (density rule 3) |
| Breadcrumbs | `NDMap` crumb | present | PRESERVED | now journey-aware: `Bangalore › …`, `Bangalore › Schools › …`, `Bangalore › Agri land › …`; segments clickable |
| Map ↔ panel hover/selection sync | `NDMap` + rows | present | PRESERVED | extended to school rows↔pins and town/parcel markers |
| Mobile (bottom sheet, List/Map) | `isMobile` branch | present | PRESERVED | journey cards, Schools and Agri all reachable at 390×844 |
| URL-restorable state | hash serialisation in `NewDiscover` | history-snapshot model | CHANGED | Browser Back/Forward over committed states (incl. journey, sch, ag) is preserved; the hash deep-link format is not reproduced — noted as a gap below |

## Areas journey

| Existing capability | Verdict | Note |
|---|---|---|
| Region → generated directional cluster → area (`ND.partition`, recursive) | SUPERSEDED | Replaced by the approved shallow hierarchy City → Direction → Local destination → Area. Fewer levels, real bearings, counts computed only over areas *with matches*. |
| Area listings state | PRESERVED | AREA_SET result scope |
| Search within the area's listings (`PropSearch`) | PRESERVED | area search row |
| Filter toolbar (type · beds · verified) | PRESERVED | `EPFilters` (type · beds · budget · ready · verified) |
| Listing cards (`DPListingCard`) | PRESERVED | same component |
| Listing markers + pixel clustering | PRESERVED | same grammar |
| Schools shortcut from the area (`SchoolsShortcut`) | PRESERVED | "Schools in Hebbal · keeps this area" → Schools journey scoped to Hebbal |
| Nearby-area scope building | IMPROVED | "**Add nearby areas**" (not a comparison table): one `Add` per card, `N of 3 selected`, fourth add prevented, draft anchored on the selected area with candidates as subtle dashed labels, committed only by **Show N listings** |
| Trust strip | SUPERSEDED | The verified-listing reassurance now rides on the listing cards' trust tiers; the standalone strip is dropped for density |
| Browse-all listings state | PRESERVED | see CITY scope above |
| Back per level | PRESERVED | in-app hierarchy Back + browser history |
| Property detail / Back to results | PRESERVED (candidate feature) | scope, filters, camera, list position restored |

## Schools journey

| Existing capability | Verdict | Note |
|---|---|---|
| Dedicated Schools mode sharing the residential path | RESTORED | `st.sch` with its own nodeKey/areaKey; nav counted in **schools** |
| Areas-with-schools rows, school-count metadata | PRESERVED | `SJNavRow` (plum) |
| Retain the selected area when entered from an area | PRESERVED | kept-area chip + "Back to properties in Hebbal" |
| School-name search | PRESERVED | in-area search **plus** city-wide search in the control bar |
| Board filters (multi-select, only boards present) | PRESERVED | All/CBSE/ICSE/State/IB chips |
| Level filters (multi-select, only levels present) | PRESERVED | Primary / Secondary / Higher Secondary |
| School markers on the map, filtered live | PRESERVED | plum pins, rebuilt on filter change |
| Row ↔ pin hover sync | PRESERVED | class toggle, no marker rebuild |
| View homes per school | PRESERVED | row action |
| Selected-school state | PRESERVED | summary + honest "school-radius, not every home in the area" note |
| 3 / 5 / 10 km radius (`DPRadius`) | PRESERVED | the real component, all three distances, dashed plum ring on the map |
| Distance-sorted homes with distance chips | PRESERVED | `distanceKm` passed to the listing card |
| Empty state + clear school filters | PRESERVED | `DPEmpty` (plum) |
| The area's own listings shown *below* the school list | SUPERSEDED | Density rule: the Schools browser and a full property grid are never expanded at once. "Back to properties in Hebbal" is one click. |

## Agricultural journey

| Existing capability | Verdict | Note |
|---|---|---|
| Agri mode as a first-class journey | RESTORED | third journey card, evergreen throughout |
| Origin model — Bangalore centre, or the area you came from | PRESERVED | `st.ag.originKey`; origin bar + "Use Bangalore centre"; Areas→Agri carries the area |
| Outbound corridors with origin-relative direction + distance range | PRESERVED | `DPCorridorCard` with `origin`, real `BLR_AGRI` counts |
| Directional search sector on the map + cumulative distance bands | PRESERVED | wedge re-implemented as `EXJ.wedge` (dashed evergreen sector + band arcs) |
| Corridor markers | PRESERVED | evergreen corridor cards positioned at the corridor centroid / bearing offset |
| Distance-band chips with live counts (`DPDistanceChips`) | PRESERVED | 10 / 25 / 50 / 100 km, cumulative |
| Town rows with distance-from-origin, parcels, acres | PRESERVED | `AJTownRow` (same content as `NDPanel.TownRow`) |
| Town discs on the map | PRESERVED | evergreen count discs with name label |
| Parcel results + `DPParcelCard` | PRESERVED | real cards, 2-up grid, active-parcel outline |
| Parcel pins on the map | RESTORED/IMPROVED | evergreen `acres · price` pins, pixel-clustered into "N parcels" discs |
| Agri filters (`DPAgriFilters`: size · price · soil · road · water) | PRESERVED | unchanged component and `DP_applyAgri` |
| Search within agri results | PRESERVED | towns + parcels |
| Separate-model note ("never counted into residential") | PRESERVED | evergreen note at the journey root |
| Back / journey switching | PRESERVED | parcel → town → corridor; switching to Areas returns to the exact Areas state |

## New work preserved (no regression against the candidate either)

Shallow directional navigation · prominent area names on map cards · listing counts · area counts over areas *with matches* · density-aware visual AREA clusters (listings primary in Areas, schools primary in Schools) · structural Direction cards kept shape-distinct from presentation-only clusters · individual AREA markers · map/panel sync · canonical breadcrumbs · in-app hierarchy Back · browser history · add-nearby-areas scope building (1 + up to 2, draft vs committed, Show N listings) · Edit areas · Clear selected areas · Fit all N areas · polygon replacement with explicit confirmation · Search this area (never automatic) · zero-result recovery (nearby previews + one-filter changes with real counts) · Create alert · saved alert management (open / pause / delete / restore) · honest failure + retry · mobile list/map continuity.

## Intentionally superseded (explicit)

1. **Region → recursive directional cluster hierarchy** → City → Direction → Local destination → Area. Equal capability, one level shallower, counts only over areas with matches.
2. **Four-up tall mode tiles** → three compact journey cards in one row. Same selector semantics and visual language; "Browse all listings" stays as the adjacent action it already was.
3. **Area listings rendered under the Schools browser** → replaced by an explicit one-click return, per the density rule that only one secondary workflow is expanded at a time.
4. **Standalone trust strip on the city landing** → trust is carried by the listing cards' verified/trusted tiers.

## Known gaps (not removal decisions)

- **Hash deep links** (`#m=schools&a=hebbal&…`) from the existing product are not reproduced; the candidate uses history snapshots for Back/Forward. Re-add hash serialisation if shareable deep links are required.
- **Leaf-marker infographic popups** with ‹ / › stepping and "Show in list" (`NDMap` / `PortalMap`) are not ported; a marker click opens the listing detail state instead.

## Journey state retention

```
Discover shell — shared: city · Buy/Rent · residential filters · header · map container · alerts
├── AREAS   nodeKey · clusterFocus · scope (AREA_SET | CITY | POLYGON | VIEWPORT) · committed · draft · detail
├── SCHOOLS st.sch — nodeKey · areaKey · query · boards · levels · selected school · radiusKm · returnTo
└── AGRI    st.ag  — originKey · corridorId · clusterId · maxKm · agri filters · query · active parcel
```

Verified transitions:

- `Hebbal properties → Schools → Schools in Hebbal → select school → homes → Back to properties in Hebbal` — Areas state intact (Hebbal, filters, camera).
- `Bangalore Areas root → Agricultural → corridor → town → parcels → Areas` — Areas root intact; agri state intact on return.
- `Areas (Hebbal) → Agricultural` — Hebbal becomes the agri **origin**, residential scope untouched.

## Confirmation

Every capability in the existing product is **preserved**, **improved**, or **explicitly documented** above as superseded or as a known gap. Areas, Schools and Agricultural are all visible and selectable from the main shell on desktop (1366×768) and mobile (390×844); no journey is unreachable.
