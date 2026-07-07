# Before/after examples — issue #1567

All "after" JSON below is captured LIVE from the worktree backend (`:8093`) on 2026-07-06.

## Area-first city-listings — C-tier row (For Rent, QA-1745 seed)
**Before (main):** the row carried the raw internal letter grade:
```json
{ "id": "a1745b01-...", "propertyType": "apartment", "locality": "Manipal", "trustTier": "C", ... }
```
**After (this branch):** public word, raw grade gone:
```json
{ "id": "a1745b01-0000-0000-0000-000000000001", "propertyType": "apartment", "locality": "Manipal",
  "listingPurpose": "rent", "bedrooms": 1, "title": "[QA-1745-BATCH-B] 1BHK Apartment near Manipal, for Rent",
  "createdAt": "2026-07-04T16:31:34.798929Z", "trustBadge": "listed", "latitude": 13.35, "longitude": 74.78 }
```
(all 5 Manipal rent rows: `trustBadge:"listed"`, NO `trustTier` key.)

## Area-first city-listings — D/null-tier row (For Sale, [E2E] seed)
**Before (main):** `"trustTier": "D"` (or null) present on the wire.
**After (this branch):** field omitted entirely (`@JsonInclude(NON_NULL)` — D/null → no badge):
```json
{ "id": "e2e00001-...", "propertyType": "...", "locality": "Manipal", "priceBand": "...", ... }
```
(4 sale rows: `trustBadge` ABSENT, NO `trustTier` key — no badge renders, correctly.)

## Security invariant (both datasets)
`grep '"trustTier"'` over the live sale response AND the live rent response → **zero matches**. The raw internal grade never crosses the wire on either path.

## School-first & agri-first (unchanged, badge-free)
`school-radius-listings` (9 items) and `agri-map-listings` (2 items): neither `trustTier` nor `trustBadge` present — no trust field by contract.
