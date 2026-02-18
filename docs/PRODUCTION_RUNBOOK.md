# Production Runbook — Udupi Property Explorer

**Sprint**: Sprint 4
**Last updated**: 2026-02-18
**Status**: Active

---

## Production URLs

| Service | URL |
|---------|-----|
| Frontend | https://udupi-property-explorer.pages.dev |
| Backend | https://udupi-property-explorer.onrender.com |
| Health check | https://udupi-property-explorer.onrender.com/actuator/health |

---

## 1. Incident Triage

### Step 1 — Establish severity

| Symptom | Severity | First action |
|---------|----------|-------------|
| Frontend blank / 5xx on all pages | P0 | Check Cloudflare Pages build + Render health |
| Backend health returns non-UP | P0 | Check Render logs immediately |
| CORS errors on specific page | P1 | Check `CorsConfig.java` allowed headers vs browser request |
| 401 on authenticated routes | P1 | Check Supabase JWT expiry + `CORS_ALLOWED_ORIGINS` env var |
| 429 on ingestion endpoint | P2 | Normal rate limiting — check if legitimate traffic or abuse |
| Slow page loads | P2 | Check Render cold-start (free tier sleeps after 15 min) |

### Step 2 — Check health endpoint first

```bash
curl https://udupi-property-explorer.onrender.com/actuator/health
# Expected: {"status":"UP","groups":["liveness","readiness"]}
```

### Step 3 — Run smoke test

```bash
./scripts/smoke_test.sh --prod
# All 18 prod checks should pass
```

### Step 4 — Check logs

**Backend logs**: Render dashboard → your service → Logs tab.
Every log line carries `[requestId=<uuid>]` (Sprint 4 S4-3). Search by requestId to trace a specific failing request end-to-end.

**Frontend errors**: Sentry dashboard (if `VITE_SENTRY_DSN` is set in Cloudflare Pages).

**Backend exceptions**: Sentry dashboard (if `SENTRY_DSN` is set in Render).

---

## 2. Rollback Procedure

### Frontend rollback (Cloudflare Pages)

1. Go to Cloudflare Pages dashboard → your project → Deployments
2. Find the last known-good deployment
3. Click **Rollback to this deployment**
4. Verify: `curl -o /dev/null -w "%{http_code}" https://udupi-property-explorer.pages.dev` → 200

### Backend rollback (Render)

1. Go to Render dashboard → your service → Deploys
2. Find the last known-good deploy
3. Click **Rollback**
4. Wait for deploy to complete (~2 min)
5. Verify: `curl https://udupi-property-explorer.onrender.com/actuator/health` → `{"status":"UP"}`

### Git rollback (last resort)

```bash
# Identify the bad commit
git log --oneline -10

# Revert (creates a new commit, safe for shared main branch)
git revert <bad-commit-sha>
git push origin main

# Render auto-deploys on push to main
```

**Never** use `git reset --hard` on `main` — it rewrites shared history.

---

## 3. Key Rotation

### INGESTION_API_KEY (rotate quarterly or on suspected compromise)

The ingestion key protects `POST /api/ingestion/ingest-posts`. The Chrome extension must send it as `X-Ingestion-Api-Key: <key>`.

```bash
# Generate a new key
openssl rand -hex 32

# Steps:
# 1. Set the new value in Render dashboard → Environment → INGESTION_API_KEY
# 2. Update the Chrome extension with the new key
# 3. Trigger a Render redeploy (or it picks up on next deploy)
# 4. Verify the old key is rejected:
curl -s -o /dev/null -w "%{http_code}" \
  -X POST -H "Content-Type: application/json" \
  -H "X-Ingestion-Api-Key: <old-key>" \
  -d '[]' \
  https://udupi-property-explorer.onrender.com/api/ingestion/ingest-posts
# Expected: 401
```

### CORS_ALLOWED_ORIGINS (update when frontend domain changes)

```bash
# In Render dashboard → Environment:
CORS_ALLOWED_ORIGINS=https://your-new-domain.pages.dev,https://udupi-property-explorer.pages.dev

# Verify after deploy:
curl -sv -X OPTIONS \
  https://udupi-property-explorer.onrender.com/api/listings \
  -H "Origin: https://your-new-domain.pages.dev" \
  -H "Access-Control-Request-Method: GET" \
  2>&1 | grep "access-control-allow-origin"
```

### Supabase credentials (rotate if DB password or anon key exposed)

1. Supabase dashboard → Project Settings → Database → Reset database password
2. Update `SUPABASE_DB_PASSWORD` in Render environment
3. Supabase dashboard → Project Settings → API → Reveal anon key → Roll key
4. Update `VITE_SUPABASE_PUBLISHABLE_KEY` in Cloudflare Pages environment
5. Redeploy both frontend and backend
6. Verify health endpoint is UP after backend redeploy

### SENTRY_DSN / VITE_SENTRY_DSN (if Sentry project is compromised)

1. Sentry dashboard → Project Settings → Client Keys → Revoke old DSN → Generate new
2. Update `SENTRY_DSN` in Render and `VITE_SENTRY_DSN` in Cloudflare Pages
3. Redeploy both services

---

## 4. Common Incidents and Fixes

### CORS preflight returns 403 or missing headers

**Symptom**: Browser console shows `Access to fetch ... has been blocked by CORS policy`

**Check**:
```bash
curl -sv -X OPTIONS \
  https://udupi-property-explorer.onrender.com/api/listings \
  -H "Origin: https://udupi-property-explorer.pages.dev" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type,accept,dnt" \
  2>&1 | grep -i "access-control"
```

**Fix options**:
- Check `CORS_ALLOWED_ORIGINS` env var is set in Render (HOT-1)
- Check `CorsConfig.java` `allowedHeaders` includes the header the browser is requesting (HOT-5 added `Accept` and `DNT`)
- Check `JwtConfig.java` has `HttpMethod.OPTIONS` in `permitAll()` (HOT-3)

### Backend returns 401 on all routes

**Symptom**: All API calls return 401 including health

**Check**: Health endpoint first:
```bash
curl https://udupi-property-explorer.onrender.com/actuator/health
```

If health is also 401: Spring Security misconfiguration. Check `JwtConfig.java` `permitAll()` rules.
If health is 200 but API is 401: JWT is expired or Supabase JWT secret changed.

### Flyway migration fails on startup

**Symptom**: Backend fails to start, logs show `FlywayException`

**Common causes**:
- Failed migration left a `success=false` row in `flyway_schema_history`
- `CREATE INDEX CONCURRENTLY` used (not compatible with Supabase pgBouncer — see HOT-2)

**Fix**:
```sql
-- Run in Supabase SQL editor:
DELETE FROM flyway_schema_history WHERE success = false;
-- Then redeploy backend
```

### Render cold-start latency (free tier)

**Symptom**: First request after ~15 min takes 5–30 seconds

**This is expected** on Render's free tier. The service sleeps after inactivity. No fix needed for MVP. Workaround: add a health-check cron ping (e.g. UptimeRobot free tier hitting `/actuator/health` every 14 min).

---

## 5. Environment Variables Reference

### Render (backend)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_DB_HOST` | ✅ | Supabase DB host (Session mode: port 5432) |
| `SUPABASE_DB_PORT` | ✅ | `5432` (session) or `6543` (transaction/pgBouncer) |
| `SUPABASE_DB_NAME` | ✅ | Usually `postgres` |
| `SUPABASE_DB_PASSWORD` | ✅ | Rotate quarterly |
| `SUPABASE_JWT_SECRET` | ✅ | From Supabase dashboard → Settings → API |
| `CORS_ALLOWED_ORIGINS` | ✅ | Comma-separated frontend origins |
| `INGESTION_API_KEY` | ✅ | 32-byte hex; sent by Chrome extension |
| `SENTRY_DSN` | optional | Backend Sentry DSN; absent = monitoring disabled |
| `GOOGLE_AI_API_KEY` | ✅ | Google AI Studio key for classification |

### Cloudflare Pages (frontend)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | ✅ | `https://<project>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase anon/publishable key |
| `VITE_API_BASE_URL` | ✅ | Backend URL e.g. `https://udupi-property-explorer.onrender.com` |
| `VITE_SENTRY_DSN` | optional | Frontend Sentry DSN; absent = monitoring disabled |

---

## 6. Smoke Test Reference

```bash
# Full local + prod verification
./scripts/smoke_test.sh --prod

# Backend tests only
cd backend && mvn test -q

# Frontend tests + build
npm test -- --run && npm run build
```

See `docs/STAGING_VERIFICATION.md` for full gate results.
See `docs/BROWSER_SMOKE_TEST.md` for manual browser checklist.
