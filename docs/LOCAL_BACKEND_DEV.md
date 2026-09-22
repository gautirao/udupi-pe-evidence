# Local Backend Development

Two ways to run the Spring Boot backend locally. Both keep **hosted Supabase
Auth** for JWT validation — the only thing that changes is where the
database lives.

```
./backend/run-local.sh
  Local Spring Boot -> remote Supabase Postgres -> hosted Supabase Auth
```
```
./scripts/dev/local-fixture-backend.sh
  Local Spring Boot -> disposable local Postgres/PostGIS fixture -> hosted Supabase Auth
```

Use `run-local.sh` for normal day-to-day development against the shared
remote database. Use `local-fixture-backend.sh` when you want to test
mutating/destructive changes, run repeated experiments, or do browser
verification without touching the shared remote Supabase database at all.

---

## Recommended manual workflow

```bash
# Terminal 1 — safe local backend fixture
./scripts/dev/local-fixture-backend.sh

# Terminal 2 — frontend
npm run dev

# Terminal 3 — optional authenticated backend verification
curl -H "Authorization: Bearer $(cat <token-file-path-from-terminal-1-output>)" http://localhost:8085/api/admin/city-launch/cities
```

`<token-file-path-from-terminal-1-output>` is printed by Terminal 1 — look
for a line like `>>> Access token written to: <path>`.

---

## 1. Prerequisites

- Docker Desktop or Docker Engine, **with the daemon running** (the fixture
  script fails fast with a clear error if it isn't).
- `psql`, `curl`, `jq` on `PATH`.
- Java/Maven toolchain already required by `backend/run-local.sh` — see that
  script's own header comment; nothing additional is required for the
  fixture workflow.

## 2. Required env files and variables

Both workflows read from the same three env files at the repo root /
`backend/`. Neither script prints secret values.

| File | Variables | Used by |
|---|---|---|
| `backend/.env` | `SUPABASE_DB_HOST`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `AI_API_KEY` | `run-local.sh` (all five, remote datasource + JWT + AI). `local-fixture-backend.sh` sources this whole file but only ever uses `SUPABASE_PROJECT_REF` and `AI_API_KEY` from it — it never dereferences/uses `SUPABASE_DB_HOST`/`SUPABASE_DB_PASSWORD` afterward, and never touches the remote database. |
| `.env.e2e` | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `local-fixture-backend.sh` only — used to log in to **hosted** Supabase Auth (same account/flow as `e2e/admin-approval.spec.ts`). |
| `.env` (repo root) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `local-fixture-backend.sh` only — used for the hosted Supabase Auth password-grant login call. |

If any required file or variable is missing, both scripts print a specific
`ERROR:` line naming the missing file/variable and exit non-zero before
doing anything else.

## 3. Normal remote-Supabase startup

```bash
./backend/run-local.sh
```

No arguments needed. This is unchanged from before #1981: it loads
`backend/.env`, validates the five required variables, and runs
`mvn -DskipTests spring-boot:run` against the remote Supabase Postgres
database, on port `${SERVER_PORT:-8085}`.

The only new behavior in this script (added for #1981) is the
`SKIP_BACKEND_ENV_LOAD` guard: if `SKIP_BACKEND_ENV_LOAD=true` is set in the
calling environment, the script skips sourcing `backend/.env` and instead
trusts the caller-supplied environment variables. This is how
`local-fixture-backend.sh` reuses `run-local.sh` for its final startup step
without pulling in the remote datasource values. You should never need to
set this yourself for normal remote-Supabase development.

## 4. Local-fixture startup

```bash
./scripts/dev/local-fixture-backend.sh
```

Works from any current working directory (it resolves paths from its own
location). Steps, in order:

1. **Prerequisite validation** — checks `docker`, `psql`, `curl`, `jq` are
   on `PATH`, and that `backend/.env`, `.env.e2e`, `.env`, and
   `scripts/db/restore-test-fixture.sh` all exist.
2. **Restore the fixture** — calls `scripts/db/restore-test-fixture.sh`
   verbatim (no second migration/fixture implementation). That script
   drops and recreates a disposable, **per-invocation** Docker
   Postgres/PostGIS container (see [Per-invocation fixture](#4a-per-invocation-fixture-2568)
   below — no shared, machine-wide singleton), applies every Flyway
   migration, and loads the synthetic E2E seed data.
3. **Safety gate (fail-closed)** — before any DB write or auth call,
   asserts: the target host is hardcoded to `localhost` (no code path can
   redirect it to a remote host — this is a structural property of the
   script, not a runtime check), THIS invocation's own fixture container
   (by its own generated/overridden name — never a hardcoded
   `pg-test-fixture` lookup) is running, and the fixture Postgres is
   reachable via `psql SELECT 1` on THIS invocation's own port. Any
   failure aborts with a non-zero exit before touching the database or
   logging in.
4. **Hosted Supabase Auth login** — logs in as `ADMIN_EMAIL`/`ADMIN_PASSWORD`
   against `${VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`
   (the same password-grant shape `e2e/admin-approval.spec.ts` uses),
   extracts the admin's UUID and access token, and validates both are
   present/well-formed before continuing.
5. **Idempotent local admin seed** — inside the local fixture only, inserts
   `auth.users(id)` and `public.user_roles(user_id, 'admin')` for that
   UUID, both `ON CONFLICT DO NOTHING`. Safe to re-run any number of times
   without creating duplicate rows.
6. **Start Spring Boot** — `exec`s into `backend/run-local.sh` with
   `SKIP_BACKEND_ENV_LOAD=true` plus local datasource overrides
   (`SUPABASE_DB_HOST=localhost`, `SUPABASE_DB_PORT=$PG_TEST_PORT`,
   `SUPABASE_DB_NAME=postgres`, `SUPABASE_DB_USER=postgres`,
   `SUPABASE_DB_PASSWORD=$PG_TEST_PASSWORD`, Hikari SSL disabled), while
   keeping `SUPABASE_PROJECT_REF` so Spring still validates real hosted
   Supabase JWTs. Runs on the default backend port (`${SERVER_PORT:-8085}`,
   same as `run-local.sh`).

Spring Boot then runs in the foreground on the default port, same as with
`run-local.sh` — but every query goes to the disposable local fixture
instead of the remote database.

## 4a. Per-invocation fixture (#2568)

`local-fixture-backend.sh` no longer defaults to a shared, machine-wide
`pg-test-fixture` container on port `5434`. Every invocation that doesn't
explicitly override `PG_TEST_CONTAINER_NAME` / `PG_TEST_PORT` now gets its
own uniquely-named container (`pg-fixture-<worktree-slug>-<pid>`) on its own
probed-free port (starting from `5434` and moving up). This is what lets
multiple concurrent invocations — different worktrees, different overnight
lanes, or two runs in the same worktree — coexist safely: before this,
`restore-test-fixture.sh`'s unconditional `docker rm -f` of the shared
container name meant a second invocation would silently destroy the first
invocation's fixture mid-run.

The script prints the exact values it picked at startup:

```
>>> Effective fixture config: PG_TEST_CONTAINER_NAME=pg-fixture-myrepo-12345 PG_TEST_PORT=5434 (password masked)
>>> This fixture is exclusively owned by this invocation (PID 12345). It will NOT be torn down
    automatically (Step G below execs into the backend and stays foreground) — remove it
    yourself when you are done: docker rm -f pg-fixture-myrepo-12345
```

Nothing tears the container down automatically (unchanged from before this
fix — the script `exec`s into the backend and stays in the foreground, so no
`EXIT` trap survives to do it). Remove it yourself with the `docker rm -f`
command the script prints, or let a later invocation's own idempotent
`restore-test-fixture.sh` re-run replace its **own** container (never
another invocation's).

To seed the navigation-hierarchy fixture (`scripts/dev/seed-navigation-hierarchy-fixture.sh`)
into a fixture started this way, pass the same `PG_TEST_CONTAINER_NAME` /
`PG_TEST_PORT` values through:

```bash
PG_TEST_CONTAINER_NAME=pg-fixture-myrepo-12345 PG_TEST_PORT=5434 \
  bash scripts/dev/seed-navigation-hierarchy-fixture.sh
```

`PG_TEST_CONTAINER_NAME` / `PG_TEST_PORT` remain fully overridable exactly as
before (e.g. `PG_TEST_CONTAINER_NAME=pg-test-fixture-2454 PG_TEST_PORT=5437`,
the manual-per-issue convention several past lanes' PR evidence already
used) — only the *fallback* when the caller leaves them unset changed.

## 5. Custom port

`scripts/db/restore-test-fixture.sh` defaults to host port `5434` for the
fixture container; `local-fixture-backend.sh` probes forward from that same
default when `PG_TEST_PORT` is not set (see [4a](#4a-per-invocation-fixture-2568)
above). To pin a specific port yourself:

```bash
PG_TEST_PORT=5435 ./scripts/dev/local-fixture-backend.sh
```

## 6. Custom fixture password

The fixture Postgres superuser password defaults to `fixture_test_only`
(only ever used inside the disposable local container — never the real
Supabase password):

```bash
PG_TEST_PASSWORD=mysecret ./scripts/dev/local-fixture-backend.sh
```

Neither script prints this value.

## 7. Authenticated verification

Near the end of its login step, `local-fixture-backend.sh` writes the
hosted Supabase access token to a mode-600 temp file and prints its path:

```
>>> Access token written to: <path> (mode 600; build your own 'Authorization: Bearer $(cat <path>)' header)
```

Use it to call an endpoint that is genuinely admin-gated:

```bash
curl -H "Authorization: Bearer $(cat <token-file-path-from-script-output>)" http://localhost:8085/api/admin/city-launch/cities
```

`GET /api/admin/city-launch/cities`
(`backend/src/main/java/com/example/realestate/discover/citylaunch/AdminCityLaunchController.java`)
is annotated `@IsAdmin`, which resolves to
`@PreAuthorize("hasAuthority('ROLE_ADMIN')")`. A `200` response here proves
two things at once: the hosted JWT validated correctly, **and** the local
DB role conversion (the seeded `user_roles` row → `ROLE_ADMIN` authority)
worked. Without the seeded local admin role, the same request returns
`403`.

**Known limitation — token file is not auto-cleaned on the happy path.**
`local-fixture-backend.sh` sets an `EXIT` trap to remove the token file,
but it then `exec`s into `backend/run-local.sh` at the end to keep Spring
Boot in the foreground — and bash's `EXIT` trap does not fire across
`exec`. The token file therefore intentionally survives past the script's
own lifetime so you can use it while Spring Boot is running. Remove it
manually when you're done:

```bash
rm -f <token-file-path-from-script-output>
```

## 8. Starting the frontend for browser verification

```bash
npm run dev
```

Standard Vite dev server. It points at whichever backend is currently
running on the configured port — start either `run-local.sh` or
`local-fixture-backend.sh` first, then `npm run dev` in a separate
terminal.

## 9. Phase 7A / Playwright browser workflow

The `e2e/` directory holds the project's Playwright suite (see
`e2e/admin-approval.spec.ts`, `e2e/admin-smoke.spec.ts`,
`e2e/admin-intelligence-smoke.spec.ts`, etc.). Relevant `package.json`
scripts:

```bash
npm run test:e2e          # playwright test
npm run test:e2e:smoke    # --project=smoke
npm run test:e2e:journey  # --project=journey
npm run test:e2e:full     # --project=full
npm run test:e2e:local    # scripts/run-e2e-local.sh
npm run test:e2e:headed   # scripts/run-e2e-local.sh --headed --workers=1
```

Admin-scoped specs require `ADMIN_EMAIL`/`ADMIN_PASSWORD` in the
environment (the same variables from `.env.e2e` used by
`local-fixture-backend.sh`) and skip themselves if those aren't set. This
doc doesn't change the Playwright setup — just be aware that whichever
backend workflow you started determines what data those specs will see.

## 10. Cleanup / restart behaviour

`scripts/db/restore-test-fixture.sh` always **drops and recreates** its
target container on every run — it is not incremental. Since #2568 that
target is this invocation's own per-invocation container (see
[4a](#4a-per-invocation-fixture-2568)), not a shared singleton, so re-running
`./scripts/dev/local-fixture-backend.sh` only ever drops/recreates a
container from an earlier run of the *same* invocation slug — never another
concurrent invocation's fixture. The whole workflow (fixture restore →
safety gate → login → seed → Spring Boot start) was verified end-to-end to
be idempotent — re-running it does not create duplicate seed rows (the
`auth.users`/`user_roles` inserts are `ON CONFLICT DO NOTHING`).

To stop the backend: `Ctrl-C` the foregrounded Spring Boot process in
Terminal 1.

For a full manual cleanup of the fixture container, use the exact name the
script printed at startup (`>>> Effective fixture config:
PG_TEST_CONTAINER_NAME=...`):

```bash
docker rm -f <the PG_TEST_CONTAINER_NAME the script printed>
```

## 11. Returning to normal remote-Supabase development

Just run `./backend/run-local.sh` again — no special steps needed. The
fixture script never modifies `backend/.env` and never touches the remote
Supabase database, so remote-Supabase development is entirely unaffected
by anything `local-fixture-backend.sh` does.

## 12. Troubleshooting

**Docker daemon not running**
Both `restore-test-fixture.sh` (called by `local-fixture-backend.sh`) and
Docker-dependent steps fail fast with `ERROR: Docker daemon is not
running. Start Docker and retry.` Start Docker Desktop/Engine and re-run.

**Port conflict on 5434 (fixture Postgres)**
Override with `PG_TEST_PORT` (see §5), e.g. `PG_TEST_PORT=5435
./scripts/dev/local-fixture-backend.sh`.

**Port conflict on the backend's own port (default 8085)**
Both workflows launch Spring Boot via `backend/run-local.sh`, which uses
`${SERVER_PORT:-8085}`. If `backend/.env` sets `SERVER_PORT`, that value is
honored by both workflows (it's sourced/inherited the same way). To use a
different port without editing `backend/.env`, export `SERVER_PORT` in the
calling shell before running either script.

**Supabase Auth login errors**
If `local-fixture-backend.sh` fails at the login step (`hosted Supabase
Auth login did not return a valid user id` / `... access token`), check:
- `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env.e2e` are correct.
- That account actually exists on the hosted Supabase project referenced
  by `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` in the root
  `.env`.

**Flyway-related failures**
`local-fixture-backend.sh` starts Spring Boot with
`SPRING_FLYWAY_ENABLED=false` for the local-fixture path. This is
by design, not a bug to work around: `restore-test-fixture.sh` already
fully migrates the fixture schema itself, via its own Docker Flyway run
against a temp copy of the migration files (with `CONCURRENTLY` stripped
for throwaway-fixture safety). Those temp files checksum differently than
the real files under
`backend/src/main/resources/db/migration`, so Spring's embedded Flyway
would fail with checksum-mismatch errors on startup if left enabled — this
was found and fixed during end-to-end verification of this workflow. The
remote-Supabase workflow (`run-local.sh` on its own) is unaffected and
still runs embedded Flyway normally.

**401 vs 403 on `/api/admin/city-launch/cities`**
- **401** — the JWT itself is invalid, expired, or missing. Check that the
  hosted Supabase Auth login step in §4/§7 actually succeeded and printed
  a token file path, and that `SUPABASE_PROJECT_REF` in `backend/.env`
  matches the hosted project the token was issued by.
- **403** — the JWT is fine, but the caller lacks the `ROLE_ADMIN`
  authority. Check that the local admin seed step (§4 step 5) actually ran
  and inserted a lowercase `'admin'` row into `user_roles` for the correct
  UUID inside the local fixture — the DB role value must be the lowercase
  string `'admin'`, since role→authority mapping upper-cases it to
  `ROLE_ADMIN`.
