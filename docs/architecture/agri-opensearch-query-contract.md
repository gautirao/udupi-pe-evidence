# Agricultural Destination: Postgres ↔ OpenSearch query contract

**Status:** specification only. No OpenSearch code ships with this document (#2151 PR B, decision.d3).
**Audience:** whoever implements the `AgriDestinationPort` OpenSearch adapter for #1882 Track B.
**Source of truth for the port shape:** `backend/src/main/java/com/example/realestate/discover/AgriDestinationPort.java`.

## 1. Why this document exists

`AgriDestinationPort` has exactly one implementation today —
`AgriDestinationPortPostgresAdapter`, reading the promoted `agri_destination_classification`
table (#2151 PR A). The port interface was deliberately designed to be adapter-agnostic (enforced
statically by `AgriDestinationPortStructuralAntiDriftTest`, D3-T1) so that a second implementation
— an OpenSearch adapter — can be dropped in behind the same interface with **zero identity
change** once #1882 Track B lands the infrastructure. This document is the specification that
future adapter inherits, so it starts from a contract instead of reverse-engineering one from the
Postgres SQL.

## 2. Stable-key filter shape

Both port methods take a `citySlug` plus a stable-key scope:

| Port query | Scope key(s) | Optional filter |
|---|---|---|
| `findDestinations(DestinationScopeQuery)` | `direction` (compass code, nullable = all), `maxKm` (nullable = unbounded) | `AgriDestinationFilters.listingPurpose` |
| `findParcels(ParcelQuery)` | `areaKeys` (one or more stable `areas.area_key` values) | `AgriDestinationFilters.listingPurpose`, `viewport` (`GeoBox`) |

An OpenSearch adapter's query DSL should express these as **term/terms filters on stable keys**,
never as free-text matches:

```json
{
  "bool": {
    "filter": [
      { "term":  { "city_id": 42 } },
      { "term":  { "direction_key": "N" } },
      { "range": { "distance_km": { "lte": 25 } } },
      { "term":  { "listing_purpose": "sale" } },
      { "term":  { "status": "LIVE" } },
      { "term":  { "archived": false } },
      { "term":  { "is_duplicate": false } },
      { "term":  { "area_resolution_status": "RESOLVED" } }
    ]
  }
}
```

The `listingPurpose` filter is the ONLY server-side-supported attribute filter as of PR B
(#2151 OQ2 ruling) — `AgriDestinationFilters` is the documented extension point for any future
server-side filter (e.g. water source, land category), which today remain client-side only
(`useFilteredAgriListings.ts`).

For `findParcels`, the `areaKeys` term filter becomes `{ "terms": { "area_key": [...] } }`,
capped at `AgriDestinationPort.MAX_DESTINATION_AREA_KEYS` (50) — the SAME cap the Postgres adapter
enforces before ever building a query, so the OpenSearch adapter must enforce it identically rather
than relying on OpenSearch's own `terms` limits.

## 3. Bucket-aggregation shape (destination scope / count parity)

`findDestinations` returns one `DestinationBucket` per `area_key`, each carrying a live
`parcelCount`/`parcelAcreage` computed under the active filters. On Postgres this is a
`GROUP BY pl.area_key` over the SAME predicate used by `findParcels` (`AGRI_BASE_PREDICATE`,
see `AgriDestinationPortPostgresAdapter#buildAgriSql`) — this is what makes AC7 count/parcel
parity structural rather than coincidental.

An OpenSearch adapter must reproduce this with a `terms` aggregation on `area_key`, nested inside
the SAME filter context used for the parcel query:

```json
{
  "size": 0,
  "query": { "bool": { "filter": [ /* identical filter list as §2 */ ] } },
  "aggs": {
    "by_area_key": {
      "terms": { "field": "area_key", "size": 5000 },
      "aggs": {
        "parcel_count": { "value_count": { "field": "id" } }
      }
    }
  }
}
```

**`terms.size` MUST be ≥ the city's total destination count, or `findDestinations` silently
truncates scope.** A city-fixed constant (e.g. hardcoding 200) is NOT safe — Bangalore alone has
~313 areas today (Udupi ~14) and a future city could exceed any fixed guess. The adapter must size
this dynamically (e.g. from `agri_destination_classification`'s row count for the city, or a
generous ceiling with an explicit alarm if `sum_other_doc_count > 0` in the aggregation response —
that field is the built-in OpenSearch signal that the `terms` bucket was truncated).

**`track_total_hits: true` is MANDATORY** on the underlying query. OpenSearch caps `hits.total` at
10,000 by default (`"total": {"value": 10000, "relation": "gte"}` once exceeded) — AC7 requires
`ParcelPage.totalMatching` to be the EXACT count, not a capped estimate, or the AC7 parity
assertion (`sum(bucket.parcelCount) == parcelPage.totalMatching`) silently breaks above 10k
matching parcels. `track_total_hits: true` forces an exact count regardless of the 10k cap.

## 4. Request/response example

Request (conceptually — the port call, not raw HTTP):

```java
port.findDestinations(new DestinationScopeQuery(
    "udupi", "N", 25.0,
    new AgriDestinationFilters("sale"),
    /* includeParcelCounts */ true));
```

Response:

```java
new DestinationScope("udupi", List.of(
    new DestinationBucket(
        "IN|KA|Udupi|Brahmavar", "Brahmavar",
        /* distanceKm */ 12.4, /* bearingDeg */ 8.1, /* direction */ "N",
        /* parcelCount */ 7L, /* parcelAcreage */ 23.5)
));
```

Drill-down:

```java
port.findParcels(new ParcelQuery(
    "udupi", List.of("IN|KA|Udupi|Brahmavar"),
    new AgriDestinationFilters("sale"),
    new PageSpec(0, 250), /* viewport */ null));
// -> ParcelPage(content=[...7 AgriParcel...], page=0, size=250, totalMatching=7, hasMore=false)
```

An OpenSearch `findDestinations` implementation issues the aggregation query in §3 and maps each
`by_area_key` bucket, joined with the SAME `agri_destination_classification`-sourced geometry
(`distanceKm`/`bearingDeg`/`direction`/`displayName`) the Postgres adapter reads today — OpenSearch
documents do not need to carry this geometry themselves as long as the adapter fetches it from
Postgres and merges it with the OpenSearch-sourced counts. Whether to denormalise geometry onto the
document (for a single-round-trip query) or keep it a two-step join is an implementation choice for
#1882 Track B; either is compatible with this contract as long as the geometry values used are the
SAME precomputed values (never recomputed per request — AC6).

## 5. Required document fields

Today's OpenSearch document (`DiscoverQueryDsl.SOURCE_FIELDS`) carries `id, listing_number,
property_type, title, locality, area_key, price_paise, land_area, land_area_unit, built_area,
built_area_unit, bedrooms, latitude, longitude, hero_image_url, created_at, updated_at,
first_published_at, last_updated_at, back_to_market_at, rera_number, trust_tier,
possession_status, seller_type, listing_purpose, status, city_slug` — sufficient for most
`AgriParcel` fields, but an Agri adapter additionally needs:

| Field | Present today? | Needed for |
|---|---|---|
| `city_id` (integer) | NO | scoping the `terms` aggregation to one city without a Postgres round-trip |
| `direction_key`, `distance_km`, `bearing_deg` | NO | filtering/bucketing without a join back to Postgres (see known-gap #4 below for the stable-key alternative) |
| `area_resolution_status` | NO | the parity guard both `findDestinations` and `findParcels` require |
| parcel boundary geometry (GeoJSON) | NO | `AgriParcel.boundaryGeoJson` — see known-gap #3 |
| `water_source`, `land_category`, `farmhouse_available`, `fencing_done`, `road_access`,
  `soil_type`, `cultivation_status`, `ownership_type` | NO | the remaining `AgriParcel` fields (#1551/#1494 canonical agri attributes) |
| `land_area`, `land_area_unit` (raw, pre-normalisation) | present as `land_area`/`land_area_unit` | acreage — see known-gap #5, normalisation still needs to happen somewhere |

## 6. Promotion / reindex / cache-invalidation semantics

`agri_destination_classification` is REPLACED atomically (delete-by-city then insert) inside
`CityLaunchPromotionService.launch`'s single transaction, published as part of
`CityNavigationRevisionPromoted` (#2151 PR A). Because per-area geometry constants
(`direction_key`/`distance_km`/`bearing_deg`/`displayName`) would need to be DENORMALISED onto
every OpenSearch listing document under that area (§5), a promotion is not an incremental update —
**every promoted revision forces a CITY-SCOPED REINDEX of all `agricultural_land` documents for
that city**, not a per-listing incremental write. The existing outbox-driven per-listing indexer
(`search.outbox.*`, V81–V83) is the wrong mechanism for this: it reacts to a listing write, not a
geography promotion, and has no city-scoped bulk-reindex trigger today.

Required additions for #1882 Track B (not built here):
- A listener on `CityNavigationRevisionPromoted` that enqueues a city-scoped reindex job for
  `agricultural_land` documents (only — other property types are unaffected by this event).
- The reindex must be atomic from the read side (alias swap, matching the existing
  `scripts/opensearch_rebuild.py` pattern) so a GET in-flight during reindex never sees a mix of
  old and new geometry.
- Cache: `RegionalAreaGroupsController`/`DiscoverAgriMapListingsController` are both
  `Cache-Control: public, max-age=120`. A GET within that TTL window immediately after a promotion
  may read the CDN-cached pre-promotion response. This is a PRE-EXISTING property of the public
  cache (not new to Track B) — promotion is not currently cache-bust-coordinated with the CDN.
  Track B inherits, and does not need to solve, this; a future bounded-cache slice (conditional
  PR D in #2151's plan) is the natural place to add cache-key coordination if measurement
  justifies it.

## 7. Known-gap register (five items, #2151 PR B decisions.pr_b_scope_rulings.oq3_d3t4_register_size)

1. **No in-repo OpenSearch index mapping.** The index mapping is owned externally by
   `scripts/opensearch_rebuild.py`; there is no Java mapping builder or mapping JSON committed to
   this repository today. An Agri-capable mapping (§5's new fields) does not yet exist anywhere.
2. **No OpenSearch Testcontainer in this repo's harness.** `OpenSearchListingsAdapterTest` uses
   `MockRestServiceServer` only. Assertion-backed INTEGRATION evidence for an OpenSearch-primary
   Agri path is not obtainable on current main; #1882 Track B must add one before an OpenSearch
   Agri adapter can ship with real proof rather than a mocked HTTP server.
3. **No parcel-boundary field on the OpenSearch document.** `DiscoverMarkersService` serves
   `agricultural_land` parcel boundaries via `ST_AsGeoJSON(pl.boundary)` from Postgres —
   OpenSearch has no boundary geometry field today, so `AgriParcel.boundaryGeoJson` cannot be
   produced from OpenSearch alone; an adapter would need either a boundary field on the document
   or a Postgres round-trip per parcel (defeating the purpose of an OpenSearch read path).
4. **No stable promoted-geography join field on the document.** OpenSearch documents have no
   `city_id`, no `direction_key`/`distance_km`/`bearing_deg`. Without denormalising these (§5,
   §6), an adapter cannot filter/bucket by direction or distance without a per-request join back
   to `agri_destination_classification` in Postgres — which would defeat the count/parcel parity
   guarantee unless that join is applied identically on both the count and parcel side.
5. **`parcelAcreage` needs pre-normalisation.** `AreaNormalizer.normalize` (unit conversion from
   whatever `land_area_unit` a listing was entered in — acres, sqft, sqm, guntha, etc. — to a
   common basis) is a Java routine over per-row `land_area`/`land_area_unit` and cannot run inside
   an OpenSearch `sum` aggregation. The Postgres adapter works around this by fetching raw rows and
   summing normalised acreage in Java (see `AgriDestinationPortPostgresAdapter#acreageByArea`). An
   OpenSearch aggregation would need a PRE-NORMALISED numeric field (e.g. `land_area_acres`,
   computed at index time) to support a `sum` aggregation — summing raw, mixed-unit `land_area`
   values would silently produce a wrong total.

## 8. Pre-deploy runbook: `agri_destination_classification` coverage (#2151 PR B, B1 — MANDATORY)

**This section states a hard human dependency plainly: the code in this PR does NOT, by itself,
make this deploy safe.** Read this before deploying #2151 PR B to any environment with existing
active cities.

**The gap.** `agri_destination_classification` has exactly ONE production writer — City Launch's
promotion pipeline (`CityLaunchPromotionService.launch`, #2151 PR A). Any city that was PROMOTED
**before** this table/PR A existed has **zero rows** in it today. `AgriDestinationPort`'s sole
implementation (`AgriDestinationPortPostgresAdapter`) reads this table exclusively — there is no
fallback to the legacy `regional_area_classifications` table, deliberately (see PR B's own
`forbidden_items` and `AgriDestinationPortStructuralAntiDriftTest`). For any such city, the public,
unauthenticated, 120s-cached Agri corridor/parcel endpoints
(`RegionalAreaGroupsController`/`DiscoverAgriMapListingsController`) will render **empty** the
moment this PR deploys — indistinguishable, from the outside, from "this city genuinely has no
agri listings".

**The mandatory pre-deploy step.** Before deploying #2151 PR B to an environment with any existing
active city:

1. Enumerate every currently-active city. In this repo's data model that is
   `SELECT slug FROM cities WHERE is_active = true;` — the same set
   `AgriDestinationPortReadinessCheck` (below) checks against.
2. For each active city, re-run City Launch prepare + promote (the pipeline that populates
   `agri_destination_classification`, `com.example.realestate.discover.citylaunch`) — **not** the
   legacy `RegionalClassificationBackfillRunner`/`RegionalClassificationBackfillService`, which
   writes to the unrelated, no-longer-production-read `regional_area_classifications` table and
   will NOT fix this gap.
3. Confirm zero cities remain flagged — see the startup check below, or query directly:
   `SELECT c.slug FROM cities c WHERE c.is_active = true AND NOT EXISTS (SELECT 1 FROM
   agri_destination_classification adc WHERE adc.city_id = c.id);` should return no rows.

**The safety net, not a substitute for step 2.** `AgriDestinationPortReadinessCheck`
(`backend/src/main/java/com/example/realestate/discover/AgriDestinationPortReadinessCheck.java`)
runs once at application startup (`ApplicationReadyEvent`) and **ERROR-logs**, by city slug, every
active city with zero `agri_destination_classification` rows, pointing back at this section. It is
a loud, fail-visible detector — deliberately NOT a fallback, NOT a repair tool, and NOT an admin
endpoint (those were considered and rejected; see B1 in the PR B report). Its presence does not
change the pre-deploy obligation above: a city flagged by this check at startup has ALREADY served
empty Agri corridor/parcel responses to real anonymous users for however long it took someone to
notice the ERROR log. Step 2 must happen **before** the deploy, not be discovered **after** it via
this check.

## 9. What is NOT in scope for #2151

Per decision.d3 (`team-lead-plan.toml`), #2151 does not implement an OpenSearch adapter, does not
enable OpenSearch for any path, does not modify the OpenSearch document model or indexing outbox,
and does not touch `scripts/opensearch_rebuild.py`. This document is the specification a future
Track B implementer inherits — it is not itself an implementation.
