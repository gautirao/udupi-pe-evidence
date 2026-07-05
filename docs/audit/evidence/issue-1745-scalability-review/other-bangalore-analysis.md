# Issue #1745 — "Other Bangalore" & Macro-Region Mapping Analysis

This document provides an engineering audit of how macro-region listing counts are derived, why 1,453 out of 1,737 active Bangalore listings fall into the "Other Bangalore" fallback bucket, and why "West Bangalore" is absent from the city landing hierarchy.

---

## 1. Reconciliation of Bangalore Listing Counts

From `GET /api/discover/summary?city=bangalore&listingPurpose=sale`:
- **`totalActiveListings`**: **1,737**
- **Mapped Area Groups (`regions`)**:
  - `tech-corridor` (Tech Corridor): **163**
  - `airport-belt` (Airport Belt): **41**
  - `north-growth` (North Growth): **41**
  - `south-premium` (South Premium): **37**
  - `outer-ring` (Outer Ring Road): **2**
  - **Sum of mapped area groups**: **284**

When `useDiscoverSummary` hydrates in the frontend, `aggregateMacroRegions()` (`src/utils/macroRegionResolver.ts`) rolls up these area groups by their assigned `region_label`:
- **East Bangalore**: `tech-corridor` (163) + `outer-ring` (2) = **165**
- **North Bangalore**: `airport-belt` (41) + `north-growth` (41) = **82**
- **South Bangalore**: `south-premium` (37) = **37**
- **Total Mapped to Named Macro-Regions**: **284**

### The Fallback Calculation
`aggregateMacroRegions()` computes the unmapped remainder as:
$$\text{Other Bangalore} = \text{totalActiveListings} - \sum \text{Mapped Macro-Regions} = 1737 - 284 = \mathbf{1,453}$$

The numbers reconcile exactly:
$$\mathbf{165\text{ (East)} + 82\text{ (North)} + 37\text{ (South)} + 1453\text{ (Other)} = 1,737\text{ (Total Active Listings)}}$$

---

## 2. Why Listings Fall into "Other Bangalore"

To understand why 83.6% (1,453 / 1,737) of listings fall into `Other Bangalore`, we inspected the backend SQL query in `DiscoverSummaryService.java` (`queryAreaGroupRegions`):

```sql
SELECT ag.slug AS region_key, ag.name AS region_label, COUNT(pl.id) AS listing_count
FROM area_groups ag
JOIN cities c ON c.id = ag.city_id
JOIN area_group_members agm ON agm.area_group_id = ag.id
LEFT JOIN property_listings pl ON pl.area_key = agm.area_key
  AND pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
  AND pl.area_key IN (SELECT a.area_key FROM areas a JOIN cities c ON c.id = a.city_id WHERE c.slug = 'bangalore')
  AND pl.listing_purpose = 'sale' AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
WHERE c.slug = 'bangalore' AND ag.is_active = true
GROUP BY ag.slug, ag.name;
```

### Root Cause of Unmapped Listings
A listing is only counted towards an area group if its `area_key` is explicitly present in the `area_group_members` table for that group.
From `GET /api/discover/area-groups?city=bangalore`, we can see exactly which localities (`areaKeys`) are mapped across the 5 active area groups in Bangalore:
1. `tech-corridor`: Whitefield, Marathahalli, Electronic City, Sarjapur Road
2. `north-growth`: Hebbal, Yelahanka
3. `south-premium`: Koramangala, Jayanagar, HSR Layout
4. `outer-ring`: Marathahalli, Indiranagar
5. `airport-belt`: Yelahanka, Hebbal

**Total distinct localities mapped in `area_group_members`:** **11 localities**.

However, from `summary-sale.json`, the top Bangalore hotspots include many high-density localities that are **completely absent** from `area_group_members`:
- **Varthur**: 56 active listings (Unmapped)
- **K R Puram**: 53 active listings (Unmapped)
- **Thanisandra**: 46 active listings (Unmapped)
- **Begur**: 31 active listings (Unmapped)
- **Sarjapur** (distinct from Sarjapur Road): 33 active listings (Unmapped)
- Plus over 100 other active residential localities across Bangalore (e.g. Bellandur, Bannerghatta Road, JP Nagar, BTM Layout, Malleshwaram, Rajajinagar, etc.).

Because these localities have no rows in `area_group_members`, the SQL `LEFT JOIN` on `pl.area_key = agm.area_key` does not match them. Therefore, their listings are excluded from the `GROUP BY ag.slug` sums and correctly fall into the frontend's **"Other Bangalore"** unmapped bucket.

---

## 3. Why West Bangalore is Absent

West Bangalore is absent from the city landing cards for two structural reasons:
1. **No Area Groups Assigned**: In the database, none of the active `area_groups` for Bangalore have `region_label = 'West Bangalore'`.
2. **No Locality Mappings**: Key West Bangalore localities (such as Malleshwaram, Rajajinagar, Vijayanagar, Basaveshwaranagar, Kengeri, and Nayandahalli) are not mapped in `area_group_members`.

Consequently, any active property listings located in West Bangalore localities are not aggregated under a West Bangalore bucket; instead, they are included in the **1,453 listings** assigned to **"Other Bangalore"**.

---

## 4. Remediation Recommendation

The "Other Bangalore" bucket is functioning as designed as a lossless fallback for unmapped localities. However, having 83.6% of listings in the fallback bucket reduces the effectiveness of geographical discovery.

To remediate:
1. **Seed West Bangalore Area Groups**: Create `area_groups` with `region_label = 'West Bangalore'` (e.g., "West Industrial/Residential Belt" covering Rajajinagar, Malleshwaram, Vijayanagar, Kengeri).
2. **Expand `area_group_members`**: Map the top unmapped hotspots (Varthur, K R Puram, Thanisandra, Begur, Bellandur, JP Nagar, etc.) to appropriate existing or new area groups.
3. **Automated Mapping / Catch-Alls**: In a future slice, introduce a district/zone-level catch-all mapping in Postgres or OpenSearch so newly scraped localities automatically roll up into their corresponding North/South/East/West/Central macro-region without requiring manual `area_group_members` seeding.
