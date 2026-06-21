# Tech Debt Log

Track ADVISORY-DEFER items from code reviews. Reviewed at end of each sprint.
Items resolved or invalidated should be moved to the **Resolved** section with a date.

**Linked cleanup ticket:** [RE-165](https://linear.app/re-trends/issue/RE-165)
**Full audit date:** 2026-03-20

---

## Backend

| ID | Source | Description | Risk | Added |
|----|--------|-------------|------|-------|
| B-1 | RE-131/132/133 | AdminListingController audit JSON built via manual string concatenation with naive `replace("\"", "\\\"")` escaping. Replace with `ObjectMapper.writeValueAsString(Map.of(...))`. | Low | 2026-03-20 |
| B-2 | RE-130/128/131/132/133 | Dual clock reads: `Instant.now()` + `OffsetDateTime.now()` captured separately in workflow methods. Derive one from the other: `now.atOffset(ZoneOffset.UTC)`. | Very low | 2026-03-20 |
| B-3 | RE-132 | `approveScrapedListing` skips duplicate detection and event publishing. Product decision needed: should SCRAPED→LIVE trigger these? | Medium | 2026-03-20 |
| B-4 | RE-132 | `validateForSubmission` shared between `submitListing` and `approveScrapedListing`. Image min (3) may not make sense for scraped listings. | Low | 2026-03-20 |
| B-5 | RE-133 | Duplicated "to-LIVE" timestamp logic across 3 methods (~10 lines each). Extract `applyLiveTransitionTimestamps()` helper. | Low | 2026-03-20 |
| B-6 | RE-128 | `existsAdminActionAfter` JPQL query — needs perf review at scale (10k+ history rows). | Low | 2026-03-20 |
| B-7 | Audit | **`@Transactional` on controller methods** — `BrokerSetupController`, `DealerSetupController`, `PaymentController`, `ListingImageController`. Violates Spring layering. Extract transactional logic to `@Service` beans. | Medium | 2026-03-20 |
| B-8 | Audit | **`ListingController` injects `ListingRepository` directly** — repository-in-controller pattern. `archive`, `reopen`, `reopenAsDraft` re-read entity after workflow call. Have workflow methods return the saved entity instead. | Medium | 2026-03-20 |
| B-9 | Audit | **Duplicate broker-setup logic** — `BrokerSetupController` still uses raw JDBC while `DealerSetupController` uses `ProfileService`/`UserRoleService`. Also: phone validation regex duplicated in both. Extract shared `PhoneValidator`. | Low | 2026-03-20 |
| B-10 | Audit | **Deprecated `DealerSetupController`** — no removal plan, no Linear ticket, no sunset date. `/api/dealer/setup` still responds. | Low | 2026-03-20 |
| B-11 | Audit | **Dead `findOpportunities` and deprecated `findOpportunitiesByAreaKeys(List, double, int, int)`** — `ListingRepository` has ~40 lines of unused query methods. Verify no callers and delete. | Low | 2026-03-20 |
| B-12 | Audit | **`Listing.price` deprecated but still written/read everywhere** — `setPrice()` called in `updateListing`, `getPrice()` read in `ListingResponseMapper`. No enforcement that `price` and `pricePaise` stay in sync. Add `@PrePersist`/`@PreUpdate` guard. | Medium | 2026-03-20 |
| B-13 | Audit | **`getListingStats` switch silently drops unknown statuses** — default branch logs at `debug`. New statuses (ARCHIVED, SCRAPED) fall through. | Low | 2026-03-20 |
| B-14 | Audit | **NPE in `ListingController.getById`** — `listing.getCreatedBy().equals(caller.userId())` throws NPE when `createdBy` is null (SCRAPED listings). Returns 500 instead of 403/404. Fix: flip to `caller.userId().equals(listing.getCreatedBy())`. | **High** | 2026-03-20 |
| B-15 | Audit | **`ListingStatusException` not mapped in `GlobalExceptionHandler`** — falls through to generic 500 `INTERNAL_ERROR`. Should be 409 or 422. | Medium | 2026-03-20 |
| B-16 | Audit | **`returnForEdits` publishes no notification** — broker not notified when admin returns listing. TODO has no ticket number (`RE-???`). | Low | 2026-03-20 |
| B-17 | Audit | **Nominatim viewbox and User-Agent hard-coded** in `GeocodingService`. Move to `application.properties` for geo-expansion. | Low | 2026-03-20 |
| B-18 | Audit | **`MIN_IMAGES = 3` not configurable** in `ListingWorkflowService`. Move to `@Value("${listing.submission.min-images}")`. | Low | 2026-03-20 |
| B-19 | Audit | **Ownership-check pattern duplicated** across `ListingPoiController` (5x), `ListingImageController`, `ListingController.getById`. Extract to shared guard or reuse `ListingOwnershipGuard`. | Low | 2026-03-20 |
| B-20 | Audit | **`reraNumber` accepted without validation** — `TODO(RE-99)` still open. `RERA_PATTERN` exists in `ListingResponse` but not enforced on write. Add `@Pattern` to `UpdateRequest.reraNumber`. | Medium | 2026-03-20 |
| ~~B-21~~ | ~~Audit~~ | ~~**N+1 in `ListingResponseMapper.build`**~~ — resolved in RE-170. | ~~**High**~~ | ~~2026-03-20~~ |
| B-22 | Audit | **No test for `getById` NPE path** on SCRAPED listing (null `createdBy`, non-admin caller). | Medium | 2026-03-20 |
| B-23 | Audit | **No test for `getSuggestions` Overpass side-effect path** — no test when coords are null or Overpass fails. | Medium | 2026-03-20 |
| B-24 | Audit | **4 guard stubs in `ListingTransitionPolicy`** with `RE-???` placeholders — `guardCompleteness`, `guardFastRestore`, `guardSubmissionCount`, `guardReasonCodeRequired`. File Linear tickets. | Low | 2026-03-20 |
| B-28 | RE-142 | **`trustTier` typed as String (primitive obsession)** — four-value domain (A/B/C/D) should use a `TrustTier` enum. Fix before RE-148 writes to the field; eliminates magic-string comparisons in TrustTierCalculator. | Low | 2026-03-21 |
| B-25 | RE-164 | **`ListingImageRegistrar` returns `ResponseEntity` directly** — leaky abstraction: service bean owns HTTP response construction. Should throw typed domain exceptions; controller/GlobalExceptionHandler maps to ResponseEntity. | Low | 2026-03-20 |
| B-26 | RE-164 | **`ListingImageRegistrar` calls `ListingImageController.toResponse()`** — inverted dependency (service → controller). Move `toResponse` / `ImageResponse` to a mapper class or to the registrar itself. | Low | 2026-03-20 |
| B-27 | RE-164 | **`MAX_IMAGES` and `RETRY_AFTER_SECONDS` constants duplicated** between `ListingImageController` and `ListingImageRegistrar`. Extract to a shared `ListingImageConstants` class. | Low | 2026-03-20 |
| B-29 | #886 | **`CityAreaListingsService` makes two DB round-trips per request** — pre-flight `SELECT COUNT(*)` for city existence, then main query. The main query already joins `cities` so a zero-row result could signal unknown city. At scale, eliminate or cache the pre-flight count query. | Low | 2026-04-27 |

## Frontend

| ID | Source | Description | Risk | Added |
|----|--------|-------------|------|-------|
| F-1 | Audit | **Broken notification navigation** — `NotificationBell.tsx:50` navigates to `/listings/${id}` but route is `/listing/${id}` (no `s`). 2-line fix. | **High** | 2026-03-20 |
| ~~F-2~~ | ~~Audit~~ | ~~**`priceReduced` filter is a visible no-op**~~ — resolved in RE-169. | ~~**High**~~ | ~~2026-03-20~~ |
| F-3 | Audit | **Shared query key collision** — `useListingById` and `useGetListing` both use `['listing', id]` but fetch different endpoints with different return types. Can serve stale wrong-shaped data. Differentiate keys. | Medium | 2026-03-20 |
| ~~F-4~~ | ~~Audit~~ | ~~**Leaflet `divIcon` injects unescaped `propertyType`**~~ — resolved in RE-174. | ~~Medium~~ | ~~2026-03-20~~ |
| F-5 | Audit | **`ARCHIVED` status missing from all frontend status maps** — `BrokerListings`, `BrokerDashboard` have no entry. Badge renders raw string. Add label + styling. | Medium | 2026-03-20 |
| F-6 | Audit | **Form constants duplicated** — `PROPERTY_TYPES`, `COMMERCIAL_TYPES`, `FURNISHING_OPTIONS`, `intOrUndef`, `floatOrUndef` identical in `NewListing.tsx` and `EditListing.tsx` (~200 lines each). Extract to shared module. | Medium | 2026-03-20 |
| F-7 | Audit | **`STATUS_LABELS` and `statusBadgeClassName` duplicated** in `BrokerListings` and `BrokerDashboard`. Extract to `listing-status.ts`. | Low | 2026-03-20 |
| F-8 | Audit | **Raw fetch in `PendingListings`** — manual `getAuthHeaders()` + `fetch()` instead of centralized `api.post()` from `src/lib/api.ts`. | Medium | 2026-03-20 |
| F-9 | Audit | **`SpringPage<T>` defined twice** — `useInsights.ts` and `useNotifications.ts` both define it. `PageResponse<T>` already exists in `api.ts`. Consolidate. | Low | 2026-03-20 |
| F-10 | Audit | **`usePropertyListings` missing `staleTime`** — refetches on every focus/remount, hammering Supabase. Add `staleTime: 60_000`. | Medium | 2026-03-20 |
| F-11 | Audit | **`ImageUploader` ignores `fetchError`** — destructures it but never renders it. No error/retry state when image loading fails. | Medium | 2026-03-20 |
| F-12 | Audit | **`AreaMarketWidget` receives double-cast** — `listing as unknown as PropertyListing`. Define narrow prop interface instead. | Medium | 2026-03-20 |
| F-13 | Audit | **Auth guards in `NewListing`/`EditListing` bypass `isBroker` flag** — manual role string comparison instead of using context flags. | Low | 2026-03-20 |
| F-14 | Audit | **`QueryClient` uses default 3 retries** — 4xx errors (auth, 404) silently retry. Scope retries to 5xx only. | Low | 2026-03-20 |
| F-15 | Audit | **Dead code: `BackendTest.tsx`** — no route, no imports. Delete. | Low | 2026-03-20 |
| F-16 | Audit | **Dead code: `NavLink.tsx`** — unused wrapper component. Delete. | Low | 2026-03-20 |
| F-17 | Audit | **Dead code: `use-mobile.tsx` + `sidebar.tsx`** — shadcn scaffolding, never imported by product code. Delete or keep as scaffolding. | Low | 2026-03-20 |
| F-18 | Audit | **Dead code: `useDealerListings.ts`** — re-export stub, no callers. Delete. | Low | 2026-03-20 |
| F-19 | Audit | **Dead code: `pages/dealer/*.tsx` stubs** — single-line re-exports, router handles redirects via `<Navigate>`. Delete. | Low | 2026-03-20 |
| F-20 | Audit | **`fetchInsightsAccess` does `select('*')` on profiles** — fetches entire row for one field. Change to `select('insights_access_until')`. | Low | 2026-03-20 |
| F-21 | Audit | **Two parallel data-fetching paths** — Supabase direct (map, similar) vs Spring Boot API (detail, search, broker). `PropertyListing` (snake_case) vs `ListingResponse` (camelCase). Document as ADR or plan consolidation. | Medium | 2026-03-20 |
| F-22 | RE-164 | **`registerImage()` retry logic in `global-setup.ts` has no unit tests** — retry-on-503 path, 409-as-success, and full-exhaustion→false paths untested. Add `global-setup.test.ts` with mocked `fetch`. | Low | 2026-03-20 |
| F-23 | RE-164 | **`delays[]` length guard in `registerImage()`** — `maxRetries` can be bumped via default param without updating `delays[]`; fallback silently uses 2000ms. Add guard or derive delays from maxRetries. | Low | 2026-03-20 |
| F-24 | #1483 | **area-first Level-2 "up to all groups" control a11y inconsistency** — `aria-label="Back to all groups"` but visible text is the group name (`AreaGroupsLandingPanel.tsx`). Screen-reader name and visible affordance differ. Make intent consistent (product/a11y decision). | Low | 2026-06-13 |
| F-25 | #1483 | **No DRP routing test for `area-groups-landing` without `onSelectAreaKey`** — the no-area-key branch of the if/else (`DiscoverRightPanel.tsx`) is unexercised; a regression to a silent no-op would be invisible. Add a test that Level-1 group cards still render without crashing. | Low | 2026-06-13 |
| F-26 | #1485 | **`SchoolGroupAreasPanel` group→area join is O(n·k) array scan** — `discoverAreas.filter(a => group.area_keys.includes(a.areaKey))`. Fine at current scale; convert to `Set` (`const keys = new Set(group.area_keys)`) for O(n+k) and fix the reversed complexity comment. | Low | 2026-06-13 |
| F-27 | #1485 | **`SchoolBrowsePanel` silently falls back to flat area list when `onSelectGroup` is undefined** — `areaGroups.length > 0 && onSelectGroup` guard; a misconfigured caller (optional prop omitted) degrades with no signal. Make `onSelectGroup` required or add a dev-mode warning. | Low | 2026-06-13 |
| F-28 | #1485 | **No DRP routing test for `school-group-areas` loading-skeleton path** — `isLoadingAreaGroupsForSchool=true` + unresolved `groupId` renders a fallback skeleton that is untested. Add a routing test asserting the skeleton fallback. | Low | 2026-06-13 |

## Database

| ID | Source | Description | Risk | Added |
|----|--------|-------------|------|-------|
| DB-2 | RE-145 | **`listing_complaint` INSERT allows complaints against DRAFT/ARCHIVED/REJECTED listings** — RLS INSERT policy only blocks owner self-complaint; no restriction on target listing status. If product intent is complaints only against LIVE listings, add `AND (pl.status = 'LIVE' OR (pl.status = 'SCRAPED' AND pl.is_valid = true))` to the EXISTS guard in V49 or a follow-up migration. | Low | 2026-03-22 |
| DB-1 | RE-143 | **`listing_verification_dimension.updated_at` has no auto-update trigger** — maintained by app layer only. If a backend path forgets to set it, column retains creation timestamp. Add a BEFORE UPDATE trigger (like `update_property_listings_updated_at` in V0) in a follow-up migration. | Low | 2026-03-21 |

## Infrastructure

| ID | Source | Description | Risk | Added |
|----|--------|-------------|------|-------|
| I-1 | #1250 | **`test_gen_perf_listings.py` coordinate bounds too loose** — Test 2 asserts lat∈[11,18], lon∈[73,79] but clusters span only [12.82–13.67°N, 74.64–77.64°E]. A misconfigured cluster center (wrong sign, transposed lat/lon) would not be caught. Tighten to: `assert 12.7 <= lat <= 13.8` and `assert 74.5 <= lon <= 77.7`. | Low | 2026-05-29 |
| I-2 | #1250 | **`gen_perf_listings.py:72` comment references V61 migration** for property_type CHECK constraint. Verify V61 is still the correct migration (Flyway ceiling is V80; V65 is absent). Update comment if needed. | Very low | 2026-05-29 |

---

## Priority Summary

**P0 — Fix ASAP (bugs visible to users):**
- B-14: NPE on `getById` for SCRAPED listings (500 error)
- B-15: `ListingStatusException` → 500 instead of 4xx
- F-1: Broken notification navigation URL
- ~~F-2: `priceReduced` filter is a visible no-op~~ (resolved RE-169)

**P1 — Fix soon (correctness / perf / security):**
- ~~B-21: N+1 queries in `ListingResponseMapper` (21 queries per page load)~~ (resolved RE-170)
- B-12: `price` / `pricePaise` dual-write inconsistency
- B-20: `reraNumber` not validated on write
- F-3: Query key collision between public and broker listing fetches
- ~~F-4: Leaflet HTML injection (escapeHtml exists but unused)~~ (resolved RE-174)
- F-5: ARCHIVED status missing from frontend maps

**P2 — Clean up (code quality / duplication):**
- B-7, B-8, B-9, B-19: Layer violations and duplication
- F-6, F-7, F-8: Code duplication across components
- F-10, F-11: Missing staleTime and error states

**P3 — Housekeeping (dead code, config):**
- B-10, B-11, B-13, B-16, B-17, B-18, B-24: Dead code, stubs, configs
- F-9, F-12, F-13, F-14, F-15–F-21: Dead code, type safety, minor inconsistencies

---

## Resolved

| ID | Resolution | Date |
|----|-----------|------|
| B-14 | Fixed in PR #498 — null-guard createdBy in getById, POI, and image controllers (RE-166) | 2026-03-20 |
| B-15 | Fixed in PR #495 — ListingStatusException mapped to 409/422 in GlobalExceptionHandler (RE-167) | 2026-03-20 |
| F-2 | Fixed in RE-169 — removed "Price Reduced" button from MapFilters; added @deprecated on priceReduced field | 2026-03-21 |
| F-4 | Fixed in RE-174 — applied escapeHtml() to propertyType[0].toUpperCase() in PropertyMap divIcon template | 2026-03-21 |
| B-21 | Fixed in RE-170 — batch-load images via findByListingIdInOrderByListingIdAscPositionAsc in ListingResponseMapper | 2026-03-21 |

---

## Issue #1523 — Broker Dashboard v2 (ADVISORY-DEFER from code-reviewer, 2026-06-21)

### Backend
| ID | Source | Description | Risk | Added |
|----|--------|-------------|------|-------|
| B-1523-1 | #1523 code-review | `BrokerDashboardService` jsonpath thresholds (60/80/75/50) are `static final int` passed to the native query via `\|\| :param \|\|` concatenation. Safe today (no user reachability), but a future refactor to user-sourced values would be a jsonpath-injection risk. Consider parameterised jsonpath vars (`jsonb_path_exists(col, '$...? (@.score < $t)', jsonb_build_object('t', :t))`) and/or `@Min(0)@Max(100)` on the params. | Low | 2026-06-21 |
| B-1523-2 | #1523 code-review | `BrokerDashboardService` injected directly into `ListingController` (already ~445 lines; mild fat-controller). When a dedicated `/broker/*` controller emerges, relocate `/mine/quality-summary` there (frontend URL change needed). | Low | 2026-06-21 |
| B-1523-3 | #1523 code-review | `BrokerQualitySummaryControllerTest` asserts null via `jsonPath(...).isEmpty()`; prefer `.value(IsNull.nullValue())` for intent clarity on next touch. | Very low | 2026-06-21 |
| B-1523-4 | #1523 security | New `GET /api/listings/mine/quality-summary` runs a multi-aggregate jsonb scan with no per-user rate limit (consistent with current listing CRUD policy). Verify whether a per-user limit is warranted given the heavier jsonb workload. | Low | 2026-06-21 |
| B-1523-5 | #1523 security | `user`/buyer role is in `ALLOWED_ROLES`, so a buyer hitting the endpoint gets a harmless all-zeros response. Confirm this is intentional (vs blocking like `POST /api/listings`). | Low | 2026-06-21 |

### Frontend
| ID | Source | Description | Risk | Added |
|----|--------|-------------|------|-------|
| F-1523-1 | #1523 code-review | Document the backend invariant `count === 0 when state === 'PENDING'` in `BrokerDashboard.tsx` near the PENDING+count guards, so the double-guard rationale is clear to maintainers. | Very low | 2026-06-21 |
| F-1523-2 | #1523 code-review | `useBrokerQualitySummary` `staleTime: 60_000` with no cache invalidation on quality-recompute. When #1531 event capture lands, invalidate `QUALITY_SUMMARY_KEY` on recompute-complete. | Low | 2026-06-21 |
| F-1523-3 | #1523 scope | When #1538 (`/broker/listing-quality`) ships: replace the disabled `<span>` CTA with a real `<Link>`; flip the AC7 test assertion. When #1531/M30 ship: unwire the hard-coded engagement `UNAVAILABLE` / demandGap `LIMITED_DATA` copy to data-driven state. | Low | 2026-06-21 |
| F-1523-4 | #1523 e2e | E2E smoke `e2e/broker-dashboard-v2.spec.ts` (BD1-BD4) is authored but was NOT_RUN in this worktree (no `BROKER_EMAIL`/`BROKER_PASSWORD` + no live dev stack). Run with creds against a live stack to obtain real E2E evidence. | Med | 2026-06-21 |
