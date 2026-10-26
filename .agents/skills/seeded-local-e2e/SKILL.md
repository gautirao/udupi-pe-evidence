---
name: seeded-local-e2e
description: Execute the canonical seeded local E2E gate (`npm run test:e2e:gate` / `scripts/run-e2e-gate.sh`) against an isolated disposable PostGIS fixture, local GoTrue/PostgREST auth stack, real Spring Boot backend, and production-built Vite frontend. Activate when running `/seeded-local-e2e`, verifying canonical E2E journeys (`e2e/canonical/*.canonical.ts`), or collecting exact-HEAD canonical E2E gate evidence.
---

# Seeded Local E2E Gate (`seeded-local-e2e`)

## Role & Mission

Execute the repository's authoritative, self-contained canonical E2E gate (`npm run test:e2e:gate` -> `bash scripts/run-e2e-gate.sh`) on the exact current `HEAD` SHA of a clean worktree, capture structured gate evidence, and diagnose any failure using RTK and JCodeMunch without manual stack setup.

---

## 1. Pre-Flight & Exact-HEAD Verification

Before running the gate in the target worktree:

1. **Verify exact HEAD and clean working tree**:
   ```bash
   rtk git rev-parse HEAD
   rtk git status --short
   ```
   - `scripts/run-e2e-gate.sh` checks `git status --porcelain --untracked-files=normal` (ignoring `.e2e-passed`). Any tracked or untracked changes mark `DIRTY > 0` and prevent `.e2e-passed` sentinel generation.
2. **Verify no ambient `SPRING_*` or non-loopback overrides**:
   - The gate refuses any inherited `SPRING_*` variable, `PRIVACY_SNAPSHOT_SQL`, `CANONICAL_SKIP_SHA_PROVENANCE`, or non-loopback `PLAYWRIGHT_BASE_URL` / `BACKEND_BASE_URL` / `VITE_SUPABASE_URL` (K7 / FC-15 / FC-25).

---

## 2. Single Canonical Invocation

Run the gate from the target worktree root with a single command:

```bash
E2E_AUTH_MODE=local \
E2E_GATE_EVIDENCE_DIR=/tmp/agy-<issue-or-pr>-e2e-evidence \
npm run test:e2e:gate
```

Optional port overrides (only if default ports `5375` / `8375` are held by another process):
- `E2E_GATE_FRONTEND_PORT=<port>` (default `5375`)
- `E2E_GATE_BACKEND_PORT=<port>` (default `8375`)
- `E2E_GATE_DB_PORT=<port>` (default auto-selected free port)
- `E2E_GATE_AUTH_PORT=<port>` (default auto-selected free port)

---

## 3. What `npm run test:e2e:gate` Automatically Provisions & Executes

Do **not** manually start Postgres, GoTrue, Spring Boot, or Vite before invoking `npm run test:e2e:gate`. `scripts/run-e2e-gate.sh` orchestrates the entire lifecycle end-to-end:

1. **Static Estate, Journey Matrix & Config Guards**:
   - `node scripts/e2e/check-e2e-estate.mjs`
   - `node scripts/e2e/check-canonical-journeys.mjs --phase=static`
   - `node scripts/e2e/check-local-auth.mjs --phase=env` and `--phase=config` (FC-25 / FC-26)
2. **Isolated Disposable PostGIS Container & Deterministic Seed Restoration** (`scripts/db/restore-test-fixture.sh`):
   - Starts a per-worktree container `pg-gate-<worktree-slug>-<backend-port>` (never the shared `pg-test-fixture` container).
   - Applies Flyway migrations (`V0`, `V0.1`, `V1..V*`, plus `V65` JDBC backfill) and verifies `flyway_schema_history` count and `property_listings.geog`.
   - Loads ordered, idempotent SQL fixtures with fail-closed row-count assertions:
     - `discover-smoke-seed.sql`
     - `navigation-hierarchy-fixture-seed.sql`
     - `navigation-active-revision-fixture-seed.sql`
     - `navigation-hierarchy-fixture-listings-seed.sql`
     - `navigation-hierarchy-fixture-rent-listings-seed.sql`
     - `navigation-hierarchy-schools-agri-fixture-seed.sql`
     - `commercial-listings-seed.sql`
     - `area-trends-2581-udupi-navigation-seed.sql`
     - `udupi-agri-destination-seed.sql`
3. **Local GoTrue / PostgREST Auth Stack (`E2E_AUTH_MODE=local`) & FC-27(b)(c) Probes**:
   - Starts per-run containers (`<auth-prefix>-gw`, `<auth-prefix>-rest`, `<auth-prefix>-gotrue`) on an isolated Docker network (`scripts/e2e/auth-stack/stack-up.sh`).
   - Creates per-run `@e2e.test` role users (`admin`, `broker`, `dealer` alias, `user`, and `E2E_SIGNOUT_USER_*`) with generated passwords in a `0700` temp directory (`scripts/e2e/auth-stack/create-users.sh`) and removes stale `e2e/canonical/fixtures/*-auth.json` state files.
   - Runs **FC-27(b)(c)** live RLS and privacy probes (`rls-probe-seed.sql` -> `rls-probe.mjs` -> `rls-probe-cleanup.sql`, `privacy-compare.sh`).
   - Verifies Playwright test collection (`playwright test --config=playwright.canonical.config.ts --list`) against `e2e/canonical/journey-matrix.json` (`check-canonical-journeys.mjs --phase=list`).
4. **Real Spring Boot Backend & Production-Built Vite Frontend**:
   - Starts `apps/api` on `localhost:$BE_PORT` (default `8375`) with cloud/R2/Supabase secrets scrubbed, `spring.datasource.url` pinned to the disposable PostGIS container, `LOCAL_DEV_STORAGE_ENABLED=true`, `PROPERTY_REQUESTS_ENABLED=true`, rate limiters off, and K7b `pg_stat_activity` session verification.
   - Runs **FC-27(a)** (`auth-negatives.mjs`) against the live backend to verify forged/tampered/expired/unauthenticated JWTs are rejected.
   - Builds `apps/web` with `VITE_BUILD_SHA=$(git rev-parse HEAD)` and runs **FC-28** (`check-local-auth.mjs --phase=bundle`) to confirm the built bundle points to the local auth gateway and contains zero hosted Supabase hosts.
   - Playwright's `webServer` launches `npm --prefix apps/web run preview -- --port <FE_PORT> --strictPort` (default `5375`).
5. **Canonical Playwright Suite Execution** (`playwright.canonical.config.ts`):
   - Runs `npm run test:e2e:canonical -- --workers=1` (`retries=0`, `workers=1`, `locale: 'en-IN'`, `timezoneId: 'Asia/Kolkata'`) across `canonical-anon` and role-tagged setup/test project pairs (`canonical-setup-user` -> `canonical-user`, `canonical-setup-broker` -> `canonical-broker`, `canonical-setup-admin` -> `canonical-admin`).
6. **Evidence Collection, K3 Credential Scan & Sentinel Generation**:
   - Copies credential-clean artifacts to `E2E_GATE_EVIDENCE_DIR`: `results.json`, `list.json`, `list-phase.out`, `list-phase.err`, `fc27*.log`, `fc28*.log`, `auth-stack-up.log`, `auth-create-users.log`, `build.log`, `run.log`, and `backend.log`.
   - Runs K3 credential scan (`check-canonical-journeys.mjs --phase=scan --purge`), `--phase=results` verification, and post-run FC-28 bundle check.
   - Writes `.e2e-passed` with `<HEAD_SHA>` when `DIRTY=0`. If `.e2e-passed` dirties git status afterward and should not be committed, clean it (`rtk git checkout -- .e2e-passed 2>/dev/null || rm -f .e2e-passed`).
7. **Automatic Teardown**:
   - An `EXIT`/`INT`/`TERM`/`HUP` trap terminates the backend, removes the `e2e-auth-*` and `pg-gate-*` containers and Docker network, deletes temp directories, and verifies ports are released.

---

## 4. Success & Failure Criteria

### Success Criterion
The gate certifies an exact `HEAD` **only** when run on a clean worktree (`DIRTY=0`), exits `0`, and prints:
```text
CANONICAL E2E GATE: PASS @ <exact-head-sha> list: ... results: ... unexpected=0 flaky=0 (sentinel written)
```
A dirty-worktree suite `PASS` (`DIRTY > 0`) still exits `0` when all journeys pass, but prints `.e2e-passed NOT written` and does **not** generate the `.e2e-passed` sentinel or certify an exact commit SHA.

### Failure Handling
If the gate exits non-zero:
1. **Inspect evidence logs via `rtk`** (never dump full logs into context):
   - Check summary tail and failures in `$E2E_GATE_EVIDENCE_DIR/run.log`, `$E2E_GATE_EVIDENCE_DIR/backend.log`, or `test-results/gate/fixture-restore.log`.
2. **Navigate code with JCodeMunch** (`resolve_repo`, `search_symbols`, `search_text`, `get_symbol_source`, `get_file_content`) before reading files to edit.
3. **Fix genuine regressions** in the worktree, run focused unit/static guards (`rtk npm run test:e2e:guard`), complete `pre-push-reviewer` audit until `CLEAN FOR COMMIT`, commit and push the new `HEAD` SHA, and re-run `npm run test:e2e:gate` on the new exact `HEAD`.

---

## 5. Strict Anti-Patterns ("Never Do")

- **Never** use legacy E2E runners (`npm run test:e2e`, `playwright.config.ts`, `scripts/run-e2e-local.sh`) as a substitute for `npm run test:e2e:gate`.
- **Never** run the canonical gate against hosted Supabase (`E2E_AUTH_MODE=hosted` exits `6` as `ENVIRONMENT_GATED` and is never a gate pass), production/preview URLs (`pages.dev`, `supabase.co`), or the shared `pg-test-fixture` container.
- **Never** manually spin up duplicate Postgres, GoTrue, backend, or frontend processes before running `npm run test:e2e:gate`.
- **Never** re-run a passing gate on an unchanged `HEAD` SHA.

---

## 6. Mandatory Owner Approval Gate

- Posting `CANONICAL E2E GATE: PASS @ <sha>` on a GitHub PR is **verification evidence only** — it is **NOT** merge authorization.
- Every PR still requires:
  1. Exact-HEAD independent PR review reconciliation (`0` unresolved findings, `0` contradictions, `2` consecutive quiet polls).
  2. Merge requires a new top-level human owner comment exactly `OWNER_APPROVED_TO_MERGE head:<full-current-sha>`, posted after the final clean review of that exact HEAD.
