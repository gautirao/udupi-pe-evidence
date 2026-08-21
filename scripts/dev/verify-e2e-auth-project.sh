#!/usr/bin/env bash
# scripts/dev/verify-e2e-auth-project.sh — #2236 Part B (B9)
#
# Read-only. Never writes any file. Implements B9's 7 verification steps, in
# the order below (step 2 runs first because it is fail-closed and needs no
# network):
#
#   1. Project reachable / not paused                    (LIVE)
#   2. Not production (collision check)                  (runs first; works
#                                                           offline with any
#                                                           values)
#   3. OIDC discovery works, issuer matches exactly       (LIVE)
#   4. JWKS is asymmetric and non-empty                   (LIVE)
#   5. Each identity authenticates; token iss matches #3  (LIVE)
#   6. End-to-end via local-fixture-backend.sh option2    (LIVE)
#   7. Rate-limit headroom: 40 sequential logins, 0x 429  (LIVE)
#
# When .env.e2e.auth is ABSENT, every LIVE step (1, 3, 4, 5, 6, 7) fails/
# skips with a DISTINCT, greppable message containing the literal token
# LIVE_VERIFICATION_PENDING_OWNER_PROVISIONING — never a generic shell
# error, never "unbound variable", never "command not found".
#
# Step 2 (not-production collision check) is special: it only runs as a
# pass/fail STEP when there is actually something to check — i.e.
# .env.e2e.auth exists on disk, OR the caller explicitly exported
# E2E_SUPABASE_PROJECT_REF. In the true zero-config case (neither — the
# normal state of a fresh checkout/CI run before Part A is done), step 2 is
# reported as SKIPPED and does NOT count as a failure.
#
# Exit code contract (deterministic, the three codes are mutually
# exclusive):
#   0  — all steps that could run, passed (no LIVE step failed for a reason
#        OTHER than missing .env.e2e.auth)
#   1  — step 2 ran and FAILED (either because .env.e2e.auth is present and
#        colliding/invalid, or because E2E_SUPABASE_PROJECT_REF was
#        explicitly exported and collides with production) — in this case
#        the script ABORTS IMMEDIATELY and refuses to run any LIVE step
#        (1/3/4/5/6/7); no network request is made against the flagged
#        project. 1 is also returned when a LIVE step itself failed for a
#        REAL reason (bad issuer, empty JWKS, 401, 403, 429, etc.) with
#        .env.e2e.auth present and step 2 passed.
#   2  — .env.e2e.auth absent and step 2 did not FAIL (either it SKIPPED in
#        the zero-config case, or it PASSED against an explicitly-exported
#        non-colliding ref): LIVE steps are
#        LIVE_VERIFICATION_PENDING_OWNER_PROVISIONING
#
# See docs/e2e-auth-provisioning.md for the full B9 spec and what each exit
# code means for CI/local usage.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/e2e-auth-common.sh
source "${SCRIPT_DIR}/lib/e2e-auth-common.sh"

ENV_AUTH_FILE="${REPO_ROOT}/.env.e2e.auth"
PENDING_TOKEN="LIVE_VERIFICATION_PENDING_OWNER_PROVISIONING"

print_help() {
  cat <<'EOF'
Usage: scripts/dev/verify-e2e-auth-project.sh [--help]

Read-only verification of the dedicated E2E Supabase Auth project (#2236
B9). Runs up to 7 checks. Step 2 (not-production) runs as a pass/fail check
only when there is a ref to check (.env.e2e.auth present, or
E2E_SUPABASE_PROJECT_REF explicitly exported) — in the zero-config case it
is SKIPPED, not failed. Steps 1/3/4/5/6/7 require .env.e2e.auth (written by
provision-e2e-auth-identities.sh) and are LIVE network checks — when that
file is absent they report a distinct
LIVE_VERIFICATION_PENDING_OWNER_PROVISIONING message and are treated as
"pending", not failures of this script. Step 6 never runs HTTP itself
either way — it always prints manual instructions (see step 6 docs).

Exit codes:
  0  all runnable steps passed
  1  step 2 ran and FAILED (colliding/invalid ref) — the script aborts
     immediately and refuses to run any LIVE step; or a LIVE step itself
     failed for a real reason (step 2 passed)
  2  .env.e2e.auth absent and step 2 did not fail (skipped, or passed
     against an explicitly-exported ref) — LIVE steps pending owner
     provisioning
EOF
}

for arg in "$@"; do
  case "$arg" in
    --help|-h) print_help; exit 0 ;;
    *) echo "ERROR: unknown argument: $arg (see --help)" >&2; exit 1 ;;
  esac
done

STEP_FAILURES=0
LIVE_PENDING=0

_pending() {
  local step="$1" what="$2"
  echo "SKIP step ${step} (${what}): ${PENDING_TOKEN} — .env.e2e.auth not found at ${ENV_AUTH_FILE}. Run scripts/dev/provision-e2e-auth-identities.sh first (see docs/e2e-auth-provisioning.md)." >&2
  LIVE_PENDING=1
}

# _e2e_verify_curl <method> <path-or-url> — PATH-resolved, same reason as
# the provisioning script: lets a test harness intercept every HTTP call.
_e2e_verify_curl() {
  _e2e_auth_curl_wrapper -sS -w '\n%{http_code}' "$@"
}

echo ">>> verify-e2e-auth-project.sh starting"

# ---------------------------------------------------------------------------
# Step 2 — not production (runs FIRST; fail-closed; no network required)
# ---------------------------------------------------------------------------

echo ">>> Step 2/7: not-production collision check..."
E2E_REF_EXPLICIT="${E2E_SUPABASE_PROJECT_REF:-}"
E2E_REF_CANDIDATE="$E2E_REF_EXPLICIT"
HAVE_ENV_FILE="false"
ENV_FILE_EXISTS="false"
if [[ -f "$ENV_AUTH_FILE" ]]; then
  ENV_FILE_EXISTS="true"
  if _e2e_auth_load_and_validate "$ENV_AUTH_FILE"; then
    HAVE_ENV_FILE="true"
    E2E_REF_CANDIDATE="$E2E_SUPABASE_PROJECT_REF"
  else
    echo "ERROR: Step 2/7: ${ENV_AUTH_FILE} present but invalid (see E2E_AUTH_PROJECT_NOT_CONFIGURED message above)." >&2
    STEP_FAILURES=$((STEP_FAILURES + 1))
  fi
fi

# Only evaluate the collision guard as a pass/fail STEP when there is
# actually a ref to check — i.e. .env.e2e.auth exists on disk, OR the caller
# explicitly exported E2E_SUPABASE_PROJECT_REF. A true zero-config checkout
# (neither) is the normal state of every contributor's machine and every CI
# run until Part A is done — that is a SKIP, not a failure, and must NOT
# increment STEP_FAILURES (see docs/e2e-auth-provisioning.md exit-code
# table). A deliberately-exported ref, or a ref read from an on-disk file,
# is still fail-closed as before.
if [[ "$ENV_FILE_EXISTS" != "true" && -z "$E2E_REF_EXPLICIT" ]]; then
  echo ">>> Step 2/7 SKIPPED: .env.e2e.auth absent and E2E_SUPABASE_PROJECT_REF not exported — nothing to check yet (zero-config state; see docs/e2e-auth-provisioning.md)." >&2
else
  PROD_REF_SOURCE="$(_e2e_auth_detect_production_ref "$REPO_ROOT")"
  if _e2e_auth_collision_guard "$E2E_REF_CANDIDATE" "$PROD_REF_SOURCE"; then
    echo ">>> Step 2/7 PASSED: E2E ref differs from production ref."
  else
    echo ">>> Step 2/7 FAILED: not-production check did not pass." >&2
    STEP_FAILURES=$((STEP_FAILURES + 1))
  fi
fi

# Fail closed: no LIVE step (1, 3, 4, 5, 6, 7) may run if step 2 recorded
# ANY failure above — whether from an on-disk .env.e2e.auth that is present
# but invalid (L122-123), or from a collision-guard FAIL against either an
# on-disk ref or an explicitly-exported E2E_SUPABASE_PROJECT_REF (L142-143).
# This check must run before the "$HAVE_ENV_FILE" != "true" branch below,
# because that branch's own STEP_FAILURES check (further down) is
# unreachable whenever .env.e2e.auth is present-but-invalid — HAVE_ENV_FILE
# stays "false" in that case too, so without this guard here execution would
# still fall through this early-exit block down to the LIVE steps at L165+.
# It must also run before the HAVE_ENV_FILE=="true" live path, which has no
# STEP_FAILURES check of its own at all today. Placing it here, immediately
# after step 2 is fully resolved and before either downstream path, is the
# only position that closes both.
if [[ "$STEP_FAILURES" -gt 0 ]]; then
  echo ">>> Aborting: Step 2 collision-guard failure — refusing to run LIVE steps against an unverified/production-colliding project." >&2
  exit 1
fi

if [[ "$HAVE_ENV_FILE" != "true" ]]; then
  for step_info in "1:project reachability" "3:OIDC discovery" "4:JWKS asymmetric-key check" "5:identity password-grant login" "6:end-to-end local-fixture-backend.sh option2" "7:rate-limit headroom (40 logins)"; do
    step_num="${step_info%%:*}"
    step_what="${step_info#*:}"
    _pending "$step_num" "$step_what"
  done

  echo ">>> Summary: step 2 ran; steps 1,3,4,5,6,7 are ${PENDING_TOKEN}."
  if [[ "$STEP_FAILURES" -gt 0 ]]; then
    exit 1
  fi
  exit 2
fi

# ---------------------------------------------------------------------------
# Step 1 — project reachable / not paused
# ---------------------------------------------------------------------------

echo ">>> Step 1/7: project reachability (${E2E_SUPABASE_URL}/auth/v1/health)..."
STEP1_RESP="$(_e2e_verify_curl "${E2E_SUPABASE_URL%/}/auth/v1/health" 2>/dev/null || true)"
STEP1_STATUS="$(printf '%s' "$STEP1_RESP" | tail -n1)"
if [[ "$STEP1_STATUS" == 2* ]]; then
  echo ">>> Step 1/7 PASSED (HTTP ${STEP1_STATUS})."
else
  echo "ERROR: Step 1/7 FAILED: project unreachable or paused (HTTP ${STEP1_STATUS:-none})." >&2
  STEP_FAILURES=$((STEP_FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Step 3 — OIDC discovery, issuer matches exactly
# ---------------------------------------------------------------------------

EXPECTED_ISSUER="${E2E_SUPABASE_URL%/}/auth/v1"
echo ">>> Step 3/7: OIDC discovery (issuer must equal ${EXPECTED_ISSUER})..."
STEP3_RESP="$(_e2e_verify_curl "${E2E_SUPABASE_URL%/}/auth/v1/.well-known/openid-configuration" 2>/dev/null || true)"
STEP3_STATUS="$(printf '%s' "$STEP3_RESP" | tail -n1)"
STEP3_BODY="$(printf '%s' "$STEP3_RESP" | sed '$d')"
DISCOVERED_ISSUER="$(printf '%s' "$STEP3_BODY" | jq -r '.issuer // empty' 2>/dev/null || true)"
if [[ "$STEP3_STATUS" == 2* && "$DISCOVERED_ISSUER" == "$EXPECTED_ISSUER" ]]; then
  echo ">>> Step 3/7 PASSED (issuer matches exactly)."
else
  echo "ERROR: Step 3/7 FAILED: HTTP ${STEP3_STATUS:-none}, issuer='${DISCOVERED_ISSUER:-empty}' expected='${EXPECTED_ISSUER}'." >&2
  STEP_FAILURES=$((STEP_FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Step 4 — JWKS asymmetric and non-empty
# ---------------------------------------------------------------------------

echo ">>> Step 4/7: JWKS asymmetric-key check..."
STEP4_RESP="$(_e2e_verify_curl "${E2E_SUPABASE_URL%/}/auth/v1/.well-known/jwks.json" 2>/dev/null || true)"
STEP4_STATUS="$(printf '%s' "$STEP4_RESP" | tail -n1)"
STEP4_BODY="$(printf '%s' "$STEP4_RESP" | sed '$d')"
KEY_COUNT="$(printf '%s' "$STEP4_BODY" | jq -r '(.keys // []) | length' 2>/dev/null || echo 0)"
if [[ "$STEP4_STATUS" == 2* && "${KEY_COUNT:-0}" -gt 0 ]]; then
  echo ">>> Step 4/7 PASSED (${KEY_COUNT} JWKS key(s) present)."
else
  echo "ERROR: Step 4/7 FAILED: JWKS empty or unreachable (HTTP ${STEP4_STATUS:-none}, keys=${KEY_COUNT:-0}) — this means the project is still on legacy shared HS256 and every authenticated request will 401. Enable asymmetric (RSA/ECC) JWT signing keys in the Supabase dashboard (Part A owner checklist, docs/e2e-auth-provisioning.md)." >&2
  STEP_FAILURES=$((STEP_FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Step 5 — each identity authenticates; token iss matches step 3
# ---------------------------------------------------------------------------

echo ">>> Step 5/7: identity password-grant login..."
_login_and_check_iss() {
  local label="$1" email="$2" password="$3"
  local body resp status token payload iss
  body="$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password}')"
  resp="$(_e2e_auth_curl_wrapper -sS -w '\n%{http_code}' -X POST "${E2E_SUPABASE_URL%/}/auth/v1/token?grant_type=password" \
    -H "Content-Type: application/json" -H "apikey: ${E2E_SUPABASE_ANON_KEY}" -d "$body" 2>/dev/null || true)"
  status="$(printf '%s' "$resp" | tail -n1)"
  token="$(printf '%s' "$resp" | sed '$d' | jq -r '.access_token // empty' 2>/dev/null || true)"
  if [[ "$status" != 2* || -z "$token" ]]; then
    echo "ERROR: Step 5/7: ${label} login failed (HTTP ${status:-none})." >&2
    return 1
  fi
  payload="$(printf '%s' "$token" | cut -d. -f2)"
  # base64url -> base64 padding
  payload="$(printf '%s' "$payload" | tr '_-' '/+')"
  case $(( ${#payload} % 4 )) in
    2) payload="${payload}==" ;;
    3) payload="${payload}=" ;;
  esac
  iss="$(printf '%s' "$payload" | base64 -d 2>/dev/null | jq -r '.iss // empty' 2>/dev/null || true)"
  if [[ "$iss" != "$EXPECTED_ISSUER" ]]; then
    echo "ERROR: Step 5/7: ${label} token iss ('${iss:-empty}') does not match discovered issuer ('${EXPECTED_ISSUER}')." >&2
    return 1
  fi
  echo ">>> Step 5/7: ${label} OK."
  return 0
}

STEP5_OK=1
_login_and_check_iss "admin"  "$E2E_ADMIN_EMAIL"  "$E2E_ADMIN_PASSWORD"  || STEP5_OK=0
_login_and_check_iss "broker" "$E2E_BROKER_EMAIL" "$E2E_BROKER_PASSWORD" || STEP5_OK=0
_login_and_check_iss "user"   "$E2E_USER_EMAIL"   "$E2E_USER_PASSWORD"   || STEP5_OK=0
_login_and_check_iss "dealer" "$E2E_DEALER_EMAIL" "$E2E_DEALER_PASSWORD" || STEP5_OK=0
if [[ "$STEP5_OK" -eq 1 ]]; then
  echo ">>> Step 5/7 PASSED (all 4 identities)."
else
  echo "ERROR: Step 5/7 FAILED (see per-identity errors above)." >&2
  STEP_FAILURES=$((STEP_FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Step 6 — end-to-end via local-fixture-backend.sh option2, one authed
# endpoint, assert 200. 401 = issuer/JWKS mismatch; 403 = role seed didn't
# land — these are DIFFERENT fixes and must be distinguished.
# ---------------------------------------------------------------------------

echo ">>> Step 6/7: end-to-end (local-fixture-backend.sh option2)..."
echo "SKIP Step 6/7: this script is read-only and does not start docker/Spring Boot itself." \
     " Run scripts/dev/local-fixture-backend.sh with .env.e2e.auth present (AUTH_MODE=option2)" \
     " and hit one authenticated endpoint by hand: a 401 means issuer/JWKS mismatch" \
     " (re-check steps 3/4); a 403 means the role seed didn't land (Step F/F2 of that script)." >&2

# ---------------------------------------------------------------------------
# Step 7 — rate-limit headroom: 40 sequential logins, assert zero 429s
# ---------------------------------------------------------------------------

echo ">>> Step 7/7: rate-limit headroom (40 sequential logins)..."
RATE_429_COUNT=0
for i in $(seq 1 40); do
  body="$(jq -nc --arg email "$E2E_ADMIN_EMAIL" --arg password "$E2E_ADMIN_PASSWORD" '{email:$email,password:$password}')"
  resp="$(_e2e_auth_curl_wrapper -sS -w '\n%{http_code}' -X POST "${E2E_SUPABASE_URL%/}/auth/v1/token?grant_type=password" \
    -H "Content-Type: application/json" -H "apikey: ${E2E_SUPABASE_ANON_KEY}" -d "$body" 2>/dev/null || true)"
  status="$(printf '%s' "$resp" | tail -n1)"
  if [[ "$status" == "429" ]]; then
    RATE_429_COUNT=$((RATE_429_COUNT + 1))
  fi
done
if [[ "$RATE_429_COUNT" -eq 0 ]]; then
  echo ">>> Step 7/7 PASSED (0/40 requests rate-limited)."
else
  echo "ERROR: Step 7/7 FAILED: ${RATE_429_COUNT}/40 requests returned 429 — raise the E2E project's auth rate limit (Part A owner checklist A5, docs/e2e-auth-provisioning.md)." >&2
  STEP_FAILURES=$((STEP_FAILURES + 1))
fi

echo ">>> Summary: ${STEP_FAILURES} step(s) failed."
if [[ "$STEP_FAILURES" -gt 0 ]]; then
  exit 1
fi
exit 0
