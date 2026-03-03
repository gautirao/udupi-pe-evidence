# Project Memory

## User Preferences

- **Sequential execution only**: Never run multiple tool calls or agents in parallel. Always wait for each step to complete before starting the next. This applies to agents, bash commands, file reads, etc.

## Project

- Spring Boot backend + React/Vite frontend
- Supabase for auth, PostgreSQL for persistence
- Flyway migrations (currently at V16)
- Test suite: 83 frontend tests (vitest), 472 backend tests (JUnit)

## Sprint 6 State — COMPLETE

- PR-S6-1 ✅ `abf5fec` — atomic booking state machine
- PR-S6-2 ✅ `63f1d33` — PaymentController atomicity + tests
- PR-S6-3 ✅ `131befc` — frontend paywall tests (83 frontend tests)
- PR-S6-4 ✅ `108ffe9` — booking pagination + V17 composite indexes (476 backend tests)
- PR-S6-5 ✅ closed — App.tsx already lazy-loads; PaywallCard SPA fix deferred (auth state is React context, not TanStack Query)
- Agent optimisation ✅ `d33c605` — security-reviewer/code-reviewer → haiku, terse table output, risk-tier pipeline in PR_RULES

Flyway is now at V17. Backend tests: 476. Frontend tests: 83.

## Sprint 7 Backlog (carry-over)

- Global @ControllerAdvice (PropertyReferenceException → 400, catch-all)
- Rate limiting on payment + booking endpoints
- PaywallCard SPA fix: expose refreshAuth() from AuthContext
- Frontend: update booking list consumers to handle Page<> (read .content)
- Boundary test: insights_access_until == NOW()

## Sprint 9–10 State — COMPLETE

- Sprint 9: 10/10 PRs complete. All committed.
- Sprint 10: All 6 PRs complete (PR-10.1 Page VIA_DTO, PR-10.2 E2E docs, PR-10.3 admin listings + status filter, PR-10.4 E2E teardown, PR-10.5 Groq schema, PR-10.6 map status filter).
- Backend tests: 500 (7 Docker ITs skipped). Frontend tests: 96.
- Flyway at V17. Backend on port 8085, frontend on port 8080 (Vite).

## Sprint 11 State — SPEC COMPLETE, implementation starts 2026-03-06

**Theme**: UX Polish + Map Navigation + Market Context
**Spec docs**: `docs/SPRINT_11_PLAN.md` + `docs/SPRINT_11_UX_REVIEW.md`
**Flyway**: stays at V17 (no schema changes in Sprint 11)
**No backend changes** except one Supabase SQL RPC function (not Flyway-managed).

### Key UX bugs found in review:
- **UX-01 BUG**: `apartment` missing from `MapFilters.tsx` propertyTypes array (lines 22-27). Fix: add `{ value: 'apartment', label: 'Apartment' }` between house and commercial.
- **UX-04**: "Request Viewing" CTA is last in ListingDetail sidebar — should be first.

### Sprint 11 PR build order (highest ROI first):
| PR | Description | Files | Priority |
|----|-------------|-------|----------|
| PR-11.1 | Bug: add apartment to MapFilters | `MapFilters.tsx` | P0 — do first |
| PR-11.2 | Map: zoom to locality bounds (fitBounds from loaded coords) | `Index.tsx`, `PropertyMap.tsx` | P1 |
| PR-11.3 | Map: locality quick-chips overlay (top-6 by count, client-side) | `Index.tsx` | P1 |
| PR-11.4 | Listing detail UX polish (price/unit, CTA order, confidence tooltip, back button) | `ListingDetail.tsx` | P1 |
| PR-11.5 | Supabase RPC `get_listing_market_context` + `useListingMarketContext` hook | SQL file + `hooks/useListingMarketContext.ts` | P1 |
| PR-11.6 | `AreaMarketWidget` component on listing detail sidebar | `components/listing/AreaMarketWidget.tsx` + `ListingDetail.tsx` | P1 |
| PR-11.7 | Good deal badge utility + remove map popup | `lib/priceAnalysis.ts` + `PropertyMap.tsx` + `Index.tsx` | P2 |
| PR-11.8 | Similar listings section | `hooks/useSimilarListings.ts` + `components/listing/SimilarListings.tsx` + `ListingDetail.tsx` | P2 |
| PR-11.9 | Insights: property-type selector + sqft trends (reuses PR-11.5 RPC) | `Insights.tsx` + `useInsights.ts` | P2 |
| PR-11.10 | Smoke test doc update | `BROWSER_SMOKE_TEST.md` | P2 |

### Key architectural decisions locked:
- Map zoom: compute `L.latLngBounds` from already-loaded `listingsWithCoords` filtered by locality — zero new API calls.
- Good deal badge on map: `useMemo(computeAreaMedians, [listings])` client-side — zero new API calls.
- Area Market widget: Supabase `rpc('get_listing_market_context', {...})` — no Spring Boot endpoint, no schema change.
- Land price: use pre-computed `price_per_cent_paise` (V3 migration column). Apartment: `price / built_area` where `built_area_unit = 'sqft'`.
- Widget degrades gracefully when `< 5` listing-months of data (shows "Not enough data" empty state, never crashes).
- "Good deal" badge only shows positive signals (≤85% of median = "Good value", ≤70% = "Great deal"). Never shows "overpriced".
- Supabase RPC SQL lives in `backend/src/main/resources/db/supabase-rpcs/get_listing_market_context.sql` (reference copy, not Flyway).

### Parallel batches when implementing:
- **Batch 1** (all independent): PR-11.1, PR-11.2, PR-11.4, PR-11.5, PR-11.7, PR-11.8
- **Batch 2**: PR-11.3 (after 11.2), PR-11.6 (after 11.5)
- **Batch 3**: PR-11.9 (after 11.5), PR-11.10 (after all P1s)

## E2E Test Patterns (Playwright)

- `ProtectedRoute` shows `<p>Loading...</p>` while Supabase auth resolves. Tests must `waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 })` after login before asserting page content.
- ALL routes (including `/`) are `ProtectedRoute`. Navigating while logged out goes to `/auth`. There are no public pages with AppLayout nav.
- `loggedOutNavigation` has "Home". "Map" nav link only appears for admins. Regular users/dealers see "Home".
- `BookingService` requires listing status = LIVE. DRAFT listings return 400 on booking attempt.
- `GET /api/listings/{id}` endpoint added to `ListingController` — requires auth (dealer sees own listings only, admin sees all).
- Global setup fixture (`e2e/.test-listing-id`): line 1 = UUID, line 2 = "LIVE" or "DRAFT".
- ESM: use `fileURLToPath(import.meta.url)` for `__dirname` in all e2e files (project has `"type": "module"`).

## Key Patterns

- `window.location.reload` in vitest/jsdom: use `Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { ...window.location, reload: reloadMock } })` in `beforeEach`. `vi.spyOn` does NOT work because jsdom defines location as non-configurable.
- Atomic booking state: `@Modifying(clearAutomatically=true) @Query` JPQL UPDATE with `WHERE id=? AND status=? AND callerId=?`
- Agent team workflow: qa-fast → implementer → qa → code-reviewer → security-reviewer (all sequential now)
