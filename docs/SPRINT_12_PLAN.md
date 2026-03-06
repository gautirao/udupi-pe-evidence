# Sprint 12 Plan — Data Infrastructure + Discovery + Admin Tooling

**Sprint**: Sprint 12
**Date**: 2026-03-06 (draft)
**Status**: PLANNING
**Focus**: Populate real market data, improve listing discovery, tighten admin data quality.

---

## 0. Sprint 11 Retrospective

### Completed (all 10 PRs shipped)
| PR | Description |
|----|-------------|
| PR-11.1 | Apartment filter bug fix |
| PR-11.2 | Map zoom to locality bounds |
| PR-11.3 | Locality quick-chips overlay |
| PR-11.4 | Listing detail UX polish (price/unit, sidebar reorder, tooltip, back button) |
| PR-11.5 | Supabase RPC `get_listing_market_context` + hook |
| PR-11.6 | AreaMarketWidget on listing detail |
| PR-11.7 | Good deal badge + popup removal |
| PR-11.8 | Similar listings section |
| PR-11.9 | Insights property-type selector + sqft trend |
| PR-11.10 | Smoke test Sections M + N (70 steps) |

### Technical Debt Carried Forward
- `createPopupContent` function remains in `PropertyMap.tsx` (lines 72–269) — dead code since popup was removed in PR-11.7.

### Explicitly Deferred from Sprint 11 → Sprint 12
1. `area_price_weekly` pg_cron population job
2. Text search on listing title/description
3. Price alerts / new listing notifications for saved areas
4. Cross-area comparison in Insights
5. Locality normalizer for admin
6. Bedroom (BHK) filter on map

---

## 1. Sprint 12 Goals

> Real market data flows into the Insights charts. Users can discover listings by bedroom count and text search. Admins have a locality normalization tool to keep area_key data clean.

---

## 2. Non-Goals

- No mobile app / PWA
- No payments or subscription changes
- No AI re-classification jobs
- No schema changes beyond what's needed for pg_cron output

---

## 3. PR List

| PR | Name | Priority | Dependencies | Risk |
|----|------|----------|--------------|------|
| PR-12.1 | Cleanup: remove dead code from PropertyMap | P0 | none | LOW |
| PR-12.2 | Supabase pg_cron job — populate area_price_weekly | P1 | none | MEDIUM |
| PR-12.3 | Admin: locality normalizer tool | P1 | none | LOW |
| PR-12.4 | Map: bedroom (BHK) filter | P1 | none | LOW |
| PR-12.5 | Listing text search | P1 | none | LOW |
| PR-12.6 | Insights: cross-area comparison chart | P2 | PR-12.2 (data) | MEDIUM |
| PR-12.7 | E2E: automated Playwright tests for Sprint 11 features | P2 | none | LOW |
| PR-12.8 | Price alerts: new listing notifications for saved areas | P2 | none | HIGH |

---

## 4. PR Details

---

### PR-12.1 — Cleanup: remove dead code from PropertyMap

**Goal**: Delete `createPopupContent` and its imports from `PropertyMap.tsx`. The popup was removed in PR-11.7 but the ~200-line function was left in place.

**Scope**:
- Delete `createPopupContent` function (lines 72–269)
- Remove unused import: `escapeHtml` (used only by `createPopupContent`)
- Remove unused import: `formatPrice` if now unused (verify first)

**Files**:
- `src/components/map/PropertyMap.tsx`

**Acceptance criteria**:
- No TypeScript/ESLint errors after deletion
- Map still renders pins and bottom card correctly
- Bundle size reduces (verify via `vite build --report`)

**Test plan**:
- Run existing frontend tests (`npm test`) — no regressions
- Browser: open map, click pin, verify bottom card still appears

**Risk**:
- LOW — deleting unused code only
- Verify `escapeHtml` is not imported anywhere else before removing its import

---

### PR-12.2 — Supabase pg_cron job: populate area_price_weekly

**Goal**: Schedule a weekly Postgres job that aggregates land listing prices into `area_price_weekly`, enabling the Insights land trend chart to show real data.

**Scope**:
- SQL function `refresh_area_price_weekly()` that upserts into `area_price_weekly` per area_key per week
- pg_cron schedule: `SELECT cron.schedule('weekly-price-refresh', '0 2 * * 1', 'SELECT refresh_area_price_weekly()')` (Mondays 2am)
- Reference SQL file only — run in Supabase dashboard
- Backfill query included (run once to populate historical data)

**Files**:
- `backend/src/main/resources/db/supabase-rpcs/refresh_area_price_weekly.sql` (new)

**Acceptance criteria**:
- `SELECT * FROM area_price_weekly LIMIT 5` returns rows after backfill
- Insights page land trend chart shows data for at least one area
- pg_cron job is visible in `SELECT * FROM cron.job`

**Test plan**:
- Run `SELECT refresh_area_price_weekly()` manually and verify row count
- Open Insights → select area → select "Land" → verify trend chart renders
- Verify existing backend tests still pass (no schema change)

**Risk**:
- MEDIUM — requires `pg_cron` extension enabled in Supabase (check via `SELECT * FROM pg_extension WHERE extname = 'pg_cron'`)
- `area_price_weekly` table schema (V2 migration) must match the aggregation output columns exactly

---

### PR-12.3 — Admin: locality normalizer tool

**Goal**: Give admins a UI to view listings with non-canonical `locality` values and bulk-update them to the correct canonical locality string, improving RPC result quality.

**Scope**:
- New admin page `/admin/localities` listing distinct locality values + counts
- Inline edit: click a locality string → edit in place → save → updates all matching listings
- Filter: show only localities not matching a known canonical list (to surface typos/variants)
- Backend: new `PATCH /api/admin/listings/normalize-locality` endpoint (bulk update by old → new value)

**Files**:
- `src/pages/admin/Localities.tsx` (new)
- `src/App.tsx` (add route)
- `src/components/layout/AppLayout.tsx` (add nav link under Admin)
- `backend/src/main/java/com/example/realestate/listing/ListingController.java` (add endpoint)
- `backend/src/main/java/com/example/realestate/listing/ListingService.java` (add bulk update method)

> **Note**: 5 files — split at implementation time if needed.

**Acceptance criteria**:
- Admin can see a table of all distinct locality values with listing counts
- Renaming a locality value updates all matching listings in one action
- Change is reflected immediately in the table after save
- Non-admin users cannot access `/admin/localities`

**Test plan**:
- Backend unit test: `normalizeLocality("Udupi ", "Udupi")` updates all whitespace-variant rows
- Browser: log in as admin → navigate to Localities → rename a test locality → verify count moves
- Browser: log in as dealer → attempt direct nav to `/admin/localities` → redirected to home

**Risk**:
- LOW — admin-only, bulk update is reversible
- Bulk update is a `WHERE locality = old_value` update — no data loss possible, only value replacement

---

### PR-12.4 — Map: bedroom (BHK) filter

**Goal**: Add a bedroom count filter (1BHK, 2BHK, 3BHK, 4BHK+) to MapFilters. Only shown when property type filter includes apartment or house.

**Scope**:
- Add `bedrooms?: number[]` to `PropertyFilters` interface
- Add bedroom filter UI to `MapFilters.tsx` (checkbox group, conditional on type filter)
- Apply `bedrooms` filter in `usePropertyListings` query
- Update `focusBounds` memo in `Index.tsx` to filter by bedrooms too (already handled via listings data)

**Files**:
- `src/hooks/usePropertyListings.ts`
- `src/components/map/MapFilters.tsx`

**Acceptance criteria**:
- Bedroom filter only appears when apartment or house is in the active type filter
- Selecting "2BHK" shows only 2-bedroom apartment/house pins
- Bedroom filter clears when property type filter changes to land/commercial/other

**Test plan**:
- Select "Apartment" type + "2BHK" bedroom filter → verify only 2BHK apartments shown
- Switch type filter to "Land" → bedroom filter disappears
- Unit: test `usePropertyListings` query includes `bedrooms` filter correctly

**Risk**:
- LOW — additive filter, backend query already supports `bedrooms` column
- Conditional render logic for bedroom filter must not break existing filter state

---

### PR-12.5 — Listing text search

**Goal**: Add a search input on the map page that filters listings by title/description keywords. Client-side filtering over already-loaded listings (no new API endpoint).

**Scope**:
- Add `searchQuery?: string` to `PropertyFilters`
- Add search input (`Input` with `Search` icon) above the filter panel or in the map header
- Client-side filter in `usePropertyListings` or `Index.tsx`: match against `title + description + locality` (case-insensitive)
- Debounce 300ms

**Files**:
- `src/hooks/usePropertyListings.ts` (add `searchQuery` to filters type)
- `src/components/map/MapFilters.tsx` (add search input)
- `src/pages/Index.tsx` (pass searchQuery, apply client-side filter)

**Acceptance criteria**:
- Typing "river" narrows map pins to listings whose title/description/locality contains "river"
- Search is case-insensitive
- Clearing search restores all pins with no network request

**Test plan**:
- Unit: test client-side filter function with various query/case combinations
- Browser: type a known keyword from a real listing → verify only matching pins shown
- Browser: clear search box → all pins return

**Risk**:
- LOW — purely client-side over already-loaded data
- Performance: with large listing sets, consider `useMemo` for filtered results (already the pattern)

---

### PR-12.6 — Insights: cross-area comparison chart

**Goal**: Add a multi-area bar chart to the Insights page showing median price per cent for all areas side-by-side. Depends on `area_price_weekly` being populated (PR-12.2).

**Scope**:
- The existing "Average Price by Area" bar chart already renders `avgPriceChartData` from `/api/insights/avg-price-by-area`
- That endpoint reads from `area_stats_latest` (or `area_price_weekly`) — verify which and ensure it's populated by PR-12.2
- If already working after PR-12.2: this PR improves the chart — adds a "Compare areas" toggle that overlays trend lines for multiple selected areas on a single LineChart
- Area selector: multi-select up to 3 areas → renders each as a separate colored Line

**Files**:
- `src/pages/Insights.tsx`
- `src/hooks/useInsights.ts` (extend `usePriceTrend` to accept array or add `useMultiAreaTrend`)

**Acceptance criteria**:
- User can select up to 3 areas and see their trend lines on one chart
- Each area has a distinct color; legend shows area names
- Empty state when `area_price_weekly` has no data: "Select areas to compare trends — data populates weekly"

**Test plan**:
- Select 2 areas → verify 2 lines rendered with distinct colors
- Select a 4th area → UI prevents it or replaces the oldest selection
- Unit: `useMultiAreaTrend` fetches once per selected area, correct cache keys

**Risk**:
- MEDIUM — depends on PR-12.2 data being available; chart logic is straightforward
- `usePriceTrend` uses Spring Boot backend endpoint, not Supabase RPC — verify endpoint handles the populated data correctly

---

### PR-12.7 — E2E: automated Playwright tests for Sprint 11 features

**Goal**: Add Playwright tests covering locality chip navigation (Section M) and listing market context (Section N) from the updated smoke test.

**Scope**:
- `e2e/map-locality.spec.ts`: chip appears → click → map viewport changes (assert `leaflet-container` transform or bounds), chip becomes active
- `e2e/listing-market.spec.ts`: open listing detail → sidebar contains "Area Market" heading (or "Not enough data") → no crash → SimilarListings section renders or is absent

**Files**:
- `e2e/map-locality.spec.ts` (new)
- `e2e/listing-market.spec.ts` (new)

**Acceptance criteria**:
- Both spec files pass in CI against a seeded test environment
- Tests are non-flaky (locality chips appear only after listings load — use `waitFor`)
- E2E suite total runtime increases by < 30 seconds

**Test plan**:
- Run `npx playwright test e2e/map-locality.spec.ts --headed` locally
- Run full E2E suite → no regression in existing tests
- CI: confirm green on next push

**Risk**:
- LOW — tests are read-only, no state mutation
- Leaflet map viewport assertions can be tricky — prefer asserting chip DOM state over map coordinate checks

---

### PR-12.8 — Price alerts: new listing notifications for saved areas

**Goal**: When a new listing is approved (status → LIVE) in a user's saved area, send an in-app notification. Extend to email notification if email config is available.

**Scope**:
- Backend: hook into `ListingService.approve()` → after status change, query `saved_areas` for users watching that listing's `area_key` → insert into `notifications` table
- Notification payload: `{type: 'NEW_LISTING', listing_id, area_key, message: "New {type} in {locality}"}`
- Frontend: notifications bell already implemented — no UI changes needed
- Email: if `spring.mail.*` is configured, send email via `JavaMailSender`; if not, skip silently

**Files**:
- `backend/.../listing/ListingService.java`
- `backend/.../notification/NotificationService.java`
- `backend/.../listing/ListingServiceTest.java`

**Acceptance criteria**:
- Approving a listing in area "Udupi" creates notifications for all users with "Udupi" in saved_areas
- Notification appears in-app bell for the user
- If no users have the area saved: no error, no notification created

**Test plan**:
- Unit: mock `savedAreaRepository.findByAreaKey(areaKey)` → verify `notificationService.create()` called once per user
- Integration: approve a test listing → check `notifications` table for expected row
- Smoke: Section F browser test (existing) already covers notification display

**Risk**:
- HIGH — touches the listing approval critical path; a bug here could block approvals
- Must be wrapped in try/catch: notification failure must NOT rollback the approval transaction

---

## 5. Build Order (Recommended)

```
PR-12.1 ── Cleanup (no deps, ship fast)
PR-12.2 ── pg_cron (infra, enables Insights data)
PR-12.3 ── Admin locality normalizer (data quality, improves RPC accuracy)
PR-12.4 ── BHK filter (quick win, high user value)
PR-12.5 ── Text search (discovery, independent)
PR-12.6 ── Cross-area chart (after PR-12.2 data confirmed)
PR-12.7 ── E2E tests (after P1 features stable)
PR-12.8 ── Price alerts (last — highest risk, most backend work)
```

---

## 6. Manual Test Checkpoints

### Checkpoint 1 — After PR-12.2 (pg_cron + data backfill)

Run before proceeding to PR-12.3.

| # | Check | Expected |
|---|-------|----------|
| CP1-1 | Supabase SQL: `SELECT COUNT(*) FROM area_price_weekly` | > 0 rows |
| CP1-2 | Insights → select any area → select "Land" | Line chart renders with visible data points |
| CP1-3 | Insights → select area with no land listings | Empty state shows explanatory copy (not blank) |
| CP1-4 | `SELECT * FROM cron.job` in Supabase | Row for `weekly-price-refresh` exists |
| CP1-5 | Open any land listing detail → Area Market widget | Widget shows chart data or "Not enough data" — no error state |

---

### Checkpoint 2 — After PR-12.4 + PR-12.5 (filters complete)

Run before proceeding to PR-12.6.

| # | Check | Expected |
|---|-------|----------|
| CP2-1 | Map → select "Apartment" type filter | Bedroom filter (1BHK/2BHK/3BHK/4BHK+) appears |
| CP2-2 | Select "2BHK" bedroom filter | Only 2-bedroom apartment pins visible |
| CP2-3 | Switch type filter to "Land" | Bedroom filter disappears; map shows land pins |
| CP2-4 | Type a keyword in search box | Pins narrow to matching listings |
| CP2-5 | Clear search box | All pins return; no network request fired |
| CP2-6 | Select locality chip + BHK filter simultaneously | Both filters applied; map zooms to locality with only 2BHK pins |

---

### Checkpoint 3 — After PR-12.6 (cross-area comparison)

Run before proceeding to PR-12.7.

| # | Check | Expected |
|---|-------|----------|
| CP3-1 | Insights → select 2 areas | Two trend lines on same chart, distinct colors |
| CP3-2 | Insights → select 3 areas | Three lines; selecting 4th is prevented or replaces oldest |
| CP3-3 | Insights → select "Apartment" type + 1 area | Sqft trend line from RPC renders |
| CP3-4 | Insights paywall (expired user) | Charts still hidden; no new data leaks past paywall |
| CP3-5 | DevTools Network: switch areas | One fetch per area; no duplicate requests |

---

### Checkpoint 4 — After PR-12.7 + PR-12.8 (full sprint)

Final go/no-go before sprint close.

| # | Check | Expected |
|---|-------|----------|
| CP4-1 | `npx playwright test` | All E2E tests green |
| CP4-2 | Backend tests: `./mvnw test` | All 500+ tests pass |
| CP4-3 | Approve a test listing (has saved area watchers) | In-app notification appears for watcher user |
| CP4-4 | Approve a listing with no saved-area watchers | No error; approval succeeds; no orphan notifications |
| CP4-5 | Section M + N manual smoke (from BROWSER_SMOKE_TEST.md) | All steps PASS |

---

## 7. Deferred to Sprint 13

| Item | Reason |
|------|--------|
| Email notifications (JavaMailSender) | Needs SMTP config decision |
| Mobile-responsive filter panel redesign | Separate UX sprint |
| Listing expiry / archival | Ops tooling sprint |
| Cross-area SQL analytics (p_cron aggregates by bedroom) | After data volume grows |
