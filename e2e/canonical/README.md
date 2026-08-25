# Canonical E2E harness (issue #1713)

This is a **cross-stack gate**, not a frontend-only test suite. Every spec
under this directory drives a real browser against a real, locally-running
frontend AND a real, locally-running backend + Postgres/PostGIS fixture —
there is no mocked-API mode. If you cannot bring up all three, run
`npm run test:e2e:canonical` and report the failure honestly; do not skip
straight to the frontend-only unit/integration suite and call it equivalent
coverage.

## Why the backend is NOT started by Playwright

`playwright.canonical.config.ts`'s `webServer` block starts **only** the
frontend (`vite preview --port 5251 --strictPort`). Playwright does not, and
must not, manage the backend process — the backend has its own local-fixture
lifecycle (a disposable Postgres/PostGIS container plus hosted Supabase Auth
for JWT validation) that is a different shape of "server" than a static
frontend preview.

Because Playwright can't catch "the backend isn't running" via its own
`webServer` readiness check, `canonical-global-setup.ts` runs two explicit,
loud-failure probes before any test starts:

1. **Backend reachability** — a bounded-timeout request to
   `BACKEND_BASE_URL`'s `/actuator/health`. Throws if the backend doesn't
   answer.
2. **CORS origin admission** — a request to the backend carrying
   `Origin: <PLAYWRIGHT_BASE_URL>`, asserting the response admits that exact
   origin via `Access-Control-Allow-Origin`. This is a SEPARATE probe from
   (1) and cannot be skipped even when (1) passes: a CORS-blocked request
   does not surface as an app-level error — the browser silently withholds
   the response, the UI renders EMPTY, and a naive "no results shown"
   assertion passes against a broken app. See the doc comment at the top of
   `canonical-global-setup.ts` for the full mechanism, and
   `backend/src/main/resources/application.yml:174-175` for the CORS default
   this harness must override (it only covers ports 5173/5174/3000 by
   default — this harness serves on 5251).

## Required local run sequence

1. **Start the local fixture backend** (real local PostGIS + hosted Supabase
   Auth — never the shared remote Supabase database):

   ```bash
   PG_TEST_PORT=5434 CORS_ALLOWED_ORIGINS="http://localhost:5251,http://localhost:5173,http://localhost:5174,http://localhost:3000" \
     bash scripts/dev/local-fixture-backend.sh
   ```

   This script (read-only reference here — it is out of scope for this
   slice to modify) restores the throwaway PostGIS fixture, seeds the
   `[E2E]`-prefixed listings this harness's specs read (see
   `scripts/db/fixtures/discover-smoke-seed.sql`), and execs
   `backend/run-local.sh` in the foreground. Leave it running in its own
   terminal.

   **Navigation/Discover journey specs need a full, ordered seed sequence —
   not just the two files this section used to name.** `discover-smoke-seed.sql`
   alone does not populate the navigation hierarchy, and even the "node graph +
   promoted revision" pair below is INCOMPLETE on its own: it leaves the graph
   present but with zero listings/schools/agri data behind it, which is a
   present-but-EMPTY graph — every T4-T6-class positive assertion fails, and
   any weaker assertion passes vacuously (the exact silent-degradation failure
   mode issue #1713 exists to eliminate). Any spec that drives an
   area/school/agri-first Discover journey (PR-3+) requires ALL of the
   following, loaded in this order, against the SAME fixture database:

   1. `scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql` — the
      Bangalore navigation node graph itself (Directions/Clusters/Areas).
   2. `scripts/db/fixtures/navigation-active-revision-fixture-seed.sql` — the
      `city_launch_revision` row PROMOTED for Bangalore, which is what makes
      the graph in (1) reachable at all (`PublicActiveCityRevisionReader`
      requires a promoted, non-superseded revision per city).
   3. `scripts/db/fixtures/navigation-hierarchy-fixture-listings-seed.sql` —
      the 9 LIVE `[E2E]`-prefixed residential listings inside the AREA leaves
      (1) creates. Without this, every area/direction in the graph has zero
      eligible listings and is invisible to `journeyVisibility`'s eligibility
      filter (client-side clustering runs AFTER that filter).
   4. `scripts/db/fixtures/navigation-hierarchy-fixture-rent-listings-seed.sql`
      — the rent-intent companion to (3), for any spec exercising `intent=rent`.
   5. `scripts/db/fixtures/navigation-hierarchy-schools-agri-fixture-seed.sql`
      (issue #1713 PR-3) — schools resolved (via the real V80 trigger) into
      the AREA leaves (1) creates, agri-eligible listings, and
      `agri_destination_classification` rows for Bangalore. Without the last
      part, the backend fails closed with `503
      AGRI_DESTINATIONS_NOT_YET_PROMOTED` for EVERY city on a stock fixture
      (that table is written only by `CityLaunchPromotionService`'s real
      promotion flow, never by a migration) — an agri-first spec would render
      an EMPTY panel with NO visible error, not a diagnosable failure.

   Loading an incomplete subset of the five leaves the hierarchy present but
   inert (or the revision promoted but pointing at nothing, or the graph
   populated but its listings/schools/agri data missing) — all of these fail
   silently as "no navigation data" / "empty panel", never a loud error. The
   navigation graph is also **cached at backend startup**: if you seed any of
   these files into an already-running backend, you must restart the backend
   process for the graph (and, for file 5's agri rows, the readiness check) to
   pick up the change — a live re-seed with no restart looks identical to
   "seed didn't apply."

   The backend defaults to port 8080 unless you override it — see
   `backend/run-local.sh` / `backend/.env` for the port variable and set it
   to `8251` to match this harness's port allocation (avoids colliding with
   any other locally-running backend, including this repo's non-canonical
   E2E suites).

2. **Export the required environment variables** (in the shell that will run
   Playwright):

   | Variable | Required | Purpose |
   |---|---|---|
   | `PLAYWRIGHT_BASE_URL` | yes | `http://localhost:5251` — the frontend preview URL. Must be a LOOPBACK-ONLY URL — hostname `localhost`, `127.0.0.0/8`, or `[::1]`. This is a **positive allow-list**, not a deny-list: the config throws for ANY non-local host (a hosted deployment, a staging domain, a raw production IP, `0.0.0.0`), not just known-bad domains like `pages.dev`/`supabase.co` (those are checked too, redundantly, purely for a sharper error message). |
   | `BACKEND_BASE_URL` | yes | `http://localhost:8251` — the local backend URL. Same loopback-only allow-list applies. |
   | `VITE_API_BASE_URL` | **yes, at `npm run build` time** | `http://localhost:8251` — MUST match `BACKEND_BASE_URL`. `src/lib/api.ts:3` captures this at **module load** (`import.meta.env.VITE_API_BASE_URL \|\| 'http://localhost:8085'`) — a build produced without it baked in silently talks to the dead default port `:8085` at runtime. The app still renders (no visible error), but every `api.*()` call fails, `assertBackendTrafficWasReal` sees zero real backend requests, and the whole run is a false green/red pair depending on which assertions happen to tolerate an empty response. This was root-caused live (fix-cycle-2, #1713 PR-1): `test:e2e:canonical`'s `vite build` step will NOT set this for you — export it yourself before running the script. |
   | `CORS_ALLOWED_ORIGINS` | yes (on the **backend** process) | Must include `http://localhost:5251` — set before starting `local-fixture-backend.sh` (see step 1). Without it, `canonical-global-setup.ts`'s CORS probe fails loudly, by design. |
   | `SUPABASE_PROJECT_REF` | yes (on the **backend** process) | Required by `local-fixture-backend.sh` / `backend/run-local.sh` for hosted JWT validation — this harness's anonymous PR-1 smoke spec does not use auth itself, but the backend process still validates JWTs for any authenticated request path it serves. |
   | `PG_TEST_PORT` | optional | Host port for the local Postgres/PostGIS fixture container (default `5434`). |
   | `CANONICAL_SKIP_SHA_PROVENANCE` | optional, opt-OUT only | See "Build-sha provenance is mandatory" below. Never set this for a real gate run. |

   `VITE_BUILD_SHA` and `EXPECTED_BUILD_SHA` are **no longer operator-set env
   vars** — see "Build-sha provenance is mandatory" below for what replaced
   them.

### Build-sha provenance is mandatory, not opt-in

`canonical-global-setup.ts` derives the expected build sha itself, exactly
once, via `git rev-parse HEAD`, and publishes it to every test as
`CANONICAL_EXPECTED_BUILD_SHA`. The smoke spec's build-sha test asserts
equality **unconditionally** — a missing meta tag, an empty one, the
`local-dev` unset-fallback, or a stale/mismatched sha all fail the run. There
is no "caller forgot to export a var" path that silently passes; the earlier
`EXPECTED_BUILD_SHA` design had exactly that gap (flagged in PR review) and
has been removed.

This only holds because the **build** and the **assertion** derive the sha
from the same source: `npm run test:e2e:canonical` now runs
`VITE_BUILD_SHA=$(git rev-parse HEAD) vite build && playwright test ...`
(see `package.json`), baking the current HEAD sha into the served HTML via
`vite.config.ts`'s `build-sha-meta` plugin. If you build some other way,
make sure `VITE_BUILD_SHA` is set to the same `git rev-parse HEAD` the test
run will see, or the assertion will correctly fail.

**Opt-out (local iteration only, never the default):** set
`CANONICAL_SKIP_SHA_PROVENANCE` (any truthy value) to skip the equality
assertion — e.g. while hand-editing `dist/` during harness debugging. Global
setup logs a loud warning when this is active; it must never be set for a
real gate run.

**Dirty-tree honesty:** `HEAD`'s sha describes the last *commit*, not
uncommitted working-tree changes. A green provenance check on a dirty tree
only proves the served build matches committed HEAD, not your full working
tree. Global setup checks `git status --porcelain` and prints a loud warning
when the tree is dirty — it does **not** fail the run (that would make normal
local iteration impossible); the point is that the limitation is visible,
not silent.

3. **Export `VITE_API_BASE_URL` pointed at the backend you just started, then run:**

   ```bash
   export VITE_API_BASE_URL=http://localhost:8251
   PLAYWRIGHT_BASE_URL=http://localhost:5251 \
   BACKEND_BASE_URL=http://localhost:8251 \
     npm run test:e2e:canonical
   ```

   `npm run test:e2e:canonical` itself runs `VITE_BUILD_SHA=$(git rev-parse
   HEAD) vite build && playwright test --config=playwright.canonical.config.ts`
   (never a bare `playwright test`) so the default, no-argument invocation
   can never serve a stale `dist/` from a previous branch/build, and always
   bakes the current HEAD sha for the mandatory build-sha provenance
   assertion (see above) — you do not need to set `VITE_BUILD_SHA` or
   `EXPECTED_BUILD_SHA` yourself. That `vite build` step still reads
   `VITE_API_BASE_URL` from **your current shell environment**, so it must
   already be exported before you run the script; the script does not set it
   for you. Playwright's own `webServer` block only runs `vite preview`, not
   `vite build` — it serves whatever `dist/` already exists, which is why the
   package script builds first.

## Consecutive full-suite runs trip per-IP rate limiters (issues #2255, #2261)

Running the full canonical suite back-to-back against **the same local
backend process**, without restarting it between runs, produces a growing
failure count on the second and later runs — one that misleadingly looks
like a regression caused by whatever changed most recently. It is not a
regression: it is the backend's own anti-abuse rate limiting doing its job.

**Root cause:** the backend's public `discover` and `trends` endpoints are
protected by in-memory (Bucket4j) per-IP rate limiters —
`DiscoverRateLimitFilter` / `TrendsRateLimitFilter` — configured in
`application.yml`:

| Property | Env override | Default |
|---|---|---|
| `ratelimit.discover.enabled` | `RATE_LIMIT_DISCOVER_ENABLED` | `true` |
| `ratelimit.discover.requests-per-minute` | `RATE_LIMIT_DISCOVER_REQUESTS_PER_MINUTE` | `120` |
| `ratelimit.trends.enabled` | `RATE_LIMIT_TRENDS_ENABLED` | `true` |
| `ratelimit.trends.requests-per-minute` | `RATE_LIMIT_TRENDS_REQUESTS_PER_MINUTE` | `60` |

Every canonical run drives real anon `discover`/`trends` traffic from the
same client IP against a backend process that keeps its rate-limit buckets
in memory across runs (the process itself isn't restarted between suite
invocations). Enough consecutive runs exhausts the bucket; once tripped,
anon discover/trends GETs get throttled with HTTP 429, downstream panels
never render, and the suite fails in a way that grows worse the more times
you re-run it — look for this log line on the backend to confirm the
diagnosis:

```
WARN c.e.r.s.DiscoverRateLimitFilter - Public discover rate limit exceeded for clientKey=...
```

(the `trends` filter logs the analogous `Public trends rate limit exceeded`
line).

**Fix — disable both limiters for local/CI canonical runs:**

```bash
export RATE_LIMIT_DISCOVER_ENABLED=false
export RATE_LIMIT_TRENDS_ENABLED=false
```

Set these in the shell that starts `scripts/dev/local-fixture-backend.sh`
(they must be present on the **backend** process's environment, not the
Playwright shell). No canonical spec asserts rate-limiting behavior, so
disabling these removes zero coverage.

**Never disable these on a shared, staging, or production backend.** They
exist to protect real anonymous endpoints from abuse; this override is for
local/CI verification backends only, where the "attacker" is your own
repeated test traffic against a fixture database.

## The `*.canonical.ts` naming rule — MANDATORY, load-bearing

Every spec file in this directory MUST be named `<name>.canonical.ts`, never
`<name>.spec.ts`. This is not a style preference:

- `playwright.config.ts` (the **existing**, non-canonical suite) sets
  `testDir: './e2e'` (line 27) and its `full` project has **no** `testMatch`
  of its own (lines 69-70) — so it recursively runs **every** `*.spec.ts`
  under `./e2e`, including anything placed under `e2e/canonical/`.
- `playwright.config.ts:35` also defaults `baseURL` to the deployed
  production site when `PLAYWRIGHT_BASE_URL` is unset.
- Put those two facts together: a canonical spec named `*.spec.ts` would be
  picked up a **second time** by the OLD config — without any of this
  harness's fail-closed guards, determinism setup, or real-backend proof —
  and potentially run against **production**.
- Playwright's own default `testMatch` is
  `**/*.@(spec|test).?(c|m)[jt]s?(x)`, which does **not** match
  `*.canonical.ts`. Naming every file this way makes the isolation a
  property of the filename itself, verifiable by anyone reading a spec's
  extension — not something that depends on `playwright.config.ts` staying
  correctly configured (that file is out of scope to modify for this slice
  regardless).

If you are about to create a new canonical spec and your editor/IDE
auto-suggests `.spec.ts`, that is wrong for this directory — use
`.canonical.ts`.

## Support modules

- `support/canonical-test.ts` — the single extended `test`/`expect` every
  spec in this directory must import (never import directly from
  `@playwright/test`). It auto-installs determinism (animation/caret kill,
  reused from `e2e-parity/support/determinism.ts`), telemetry consent
  (`grantDiscoverConsent`, reused from `e2e/helpers.ts`), and a real-backend
  traffic guard (`installNoApiMockGuard` / `assertBackendTrafficWasReal`,
  also reused from `e2e-parity/support/determinism.ts`) around every test.
  It also exposes `canonicalStorageStatePath(role)` — a seam for
  authenticated specs (PR-3+) to select role-based `storageState`; PR-1's own
  smoke spec is anonymous and does not use it. See that file's own docstring
  for the full contract, including the ENVIRONMENT_GATED labelling
  requirement for any future spec that relies on hosted Supabase Auth
  (owner ruling D10-AUTH-FIXTURE — hosted auth must never be presented as the
  deterministic fixture).
- `canonical-global-setup.ts` — the two fail-loud preconditions described
  above, plus deriving/publishing the mandatory build-sha provenance value
  (see "Build-sha provenance is mandatory, not opt-in" above).

## What this slice does NOT include

This PR (#1713 slice PR-1) proves the harness works — it deliberately ships
exactly ONE anonymous smoke spec
(`canonical-harness-smoke.canonical.ts`), not the full ~9-spec/18-test
canonical suite design. The remaining specs (area-first / school-first /
agri-first Discover journeys, authenticated flows) are PR-2 through PR-5.
