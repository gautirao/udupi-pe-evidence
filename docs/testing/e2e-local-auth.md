# Canonical E2E: local auth stack (issue #2750, amendment 1)

The canonical gate (`npm run test:e2e:gate`, CI job `e2e-canonical`) no longer depends on a hosted Supabase project.
`scripts/run-e2e-gate.sh` starts, per run and on a per-run docker network:

| Piece | Image (pinned by digest in `scripts/e2e/auth-stack/images.lock`) | Exposed |
|---|---|---|
| fixture Postgres/PostGIS | restored by `scripts/db/restore-test-fixture.sh` (unchanged) | 127.0.0.1 only |
| GoTrue | `supabase/gotrue` | no (network alias `e2e-auth-gotrue`) |
| PostgREST | `postgrest/postgrest` | no (alias `e2e-auth-rest`) |
| gateway | `nginx` (`/auth/v1` -> GoTrue, `/rest/v1` -> PostgREST, loopback-origin CORS) | 127.0.0.1 only |

## Flow
1. Static guards, then FC-26 (production `application.yml` issuer unchanged and no committed config mentions the local gateway).
2. Fixture restore, a template copy of it (`fixture_reference`), then `fixture-grants-overlay.sql` (DML-only grants, V128 re-applied
   verbatim, in-SQL fail-closed assertions).
3. Per-run RS256 keys and anon/service_role JWTs (`mint-keys.mjs`), GoTrue, PostgREST, gateway (`stack-up.sh`).
4. Role users on `@e2e.test` addresses with **generated** passwords (`create-users.sh`), then the unchanged `e2e_seed_identity`.
5. **FC-27 (b)(c)** live RLS / column probe and `privacy-compare.sh` (reference == overlay), **before** the suite.
6. Backend with the issuer set in its subshell only and the datasource pinned on the command line (K7); **K7b** proves it holds JDBC
   sessions on this fixture. Then **FC-27 (a)**: forged / foreign / expired / absent tokens are rejected with 401.
7. Frontend built with `VITE_SUPABASE_URL=<gateway>` and the anon JWT (process env only), **FC-28** bundle check.
8. List phase, suite, K3 scan (+ purge), results phase. Teardown trap removes containers, network and the 0700 key directory.

## Rules
* Local mode never reads `VITE_SUPABASE_*` or role credentials from any `.env` file (`env_file_reads=0`, pinned by
  `scripts/e2e/run-e2e-gate.preflight.test.mjs`).
* Container secrets travel in 0600 `--env-file` files, never `-e`.
* A V128-revoked column that is reachable, or `reference != overlay`, is a hard stop: **never widen the grants**.
* `E2E_AUTH_MODE=hosted` is an explicit, labelled **ENVIRONMENT_GATED** mode: it never prints a gate PASS, never writes
  `.e2e-passed` and exits 6 even when everything passes.
* `E2E_GATE_ALLOW_OPEN_GAPS=1` (local only, refused in CI) turns FC-GAP into a WARN so the rest of the suite can be exercised. The
  run prints `NOT A GATE PASS (open gaps)`, exits 5 and never writes `.e2e-passed`.
* `parse-posts` (edge function) has no local equivalent; no canonical journey calls it.
