# E2E Tests — Watch Modes & Journey Structure

## Three suites, one authoritative gate (#2187)

This repo has three layers of Playwright coverage. Only one of them is the
**authoritative CI merge gate**:

| Suite | Config | Runs against | CI job | Authoritative gate? |
|---|---|---|---|---|
| **Canonical** (`e2e/canonical/`) | `playwright.canonical.config.ts` | A real, locally-built frontend + real locally-run backend + real local Postgres/PostGIS fixture, started IN the CI job itself | `e2e-canonical` in `.github/workflows/ci.yml` | **YES — this is the merge gate.** |
| **Legacy smoke** (7 files, see below) | `playwright.config.ts`, `smoke` project | The already-deployed Cloudflare Pages site (whatever build is currently live) | `playwright-pr` in `.github/workflows/ci.yml` | No — secondary/auth-free reachability check only, kept for continuity. Does not exercise the PR's own backend. |
| **Historical/specialist** (~150 remaining `*.spec.ts` files under `e2e/`, including `journey/` and `integration-ui/`) | `playwright.config.ts`, `journey`/`integration-ui`/`full` projects | A locally-started dev backend+frontend (via `scripts/e2e-watch.sh` or `scripts/run-e2e-local.sh`) | Not run in CI at all | No — developer-invoked only (`npm run test:e2e:watch`, `bash scripts/e2e-watch.sh --project=journey`, etc.) |

**Why canonical is authoritative:** it is the only suite that builds and
exercises the PR's own frontend AND backend code together against a real
database, with `canonical-global-setup.ts`'s build-sha provenance check
proving the served build actually matches the commit under test. The legacy
`playwright-pr` smoke job tests the deployed site's CORS/render behaviour but
never touches the PR's backend — see `e2e/canonical/README.md`'s module
docstring in `playwright.canonical.config.ts` for the full "why" of the
canonical harness's guards. `playwright-pr` is left running as a secondary,
low-cost check; it is **not** where a real regression should be caught, and a
green `playwright-pr` run proves nothing about the PR's own backend changes.

**Role coverage — local vs. CI:** the canonical config's `canonical-<role>`
projects (`user`/`broker`/`admin`) are included ADDITIVELY only when that
role's credentials are present in the environment (`roleCredentialsPresent()`
in `playwright.canonical.config.ts` — environment gating by project
selection, never `test.skip`). For a local/direct developer run this is
permissive: with no role credentials exported, only `canonical-anon` is
selected, and that is a normal, anon-capable result, not an error.

CI's `e2e-canonical` job is stricter, by design (#2334 review): before the
canonical run, a preflight step asserts `ADMIN_EMAIL`/`ADMIN_PASSWORD`,
`DEALER_EMAIL`/`DEALER_PASSWORD` (legacy alias consumed as
`BROKER_EMAIL`/`BROKER_PASSWORD`), and `SMOKE_USER_EMAIL`/`SMOKE_USER_PASSWORD`
are all non-empty, and fails the whole job closed — before any tests run — if
any are missing. A second preflight step then verifies via `--list` that all
four expected projects (`canonical-anon`, `canonical-user`,
`canonical-broker`, `canonical-admin`) were actually selected, so a future
env-var rename or `roleCredentialsPresent()` alias drift can't silently drop
a role's coverage without the CI job noticing. In other words: in CI, a
missing/empty role secret is a hard gate failure, never a silent reduction to
anon-only.

**File/test counts** (verified programmatically against this branch, not
hand-typed — see the counting method note at the bottom of this section):

- Canonical: **11 spec files**, **28 static `test()` call sites** under
  `e2e/canonical/*.canonical.ts` (plus 1 shared auth-setup file). The
  suite's own certified GREEN_3X run counted **31 executed tests** — some
  static call sites are role-gated and run once per included role project, so
  the executed count depends on how many role projects are active for a given
  run (see "Role coverage in CI" above). Treat the CI job's own Playwright
  summary line as the source of truth for a given run, not either number here.
- Legacy smoke (7 files that `playwright.config.ts`'s `smoke` project
  matches): **31 static `test()` call sites** — `quick-smoke.spec.ts` (8),
  `broker-smoke.spec.ts` (4), `broker-listing-quality.spec.ts` (5),
  `broker-dashboard-v2.spec.ts` (4), `admin-smoke.spec.ts` (4),
  `discover-real-data-smoke.spec.ts` (4), `discover-schools-canonical-2124.spec.ts` (2).
- Total `*.spec.ts` files under `e2e/`: **168** (includes the 7 legacy smoke
  files above, `journey/` and `integration-ui/` project files, and the
  remaining historical/specialist files not wired into any CI job).

Counting method: `find e2e -name '*.spec.ts'` / `find e2e/canonical -name
'*.canonical.ts'` for file counts; a `grep -c '^\s*test('`-equivalent scan per
file for static test-call counts. Re-run these yourself before trusting a
stale number here — this table will drift the moment a spec file changes.

## Quick reference

| Command | What it does |
|---|---|
| `npm run test:e2e:canonical` | **The merge gate** — builds with the current commit's sha baked in, runs the canonical suite. Requires a real local backend already running (see `e2e/canonical/README.md`) or CI's `e2e-canonical` job, which starts one itself. |
| `npm run test:e2e:watch` | Headed browser, 1 worker, normal speed (legacy/specialist suites) |
| `npm run test:e2e:watch:slow` | Headed browser, 1 worker, 800ms between actions |
| `bash scripts/e2e-watch.sh --slow --project=journey` | Watch all journeys slowly |
| `bash scripts/e2e-watch.sh --debug` | Open Playwright Inspector on failure |
| `npm run test:e2e:local` | Local-only legacy gate (headless, smoke project) — NOT the CI merge gate; see table above |

---

## 1. Normal watch mode

Run tests in a headed browser at normal speed. One worker so tests execute
sequentially and you can follow them in the browser window.

```bash
# All tests
npm run test:e2e:watch

# One file
bash scripts/e2e-watch.sh e2e/journey/broker-listing-creation.spec.ts

# One test by name (-g grep)
bash scripts/e2e-watch.sh -g "DL1"

# One project
bash scripts/e2e-watch.sh --project=journey
bash scripts/e2e-watch.sh --project=smoke
bash scripts/e2e-watch.sh --project=integration-ui
```

The script auto-starts backend and frontend servers if they aren't already
running. It reuses existing servers if they respond on the configured ports.

---

## 2. Slow watch mode

Adds `--slow-mo=800` so every Playwright action (click, fill, navigate, type)
pauses 800ms. This makes the flow human-watchable — good for demos, debugging
visual glitches, or learning a journey step by step.

```bash
# All tests slowly
npm run test:e2e:watch:slow

# One journey file slowly
bash scripts/e2e-watch.sh --slow e2e/journey/anon-teaser.spec.ts

# All journeys slowly
bash scripts/e2e-watch.sh --slow --project=journey

# One test by name slowly
bash scripts/e2e-watch.sh --slow -g "LC1"
```

**Custom speed**: Set the `SLOW_MO` env var to any millisecond value.
`--slow` is shorthand for `SLOW_MO=800`.

```bash
# Extra slow (1.5s per action)
SLOW_MO=1500 bash scripts/e2e-watch.sh e2e/journey/broker-listing-creation.spec.ts
```

**CI safety**: Slow mode only activates when the `SLOW_MO` env var is set
(via `--slow` flag or explicitly). It is never set in `run-e2e-local.sh`
or CI workflows. When `SLOW_MO` is absent, `playwright.config.ts` does not
inject `launchOptions.slowMo` — normal execution is always fast.

---

## 3. Debug / inspector mode

Playwright's `--debug` flag opens the Inspector, which pauses execution on
failure and lets you step through actions, inspect selectors, and view the DOM.

```bash
# Debug mode (pause on failure)
bash scripts/e2e-watch.sh --debug e2e/journey/listing-lifecycle.spec.ts

# Slow + debug (recommended for stepping through a flow)
bash scripts/e2e-watch.sh --slow --debug e2e/journey/admin-duplicates.spec.ts

# Debug one test by name
bash scripts/e2e-watch.sh --debug -g "AT3"
```

You can also set `PWDEBUG=1` to open the Inspector from the start of every test
(not just on failure):

```bash
PWDEBUG=1 bash scripts/e2e-watch.sh e2e/journey/anon-teaser.spec.ts
```

---

## 4. Journey structure

Tests are organised into three Playwright projects:

### `journey` — end-to-end user flows (`e2e/journey/`)

Best for watching complete product flows start-to-finish.

| File | Flow |
|---|---|
| `broker-listing-creation.spec.ts` | DL1 — Full 4-step broker listing wizard (create, upload images, confirm address, submit) |
| `anon-teaser.spec.ts` | AT1-AT4 — Anonymous discovery, login gate, returnTo redirect, full unlock |
| `listing-lifecycle.spec.ts` | L1/L2/L3/L5 + LC1 — Listing visibility checks + LIVE to ARCHIVED to DRAFT lifecycle |
| `admin-duplicates.spec.ts` | AD1-AD5 — Admin duplicate review: Confirm, Undo, Dismiss (serial, stateful) |
| `admin-moderation.spec.ts` | AM1-AM3 — Admin approve/reject + broker sees rejection reason |
| `booking-journey.spec.ts` | UB1-UB3 — User books viewing, duplicate rejected, broker sees booking |

**Note on classification**: Some files in `journey/` include supporting
smoke-like checks alongside the main flow (e.g. `listing-lifecycle.spec.ts`
has L1/L2/L3 page-load guards around the LC1 lifecycle journey). They are
grouped here because the tests share fixtures and are most coherent when
watched and run together. The grouping is for execution/watchability, not a
claim that every individual `test()` is a multi-step user journey.

### `smoke` — lightweight access and render checks (`e2e/`)

Fast, stateless page-load and auth-redirect checks. This is exactly the 7
files `playwright.config.ts`'s `smoke` project's `testMatch` lists — run in
CI by the secondary `playwright-pr` job (see the suite table at the top of
this file for why it is not the authoritative gate).

| File | Tests |
|---|---|
| `quick-smoke.spec.ts` | Q1-Q7 — App load, auth redirect, login, CORS, API guard, nav, booking duplicate |
| `broker-smoke.spec.ts` | D1-D4 — Broker page access checks |
| `broker-listing-quality.spec.ts` | Broker listing quality checks |
| `broker-dashboard-v2.spec.ts` | Broker dashboard v2 checks |
| `admin-smoke.spec.ts` | A1-A4 — Admin page access checks |
| `discover-real-data-smoke.spec.ts` | Discover real-data smoke checks |
| `discover-schools-canonical-2124.spec.ts` | Discover schools canonical checks (#2124) |

`nav-roles.spec.ts` and `user-journeys.spec.ts` still exist under `e2e/` but
are **not** matched by `smoke`'s `testMatch` — they're part of the
historical/specialist set (developer-invoked only, e.g. via
`bash scripts/e2e-watch.sh e2e/nav-roles.spec.ts`), not the CI smoke gate.

### `integration-ui` — browser tests with controlled setup (`e2e/`)

Tests that stub backend responses or exercise specific UI components in
isolation. Useful for verifying widget behaviour without live data dependency.

| File | Tests |
|---|---|
| `broker-listing-form.spec.ts` | P1-P5 (PriceField slider) + GF1-GF3 (completeness guard 422 responses) |
| `map-filters.spec.ts` | M1-M5 — Map filter interactions + Leaflet marker rendering (route-stubbed) |
| `poi-display.spec.ts` | P1-P2 — NearbyPois with stubbed backend responses |

### Running by project

```bash
bash scripts/e2e-watch.sh --project=journey         # all journeys
bash scripts/e2e-watch.sh --project=smoke            # all smoke
bash scripts/e2e-watch.sh --project=integration-ui   # all integration-ui
bash scripts/e2e-watch.sh --project=full             # everything
```

---

## 5. CI and merge gate safety

| Concern | Status |
|---|---|
| **CI merge gate** (`.github/workflows/ci.yml`, `e2e-canonical` job) | **#2187: this is now the authoritative gate.** Builds frontend+backend from the PR's own commit, stands up a real local Postgres/PostGIS fixture + Spring Boot backend inside the job, runs `npm run test:e2e:canonical`. See the suite table at the top of this file. |
| CI legacy job (`.github/workflows/ci.yml`, `playwright-pr` job) | Still runs `--project=smoke` headless against the deployed Cloudflare Pages site. Kept as a secondary, low-cost auth-free reachability check — not where a real regression should be caught (see suite table above). |
| Local pre-push hook (`scripts/run-e2e-local.sh`) | Unchanged by this PR. Runs `--project=smoke` headless against a locally-started dev backend/frontend (via `.env.e2e`). This is a **local developer convenience gate**, distinct from the CI merge gate above — it was never itself a CI job. |
| `playwright.config.ts` defaults | `headless: true`, no `slowMo`, `workers: 2`. |
| `playwright.canonical.config.ts` defaults | `headless: true`, no `slowMo`, `workers: 1` (single shared local fixture DB — see `e2e/canonical/README.md`). |
| Slow mode | Only activates via explicit `--slow` flag or `--slow-mo=N` arg in `e2e-watch.sh`. Never injected by config or CI. |
| Test coverage | See the "File/test counts" note above — verify programmatically, don't trust a hand-typed number. |

---

## Recommended first run

To see the slow-watch experience for the first time, try the anonymous teaser
journey — it's short (4 tests), visually interesting, and doesn't require
broker/admin credentials:

```bash
bash scripts/e2e-watch.sh --slow e2e/journey/anon-teaser.spec.ts
```

For the most complete journey, try the broker listing creation wizard:

```bash
bash scripts/e2e-watch.sh --slow e2e/journey/broker-listing-creation.spec.ts
```

---

## 6. Discover E2E seed

The Discover real-data smoke gate (issue #1264) requires 12 seeded LIVE listings
(4 × Manipal, 4 × Malpe, 4 × Kaup) to be present in the database.

### Running the seed

1. Copy `.env.seed.example` to `.env.seed` (already gitignored) and fill in real values.
2. Source the env file and run the seed:

```bash
source .env.seed && node scripts/seed-discover-listings.mjs
```

The seed is **idempotent** — safe to rerun. It will update existing E2E listings
(identified by `[E2E]` title prefix) and create missing ones. It never deletes or
modifies non-E2E rows.

### Required env vars

| Variable | Description |
|---|---|
| `SEED_SUPABASE_URL` | Supabase project URL |
| `SEED_SUPABASE_KEY` | Supabase publishable key |
| `SEED_BROKER_EMAIL` | Broker account email |
| `SEED_BROKER_PASSWORD` | Broker account password |
| `SEED_ADMIN_EMAIL` | Admin account email |
| `SEED_ADMIN_PASSWORD` | Admin account password |
| `SEED_DB_HOST` | Database host (e.g. `aws-1-eu-west-1.pooler.supabase.com`) |
| `SEED_DB_PORT` | Database port (default: `6543`) |
| `SEED_DB_USER` | Database user (e.g. `postgres.your-project-ref`) |
| `SEED_DB_NAME` | Database name (default: `postgres`) |
| `SEED_DB_PASSWORD` | Database password |
| `SEED_BACKEND_URL` | Backend API base URL (default: `http://localhost:8085`) |
| `SEED_IMAGE_PATH` | *(Optional)* Absolute path to a jpg for listing images |
