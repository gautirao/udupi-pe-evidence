#!/usr/bin/env bash
# scripts/dev/tests/local-fixture-backend-authmode.test.sh — #2236 Part B
# (independent QA of local-fixture-backend.sh's AUTH_MODE=option1/option2 seam)
#
# Reuses the mock-binary + sandbox conventions from
# local-fixture-backend.test.sh (docker/psql/curl/mvn PATH-mocked, run under
# `env -i` for isolation). This file is self-contained (does not source the
# other test file) so it can run standalone, matching that file's own
# standalone-runnable convention.
#
# Run:  bash scripts/dev/tests/local-fixture-backend-authmode.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ORIG_PATH="$PATH"

TOTAL=0
FAILED=0

ok() { TOTAL=$((TOTAL + 1)); echo "ok $TOTAL - $1"; }
not_ok() { TOTAL=$((TOTAL + 1)); FAILED=$((FAILED + 1)); echo "not ok $TOTAL - $1"; }
assert_true() { if [[ "$2" -eq 0 ]]; then ok "$1"; else not_ok "$1"; fi }
assert_false() { if [[ "$2" -ne 0 ]]; then ok "$1"; else not_ok "$1"; fi }
assert_eq() { if [[ "$2" == "$3" ]]; then ok "$1"; else not_ok "$1 (got [$2], expected [$3])"; fi }
assert_contains() { if [[ "$2" == *"$3"* ]]; then ok "$1"; else not_ok "$1 (expected to find [$3])"; fi }
assert_not_contains() { if [[ "$2" != *"$3"* ]]; then ok "$1"; else not_ok "$1 (unexpectedly found [$3])"; fi }

CLEANUP_DIRS=()
cleanup_all() {
  for d in "${CLEANUP_DIRS[@]:-}"; do
    [[ -n "$d" && -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup_all EXIT

# ---------------------------------------------------------------------------
# Mock binaries (docker/psql/mvn identical in spirit to
# local-fixture-backend.test.sh; curl extended to also answer the E2E-project
# login URL distinctly via MOCK_E2E_LOGIN_RESPONSE, since option2 logs in
# against a DIFFERENT VITE_SUPABASE_URL than option1).
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
  exit 0
fi

if [[ "${MOCK_PSQL_UNREACHABLE:-false}" == "true" ]]; then
  exit 1
fi
exit 0
EOF
chmod +x "$MOCKBIN/psql"

# curl: distinguishes E2E-project login (URL matches E2E_SUPABASE_URL, uses
# MOCK_E2E_LOGIN_RESPONSE if set) from production login (everything else,
# uses MOCK_LOGIN_RESPONSE) so option1 vs option2 can be independently
# asserted from a single test run's captured calls.
cat > "$MOCKBIN/curl" <<'EOF'
#!/usr/bin/env bash
{
  printf 'ARGS:'
  printf ' %q' "$@"
  printf '\n'
} >> "${CURL_CALL_LOG:-/dev/null}"
echo "CURL_CALLED" >> "${CURL_CALL_LOG_SIMPLE:-/dev/null}"

URL=""
for a in "$@"; do
  [[ "$a" == http* ]] && URL="$a"
done

if [[ -n "${MOCK_E2E_LOGIN_URL_PREFIX:-}" && "$URL" == "${MOCK_E2E_LOGIN_URL_PREFIX}"* ]]; then
  echo "E2E_LOGIN_CALLED" >> "${E2E_LOGIN_CALL_LOG:-/dev/null}"
  # NOT "${VAR:-{}}" — bash leaks a stray literal `}` when VAR IS set and the
  # default text itself contains a `}` (see local-fixture-backend-authmode's
  # sibling test files for the full explanation of this parser gotcha).
  if [[ -n "${MOCK_E2E_LOGIN_RESPONSE:-}" ]]; then
    printf '%s' "$MOCK_E2E_LOGIN_RESPONSE"
  else
    printf '{}'
  fi
  exit 0
fi

echo "PROD_LOGIN_CALLED" >> "${PROD_LOGIN_CALL_LOG:-/dev/null}"
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

new_fixture_sandbox() {
  # $1 = "with_e2e_auth" or "without_e2e_auth"
  local mode="${1:-without_e2e_auth}"
  local sb
  sb="$(mktemp -d)"
  CLEANUP_DIRS+=("$sb")
  mkdir -p "$sb/apps/api" "$sb/scripts/db" "$sb/scripts/dev/lib"

  cat > "$sb/apps/api/.env" <<'EOF'
SUPABASE_PROJECT_REF=prodref
AI_API_KEY=test-ai-key-secret
EOF

  cat > "$sb/.env.e2e" <<'EOF'
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=test-admin-password-secret
EOF

  cat > "$sb/.env" <<'EOF'
VITE_SUPABASE_URL=https://prodref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=test-publishable-key-secret
EOF

  cp "$REPO_ROOT/scripts/dev/local-fixture-backend.sh" "$sb/scripts/dev/local-fixture-backend.sh"
  chmod +x "$sb/scripts/dev/local-fixture-backend.sh"
  cp "$REPO_ROOT/scripts/dev/lib/e2e-auth-common.sh" "$sb/scripts/dev/lib/e2e-auth-common.sh"

  cat > "$sb/scripts/db/restore-test-fixture.sh" <<'EOF'
#!/usr/bin/env bash
echo "==> mock restore fixture starting"
echo "==> mock migrations applied"
echo "postgresql://postgres:${PG_TEST_PASSWORD:-fixture_test_only}@localhost:${PG_TEST_PORT:-5434}/postgres"
exit 0
EOF
  chmod +x "$sb/scripts/db/restore-test-fixture.sh"

  cat > "$sb/apps/api/run-local.sh" <<'EOF'
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
  chmod +x "$sb/apps/api/run-local.sh"

  if [[ "$mode" == "with_e2e_auth" ]]; then
    cat > "$sb/.env.e2e.auth" <<'EOF'
E2E_SUPABASE_PROJECT_REF=e2eref
E2E_SUPABASE_URL=https://e2eref.supabase.co
E2E_SUPABASE_ANON_KEY=e2e-anon-key
E2E_ADMIN_EMAIL=e2e-admin@udupi-e2e.invalid
E2E_ADMIN_PASSWORD=e2e-admin-password-0000000000000000
E2E_BROKER_EMAIL=e2e-broker@udupi-e2e.invalid
E2E_BROKER_PASSWORD=e2e-broker-password-0000000000000000
E2E_USER_EMAIL=e2e-user@udupi-e2e.invalid
E2E_USER_PASSWORD=e2e-user-password-00000000000000000
E2E_DEALER_EMAIL=e2e-dealer@udupi-e2e.invalid
E2E_DEALER_PASSWORD=e2e-dealer-password-0000000000000000
EOF
    chmod 600 "$sb/.env.e2e.auth"
  fi

  echo "$sb"
}

run_fixture_script() {
  local sandbox="$1"
  shift
  env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "$@" bash "$sandbox/scripts/dev/local-fixture-backend.sh"
}

VALID_PROD_LOGIN_JSON='{"access_token":"prod-access-token-secret","user":{"id":"11111111-2222-3333-4444-555555555555"}}'
VALID_E2E_LOGIN_JSON='{"access_token":"e2e-access-token-secret","user":{"id":"66666666-7777-8888-9999-aaaaaaaaaaaa"}}'

# ===========================================================================
# C1 — option1 regression: .env.e2e.auth ABSENT, no new option2-related
# output, Spring/env exports unchanged (T1/T2-style RUN_LOCAL_CAP check)
# ===========================================================================

SBC1="$(new_fixture_sandbox without_e2e_auth)"
RUN_LOCAL_CAPC1="$(mktemp)"
PSQL_CALL_LOGC1="$(mktemp)"
PSQL_SEED_LOGC1="$(mktemp)"
CURL_CALL_LOGC1="$(mktemp)"
DOCKER_CALL_LOGC1="$(mktemp)"
LOGC1="$(mktemp)"

run_fixture_script "$SBC1" \
  MOCK_LOGIN_RESPONSE="$VALID_PROD_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAPC1" \
  PSQL_CALL_LOG="$PSQL_CALL_LOGC1" \
  PSQL_SEED_LOG="$PSQL_SEED_LOGC1" \
  CURL_CALL_LOG="$CURL_CALL_LOGC1" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOGC1" \
  > "$LOGC1" 2>&1
RCC1=$?
CAPC1="$(cat "$RUN_LOCAL_CAPC1" 2>/dev/null || true)"
LOGC1_CONTENT="$(cat "$LOGC1" 2>/dev/null || true)"

if [[ $RCC1 -eq 0 ]]; then ok "C1: option1 (.env.e2e.auth absent) happy path exits 0"; else not_ok "C1: option1 happy path exits 0 (rc=$RCC1, log: $LOGC1_CONTENT)"; fi
assert_not_contains "C1: no AUTH_MODE=option2 banner when .env.e2e.auth is absent" "$LOGC1_CONTENT" "AUTH_MODE=option2"
assert_not_contains "C1: no E2E_AUTH_PROJECT_NOT_CONFIGURED noise when .env.e2e.auth is absent" "$LOGC1_CONTENT" "E2E_AUTH_PROJECT_NOT_CONFIGURED"
assert_contains "C1: Spring export unchanged — SUPABASE_PROJECT_REF is the PRODUCTION ref" "$CAPC1" "SUPABASE_PROJECT_REF=prodref"
assert_contains "C1: Spring export unchanged — Hikari SSL disabled as before" "$CAPC1" "SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL=false"
assert_contains "C1: Spring export unchanged — Hikari sslmode disabled as before" "$CAPC1" "SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE=disable"

# ===========================================================================
# C2 — option2 activates ONLY when .env.e2e.auth exists in the sandbox
# ===========================================================================

SBC2="$(new_fixture_sandbox with_e2e_auth)"
RUN_LOCAL_CAPC2="$(mktemp)"
PSQL_CALL_LOGC2="$(mktemp)"
PSQL_SEED_LOGC2="$(mktemp)"
CURL_CALL_LOGC2="$(mktemp)"
DOCKER_CALL_LOGC2="$(mktemp)"
LOGC2="$(mktemp)"

run_fixture_script "$SBC2" \
  MOCK_E2E_LOGIN_URL_PREFIX="https://e2eref.supabase.co" \
  MOCK_E2E_LOGIN_RESPONSE="$VALID_E2E_LOGIN_JSON" \
  MOCK_LOGIN_RESPONSE="$VALID_PROD_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$RUN_LOCAL_CAPC2" \
  PSQL_CALL_LOG="$PSQL_CALL_LOGC2" \
  PSQL_SEED_LOG="$PSQL_SEED_LOGC2" \
  CURL_CALL_LOG="$CURL_CALL_LOGC2" \
  DOCKER_CALL_LOG="$DOCKER_CALL_LOGC2" \
  > "$LOGC2" 2>&1
RCC2=$?
CAPC2="$(cat "$RUN_LOCAL_CAPC2" 2>/dev/null || true)"
LOGC2_CONTENT="$(cat "$LOGC2" 2>/dev/null || true)"

if [[ $RCC2 -eq 0 ]]; then ok "C2 setup: option2 happy path exits 0"; else not_ok "C2 setup: option2 happy path exits 0 (rc=$RCC2, log: $LOGC2_CONTENT)"; fi
assert_contains "C2: AUTH_MODE=option2 banner present when .env.e2e.auth exists" "$LOGC2_CONTENT" "AUTH_MODE=option2"

# ===========================================================================
# C3 — under option2: SUPABASE_PROJECT_REF exported to Spring equals
# E2E_SUPABASE_PROJECT_REF; VITE_SUPABASE_URL/KEY point at the SAME project
# (backend/browser coherence — a divergence here is the silent-401 mode)
# ===========================================================================

assert_contains "C3: Spring's SUPABASE_PROJECT_REF equals E2E_SUPABASE_PROJECT_REF, not production" "$CAPC2" "SUPABASE_PROJECT_REF=e2eref"
assert_not_contains "C3: Spring's SUPABASE_PROJECT_REF is NOT the production ref under option2" "$CAPC2" "SUPABASE_PROJECT_REF=prodref"
# Browser-side coherence is proven indirectly: the login call actually made
# targeted the E2E project's URL (E2E_LOGIN_CALLED), not the production one.
E2E_LOGIN_LOG2="$(cat "${E2E_LOGIN_CALL_LOG:-/dev/null}" 2>/dev/null || true)"
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  MOCK_E2E_LOGIN_URL_PREFIX="https://e2eref.supabase.co" \
  MOCK_E2E_LOGIN_RESPONSE="$VALID_E2E_LOGIN_JSON" \
  MOCK_LOGIN_RESPONSE="$VALID_PROD_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$(mktemp)" \
  PSQL_CALL_LOG="$(mktemp)" \
  PSQL_SEED_LOG="$(mktemp)" \
  CURL_CALL_LOG="$(mktemp)" \
  DOCKER_CALL_LOG="$(mktemp)" \
  E2E_LOGIN_CALL_LOG="/tmp/c3_e2e_login.log" \
  PROD_LOGIN_CALL_LOG="/tmp/c3_prod_login.log" \
  bash "$SBC2/scripts/dev/local-fixture-backend.sh" > /dev/null 2>&1
if [[ -f /tmp/c3_e2e_login.log ]]; then
  ok "C3: browser-side login under option2 targeted the E2E project URL (VITE_SUPABASE_URL == E2E project)"
else
  not_ok "C3: browser-side login under option2 targeted the E2E project URL (VITE_SUPABASE_URL == E2E project) — silent-401 failure mode"
fi
rm -f /tmp/c3_e2e_login.log /tmp/c3_prod_login.log

# ===========================================================================
# C4 — option2 with a production-ref collision -> fails BEFORE any login
# ===========================================================================

SBC4="$(new_fixture_sandbox with_e2e_auth)"
# Overwrite apps/api/.env's SUPABASE_PROJECT_REF to collide with the sandbox's
# E2E_SUPABASE_PROJECT_REF (e2eref).
cat > "$SBC4/apps/api/.env" <<'EOF'
SUPABASE_PROJECT_REF=e2eref
AI_API_KEY=test-ai-key-secret
EOF
CURL_CALL_LOGC4="$(mktemp)"
LOGC4="$(mktemp)"
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  MOCK_E2E_LOGIN_URL_PREFIX="https://e2eref.supabase.co" \
  MOCK_E2E_LOGIN_RESPONSE="$VALID_E2E_LOGIN_JSON" \
  MOCK_DOCKER_CONTAINER_RUNNING=true \
  MOCK_PSQL_UNREACHABLE=false \
  RUN_LOCAL_CAPTURE="$(mktemp)" \
  PSQL_CALL_LOG="$(mktemp)" \
  PSQL_SEED_LOG="$(mktemp)" \
  CURL_CALL_LOG="$CURL_CALL_LOGC4" \
  DOCKER_CALL_LOG="$(mktemp)" \
  bash "$SBC4/scripts/dev/local-fixture-backend.sh" > "$LOGC4" 2>&1
RCC4=$?
CALLLOGC4="$(cat "$CURL_CALL_LOGC4" 2>/dev/null || true)"
if [[ $RCC4 -ne 0 ]]; then ok "C4: option2 with production-ref collision fails (non-zero exit)"; else not_ok "C4: option2 with production-ref collision fails"; fi
assert_contains "C4: collision failure message is clear" "$(cat "$LOGC4")" "matches the production"
if [[ -z "$CALLLOGC4" ]]; then
  ok "C4: collision aborts BEFORE any login attempt (mock-curl login call log is empty)"
else
  not_ok "C4: collision aborts BEFORE any login attempt (mock-curl login call log is empty) (calls: $CALLLOGC4)"
fi

# ===========================================================================
# C5 — .env.e2e.auth present but EMPTY, or missing a required key ->
# non-zero exit with E2E_AUTH_PROJECT_NOT_CONFIGURED naming the missing keys
# ===========================================================================

SBC5A="$(new_fixture_sandbox without_e2e_auth)"
: > "$SBC5A/.env.e2e.auth"
chmod 600 "$SBC5A/.env.e2e.auth"
LOGC5A="$(mktemp)"
run_fixture_script "$SBC5A" \
  RUN_LOCAL_CAPTURE="$(mktemp)" PSQL_CALL_LOG="$(mktemp)" PSQL_SEED_LOG="$(mktemp)" \
  CURL_CALL_LOG="$(mktemp)" DOCKER_CALL_LOG="$(mktemp)" \
  > "$LOGC5A" 2>&1
RCC5A=$?
assert_false "C5: empty .env.e2e.auth -> non-zero exit" $RCC5A
assert_contains "C5: empty file message contains E2E_AUTH_PROJECT_NOT_CONFIGURED" "$(cat "$LOGC5A")" "E2E_AUTH_PROJECT_NOT_CONFIGURED"

SBC5B="$(new_fixture_sandbox without_e2e_auth)"
cat > "$SBC5B/.env.e2e.auth" <<'EOF'
E2E_SUPABASE_PROJECT_REF=e2eref
E2E_SUPABASE_URL=https://e2eref.supabase.co
EOF
chmod 600 "$SBC5B/.env.e2e.auth"
LOGC5B="$(mktemp)"
run_fixture_script "$SBC5B" \
  RUN_LOCAL_CAPTURE="$(mktemp)" PSQL_CALL_LOG="$(mktemp)" PSQL_SEED_LOG="$(mktemp)" \
  CURL_CALL_LOG="$(mktemp)" DOCKER_CALL_LOG="$(mktemp)" \
  > "$LOGC5B" 2>&1
RCC5B=$?
assert_false "C5: .env.e2e.auth missing required keys -> non-zero exit" $RCC5B
LOGC5B_CONTENT="$(cat "$LOGC5B")"
assert_contains "C5: missing-keys message contains E2E_AUTH_PROJECT_NOT_CONFIGURED" "$LOGC5B_CONTENT" "E2E_AUTH_PROJECT_NOT_CONFIGURED"
assert_contains "C5: missing-keys message names a missing key (E2E_SUPABASE_ANON_KEY)" "$LOGC5B_CONTENT" "E2E_SUPABASE_ANON_KEY"

# ===========================================================================
# C6 — .env.e2e.auth present but mode 644 -> non-zero exit, DISTINCT message
# (world-readable credential file fails closed, not a warning)
# ===========================================================================

SBC6="$(new_fixture_sandbox with_e2e_auth)"
chmod 644 "$SBC6/.env.e2e.auth"
LOGC6="$(mktemp)"
run_fixture_script "$SBC6" \
  MOCK_E2E_LOGIN_URL_PREFIX="https://e2eref.supabase.co" \
  MOCK_E2E_LOGIN_RESPONSE="$VALID_E2E_LOGIN_JSON" \
  RUN_LOCAL_CAPTURE="$(mktemp)" PSQL_CALL_LOG="$(mktemp)" PSQL_SEED_LOG="$(mktemp)" \
  CURL_CALL_LOG="$(mktemp)" DOCKER_CALL_LOG="$(mktemp)" \
  > "$LOGC6" 2>&1
RCC6=$?
LOGC6_CONTENT="$(cat "$LOGC6")"
assert_false "C6: .env.e2e.auth mode 644 -> non-zero exit (fail closed, not a warning)" $RCC6
assert_contains "C6: mode-644 message contains E2E_AUTH_PROJECT_NOT_CONFIGURED" "$LOGC6_CONTENT" "E2E_AUTH_PROJECT_NOT_CONFIGURED"
assert_contains "C6: mode-644 message states the offending mode" "$LOGC6_CONTENT" "mode 644"

# ===========================================================================
# C7 — coherence assert fires when the login URL's ref differs from the ref
# exported to Spring
# ===========================================================================

SBC7="$(new_fixture_sandbox without_e2e_auth)"
cat > "$SBC7/.env.e2e.auth" <<'EOF'
E2E_SUPABASE_PROJECT_REF=e2eref
E2E_SUPABASE_URL=https://SOMEOTHERREF.supabase.co
E2E_SUPABASE_ANON_KEY=e2e-anon-key
E2E_ADMIN_EMAIL=e2e-admin@udupi-e2e.invalid
E2E_ADMIN_PASSWORD=e2e-admin-password-0000000000000000
E2E_BROKER_EMAIL=e2e-broker@udupi-e2e.invalid
E2E_BROKER_PASSWORD=e2e-broker-password-0000000000000000
E2E_USER_EMAIL=e2e-user@udupi-e2e.invalid
E2E_USER_PASSWORD=e2e-user-password-00000000000000000
E2E_DEALER_EMAIL=e2e-dealer@udupi-e2e.invalid
E2E_DEALER_PASSWORD=e2e-dealer-password-0000000000000000
EOF
chmod 600 "$SBC7/.env.e2e.auth"
LOGC7="$(mktemp)"
run_fixture_script "$SBC7" \
  RUN_LOCAL_CAPTURE="$(mktemp)" PSQL_CALL_LOG="$(mktemp)" PSQL_SEED_LOG="$(mktemp)" \
  CURL_CALL_LOG="$(mktemp)" DOCKER_CALL_LOG="$(mktemp)" \
  > "$LOGC7" 2>&1
RCC7=$?
LOGC7_CONTENT="$(cat "$LOGC7")"
assert_false "C7: URL ref != E2E_SUPABASE_PROJECT_REF -> non-zero exit" $RCC7
assert_contains "C7: coherence-mismatch message is an explicit diagnostic" "$LOGC7_CONTENT" "mismatch"

echo ""
echo "1..$TOTAL"
if [[ $FAILED -eq 0 ]]; then
  echo "# All $TOTAL assertions passed."
  exit 0
else
  echo "# $FAILED of $TOTAL assertions FAILED."
  exit 1
fi
