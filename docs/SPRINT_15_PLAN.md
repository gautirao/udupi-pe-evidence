# Sprint 15 — Plan (PR-by-PR)

## Theme
**Nearby & Attractions — MVP B (auto-suggest + approval)**

Dealers/admins fetch auto-suggested POIs (via Overpass/OSM), approve which appear publicly, add manual entries, and optionally pin highlights. End users see only dealer-approved POIs on listing detail. Feature is fully resilient: POI provider failure never breaks listing pages.

---

## Research Notes

- **Provider chosen: Overpass API** (free, no auth, OSM data) — best fit for amenity-tag filtering in India.
- Kumi Systems (`overpass.kumi.systems`) used as automatic fallback instance — no rate limit, same OSM data.
- Public Overpass **fair-use guideline**: ~10,000 queries/day and <1 GB/day per IP — soft guideline, not a hard cap; server returns HTTP 429 when slots exhausted. Per-listing DB cache keeps actual usage negligible. ([commons policy](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html))
- **Query radius:** 1 km for urban/walkable; 2–3 km for semi-urban Udupi outskirts.
- **Cache TTL:** 14 days per listing (OSM updates slowly in coastal Karnataka); cache key = `listing_id`.
- **Backend timeout:** `[timeout:10]` in Overpass QL; HTTP client timeout 12 s; fallback to Kumi on first timeout.
- **Fallback:** return HTTP 200 with empty POI array; frontend collapses POI section gracefully — no error page.
- Key OSM tags: `amenity=place_of_worship+religion=*`, `amenity=hospital`, `amenity=clinic`, `amenity=school`, `amenity=university`, `railway=station`, `amenity=bus_station`, `aeroway=aerodrome`, `shop=supermarket`, `amenity=marketplace`, `tourism=guest_house`.
- Hotels: `tourism=guest_house` / `amenity=hotel` / `tourism=hostel` (tourism tags, not amenity=*).
- Distance: Haversine straight-line only — no routing API needed for MVP.
- Nominatim: **not suitable** — 1 req/s max, geocoding/reverse-geocoding only; policy explicitly forbids systematic POI area queries. ([Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/))
- Google Places API: India pricing ~70% cheaper post-2024 but pay-per-call; skip for MVP.
- OSM rural coverage in coastal Karnataka is variable; dealer manual-add covers gaps.
- Cap: top 3 per category, max 15 total markers (configurable in application.yml).

---

## Flyway Version Note
Sprint 14 uses V21–V23. Sprint 15 starts at **V24**.

---

## Sprint 15 PR List

| PR | Name | Priority | Depends on | Risk |
|----|------|----------|------------|------|
| PR-15.1 | DB: `listing_pois` table (V24) | P0 | — | LOW |
| PR-15.2 | Backend: `OverpassService` — fetch, Haversine, cache | P0 | PR-15.1 | MED |
| PR-15.3 | Backend: `ListingPoiService` + public read endpoint | P0 | PR-15.2 | LOW |
| PR-15.4 | Backend: dealer/admin POI management endpoints | P0 | PR-15.3 | MED |
| PR-15.5 | Frontend: dealer POI management panel | P1 | PR-15.4 | MED |
| PR-15.6 | Frontend: public POI display on listing detail | P1 | PR-15.4 | LOW |

---

## PR Details

---

### PR-15.1 — DB: `listing_pois` table (V24) (P0)
**Goal:** Create the persistent store for both Overpass-sourced suggestions and dealer-added manual POIs.

**Scope**
- V24 migration: create `public.listing_pois` table
- Columns: `id uuid PK`, `listing_id uuid NOT NULL`, `name varchar(255)`, `category varchar(64)`, `latitude double precision`, `longitude double precision`, `distance_meters int`, `source varchar(16)` (`'overpass'`/`'manual'`), `osm_id varchar(32)` (nullable), `approved boolean NOT NULL DEFAULT false`, `pinned boolean NOT NULL DEFAULT false`, `position int`, `approved_by uuid`, `created_at timestamptz DEFAULT now()`
- Index: `(listing_id, approved)` — primary read path
- Index: `(listing_id, category)` — category-capped queries
- `source` CHECK constraint: `IN ('overpass', 'manual')`

**API/DB changes:** new table `listing_pois`
**Risk:** LOW — additive migration

**Acceptance Criteria**
- Migration runs cleanly in Testcontainers
- Unique constraint prevents duplicate OSM node per listing: `(listing_id, osm_id)` where `osm_id IS NOT NULL`
- Indexes created and visible in `pg_indexes`

**Test Plan**
- Flyway migration runs in CI
- Insert overpass row + manual row; select by `listing_id` and `approved`
- Attempt duplicate OSM id for same listing → constraint violation

---

### PR-15.2 — Backend: `OverpassService` — fetch, Haversine, cache (P0)
**Goal:** Encapsulate all Overpass API interaction: build query, call API (with Kumi fallback), parse JSON, compute Haversine distance, persist raw suggestions into `listing_pois`.

**Scope**
- `OverpassService.java` — builds Overpass QL query for all 7 categories; POSTs to `https://overpass-api.de/api/interpreter` with 10 s timeout; on failure retries `https://overpass.kumi.systems/api/interpreter`; parses `elements[]` JSON; computes Haversine distance; upserts into `listing_pois` with `approved=false` and `source='overpass'`
- `ListingPoi.java` — JPA entity for `listing_pois`
- `ListingPoiRepository.java` — JPA repository with `findByListingIdAndApproved`, `findByListingIdAndCategory`, `existsByListingIdAndOsmId`
- Category enum: `WORSHIP`, `HOSPITAL`, `SCHOOL`, `HOTEL`, `TRANSPORT`, `AIRPORT`, `GROCERY`
- Caps applied at fetch time: top 3 per category by distance, max 15 total per listing
- `distance_meters` is computed via Haversine at fetch time and stored as a snapshot; cache invalidated if listing coordinates change
- Cache guard: skip Overpass call if `listing_pois` has overpass rows for listing younger than 14 days

**API/DB changes:** writes to `listing_pois`; reads Overpass external API
**Risk:** MED — external dependency, JSON parsing, distance math

**Acceptance Criteria**
- Given a lat/lng, `OverpassService.fetchAndCache(listingId, lat, lng)` inserts POI rows with correct category + distance
- Timeout on main Overpass → retries Kumi; Kumi also fails → returns empty list (no exception thrown)
- Re-calling within 14 days does NOT hit Overpass again (cache guard)

**Test Plan**
- Unit test Haversine: known coordinates → expected distance ±5 m
- Unit test `OverpassService` with mocked `RestTemplate`: verify query built, rows inserted, cache guard respected
- Failure test: both endpoints timeout → returns empty list; no exception propagates

---

### PR-15.3 — Backend: `ListingPoiService` + public read endpoint (P0)
**Goal:** Service layer for POI reads + public endpoint returning only approved POIs for a listing.

**Scope**
- `ListingPoiService.java` — `getApproved(listingId)`: returns approved POIs sorted by pinned DESC, position ASC, distance ASC; caps at 15 total
- `ListingPoiController.java` — `GET /api/listings/{id}/pois` (public, no auth required); returns `List<PoiResponse>`
- `PoiResponse` record: `id`, `name`, `category`, `distanceMeters`, `latitude`, `longitude`, `pinned`
- Endpoint returns `[]` (never 404/500) if listing has no approved POIs or Overpass hasn't run yet
- No auth on read path — listing detail is public

**API/DB changes:** `GET /api/listings/{id}/pois` (new public endpoint)
**Risk:** LOW — read-only, graceful empty response

**Acceptance Criteria**
- Returns only `approved=true` rows; unapproved suggestions invisible to public
- Empty list (not error) when no approved POIs exist
- Response ordered: pinned first, then by distance

**Test Plan**
- `@WebMvcTest`: mix of approved/unapproved rows → only approved returned
- Order test: pinned row appears before closer unpinned row
- Non-existent listing → 200 with `[]`

---

### PR-15.4 — Backend: dealer/admin POI management endpoints (P0)
**Goal:** CRUD + approval endpoints for dealers/admins to manage POI suggestions for their listings.

**Scope**
- Extend `ListingPoiController` + `ListingPoiService`:
  - `GET /api/listings/{id}/pois/suggestions` — (auth: listing owner or admin) trigger `OverpassService.fetchAndCache` if cache miss; return all rows including unapproved
  - `PATCH /api/listings/{id}/pois/{poiId}/approve` — set `approved=true`, record `approved_by`
  - `PATCH /api/listings/{id}/pois/{poiId}/pin` — toggle `pinned`; auto-assign `position`
  - `POST /api/listings/{id}/pois/manual` — body: `{name, category, latitude, longitude}`; inserts with `source='manual'`, `approved=true` (manual = implicitly approved)
  - `DELETE /api/listings/{id}/pois/{poiId}` — hard delete (dealer removes unwanted suggestion)
- Auth guard: caller must be listing owner (dealer) or admin role

**API/DB changes:** 5 new endpoints under `/api/listings/{id}/pois`
**Risk:** MED — auth guard, mutable state, position management

**Acceptance Criteria**
- Non-owner/non-admin attempting approve/delete → 403
- Manual POI inserted with `approved=true` immediately; appears in public endpoint
- Deleting an approved POI removes it from public endpoint

**Test Plan**
- `@WebMvcTest`: dealer approves own listing's POI → 200; dealer approves other listing → 403
- Manual add → immediately returned by `GET /api/listings/{id}/pois`
- Delete approved POI → public endpoint no longer returns it

---

### PR-15.5 — Frontend: dealer POI management panel (P1)
**Goal:** Dealer can view Overpass suggestions, approve/reject, add manual POIs, and pin highlights — all from the listing edit page.

**Scope**
- New `PoiManager.tsx` component: tabbed panel (Suggestions | Approved | Add Manual)
- Suggestions tab: list of unapproved POIs with category badge, distance, Approve / Remove buttons
- Approved tab: approved POIs with Pin toggle, Remove button; drag-to-reorder optional (skip for MVP — use position field)
- Add Manual tab: form (name, category dropdown, lat/lng inputs or map click)
- Wire to PR-15.4 endpoints via `api.get/patch/post/delete`
- Integrate into dealer `EditListing.tsx` page as collapsible section

**API/DB changes:** consumes PR-15.4 endpoints
**Risk:** MED — moderate UI complexity; map click for lat/lng is optional

**Acceptance Criteria**
- Dealer can approve a suggestion → moves to Approved tab
- Dealer can add manual POI → appears immediately in Approved tab
- Dealer can pin → pinned badge shows on card

**Test Plan**
- Component test: mock API; approve button triggers PATCH; optimistic update shown
- Manual add form: submit → POST called with correct body
- Empty suggestions state shown when Overpass returns nothing

---

### PR-15.6 — Frontend: public POI display on listing detail (P1)
**Goal:** Show approved nearby POIs to end users on the listing detail page, grouped by category with distance.

**Scope**
- New `NearbyPois.tsx` component: grouped by category (icon + label), list of POI cards with name + distance
- Category icons: place-of-worship 🛕, hospital 🏥, school 🏫, hotel 🏨, transport 🚌, airport ✈, grocery 🛒 (Lucide icons or emoji fallback)
- Cap display: 3 per category, "Show more" expander optional (skip for MVP)
- OSM attribution: display "© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors" visibly near the POI section (required by ODbL license)
- Hidden entirely when list is empty (no "no POIs" message — avoids confusion)
- Integrate into `ListingDetail.tsx` below map/description section
- Uses `GET /api/listings/{id}/pois` (PR-15.3)

**API/DB changes:** consumes PR-15.3 public endpoint
**Risk:** LOW — read-only display, graceful empty state

**Acceptance Criteria**
- POIs grouped by category with correct icon
- Empty → section not rendered (no empty card)
- API failure → section silently hidden; rest of listing detail unaffected

**Test Plan**
- Component test: mock 5 approved POIs across 3 categories → correct grouping rendered
- Empty response → component renders nothing
- API error → component catches error boundary; listing detail still renders

---

## Manual Test Checkpoints

### CP0 — After PR-15.3 (Overpass fetch + public endpoint working)
- [ ] `GET /api/listings/{id}/pois/suggestions` returns Overpass results for a real listing lat/lng
- [ ] Results contain correct category labels (not raw OSM tags)
- [ ] Distance values are plausible (temple 200 m away → not 2 km)
- [ ] Overpass cache guard: calling suggestions twice within 14 days does NOT hit Overpass a second time
- [ ] With approved=none, public `GET /api/listings/{id}/pois` returns `[]`
- [ ] Overpass timeout → endpoint returns `[]` with HTTP 200 (not 500)

### CP1 — After PR-15.5 (dealer workflow end-to-end)
- [ ] Dealer opens listing edit → POI manager panel visible
- [ ] "Fetch suggestions" loads Overpass results grouped by category
- [ ] Approve a suggestion → moves to Approved tab immediately
- [ ] Add manual POI (name, category, lat/lng) → appears in Approved tab
- [ ] Pin a POI → pinned badge shown; appears first in public endpoint response
- [ ] Remove an approved POI → gone from Approved tab and from public endpoint
- [ ] Non-owner dealer cannot approve another dealer's listing POIs (403)

### CP2 — Release candidate smoke
- [ ] Listing detail shows approved POIs grouped by category with distance
- [ ] Pinned POI appears first in its category group
- [ ] No POIs approved → POI section not rendered on listing detail
- [ ] Overpass outage simulation → listing detail loads normally; POI section hidden
- [ ] Manual POI with custom lat/lng renders correctly on section
- [ ] All backend tests green in CI
- [ ] No console errors on listing detail or dealer edit page

---

## Changes Applied (self-correction)

- **Rate limit wording**: "safe limit" → "fair-use guideline (soft, not a hard cap)"; added HTTP 429 behavior and citation to [commons policy](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- **Overpass endpoints**: Made full URLs explicit — `https://overpass-api.de/api/interpreter` (primary) and `https://overpass.kumi.systems/api/interpreter` (Kumi fallback); the plan previously omitted `/api/interpreter` path from fallback URL
- **"append-only" contradiction**: PR-15.1 described table as "append-only" but PR-15.4 defines a hard `DELETE` endpoint; corrected to "persistent store"
- **Stored distance staleness**: Added note that `distance_meters` is a Haversine snapshot at fetch time and cache should be invalidated if listing coordinates change
- **OSM attribution (legally required)**: Added ODbL attribution requirement — "© OpenStreetMap contributors" must appear visibly near the POI section in PR-15.6; citation to [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright)
- **Nominatim policy**: Added explicit citation and confirmed policy forbids systematic POI area queries (not just rate-limit concern)

---

## Out of Scope
- Routing distance (walking/driving time) — straight-line Haversine only for MVP
- Google Places API integration — deferred; OSM sufficient for MVP
- POI ratings or reviews
- Map markers for POIs on listing detail map (icons on Leaflet) — display-list only for MVP
- Bulk approve all suggestions in one click
- Drag-to-reorder pinned POIs in dealer UI
- Scheduled background POI refresh (cache TTL enforced on-demand only)
- OSM data quality backfill / community contribution workflow
