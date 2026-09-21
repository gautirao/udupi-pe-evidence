#!/usr/bin/env bash
# scripts/dev/tests/remote-db-safety.test.sh — #2569
#
# Minimal, dependency-free bash assertion harness (same style as
# scripts/dev/tests/port-isolation.test.sh) covering:
#   - scripts/dev/lib/remote-db-safety.sh (validate_localhost_only /
#     print_backend_startup_banner as pure functions)
#   - apps/api/run-local.sh actually calling validate_localhost_only BEFORE
#     invoking mvn, and refusing to start when it fails
#
# mvn is mocked via a stub executable in a temp bin dir prepended to PATH;
# every invocation runs under `env -i` for full environment isolation. No
# real network connection, Maven process, or Spring Boot process is ever
# started, and SUPABASE_DB_HOST is never pointed at anything but a synthetic
# placeholder string.
#
# Run:  bash scripts/dev/tests/remote-db-safety.test.sh
# Exits 0 if all assertions pass, non-zero otherwise.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ORIG_PATH="$PATH"

TOTAL=0
FAILED=0

ok() { TOTAL=$((TOTAL + 1)); echo "ok $TOTAL - $1"; }
not_ok() { TOTAL=$((TOTAL + 1)); FAILED=$((FAILED + 1)); echo "not ok $TOTAL - $1"; }
assert_true() { if [[ "$2" -eq 0 ]]; then ok "$1"; else not_ok "$1"; fi; }
assert_false() { if [[ "$2" -ne 0 ]]; then ok "$1"; else not_ok "$1"; fi; }
assert_contains() { if [[ "$2" == *"$3"* ]]; then ok "$1"; else not_ok "$1 (expected to find [$3])"; fi; }
assert_not_contains() { if [[ "$2" != *"$3"* ]]; then ok "$1"; else not_ok "$1 (unexpectedly found [$3])"; fi; }

CLEANUP_DIRS=()
cleanup_all() {
  for d in "${CLEANUP_DIRS[@]:-}"; do
    [[ -n "$d" && -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup_all EXIT

# ===========================================================================
# T-LIB — validate_localhost_only() / print_backend_startup_banner() as pure
# functions, sourced directly (no subprocess, no PATH mocking needed).
# ===========================================================================

# shellcheck source=../lib/remote-db-safety.sh
source "$REPO_ROOT/scripts/dev/lib/remote-db-safety.sh"

run_validate() {
  # Runs validate_localhost_only in a subshell so each case gets a clean,
  # non-leaking set of the three env vars it reads. A bare `export` with zero
  # arguments lists every currently-exported variable to stdout instead of a
  # no-op, so the guard below is required for the "no overrides" test case.
  (
    unset SUPABASE_DB_HOST ALLOW_REMOTE_DB ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE
    if [[ $# -gt 0 ]]; then
      export "$@"
    fi
    validate_localhost_only
  )
}

# T1: localhost passes with no override needed.
OUT1="$(run_validate SUPABASE_DB_HOST=localhost 2>&1)"
RC1=$?
assert_true "T1: SUPABASE_DB_HOST=localhost passes with no override" "$RC1"

# T2: 127.0.0.1 passes with no override needed.
run_validate SUPABASE_DB_HOST=127.0.0.1 >/dev/null 2>&1
assert_true "T2: SUPABASE_DB_HOST=127.0.0.1 passes with no override" "$?"

# T3: a remote-looking host with NO override flags fails closed.
OUT3="$(run_validate SUPABASE_DB_HOST=aws-0-us-east-1.pooler.supabase.com 2>&1)"
RC3=$?
assert_false "T3: a remote-looking host with no override fails closed (non-zero exit)" "$RC3"
assert_contains "T3: refusal names the offending host" "$OUT3" "aws-0-us-east-1.pooler.supabase.com"
assert_contains "T3: refusal explains the two-flag override" "$OUT3" "ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE=true"

# T4: an unset SUPABASE_DB_HOST also fails closed (never treated as "safe by
# absence").
OUT4="$(run_validate 2>&1)"
RC4=$?
assert_false "T4: an unset SUPABASE_DB_HOST fails closed" "$RC4"
assert_contains "T4: refusal reports <unset>" "$OUT4" "<unset>"

# T5: only ONE of the two override flags set (ALLOW_REMOTE_DB) still fails.
OUT5="$(run_validate SUPABASE_DB_HOST=remote-host.example.com ALLOW_REMOTE_DB=true 2>&1)"
RC5=$?
assert_false "T5: ALLOW_REMOTE_DB=true alone (no ACKNOWLEDGED_UNSAFE) still fails closed" "$RC5"

# T6: only the OTHER flag set (ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE) still fails.
OUT6="$(run_validate SUPABASE_DB_HOST=remote-host.example.com ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE=true 2>&1)"
RC6=$?
assert_false "T6: ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE=true alone (no ALLOW_REMOTE_DB) still fails closed" "$RC6"

# T7: a non-"true" value on one flag (e.g. ALLOW_REMOTE_DB=1) does not count —
# only the literal string "true" is accepted, guarding against a truthy-looking
# but mistyped override silently working.
OUT7="$(run_validate SUPABASE_DB_HOST=remote-host.example.com ALLOW_REMOTE_DB=1 ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE=true 2>&1)"
RC7=$?
assert_false "T7: ALLOW_REMOTE_DB=1 (not the literal 'true') does not count as an override" "$RC7"

# T8: BOTH flags set to the literal "true" passes — the sole intended
# deliberate-override path — and the proceed path is itself logged.
OUT8="$(run_validate SUPABASE_DB_HOST=remote-host.example.com ALLOW_REMOTE_DB=true ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE=true 2>&1)"
RC8=$?
assert_true "T8: both ALLOW_REMOTE_DB=true and ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE=true together pass" "$RC8"
assert_contains "T8: the override itself is logged (never silent)" "$OUT8" "WARNING"
assert_contains "T8: the override log names the actual host" "$OUT8" "remote-host.example.com"

# T9: print_backend_startup_banner never leaks SUPABASE_DB_PASSWORD, and does
# report the flags that matter.
BANNER_OUT="$(
  SUPABASE_DB_HOST=localhost SUPABASE_DB_PORT=5434 \
  SUPABASE_DB_PASSWORD=super-secret-password \
  SPRING_FLYWAY_ENABLED=false SPRING_TASK_SCHEDULING_ENABLED=false \
  print_backend_startup_banner 2>&1
)"
assert_contains "T9: banner reports the database host" "$BANNER_OUT" "localhost"
assert_contains "T9: banner reports the database port" "$BANNER_OUT" "5434"
assert_contains "T9: banner reports Flyway disabled" "$BANNER_OUT" "Flyway migrations : false"
assert_contains "T9: banner reports scheduling disabled" "$BANNER_OUT" "Scheduled jobs    : false"
assert_not_contains "T9: banner never prints the DB password" "$BANNER_OUT" "super-secret-password"

# T10: with no overrides at all, the banner reports the true production
# defaults (Flyway and scheduling both effectively enabled) rather than a
# blank or misleading value.
DEFAULT_BANNER_OUT="$(
  unset SPRING_FLYWAY_ENABLED SPRING_TASK_SCHEDULING_ENABLED
  SUPABASE_DB_HOST=localhost print_backend_startup_banner 2>&1
)"
assert_contains "T10: banner reports Flyway enabled by default when unset" "$DEFAULT_BANNER_OUT" "Flyway migrations : true (default)"
assert_contains "T10: banner reports scheduling enabled by default when unset" "$DEFAULT_BANNER_OUT" "Scheduled jobs    : true (default)"

# ===========================================================================
# T-INTEG — apps/api/run-local.sh actually calls validate_localhost_only
# BEFORE invoking mvn: stub mvn as a no-op, point SUPABASE_DB_HOST at a
# non-loopback value, assert the mock mvn is never invoked, the script exits
# non-zero, and the refusal banner reached stderr.
# ===========================================================================

MOCKBIN="$(mktemp -d)"
CLEANUP_DIRS+=("$MOCKBIN")

cat > "$MOCKBIN/mvn" <<'EOF'
#!/usr/bin/env bash
# If this ever runs during T-INTEG below, the safety guard did not stop
# run-local.sh before it reached the mvn invocation — write a sentinel file
# so the test can detect that failure even though mvn's own exit code (0)
# would otherwise look like nothing went wrong.
: > "${MVN_INVOKED_SENTINEL:?MVN_INVOKED_SENTINEL not set}"
exit 0
EOF
chmod +x "$MOCKBIN/mvn"

new_runlocal_sandbox() {
  local sb db_host="$1"
  sb="$(mktemp -d)"
  CLEANUP_DIRS+=("$sb")
  mkdir -p "$sb/apps/api"
  # run-local.sh resolves REPO_ROOT as two directories up from its own
  # location — replicate that same apps/api nesting inside the sandbox so the
  # real scripts/dev/lib/remote-db-safety.sh (not a copy) is what gets sourced.
  cp "$REPO_ROOT/apps/api/run-local.sh" "$sb/apps/api/run-local.sh"
  chmod +x "$sb/apps/api/run-local.sh"
  mkdir -p "$sb/scripts/dev/lib"
  cp "$REPO_ROOT/scripts/dev/lib/remote-db-safety.sh" "$sb/scripts/dev/lib/remote-db-safety.sh"
  cat > "$sb/apps/api/.env" <<ENVEOF
SUPABASE_DB_HOST=${db_host}
SUPABASE_DB_USER=fromenv-user
SUPABASE_DB_PASSWORD=fromenv-pass-secret
SUPABASE_PROJECT_REF=fromenv-ref
AI_API_KEY=fromenv-aikey-secret
ENVEOF
  echo "$sb"
}

run_runlocal() {
  local sandbox="$1"
  shift
  env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "$@" bash "$sandbox/apps/api/run-local.sh"
}

# T11: non-loopback SUPABASE_DB_HOST, no override — mvn must never run.
SB11="$(new_runlocal_sandbox "remote-pooler.supabase.com")"
SENTINEL11="$(mktemp -u)"
LOG11="$(mktemp)"
run_runlocal "$SB11" MVN_INVOKED_SENTINEL="$SENTINEL11" > "$LOG11" 2>&1
RC11=$?
LOG11_CONTENT="$(cat "$LOG11" 2>/dev/null || true)"

assert_false "T11: run-local.sh exits non-zero when SUPABASE_DB_HOST is remote" "$RC11"
if [[ ! -e "$SENTINEL11" ]]; then
  ok "T11: mvn is never invoked when the safety guard refuses"
else
  not_ok "T11: mvn is never invoked when the safety guard refuses"
fi
assert_contains "T11: refusal banner reached the script's output" "$LOG11_CONTENT" "REFUSING TO START"
assert_contains "T11: refusal names the offending host" "$LOG11_CONTENT" "remote-pooler.supabase.com"

# T12: loopback SUPABASE_DB_HOST — mvn DOES run (guard does not false-positive
# on the legitimate local-fixture path).
SB12="$(new_runlocal_sandbox "localhost")"
SENTINEL12="$(mktemp -u)"
LOG12="$(mktemp)"
run_runlocal "$SB12" MVN_INVOKED_SENTINEL="$SENTINEL12" > "$LOG12" 2>&1
RC12=$?
LOG12_CONTENT="$(cat "$LOG12" 2>/dev/null || true)"

assert_true "T12: run-local.sh exits 0 when SUPABASE_DB_HOST is localhost" "$RC12"
if [[ -e "$SENTINEL12" ]]; then
  ok "T12: mvn IS invoked for a genuine loopback target"
else
  not_ok "T12: mvn IS invoked for a genuine loopback target"
fi
assert_contains "T12: startup banner is printed for the accepted path" "$LOG12_CONTENT" "Backend startup summary"

# T13: a non-loopback host WITH both override flags set — mvn DOES run.
SB13="$(new_runlocal_sandbox "remote-pooler.supabase.com")"
SENTINEL13="$(mktemp -u)"
LOG13="$(mktemp)"
run_runlocal "$SB13" ALLOW_REMOTE_DB=true ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE=true \
  MVN_INVOKED_SENTINEL="$SENTINEL13" > "$LOG13" 2>&1
RC13=$?
LOG13_CONTENT="$(cat "$LOG13" 2>/dev/null || true)"

assert_true "T13: run-local.sh exits 0 for a remote host when both override flags are set" "$RC13"
if [[ -e "$SENTINEL13" ]]; then
  ok "T13: mvn IS invoked once the deliberate override is given"
else
  not_ok "T13: mvn IS invoked once the deliberate override is given"
fi
assert_contains "T13: the deliberate override is still logged, never silent" "$LOG13_CONTENT" "WARNING"

# ===========================================================================
# T-GREP — SPRING_TASK_SCHEDULING_ENABLED=false present in the fixture/E2E
# scripts that already force SPRING_FLYWAY_ENABLED=false (same grep-based
# assertion style already used for those scripts' shellcheck directives).
# ===========================================================================

E2E_LOCAL_CONTENT="$(cat "$REPO_ROOT/scripts/run-e2e-local.sh")"
assert_contains "T14: scripts/run-e2e-local.sh exports SPRING_TASK_SCHEDULING_ENABLED=false" \
  "$E2E_LOCAL_CONTENT" "SPRING_TASK_SCHEDULING_ENABLED=false"

FIXTURE_BACKEND_CONTENT="$(cat "$REPO_ROOT/scripts/dev/local-fixture-backend.sh")"
assert_contains "T15: scripts/dev/local-fixture-backend.sh exports SPRING_TASK_SCHEDULING_ENABLED=false" \
  "$FIXTURE_BACKEND_CONTENT" "SPRING_TASK_SCHEDULING_ENABLED=false"

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
