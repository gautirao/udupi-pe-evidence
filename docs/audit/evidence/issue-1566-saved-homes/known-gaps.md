# Known gaps / deferrals

> UPDATE (rework cycle 2, rev 3): Gaps 1–3 below are now CLOSED. A fully ISOLATED local stack
> (local PostGIS container + Flyway V1..V107 + discover-smoke-seed + backend :8086 + FE :5186 + real
> SMOKE_USER auth, ZERO shared Supabase DB) ran the REAL E2E happy path (verify driver 15/15 PASS) with
> real persistence: anon heart→AuthModal+zero-network, save→POST 201→optimistic fill, /saved-homes lists
> the real row (real listSaved read path), remove→DELETE 204→empty state, hydration unfilled-after-unsave
> and filled-across-full-reload. Screenshots real-*.png. This also proved Flyway migration application
> V1..V107 on a fresh container. The historical text below is retained for provenance.

## 1. E2E happy-path — authored, execution NOT_RUN (justified) [CLOSED rev 3 — executed on isolated stack]
Spec: `e2e/saved-homes.spec.ts` (sign in → save from card → /saved-homes → remove → heart reset on revisit).
Reason not run: this repo has no isolated local Postgres profile — the "local" backend connects over the network to a Supabase project, the Playwright harness defaults `BASE_URL`/`BACKEND_BASE_URL` to the deployed production stack when env is unset, and no `.env.e2e` / `backend/.env` / `SMOKE_USER` creds exist in the worktree. Running it would require wiring to a Supabase project and applying V107 + writing `saved_listings` rows there, which the hard constraint (no shared/production Supabase mutation) forbids. The spec self-skips without creds, so it will not false-fail.
Coverage substitute: 22 backend tests (incl. real-Postgres Testcontainers IT) + 131 frontend unit/integration tests cover the full save/unsave/list/ids/IDOR/anon/idempotency/optimistic/rollback/hydration/page flows.
Follow-up: run in a provisioned isolated environment (dev Supabase + V107 applied + seeded Manipal-area listings + real SMOKE_USER).

## 2. Feature screenshots (required_evidence item) — NOT_PROVEN (env-blocked)
Real screenshots need a running frontend+backend with seeded data — same environment constraint as the E2E. Component tests render the UI in JSDOM but produce no screenshot artefact. To be captured in the provisioned isolated environment alongside the E2E run. Flagged for WORKDONE_REVIEW acceptance decision.

## 3. `listSaved` raw-JDBC read path — no isolated integration test
The primary GET read (`SavedListingsService.listSaved`, 14-column join + correlated image subquery) is unit-tested via a mocked service and is covered end-to-end by the (deferred) E2E, but has no isolated real-schema IT. code-reviewer assessed low risk (columns byte-identical to production-proven CityAreaListingsService/DiscoverListingsService). Fast-follow: one `@SpringBootTest`/`@DataJpaTest` seeding a listing+image+saved row and asserting the projection.

## 4. Non-blocking nits / advisories
- Per-user rate limit on save/unsave (security advisory; self-scoped).
- Pagination/LIMIT on GET list (security advisory; self-scoped).
- SavedHomes remove-button disabled state shared across rows (disable only in-flight row).
- DELETE with malformed UUID path returns 400 not 204 (unreachable from FE).
