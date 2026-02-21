# Sprint 5 — Post-Sprint Code Review Report

**Generated:** 2026-02-20
**Team:** post-review-sprint5 (team-lead, code-reviewer, security-reviewer, qa-fast, performance-analyst)
**Base commit:** `05bd9a9` (sprint start) → **HEAD:** `db84917`
**Sprint 5 commits:** 14 commits (see §2)

---

## 1. Executive Summary

Sprint 5 added role-aware navigation, dealer onboarding, a 4-state booking system, an insights paywall with trial gating, a payment stub, and Sentry observability. The backend security posture is strong — all 15 mandatory security controls (M1–M15) pass — and the IDOR / paywall bypass analysis found no exploitable vectors.

Two **critical** correctness bugs were identified that should be fixed before production traffic scales:

1. **Booking state machine race condition** — all three mutation methods use a read-check-write pattern that permits conflicting concurrent transitions.
2. **Phone silently dropped on missing profile row** — dealer role is granted and 200 returned even when the `profiles` UPDATE affects 0 rows.

Three **test coverage gaps** are security-critical: PaymentController has zero tests, and InsightsController's access gate (403 path) is completely uncovered.

| Category | Finding count |
|---|---|
| CRITICAL | 2 |
| HIGH | 7 (code-reviewer 5 + performance 2) |
| MEDIUM | 15 |
| LOW / INFO | 13 |
| Security controls passed | 15 / 15 ✅ |
| Existing tests | ~67 |
| Missing must-add tests | 20 |

---

## 2. What Changed (Sprint 5)

14 commits landed between `05bd9a9` and `db84917`:

| Commit | Description |
|---|---|
| `83a5abe` | feat(dealer): PR-2 — dealer setup flow + phone persistence |
| `4f5e6f2` | feat(dealer): PR-3a — dealer landing pages (dashboard + listings) |
| `f20df11` | feat(nav): PR-3b — saved areas, notifications redirect, nav tests |
| `8be58bf` | feat(booking): PR-3a — ViewingRequest entity + V15 migration |
| `55d4067` | feat(insights): PR-5a — insights access migration V16 |
| `3b61ea4` | feat(booking): PR-3b — BookingController + BookingService + BookingEventListener |
| `c722b28` | fix(booking): null guard for SCRAPED listings (no created_by) |
| `7b668a9` | test(booking): BookingControllerTest — 14 cases (M5, M7, M8, M10) |
| `177c774` | feat(booking): PR-4 — frontend hooks + RequestViewingModal + DealerBookings |
| `2e2bb90` | feat(booking): wire RequestViewingModal into ListingDetail |
| `ef3649a` | test(smoke): PR-7 — smoke tests (nav, booking, paywall) |
| `3a137fa` | feat(insights): PR-5b — insights access gate + PaymentController stub |
| `b778252` | feat(observability): PR-8 — SentryTestController + OBSERVABILITY_VERIFICATION.md |
| `db84917` | feat(insights): PR-6 — insights paywall + trial banner frontend |

**Files changed across all PRs:**

*Backend (new/modified):* `BookingController.java`, `BookingService.java`, `BookingEventListener.java`, `ViewingRequest.java`, `ViewingRequestRepository.java`, `DealerSetupController.java`, `InsightsController.java`, `InsightsService.java`, `PaymentController.java`, `SentryTestController.java`, `V14–V16 migrations`, `BookingControllerTest.java`, `DealerSetupControllerTest.java`

*Frontend (new/modified):* `App.tsx`, `AppLayout.tsx`, `Onboarding.tsx`, `DealerSetup.tsx`, `DealerDashboard.tsx`, `DealerListings.tsx`, `DealerBookings.tsx`, `SavedAreas.tsx`, `Insights.tsx`, `ListingDetail.tsx`, `RequestViewingModal.tsx`, `PaywallCard.tsx`, `TrialBanner.tsx`, `useBookings.ts`

*E2E:* `e2e/dealer-smoke.spec.ts`, `e2e/quick-smoke.spec.ts`

---

## 3. [code-reviewer] Correctness & Maintainability Findings

### CRITICAL 🔴

#### CR-1 — Booking state machine TOCTOU race condition

**File:** `BookingService.java:173–266`

All three mutation methods (`confirmBooking`, `declineBooking`, `cancelBooking`) use a load-check-write pattern:

```
1. findById(bookingId)          // READ
2. check booking.getStatus()   // CHECK
3. booking.setStatus(NEW)      // WRITE
4. viewingRequestRepository.save(booking)
```

If a dealer confirms (`REQUESTED → CONFIRMED`) and a user cancels (`REQUESTED → CANCELLED`) concurrently, both transactions can read `status = REQUESTED`, pass their guards, and both commit. The booking ends in an undefined state, the audit trail is corrupt, and both events fire.

**Impact:** Silent data corruption; only detectable via log audit. Affects all 3 state transitions.

**Fix:** Replace the pattern with an atomic conditional UPDATE:
```sql
UPDATE viewing_requests
SET status = 'CONFIRMED', updated_at = NOW()
WHERE id = ? AND status = 'REQUESTED'
```
Check affected rows — 0 rows means a concurrent transition won. Return 409 Conflict.

---

#### CR-2 — Phone silently dropped on missing profile row

**File:** `DealerSetupController.java:103–108`

```java
jdbcTemplate.update(
    "UPDATE public.profiles SET phone = ? WHERE user_id = ?",
    phone, userId);
```

The return value (number of updated rows) is not checked. If the `profiles` row does not exist for this user (possible during staging, unusual auth flows, or test data), the UPDATE affects 0 rows, phone is never stored, but the dealer role INSERT on line 91 already committed and the controller returns 200 `{"role": "dealer"}`.

**Impact:** Users can become dealers with no phone on record; the listing page will show a blank contact field.

**Fix:** Capture the return value; if `rows == 0`, log error and return 500 (profile row should always exist for authenticated users — this signals data inconsistency).

---

### HIGH 🟡

#### CR-3 — React setState in render body

**File:** `Insights.tsx:57–59`

```tsx
if (!selectedArea && avgPriceData.length > 0) {
  setSelectedArea(avgPriceData[0].areaKey);  // ← called during render
}
```

Calling `setState` during render is a React anti-pattern. In React 18 StrictMode, this causes double renders and will log "Cannot update a component while rendering a different component." Under Concurrent Mode it can cause infinite loops.

**Fix:** Move to `useEffect`:
```tsx
useEffect(() => {
  if (!selectedArea && avgPriceData.length > 0) {
    setSelectedArea(avgPriceData[0].areaKey);
  }
}, [avgPriceData, selectedArea]);
```

---

#### CR-4 — 4 insights queries fire unconditionally for paywalled users

**File:** `Insights.tsx:51–54`

```tsx
const { data: avgPriceData = [] } = useAvgPriceByArea();
const { data: priceTrendData = [] } = usePriceTrend(selectedArea);
const { data: newListings = [] } = useNewListings(newListingsDays);
const { data: recommendations = [] } = useRecommendations();
```

All 4 hooks have no `enabled: hasAccess` guard. Every paywalled user triggers 4 network requests on page load, each returning 403. This generates ~4× unnecessary backend load and pollutes Sentry/logs with 403 noise for every paywall view.

**Fix:**
```tsx
const { data: avgPriceData = [] } = useAvgPriceByArea({ enabled: hasAccess });
```
(Add `enabled: hasAccess` to all 4 hooks.)

---

#### CR-5 — `useDealerBookings` fires for all authenticated users

**File:** `useBookings.ts:86–93`

```tsx
export function useDealerBookings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['dealer-bookings'],
    queryFn: () => api.get<BookingResponse[]>('/api/bookings/dealer'),
    enabled: !!user,  // ← fires for any authenticated user
  });
}
```

Any logged-in non-dealer user (e.g., a buyer) who lands on a page that calls this hook will hit `GET /api/bookings/dealer`, receive a 403, and see a toast error.

**Fix:** Gate on `isDealer || isAdmin`:
```tsx
const { user, isDealer, isAdmin } = useAuth();
enabled: !!user && (isDealer || isAdmin),
```

---

#### CR-6 — Auth state race condition after sign-out

**File:** `AuthContext.tsx` (async profile/role fetch callbacks)

Async operations (profile fetch, role fetch, `insightsAccessUntil` fetch) in-flight at sign-out time may call `setState` after the sign-out has cleared user state. This can briefly restore stale auth data (including `insightsAccessUntil`) into the store, potentially showing the wrong UI for a few milliseconds after logout.

**Impact:** Low probability but possible brief state corruption post-logout.

**Fix:** Add a cancellation check — capture a `mounted` ref or use AbortController in the auth effects; bail out of setState calls if user is null when the async callback fires.

---

#### CR-7 — `@PageableDefault` sort may conflict with native SQL ORDER BY

**File:** `InsightsController.java` (wherever `Pageable` parameters are accepted)

Spring Data's Pageable support will attempt to append a SQL `ORDER BY` clause derived from the `Sort` parameter. If the underlying repository uses a native query that already contains `ORDER BY`, this can produce a SQL parse error at runtime when a client passes sort parameters.

**Impact:** Runtime 500 if a client passes `?sort=` to any insights endpoint.

**Fix:** Either use `@PageableDefault(sort = {})` with `Sort.unsorted()` enforcement, or switch to JPQL queries where Spring Data's sort injection is safe.

---

### MEDIUM 🟢

| ID | Finding | File | Impact |
|---|---|---|---|
| CM-1 | Time-slot regex allows semantically invalid values (`99:99-99:99`, `25:61-99:99`) | `BookingService.java:38` | Bookings with invalid clock times can be stored; rejected only by UI allowlist |
| CM-2 | `LocalDate.now()` uses JVM server timezone — if server is UTC, "today" in IST is tomorrow | `BookingService.java:101` | Users in IST can be rejected for "today" dates that are valid tomorrow |
| CM-3 | `dealer_id` in `viewing_requests` has no FK constraint to `auth.users` | `V15__create_viewing_requests.sql:7` | Orphaned bookings possible if account deleted |
| CM-4 | No DB-level `CHECK` constraint on `status` column | `V15__create_viewing_requests.sql:12` | Direct DB write can insert invalid status values bypassing application logic |
| CM-5 | `InsightsService.checkInsightsAccess()` issues a DB query on every single insights request | `InsightsService.java:111` | 1 extra DB round-trip per insights API call; consider 5-minute in-memory cache |
| CM-6 | `setSelectedArea` called in render body also causes unnecessary re-render cycle | `Insights.tsx:57–59` | Also identified as performance issue; overlaps CR-3 |
| CM-7 | `window.location.reload()` in PaywallCard after payment breaks SPA navigation | `PaywallCard.tsx` | Full page reload loses React Query cache and React state; use `queryClient.invalidateQueries` + `navigate` instead |
| CM-8 | `COMPLETED` status in `BookingResponse` type but no backend transition to COMPLETED exists | `useBookings.ts:24` | Dead type creates confusing frontend contract; will cause confusion when this state is eventually added |
| CM-9 | Dealer booking cards show no listing title/address | `DealerBookings.tsx` | Dealers see booking requests without knowing which property they relate to |
| CM-10 | `PaywallCard` error handler catches all errors as "coming soon" message | `PaywallCard.tsx` | Real network/server errors are silently masked; users never see the actual error |
| CM-11 | No `listingId` null-check in `RequestViewingModal` before submit | `RequestViewingModal.tsx` | Modal can submit without listingId if parent fails to pass prop |

---

### LOW / SUGGESTION

- `BookingResponse` type should not include `COMPLETED` until the backend state is implemented.
- DealerSetupController: consider logging userId on phone UPDATE success/failure for easier debugging.
- `useCancelBooking` invalidates both `dealer-bookings` and `my-bookings` on success but `useDeclineBooking` only invalidates `dealer-bookings` — consider whether requester should see updated state.
- `BookingEventListener.java`: the `@TransactionalEventListener(phase = AFTER_COMMIT)` is correctly implemented; add a comment explaining why AFTER_COMMIT is required (prevent email sends rolling back with transaction).
- `SentryTestController`: currently allows any authenticated user to trigger a Sentry error — consider gating on `admin` role even in staging to prevent abuse.
- `PaywallCard`: the "Upgrade" button href/action is hardcoded to the payment stub — will need changing when real payment is added.
- `TrialBanner`: the `daysRemaining` count is calculated using UTC `new Date()` — may show "1 day" for users in IST when 2 days remain.

---

### POSITIVE — What's done well

1. **Security control IDs documented inline** — M4–M10 are annotated at every enforcement point in `BookingService.java`. Makes auditing trivial.
2. **`AFTER_COMMIT` event pattern** — `BookingEventListener.java` correctly uses `@TransactionalEventListener(phase = AFTER_COMMIT)` to prevent email/notification side effects from being triggered on a rolled-back transaction.
3. **404-not-403 for IDOR** — `findBookingForDealer` returns `BookingNotFoundException` (→ 404) when the booking doesn't belong to the caller. Textbook IDOR protection; does not leak resource existence.
4. **V16 RLS WITH CHECK using `IS NOT DISTINCT FROM`** — The V16 policy correctly uses `IS NOT DISTINCT FROM` (handles NULL = NULL equality) to prevent users from self-updating `insights_access_until`. Well-designed defence-in-depth layer.
5. **`@ConditionalOnProperty` for SentryTestController** — The staging-only endpoint is correctly disabled by default via Spring Boot conditional bean. Will not appear in production unless explicitly opted in.
6. **Booking `createBooking` null guard for SCRAPED listings** — The explicit check for `dealerId == null` (commit `c722b28`) prevents NullPointerException when SCRAPED listings have no `created_by`.

---

## 4. [qa-fast] Test Coverage Assessment

### Existing test coverage (67 tests)

| Suite | Count | What's covered |
|---|---|---|
| `BookingControllerTest.java` | 14 | Create booking (happy path, past date, > 90 days, time slot format, message too long, self-booking, duplicate, listing not found); confirm, cancel (user + dealer), 403 for non-dealer |
| `DealerSetupControllerTest.java` | ~10 | Valid setup, missing phone, invalid phone format, already dealer (409), already admin (409), acceptedTerms=false |
| `InsightsControllerTest.java` | 10 | Avg price, price trend, new listings, recommendations (all happy paths); authenticated vs unauthenticated. **Zero 403 access gate tests.** |
| `AppLayout.test.tsx` | ~10 | Role-aware nav links visibility (dealer, user, logged-out) |
| `e2e/quick-smoke.spec.ts` | ~8 | Auth flow, listing browse, basic nav |
| `e2e/dealer-smoke.spec.ts` | ~15 | Dealer setup, dashboard, listings page, booking creation flow, confirm/cancel UI |

### Critical coverage gaps

#### GAP-1 🔴 — PaymentController: ZERO tests

The entire `POST /api/payments/insights-pass` endpoint is untested. No test covers:
- 200 with stub enabled (grants 30-day access, returns `insightsAccessUntil`)
- 404 with stub disabled (feature flag default)
- 409 when `insights_access_until > NOW()` (idempotency gate M12)
- 500 when profile row missing
- Audit log output

**Risk:** Security-critical payment logic is shipping with zero automated coverage.

#### GAP-2 🔴 — InsightsController: Zero 403 access gate tests

`InsightsControllerTest.java` tests 10 happy-path scenarios but has zero tests verifying 403 responses when:
- `insights_access_until` is `null`
- `insights_access_until` is in the past

All 4 endpoints (`avg-price`, `price-trend`, `new-listings`, `recommendations`) need access gate coverage.

#### GAP-3 🟡 — PaywallCard and TrialBanner: Zero frontend tests

`PaywallCard.tsx` and `TrialBanner.tsx` have no Vitest tests. Untested scenarios:
- PaywallCard renders when `showPaywall = true`; SavedAreas still visible
- TrialBanner renders with correct `daysRemaining`
- TrialBanner dismiss button hides the banner
- `Insights.tsx` renders full charts when `hasAccess = true, daysRemaining > 3`

#### GAP-4 🟡 — Booking decline path: minimal coverage

`BookingControllerTest.java` covers confirm and cancel but has only 1 test for decline (happy path). Missing:
- Decline a non-REQUESTED booking → 409
- Decline with `declineReason` too long → 400
- Confirm a CANCELLED booking → 409

---

### Top 20 must-add tests

| # | Test name | File | Scenario | Assertion |
|---|---|---|---|---|
| 1 | `grantInsightsPass_stubEnabled_returns200` | `PaymentControllerTest.java` (new) | `payments.stub.enabled=true`, valid user | 200, body has `insightsAccessUntil` ~30 days out |
| 2 | `grantInsightsPass_stubDisabled_returns404` | `PaymentControllerTest.java` | `payments.stub.enabled=false` (default) | 404 |
| 3 | `grantInsightsPass_alreadyActive_returns409` | `PaymentControllerTest.java` | Access until tomorrow, stub enabled | 409, body has `error` + `insightsAccessUntil` |
| 4 | `grantInsightsPass_noProfileRow_returns500` | `PaymentControllerTest.java` | Valid JWT, no profile row in DB | 500 |
| 5 | `getAvgPrice_expiredAccess_returns403` | `InsightsControllerTest.java` | `insights_access_until = yesterday` | 403, body has `error` |
| 6 | `getAvgPrice_nullAccess_returns403` | `InsightsControllerTest.java` | `insights_access_until = null` | 403 |
| 7 | `getPriceTrend_expiredAccess_returns403` | `InsightsControllerTest.java` | Expired access | 403 |
| 8 | `getNewListings_expiredAccess_returns403` | `InsightsControllerTest.java` | Expired access | 403 |
| 9 | `getRecommendations_expiredAccess_returns403` | `InsightsControllerTest.java` | Expired access | 403 |
| 10 | `PaywallCard renders upgrade CTA` | `src/components/insights/__tests__/PaywallCard.test.tsx` (new) | `showPaywall=true` | PaywallCard visible, Upgrade button present, SavedAreas still rendered |
| 11 | `TrialBanner shows N days remaining` | `src/components/insights/__tests__/TrialBanner.test.tsx` (new) | `daysRemaining=2` | Text "Your trial ends in 2 day(s)" visible |
| 12 | `TrialBanner dismisses on close` | `TrialBanner.test.tsx` | Click dismiss button | Banner removed from DOM |
| 13 | `Insights hides paywall when hasAccess=true` | `src/pages/__tests__/Insights.test.tsx` (new) | `insightsAccessUntil` = 10 days future | PaywallCard not rendered; chart containers visible |
| 14 | `declineBooking_alreadyConfirmed_returns409` | `BookingControllerTest.java` | Decline a CONFIRMED booking | 409 with status error |
| 15 | `declineBooking_tooLongReason_returns400` | `BookingControllerTest.java` | Decline with 501-char reason | 400 field=declineReason |
| 16 | `confirmBooking_alreadyCancelled_returns409` | `BookingControllerTest.java` | Confirm a CANCELLED booking | 409 |
| 17 | `cancelBooking_alreadyDeclined_returns409` | `BookingControllerTest.java` | Cancel a DECLINED booking (requester) | 409 |
| 18 | `DealerSetup redirects to /dealer/dashboard on success` | Existing frontend test or new | Submit valid form, mock API returns 200 | `navigate('/dealer/dashboard')` called |
| 19 | `DealerSetup shows already-registered error on 409` | Frontend test | Mock API returns 409 | "already registered as a dealer" text visible |
| 20 | `RequestViewingModal sends correct payload` | `src/components/listing/__tests__/RequestViewingModal.test.tsx` (new) | Submit modal with date/slot/message | `POST /api/bookings` called with correct body |

---

### Missing integration / E2E scenarios

1. **Full insights paywall flow** — buy pass (stub) → access granted → trial banner shown when < 3 days → expiry → paywall shown → buy again
2. **Payment grant idempotency** — grant access → try to grant again → 409; access still valid
3. **Booking decline flow** — requester creates booking → dealer declines with reason → requester sees DECLINED status with reason
4. **Booking cancel by dealer** — CONFIRMED booking → dealer cancels → status = CANCELLED, cancelledBy = 'dealer'
5. **Dealer with 0 bookings** — dealer dashboard and bookings page render empty states without errors

---

## 5. [security-reviewer] Security Checklist

### M1–M15 Mandatory Controls

| Control | Enforcement point | Status | Evidence |
|---|---|---|---|
| M1 | `DEALER_ROLE = "dealer"` constant | ✅ PASS | `DealerSetupController.java:38` |
| M2 | 409 if already dealer/admin | ✅ PASS | `DealerSetupController.java:78–87` |
| M3 | Phone regex `^[+]?[0-9]{10,15}$` + max 15 chars | ✅ PASS | `DealerSetupController.java:41–75` |
| M4 | `requester_id = JWT.sub`, `dealer_id = listing.created_by` | ✅ PASS | `BookingService.java:91–93`, line 126 |
| M5 | 404 (not 403) for non-owner booking access | ✅ PASS | `BookingService.java:289–292` |
| M6 | RLS on `viewing_requests` | ✅ PASS | `V15__create_viewing_requests.sql:29–38` |
| M7 | Time slot regex `^\d{2}:\d{2}-\d{2}:\d{2}$` | ✅ PASS | `BookingService.java:38, 95–98` |
| M8 | Future date, max 90 days | ✅ PASS | `BookingService.java:101–109` |
| M9 | Max 500 chars on free-text fields | ✅ PASS | `BookingService.java:112–115`, `198–203` |
| M10 | Self-booking prevention | ✅ PASS | `BookingService.java:135–138` |
| M11 | Profiles UPDATE RLS column-restricted WITH CHECK | ✅ PASS | `V16__add_insights_access.sql:33–43` |
| M12 | 409 if `insights_access_until > NOW()` | ✅ PASS | `PaymentController.java:73–79` |
| M13 | Feature flag default=false, returns 404 when disabled | ✅ PASS | `PaymentController.java:42–58` |
| M14 | `GRANT_DAYS = 30` constant (never from body) | ✅ PASS | `PaymentController.java:40, 82` |
| M15 | Audit log on every grant call | ✅ PASS | `PaymentController.java:96–97` |

**All 15 controls: PASS ✅**

---

### IDOR / Ownership Analysis

All 6 booking mutation endpoints were reviewed:

| Endpoint | Ownership derivation | IDOR risk |
|---|---|---|
| `POST /api/bookings` | `requester_id = JWT.sub`; `dealer_id = listing.created_by` (DB lookup) | ✅ None |
| `PUT /api/bookings/{id}/confirm` | `findBookingForDealer(bookingId, callerId)` — must equal `dealer_id` | ✅ None |
| `PUT /api/bookings/{id}/decline` | Same `findBookingForDealer` ownership check | ✅ None |
| `PUT /api/bookings/{id}/cancel` | Checks both `requester_id == callerId` and `dealer_id == callerId` | ✅ None |
| `GET /api/bookings/mine` | Queries `WHERE requester_id = userId` (JWT.sub) | ✅ None |
| `GET /api/bookings/dealer` | Queries `WHERE dealer_id = userId` (JWT.sub) + role check | ✅ None |

No IDOR vectors found. The 404-not-403 pattern is consistently applied.

---

### Paywall Bypass Analysis

| Attack vector | Exploitable? | Notes |
|---|---|---|
| **Frontend bypass** — set `insightsAccessUntil` to future in localStorage | No | `insightsAccessUntil` is fetched from Supabase on load; localStorage manipulation would be overwritten |
| **Backend bypass** — call insights endpoints directly with valid JWT | No | `InsightsService.checkInsightsAccess()` reads from `profiles` table via service-account JDBC (bypasses client RLS) |
| **RLS bypass** — update `profiles.insights_access_until` via Supabase REST API | No | V16's `WITH CHECK` constraint prevents user from modifying `insights_access_until` directly |
| **Payment stub abuse** — call `POST /api/payments/insights-pass` repeatedly | No | M12 (409 idempotency) + M13 (feature flag) combined block re-grant and disable in prod |

---

### Additional Security Findings

| Severity | Finding | File |
|---|---|---|
| MEDIUM | 4 insights hooks fire unconditionally — generates 403 noise that could mask real access errors in Sentry | `Insights.tsx:51–54` |
| LOW | `RequestViewingModal` does not null-check `listingId` before submitting | `RequestViewingModal.tsx` |
| LOW | `SentryTestController` is accessible to any authenticated user — no role gate | `SentryTestController.java` |
| INFO | Time slot regex accepts semantically invalid values (e.g., `25:61-99:99`) — only catches format, not range | `BookingService.java:38` |
| INFO | `PaymentController` SELECT + conditional + UPDATE pattern is not atomic under `READ_COMMITTED` — two concurrent requests could both read `null` expiry and both proceed | `PaymentController.java:63–86` (see also performance §6.8) |

---

## 6. [performance-analyst] Performance Analysis

### Backend Performance

#### PERF-1 🟡 HIGH — No pagination on booking list endpoints

**File:** `ViewingRequestRepository.java:12–14`, `BookingService.java:270–276`

Both `GET /api/bookings/mine` and `GET /api/bookings/dealer` return `List<ViewingRequest>` — unbounded. A dealer with 500+ bookings loads all rows into JVM heap on every page visit. No page limit is applied.

**Fix:** Add `Pageable` parameter to both repository methods and controller endpoints. Default to `page=0, size=20, sort=createdAt,desc`.

---

#### PERF-2 🟡 HIGH — Paywall FOUC (flash of wrong content)

**File:** `Insights.tsx:40–48`

```tsx
const { insightsAccessUntil } = useAuth();
const now = new Date();
const accessUntil = insightsAccessUntil ? new Date(insightsAccessUntil) : null;
const hasAccess = accessUntil !== null && accessUntil > now;
const showPaywall = !hasAccess;
```

`insightsAccessUntil` is `null` while the auth profile is loading (initial page load). This makes `showPaywall = true` on the first render, causing users with valid access to see `<PaywallCard>` flash for ~100–200ms until the profile fetch completes.

**Fix:** Check `authLoading` before the gate decision:
```tsx
const { insightsAccessUntil, isLoading: authLoading } = useAuth();
const showPaywall = !authLoading && !hasAccess;
```

---

#### PERF-3 🟡 HIGH — 4 insights queries fire unconditionally for paywalled users

**File:** `Insights.tsx:51–54`

(See also CR-4.) All 4 TanStack Query hooks have no `enabled: hasAccess` guard. Every paywalled user makes 4 backend requests on page load, each returning 403. At scale this generates significant unnecessary load.

**Fix:** Pass `enabled: hasAccess` to all 4 hooks.

---

#### PERF-4 🟢 MEDIUM — Role lookup DB round-trip on every dealer request

**File:** `BookingController.java` (dealer role check)

The controller queries the DB to verify caller role on every `GET /api/bookings/dealer` request. The JWT already carries the role claim — read from `auth.getToken().getClaim("user_role")` instead to eliminate the DB round-trip.

---

#### PERF-5 🟢 MEDIUM — V15 indexes missing `created_at` sort column

**File:** `V15__create_viewing_requests.sql:20–22`

```sql
CREATE INDEX idx_viewing_requests_dealer_id ON viewing_requests (dealer_id, status);
CREATE INDEX idx_viewing_requests_requester_id ON viewing_requests (requester_id, status);
```

Both list queries order by `created_at DESC`. The indexes omit `created_at`, so PostgreSQL must fetch all matching rows and sort in memory. With high booking volumes this becomes a bottleneck.

**Fix (V17 migration):**
```sql
CREATE INDEX idx_viewing_requests_dealer_id
  ON viewing_requests (dealer_id, status, created_at DESC);
CREATE INDEX idx_viewing_requests_requester_id
  ON viewing_requests (requester_id, created_at DESC);
```

---

#### PERF-6 🟢 MEDIUM — `staleTime: 0` on booking queries

**File:** `useBookings.ts:75–93`

Both `useMyBookings` and `useDealerBookings` use default `staleTime: 0`, causing refetch on every window focus, tab switch, or navigation. Booking status changes infrequently.

**Fix:** Set `staleTime: 5 * 60 * 1000` (5 minutes) with explicit invalidation on mutations.

---

#### PERF-7 🟢 MEDIUM — `setSelectedArea` in render body causes extra render cycle

**File:** `Insights.tsx:57–59`

(See also CR-3 / CR-6.) The inline `setSelectedArea` call during render triggers a synchronous re-render.

---

### Frontend Performance

#### PERF-8 🔵 LOW — Recharts not code-split (~250 KB initial bundle impact)

**File:** `Insights.tsx:22–32`

Recharts is imported at the top of `Insights.tsx` and loaded as part of the initial bundle. The Insights page is only visited by users with active access (a subset of all users). This adds ~250 KB gzipped to the initial JS bundle.

**Fix:** Use `React.lazy` + `Suspense` on the chart components, or add `Insights.tsx` to a lazy-loaded route chunk in `App.tsx`.

---

### Database Performance

#### PERF-9 🔵 LOW — PaymentController SELECT+UPDATE is non-atomic (TOCTOU)

**File:** `PaymentController.java:63–86`

The controller reads `insights_access_until`, checks it, then issues a separate UPDATE. Under `READ_COMMITTED` isolation, two concurrent calls for the same user could both read `null` expiry, both pass the 409 guard, and both UPDATE — granting access twice. The second UPDATE is harmless (overwrites with a slightly later expiry) but the 409 semantics are violated.

**Fix:** Replace with a single atomic conditional UPDATE:
```sql
UPDATE public.profiles
SET insights_access_until = NOW() + INTERVAL '30 days'
WHERE user_id = ? AND (insights_access_until IS NULL OR insights_access_until <= NOW())
```
Check affected rows — 0 means idempotency guard triggered → return 409.

---

#### PERF-10 🔵 LOW — No index on `profiles.insights_access_until`

**File:** `V16__add_insights_access.sql`

The `InsightsService.checkInsightsAccess()` query filters by `user_id` (indexed via PK), so this is not a current issue. However, any future batch expiry job (`SELECT * FROM profiles WHERE insights_access_until < NOW()`) would full-scan the `profiles` table without an index.

**Fix (V17 migration):** `CREATE INDEX idx_profiles_insights_access_until ON profiles (insights_access_until);`

---

## 7. E2E Coverage Gaps

The current e2e suites (`quick-smoke.spec.ts`, `dealer-smoke.spec.ts`) cover the happy path for most Sprint 5 features. The following scenarios are not covered by any automated test (unit, integration, or e2e):

| Gap | Priority | Description |
|---|---|---|
| Insights paywall full round-trip | 🔴 HIGH | Grant access (stub) → see charts → trial banner when < 3 days → expiry → paywall; requires real DB and timing control |
| Payment grant idempotency | 🔴 HIGH | Grant → try to grant again immediately → 409 |
| Booking decline flow (UI) | 🟡 HIGH | Dealer clicks Decline → enters reason → confirmation; requester sees DECLINED with reason text |
| Dealer-cancels-CONFIRMED flow | 🟡 HIGH | Dealer cancels CONFIRMED booking → cancelled_by = 'dealer' |
| Booking list empty states | 🟢 MEDIUM | Dealer/user with zero bookings — empty states render without console errors |
| Paywall with active trial (< 3 days) | 🟢 MEDIUM | TrialBanner visible, charts visible, SavedAreas visible |
| Phone missing in prod redirect | 🟢 MEDIUM | Dealer with null phone still sees dashboard (phone display gracefully handles null) |
| SentryTestController in staging | 🔵 LOW | `GET /api/sentry/test` with `sentry.test.enabled=true` → Sentry event captured |

---

## 8. Recommended Follow-up PR Plan

Based on all findings, the following PRs are recommended in priority order:

---

### PR-FIX-1 — Booking state machine atomicity (CRITICAL, ~1 day)

**Addresses:** CR-1
**Files to change (max 3):**
1. `BookingService.java` — replace read-check-write in `confirmBooking`, `declineBooking`, `cancelBooking` with atomic conditional UPDATE + row-count check
2. `ViewingRequestRepository.java` — add `@Modifying @Query` methods for atomic state transitions
3. `BookingControllerTest.java` — add concurrent transition test cases

**Acceptance criteria:** Concurrent confirm+cancel cannot both succeed. No existing tests regress.

---

### PR-FIX-2 — Phone drop + dealer setup hardening (CRITICAL, ~0.5 days)

**Addresses:** CR-2
**Files to change (max 2):**
1. `DealerSetupController.java` — check rows from phone UPDATE; return 500 if 0 rows affected
2. `DealerSetupControllerTest.java` — add test for missing profile row scenario

---

### PR-TEST-1 — PaymentController test suite (CRITICAL coverage, ~1 day)

**Addresses:** GAP-1
**Files to change (max 2):**
1. `PaymentControllerTest.java` (new) — must-add tests #1–4 (200, 404, 409, 500)
2. `PaymentController.java` — optional: atomicity fix from PERF-9

**Acceptance criteria:** 4 new tests; all pass. `mvn -pl backend test` → 0 failures.

---

### PR-TEST-2 — Insights access gate test coverage (CRITICAL coverage, ~1 day)

**Addresses:** GAP-2
**Files to change (max 2):**
1. `InsightsControllerTest.java` — must-add tests #5–9 (403 on expired/null access for all 4 endpoints, 200 on valid access)
2. `InsightsService.java` — optional: 5-minute access cache (CM-5)

---

### PR-FIX-3 — Insights frontend rendering fixes (HIGH, ~0.5 days)

**Addresses:** CR-3, CR-4, PERF-2, PERF-3
**Files to change (max 2):**
1. `Insights.tsx` — move `setSelectedArea` to `useEffect`; add `enabled: hasAccess` to all 4 hooks; add `authLoading` guard for `showPaywall`
2. `useBookings.ts` — add `isDealer || isAdmin` gate to `useDealerBookings`; set `staleTime: 5 * 60 * 1000`

---

### PR-TEST-3 — Frontend paywall component tests (HIGH coverage, ~1 day)

**Addresses:** GAP-3, must-add tests #10–13
**Files to change (max 3):**
1. `src/components/insights/__tests__/PaywallCard.test.tsx` (new)
2. `src/components/insights/__tests__/TrialBanner.test.tsx` (new)
3. `src/pages/__tests__/Insights.test.tsx` (new, access gate rendering)

---

### PR-PERF-1 — Booking list pagination + index improvements (MEDIUM, ~1 day)

**Addresses:** PERF-1, PERF-5
**Files to change (max 3):**
1. `ViewingRequestRepository.java` — add paginated variants
2. `BookingController.java` + `BookingService.java` — add `Pageable` support
3. `V17__booking_index_improvements.sql` (new migration) — updated indexes with `created_at`

---

### PR-PERF-2 — Bundle optimization + PaywallCard fix (LOW, ~0.5 days)

**Addresses:** PERF-8, CM-7
**Files to change (max 2):**
1. `Insights.tsx` — lazy-load chart components via `React.lazy`
2. `PaywallCard.tsx` — replace `window.location.reload()` with `queryClient.invalidateQueries` + `navigate`

---

### Summary table

| PR | Type | Priority | Critical? | Estimated effort |
|---|---|---|---|---|
| PR-FIX-1 | Bug fix | 🔴 CRITICAL | Yes | ~1 day |
| PR-FIX-2 | Bug fix | 🔴 CRITICAL | Yes | ~0.5 days |
| PR-TEST-1 | Tests | 🔴 CRITICAL coverage | Yes | ~1 day |
| PR-TEST-2 | Tests | 🔴 CRITICAL coverage | Yes | ~1 day |
| PR-FIX-3 | Bug fix | 🟡 HIGH | No | ~0.5 days |
| PR-TEST-3 | Tests | 🟡 HIGH | No | ~1 day |
| PR-PERF-1 | Performance | 🟢 MEDIUM | No | ~1 day |
| PR-PERF-2 | Performance | 🔵 LOW | No | ~0.5 days |

**Recommended sequencing:**
Start PR-FIX-1 + PR-FIX-2 + PR-TEST-1 + PR-TEST-2 in parallel (all independent). Then PR-FIX-3 (after tests pass). Then PR-TEST-3, PR-PERF-1, PR-PERF-2 in the next sprint.

---

## Appendix: Security Controls Reference

| ID | Control | Sprint | Status |
|---|---|---|---|
| M1 | `DEALER_ROLE` constant (never from body) | PR-2 | ✅ |
| M2 | 409 if already dealer/admin | PR-2 | ✅ |
| M3 | Phone regex + max 15 chars | PR-2 | ✅ |
| M4 | `requester_id = JWT.sub`, `dealer_id = listing.created_by` | PR-3b | ✅ |
| M5 | 404-not-403 for non-owners | PR-3b | ✅ |
| M6 | RLS on `viewing_requests` | PR-3a | ✅ |
| M7 | Time slot regex validation | PR-3b | ✅ |
| M8 | Future date, max 90 days | PR-3b | ✅ |
| M9 | Max 500 chars on free-text | PR-3b | ✅ |
| M10 | Self-booking prevention | PR-3b | ✅ |
| M11 | Profiles UPDATE RLS column-restricted | PR-5a | ✅ |
| M12 | 409 if insights_access_until > NOW() | PR-5b | ✅ |
| M13 | Feature flag default false, returns 404 | PR-5b | ✅ |
| M14 | `GRANT_DAYS = 30` constant | PR-5b | ✅ |
| M15 | Audit log on every grant | PR-5b | ✅ |

---

*Report generated by post-review-sprint5 team. Findings are based on static analysis of Sprint 5 changed files only — no runtime profiling was performed.*
