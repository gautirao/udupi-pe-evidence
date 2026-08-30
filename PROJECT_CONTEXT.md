# PROJECT_CONTEXT.md
Authoritative project context for humans + AI assistants.
Keep this file concise and up to date.

---

## TL;DR (read this first)

- Repo is a **mono-repo**
- **Frontend**: React + Vite in `apps/web`
- **Backend**: Spring Boot (Maven) in `apps/api`
- **Auth**: Supabase Auth (frontend-only)
    - Implemented: email/password sign-in + sign-out
    - Planned: Google + Facebook OAuth
- **Backend auth model**: validates Supabase JWT only
- **Database**: Supabase Postgres
- **Maps**: Google Maps API (frontend)
- **AI**: Google AI classification service (called from backend)
- **Frontend deploy**: Cloudflare Pages
- **Backend deploy**: Render (Docker service)
- **Health endpoint**: `GET /actuator/health`
- **Cost constraint**: near-$0, no Kubernetes, no complex DevOps

---

## Repo layout

/
├─ apps/
│  ├─ web/                 # React + Vite app
│  │  ├─ src/
│  │  ├─ public/
│  │  │  └─ _redirects     # SPA routing for Cloudflare Pages
│  │  ├─ package.json
│  │  └─ vite.config.*
│  └─ api/                 # Spring Boot Maven project
│     ├─ pom.xml
│     └─ src/main/java/...
├─ tests/e2e/              # Playwright suite (root-orchestrated, cross-stack)
├─ package.json            # thin npm-workspaces orchestrator
├─ PROJECT_CONTEXT.md

---

## Local development

### Backend (Spring Boot)
cd apps/api
mvn -DskipTests spring-boot:run

- Default port: typically `8080`
- Health check:
  curl http://localhost:8080/actuator/health

### Frontend (Vite)
npm install
npm run dev

- Local URL: http://localhost:5173

---

## Environment variables

### Frontend (Vite – required)

VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_API_BASE_URL=

Rules:
- All env vars must use `VITE_` prefix
- No hardcoded URLs

### Backend (Render – required)

INGESTION_API_KEY=<generate with: openssl rand -hex 32>

Rules:
- Must be set in Render dashboard before deploying
- Used by IngestionApiKeyFilter to authenticate POST /api/ingestion/ingest-posts
- Chrome extension must send this value as: X-Ingestion-Api-Key: <key>
- Local dev fallback: changeme-local-dev-only (NEVER use in production)
- Rotate quarterly or immediately on suspected compromise

---

## Authentication model

- Supabase Auth handled in frontend only
- Backend validates Supabase JWT
- Authorization header:
  Authorization: Bearer <supabase_access_token>

---

## Backend API

- Local base: http://localhost:8080
- Prod base: https://<render-service>.onrender.com
- Health: GET /actuator/health

---

## CORS

Backend must allow:
- Origins:
    - http://localhost:5173
    - https://<cloudflare-pages-domain>
- Headers:
    - Authorization
    - Content-Type
- Methods:
    - GET, POST, PUT, DELETE, OPTIONS

---

## Deployment

### Cloudflare Pages
- Build: npm run build
- Output: dist
- SPA redirect:
  /* /index.html 200

### Supabase Auth URLs

Local:
- Site URL: http://localhost:5173
- Redirects:
    - http://localhost:5173/auth/callback
    - http://localhost:5173/**

Prod:
- Site URL: https://<cloudflare-pages-domain>
- Redirects:
    - https://<cloudflare-pages-domain>/auth/callback
    - https://<cloudflare-pages-domain>/**

---

## Maps

- Leaflet + OpenStreetMap (react-leaflet)
- Frontend only, no API key required
- Marker clustering via leaflet.markercluster

---

## Google AI classification service

- Called from backend only
- Credentials stored as backend env vars
- Frontend never calls Google AI directly

---

## MVP Specification

- Authoritative MVP spec: `docs/MVP_SPEC.md`
- Sprint plan: `docs/SPRINT_01_PLAN.md`
- All implementation must reference the spec. Do not duplicate spec content here.

---

## AI assistant rules

- Treat this file as authoritative
- Prefer minimal diffs
- Update this file when new facts are discovered

Last updated: 2026-02-10
