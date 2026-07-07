# API contract — saved listings (as-built)

Base path `/api/me/saved-listings`. All endpoints JWT-gated (401 for anonymous — not in any `JwtConfig` `permitAll` matcher). `userId` is derived solely from the JWT subject (`auth.getToken().getSubject()`), never from client input. Any valid logged-in user may use these (no DB-role gating). Idempotent-toggle semantics (USER-DECIDED at PLAN_REVIEW — intentionally diverges from the older SavedAreaController 409/404 convention).

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/me/saved-listings` | `{"listingId":"<uuid>"}` | 201 (newly saved) / 200 (already saved, no duplicate row) | 404 listing does not exist; 400 null/blank/malformed listingId; 401 anon |
| DELETE | `/api/me/saved-listings/{listingId}` | — | 204 ALWAYS (idempotent; scoped to caller's own row; absent row still 204) | 401 anon |
| GET | `/api/me/saved-listings` | — | 200 array of the caller's saved cards | 401 anon |
| GET | `/api/me/saved-listings/ids` | — | 200 array of the caller's saved listing UUID strings (hydration) | 401 anon |

## Saved card projection (`SavedListingCard`)
`{ listingId, savedAt, title, pricePaise, propertyType, locality, primaryImageUrl, bedrooms, bathrooms, area, status, available }`. `available=false` flags an archived/non-LIVE listing so the page can badge "no longer available" rather than error. All endpoints are authed, so `pricePaise` is exact (no anon coarsening path applies here).

## Idempotency
- POST duplicate `(user_id, listing_id)` → 200, no second row (backed by `UNIQUE(user_id, listing_id)` + `existsBy` pre-check; concurrent-insert race caught via `DataIntegrityViolationException` → treated as already-saved).
- DELETE uses `deleteByUserIdAndListingId` → a user can only ever remove their own row; deleting an absent/other-user row is a harmless no-op 204.
