# E2E Tests - the gate, the canonical suite, and the legacy estate

## THE gate: `npm run test:e2e:gate` (#2750)

There is exactly one authoritative E2E command:

```bash
npm run test:e2e:gate
```

It is `scripts/run-e2e-gate.sh`: static guards, then `playwright --list` collection, then the
canonical suite against a real frontend build + real backend + a disposable local PostGIS fixture
(per-worktree container, never the shared fixture, loopback-only), then the results phase of
`scripts/e2e/check-canonical-journeys.mjs`. It prints `CANONICAL E2E GATE: PASS @ <sha>` only after the
results phase verified the run, and fails closed on any skipped, flaky, interrupted, missing or
unexecuted journey, and on any role credential value found in the run artefacts.
`NOT A GATE RUN: <reason>` (exit 3) means a precondition was missing and nothing ran. CI's
`e2e-canonical` job calls the same checker script, so a local pass validates the code CI runs.

- Supported journeys J01-J16: [`e2e/canonical/journey-matrix.json`](canonical/journey-matrix.json)
  (single source), human view in [`docs/testing/e2e-journey-matrix.md`](../docs/testing/e2e-journey-matrix.md).
- Retirement of the legacy estate, one row per file with a final decision:
  [`docs/testing/e2e-retirement-manifest.csv`](../docs/testing/e2e-retirement-manifest.csv).
- Counts (generated, never hand-typed): [`docs/testing/e2e-inventory.md`](../docs/testing/e2e-inventory.md),
  regenerate with `python3 -I scripts/e2e/gen-e2e-inventory.py`.
- Guards: `npm run test:e2e:guard` (estate guard + journey static check, ~1s, also run by the
  pre-push hook and CI) and `npm run test:e2e:guard:unit` (`node --test scripts/e2e/*.test.mjs`).
- New permanent Playwright coverage must extend the canonical suite for a documented journey gap, or
  carry an explicit specialist reason as a `RETAIN_SPECIALIST` manifest row; the estate guard fails on
  any unlisted spec.
- `.e2e-passed` (bare HEAD sha) is written ONLY by this gate, and only on a full PASS with local auth,
  no open gaps and a clean working tree. A dirty tree prints PASS with `.e2e-passed NOT written` (exit 0);
  open gaps exit 5 and a hosted-auth run exits 6 (ENVIRONMENT_GATED) - neither is a PASS. The pre-push
  hook runs static guards only and neither reads nor writes the sentinel.
- Everything else below (`test:e2e:local`, `e2e-watch.sh`, the `journey`/`full`/`integration-ui` projects)
  is the LEGACY estate: NOT the gate, tracked for retirement per the manifest. The legacy `smoke`
  project, the `playwright-pr` CI job and the `udupi-canonical` fixture profile are retired.
- **LEGACY runners (#2850 PR-7).** `playwright.config.ts` has no default target: it throws at load
  unless `PLAYWRIGHT_BASE_URL` and `BACKEND_BASE_URL` are both set and loopback, and `VITE_SUPABASE_URL`, `FRONTEND_BASE_URL`,
  `VITE_API_BASE_URL`, `OPENSEARCH_URL` and `SUPABASE_DB_HOST` are loopback whenever they are set in the Playwright process env
  (the target env vars the kept legacy specs read; enumerated in the PR-7 evidence). `scripts/run-e2e-local.sh` (so `npm run test:e2e:local` and `npm run test:e2e:headed`) and
  `scripts/e2e-watch.sh` (so `npm run test:e2e:watch` and `test:e2e:watch:slow`) are **DISABLED**: each refuses unconditionally
  with exit 3 and a pointer to `npm run test:e2e:gate` (follow-up #2854). The `journey`/`full`/`integration-ui` projects are only
  fenced at config load. **Known limitation (#2854):** a browser login still authenticates against the Supabase the frontend
  was BUILT with (build-time `VITE_SUPABASE_URL`), which the config fence cannot see. The fence is a config-load check on env vars
  only, NOT a runtime request guard: hard-coded hosts inside the (non-editable) legacy specs (for example the unreachable onrender
  `BACKEND_BASE_URL` defaults and a hosted Supabase origin used as a `page.route` mock target) and DB settings a spec reads from a
  file are not enforced. Those gaps are tracked in #2854. No hosted or production route is documented or supported for the legacy runners.
- Post-deploy: `.github/workflows/e2e-post-deploy.yml` runs `playwright.deployed.config.ts`
  (`e2e/deployed/`), a write-free, credential-free reachability check of the deployed site. It is
  **secondary - not the E2E gate**.

## Three suites, one authoritative gate (#2187)

This repo has three layers of Playwright coverage. Only one of them is the
**authoritative CI merge gate** (`npm run test:e2e:gate` locally):

| Suite | Config | Runs against | CI job | Authoritative gate? |
|---|---|---|---|---|
| **Canonical** (`e2e/canonical/`) | `playwright.canonical.config.ts` | A real, locally-built frontend + real locally-run backend + real local Postgres/PostGIS fixture, started IN the CI job itself | `e2e-canonical` in `.github/workflows/ci.yml` | **YES — this is the merge gate.** |
| **Deployed reachability** (secondary — not the E2E gate) | `playwright.deployed.config.ts` (`e2e/deployed/`) | The already-deployed production site (https://propertysignal.in, overridable via repo variable `DEPLOYED_BASE_URL`) + Render backend (repo variable `DEPLOYED_BACKEND_URL`), whatever build is currently live. The defaults live only in the workflow; the config requires explicit URLs. No auth, no writes | `.github/workflows/e2e-post-deploy.yml` (post-merge, not a PR check) | No — secondary reachability check only. Does not exercise the PR's own backend. |
| **Specialist** (`e2e/specialist/`, opt-in, local-only, NOT the gate) | `playwright.specialist.config.ts` | The gate's per-worktree local stack (loopback only), started by `npm run test:e2e:specialist` | None (refused in CI; never in pre-push) | No — browser-only behaviour kept on purpose; never E2E evidence. See [`e2e/specialist/README.md`](specialist/README.md) |
| **LEGACY** (the remaining `*.spec.ts` files under `e2e/`, including `journey/` and `integration-ui/`; each has a manifest row, most tracked by a follow-up issue) | `playwright.config.ts`, `journey`/`integration-ui`/`full` projects | Config-load fence: the config refuses to load unless both base URLs are explicit loopback URLs (a frontend built against hosted Supabase is NOT covered, #2854). `scripts/run-e2e-local.sh` and `scripts/e2e-watch.sh` are DISABLED (#2854) | Not run in CI at all | No — developer-invoked only, never E2E evidence (`npm run test:e2e:watch`, `bash scripts/e2e-watch.sh --project=journey`, etc.) |

Specialist suite (opt-in, local-only, never E2E evidence): see [`e2e/specialist/README.md`](specialist/README.md).

**Why canonical is authoritative:** it is the only suite that builds and
exercises the PR's own frontend AND backend code together against a real
database, with `canonical-global-setup.ts`'s build-sha provenance check
proving the served build actually matches the commit under test. The
deployed reachability check tests the live site's render/CORS/health but
never touches the PR's backend — see `e2e/canonical/README.md`'s module
docstring in `playwright.canonical.config.ts` for the full "why" of the
canonical harness's guards. The reachability check is a secondary, low-cost
post-deploy signal (secondary — not the E2E gate); it is **not** where a real
regression should be caught, and a green run proves nothing about the merged
backend (Render autoDeploy is off).

**Role coverage — local vs. CI:** the canonical config's `canonical-<role>`
projects (`user`/`broker`/`admin`) are included ADDITIVELY only when that
role's credentials are present in the environment (`roleCredentialsPresent()`
in `playwright.canonical.config.ts` — environment gating by project
selection, never `test.skip`). For a local/direct developer run this is
permissive: with no role credentials exported, only `canonical-anon` is
selected, and that is a normal, anon-capable result, not an error.

The gate (`npm run test:e2e:gate`, and CI's `e2e-canonical` job, which runs the
same `scripts/run-e2e-gate.sh`) is stricter, by design: in its default LOCAL
auth mode it generates the three role users per run in the local GoTrue (no
repository secret and no env file is read), and its list and results phases
fail closed if any of the four expected projects (`canonical-anon`,
`canonical-user`, `canonical-broker`, `canonical-admin`) or any matrix journey
is missing, so a role's coverage can never silently shrink to anon-only.

**File/test counts:** generated, not hand-typed. See
[`docs/testing/e2e-inventory.md`](../docs/testing/e2e-inventory.md) (BEFORE = the base the retirement
series started from, AFTER = current) and regenerate it with
`python3 -I scripts/e2e/gen-e2e-inventory.py`. The number Playwright actually collects and executes is
printed by `npm run test:e2e:gate` (`--list` count and executed count must match); role-gated tests run
once per role project, so static call sites and executed tests differ by design.

## Quick reference

| Command | What it does |
|---|---|
| `npm run test:e2e:gate` | **THE gate** (#2750): guards + collection + isolated stack + canonical run + fail-closed results phase. Prints `CANONICAL E2E GATE: PASS @ <sha>` or fails. |
| `npm run test:e2e:guard` | Static estate guard + journey-matrix check (~1s, no stack; the pre-push hook runs the same) |
| `npm run test:e2e:canonical` | Builds with the current commit's sha baked in and runs the canonical suite WITHOUT the guards, stack or results phase (what the gate and CI call internally). **The merge gate** — builds with the current commit's sha baked in, runs the canonical suite. Requires a real local backend already running (see `e2e/canonical/README.md`) or CI's `e2e-canonical` job, which starts one itself. |
| `npm run test:e2e:watch` | Headed browser, 1 worker, normal speed (legacy/specialist suites) |
| `npm run test:e2e:watch:slow` | Headed browser, 1 worker, 800ms between actions |
| `bash scripts/e2e-watch.sh --slow --project=journey` | Watch all journeys slowly |
| `bash scripts/e2e-watch.sh --debug` | Open Playwright Inspector on failure |
| `npm run test:e2e:local`, `npm run test:e2e:headed` | **DISABLED (fail-closed, exit 3)**: `scripts/run-e2e-local.sh` refuses unconditionally (without `--project` it still exits 2 first). Use `npm run test:e2e:gate`. Follow-up: #2854. |

---

## Legacy runners and configs: what is KEPT, why, and the loopback-only rule (#2850 PR-7)

> LEGACY. None of these is the E2E gate and none produces E2E evidence.

| Item | Status | Why it is kept | Target rule |
|---|---|---|---|
| `playwright.config.ts` (projects `journey`, `integration-ui`, `full`) | KEPT, LEGACY | Sole collector of the legacy specs that are still on disk (`SCHEDULED(#n)` manifest rows); `integration-ui` is also asserted by the guard tests | LOOPBACK-ONLY at config load: throws unless `PLAYWRIGHT_BASE_URL` and `BACKEND_BASE_URL` are set and loopback, and `VITE_SUPABASE_URL`, `FRONTEND_BASE_URL`, `VITE_API_BASE_URL`, `OPENSEARCH_URL`, `SUPABASE_DB_HOST` are loopback when set. Env-var check only, not a runtime request guard (#2854) |
| `e2e/global-setup.ts`, `e2e/global-teardown.ts` | KEPT, LEGACY | Referenced by the legacy config | LOOPBACK-ONLY: no hosted fallback; the Supabase password grant refuses a non-loopback auth URL |
| `scripts/run-e2e-local.sh`, `npm run test:e2e:local`, `npm run test:e2e:headed` | KEPT as a refusal, DISABLED | File kept because removing it costs >= 8 edits (package.json `prepare` chmod, guard FC-34 and its tests, port-isolation and remote-db-safety tests, docs); its backend has no non-hosted route | Refuses unconditionally (exit 3); re-enabling needs a local-auth route (#2854) |
| `scripts/e2e-watch.sh`, `npm run test:e2e:watch`, `test:e2e:watch:slow` | KEPT as a refusal, **DISABLED** | File kept (package scripts and docs reference it); the backend it starts needs hosted Supabase JWT validation, which is not permitted | Refuses unconditionally (exit 3) right after its LEGACY banner; re-enabling needs a local-auth route (#2854) |
| `npm run test:e2e:journey`, `test:e2e:full`, bare `npm run test:e2e` | KEPT, LEGACY | Still referenced (README.md, docs/LOCAL_BACKEND_DEV.md, spec headers); removal needs a zero-reference search that fails today | FENCED AT CONFIG LOAD only: `playwright.config.ts` throws unless the frontend and backend base URLs are loopback. **Limitation:** a browser login still authenticates against the Supabase the frontend was BUILT with (build-time `VITE_SUPABASE_URL`); the config only checks the listed env vars when they are set in the Playwright process env, and hard-coded hosts in spec files are not covered. Tracked in #2854 |
| `playwright.deployed.config.ts` (`e2e/deployed/`) | UNCHANGED, secondary reachability check | Post-deploy check, outside this fence by design; **hosted-capable** (it targets the deployed site) | Not covered by the legacy loopback fence |

Specs whose retained tests need an authenticated session are NOT RUNNABLE LOCALLY (the legacy hosted password grant is banned
for the kept runners); they are tracked in #2856.

---

> **DISABLED (#2850 PR-7, #2854):** `scripts/e2e-watch.sh` (and `npm run test:e2e:watch`, `test:e2e:watch:slow`) now refuses
> with exit 3 before starting anything. The watch/slow/debug commands in sections 1-3 and the quick-reference rows above are kept
> as documentation of the legacy workflow and do not run until a local-auth route is added (#2854).

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
bash scripts/e2e-watch.sh --slow e2e/journey/listing-lifecycle.spec.ts

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
bash scripts/e2e-watch.sh --debug -g "L2"
```

You can also set `PWDEBUG=1` to open the Inspector from the start of every test
(not just on failure):

```bash
PWDEBUG=1 bash scripts/e2e-watch.sh e2e/journey/listing-lifecycle.spec.ts
```

---

## 4. Journey structure

The legacy (non-gate, dev-only) specs are organised into Playwright projects; the `smoke` project is retired:

### `journey` — end-to-end user flows (`e2e/journey/`)

Best for watching complete product flows start-to-finish.

| File | Flow |
|---|---|
| `broker-listing-creation.spec.ts` | DL1 — Full 4-step broker listing wizard (create, upload images, confirm address, submit) |
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

### `smoke` — RETIRED (#2750 PR-2)

The `smoke` and `udupi-canonical-smoke` projects, their 8 spec files and the CI `playwright-pr` job
were removed. The auth-free reachability shape now lives in `e2e/deployed/post-deploy.reachability.ts`
(secondary — not the E2E gate; run by `.github/workflows/e2e-post-deploy.yml`).

`nav-roles.spec.ts` and `user-journeys.spec.ts` still exist under `e2e/`; they're part of the
historical/specialist set (developer-invoked only, e.g. via
`bash scripts/e2e-watch.sh e2e/nav-roles.spec.ts`), not a gate.

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
bash scripts/e2e-watch.sh --project=integration-ui   # all integration-ui
bash scripts/e2e-watch.sh --project=full             # everything
```

---

## 5. CI and merge gate safety

| Concern | Status |
|---|---|
| **CI merge gate** (`.github/workflows/ci.yml`, `e2e-canonical` job) | **#2187: this is now the authoritative gate.** Builds frontend+backend from the PR's own commit, stands up a real local Postgres/PostGIS fixture + Spring Boot backend inside the job, runs `npm run test:e2e:canonical`. See the suite table at the top of this file. |
| Post-deploy (`.github/workflows/e2e-post-deploy.yml`) | Secondary — not the E2E gate. Runs `playwright.deployed.config.ts` (write-free, credential-free reachability of the deployed site) after merges to `main`; the former `playwright-pr` CI job is retired. |
| Local pre-push hook (`.githooks/pre-push`) | #2750: runs the two static guards (estate guard + journey static check) and BLOCKS the push on failure. It prints `E2E static guards PASSED - this is NOT the E2E gate` and never claims E2E passed. `PREPUSH_E2E=gate` opts in to the real gate. |
| `playwright.config.ts` defaults | `headless: true`, no `slowMo`, `workers: 2`. |
| `playwright.canonical.config.ts` defaults | `headless: true`, no `slowMo`, `workers: 1` (single shared local fixture DB — see `e2e/canonical/README.md`). |
| Slow mode | Only activates via explicit `--slow` flag or `--slow-mo=N` arg in `e2e-watch.sh`. Never injected by config or CI. |
| Test coverage | See the "File/test counts" note above — verify programmatically, don't trust a hand-typed number. |

---

## Recommended first run

> **DISABLED (#2850 PR-7, tracked in #2854):** `scripts/e2e-watch.sh` refuses every run (exit 3). The commands below are kept as historical legacy documentation only. Use `npm run test:e2e:gate`.

To see the slow-watch experience for the first time, try the listing lifecycle
journey (it needs the broker/user/admin smoke credentials; its tests skip without them):

```bash
bash scripts/e2e-watch.sh --slow e2e/journey/listing-lifecycle.spec.ts
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
