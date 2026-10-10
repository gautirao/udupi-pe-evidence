#!/usr/bin/env bash
# scripts/run-e2e-gate.sh - issue #2750          npm run test:e2e:gate
#
# THE authoritative E2E gate: the canonical journey suite (playwright.canonical.config.ts) against a
# real frontend build + real backend + a disposable local PostGIS fixture + a LOCAL pinned auth stack
# (GoTrue + PostgREST + nginx gateway, scripts/e2e/auth-stack), with every journey in
# e2e/canonical/journey-matrix.json required to be collected AND to pass. It fails closed on any
# skipped, flaky, interrupted, missing or unexecuted journey.
#
# It prints "CANONICAL E2E GATE: PASS @ <sha>" only after the results phase of
# scripts/e2e/check-canonical-journeys.mjs verified the run, and only then writes .e2e-passed.
# Anything else is a failure, or "NOT A GATE RUN: <reason>" (exit 3) when the preconditions are
# not met and nothing was started.
#
# AUTH MODES (E2E_AUTH_MODE)
#   local   (DEFAULT) role users are created in the local GoTrue with per-run GENERATED passwords on
#           @e2e.test addresses; the frontend is built against the local gateway; the backend validates
#           tokens against the local issuer. No hosted Supabase call is made and NO .env file is read for
#           VITE_SUPABASE_* or role credentials (the gate counts its env-file reads and the preflight
#           test pins that count to 0). FC-25..FC-28 apply.
#   hosted  ENVIRONMENT_GATED. The legacy path against a hosted Supabase project (credentials from the
#           process env / E2E_ENV_FILE). Always labelled "ENVIRONMENT_GATED", never prints
#           "CANONICAL E2E GATE: PASS", never writes .e2e-passed and exits 6 even when everything passes:
#           it is evidence about the hosted environment, not a gate pass.
#
# Secrets: names only are ever printed. Container secrets travel in 0600 --env-file files inside a 0700
# `mktemp -d` directory, never `-e NAME=value`. All of it is removed by the exit trap.
#
# Isolation (K7): a per-worktree fixture container (never the shared "pg-test-fixture"), loopback-only
# URLs, ports from E2E_GATE_FRONTEND_PORT / E2E_GATE_BACKEND_PORT (defaults 5375 / 8375) plus
# E2E_GATE_AUTH_PORT / E2E_GATE_DB_PORT, rate limiters off exactly as ci.yml (#2255/#2261). No remote
# database is ever used. The datasource is PINNED on the backend command line and every SPRING_* /
# JVM-option / local-config route that could repoint it is refused.
#
# E2E_GATE_ALLOW_OPEN_GAPS=1 (local runs only, refused in CI): makes FC-GAP (journeys whose C2 gap is
# still open) a WARN so the rest of the suite can be exercised. The run then prints
# "NOT A GATE PASS (open gaps)", exits 5 and NEVER writes .e2e-passed.
#
# E2E_GATE_EVIDENCE_DIR=<dir> (local runs only, refused in CI): BEFORE the K3 purge, copies results.json, list.json and the
# gate phase logs into <dir> - each file only if it scans clean on its own (a file holding a credential value is never
# copied). It exists so a run that K3 purges still leaves its counts behind as evidence; it changes no verdict.
#
# Run from anywhere; it cd's into the checkout that contains this script (so an npx/config lookup can
# never resolve to another clone). Use absolute paths when invoking from an agent shell.
set -uo pipefail
set +x

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT" || exit 99

# shellcheck source=dev/lib/port-ownership.sh
source "$SCRIPT_DIR/dev/lib/port-ownership.sh"
# shellcheck source=dev/lib/e2e-identity-seed.sh
source "$SCRIPT_DIR/dev/lib/e2e-identity-seed.sh"
# shellcheck source=dev/lib/remote-db-safety.sh
source "$SCRIPT_DIR/dev/lib/remote-db-safety.sh"

AUTH_STACK="$SCRIPT_DIR/e2e/auth-stack"
SHARED_FIXTURE_CONTAINER="pg-test-fixture"
CRED_NAMES=(ADMIN_EMAIL ADMIN_PASSWORD BROKER_EMAIL BROKER_PASSWORD DEALER_EMAIL DEALER_PASSWORD SMOKE_USER_EMAIL SMOKE_USER_PASSWORD)
# Hosted mode ONLY: the whitelist read (never sourced) from the process env / env files.
HOSTED_ENV_WHITELIST=("${CRED_NAMES[@]}" VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY)
# Every read_env_var call appends one byte here. A FILE, not a variable: read_env_var runs inside command-substitution
# subshells, where a counter would silently stay 0 (the preflight test's hosted control arm caught exactly that).
# The local-mode preflight test pins the count to 0.
ENV_READS_FILE="$(mktemp)"
trap 'rm -f "$ENV_READS_FILE"' EXIT

not_a_gate_run() {
  echo "NOT A GATE RUN: $*" >&2
  exit 3
}

# ---------------------------------------------------------------------------------------------
# 0. Refusals that need no stack (FC-15, FC-21, FC-25, K7)
# ---------------------------------------------------------------------------------------------
AUTH_MODE="${E2E_AUTH_MODE:-local}"
case "$AUTH_MODE" in
  local|hosted) ;;
  *) not_a_gate_run "E2E_AUTH_MODE must be 'local' (default) or 'hosted' (ENVIRONMENT_GATED), got an unsupported value" ;;
esac

if [ -n "${CANONICAL_SKIP_SHA_PROVENANCE:-}" ]; then
  not_a_gate_run "CANONICAL_SKIP_SHA_PROVENANCE is set; it disables the build-sha provenance assertion (unset it)"
fi

if [ "${E2E_GATE_ALLOW_OPEN_GAPS:-}" = "1" ] && { [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]; }; then
  not_a_gate_run "E2E_GATE_ALLOW_OPEN_GAPS=1 is refused in CI: the merge gate never tolerates an open journey gap"
fi

if [ -n "${E2E_GATE_EVIDENCE_DIR:-}" ] && { [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]; }; then
  not_a_gate_run "E2E_GATE_EVIDENCE_DIR is a local-evidence aid and is refused in CI"
fi

# K7: anything inherited that could repoint the backend away from the disposable localhost fixture is refused,
# and only the NAMES are printed. (a) every SPRING_* variable (datasource, profiles, SPRING_APPLICATION_JSON,
# SPRING_CONFIG_*, SPRING_PROFILES_INCLUDE, SPRING_SECURITY_OAUTH2_* ...), (b) JVM/Maven option variables that
# carry a spring. or datasource setting, (c) a module-local config directory or application file that Spring
# Boot would pick up from apps/api. The datasource itself is ALSO pinned on the backend command line below.
k7_offenders=""
# CR r2 cycle2 LOW-E: a leftover PRIVACY_SNAPSHOT_SQL once let a fake snapshot pass the FC-27c privacy check. The override no longer
# exists in privacy-compare.sh, but an inherited one is still refused (name only) so nobody believes it is in effect.
[ -z "${PRIVACY_SNAPSHOT_SQL+x}" ] || not_a_gate_run "FC-27c: the caller environment sets PRIVACY_SNAPSHOT_SQL; the privacy snapshot SQL is fixed and cannot be overridden (unset it)"
for n in $(compgen -e); do
  case "$n" in SPRING_*) k7_offenders="$k7_offenders $n" ;; esac
done
[ -z "$k7_offenders" ] || not_a_gate_run "K7: the caller environment sets${k7_offenders}; these can repoint the backend away from the localhost fixture (unset them)"
for n in JAVA_TOOL_OPTIONS JDK_JAVA_OPTIONS MAVEN_OPTS MAVEN_ARGS; do
  if printf '%s' "${!n:-}" | grep -qiE 'spring\.|datasource'; then
    not_a_gate_run "K7: ${n} carries a spring./datasource setting that can repoint the backend (unset it)"
  fi
done
[ ! -e "$ROOT/apps/api/config" ] || not_a_gate_run "K7: apps/api/config exists; Spring Boot would load it and could repoint the datasource (remove it)"
k7_files="$(find "$ROOT/apps/api" -maxdepth 1 \( -name 'application*.yml' -o -name 'application*.yaml' -o -name 'application*.properties' \) 2>/dev/null | head -3)"
[ -z "$k7_files" ] || not_a_gate_run "K7: apps/api holds an application*.yml/.yaml/.properties file that Spring Boot would load from the working directory (remove it)"

if [ "$AUTH_MODE" = "local" ]; then
  # FC-25: process env only. A non-loopback VITE_SUPABASE_URL / E2E_AUTH_ISSUER_URI or ANY inherited
  # SPRING_SECURITY_OAUTH2_* is refused. (The generic SPRING_* refusal above fires first for the latter.)
  fc25_out="$(node "$SCRIPT_DIR/e2e/check-local-auth.mjs" --phase=env 2>&1)"; fc25_rc=$?
  if [ "$fc25_rc" -ne 0 ]; then printf '%s\n' "$fc25_out" >&2; exit 3; fi
  # Local mode never trusts a role credential or Supabase endpoint from the caller: they are regenerated per run.
  for n in "${CRED_NAMES[@]}" VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY E2E_AUTH_ISSUER_URI; do unset "$n"; done
else
  echo "[gate] ENVIRONMENT_GATED: E2E_AUTH_MODE=hosted - hosted Supabase auth. This is NOT the canonical local-auth gate: no sentinel is written, no gate PASS is printed, exit is never 0." >&2
fi

host_of_url() { local h="${1#*://}"; h="${h%%/*}"; case "$h" in \[*\]*) h="${h%%\]*}]";; *) h="${h%%:*}";; esac; printf '%s' "$h"; }
is_loopback_host() {
  case "$1" in
    localhost|"[::1]"|"::1") return 0 ;;
    127.*) [[ "$1" =~ ^127\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] && return 0 ;;
  esac
  return 1
}
port_of_url() { local rest="${1#*://}"; rest="${rest%%/*}"; case "$rest" in *:*) printf '%s' "${rest##*:}";; *) printf '';; esac; }

FE_PORT="${E2E_GATE_FRONTEND_PORT:-5375}"
BE_PORT="${E2E_GATE_BACKEND_PORT:-8375}"
for v in PLAYWRIGHT_BASE_URL BACKEND_BASE_URL; do
  val="${!v:-}"
  if [ -n "$val" ]; then
    is_loopback_host "$(host_of_url "$val")" || not_a_gate_run "$v is not a loopback URL (the canonical suite is local-only)"
  fi
done
[ -n "${PLAYWRIGHT_BASE_URL:-}" ] && [ -n "$(port_of_url "$PLAYWRIGHT_BASE_URL")" ] && FE_PORT="$(port_of_url "$PLAYWRIGHT_BASE_URL")"
[ -n "${BACKEND_BASE_URL:-}" ] && [ -n "$(port_of_url "$BACKEND_BASE_URL")" ] && BE_PORT="$(port_of_url "$BACKEND_BASE_URL")"
export PLAYWRIGHT_BASE_URL="http://localhost:$FE_PORT"
export BACKEND_BASE_URL="http://localhost:$BE_PORT"
export VITE_API_BASE_URL="$BACKEND_BASE_URL"
# Request-a-property (#1793) is DARK BY DEFAULT in production. The canonical TEST STACK turns it on so RQ1/RQ2 (J12) can run:
# the frontend flag is a BUILD-TIME variable, so it is exported here, before the FC-28 build and the suite's own build below
# (both inherit it); the backend flag is set ONLY in the backend subshell further down. Neither is ever written to a committed
# non-test config: FC-14 (scripts/e2e/check-canonical-journeys.mjs) requires both to be enabled in THIS script (ci.yml runs this
# same script, so CI cannot drift) and requires the production defaults (application.yml, deploy configs) to stay false.
export VITE_PROPERTY_REQUESTS_ENABLED=true

WORKTREE_SLUG="$(basename "$ROOT" | tr -c 'a-zA-Z0-9\n' '-' | cut -c1-40)"
PG_NAME="${E2E_GATE_DB_CONTAINER:-pg-gate-${WORKTREE_SLUG}-${BE_PORT}}"
[ "$PG_NAME" = "$SHARED_FIXTURE_CONTAINER" ] && not_a_gate_run "fixture container name equals the shared fixture container ($SHARED_FIXTURE_CONTAINER); the gate needs its own"
# SR LOW-4: the cleanup trap runs `docker rm -f "$PG_NAME"`, so an override may only ever name a gate-owned container.
[[ "$PG_NAME" =~ ^pg-gate- ]] || not_a_gate_run "E2E_GATE_DB_CONTAINER must match ^pg-gate- (the cleanup trap force-removes this container); refusing '$PG_NAME'"
AUTH_PREFIX="${E2E_GATE_AUTH_PREFIX:-e2e-auth-${WORKTREE_SLUG}-${BE_PORT}}"
AUTH_NET="${AUTH_PREFIX}-net"

MAIN_ROOT=""
common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
[ -n "$common" ] && MAIN_ROOT="$(dirname "$common")"

read_env_var() { # <file> <NAME> -> value on stdout (never logged); rc 1 if absent. COUNTS every file read.
  local file="$1" name="$2" line val
  printf x >> "$ENV_READS_FILE"
  [ -f "$file" ] || return 1
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${name}=" "$file" | tail -1)" || return 1
  [ -n "$line" ] || return 1
  val="${line#*=}"
  val="${val%$'\r'}"
  case "$val" in \"*\") val="${val#\"}"; val="${val%\"}" ;; \'*\') val="${val#\'}"; val="${val%\'}" ;; esac
  printf '%s' "$val"
}

AI_API_KEY="${AI_API_KEY:-}"
if [ "$AUTH_MODE" = "hosted" ]; then
  # ---- ENVIRONMENT_GATED hosted mode only: credentials from the process env first, else read-only from env files ----
  if [ -n "${E2E_ENV_FILE:-}" ]; then
    ENV_FILES=("$E2E_ENV_FILE")
  else
    ENV_FILES=("$ROOT/.env.e2e.local" "$ROOT/.env.e2e" "$ROOT/.env")
    [ -n "$MAIN_ROOT" ] && [ "$MAIN_ROOT" != "$ROOT" ] && ENV_FILES+=("$MAIN_ROOT/.env.e2e" "$MAIN_ROOT/.env")
  fi
  for name in "${HOSTED_ENV_WHITELIST[@]}"; do
    [ -n "${!name:-}" ] && continue
    for f in "${ENV_FILES[@]}"; do
      if v="$(read_env_var "$f" "$name")" && [ -n "$v" ]; then export "$name=$v"; break; fi
    done
  done
  [ -z "${BROKER_EMAIL:-}" ] && [ -n "${DEALER_EMAIL:-}" ] && export BROKER_EMAIL="$DEALER_EMAIL"
  [ -z "${BROKER_PASSWORD:-}" ] && [ -n "${DEALER_PASSWORD:-}" ] && export BROKER_PASSWORD="$DEALER_PASSWORD"
  missing=()
  for name in ADMIN_EMAIL ADMIN_PASSWORD BROKER_EMAIL BROKER_PASSWORD SMOKE_USER_EMAIL SMOKE_USER_PASSWORD VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY; do
    [ -z "${!name:-}" ] && missing+=("$name")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    not_a_gate_run "missing required variable(s): ${missing[*]} (hosted mode: set them in the process env or in E2E_ENV_FILE; values are never printed)"
  fi
  for name in ADMIN_EMAIL BROKER_EMAIL SMOKE_USER_EMAIL; do
    case "${!name}" in *@example.com) not_a_gate_run "$name holds a placeholder (*@example.com) value; the gate signs in for real" ;; esac
  done
  if [ -z "${SUPABASE_PROJECT_REF:-}" ]; then
    for f in "$ROOT/apps/api/.env" ${MAIN_ROOT:+"$MAIN_ROOT/apps/api/.env"}; do
      if v="$(read_env_var "$f" SUPABASE_PROJECT_REF)" && [ -n "$v" ]; then SUPABASE_PROJECT_REF="$v"; break; fi
    done
  fi
  if [ -z "${SUPABASE_PROJECT_REF:-}" ]; then # same derivation the legacy ci.yml used
    SUPABASE_PROJECT_REF="$(printf '%s' "$VITE_SUPABASE_URL" | sed -E 's#^https://([^.]+)\.supabase\.co.*#\1#')"
    [ "$SUPABASE_PROJECT_REF" = "$VITE_SUPABASE_URL" ] && SUPABASE_PROJECT_REF=""
  fi
  [ -n "${SUPABASE_PROJECT_REF:-}" ] || not_a_gate_run "missing required variable: SUPABASE_PROJECT_REF (not in env, apps/api/.env, or derivable from VITE_SUPABASE_URL)"
  if [ -z "$AI_API_KEY" ]; then
    for f in "$ROOT/apps/api/.env" ${MAIN_ROOT:+"$MAIN_ROOT/apps/api/.env"}; do
      if v="$(read_env_var "$f" AI_API_KEY)" && [ -n "$v" ]; then AI_API_KEY="$v"; break; fi
    done
  fi
else
  # Local mode: nothing is read from any .env file. The issuer template placeholder is overridden by env below,
  # so a non-secret placeholder is all the backend needs.
  SUPABASE_PROJECT_REF="e2e-local"
fi
AI_API_KEY="${AI_API_KEY:-ci-placeholder}"   # the backend only needs a non-empty value (ci.yml does the same)

if [ "${E2E_GATE_PREFLIGHT_ONLY:-}" = "1" ]; then
  # Test hook (scripts/e2e/run-e2e-gate.preflight.test.mjs): report how credentials were resolved, start nothing.
  echo "[gate] preflight: auth_mode=$AUTH_MODE env_file_reads=$(wc -c < "$ENV_READS_FILE" | tr -d ' ')" >&2
  not_a_gate_run "preflight only (E2E_GATE_PREFLIGHT_ONLY=1); nothing was started"
fi

for tool in docker psql curl jq node npx mvn openssl; do
  command -v "$tool" >/dev/null 2>&1 || not_a_gate_run "required tool not found: $tool"
done
docker info >/dev/null 2>&1 || not_a_gate_run "docker is not available"
for role_port in "frontend:$FE_PORT" "backend:$BE_PORT"; do
  pid="$(port_holder_pid "${role_port##*:}")"
  [ -n "$pid" ] && not_a_gate_run "${role_port%%:*} port ${role_port##*:} is held by PID $pid; refusing to touch another run's process"
done

OUT="$ROOT/test-results/gate"
RESULTS="${PLAYWRIGHT_JSON_OUTPUT_NAME:-$ROOT/test-results/canonical/results.json}"
export PLAYWRIGHT_JSON_OUTPUT_NAME="$RESULTS"
mkdir -p "$OUT"
rm -f "$OUT/k3-scan.ok"
HEAD_SHA="$(git rev-parse HEAD)"
# Tracked changes AND untracked, non-ignored files both make the working tree "not clean" (an untracked spec or
# helper is code the sentinel would otherwise vouch for).
DIRTY="$(git status --porcelain --untracked-files=normal | grep -v ' \.e2e-passed$' | wc -l | tr -d ' ')"
OPEN_GAPS=0

# FC-GAP tolerance (E2E_GATE_ALLOW_OPEN_GAPS=1 only): a checker phase whose ONLY failures are FC-GAP lines becomes a WARN.
# Any other FAIL[...] line still fails the phase. <stderr-file> <phase-label>; returns 0 when tolerable.
gaps_only() {
  [ "${E2E_GATE_ALLOW_OPEN_GAPS:-}" = "1" ] || return 1
  grep -q '^FAIL\[FC-GAP\]' "$1" || return 1
  if grep '^FAIL\[' "$1" | grep -qv '^FAIL\[FC-GAP\]'; then return 1; fi
  OPEN_GAPS=1
  echo "[gate] WARN ($2): open journey gap(s) tolerated by E2E_GATE_ALLOW_OPEN_GAPS=1; this run can never be a gate pass" >&2
  return 0
}

fail() { echo "CANONICAL E2E GATE: FAIL $*" >&2; exit 1; }

# ---------------------------------------------------------------------------------------------
# 1. Static guards (no stack)
# ---------------------------------------------------------------------------------------------
echo "[gate] static guards @ $HEAD_SHA (working tree changes: $DIRTY; auth mode: $AUTH_MODE)"
node "$SCRIPT_DIR/e2e/check-e2e-estate.mjs" || fail "(estate guard)"
node "$SCRIPT_DIR/e2e/check-canonical-journeys.mjs" --phase=static || fail "(journey static)"
if [ "$AUTH_MODE" = "local" ]; then
  node "$SCRIPT_DIR/e2e/check-local-auth.mjs" --phase=config || fail "(FC-26 production config)"
fi

# ---------------------------------------------------------------------------------------------
# 2. Isolated stack
# ---------------------------------------------------------------------------------------------
BACKEND_PID=""
AUTH_WORKDIR=""
STORAGE_DIR="$(mktemp -d)"   # per-run local-dev photo storage root (see the backend subshell below); removed by cleanup
CLEANED=0
cleanup() {
  local rc=$?
  [ "$CLEANED" -eq 1 ] && return "$rc"
  CLEANED=1
  [ -n "$BACKEND_PID" ] && terminate_service "backend" "$BACKEND_PID" "$BE_PORT" 5
  docker rm -f "${AUTH_PREFIX}-gw" "${AUTH_PREFIX}-rest" "${AUTH_PREFIX}-gotrue" >/dev/null 2>&1 || true
  docker rm -f "$PG_NAME" >/dev/null 2>&1 || true
  docker network rm "$AUTH_NET" >/dev/null 2>&1 || true
  [ -n "$AUTH_WORKDIR" ] && rm -rf "$AUTH_WORKDIR"
  [ -n "$STORAGE_DIR" ] && rm -rf "$STORAGE_DIR"
  rm -f "$ENV_READS_FILE"
  verify_ports_released "$FE_PORT" "$BE_PORT" >/dev/null 2>&1 || true
  return "$rc"
}
on_signal() { echo "[gate] received $1; cleaning up (this run is NOT a pass)" >&2; cleanup; trap - "$1"; exit 130; }
trap cleanup EXIT
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
trap 'on_signal HUP' HUP
set -m

PG_PASS="${PG_TEST_PASSWORD:-fixture_test_only}"
PG_PORT="${E2E_GATE_DB_PORT:-$(find_free_port $(( (BE_PORT * 7) % 20000 + 20000 )))}" || not_a_gate_run "no free port for the fixture database"
[ -n "$PG_PORT" ] || not_a_gate_run "no free port for the fixture database"
echo "[gate] fixture container $PG_NAME on localhost:$PG_PORT"
PG_TEST_CONTAINER_NAME="$PG_NAME" PG_TEST_PORT="$PG_PORT" PG_TEST_PASSWORD="$PG_PASS" \
  bash "$SCRIPT_DIR/db/restore-test-fixture.sh" 2>&1 | grep -v '^postgresql://' > "$OUT/fixture-restore.log"
[ "${PIPESTATUS[0]}" -eq 0 ] || fail "(fixture restore; see test-results/gate/fixture-restore.log)"
[ -n "$(docker ps --filter "name=${PG_NAME}" --filter status=running -q)" ] || fail "(fixture container not running)"
PGPASSWORD="$PG_PASS" psql -h localhost -p "$PG_PORT" -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1 || fail "(fixture unreachable on localhost:$PG_PORT)"
pgsuper() { PGPASSWORD="$PG_PASS" psql -h localhost -p "$PG_PORT" -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

export E2E_SEED_PG_HOST=localhost E2E_SEED_PG_PORT="$PG_PORT" E2E_SEED_PG_PASSWORD="$PG_PASS"
GW_URL=""
ISSUER_URI=""
if [ "$AUTH_MODE" = "local" ]; then
  GW_PORT="${E2E_GATE_AUTH_PORT:-$(find_free_port $(( (BE_PORT * 7) % 20000 + 20001 )))}"
  [ -n "$GW_PORT" ] || not_a_gate_run "no free port for the auth gateway"
  GW_URL="http://localhost:$GW_PORT"
  ISSUER_URI="$GW_URL/auth/v1"
  AUTH_WORKDIR="$(mktemp -d)"            # 0700, outside the repo; holds keys, JWTs, generated passwords, 0600 env-files
  chmod 700 "$AUTH_WORKDIR"
  # FC-25b at gate level with the RESOLVED issuer, before anything is started for it.
  node "$SCRIPT_DIR/e2e/check-local-auth.mjs" --phase=env --issuer "$ISSUER_URI" >/dev/null 2>&1 || not_a_gate_run "FC-25: the resolved auth issuer is not a loopback URL"
  echo "[gate] local auth stack: gateway $GW_URL (GoTrue + PostgREST unpublished, per-run network $AUTH_NET)"
  docker network create "$AUTH_NET" >/dev/null || fail "(could not create the per-run docker network $AUTH_NET)"
  export AUTH_WORKDIR AUTH_PREFIX AUTH_NET AUTH_PG_CONTAINER="$PG_NAME" AUTH_PG_PORT="$PG_PORT" AUTH_PG_PASSWORD="$PG_PASS"
  export AUTH_GW_PORT="$GW_PORT" AUTH_SITE_URL="http://localhost:$FE_PORT"
  bash "$AUTH_STACK/stack-up.sh" > "$OUT/auth-stack-up.log" 2>&1 || { tail -n 8 "$OUT/auth-stack-up.log" >&2; fail "(local auth stack did not come up; see test-results/gate/auth-stack-up.log)"; }
  bash "$AUTH_STACK/create-users.sh" > "$OUT/auth-create-users.log" 2>&1 || { tail -n 8 "$OUT/auth-create-users.log" >&2; fail "(local role users could not be created; see test-results/gate/auth-create-users.log)"; }
  # shellcheck disable=SC1091
  source "$AUTH_WORKDIR/creds.env"   # generated per run: export ADMIN_EMAIL/PASSWORD, BROKER_*, SMOKE_USER_*
  unset E2E_SEED_LAST_TOKEN
  export VITE_SUPABASE_URL="$GW_URL"
  VITE_SUPABASE_PUBLISHABLE_KEY="$(< "$AUTH_WORKDIR/anon.jwt")"; export VITE_SUPABASE_PUBLISHABLE_KEY

  # ---- FC-27 (b)(c): anon cannot read user_roles; V128 columns unreachable; reference == overlay. BEFORE the suite. ----
  pgsuper -d postgres -f "$AUTH_STACK/rls-probe-seed.sql" > "$OUT/fc27-probe-seed.log" 2>&1 || fail "(FC-27 probe seed failed; see test-results/gate/fc27-probe-seed.log)"
  node "$AUTH_STACK/rls-probe.mjs" --workdir "$AUTH_WORKDIR" --gw "$GW_URL" > "$OUT/fc27bc-rls-probe.log" 2>&1
  PROBE_RC=$?
  pgsuper -d postgres -f "$AUTH_STACK/rls-probe-cleanup.sql" > "$OUT/fc27-probe-cleanup.log" 2>&1 || fail "(FC-27 probe cleanup failed; the fixture would carry probe rows)"
  if [ "$PROBE_RC" -ne 0 ]; then
    grep -a '^FAIL' "$OUT/fc27bc-rls-probe.log" >&2
    echo "NOT A GATE PASS: FC-27(b)(c) live RLS/column probe failed (see test-results/gate/fc27bc-rls-probe.log)" >&2
    fail "(FC-27 b/c)"
  fi
  bash "$AUTH_STACK/privacy-compare.sh" > "$OUT/fc27c-privacy-compare.log" 2>&1
  if [ $? -ne 0 ]; then
    grep -a '^FAIL\|^PASS' "$OUT/fc27c-privacy-compare.log" >&2
    echo "NOT A GATE PASS: FC-27c PRIVACY REGRESSION - a V128-revoked column is reachable or reference != overlay. Grants were NOT widened. STOP and report." >&2
    fail "(FC-27c privacy)"
  fi
  grep -a '^PASS' "$OUT/fc27c-privacy-compare.log" | sed 's/^/[gate] FC-27c /'
else
  e2e_seed_identity admin "$ADMIN_EMAIL" "$ADMIN_PASSWORD" admin required >/dev/null || fail "(admin identity seed: hosted Supabase Auth sign-in failed)"
  e2e_seed_identity broker "$BROKER_EMAIL" "$BROKER_PASSWORD" broker required >/dev/null || fail "(broker identity seed failed)"
  e2e_seed_identity smoke-user "$SMOKE_USER_EMAIL" "$SMOKE_USER_PASSWORD" user required >/dev/null || fail "(smoke-user identity seed failed)"
fi

# A role's storageState is minted once and REUSED while its token still has life left (auth-setup.canonical.ts). Every local
# run has a fresh GoTrue key pair, so a state minted by a previous run is signed by a key this stack does not trust: it would
# be reused and every authenticated call would fail with a 401 that looks like a product bug. Remove it; the setup projects re-mint.
if [ "$AUTH_MODE" = "local" ]; then
  rm -f "$ROOT/e2e/canonical/fixtures/admin-auth.json" "$ROOT/e2e/canonical/fixtures/broker-auth.json" "$ROOT/e2e/canonical/fixtures/user-auth.json"
fi

# ---- Collection (--list) against the real config: roster + every matrix id in its project. Needs the role credentials
# (generated above in local mode), because the config adds a role's projects only when its credentials are present. ----
echo "[gate] collecting (playwright --list)"
# PLAYWRIGHT_JSON_OUTPUT_NAME is exported for the real run below; when it is set the json reporter
# writes THERE and prints the text listing on stdout instead. Pin it to the list file for this call so
# the JSON lands in $OUT/list.json either way (found by the first live gate run at C1).
rm -f "$OUT/list.json"
PLAYWRIGHT_JSON_OUTPUT_NAME="$OUT/list.json" \
  npx --no-install playwright test --config=playwright.canonical.config.ts --list --reporter=json > "$OUT/list.stdout.log" 2> "$OUT/list.stderr.log"
LIST_RC=$?
[ "$LIST_RC" -eq 0 ] || fail "(playwright --list exited $LIST_RC; see test-results/gate/list.stderr.log)"
node "$SCRIPT_DIR/e2e/check-canonical-journeys.mjs" --phase=list --list "$OUT/list.json" > "$OUT/list-phase.out" 2> "$OUT/list-phase.err"
LIST_PHASE_RC=$?
cat "$OUT/list-phase.out"
if [ "$LIST_PHASE_RC" -ne 0 ]; then
  if gaps_only "$OUT/list-phase.err" "list"; then
    grep '^FAIL\[FC-GAP\]' "$OUT/list-phase.err" | sed 's/^/[gate] /' >&2
  else
    cat "$OUT/list-phase.err" >&2
    fail "(journey list)"
  fi
fi

echo "[gate] starting backend on $BE_PORT"
# Per-run throwaway key for the property-request phone encryption (Base64, 32 bytes). A plain shell variable (NOT exported):
# only the backend subshell below re-exports it, and the K3 scan receives it later under an env NAME.
PHONE_KEY="$(openssl rand -base64 32)"
(
  cd "$ROOT/apps/api" || exit 99
  export SERVER_PORT="$BE_PORT"
  # Request-a-property backend flag - canonical TEST STACK only (see the VITE_PROPERTY_REQUESTS_ENABLED note above). With the flag on,
  # PropertyRequestEncryptionKeyGuard fails startup closed unless a real key is configured, hence the per-run key.
  export PROPERTY_REQUESTS_ENABLED=true PHONE_ENCRYPTION_KEY="$PHONE_KEY"
  export CORS_ALLOWED_ORIGINS="http://localhost:$FE_PORT,http://127.0.0.1:$FE_PORT"
  export RATE_LIMIT_DISCOVER_ENABLED=false RATE_LIMIT_TRENDS_ENABLED=false
  export SUPABASE_DB_HOST=localhost SUPABASE_DB_PORT="$PG_PORT" SUPABASE_DB_NAME=postgres SUPABASE_DB_USER=postgres SUPABASE_DB_PASSWORD="$PG_PASS"
  export SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL=false SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE=disable
  export SPRING_FLYWAY_ENABLED=false SPRING_TASK_SCHEDULING_ENABLED=false
  export SUPABASE_PROJECT_REF AI_API_KEY
  # Photo storage (#2750 CC1/CC1b/CC1c/T13): the journeys register photo rows by storagePath, and
  # ListingImageRegistrar.register() rejects any path whose object the active storage cannot inspect (400 "object
  # inspection failed (not found)"). The gate has no R2/Supabase Storage, so the backend's filesystem-backed
  # local-dev stub is switched on through THIS subshell's process env only (apps/api is untouched; it is the same switch
  # scripts/run-e2e-local.sh already sets). The root is a per-run throwaway directory removed by the exit trap, and
  # the stub's routes are served by the loopback-only backend started here.
  export LOCAL_DEV_STORAGE_ENABLED=true LOCAL_DEV_STORAGE_ROOT="$STORAGE_DIR"
  # FC-25 / amendment 1: the local issuer is set ONLY here, in this subshell. application.yml keeps the hosted template.
  [ "$AUTH_MODE" = "local" ] && export SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI="$ISSUER_URI"
  validate_localhost_only || exit 98
  # The backend never needs the role credentials or the Supabase client settings; do not hand them to it.
  # K7: the datasource URL and user are PINNED on the command line (highest precedence below the refused routes),
  # keeping the query parameters application.yml uses.
  # SR LOW-3: also scrub anything the shell may have inherited that could point the backend at a hosted Supabase project or at
  # real object storage: the enumerated names below plus every inherited R2_* / STORAGE_* / SUPABASE_SERVICE* name (a prefix loop,
  # so a newly named variable is covered too). The variables this script exports on purpose (SUPABASE_DB_*, SUPABASE_PROJECT_REF,
  # LOCAL_DEV_STORAGE_*) match none of these patterns.
  scrub=(ADMIN_EMAIL ADMIN_PASSWORD BROKER_EMAIL BROKER_PASSWORD DEALER_EMAIL DEALER_PASSWORD SMOKE_USER_EMAIL SMOKE_USER_PASSWORD
    VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_JWT_SECRET)
  for n in $(compgen -e); do
    case "$n" in R2_*|STORAGE_*|SUPABASE_SERVICE*) scrub+=("$n") ;; esac
  done
  env_unset_args=()
  for n in "${scrub[@]}"; do env_unset_args+=(-u "$n"); done
  exec env "${env_unset_args[@]}" \
    mvn -B --no-transfer-progress -DskipTests spring-boot:run \
    "-Dspring-boot.run.arguments=--spring.datasource.url=jdbc:postgresql://localhost:${PG_PORT}/postgres?prepareThreshold=0&stringtype=unspecified --spring.datasource.username=postgres"
) > "$OUT/backend.log" 2>&1 &
BACKEND_PID=$!

healthy=0
for i in $(seq 1 90); do
  if curl -sf "$BACKEND_BASE_URL/actuator/health" >/dev/null 2>&1; then healthy=1; break; fi
  kill -0 "$BACKEND_PID" 2>/dev/null || break
  sleep 5
done
[ "$healthy" -eq 1 ] || fail "(backend never became healthy; see test-results/gate/backend.log)"

# K7b: prove the running backend is connected to THIS fixture container (a JDBC client session is visible in its
# pg_stat_activity). A backend that was somehow repointed elsewhere would leave zero sessions here.
K7B="$(PGPASSWORD="$PG_PASS" psql -h localhost -p "$PG_PORT" -U postgres -d postgres -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname='postgres' AND application_name ILIKE '%PostgreSQL JDBC Driver%'" 2>/dev/null | tr -d ' ')"
if [ -z "$K7B" ] || [ "$K7B" -lt 1 ] 2>/dev/null; then
  fail "(K7b: the backend has no JDBC session on the disposable fixture ($PG_NAME); it may be connected elsewhere)"
fi
echo "[gate] K7b: backend holds $K7B JDBC session(s) on the disposable fixture $PG_NAME"

if [ "$AUTH_MODE" = "local" ]; then
  # ---- FC-27(a): the real backend rejects forged tokens (tampered, foreign key, foreign issuer, expired, none). BEFORE the suite. ----
  node "$AUTH_STACK/auth-negatives.mjs" --workdir "$AUTH_WORKDIR" --gw "$GW_URL" --backend "$BACKEND_BASE_URL" > "$OUT/fc27a-auth-negatives.log" 2>&1
  if [ $? -ne 0 ]; then
    grep -a '^FAIL' "$OUT/fc27a-auth-negatives.log" >&2
    echo "NOT A GATE PASS: FC-27(a) a forged or unauthenticated token was not rejected as required (see test-results/gate/fc27a-auth-negatives.log)" >&2
    fail "(FC-27 a)"
  fi
  grep -a 'ALL EXPECTATIONS HELD' "$OUT/fc27a-auth-negatives.log" | sed 's/^/[gate] FC-27a /'

  # ---- FC-28: the bundle is built against the gateway and carries no hosted Supabase project host. ----
  echo "[gate] building the frontend for the FC-28 bundle check"
  VITE_BUILD_SHA="$HEAD_SHA" npm run build --workspace=apps/web > "$OUT/build.log" 2>&1 || fail "(frontend build failed; see test-results/gate/build.log)"
  node "$SCRIPT_DIR/e2e/check-local-auth.mjs" --phase=bundle --dist "$ROOT/apps/web/dist" --gateway "$GW_URL" > "$OUT/fc28-bundle.log" 2>&1 || { cat "$OUT/fc28-bundle.log" >&2; fail "(FC-28 bundle)"; }
  sed 's/^/[gate] FC-28 /' "$OUT/fc28-bundle.log"
fi

# ---------------------------------------------------------------------------------------------
# 3. Run + verify
# ---------------------------------------------------------------------------------------------
rm -f "$RESULTS"
# Q0: no HTML report in a gate run (it records the sign-in fill() values verbatim). playwright.canonical.config.ts turns the
# html reporter off when E2E_CANONICAL_GATE=1; a stale report from an earlier local run is removed so none is scanned or shown.
rm -rf "$ROOT/playwright-report/canonical"
export E2E_CANONICAL_GATE=1
echo "[gate] running canonical suite (workers=1, retries=0)"
set -a
npm run test:e2e:canonical -- --workers=1 > "$OUT/run.log" 2>&1
RUN_RC=$?
set +a

# K3: scan BEFORE anything from run.log (or any other artefact) is printed. The scan set and the purge
# set are the same list, passed identically by CI: the whole of test-results/ (results.json, traces,
# run.log, backend.log), the whole HTML report directory, and the backend log explicitly. The checker inflates
# zips and the report's base64 zip before scanning, and an artefact it cannot scan counts as a hit (exit 4).
# The generated per-run stack secrets join the scan under their env NAMES; they are exported only now, after the
# backend and the suite were started, so no child process inherited them.
E2E_PHONE_ENCRYPTION_KEY="$PHONE_KEY"; export E2E_PHONE_ENCRYPTION_KEY
if [ "$AUTH_MODE" = "local" ]; then
  E2E_AUTH_AUTHENTICATOR_PASSWORD="$(< "$AUTH_WORKDIR/authenticator.pw")"; export E2E_AUTH_AUTHENTICATOR_PASSWORD
  E2E_AUTH_GOTRUE_JWT_SECRET="$(< "$AUTH_WORKDIR/gotrue-hs.secret")"; export E2E_AUTH_GOTRUE_JWT_SECRET
  E2E_AUTH_SERVICE_ROLE_KEY="$(< "$AUTH_WORKDIR/service_role.jwt")"; export E2E_AUTH_SERVICE_ROLE_KEY
fi
if [ -n "${E2E_GATE_EVIDENCE_DIR:-}" ]; then
  mkdir -p "$E2E_GATE_EVIDENCE_DIR"
  kept=0; withheld=0
  for f in "$RESULTS" "$OUT/list.json" "$OUT"/list-phase.out "$OUT"/list-phase.err "$OUT"/fc27*.log "$OUT"/fc28*.log "$OUT"/auth-stack-up.log "$OUT"/auth-create-users.log "$OUT"/build.log "$OUT"/run.log "$OUT"/backend.log; do
    [ -f "$f" ] || continue
    if node "$SCRIPT_DIR/e2e/check-canonical-journeys.mjs" --phase=scan --scan-path "$f" >/dev/null 2>&1; then
      cp "$f" "$E2E_GATE_EVIDENCE_DIR/$(basename "$f")"; kept=$((kept + 1))
    else
      withheld=$((withheld + 1)); echo "[gate] evidence: $(basename "$f") WITHHELD (holds a credential value or cannot be scanned)" >&2
    fi
  done
  echo "[gate] evidence: $kept file(s) copied to $E2E_GATE_EVIDENCE_DIR, $withheld withheld" >&2
fi
SCAN_OUT="$(mktemp)"   # outside every scan path, so a purge cannot eat it
node "$SCRIPT_DIR/e2e/check-canonical-journeys.mjs" --phase=scan --purge \
  --scan-path "$ROOT/test-results" --scan-path "$ROOT/playwright-report" --scan-path "$OUT/backend.log" \
  > "$SCAN_OUT" 2>&1
SCAN_RC=$?
if [ "$SCAN_RC" -ne 0 ]; then
  # Only NAMES and file paths are in the scan output; the value is never printed.
  cat "$SCAN_OUT" >&2
  rm -f "$SCAN_OUT"
  [ "$SCAN_RC" -eq 4 ] && echo "[gate] credential value found in, or an unscannable artefact among, the run artefacts: test-results, playwright-report and the backend log were purged; run.log is NOT shown" >&2
  echo "CANONICAL E2E GATE: FAIL @ $HEAD_SHA (credential scan exit $SCAN_RC)" >&2
  exit 1
fi
rm -f "$SCAN_OUT"
mkdir -p "$OUT" && : > "$OUT/k3-scan.ok"   # written ONLY after a clean scan; CI gates its artefact uploads on it

tail -n 25 "$OUT/run.log"
echo "[gate] playwright exit code: $RUN_RC"

node "$SCRIPT_DIR/e2e/check-canonical-journeys.mjs" --phase=results \
  --list "$OUT/list.json" --results "$RESULTS" \
  --report-dir "$ROOT/playwright-report/canonical" --traces-dir "$ROOT/test-results" > "$OUT/results-phase.out" 2> "$OUT/results-phase.err"
RESULTS_RC=$?
cat "$OUT/results-phase.out"
RESULTS_OK=0
if [ "$RESULTS_RC" -eq 0 ]; then
  RESULTS_OK=1
elif gaps_only "$OUT/results-phase.err" "results"; then
  RESULTS_OK=1
fi
grep '^FAIL\[FC-GAP\]' "$OUT/results-phase.err" 2>/dev/null | sed 's/^/[gate] /' >&2
if [ "$RESULTS_OK" -ne 1 ]; then cat "$OUT/results-phase.err" >&2; fi
if [ "$RESULTS_OK" -ne 1 ] || [ "$RUN_RC" -ne 0 ]; then
  echo "CANONICAL E2E GATE: FAIL @ $HEAD_SHA (playwright exit $RUN_RC, results phase exit $RESULTS_RC)" >&2
  exit 1
fi

if [ "$AUTH_MODE" = "local" ]; then
  node "$SCRIPT_DIR/e2e/check-local-auth.mjs" --phase=bundle --dist "$ROOT/apps/web/dist" --gateway "$GW_URL" > "$OUT/fc28-bundle-final.log" 2>&1 || { cat "$OUT/fc28-bundle-final.log" >&2; fail "@ $HEAD_SHA (FC-28 bundle after the suite's own build)"; }
fi

COUNTS="$(grep -E '^(list|results):' "$OUT/results-phase.out" | tr '\n' ' ')"
if [ "$AUTH_MODE" = "hosted" ]; then
  echo "ENVIRONMENT_GATED RUN (hosted auth): PASS @ $HEAD_SHA $COUNTS- this is NOT a canonical gate pass; no sentinel written" >&2
  exit 6
fi
if [ "$OPEN_GAPS" -eq 1 ]; then
  echo "NOT A GATE PASS (open gaps) @ $HEAD_SHA $COUNTS- E2E_GATE_ALLOW_OPEN_GAPS=1; .e2e-passed NOT written" >&2
  exit 5
fi
if [ "$DIRTY" -eq 0 ]; then
  printf '%s' "$HEAD_SHA" > "$ROOT/.e2e-passed"
  SENTINEL="sentinel written"
else
  SENTINEL="working tree had $DIRTY change(s) (tracked or untracked): .e2e-passed NOT written"
fi
echo "CANONICAL E2E GATE: PASS @ $HEAD_SHA $COUNTS($SENTINEL)"
exit 0
