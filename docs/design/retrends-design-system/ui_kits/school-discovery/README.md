# School-first discovery — Bangalore Property Tracker

Scoped, map-first "find homes near a school" journey for the ReTrends portal, rebuilt
for GitHub issue **#1740 — scoped discovery navigation**. The city is Bangalore.

> **Principle:** the **left map and right panel always mirror the same navigation
> level**. A click on a map bubble performs the same action as clicking its card.

## Product model

```
City → Region → (Search near school) → School Zone → Area → School → homes-in-radius
```

| Step | Right panel | Left map |
|---|---|---|
| **City landing** | Region cards + journey options | 5 macro **region bubbles** (school counts) |
| **Region selected** | Region header + journey cards | All region **school pins** (overview) |
| **Search near school** | **Intent control** + school-zone cards | School-**zone bubbles** in the region |
| **Zone selected** | Area cards (schools · homes) | **Area bubbles** in the zone |
| **Area selected** | *Schools in {area}* — school cards | **School pins** in that area only |
| **School selected** | Homes near the school + **radius chips 3/5/10 km** | Selected school + **radius ring** + home pins |

### Intent-first segmented control (the "search near school" step)

Replaces an ambiguous "search school or area" box with **"What do you know?"
[ I know the school ] [ I know the area ]** — one reused input that changes
placeholder and behaviour:

- **School mode** — *"Search school, e.g. Vidyashilp Academy"* → result *"Vidyashilp
  Academy · School · Yelahanka · N homes within 5 km"* → opens homes near that school.
- **Area mode** — *"Search area, e.g. Hebbal"* → result *"Hebbal · Area · North
  Bangalore · N schools · N nearby homes"* → opens *Schools in Hebbal*.

Both auto-resolve region + zone + area in the breadcrumb.

## Files

```
index.html          → shell + top bar; mounts <BLRSchoolDiscovery/>
data.js             → regions, zones, areas, schools, listings + BLR_DIST / BLR_HOMES_NEAR
SchoolDiscovery.jsx → the scoped state machine, intent control, radius selector
Cards.jsx           → RegionCard · JourneyOption · ZoneCard · AreaCard · SchoolCard · ListingCard
Map.jsx             → Leaflet: region → school-overview → zones → areas → schools → radius+homes
```

## Data honesty

Radius counts and the per-card **"homes within N km"** and **"X.X km from school"** are
computed live with `BLR_DIST` (haversine) over real `lat/lon` — never hard-coded.
School / home counts equal the real records in `data.js`. Default radius is **5 km**;
the map ring resizes with the 3 / 5 / 10 km chips. State is mirrored to the URL
(`?regionId=…&journey2=school&zoneId=…&areaId=…&schoolId=…&radiusKm=5&mode=rent`).

## Visual system

Ink-navy structure + restrained copper for homes; **plum is the school accent** (school
pins, radius ring, zone chips, intent control) used sparingly. Cards lift on hover;
numbers are Geist Mono; the navy header band carries the breadcrumb and Change
school / Change region / Start over actions.
