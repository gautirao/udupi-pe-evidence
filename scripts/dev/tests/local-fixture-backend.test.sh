#!/usr/bin/env bash
# scripts/dev/tests/local-fixture-backend.test.sh — #1981
#
# Minimal, dependency-free bash assertion harness for:
#   - backend/run-local.sh (SKIP_BACKEND_ENV_LOAD guard)
#   - scripts/dev/local-fixture-backend.sh (local-fixture workflow)
#
# No bats/shunit2 dependency. Mocks docker/psql/curl/mvn via stub executables
# placed in a temp bin dir prepended to PATH; each invocation runs under
# `env -i` for full environment isolation between tests. Real `jq` is used
# (a genuine prerequisite of the workflow being tested).
#
# Run:  bash scripts/dev/tests/local-fixture-backend.test.sh
# Exits 0 if all assertions pass, non-zero otherwise. Prints "ok N - desc" /
# "not ok N - desc" per assertion (TAP-ish, no external harness required).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ORIG_PATH="$PATH"

TOTAL=0
FAILED=0

ok() {
  TOTAL=$((TOTAL + 1))
  echo "ok $TOTAL - $1"
}

not_ok() {
  TOTAL=$((TOTAL + 1))
  FAILED=$((FAILED + 1))
  echo "not ok $TOTAL - $1"
}

assert_true() {
  # $1 = description, $2 = 0/1 predicate result
  if [[ "$2" -eq 0 ]]; then ok "$1"; else not_ok "$1"; fi
}

assert_contains() {
  # $1 = description, $2 = haystack, $3 = needle
  if [[ "$2" == *"$3"* ]]; then ok "$1"; else not_ok "$1 (expected to find [$3])"; fi
}

assert_not_contains() {
  # $1 = description, $2 = haystack, $3 = needle
  if [[ "$2" != *"$3"* ]]; then ok "$1"; else not_ok "$1 (unexpectedly found [$3])"; fi
}

CLEANUP_DIRS=()
cleanup_all() {
  for d in "${CLEANUP_DIRS[@]:-}"; do
    [[ -n "$d" && -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup_all EXIT

# ---------------------------------------------------------------------------
# Shared mock binaries (behaviour fully controlled by env vars per-invocation)
# ---------------------------------------------------------------------------

MOCKBIN="$(mktemp -d)"
CLEANUP_DIRS+=("$MOCKBIN")

cat > "$MOCKBIN/docker" <<'EOF'
#!/usr/bin/env bash
echo "DOCKER_CALLED $*" >> "${DOCKER_CALL_LOG:-/dev/null}"
if [[ "${1:-}" == "ps" ]]; then
  if [[ "${MOCK_DOCKER_CONTAINER_RUNNING:-true}" == "true" ]]; then
    echo "mockcontainerid123"
  fi
fi
exit 0
EOF
chmod +x "$MOCKBIN/docker"

cat > "$MOCKBIN/psql" <<'EOF'
#!/usr/bin/env bash
{
  printf 'ARGS:'
  printf ' %q' "$@"
  printf '\n'
} >> "${PSQL_CALL_LOG:-/dev/null}"

IS_SEED=false
for a in "$@"; do
  if [[ "$a" == "ON_ERROR_STOP=1" ]]; then
    IS_SEED=true
  fi
done

if [[ "$IS_SEED" == "true" ]]; then
  cat >> "${PSQL_SEED_LOG:-/dev/null}"
  if [[ "${MOCK_PSQL_SEED_FAIL:-false}" == "true" ]]; then
    exit 1
  fi
  exit 0
fi

if [[ "${MOCK_PSQL_UNREACHABLE:-false}" == "true" ]]; then
  exit 1
fi
exit 0
EOF
chmod +x "$MOCKBIN/psql"

cat > "$MOCKBIN/curl" <<'EOF'
#!/usr/bin/env bash
echo "CURL_CALLED" >> "${CURL_CALL_LOG:-/dev/null}"
if [[ -n "${MOCK_LOGIN_RESPONSE:-}" ]]; then
  printf '%s' "${MOCK_LOGIN_RESPONSE}"
else
  printf '{}'
fi
exit 0
EOF
chmod +x "$MOCKBIN/curl"

cat > "$MOCKBIN/mvn" <<'EOF'
#!/usr/bin/env bash
{
  echo "MVN_INVOKED=true"
  echo "SUPABASE_DB_HOST=${SUPABASE_DB_HOST:-}"
  echo "SUPABASE_DB_USER=${SUPABASE_DB_USER:-}"
  echo "SUPABASE_DB_PASSWORD=${SUPABASE_DB_PASSWORD:-}"
  echo "SUPABASE_PROJECT_REF=${SUPABASE_PROJECT_REF:-}"
  echo "AI_API_KEY=${AI_API_KEY:-}"
} > "${MVN_CAPTURE:?MVN_CAPTURE not set}"
exit 0
EOF
chmod +x "$MOCKBIN/mvn"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

run_runlocal() {
  # $1 = sandbox dir; remaining args = NAME=VALUE env assignments for the child
  local sandbox="$1"
  shift
  env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "$@" bash "$sandbox/backend/run-local.sh"
}

new_runlocal_sandbox() {
  local sb
  sb="$(mktemp -d)"
  CLEANUP_DIRS+=("$sb")
  mkdir -p "$sb/backend"
  cp "$REPO_ROOT/backend/run-local.sh" "$sb/backend/run-local.sh"
  chmod +x "$sb/backend/run-local.sh"
  echo "$sb"
}

new_fixture_sandbox() {
  local sb
  sb="$(mktemp -d)"
  CLEANUP_DIRS+=("$sb")
  mkdir -p "$sb/backend" "$sb/scripts/db" "$sb/scripts/dev"

  cat > "$sb/backend/.env" <<'EOF'
SUPABASE_PROJECT_REF=testref
AI_API_KEY=test-ai-key-secret
EOF

  cat > "$sb/.env.e2e" <<'EOF'
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=test-admin-password-secret
EOF

  cat > "$sb/.env" <<'EOF'
VITE_SUPABASE_URL=https://mock.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=test-publishable-key-secret
EOF

  cp "$REPO_ROOT/scripts/dev/local-fixture-backend.sh" "$sb/scripts/dev/local-fixture-backend.sh"
  chmod +x "$sb/scripts/dev/local-fixture-backend.sh"

  cat > "$sb/scripts/db/restore-test-fixture.sh" <<'EOF'
#!/usr/bin/env bash
echo "==> mock restore fixture starting"
echo "==> mock migrations applied"
echo "postgresql://postgres:${PG_TEST_PASSWORD:-fixture_test_only}@localhost:${PG_TEST_PORT:-5434}/postgres"
exit 0
EOF
  chmod +x "$sb/scripts/db/restore-test-fixture.sh"

  cat > "$sb/backend/run-local.sh" <<'EOF'
#!/usr/bin/env bash
echo "MOCK_RUN_LOCAL_INVOKED"
{
  echo "SUPABASE_DB_HOST=${SUPABASE_DB_HOST:-}"
  echo "SUPABASE_DB_PORT=${SUPABASE_DB_PORT:-}"
  echo "SUPABASE_DB_PASSWORD=${SUPABASE_DB_PASSWORD:-}"
  echo "SKIP_BACKEND_ENV_LOAD=${SKIP_BACKEND_ENV_LOAD:-}"
  echo "SUPABASE_PROJECT_REF=${SUPABASE_PROJECT_REF:-}"
  echo "SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL=${SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL:-}"
  echo "SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE=${SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE:-}"
} > "${RUN_LOCAL_CAPTURE:?RUN_LOCAL_CAPTURE not set}"
exit 0
EOF
  chmod +x "$sb/backend/run-local.sh"

  echo "$sb"
}

run_fixture_script() {
  # $1 = sandbox dir; remaining args = NAME=VALUE env assignments for the child
  local sandbox="$1"
  shift
  env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "$@" bash "$sandbox/scripts/dev/local-fixture-backend.sh"
}

VALID_LOGIN_JSON='{"access_token":"mock-access-token-secret","user":{"id":"11111111-2222-3333-4444-555555555555"}}'

# ===========================================================================
# T1 — SKIP_BACKEND_ENV_LOAD unset: run-local.sh still sources backend/.env
# ===========================================================================

SB1="$(new_runlocal_sandbox)"
cat > "$SB1/backend/.env" <<'EOF'
SUPABASE_DB_HOST=fromenv-host
SUPABASE_DB_USER=fromenv-user
SUPABASE_DB_PASSWORD=fromenv-pass-secret
SUPABASE_PROJECT_REF=fromenv-ref
AI_API_KEY=fromenv-aikey-secret
EOF
MVN_CAP1="$(mktemp)"
LOG1="$(mktemp)"
run_runlocal "$SB1" MVN_CAPTURE="$MVN_CAP1" > "$LOG1" 2>&1
RC1=$?
CAP1="$(cat "$MVN_CAP1" 2>/dev/null || true)"

if [[ $RC1 -eq 0 ]]; then ok "T1: run-local.sh (SKIP_BACKEND_ENV_LOAD unset) exits 0"; else not_ok "T1: run-local.sh (SKIP_BACKEND_ENV_LOAD unset) exits 0 (rc=$RC1)"; fi
assert_contains "T1: backend/.env values are sourced and passed to mvn (AC1)" "$CAP1" "SUPABASE_DB_HOST=fromenv-host"

# ===========================================================================
# T2 — SKIP_BACKEND_ENV_LOAD=true preserves caller-exported overrides
# ===========================================================================

SB2="$(new_runlocal_sandbox)"
cat > "$SB2/backend/.env" <<'EOF'
SUPABASE_DB_HOST=fromenv-host-should-not-be-used
SUPABASE_DB_USER=fromenv-user-should-not-be-used
SUPABASE_DB_PASSWORD=fromenv-pass-should-not-be-used
SUPABASE_PROJECT_REF=fromenv-ref-should-not-be-used
AI_API_KEY=fromenv-aikey-should-not-be-used
EOF
MVN_CAP2="$(mktemp)"
LOG2="$(mktemp)"
run_runlocal "$SB2" \
  SKIP_BACKEND_ENV_LOAD=true \
  SUPABASE_DB_HOST=preset-host \
  SUPABASE_DB_USER=preset-user \
  SUPABASE_DB_PASSWORD=preset-pass-secret \
  SUPABASE_PROJECT_REF=preset-ref \
  AI_API_KEY=preset-aikey-secret \
  MVN_CAPTURE="$MVN_CAP2" > "$LOG2" 2>&1
RC2=$?
CAP2="$(cat "$MVN_CAP2" 2>/dev/null || true)"

if [[ $RC2 -eq 0 ]]; then ok "T2: run-local.sh (SKIP_BACKEND_ENV_LOAD=true) exits 0"; else not_ok "T2: run-local.sh (SKIP_BACKEND_ENV_LOAD=true) exits 0 (rc=$RC2)"; fi
assert_contains "T2: caller-exported SUPABASE_DB_HOST survives (AC2)" "$CAP2" "SUPABASE_DB_HOST=preset-host"
assert_not_contains "T2: backend/.env is NOT sourced when skipping" "$CAP2" "fromenv-host-should-not-be-used"

# ===========================================================================
# T3/T4 — custom PG_TEST_PORT / PG_TEST_PASSWORD propagate into Spring env
# ===========================================================================

SB3="$(new_fixture_sandbox)"
RUN_LOCAL_CAP3="$(mktemp)"
PSQL_CALL_LOG3="$(mktemp)"
PSQL_SEED_LOG3="$(mktemp)"
CURL_CALL_LOG3="$(mktemp)"
DOCKER_CALL_LOG3="$(mktemp)"
LOG3="$(mktemp)"

run_fixture_script "$SB3" \
  PG_TEST_PORT=17777 \
  PG_TEST_PASSWORD=custom-secret-pass \
  MOCK_LOGIN_RESPONSE="$VALID_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAP3" \
  PSQL_CALL_LOG="$PSQL_CALL_LOG3" \
  PSQL_SEED_LOG="$PSQL_SEED_LOG3" \
  CURL_CALL_LOG="$CURL_CALL_LOG3" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOG3" \
  > "$LOG3" 2>&1
RC3=$?
CAP3="$(cat "$RUN_LOCAL_CAP3" 2>/dev/null || true)"
SEED3="$(cat "$PSQL_SEED_LOG3" 2>/dev/null || true)"
LOG3_CONTENT="$(cat "$LOG3" 2>/dev/null || true)"

if [[ $RC3 -eq 0 ]]; then ok "T3/T4 setup: happy-path fixture run exits 0"; else not_ok "T3/T4 setup: happy-path fixture run exits 0 (rc=$RC3, log: $LOG3_CONTENT)"; fi
assert_contains "T3: custom PG_TEST_PORT propagates to SUPABASE_DB_PORT (AC7/AC8)" "$CAP3" "SUPABASE_DB_PORT=17777"
assert_contains "T4: custom PG_TEST_PASSWORD propagates to SUPABASE_DB_PASSWORD (AC7/AC8)" "$CAP3" "SUPABASE_DB_PASSWORD=custom-secret-pass"
assert_contains "T4b: SUPABASE_PROJECT_REF passes through to the final exec (AC8)" "$CAP3" "SUPABASE_PROJECT_REF=testref"
assert_contains "T4c: Hikari SSL is disabled in the final exec env (AC8)" "$CAP3" "SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL=false"
assert_contains "T4d: Hikari sslmode is disabled in the final exec env (AC8)" "$CAP3" "SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE=disable"

# ===========================================================================
# T7 — seed SQL uses lowercase 'admin', never 'ADMIN'
# ===========================================================================

assert_contains "T7: seed SQL inserts lowercase 'admin' (AC6)" "$SEED3" "'admin'"
assert_not_contains "T7: seed SQL never inserts 'ADMIN'" "$SEED3" "'ADMIN'"

# ===========================================================================
# T8 — running the seed step twice with the same UUID is idempotent
# ===========================================================================

SB8="$(new_fixture_sandbox)"
RUN_LOCAL_CAP8="$(mktemp)"
PSQL_CALL_LOG8="$(mktemp)"
PSQL_SEED_LOG8="$(mktemp)"
CURL_CALL_LOG8="$(mktemp)"
DOCKER_CALL_LOG8="$(mktemp)"
LOG8A="$(mktemp)"
LOG8B="$(mktemp)"

run_fixture_script "$SB8" \
  MOCK_LOGIN_RESPONSE="$VALID_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAP8" \
  PSQL_CALL_LOG="$PSQL_CALL_LOG8" \
  PSQL_SEED_LOG="$PSQL_SEED_LOG8" \
  CURL_CALL_LOG="$CURL_CALL_LOG8" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOG8" \
  > "$LOG8A" 2>&1
RC8A=$?

run_fixture_script "$SB8" \
  MOCK_LOGIN_RESPONSE="$VALID_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAP8" \
  PSQL_CALL_LOG="$PSQL_CALL_LOG8" \
  PSQL_SEED_LOG="$PSQL_SEED_LOG8" \
  CURL_CALL_LOG="$CURL_CALL_LOG8" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOG8" \
  > "$LOG8B" 2>&1
RC8B=$?

SEED8="$(cat "$PSQL_SEED_LOG8" 2>/dev/null || true)"
SEED8_CONFLICT_COUNT="$(grep -c 'ON CONFLICT (user_id, role) DO NOTHING' "$PSQL_SEED_LOG8" 2>/dev/null || echo 0)"

if [[ $RC8A -eq 0 && $RC8B -eq 0 ]]; then
  ok "T8: seed step run twice with same UUID produces no error (idempotent, AC6)"
else
  not_ok "T8: seed step run twice with same UUID produces no error (idempotent, AC6) (rc1=$RC8A rc2=$RC8B)"
fi
if [[ "$SEED8_CONFLICT_COUNT" -eq 2 ]]; then
  ok "T8: both runs use ON CONFLICT DO NOTHING (no attempt to violate idempotency)"
else
  not_ok "T8: both runs use ON CONFLICT DO NOTHING (expected 2 occurrences, got $SEED8_CONFLICT_COUNT)"
fi

# ===========================================================================
# T5 — simulated login failure aborts before any seed (write) psql invocation
# ===========================================================================

SB5="$(new_fixture_sandbox)"
PSQL_CALL_LOG5="$(mktemp)"
PSQL_SEED_LOG5="$(mktemp)"
CURL_CALL_LOG5="$(mktemp)"
DOCKER_CALL_LOG5="$(mktemp)"
RUN_LOCAL_CAP5="$(mktemp)"
LOG5="$(mktemp)"

run_fixture_script "$SB5" \
  MOCK_LOGIN_RESPONSE='{"error":"invalid_grant","error_description":"Invalid login credentials"}' \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAP5" \
  PSQL_CALL_LOG="$PSQL_CALL_LOG5" \
  PSQL_SEED_LOG="$PSQL_SEED_LOG5" \
  CURL_CALL_LOG="$CURL_CALL_LOG5" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOG5" \
  > "$LOG5" 2>&1
RC5=$?
CALLLOG5="$(cat "$PSQL_CALL_LOG5" 2>/dev/null || true)"
SEED5="$(cat "$PSQL_SEED_LOG5" 2>/dev/null || true)"

# NOTE: the safety gate's read-only "SELECT 1" reachability check runs BEFORE
# login by design (see approved plan [safety_checks]), so psql IS invoked once
# prior to the login attempt. The safety property under test is that a login
# failure never reaches the seed (write) psql invocation — detected by the
# absence of the ON_ERROR_STOP=1 seed marker in the call log, and an empty
# seed log.
if [[ $RC5 -ne 0 ]]; then ok "T5: login failure aborts the script (non-zero exit)"; else not_ok "T5: login failure aborts the script (non-zero exit)"; fi
assert_not_contains "T5: login failure never reaches the seed (write) psql invocation" "$CALLLOG5" "ON_ERROR_STOP=1"
if [[ -z "$SEED5" ]]; then ok "T5: no seed SQL executed after login failure"; else not_ok "T5: no seed SQL executed after login failure"; fi

# ===========================================================================
# T6 — malformed/missing user.id aborts before any seed (write) psql invocation
# ===========================================================================

SB6="$(new_fixture_sandbox)"
PSQL_CALL_LOG6="$(mktemp)"
PSQL_SEED_LOG6="$(mktemp)"
CURL_CALL_LOG6="$(mktemp)"
DOCKER_CALL_LOG6="$(mktemp)"
RUN_LOCAL_CAP6="$(mktemp)"
LOG6="$(mktemp)"

run_fixture_script "$SB6" \
  MOCK_LOGIN_RESPONSE='{"access_token":"some-token","user":{"id":"not-a-uuid"}}' \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAP6" \
  PSQL_CALL_LOG="$PSQL_CALL_LOG6" \
  PSQL_SEED_LOG="$PSQL_SEED_LOG6" \
  CURL_CALL_LOG="$CURL_CALL_LOG6" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOG6" \
  > "$LOG6" 2>&1
RC6=$?
CALLLOG6="$(cat "$PSQL_CALL_LOG6" 2>/dev/null || true)"
SEED6="$(cat "$PSQL_SEED_LOG6" 2>/dev/null || true)"

if [[ $RC6 -ne 0 ]]; then ok "T6: malformed user.id aborts the script (non-zero exit)"; else not_ok "T6: malformed user.id aborts the script (non-zero exit)"; fi
assert_not_contains "T6: malformed user.id never reaches the seed (write) psql invocation" "$CALLLOG6" "ON_ERROR_STOP=1"
if [[ -z "$SEED6" ]]; then ok "T6: no seed SQL executed for malformed user.id"; else not_ok "T6: no seed SQL executed for malformed user.id"; fi

# ===========================================================================
# T9a — host safety-gate sanity (static: no runtime failure mode by design;
# the script structurally never dereferences a remote SUPABASE_DB_HOST)
# ===========================================================================

FIXTURE_SRC="$REPO_ROOT/scripts/dev/local-fixture-backend.sh"
FIXTURE_SRC_CONTENT="$(cat "$FIXTURE_SRC")"
# The script must never *read* SUPABASE_DB_HOST (i.e. never dereference it via
# $SUPABASE_DB_HOST / ${SUPABASE_DB_HOST) — it only ever assigns it the literal
# "localhost" once, when constructing Step G's env for backend/run-local.sh.
HOST_DEREF_COUNT="$(grep -c '\$SUPABASE_DB_HOST\|\${SUPABASE_DB_HOST' "$FIXTURE_SRC" || true)"

if [[ "$HOST_DEREF_COUNT" -eq 0 ]] && [[ "$FIXTURE_SRC_CONTENT" == *"SUPABASE_DB_HOST=localhost"* ]]; then
  ok "T9a: host is hardcoded to localhost and never read/dereferenced from any source (AC7)"
else
  not_ok "T9a: host is hardcoded to localhost and never read/dereferenced from any source (AC7) (dereference-count=$HOST_DEREF_COUNT)"
fi

# NOTE: a prior "T9b" here asserted the mere presence of a tautological
# EFFECTIVE_PORT="$PG_TEST_PORT" / if [[ "$EFFECTIVE_PORT" != "$PG_TEST_PORT" ]]
# check — that check could never be false (both sides are assigned from the
# same variable with nothing able to change either in between) and has been
# removed from the script as dead code presented as a safety control. The
# real port-safety guarantee is enforced by T9c (container-running) and T9d
# (reachability) below, plus T3 (custom PG_TEST_PORT actually propagates).

# ===========================================================================
# T9c — container-not-running independently aborts before login/seed
# ===========================================================================

SB9C="$(new_fixture_sandbox)"
PSQL_CALL_LOG9C="$(mktemp)"
PSQL_SEED_LOG9C="$(mktemp)"
CURL_CALL_LOG9C="$(mktemp)"
DOCKER_CALL_LOG9C="$(mktemp)"
RUN_LOCAL_CAP9C="$(mktemp)"
LOG9C="$(mktemp)"

run_fixture_script "$SB9C" \
  MOCK_LOGIN_RESPONSE="$VALID_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=false \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAP9C" \
  PSQL_CALL_LOG="$PSQL_CALL_LOG9C" \
  PSQL_SEED_LOG="$PSQL_SEED_LOG9C" \
  CURL_CALL_LOG="$CURL_CALL_LOG9C" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOG9C" \
  > "$LOG9C" 2>&1
RC9C=$?
CURL9C="$(cat "$CURL_CALL_LOG9C" 2>/dev/null || true)"
SEED9C="$(cat "$PSQL_SEED_LOG9C" 2>/dev/null || true)"

if [[ $RC9C -ne 0 ]]; then ok "T9c: container-not-running aborts the script (AC7)"; else not_ok "T9c: container-not-running aborts the script (AC7)"; fi
if [[ -z "$CURL9C" ]]; then ok "T9c: container-not-running never reaches the login step"; else not_ok "T9c: container-not-running never reaches the login step"; fi
if [[ -z "$SEED9C" ]]; then ok "T9c: container-not-running never reaches the seed step"; else not_ok "T9c: container-not-running never reaches the seed step"; fi

# ===========================================================================
# T9d — unreachable postgres independently aborts before login/seed
# ===========================================================================

SB9D="$(new_fixture_sandbox)"
PSQL_CALL_LOG9D="$(mktemp)"
PSQL_SEED_LOG9D="$(mktemp)"
CURL_CALL_LOG9D="$(mktemp)"
DOCKER_CALL_LOG9D="$(mktemp)"
RUN_LOCAL_CAP9D="$(mktemp)"
LOG9D="$(mktemp)"

run_fixture_script "$SB9D" \
  MOCK_LOGIN_RESPONSE="$VALID_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=true \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAP9D" \
  PSQL_CALL_LOG="$PSQL_CALL_LOG9D" \
  PSQL_SEED_LOG="$PSQL_SEED_LOG9D" \
  CURL_CALL_LOG="$CURL_CALL_LOG9D" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOG9D" \
  > "$LOG9D" 2>&1
RC9D=$?
CURL9D="$(cat "$CURL_CALL_LOG9D" 2>/dev/null || true)"
SEED9D="$(cat "$PSQL_SEED_LOG9D" 2>/dev/null || true)"

if [[ $RC9D -ne 0 ]]; then ok "T9d: unreachable postgres aborts the script (AC7)"; else not_ok "T9d: unreachable postgres aborts the script (AC7)"; fi
if [[ -z "$CURL9D" ]]; then ok "T9d: unreachable postgres never reaches the login step"; else not_ok "T9d: unreachable postgres never reaches the login step"; fi
if [[ -z "$SEED9D" ]]; then ok "T9d: unreachable postgres never reaches the seed step"; else not_ok "T9d: unreachable postgres never reaches the seed step"; fi

# ===========================================================================
# T10 — no configured secret substring appears in full captured stdout+stderr
# (reuses the T3/T4 happy-path run's captured output)
# ===========================================================================

assert_not_contains "T10: fixture password never printed" "$LOG3_CONTENT" "custom-secret-pass"
assert_not_contains "T10: admin password never printed" "$LOG3_CONTENT" "test-admin-password-secret"
assert_not_contains "T10: Supabase publishable key never printed" "$LOG3_CONTENT" "test-publishable-key-secret"
assert_not_contains "T10: access token never printed" "$LOG3_CONTENT" "mock-access-token-secret"
assert_not_contains "T10: AI_API_KEY never printed" "$LOG3_CONTENT" "test-ai-key-secret"
# NOTE: the script intentionally prints an *instructional template* containing
# the literal string "Authorization: Bearer $(cat $TOKEN_FILE)" so the user can
# build their own header — this is not a real secret. What must never appear is
# that template concatenated with an actual token value, which the check below
# verifies (a real token would show up as "Bearer mock-access-token-secret").
assert_not_contains "T10: no real bearer token value printed alongside 'Bearer '" "$LOG3_CONTENT" "Bearer mock-access-token-secret"

# ===========================================================================
# T11 — forced mid-run failure still removes the token temp file (EXIT trap)
# ===========================================================================

SB11="$(new_fixture_sandbox)"
PSQL_CALL_LOG11="$(mktemp)"
PSQL_SEED_LOG11="$(mktemp)"
CURL_CALL_LOG11="$(mktemp)"
DOCKER_CALL_LOG11="$(mktemp)"
RUN_LOCAL_CAP11="$(mktemp)"
LOG11="$(mktemp)"

run_fixture_script "$SB11" \
  MOCK_LOGIN_RESPONSE="$VALID_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  MOCK_PSQL_SEED_FAIL=true \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAP11" \
  PSQL_CALL_LOG="$PSQL_CALL_LOG11" \
  PSQL_SEED_LOG="$PSQL_SEED_LOG11" \
  CURL_CALL_LOG="$CURL_CALL_LOG11" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOG11" \
  > "$LOG11" 2>&1
RC11=$?
LOG11_CONTENT="$(cat "$LOG11" 2>/dev/null || true)"
TOKEN_FILE_PATH="$(echo "$LOG11_CONTENT" | sed -n 's/^.*Access token written to: \([^ ]*\).*$/\1/p' | head -n1)"

if [[ $RC11 -ne 0 ]]; then ok "T11: forced seed failure aborts the script"; else not_ok "T11: forced seed failure aborts the script"; fi
if [[ -n "$TOKEN_FILE_PATH" ]]; then
  ok "T11: token file path was reported"
  if [[ ! -e "$TOKEN_FILE_PATH" ]]; then
    ok "T11: token temp file removed by EXIT trap after forced failure (AC10)"
  else
    not_ok "T11: token temp file removed by EXIT trap after forced failure (AC10) (file still present: $TOKEN_FILE_PATH)"
    rm -f "$TOKEN_FILE_PATH"
  fi
else
  not_ok "T11: token file path was reported"
  not_ok "T11: token temp file removed by EXIT trap after forced failure (AC10) (could not locate path)"
fi

# ===========================================================================
# T12 — missing required binary (jq) aborts before any further step (AC3/Gap1)
# ===========================================================================

# Build a PATH with every command available EXCEPT jq, so the script's own
# `command -v jq` prerequisite check genuinely fails, instead of relying on
# jq being absent from MOCKBIN (which was never sufficient by itself, since
# real jq from ORIG_PATH is intentionally still reachable in every other test).
NOJQ_BIN="$(mktemp -d)"
CLEANUP_DIRS+=("$NOJQ_BIN")
IFS=':' read -ra ORIG_PATH_DIRS <<< "$ORIG_PATH"
for d in "${ORIG_PATH_DIRS[@]}"; do
  [[ -d "$d" ]] || continue
  for f in "$d"/*; do
    [[ -e "$f" ]] || continue
    base="$(basename "$f")"
    [[ "$base" == "jq" ]] && continue
    [[ -e "$NOJQ_BIN/$base" ]] && continue
    ln -s "$f" "$NOJQ_BIN/$base" 2>/dev/null || true
  done
done

SB12="$(new_fixture_sandbox)"
PSQL_CALL_LOG12="$(mktemp)"
PSQL_SEED_LOG12="$(mktemp)"
CURL_CALL_LOG12="$(mktemp)"
DOCKER_CALL_LOG12="$(mktemp)"
RUN_LOCAL_CAP12="$(mktemp)"
LOG12="$(mktemp)"

env -i PATH="$MOCKBIN:$NOJQ_BIN" HOME="${HOME:-/tmp}" \
  MOCK_LOGIN_RESPONSE="$VALID_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAP12" \
  PSQL_CALL_LOG="$PSQL_CALL_LOG12" \
  PSQL_SEED_LOG="$PSQL_SEED_LOG12" \
  CURL_CALL_LOG="$CURL_CALL_LOG12" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOG12" \
  bash "$SB12/scripts/dev/local-fixture-backend.sh" > "$LOG12" 2>&1
RC12=$?
LOG12_CONTENT="$(cat "$LOG12" 2>/dev/null || true)"
CURL12="$(cat "$CURL_CALL_LOG12" 2>/dev/null || true)"
DOCKER12="$(cat "$DOCKER_CALL_LOG12" 2>/dev/null || true)"

if [[ $RC12 -ne 0 ]]; then ok "T12: missing jq binary aborts the script (AC3)"; else not_ok "T12: missing jq binary aborts the script (AC3)"; fi
assert_contains "T12: missing jq reports a clear prerequisite error" "$LOG12_CONTENT" "required command not found: jq"
if [[ -z "$CURL12" && -z "$DOCKER12" ]]; then
  ok "T12: missing jq aborts before any docker/curl call (no partial progress)"
else
  not_ok "T12: missing jq aborts before any docker/curl call (no partial progress)"
fi

# ===========================================================================
# T13 — missing required env file (.env.e2e) aborts before any further step
# (AC3/Gap1)
# ===========================================================================

SB13="$(new_fixture_sandbox)"
rm -f "$SB13/.env.e2e"
PSQL_CALL_LOG13="$(mktemp)"
PSQL_SEED_LOG13="$(mktemp)"
CURL_CALL_LOG13="$(mktemp)"
DOCKER_CALL_LOG13="$(mktemp)"
RUN_LOCAL_CAP13="$(mktemp)"
LOG13="$(mktemp)"

run_fixture_script "$SB13" \
  MOCK_LOGIN_RESPONSE="$VALID_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAP13" \
  PSQL_CALL_LOG="$PSQL_CALL_LOG13" \
  PSQL_SEED_LOG="$PSQL_SEED_LOG13" \
  CURL_CALL_LOG="$CURL_CALL_LOG13" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOG13" \
  > "$LOG13" 2>&1
RC13=$?
LOG13_CONTENT="$(cat "$LOG13" 2>/dev/null || true)"
CURL13="$(cat "$CURL_CALL_LOG13" 2>/dev/null || true)"
DOCKER13="$(cat "$DOCKER_CALL_LOG13" 2>/dev/null || true)"

if [[ $RC13 -ne 0 ]]; then ok "T13: missing .env.e2e aborts the script (AC3)"; else not_ok "T13: missing .env.e2e aborts the script (AC3)"; fi
assert_contains "T13: missing .env.e2e reports a clear prerequisite error" "$LOG13_CONTENT" ".env.e2e not found"
if [[ -z "$CURL13" && -z "$DOCKER13" ]]; then
  ok "T13: missing .env.e2e aborts before any docker/curl call (no partial progress)"
else
  not_ok "T13: missing .env.e2e aborts before any docker/curl call (no partial progress)"
fi

# ===========================================================================
# Summary
# ===========================================================================

echo ""
echo "1..$TOTAL"
if [[ $FAILED -eq 0 ]]; then
  echo "# All $TOTAL assertions passed."
  exit 0
else
  echo "# $FAILED of $TOTAL assertions FAILED."
  exit 1
fi
