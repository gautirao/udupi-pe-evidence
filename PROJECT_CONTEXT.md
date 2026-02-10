# PROJECT_CONTEXT.md
Authoritative project context for humans + AI assistants.
Keep this file concise and up to date.

---

## TL;DR (read this first)

- Repo is a **mono-repo**
- **Frontend**: React + Vite at repo root
- **Backend**: Spring Boot (Maven) in `./backend`
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
├─ backend/                # Spring Boot Maven project
│  ├─ pom.xml
│  └─ src/main/java/...
├─ src/                    # React app source
├─ public/
│  └─ _redirects           # SPA routing for Cloudflare Pages
├─ package.json
├─ vite.config.*
├─ PROJECT_CONTEXT.md

---

## Local development

### Backend (Spring Boot)
cd backend
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

## AI assistant rules

- Treat this file as authoritative
- Prefer minimal diffs
- Update this file when new facts are discovered

Last updated: YYYY-MM-DD
