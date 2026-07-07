# Tests run (branch feat/1566-saved-homes, current session)

| Command | Runner | Exit | Result |
|---|---|---|---|
| `mvn -o -f backend/pom.xml test -Dtest=SavedListingsControllerTest` | surefire | 0 | 14 run / 0 fail / 0 err / 0 skip — PASS |
| `mvn -o -f backend/pom.xml test -Dtest=SavedListingsRepositoryIT` | surefire (Testcontainers real Postgres/PostGIS) | 0 | 8 run / 0 fail / 0 err / 0 skip — PASS |
| `node node_modules/.bin/vitest run useSavedListings PropertyCard SavedHomes AppLayout listingQueryKeys` | vitest | 0 | 131 passed / 131 (PropertyCard 84/84, 0 net-new failures) — PASS |
| `npx tsc --noEmit -p tsconfig.app.json` | tsc | 2 | 114 pre-existing errors, 0 referencing any #1566 file — 0 net-new PASS |
| `verify-1566-real-e2e.mjs` (real isolated-stack browser E2E, rev 3) | playwright/chromium | 0 | 15 / 15 checks PASS — real happy path with real persistence (see below) |

Backend coverage: POST 201/200/404/400, DELETE 204 own/absent, anon 401 x3, IDOR cross-user delete, GET own-only, GET /ids, migration apply + UNIQUE + FK (Testcontainers).
Frontend coverage: hook optimistic + rollback + auth-scoped key + 200/201 success + 204 idempotent + 401 toast; PropertyCard hydration + anon-no-network + a11y + keyboard + stopPropagation; SavedHomes render/empty/remove.

All backend tests use ephemeral Testcontainers Postgres — NO shared/production Supabase touched.

## Real E2E — isolated local stack (rev 3, executed)
Stack: local PostGIS container :55432 (Flyway V1..V107 applied to a fresh DB by the running backend — proves migration application end-to-end) + discover-smoke-seed.sql (12 LIVE, 4 Manipal) + backend :8086 + FE :5186 (VITE_API_BASE_URL=http://localhost:8086) + real SMOKE_USER auth. ZERO shared/production Supabase DB access (only public JWKS + SMOKE_USER sign-in). Two local-env-only config steps (not code, not product bugs): Flyway recipe (empty concurrently_keyword + filesystem test-stubs + ssl=false) and CORS_ALLOWED_ORIGINS incl :5186.

Result: 15/15 PASS, exit 0 —
- AC5/AC6 anon: heart 'Save property'/aria-pressed=false; click opens AuthModal; ZERO /api/me/saved-listings network; no local toggle.
- AC1: real POST /api/me/saved-listings -> 201 -> optimistic fill (aria-pressed=true, 'Remove saved property').
- AC2/AC3: /saved-homes lists the real saved row (count=1) via the REAL SavedListingsService.listSaved read path.
- AC3: real DELETE -> 204 -> empty state 'No saved homes yet.'.
- AC2/AC4: heart hydrates UNFILLED after unsave and FILLED across a full page reload (real /ids persistence).
Screenshots: real-anon-signin-prompt.png, real-authed-save.png, real-saved-homes-list.png, real-saved-homes-empty.png, real-hydrated-unfilled.png, real-hydrated-filled.png. Stack torn down after the run; worktree backend/.env untracked/gitignored. This closes the earlier E2E-deferred + listSaved-not-isolated + Discover-heart-not-browser-verified gaps.

## Post-rebase revalidation (base now origin/main b8ed36e7 — #1785 + #1787 trustBadge; HEAD b6385b98)
Feature branch rebased cleanly onto origin/main (ZERO conflicts). Revalidation (Main Agent): tsc 0 errors; BE SavedListingsControllerTest 14/14 + SavedListingsRepositoryIT 8/8 + TrustBadgeTest 14/14 + ListingResponseMapperTest 60/60 + DiscoverListingsServiceBuildListingTest 5/5 (trustBadge NOT regressed); FE 137/138 (only the pre-existing, unrelated routeAccess #12). Saved-homes behaviour unaffected by the trustBadge changes.
