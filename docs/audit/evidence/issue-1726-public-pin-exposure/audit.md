# Issue #1726 — Public/buyer pin lat/lng exposure audit

Investigation-first audit. No code changed in this pass. All findings verified directly
against `gautirao/udupi-property-explorer` (current indexed source), not inferred.

## Endpoints checked

| Endpoint | Auth state (filter-chain, `JwtConfig.securityFilterChain`) | Response field(s) | Value type | Evidence |
|---|---|---|---|---|
| `GET /api/listings/markers` (`ListingMarkersController`) | **`permitAll()`** — fully anonymous, no token needed (`JwtConfig.java` comment `// Public listing markers endpoint — no auth required (C-1)`) | `lat`, `lon` (`ListingMarker`) | **EXACT_PIN** — raw `pl.latitude`/`pl.longitude` from `property_listings`, no rounding/jitter | `ListingMarkersController.java:20-70`, `ListingMarkersService.java:11-71` (`MARKERS_SQL`/`MARKERS_BBOX_SQL` select `pl.latitude, pl.longitude` directly; row mapper passes them straight through) |
| `GET /api/discover/markers` (`DiscoverMarkersController`) | Not in `permitAll` list → falls to `.anyRequest().authenticated()`: **requires a valid JWT** (any authenticated user, no role/ownership check) | `lat`, `lon` (`DiscoverMarker`) | **EXACT_PIN** — raw column, all property types, up to 5000 rows/request | `DiscoverMarkersController.java:27-139`; `DiscoverMarkersService`/`DiscoverMarker` (backing SELECT pulls `pl.latitude, pl.longitude` verbatim) |
| `GET /api/discover/listings` (`DiscoverListingsController`) | Not in `permitAll` list → **requires a valid JWT** | `latitude`, `longitude` (`DiscoverListingResponse`) | **EXACT_PIN** — raw column, all property types | `DiscoverListingsService` (SELECT `pl.latitude, pl.longitude`), `DiscoverListingResponse` |
| `GET /api/public/listings/{id}` — **anonymous** caller | `permitAll()` (`/api/public/listings/**`) | `ListingTeaserResponse` — no location fields for non-agri; agri gets `latitude`/`longitude` | **NONE** (non-agri) / **APPROXIMATE** (agri, `coarsen()` ~1.1km/2dp rounding, per #1454) | `PublicListingController.getById():73-91`; `ListingResponseMapper` teaser branch |
| `GET /api/public/listings/{id}` — **any authenticated caller** (buyer, not owner/admin/broker — `isAuthenticated` check only, no role/ownership check) | `permitAll()` at filter-chain level; controller itself branches on `SecurityContextHolder` auth | `ListingResponse.latitude`, `.longitude` | **EXACT_PIN** — raw entity fields, all property types | `PublicListingController.getById():73-91` (`isAuthenticated ? toPublicResponse : toTeaserResponse`); `ListingResponseMapper.toPublicResponse` passes `listing.getLatitude()/getLongitude()` straight through |
| `Listing` entity (source of truth) | N/A (persistence) | `latitude`, `longitude` | Single raw pair — **no separate obfuscated/public column exists** in the schema | `Listing.java` |

## Auth states checked
- **Anonymous**: `/api/listings/markers` (fully open), `/api/public/listings/{id}` teaser path.
- **Authenticated buyer (any valid JWT, non-owner)**: `/api/discover/markers`, `/api/discover/listings`, `/api/public/listings/{id}` full path.
- **Broker/admin/owner-only surfaces**: out of scope for this audit — not touched, not evaluated for regression (none of the fixes below touch them).

## Scope expansion (round 2 — architect + qa-fast review)

Follow-up review (architect + qa-fast agents) surfaced two further confirmed anonymous
leaks and one latent (currently-dormant) path, all now in scope for the fix PR:

| Endpoint | Auth state | DTO | Value type | Evidence |
|---|---|---|---|---|
| `GET /api/discover/cities/{id}/listings` (`CityAreaListingsController`) | `permitAll()` (`JwtConfig`: `// Public city-first area listings endpoint — no auth required (#886)`) | `AreaListingCard.latitude/longitude` | **EXACT_PIN** | `AreaListingCard.java` — record explicitly documents these as public fields but ships raw geocoded values, no coarsening |
| `GET /api/discover/cities/{id}/school-radius-listings` (`PublicSchoolRadiusListingsController`) | `permitAll()` (`JwtConfig`: `// Public school-radius listings endpoint — no auth required (#1239)`) | `PublicSchoolRadiusListingCard.latitude/longitude` | **EXACT_PIN** | `PublicSchoolRadiusListingCard.java` — docstring claims "EXACTLY the 20 approved public fields" (i.e. this record was deliberately designed as the anon-safe field allowlist) yet still includes raw exact `latitude`/`longitude` |
| OpenSearch discover path (`OpenSearchHitMapper.toMarker`/`.toListing`, feeding `DiscoverMarker`/`DiscoverListingResponse` via `OpenSearchListingsAdapter`/`OpenSearchMarkersAdapter`, routed by `RoutingDiscoverMarkersService`/`RoutingDiscoverListingsService`) | Same auth state as the Postgres-backed `/api/discover/markers` and `/api/discover/listings` endpoints — this is an alternate backend for the *same* routes, gated behind `discover.opensearch.enabled` (default `false`, confirmed via `@Value("${discover.opensearch.enabled:false}")`) | Same DTOs as items 2–3 in the main table | **EXACT_PIN** (dormant — not reachable while the flag is off in all known environments) | `RoutingDiscoverMarkersService.java:27-90`, `RoutingDiscoverListingsService.java:27-90`, `OpenSearchListingsAdapter.java:26-30` |

This raises the confirmed-anonymous-leak count to **4 endpoints** (`/api/listings/markers`,
`/api/discover/cities/{id}/listings`, `/api/discover/cities/{id}/school-radius-listings`,
plus the dormant OpenSearch mirror of `/api/discover/markers` + `/api/discover/listings`),
alongside the **3 authenticated-buyer** surfaces already identified
(`/api/discover/markers`, `/api/discover/listings`, `/api/public/listings/{id}`).

**Approved fix (per user decision, round 2):** coarsen at a shared DTO-construction funnel
so both the Postgres row-mapper and the OpenSearch hit-mapper populate `DiscoverMarker`/
`DiscoverListingResponse` through the same public-safe path — closing the dormant gap
without enabling OpenSearch, changing its flag, or touching indexing/ranking. No DB
migration. No frontend change unless a response contract change makes it unavoidable.

## Conclusion: **LEAK_CONFIRMED**

Two independent, deliberate severity tiers:

1. **Critical — fully anonymous.** `GET /api/listings/markers?city=...` requires no authentication at all (`permitAll()` in `JwtConfig`) and returns the raw, exact `latitude`/`longitude` for every LIVE/SCRAPED listing in a city, optionally bbox-filtered. This is a trivially scriptable bulk-harvest of every live listing's exact GPS pin with zero rate-limit-defeating effort (one call per city). No obfuscation of any kind is applied.
2. **High — authenticated buyer, no ownership check.** `/api/discover/markers`, `/api/discover/listings`, and `/api/public/listings/{id}` (when a valid JWT is presented) all return the same raw exact pin to *any* signed-in buyer for *any* listing, not just their own. There is an established, working precedent in this codebase for protecting exact pins — `ListingResponseMapper`'s `coarsen()` helper, built for the agri-teaser case (#1454) specifically because "parity is a security requirement" — but it was never extended to these three surfaces or to non-agri property types on the authenticated path.

The `Listing` entity has only one lat/lng pair — there is no separate public/display column — so today "exact pin" and "public location" are the same value everywhere except the one already-patched agri-teaser case.

## Fix scope (approved, round 2 — 6 surfaces + OpenSearch funnel)

1. **`geo.GeoCoarsener`** (new) — extract the existing `coarsen()` algorithm, currently duplicated verbatim in `ListingResponseMapper` and `DiscoverAgriMapListingsService` (comment: "Algorithm MUST remain identical"), into one static utility. Refactor both existing call sites to delegate to it (pure refactor, no behavior change — verify #1454 tests still pass).
2. **`ListingMarkersService`** — coarsen `lat`/`lon` before returning (fully anonymous, highest priority).
3. **`AreaListingCard`** (via `CityAreaListingsService`) — coarsen `latitude`/`longitude` (fully anonymous).
4. **`PublicSchoolRadiusListingCard`** (via `PublicSchoolRadiusListingsService`) — coarsen `latitude`/`longitude` (fully anonymous).
5. **`DiscoverMarker`** / **`DiscoverListingResponse`** — coarsen for all property types, applied at a shared DTO-construction funnel consumed by **both** the Postgres row-mapper (`DiscoverMarkersService`/`DiscoverListingsService`) **and** the OpenSearch hit-mapper (`OpenSearchHitMapper.toMarker`/`.toListing`), so the dormant `discover.opensearch.enabled` path cannot silently reintroduce the leak if ever turned on. No change to the OpenSearch flag, indexing, or ranking.
6. **`PublicListingController.getById` / `ListingResponseMapper.toPublicResponse`** — approved product decision: coarsen for non-owner/non-admin authenticated buyers. Reuse the existing ownership rule rather than inventing new authz — extract the boolean predicate from `ListingOwnershipGuard.findOwned` (`isAdmin || userId.equals(listing.getCreatedBy())`) into a non-throwing helper (e.g. `ListingOwnershipGuard.canAccessExactPin(...)`), since `findOwned` throws on non-owner and this path must still return 200 with a coarsened value, not 403. Per the architect review, a listing's broker/dealer *is* its `createdBy` — no separate broker-role plumbing is needed.
7. Owner/broker/admin-facing management endpoints (listing edit, dealer/broker dashboards, `AdminGeocodingController`, etc.) are out of scope and must continue to receive the exact pin — add regression tests proving no change there.
8. Regression tests: for each anonymous/buyer surface (items 2–6), assert the raw exact latitude/longitude is **not** present in the response, only a coarsened value; for owner/admin/management paths, assert the exact value **is** still present; add a unit test on `GeoCoarsener` itself (null-safe, deterministic, sign-preserving) and confirm existing agri-teaser coarsening behavior is unchanged.

## Files identified for the fix PR
- `backend/src/main/java/com/example/realestate/geo/GeoCoarsener.java` (new)
- `backend/src/main/java/com/example/realestate/listing/api/ListingResponseMapper.java` (delegate `coarsen()`; branch `toPublicResponse` on ownership)
- `backend/src/main/java/com/example/realestate/discover/DiscoverAgriMapListingsService.java` (delegate `coarsen()`)
- `backend/src/main/java/com/example/realestate/discover/ListingMarkersService.java`
- `backend/src/main/java/com/example/realestate/discover/CityAreaListingsService.java` (`AreaListingCard`)
- `backend/src/main/java/com/example/realestate/discover/PublicSchoolRadiusListingsService.java` (`PublicSchoolRadiusListingCard`)
- `backend/src/main/java/com/example/realestate/discover/DiscoverMarkersService.java` / `DiscoverMarker.java`
- `backend/src/main/java/com/example/realestate/discover/DiscoverListingsService.java` / `DiscoverListingResponse.java`
- `backend/src/main/java/com/example/realestate/discover/opensearch/OpenSearchHitMapper.java` (route through the same DTO funnel)
- `backend/src/main/java/com/example/realestate/listing/api/PublicListingController.java` (add `CallerInfo` param to `getById`)
- `backend/src/main/java/com/example/realestate/listing/core/ListingOwnershipGuard.java` (extract non-throwing `canAccessExactPin` predicate)
- `backend/src/main/java/com/example/realestate/security/JwtConfig.java` (reference only — no change expected; confirms auth boundary)

## Implementation notes / post-approval discrepancy (2026-07-06)

**AC1 / plan step 2 is moot — the target endpoint was already deleted on this branch before
implementation started.** `git log --oneline -- '*ListingMarker*'` shows commit `a8efab4c`
("chore(cleanup): remove legacy routes and marker endpoint (#1672) (#1677)", merged 2026-06-28)
deleted `ListingMarkersController`, `ListingMarkersService`, `ListingMarker`,
`ListingMarkersResponse`, and the `GET /api/listings/markers` `permitAll()` matcher in
`JwtConfig`, with "zero callers confirmed" per that PR's commit message. `git merge-base
--is-ancestor a8efab4c HEAD` confirms this deletion is an ancestor of
`security/1726-public-pin-exposure-audit`'s current tip — i.e. it was already merged to main
and present on this branch before the #1726 audit was written today. The audit's jCodemunch-backed
investigation evidently ran against a stale sub-repo index that predated the #1672 cleanup.
Net effect: the single highest-priority "fully anonymous, zero auth" leak surface described in
this audit no longer exists in source — there is nothing to coarsen for AC1/step 2, and no file
was created or modified for it (creating a new anonymous markers endpoint was never requested and
is out of scope). All other steps (1, 3, 4, 5, 6) and ACs (2–8) targeted real, currently-existing
code and were implemented as planned.

**Implemented:**
- Step 1: `geo.GeoCoarsener` (new) extracted from the duplicated `coarsen()` in
  `ListingResponseMapper` / `DiscoverAgriMapListingsService`; both refactored to delegate — pure
  refactor, #1454 tests pass unchanged.
- Step 3: `CityAreaListingsService` (`AreaListingCard`) and `PublicSchoolRadiusListingsService`
  (`PublicSchoolRadiusListingCard`) now unconditionally coarsen lat/lng (both are permitAll browse
  endpoints with no per-listing ownership concept).
- Step 4: `DiscoverMarkersService.buildMarker` / `DiscoverListingsService.buildListing` are new
  shared, `public static` DTO-construction funnels; both the Postgres row-mappers and
  `OpenSearchHitMapper.toMarker`/`toListing` now call them — the dormant
  `discover.opensearch.enabled` path is covered without touching the flag.
- Step 5: `ListingOwnershipGuard.canAccessExactPin(listing, userId, isAdmin)` (new, non-throwing)
  extracted from `findOwned`. `PublicListingController.getById` resolves caller identity manually
  from the JWT (not via a `CallerInfo` method parameter — `CallerInfoResolver` throws 401 for
  anonymous callers, which would have broken this endpoint's `permitAll()` anonymous teaser path;
  this is a deliberate, documented deviation from the plan's literal wording, preserving the
  explicit "anonymous callers keep the existing teaser-response behavior unchanged" constraint).
  `ListingResponseMapper.toPublicResponse(Listing, boolean allowExactPin)` branches exact vs
  coarsened pin; `toResponse` (broker/admin) is unaffected and always exact.

## Test evidence (2026-07-06)

```toml
[test_evidence]
test_type = "unit"
command = "mvn -f backend/pom.xml test -Dtest=GeoCoarsenerTest,ListingResponseMapperTest,ListingOwnershipGuardTest,PublicListingControllerTest,DiscoverAgriMapListingsServiceTest,CityAreaListingsServiceTest,PublicSchoolRadiusListingsServiceTest,DiscoverMarkersServiceBuildMarkerTest,DiscoverListingsServiceBuildListingTest,OpenSearchHitMapperTest,DiscoverMarkersServiceMetadataTest,DiscoverMarkersPropertyTypeTest,DiscoverListingsServiceMetricsTest,DiscoverListingsMarkersConsistencyTest -DfailIfNoTests=false"
exit_code = 0
assertions_executed = true
status = "PASS"
evidence_path = "Tests run: 179, Failures: 0, Errors: 0, Skipped: 0 / BUILD SUCCESS"
notes = "Covers every changed production class plus AC1-AC8 regression coverage (AC1 N/A per discrepancy note above). Superseded by the full-suite run below, run afterward in a clean isolated worktree."
```

## Full backend suite (2026-07-06, clean worktree)

Run in the isolated worktree (`~/projects/udupi-property-explorer-worktrees/issue-1726-public-pin-exposure`,
branch `security/1726-public-pin-exposure-audit-clean`), after adding one additional
controller-level regression test (`getById_authenticatedAdminNonOwner_returnsExactLatLng`,
closing the one advisory gap from code review — proves `hasAdminAuthority()` resolves
`isAdmin=true` end-to-end through the controller, not just at the
`ListingOwnershipGuard` unit level).

```toml
[test_evidence]
test_type = "unit + integration (JVM, no Testcontainers-gated IT excluded)"
command = "mvn -f backend/pom.xml test"
exit_code = 0
assertions_executed = true
status = "PASS"
evidence_path = "Tests run: 2995, Failures: 0, Errors: 0, Skipped: 0 / BUILD SUCCESS / Total time: 05:46 min"
notes = "Whole-repo backend suite, no test filter. PublicListingControllerTest: 35 tests (was 34), 0 failures/errors — includes the new admin-authority regression test. Supersedes the earlier NOT_COMPLETED full-suite attempt in the original (non-isolated) working directory."
```

