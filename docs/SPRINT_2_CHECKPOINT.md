# Sprint 2 — Production Hardening Checkpoint

**Generated**: 2026-02-13
**Status**: PHASE 1 COMPLETE, PHASE 2 Step A COMPLETE
**Next Step**: PHASE 2 Step B (Implementation)

---

## Progress Summary

### ✅ PHASE 1 (PR-1 Critical Security) — COMPLETE

**All 4 security fixes delivered**:
- SEC-1: .env gitignored + secrets hygiene docs
- SEC-2: CORS configuration + JwtConfig wiring
- SEC-3: XSS fix in PropertyMap.tsx (escapeHtml)
- SEC-4: JSON injection fix (ObjectMapper)

**Blocker fixes applied**:
- CORS filter wired into Spring Security
- .env_lovabale patterns added to .gitignore

**Results**:
- Backend: 413 tests passing
- Frontend: 23 tests passing
- Files modified: 9 total
- Commits: 3 (ff00cdb, 2e8964e, aea4064)

**Documentation**: `docs/PR-1_CRITICAL_SECURITY_COMPLETION.md`

**Manual actions still required**:
1. Credential rotation (check git history first)
2. Production CORS_ALLOWED_ORIGINS env var
3. Delete .env_lovabale if stale

---

### ✅ PHASE 2 Step A (QA Preflight) — COMPLETE

**All 4 PERF tasks analyzed**:

#### PERF-1: Add Pagination (qa-fast complete)
- **Endpoints needing pagination**: 8 endpoints identified
- **Priority**: HIGH for `/api/listings/mine`, `/api/dashboard/map/listings`
- **Strategy**: Offset-based (page/size), default 20 items
- **Estimated impact**: Prevents OOM on large datasets

#### PERF-2: Add Database Indexes (qa-fast complete)
- **P0 indexes identified**: 6 critical indexes
  - Bounding box partial index (95% speedup)
  - raw_post_id unique index (idempotency)
  - area_key index (90% speedup)
  - created_by composite index (85% speedup)
  - user_roles index (CRITICAL for security)
  - raw_posts unprocessed index
- **Migration ready**: V13__add_hot_query_indexes.sql outlined
- **Estimated impact**: 80-95% query time reduction

#### PERF-3: Fix N+1 Queries (qa-fast complete)
- **N+1 location identified**: InsightsService.getRecommendations()
  - Current: 1 + N queries (loop per saved area)
  - Fix: Batch query with IN clause
- **Estimated impact**: 67-88% latency reduction for insights
- **Other endpoints verified**: avg-price, price-trend, new-listings are safe (no N+1)

#### PERF-4: Optimize Bundle Size (qa-fast complete)
- **Potential savings**: ~600KB total
  - Route code splitting (admin pages): ~200KB
  - Recharts lazy-loading: ~200KB moved to lazy chunk
  - Unused UI components cleanup: ~50KB
  - lucide-react → static SVGs: ~50KB
  - Unused Radix UI packages: ~50KB
- **Recommendations**: Install vite-plugin-visualizer, implement lazy routes
- **Target**: Main bundle <300KB gzipped

---

## Next Steps (PHASE 2 Step B)

### Implementation Plan

**PERF-1 (Pagination)**:
- Delegate to: backend-engineer
- Files to modify: ~5 files
  - ListingController.java
  - ListingRepository.java
  - InsightsController.java
  - DashboardController.java
  - NotificationController.java
- Approach: Add `Pageable` parameter, return `Page<T>` instead of `List<T>`

**PERF-2 (Indexes)**:
- Delegate to: backend-engineer
- Files to create: 1 file
  - V13__add_hot_query_indexes.sql (Flyway migration)
- Indexes: 6 P0 + 3 P1 indexes
- Use `CREATE INDEX CONCURRENTLY` to avoid locks

**PERF-3 (N+1 Queries)**:
- Delegate to: backend-engineer
- Files to modify: 2 files
  - InsightsService.java (refactor getRecommendations loop)
  - ListingRepository.java (add findOpportunitiesByAreaKeys method)
- Approach: Batch query with `area_key = ANY(:areaKeys)`

**PERF-4 (Bundle Size)**:
- Delegate to: frontend
- Files to modify: ~3-5 files
  - App.tsx (lazy load admin routes)
  - vite.config.ts (add bundle analyzer plugin)
  - Delete unused UI components
- Approach: React.lazy() for admin routes, add Suspense boundary

---

## Task Delegation Strategy

**Option A: Sequential** (safer, easier to review)
1. PERF-2 (indexes) → backend-engineer
2. PERF-3 (N+1 fix) → backend-engineer
3. PERF-1 (pagination) → backend-engineer
4. PERF-4 (bundle size) → frontend

**Option B: Parallel** (faster, but file conflicts possible)
1. PERF-2 + PERF-3 → backend-engineer (2 files + 1 migration)
2. PERF-1 → separate backend-engineer session (5 files)
3. PERF-4 → frontend (3-5 files)

**Recommendation**: Option A (sequential) to avoid conflicts and ensure each fix is tested independently.

---

## QA Agent Findings Summary

### PERF-1 Edge Cases
- Page beyond available data (should return empty with metadata)
- Invalid page/size params (should 400)
- Rapid pagination during data changes (offset consistency)
- Large result sets (cap page size at 100)

### PERF-2 Critical Indexes
- `idx_property_listings_bbox_not_dup` — Bounding box queries
- `idx_property_listings_raw_post_id_unique` — Deduplication (UNIQUE)
- `idx_property_listings_area_key` — Area-based queries
- `idx_property_listings_created_by_created_at` — Dealer history
- `idx_raw_posts_unprocessed` — Ingestion pipeline
- `idx_user_roles_user_id` — Authorization (CRITICAL)

### PERF-3 N+1 Location
```java
// CURRENT (N+1):
for (SavedArea area : savedAreas) {
    listingRepository.findOpportunities(area.getAreaKey(), ...);  // N queries
}

// FIX (1 query):
List<String> areaKeys = savedAreas.stream().map(SavedArea::getAreaKey).toList();
listingRepository.findOpportunitiesByAreaKeys(areaKeys, ...);  // 1 query
```

### PERF-4 Low-Hanging Fruit
1. Route code splitting (admin pages): ~200KB
2. Recharts lazy-loading: ~200KB to lazy chunk
3. Unused UI components: ~50KB
4. lucide-react optimization: ~50KB

---

## Agent IDs for Resume

- **qa-fast PERF-1**: a68757f
- **qa-fast PERF-2**: a01218c
- **qa-fast PERF-3**: a2d4970
- **qa-fast PERF-4**: a6e5fb2

---

## Files Created This Session

1. `docs/PR-1_CRITICAL_SECURITY_COMPLETION.md` — Phase 1 completion report
2. `docs/SPRINT_2_CHECKPOINT.md` — This file (checkpoint for resume)

---

## Commands to Resume

```bash
# Verify current state
git status
git log --oneline -5

# Backend tests (should still pass)
cd backend && mvn test

# Frontend tests (should still pass)
npm test

# Continue with PHASE 2 Step B:
# 1. Spawn backend-engineer for PERF-2 (indexes)
# 2. After completion, spawn backend-engineer for PERF-3 (N+1)
# 3. After completion, spawn backend-engineer for PERF-1 (pagination)
# 4. After completion, spawn frontend for PERF-4 (bundle size)
```

---

## Manual Actions Reminder

**Before deploying PHASE 1 (PR-1)**:
1. Check git history: `git log --all -- backend/.env .env .env_lovabale`
2. If secrets found → rotate + BFG cleanup
3. Set CORS_ALLOWED_ORIGINS in Render dashboard
4. Delete .env_lovabale if stale

**After deploying PHASE 2 (PR-2)**:
1. Run EXPLAIN ANALYZE on all hot queries (verify indexes used)
2. Check bundle size: `ls -lh dist/assets/`
3. Run Lighthouse performance test
4. Monitor API response times in production

---

**Checkpoint saved**: Ready to resume PHASE 2 Step B (Implementation)
