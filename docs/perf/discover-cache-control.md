# Discover Endpoint Cache-Control Policy

## Per-endpoint Classification and TTL

| Endpoint | Controller | Auth | Classification | Cache-Control Header |
|---|---|---|---|---|
| `GET /api/discover/cities/{city}/listings` | `CityAreaListingsController` | Public | PUBLIC_CACHEABLE | `max-age=60, public` |
| `GET /api/discover/cities/{city}/school-radius-listings` | `PublicSchoolRadiusListingsController` | Public | PUBLIC_CACHEABLE | `max-age=60, public` |
| `GET /api/discover/area-groups` | `AreaGroupsController` | Public | PUBLIC_CACHEABLE | `max-age=120, public` |
| `GET /api/discover/areas` | `AreaSummaryController` | Public | PUBLIC_CACHEABLE | `max-age=120, public` |
| `GET /api/listings/markers` | `ListingMarkersController` | Public | NO_STORE | `no-store` |
| `GET /api/discover/listings` | `DiscoverListingsController` | Authenticated (JWT) | NO_STORE | `no-store` |
| `GET /api/discover/markers` | `DiscoverMarkersController` | Authenticated (JWT) | NO_STORE | `no-store` |

All headers are set explicitly on the success (200 OK) response only. Error responses (4xx/5xx) do not inherit the public cache header.

The exact Spring-rendered header string (observed via `andDo(print())` in tests): `max-age=120, public`.

---

## Freshness and Invalidation Window

`Cache-Control: max-age=N, public` instructs both browser caches and any shared/CDN caches to serve stale content for up to N seconds without revalidating with the origin.

**Maximum staleness windows:**

- Listing data (`/cities/{city}/listings`, `/school-radius-listings`): **60 seconds**.  
  A LIVE listing approved at T=0 may be absent from cached area panels until T=60.  
  A listing transitioned LIVE→ARCHIVED at T=0 may remain visible in cached responses until T=60.

- Area metadata (`/area-groups`, `/areas`): **120 seconds**.  
  Area statistics (listing counts, median prices, school counts) can lag by up to 120 seconds in caches.

These windows are intentional: the Discover page is designed for browse/discovery, not transactional accuracy. A 60–120 second staleness window is acceptable for the current user flow.

---

## TTL Safety Rationale for Listing Approval/Status Visibility

The 60-second TTL on listing endpoints was chosen with the following considerations:

1. **Listing approval is not instant.** The typical admin review cycle is measured in minutes, not seconds. A 60-second cache window does not meaningfully extend the time between approval and visibility.

2. **LIVE→ARCHIVED transitions.** A listing that is archived mid-cache window (e.g., a dealer archives a listing) can remain visible to users with a cached response for up to 60 seconds. This is accepted as a product trade-off (browse experience > immediate consistency) and is documented here for operational awareness.

3. **SCRAPED listings on `/api/listings/markers`.** This endpoint is classified `no-store` (see below). The SCRAPED status filter is intentionally excluded from the cache policy decision pending provenance confirmation (see Follow-up section).

4. **Price and filter data.** Listing price changes and filter results are subject to the same 60-second staleness. For a property search product this is operationally safe.

5. **Area metadata (120 seconds).** Area groups and area summaries change infrequently (seeded data + nightly aggregations). 120 seconds is conservative relative to the underlying data change rate.

---

## Why the 3 No-Store Endpoints Are Excluded from Public Caching

### `GET /api/discover/listings` and `GET /api/discover/markers`

Both are **authenticated** endpoints requiring a valid JWT. Caching authenticated responses in a shared cache (CDN, proxy) would risk leaking user-specific or session-specific data across users. `no-store` is the correct directive — it prevents any cache from storing the response.

Spring Security adds its own `Cache-Control: no-cache, no-store, max-age=0, must-revalidate` on secured responses; the explicit `no-store` set by the controller is consistent with that posture and ensures the header is present even in test contexts where the Spring Security auto-configuration is excluded.

### `GET /api/listings/markers`

This endpoint is **public** (no JWT required) and serves skinny map markers (`id`, `lat`, `lon`, `pricePaise`) for LIVE and SCRAPED listings.

It is classified `no-store` rather than `PUBLIC_CACHEABLE` because the SCRAPED listing status filter in `ListingMarkersService` has **unconfirmed provenance** (see Follow-up). Until the product decision on SCRAPED visibility is confirmed and documented, caching SCRAPED data in shared caches (browser, CDN) is deferred. This is a safety-first classification: `no-store` can be relaxed to `public, max-age=N` in a follow-up PR once SCRAPED provenance is resolved.

---

## Follow-up

**Issue title:** `feat(discover): confirm SCRAPED listing cache policy for /api/listings/markers`

**Issue body:**

```
### Context

`GET /api/listings/markers` serves public map markers for LIVE and SCRAPED listings.
It is currently classified `no-store` (PR #1248) because the product decision on
SCRAPED listing visibility was unconfirmed at the time of the cache-control implementation.

### Question to resolve

1. Is SCRAPED a permanent public status, or a transient pre-moderation state?
2. Are SCRAPED listings safe to serve from shared caches (browser/CDN) without
   a freshness window concern? (A cached SCRAPED marker could remain visible for
   up to max-age seconds after the listing is removed/rejected.)
3. If safe: what max-age is appropriate? (Suggested: 30–60s, matching the
   listing endpoint TTL.)

### Acceptance criteria

- [ ] Product decision on SCRAPED visibility documented in `.claude/product-truth/`
      or `docs/perf/discover-cache-control.md`.
- [ ] `ListingMarkersController` updated from `CacheControl.noStore()` to
      `CacheControl.maxAge(N, TimeUnit.SECONDS).cachePublic()` (if approved).
- [ ] `ListingMarkersControllerTest` updated with public + max-age assertions.

### Note

Do NOT change the SCRAPED filter in `ListingMarkersService` as part of this issue.
The cache-control header change is purely a response-header concern.
```
