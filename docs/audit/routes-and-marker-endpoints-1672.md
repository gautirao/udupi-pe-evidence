# Audit of Legacy Routes and Overlapping Marker Endpoints (Issue #1672)

This document records the full audit, cleanup decisions, and deletions made as part of Issue #1672.

---

## 1. Frontend Route Audit: Canonical vs. Legacy

| Legacy Frontend Route | Canonical Target Route | Purpose / Context | Final Status |
| :--- | :--- | :--- | :--- |
| `/insights` | `/trends` | General market trends and analysis. | **DELETED** — redirect route removed; internal callers (`PaywallCard`, `SavedAreas`) updated to link to `/trends` directly. |
| `/area-overview` | `/trends` | Redirected with city inference and preserved query parameters. | **DELETED** — `AreaOverviewRedirect` helper deleted; `LandingPage` link updated to `/trends?city=…`. |
| `/dealer/*` | `/broker/*` | Dealer role renamed to Broker. | **DELETED** — all six `/dealer/*` redirect routes removed; `isBrokerRoute()` guard in `routeAccess.ts` updated. |

### What Was Deleted

**`src/App.tsx`**
- Removed redirect helper components: `BrokerListingEditRedirect`, `BrokerListingsRedirect`, `BrokerBookingsRedirect`, `AreaOverviewRedirect`, `inferCityFromAreaKey`.
- Removed legacy `<Route>` declarations: `/insights`, `/area-overview`, `/dealer/setup`, `/dealer/dashboard`, `/dealer/listings/new`, `/dealer/listings/:id/edit`, `/dealer/listings`, `/dealer/bookings`.
- Removed no-longer-needed imports: `useParams`, `useSearchParams`, `DISTRICT_TO_CITY_SLUG`.

**Internal callers updated to canonical paths**
- `src/components/insights/PaywallCard.tsx`: `navigate('/insights')` → `navigate('/trends')`.
- `src/components/insights/__tests__/PaywallCard.test.tsx`: test description + expect updated to `/trends`.
- `src/pages/SavedAreas.tsx`: two `<Link to="/insights">` → `<Link to="/trends">`.
- `src/pages/LandingPage.tsx`: `to="/area-overview?city=…"` → `to="/trends?city=…"`.

**`src/lib/routeAccess.ts`**
- Removed `/area-overview` from the public route whitelist.
- `isBrokerRoute()`: removed `|| clean.startsWith('/dealer')`.
- Removed `/dealer/listings/new` and `/dealer/listings/:id/edit` checks from `admin` and `user` role blocks.

**`src/lib/routeAccess.test.ts`**
- Removed test expectations for `/dealer/dashboard` (test 6), `/admin/feeds` with `dealer` role (test 7), and `getDefaultLandingForRole('dealer')` (test 10).

---

## 2. Backend Marker Endpoint Audit: Canonical vs. Legacy

| Endpoint URI | Controller / Service | Auth Required | Status |
| :--- | :--- | :--- | :--- |
| `GET /api/discover/markers` | `DiscoverMarkersController` | **Yes** (JWT) | **Canonical** — retained, unchanged. |
| `GET /api/listings/markers` | `ListingMarkersController` | **No** (Public) | **DELETED** — zero active callers confirmed. |

### What Was Deleted

- `backend/src/main/java/com/example/realestate/discover/ListingMarkersController.java`
- `backend/src/main/java/com/example/realestate/discover/ListingMarkersResponse.java`
- `backend/src/main/java/com/example/realestate/discover/ListingMarker.java`
- `backend/src/main/java/com/example/realestate/discover/ListingMarkersService.java`
- `backend/src/test/java/com/example/realestate/discover/ListingMarkersControllerTest.java`
- Security `permitAll` matcher for `GET /api/listings/markers` removed from `JwtConfig.java`.

### Frontend hook/mapper cleanup

Anonymous map markers were computed **client-side** from `/api/discover/cities/{city}/listings` — `useDiscoverMarkers` called `/api/listings/markers` but had zero live callers in production code (only the deleted endpoint consumed it).

- `src/hooks/useDiscoverMarkers.ts` — **DELETED**
- `src/hooks/__tests__/useDiscoverMarkers.test.ts` — **DELETED**
- `src/lib/discoverMappers.ts`: removed `DiscoverMarker` import and `markerToPropertyListing()` mapper.
- `src/pages/__tests__/Index.invalidCity.test.tsx`: removed `vi.mock('@/hooks/useDiscoverMarkers', …)`.

---

## 3. Verification

| Check | Result |
| :--- | :--- |
| TypeScript `tsc --noEmit` (src/) | ✅ No new errors introduced |
| Vitest: `routeAccess.test.ts` (10 tests) | ✅ All pass |
| Vitest: `PaywallCard.test.tsx` (8 tests) | ✅ All pass |
| Backend `mvn test` (287 tests) | ✅ All pass |

**Pre-existing TS errors** (unrelated to this PR):
- `SchoolBrowsePanel.error-states.test.tsx` — partial `UseQueryResult` mock shapes.
- `AreaSelectedPanel.tsx` — `'villa'` not in `PropertyType` union.
- `Index.invalidCity.test.tsx` line 45 — spread type on `useAuth` mock.

---

## 4. Scope Boundaries (Respected)

- ✅ Marker response payloads unchanged.
- ✅ Frontend map behaviour unchanged (`MapDiscovery.tsx` untouched).
- ✅ No route semantics or deep links changed for canonical routes.
- ✅ No OpenSearch changes.
- ✅ No DB/migration/seed changes.
- ✅ No UI redesign.
- ✅ Not combined with MapDiscovery refactor.
