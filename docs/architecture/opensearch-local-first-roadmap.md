# OpenSearch Local-First Rollout — Architecture Decision Record

**Date:** 2026-06-02  
**Status:** Adopted  
**Supersedes:** `docs/deployment/render-opensearch.md` as immediate implementation path (that document is now a future deployment reference only).

---

## Decision

OpenSearch will be developed and validated **locally** before any production or paid hosted deployment is considered.

**Render OpenSearch provisioning is deferred.** No paid Render or managed OpenSearch service will be created at this stage. The cost and memory overhead of running OpenSearch on Render is not justified before local validation is complete.

Production continues to use **Postgres as the primary read and source-of-truth store** until an explicit cutover decision is made via issue #1321.

---

## Context

Prior work through M23–M26 established:

- Backend Discover OpenSearch adapter behind feature flag (#1317)
- Shadow-read / parity mode (#1318)
- Micrometer metrics for query paths (#1319)
- OpenSearch rebuild tooling (`scripts/opensearch_rebuild.py`, #1315)
- OpenSearch POC at 1k LIVE docs in 0.3 s (#1309)
- Auth-enabled rebuild/backfill tooling (`scripts/opensearch_auth.py`, #1340)
- Render OpenSearch provisioning runbook (#1333, **deferred — future reference only**)

The system is OpenSearch-ready in local/dev environments. The next step is local proof of correctness and search quality, not hosted deployment.

---

## Production Architecture (unchanged)

```
Cloudflare Pages (frontend)
  → Render backend API
  → Postgres (read + write, source of truth)
```

OpenSearch is **not** in the production read path. Feature flags default to off.

---

## Local Validation Architecture

```
Local PostGIS container (restored from sanitized/prod-like dump)
Local OpenSearch container (docker-compose.opensearch.yml)
Backend (feature flags enabled locally)

Outbox events → no-Kafka poller/indexer → OpenSearch
Backend Discover adapter → OpenSearch (shadow or primary, controlled by flag)
Parity comparison → backend shadow runner
```

---

## Future Deployment Architecture (when ready)

```
Cloudflare Pages (frontend)
  → Render backend API (or VPS)
  → Postgres (source of truth)
  → VPS / higher-tier Render / managed OpenSearch (backend-only access)
```

Options when we are ready:
- VPS (e.g. Hetzner CX32, 4 vCPU / 8 GB RAM)
- Higher-tier Render instance (Standard 2 GB minimum for OpenSearch 2.13)
- Managed OpenSearch (AWS, Elastic Cloud, Bonsai)

See `docs/deployment/render-opensearch.md` for a Render-specific provisioning runbook when that path is chosen.

---

## Feature Flag Model

Two separate concepts must remain decoupled:

### 1. Query / read flag

Controls whether Discover reads from OpenSearch.

| Flag | Default | Effect |
|---|---|---|
| `DISCOVER_OPENSEARCH_ENABLED` | `false` | Use OpenSearch as primary Discover read path |
| `DISCOVER_OPENSEARCH_SHADOW_ENABLED` | `false` | Shadow-read OpenSearch alongside Postgres for parity comparison |

Rules:
- Production default: both `false` → Postgres-only
- Local/dev: either flag can be enabled for validation
- The frontend never calls OpenSearch directly
- The backend owns all query construction
- No raw OpenSearch DSL is accepted from clients

### 2. Indexer / poller flag

Controls whether the outbox poller processes events into OpenSearch.

| Flag | Default | Effect |
|---|---|---|
| `SEARCH_INDEXER_ENABLED` | `false` | Run the outbox poller/indexer |
| `SEARCH_OUTBOX_POLL_INTERVAL_SECONDS` | `30` | Poll interval |
| `SEARCH_OUTBOX_BATCH_SIZE` | `100` | Events per batch |
| `SEARCH_OUTBOX_MIN_EVENT_AGE_SECONDS` | `0` | Minimum event age before processing |

Rules:
- Outbox events **may be written** regardless of OpenSearch read mode
- The poller/indexer only processes events when `SEARCH_INDEXER_ENABLED=true`
- Production can keep event generation on but indexing off (safe default)
- Local/dev enables the poller for end-to-end validation

---

## Event Propagation Model (No Kafka)

Event propagation and indexing are **decoupled**:

```
Listing created / updated / approved / rejected
  → search_outbox row written (always, if event generation is on)
  → poller wakes up (if SEARCH_INDEXER_ENABLED=true)
  → reads batch from search_outbox
  → writes to OpenSearch
  → marks events processed
```

**Kafka is not introduced.** The no-Kafka outbox poller is the transport mechanism for local validation and production. This avoids:
- Kafka operational overhead
- Kafka deployment cost on Render
- Additional infrastructure dependency before local validation is proven

If a higher-throughput event transport is needed in future, it can be introduced as a separate decision.

---

## M27 Issue Order (Revised)

| Step | Issue / Action | Status |
|---|---|---|
| 1 | Local-first decision record (this document) | ✅ Done (#TBD) |
| 2 | Postgres outbox writer + no-Kafka poller/indexer behind flags | 🔲 New issue needed |
| 3 | Local end-to-end proof: listing change → outbox → poller → OpenSearch → backend query | 🔲 New issue (replaces Kafka steps in #1328) |
| 4 | 10k/100k local parity and latency comparison | 🔲 #1313 (update scope: local-only) |
| 5 | Frontend validation against backend feature-flag path | 🔲 #1320 (depends on step 4) |
| 6 | Cutover / rollback plan | 🔲 #1321 (final step) |
| 7 | Future deployment issue: VPS / Render / managed OpenSearch | 🔲 New issue when step 6 is done |

---

## Existing Issue Status

| Issue | Title | New Status |
|---|---|---|
| #1333 | Render OpenSearch provisioning runbook | ✅ Closed — runbook is future reference only; `docs/deployment/render-opensearch.md` preserved |
| #1340 | Docker artefacts + auth-enabled tooling | ✅ Closed — local Docker auth tooling ready |
| #1313 | 10k/100k parity and latency comparison | 🔄 Update scope: **local-only** (no Render target required) |
| #1328 | Lifecycle proof: update, stale-version, Kafka transport | 🔄 Reframe: Kafka scenario (#5) replaced by no-Kafka outbox poller proof; other scenarios (#1–#4) remain |
| #1320 | Frontend Discover integration on OpenSearch read path | 🔄 Unchanged in intent, but depends on local backend path first |
| #1321 | Cutover + rollback plan and go/no-go checklist | 🔄 Unchanged — this is the final gate; not immediate |

---

## Non-Negotiable Invariants

These invariants apply regardless of which deployment option is chosen:

1. Frontend **never** calls OpenSearch directly.
2. Backend owns all query construction — no raw DSL from clients.
3. Postgres remains source of truth; OpenSearch is a derived read model and must be rebuildable at any time.
4. No credentials committed to git.
5. OpenSearch read path only activates when `DISCOVER_OPENSEARCH_ENABLED=true`.
6. Indexer/poller only runs when `SEARCH_INDEXER_ENABLED=true`.
7. `docs/deployment/render-opensearch.md` (#1333) is a reference artefact for future deployment, not an immediate implementation path.
