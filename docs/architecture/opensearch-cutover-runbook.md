# OpenSearch Discover Cutover + Rollback Runbook

## 0. Document Metadata

| Field | Value |
|---|---|
| **Status** | DRAFT — PENDING PRODUCTION DEPLOYMENT |
| **Date** | 2026-06-04 |
| **Issue** | [#1321 OpenSearch cutover gate + runbook](https://github.com/lovable/udupi-property-explorer/issues/1321) |
| **Related docs** | [OpenSearch Local-First Roadmap ADR](./opensearch-local-first-roadmap.md) |
| | [Observability and Cutover Metrics Design](./opensearch-observability-and-cutover-metrics.md) |
| | [OpenSearch POC Report](./opensearch-poc-report.md) |
| | [Discover Parity Evidence — #1320](../audit/opensearch/discover-parity-1320.md) |
| | [Lifecycle Proof — #1328](../audit/opensearch/lifecycle-proof-1328.md) |

---

## 1. Overview and Scope

This runbook covers the **staged cutover of the Discover read path from Postgres to OpenSearch**. It documents the prerequisites that must be satisfied, the go/no-go checklist, the staged rollout plan, the rollback procedure, and the post-cutover verification steps.

### In scope

- Feature flag management for the OpenSearch read path (`discover.opensearch.enabled`, `discover.opensearch.shadow-enabled`)
- Go/no-go checklist and deferred blocking pre-conditions (DEF-A through DEF-D)
- Staged rollout plan (Stages 0 through 3)
- Rollback procedure (flag-only, no code change required)
- Monitoring and alerting checklist
- Post-cutover verification steps

### Explicitly out of scope

The following are **not covered by this document or by issue #1321**:

- Kafka / Redpanda event streaming integration
- Render / OpenSearch / VPS production infrastructure provisioning
- Performing the production cutover (flipping read flags in production)
- Frontend feature changes
- Indexing / poller redesign
- Changing `discover.opensearch.enabled` or `discover.opensearch.shadow-enabled` from their default `false` values — **#1321 does NOT enable OpenSearch reads by default**

---

## 2. Architecture Summary

### Current production state

```
Cloudflare Pages (frontend)
  └─ Render backend (Spring Boot)
       └─ Postgres (source of truth)
            ├─ V18 tsvector FTS (websearch_to_tsquery, AND-mode)
            └─ V73 PostGIS geo (ST_DWithin, ST_MakeEnvelope)

OpenSearch: NOT in the production read path.
```

Postgres is and remains the source of truth for all listing data. OpenSearch is a
read-model replica, rebuilt entirely from Postgres at any time via `scripts/opensearch_rebuild.py`.

### Local validation environment (as of #1320 / #1328)

```
PostGIS container (postgis/postgis:14-3.3, port 5434)
  + OpenSearch container (opensearchproject/opensearch:2.13.0, port 9200)
  + Spring Boot backend (flags enabled via .env.e2e)
  + Playwright E2E (discover-opensearch-parity.spec.ts)
```

### Future production deployment options

The following hosting options were evaluated in the local-first roadmap ADR. None is provisioned
today; selection and provisioning are a prerequisite for Stage 2/3 cutover:

| Option | Minimum spec | Notes |
|---|---|---|
| VPS (e.g. Hetzner CX32) | 4 vCPU / 8 GB RAM | Self-managed; lowest cost; requires ops tooling |
| Higher-tier Render | Standard 2 GB minimum | Managed PaaS; simpler ops; higher cost at scale |
| Managed OpenSearch | AWS OpenSearch / Elastic Cloud / Bonsai | Fully managed; best SLA; highest cost |

---

## 3. Feature Flag Model

Both read flags default to `false`. Neither is changed by this issue.

| Flag (application.yml) | Environment variable | Default | Purpose |
|---|---|---|---|
| `discover.opensearch.enabled` | `DISCOVER_OPENSEARCH_ENABLED` | `false` | Enables the OpenSearch read path for Discover queries. When `false`, all Discover reads go to Postgres. |
| `discover.opensearch.shadow-enabled` | `DISCOVER_OPENSEARCH_SHADOW_ENABLED` | `false` | Enables shadow/parity mode: user-visible results come from Postgres while OpenSearch is queried in parallel for metric comparison. |

### Indexer / poller flags are separate

`SearchOutboxPoller` is the write/indexing-side component — it reads from `listing_search_outbox`
and upserts/deletes documents in OpenSearch. Its enable flag is **independent** of the two read
flags above. The read path and the indexing path can be enabled independently:

- Indexer may be enabled before read flags (recommended — build up the index before serving from it)
- Setting `discover.opensearch.enabled=false` disables reads; it does not stop indexing

---

## 4. Prerequisites — Evidence Matrix

All 11 prerequisite issues are MERGED. The table below records each with its PR, supporting doc,
and closure date.

| Area | Issue | PR | Doc | Status | Closed |
|---|---|---|---|---|---|
| Backend read adapter + Postgres fallback | #1317 | PR #1331 | — | MERGED | 2026-06-01 |
| Shadow / parity mode | #1318 | PR #1332 | — | MERGED | 2026-06-01 |
| Observability metrics design | #1254 | — | [opensearch-observability-and-cutover-metrics.md](./opensearch-observability-and-cutover-metrics.md) | MERGED | 2026-05-31 |
| Observability metrics implementation | #1319 | PR #1336 | [docs/metrics/discover-metrics.md](../metrics/discover-metrics.md) | MERGED | 2026-06-01 |
| Outbox writer + no-Kafka poller | #1344 | PR #1346 | — | MERGED | 2026-06-02 |
| Retry / DEAD terminal state | #1345 | PR #1348 | — | MERGED | 2026-06-02 |
| Docker / PostGIS test fixture | #1347 | PR #1349 | — | MERGED | 2026-06-03 |
| Lifecycle proof (outbox → OpenSearch) | #1328 | PR #1350 | [docs/audit/opensearch/lifecycle-proof-1328.md](../audit/opensearch/lifecycle-proof-1328.md) | MERGED | 2026-06-03 |
| 10k scale parity + latency | #1313 | PR #1351 | [opensearch-poc-report.md](./opensearch-poc-report.md) | MERGED | 2026-06-03 |
| Frontend Discover parity validation | #1320 | PR #1355 | [docs/audit/opensearch/discover-parity-1320.md](../audit/opensearch/discover-parity-1320.md) | MERGED | 2026-06-04 |
| Backfill + alias strategy | #1315 | PR #1323 | — | MERGED | 2026-05-31 |

---

## 5. Go / No-Go Checklist

Items marked **DEFERRED — BLOCKING** must be resolved before Stage 3 (full read cutover).
Items marked **DEFERRED** (without BLOCKING) are recommended but not hard blockers for Stage 1/2.

| Condition | Evidence Source | Status |
|---|---|---|
| Backend read adapter behind flags + Postgres fallback proven | #1317 / PR #1331 | **PASS** |
| Shadow-read parity mode implemented | #1318 / PR #1332 | **PASS** |
| Observability metrics wired (latency, fallback, parity, DEAD) | #1319 / PR #1336 | **PASS** |
| Index lifecycle proven (outbox → poller → OpenSearch) | #1328 / PR #1350, #1344 / PR #1346 | **PASS** |
| Retry / DEAD terminal handling | #1345 / PR #1348 | **PASS** |
| Local deterministic test fixture (Docker/PostGIS) | #1347 / PR #1349 | **PASS** |
| 10k scale parity (geo delta=0, FTS delta=0 under operator:and, latency 7–77ms) | #1313 / PR #1351 | **PASS** |
| Frontend Discover parity validation (J1/J2/J4 PASS, J3 SKIP pre-existing) | #1320 / PR #1355 | **PASS** |
| Postgres remains source of truth | Architectural invariant | **PASS** |
| OpenSearch index rebuildable from Postgres (alias swap) | #1315 / PR #1323 | **PASS** |
| Outbox lag measurable | #1319 metrics (`discover.index.outbox.head_age.seconds`) | **PASS** |
| Rollback achievable by flag flip alone — no code change required | Architectural invariant | **PASS** |
| No private owner / broker / admin fields in OpenSearch | PR #1331 adapter (43/43 unit tests, 27-field mapping) | **PASS** |
| No raw OpenSearch DSL accepted from clients | Architectural invariant (all queries built server-side) | **PASS** |
| OpenSearch not exposed directly to frontend | Architectural invariant (backend-only; loopback-only in local) | **PASS** |
| **DEF-A: Marker payload field completeness (E2E)** | [discover-parity-1320.md](../audit/opensearch/discover-parity-1320.md) §Known gaps (a) | **DEFERRED — BLOCKING** |
| **DEF-B: Truncation metadata assertion (X-Total-Count / truncation indicator)** | [discover-parity-1320.md](../audit/opensearch/discover-parity-1320.md) §Known gaps (b) | **DEFERRED — BLOCKING** |
| **DEF-C: E2E private-field-leak prevention assertion** | Unit-proven only (PR #1331 43/43 tests); E2E field-level assertion absent | **DEFERRED — BLOCKING** |
| **DEF-D: Authenticated-path parity / J3 coverage** | J3 adds zero incremental OpenSearch coverage — authed+anon share the public `/school-radius-listings` endpoint, parity proven by J2 (#1320, #1357). "Renders no content" = test-harness fixture-detection defect, not parity gap (#1357 follow-up). | **RESOLVED — RECLASSIFIED** |
| 100k scale evidence | DEFERRED — local hardware limits; 50k recommended as pre-production gate | **DEFERRED** |
| Production OpenSearch infrastructure provisioned | DEFERRED — Render / VPS / managed not yet provisioned | **DEFERRED** |

---

## 6. Staged Rollout Plan

### Stage 0 — Default (current state)

Both read flags are `false`. Discover is served entirely by Postgres. No user-visible change.
OpenSearch indexing (via `SearchOutboxPoller`) may be enabled independently — building up the
index before any reads are served from it is the recommended approach.

**Exit to Stage 1:** Index fully built and lag confirmed near-zero. No action needed on read flags.

---

### Stage 1 — Shadow mode

Set `discover.opensearch.shadow-enabled=true` (leave `discover.opensearch.enabled=false`).

User-visible Discover results continue to come from Postgres. OpenSearch is queried in parallel
for every Discover request; results are compared and parity/latency/error metrics are emitted
but never surfaced to users. Any OpenSearch error in shadow mode must not affect the user-facing
response.

**Exit criteria:**
- Parity delta < 1% on geo/bbox queries (`discover.parity.mismatch.ratio`)
- No unexpected private field leaks detected in shadow comparison
- Fallback counter (`discover.search.fallback.total`) at zero under normal load
- DEAD outbox events: zero (`discover.index.dlq.depth` = 0)
- Outbox head age < 30 s (`discover.index.outbox.head_age.seconds`)
- DEF-A/B/C/D still DEFERRED — do not advance to Stage 2/3 until resolved

---

### Stage 2 — Limited read enablement (staging / canary)

Set `discover.opensearch.enabled=true` in a controlled scope (staging environment or canary
deployment). Postgres fallback remains wired and ready.

Monitor:
- Error rate < 0.1%
- p99 query latency ≤ Postgres baseline
- Zero fallback events under normal load
- DEAD outbox count remains zero
- Count parity vs Postgres: < 1% divergence on geo/bbox

**Prerequisites for Stage 2:**
- All BLOCKING DEF items (DEF-A through DEF-D) resolved
- Production OpenSearch infrastructure provisioned
- 50k scale evidence gathered (recommended pre-production gate)
- Formal go/no-go checklist review completed by engineering lead

Rollback: set `discover.opensearch.enabled=false` immediately if any exit criterion is violated.

---

### Stage 3 — Full read cutover

Only after explicit go/no-go approval from engineering lead. All DEFERRED BLOCKING items
(DEF-A through DEF-D) must be RESOLVED. Stage 2 canary must have been stable for a defined
observation window.

Continue monitoring freshness, parity, fallback, and user-facing behaviour after cutover.
Rollback procedure (Section 7) remains available at all times.

---

## 7. Rollback Procedure

Rollback requires **no code change**. Set the read flag to false via environment variable and
redeploy or restart the backend.

```bash
# Immediate rollback — Render environment variable update
DISCOVER_OPENSEARCH_ENABLED=false
```

Full steps:

1. Set `DISCOVER_OPENSEARCH_ENABLED=false` via environment variable on Render (or equivalent config store)
2. Trigger a redeploy or restart of the backend service — Discover reads return to Postgres immediately upon restart
3. Confirm via application logs that the Postgres read path is active (no OpenSearch adapter references in Discover query logs)
4. The `SearchOutboxPoller` (indexer) may remain enabled or be disabled separately depending on the nature of the incident — an indexing failure does not require disabling reads, and vice versa
5. No user-facing functionality depends on OpenSearch remaining enabled after read-flag rollback
6. If the OpenSearch index is stale or corrupt, it can be fully rebuilt from Postgres at any time:
   ```bash
   python scripts/opensearch_rebuild.py --alias listings_read
   ```
7. After rollback is confirmed stable, file a postmortem issue before re-enabling

---

## 8. Monitoring and Alerting Checklist

Metric names follow the `discover.*` dotted convention established in #1249 and extended by
#1254 / #1319. All names are illustrative; see
[opensearch-observability-and-cutover-metrics.md](./opensearch-observability-and-cutover-metrics.md)
for the full catalogue.

### Indexing pipeline

| Check | Metric / Query | Threshold | Action |
|---|---|---|---|
| Outbox lag | `discover.index.outbox.head_age.seconds` | Alert at > 30 s | Investigate poller health; check Postgres connectivity from backend |
| Outbox depth | `discover.index.outbox.depth` (PENDING + PROCESSING rows) | Alert at > 100 | Poller may be stalled; check logs |
| FAILED outbox events | `SELECT count(*) FROM listing_search_outbox WHERE status='FAILED'` | Alert at > 0 | Retry may resolve; check error detail |
| DEAD outbox events | `discover.index.dlq.depth` / `SELECT count(*) FROM listing_search_outbox WHERE status='DEAD'` | Alert at > 0 | Permanent indexing failure; manual intervention required |
| Indexing error rate | `discover.index.failures.total` | Baseline = 0 | Any failures require investigation |

### Read path (Stage 1+ shadow mode, Stage 2+ live)

| Check | Metric | Threshold | Action |
|---|---|---|---|
| Fallback counter | `discover.search.fallback.total` | Should be 0 under normal load | OpenSearch unavailable or erroring; check connectivity |
| Parity delta | `discover.parity.mismatch.ratio` | < 1% (Phase 1 exit); < 0.1% (Phase 2 exit) | Count divergence; compare Postgres vs OpenSearch result sets |
| Query latency (text) | `discover.search.query.latency.seconds` (`query_path=search`), P95 | < 50 ms target | Investigate index state, hardware, query structure |
| Query latency (geo-radius) | `discover.search.query.latency.seconds` (`query_path=radius`), P95 | < 30 ms target | Investigate geo index / mapping |
| Query latency (combined) | `discover.search.query.latency.seconds` (`query_path=radius_search`), P95 | < 80 ms target | Investigate combined query DSL |
| Query timeout | `discover.search.query.timeout.total` | Alert at > 0 sustained | OpenSearch overloaded or misconfigured |
| Index freshness | `GET /listings_read/_count` vs `SELECT count(*) FROM property_listings WHERE status='LIVE'` | Alert at > 1% divergence | Outbox lag or missed events |
| Shadow error rate | Application logs — OpenSearch shadow errors | Should be zero; must not affect user-facing response | Shadow errors are non-fatal but indicate index / adapter problems |
| DEAD event threshold | `discover.index.dlq.depth` | Alert at > 0 | Permanent indexing failure; DEAD rows visible in `listing_search_outbox` |

---

## 9. No-Go Conditions

Any of the following conditions constitutes a NO-GO for proceeding to the next rollout stage.
DEF-A through DEF-C are individually sufficient to block Stage 3.

- **DEF-A unresolved** — marker payload field completeness not asserted at E2E level (BLOCKING for Stage 3)
- **DEF-B unresolved** — truncation metadata (`X-Total-Count` / truncation indicator) not asserted at E2E level (BLOCKING for Stage 3)
- **DEF-C unresolved** — private-field-leak prevention unit-proven only (PR #1331 43/43 tests); E2E field-level assertion absent (BLOCKING for Stage 3)
- **DEF-D RESOLVED (RECLASSIFIED, #1357)** — authenticated-path school-radius parity is proven via anon J2 (identical public endpoint, `skipAuth:true`); J3 adds no incremental OpenSearch coverage. The residual authenticated-rendering harness fix (obs 12269: storageState cookies vs localStorage) is a NON-BLOCKING follow-up. (No longer a Stage-3 NO-GO.)
- OpenSearch result counts materially diverge from Postgres (> 1% on geo/bbox queries)
- Geo-radius or bounding-box queries return incorrect results (wrong listings, wrong count)
- Search / filter semantics differ in user-visible ways beyond the documented QP-1d FTS semantic difference (see Section 11)
- Outbox lag is unbounded (head age > 30 s sustained) or unmonitored
- FAILED or DEAD outbox events present and not acknowledged
- Postgres fallback path not functional or not proven under failure injection
- Private owner / broker / admin fields appear in any OpenSearch API response
- Rollback to Postgres cannot be achieved by flag flip alone
- Production OpenSearch infrastructure not provisioned (hard block for Stage 2/3)
- 50k scale evidence not gathered before Stage 2 (recommended gate; waivable with explicit engineering lead sign-off)

Previously blocking conditions now PASSED (for reference):
- ~~#1313 parity / latency evidence missing~~ — now PASSED (geo delta=0, FTS delta=0 operator:and, latency 7–77ms)
- ~~#1320 frontend validation missing~~ — now PASSED (J1/J2/J4 PASS; J3 pre-existing skip)

---

## 10. Post-Cutover Verification Steps

Run these checks immediately after enabling `discover.opensearch.enabled=true` in production
(Stage 2 or Stage 3):

1. **Parity spot-checks** — compare OpenSearch vs Postgres result counts for at least three representative queries: a geo-radius query, a bounding-box query, and a combined FTS + geo query. Delta must be zero (or within the expected FTS semantic difference for text-only queries — see Section 11).

2. **Latency check** — verify p99 query latency for geo-radius and bbox paths is ≤ the Postgres baseline under production load. Reference targets: text P95 < 50 ms; geo-radius P95 < 30 ms; combined P95 < 80 ms.

3. **Fallback test** — briefly interrupt OpenSearch connectivity (e.g. block port 9200 in staging) and confirm:
   - Postgres fallback activates without user-visible errors
   - `discover.search.fallback.total` counter increments
   - User-facing Discover continues to function (returning Postgres results)

4. **Private-field audit** — inspect a sample of OpenSearch-served API responses (markers endpoint + listings endpoint) and confirm no private fields are present: no `owner_id`, `seller_id`, `supabase_user_id`, `phone`, `email`, `broker_*`, or equivalent admin fields.

5. **Outbox lag check** — confirm `listing_search_outbox` has no PENDING rows with `created_at` older than 5 minutes. Any stuck row older than 30 seconds should trigger an alert.

6. **DEAD event check** — confirm no rows with `status='DEAD'` have appeared in `listing_search_outbox` since cutover. Any DEAD row requires immediate investigation (permanent indexing failure).

7. **J3 follow-up (non-blocking)** — DEF-D is resolved by reclassification (#1357): authenticated school-radius parity is proven via anon J2, which exercises the identical public `/school-radius-listings` endpoint. The residual authenticated-rendering harness fix (obs 12269: storageState gated on cookies vs Supabase localStorage) is a non-blocking follow-up and does NOT gate Stage 3.

---

## 11. FTS Semantic Alignment Note

There is a documented, expected divergence between Postgres and OpenSearch full-text search
semantics. This is **not a defect**.

| Aspect | Postgres | OpenSearch |
|---|---|---|
| FTS function | `websearch_to_tsquery('english', :q)` | `multi_match` (BM25) |
| Default operator | **AND** (all terms required) | **OR** (any term matches) |
| Result count for "sea view apartment" (1k dataset) | 134 | 408 |
| Query pattern | QP-1d | QP-1d |
| Status | EXPECTED divergence — documented in #1254 / #1309 | |

The 10k scale test (#1313 / PR #1351) ran under `operator:"and"` in the OpenSearch `multi_match`
query, which produced **delta=0** against Postgres. This is the required alignment mode for
production cutover.

**Cutover requirement:** The OpenSearch `multi_match` query must use `operator:"and"` to match
Postgres FTS semantics before Stage 3. The 10k evidence demonstrates that delta=0 is achievable
with this setting. The QP-1d OR-mode divergence (408 vs 134) must not be present in the
production read path.

---

## 12. Scale Evidence Summary

| Scale | Geo parity (delta) | FTS parity (operator:and) | Latency | Status |
|---|---|---|---|---|
| 1k (POC) | 0 (exact) | — (not tested at this scale) | 0.3 s total backfill | PROVEN (#1309 / PR #1310) |
| 10k | 0 (exact) | delta=0 | 7–77 ms per query | PROVEN (#1313 / PR #1351) |
| 50k | — | — | — | RECOMMENDED pre-production gate |
| 100k | — | — | — | DEFERRED (local hardware limits) |

The 100k target is deferred because local hardware (laptop) cannot reliably sustain a 100k dataset
test. 50k is the recommended pre-production scale gate before Stage 2 enablement.

---

## 13. Out-of-Scope Statement

The following are explicitly out of scope for issue #1321 and this runbook:

- **Kafka / Redpanda event streaming** — the current no-Kafka outbox poller approach (#1344) is the active design; Kafka integration is a future concern
- **Render / OpenSearch / VPS production provisioning** — no infrastructure is provisioned; provisioning is a prerequisite for Stage 2/3, not part of #1321
- **Performing the production cutover** — flipping `discover.opensearch.enabled=true` in production is explicitly not done by this issue; this runbook documents how it should be done when the time comes
- **Frontend feature changes** — the OpenSearch read path is transparent to the frontend; no frontend changes are needed for cutover
- **Indexing / poller redesign** — `SearchOutboxPoller` and `SearchOutboxWriter` are implemented and proven (#1344 / #1345 / #1328); redesign is out of scope
- **Changing read flag defaults** — both `discover.opensearch.enabled` and `discover.opensearch.shadow-enabled` remain `false` after #1321; no default change is made

---

## 14. Ownership and Decision Points

| Transition | Who decides | Prerequisite |
|---|---|---|
| Stage 0 → Stage 1 (enable shadow mode) | Engineering decision; no user impact | Index fully built; outbox lag confirmed near-zero |
| Stage 1 → Stage 2 (limited read enablement) | Engineering lead go/no-go review | All BLOCKING DEF items (DEF-A through DEF-C) resolved; production infrastructure provisioned; 50k scale evidence gathered |
| Stage 2 → Stage 3 (full read cutover) | Formal engineering lead sign-off | DEF-A/B/C RESOLVED; Stage 2 canary stable over observation window |
| Rollback (any stage) | **Any on-call engineer** | No approval required — flip `discover.opensearch.enabled=false` immediately |

### Deferred blocking items and responsible issues

| Item | Description | Resolution path |
|---|---|---|
| DEF-A | Marker payload field completeness at E2E level | Add field-level assertions to parity spec; re-run against markers endpoint |
| DEF-B | Truncation metadata (`X-Total-Count` / truncation indicator) at E2E level | Add response header assertion to parity spec |
| DEF-C | Private-field-leak prevention at E2E level (currently unit-proven only via PR #1331 43/43 tests) | Add field-inspection step to parity spec that reads response body and asserts absence of private fields |
| DEF-D | ~~Authenticated-path parity (J3 — school-first auth)~~ **RECLASSIFIED (#1357)** | Parity proven via J2 — authed and anon share the public `/school-radius-listings` endpoint (`skipAuth:true`). Remaining work = harness fixture-detection fix (obs 12269: storageState cookies vs Supabase localStorage) + live re-run — non-blocking follow-up. No longer gates Stage 3. |
