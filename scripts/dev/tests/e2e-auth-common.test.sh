#!/usr/bin/env bash
# scripts/dev/tests/e2e-auth-common.test.sh — #2236 Part B (independent QA)
#
# Direct unit tests of scripts/dev/lib/e2e-auth-common.sh's pure(ish)
# primitives: _e2e_auth_extract_ref, _e2e_auth_trim_lower,
# _e2e_auth_collision_guard, _e2e_auth_coherence_assert, _e2e_auth_mask,
# _e2e_auth_load_and_validate, _e2e_auth_file_mode.
#
# No mocks needed — these functions do no I/O except _e2e_auth_load_and_validate
# (reads a file) and _e2e_auth_detect_production_ref (greps files); everything
# else is pure string manipulation. Follows the harness idioms of
# local-fixture-backend.test.sh (ok/not_ok/assert_* + trap-based cleanup).
#
# Run:  bash scripts/dev/tests/e2e-auth-common.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

TOTAL=0
FAILED=0

ok() { TOTAL=$((TOTAL + 1)); echo "ok $TOTAL - $1"; }
not_ok() { TOTAL=$((TOTAL + 1)); FAILED=$((FAILED + 1)); echo "not ok $TOTAL - $1"; }
assert_eq() {
  # $1 = description, $2 = actual, $3 = expected
  if [[ "$2" == "$3" ]]; then ok "$1"; else not_ok "$1 (got [$2], expected [$3])"; fi
}
assert_true() { if [[ "$2" -eq 0 ]]; then ok "$1"; else not_ok "$1"; fi }
assert_false() { if [[ "$2" -ne 0 ]]; then ok "$1"; else not_ok "$1"; fi }
assert_contains() { if [[ "$2" == *"$3"* ]]; then ok "$1"; else not_ok "$1 (expected to find [$3] in [$2])"; fi }
assert_not_contains() { if [[ "$2" != *"$3"* ]]; then ok "$1"; else not_ok "$1 (unexpectedly found [$3])"; fi }

CLEANUP_DIRS=()
cleanup_all() {
  for d in "${CLEANUP_DIRS[@]:-}"; do
    [[ -n "$d" && -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup_all EXIT

# shellcheck source=../lib/e2e-auth-common.sh
source "${REPO_ROOT}/scripts/dev/lib/e2e-auth-common.sh"

# ===========================================================================
# _e2e_auth_extract_ref
# ===========================================================================

assert_eq "extract_ref: full https URL" "$(_e2e_auth_extract_ref 'https://abc123.supabase.co')" "abc123"
assert_eq "extract_ref: full http URL" "$(_e2e_auth_extract_ref 'http://abc123.supabase.co')" "abc123"
assert_eq "extract_ref: URL with path" "$(_e2e_auth_extract_ref 'https://abc123.supabase.co/auth/v1/token')" "abc123"
assert_eq "extract_ref: bare ref (no scheme, no dot)" "$(_e2e_auth_extract_ref 'abc123')" "abc123"
assert_eq "extract_ref: URL with trailing slash" "$(_e2e_auth_extract_ref 'https://abc123.supabase.co/')" "abc123"
assert_eq "extract_ref: uppercase ref is lowercased" "$(_e2e_auth_extract_ref 'https://ABC123.supabase.co')" "abc123"
assert_eq "extract_ref: surrounding whitespace is trimmed" "$(_e2e_auth_extract_ref '  https://abc123.supabase.co  ')" "abc123"
assert_eq "extract_ref: non-supabase/custom domain still takes first label" "$(_e2e_auth_extract_ref 'https://abc123.mycustomdomain.example.com')" "abc123"
assert_eq "extract_ref: empty input -> empty output" "$(_e2e_auth_extract_ref '')" ""
assert_eq "extract_ref: unset input -> empty output" "$(_e2e_auth_extract_ref)" ""

# ===========================================================================
# _e2e_auth_trim_lower
# ===========================================================================

assert_eq "trim_lower: leading/trailing whitespace + case" "$(_e2e_auth_trim_lower '  ABC123  ')" "abc123"
assert_eq "trim_lower: tab/newline-ish whitespace" "$(_e2e_auth_trim_lower $'\tABC\t')" "abc"
assert_eq "trim_lower: empty input" "$(_e2e_auth_trim_lower '')" ""

# ===========================================================================
# _e2e_auth_collision_guard
# ===========================================================================

_e2e_auth_collision_guard "e2eref" "prodref" >/tmp/e2eacg_out_$$ 2>&1
assert_true "collision_guard: distinct refs -> pass (rc 0)" $?
rm -f /tmp/e2eacg_out_$$

_e2e_auth_collision_guard "sameref" "sameref" >/tmp/e2eacg_out_$$ 2>&1
RC=$?
OUT="$(cat /tmp/e2eacg_out_$$)"
rm -f /tmp/e2eacg_out_$$
assert_false "collision_guard: identical refs -> fail (rc != 0)" $RC
assert_contains "collision_guard: identical-ref message is clear" "$OUT" "matches the production"

_e2e_auth_collision_guard "" "prodref" >/tmp/e2eacg_out_$$ 2>&1
RC=$?
OUT="$(cat /tmp/e2eacg_out_$$)"
rm -f /tmp/e2eacg_out_$$
assert_false "collision_guard: empty E2E ref -> fail" $RC
assert_contains "collision_guard: empty E2E ref message names E2E_SUPABASE_PROJECT_REF" "$OUT" "E2E_SUPABASE_PROJECT_REF is empty"

_e2e_auth_collision_guard "e2eref" "" >/tmp/e2eacg_out_$$ 2>&1
RC=$?
rm -f /tmp/e2eacg_out_$$
assert_false "collision_guard: empty prod ref -> fail" $RC

# CRITICAL: two empty values must never compare "equal" into a pass.
_e2e_auth_collision_guard "" "" >/tmp/e2eacg_out_$$ 2>&1
RC=$?
rm -f /tmp/e2eacg_out_$$
assert_false "collision_guard: BOTH refs empty -> fail (must never PASS via empty==empty)" $RC

# Case/whitespace-insensitive collision detection.
_e2e_auth_collision_guard " ABC123 " "abc123" >/tmp/e2eacg_out_$$ 2>&1
RC=$?
rm -f /tmp/e2eacg_out_$$
assert_false "collision_guard: case/whitespace-insensitive collision (' ABC123 ' vs 'abc123')" $RC

# Full-URL form vs bare-ref form for the production side.
_e2e_auth_collision_guard "abc123" "https://abc123.supabase.co" >/tmp/e2eacg_out_$$ 2>&1
RC=$?
rm -f /tmp/e2eacg_out_$$
assert_false "collision_guard: bare E2E ref vs full-URL production ref detected as collision" $RC

_e2e_auth_collision_guard "https://abc123.supabase.co" "https://abc123.supabase.co" >/tmp/e2eacg_out_$$ 2>&1
RC=$?
rm -f /tmp/e2eacg_out_$$
assert_false "collision_guard: both sides full-URL form, same ref -> collision detected" $RC

# ===========================================================================
# _e2e_auth_coherence_assert
# ===========================================================================

_e2e_auth_coherence_assert "https://abc123.supabase.co" "abc123" >/tmp/e2eacg_out_$$ 2>&1
assert_true "coherence_assert: matching URL/ref -> pass" $?
rm -f /tmp/e2eacg_out_$$

_e2e_auth_coherence_assert "https://abc123.supabase.co" "xyz789" >/tmp/e2eacg_out_$$ 2>&1
RC=$?
OUT="$(cat /tmp/e2eacg_out_$$)"
rm -f /tmp/e2eacg_out_$$
assert_false "coherence_assert: mismatched URL/ref -> fail" $RC
assert_contains "coherence_assert: mismatch message is an explicit diagnostic" "$OUT" "mismatch"

# ===========================================================================
# _e2e_auth_mask
# ===========================================================================

MASKED="$(_e2e_auth_mask 'super-secret-value-1234567890')"
assert_not_contains "mask: masked output never contains the raw value" "$MASKED" "super-secret-value-1234567890"
assert_contains "mask: masked output reports a length" "$MASKED" "29 chars"
assert_eq "mask: empty value reports '(empty)'" "$(_e2e_auth_mask '')" "(empty)"
# NOTE on how much the mask reveals: _e2e_auth_mask never reveals any prefix/
# suffix character of the secret — output is exactly "***REDACTED*** (N chars)"
# where N is the character COUNT. This count is a minor, generally-accepted
# information leak (an attacker learns the secret's length, e.g. distinguishing
# a 32-char generated password from a ~200-char Supabase JWT-style service-role
# key) but reveals nothing about content. No prefix/suffix substring is ever
# shown, unlike some "mask" conventions that echo first/last N characters.
assert_eq "mask: two different-length secrets produce different reported lengths (length itself leaks)" \
  "$(_e2e_auth_mask 'short')" "***REDACTED*** (5 chars)"

# ===========================================================================
# _e2e_auth_file_mode + _e2e_auth_load_and_validate
# ===========================================================================

TMPD="$(mktemp -d)"
CLEANUP_DIRS+=("$TMPD")

# Missing file.
_e2e_auth_load_and_validate "$TMPD/does-not-exist" >/tmp/e2eacg_out_$$ 2>&1
RC=$?
OUT="$(cat /tmp/e2eacg_out_$$)"
rm -f /tmp/e2eacg_out_$$
assert_false "load_and_validate: missing file -> fail" $RC
assert_contains "load_and_validate: missing file message contains E2E_AUTH_PROJECT_NOT_CONFIGURED" "$OUT" "E2E_AUTH_PROJECT_NOT_CONFIGURED"

# Present, mode 600, but missing required keys.
INCOMPLETE="$TMPD/.env.e2e.auth.incomplete"
cat > "$INCOMPLETE" <<'EOF'
E2E_SUPABASE_PROJECT_REF=abc123
EOF
chmod 600 "$INCOMPLETE"
_e2e_auth_load_and_validate "$INCOMPLETE" >/tmp/e2eacg_out_$$ 2>&1
RC=$?
OUT="$(cat /tmp/e2eacg_out_$$)"
rm -f /tmp/e2eacg_out_$$
assert_false "load_and_validate: mode 600 but missing keys -> fail" $RC
assert_contains "load_and_validate: missing-keys message contains E2E_AUTH_PROJECT_NOT_CONFIGURED" "$OUT" "E2E_AUTH_PROJECT_NOT_CONFIGURED"
assert_contains "load_and_validate: missing-keys message names a missing key (E2E_SUPABASE_URL)" "$OUT" "E2E_SUPABASE_URL"

# Present, complete, but mode 644.
COMPLETE644="$TMPD/.env.e2e.auth.644"
cat > "$COMPLETE644" <<'EOF'
E2E_SUPABASE_PROJECT_REF=abc123
E2E_SUPABASE_URL=https://abc123.supabase.co
E2E_SUPABASE_ANON_KEY=fake-anon-key
E2E_ADMIN_EMAIL=e2e-admin@udupi-e2e.invalid
E2E_ADMIN_PASSWORD=fake-admin-password-0000000000000000
E2E_BROKER_EMAIL=e2e-broker@udupi-e2e.invalid
E2E_BROKER_PASSWORD=fake-broker-password-0000000000000000
E2E_USER_EMAIL=e2e-user@udupi-e2e.invalid
E2E_USER_PASSWORD=fake-user-password-00000000000000000
E2E_DEALER_EMAIL=e2e-dealer@udupi-e2e.invalid
E2E_DEALER_PASSWORD=fake-dealer-password-0000000000000000
EOF
chmod 644 "$COMPLETE644"
_e2e_auth_load_and_validate "$COMPLETE644" >/tmp/e2eacg_out_$$ 2>&1
RC=$?
OUT="$(cat /tmp/e2eacg_out_$$)"
rm -f /tmp/e2eacg_out_$$
assert_false "load_and_validate: mode 644 (world-readable) -> fail closed, not a warning" $RC
assert_contains "load_and_validate: mode-644 message is distinct (E2E_AUTH_PROJECT_NOT_CONFIGURED + mode)" "$OUT" "E2E_AUTH_PROJECT_NOT_CONFIGURED"
assert_contains "load_and_validate: mode-644 message states the offending mode" "$OUT" "mode 644"

# Present, complete, mode 600 -> success and exports.
COMPLETE600="$TMPD/.env.e2e.auth.600"
cp "$COMPLETE644" "$COMPLETE600"
chmod 600 "$COMPLETE600"
(
  _e2e_auth_load_and_validate "$COMPLETE600" >/tmp/e2eacg_out_$$ 2>&1
  echo "RC=$?" >> /tmp/e2eacg_out_$$
  echo "REF=${E2E_SUPABASE_PROJECT_REF:-}" >> /tmp/e2eacg_out_$$
)
OUT="$(cat /tmp/e2eacg_out_$$)"
rm -f /tmp/e2eacg_out_$$
assert_contains "load_and_validate: mode 600 + complete -> rc 0" "$OUT" "RC=0"
assert_contains "load_and_validate: mode 600 + complete -> exports E2E_SUPABASE_PROJECT_REF" "$OUT" "REF=abc123"

# ===========================================================================
# _e2e_auth_curl_config_escape — CR/LF (and backslash/quote) escaping for
# safe embedding inside a double-quoted curl --config directive value.
# Escape order is \ -> " -> \r -> \n (see comment in the source); a
# regression here (wrong order, or a missed \r/\n branch) would let a value
# containing a real embedded CR/LF byte terminate the current directive's
# quoted string early and inject an attacker-controlled new config
# directive (e.g. a spurious `insecure` or extra `header =` line) into the
# payload fed to `curl --config -` by _admin_api_call.
# ===========================================================================

# A real embedded CRLF pair, positioned exactly as it could appear in a
# service-role key or URL value, must not survive as actual CR/LF bytes in
# the escaped output — otherwise it would open a fresh line inside the
# --config payload.
# NOTE: built with $'...' ANSI-C quoting, not $(printf '\r\n'), because
# command substitution strips trailing newlines and would silently drop the
# \n half of each CRLF pair.
INJECTION_INPUT="prefix"$'\r\n'"insecure = true"$'\r\n'"url = \"http://evil.example\""
ESCAPED_INJECTION="$(_e2e_auth_curl_config_escape "$INJECTION_INPUT")"
if [[ "$ESCAPED_INJECTION" != *$'\r'* && "$ESCAPED_INJECTION" != *$'\n'* ]]; then
  ok "curl_config_escape: real CR/LF bytes are fully escaped out of the output (no injected config line survives as an actual newline)"
else
  not_ok "curl_config_escape: real CR/LF bytes are fully escaped out of the output (found a literal CR or LF byte -- config injection possible)"
fi
assert_contains "curl_config_escape: CR is rendered as the literal two-char escape \\r" "$ESCAPED_INJECTION" '\r'
assert_contains "curl_config_escape: LF is rendered as the literal two-char escape \\n" "$ESCAPED_INJECTION" '\n'

# Simulate embedding it the way _admin_api_call does, inside a double-quoted
# directive value, and assert the injected "insecure"/"url =" text does not
# open a new physical line in the generated config payload (i.e. the
# directive stays a single logical line, not three).
SIMULATED_CFG="header = \"X-Test: ${ESCAPED_INJECTION}\""
CFG_LINE_COUNT="$(printf '%s' "$SIMULATED_CFG" | wc -l | tr -d ' ')"
assert_eq "curl_config_escape: embedded in a --config directive, the escaped value introduces zero extra newlines (injection defeated)" "$CFG_LINE_COUNT" "0"

# Escape ordering: backslash MUST be escaped first. A literal (non-CR)
# two-char sequence backslash+'r' in the input must come out as a DOUBLED
# backslash followed by 'r' — never collapse into what a freshly-escaped
# real \r would look like (which would mean the function re-escaped its
# own escape output, i.e. "double-escaped").
LITERAL_BACKSLASH_R='a\rb'   # literal 4 chars: a, backslash, r, b (NOT a real CR)
ESCAPED_LITERAL="$(_e2e_auth_curl_config_escape "$LITERAL_BACKSLASH_R")"
assert_eq "curl_config_escape: a literal backslash+'r' (not a real CR) is doubled, not re-escaped as a fresh \\r" "$ESCAPED_LITERAL" 'a\\rb'

# A REAL CR must produce a SINGLE new backslash + 'r' (not a doubled
# backslash), proving the \r substitution runs once on the actual byte and
# is not itself re-escaped by a later pass.
REAL_CR="$(printf 'a\rb')"
ESCAPED_REAL_CR="$(_e2e_auth_curl_config_escape "$REAL_CR")"
assert_eq "curl_config_escape: a real CR byte becomes exactly one new backslash + 'r' (single-pass escape, no double-escaping)" "$ESCAPED_REAL_CR" 'a\rb'

# Quote + backslash interplay: escape order is backslash first, then quote.
QUOTE_AND_BACKSLASH='a"b\c'  # literal 5 chars: a, ", b, \, c
ESCAPED_QB="$(_e2e_auth_curl_config_escape "$QUOTE_AND_BACKSLASH")"
assert_eq "curl_config_escape: backslash escaped before quote (no double-escaped quote)" "$ESCAPED_QB" 'a\"b\\c'

echo ""
echo "1..$TOTAL"
if [[ $FAILED -eq 0 ]]; then
  echo "# All $TOTAL assertions passed."
  exit 0
else
  echo "# $FAILED of $TOTAL assertions FAILED."
  exit 1
fi
