# ADR: Discover OpenSearch Search Architecture

**Status:** PROPOSED  
**Date:** 2026-05-27  
**Author:** Architecture review  
**Supersedes:** N/A  
**Related:** [#1162 Discover performance & search scale audit](https://github.com/lovable/udupi-property-explorer/issues/1162), [docs/audit/discover-performance-scale-audit-2026-05.md](../audit/discover-performance-scale-audit-2026-05.md)

---

## 0. Decision Summary (TL;DR)

**Current state:** Discover search runs against Postgres using a V18 generated `tsvector` column (`title + locality + description`) and PostGIS geo queries. The production dataset is 1,466 total listings with **13 LIVE** as of the #1162 audit baseline (2026-05-10). No adoption trigger for a dedicated search engine is currently met.

**Decision:** Design an OpenSearch read model as the eventual search backend for Discover, triggered by measurable adoption criteria — NOT deployed to production today. The Postgres `tsvector` path remains the active implementation until triggers are met.

**Adoption triggers** (from the #1162 audit §9 — ALL must be re-evaluated before production OpenSearch enablement):

| Trigger | Threshold | Current |
|---|---|---|
| P95 FTS query latency | > 200ms on `/api/discover/markers` or `/api/discover/listings` with `q` | Not measured (no load) |
| P95 ST_DWithin latency | > 300ms | Not measured |
| LIVE listing volume | > 500K LIVE listings | 13 |
| Insert rate | > 500 inserts/min sustained | ~0 |
| Product requirement | Faceted search or autocomplete feature | Not yet filed |

**Recommended approach when triggered:**

1. Postgres remains the **source of truth** for all data.
2. OpenSearch becomes a **search read model** — an eventually-consistent, denormalized projection optimized for text search, faceted filtering, geo-distance, and relevance ranking.
3. Synchronization via a **transactional outbox** pattern (one new Postgres table; no new infrastructure until Kafka triggers are met).
4. A **feature flag** controls whether Discover queries route to Postgres or OpenSearch, enabling shadow-mode validation before full cutover.
5. The outbox outperforms direct synchronous indexing on durability; Kafka/CDC is deferred until the outbox shows sustained queue lag.

**Stage classification:** This is a **Growth-stage design written for an MVP-stage codebase**. Sections are staged explicitly. Nothing in §§ 1–9 should be built until at least one adoption trigger is met and a Phase 1 POC validates local latency.

---

## 1. Current State and Problem

### 1.1 V18 Full-Text Search (Postgres)

File: `backend/src/main/resources/db/migration/V18__add_listing_fts_vector.sql`

```sql
ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector(
                'english',
                coalesce(title, '') || ' ' ||
                coalesce(locality, '') || ' ' ||
                coalesce(description, '')
            )
        ) STORED;

CREATE INDEX IF NOT EXISTS idx_property_listings_search_vector
    ON public.property_listings USING gin(search_vector);
```

**Coverage:** `title`, `locality`, `description` only. `property_type`, `seller_type`, `area_key`, `city_slug`, `bedrooms`, `price_paise` are NOT in the tsvector — they are separate exact-match predicates applied alongside the GIN index.

**Three active code paths use this vector:**

| Code path | Location | Scope | Access |
|---|---|---|---|
| `ListingRepository.findBySearch` | `ListingRepository.java` | Dashboard search; filters by `status IN ('SCRAPED','LIVE')`, orders by `trust_tier + ts_rank` | Auth-gated |
| `DiscoverListingPredicateBuilder` | `DiscoverListingPredicateBuilder.java` | Discover auth path; raw JDBC WHERE clause: `pl.search_vector @@ websearch_to_tsquery('english', ?)` | Auth-gated |
| `CityAreaListingsService` | `CityAreaListingsService.java` | Public anon path; FTS in LEFT JOIN ON clause so zero-listing areas still return | Public |

### 1.2 V73 PostGIS Geography (Postgres)

File: `backend/src/main/resources/db/migration/V73__postgis_geog.sql`

```sql
-- geog geography(Point,4326) GENERATED ALWAYS from latitude, longitude
-- GiST index: idx_property_listings_geog
```

The `geog` column is a generated geography column derived from `latitude` and `longitude`. It is **not mapped in the Listing JPA entity** — it is accessible only via native queries.

**Active geo predicates in `DiscoverListingPredicateBuilder`:**

| Predicate | SQL form | Use case |
|---|---|---|
| School radius | `ST_DWithin(pl.geog, ST_MakePoint(lon, lat)::geography, radiusKm*1000)` | School-first journey |
| Bounding box | `pl.geog && ST_MakeEnvelope(west,south,east,north,4326)::geography` | Map viewport filter |
| Polygon | Two-stage: `ST_Intersects` (prefilter) + `ST_Contains` (precise) | Custom area polygon |
| FTS combined | All geo predicates can combine with `search_vector @@ ...` | Combined geo+text |

**Base filter always applied:** `pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false`

### 1.3 Current Scale Baseline (#1162 audit, 2026-05-10)

| Metric | Value |
|---|---|
| Total property_listings rows | 1,466 |
| LIVE listings | **13** |
| Schools | 294 |
| Areas | 33 |
| Cities | 4 |
| Automated insert pipeline | None |
| Load tests run | None |
| Scale projections | Estimates only — not confirmed by measurement |

### 1.4 The Problem (Forward-Looking)

The Postgres `tsvector` approach has three limitations that manifest at scale but do not exist today:

1. **Relevance ranking:** `ts_rank` provides basic ranking but no field-weight tuning, phrase boosting, or BM25 scoring across heterogeneous filter combinations.
2. **Faceted aggregations:** Postgres `GROUP BY` for facet counts (price buckets, property type counts, locality counts) must re-execute the full filter predicate per facet — expensive at >100K rows under concurrent load.
3. **Autocomplete / suggest:** Prefix and completion suggestions are not natively supported by the GIN tsvector index and require separate infrastructure (`pg_trgm` or a dedicated suggester).

None of these limitations are currently observed. The design below is intended to be built when one or more adoption triggers (§0) are met, not speculatively.

---

## 2. Goals and Non-Goals

### Goals

- Define the OpenSearch document shape, query model, indexing pipeline, and lifecycle event mapping precisely enough that two engineers can implement independently.
- Establish a transactional outbox as the synchronization mechanism — durable, decoupled, and retryable.
- Define a feature-flag-gated shadow mode so OpenSearch can be validated against Postgres results before cutover.
- Document security boundaries: what data is never indexed, what cluster access is never public.
- Provide a phased implementation backlog with clear trigger criteria for each phase.

### Non-Goals

- **Do not build this now.** No code or schema changes until an adoption trigger is met.
- **Do not replace Postgres.** OpenSearch is a derived read model only; Postgres remains the source of truth for all writes, audit, RLS, and authoritative reads.
- **Do not gate detail views on OpenSearch.** Listing detail pages always hydrate from Postgres.
- **Do not design Kafka/CDC.** That is deferred to a separate ADR when outbox lag is sustained.
- **Do not design mobile or app-specific search.** This ADR covers the Spring Boot backend API layer only.
- **Do not add new auth rules.** Existing endpoint-level auth (`/api/discover/*` JWT requirement) is unchanged.

---

## 3. Source of Truth vs Search Read Model

### Postgres = Source of Truth

Postgres (via Supabase) owns:

- All listing fields (status, price, geometry, images, contact info, audit trail)
- Ownership relationships (broker ↔ listing, admin actions)
- Status transitions and audit history (`status_changed_at`, `status_changed_by_actor_*`, `status_reason_*`)
- Reference data: areas, cities, schools
- User identity and RLS access control
- Hard-delete and archival records

**Writes always go to Postgres first.** The OpenSearch document is derived from Postgres data, never the reverse.

### OpenSearch = Search Read Model

OpenSearch owns:

- A denormalized projection of LIVE listing data optimized for text search, faceted aggregation, geo-distance scoring, and relevance ranking.
- **Eventually consistent** with Postgres. The lag target is seconds (outbox poll interval), not milliseconds.
- **Never authoritative.** If an OpenSearch document disagrees with Postgres, Postgres wins.

**Consequences:**

| Operation | Backend |
|---|---|
| Listing card display in Discover search results | OpenSearch (display fields stored in document — see §4) |
| Listing detail page | Postgres (always hydrate from authoritative source) |
| Total count for a search | OpenSearch |
| Facet counts (property type, price bucket, locality) | OpenSearch |
| Status check before booking or contact | Postgres (re-read before action) |
| Admin view of listing (all fields) | Postgres |

### Full Card vs ID-Only Hydration

**Decision: Hybrid approach.**

Display fields required to render a listing card (title, locality, price_paise, bedrooms, property_type, hero_image_url, listing_number, latitude, longitude, trust_tier) are stored in the OpenSearch document. This avoids a Postgres `IN (id1, id2, ...)` round-trip on every search page.

Listing detail (full description, contact info, all images, school proximity data, area metadata, audit fields) is hydrated from Postgres.

**Alternative considered and rejected:** ID-only hydration (OpenSearch returns IDs; Spring Boot fetches full rows from Postgres). Rejected because: it adds a Postgres query on every search page; the fields needed for card display are already not sensitive; there is no consistency benefit because status and price are also in the document and must be re-verified at action time regardless.

---

## 4. Listing Search Document Shape

The following mapping defines the OpenSearch document for a listing. Sensitive fields are explicitly excluded.

### 4.1 Field Mapping Table

| Field | OpenSearch type | Source column | Purpose |
|---|---|---|---|
| `id` | `keyword` | `id` (UUID) | Document ID, JOIN key back to Postgres |
| `listing_number` | `integer` | `listing_number` | Card display, human-readable ID |
| `title` | `text` (analyzed, English) | `title` | Full-text search, primary match |
| `locality` | `text` (analyzed, English) | `locality` | Full-text search, secondary match |
| `description` | `text` (analyzed, English) | `description` | Full-text search, tertiary match |
| `locality_keyword` | `keyword` | `locality` | Facet bucket (exact grouping) |
| `geo_point` | `geo_point` | `latitude`, `longitude` | Geo-distance queries, map rendering |
| `status` | `keyword` | `status` | Always filtered: `LIVE` only |
| `is_duplicate` | `boolean` | `is_duplicate` | Always filtered: `false` |
| `archived` | `boolean` | `archived_at IS NULL → false` | Always filtered: `false` |
| `property_type` | `keyword` | `property_type` | Filter, facet |
| `listing_purpose` | `keyword` | `listing_purpose` | Filter, facet |
| `seller_type` | `keyword` | `seller_type` | Filter, facet |
| `area_key` | `keyword` | `area_key` | Filter (area-scoped search) |
| `city_slug` | `keyword` | Joined from `areas` table at index time | Filter (city-scoped search) |
| `price_paise` | `long` | `price_paise` | Range filter, sort, price bucket facet |
| `price_bucket` | `keyword` | Computed at index time (e.g. `"10L-25L"`) | Facet aggregation |
| `bedrooms` | `integer` | `bedrooms` | Filter, facet |
| `rera_number` | `keyword` | `rera_number` | Exists filter for `reraRegistered` flag |
| `possession_status` | `keyword` | `possession_status` | Filter for `readyToMove` flag |
| `first_published_at` | `date` | `first_published_at` | Range filter for `newToMarket` (7-day window) |
| `back_to_market_at` | `date` | `back_to_market_at` | Range filter for `backOnMarket` (30-day window) |
| `created_at` | `date` | `created_at` | Sort, recency filter |
| `updated_at` | `date` | `updated_at` | Stale-document detection |
| `hero_image_url` | `keyword` (not analyzed) | `listing_images` WHERE `position=1` | Card display |
| `trust_tier` | `keyword` | `trust_tier` | Sort (tie-break after relevance) |
| `ranking_score` | `integer` | `ranking_score` | Sort (tie-break after trust_tier) |
| `land_area` | `float` | `land_area` | Card display |
| `land_area_unit` | `keyword` | `land_area_unit` | Card display |
| `built_area` | `float` | `built_area` | Card display |
| `built_area_unit` | `keyword` | `built_area_unit` | Card display |

### 4.2 Explicitly Excluded Fields (Never Indexed)

The following fields must never appear in an OpenSearch document:

- `contact_info`, `contact_phone` — user PII
- `rejection_reason`, `status_reason_note`, `status_reason_code` — internal moderation
- `status_changed_by_actor_type`, `status_changed_by_actor_id` — internal audit identity
- `parsed_data`, `raw_post_id`, `dedupe_hash` — scraper internals
- `approvals_declared`, `last_approved_snapshot` — moderation state
- Any broker/user personal identifiers

### 4.3 Geo Point Construction

The `geog` generated column in V73 is **not mapped in the Listing JPA entity**. The indexer reads `latitude` and `longitude` scalar columns and constructs the geo_point document field:

```json
"geo_point": { "lat": listing.latitude, "lon": listing.longitude }
```

This is structurally equivalent to the V73 PostGIS geography column for distance queries but in OpenSearch's native format.

### 4.4 Future Facets (Do Not Build Now)

- `school_name`, `school_area_key`: denormalized school proximity — deferred (see §15, open decision 5).
- Completion suggester sub-field on `title` and `locality_keyword`: deferred to autocomplete feature request.

---

## 5. Query Model — How Filters Combine

All Discover queries map to an OpenSearch bool DSL structure. The following template covers all filter combinations in `DiscoverListingPredicateBuilder.Filters`:

```json
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "status": "LIVE" } },
        { "term": { "is_duplicate": false } },
        { "term": { "archived": false } },
        { "term": { "city_slug": "<city_slug>" } },

        // Conditionally added — omit if not provided:
        { "terms": { "property_type": ["apartment", "villa"] } },
        { "terms": { "seller_type": ["owner", "broker"] } },
        { "terms": { "bedrooms": [2, 3] } },
        { "term": { "area_key": "<area_key>" } },
        { "range": { "price_paise": { "gte": 1000000, "lte": 5000000 } } },
        { "range": { "first_published_at": { "gte": "now-7d/d" } } },
        { "range": { "back_to_market_at": { "gte": "now-30d/d" } } },
        { "exists": { "field": "rera_number" } },
        { "term": { "possession_status": "ready_to_move" } },

        // Geo — one of:
        {
          "geo_distance": {
            "distance": "5km",
            "geo_point": { "lat": 13.0827, "lon": 80.2707 }
          }
        },
        {
          "geo_bounding_box": {
            "geo_point": {
              "top_left": { "lat": 13.1, "lon": 80.2 },
              "bottom_right": { "lat": 13.0, "lon": 80.3 }
            }
          }
        },
        {
          "geo_polygon": {
            "geo_point": {
              "points": [
                { "lat": 13.1, "lon": 80.2 },
                { "lat": 13.05, "lon": 80.25 },
                { "lat": 13.0, "lon": 80.2 }
              ]
            }
          }
        }
      ],

      "must": [
        // Only added when q is non-blank after trim:
        {
          "multi_match": {
            "query": "school near park",
            "fields": ["title^3", "locality^2", "description"],
            "type": "best_fields"
          }
        }
      ]
    }
  },

  "sort": [
    { "_score": "desc" },
    { "trust_tier": { "order": "asc" } },
    { "ranking_score": { "order": "desc" } },
    { "created_at": { "order": "desc" } }
  ],

  "from": 0,
  "size": 20
}
```

### 5.1 Filter Semantics

| Filter field | Bool clause | Notes |
|---|---|---|
| `status`, `is_duplicate`, `archived`, `city_slug` | `filter` (mandatory) | Always present; no relevance contribution |
| `property_type`, `seller_type`, `bedrooms`, `area_key` | `filter` (conditional) | Added when non-null in `Filters` record |
| `price_paise` range | `filter` (conditional) | `priceMinPaise` and/or `priceMaxPaise` |
| `dateFrom`/`dateTo` | `filter` range on `created_at` | Date-picker filter |
| `backOnMarket` | `filter` range on `back_to_market_at` | `gte: now-30d/d` |
| `newToMarket` | `filter` range on `first_published_at` | `gte: now-7d/d` |
| `reraRegistered` | `filter` exists on `rera_number` | Boolean presence check |
| `readyToMove` | `filter` term on `possession_status` | Exact match |
| `q` (keyword search) | `must` multi_match | Only when non-blank; contributes to `_score` |
| Geo (radius/bbox/polygon) | `filter` geo query | Geo filters do NOT contribute to `_score` |

### 5.2 Facet Aggregations (for future facet panel)

```json
{
  "aggs": {
    "property_type_counts": { "terms": { "field": "property_type", "size": 20 } },
    "price_bucket_counts": { "terms": { "field": "price_bucket", "size": 10 } },
    "locality_counts": { "terms": { "field": "locality_keyword", "size": 30 } },
    "bedrooms_counts": { "terms": { "field": "bedrooms", "size": 10 } },
    "total_count": { "value_count": { "field": "id" } }
  }
}
```

Aggregations run on the same filtered query. This avoids separate COUNT(*) GROUP BY queries. Do not build the facet panel before this ADR is adopted.

---

## 6. Indexing Pipeline Options

### 6A. Direct Synchronous Indexing

**Mechanism:** `ListingWorkflowService` calls the OpenSearch Java client directly after every status transition or field update. The OpenSearch HTTP call is made inline, before returning from the service method.

**Pros:**
- Immediate index consistency — search reflects changes within milliseconds.
- Simplest implementation: no new tables, no background jobs.

**Cons:**
- Couples domain logic to search infrastructure. A transient OpenSearch failure causes the status transition itself to fail (or must be caught and silently ignored — losing the update).
- Adds latency to write operations (every status change now pays an HTTP round-trip to OpenSearch).
- No durability: if OpenSearch is unavailable when the transition happens, the index update is lost permanently.
- Not retryable without application-level state.

**Verdict: NOT RECOMMENDED for production.** Acceptable only for the Phase 1 local POC (§13) where durability and decoupling are not requirements.

### 6B. Transactional Outbox Pattern (Recommended)

**Mechanism:**

1. `ListingWorkflowService` writes a row to `listing_search_outbox` **in the same database transaction** as the status change. The outbox row is committed atomically with the listing update — either both succeed or neither does.
2. A Spring Boot `@Scheduled` worker polls the outbox every 2–5 seconds, reads pending rows, sends a `_bulk` request to OpenSearch, and marks rows as processed.
3. Failed rows get exponential backoff (attempt_count increment). After `MAX_RETRIES` (suggested: 5), rows move to `listing_search_outbox_dlq` for manual inspection.

**Outbox table schema (new table, next available migration = V81+):**

```sql
CREATE TABLE listing_search_outbox (
    id              BIGSERIAL PRIMARY KEY,
    listing_id      UUID NOT NULL,
    event_type      TEXT NOT NULL,       -- 'UPSERT' | 'DELETE'
    payload         JSONB,               -- pre-built document snapshot (nullable for DELETE)
    status          TEXT NOT NULL DEFAULT 'PENDING',  -- 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON listing_search_outbox (status, next_retry_at)
    WHERE status IN ('PENDING', 'PROCESSING');
```

**DLQ table:**

```sql
CREATE TABLE listing_search_outbox_dlq (
    id              BIGSERIAL PRIMARY KEY,
    original_outbox_id BIGINT,
    listing_id      UUID NOT NULL,
    event_type      TEXT NOT NULL,
    payload         JSONB,
    error_detail    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Pros:**
- Atomic with the Postgres write — no lost updates even on OpenSearch outage.
- Decoupled: OpenSearch availability does not affect listing workflow.
- Retryable with exponential backoff.
- Observable: DLQ depth is a simple metric.
- Eventual consistency lag: 2–5 seconds (one polling cycle), which is acceptable for Discover.

**Cons:**
- One new Postgres table (V81+ migration).
- One new Spring Boot background job (small addition to existing scheduled task infrastructure).
- Seconds-level eventual consistency (not milliseconds). Acceptable for search; not acceptable for booking or contact.

**Verdict: RECOMMENDED.** Minimal new infrastructure, maximum durability.

### 6C. Kafka / CDC (Debezium)

**Mechanism:** Postgres WAL → Debezium connector → Kafka topic (`listing.changes`) → Spring Boot consumer → OpenSearch `_bulk`.

**Pros:**
- True change-data-capture — catches every write including direct DB updates that bypass the service layer.
- Supports multiple consumers (analytics, notifications, OpenSearch) from one stream.
- Horizontally scalable consumer group.

**Cons:**
- Significant operational overhead: Kafka cluster, Zookeeper (or KRaft), Debezium connector, schema registry, consumer group management.
- Requires Postgres WAL-level access (not always available on managed Supabase).
- Adds a new failure domain (Kafka availability) to the write path.
- Engineering investment: 3–5x the implementation effort of the outbox.

**When appropriate:** Sustained insert rate > 500/min for > 1 hour AND a second consumer of the same change stream is identified.

**Current state:** 0 automated inserts/min. **Verdict: DEFERRED.** Write a separate ADR when outbox queue lag is observed under real load.

---

## 7. Recommended Architecture

The recommended architecture introduces OpenSearch as a search read model behind a feature flag, synchronized from Postgres via a transactional outbox. It is organized into nine phases to allow incremental validation at each stage.

### Phase 1 — Local POC (Shadow Mode)

**Goal:** Validate that an OpenSearch document can be built from real listing data and that query results match the Postgres path.

Actions:
- Add `opensearch-java` client as a backend dependency (scoped to dev initially).
- Add a single-node OpenSearch container to `docker-compose.override.yml` (no security plugin for local development).
- Write a `BulkIndexScript` Spring Boot `CommandLineRunner` (dev profile only) that SELECTs all LIVE listings from Postgres, builds documents per §4, and bulk-indexes into `listings-v1`.
- Implement `DiscoverMarkersServiceOpenSearch` and `DiscoverListingsServiceOpenSearch` behind a feature flag: `discover.search.backend=postgres|opensearch` in `application-local.properties` only.
- Shadow mode: call both Postgres and OpenSearch in parallel, return the Postgres result to the caller, log result diffs for inspection.

**Exit criteria:** Shadow mode diff rate < 1% on a seeded dataset of real LIVE listings.

**No production deployment in this phase.**

### Phase 2 — Transactional Outbox Infrastructure

**Goal:** Replace the one-time bulk script with a durable, event-driven synchronization pipeline.

Actions:
- Add `listing_search_outbox` and `listing_search_outbox_dlq` tables (V81+ Flyway migration).
- Add outbox event writer to `ListingWorkflowService` — one row per status transition and per relevant field update, inside the existing transaction.
- Implement the `@Scheduled` indexer worker: poll pending rows, build documents, bulk-index, mark processed, increment retry count on failure.
- DLQ handling: rows exceeding `MAX_RETRIES` moved to DLQ; alert on DLQ depth > 0.

**Exit criteria:** Status transitions are reflected in OpenSearch within 10 seconds under normal operation. DLQ remains empty over 48 hours of testing.

### Phase 3 — Index Versioning and Backfill

**Goal:** Establish zero-downtime reindex capability before any production traffic is sent to OpenSearch.

Actions:
- Adopt versioned index names: `listings-v1`, `listings-v2`, etc.
- Create read alias `listings-current` and write alias `listings-write`.
- Implement backfill job: SELECT all LIVE listings, bulk-index in batches of 500–1000.
- Document blue-green alias swap procedure (see §9).

**Exit criteria:** Full backfill completes without errors. Alias swap procedure tested in staging.

### Phase 4 — Metrics and Observability

**Goal:** Instrument the system before routing any production traffic.

Actions:
- Micrometer gauges: OpenSearch query latency (P95/P99), outbox queue depth, index divergence (Postgres LIVE count vs OpenSearch doc count), DLQ depth, indexer worker error rate.
- Alerts: DLQ depth > 0; outbox head-of-queue age > 30 seconds; index divergence > 1%.
- Dashboard: Grafana or equivalent.

**Exit criteria:** All metrics visible. Alerts fire correctly on injected failures.

### Phase 5 — Stale-Index Fallback / Circuit Breaker

**Goal:** Ensure OpenSearch unavailability never breaks Discover.

Actions:
- Wrap all OpenSearch calls in a try/catch with transparent fallback to the Postgres `DiscoverListingPredicateBuilder` path.
- Add a circuit breaker (Spring Resilience4j or manual flag) that opens after N consecutive OpenSearch failures and routes all traffic to Postgres until OpenSearch recovers.
- Log and alert when the circuit opens.

**Exit criteria:** With OpenSearch stopped, Discover continues to serve results via Postgres. Circuit state is visible in metrics.

### Phase 6 — Staging Validation

**Goal:** Validate correctness and latency against real traffic patterns in a non-production environment.

Actions:
- Deploy OpenSearch (single-node or small cluster) in the staging environment.
- Enable shadow mode on staging.
- Run representative load tests against staging (target: P95 text search < 50ms, P95 geo-distance < 30ms, combined < 80ms).
- Compare result sets between Postgres and OpenSearch paths.

**Exit criteria:** P95 latency targets met. Shadow-mode diff rate < 0.1% on staging traffic.

### Phase 7 — Production Feature Flag Rollout

**Goal:** Gradually shift production Discover traffic from Postgres to OpenSearch.

Actions:
- Add `discover.search.backend` feature flag to production `application.properties` (default: `postgres`).
- Enable OpenSearch for 5% of requests; monitor error rate and latency.
- Ramp to 25%, 50%, 100% with hold periods at each step.
- Remove shadow-mode logging after 100% cutover (noisy and doubles query load).

**Exit criteria:** Zero error rate increase. P95 latency within targets. OpenSearch document count matches Postgres LIVE count ± 1%.

### Phase 8 — Faceted Aggregations

**Goal:** Enable facet counts in the Discover filter panel without additional Postgres queries.

Actions:
- Add aggregation clauses to OpenSearch queries (see §5.2).
- Add `DiscoverFacetsResponse` DTO and `/api/discover/facets` endpoint (or embed in existing listing/markers response).
- Frontend: wire facet counts to filter panel UI (separate issue).

**Exit criteria:** Facet counts are returned from OpenSearch with < 10ms overhead on typical queries.

### Phase 9 — Autocomplete (Deferred)

**Goal:** Provide prefix-completion suggestions for locality and title search.

Actions: Defined in a follow-up ADR after the completion suggester product requirement is formally filed. Do not build in this phase.

---

## 8. Owner / Broker / Admin Lifecycle → Indexing Events

The following table maps every status transition defined in `ListingWorkflowService` to the corresponding OpenSearch indexing action.

| Transition | Trigger | Action | Priority |
|---|---|---|---|
| Any → LIVE (approve, approve-scraped) | `AdminListingController` → `ListingWorkflowService` | **INDEX UPSERT** — build full document, write outbox row | CRITICAL |
| LIVE + field update (price, title, locality, bedrooms, area_key, lat/lon) | Broker or admin edit via `ListingService` | **INDEX UPSERT** — rebuild affected fields, write outbox row | HIGH |
| LIVE + hero image change (`listing_images` WHERE `position=1` changes) | Image reorder or upload via listing images service | **INDEX UPSERT** — update `hero_image_url` only | MEDIUM |
| LIVE + `area_key` or lat/lon change (area re-assignment) | Admin re-assignment | **INDEX UPSERT** — update geo_point + area_key + city_slug | HIGH |
| LIVE → REJECTED | Admin reject | **INDEX DELETE** | CRITICAL |
| LIVE → ARCHIVED | Soft-delete | **INDEX DELETE** | CRITICAL |
| LIVE → ARCHIVED → DRAFT → PENDING_REVIEW | Restore flow | **NO ACTION** until next LIVE transition | — |
| PENDING_REVIEW → REJECTED | Admin reject before listing was ever LIVE | **NO ACTION** (document does not exist in index) | — |
| PENDING_REVIEW → DRAFT (return-for-edits) | Admin return | **NO ACTION** (not LIVE) | — |
| SCRAPED → DRAFT (broker claim) | Broker claim | **NO ACTION** | — |
| REJECTED → LIVE (admin restore) | Admin | **INDEX UPSERT** — treat as new LIVE transition | CRITICAL |
| ARCHIVED → DRAFT (admin restore) | Admin | **NO ACTION** until next LIVE transition | — |
| Admin hard DELETE | `AdminListingController` DELETE | **INDEX DELETE** (idempotent — OK if doc not found) | CRITICAL |
| Bulk status change (future) | Batch admin operation | **INDEX UPSERT or DELETE** per row, batched | HIGH |

### 8.1 Outbox Event Payload

The outbox row `payload` column (JSONB) contains the pre-built document snapshot for UPSERT events:

```json
{
  "event_type": "UPSERT",
  "listing_id": "uuid-here",
  "document": {
    "id": "uuid-here",
    "title": "...",
    "locality": "...",
    "geo_point": { "lat": 13.08, "lon": 80.27 },
    "status": "LIVE",
    "city_slug": "udupi",
    "price_paise": 2500000,
    ...
  }
}
```

For DELETE events, `payload` is null; the indexer uses `listing_id` only.

### 8.2 Field Sources at Index Time

The indexer must JOIN to resolve fields not available on `property_listings` alone:

| Field in document | Source |
|---|---|
| `city_slug` | `areas` table: `WHERE area_key = pl.area_key` |
| `hero_image_url` | `listing_images` table: `WHERE listing_id = pl.id AND position = 1` |
| `price_bucket` | Computed in-process from `price_paise` |
| `geo_point` | `pl.latitude`, `pl.longitude` (NOT the `geog` computed column) |

---

## 9. Reindex, Backfill, and Index Versioning

### 9.1 Versioned Index Names

All indices use versioned names: `listings-v1`, `listings-v2`, etc. Aliases decouple the application from the physical index name:

- `listings-current` — read alias, points to the active index
- `listings-write` — write alias, points to the active index during normal operation; points to the new index during a reindex build

### 9.2 Blue-Green Alias Swap Procedure

```
1. Create listings-v2 with updated mapping.
2. Run full backfill into listings-v2 (see §9.3).
3. Update outbox indexer to write to listings-v2 (via listings-write alias).
4. Wait for outbox to drain (confirm listings-v2 is current).
5. Atomic alias swap:
     POST /_aliases
     { "actions": [
         { "remove": { "index": "listings-v1", "alias": "listings-current" } },
         { "add":    { "index": "listings-v2", "alias": "listings-current" } }
     ]}
6. Verify query results on listings-current.
7. Delete listings-v1 after 24h hold period.
```

This procedure results in zero downtime and zero missed updates.

### 9.3 Backfill Batch Size

Recommended batch size: 500–1000 documents per `_bulk` request. At the current scale of 13 LIVE listings, a single batch covers the entire index. At 100K LIVE listings, a 500-document batch size produces 200 requests — manageable without rate-limiting.

SQL for backfill source:

```sql
SELECT pl.*, a.city_slug,
       (SELECT url FROM listing_images WHERE listing_id = pl.id AND position = 1 LIMIT 1) AS hero_image_url
FROM property_listings pl
LEFT JOIN areas a ON a.area_key = pl.area_key
WHERE pl.status = 'LIVE'
  AND pl.archived_at IS NULL
  AND pl.is_duplicate = false
ORDER BY pl.created_at ASC
```

### 9.4 Incremental Reindex

For mapping changes that are backward-compatible (adding new fields), an incremental reindex can update existing documents:

```sql
WHERE pl.updated_at >= :last_reindex_timestamp
```

Track `last_reindex_timestamp` in an application config table or Spring Boot property.

---

## 10. Stale Index and Failure Handling

### 10.1 Outbox DLQ

Rows in `listing_search_outbox` that exceed `MAX_RETRIES` (recommended: 5) are moved to `listing_search_outbox_dlq`. The indexer worker sends an alert on DLQ depth > 0.

DLQ rows require manual inspection. Common causes: malformed document payload (schema mismatch), OpenSearch cluster down for > retry window, mapping conflict.

Resolution: fix the root cause, then re-insert corrected rows into `listing_search_outbox` with `attempt_count = 0`.

### 10.2 Periodic Reconciliation

A daily scheduled job compares:

```sql
-- Postgres count
SELECT COUNT(*) FROM property_listings
WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false;

-- OpenSearch count
GET /listings-current/_count
{ "query": { "term": { "status": "LIVE" } } }
```

Alert if the delta exceeds 1% of the Postgres count. A persistent delta indicates an outbox processing failure or a missed event (e.g., a direct DB update bypassing the service layer).

### 10.3 Stale-Document Detection

For each listing in the reconciliation sample, compare `updated_at` in Postgres vs `_source.updated_at` in OpenSearch. A document where OpenSearch `updated_at` is more than 60 seconds behind Postgres `updated_at` is considered stale. Log and alert; re-enqueue via the outbox.

### 10.4 Circuit Breaker (Phase 5)

When OpenSearch is unavailable, the circuit breaker pattern routes all Discover queries to the Postgres path transparently. The caller receives valid results; the OpenSearch outage is logged and alerted. The circuit closes (returns to OpenSearch) after a configurable recovery window.

Spring Boot Resilience4j `CircuitBreaker` is the recommended implementation — it is already a Spring ecosystem standard and avoids a new dependency.

### 10.5 Index Size Estimate

At 1 KB per document average (text fields + metadata):

| LIVE listings | Index size |
|---|---|
| 1,000 | ~1 MB |
| 100,000 | ~100 MB |
| 1,000,000 | ~1 GB |

A single-node OpenSearch instance with 4 GB JVM heap is sufficient up to approximately 5M documents. Scale beyond that requires a separate cluster sizing exercise.

---

## 11. Metrics and Operational Requirements

### 11.1 Query Latency Targets

| Query type | P95 target | P99 target |
|---|---|---|
| Text search only (`q` non-blank) | < 50ms | < 100ms |
| Geo-distance only (school radius) | < 30ms | < 60ms |
| Combined text + geo + filters | < 80ms | < 150ms |
| Facet aggregations | < 20ms overhead | < 40ms overhead |

These targets are for OpenSearch queries only (excluding Spring Boot processing and network overhead). They should be measured in Phase 6 (staging validation) before Phase 7 (production rollout).

### 11.2 Outbox / Indexer Metrics

| Metric | Alert threshold |
|---|---|
| Outbox queue depth (PENDING rows) | > 100 rows |
| Outbox head-of-queue age | > 30 seconds under normal load |
| DLQ depth | > 0 |
| Indexer worker error rate | > 1% of attempts |
| Index divergence (Postgres LIVE vs OpenSearch count) | > 1% |

### 11.3 OpenSearch Cluster Health

| Metric | Alert threshold |
|---|---|
| Cluster status | Not GREEN |
| JVM heap used | > 75% |
| Disk usage | > 80% |
| Index segment count | > 1000 (triggers force-merge) |
| Unassigned shards | > 0 |

### 11.4 Future Search Quality Metrics (Phase 7+)

- Zero-results rate: percentage of searches returning 0 hits (baseline and trend).
- Click-through rate by rank position: measures relevance quality.
- Mean reciprocal rank (MRR): aggregate relevance quality signal.

These metrics require frontend instrumentation and are not part of the backend ADR scope.

---

## 12. Security and Public-Data Boundary

### 12.1 Cluster Access

- The OpenSearch cluster must **not** be publicly accessible. Only the Spring Boot application network (same VPC or equivalent) can reach the cluster.
- No direct browser-to-OpenSearch queries. All search goes through the Spring Boot API layer.
- If deployed on AWS, use Amazon OpenSearch Service with VPC-only access and IAM signing for HTTP requests.
- For local development, the single-node Docker container runs without the security plugin (no TLS, no auth) — this is acceptable for dev-only use and must not be replicated in staging or production.

### 12.2 Document Redaction (Enforced at Index Time)

The indexer must never write the fields listed in §4.2 to the document. This is enforced by the document-builder class, not by OpenSearch field-level security (which would be a second line of defense, not the primary control).

### 12.3 Query-Time Security (Unchanged from Current)

Endpoint-level auth rules are **not changed** by this ADR:

| Endpoint | Access | Note |
|---|---|---|
| `/api/discover/markers` | JWT required | Routes to OpenSearch in Phase 7 |
| `/api/discover/listings` | JWT required | Routes to OpenSearch in Phase 7 |
| `/api/discover/cities/{city}/listings` | Public | Remains on `CityAreaListingsService` (Postgres) — out of OpenSearch scope |
| OpenSearch cluster | No public access | Spring Boot internal only |

The public `/api/discover/cities/{city}/listings` path uses `CityAreaListingsService` with a LEFT JOIN structure that ensures zero-listing areas still appear. This behavior is not easily replicated in an OpenSearch query and is explicitly kept on the Postgres path.

### 12.4 `is_duplicate` Invariant

The `is_duplicate = false` filter must be present in every OpenSearch query without exception. This is enforced at the `DiscoverListingsServiceOpenSearch` and `DiscoverMarkersServiceOpenSearch` level, not left to callers. Adding it to the index mapping as a filter alias is recommended for defense in depth.

---

## 13. Local Proof-of-Concept Plan

This section describes the minimum viable local POC to validate the architecture before committing to infrastructure investment.

### Prerequisites

- Docker Desktop running
- `docker-compose.override.yml` available (already exists in the repo)
- A local Supabase/Postgres instance with at least one LIVE listing seeded

### Step 1 — Docker Compose Override

Add to `docker-compose.override.yml` (dev only):

```yaml
opensearch:
  image: opensearchproject/opensearch:2.12.0
  environment:
    - discovery.type=single-node
    - DISABLE_SECURITY_PLUGIN=true
    - OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m
  ports:
    - "9200:9200"
```

### Step 2 — Backend Dependency

Add to `backend/pom.xml` (dev scope):

```xml
<dependency>
  <groupId>org.opensearch.client</groupId>
  <artifactId>opensearch-java</artifactId>
  <version>2.12.0</version>
</dependency>
```

### Step 3 — Bulk Index Script

Implement `ListingBulkIndexRunner` as a `CommandLineRunner` annotated `@Profile("dev")`. It:

1. Reads all LIVE listings from Postgres (query per §9.3).
2. Builds documents per §4.
3. POSTs to `POST /listings-v1/_bulk`.

Run once to seed the local index.

### Step 4 — Feature-Flagged Service

Implement `DiscoverMarkersServiceOpenSearch` and `DiscoverListingsServiceOpenSearch`. Wire via a `@ConditionalOnProperty("discover.search.backend")` bean. Default in `application.properties`: `postgres`. Override in `application-local.properties` to `opensearch`.

Inject both implementations into a `DiscoverSearchRouter` that selects based on the property and optionally runs shadow mode (call both, compare, return Postgres result).

### Step 5 — Shadow Mode Validation

Enable shadow mode in `application-local.properties`:

```properties
discover.search.backend=shadow
```

Run representative queries. Log diffs to `search-shadow.log`. Fix any document shape or query logic gaps revealed by the diff.

**Exit criteria for POC:** Shadow diff rate < 1% on 50 representative queries covering text search, geo-distance, and combined filters.

---

## 14. Implementation Backlog

The following issues should be filed when Phase 1 POC work is approved. They are ordered by dependency.

| # | Issue title | Files / components | Depends on | Can run in parallel? | Estimated size |
|---|---|---|---|---|---|
| A | Local OpenSearch POC — Docker Compose, bulk index script, shadow-read feature flag | `docker-compose.override.yml`, `backend/pom.xml`, `ListingBulkIndexRunner.java`, `DiscoverMarkersServiceOpenSearch.java`, `DiscoverListingsServiceOpenSearch.java`, `DiscoverSearchRouter.java` | None | No — first | M |
| B | Transactional outbox — `listing_search_outbox` table + event writer in `ListingWorkflowService` | `V81__listing_search_outbox.sql`, `ListingWorkflowService.java`, `ListingSearchOutboxRepository.java` | A (validated document shape) | No — after A | M |
| C | Indexer worker — `@Scheduled` polling job + DLQ + retry | `ListingSearchIndexerJob.java`, `ListingSearchOutboxDlqRepository.java` | B | No — after B | M |
| D | Backfill/reindex job — bulk index all LIVE listings via outbox or direct | `ListingBackfillService.java` | B, C | After C | S |
| E | Discover query adapter — OpenSearch path for `/api/discover/markers` and `/api/discover/listings` behind feature flag | `DiscoverMarkersServiceOpenSearch.java`, `DiscoverListingsServiceOpenSearch.java`, feature flag config | A, C | After C | L |
| F | Metrics/observability — Micrometer gauges for OpenSearch query latency, outbox queue depth, index divergence | `OpenSearchMetrics.java`, Grafana dashboard | E | Yes (after E) | S |
| G | Stale-index fallback / circuit breaker — transparent Postgres fallback when OpenSearch unavailable | `DiscoverSearchRouter.java`, `CircuitBreakerConfig.java` | E | Yes (after E) | S |
| H | Blue-green alias swap tooling — versioned index + atomic alias swap for zero-downtime reindex | `IndexAliasManager.java`, runbook doc | D | Yes (after D) | S |

---

## 15. Open Decisions

The following decisions are not resolved in this ADR. Each requires either a product decision or an observed trigger before it can be closed.

### Decision 1 — Kafka Transition Trigger

**Question:** At what sustained insert rate does the outbox pattern show queue lag warranting Kafka adoption?

**Suggested threshold:** > 500 inserts/min sustained for > 1 hour, or outbox processing lag > 30 seconds under normal load for > 24 hours, or a second consumer of the listing change stream is identified (e.g., analytics pipeline, notification service).

**Action required:** Monitor outbox lag metrics after Phase 4. File a Kafka ADR if the threshold is met.

### Decision 2 — OpenSearch vs Elasticsearch

**Question:** Which search engine to use — Amazon OpenSearch Service or Elasticsearch Cloud (Elastic)?

**Context:** Both expose compatible APIs. The `opensearch-java` client is API-compatible with OpenSearch; the Elasticsearch client uses a proprietary DSL from Elasticsearch 8.x onward.

**Suggested resolution:** Use Amazon OpenSearch Service if the production environment is AWS (consistent with Supabase's cloud deployment). Use Elasticsearch Cloud if Elastic's licensing terms are preferable and the team has existing Elastic tooling. Resolve before Phase 6 (staging deployment).

### Decision 3 — Single Index vs Per-City Indices

**Question:** At very high scale (> 10M documents), should listings be sharded across per-city indices?

**Current position:** A single `listings-current` index is correct for the current and near-term scale. Per-city indices add routing complexity with no benefit at < 10M documents.

**Revisit when:** Total LIVE document count exceeds 5M and a single index shard shows > 80% disk or heap pressure.

### Decision 4 — Autocomplete / Suggest Index Strategy

**Question:** Should autocomplete use the OpenSearch completion suggester sub-field, a separate suggest index, or a `prefix` query on `locality_keyword`?

**Current position:** Not designed. The product requirement for autocomplete has not been filed.

**Action required:** File a product issue for autocomplete/suggest. Assign a separate ADR or RFC to cover suggester strategy, index shape, and frontend API contract.

### Decision 5 — School Proximity Denormalization

**Question:** Should `school_name` and `school_area_key` (or a list of nearby school identifiers) be denormalized into the listing document to support future school-proximity search beyond the current radius filter?

**Context:** The current school-first Discover journey uses a ST_DWithin radius query at query time. If school-proximity becomes a filter criterion (e.g., "within 2km of School X"), this could be pre-computed at index time to avoid a geo-distance query per search request.

**Current position:** Deferred. The current radius filter approach is correct for the current product. Denormalization would require a school reference data join at index time and a reindex whenever school locations change.

**Action required:** Revisit when school-proximity becomes a first-class filter requirement (product decision required).

---

## Appendix A — Related Files

| File | Description |
|---|---|
| `backend/src/main/resources/db/migration/V18__add_listing_fts_vector.sql` | Current Postgres FTS implementation (generated tsvector + GIN index) |
| `backend/src/main/resources/db/migration/V73__postgis_geog.sql` | PostGIS geography column + GiST index for geo queries |
| `backend/src/main/java/*/discover/DiscoverListingPredicateBuilder.java` | All current Discover filter predicates (FTS + geo + structured) |
| `backend/src/main/java/*/discover/DiscoverMarkersService.java` | Current markers query (SELECT id,lat,lon,price_paise,locality LIMIT 1001) |
| `backend/src/main/java/*/discover/DiscoverListingsService.java` | Current listings query (COUNT + paginated card SELECT) |
| `backend/src/main/java/*/listing/ListingWorkflowService.java` | Status transitions — outbox events will be written here |
| `backend/src/main/java/*/listing/ListingRepository.java` | `findBySearch` — auth-gated dashboard FTS (not Discover) |
| `backend/src/main/java/*/listing/CityAreaListingsService.java` | Public anon path — remains on Postgres, out of OpenSearch scope |
| `docs/audit/discover-performance-scale-audit-2026-05.md` | #1162 audit — baseline metrics and adoption triggers |

## Appendix B — Listing Status Flow (Summary)

```
SCRAPED ──claim──► DRAFT ──submit──► PENDING_REVIEW
                                           │
                            ┌──────────────┼──────────────┐
                         approve        reject      return-for-edits
                            │              │                │
                           LIVE        REJECTED           DRAFT
                            │              │
                         archive       restore (admin) → LIVE
                            │
                         ARCHIVED ──restore──► DRAFT
                            │
                         (hard-delete by admin: INDEX DELETE)
```

Indexing events originate at the transitions that touch LIVE status (entry and exit).
