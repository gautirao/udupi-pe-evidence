#!/usr/bin/env bash
# scripts/dev/tests/verify-e2e-auth-project.test.sh — #2236 Part B
# (independent QA of scripts/dev/verify-e2e-auth-project.sh)
#
# `curl` is PATH-mocked exactly as in provision-e2e-auth-identities.test.sh —
# real HTTP is structurally impossible. This script is read-only, so tests
# also snapshot the sandbox file tree before/after to prove it never writes.
#
# IMPORTANT: verify-e2e-auth-project.sh resolves REPO_ROOT from its OWN
# script path (SCRIPT_DIR/../..), not from $PWD — so to control what it sees
# as ".env.e2e.auth at the repo root" or "apps/api/.env for production-ref
# detection", each sandbox must contain a full copy of the script + its lib
# at the matching relative path (scripts/dev/verify-e2e-auth-project.sh +
# scripts/dev/lib/e2e-auth-common.sh), exactly like new_fixture_sandbox() in
# local-fixture-backend.test.sh does for that script.
#
# Run:  bash scripts/dev/tests/verify-e2e-auth-project.test.sh

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

WANT_STATUS="false"
METHOD="GET"
URL=""
PREV=""
for a in "$@"; do
  [[ "$a" == "-w" || "$a" == --write-out* ]] && WANT_STATUS="true"
  if [[ "$PREV" == "-X" ]]; then METHOD="$a"; fi
  PREV="$a"
done
for a in "$@"; do
  [[ "$a" == http* ]] && URL="$a"
done

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
    if [[ -n "${MOCK_OIDC_BODY:-}" ]]; then BODY="$MOCK_OIDC_BODY"; else BODY='{"issuer":"unset"}'; fi
    ;;
  *well-known/jwks.json*)
    STATUS="${MOCK_JWKS_STATUS:-200}"
    if [[ -n "${MOCK_JWKS_BODY:-}" ]]; then BODY="$MOCK_JWKS_BODY"; else BODY='{"keys":[]}'; fi
    ;;
  *grant_type=password*)
    STATUS="${MOCK_LOGIN_STATUS:-200}"
    if [[ -n "${MOCK_LOGIN_BODY:-}" ]]; then BODY="$MOCK_LOGIN_BODY"; else BODY='{}'; fi
    ;;
esac

printf '%s' "$BODY"
if [[ "$WANT_STATUS" == "true" ]]; then
  printf '\n%s' "$STATUS"
fi
exit 0
MOCKEOF
chmod +x "$MOCKBIN/curl"

# new_verify_sandbox — a temp dir containing scripts/dev/verify-e2e-auth-project.sh
# + scripts/dev/lib/e2e-auth-common.sh at the correct relative path, so the
# script's own REPO_ROOT resolution lands inside the sandbox.
new_verify_sandbox() {
  local sb
  sb="$(mktemp -d)"
  CLEANUP_DIRS+=("$sb")
  mkdir -p "$sb/scripts/dev"
  cp "${REPO_ROOT}/scripts/dev/verify-e2e-auth-project.sh" "$sb/scripts/dev/"
  cp -r "${REPO_ROOT}/scripts/dev/lib" "$sb/scripts/dev/"
  echo "$sb"
}

run_verify_in() {
  # $1 = sandbox dir; remaining args = NAME=VALUE env assignments
  local sb="$1"
  shift
  env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "$@" \
    bash "$sb/scripts/dev/verify-e2e-auth-project.sh"
}

snapshot_tree() {
  find "$1" -type f 2>/dev/null | sort
}

# ===========================================================================
# B1 — .env.e2e.auth ABSENT + valid E2E_SUPABASE_PROJECT_REF -> step 2 passes,
# steps 1/3/4/5/6/7 each emit the pending token, exit code 2
# ===========================================================================

SB1="$(new_verify_sandbox)"
LOG1="$(mktemp)"
run_verify_in "$SB1" E2E_SUPABASE_PROJECT_REF=e2eref SUPABASE_PROJECT_REF=prodref > "$LOG1" 2>&1
RC1=$?
CONTENT1="$(cat "$LOG1")"

assert_eq "B1: .env.e2e.auth absent + valid distinct ref -> exit code 2" "$RC1" "2"
assert_contains "B1: step 2 PASSED reported" "$CONTENT1" "Step 2/7 PASSED"
for n in 1 3 4 5 6 7; do
  COUNT="$(printf '%s\n' "$CONTENT1" | grep -c "step ${n} (" || true)"
  if [[ "$COUNT" -ge 1 ]]; then
    ok "B1: step ${n} emits the pending-token line"
  else
    not_ok "B1: step ${n} emits the pending-token line (not found)"
  fi
done
assert_contains "B1: literal token LIVE_VERIFICATION_PENDING_OWNER_PROVISIONING present" "$CONTENT1" "LIVE_VERIFICATION_PENDING_OWNER_PROVISIONING"
PENDING_COUNT="$(printf '%s\n' "$CONTENT1" | grep -c "LIVE_VERIFICATION_PENDING_OWNER_PROVISIONING" || true)"
# 7, not 6: one occurrence per pending step (1,3,4,5,6,7) plus one more in
# the script's own summary line ("steps 1,3,4,5,6,7 are $PENDING_TOKEN").
assert_eq "B1: pending token appears exactly 7 times (6 per-step + 1 summary line)" "$PENDING_COUNT" "7"

# ===========================================================================
# B2 — no generic shell failure text anywhere in the output
# ===========================================================================

for bad in "unbound variable" "command not found" "No such file or directory" "syntax error"; do
  assert_not_contains "B2: output contains no generic shell failure text ('$bad')" "$CONTENT1" "$bad"
done

# ===========================================================================
# B3 — step 2's three-way contract: true zero-config SKIPs (not fails),
# an explicit colliding ref still fails closed, and an explicit
# non-colliding ref (file still absent) passes cleanly.
# ===========================================================================

# B3a — TRUE zero-config: .env.e2e.auth absent, E2E_SUPABASE_PROJECT_REF
# genuinely unset (never exported), only SUPABASE_PROJECT_REF set — exactly
# the normal state of a fresh checkout or a CI run before Part A is done.
# Step 2 must be reported as SKIPPED (not FAILED) and must NOT count toward
# STEP_FAILURES, so the script exits 2 (pending), not 1 (blocked).
SB3A="$(new_verify_sandbox)"
LOG3A="$(mktemp)"
run_verify_in "$SB3A" SUPABASE_PROJECT_REF=prodref > "$LOG3A" 2>&1
RC3A=$?
CONTENT3A="$(cat "$LOG3A")"
assert_eq "B3a: true zero-config (no .env.e2e.auth, E2E_SUPABASE_PROJECT_REF unset) -> exit code 2" "$RC3A" "2"
assert_contains "B3a: step 2 reported SKIPPED, not FAILED" "$CONTENT3A" "Step 2/7 SKIPPED"
assert_not_contains "B3a: step 2 SKIP does not also emit a FAILED line" "$CONTENT3A" "Step 2/7 FAILED"

# The true zero-config path is the one this correction is about, so re-check
# the same four properties (pending token per LIVE step, no generic shell
# error text, zero HTTP calls, read-only) against it directly rather than
# relying solely on B1's explicit-ref scenario.
for n in 1 3 4 5 6 7; do
  COUNT3A="$(printf '%s\n' "$CONTENT3A" | grep -c "step ${n} (" || true)"
  if [[ "$COUNT3A" -ge 1 ]]; then
    ok "B3a: step ${n} emits the pending-token line"
  else
    not_ok "B3a: step ${n} emits the pending-token line (not found)"
  fi
done
assert_contains "B3a: literal token LIVE_VERIFICATION_PENDING_OWNER_PROVISIONING present" "$CONTENT3A" "LIVE_VERIFICATION_PENDING_OWNER_PROVISIONING"
for bad in "unbound variable" "command not found" "No such file or directory" "syntax error"; do
  assert_not_contains "B3a: output contains no generic shell failure text ('$bad')" "$CONTENT3A" "$bad"
done

CURL_CALL_LOG3A="$(mktemp)"
LOG3A_HTTP="$(mktemp)"
run_verify_in "$SB3A" SUPABASE_PROJECT_REF=prodref CURL_CALL_LOG="$CURL_CALL_LOG3A" > "$LOG3A_HTTP" 2>&1
CALLLOG3A="$(cat "$CURL_CALL_LOG3A" 2>/dev/null || true)"
if [[ -z "$CALLLOG3A" ]]; then
  ok "B3a: zero HTTP calls attempted in true zero-config case"
else
  not_ok "B3a: zero HTTP calls attempted in true zero-config case (calls made: $CALLLOG3A)"
fi
rm -f "$LOG3A_HTTP"

BEFORE3A="$(snapshot_tree "$SB3A")"
run_verify_in "$SB3A" SUPABASE_PROJECT_REF=prodref > /dev/null 2>&1
AFTER3A="$(snapshot_tree "$SB3A")"
assert_eq "B3a: script is read-only in true zero-config case — sandbox file tree unchanged" "$AFTER3A" "$BEFORE3A"

# B3b — explicit, deliberately COLLIDING ref: E2E_SUPABASE_PROJECT_REF is
# exported and equals the detected production ref. This is the case the
# fail-closed guard exists for — it must never regress to a pass, because
# it is what stops someone pointing E2E provisioning at production.
SB3B="$(new_verify_sandbox)"
LOG3B="$(mktemp)"
run_verify_in "$SB3B" E2E_SUPABASE_PROJECT_REF=sameref SUPABASE_PROJECT_REF=sameref > "$LOG3B" 2>&1
RC3B=$?
assert_false "B3b: step 2 fails closed on explicit production-ref collision (rc != 0)" $RC3B
assert_eq "B3b: explicit colliding ref -> exit code 1 (step 2 FAILED, no LIVE steps entered since .env.e2e.auth absent)" "$RC3B" "1"
assert_contains "B3b: step 2 reported FAILED (not SKIPPED)" "$(cat "$LOG3B")" "Step 2/7 FAILED"

# B3c — explicit, NON-colliding ref with .env.e2e.auth still absent: step 2
# runs (it isn't zero-config, since a ref was explicitly exported), PASSES
# against the distinct production ref, and the script still exits 2 because
# the LIVE steps remain pending owner provisioning.
SB3C="$(new_verify_sandbox)"
LOG3C="$(mktemp)"
run_verify_in "$SB3C" E2E_SUPABASE_PROJECT_REF=e2eref456 SUPABASE_PROJECT_REF=prodref123 > "$LOG3C" 2>&1
RC3C=$?
CONTENT3C="$(cat "$LOG3C")"
assert_eq "B3c: explicit non-colliding ref, file absent -> exit code 2" "$RC3C" "2"
assert_contains "B3c: step 2 reported PASSED (not SKIPPED, not FAILED)" "$CONTENT3C" "Step 2/7 PASSED"

# ===========================================================================
# B4 — READ-ONLY: sandbox file tree unchanged before/after (with a plausible
# apps/api/.env present, so production-ref detection has something to read)
# ===========================================================================

SB4="$(new_verify_sandbox)"
mkdir -p "$SB4/apps/api"
cat > "$SB4/apps/api/.env" <<'EOF'
SUPABASE_PROJECT_REF=prodref
EOF
BEFORE4="$(snapshot_tree "$SB4")"
LOG4="$(mktemp)"
run_verify_in "$SB4" E2E_SUPABASE_PROJECT_REF=e2eref > "$LOG4" 2>&1
AFTER4="$(snapshot_tree "$SB4")"
assert_eq "B4: script is read-only — sandbox file tree unchanged" "$AFTER4" "$BEFORE4"
if [[ ! -f "$SB4/.env.e2e.auth" ]]; then
  ok "B4: .env.e2e.auth never written by verify script"
else
  not_ok "B4: .env.e2e.auth never written by verify script"
fi
assert_contains "B4 sanity: production ref WAS read from sandbox apps/api/.env (proves REPO_ROOT resolution)" "$(cat "$LOG4")" "Step 2/7 PASSED"

# ===========================================================================
# B5 — zero HTTP calls attempted when .env.e2e.auth is absent
# ===========================================================================

SB5="$(new_verify_sandbox)"
CURL_CALL_LOG5="$(mktemp)"
run_verify_in "$SB5" E2E_SUPABASE_PROJECT_REF=e2eref SUPABASE_PROJECT_REF=prodref CURL_CALL_LOG="$CURL_CALL_LOG5" > /tmp/b5.log 2>&1
CALLLOG5="$(cat "$CURL_CALL_LOG5" 2>/dev/null || true)"
if [[ -z "$CALLLOG5" ]]; then
  ok "B5: zero HTTP calls attempted when .env.e2e.auth is absent"
else
  not_ok "B5: zero HTTP calls attempted when .env.e2e.auth is absent (calls made: $CALLLOG5)"
fi
rm -f /tmp/b5.log

# ===========================================================================
# B6 — REGRESSION for the fail-open defect: .env.e2e.auth PRESENT (mode 600,
# all required keys) + E2E_SUPABASE_PROJECT_REF COLLIDING with the detected
# production ref. Before the fix, this combination made HAVE_ENV_FILE
# "true", which skipped the (then sole) "if HAVE_ENV_FILE != true"
# STEP_FAILURES check entirely and fell through into the LIVE steps —
# sending up to ~44 real authentication requests at a project already
# flagged as production, exiting 1 only afterwards. Exit code alone does
# NOT prove the fix: the buggy version also exited 1 here, just late. The
# only trustworthy assertion is an EMPTY mock-curl call log.
# ===========================================================================

SB6="$(new_verify_sandbox)"
mkdir -p "$SB6/apps/api"
cat > "$SB6/apps/api/.env" <<'EOF'
SUPABASE_PROJECT_REF=prodref
EOF
cat > "$SB6/.env.e2e.auth" <<'EOF'
E2E_SUPABASE_PROJECT_REF=prodref
E2E_SUPABASE_URL=https://prodref.supabase.co
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
chmod 600 "$SB6/.env.e2e.auth"
LOG6="$(mktemp)"
CURL_CALL_LOG6="$(mktemp)"
run_verify_in "$SB6" CURL_CALL_LOG="$CURL_CALL_LOG6" > "$LOG6" 2>&1
RC6=$?
CONTENT6="$(cat "$LOG6")"
CALLLOG6="$(cat "$CURL_CALL_LOG6" 2>/dev/null || true)"

assert_eq "B6 (regression): .env.e2e.auth present + colliding ref -> exit code 1" "$RC6" "1"
assert_contains "B6: step 2 reported FAILED" "$CONTENT6" "Step 2/7 FAILED"
assert_contains "B6: abort message present (refuses to run LIVE steps)" "$CONTENT6" "Aborting: Step 2 collision-guard failure"
if [[ -z "$CALLLOG6" ]]; then
  ok "B6 (regression): ZERO HTTP requests attempted against the colliding/production-flagged project"
else
  not_ok "B6 (regression): ZERO HTTP requests attempted against the colliding/production-flagged project (calls made: $CALLLOG6)"
fi
for step_marker in "Step 1/7:" "Step 3/7:" "Step 5/7:" "Step 7/7:"; do
  assert_not_contains "B6: no LIVE step ($step_marker) began execution" "$CONTENT6" "$step_marker"
done

# ===========================================================================
# B7 — REGRESSION, same defect through a second door: .env.e2e.auth PRESENT
# + whitespace-only E2E_SUPABASE_PROJECT_REF. _e2e_auth_load_and_validate's
# missing-key check is `-z`, so a whitespace-only value counts as "present"
# and HAVE_ENV_FILE still becomes "true"; _e2e_auth_extract_ref then trims
# it to empty and the collision guard fails closed on the empty-ref branch.
# The abort must catch this before any LIVE step, with zero HTTP calls.
# ===========================================================================

SB7="$(new_verify_sandbox)"
mkdir -p "$SB7/apps/api"
cat > "$SB7/apps/api/.env" <<'EOF'
SUPABASE_PROJECT_REF=prodref
EOF
cat > "$SB7/.env.e2e.auth" <<'EOF'
E2E_SUPABASE_PROJECT_REF="   "
E2E_SUPABASE_URL=https://e2eref.supabase.co
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
chmod 600 "$SB7/.env.e2e.auth"
LOG7="$(mktemp)"
CURL_CALL_LOG7="$(mktemp)"
run_verify_in "$SB7" CURL_CALL_LOG="$CURL_CALL_LOG7" > "$LOG7" 2>&1
RC7=$?
CONTENT7="$(cat "$LOG7")"
CALLLOG7="$(cat "$CURL_CALL_LOG7" 2>/dev/null || true)"

assert_eq "B7 (regression): .env.e2e.auth present + whitespace-only ref -> exit code 1" "$RC7" "1"
assert_contains "B7: step 2 reported FAILED" "$CONTENT7" "Step 2/7 FAILED"
if [[ -z "$CALLLOG7" ]]; then
  ok "B7 (regression): ZERO HTTP requests attempted with a whitespace-only ref"
else
  not_ok "B7 (regression): ZERO HTTP requests attempted with a whitespace-only ref (calls made: $CALLLOG7)"
fi
for step_marker in "Step 1/7:" "Step 3/7:" "Step 5/7:" "Step 7/7:"; do
  assert_not_contains "B7: no LIVE step ($step_marker) began execution" "$CONTENT7" "$step_marker"
done

# ===========================================================================
# B8 — same defect class through a THIRD door: .env.e2e.auth PRESENT but
# INVALID (missing a required key), so _e2e_auth_load_and_validate fails at
# L122-123 and increments STEP_FAILURES while HAVE_ENV_FILE stays "false".
# NOTE (sanity-checked against a reconstructed pre-remedy copy of the
# script in an isolated scratch sandbox, never touching the real
# implementation file): unlike B6/B7, this specific path was NOT actually
# vulnerable before the fix — HAVE_ENV_FILE staying "false" here means
# control already fell into the pre-existing "if HAVE_ENV_FILE != true"
# block, whose own STEP_FAILURES check already aborted before any LIVE
# step, in both the old and new code (0 curl calls, exit 1, in both). Kept
# here anyway as an explicit coverage/regression-class test per the rework
# request, but it is NOT load-bearing proof of the fix — B6/B7 are.
# ===========================================================================

SB8="$(new_verify_sandbox)"
cat > "$SB8/.env.e2e.auth" <<'EOF'
E2E_SUPABASE_PROJECT_REF=e2eref
E2E_SUPABASE_URL=https://e2eref.supabase.co
EOF
chmod 600 "$SB8/.env.e2e.auth"
LOG8="$(mktemp)"
CURL_CALL_LOG8="$(mktemp)"
run_verify_in "$SB8" CURL_CALL_LOG="$CURL_CALL_LOG8" > "$LOG8" 2>&1
RC8=$?
CONTENT8="$(cat "$LOG8")"
CALLLOG8="$(cat "$CURL_CALL_LOG8" 2>/dev/null || true)"

assert_eq "B8: .env.e2e.auth present but missing required keys -> exit code 1" "$RC8" "1"
assert_contains "B8: E2E_AUTH_PROJECT_NOT_CONFIGURED reported" "$CONTENT8" "E2E_AUTH_PROJECT_NOT_CONFIGURED"
if [[ -z "$CALLLOG8" ]]; then
  ok "B8: ZERO HTTP requests attempted with an invalid .env.e2e.auth"
else
  not_ok "B8: ZERO HTTP requests attempted with an invalid .env.e2e.auth (calls made: $CALLLOG8)"
fi

# ===========================================================================
# Bonus — with .env.e2e.auth PRESENT and valid, all mocked LIVE steps pass,
# exit code 0 (sanity check on the live-path wiring, not in the required list
# but cheap to add and it exercises step 5/7's login loop + step 3/4 parsing).
# ===========================================================================

SBP="$(new_verify_sandbox)"
cat > "$SBP/.env.e2e.auth" <<'EOF'
E2E_SUPABASE_PROJECT_REF=e2eref
E2E_SUPABASE_URL=https://e2eref.supabase.co
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
chmod 600 "$SBP/.env.e2e.auth"
LOGP="$(mktemp)"
run_verify_in "$SBP" \
  SUPABASE_PROJECT_REF=prodref \
  MOCK_OIDC_BODY='{"issuer":"https://e2eref.supabase.co/auth/v1"}' \
  MOCK_JWKS_BODY='{"keys":[{"kty":"RSA"}]}' \
  MOCK_LOGIN_BODY='{"access_token":"eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL2UyZXJlZi5zdXBhYmFzZS5jby9hdXRoL3YxIn0.sig"}' \
  > "$LOGP" 2>&1
RCP=$?
assert_eq "Bonus: mocked all-green LIVE run -> exit code 0" "$RCP" "0"
assert_contains "Bonus: step 5/7 PASSED (all 4 identities) reported" "$(cat "$LOGP")" "Step 5/7 PASSED"
assert_contains "Bonus: step 7/7 PASSED reported" "$(cat "$LOGP")" "Step 7/7 PASSED"

echo ""
echo "1..$TOTAL"
if [[ $FAILED -eq 0 ]]; then
  echo "# All $TOTAL assertions passed."
  exit 0
else
  echo "# $FAILED of $TOTAL assertions FAILED."
  exit 1
fi
