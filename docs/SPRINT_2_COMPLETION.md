# Sprint 2 — Production Hardening: Completion Report

**Sprint**: Sprint 2 — Production Hardening
**Generated**: 2026-02-18
**Status**: ✅ COMPLETE — All tasks shipped, pushed to `origin/main`
**Final test count**: 415 backend tests passing, 23 frontend tests passing

---

## Executive Summary

Sprint 2 delivered two phases of production hardening:

- **Phase 1 (Security)**: All 4 critical security vulnerabilities remediated — CORS, XSS, JSON injection, and secrets hygiene
- **Phase 2 (Performance)**: Full pagination of all API endpoints, database indexes, N+1 query elimination, and 82% frontend bundle reduction

**Total commits**: 13 (across both phases)
**Files changed**: ~30 files (backend + frontend)
**Tests added**: +2 (415 total, up from 413)

---

## Phase 1: Critical Security Fixes

### SEC-1 — Credentials in Git
- Added comprehensive `.env` patterns to `.gitignore` (9 patterns)
- Documented secrets hygiene, credential rotation, and BFG cleanup in `docs/DEV_CLEANUP.md`

### SEC-2 — Missing CORS Configuration
- Created `CorsConfig.java` with explicit origin allowlist and `CORS_ALLOWED_ORIGINS` env override
- Wired CORS filter into Spring Security chain via `JwtConfig.java`
- Added `cors.allowed-origins` to `application.yml`

### SEC-3 — XSS in PropertyMap
- Added `escapeHtml()` utility to `PropertyMap.tsx`
- Applied to all 7 user-controlled fields in map popups (image URL, title, locality, units, phone, description)

### SEC-4 — JSON Injection in Notifications
- Replaced string concatenation with Jackson `ObjectMapper` in `ListingService.java`
- Fixed both `approveListing()` and `rejectListing()` methods

**Phase 1 commits**: `ff00cdb`, `2e8964e`, `aea4064`
**Result**: 413 backend tests, 23 frontend tests passing

---

## Phase 2: Performance Fixes

### PERF-2 — Database Indexes (V13 Migration)

Created `V13__add_hot_query_indexes.sql` with 6 P0 indexes:

| Index | Estimated Speedup |
|---|---|
| `idx_property_listings_bbox_not_dup` — bounding box spatial queries | 95% |
| `idx_property_listings_area_key` — area-based queries | 90% |
| `idx_property_listings_created_by_created_at` — dealer history | 85% |
| `idx_user_roles_user_id` — authorization (security-critical) | N/A |
| `idx_property_listings_raw_post_id_unique` — deduplication (UNIQUE) | N/A |
| `idx_raw_posts_unprocessed` — ingestion pipeline | N/A |

Used `CREATE INDEX CONCURRENTLY` to avoid table locks.
**Commit**: `06423b9`

---

### PERF-3 — N+1 Query Fix in InsightsService

Eliminated 1+N query loop in `InsightsService.getRecommendations()`:

```java
// Before (N+1):
for (SavedArea area : savedAreas) {
    listingRepository.findOpportunities(area.getAreaKey(), ...);  // N queries
}

// After (1 query):
List<String> areaKeys = savedAreas.stream().map(SavedArea::getAreaKey).toList();
listingRepository.findOpportunitiesByAreaKeys(areaKeys, ...);
```

**Estimated latency reduction**: 67–88% for insights recommendations
**Commit**: `fed7237`

---

### PERF-1a — HIGH Priority Endpoint Pagination

Added Spring Data `Pageable` + `Page<T>` to the two highest-traffic endpoints:

| Endpoint | Before | After |
|---|---|---|
| `GET /api/listings/mine` | `List<Listing>` | `Page<Listing>` (default: 20/page) |
| `GET /api/dashboard/map/listings` | `List<MapListingResponse>` with `limit` param | `Page<MapListingResponse>` (default: 200/page) |

**Response shape change**:
```json
{ "content": [...], "totalPages": 5, "totalElements": 87, "size": 20, "number": 0 }
```

**Files**: `ListingController.java`, `ListingRepository.java`, `ListingService.java`, `DashboardController.java` + 2 test files
**Commit**: `070ae4b`

---

### PERF-1b — MEDIUM/LOW Priority Endpoint Pagination (3 waves)

#### Wave 1 — Notifications
- `GET /api/notifications` → `Page<NotificationResponse>` (default: 20/page)
- Files: `NotificationController.java`, `NotificationRepository.java`, `NotificationControllerTest.java`
- **Commit**: `642f1d1`

#### Wave 2 — Insights Repository Layer
- Added paginated overloads to `InsightsRepository.findNewListingsInAreas()` and `ListingRepository.findOpportunitiesByAreaKeys()`
- Removed hardcoded `LIMIT` clauses from native SQL queries
- Added explicit `countQuery` parameters for native pagination
- **Commit**: `bc431ee`

#### Wave 3 — Insights Controller + Service
- `GET /api/insights/new-listings` → `Page<Listing>` (default: 20/page)
- `GET /api/insights/recommendations` → `Page<OpportunityProjection>` (default: 20/page)
- Removed `RECOMMENDATION_LIMIT = 20` constant — page size now driven by `@PageableDefault`
- Files: `InsightsController.java`, `InsightsService.java`, `InsightsControllerTest.java`
- **Commit**: `57acebb`

---

### PERF-4 — Frontend Bundle Optimization

#### Sub-task A — PERF-1a Frontend Fix
Since no existing components consumed `/api/listings/mine` or `/api/dashboard/map/listings` yet, created the typed foundation:
- `PageResponse<T>` interface in `src/lib/api.ts` — matches Spring Data `Page<T>` JSON shape
- `useDealerMyListings(page, size)` hook in `src/hooks/useDealerListings.ts` — pre-wired for pagination metadata
- **Commit**: `623dec5`

#### Sub-task B — Bundle Splitting
| | Before | After |
|---|---|---|
| Main JS chunk (raw) | 1,478 KB | 267 KB |
| Main JS chunk (gzip) | **415 KB** | **74 KB** (-82%) |
| Build warnings | Chunk >500 KB | None |

**Changes**:
- `src/App.tsx` — 9 admin/dealer/insights routes converted to `React.lazy()` + single `<Suspense>` boundary
- `vite.config.ts` — `manualChunks` splitting 6 vendor groups: react, react-router+query, recharts (lazy), leaflet, radix-ui, supabase

Recharts and Leaflet are now deferred — users who never visit `/insights` or map pages never download those chunks (~390 KB combined).
**Commit**: `3b3de16`

---

## All Paginated Endpoints — Final State

| Endpoint | Default Page Size | Response Type |
|---|---|---|
| `GET /api/listings/mine` | 20 | `Page<Listing>` |
| `GET /api/dashboard/map/listings` | 200 | `Page<MapListingResponse>` |
| `GET /api/notifications` | 20 | `Page<NotificationResponse>` |
| `GET /api/insights/new-listings` | 20 | `Page<Listing>` |
| `GET /api/insights/recommendations` | 20 | `Page<OpportunityProjection>` |

All endpoints accept `?page=0&size=20&sort=createdAt,desc` query params.

---

## Commit Log (Full Sprint 2)

| Commit | Phase | Description |
|---|---|---|
| `ff00cdb` | SEC | .env gitignored, DEV_CLEANUP.md secrets section |
| `2e8964e` | SEC | Fix CORS wiring + expand .gitignore patterns |
| `aea4064` | SEC | SEC-3 XSS fix, SEC-4 JSON injection fix |
| `06423b9` | PERF | PERF-2: V13 database indexes |
| `fed7237` | PERF | PERF-3: N+1 fix in InsightsService |
| `070ae4b` | PERF | PERF-1a: HIGH priority pagination |
| `623dec5` | PERF | PERF-1a: Frontend `PageResponse<T>` + hook |
| `3b3de16` | PERF | PERF-4: Lazy routes + vendor chunk splitting |
| `642f1d1` | PERF | PERF-1b Wave 1: Notifications pagination |
| `bc431ee` | PERF | PERF-1b Wave 2: Insights repository pagination |
| `57acebb` | PERF | PERF-1b Wave 3: Insights controller/service pagination |
| `b535b46` | Ops  | Add afplay to TOOLING.md, archive PERF-1a checkpoint |

---

## Test Results

### Backend
```
Tests run: 415, Failures: 0, Errors: 0, Skipped: 7 (Docker-gated integration tests, pre-existing)
BUILD SUCCESS
```

### Frontend
```
Test Files: 3 passed (3)
     Tests: 23 passed (23)
  Duration: ~2.4s
Build: ✓ No chunk-size warnings
```

---

## Known Issues and Technical Debt

### 🔴 Manual Actions Required Before Production Deployment

#### 1. Credential Rotation (USER ACTION — BLOCKING)
Live credentials exist in working-directory `.env` files. Before deploying:

```bash
# Step 1: Check git history
git log --all --full-history -- backend/.env .env .env_lovabale
# If any commits found → rotate ALL credentials + BFG cleanup (see docs/DEV_CLEANUP.md)
```

Credentials to rotate:
- Supabase database password
- Google AI API key (`AIzaSy...`)
- Supabase anon key (if in history)

#### 2. Production CORS Configuration (DEPLOYMENT — BLOCKING)
Set in Render dashboard before deploying backend:
```
CORS_ALLOWED_ORIGINS=https://<your-cloudflare-pages-domain>.pages.dev
```

#### 3. Delete Stale `.env_lovabale`
```bash
rm .env_lovabale  # If no longer needed
```

---

### 🟡 Recommended for Sprint 3

| Item | Risk | Recommendation |
|---|---|---|
| `findTop50ByUserIdOrderByCreatedAtDesc` orphan in `NotificationRepository` | Low | Remove in cleanup PR |
| Deprecated Insights repository overloads (Wave 2 leftovers) | Low | Remove in cleanup PR |
| `escapeHtml()` should live in `src/lib/security.ts` | Medium | Centralize for reuse |
| Numeric fields in `PropertyMap` not escaped | Medium | Apply `escapeHtml(String(field))` |
| `/api/ingestion/ingest-posts` is unauthenticated | High | Add API key or rate limiting |
| Notification failure rolls back listing approval transaction | Medium | Use `@TransactionalEventListener(AFTER_COMMIT)` |
| `manualChunks` uses string path matching (fragile with pnpm) | Low | Monitor on dependency updates |

---

## Agent Teams Used

Sprint 2 was delivered using parallel agent team execution:

| Agent | Tasks |
|---|---|
| `qa-fast` (×4) | QA preflight analysis for PERF-1 through PERF-4 |
| `backend-engineer` (×5) | SEC fixes, PERF-2, PERF-3, PERF-1a, PERF-1b (3 waves) |
| `frontend` (×1) | PERF-4 bundle optimization + PERF-1a API fix |
| `security-reviewer` | Phase 1 security audit |
| `code-reviewer` | Phase 1 code review |

Wave 1 (PERF-1b backend + PERF-4 frontend) executed in parallel, saving significant wall-clock time. PERF-1b backend was split into 3 sequential waves to respect the 3-file-per-task rule from `CLAUDE.md`.

---

**Sprint 2 status**: ✅ Shipped — `070ae4b..b535b46` pushed to `origin/main`
