# Unified Discover Portal — flow audit note

Interaction review against the Unified Discover Portal spec. Every action stays
inside the one shell (top bar, city + Buy/Rent, breadcrumb, 50/50 map/panel). Region
is a scope; journey is a narrowing method. No action navigates to a separate page.

## Fixes applied in this pass

1. **Search toggle no longer defaults to School on a region overview.** `searchMode`
   resets to **Area** whenever the state returns to a scope-only / journey-null level
   (`pickRegion`, `changeRegion`, and every `back()` that lands on journey = null).
   School is selected *only* while the school journey is active. (Verified: on
   `?region=north` the Area segment is filled, School transparent.)
2. **Active scope is now obvious at the top.** The persistent header shows
   `Discover Bangalore › [ North Bangalore × ]` — a scope chip that clears the region
   on click. It appears on every scoped state, so the shell always signals the active
   scope, on top of the dark summary card + breadcrumb already present.
3. **Invalid / unknown URL ids fall back to the nearest valid level.** `init` now
   validates every id (`region/group/zone/area/school/corridor/cluster`) against the
   data, drops ids inconsistent with the journey, and derives `scope` from a deep id
   when omitted — so a bad deep link resolves to a valid level instead of crashing.

## Clickable actions checked (all pass)

- **Region bubbles ↔ region cards** — both call `pickRegion` → region overview.
- **Group bubbles ↔ group cards** — both call `pickGroup` → areas-in-group.
- **Area labels ↔ area cards** — both call `pickArea` (area journey → listings;
  school journey → schools-in-area).
- **Zone bubbles ↔ zone cards** — both call `pickZone`.
- **School pins ↔ school cards** — both call `pickSchool` → radius state.
- **Corridor / cluster bubbles ↔ agri cards** — `pickCorridor` / `pickCluster`.
- **Listing price pins ↔ listing cards** — same filtered set, hover syncs the active pin.
- **Back links** — pop exactly one level (`school → area → zone → journey → region → city`).
- **Breadcrumbs (dark card + map chip)** — mirror scope/journey/level 1:1.
- **Change region** — clears scope + selection back to city landing. **Start over** —
  full reset. **Buy/Rent** — persists across every scope/journey change.
- **Journey cards** — neutral landing opens each journey across all Bangalore;
  region-overview cards open each journey **scoped to the region** (scope persists).
- **Radius chips 3/5/10** — resize the ring and re-sort homes by distance live.
- **Filters** — residential (budget/type/beds/verified) and agri (size/distance/road/
  water/soil) both apply live with empty-state fallbacks.

## Map-layer rule per state (one layer each, never mixed)

`region-bubbles · region-hotspots · area-groups · area-areas · area-listings ·
school-zones · school-areas · school-schools · school-homes · agri-corridors ·
agri-clusters · agri-parcels`. School markers appear only in the school journey; agri
uses its own evergreen layers; region bubbles show **property counts only**.

## Agri separation (verified)

Agricultural land is a separate model (`data.agri`) and separate counts — never in
region property counts, never inside area/school journeys. Opening it **clears the
residential region scope** and shows all corridors with the helper line explaining
farmland is searched by corridor + distance, not neighbourhood.

## URL / state model

One scheme: `?region=&journey=area|school|listings|agri&groupId=&zoneId=&areaId=&schoolId=&corridorId=&clusterId=&radiusKm=&mode=rent`.
Each level round-trips (deep links restore exactly); invalid ids fall back.

## Deliverable states (open these URLs)

1. Neutral landing — `index.html`
2. North region overview — `?region=north`
3. North area groups — `?region=north&journey=area`
4. North Growth group — `?region=north&journey=area&groupId=north-growth`
5. Thanisandra listings — `?region=north&journey=area&groupId=north-growth&areaId=thanisandra`
6. School journey, city scope — `?journey=school`
7. School journey, North scope — `?region=north&journey=school`
8. Selected school radius — `?region=north&journey=school&zoneId=hebbal-jakkur&areaId=hebbal&schoolId=s-vidyaniketan`
9. Agricultural journey — `?journey=agri`
10. Agri corridor selected — `?journey=agri&corridorId=north-belt`

## Links not yet implemented (intentional for a mock)

- `View details` (listings) and `View parcel` (agri) are placeholders — no detail page
  in scope for this mock.
- Save (heart) toggles local state only; no persisted saved-search.
- Top-bar `Sign in` / notifications are chrome only.
