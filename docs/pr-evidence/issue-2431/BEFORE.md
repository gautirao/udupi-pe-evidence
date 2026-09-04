# Issue #2431 — Before state (base commit `e80865da`)

Every claim below was re-derived first-hand against the base commit, not carried over
from the issue text. Commands are `git grep` against the pinned SHA, so they are
reproducible without a running stack.

## A. The Discover backend package does not know the field exists

```
$ git grep -n -i "commercialSubtype" e80865da -- apps/api/src/main/java/com/example/realestate/discover
exit=1   # zero matches
```

Zero hits across the whole `discover` package: no DTO field, no query param, no
predicate, no OpenSearch clause.

## B. The Discover frontend does not know it either

```
$ git grep -n -i "commercialSubtype\|subtype" e80865da -- \
    apps/web/src/features/discover \
    apps/web/src/components/map \
    apps/web/src/lib/discoverSearchParams.ts
exit=1   # zero matches
```

Zero hits across the Discover feature directory, the map filter components, and the
single API-parameter builder shared by the listings and markers hooks.

`PropertyTypeFilter.tsx` (base, L5-14) offers only the four broad commercial property
types — `commercial`, `commercial_building`, `warehouse`, `commercial_land` — so a
buyer has no way to ask for Shop rather than Office.

## C. The gap is specifically at the Discover boundary, not upstream

Persistence, the authenticated detail API and the search index all carry the field
already:

```
$ git grep -n "commercialSubtype" e80865da -- .../listing/api/ListingResponse.java
e80865da:.../ListingResponse.java:166:  // commercialSubtype is null for legacy commercial rows (V102 backfill) and for
e80865da:.../ListingResponse.java:168:  String commercialSubtype,

$ git grep -n "commercial_subtype" e80865da -- apps/api/src/main/java/com/example/realestate/search
e80865da:.../indexer/ListingIndexDocument.java:94:   @JsonProperty("commercial_subtype")
e80865da:.../indexer/ListingIndexDocument.java:276:  @JsonProperty("commercial_subtype")
```

So this is a read-model and query-reachability gap, exactly as the issue frames it —
not a new write-model feature. `listing_commercial_space_details.commercial_subtype`
(V102 L82-92) is written on every create/update through
`CommercialSpaceDetailRepository#upsertFromListing`, and stamped upper-case
(`SHOP`/`OFFICE`) by `ListingController#resolveCommercialSubtype`.

## D. Legacy NULL subtype is real and must stay honest

V102's backfill hardcodes `commercial_subtype = NULL` for every pre-existing
`property_type='commercial'` row, with this comment in the migration (L78-81):

> AMBIGUITY NOTE: legacy property_type='commercial' cannot be disambiguated into
> shop vs office without user input. commercial_subtype is left NULL for all
> backfilled rows.

Any filter added here must therefore exclude those rows from both Shop and Office
rather than guessing. That is the behaviour the new predicate has, and it is covered
by a dedicated integration test.
