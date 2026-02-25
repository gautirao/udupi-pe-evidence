# Sprint 6 Checkpoint — 2026-02-25

## Completed Work

### PR-S6-1: Booking State Machine Atomicity ✅ MERGED
- Commit: `abf5fec`
- Replaced read-check-write with atomic `@Modifying @Query` conditional UPDATE in `confirmBooking`, `declineBooking`, `cancelBooking`
- Caller identity added to all atomic WHERE clauses (defense-in-depth per security-reviewer)
- `BookingStateConflictException` → 409 `{"error":"BOOKING_STATE_CONFLICT"}` in all 3 endpoints
- Dead code removed: `BookingStatusException` + its 3 unreachable catch blocks
- Test 9 replaced with real behavior test; Tests 15–17 added
- 466 tests passing

### PR-S6-2: PaymentController Test Suite + Atomicity Fix ✅ MERGED
- Commit: `63f1d33`
- SELECT+check+UPDATE replaced with atomic conditional UPDATE (`WHERE user_id = ? AND (insights_access_until IS NULL OR insights_access_until <= NOW())`)
- rows==0 → follow-up SELECT to distinguish 409 (still active) vs 500 (no profile)
- Null guard on `activeExpiry` before `.toString()`
- 6 new tests: 200, 404 (stub off), 409 (active), 500 (no profile), 403 (unauth), cross-user isolation
- 472 tests passing

### PR-S6-6: Design System ✅ ALREADY DONE (pre-sprint)
- `docs/DESIGN_SYSTEM.md` committed
- `docs/FRONTEND_GUIDE.md` updated
- `.claude/agents/ui-designer.md` updated

---

## In Progress

### PR-S6-3: Frontend Paywall Tests 🔄 IN PROGRESS
- **Team**: `sprint6-pr-s6-3`
- **Status**: frontend agent is actively writing the 3 test files
- **qa-fast preflight**: COMPLETE (35 test assertions specified)
- **Agent**: `frontend@sprint6-pr-s6-3` — running

**Files being created:**
1. `src/components/insights/__tests__/PaywallCard.test.tsx` (8 tests)
2. `src/components/insights/__tests__/TrialBanner.test.tsx` (5 tests)
3. `src/pages/__tests__/Insights.test.tsx` (8 tests)

**Key test specs:**
- PaywallCard: render CTA, tabbable button, api.post called on click, isPending spinner, success reload, error toast, retry
- TrialBanner: singular/plural days text, dismiss removes from DOM
- Insights: PaywallCard shown when hasAccess=false, TrialBanner when daysRemaining≤3, hooks called with enabled:false when no access, SavedAreas always rendered, authLoading suppresses paywall

**Pending after frontend completes:**
- qa validation
- code-reviewer + security-reviewer (parallel)
- commit

---

## Not Started

### PR-S6-4: Booking Pagination + DB Index 🔲
- **Priority**: MEDIUM
- **Files (4, limit waived):**
  1. `backend/.../booking/ViewingRequestRepository.java` — add `Page<ViewingRequest>` paginated queries
  2. `backend/.../booking/BookingService.java` — Pageable support
  3. `backend/.../booking/BookingController.java` — `?page=0&size=20&sort=createdAt,desc` params
  4. `backend/src/main/resources/db/migration/V17__booking_index_improvements.sql` (NEW)
- **Current migration level**: V16 (`add_insights_access.sql`)
- **Migration content** (from sprint plan):
  ```sql
  DROP INDEX idx_viewing_requests_dealer_id;
  DROP INDEX idx_viewing_requests_requester_id;
  CREATE INDEX idx_viewing_requests_dealer_id ON viewing_requests (dealer_id, status, created_at DESC);
  CREATE INDEX idx_viewing_requests_requester_id ON viewing_requests (requester_id, created_at DESC);
  ```
- **Acceptance criteria**: Both booking endpoints return paginated response (`content`, `totalElements`, `totalPages`); default page size=20; V17 migration runs cleanly; all existing booking tests pass
- **Workflow**: qa-fast → backend-engineer → qa → code-reviewer + performance-analyst

### PR-S6-5: Bundle Optimization + PaywallCard SPA Fix 🔲
- **Priority**: LOW
- Depends on PR-S6-3 landing first
- `src/App.tsx` — lazy-load Insights route with `React.lazy` + `<Suspense>`
- `src/components/insights/PaywallCard.tsx` — replace `window.location.reload()` with `queryClient.invalidateQueries(['insights-access']) + navigate('/insights')`

---

## Pending Deferred Items (carry to Sprint 7)

- Global `@ControllerAdvice` catch-all (security LOW from PR-S6-2 review)
- Rate limiting on payment + booking endpoints
- `@Transactional` on `@RestController` → future service extraction
- Boundary test for `insights_access_until == NOW()`

---

## Next Steps (resume from here)

1. Wait for `frontend@sprint6-pr-s6-3` to complete and report test results
2. Run qa validation on PR-S6-3 test files
3. Run code-reviewer + security-reviewer in parallel on PR-S6-3
4. Implement any review fixes
5. Commit PR-S6-3
6. Shut down sprint6-pr-s6-3 team → TeamDelete
7. Start PR-S6-4 (new team: sprint6-pr-s6-4):
   - qa-fast preflight
   - backend-engineer: paginated repo methods + service + controller + V17 migration
   - qa → code-reviewer + performance-analyst
   - commit
8. Start PR-S6-5 (depends on S6-3 committed):
   - frontend: lazy-load Insights + PaywallCard SPA fix

---

*Checkpoint saved: 2026-02-25T20:47 UTC*
