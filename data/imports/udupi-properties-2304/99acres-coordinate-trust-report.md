# 99acres Coordinate Trust Finding - Issue #2304 (source expansion)

**Finding**: 99acres frequently returns a locality-level centroid coordinate instead of a genuine per-listing GPS pin, indistinguishable from real per-building precision on its face.

Concrete evidence: in the Udupi buy dataset, coordinate (13.347199, 74.788029) is shared by 4 listings. 3 of them carry `buildingName: "Hi Point Royal"` (a real named building in Manipal - a legitimate same-building case). The 4th, listing U92843234, has `buildingName: null`, `projectName: null`, and no relation to Hi Point Royal beyond sharing `locality: "Manipal"` - yet shares the exact same coordinate to 6 decimal places. This proves the coordinate is a Manipal-locality fallback, not a real pin, for at least the unnamed-building row.

Other clusters confirm the pattern at locality granularity: Shirva (4 listings, 1 coord, no shared building name), Kaup (4), Brahmavar (12), Karkala (9), Kundapura (7), Hiriydaka (4), Perdur (4), Udyavara (4) - all single-coordinate clusters of otherwise-unrelated listings.

**Rule applied**: a listing's coordinate is trusted only if (a) it is unique across the dataset, or (b) it is shared exclusively with other listings carrying the identical non-null buildingName/projectName (genuine same-building, multiple real units). Any other shared coordinate is treated as an untrustworthy locality-centroid fallback and every listing sharing it is excluded - this is stricter than the plan's literal '>5 listings' threshold because we have positive evidence (the Hi Point Royal case) that even small same-coordinate groups on this source can mix one real building pin with unrelated listings.

## Coordinate-trust exclusion counts by source-mode

- Buy: raw 86
- Rent: raw 94
- Commercial: raw 100
- Total coordinate-trust exclusions (all modes): 188
