#!/usr/bin/env bash
# scripts/dev/tests/provision-e2e-auth-identities.test.sh — #2236 Part B
# (independent QA of scripts/dev/provision-e2e-auth-identities.sh)
#
# No live Supabase call is possible: `curl` is PATH-mocked (see MOCKBIN
# below), matching the convention in local-fixture-backend.test.sh. Real HTTP
# is structurally impossible — the mock is the only thing on PATH named curl.
#
# Run:  bash scripts/dev/tests/provision-e2e-auth-identities.test.sh

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
assert_not_contains() { if [[ "$2" != *"$3"* ]]; then ok "$1"; else not_ok "$1 (unexpectedly found [$3] in output of length ${#2})"; fi }

CLEANUP_DIRS=()
cleanup_all() {
  for d in "${CLEANUP_DIRS[@]:-}"; do
    [[ -n "$d" && -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup_all EXIT

SENTINEL="SENTINEL_SERVICE_ROLE_KEY_DO_NOT_LEAK_9f3a"

# ---------------------------------------------------------------------------
# Mock curl — PATH-resolved. Understands both the `--config -` stdin form
# (used by provision's _admin_api_call) and plain argv form. Response body/
# status per logical endpoint are controlled by MOCK_<KIND>_STATUS/BODY env
# vars. Every invocation's argv (NOT stdin) is logged to CURL_ARGV_LOG, and
# any --config stdin payload is logged separately to CURL_CONFIG_LOG.
# ---------------------------------------------------------------------------

MOCKBIN="$(mktemp -d)"
CLEANUP_DIRS+=("$MOCKBIN")

cat > "$MOCKBIN/curl" <<'MOCKEOF'
#!/usr/bin/env bash
{
  printf 'ARGV:'
  printf ' %q' "$@"
  printf '\n'
} >> "${CURL_ARGV_LOG:-/dev/null}"
echo "CURL_CALLED" >> "${CURL_CALL_LOG:-/dev/null}"

USE_CONFIG="false"
WANT_STATUS="false"
METHOD="GET"
URL=""
for a in "$@"; do
  [[ "$a" == "-w" || "$a" == --write-out* ]] && WANT_STATUS="true"
  if [[ "$a" == "--config" ]]; then USE_CONFIG="true"; fi
done

if [[ "$USE_CONFIG" == "true" ]]; then
  CFG="$(cat)"
  echo "----CONFIG----" >> "${CURL_CONFIG_LOG:-/dev/null}"
  printf '%s\n' "$CFG" >> "${CURL_CONFIG_LOG:-/dev/null}"
  M="$(printf '%s\n' "$CFG" | sed -n 's/^request = "\(.*\)"$/\1/p' | head -n1)"
  [[ -n "$M" ]] && METHOD="$M"
  URL="$(printf '%s\n' "$CFG" | sed -n 's/^url = "\(.*\)"$/\1/p' | head -n1)"
  printf '%s\n' "$CFG" | grep -q '^write-out' && WANT_STATUS="true"
else
  PREV=""
  for a in "$@"; do
    if [[ "$PREV" == "-X" ]]; then METHOD="$a"; fi
    PREV="$a"
  done
  # last non-flag arg is the URL for plain-argv calls in this test harness
  for a in "$@"; do
    [[ "$a" == http* ]] && URL="$a"
  done
fi

STATUS=200
BODY='{}'
# NOTE: deliberately NOT using bash's "${VAR:-default-with-braces}" form here.
# When default text itself contains a `}` (as every JSON default below does),
# bash's parameter-expansion parser treats that inner `}` as closing the
# expansion early and leaks a stray literal `}` onto the end of the result
# whenever VAR IS actually set — e.g. `${X:-{"a":1}}` with X=CUSTOM yields
# "CUSTOM}", not "CUSTOM". Using an explicit if/else avoids that entirely.
case "$URL" in
  *auth/v1/health*)
    STATUS="${MOCK_HEALTH_STATUS:-200}"
    if [[ -n "${MOCK_HEALTH_BODY:-}" ]]; then BODY="$MOCK_HEALTH_BODY"; else BODY='ok'; fi
    ;;
  *well-known/openid-configuration*)
    STATUS="${MOCK_OIDC_STATUS:-200}"
    if [[ -n "${MOCK_OIDC_BODY:-}" ]]; then BODY="$MOCK_OIDC_BODY"; else BODY='{}'; fi
    ;;
  *well-known/jwks.json*)
    STATUS="${MOCK_JWKS_STATUS:-200}"
    if [[ -n "${MOCK_JWKS_BODY:-}" ]]; then BODY="$MOCK_JWKS_BODY"; else BODY='{}'; fi
    ;;
  *grant_type=password*)
    STATUS="${MOCK_LOGIN_STATUS:-200}"
    if [[ -n "${MOCK_LOGIN_BODY:-}" ]]; then BODY="$MOCK_LOGIN_BODY"; else BODY='{}'; fi
    ;;
  *admin/users\?page=*)
    # Paginated list-users call (#2691 fix). Supports per-page bodies via
    # MOCK_LOOKUP_PAGE<N>_BODY (falls back to MOCK_LOOKUP_BODY, then a
    # default empty page) so tests can exercise real multi-page pagination.
    STATUS="${MOCK_LOOKUP_STATUS:-200}"
    PAGE_NUM="$(printf '%s' "$URL" | sed -n 's/.*[?&]page=\([0-9]*\).*/\1/p')"
    PAGE_VAR="MOCK_LOOKUP_PAGE${PAGE_NUM}_BODY"
    if [[ -n "${!PAGE_VAR:-}" ]]; then
      BODY="${!PAGE_VAR}"
    elif [[ -n "${MOCK_LOOKUP_BODY:-}" ]]; then
      BODY="$MOCK_LOOKUP_BODY"
    else
      BODY='{"users":[]}'
    fi
    ;;
  *admin/users/*)
    if [[ "$METHOD" == "PUT" ]]; then
      STATUS="${MOCK_UPDATE_STATUS:-200}"
      if [[ -n "${MOCK_UPDATE_BODY:-}" ]]; then BODY="$MOCK_UPDATE_BODY"; else BODY='{}'; fi
    fi ;;
  *admin/users*)
    if [[ "$METHOD" == "POST" ]]; then
      STATUS="${MOCK_CREATE_STATUS:-200}"
      if [[ -n "${MOCK_CREATE_BODY:-}" ]]; then BODY="$MOCK_CREATE_BODY"; else BODY='{}'; fi
    fi ;;
esac

printf '%s' "$BODY"
if [[ "$WANT_STATUS" == "true" ]]; then
  printf '\n%s' "$STATUS"
fi
exit 0
MOCKEOF
chmod +x "$MOCKBIN/curl"

# A minimal jq/openssl pass-through is NOT needed — real jq/openssl from
# ORIG_PATH remain reachable (only `curl` is intercepted), matching the
# "genuine prerequisite" convention from local-fixture-backend.test.sh.

run_provision() {
  # $1... = NAME=VALUE env assignments, plus trailing script args after "--"
  local -a envs=() args=()
  local seen_dashdash="false"
  for a in "$@"; do
    if [[ "$a" == "--" ]]; then seen_dashdash="true"; continue; fi
    if [[ "$seen_dashdash" == "true" ]]; then args+=("$a"); else envs+=("$a"); fi
  done
  env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${envs[@]}" \
    bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" "${args[@]}"
}

VALID_ENV=(
  E2E_SUPABASE_PROJECT_REF=e2eref123
  E2E_SUPABASE_URL=https://e2eref123.supabase.co
  E2E_SUPABASE_ANON_KEY=fake-anon-key-abc
  E2E_SUPABASE_SERVICE_ROLE_KEY="$SENTINEL"
  SUPABASE_PROJECT_REF=prodref456
)

# ===========================================================================
# A1 — --dry-run: exit 0, zero HTTP calls, .env.e2e.auth NOT created
# ===========================================================================

SB1="$(mktemp -d)"; CLEANUP_DIRS+=("$SB1")
mkdir -p "$SB1/backend" "$SB1/scripts/dev"
cp "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" "$SB1/scripts/dev/"
cp -r "${REPO_ROOT}/scripts/dev/lib" "$SB1/scripts/dev/"
CURL_ARGV_LOG1="$(mktemp)"; CURL_CALL_LOG1="$(mktemp)"; CURL_CONFIG_LOG1="$(mktemp)"
LOG1="$(mktemp)"

env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  "${VALID_ENV[@]}" \
  CURL_ARGV_LOG="$CURL_ARGV_LOG1" CURL_CALL_LOG="$CURL_CALL_LOG1" CURL_CONFIG_LOG="$CURL_CONFIG_LOG1" \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --dry-run \
  > "$LOG1" 2>&1
RC1=$?
CALLLOG1="$(cat "$CURL_CALL_LOG1" 2>/dev/null || true)"

if [[ $RC1 -eq 0 ]]; then ok "A1: --dry-run exits 0"; else not_ok "A1: --dry-run exits 0 (rc=$RC1, log: $(cat "$LOG1"))"; fi
if [[ -z "$CALLLOG1" ]]; then ok "A1: --dry-run makes zero HTTP calls"; else not_ok "A1: --dry-run makes zero HTTP calls"; fi
if [[ ! -f "${REPO_ROOT}/.env.e2e.auth" ]]; then ok "A1: --dry-run does not create .env.e2e.auth at repo root"; else not_ok "A1: --dry-run does not create .env.e2e.auth at repo root (FOUND ONE — cleanup!)"; fi

# ===========================================================================
# A2/A3/A4/A5 — production-collision guard
# ===========================================================================

env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  E2E_SUPABASE_PROJECT_REF=sameref E2E_SUPABASE_URL=https://sameref.supabase.co \
  E2E_SUPABASE_ANON_KEY=x E2E_SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_PROJECT_REF=sameref \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --dry-run \
  > /tmp/a2.log 2>&1
RC2=$?
if [[ $RC2 -ne 0 ]]; then ok "A2: E2E ref == prod ref -> non-zero exit"; else not_ok "A2: E2E ref == prod ref -> non-zero exit"; fi
assert_contains "A2: collision message is clear" "$(cat /tmp/a2.log)" "matches the production"
rm -f /tmp/a2.log

env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  E2E_SUPABASE_URL=https://x.supabase.co E2E_SUPABASE_ANON_KEY=x E2E_SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_PROJECT_REF=prodref \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --dry-run \
  > /tmp/a3.log 2>&1
RC3=$?
if [[ $RC3 -ne 0 ]]; then ok "A3: E2E_SUPABASE_PROJECT_REF unset -> non-zero exit (never a false PASS)"; else not_ok "A3: E2E_SUPABASE_PROJECT_REF unset -> non-zero exit"; fi
rm -f /tmp/a3.log

env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  E2E_SUPABASE_PROJECT_REF=" ABC123 " E2E_SUPABASE_URL="https://ABC123.supabase.co" \
  E2E_SUPABASE_ANON_KEY=x E2E_SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_PROJECT_REF="abc123" \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --dry-run \
  > /tmp/a4.log 2>&1
RC4=$?
if [[ $RC4 -ne 0 ]]; then ok "A4: case/whitespace-insensitive collision detected (' ABC123 ' vs 'abc123')"; else not_ok "A4: case/whitespace-insensitive collision detected"; fi
rm -f /tmp/a4.log

env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  E2E_SUPABASE_PROJECT_REF="prodref789" E2E_SUPABASE_URL="https://prodref789.supabase.co" \
  E2E_SUPABASE_ANON_KEY=x E2E_SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_PROJECT_REF="https://prodref789.supabase.co/rest/v1" \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --dry-run \
  > /tmp/a5.log 2>&1
RC5=$?
if [[ $RC5 -ne 0 ]]; then ok "A5: guard detects collision when prod ref given as full URL"; else not_ok "A5: guard detects collision when prod ref given as full URL"; fi
rm -f /tmp/a5.log

# ===========================================================================
# A6 — missing E2E_SUPABASE_SERVICE_ROLE_KEY -> non-zero, no value printed
# ===========================================================================

env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  E2E_SUPABASE_PROJECT_REF=e2eref E2E_SUPABASE_URL=https://e2eref.supabase.co \
  E2E_SUPABASE_ANON_KEY=x SUPABASE_PROJECT_REF=prodref \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --dry-run \
  > /tmp/a6.log 2>&1
RC6=$?
if [[ $RC6 -ne 0 ]]; then ok "A6: missing E2E_SUPABASE_SERVICE_ROLE_KEY -> non-zero exit"; else not_ok "A6: missing E2E_SUPABASE_SERVICE_ROLE_KEY -> non-zero exit"; fi
assert_contains "A6: message names the missing var" "$(cat /tmp/a6.log)" "E2E_SUPABASE_SERVICE_ROLE_KEY"
rm -f /tmp/a6.log

# ===========================================================================
# A7 — coherence assert: URL ref must equal E2E_SUPABASE_PROJECT_REF
# ===========================================================================

env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  E2E_SUPABASE_PROJECT_REF=e2eref E2E_SUPABASE_URL=https://someotherref.supabase.co \
  E2E_SUPABASE_ANON_KEY=x E2E_SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_PROJECT_REF=prodref \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --dry-run \
  > /tmp/a7.log 2>&1
RC7=$?
if [[ $RC7 -ne 0 ]]; then ok "A7: URL ref != E2E_SUPABASE_PROJECT_REF -> non-zero exit"; else not_ok "A7: URL ref != E2E_SUPABASE_PROJECT_REF -> non-zero exit"; fi
assert_contains "A7: mismatch message is an explicit diagnostic" "$(cat /tmp/a7.log)" "mismatch"
rm -f /tmp/a7.log

# ===========================================================================
# A8 — secret non-leak across EVERY reachable path (happy dry-run + every
# error path), stdout+stderr captured
# ===========================================================================

declare -a LEAK_CHECK_LOGS=()

# happy dry-run
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${VALID_ENV[@]}" \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --dry-run > /tmp/leak_dryrun.log 2>&1
LEAK_CHECK_LOGS+=("/tmp/leak_dryrun.log:dry-run happy path")

# missing service-role key
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  E2E_SUPABASE_PROJECT_REF=e2eref E2E_SUPABASE_URL=https://e2eref.supabase.co \
  E2E_SUPABASE_ANON_KEY=x SUPABASE_PROJECT_REF=prodref \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --dry-run > /tmp/leak_missingkey.log 2>&1
LEAK_CHECK_LOGS+=("/tmp/leak_missingkey.log:missing service-role key")

# collision
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  E2E_SUPABASE_PROJECT_REF=sameref E2E_SUPABASE_URL=https://sameref.supabase.co \
  E2E_SUPABASE_ANON_KEY=x E2E_SUPABASE_SERVICE_ROLE_KEY="$SENTINEL" SUPABASE_PROJECT_REF=sameref \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --dry-run > /tmp/leak_collision.log 2>&1
LEAK_CHECK_LOGS+=("/tmp/leak_collision.log:collision")

# mismatch (coherence)
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  E2E_SUPABASE_PROJECT_REF=e2eref E2E_SUPABASE_URL=https://otherref.supabase.co \
  E2E_SUPABASE_ANON_KEY=x E2E_SUPABASE_SERVICE_ROLE_KEY="$SENTINEL" SUPABASE_PROJECT_REF=prodref \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --dry-run > /tmp/leak_mismatch.log 2>&1
LEAK_CHECK_LOGS+=("/tmp/leak_mismatch.log:mismatch")

# mocked curl failure (non-2xx create)
MOCK_CREATE_STATUS=500 MOCK_CREATE_BODY='{"error":"boom"}' \
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${VALID_ENV[@]}" \
  MOCK_CREATE_STATUS=500 MOCK_CREATE_BODY='{"error":"boom"}' \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" > /tmp/leak_httpfail.log 2>&1
LEAK_CHECK_LOGS+=("/tmp/leak_httpfail.log:mocked non-2xx create response")

# mocked malformed JSON on lookup (used after a 409)
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${VALID_ENV[@]}" \
  MOCK_CREATE_STATUS=409 MOCK_CREATE_BODY='{"msg":"Email already registered"}' \
  MOCK_LOOKUP_STATUS=200 MOCK_LOOKUP_BODY='not-json{{{' \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" > /tmp/leak_malformed.log 2>&1
LEAK_CHECK_LOGS+=("/tmp/leak_malformed.log:mocked malformed JSON on lookup")

ALL_LEAK_CHECKS_PASSED="true"
for entry in "${LEAK_CHECK_LOGS[@]}"; do
  f="${entry%%:*}"; label="${entry#*:}"
  content="$(cat "$f" 2>/dev/null || true)"
  if [[ "$content" == *"$SENTINEL"* ]]; then
    not_ok "A8: sentinel service-role-key value never appears in captured output ($label)"
    ALL_LEAK_CHECKS_PASSED="false"
  else
    ok "A8: sentinel service-role-key value never appears in captured output ($label)"
  fi
done
if [[ "$ALL_LEAK_CHECKS_PASSED" == "true" ]]; then
  ok "A8: overall — sentinel absent from every reachable path's stdout+stderr"
else
  not_ok "A8: overall — sentinel absent from every reachable path's stdout+stderr"
fi

# ===========================================================================
# A9 — same sentinel must not appear in any file written (mocked-success
# run inside a sandbox), including the generated .env.e2e.auth
# ===========================================================================

SB9="$(mktemp -d)"; CLEANUP_DIRS+=("$SB9")
mkdir -p "$SB9/scripts/dev"
cp "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" "$SB9/scripts/dev/"
cp -r "${REPO_ROOT}/scripts/dev/lib" "$SB9/scripts/dev/"
# provision-e2e-auth-identities.sh resolves REPO_ROOT as "${SCRIPT_DIR}/../..",
# so it writes .env.e2e.auth at $SB9/.env.e2e.auth.
LOG9="$(mktemp)"
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${VALID_ENV[@]}" \
  bash "$SB9/scripts/dev/provision-e2e-auth-identities.sh" > "$LOG9" 2>&1
RC9=$?

if [[ $RC9 -eq 0 ]]; then ok "A9 setup: mocked-success non-dry-run exits 0"; else not_ok "A9 setup: mocked-success non-dry-run exits 0 (rc=$RC9, log: $(cat "$LOG9"))"; fi

TREE_HITS="$(grep -rl "$SENTINEL" "$SB9" 2>/dev/null || true)"
if [[ -z "$TREE_HITS" ]]; then
  ok "A9: sentinel appears in ZERO files anywhere in the sandbox tree"
else
  not_ok "A9: sentinel appears in ZERO files anywhere in the sandbox tree (found in: $TREE_HITS)"
fi

if [[ -f "$SB9/.env.e2e.auth" ]]; then
  ok "A9 setup: .env.e2e.auth was generated"
  assert_not_contains "A9: generated .env.e2e.auth does not contain the sentinel" "$(cat "$SB9/.env.e2e.auth")" "$SENTINEL"
else
  not_ok "A9 setup: .env.e2e.auth was generated"
  not_ok "A9: generated .env.e2e.auth does not contain the sentinel"
fi

# ===========================================================================
# A10 — sentinel must not appear in curl's argv (argv-exposure regression)
# ===========================================================================

SB10="$(mktemp -d)"; CLEANUP_DIRS+=("$SB10")
mkdir -p "$SB10/scripts/dev"
cp "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" "$SB10/scripts/dev/"
cp -r "${REPO_ROOT}/scripts/dev/lib" "$SB10/scripts/dev/"
CURL_ARGV_LOG10="$(mktemp)"
LOG10="$(mktemp)"
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${VALID_ENV[@]}" \
  CURL_ARGV_LOG="$CURL_ARGV_LOG10" \
  bash "$SB10/scripts/dev/provision-e2e-auth-identities.sh" > "$LOG10" 2>&1
RC10=$?
ARGV10="$(cat "$CURL_ARGV_LOG10" 2>/dev/null || true)"

if [[ $RC10 -eq 0 ]]; then ok "A10 setup: mocked-success run exits 0"; else not_ok "A10 setup: mocked-success run exits 0 (rc=$RC10)"; fi
if [[ -n "$ARGV10" ]]; then ok "A10 setup: curl argv log captured at least one call"; else not_ok "A10 setup: curl argv log captured at least one call"; fi
assert_not_contains "A10: sentinel absent from curl's argv log (must arrive via stdin --config only)" "$ARGV10" "$SENTINEL"
assert_contains "A10: curl was in fact invoked with --config (the intended delivery mechanism)" "$ARGV10" "--config"

# ===========================================================================
# A11 — generated .env.e2e.auth: mode 600, all 4 identities + 3 project
# values, NO service-role-key line
# ===========================================================================

if [[ -f "$SB9/.env.e2e.auth" ]]; then
  MODE="$(stat -f '%Lp' "$SB9/.env.e2e.auth" 2>/dev/null || stat -c '%a' "$SB9/.env.e2e.auth" 2>/dev/null)"
  assert_eq "A11: generated .env.e2e.auth has mode 600" "$MODE" "600"
  CONTENT="$(cat "$SB9/.env.e2e.auth")"
  for k in E2E_SUPABASE_PROJECT_REF E2E_SUPABASE_URL E2E_SUPABASE_ANON_KEY \
           E2E_ADMIN_EMAIL E2E_ADMIN_PASSWORD E2E_BROKER_EMAIL E2E_BROKER_PASSWORD \
           E2E_USER_EMAIL E2E_USER_PASSWORD E2E_DEALER_EMAIL E2E_DEALER_PASSWORD; do
    assert_contains "A11: generated .env.e2e.auth contains $k" "$CONTENT" "$k="
  done
  assert_not_contains "A11: generated .env.e2e.auth contains NO service-role-key ASSIGNMENT line (the file's own comment legitimately names the var to document its absence)" "$CONTENT" "SERVICE_ROLE_KEY="
else
  not_ok "A11: generated .env.e2e.auth has mode 600 (file not generated)"
fi

# ===========================================================================
# A12 — password generation: >=32 chars, 4 distinct per run, differs across runs
# ===========================================================================

if [[ -f "$SB9/.env.e2e.auth" ]]; then
  ADMIN_PW="$(grep '^E2E_ADMIN_PASSWORD=' "$SB9/.env.e2e.auth" | cut -d= -f2-)"
  BROKER_PW="$(grep '^E2E_BROKER_PASSWORD=' "$SB9/.env.e2e.auth" | cut -d= -f2-)"
  USER_PW="$(grep '^E2E_USER_PASSWORD=' "$SB9/.env.e2e.auth" | cut -d= -f2-)"
  DEALER_PW="$(grep '^E2E_DEALER_PASSWORD=' "$SB9/.env.e2e.auth" | cut -d= -f2-)"

  if [[ ${#ADMIN_PW} -ge 32 && ${#BROKER_PW} -ge 32 && ${#USER_PW} -ge 32 && ${#DEALER_PW} -ge 32 ]]; then
    ok "A12: all 4 generated passwords are >= 32 chars"
  else
    not_ok "A12: all 4 generated passwords are >= 32 chars (lens: ${#ADMIN_PW},${#BROKER_PW},${#USER_PW},${#DEALER_PW})"
  fi

  UNIQ_COUNT="$(printf '%s\n%s\n%s\n%s\n' "$ADMIN_PW" "$BROKER_PW" "$USER_PW" "$DEALER_PW" | sort -u | wc -l | tr -d ' ')"
  assert_eq "A12: the 4 identities get 4 DISTINCT passwords" "$UNIQ_COUNT" "4"

  # second run -> different passwords (not deterministic across runs)
  SB12B="$(mktemp -d)"; CLEANUP_DIRS+=("$SB12B")
  mkdir -p "$SB12B/scripts/dev"
  cp "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" "$SB12B/scripts/dev/"
  cp -r "${REPO_ROOT}/scripts/dev/lib" "$SB12B/scripts/dev/"
  env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${VALID_ENV[@]}" \
    bash "$SB12B/scripts/dev/provision-e2e-auth-identities.sh" > /dev/null 2>&1
  ADMIN_PW_2="$(grep '^E2E_ADMIN_PASSWORD=' "$SB12B/.env.e2e.auth" 2>/dev/null | cut -d= -f2-)"
  if [[ -n "$ADMIN_PW_2" && "$ADMIN_PW_2" != "$ADMIN_PW" ]]; then
    ok "A12: two separate runs produce different admin passwords (not deterministic)"
  else
    not_ok "A12: two separate runs produce different admin passwords (not deterministic) (run1=$ADMIN_PW run2=$ADMIN_PW_2)"
  fi
else
  not_ok "A12: all 4 generated passwords are >= 32 chars (file not generated)"
  not_ok "A12: the 4 identities get 4 DISTINCT passwords (file not generated)"
  not_ok "A12: two separate runs produce different admin passwords (file not generated)"
fi

# ===========================================================================
# A13 — idempotency: mocked 409 leads to password-update (PUT), not failure.
# #2691 regression: the lookup response is an UNFILTERED page (decoys before
# AND after each target, matching a real GoTrue response that ignores
# ?email=) — asserts each identity's PUT lands on the id matching ITS OWN
# email, not `.[0]` / a decoy. This is a discrimination check, not a
# containment check: it would have caught the pre-fix `.[0].id` behaviour.
# ===========================================================================

SB13="$(mktemp -d)"; CLEANUP_DIRS+=("$SB13")
mkdir -p "$SB13/scripts/dev"
cp "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" "$SB13/scripts/dev/"
cp -r "${REPO_ROOT}/scripts/dev/lib" "$SB13/scripts/dev/"
CURL_CONFIG_LOG13="$(mktemp)"
LOG13="$(mktemp)"
UNFILTERED_USERS_PAGE='{"users":[
  {"id":"DECOY-BEFORE-1","email":"decoy1@example.com"},
  {"id":"DECOY-BEFORE-2","email":"decoy2@example.com"},
  {"id":"ADMIN-REAL-ID","email":"e2e-admin@udupi-e2e.invalid"},
  {"id":"BROKER-REAL-ID","email":"e2e-broker@udupi-e2e.invalid"},
  {"id":"USER-REAL-ID","email":"e2e-user@udupi-e2e.invalid"},
  {"id":"DEALER-REAL-ID","email":"e2e-dealer@udupi-e2e.invalid"},
  {"id":"DECOY-AFTER-1","email":"decoy3@example.com"}
]}'
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${VALID_ENV[@]}" \
  MOCK_CREATE_STATUS=409 MOCK_CREATE_BODY='{"msg":"Email address already registered"}' \
  MOCK_LOOKUP_STATUS=200 MOCK_LOOKUP_PAGE1_BODY="$UNFILTERED_USERS_PAGE" \
  MOCK_UPDATE_STATUS=200 MOCK_UPDATE_BODY='{}' \
  CURL_CONFIG_LOG="$CURL_CONFIG_LOG13" \
  bash "$SB13/scripts/dev/provision-e2e-auth-identities.sh" > "$LOG13" 2>&1
RC13=$?
if [[ $RC13 -eq 0 ]]; then ok "A13: mocked 409 on create leads to overall success (idempotent path), not a hard failure"; else not_ok "A13: mocked 409 -> success (rc=$RC13, log: $(cat "$LOG13"))"; fi
assert_contains "A13: log shows the already-exists/update-instead branch was taken" "$(cat "$LOG13")" "already exists"
if [[ -f "$SB13/.env.e2e.auth" ]]; then
  ok "A13: .env.e2e.auth still written after the 409/update path"
else
  not_ok "A13: .env.e2e.auth still written after the 409/update path"
fi

CFG13="$(cat "$CURL_CONFIG_LOG13" 2>/dev/null || true)"
assert_contains "A13 (#2691): admin identity's PUT targets the email-matched id (ADMIN-REAL-ID), not a decoy" "$CFG13" "/auth/v1/admin/users/ADMIN-REAL-ID"
assert_contains "A13 (#2691): broker identity's PUT targets the email-matched id (BROKER-REAL-ID)" "$CFG13" "/auth/v1/admin/users/BROKER-REAL-ID"
assert_contains "A13 (#2691): user identity's PUT targets the email-matched id (USER-REAL-ID)" "$CFG13" "/auth/v1/admin/users/USER-REAL-ID"
assert_contains "A13 (#2691): dealer identity's PUT targets the email-matched id (DEALER-REAL-ID)" "$CFG13" "/auth/v1/admin/users/DEALER-REAL-ID"
assert_not_contains "A13 (#2691): no PUT ever targets a decoy id (would prove the pre-fix .[0] bug)" "$CFG13" "/auth/v1/admin/users/DECOY-"
assert_contains "A13 (#2691): lookup call uses pagination params (page=, per_page=), not the non-functional ?email= filter" "$CFG13" "admin/users?page=1&per_page="

# ===========================================================================
# A16 (#2691) — pagination continues across pages: page 1 is FULL (count ==
# per_page) and contains no match; the target is found on page 2. Proves the
# fix doesn't stop after a single unfiltered page.
# ===========================================================================

SB16="$(mktemp -d)"; CLEANUP_DIRS+=("$SB16")
mkdir -p "$SB16/scripts/dev"
cp "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" "$SB16/scripts/dev/"
cp -r "${REPO_ROOT}/scripts/dev/lib" "$SB16/scripts/dev/"
CURL_CONFIG_LOG16="$(mktemp)"
LOG16="$(mktemp)"

# Build a page-1 body with exactly 200 decoy users (== per_page in the
# script) so the fix's "short page => stop" heuristic does NOT stop here.
PAGE1_USERS="$(python3 -c '
import json
print(json.dumps({"users": [{"id": f"DECOY-{i}", "email": f"decoy{i}@example.com"} for i in range(200)]}))
' 2>/dev/null || node -e '
const users = Array.from({length:200}, (_,i)=>({id:`DECOY-${i}`, email:`decoy${i}@example.com`}));
console.log(JSON.stringify({users}));
')"
PAGE2_USERS='{"users":[{"id":"ADMIN-PAGE2-ID","email":"e2e-admin@udupi-e2e.invalid"},{"id":"BROKER-PAGE2-ID","email":"e2e-broker@udupi-e2e.invalid"},{"id":"USER-PAGE2-ID","email":"e2e-user@udupi-e2e.invalid"},{"id":"DEALER-PAGE2-ID","email":"e2e-dealer@udupi-e2e.invalid"}]}'

env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${VALID_ENV[@]}" \
  MOCK_CREATE_STATUS=409 MOCK_CREATE_BODY='{"msg":"Email address already registered"}' \
  MOCK_LOOKUP_STATUS=200 MOCK_LOOKUP_PAGE1_BODY="$PAGE1_USERS" MOCK_LOOKUP_PAGE2_BODY="$PAGE2_USERS" \
  MOCK_UPDATE_STATUS=200 MOCK_UPDATE_BODY='{}' \
  CURL_CONFIG_LOG="$CURL_CONFIG_LOG16" \
  bash "$SB16/scripts/dev/provision-e2e-auth-identities.sh" > "$LOG16" 2>&1
RC16=$?
if [[ $RC16 -eq 0 ]]; then ok "A16: pagination continues to page 2 and succeeds when the match is on a later page"; else not_ok "A16: pagination continues to page 2 (rc=$RC16, log: $(cat "$LOG16"))"; fi
CFG16="$(cat "$CURL_CONFIG_LOG16" 2>/dev/null || true)"
assert_contains "A16: a page=2 request was actually made" "$CFG16" "admin/users?page=2&per_page="
assert_contains "A16: admin identity's PUT targets the page-2-matched id" "$CFG16" "/auth/v1/admin/users/ADMIN-PAGE2-ID"

# ===========================================================================
# A17 (#2691) — SHORT page (count < per_page), no match anywhere on it ->
# treated as end-of-list, fail closed (non-zero exit) via _provision_identity's
# own "could not be looked up" check, never silently proceeds with a wrong/
# empty id. (Does NOT exercise the max_pages cap — see A18 for that.)
# ===========================================================================

SB17="$(mktemp -d)"; CLEANUP_DIRS+=("$SB17")
mkdir -p "$SB17/scripts/dev"
cp "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" "$SB17/scripts/dev/"
cp -r "${REPO_ROOT}/scripts/dev/lib" "$SB17/scripts/dev/"
LOG17="$(mktemp)"
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${VALID_ENV[@]}" \
  MOCK_CREATE_STATUS=409 MOCK_CREATE_BODY='{"msg":"Email address already registered"}' \
  MOCK_LOOKUP_STATUS=200 MOCK_LOOKUP_BODY='{"users":[{"id":"NEVER-MATCHES","email":"nobody@example.com"}]}' \
  bash "$SB17/scripts/dev/provision-e2e-auth-identities.sh" > "$LOG17" 2>&1
RC17=$?
if [[ $RC17 -ne 0 ]]; then ok "A17: no matching identity found on a short (end-of-list) page -> non-zero exit (fail closed, never proceeds)"; else not_ok "A17: no matching identity found -> non-zero exit (rc=$RC17)"; fi
if [[ ! -f "$SB17/.env.e2e.auth" ]]; then ok "A17: .env.e2e.auth NOT written when lookup never finds a match"; else not_ok "A17: .env.e2e.auth NOT written when lookup never finds a match"; fi

# ===========================================================================
# A18 (#2691) — max_pages CAP EXHAUSTION: every page is FULL (count ==
# per_page, so pagination never sees a "short page" end-of-list signal) and
# never contains a match. Proves the safety cap actually fires: exactly
# max_pages (50) GET calls, the specific "scanned 50 pages" error text,
# non-zero exit, no .env.e2e.auth. Without this, the cap-exhaustion branch
# (as opposed to the short-page branch A17 exercises) is unverified.
# ===========================================================================

SB18="$(mktemp -d)"; CLEANUP_DIRS+=("$SB18")
mkdir -p "$SB18/scripts/dev"
cp "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" "$SB18/scripts/dev/"
cp -r "${REPO_ROOT}/scripts/dev/lib" "$SB18/scripts/dev/"
CURL_CONFIG_LOG18="$(mktemp)"
LOG18="$(mktemp)"

# Every page returns 200 non-matching users via the generic MOCK_LOOKUP_BODY
# fallback (no per-page override set), so count == per_page on EVERY call —
# the loop can only stop via the max_pages cap, never the short-page branch.
FULL_NONMATCHING_PAGE="$(python3 -c '
import json
print(json.dumps({"users": [{"id": f"NOMATCH-{i}", "email": f"nomatch{i}@example.com"} for i in range(200)]}))
' 2>/dev/null || node -e '
const users = Array.from({length:200}, (_,i)=>({id:`NOMATCH-${i}`, email:`nomatch${i}@example.com`}));
console.log(JSON.stringify({users}));
')"

env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${VALID_ENV[@]}" \
  MOCK_CREATE_STATUS=409 MOCK_CREATE_BODY='{"msg":"Email address already registered"}' \
  MOCK_LOOKUP_STATUS=200 MOCK_LOOKUP_BODY="$FULL_NONMATCHING_PAGE" \
  CURL_CONFIG_LOG="$CURL_CONFIG_LOG18" \
  bash "$SB18/scripts/dev/provision-e2e-auth-identities.sh" > "$LOG18" 2>&1
RC18=$?
if [[ $RC18 -ne 0 ]]; then ok "A18: max_pages cap exhausted without a match -> non-zero exit (fail closed)"; else not_ok "A18: max_pages cap exhausted -> non-zero exit (rc=$RC18)"; fi
assert_contains "A18: log names the specific cap-exhaustion error (scanned 50 pages)" "$(cat "$LOG18")" "scanned 50 pages"
if [[ ! -f "$SB18/.env.e2e.auth" ]]; then ok "A18: .env.e2e.auth NOT written after cap exhaustion"; else not_ok "A18: .env.e2e.auth NOT written after cap exhaustion"; fi
CFG18="$(cat "$CURL_CONFIG_LOG18" 2>/dev/null || true)"
PAGE_GET_COUNT18="$(printf '%s\n' "$CFG18" | grep -c 'admin/users?page=' || true)"
assert_eq "A18: exactly 50 lookup GET calls were made (one per page, cap fires — never loops past max_pages)" "$PAGE_GET_COUNT18" "50"

# ===========================================================================
# A14 — failure atomicity: mocked mid-run API failure leaves NO partial
# .env.e2e.auth
# ===========================================================================

SB14="$(mktemp -d)"; CLEANUP_DIRS+=("$SB14")
mkdir -p "$SB14/scripts/dev"
cp "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" "$SB14/scripts/dev/"
cp -r "${REPO_ROOT}/scripts/dev/lib" "$SB14/scripts/dev/"
LOG14="$(mktemp)"
env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "${VALID_ENV[@]}" \
  MOCK_CREATE_STATUS=500 MOCK_CREATE_BODY='{"error":"internal"}' \
  bash "$SB14/scripts/dev/provision-e2e-auth-identities.sh" > "$LOG14" 2>&1
RC14=$?
if [[ $RC14 -ne 0 ]]; then ok "A14: mocked mid-run API failure aborts the script (non-zero exit)"; else not_ok "A14: mocked mid-run API failure aborts the script"; fi
if [[ ! -f "$SB14/.env.e2e.auth" ]]; then
  ok "A14: no partial .env.e2e.auth left behind after a mocked failure"
else
  not_ok "A14: no partial .env.e2e.auth left behind after a mocked failure (FOUND ONE)"
fi
# also no leftover tmp file from the atomic-write mktemp pattern
LEFTOVER_TMP="$(find "$SB14" -maxdepth 1 -name '.env.e2e.auth.??????' 2>/dev/null || true)"
if [[ -z "$LEFTOVER_TMP" ]]; then
  ok "A14: no leftover .env.e2e.auth.XXXXXX temp file after a mocked failure"
else
  not_ok "A14: no leftover .env.e2e.auth.XXXXXX temp file after a mocked failure (found: $LEFTOVER_TMP)"
fi

# ===========================================================================
# A15 — --help exits 0 and documents the ephemeral-key contract
# ===========================================================================

env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" \
  bash "${REPO_ROOT}/scripts/dev/provision-e2e-auth-identities.sh" --help > /tmp/a15.log 2>&1
RC15=$?
if [[ $RC15 -eq 0 ]]; then ok "A15: --help exits 0"; else not_ok "A15: --help exits 0 (rc=$RC15)"; fi
assert_contains "A15: --help documents the ephemeral-only contract for the service-role key" "$(cat /tmp/a15.log)" "Ephemeral only"
assert_contains "A15: --help states the key is never written to disk" "$(cat /tmp/a15.log)" "NEVER written"
rm -f /tmp/a15.log

echo ""
echo "1..$TOTAL"
if [[ $FAILED -eq 0 ]]; then
  echo "# All $TOTAL assertions passed."
  exit 0
else
  echo "# $FAILED of $TOTAL assertions FAILED."
  exit 1
fi
