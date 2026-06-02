# Render OpenSearch Provisioning Runbook

**Issue:** #1333  
**Status:** Validation-only — NOT yet provisioned. No Render resource has been created by this document.  
**Audience:** Engineers provisioning the OpenSearch validation environment on Render.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture and Topology](#2-architecture-and-topology)
3. [MVP Auth Model](#3-mvp-auth-model)
4. [Environment Variable Contract](#4-environment-variable-contract)
5. [Phase B: Provisioning](#5-phase-b-provisioning)
   - [5.1 MCP Capability Verdict](#51-mcp-capability-verdict)
   - [5.2 Manual Render Dashboard Steps](#52-manual-render-dashboard-steps)
   - [5.3 Blueprint Snippet (reference only)](#53-blueprint-snippet-reference-only)
   - [5.4 Tier and Cost Table](#54-tier-and-cost-table)
6. [Configure Backend Environment Variables](#6-configure-backend-environment-variables)
7. [Health Check](#7-health-check)
8. [Index Rebuild](#8-index-rebuild)
9. [Outbox / Poller — No-Kafka Path (FORWARD-LOOKING)](#9-outbox--poller--no-kafka-path-forward-looking)
10. [Security Model and Tradeoffs](#10-security-model-and-tradeoffs)
11. [Later Hardening](#11-later-hardening)
12. [Rollback and Teardown](#12-rollback-and-teardown)
13. [Known Limitations and Follow-ups](#13-known-limitations-and-follow-ups)
14. [User Action Checklist](#14-user-action-checklist)

---

## 1. Overview

This runbook describes how to provision a public Render web service running the
`opensearchproject/opensearch:2.x` Docker image for **validation use only** (shadow-read
parity testing, rebuild verification). It also documents what is not yet implemented,
where the security boundary sits, and the path to production hardening.

**This document does not provision anything.** No Render resource is created without
explicit user confirmation. The index rebuild is blocked until the auth gap described
in [§13](#13-known-limitations-and-follow-ups) is resolved.

---

## 2. Architecture and Topology

```
Cloudflare Pages (frontend, static)
        |
        | HTTPS — public API only
        v
Render Web Service (Spring Boot backend)
  srv-d648gt0gjchc739iegb0, region: oregon
        |
        | HTTPS + Basic auth (OPENSEARCH_USERNAME / OPENSEARCH_PASSWORD)
        | Backend-only — frontend NEVER gets these credentials
        v
Render Web Service (OpenSearch 2.x)
  [NOT YET PROVISIONED — validation/shadow only]
  DISABLE_SECURITY_PLUGIN=false (auth required)
```

**Invariants:**
- The frontend (Cloudflare Pages) **never** receives `OPENSEARCH_URL`, `OPENSEARCH_USERNAME`,
  or `OPENSEARCH_PASSWORD`. These are backend-only env vars.
- The backend **never** accepts raw OpenSearch DSL from browser requests. All query
  construction happens server-side in `DiscoverQueryDsl.java`.
- OpenSearch is backend-only infrastructure, not a public API.

---

## 3. MVP Auth Model

The MVP boundary is: **public Render web service + HTTPS + Basic auth**.

- OpenSearch **must** require authentication. `DISABLE_SECURITY_PLUGIN=false` is a
  service-side setting set at provisioning time (Render environment variable on the
  OpenSearch service, not on the backend).
- The backend authenticates using `OPENSEARCH_USERNAME` / `OPENSEARCH_PASSWORD` (Basic)
  or `OPENSEARCH_API_KEY` (API key — takes precedence when both are set).
- Auth precedence in `OpenSearchClientConfig.java` L41-48: API key wins over Basic.
  If both are set, Basic auth is silently ignored — no runtime warning is emitted;
  the only indicator is that Basic credentials have no effect. Set exactly one.

> **CORS is NOT authentication.** CORS headers control browser cross-origin requests
> only; they provide no protection against server-to-server calls or `curl`. The only
> real boundary is HTTPS + Basic auth (or API key). Never rely on CORS to protect
> OpenSearch.

---

## 4. Environment Variable Contract

These variables are set **only on the Spring Boot backend service**
(`srv-d648gt0gjchc739iegb0`). They must **never** be set on the frontend (Cloudflare
Pages) or committed to any `.env` file in the repository.

| Variable | Required | Default (application.yml) | Purpose |
|---|---|---|---|
| `OPENSEARCH_URL` | Yes (when enabled) | `http://localhost:9200` (L179) | Full HTTPS URL of the Render OpenSearch service |
| `OPENSEARCH_USERNAME` | Yes for Basic auth | `""` (L185) | OpenSearch basic-auth username |
| `OPENSEARCH_PASSWORD` | Yes for Basic auth | `""` (L186) | OpenSearch basic-auth password |
| `OPENSEARCH_API_KEY` | Alt to Basic auth | `""` (L187) | API key — takes precedence over Basic when set |
| `DISCOVER_OPENSEARCH_ENABLED` | No | `false` (L178) | Set to `false` in prod; flip only in validation env |
| `DISCOVER_OPENSEARCH_SHADOW_ENABLED` | No | `false` (L190) | Set to `false` in prod; flip only in validation env |

> **application.yml references:** `url` at L179; `username` at L185; `password` at L186;
> `api-key` at L187; `enabled` default `false` at L178; `shadow-enabled` default `false` at L190.

**Flag policy:** `discover.opensearch.enabled` and `discover.opensearch.shadow-enabled`
stay `false` in production. The `OpenSearchClientConfig` bean is gated by
`@ConditionalOnProperty(name = "discover.opensearch.enabled", havingValue = "true",
matchIfMissing = false)` (OpenSearchClientConfig.java L31) — when the flag is false,
no HTTP connection is opened and the adapters are not instantiated. There is no
Discover cutover until these flags are explicitly flipped in a validated environment.

**Never log credentials.** The backend masks the OpenSearch URL in rebuild script
output via `_safe_db_url_display` and logs no auth headers.

---

## 5. Phase B: Provisioning

> **State:** The OpenSearch service has NOT been created in this PR.
> No Render resource is created without explicit user confirmation.
> The env-var merge (§6) is gated on the service existing.

### 5.1 MCP Capability Verdict

`mcp__render__create_web_service` **cannot create OpenSearch.** The tool only supports
web services that do not use Docker or a container registry — it has no `image` parameter
for pulling `opensearchproject/opensearch:2.x`. OpenSearch must be provisioned manually
via the Render Dashboard as described below.

`mcp__render__update_environment_variables` **can** merge env vars onto the backend
service using `replace=false` (the default). This is safe to re-run — it merges rather
than replaces, so it never clobbers existing secrets. When in doubt, verify in the
Render dashboard before running.

### 5.2 Manual Render Dashboard Steps

> Prerequisites: you are logged in to the `tea-d63jv1vfte5s73fjnj1g` workspace.

1. **New Service** → **Web Service**
2. Select **"Deploy an existing image from a registry"**
3. Image: `opensearchproject/opensearch:<tag>` — always pin a specific tag, never `:latest`.
   Verify the current stable 2.x tag at https://hub.docker.com/r/opensearchproject/opensearch/tags
   before provisioning (e.g. `opensearchproject/opensearch:2.x` is a placeholder — substitute
   the actual latest 2.x release tag).
4. Name: `udupi-opensearch-validation` (or similar)
5. Region: **Oregon** (same region as the backend — `srv-d648gt0gjchc739iegb0`)
6. Instance type: **Free** (ephemeral, 512 MB RAM — see tier table; upgrade for persistent data)
7. Add environment variables on the OpenSearch service (not the backend):

   | Variable | Value |
   |---|---|
   | `DISABLE_SECURITY_PLUGIN` | `false` |
   | `OPENSEARCH_INITIAL_ADMIN_PASSWORD` | `<strong password — set via Render UI, never commit>` |
   | `discovery.type` | `single-node` |

8. Deploy. Wait for health to show **Live**.
9. Copy the public HTTPS URL (e.g. `https://udupi-opensearch-validation.onrender.com`).
10. Note the admin username (default: `admin`) and the password you set above.

> **Password hygiene:** Use a password manager to generate and store the admin password.
> Do not pass credentials as shell arguments where they will appear in `ps` output or
> shell history. Use environment variables or a credential manager. If you must use
> shell variables, run `set +o history` before setting them and `set -o history` after.

### 5.3 Blueprint Snippet (reference only)

The snippet below is **for reference only** — it shows what the Render Blueprint
configuration would look like. **Do not commit this as a `render.yaml` file.**
Blueprint files are infrastructure-as-code that Render executes automatically; committing
one without review could provision real resources.

```yaml
# render.yaml REFERENCE ONLY — do not commit as a file
# Requires Render Blueprint support for container registry images.
services:
  - type: web
    name: udupi-opensearch-validation
    region: oregon
    plan: free          # ephemeral — upgrade to starter for persistent data
    image:
      # Pin the current stable 2.x tag — verify at hub.docker.com/r/opensearchproject/opensearch/tags
      # Never use :latest. Replace 2.x below with the actual release tag before use.
      url: docker.io/opensearchproject/opensearch:2.x
    envVars:
      - key: DISABLE_SECURITY_PLUGIN
        value: "false"
      - key: OPENSEARCH_INITIAL_ADMIN_PASSWORD
        sync: false     # set manually in dashboard — never in committed yaml
      - key: discovery.type
        value: single-node
    healthCheckPath: /_cluster/health
```

### 5.4 Tier and Cost Table

| Tier | RAM | Disk | Data persistence | Cost | Suitable for |
|---|---|---|---|---|---|
| **Free** | ~512 MB | Ephemeral | **Lost on restart** | $0/mo | Quick smoke tests only — do not store index data you need to keep |
| **Starter** | 512 MB | 10 GB persistent SSD | Survives restarts | ~$7/mo | Persistent validation index |
| **Managed OpenSearch** (e.g. AWS OpenSearch Service, Bonsai) | Configurable | Configurable | Production-grade | $$ | Production — with HA, backups, upgrades |

> **Free tier is not production-ready.** The ~512 MB RAM limit may be insufficient
> for OpenSearch with a full listing index (OpenSearch recommends ≥1 GB heap for
> non-trivial workloads). Use Free only for transient smoke tests. Pay the $7/mo
> Starter bump for any index you intend to keep. Use a managed OpenSearch service
> for production.

---

## 6. Configure Backend Environment Variables

Once the OpenSearch service exists and you have its URL and credentials, use the
Render MCP tool to merge env vars onto the backend service. The `replace=false`
default means this is a merge — existing env vars are preserved.

**MCP call (do not execute until service exists):**

```
mcp__render__update_environment_variables
  serviceId: srv-d648gt0gjchc739iegb0
  envVars:
    - key: OPENSEARCH_URL
      value: <public HTTPS URL from step 9 above>
    - key: OPENSEARCH_USERNAME
      value: admin
    - key: OPENSEARCH_PASSWORD
      value: <password from step 7 above — use Render UI, not MCP, for secrets>
    - key: DISCOVER_OPENSEARCH_ENABLED
      value: "false"
    - key: DISCOVER_OPENSEARCH_SHADOW_ENABLED
      value: "false"
  replace: false
```

> Both flags default to `false` but are set explicitly here so their state is visible
> in the Render dashboard. Do **not** flip them to `true` until validation is complete.
> Setting them explicitly via MCP is idempotent (safe to re-run).

> **Prefer setting `OPENSEARCH_PASSWORD` via the Render Dashboard UI** rather than
> via MCP CLI calls, to avoid the password appearing in shell history or tool logs.

---

## 7. Health Check

Run after provisioning and after any restart. Use `$ENV_VARS` — never inline credentials.

```bash
# Set from your password manager or environment — do NOT inline in commands
export OPENSEARCH_URL="https://udupi-opensearch-validation.onrender.com"
export OPENSEARCH_USERNAME="admin"
export OPENSEARCH_PASSWORD="<your-password>"

curl -s -u "$OPENSEARCH_USERNAME:$OPENSEARCH_PASSWORD" \
     "$OPENSEARCH_URL/_cluster/health?pretty"
```

**Expected output:** `"status": "green"` or `"status": "yellow"` (yellow is normal
for a single-node cluster with no replicas).

**Stop and investigate if status is `"red".`** A red cluster means shards are
unassigned and the index is partially or fully unavailable. Do not proceed with
rebuild on a red cluster.

Check the index alias exists after rebuild:

```bash
curl -s -u "$OPENSEARCH_USERNAME:$OPENSEARCH_PASSWORD" \
     "$OPENSEARCH_URL/_cat/aliases/listings_read?v"
```

---

## 8. Index Rebuild

> **BLOCKED** — See [§13 Known Limitations](#13-known-limitations-and-follow-ups) for the
> auth gap. The rebuild script will return 401 against a Basic-auth cluster until the
> auth gap is resolved. **Do not run the rebuild against the Render cluster until the
> follow-up fix is merged.**

Once the auth gap is resolved, the rebuild workflow is:

```bash
# Required env vars (set from password manager — not shell args)
export OPENSEARCH_URL="https://udupi-opensearch-validation.onrender.com"
export DATABASE_URL="postgres://..."   # read-only replica preferred

# 1. Dry run first — no indexing, no alias swap
python -m scripts.opensearch_rebuild --dry-run --allow-non-localhost

# 2. Full rebuild with count tolerance for race window
python -m scripts.opensearch_rebuild \
  --allow-non-localhost \
  --max-count-delta 5 \
  --cleanup-old

# 3. Verify alias
curl -s -u "$OPENSEARCH_USERNAME:$OPENSEARCH_PASSWORD" \
     "$OPENSEARCH_URL/_cat/aliases/listings_read?v"
```

**Notes:**
- `--allow-non-localhost` is **mandatory** for any non-localhost cluster
  (`_check_safety_gates` at opensearch_rebuild.py L298-320 will abort without it).
- `--url` reads `$OPENSEARCH_URL` (L657); `--db-url` reads `$DATABASE_URL` (L662).
- `--allow-non-localhost` definition at L710-714: "Bypass the localhost safety gate.
  DANGER: do NOT use against production OpenSearch or Postgres."
- `--max-count-delta 5` tolerates a small race window between the Postgres count
  query and the index completion check.
- Always `--dry-run` first. Review the expected doc count before committing the
  alias swap.
- After a successful run, verify the `listings_read` alias points to the new
  versioned index.

---

## 9. Outbox / Poller — No-Kafka Path (FORWARD-LOOKING)

> **This section describes a path that does not yet exist.** Read carefully before
> acting on it.

**What exists today:**

| Artifact | Status | Notes |
|---|---|---|
| `V81__listing_search_outbox.sql` | EXISTS — contract only | Header (L2-6): "The Spring Boot backend does NOT yet write to this table; a Python simulator populates it for prototype/testing purposes." No trigger, no stored-procedure logic. |
| `scripts/opensearch_outbox_simulator.py` | EXISTS — prototype | Writes outbox rows for local testing. Not for production. |
| `scripts/opensearch_outbox_relay.py` | EXISTS — Kafka-coupled | Polls `listing_search_outbox` WHERE `published_at IS NULL` and publishes to **Kafka** (not directly to OpenSearch). There is no no-Kafka path. |
| Spring Boot outbox writer | **NOT IMPLEMENTED** | The backend does not write to `listing_search_outbox` on listing mutations. |
| No-Kafka DB→OpenSearch poller | **NOT IMPLEMENTED** | No script or service polls the outbox table and writes directly to OpenSearch without Kafka. |

**Forward-looking design (not implemented):**

A no-Kafka incremental path would require:
1. Spring Boot transactional outbox writer (writes to `listing_search_outbox` in the
   same transaction as listing mutations).
2. A poller (Spring Boot scheduler or Python script) that reads unpublished rows and
   indexes them directly into OpenSearch.

When this is implemented, the following env vars would be needed (all net-new,
none exist in config today):

| Variable | Suggested MVP value | Notes |
|---|---|---|
| `SEARCH_OUTBOX_POLL_INTERVAL_SECONDS` | `30` | How often the poller checks for new events |
| `SEARCH_OUTBOX_MIN_EVENT_AGE_SECONDS` | `5`–`60` for normal events; `86400` (24h cooling-off) for LISTING_DELETED | Minimum age before processing — allows cancellation/correction window |
| `SEARCH_OUTBOX_BATCH_SIZE` | `50`–`100` | Rows per poll cycle |

None of these keys exist in `application.yml` or any config file today. They are
labelled net-new / forward-looking here.

**The existing `opensearch_outbox_relay.py` is Kafka-coupled.** It polls
`listing_search_outbox` and publishes to a Kafka topic. It does not write to
OpenSearch directly. Reusing it for a no-Kafka path would require a significant
rewrite.

---

## 10. Security Model and Tradeoffs

### What the MVP provides

- HTTPS in transit (Render provides TLS termination).
- HTTP Basic auth on every request (OpenSearch `DISABLE_SECURITY_PLUGIN=false`).
- Backend-only credential scope: frontend never sees OpenSearch credentials.
- No OpenSearch DSL accepted from browsers: all queries are server-side.

### Public service tradeoffs

The OpenSearch service is a **public Render web service** — its HTTPS endpoint is
reachable from the internet. The auth boundary is Basic auth over HTTPS.

| Property | MVP (public + Basic auth) | Later hardening |
|---|---|---|
| Internet-reachable | Yes | Render private service (internal network only) |
| Auth boundary | Basic auth / API key | mTLS, IP allowlist, least-privilege user |
| Credential exposure | Backend env vars only | Same + secret rotation |
| Blast radius if creds leak | Full OpenSearch access | Restricted to read-only role |

> **CORS is NOT authentication** — restated here for clarity. A public endpoint with
> CORS restrictions is still accessible to any non-browser client. HTTPS + auth is
> the only meaningful boundary for a public service.

### What the backend never does

- Never forwards raw OpenSearch DSL from browser requests.
- Never exposes OpenSearch internals (index names, shard details, cluster topology)
  in API responses.
- Never logs `OPENSEARCH_PASSWORD`, `OPENSEARCH_API_KEY`, or auth headers.

---

## 11. Later Hardening

These are not required for the validation phase but should be addressed before
any production use:

1. **Render private service** — Move OpenSearch to a Render private service
   (internal network only, not internet-reachable). The backend accesses it over
   the internal network; no public TLS termination needed.
2. **Managed OpenSearch** — Use AWS OpenSearch Service, Bonsai, or equivalent for
   production: HA, automated backups, version upgrades, VPC isolation.
3. **Least-privilege user** — Create a dedicated non-admin OpenSearch user with
   read/write access to `listings_*` indices only. Do not use the admin user for
   application traffic.
4. **mTLS** — Mutual TLS between backend and OpenSearch for an additional transport
   layer (beyond Basic auth).
5. **IP allowlist** — If using a public Render service, restrict inbound access to
   the Render backend's outbound IP range.
6. **Reverse proxy / shared secret** — An nginx or Caddy sidecar with a shared
   secret header can add an additional layer without requiring TLS client certificates.
7. **Secret rotation** — Rotate `OPENSEARCH_INITIAL_ADMIN_PASSWORD` after initial
   setup; use a dedicated application credential rather than the admin password.

---

## 12. Rollback and Teardown

**Disable the backend adapter (immediate, no data loss):**

Set on the backend service (`srv-d648gt0gjchc739iegb0`):
- `DISCOVER_OPENSEARCH_ENABLED=false`
- `DISCOVER_OPENSEARCH_SHADOW_ENABLED=false`

The `@ConditionalOnProperty` gate means the adapters are not instantiated when the
flag is false. The Postgres path is unchanged and continues to serve all requests.
A backend restart is required for the flag change to take effect.

**Delete the OpenSearch index (data only, service survives):**

```bash
curl -X DELETE -u "$OPENSEARCH_USERNAME:$OPENSEARCH_PASSWORD" \
     "$OPENSEARCH_URL/listings_read"
# Or delete all versioned indexes:
curl -X DELETE -u "$OPENSEARCH_USERNAME:$OPENSEARCH_PASSWORD" \
     "$OPENSEARCH_URL/listings_v*"
```

**Delete the Render OpenSearch service (full teardown):**

Via Render Dashboard: Settings → Delete Service. This is irreversible. Confirm
both flags are already `false` on the backend before deleting the service to
avoid backend errors during the deletion window.

---

## 13. Known Limitations and Follow-ups

### BLOCKER: Rebuild script has no auth support (401 against Basic-auth cluster)

`opensearch_rebuild.py::_build_opensearch_client` (L174-179) constructs the
`OpenSearch` client from URL only — it passes no `http_auth` or `api_key` parameter:

```python
# opensearch_rebuild.py L174-179 — current implementation
def _build_opensearch_client(url: str) -> OpenSearch:
    """Build an OpenSearch client from a base URL (no credentials logged)."""
    parsed = urllib.parse.urlparse(url)
    hosts = [{"host": parsed.hostname, "port": parsed.port or 9200}]
    scheme = parsed.scheme or "http"
    return OpenSearch(hosts=hosts, http_compress=True, use_ssl=(scheme == "https"))
```

When run against a Render OpenSearch cluster with `DISABLE_SECURITY_PLUGIN=false`,
every request will return HTTP 401. **The rebuild will fail entirely.**

**Required fix (to be filed as a follow-up issue):**
- Add `OPENSEARCH_USERNAME` / `OPENSEARCH_PASSWORD` and optionally `OPENSEARCH_API_KEY`
  as environment variable inputs to `opensearch_rebuild.py` (alongside existing
  `OPENSEARCH_URL` at L657).
- Pass `http_auth=(username, password)` or `api_key=...` to the `OpenSearch()`
  constructor in `_build_opensearch_client`.
- The same gap exists in `opensearch_backfill.py` (L129) and `opensearch_fts_compare.py`
  (L98) which import or replicate `_build_opensearch_client`.

**Do not run the rebuild against any auth-enabled cluster until this fix is merged.**

### Other follow-ups

| # | Description | Priority |
|---|---|---|
| Follow-up A | Add basic-auth (`http_auth`) to `_build_opensearch_client` in `opensearch_rebuild.py` (and `opensearch_backfill.py`, `opensearch_fts_compare.py`) | P0 — blocks rebuild |
| Follow-up B | Move OpenSearch to a Render private service for production | P1 — before prod cutover |
| Follow-up C | Create least-privilege OpenSearch user (not admin) for application traffic | P1 — before prod cutover |
| Follow-up D | Implement Spring Boot transactional outbox writer | P2 — enables incremental indexing |
| Follow-up E | No-Kafka DB→OpenSearch poller | P2 — depends on D |

---

## 14. User Action Checklist

Steps that require explicit human action (cannot be automated by an agent without
your confirmation):

- [ ] **select_workspace** `tea-d63jv1vfte5s73fjnj1g` in Render MCP before any
  list/create calls
- [ ] **Create the OpenSearch service** via Render Dashboard (§5.2) — manual Docker
  image deploy; MCP cannot do this
- [ ] **Set `OPENSEARCH_INITIAL_ADMIN_PASSWORD`** in the Render Dashboard UI (not via
  MCP or shell args) — use a password manager; never commit
- [ ] **Capture the public HTTPS URL** after the service is Live
- [ ] **Run the env-var merge** (§6) against the backend service — only after the
  service exists; verify `replace=false` to confirm merge semantics
- [ ] **Run the health check** (§7) — confirm `green` or `yellow` before proceeding
- [ ] **Resolve the rebuild auth gap** (§13 Follow-up A) before running any rebuild
- [ ] **Run rebuild with `--dry-run` first** (§8) — review expected counts before
  committing the alias swap
- [ ] **Verify `listings_read` alias** after rebuild
- [ ] **Keep both feature flags `false`** (`DISCOVER_OPENSEARCH_ENABLED`,
  `DISCOVER_OPENSEARCH_SHADOW_ENABLED`) until validation is complete; get explicit
  approval before flipping either
