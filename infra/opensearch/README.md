# OpenSearch on Render — Deployment Guide

This directory contains the Docker artefacts for running a single-node
OpenSearch 2.13.0 cluster as a Render Web Service.

---

## Render Web Service creation steps

1. In the Render dashboard choose **New → Web Service**.
2. Connect your repository and set **Root Directory** to `infra/opensearch`.
3. Set **Environment** to **Docker** — Render will use the `Dockerfile` in the root directory.
4. Choose an instance type with at least **2 GB RAM** (OpenSearch requires it).
5. Set the environment variables listed below.
6. Deploy.

---

## Required environment variables

| Variable | Description |
|---|---|
| `OPENSEARCH_INITIAL_ADMIN_PASSWORD` | Admin password for the built-in `admin` user. **You MUST set this via the Render Dashboard environment variables — do NOT bake it into the Dockerfile.** Minimum 8 characters, mixed case + digits. |

## Variables consumed by scripts (not by OpenSearch itself)

Set these in the environments where `scripts/opensearch_rebuild.py` and
`scripts/opensearch_backfill.py` run (e.g. your CI runner or local shell):

| Variable | Description |
|---|---|
| `OPENSEARCH_URL` | Full base URL of the cluster, e.g. `https://my-opensearch.onrender.com` |
| `OPENSEARCH_USERNAME` | Basic-auth username (typically `admin`) |
| `OPENSEARCH_PASSWORD` | Basic-auth password (must match `OPENSEARCH_INITIAL_ADMIN_PASSWORD`) |
| `OPENSEARCH_API_KEY` | API key value (takes precedence over username/password when set) |

### Expected URL shape

```
https://<service-name>.onrender.com
```

The scripts connect to port 443 (HTTPS) on the Render-provided hostname.
Do **not** append `:9200` — Render's HTTPS proxy handles the port mapping.

---

## Health check

Once deployed, verify the cluster is healthy:

```bash
curl -u admin:$OPENSEARCH_INITIAL_ADMIN_PASSWORD \
  https://<service-name>.onrender.com/_cluster/health | python3 -m json.tool
```

Expected: `"status": "green"` or `"status": "yellow"` (yellow is normal for
a single-shard single-node cluster with no replicas).

---

## Persistence / disk caveat

Render Web Services do **not** provide persistent disk by default. Index data
is stored in the container's ephemeral filesystem and is **lost on every
deploy or restart**.

For MVP / read-model-rebuild workloads this is acceptable: `opensearch_rebuild.py`
performs a full atomic rebuild from Postgres on each run. Simply re-run the
rebuild script after any restart.

For production: attach a Render Disk to the service (mount at
`/usr/share/opensearch/data`) to persist index data across restarts.

---

## MVP public-service security tradeoff

The Dockerfile sets `DISABLE_SECURITY_PLUGIN=false`, which keeps the
OpenSearch Security plugin active. However, on Render the service is
**publicly reachable** on the `.onrender.com` subdomain.

MVP mitigation: strong admin password + script-side Basic auth or API key.
This means unauthenticated reads are blocked at the OpenSearch layer.

**Production target**: deploy OpenSearch inside a private Render network
(Private Service) so it is not internet-accessible, and access it only from
the Spring Boot backend service within the same private network. The scripts
can then run from a Render Cron Job with network access to the private service.

---

## Local development

For local development, use `docker-compose.opensearch.yml` in the project root
(runs without the security plugin via `DISABLE_SECURITY_PLUGIN=true`). The
scripts' localhost safety gate prevents accidental production writes.
