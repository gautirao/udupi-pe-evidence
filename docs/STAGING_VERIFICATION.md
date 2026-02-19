# Staging → Production Verification

**Sprint**: Sprint 4 — Observability, Security Hardening, Smoke Tests
**Date**: 2026-02-19
**Status**: ✅ VERIFIED — all gates passed
**Verified by**: team-lead + automated smoke test (Playwright Q1–Q5)

---

## Baseline (Sprint 4 completion state)

| Item | Value |
|------|-------|
| Backend tests | 435 pass, 0 fail, 7 skipped (Docker-gated, pre-existing) |
| Frontend tests | 49 pass, 0 fail, 5 files |
| Frontend build | ✅ Clean, no chunk-size warnings, built in 4.09s |
| Backend JAR | ✅ 58M |
| Last commit on main | `e1a162b` — fix: unwrap Page<T> in useNotifications; disable build minification |

---

## Gate 1 — Local test suite

### Command
```bash
cd backend && mvn test -q
```

### Result
```
Tests run: 435, Failures: 0, Errors: 0, Skipped: 7
BUILD SUCCESS
```

Note: test count increased from 424 (Sprint 3) to 435 (Sprint 4) — 11 new tests added:
- `CorsPreflightTest` (3 tests) — CORS preflight regression
- `OpportunityQueryRegressionTest` (3 tests) — PSQLException SQL cast regression
- Playwright e2e Q1–Q5 (5 tests) — browser smoke suite

### Command
```bash
npm test -- --run && npm run build
```

### Result
```
Test Files  5 passed (5)
     Tests  49 passed (49)
  Duration  ~1.8s

dist/ build: 4.09s (no chunk-size warnings)
```

---

## Gate 2 — Automated prod smoke test

### Playwright Quick 5-Step Smoke (Q1–Q5)

```bash
SMOKE_USER_EMAIL=<email> SMOKE_USER_PASSWORD=<password> npm run test:e2e
```

### Results (2026-02-19)

| Check | Result |
|-------|--------|
| Q1 — App loads, no blank screen, Sentry boundary not triggered | ✅ PASS |
| Q2 — `/dealer/listings/new` redirects to `/auth` when unauthenticated | ✅ PASS |
| Q3 — Login with valid credentials succeeds, no error toast | ✅ PASS |
| Q4 — Zero CORS errors navigating Home and Insights | ✅ PASS |
| Q5 — Unauthenticated ingestion POST returns 401 | ✅ PASS |

### Manual prod API checks (2026-02-19)

| Check | Result |
|-------|--------|
| Node.js, npm, Maven, Java present | ✅ |
| Backend tests (435) | ✅ 0 failures |
| Frontend tests (49) | ✅ 0 failures |
| Frontend build | ✅ 4.09s |
| TypeScript type check | ✅ No errors |
| **Prod: Backend health** `GET /actuator/health` | ✅ `{"status":"UP","groups":["liveness","readiness"]}` |
| **Prod: Frontend loads** `GET pages.dev` | ✅ HTTP 200 |
| **Prod: CORS preflight — allowed origin (`/api/notifications`)** | ✅ 200 + correct `access-control-allow-origin` |
| **Prod: CORS preflight — blocked origin** | ✅ 403, no ACAO header |
| **Prod: CORS preflight — Accept+DNT headers (`/api/insights/new-listings`)** | ✅ 200, `accept, dnt` in allow-headers |
| **Prod: Unauthenticated API → 401** | ✅ |
| **Prod: Ingestion — no API key → 401** | ✅ |
| **Prod: Ingestion — wrong API key → 401** | ✅ |
| **Prod: X-Request-Id header present (MDC correlation)** | ✅ `x-request-id: c4008270-2f5e-4a51-98b2-1559f7f236d8` |

---

## Gate 3 — CORS headers verified

### Verified headers on `OPTIONS /api/notifications`

```
HTTP/2 200
access-control-allow-credentials: true
access-control-allow-headers: authorization, content-type, accept, dnt
access-control-allow-methods: GET,POST,PUT,DELETE,OPTIONS
access-control-allow-origin: https://udupi-property-explorer.pages.dev
access-control-max-age: 3600
```

### Verified headers on `OPTIONS /api/insights/new-listings`

```
HTTP/2 200
access-control-allow-headers: authorization, accept, dnt
access-control-allow-origin: https://udupi-property-explorer.pages.dev
```

`DNT` and `Accept` confirmed present (HOT-5, commit `f1aab23`).

---

## Gate 4 — Security contract spot-checks

| Check | Command | Result |
|-------|---------|--------|
| Ingestion: no key | `curl ... POST /api/ingestion/ingest-posts` (no key) | `401` ✅ |
| Ingestion: wrong key | `curl ... -H "X-Ingestion-Api-Key: wrongkey"` | `401` ✅ |
| Blocked CORS origin | `curl ... OPTIONS -H "Origin: https://evil.example.com"` | `403` ✅ |
| Unauthenticated protected route | `curl ... /api/listings/mine` | `401` ✅ |

---

## Gate 5 — Observability

| Check | Evidence | Status |
|-------|----------|--------|
| MDC `requestId` in every log line | `application.yml` pattern: `[requestId=%X{requestId:-none}]` | ✅ |
| `X-Request-Id` response header on every request | Confirmed via curl to `/actuator/health` | ✅ |
| `MdcRequestFilter` at `HIGHEST_PRECEDENCE` | `@Order(Ordered.HIGHEST_PRECEDENCE)` | ✅ |
| Backend Sentry DSN configured | `sentry.dsn: ${SENTRY_DSN:}` in `application.yml` | ✅ |
| Backend `send-default-pii: false` | `application.yml` line 75 | ✅ |
| Frontend Sentry DSN baked into bundle | DSN confirmed visible in prod `index-*.js` | ✅ |
| Frontend `sendDefaultPii: false` | `src/main.tsx` line 9 | ✅ |
| Frontend `Sentry.ErrorBoundary` wraps `<App />` | `src/main.tsx` lines 13–16 | ✅ |

---

## Production URLs

| Service | URL | Status |
|---------|-----|--------|
| Frontend | https://udupi-property-explorer.pages.dev | ✅ Live |
| Backend | https://udupi-property-explorer.onrender.com | ✅ Live |
| Backend health | https://udupi-property-explorer.onrender.com/actuator/health | ✅ `{"status":"UP"}` |

---

## Required env vars in production

| Var | Where | Status |
|-----|-------|--------|
| `CORS_ALLOWED_ORIGINS` | Render | ✅ Set |
| `INGESTION_API_KEY` | Render | ✅ Set |
| `SENTRY_DSN` | Render | ✅ Set |
| `VITE_SUPABASE_URL` | Cloudflare Pages | ✅ Set |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Cloudflare Pages | ✅ Set |
| `VITE_API_BASE_URL` | Cloudflare Pages | ✅ Set |
| `VITE_SENTRY_DSN` | Cloudflare Pages | ✅ Set |

---

## Known warnings (non-blocking)

| Item | Risk | Action |
|------|------|--------|
| 5 npm audit vulnerabilities | Low — pre-existing, not high/critical | Monitor; run `npm audit` for details |
| ESLint: `no-explicit-any` in `AddressPicker.tsx`, `PropertyMap.tsx` | Low — pre-existing | Track in Sprint 5 |
| ESLint: empty interfaces in shadcn `ui/` components | Low — generated code | Accept as-is |
| 7 Docker-gated integration tests skipped | Expected — no Docker in CI | Pre-existing; not a regression |

---

## Sprint 4 commits on main

| Commit | Summary |
|--------|---------|
| `4ac90cc` | fix: resolve CORS preflight 404 on protected endpoints |
| `bc7b8e7` | fix: add explicit casts to resolve PSQLException parameter type inference |
| `3a6b0c5` | test: add regression tests for CORS preflight and SQL type cast fixes |
| `5da1328` | fix: extract .content from Page responses in useNewListings and useRecommendations |
| `e1a162b` | fix: unwrap Page<T> in useNotifications; disable build minification |
| `5f6893f` | chore: ignore Playwright test output directories |
| `eb6e50d` | S4-e2e: Add Playwright Quick 5-Step Smoke tests (Q1–Q5) |
| `6aa11ff` | S4-8: Harden MdcRequestFilter against CWE-117 log injection |
| `b366fca` | S4-4 + S4-6: Backend Sentry monitoring + production runbook |
| `c714afa` | S4-5: Add Sentry error monitoring to React frontend |

---

## Re-verification commands

```bash
# Playwright smoke (Q1–Q5) — requires test credentials
SMOKE_USER_EMAIL=<email> SMOKE_USER_PASSWORD=<password> npm run test:e2e

# Full local + prod gate
./scripts/smoke_test.sh --prod

# Local tests only
cd backend && mvn test -q && cd .. && npm test -- --run && npm run build
```
