#!/usr/bin/env bash
# scripts/dev/tests/concurrent-fixture-isolation.sh — #2568
#
# REAL Docker integration proof (deliberately NOT mocked, unlike the other
# scripts/dev/tests/*.test.sh files). Starts TWO real, disposable PostGIS
# fixture containers CONCURRENTLY via scripts/db/restore-test-fixture.sh,
# using distinct PG_TEST_CONTAINER_NAME / PG_TEST_PORT pairs — exactly the
# values scripts/dev/local-fixture-backend.sh's Step B now generates by
# default for two concurrent invocations (worktree-slug + PID for the name,
# find_free_port() for the port) — then proves the required properties:
#
#   1. Invocation A gets container A / port A; invocation B gets container B /
#      port B — both come up concurrently, independently reachable.
#   2. local-fixture-backend.sh's D2 safety-gate filter
#      (`docker ps --filter "name=<container>" --filter status=running -q`)
#      identifies EACH container correctly and never cross-matches the other
#      — i.e. A's fixture cannot be mistaken for B's fixture, or vice versa.
#   3. A's startup (Step C's `docker rm -f "$CONTAINER_A"` + recreate) does
#      NOT stop B, and B's startup does not stop A (proved by starting both
#      concurrently and asserting both survive).
#   4. Tearing down A (docker rm -f) leaves B running and still reachable.
#   5. Tearing down B afterwards leaves nothing behind.
#
# Requires a local Docker daemon. Deliberately excluded from the mocked
# local-fixture-backend.test.sh suite (no docker there, runs in milliseconds);
# this is a slower, real-infrastructure proof — run manually, or in a CI stage
# that has Docker available. Never touches remote/shared Supabase.
#
# Run:  bash scripts/dev/tests/concurrent-fixture-isolation.sh
# Exits 0 if every property above holds, non-zero (naming which failed) otherwise.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
RESTORE_SCRIPT="${REPO_ROOT}/scripts/db/restore-test-fixture.sh"
# shellcheck source=../lib/port-ownership.sh
source "${SCRIPT_DIR}/../lib/port-ownership.sh"

TOTAL=0
FAILED=0
ok() { TOTAL=$((TOTAL + 1)); echo "ok $TOTAL - $1"; }
not_ok() { TOTAL=$((TOTAL + 1)); FAILED=$((FAILED + 1)); echo "not ok $TOTAL - $1"; }

if ! command -v docker &>/dev/null || ! docker info &>/dev/null; then
  echo "SKIP: docker not available — this proof requires a local Docker daemon." >&2
  exit 77
fi

# ---------------------------------------------------------------------------
# Pick two distinct container names + ports the SAME way
# scripts/dev/local-fixture-backend.sh's Step B does: worktree-slug + PID for
# the name (using two DIFFERENT synthetic PID-like suffixes to simulate two
# real concurrent invocations, since both fixtures are started from this one
# script's own PID), find_free_port() probing for the port.
# ---------------------------------------------------------------------------

WORKTREE_SLUG="$(basename "$REPO_ROOT" | tr -c 'a-zA-Z0-9' '-')"
CONTAINER_A="pg-fixture-${WORKTREE_SLUG}-proofA-$$"
CONTAINER_B="pg-fixture-${WORKTREE_SLUG}-proofB-$$"

PORT_A="$(find_free_port 25434)" || { echo "ERROR: could not find a free port for A" >&2; exit 1; }
PORT_B="$(find_free_port $((PORT_A + 1)))" || { echo "ERROR: could not find a free port for B" >&2; exit 1; }

echo "==> Container A: ${CONTAINER_A} on port ${PORT_A}"
echo "==> Container B: ${CONTAINER_B} on port ${PORT_B}"

CLEANUP_DONE=0
cleanup() {
  [[ "$CLEANUP_DONE" -eq 1 ]] && return
  CLEANUP_DONE=1
  docker rm -f "$CONTAINER_A" >/dev/null 2>&1 || true
  docker rm -f "$CONTAINER_B" >/dev/null 2>&1 || true
}
trap cleanup EXIT

LOG_A="$(mktemp)"
LOG_B="$(mktemp)"

# ---------------------------------------------------------------------------
# Step 1 — start BOTH fixtures CONCURRENTLY (background jobs), exactly the
# scenario two simultaneous local-fixture-backend.sh invocations create.
# SKIP_SEED=true keeps this proof focused on container/port isolation (the
# property #2568 is about) rather than re-proving the seed-data gates that
# scripts/db/restore-test-fixture.sh already asserts on every other run.
# ---------------------------------------------------------------------------

echo "==> Starting both fixtures concurrently..."
( PG_TEST_CONTAINER_NAME="$CONTAINER_A" PG_TEST_PORT="$PORT_A" SKIP_SEED=true \
    bash "$RESTORE_SCRIPT" > "$LOG_A" 2>&1 ) &
PID_A=$!
( PG_TEST_CONTAINER_NAME="$CONTAINER_B" PG_TEST_PORT="$PORT_B" SKIP_SEED=true \
    bash "$RESTORE_SCRIPT" > "$LOG_B" 2>&1 ) &
PID_B=$!

wait "$PID_A"; RC_A=$?
wait "$PID_B"; RC_B=$?

if [[ "$RC_A" -eq 0 ]]; then ok "A: restore-test-fixture.sh exits 0 (rc=$RC_A)"; else not_ok "A: restore-test-fixture.sh exits 0 (rc=$RC_A) — log: $(tail -20 "$LOG_A")"; fi
if [[ "$RC_B" -eq 0 ]]; then ok "B: restore-test-fixture.sh exits 0 (rc=$RC_B)"; else not_ok "B: restore-test-fixture.sh exits 0 (rc=$RC_B) — log: $(tail -20 "$LOG_B")"; fi

# ---------------------------------------------------------------------------
# Step 2 — property 1: A got container A / port A, B got container B / port B,
# both concurrently up. Neither startup stopped the other (both still running
# after both restores completed — if A's `docker rm -f` inside Step C had
# targeted B's name, or vice versa, one of these would now be absent).
# ---------------------------------------------------------------------------

ID_A="$(docker ps --filter "name=${CONTAINER_A}" --filter status=running -q || true)"
ID_B="$(docker ps --filter "name=${CONTAINER_B}" --filter status=running -q || true)"

if [[ -n "$ID_A" ]]; then ok "A's container is running after both invocations completed"; else not_ok "A's container is running after both invocations completed"; fi
if [[ -n "$ID_B" ]]; then ok "B's container is running after both invocations completed"; else not_ok "B's container is running after both invocations completed"; fi
if [[ -n "$ID_A" && -n "$ID_B" && "$ID_A" != "$ID_B" ]]; then
  ok "A and B are genuinely DIFFERENT containers (distinct docker container IDs)"
else
  not_ok "A and B are genuinely DIFFERENT containers (distinct docker container IDs) (ID_A=$ID_A ID_B=$ID_B)"
fi

# ---------------------------------------------------------------------------
# Step 3 — property 2: local-fixture-backend.sh's D2 filter discriminates
# correctly. The filter for A's name must find ONLY A (never B), and vice
# versa — this is exactly the query Step D2 in local-fixture-backend.sh now
# runs (docker ps --filter "name=${PG_TEST_CONTAINER_NAME}" --filter status=running -q).
# ---------------------------------------------------------------------------

D2_FOR_A="$(docker ps --filter "name=${CONTAINER_A}" --filter status=running -q || true)"
D2_FOR_B="$(docker ps --filter "name=${CONTAINER_B}" --filter status=running -q || true)"
if [[ "$D2_FOR_A" == "$ID_A" ]]; then
  ok "D2-style filter for A's name resolves to exactly A's container ID"
else
  not_ok "D2-style filter for A's name resolves to exactly A's container ID (got: $D2_FOR_A)"
fi
if [[ "$D2_FOR_B" == "$ID_B" ]]; then
  ok "D2-style filter for B's name resolves to exactly B's container ID"
else
  not_ok "D2-style filter for B's name resolves to exactly B's container ID (got: $D2_FOR_B)"
fi

# ---------------------------------------------------------------------------
# Step 4 — property: A and B are independently reachable on THEIR OWN ports
# (D3-style check — proves the port isolation, not just the container name).
# ---------------------------------------------------------------------------

if command -v psql &>/dev/null; then
  if PGPASSWORD=fixture_test_only psql -h localhost -p "$PORT_A" -U postgres -d postgres -c 'SELECT 1' &>/dev/null; then
    ok "A is reachable on its own port ($PORT_A)"
  else
    not_ok "A is reachable on its own port ($PORT_A)"
  fi
  if PGPASSWORD=fixture_test_only psql -h localhost -p "$PORT_B" -U postgres -d postgres -c 'SELECT 1' &>/dev/null; then
    ok "B is reachable on its own port ($PORT_B)"
  else
    not_ok "B is reachable on its own port ($PORT_B)"
  fi
else
  echo "SKIP: psql not on PATH — skipping direct reachability checks (container-identity checks above still hold)." >&2
fi

# ---------------------------------------------------------------------------
# Step 5 — property 3/4: tearing down A leaves B running and reachable
# (only the resource this "invocation" owns is torn down).
# ---------------------------------------------------------------------------

echo "==> Tearing down A only..."
docker rm -f "$CONTAINER_A" >/dev/null 2>&1
ID_A_AFTER="$(docker ps --filter "name=${CONTAINER_A}" --filter status=running -q || true)"
ID_B_AFTER_A_TEARDOWN="$(docker ps --filter "name=${CONTAINER_B}" --filter status=running -q || true)"

if [[ -z "$ID_A_AFTER" ]]; then ok "A's container is gone after its own teardown"; else not_ok "A's container is gone after its own teardown"; fi
if [[ "$ID_B_AFTER_A_TEARDOWN" == "$ID_B" ]]; then
  ok "B's container is UNCHANGED and still running after A's teardown (A's teardown did not touch B)"
else
  not_ok "B's container is UNCHANGED and still running after A's teardown (A's teardown did not touch B) (got: $ID_B_AFTER_A_TEARDOWN)"
fi
if command -v psql &>/dev/null; then
  if PGPASSWORD=fixture_test_only psql -h localhost -p "$PORT_B" -U postgres -d postgres -c 'SELECT 1' &>/dev/null; then
    ok "B remains reachable on its own port after A's teardown"
  else
    not_ok "B remains reachable on its own port after A's teardown"
  fi
fi

# ---------------------------------------------------------------------------
# Step 6 — property 4 (continued): tearing down B afterwards leaves nothing.
# ---------------------------------------------------------------------------

echo "==> Tearing down B..."
docker rm -f "$CONTAINER_B" >/dev/null 2>&1
ID_B_AFTER="$(docker ps --filter "name=${CONTAINER_B}" --filter status=running -q || true)"
if [[ -z "$ID_B_AFTER" ]]; then ok "B's container is gone after its own teardown"; else not_ok "B's container is gone after its own teardown"; fi

CLEANUP_DONE=1  # both already removed above; nothing left for the trap to do

echo ""
echo "1..$TOTAL"
if [[ "$FAILED" -eq 0 ]]; then
  echo "# All $TOTAL assertions passed."
  exit 0
else
  echo "# $FAILED of $TOTAL assertions FAILED."
  exit 1
fi
