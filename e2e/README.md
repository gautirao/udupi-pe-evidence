# E2E Tests — Watch Modes & Journey Structure

## Quick reference

| Command | What it does |
|---|---|
| `npm run test:e2e:watch` | Headed browser, 1 worker, normal speed |
| `npm run test:e2e:watch:slow` | Headed browser, 1 worker, 800ms between actions |
| `bash scripts/e2e-watch.sh --slow --project=journey` | Watch all journeys slowly |
| `bash scripts/e2e-watch.sh --debug` | Open Playwright Inspector on failure |
| `npm run test:e2e:local` | Merge gate (headless, smoke project) |

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

Fast, stateless page-load and auth-redirect checks. These run in CI.

| File | Tests |
|---|---|
| `quick-smoke.spec.ts` | Q1-Q7 — App load, auth redirect, login, CORS, API guard, nav, booking duplicate |
| `nav-roles.spec.ts` | N1-N3 — Role-correct nav links for user, admin, 404 |
| `broker-smoke.spec.ts` | D1-D4 — Broker page access checks |
| `admin-smoke.spec.ts` | A1-A4 — Admin page access checks |
| `user-journeys.spec.ts` | U1-U4 — User page load checks (saved areas, bookings, insights, listing detail) |

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
| CI workflow (`.github/workflows/ci.yml`) | Unchanged. Runs `--project=smoke` headless. |
| Merge gate (`scripts/run-e2e-local.sh`) | Unchanged. Runs `--project=smoke` headless. |
| `playwright.config.ts` defaults | `headless: true`, no `slowMo`, `workers: 2`. |
| Slow mode | Only activates via explicit `--slow` flag or `--slow-mo=N` arg in `e2e-watch.sh`. Never injected by config or CI. |
| Test coverage | 59 total tests across 14 files. `--project=full` runs everything. |

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
