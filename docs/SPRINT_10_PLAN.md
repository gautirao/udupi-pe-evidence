# Sprint 10 Plan — API Stability + E2E Hardening + Listing Navigation

**Sprint**: Sprint 10
**Date**: 2026-02-28 (active as of 2026-03-01)
**Status**: IN PROGRESS
**Focus**: Fix deferred technical debt from Sprint 9, stabilise Page serialization, harden E2E suite, fix Groq ingestion pipeline, add listing navigation for scraped listings.

---

## 0. Sprint Goal

> The API surface is stable and consistently serialized. All Playwright E2E tests pass including auth-gated scenarios. The ingestion pipeline runs cleanly on Groq. Admins and users can browse and navigate to any listing detail page directly, not just via map pins.

---

## PR Status Tracker

| PR | Name | Priority | Status |
|----|------|----------|--------|
| PR-10.1 | Page serialization VIA_DTO migration | P1 | ✅ Done (85f11a0, b44bf99, d11a61c) |
| PR-10.2 | E2E: auth-gated test scenarios (Q3/Q7) | P1 | ☐ Not started |
| PR-10.3 | Listing browser + detail navigation | P1 | ☐ Not started |
| PR-10.4 | Global teardown: delete test listing | P2 | ☐ Not started |
| PR-10.5 | Fix Groq tool call schema: nullable fields | P1 | ✅ Done (adc943d, 161460e, 1c7f12d) |
| PR-10.6 | Map query: add status filter | P2 | ☐ Not started |

**Hotfixes completed this session (not PRs — committed directly):**

| Commit | Fix |
|--------|-----|
| `161460e` | `property_type` nullable in schema + prompt guidance for non-RE posts |
| `1c7f12d` | `price_unit` nullable in schema; `listingsCreated` counter never incremented |
| `b6e65e9` | `@PrePersist`/`@PreUpdate` on `Listing` entity — `createdAt` NPE in ingestion |

---

## PR Details

### PR-10.1 — Page serialization VIA_DTO migration (P1) ✅ DONE

Used `spring.data.web.pageable.serialization-mode: via_dto` (property approach, not annotation) to avoid breaking the `max-page-size: 100` customizer. Updated all backend test assertions and frontend hooks.

**Key learning**: `@EnableSpringDataWebSupport` annotation on `@SpringBootApplication` bypasses the `PageableHandlerMethodArgumentResolverCustomizer`. Always use the property instead in Spring Boot 3.3+.

---

### PR-10.2 — E2E: auth-gated test scenarios (Q3/Q7) (P1)

**Problem**: E2E tests Q3 (login) and Q7 (duplicate booking) require `SMOKE_USER_EMAIL` / `SMOKE_USER_PASSWORD` / `SMOKE_LISTING_ID` env vars.

**Tasks**:
1. Verify Q3 and Q7 pass locally with credentials set
2. Add `.env.e2e` example with required vars documented
3. Add CI env var documentation to `DEPLOYMENT.md`

**Acceptance criteria**:
- All 7 smoke tests pass with credentials set
- `listing-lifecycle.spec.ts` dealer flow tests pass

---

### PR-10.3 — Listing browser + detail navigation (P1)

**Problem discovered 2026-03-01**: There is no way to navigate to a listing detail page except by clicking a map pin. Ingested listings (`SCRAPED` status) only appear as map pins if they have lat/lng coordinates. If geocoding failed, the listing is invisible in the UI entirely.

**What already exists** (do not rebuild):
- `/listing/:id` route with `ListingDetail.tsx` — full user-facing detail page (image gallery, booking request, contact). Queries Supabase directly, works for any authenticated user.
- Map pin → preview card → "View Details" button → `/listing/:id` — works when listing has lat/lng
- `GET /api/listings/{id}` backend endpoint — requires dealer/admin role, for management UI only

**What is missing**: A browsable index of all listings so admins/users can navigate to detail pages without needing a map pin.

#### Sub-task A: Admin listing browser page (new page)

**File**: `src/pages/admin/AdminListings.tsx` (new)
**Route**: `/admin/listings` (add to App.tsx under admin routes)

Show a paginated table/card list of all listings regardless of status. Columns: thumbnail, property type, locality, price, status badge, created date, "View" link → `/listing/:id`.

Filter controls: status (ALL / SCRAPED / LIVE / PENDING_REVIEW / REJECTED / DRAFT), sort by created_at desc.

Data source: Supabase `property_listings` table directly (same pattern as `ListingDetail.tsx`). Admin role required (already enforced by `ProtectedRoute` + admin nav).

**Files (max 3)**:
1. `src/pages/admin/AdminListings.tsx` — new listing browser page
2. `src/App.tsx` — add `/admin/listings` route
3. `src/components/layout/AppLayout.tsx` — add "All Listings" link to admin nav

#### Sub-task B: Wire "View" from DealerListings cards

**File**: `src/pages/dealer/DealerListings.tsx`

Add a "View" icon button on each listing card (next to Edit) that navigates to `/listing/:id`. This lets dealers preview what their listing looks like publicly.

**Files (1)**:
1. `src/pages/dealer/DealerListings.tsx` — add View button

**Pipeline**: MEDIUM — frontend → code-reviewer

**Acceptance criteria**:
- Admin can reach `/admin/listings`, see all listings with status filter, click any to open `/listing/:id`
- Dealer listings cards have a "View" button → `/listing/:id`
- No new backend endpoints needed (Supabase direct query)

---

### PR-10.4 — Global teardown: delete test listing (P2)

**Problem**: `global-teardown.ts` does not delete the test listing, accumulating test data.

**Tasks**:
1. Read `e2e/.test-listing-id` in teardown
2. Authenticate as dealer
3. Call `DELETE /api/listings/{listingId}` (only works for DRAFT listings)
4. If listing is LIVE/approved, log and skip (admin cancel not in scope)

**Acceptance criteria**:
- After test run, test listing is deleted from DB
- `.test-listing-id` file is removed

---

### PR-10.5 — Fix Groq tool call schema: nullable fields (P1) ✅ DONE

All tool schema fields now use `anyOf: [type, null]` instead of `"nullable": true`. Includes `property_type` (null allowed when non-RE), `price_unit` (null allowed, service defaults to "INR"), and all previously optional fields.

**Follow-up hotfixes in same session**:
- Prompt instruction added: "When is_real_estate is false, set property_type to 'other'"
- `price_unit` nullable added (was missed in initial fix)
- `listingsCreated` counter bug fixed (was always 0)
- `Listing.@PrePersist` added to fix createdAt NPE in ingestion path

---

### PR-10.6 — Map query: add status filter (P2)

**Problem discovered 2026-03-01**: `findInBoundingBox` in `ListingRepository.java` has no `status` filter. This means `DRAFT` and `REJECTED` listings appear on the public map if they happen to have coordinates.

**Fix**: Add `AND status IN ('SCRAPED', 'LIVE')` to the `findInBoundingBox` native query.

**Files (2)**:
1. `backend/src/main/java/com/example/realestate/listing/ListingRepository.java` — add status filter to both the SELECT and COUNT queries in `findInBoundingBox`
2. `backend/src/test/java/com/example/realestate/dashboard/DashboardControllerTest.java` — update test stubs if needed

**Acceptance criteria**:
- DRAFT and REJECTED listings do not appear on the public map
- SCRAPED and LIVE listings still appear (if they have lat/lng)
- All backend tests pass

---

## Deferred from Sprint 9

| Item | Reason deferred | Target |
|------|----------------|--------|
| `PageImpl` VIA_DTO migration | Breaking change to 12+ tests and 2+ frontend hooks | PR-10.1 ✅ |
| Dealer listing detail page | Scope expanded to full listing browser | PR-10.3 |
| E2E teardown cleanup | Low priority; test data is minimal | PR-10.4 |

---

## Technical Discoveries (2026-03-01 session)

### Listing status flow
```
Ingestion pipeline → SCRAPED (default on Listing entity)
Dealer creates → DRAFT
Dealer submits → PENDING_REVIEW
Admin approves → LIVE
Admin rejects → REJECTED
```

### Map query gaps
- `findInBoundingBox` has no status filter → DRAFT/REJECTED listings can appear on map
- `findInBoundingBox` filters `latitude IS NOT NULL AND longitude IS NOT NULL` → SCRAPED listings without geocoding are invisible everywhere
- No listing browser UI → listings without lat/lng are completely unreachable

### Groq schema compatibility
All tool schema fields must use `anyOf: [type, null]` — not `"nullable": true` (OpenAI extension). This applies to ALL fields the model might return null for, including required-by-design fields like `property_type` and `price_unit` when `is_real_estate` is false.

### @PrePersist pattern for timestamps
`Listing` entity had no `@PrePersist` hook. Ingestion code path (`createFrom`) never set `createdAt`/`updatedAt`, causing Hibernate not-null validation to throw before the DB DEFAULT could fire. Standard fix: `@PrePersist` sets timestamps if null; `@PreUpdate` always refreshes `updatedAt`.

### Page serialization (Spring Boot 3.3+)
Use `spring.data.web.pageable.serialization-mode: via_dto` property — NOT `@EnableSpringDataWebSupport` annotation — to preserve `max-page-size` auto-configuration.

---

## Technical Notes

### Page VIA_DTO JSON shape

Before (PageImpl):
```json
{ "content": [...], "totalElements": 42, "totalPages": 3, "size": 20, "number": 0 }
```

After (VIA_DTO — PagedModel):
```json
{ "content": [...], "page": { "size": 20, "number": 0, "totalElements": 42, "totalPages": 3 } }
```

Frontend hooks: `data.totalElements` → `data.page.totalElements` etc.
Backend tests: `$.totalElements` → `$.page.totalElements` etc.
