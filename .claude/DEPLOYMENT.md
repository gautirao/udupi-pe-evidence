# Deployment Rules

## Topology

```
Cloudflare Pages (frontend, static)
        |
        | HTTPS — public API only
        v
Render Web Service (Spring Boot backend)
  srv-d648gt0gjchc739iegb0, region: oregon
        |
        | HTTPS + Basic auth (backend-only; frontend never gets OpenSearch creds)
        v
Render Web Service (OpenSearch 2.x)
  [validation-only, NOT yet provisioned]
  DISABLE_SECURITY_PLUGIN=false — auth required
```

OpenSearch is validation-only (shadow-read / parity testing). Feature flags
`discover.opensearch.enabled` and `discover.opensearch.shadow-enabled` default
`false` and must stay `false` in production until explicitly flipped in a
validated environment.

See full provisioning runbook: [docs/deployment/render-opensearch.md](../docs/deployment/render-opensearch.md)

This document defines **deployment invariants**.
These rules constrain *where* and *how* the system is deployed.
Concrete values (URLs, keys) live in `PROJECT_CONTEXT.md`.

---

## Deployment Targets (Invariant)

- **Frontend** must be deployed on **Cloudflare Pages**
- **Backend** must be deployed as a **Render service**
- No alternative deployment platforms without explicit approval

Local development is allowed but must mirror production assumptions.

---

## Supabase and Spring Boot invariants

See `.claude/ARCHITECTURE.md` — those rules are authoritative and not repeated here.

---

## Environment Configuration Rules

- No hardcoded URLs, secrets, or credentials
- All environment-specific values must come from env vars
- Frontend must use `VITE_`-prefixed variables only
- Local and production environments must be explicitly supported

If an env var is required, the app must fail fast with a clear error.

---

## CORS and Auth (Critical)

Backend must:
- Allow requests from the frontend deployment origin(s)
- Allow `Authorization` headers
- Correctly handle preflight (`OPTIONS`) requests
- Validate Supabase JWTs on all protected endpoints

CORS misconfiguration is a deployment failure.

---

## Data Rules (Invariant)

- Raw data must be persisted before any processing
- Raw scraped data must NOT be queried directly for dashboards
- Dashboards must use processed, clean, purpose-built tables

Data correctness outweighs convenience.

---

## Migration Philosophy

- Database migrations must be versioned (Flyway)
- Migrations should be idempotent where possible
- Migrations must be tested against a copy before production rollout
- No manual schema changes in production

---

## E2E / Playwright CI Variables

These env vars are required to run the full Playwright suite (Q3, Q7, global-setup, global-teardown).
Tests that need credentials use `test.skip` when vars are absent — they will not fail CI, but auth-gated coverage is skipped.

| Variable | Required for | Description |
|----------|-------------|-------------|
| `PLAYWRIGHT_BASE_URL` | All | Frontend URL (e.g. `http://localhost:5173`) |
| `BACKEND_BASE_URL` | Q4, Q5, Q7 | Backend URL (e.g. `http://localhost:8085`) |
| `SMOKE_USER_EMAIL` | Q3, Q7 | Regular user account email |
| `SMOKE_USER_PASSWORD` | Q3, Q7 | Regular user account password |
| `SMOKE_LISTING_ID` | Q7 (override) | LIVE listing ID — overrides auto-fixture |
| `DEALER_EMAIL` | global-setup, teardown | Dealer account email |
| `DEALER_PASSWORD` | global-setup, teardown | Dealer account password |
| `ADMIN_EMAIL` | listing-lifecycle | Admin account email |
| `ADMIN_PASSWORD` | listing-lifecycle | Admin account password |
| `VITE_SUPABASE_URL` | global-teardown auth | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | global-teardown auth | Supabase anon/publishable key |

Reference: `.env.e2e` at repo root contains example values for local development.

---

## Deployment provider config (external — cannot be changed from this repo)

The frontend build lives in `apps/web` and the backend build lives in `apps/api`.
Both Cloudflare Pages and Render are configured via their own dashboards, not
via a file checked into this repo, so a structure migration that moves these
directories requires a manual, one-time update on each provider:

- **Cloudflare Pages**: set the project's root/build directory to `apps/web`
  (build command `npm run build`, output directory `apps/web/dist`).
- **Render** (service `srv-d648gt0gjchc739iegb0`): set the service's root
  directory to `apps/api` (Dockerfile at `apps/api/Dockerfile`).

Until both are updated, production deploys will keep building from the old
`backend/` / repo-root paths — this is expected and does not indicate a
problem with the code in this repository.

---

## Enforcement

If a deployment decision conflicts with this document:
- STOP
- Call out the conflict explicitly
- Wait for human direction

Deployment rules override speed, convenience, and experimentation.


## CORS safety rule

- Do **not** use wildcard origins (`*`) when requests include credentials or `Authorization` headers.
- Prefer an explicit allowlist of known frontend origins (e.g., Cloudflare Pages / custom domains).

## Required environment variables (registry)

Maintain a canonical list of required env vars so services fail fast with actionable errors.

Backend (example):
- DATABASE_URL
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

Frontend (example):
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
