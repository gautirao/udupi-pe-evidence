# Unified Discover Portal — design note

One `DiscoverPortal` shell for Bangalore. **Region is a scope/filter; journey is a
narrowing method.** The user never leaves the shell — the left map layer and the
right decision panel are always two views of the same `(scope, journey, level)`.

Lives in `ui_kits/discover/`:

```
index.html                     shell + top bar; mounts <DiscoverPortal/>
src/data.js                    ONE data model (regions, groups, zones, areas,
                               schools, listings) + a SEPARATE agri model
src/components/shared.jsx      BuyRent, BackLink, Crumb, HeaderBand, ScopedSearch,
                               FilterBar, AgriFilters, Radius, Empty
src/components/cards.jsx       Region/Journey/Group/Zone/Area/School/Listing +
                               agri Corridor/Cluster/Parcel cards
src/DiscoverMap.jsx            ONE map; layer = f(journey, level)
src/DiscoverPanel.jsx          panel body view-switch by level
src/DiscoverPortal.jsx         scope/journey state machine + persistent shell
```

## 1 · How the old area & school mocks were merged

The two standalone kits (`ui_kits/area-discovery`, `ui_kits/school-discovery`) were
separate apps with their own shell, map, state machine and search widget. They are
now **one portal**:

- **Two state machines → one.** `DiscoverPortal` holds `{mode, scope, journey,
  groupId, zoneId, areaId, schoolId, corridorId, clusterId, radiusKm}` and derives a
  single `layer` string. The area and school flows are branches of that one machine,
  not separate pages.
- **Two maps → one.** `DiscoverMap` renders exactly one marker layer chosen by
  `layer`; the marker builders (region bubble, group/zone pill, area pin, school pin,
  home pin, radius ring, agri parcel) live together and reuse the same styling.
- **Two search widgets → one.** The area kit's "Search area directly" box and the
  school kit's "What do you know?" intent control collapse into one **scoped,
  Area/School-toggled search box** whose placeholder follows the scope.
- **Data merged.** One `areas` table now carries **both** `group` (area journey) and
  `zone` (school journey) membership, so a neighbourhood like Hebbal is one record
  reached by either journey. Residential `listings` serve the area journey, the
  listings journey, and the school-radius math.

The old kits still exist but should be treated as **retired** — `index.html` in each
now redirects to the portal (see §5).

## 2 · How region scope works

`scope` is a region id or `null`. It is a **filter**, not a destination:

- Clicking a region bubble/card sets `scope` and **keeps the current journey**, so a
  journey re-scopes in place (all-Bangalore groups → North groups).
- Every journey respects scope: `area-groups`, `school-zones`, listings and the
  scoped-search results all filter to the region when one is set, and widen to all
  Bangalore when it is cleared.
- **Change region** clears scope (+ selection) back to the city landing; **Start
  over** resets everything.
- Region bubbles show **property counts only** — school counts never appear until the
  school journey is entered.

## 3 · How journey selection works

`journey` is `null | area | school | listings | agri`. Choosing one swaps the
narrowing method and the map layer while keeping scope and Buy/Rent:

- **area** → `groups → areas → listings` (copper accent, listing filters at the leaf).
- **school** → `zones → areas → schools → homes-in-radius` (plum accent, 3/5/10 km).
- **listings** → one flat, filterable list scoped to the region (or all Bangalore).
- **agri** → its own corridor → cluster → parcel funnel (see §4).

Selecting a journey never feels like a new app — the shell, top bar, city + Buy/Rent
and breadcrumb all persist; only the panel body and map layer change.

## 4 · How the map layer changes by state

One layer is active per state, a pure function of `(journey, level)`:

| Layer | Shows |
|---|---|
| `region-bubbles` | 5 region bubbles (property counts) — city landing |
| `region-hotspots` | top ~4 area hotspots in the scoped region |
| `area-groups` | area-group bubbles (region-scoped or all-Bangalore) |
| `area-areas` | area bubbles inside a group |
| `area-listings` | residential price pins (area or listings journey) |
| `school-zones` | school-zone bubbles (scoped or all) |
| `school-areas` | area bubbles inside a zone |
| `school-schools` | school pins in one area only |
| `school-homes` | selected school + radius ring + home pins |
| `agri-corridors` | direction/corridor bubbles (parcel counts) |
| `agri-clusters` | village/locality clusters in a corridor |
| `agri-parcels` | individual parcel pins |

Rules enforced: ≤5–8 macro bubbles at city level; never all areas or all schools at
once; school markers only after the school journey; **agri uses its own evergreen
layers and never mixes with residential or school markers.**

## Agricultural land (separate model, same shell)

Agri stays inside the portal but uses a **separate data model** (`data.agri`:
corridors → clusters → parcels) and separate counts (`BLR_AGRI_COUNTS`). It is never
mixed with residential: no agri in region property counts, no agri in the area or
school journeys, and its own evergreen map layer + filters (size, distance, road,
water, soil). Opening agri from a residential region **clears the residential scope**
and shows all corridors with the helper line "farmland is searched by corridor and
distance, not residential neighbourhood."

## 5 · Which duplicated components to remove later

Once the portal is adopted, these become redundant and should be deleted:

- **Whole kits:** `ui_kits/area-discovery/*` and `ui_kits/school-discovery/*`
  (`AreaDiscovery.jsx`, `AreaMap.jsx`, `AreaCards.jsx`, `SchoolDiscovery.jsx`,
  `Map.jsx`, `Cards.jsx`, both `data.js`, both `index.html`). Their `index.html` are
  now redirect stubs.
- **Duplicated data:** the two per-kit `data.js` files (merged into `src/data.js`).
- **Duplicated shared UI:** the two copies each of BuyRentToggle, BackLink,
  breadcrumb, HeaderBand/SelectedSummary, SectionLabel and empty states (one copy now
  in `src/components/shared.jsx`).
- **Duplicated cards:** the two RegionCard / JourneyOption / AreaCard / ListingCard
  implementations (unified in `src/components/cards.jsx`).
- **Two search widgets:** the area "Search area directly" box and the school
  "What do you know?" control (one `DPScopedSearch` now).

Keep the DS components (`Icon`, `Button`, `Badge`, `Input`, `TrustBadge`) untouched.
