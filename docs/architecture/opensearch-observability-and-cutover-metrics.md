# Design: OpenSearch Observability and Cutover Metrics

**Status:** DESIGN / PROPOSED
**Date:** 2026-05-31
**Author:** Architecture review
**Supersedes:** N/A
**Issue:** [#1254 OpenSearch observability model](https://github.com/lovable/udupi-property-explorer/issues/1254)
**Related:**
[ADR — Discover OpenSearch Search Architecture](./discover-opensearch-search-architecture.md) (the source ADR; phases, outbox, cutover) ·
[OpenSearch POC Report](./opensearch-poc-report.md) (source of truth for POC numbers) ·
[Discover Query Latency Metrics (#1249)](../metrics/discover-metrics.md) (metric naming + cardinality precedent) ·
[#1311 FTS semantics alignment + read-model field definition](https://github.com/lovable/udupi-property-explorer/issues/1311) (already-filed follow-up)

---

## 0. Scope and Status (TL;DR)

This is a **design / criteria document**, not an implementation. It defines the observability
model (metrics catalogue, label policy, dashboard/alert outline) and the **quantified cutover
criteria** that must be satisfied before any Postgres → OpenSearch Discover cutover.

- **Stage:** Growth-stage design written for an MVP-stage codebase, consistent with the ADR
  (`discover-opensearch-search-architecture.md` §0). Nothing here is built today. Production
  Discover continues to run on Postgres (V18 `tsvector` + V73 PostGIS) per the ADR.
- **Grounded in evidence:** The OpenSearch read-model shape and query parity were validated by
  the local POC (#1309) — see `opensearch-poc-report.md`. This document turns that evidence into
  measurable signals and go/no-go thresholds.
- **What is in scope:** metric definitions (names + purpose), label/cardinality policy,
  parity/safety signals, FTS-semantics options, read-model field gaps, cutover thresholds, and a
  dashboard/alert *outline*.
- **What is OUT of scope (negative scope):** production instrumentation code, Micrometer wiring,
  migrations, outbox/indexer code, Grafana JSON, runnable Prometheus rules, and the final FTS /
  read-model field decisions. Those are deferred to the implementation issues in §8 (notably
  **#1311**). Metric names and label sets below are **illustrative**, following the dotted
  `discover.*` convention from #1249.

> Metric names use field/schema-level identifiers only. This document contains **no real values,
> no credentials, and no sample user or PII data** — consistent with the POC safety result
> (0 PII, 15 public-safe fields).

---

## 1. POC Baseline (Source of Truth)

All numbers below are taken verbatim from `docs/architecture/opensearch-poc-report.md`
(POC run 2026-05-30, #1309). They are **not recomputed here** — that report is the source of
truth. These are the parity and throughput baselines the observability model measures against.

### 1.1 Query parity baseline

| Query | Pattern | Postgres hits | OpenSearch hits | Delta | Verdict |
|---|---|---:|---:|---:|---|
| QP-1c | `geo_distance` / `ST_DWithin` (2 km radius) | 38 | 38 | **0** | PASS (parity) |
| QP-3b | `geo_bounding_box` / bbox | 85 | 85 | **0** | PASS (parity) |
| QP-combo | FTS + geo (`multi_match` + `geo_distance`) | 41 | 41 | **0** | PASS (parity) |
| QP-1d | FTS `multi_match` "sea view apartment" | 134 | 408 | **-274** | EXPECTED divergence (FTS semantics, see §6) |

The QP-1d divergence is **expected and documented**: Postgres `websearch_to_tsquery` runs
AND-mode (all terms required → 134), while OpenSearch `multi_match` defaults to BM25 OR-mode
(any term → 408). It is a semantic difference, not a defect. See §6 and the POC report §6.2.

### 1.2 Backfill throughput baseline

| Metric | Value |
|---|---|
| LIVE docs indexed | 1,000 |
| Total indexing time | 0.3 s (exact POC output from `opensearch-poc-report.md` §3) |
| Throughput | 2,867 docs/sec overall (exact POC output, not an estimate) |
| Indexing failures | 0 |
| Rows skipped (null lat/lon) | 0 |
| Fields indexed | 15, all public-safe |
| PII fields | 0 |
| Environment | OpenSearch 2.13 single-node, local loopback |

These define the "healthy" reference for the throughput, failure, and safety metrics in §2 and §5.

---

## 2. Indexing Metrics Catalogue

Signals for the indexing pipeline (the transactional outbox + `@Scheduled` indexer worker per ADR
§6B / Phase 2). All names follow the `discover.*` dotted convention; production unit suffixes
(`.seconds`, `.total`) match #1249 usage. Names are illustrative.

| Metric (illustrative) | Type | Purpose |
|---|---|---|
| `discover.index.backfill.throughput.docs` | gauge / summary | Indexing throughput in docs/sec for backfill and bulk runs. Baseline ~2,867 docs/sec (§1.2). |
| `discover.index.upsert.latency.seconds` | timer | Per-document (or per-`_bulk`) indexing latency for the outbox indexer. |
| `discover.index.failures.total` | counter | Indexing operations that returned an error from OpenSearch (`_bulk` item failures + request errors). Baseline = 0. |
| `discover.index.lag.seconds` | gauge | **Index lag** — wall-clock from source-commit (outbox row `created_at`, i.e. the committed Postgres status/field change) to the document being searchable in OpenSearch. Reconciles with the ADR §6B outbox polling window of **2–5 s**; under normal load expected ≈ one polling cycle. Distinct from queue depth (which counts rows, not time). |
| `discover.index.outbox.depth` | gauge | Pending (`PENDING` + `PROCESSING`) outbox rows awaiting indexing. ADR §11.2 alert at > 100. |
| `discover.index.outbox.head_age.seconds` | gauge | Age of the oldest unprocessed outbox row (head-of-queue age). ADR §11.2 alert at > 30 s. |
| `discover.index.skipped.total` | counter | Rows skipped because they are not eligible to be indexed (e.g. status ≠ LIVE, null lat/lon). Tagged by `skip_reason` (enum). Baseline behaviour: non-LIVE and null-coordinate rows are never indexed. |
| `discover.index.dlq.depth` | gauge | Dead-letter queue depth (`listing_search_outbox_dlq`). **Placeholder** until the DLQ exists (ADR §6B / Phase 2). ADR §11.2 alert at > 0. |

`index lag` definition note: lag is measured per document at index time and exposed as the current
worst/oldest lag (gauge). It is the observability twin of the ADR §10.3 stale-document detection
(OpenSearch `updated_at` more than 60 s behind Postgres `updated_at` ⇒ stale).

---

## 3. Query Latency Metrics Catalogue

Latency signals for the OpenSearch query paths. These **extend** the #1249 Discover latency model.
The #1249 doc already reserves `discover.search.query.latency.seconds` for a dedicated search
service — this is where the OpenSearch query path lands. Reuse the existing `query_path` enum
(`bbox`, `radius`, `search`, `radius_search`) rather than inventing new path tags.

| Metric (illustrative) | `query_path` tag | Purpose |
|---|---|---|
| `discover.search.query.latency.seconds` | `search` | Text-query latency (FTS / `multi_match`). Reserved by #1249; activated for the OpenSearch backend. |
| `discover.search.query.latency.seconds` | `radius` | Geo-radius latency (`geo_distance`). |
| `discover.search.query.latency.seconds` | `bbox` | Bounding-box latency (`geo_bounding_box`). |
| `discover.search.query.latency.seconds` | `radius_search` | Combined text + geo latency. |
| `discover.search.query.timeout.total` | (enum tags) | Count of OpenSearch queries that exceeded the configured request timeout. |
| `discover.search.fallback.total` | (enum tags) | Count of queries that fell back to the Postgres `DiscoverListingPredicateBuilder` path. |

**Latency targets** (from ADR §11.1, measured in staging — Phase 6 — before any rollout):
text-only P95 < 50 ms; geo-radius P95 < 30 ms; combined P95 < 80 ms.

> **`discover.search.fallback.total` is a future Phase-5 signal.** The ADR places the
> stale-index fallback / circuit breaker in **Phase 5** (§7, §10.4). This metric is reserved here;
> it does **not** imply a circuit breaker is implemented today. Until Phase 5 wiring exists, the
> fallback counter is a placeholder.

---

## 4. Parity / Correctness Metrics (Shadow-Mode, Phase-1+)

These measure OpenSearch results against Postgres as the source of truth. They are
**aspirational / Phase-1+**: they can only be computed once **shadow mode** exists (ADR Phase 1,
§7; POC §10). They are **not measured today**. The POC parity table (§1.1) is the one-time manual
baseline; these metrics make that comparison continuous during shadow mode.

| Metric (illustrative) | Type | Purpose |
|---|---|---|
| `discover.parity.count_delta` | gauge | Per-query hit-count difference. `count_delta = Postgres_hits − OpenSearch_hits`; a negative value means OpenSearch returned more results (e.g. −274 for FTS QP-1d). Baseline: 0 for geo (QP-1c/3b/combo), −274 for FTS QP-1d (expected). |
| `discover.parity.mismatch.ratio` | gauge | Fraction of shadow queries whose result sets differ (the "diff rate" the ADR exit criteria use, e.g. Phase 1 < 1%, Phase 6 < 0.1%). |
| `discover.parity.overlap.ratio` | gauge | Result-set overlap (intersection / union of returned listing IDs) between the two paths. |
| `discover.parity.stale_docs.total` | gauge | Docs present in both but stale in OpenSearch (per ADR §10.3, OpenSearch `updated_at` > 60 s behind Postgres). |
| `discover.parity.missing_docs.total` | gauge | Listings LIVE in Postgres but absent from OpenSearch (under-indexing). |
| `discover.parity.extra_docs.total` | gauge | Docs in OpenSearch but not LIVE in Postgres (over-indexing / failed delete). |

These reconcile with ADR §10.2 periodic reconciliation (Postgres LIVE count vs OpenSearch count,
alert at > 1% divergence) — that count-divergence check is the cheap daily form; the metrics above
are the per-query shadow-mode form.

---

## 5. Safety Metrics

Safety signals enforce the public-data boundary (ADR §12). The POC established the safety baseline:
**0 PII, 15 public-safe fields** (POC report §4, §8). These metrics make that guarantee continuous.
**All references are field NAMES only (schema-level)** — never real values, credentials, or PII.

| Metric (illustrative) | Type | Purpose | Baseline / invariant |
|---|---|---|---|
| `discover.index.skipped.non_live.total` | counter | Rows skipped because `status` ≠ LIVE (subset of `discover.index.skipped.total`, `skip_reason=non_live`). | Non-LIVE rows are never indexed. |
| `discover.safety.non_public_indexed.total` | counter | Docs indexed that contain a field outside the 15-field public whitelist. | **MUST be 0.** |
| `discover.safety.whitelist_violations.total` | counter | Attempts to write a field on the §4.2 excluded list (e.g. `user_id`, `seller_id`, `phone`, `email`, `supabase_user_id`). | **MUST be 0.** |
| `discover.safety.schema_validation_failures.total` | counter | Document-builder schema-validation failures (mapping mismatch, type error, unexpected field). | 0 expected. |

The whitelist/excluded-field control is enforced at the document-builder layer (ADR §12.2), not by
OpenSearch field security. These metrics observe that control; any non-zero value is a safety
incident (see §9 alerting).

---

## 6. FTS Semantics Decision (QP-1d 134 vs 408)

The POC (§1.1, POC report §6.2) showed Postgres `websearch_to_tsquery` returns **134** hits for
"sea view apartment" (AND-mode: all terms required) while OpenSearch `multi_match` returns **408**
(BM25 OR-mode: any term, relevance-ranked). This is a product-relevance decision, not a bug — the
observability model just needs to know which target counts to alert on. The options:

| # | Option | Effect | Trade-off |
|---|---|---|---|
| 1 | `operator: "and"` on `multi_match` | Matches Postgres AND-mode → counts converge to ~134 | Lowest recall; loses BM25's tolerance for partial / typo'd queries. Simplest parity. |
| 2 | Default OR + relevance ranking with a `_score` threshold | Keeps OR recall but trims long tail by minimum score | Threshold is corpus-dependent and needs tuning; parity count not fixed. |
| 3 | `minimum_should_match` (e.g. `"75%"`) | Requires a configurable fraction of terms | Middle ground between AND and OR; predictable, tunable per query length. |
| 4 | Hybrid short-vs-long-query strategy | OR for 1–2 term queries (recall), AND / high `minimum_should_match` for 3+ term queries (precision) | Best UX fit; most logic to implement and test. |

**Recommended next step:** prototype Option 3 (`minimum_should_match`) and Option 4 (hybrid) in
the shadow harness and compare `discover.parity.mismatch.ratio` against the Postgres path across
representative 1-, 2-, and 3+-term queries. Do **not** lock parity to raw count equality on FTS —
relevance, not count, is the right success measure there.

> **The final FTS product decision is explicitly DEFERRED to #1311.** This document only
> enumerates the options and the measurement approach; #1311 owns the chosen operator/threshold and
> the read-model field contract that the FTS analyzer indexes over.

---

## 7. Read-Model Shape Gaps

The POC indexed 15 public-safe columns straight from `property_listings`. Two Discover
card/marker fields in the original design are **not columns on `property_listings`** and were
removed from the POC mapping (POC report §4, §9). They need a source definition before a full
read-model is built. **This document acknowledges the gaps only — it does NOT define the fields.**

| Field | Gap | Likely source (per ADR §8.2 / §9.3) | Resolution |
|---|---|---|---|
| `city_slug` | Not a column on `property_listings`. | JOIN `areas` on `area_key = pl.area_key`. | Deferred to #1311. |
| `hero_image_url` | Not a column on `property_listings`. | JOIN `listing_images` where `position = 1` (one image per listing). | Deferred to #1311. |
| `price_bucket` (facet) | Derived, not stored. | Computed in-process from `price_paise` (ADR §8.2). | Deferred to #1311 / facet phase (ADR Phase 8). |

Any additional Discover card/marker field not in the 15-field POC mapping must be added to the
read-model contract before cutover. Defining those fields, their join semantics, and their
freshness guarantees is the responsibility of **#1311**, not this document. Until then, the
observability model treats the 15-field POC mapping as the authoritative indexed shape.

---

## 8. Cutover Criteria (Postgres → OpenSearch)

A cutover is the ADR Phase 7 production rollout. It is safe to begin **only when ALL of the
following quantified thresholds hold** (cross-referencing ADR §7 Phase 6/7 exit criteria, §10
failure handling, §11 targets, and POC §8 safety evidence). Vague "looks healthy" is not a gate.

| Gate | Metric(s) | Threshold (quantified) | Source |
|---|---|---|---|
| **Safety** | `discover.safety.non_public_indexed.total`, `discover.safety.whitelist_violations.total` | **Exactly 0** (both). No non-public field indexed; no excluded-field write. | ADR §12; POC §8 (0 PII / 15 fields) |
| **Parity — count** | `discover.parity.count_delta` | Geo paths (`bbox`/`radius`/`radius_search`): **delta = 0** (POC baseline). FTS path: within the band agreed in #1311 (NOT raw-count parity — see §6). | POC §1.1; §6 |
| **Parity — mismatch %** | `discover.parity.mismatch.ratio` | **< 0.1%** on staging shadow traffic (matches ADR Phase 6 exit criterion). Phase 1 local gate is < 1%. | ADR §7 Phase 1 / Phase 6 |
| **Index divergence** | reconciliation (Postgres LIVE vs OpenSearch count) | **≤ 1%** of the Postgres LIVE count, sustained. | ADR §10.2, §11.2 |
| **Index lag** | `discover.index.lag.seconds`, `discover.index.outbox.head_age.seconds` | Lag ≤ one outbox polling cycle under normal load; **head-of-queue age < 30 s**; status reflected in OpenSearch within **10 s** (ADR Phase 2 exit). | ADR §6B, §10.3, §11.2 |
| **DLQ clean** | `discover.index.dlq.depth` | **= 0**, sustained over the validation window (ADR Phase 2: empty over 48 h). | ADR §6B, §11.2 |
| **Latency** | `discover.search.query.latency.seconds` (P95 per `query_path`) | Text P95 < 50 ms; geo-radius P95 < 30 ms; combined P95 < 80 ms (measured in staging). | ADR §11.1, §7 Phase 6 |
| **Fallback available** | `discover.search.fallback.total` path wired | Postgres fallback / circuit breaker (ADR Phase 5) **implemented and verified** — with OpenSearch stopped, Discover still serves results via Postgres. | ADR §7 Phase 5, §10.4 |
| **Rollback documented** | — | Feature flag `discover.search.backend` flips back to `postgres` instantly; blue-green alias swap (ADR §9.2) and circuit-breaker fallback give a tested rollback path. | ADR §7 Phase 7, §9.2 |

Cutover itself is gradual per ADR Phase 7 (5% → 25% → 50% → 100% with hold periods), with the
above gates re-checked at each step. Any safety violation (> 0) or sustained divergence (> 1%)
halts the ramp and triggers rollback.

---

## 9. Dashboard and Alerting Outline

**Outline only.** No Grafana JSON and no runnable Prometheus rules are in scope. Production
dashboards/alerts are an implementation issue (§10). Metrics are exposed via the existing
`PrometheusApiKeyFilter` (API-key gated) per #1249 — no new exposure surface.

### 9.1 Panels (grouped by metric family)

| Panel group | Metrics shown |
|---|---|
| Indexing health | `discover.index.backfill.throughput.docs`, `discover.index.upsert.latency.seconds`, `discover.index.failures.total` |
| Outbox / lag | `discover.index.outbox.depth`, `discover.index.outbox.head_age.seconds`, `discover.index.lag.seconds`, `discover.index.dlq.depth` |
| Query latency | `discover.search.query.latency.seconds` P50/P95/P99 split by `query_path`; `discover.search.query.timeout.total`; `discover.search.fallback.total` |
| Parity (shadow mode) | `discover.parity.count_delta`, `discover.parity.mismatch.ratio`, `discover.parity.overlap.ratio`, missing/extra/stale doc gauges |
| Safety | `discover.safety.non_public_indexed.total`, `discover.safety.whitelist_violations.total`, `discover.safety.schema_validation_failures.total`, `discover.index.skipped.non_live.total` |

### 9.2 Alert conditions (illustrative)

| Alert | Condition | Severity |
|---|---|---|
| DLQ non-empty | `discover.index.dlq.depth` > 0 | Page |
| Index lag high | `discover.index.outbox.head_age.seconds` > 30 | Warn |
| Outbox backlog | `discover.index.outbox.depth` > 100 | Warn |
| Index divergence | reconciliation delta > 1% of Postgres LIVE count | Warn |
| Safety violation | any `discover.safety.*` counter > 0 | **Page (cutover-blocking)** |
| Indexer error rate | `discover.index.failures.total` rate > 1% of attempts | Warn |
| Latency regression | `discover.search.query.latency.seconds` P95 above §8 targets | Warn |

> No dashboard or alert implementation is delivered by this document. These tables are the
> specification an implementer follows when the relevant phase (ADR Phase 4) is approved.

---

## 10. Label / Tag Policy

Consistent with #1249 (`docs/metrics/discover-metrics.md`): **enum-only, low-cardinality tags; no
user-supplied value is ever a tag value.** Cardinality stays bounded so the time-series count
remains near the #1249 ceiling (~48 series for the existing latency family).

**Allowed (enum-only) tags:**

| Tag | Allowed values | Used on |
|---|---|---|
| `query_path` | `bbox`, `radius`, `search`, `radius_search` (reuse #1249) | query latency / timeout / fallback |
| `result_status` | `success`, `empty`, `error`, `malformed_fts` (reuse #1249) | query latency |
| `event_type` | `upsert`, `delete` | indexing metrics |
| `skip_reason` | `non_live`, `null_coords`, `is_duplicate`, `archived` | `discover.index.skipped.*` |
| `index_result` | `success`, `failed`, `dlq` | indexing failure / DLQ metrics |

**FORBIDDEN high-cardinality labels (never used as tag values):**

- `listing_id` / document `_id`
- `user_id`, `seller_id`, `supabase_user_id`
- raw query string `q` (free text)
- `latitude` / `longitude` (continuous)
- `area_key` as a metric tag value (33 today but unbounded as data grows; `area_key` is used only as an index document filter field, never as a Prometheus label) and `city_slug`
- `title`, `locality`, `description`, or any document text field
- timestamps, prices, or any per-row value

The cardinality budget for the new families mirrors #1249's reasoning: each metric family =
(metric name) × (enum tag values), kept in the low tens of series. Adding a continuous or
identifier label would blow the budget and is prohibited.

---

## 11. Recommended Next Implementation Issues

Concrete follow-ups, ordered by dependency. The first is **already filed**.

| # | Issue | Owns | Depends on |
|---|---|---|---|
| **#1311** (filed) | FTS semantics alignment + read-model field definition | Final FTS operator/threshold decision (§6); `city_slug` / `hero_image_url` / facet field contract (§7) | This doc, POC #1309 |
| Candidate A | Transactional outbox indexer (ADR Phase 2) | `listing_search_outbox` + `@Scheduled` indexer + DLQ; emits the §2 indexing metrics | #1311 (document shape) |
| Candidate B | Micrometer instrumentation for OpenSearch query + index paths | Wires §2/§3/§5 metrics, enum tags (§10), Prometheus exposure (reuse `PrometheusApiKeyFilter`) | Candidate A |
| Candidate C | Shadow-mode parity harness (ADR Phase 1) | Computes §4 parity metrics; feeds the §8 cutover gates | #1311, Candidate B |
| Candidate D | Cutover dashboard + alert rules (ADR Phase 4) | Implements the §9 outline (panels + alerts) | Candidate B, C |

These remain **DEFERRED until an ADR adoption trigger is met** (ADR §0: P95 FTS > 200 ms,
ST_DWithin > 300 ms, > 500K LIVE listings, or > 500 inserts/min). At current volume (~13 LIVE in
production) no trigger is met; this document and #1311 are the design groundwork, not a build order.
