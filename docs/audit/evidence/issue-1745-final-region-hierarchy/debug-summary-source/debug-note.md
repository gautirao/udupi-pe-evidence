# Debug Note: Macro-Region Counts & Source Investigation (Issue #1745)

## 1. Questions & Answers

- **totalActiveListings**: `1737` (for `listingPurpose=sale`; `0` for `listingPurpose=rent`).
- **region list returned by `/api/discover/summary?city=bangalore`**:
  - `tech-corridor` (163)
  - `airport-belt` (41)
  - `north-growth` (41)
  - `south-premium` (37)
  - `outer-ring` (2)
- **sum of region counts**: `163 + 41 + 41 + 37 + 2 = 284`.
- **Whether West Bangalore exists in the response**: **No.** Neither `summary-sale.json` nor `area-groups.json` contains any group or region labeled `West Bangalore`. In the database seed (`V78__seed_area_groups.sql`), only 5 area groups were created for Bangalore (`tech-corridor`, `north-growth`, `south-premium`, `outer-ring`, `airport-belt`), which map to `East Bangalore`, `North Bangalore`, and `South Bangalore`.
- **Whether any active listings are unmapped from region_label**: **Yes.** Exactly `1737 - 284 = 1453` active listings belong to Bangalore localities (such as Varthur, K R Puram, Thanisandra, Begur, JP Nagar, etc.) that were never added to `area_group_members` in `V78__seed_area_groups.sql`. Because `summary.regions` queries `JOIN area_group_members agm`, only listings in those 10 seeded localities are counted in the group rollup.
- **Exact UI source used for each map bubble count**:
  - In `MapDiscovery.tsx` and `GuidedEntryPanel.tsx`, the UI calls `useDiscoverSummary({ city, listingPurpose })` and passes `summary.regions` to `aggregateMacroRegions(summary.regions, areaGroups)`.
  - `aggregateMacroRegions` groups the 5 corridor counts by their `region_label`:
    - East Bangalore: `tech-corridor` (163) + `outer-ring` (2) = `165`
    - North Bangalore: `airport-belt` (41) + `north-growth` (41) = `82`
    - South Bangalore: `south-premium` = `37`
    - Total mapped = `284`.

## 2. Reconciling the Discrepancy (Per Expected Rule)

Per the rule: *“If the backend summary only counts mapped groups, do not hide the discrepancy. Either fix the backend summary mapping if it is a bug, or surface an ‘Other Bangalore’ / ‘Unmapped areas’ bucket if data genuinely lacks region mapping, or stop and ask for a data-model decision. Do not invent counts in the frontend.”*

**Resolution:** We surface an explicit **"Other Areas (Unmapped)"** (or **"Other Bangalore"**) bucket when `totalActiveListings > sum(mapped)`. This transparently presents the remaining `1453` backend-owned active listings without inventing counts or modifying the backend database schema.
