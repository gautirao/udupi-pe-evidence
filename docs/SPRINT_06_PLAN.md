# Sprint 6 Plan — Fix, Stabilize & Design Foundation

**Sprint**: Sprint 6
**Date**: 2026-02-22
**Status**: DRAFT
**Focus**: Complete carry-forward critical fixes + tests from Sprint 5 review. Establish design system. No new features until stabilization is complete.

---

## 0. Sprint Goal

> All Sprint 5 critical findings resolved. Test coverage gaps closed. Design system established and enforced going forward.

---

## 1. Carry-Forward Status (from Sprint 5 post-review)

| PR ID | Type | Severity | Status |
|-------|------|----------|--------|
| PR-FIX-1 | Bug fix | 🔴 CRITICAL | ❌ Not started |
| PR-FIX-2 | Bug fix | 🔴 CRITICAL | ✅ Done (commit `10ac468`) |
| PR-FIX-3 | Bug fix | 🟡 HIGH | ✅ Done (commit `2e5e101`) |
| PR-TEST-1 | Tests | 🔴 CRITICAL coverage | ❌ Not started |
| PR-TEST-2 | Tests | 🔴 CRITICAL coverage | ✅ Done (commit `3ffc16a`) |
| PR-TEST-3 | Tests | 🟡 HIGH coverage | ❌ Not started |
| PR-PERF-1 | Performance | 🟢 MEDIUM | ❌ Not started |
| PR-PERF-2 | Performance | 🔵 LOW | ❌ Not started |

---

## 2. Sprint 6 PR Breakdown

> Rule: Max 3 files per PR. Each PR follows qa-fast preflight → implement → reviewers.

---

### PR-S6-1 — Booking State Machine Atomicity (CRITICAL bug fix)

**Addresses**: CR-1 from Sprint 5 review
**Severity**: 🔴 CRITICAL — silent data corruption under concurrency

**Problem**: All three booking mutation methods (`confirmBooking`, `declineBooking`, `cancelBooking`) use a read-check-write pattern that permits concurrent conflicting transitions. Two simultaneous requests (confirm + cancel) can both read `status = REQUESTED`, pass their guards, and both commit.

**Files (max 3):**
1. `backend/.../booking/ViewingRequestRepository.java` — add `@Modifying @Query` methods for atomic conditional state transitions with `WHERE status = ?` guards
2. `backend/.../booking/BookingService.java` — replace read-check-write with atomic conditional UPDATE + affected-row-count check; return 409 Conflict if 0 rows affected
3. `backend/.../booking/BookingControllerTest.java` — add concurrent transition test cases (confirm + cancel race, decline + cancel race)

**Acceptance criteria:**
- Concurrent confirm+cancel cannot both succeed for the same booking
- 0-row atomic update returns 409 with body `{"error": "BOOKING_STATE_CONFLICT"}`
- All 14 existing booking tests continue to pass
- `mvn -pl backend test` → 0 failures

**Reviewers**: backend-engineer, security-reviewer

---

### PR-S6-2 — PaymentController Test Suite (CRITICAL coverage)

**Addresses**: GAP-1 from Sprint 5 review
**Severity**: 🔴 CRITICAL — security-critical payment logic with zero automated coverage

**Problem**: The entire `POST /api/payments/insights-pass` endpoint is untested. No test covers happy path, feature-flag gate, idempotency, or missing profile row.

**Files (max 2):**
1. `backend/.../payment/PaymentControllerTest.java` (NEW) — must-add tests:
   - `grantInsightsPass_stubEnabled_returns200` — 200, body has `insightsAccessUntil` ~30 days out
   - `grantInsightsPass_stubDisabled_returns404` — feature flag off → 404
   - `grantInsightsPass_alreadyActive_returns409` — active access → 409 with existing expiry in body
   - `grantInsightsPass_noProfileRow_returns500` — missing profile row → 500
   - `grantInsightsPass_unauthenticated_returns401` — no JWT → 401
2. `backend/.../payment/PaymentController.java` — atomicity fix from PERF-9: replace SELECT+UPDATE with single atomic conditional UPDATE; check affected rows for 409

**Acceptance criteria:**
- 5 new tests; all pass
- `mvn -pl backend test` → 0 failures
- PaymentController SELECT+UPDATE is now atomic (no TOCTOU window)

**Reviewers**: backend-engineer, security-reviewer

---

### PR-S6-3 — Frontend Paywall Component Tests (HIGH coverage)

**Addresses**: GAP-3 from Sprint 5 review
**Severity**: 🟡 HIGH — PaywallCard and TrialBanner ship with zero test coverage

**Files (max 3):**
1. `src/components/insights/__tests__/PaywallCard.test.tsx` (NEW)
   - PaywallCard renders upgrade CTA when `showPaywall=true`
   - SavedAreas component still renders alongside PaywallCard
   - Upgrade button is present and tabbable
2. `src/components/insights/__tests__/TrialBanner.test.tsx` (NEW)
   - TrialBanner shows correct `daysRemaining` text
   - Dismiss button removes banner from DOM
   - Banner not shown when `daysRemaining > 3`
3. `src/pages/__tests__/Insights.test.tsx` (NEW)
   - Full charts visible when `hasAccess = true, daysRemaining > 3`
   - PaywallCard shown when `hasAccess = false` (auth not loading)
   - TrialBanner shown when `hasAccess = true, daysRemaining = 2`
   - No network requests made when `hasAccess = false` (enabled guard)

**Acceptance criteria:**
- 8+ new test cases across 3 files
- `npm test` → 0 failures, 0 regressions

**Reviewers**: frontend, qa

---

### PR-S6-4 — Booking List Pagination + DB Index Improvements (MEDIUM performance)

**Addresses**: PERF-1, PERF-5 from Sprint 5 review
**Severity**: 🟢 MEDIUM — unbounded list queries; missing sort index on bookings table

**Problem**:
- Both `GET /api/bookings/mine` and `GET /api/bookings/dealer` return unbounded `List<ViewingRequest>`
- V15 indexes omit `created_at` which all list queries sort by

**Files (max 3):**
1. `backend/.../booking/ViewingRequestRepository.java` — add paginated `findByRequesterIdOrderByCreatedAtDesc(UUID requesterId, Pageable pageable)` and dealer variant
2. `backend/.../booking/BookingController.java` + `BookingService.java` — add `Pageable` support; default `page=0, size=20, sort=createdAt,desc`
3. `backend/src/main/resources/db/migration/V17__booking_index_improvements.sql` (NEW) — updated indexes:
   ```sql
   DROP INDEX idx_viewing_requests_dealer_id;
   DROP INDEX idx_viewing_requests_requester_id;
   CREATE INDEX idx_viewing_requests_dealer_id ON viewing_requests (dealer_id, status, created_at DESC);
   CREATE INDEX idx_viewing_requests_requester_id ON viewing_requests (requester_id, created_at DESC);
   ```

**Acceptance criteria:**
- Both booking endpoints return paginated response (`content`, `totalElements`, `totalPages`)
- Default page size = 20
- V17 migration runs cleanly on a fresh DB and over existing test data
- All existing booking tests pass

**Reviewers**: backend-engineer, performance-analyst

---

### PR-S6-5 — Bundle Optimization + PaywallCard SPA Fix (LOW)

**Addresses**: PERF-8, CM-7 from Sprint 5 review
**Severity**: 🔵 LOW — Recharts adds ~250 KB to initial bundle; PaywallCard uses hard reload

**Files (max 2):**
1. `src/App.tsx` — lazy-load the Insights route using `React.lazy` + `<Suspense>`:
   ```tsx
   const Insights = React.lazy(() => import('./pages/Insights'));
   // wrap route: <Suspense fallback={<PageSkeleton />}><Insights /></Suspense>
   ```
2. `src/components/insights/PaywallCard.tsx` — replace `window.location.reload()` with `queryClient.invalidateQueries(['insights-access'])` + `navigate('/insights')` after successful payment stub

**Acceptance criteria:**
- Insights route is code-split: `npm run build` shows Insights in a separate chunk
- PaywallCard payment success no longer causes a full page reload
- PaywallCard test from PR-S6-3 still passes

**Reviewers**: frontend, performance-analyst

---

### PR-S6-6 — Design System Doc + Agent Update (Foundation)

**Addresses**: Design foundation for all future sprints
**Severity**: 🔵 LOW effort, HIGH long-term impact

**Files (max 2):**
1. `docs/DESIGN_SYSTEM.md` (NEW) — canonical design rules: color palette, typography, spacing, component patterns, four-state pattern, checklist for new screens ✅ already done this sprint
2. `.claude/agents/ui-designer.md` — update to reference `docs/DESIGN_SYSTEM.md` as the authoritative pattern guide

**Acceptance criteria:**
- DESIGN_SYSTEM.md is committed and referenced from FRONTEND_GUIDE.md
- ui-designer agent references the doc

**Reviewers**: N/A (docs only, no code change)

---

## 3. Sequencing

```
Week 1:
  PR-S6-1 (Booking atomicity) ─────────────────────► merge  [backend]
  PR-S6-2 (Payment tests) ─────────────────────────► merge  [backend, parallel]
  PR-S6-6 (Design system) ─────────────────────────► merge  [docs, parallel]

Week 2:
  PR-S6-3 (Paywall frontend tests) ────────────────► merge  [frontend]
  PR-S6-4 (Booking pagination) ────────────────────► merge  [backend, parallel with S6-3]

Week 3:
  PR-S6-5 (Bundle + PaywallCard fix) ──────────────► merge  [frontend, depends on S6-3]
```

**Critical path**: PR-S6-1 (independent) and PR-S6-2 (independent) can run in parallel in Week 1. PR-S6-3 should land before PR-S6-5 so the PaywallCard fix doesn't regress the new tests.

---

## 4. Testing Mandate

Every PR in this sprint must:
- Pass `npm run lint && npm run typecheck && npm test` (frontend PRs)
- Pass `mvn -pl backend test` with 0 failures (backend PRs)
- Include "What could break?" section in PR description
- Add or update at least 1 meaningful test

---

## 5. Design System Enforcement (Sprint 6 onwards)

Starting this sprint, all new frontend screens must pass a `ui-designer` agent review before merging.

**How to trigger**: After a frontend agent implements a new screen, invoke:
> "Review [screen name] against DESIGN_SYSTEM.md using the ui-designer agent"

The ui-designer agent will check: state coverage, layout patterns, badge usage, price display, role-awareness, accessibility, and mobile responsiveness.

---

## 6. UI Design Review Tasks

One-time review of all existing screens against `docs/DESIGN_SYSTEM.md`. To be run by the `ui-designer` agent. Findings feed into a follow-up polish PR (or Sprint 7).

| Task | Screen(s) | Files |
|------|-----------|-------|
| UI-1 | AppLayout & Navigation | `src/components/layout/AppLayout.tsx` |
| UI-2 | Home / Map page | `src/pages/Index.tsx`, `src/components/map/PropertyMap.tsx`, `src/components/map/MapFilters.tsx` |
| UI-3 | Insights dashboard | `src/pages/Insights.tsx`, `src/components/insights/PaywallCard.tsx`, `src/components/insights/TrialBanner.tsx`, `src/components/insights/SavedAreas.tsx` |
| UI-4 | Listing detail | `src/pages/ListingDetail.tsx`, `src/components/listing/RequestViewingModal.tsx` |
| UI-5 | Dealer pages | `src/pages/dealer/DealerDashboard.tsx`, `src/pages/dealer/DealerListings.tsx`, `src/pages/dealer/DealerBookings.tsx` |
| UI-6 | Auth, Onboarding & Dealer Setup forms | `src/pages/Auth.tsx`, `src/pages/Onboarding.tsx`, `src/pages/dealer/DealerSetup.tsx` |

Each review produces: state coverage audit, layout/hierarchy issues, component correctness issues, role-awareness check, accessibility issues, top 3 priority improvements, quick wins. Followed by a cross-screen summary of inconsistencies and unmet design system rules.

---

## 7. Not in Sprint 6 (deferred)

| Item | Reason for deferral |
|------|---------------------|
| Edit Listing page (`/dealer/listings/:id/edit`) | New feature — after stabilization |
| Account / My Viewings page | New feature — after stabilization |
| Booking decline flow UI (requester sees reason) | Low priority, booking is functional |
| Razorpay webhook integration | Sprint 7 — payment is currently stubbed |
| COMPLETED booking state (@Scheduled job) | Sprint 7 — no blocking impact |
| Dark mode | Non-goal for MVP |

---

## 7. PR Summary Table

| PR | Type | Priority | Backend? | Frontend? | Estimated effort |
|----|------|----------|----------|-----------|-----------------|
| PR-S6-1 | Bug fix | 🔴 CRITICAL | ✅ | ❌ | ~1 day |
| PR-S6-2 | Tests + fix | 🔴 CRITICAL | ✅ | ❌ | ~1 day |
| PR-S6-3 | Tests | 🟡 HIGH | ❌ | ✅ | ~1 day |
| PR-S6-4 | Performance | 🟢 MEDIUM | ✅ | ❌ | ~1 day |
| PR-S6-5 | Performance | 🔵 LOW | ❌ | ✅ | ~0.5 days |
| PR-S6-6 | Docs / infra | 🔵 LOW | ❌ | ❌ | ~0.5 days |

**Total estimated effort**: ~5 days engineering time

---

## 8. Open Questions

None. Sprint 6 scope is fully defined by Sprint 5 post-review findings.

---

*Sprint 6 plan authored 2026-02-22. Based on `SPRINT_05_POST_REVIEW_REPORT.md` findings.*
