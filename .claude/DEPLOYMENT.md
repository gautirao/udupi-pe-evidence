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

- **Cloudflare Pages**: superseded by the npm-workspace-aware config below
  ("Cloudflare Pages: npm workspace + Rollup optional-dependency failure") —
  do **not** set the project root to `apps/web`; that section is now the one
  authoritative Cloudflare Pages configuration.
- **Render** (service `srv-d648gt0gjchc739iegb0`): set the service's root
  directory to `apps/api` (Dockerfile at `apps/api/Dockerfile`).

Until both are updated, production deploys will keep building from the old
`backend/` / repo-root paths — this is expected and does not indicate a
problem with the code in this repository.

---

## Cloudflare Pages: npm workspace + Rollup optional-dependency failure

Symptom: Cloudflare Pages build fails with
`Error: Cannot find module @rollup/rollup-linux-x64-gnu` even though the
committed root `package-lock.json` correctly lists every `@rollup/rollup-*`
platform package (including `linux-x64-gnu`) as an `os`/`cpu`-scoped optional
dependency.

**Root cause:** this is npm's own optional-dependency install bug
([npm/cli#4828](https://github.com/npm/cli/issues/4828)), not a lockfile
defect. It reproduces on some npm versions and not others against the exact
same lockfile — confirmed locally: macOS with npm 11.7.0 installs the
Linux Rollup binary correctly (as an inactive optional entry) and builds
clean, while Cloudflare Pages' build image runs npm 10.9.2, which hits the
bug and drops the platform-specific optional dependency during its
automatic pre-build `npm install` step. **Do not "fix" this by regenerating
the lockfile or by adding `@rollup/rollup-linux-x64-gnu` as a hard
dependency** — the lockfile is already correct, and pinning a
platform-specific native binary as a direct dependency breaks local
(macOS/Windows) installs.

**Fix — Cloudflare Pages dashboard only** (cannot be set from this repo):

1. Project → Settings → Environment variables → add `SKIP_DEPENDENCY_INSTALL=1`
   (any truthy value). This disables Cloudflare's automatic pre-build
   `npm install` step, which is where the buggy npm 10.9.2 runs.
2. Update the Build command to install dependencies itself with a
   known-good npm before building:
   `npm install -g npm@latest && npm ci && npm run build`

With `SKIP_DEPENDENCY_INSTALL` set, the full Cloudflare Pages config is:

```
Root directory: (leave blank)
Build command: npm install -g npm@latest && npm ci && npm run build
Build output directory: apps/web/dist
Production branch: main
Environment variables: SKIP_DEPENDENCY_INSTALL=1
```

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
