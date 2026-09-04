# Issue #2431 — runtime evidence (live stack, real backend)

Stack: dev-worktree-stack.sh --frontend-port 5201 --backend-port 8101
Branch: issue-2431-commercial-subtype-filter @ 05d7e1cc
Backend DB: the shared project database (NOT a local fixture) — no rows were written.
Captured: 2026-09-04T04:54:27Z

## 1. Baseline — the 3 real Commercial listings in Udupi
```
$ curl .../listings?city=udupi&propertyTypes=commercial
totalElements = 3
  listing 4167 propertyType=commercial commercialSubtype=None
  listing 4171 propertyType=commercial commercialSubtype=None
  listing 4175 propertyType=commercial commercialSubtype=None
```

All three are legacy rows: V102 backfilled them with commercial_subtype NULL because
shop-vs-office cannot be recovered from legacy data. The new field reports that honestly
as absent rather than guessing — this is the exact guarantee the issue turns on, observed
against real production-shaped data rather than a hand-built fixture.

## 2. Filtered — SHOP
```
$ curl .../listings?city=udupi&propertyTypes=commercial&commercialSubtypes=SHOP
  totalElements = 0
$ curl .../listings?city=udupi&propertyTypes=commercial&commercialSubtypes=OFFICE
  totalElements = 0
```

Zero, correctly: not one of the three legacy rows is silently classified as a Shop or an
Office. An implementation that coalesced NULL to a value would return 3 here.

## 3. Cards and markers agree on the same filter

```
  commercialSubtypes=<absent>       ->  listings=3  markers=3
  commercialSubtypes=SHOP           ->  listings=0  markers=0
  commercialSubtypes=SHOP,OFFICE    ->  listings=0  markers=0
```

The map and the result list move together on every filter shape, which is the issue's
"listings, counts and markers return the same filtered membership" requirement observed live.

## 4. Unknown values fail deterministically, on BOTH endpoints

```
  RESTAURANT  ->  listings HTTP 400 | markers HTTP 400
  WAREHOUSE   ->  listings HTTP 400 | markers HTTP 400
```

`WAREHOUSE` is rejected on purpose: it is addressable as its own property type, so accepting
it here as well would give a buyer two different ways to ask one question, and the taxonomy
two places to drift.

## 5. Absent param leaves existing journeys untouched

```
  city=udupi, no subtype param  ->  totalElements = 141
```

The whole-city count is unchanged, confirming the additive param does not perturb any existing
Discover journey.

## What this evidence does NOT cover, and why

There is no non-zero Shop/Office result above, because the shared project database contains no
listing with a recorded commercial subtype — all three commercial rows predate the typed write
path and were backfilled with NULL by V102.

Producing one would mean writing new listings into a database that other lanes and the owner
are actively using. That is not a change to make unilaterally for a screenshot, so it was not
made, and no rows were written by this run.

The positive path is covered instead by `CommercialSubtypeFilter2431IT`, which seeds a real
Shop, a real Office, a lower-case-stored subtype, a legacy NULL row, a row with no projection
row at all, and a non-commercial control into a real postgis container, then asserts filtered
membership, card/marker agreement and payload values across all six. That is a stronger and
repeatable version of what a curl against seeded shared data would have shown.
