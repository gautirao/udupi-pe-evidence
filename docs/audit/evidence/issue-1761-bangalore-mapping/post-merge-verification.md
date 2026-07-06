# Issue #1761 — Post-merge live verification (README §7 close-out)

**Date:** 2026-07-06 · **Merge:** PR #1772 squash-merged as `a06f9d51` (head `e16dae05`) ·
**Deploy:** Render auto-deploy applied Flyway V106 ~150 s after merge (first poll showing new
regions at `generatedAt 2026-07-06T09:21:51Z`).

## Archived live responses (read-only GETs against the deployed API)

- `post-merge-summary-sale.json` — `GET /api/discover/summary?city=bangalore&listingPurpose=sale`
- `post-merge-area-groups.json` — `GET /api/discover/area-groups?city=bangalore`

## Invariant checks — all PASS

1. **Exact reconciliation:** sum of the 16 per-group `listingCount`s = **1737** =
   `totalActiveListings` → **Other Bangalore = 0**. No listing churn occurred between the
   2026-07-06 baseline and deploy, so the live macro-region rollup matches the projection
   **exactly**:

   | Region | Groups (live counts) | Total |
   |---|---|---:|
   | East Bangalore | east-emerging 187 + sarjapur-corridor 177 + tech-corridor 163 + kr-puram-belt 158 + whitefield-extension 139 + outer-ring 0 | **824** |
   | North Bangalore | thanisandra-hennur-belt 181 + north-emerging 141 + north-growth 41 + airport-belt 34 | **397** |
   | South Bangalore | begur-bannerghatta-belt 145 + south-emerging 141 + electronic-city-extension 64 + south-premium 37 | **387** |
   | West Bangalore | west-corridor 87 + west-emerging 42 | **129** |
   | Other Bangalore | (fallback) | **0** |
   | **Total** | | **1737** |

2. **Overlap repair visible in live data:** `airport-belt` now counts **34** (its re-purposed
   airport-corridor localities) instead of duplicating north-growth's 41; `outer-ring` counts
   **0** (its former count of 2 was entirely Marathahalli's double-counted listings — Indiranagar,
   its remaining member, has no live sale listings). No listing is counted twice.

3. **West Bangalore appears from backend data alone:** `post-merge-area-groups.json` shows all 16
   active groups with `regionLabel` set — `west-corridor` and `west-emerging` under
   **West Bangalore** — with zero frontend changes in the PR.

4. **Counts remain backend-owned:** both values are straight from the deployed API; no client
   aggregation involved in this verification.

## Note

"Other Bangalore = 0" holds as of this snapshot; the fallback bucket remains in place by design
and will repopulate only with newly-ingested localities that have no `area_group_members` row
(automated catch-all mapping is the #1745 follow-up recommendation, out of scope here).
