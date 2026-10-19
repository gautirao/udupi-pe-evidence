#!/usr/bin/env bash
# scripts/dev/tests/port-isolation.test.sh — #2078
#
# Minimal, dependency-free bash assertion harness (same style as
# scripts/dev/tests/local-fixture-backend.test.sh) covering:
#   - scripts/dev/lib/port-ownership.sh (pure ownership predicate)
#   - apps/api/run-local.sh (caller-exported SERVER_PORT and CORS_ALLOWED_ORIGINS
#     both survive apps/api/.env — #2078 and #2285)
#   - scripts/run-e2e-local.sh (.env.e2e.local override precedence, SERVER_PORT
#     propagation into the backend it starts, and refusing vs. restarting a
#     port depending on whether the holder belongs to this worktree)
#
# lsof/curl/npm/npx/mvn are mocked via stub executables in a temp bin dir
# prepended to PATH; each invocation runs under `env -i` for full environment
# isolation. No real network, backend, or frontend process is ever started.
#
# Run:  bash scripts/dev/tests/port-isolation.test.sh
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
assert_contains() { if [[ "$2" == *"$3"* ]]; then ok "$1"; else not_ok "$1 (expected to find [$3])"; fi; }
assert_not_contains() { if [[ "$2" != *"$3"* ]]; then ok "$1"; else not_ok "$1 (unexpectedly found [$3])"; fi; }

CLEANUP_DIRS=()
cleanup_all() {
  for d in "${CLEANUP_DIRS[@]:-}"; do
    [[ -n "$d" && -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup_all EXIT

# ---------------------------------------------------------------------------
# Mock binaries
# ---------------------------------------------------------------------------

MOCKBIN="$(mktemp -d)"
CLEANUP_DIRS+=("$MOCKBIN")

cat > "$MOCKBIN/lsof" <<'EOF'
#!/usr/bin/env bash
# Simulates two real lsof invocation shapes used by port-ownership.sh:
#   lsof -nP -iTCP:<port> -sTCP:LISTEN     -> who (if anyone) holds the port
#   lsof -a -p <pid> -d cwd -Fn            -> that holder's cwd
#
# MOCK_LSOF_CLEAR_AFTER_CALLS (optional): simulates a `kill`ed process that
# takes N more -nP polls before it actually exits (or never exits, if unset/
# larger than the caller's poll budget) — this is what lets tests exercise
# ensure_port_owned_or_free()'s post-kill polling loop, not just its initial
# ownership check.
if [[ "${1:-}" == "-nP" ]]; then
  if [[ -n "${MOCK_LSOF_PID:-}" ]]; then
    SHOW=true
    if [[ -n "${MOCK_LSOF_CLEAR_AFTER_CALLS:-}" ]]; then
      COUNT_FILE="${MOCK_LSOF_CALL_COUNT_FILE:?MOCK_LSOF_CALL_COUNT_FILE not set when MOCK_LSOF_CLEAR_AFTER_CALLS is used}"
      N=0
      [[ -f "$COUNT_FILE" ]] && N="$(cat "$COUNT_FILE")"
      N=$((N + 1))
      echo "$N" > "$COUNT_FILE"
      [[ "$N" -gt "$MOCK_LSOF_CLEAR_AFTER_CALLS" ]] && SHOW=false
    fi
    if [[ "$SHOW" == true ]]; then
      printf 'COMMAND   PID  USER   FD   TYPE\n'
      printf 'proc    %s user   3u  IPv4\n' "${MOCK_LSOF_PID}"
    fi
  fi
  exit 0
elif [[ "${1:-}" == "-a" ]]; then
  printf 'p%s\n' "${MOCK_LSOF_PID:-}"
  printf 'n%s\n' "${MOCK_LSOF_CWD:-}"
  exit 0
fi
exit 1
EOF
chmod +x "$MOCKBIN/lsof"

cat > "$MOCKBIN/curl" <<'EOF'
#!/usr/bin/env bash
echo "CURL_CALLED $*" >> "${CURL_CALL_LOG:-/dev/null}"
# Health checks in the script under test poll this instantly-succeeding mock
# in a tight loop with no real backend behind it. Without a short pause here,
# the calling script can race past "ready" and tear the backend/frontend mock
# down (EXIT trap) before its own background job has actually run far enough
# to write its capture file — a test-harness race, not a defect in the script
# under test. A brief, generous pause removes that race deterministically.
sleep 0.2
exit 0
EOF
chmod +x "$MOCKBIN/curl"

cat > "$MOCKBIN/npm" <<'EOF'
#!/usr/bin/env bash
echo "NPM_CALLED $*" >> "${NPM_CALL_LOG:-/dev/null}"
# Simulate a long-running dev server; the script under test kills it on exit.
sleep 5
exit 0
EOF
chmod +x "$MOCKBIN/npm"

cat > "$MOCKBIN/npx" <<'EOF'
#!/usr/bin/env bash
echo "NPX_CALLED $*" >> "${NPX_CALL_LOG:-/dev/null}"
exit 0
EOF
chmod +x "$MOCKBIN/npx"

cat > "$MOCKBIN/mvn" <<'EOF'
#!/usr/bin/env bash
{
  echo "SERVER_PORT=${SERVER_PORT:-}"
  echo "CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS:-}"
} > "${MVN_CAPTURE:?MVN_CAPTURE not set}"
exit 0
EOF
chmod +x "$MOCKBIN/mvn"

cat > "$MOCKBIN/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"ps"* ]]; then
  echo "mock-container-id-123"
fi
exit 0
EOF
chmod +x "$MOCKBIN/docker"

cat > "$MOCKBIN/psql" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$MOCKBIN/psql"

# ---------------------------------------------------------------------------
# T-LIB — port_holder_belongs_to_worktree() pure predicate
# ---------------------------------------------------------------------------

# shellcheck source=../lib/port-ownership.sh
source "$REPO_ROOT/scripts/dev/lib/port-ownership.sh"

if port_holder_belongs_to_worktree "/w/tree-a" "/w/tree-a/backend"; then
  ok "T-LIB1: cwd inside worktree root is recognised as owned"
else
  not_ok "T-LIB1: cwd inside worktree root is recognised as owned"
fi

if ! port_holder_belongs_to_worktree "/w/tree-a" "/w/tree-b/backend"; then
  ok "T-LIB2: cwd under a sibling worktree is NOT recognised as owned"
else
  not_ok "T-LIB2: cwd under a sibling worktree is NOT recognised as owned"
fi

if ! port_holder_belongs_to_worktree "/w/tree-a" ""; then
  ok "T-LIB3: an unresolved (empty) cwd fails closed — never assumed owned"
else
  not_ok "T-LIB3: an unresolved (empty) cwd fails closed — never assumed owned"
fi

# A raw string-prefix test misclassifies a sibling worktree whose name
# happens to extend this one's as a literal string — e.g. "/w/tree-a-copy"
# starts with "/w/tree-a". Reject these: only exact-root or a true
# path-separator-bounded descendant may count as owned.
if ! port_holder_belongs_to_worktree "/w/tree-a" "/w/tree-a-copy/backend"; then
  ok "T-LIB4: a sibling worktree whose PATH literally starts with ours is NOT recognised as owned (prefix-collision)"
else
  not_ok "T-LIB4: a sibling worktree whose PATH literally starts with ours is NOT recognised as owned (prefix-collision)"
fi

if port_holder_belongs_to_worktree "/w/tree-a" "/w/tree-a"; then
  ok "T-LIB5: the worktree root itself (exact match, no trailing path) is recognised as owned"
else
  not_ok "T-LIB5: the worktree root itself (exact match, no trailing path) is recognised as owned"
fi

# ===========================================================================
# T1/T2 — apps/api/run-local.sh: caller-exported SERVER_PORT survives
# apps/api/.env also defining SERVER_PORT (the #2078 clobbering regression)
# ===========================================================================

new_runlocal_sandbox() {
  local sb
  sb="$(mktemp -d)"
  CLEANUP_DIRS+=("$sb")
  mkdir -p "$sb/apps/api"
  cp "$REPO_ROOT/apps/api/run-local.sh" "$sb/apps/api/run-local.sh"
  chmod +x "$sb/apps/api/run-local.sh"
  # run-local.sh (#2569) resolves REPO_ROOT as two directories up from its own
  # location and sources scripts/dev/lib/remote-db-safety.sh from there —
  # mirror that same layout inside the sandbox so it sources the real file.
  mkdir -p "$sb/scripts/dev/lib"
  cp "$REPO_ROOT/scripts/dev/lib/remote-db-safety.sh" "$sb/scripts/dev/lib/remote-db-safety.sh"
  # SUPABASE_DB_HOST is 127.0.0.1 (loopback), not an arbitrary placeholder:
  # #2569's safety guard now fails closed on a non-loopback host, and this
  # fixture exists to test SERVER_PORT/CORS_ALLOWED_ORIGINS precedence, not
  # that guard — 127.0.0.1 keeps this test passing through the guard while
  # remaining an obvious, harmless placeholder (nothing here ever actually
  # connects to it).
  cat > "$sb/apps/api/.env" <<'ENVEOF'
SUPABASE_DB_HOST=127.0.0.1
SUPABASE_DB_USER=fromenv-user
SUPABASE_DB_PASSWORD=fromenv-pass-secret
SUPABASE_PROJECT_REF=fromenv-ref
AI_API_KEY=fromenv-aikey-secret
SERVER_PORT=8085
CORS_ALLOWED_ORIGINS=http://fromenv-origin-should-not-be-used
ENVEOF
  echo "$sb"
}

run_runlocal() {
  local sandbox="$1"
  shift
  env -i PATH="$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" "$@" bash "$sandbox/apps/api/run-local.sh"
}

SB1="$(new_runlocal_sandbox)"
MVN_CAP1="$(mktemp)"
LOG1="$(mktemp)"
run_runlocal "$SB1" MVN_CAPTURE="$MVN_CAP1" > "$LOG1" 2>&1
RC1=$?
CAP1="$(cat "$MVN_CAP1" 2>/dev/null || true)"

assert_true "T1: run-local.sh (no caller override) exits 0" "$RC1"
assert_contains "T1: with no caller override, apps/api/.env's SERVER_PORT is used (baseline)" "$CAP1" "SERVER_PORT=8085"
assert_contains "T1: with no caller override, apps/api/.env's CORS_ALLOWED_ORIGINS is used (baseline)" "$CAP1" "CORS_ALLOWED_ORIGINS=http://fromenv-origin-should-not-be-used"

SB2="$(new_runlocal_sandbox)"
MVN_CAP2="$(mktemp)"
LOG2="$(mktemp)"
run_runlocal "$SB2" SERVER_PORT=9401 CORS_ALLOWED_ORIGINS=http://worktree-override-origin MVN_CAPTURE="$MVN_CAP2" > "$LOG2" 2>&1
RC2=$?
CAP2="$(cat "$MVN_CAP2" 2>/dev/null || true)"
LOG2_CONTENT="$(cat "$LOG2" 2>/dev/null || true)"

assert_true "T2: run-local.sh (caller SERVER_PORT=9401, CORS_ALLOWED_ORIGINS override) exits 0" "$RC2"
assert_contains "T2: caller-exported SERVER_PORT survives sourcing apps/api/.env (#2078 fix)" "$CAP2" "SERVER_PORT=9401"
assert_not_contains "T2: apps/api/.env's conflicting SERVER_PORT is NOT what actually starts" "$CAP2" "SERVER_PORT=8085"
assert_contains "T2: override is logged for operator visibility" "$LOG2_CONTENT" "SERVER_PORT overridden by caller: 9401"
assert_contains "T2: caller-exported CORS_ALLOWED_ORIGINS survives sourcing apps/api/.env (#2285 fix)" "$CAP2" "CORS_ALLOWED_ORIGINS=http://worktree-override-origin"
assert_not_contains "T2: apps/api/.env's conflicting CORS_ALLOWED_ORIGINS is NOT what actually starts" "$CAP2" "CORS_ALLOWED_ORIGINS=http://fromenv-origin-should-not-be-used"
assert_contains "T2: CORS override is logged for operator visibility" "$LOG2_CONTENT" "CORS_ALLOWED_ORIGINS overridden by caller: http://worktree-override-origin"

# ===========================================================================
# T3-T5 — scripts/run-e2e-local.sh
# ===========================================================================

new_e2e_sandbox() {
  # $1=default FE port $2=default BE port
  local sb
  sb="$(mktemp -d)"
  CLEANUP_DIRS+=("$sb")
  mkdir -p "$sb/scripts/dev/lib" "$sb/scripts/db" "$sb/apps/api"
  cp "$REPO_ROOT/scripts/run-e2e-local.sh" "$sb/scripts/run-e2e-local.sh"
  chmod +x "$sb/scripts/run-e2e-local.sh"
  cp "$REPO_ROOT/scripts/dev/lib/port-ownership.sh" "$sb/scripts/dev/lib/port-ownership.sh"
  cp "$REPO_ROOT/scripts/dev/lib/e2e-identity-seed.sh" "$sb/scripts/dev/lib/e2e-identity-seed.sh" 2>/dev/null || cat > "$sb/scripts/dev/lib/e2e-identity-seed.sh" <<'EOF'
#!/usr/bin/env bash
e2e_seed_identity() { return 0; }
EOF
  cat > "$sb/scripts/db/restore-test-fixture.sh" <<'EOF'
#!/usr/bin/env bash
echo "[fixture] Restoring fixture..."
echo "postgresql://postgres:pass@localhost:5434/postgres"
EOF
  chmod +x "$sb/scripts/db/restore-test-fixture.sh"
  cat > "$sb/apps/api/.env" <<'EOF'
SUPABASE_PROJECT_REF=test-ref
AI_API_KEY=test-key
EOF
  cat > "$sb/.env.e2e" <<EOF
PLAYWRIGHT_BASE_URL=http://localhost:$1
BACKEND_BASE_URL=http://localhost:$2
ADMIN_EMAIL=admin@test.local
EOF
  cat > "$sb/apps/api/run-local.sh" <<'EOF'
#!/usr/bin/env bash
{
  echo "SERVER_PORT=${SERVER_PORT:-}"
  echo "CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS:-}"
} > "${BACKEND_CAPTURE:?BACKEND_CAPTURE not set}"
sleep 5
EOF
  chmod +x "$sb/apps/api/run-local.sh"
  # #2850 PR-7: per-sandbox lsof RECORDING shim (prepended ahead of MOCKBIN in run_e2e; MOCKBIN is untouched). The wrapper is
  # now disabled, so the converted tests assert that lsof was never called ($sb/lsof.calls stays empty/absent).
  mkdir -p "$sb/shimbin"
  cat > "$sb/shimbin/lsof" <<EOF
#!/usr/bin/env bash
echo "LSOF_CALLED \$*" >> "$sb/lsof.calls"
exit 0
EOF
  chmod +x "$sb/shimbin/lsof"
  echo "$sb"
}

run_e2e() {
  # $1=sandbox; remaining = NAME=VALUE env assignments for the child (the script argument --project=full is passed
  # explicitly, #2850 PR-7: since #2750 PR-2 the wrapper refuses a missing --project with exit 2, which would hide the
  # fail-closed refusal (exit 3) these tests now assert).
  local sandbox="$1"
  shift
  env -i PATH="$sandbox/shimbin:$MOCKBIN:$ORIG_PATH" HOME="${HOME:-/tmp}" TMPDIR="$sandbox" "$@" \
    bash "$sandbox/scripts/run-e2e-local.sh" --project=full > "$sandbox/run.log" 2>&1
}

# assert_wrapper_refused <label> <exit code> <sandbox> <backend capture file>
# The disabled wrapper (#2850 PR-7, follow-up #2854) must: exit EXACTLY 3 (never just non-zero, so the --project exit 2
# cannot satisfy it), print the refusal, never write BACKEND_CAPTURE (mktemp pre-creates it, so `! -s`), and never call lsof.
assert_wrapper_refused() {
  local label="$1" rc="$2" sb="$3" cap="$4" log
  log="$(cat "$sb/run.log" 2>/dev/null || true)"
  if [[ "$rc" -eq 3 ]]; then ok "$label: exits exactly 3 (fail-closed refusal)"; else not_ok "$label: exits exactly 3 (got $rc)"; fi
  assert_contains "$label: prints the DISABLED refusal message" "$log" "DISABLED (fail-closed, #2850 PR-7)"
  if [[ ! -s "$cap" ]]; then ok "$label: BACKEND_CAPTURE never written (no backend started)"; else not_ok "$label: BACKEND_CAPTURE never written (no backend started)"; fi
  if [[ ! -s "$sb/lsof.calls" ]]; then ok "$label: lsof was never called"; else not_ok "$label: lsof was never called"; fi
}

# --- T3: .env.e2e.local (worktree override) wins over .env.e2e, and its
#     BACKEND port propagates into SERVER_PORT for the backend it starts ---

SB3="$(new_e2e_sandbox 8080 8085)"
cat > "$SB3/.env.e2e.local" <<'EOF'
PLAYWRIGHT_BASE_URL=http://localhost:9410
BACKEND_BASE_URL=http://localhost:9411
CORS_ALLOWED_ORIGINS=http://localhost:9410,http://127.0.0.1:9410
EOF
BACKEND_CAP3="$(mktemp)"
run_e2e "$SB3" BACKEND_CAPTURE="$BACKEND_CAP3"
RC3=$?

# #2850 PR-7: scripts/run-e2e-local.sh is DISABLED (fail-closed): it has no non-hosted route, so it refuses unconditionally
# (exit 3) before reading any env file. The .env.e2e.local override precedence + SERVER_PORT propagation this case used to
# cover is DISPLACED to follow-up #2854 (restored together with a local-auth route); here we assert the refusal instead.
assert_wrapper_refused "T3 (converted, #2850): a worktree port override cannot re-enable the disabled wrapper" "$RC3" "$SB3" "$BACKEND_CAP3"

# --- T4: port held by a FOREIGN worktree -> refuse, never start anything ---

SB4="$(new_e2e_sandbox 8080 8085)"
FOREIGN_CWD="$(mktemp -d)"
CLEANUP_DIRS+=("$FOREIGN_CWD")
BACKEND_CAP4="$(mktemp)"
run_e2e "$SB4" \
  MOCK_LSOF_PID=42424 \
  MOCK_LSOF_CWD="$FOREIGN_CWD" \
  BACKEND_CAPTURE="$BACKEND_CAP4"
RC4=$?

# #2850 PR-7 (converted): the foreign-worktree port-ownership refusal is DISPLACED to #2854 (dead code behind the disabled wrapper).
assert_wrapper_refused "T4 (converted, #2850): a foreign-held port never reaches the port-ownership logic" "$RC4" "$SB4" "$BACKEND_CAP4"

# --- T5: port held by THIS worktree's own leftover process, and the port
#     ACTUALLY CLEARS after kill within the timeout -> restart, still succeed ---
# MOCK_LSOF_CLEAR_AFTER_CALLS=1 makes the mock stop reporting the holder
# after its second query (the ownership check itself is the first) — i.e.
# the post-kill poll loop sees it gone on its very first check. Without this,
# a fake unkillable PID would make the mock report the port as held forever,
# which is exactly what T6 below tests instead.

SB5="$(new_e2e_sandbox 8080 8085)"
BACKEND_CAP5="$(mktemp)"
LSOF_COUNT5="$(mktemp)"
rm -f "$LSOF_COUNT5"
run_e2e "$SB5" \
  MOCK_LSOF_PID=42425 \
  MOCK_LSOF_CWD="$SB5" \
  MOCK_LSOF_CLEAR_AFTER_CALLS=1 \
  MOCK_LSOF_CALL_COUNT_FILE="$LSOF_COUNT5" \
  BACKEND_CAPTURE="$BACKEND_CAP5"
RC5=$?

# #2850 PR-7 (converted): the own-process restart path is DISPLACED to #2854; the disabled wrapper never starts anything.
assert_wrapper_refused "T5 (converted, #2850): an own-worktree leftover process is never killed or restarted" "$RC5" "$SB5" "$BACKEND_CAP5"

# --- T6: port held by THIS worktree's own process, but it NEVER clears after
#     kill (e.g. mvn's spawned java child ignoring the wrapper script's
#     death) -> the script must fail closed and never start a replacement,
#     rather than let Playwright validate a stale service (PR #2080 review) ---

SB6="$(new_e2e_sandbox 8080 8085)"
BACKEND_CAP6="$(mktemp)"
run_e2e "$SB6" \
  MOCK_LSOF_PID=42426 \
  MOCK_LSOF_CWD="$SB6" \
  E2E_PORT_CLEAR_TIMEOUT_FRONTEND_SECONDS=1 \
  BACKEND_CAPTURE="$BACKEND_CAP6"
RC6=$?

# #2850 PR-7 (converted): the "port never clears after kill" fail-closed path is DISPLACED to #2854.
assert_wrapper_refused "T6 (converted, #2850): a never-clearing port never reaches the kill/poll logic" "$RC6" "$SB6" "$BACKEND_CAP6"

# ===========================================================================
# T7 — kill_process_tree & terminate_service process cleanup primitives (#2525)
# ===========================================================================

# Spawn a parent process that spawns a child process
set -m
CHILD_PID_FILE="$(mktemp)"
CLEANUP_DIRS+=("$CHILD_PID_FILE")

(
  ( sleep 30 ) &
  cpid=$!
  echo "$cpid" > "$CHILD_PID_FILE"
  wait "$cpid"
) &
parent_pid=$!
sleep 0.3
child_pid="$(cat "$CHILD_PID_FILE" 2>/dev/null || true)"

if [[ -n "$parent_pid" && -n "$child_pid" ]]; then
  if kill -0 "$parent_pid" 2>/dev/null && kill -0 "$child_pid" 2>/dev/null; then
    ok "T7: test parent and child processes spawned successfully"
  else
    not_ok "T7: test parent and child processes spawned successfully"
  fi

  kill_process_tree "$parent_pid" TERM
  sleep 0.3

  if ! kill -0 "$parent_pid" 2>/dev/null && ! kill -0 "$child_pid" 2>/dev/null; then
    ok "T7: kill_process_tree successfully killed parent and descendant child process"
  else
    not_ok "T7: kill_process_tree successfully killed parent and descendant child process"
    kill -9 "$parent_pid" "$child_pid" 2>/dev/null || true
  fi
else
  not_ok "T7: failed to spawn test parent/child processes"
  not_ok "T7: kill_process_tree test skipped"
fi

# ===========================================================================
# T8 — verify_ports_released primitive (#2525)
# ===========================================================================

VPORT_FREE=9991
VPORT_BOUND=9992

if verify_ports_released "$VPORT_FREE" >/dev/null 2>&1; then
  ok "T8: verify_ports_released returns 0 when port is free"
else
  not_ok "T8: verify_ports_released returns 0 when port is free"
fi

( export PATH="$MOCKBIN:$ORIG_PATH" MOCK_LSOF_PID=8888 MOCK_LSOF_CWD="/some/path"; verify_ports_released "$VPORT_BOUND" >/dev/null 2>&1 )
V_RC=$?
if [[ $V_RC -ne 0 ]]; then
  ok "T8: verify_ports_released returns non-zero when a port is bound"
else
  not_ok "T8: verify_ports_released returns non-zero when a port is bound"
fi

# ===========================================================================
# T9 — pre-flight port guard before service start (#2525)
# ===========================================================================

SB9="$(new_e2e_sandbox 8080 8085)"
BACKEND_CAP9="$(mktemp)"
run_e2e "$SB9" MOCK_LSOF_PID=9999 MOCK_LSOF_CWD="/other/path" BACKEND_CAPTURE="$BACKEND_CAP9"
RC9=$?

# #2850 PR-7 (converted): the pre-flight port guard is DISPLACED to #2854. At base this test was already red for the same
# cause as T3-T6 (no --project -> exit 2 'smoke project was retired', evidence/t9-base-cause.txt).
assert_wrapper_refused "T9 (converted, #2850): the pre-flight port guard is unreachable behind the disabled wrapper" "$RC9" "$SB9" "$BACKEND_CAP9"

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
