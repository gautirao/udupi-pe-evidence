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

- **Cloudflare Pages**: superseded by the config in the section below
  ("Cloudflare Pages: npm workspace + native optional-dependency records") —
  do **not** set the project root to `apps/web`; that section is now the one
  authoritative Cloudflare Pages configuration.
- **Render** (service `srv-d648gt0gjchc739iegb0`): set the service's root
  directory to `apps/api` (Dockerfile at `apps/api/Dockerfile`).

Until both are updated, production deploys will keep building from the old
`backend/` / repo-root paths — this is expected and does not indicate a
problem with the code in this repository.

---

## Cloudflare Pages: npm workspace + native optional-dependency records

Symptom: Cloudflare Pages build fails with
`Error: Cannot find module @rollup/rollup-linux-x64-gnu`.

**Root cause (corrected):** the previous version of this section attributed
this purely to npm's own optional-dependency install bug
([npm/cli#4828](https://github.com/npm/cli/issues/4828)) and claimed the
committed `package-lock.json` already had full records for every
`@rollup/rollup-*`, `@swc/core-*`, and `@esbuild/*` platform package. That
claim was disproven: the lockfile in circulation only carried full resolved
package records (`resolved`/`integrity`) for the platform that last ran
`npm install` — `darwin-arm64` — with `linux-x64-gnu` and the other
platform variants present only inside the parent package's
`optionalDependencies` map, not as their own top-level `node_modules/...`
entries. Any installer, buggy npm version or not, has nothing to resolve
those packages from.

**Fix — regenerate the lockfile in a clean Linux container** so npm
resolves and records every platform's optional dependency, not just the
one the last local `npm install` happened to run on:

```bash
docker run --rm --platform linux/amd64 \
  -v "$PWD:/repo" -w /repo node:22.16.0-bookworm bash -lc '
    npm install -g npm@11.7.0 &&
    rm -rf node_modules &&
    rm package-lock.json &&
    npm install --package-lock-only --include=optional --ignore-scripts
  '
```

`--platform linux/amd64` matters even on an Apple Silicon host: without it,
Docker Desktop pulls the arm64 image and npm records `linux-arm64` optional
entries instead of the `linux-x64-*` ones Cloudflare's build image actually
needs. Verify with a second clean-container run (`npm ci && npm run build`)
before committing.

**Do not** "fix" this by adding `@rollup/rollup-linux-x64-gnu` (or the
`@swc`/`@esbuild` Linux equivalents) as a hard dependency — pinning a
platform-specific native binary as a direct dependency breaks local
(macOS/Windows) installs. The lockfile, once regenerated this way, already
carries every platform's optional entry; no npm-version workaround or
`SKIP_DEPENDENCY_INSTALL` dashboard setting is required.

Full Cloudflare Pages config:

```
Root directory: (leave blank)
Build command: npm run build
Build output directory: apps/web/dist
Production branch: main
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
