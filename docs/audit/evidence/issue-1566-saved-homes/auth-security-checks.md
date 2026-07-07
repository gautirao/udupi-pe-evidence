# Auth / security checks — Gate F (security-reviewer, opus) + code-reviewer (opus)

Both reviews APPROVE with 0 blocking / 0 should-fix findings. All verified against directly-read code.

## IDOR / own-rows-only (top priority) — PASS
- `userId` derived exclusively from `auth.getToken().getSubject()` (SavedListingsController.extractUserId, ~L99-101). Never read from body/path/query.
- Every repository method scoped by userId: `existsByUserIdAndListingId`, `deleteByUserIdAndListingId`, `findListingIdsByUserId` (`WHERE s.userId = :userId`), and raw `listSaved` (`WHERE sl.user_id = ?`).
- Cross-user delete is a structural no-op: `deleteByUserIdAndListingId(attacker, victimListingId)` matches no victim row. Proven by SavedListingsControllerTest + SavedListingsRepositoryIT IDOR tests.

## Authentication / anon-401 — PASS
- `/api/me/saved-listings` not in any `JwtConfig` `permitAll` matcher → falls through to `.anyRequest().authenticated()` → 401 for anon.
- Supabase JWT validated by Nimbus decoder (issuer-uri) — signature (JWKS), issuer, expiry; rejects `alg=none`. Stateless Bearer (CSRF N/A).
- FE anon heart click: `PropertyCard.handleToggleSave` calls `openAuthModal()` and returns before any mutation — no API call, no local toggle. `useSavedListingIds`/`useSavedListings` are `enabled: isAuthenticated`.

## Injection — PASS
- Raw `listSaved` read fully parameterized (`jdbc.query(sql, handler, userId)`, single bind; image subquery keys on `li.listing_id = pl.id`, no user input).
- `listingId` UUID-typed before use (400 on malformed) — POST via `UUID.fromString`, DELETE via `@PathVariable UUID`.

## Identity spoofing — PASS
No userId/subject override via header/body/query; JWT subject is the sole identity source.

## Data exposure — PASS
GET returns only `WHERE user_id = ?` rows; `SavedListingCard` projects listing summary only (no other-user PII/contact); error bodies generic; `application.yml` sets include-message/stacktrace/exception = never.

## Migration safety — PASS
V107 additive; FK ON DELETE CASCADE; UNIQUE backs idempotent-save race; soft `user_id`; no RLS by design (Spring sole enforcer; FE never hits Supabase client for this table).

## Advisories (non-blocking follow-ups)
- No per-user rate limit on save/unsave (self-scoped, low risk).
- GET list unpaginated (self-scoped; add LIMIT if saved sets grow large).
