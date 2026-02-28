# Sprint 10 Plan — API Stability + E2E Hardening

**Sprint**: Sprint 10
**Date**: 2026-02-28
**Status**: NOT STARTED
**Focus**: Fix deferred technical debt from Sprint 9, stabilise the Page serialization format, harden E2E suite with auth-gated tests, and improve listing detail UX.

---

## 0. Sprint Goal

> The API surface is stable and consistently serialized. All Playwright E2E tests pass including auth-gated scenarios. Dealers can view individual listing details without errors.

---

## PR Status Tracker

| PR | Name | Priority | Status |
|----|------|----------|--------|
| PR-10.1 | Page serialization VIA_DTO migration | P1 | ☐ Not started |
| PR-10.2 | E2E: auth-gated test scenarios (Q3/Q7) | P1 | ☐ Not started |
| PR-10.3 | Listing detail page (GET /api/listings/{id}) | P2 | ☐ Not started |
| PR-10.4 | Global teardown: delete test listing | P2 | ☐ Not started |

---

## PR Details

### PR-10.1 — Page serialization VIA_DTO migration (P1)

**Problem**: Spring Boot logs `[WARN] Serializing PageImpl instances as-is is not supported` on every paginated response. The fix (`@EnableSpringDataWebSupport(pageSerializationMode = VIA_DTO)`) changes the JSON shape of all `Page<T>` responses — `$.totalElements` and `$.totalPages` move to `$.page.totalElements` and `$.page.totalPages`.

**Scope of change**:
- `backend/src/main/java/com/example/realestate/RealEstateApplication.java` — add annotation
- `src/hooks/useDealerListings.ts` — update to read `data.page.totalElements`, `data.page.totalPages`
- `src/hooks/useBookings.ts` (or wherever bookings pagination is consumed) — same update
- All 12 backend test assertions that reference `$.totalElements` / `$.totalPages` must be updated to `$.page.totalElements` / `$.page.totalPages`

**Files to check for pagination consumers**:
- `src/hooks/useDealerListings.ts`
- `src/hooks/useBookings.ts`
- `src/hooks/useAdminListings.ts` (if exists)
- Any other frontend hook that calls a paginated endpoint

**Tests to update** (from Sprint 9 investigation — 12 tests broke with VIA_DTO):
- `ListingControllerTest` — `mine_*` tests checking totalElements/totalPages
- `BookingControllerTest` — paginated booking list tests
- Any other `WebMvcTest` that asserts `$.totalElements`

**Acceptance criteria**:
- No more `PageModule$WarningLoggingModifier` WARN in logs
- All 500+ backend tests pass
- Frontend pagination still works (page counts, next/prev)

---

### PR-10.2 — E2E: auth-gated test scenarios (Q3/Q7) (P1)

**Problem**: E2E tests Q3 (login) and Q7 (duplicate booking) require `SMOKE_USER_EMAIL` / `SMOKE_USER_PASSWORD` / `SMOKE_LISTING_ID` env vars. In CI these should be set. Locally they depend on `.env` file setup.

**Tasks**:
1. Verify Q3 and Q7 pass locally with credentials set
2. Add `.env.e2e` example with required vars documented
3. Consider adding `listing-lifecycle.spec.ts` spec for dealer create/submit/delete flow
4. Add CI env var documentation to `DEPLOYMENT.md`

**Acceptance criteria**:
- All 7 smoke tests pass with credentials set
- `listing-lifecycle.spec.ts` dealer flow tests pass

---

### PR-10.3 — Listing detail page GET /api/listings/{id} UX (P2)

**Problem**: `GET /api/listings/{id}` endpoint was added (fix commit `e1b4c2b`) but there is no dealer-facing detail page that uses it. The endpoint returns full listing data including `imageCount`, `firstImageUrl`, address confirmation status, and rejection reason.

**Tasks**:
1. Create `DealerListingDetail` page (or modal) at `/dealer/listings/:id`
2. Show all listing fields including status, rejection reason (if rejected), image count
3. Wire up from `DealerListings` cards (clicking a listing opens detail)

**Acceptance criteria**:
- Dealer can navigate to a listing detail view
- Rejection reason is visible when status is `REJECTED`
- Image count and thumbnail shown

---

### PR-10.4 — Global teardown: delete test listing (P2)

**Problem**: `global-teardown.ts` should delete the test listing created by `global-setup.ts` to avoid accumulating test data in the database.

**Current state**: `global-teardown.ts` exists but may not call `DELETE /api/listings/{id}`.

**Tasks**:
1. Read `e2e/.test-listing-id` in teardown
2. Authenticate as dealer
3. Call `DELETE /api/listings/{listingId}` (only works for DRAFT listings)
4. If listing was approved (LIVE), call admin cancel first, then delete — or just log and skip

**Acceptance criteria**:
- After test run, test listing is deleted from DB
- `.test-listing-id` file is removed

---

## Deferred from Sprint 9

| Item | Reason deferred | Target |
|------|----------------|--------|
| `PageImpl` VIA_DTO migration | Breaking change to 12+ tests and 2+ frontend hooks; needed careful multi-file coordination | PR-10.1 |
| Dealer listing detail page | Not requested in S9 scope | PR-10.3 |
| E2E teardown cleanup | Low priority; test data is minimal | PR-10.4 |

---

## Technical Notes

### Page VIA_DTO JSON shape change

Before (current — PageImpl):
```json
{
  "content": [...],
  "totalElements": 42,
  "totalPages": 3,
  "size": 20,
  "number": 0
}
```

After (VIA_DTO — PagedModel):
```json
{
  "content": [...],
  "page": {
    "size": 20,
    "number": 0,
    "totalElements": 42,
    "totalPages": 3
  }
}
```

Frontend hooks must change from `data.totalElements` → `data.page.totalElements` etc.
Backend test assertions must change from `$.totalElements` → `$.page.totalElements` etc.
