# Area-first discovery — Bangalore Property Tracker

Scoped, map-first property discovery for the ReTrends portal, rebuilt for GitHub
issue **#1740 — scoped discovery navigation**. The city is Bangalore.

> **Why the redesign:** in a large city the old flat map tried to label every area
> and count at once, which reads as noise. The scoped model narrows one level at a
> time, and the **left map and right panel always mirror the same navigation
> level** — a click on a map bubble does exactly what clicking its card does.

## Product model

```
City → Region → (journey) → Group/Zone → Area → Listings
```

| Step | Right panel | Left map |
|---|---|---|
| **City landing** | Region cards + journey options (Search by area · Search near school · View all listings) + a separated **Agricultural land** entry | 5 macro **region bubbles** with total property counts |
| **Region selected** | Region header (count · breadcrumb · Change region / Start over) + journey cards + top areas | Pan/zoom to region; **top 3–5 hotspot areas** + "+ N more" indicator |
| **Search by area** | Group/zone cards (name · count · example areas · Explore group) + **Search area directly** box | Area **group bubbles** in the region |
| **Group selected** | Area cards with counts | Individual **area bubbles** in the group |
| **Area selected** | Listings + **filters** (budget · type · bedrooms · verified only · buy/rent) | Listing **price pins** in the area |

**Direct area search** (Search-by-area step): type an area (e.g. *Hebbal*) → a result
card *"Hebbal · Area · North Bangalore · View listings"* jumps straight to that
area's listings, auto-resolving region + group in the breadcrumb.

## Files

```
index.html          → shell + top bar; mounts <BLRAreaDiscovery/>
data.js             → regions, groups, areas, listings + derived BLR_AREA_COUNTS
AreaDiscovery.jsx   → the scoped state machine, direct search, filter bar
AreaCards.jsx       → RegionCard · JourneyOption · AgriCard · GroupCard · AreaCard · ListingCard
AreaMap.jsx         → Leaflet: region bubbles → hotspots → group → area → listings
```

## Data honesty

Every count (region / group / area) is **derived from the real listing records** in
`data.js` via `BLR_AREA_COUNTS`, so the map bubble and the matching card always show
the same number. Residential homes only — agricultural land is a separate journey and
is never mixed into the residential funnel. State is mirrored to the URL
(`?regionId=…&journey2=area&groupId=…&areaId=…&mode=rent`) so shared links restore the
exact view.

## Visual system

Ink-navy structure + restrained copper accent (region bubbles navy, area/listing pins
copper). Cards lift `translateY(-2px)` on hover; numbers are Geist Mono; the navy
header band carries the breadcrumb and back/change actions. No plum (that is the
school journey), no agricultural land, no radius control.
