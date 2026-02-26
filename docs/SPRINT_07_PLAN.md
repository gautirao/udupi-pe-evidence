# Sprint 7 Plan — Hardening, Booking Completion & Dealer Edit Flow

**Sprint**: Sprint 7
**Date**: 2026-02-26
**Status**: DRAFT
**Focus**: Close Sprint 6 hardening carry-overs, complete the booking lifecycle (COMPLETED state, decline reason UI), deliver the dealer Edit Listing page, and run overdue UI design reviews.

---

## 0. Sprint Goal

> All Sprint 6 hardening items resolved. Booking lifecycle fully implemented end-to-end. Dealers can edit their listings. All existing screens reviewed against the design system.

---

## 1. Carry-Forward Status (from Sprint 6)

| Item | Source | Severity | Notes |
|------|--------|----------|-------|
| Global `@ControllerAdvice` | S6 security review | 🟡 HIGH | PropertyReferenceException → 400; general catch-all 500 |
| Rate limiting (payments + bookings) | S6 security review | 🟡 HIGH | Per-user, in-memory (Bucket4j); no Redis needed |
| PaywallCard SPA fix | S6 PR-S6-5 | 🟢 MEDIUM | Need `refreshAuth()` on AuthContext first |
| Frontend Page<> adaptation | S6 PR-S6-4 | 🟢 MEDIUM | `/mine` and `/dealer` consumers must read `.content` |
| Boundary test `insights_access_until == NOW()` | S6 review | 🔵 LOW | Edge-case test only |

---

## 2. Sprint 7 PR Breakdown

> Rule: Max 3 files per PR (limit waived only when explicitly called out). Each PR follows the risk-tier pipeline from `.claude/PR_RULES.md`.

---

### PR-S7-1 — Global `@ControllerAdvice` + Rate Limiting (CRITICAL hardening)

**Priority**: 🔴 CRITICAL (security hardening)
**Pipeline**: CRITICAL tier — qa-fast → backend-engineer → code-reviewer → security-reviewer

**Problem 1 — No global exception handler**:
Unhandled exceptions (e.g., `PropertyReferenceException` from bad sort params, `HttpMessageNotReadableException` from malformed JSON) produce Spring's default `/error` response, which may expose stack traces or internal field names in non-prod profiles.

**Problem 2 — No rate limiting**:
`POST /api/payments/insights-pass` and `POST /api/bookings` are unbounded. An authenticated user can spam them. Payments are currently stubbed but will be real in Sprint 8.

**Files (max 3 — limit applies):**
1. `backend/.../exception/GlobalExceptionHandler.java` (NEW) — `@ControllerAdvice` with:
   - `PropertyReferenceException` → 400 `{"error": "INVALID_SORT_FIELD", "message": "Allowed sort fields: ..."}`
   - `HttpMessageNotReadableException` → 400 `{"error": "MALFORMED_REQUEST"}`
   - `MethodArgumentNotValidException` → 422 `{"error": "VALIDATION_FAILED", "fields": [...]}`
   - Fallback `Exception` → 500 `{"error": "INTERNAL_ERROR"}` (no stack trace, no message)
2. `backend/.../payment/PaymentController.java` — add `@RateLimiter` annotation (Resilience4j) or inline Bucket4j bucket check; limit: 3 requests/user/hour
3. `backend/.../booking/BookingController.java` — add rate limit on `POST /api/bookings`: 10 requests/user/hour

**Rate limiting approach**: Use Resilience4j `RateLimiter` (already available via Spring Boot Actuator). Store per-user state in a `ConcurrentHashMap<String, RateLimiter>` bean. Key = JWT `sub` (user UUID). Evict stale entries on a 1-hour schedule.

**Acceptance criteria:**
- Bad sort field → 400 `{"error": "INVALID_SORT_FIELD"}` (not 500, no stack trace)
- Malformed JSON body → 400 `{"error": "MALFORMED_REQUEST"}`
- Payment endpoint: 4th request within 1 hour from same user → 429 `{"error": "RATE_LIMIT_EXCEEDED"}`
- Booking create: 11th request within 1 hour → 429
- All 476 existing tests pass
- No stack traces exposed in any error response

---

### PR-S7-2 — Frontend: Booking Page<> Adaptation + PaywallCard SPA Fix (MEDIUM)

**Priority**: 🟢 MEDIUM
**Pipeline**: MEDIUM tier — frontend-engineer → code-reviewer

**Problem 1 — Broken booking list UI**:
`GET /api/bookings/mine` and `GET /api/bookings/dealer` now return `Page<BookingResponse>` (PR-S6-4 breaking change). The frontend consumers still treat the response as an array, causing `response.map is not a function` or silent empty lists.

**Problem 2 — PaywallCard hard reload**:
After successful payment, `window.location.reload()` is a full page reload. The fix requires `refreshAuth()` on AuthContext (which doesn't exist yet) — this must be added in the same PR.

**Files (max 3):**
1. `src/contexts/AuthContext.tsx` — add `refreshAuth: () => Promise<void>` to the context value that re-fetches the user's profile from Supabase and updates `insightsAccessUntil` state
2. `src/components/insights/PaywallCard.tsx` — replace `window.location.reload()` with `await refreshAuth()` then `navigate('/insights')`; update test mock
3. `src/hooks/useBookings.ts` (or wherever booking API calls live) — update to extract `.content` from the Page<> response; pass `page`, `totalPages` to consumers

**Acceptance criteria:**
- Booking list pages render correctly (data comes from `response.content`)
- After PaywallCard payment success: no full reload; insights access UI updates in-place
- `npm test -- --run` → 83+ tests passing (update PaywallCard test to mock `refreshAuth` instead of `window.location.reload`)
- `npm run build` succeeds

---

### PR-S7-3 — COMPLETED Booking State (`@Scheduled` auto-transition) (MEDIUM)

**Priority**: 🟢 MEDIUM
**Pipeline**: MEDIUM tier — qa-fast → backend-engineer → code-reviewer

**Problem**: Confirmed bookings stay `CONFIRMED` forever even after the viewing date passes. There is no mechanism to mark a booking as `COMPLETED`. The `ViewingRequest` entity has a `requestedDate` field that represents the viewing appointment date.

**Files (max 3):**
1. `backend/.../booking/BookingScheduler.java` (NEW) — `@Component` with `@Scheduled(cron = "0 0 2 * * *")` (runs at 2am daily):
   - Atomic UPDATE: `SET status = 'COMPLETED', updatedAt = now() WHERE status = 'CONFIRMED' AND requested_date < CURRENT_DATE`
   - Log count of transitioned bookings at INFO level
   - `@Modifying @Transactional` on the query method
2. `backend/.../booking/ViewingRequestRepository.java` — add `@Modifying @Query` method: `transitionExpiredConfirmedToCompleted(OffsetDateTime now)`
3. `backend/.../booking/BookingSchedulerTest.java` (NEW) — unit test:
   - Mock repository method; verify it is called by scheduler
   - Verify log output at INFO level
   - Verify scheduler does NOT run if no CONFIRMED bookings exist (rows=0, no error)

**Flyway note**: No migration needed — `COMPLETED` is already a valid `viewing_request_status` enum value (check V15 migration; if not, a V18 migration adding `'COMPLETED'` to the enum is required).

**Acceptance criteria:**
- Scheduler runs at 2am daily (cron verified in test)
- CONFIRMED bookings with `requested_date < today` → COMPLETED atomically
- CONFIRMED bookings with `requested_date >= today` → untouched
- All 476 existing tests pass

---

### PR-S7-4 — Decline Reason UI for Requesters (MEDIUM)

**Priority**: 🟢 MEDIUM
**Pipeline**: MEDIUM tier — frontend-engineer → code-reviewer

**Problem**: When a dealer declines a booking request with a reason, the requester has no way to see that reason in the UI. The backend already stores `decline_reason` in `ViewingRequest` and returns it in `BookingResponse`. The frontend just needs to display it.

**Files (max 2):**
1. `src/pages/Bookings.tsx` (or wherever the requester's booking list renders) — in the DECLINED booking card, add a "Declined: {reason}" note below the status badge, only visible to the requester role; use a muted/destructive text style per design system
2. `src/pages/__tests__/Bookings.test.tsx` (or matching test file) — add test: DECLINED booking with `declineReason` shows the reason text; DECLINED without reason shows nothing

**Acceptance criteria:**
- Requester sees decline reason on their DECLINED booking cards
- Dealer does NOT see their own decline reason text in dealer view (it's a requester-facing message)
- `npm test -- --run` → all tests pass

---

### PR-S7-5 — Edit Listing Page for Dealers (HIGH feature)

**Priority**: 🟡 HIGH (MVP feature; dealers cannot edit listings yet)
**Pipeline**: CRITICAL tier (new auth-gated endpoint + new page) — qa-fast → backend-engineer → qa-fast (frontend) → frontend-engineer → code-reviewer → security-reviewer

**Problem**: Dealers can create listings (DRAFT) but cannot edit them after creation. The `PUT /api/listings/{id}` endpoint may exist; if not, it must be created. The frontend has no Edit Listing page.

**Sub-PR split** (2 sequential PRs, both count as S7-5):

#### PR-S7-5a — Backend: Edit Listing endpoint

**Files (max 3):**
1. `backend/.../listing/ListingController.java` — add `PUT /api/listings/{id}` endpoint:
   - Auth: dealer only, listing must belong to caller
   - Allowed when status is `DRAFT` or `REJECTED` only (PENDING_REVIEW and LIVE are locked)
   - Body: subset of listing fields (title, price, description, property_type, locality, land_area, bedrooms, built_area)
   - Returns 200 + updated listing, or 403 (wrong owner), 409 (wrong status), 404 (not found)
2. `backend/.../listing/ListingService.java` — `updateListing(UUID listingId, UUID dealerId, UpdateListingRequest dto)` — validates status, updates fields, saves
3. `backend/.../listing/ListingControllerTest.java` — add tests: 200 (DRAFT), 200 (REJECTED), 403 (wrong owner), 409 (PENDING_REVIEW locked), 409 (LIVE locked), 404

#### PR-S7-5b — Frontend: Edit Listing page

**Files (max 3):**
1. `src/pages/dealer/EditListing.tsx` (NEW) — form pre-populated from `GET /api/listings/{id}`:
   - Same fields as Create Listing form
   - Submit calls `PUT /api/listings/{id}`
   - On success: navigate to `/dealer/listings`
   - Shows "This listing is locked" message if status is PENDING_REVIEW or LIVE
2. `src/App.tsx` — add route: `/dealer/listings/:id/edit` → `<EditListing />`
3. `src/pages/dealer/DealerListings.tsx` — add "Edit" button on DRAFT and REJECTED listing cards, linking to the edit route

**Acceptance criteria (both sub-PRs):**
- Dealer can edit a DRAFT listing and save; changes persist
- PENDING_REVIEW and LIVE listings show locked state (no editable fields)
- Wrong-owner access returns 403
- `mvn test` → all backend tests pass
- `npm test -- --run` → all frontend tests pass
- `npm run build` succeeds

---

### PR-S7-6 — UI Design Reviews (LOW, docs output)

**Priority**: 🔵 LOW (no code changes — review output only)
**Pipeline**: ui-designer agent only, no code-reviewer needed

Run the `ui-designer` agent on all 6 screen groups defined in the Sprint 6 plan (§6). Each produces a findings report. Findings are collected into a single `docs/UI_DESIGN_REVIEW_S7.md` file. High-priority fixes from the reviews become candidates for Sprint 8 polish PRs.

**Screens to review:**

| Task | Screen(s) |
|------|-----------|
| UI-1 | AppLayout & Navigation |
| UI-2 | Home / Map page |
| UI-3 | Insights dashboard (PaywallCard, TrialBanner, SavedAreas) |
| UI-4 | Listing detail + RequestViewingModal |
| UI-5 | Dealer pages (Dashboard, Listings, Bookings) |
| UI-6 | Auth, Onboarding, DealerSetup forms |

**Output**: `docs/UI_DESIGN_REVIEW_S7.md` with findings per screen group + cross-screen inconsistency summary.

**Acceptance criteria:**
- All 6 screen groups reviewed
- Each finding rated: CRITICAL / HIGH / MEDIUM / LOW
- Top 3 cross-screen inconsistencies identified
- No code changes in this PR — doc output only

---

### PR-S7-7 — Insights Access Boundary Test (LOW)

**Priority**: 🔵 LOW
**Pipeline**: LOW tier — backend-engineer only (1 test file, no code changes)

Add the missing boundary test for `insights_access_until == NOW()` (access expiry at exact current moment). This edge case was deferred from Sprint 6 PR-S6-2 review.

**Files (1 file):**
1. `backend/.../payment/PaymentControllerTest.java` — add test: `grantInsightsPass_accessExpiresAtExactNow_returns200` — sets `insights_access_until = NOW()` (expired at this moment, not active), asserts the atomic UPDATE treats it as expired and grants new access (condition: `insights_access_until <= NOW()` is true at boundary)

**Acceptance criteria:**
- 1 new test passes
- All 476 existing tests still pass

---

## 3. Sequencing

```
Phase 1 — Hardening (do first, unblocks later work):
  PR-S7-1 (ControllerAdvice + Rate limiting) ──────────► merge  [backend, CRITICAL]
  PR-S7-2 (Frontend Page<> + PaywallCard SPA) ─────────► merge  [frontend, MEDIUM]

Phase 2 — Booking & Feature completeness:
  PR-S7-3 (COMPLETED booking scheduler) ───────────────► merge  [backend]
  PR-S7-4 (Decline reason UI) ─────────────────────────► merge  [frontend]

Phase 3 — Edit Listing (largest item, sequential):
  PR-S7-5a (Edit Listing backend) ─────────────────────► merge  [backend]
  PR-S7-5b (Edit Listing frontend) ────────────────────► merge  [frontend, depends on 5a]

Phase 4 — Reviews & low-priority:
  PR-S7-6 (UI design reviews) ─────────────────────────► doc committed
  PR-S7-7 (Boundary test) ─────────────────────────────► merge  [backend]
```

**Critical path**: PR-S7-2 depends on AuthContext `refreshAuth()` which is only needed for PaywallCard — this is self-contained. PR-S7-5b depends on PR-S7-5a (backend endpoint must exist first). All other PRs are independent.

---

## 4. Risk Assessment

| PR | Risk | Notes |
|----|------|-------|
| S7-1 | MEDIUM | `@ControllerAdvice` must not swallow legitimate errors; test all 4 exception types |
| S7-2 | LOW | Page<> adaptation is mechanical; refreshAuth() is isolated to AuthContext |
| S7-3 | LOW | @Scheduled is stateless; ensure idempotent (can run twice safely) |
| S7-4 | LOW | Read-only UI addition; no new API endpoints |
| S7-5a | HIGH | New write endpoint on listings; strict owner + status checks required |
| S7-5b | MEDIUM | New route + form; pre-population must not mutate shared state |
| S7-6 | NONE | Read-only design review; no code changes |
| S7-7 | NONE | Single test addition |

---

## 5. Testing Mandate

Every PR must:
- Pass `npm run lint && npm run typecheck && npm test -- --run` (frontend PRs)
- Pass `cd backend && mvn test` with 0 failures (backend PRs)
- Add or update at least 1 meaningful test (except PR-S7-6 which is docs-only)
- Include "What could break?" in the implementation report

---

## 6. Not in Sprint 7 (deferred)

| Item | Reason |
|------|--------|
| Razorpay webhook integration | Payment is still stubbed; webhook needs real payment setup |
| Google / Facebook OAuth | Auth extension; no user demand yet |
| Image upload for dealer listings | Requires Supabase Storage integration; Sprint 8 |
| Address geocode + pin confirmation | Depends on image upload flow being settled; Sprint 8 |
| Listing submission flow (DRAFT → PENDING_REVIEW) | Depends on image upload + address confirmation; Sprint 8 |
| Admin review queue (PENDING_REVIEW → LIVE/REJECTED) | Depends on submission flow; Sprint 8 |
| Notifications system | Depends on listing approval flow; Sprint 8 |
| `@Transactional` service extraction | Nice-to-have refactor; Sprint 8 |
| Dark mode | Non-goal for MVP |

---

## 7. PR Summary Table

| PR | Type | Priority | Backend | Frontend | Pipeline |
|----|------|----------|---------|----------|----------|
| S7-1 | Hardening | 🔴 CRITICAL | ✅ | ❌ | CRITICAL |
| S7-2 | Bug fix + feature | 🟢 MEDIUM | ❌ | ✅ | MEDIUM |
| S7-3 | Feature | 🟢 MEDIUM | ✅ | ❌ | MEDIUM |
| S7-4 | Feature | 🟢 MEDIUM | ❌ | ✅ | MEDIUM |
| S7-5a | Feature | 🟡 HIGH | ✅ | ❌ | CRITICAL |
| S7-5b | Feature | 🟡 HIGH | ❌ | ✅ | MEDIUM |
| S7-6 | Review | 🔵 LOW | ❌ | ❌ | ui-designer only |
| S7-7 | Test | 🔵 LOW | ✅ | ❌ | LOW |

---

## 8. Open Questions

1. **`COMPLETED` enum value**: Does `viewing_request_status` already include `'COMPLETED'`? Check V15 migration before starting PR-S7-3. If not, V18 migration needed.
2. **Resilience4j vs Bucket4j**: Both are available in Spring Boot. Confirm which is already in `pom.xml` before PR-S7-1 to avoid adding a new dependency.
3. **Edit Listing field scope**: Should `locality` be editable (requires re-geocoding)? If yes, PR-S7-5 must also handle address_confirmed reset. Recommend deferring locality edits until Sprint 8.

---

*Sprint 7 plan authored 2026-02-26. Based on Sprint 6 checkpoint, Sprint 6 post-review findings, and MVP_SPEC.md.*
