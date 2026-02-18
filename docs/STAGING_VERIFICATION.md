# Staging → Production Verification

**Sprint**: Sprint 4 — Staging/Production Readiness
**Date**: 2026-02-18
**Status**: ✅ VERIFIED — all gates passed
**Verified by**: team-lead + automated smoke test

---

## Baseline (Sprint 3 completion state)

| Item | Value |
|------|-------|
| Backend tests | 424 pass, 0 fail, 7 skipped (Docker-gated, pre-existing) |
| Frontend tests | 49 pass, 0 fail, 5 files |
| Frontend build | ✅ Clean, no chunk-size warnings |
| Backend JAR | ✅ 58M |
| Last commit on main | `f1aab23` — HOT-5: CORS Accept+DNT fix |

---

## Gate 1 — Local test suite

### Command
```bash
cd backend && mvn test -q
```

### Result
```
Tests run: 424, Failures: 0, Errors: 0, Skipped: 7
BUILD SUCCESS
```

### Command
```bash
npm test -- --run && npm run build
```

### Result
```
Test Files  5 passed (5)
     Tests  49 passed (49)
  Duration  ~1.8s

dist/ build: 1.6M  (no chunk-size warnings)
```

---

## Gate 2 — Automated prod smoke test

### Command
```bash
./scripts/smoke_test.sh --prod
```

### Full results (2026-02-18)

| Check | Result |
|-------|--------|
| Node.js, npm, Maven, Java present | ✅ |
| Backend tests (424) | ✅ 0 failures |
| Frontend tests (49) | ✅ 0 failures |
| Frontend build | ✅ 1.6M |
| Backend JAR build | ✅ 58M |
| TypeScript type check | ✅ No errors |
| **Prod: Backend health** `GET /actuator/health` | ✅ `{"status":"UP"}` |
| **Prod: Frontend loads** `GET pages.dev` | ✅ HTTP 200 |
| **Prod: CORS preflight — allowed origin** | ✅ 200 + correct `access-control-allow-origin` |
| **Prod: CORS preflight — blocked origin** | ✅ 403, no ACAO header |
| **Prod: Unauthenticated API → 401** | ✅ |
| **Prod: HOT-4 vendor-react has react-leaflet exports** | ✅ MapContainer/useMap/TileLayer present |
| **Prod: HOT-4 vendor-leaflet is clean** | ✅ No react-leaflet exports |
| **Prod: Ingestion — no API key → 401** | ✅ |
| **Prod: Ingestion — wrong API key → 401** | ✅ |

**Score: 18/18 checks pass** (1 expected non-pass: local backend not running — not a deployment issue)

---

## Gate 3 — CORS headers verified (HOT-5)

### Verified headers on `OPTIONS /api/insights/new-listings`

```
HTTP/2 200
access-control-allow-credentials: true
access-control-allow-headers: authorization, content-type, accept, dnt
access-control-allow-methods: GET,POST,PUT,DELETE,OPTIONS
access-control-allow-origin: https://udupi-property-explorer.pages.dev
access-control-max-age: 3600
```

`DNT` and `Accept` confirmed present after HOT-5 deploy (`f1aab23`).
Previously these were missing, causing CORS failures on `/insights`.

---

## Gate 4 — Security contract spot-checks

| Check | Command | Result |
|-------|---------|--------|
| Ingestion: no key | `curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '[]' https://udupi-property-explorer.onrender.com/api/ingestion/ingest-posts` | `401` ✅ |
| Ingestion: wrong key | `curl -s -o /dev/null -w "%{http_code}" -X POST -H "X-Ingestion-Api-Key: wrong" -d '[...]' ...` | `401` ✅ |
| Blocked CORS origin | `curl -s -o /dev/null -w "%{http_code}" -X OPTIONS -H "Origin: https://evil.com" ...` | `403` ✅ |
| Unauthenticated protected route | `curl -s -o /dev/null -w "%{http_code}" .../api/listings/mine` | `401` ✅ |

---

## Production URLs

| Service | URL | Status |
|---------|-----|--------|
| Frontend | https://udupi-property-explorer.pages.dev | ✅ Live |
| Backend | https://udupi-property-explorer.onrender.com | ✅ Live |
| Backend health | https://udupi-property-explorer.onrender.com/actuator/health | ✅ `{"status":"UP"}` |

---

## Required env vars in production

| Var | Where | Purpose |
|-----|-------|---------|
| `CORS_ALLOWED_ORIGINS` | Render dashboard | Allowlist of frontend origins |
| `INGESTION_API_KEY` | Render dashboard | `X-Ingestion-Api-Key` auth for ingestion endpoint |
| `VITE_SUPABASE_URL` | Cloudflare Pages | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Cloudflare Pages | Supabase anon key |
| `VITE_API_BASE_URL` | Cloudflare Pages | Backend base URL |

---

## Known warnings (non-blocking)

| Item | Risk | Action |
|------|------|--------|
| 5 npm audit vulnerabilities | Low — pre-existing, not high/critical | Monitor; run `npm audit` for details |
| ESLint: `no-explicit-any` in `AddressPicker.tsx`, `PropertyMap.tsx` | Low — pre-existing | Track in Sprint 5 |
| ESLint: empty interfaces in shadcn `ui/` components | Low — generated code | Accept as-is |
| 7 Docker-gated integration tests skipped | Expected — no Docker in CI | Pre-existing; not a regression |

---

## Sprint 3 PRs on main (confirmation)

| Commit | PR | Summary |
|--------|----|---------|
| `2942757` | PR-1 (P0) | Ingestion API key + Bucket4j rate limiting |
| `2c97088` | PR-2 (P1) | AFTER_COMMIT notification decoupling |
| `bd76408` | PR-3 (P1) | Centralize escapeHtml + XSS hardening |
| `23f1153` | PR-4 (P2) | Remove orphan repo methods |
| `1834ee8` | HOT (ops) | Smoke test: fix HOT-4 grep + add S3 ingestion checks |
| `f1aab23` | HOT-5 | CORS: add Accept + DNT to allowed headers |

---

## Re-verification command

To re-run this verification at any time:

```bash
# Full local + prod gate
./scripts/smoke_test.sh --prod

# Local tests only
cd backend && mvn test -q && cd .. && npm test -- --run && npm run build
```
