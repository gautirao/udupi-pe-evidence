# Issue #1761 — Bangalore macro-region mapping evidence

## Goal

Eliminate the "Other Bangalore" fallback's dominance (1453/1737 sale listings, 83.6%) by:

1. Repairing the V78 dual-membership overlap that double-counted 43 sale listings, and
2. Seeding a curated `areas` / `area_groups` / `area_group_members` mapping for the 304
   previously-unmapped Bangalore localities (1496 distinct sale listings), including a new
   **West Bangalore** macro-region.

Backend-owned counts only; zero frontend changes.

## 1. Overlap repair (prerequisite)

The live baseline (`q2-baseline-reconciliation.txt`, read-only, reproduced 2026-07-06) showed
`north-growth` and `airport-belt` seeded with an **identical member set** (`{Yelahanka, Hebbal}`),
and `Marathahalli` seeded into **both** `tech-corridor` and `outer-ring`. That inflates the mapped
sum by 43 sale listings, which would drive "Other" negative once the remaining 304 localities are
mapped (`1737 - (284 + 1496) = -43`).

V106's first two `DELETE` statements repair this — WHERE-scoped to the exact `(group slug,
area_key)` pairs, so re-running the migration against an already-repaired DB is a no-op:

| Locality | Removed from | Retained in |
|---|---|---|
| Yelahanka | `airport-belt` | `north-growth` |
| Hebbal | `airport-belt` | `north-growth` |
| Marathahalli | `outer-ring` | `tech-corridor` |

`airport-belt` is then re-purposed with genuinely airport-adjacent new localities (step 3 below)
so no group is left empty. `outer-ring` keeps its one remaining member, Indiranagar.

Total rows deleted: **3** — exactly the scope-locked limit.

## 2. Curated taxonomy

Method: every locality's `proposed_region` (deterministic bearing-from-city-center, `q3-bearing-
classification.txt`) sets its default macro-region. Within a region, named "flagship" localities
explicitly called out in the approved plan are pinned directly to their named group; every other
locality in the region is assigned to the nearest flagship anchor (haversine distance to the
flagship group's named-member centroid) **if within 6 km**, else it falls into that region's
`-emerging` tail group. This guarantees every locality lands in exactly one group, deterministically,
and that the plan's illustrative taxonomy is honoured exactly for its named examples.

| Group slug | Name | Region | Localities | Sale listings |
|---|---|---|---:|---:|
| whitefield-extension | Whitefield Extension | East Bangalore | 13 | 139 |
| kr-puram-belt | K R Puram Belt | East Bangalore | 22 | 158 |
| sarjapur-corridor | Sarjapur Corridor | East Bangalore | 25 | 177 |
| east-emerging | East Bangalore Emerging | East Bangalore | 42 | 187 |
| thanisandra-hennur-belt | Thanisandra-Hennur Belt | North Bangalore | 29 | 181 |
| airport-belt (existing, re-purposed) | Airport Belt | North Bangalore | +6 | +34 |
| north-emerging | North Bangalore Emerging | North Bangalore | 49 | 141 |
| begur-bannerghatta-belt | Begur-Bannerghatta Belt | South Bangalore | 24 | 145 |
| electronic-city-extension | Electronic City Extension | South Bangalore | 17 | 64 |
| south-emerging | South Bangalore Emerging | South Bangalore | 38 | 141 |
| west-corridor | West Corridor | West Bangalore | 22 | 87 |
| west-emerging | West Bangalore Emerging | West Bangalore | 17 | 42 |
| **Total** | | | **304** | **1496** |

Full per-locality mapping: `curated-mapping.csv` (`area_key,name,sale_cnt,all_cnt,group_slug,
region_label,bearing_source_region,overridden`).

`display_order` for the 11 new groups continues at 6 (existing Bangalore groups from V78 occupy
1–5); all new groups are `is_active = true`. `airport-belt` (display_order 5, existing) is not
re-inserted — only its membership changes.

## 3. Manual sanity-pass overrides (>=10 sale listings)

Per the plan's risk note ("bearing-based assignment can mislabel boundary localities... manual
sanity pass on all localities >=10 listings"), all 36 localities with `sale_cnt >= 10` were
reviewed against the plan's own named-group examples. Two required an explicit region override
(both localities are cited by name in the approved plan's taxonomy step under a *different*
region than their raw bearing classification produced):

| Locality | Sale | Raw bearing region | Overridden region | Reason |
|---|---:|---|---|---|
| Sarjapur | 33 | South Bangalore | **East Bangalore** | Plan step 2 explicitly groups Sarjapur under `sarjapur-corridor` in the East taxonomy; its geo-center sits on the East/South bearing boundary. |
| Malleswaram | 2 | North Bangalore | **West Bangalore** | Plan step 2 explicitly lists Malleswaram as a `west-corridor` member; a well-known inner-west locality whose bearing from the exact city-center point falls marginally north. |

No other >=10-sale locality required an override — all 34 remaining ones matched their bearing
classification and the plan's illustrative examples (e.g. Varthur/K R Puram/Thanisandra/Begur/RR
Nagar/Hoskote all landed in their expected region with no adjustment).

These two overrides move sale listings between regions but do not change the total (1496), so the
after-state reconciliation below still closes exactly.

## 4. After-state reconciliation (projected)

Existing (post-overlap-repair) distinct mapped counts, from the approved plan's baseline:
`tech-corridor` 163 (East), `north-growth` 41 (North), `south-premium` 37 (South), West 0 (no
existing West group).

| Region | Existing distinct | + Newly mapped | = After |
|---|---:|---:|---:|
| East Bangalore | 163 | 661 | **824** |
| North Bangalore | 41 | 356 | **397** |
| South Bangalore | 37 | 350 | **387** |
| West Bangalore | 0 | 129 | **129** |
| Other Bangalore | — | — | **0** |
| **Total** | | | **1737** |

824 + 397 + 387 + 129 + 0 = **1737** — matches the shared-DB total exactly, with no double
counting (overlap repaired in step 1 above).

Note: these after-counts (824/397/387/129) differ from the plan's illustrative pre-sanity-pass
projection (791/399/420/127) by the Sarjapur (+33 East / -33 South) and Malleswaram (+2 West / -2
North) overrides documented in §3 — an expected, plan-authorized consequence of the manual sanity
pass. The total (1737) and the "no double counting" invariant are unaffected.

## 5. Verification mechanism

1. **Structural**: V106 defines the curated mapping as a single VALUES list keyed by `area_key`,
   one row per locality — a duplicate assignment would require a visible duplicate literal.
2. **In-migration guard**: a `DO $$` block at the end of V106 raises `EXCEPTION` if any bangalore
   `area_key` holds more than one `area_group_members` row.
3. **Regression test**: `DiscoverSummaryServiceIT` IT-4 keeps this invariant under CI.
4. **Idempotency**: all inserts use `ON CONFLICT ... DO NOTHING`; the two DELETEs are WHERE-scoped
   to the exact rows being repaired. Re-running V106's statements against an already-migrated
   container is a no-op.

## 6. Files in this directory

- `README.md` — this file.
- `pre-change-unmapped-report.txt` — verbatim copy of `q1-unmapped-localities.txt` (live,
  read-only, pre-change report of all 304 unmapped Bangalore localities with counts).
- `analysis-queries.sql` — the three read-only SQL queries used for the analysis (unmapped
  report, baseline reconciliation, bearing classification draft).
- `curated-mapping.csv` — full `area_key -> group_slug -> region_label` mapping for all 304
  localities, plus the pre-override bearing region and an `overridden` flag.
- `test-run-evidence.md` — Main Agent first-hand test re-run evidence (DiscoverSummaryServiceIT
  and full backend suite, commands + exit codes + surefire summaries).

## 7. Post-merge verification (not executed pre-merge)

Per policy, no live browser/E2E smoke is run against the shared/hosted Supabase DB pre-merge.
Post-merge, re-run `GET /api/discover/summary?city=bangalore&listingPurpose=sale` and
`GET /api/discover/area-groups?city=bangalore` and archive the response alongside this evidence,
confirming: (a) `Other Bangalore` region no longer dominates, (b) a West Bangalore-labelled group
is present, (c) `sum(regions) + Other == totalActiveListings` exactly.
