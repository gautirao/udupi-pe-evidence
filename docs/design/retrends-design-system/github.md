repo: gautirao/udupi-property-explorer
branch: main
path: apps/

## Last sync
date: 2026-09-21T13:58:00Z

### Updated in this project
- Read production POI stack (PoiManager, InlineNearby, useResidentialLocation, ListingPoiController/ManualPoiRequest) to author the #2642 handoff note.
- Wrote `ui_kits/buyer/create-residential-listing-implementation-notes.md` mapping the approved mock to real components, endpoints and enums.
- Flagged three mock-vs-backend mismatches (category enum, manual distance persistence, `formatDistance(null)`).

## Screen map
| Design file | Built from / mapped to |
|---|---|
| ui_kits/buyer/create-residential-listing.html | apps/web/src/components/broker/residential/*, apps/web/src/components/poi/PoiManager.tsx |
| ui_kits/buyer/create-residential-listing-implementation-notes.md | apps/web/src/components/poi/*, apps/web/src/components/broker/AreaField.tsx, apps/api/.../poi/* |
