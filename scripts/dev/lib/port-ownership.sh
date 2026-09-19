#!/usr/bin/env bash
# scripts/dev/lib/port-ownership.sh — shared port-ownership primitives (#2078).
#
# Sourced by scripts/dev-worktree-stack.sh and scripts/run-e2e-local.sh so
# both use the exact same "who holds this port, and is it ours" logic. This
# is what stops one worktree/run from silently stopping, reusing, or
# replacing a process that belongs to another worktree.
#
# Not executable on its own — source it:  source ".../port-ownership.sh"

# NB: `lsof` exits 1 when nothing holds the port — i.e. on the SUCCESS path.
# Piping it straight into awk under `set -o pipefail` makes the assignment
# fail and `set -e` kill the caller exactly when the port is FREE. Swallow
# the non-match with `|| true` INSIDE the pipeline.
port_holder_pid() {
  { lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; } | awk 'NR==2{print $2}'
}

port_holder_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1
}

# True (rc 0) iff $2 (a process cwd) IS worktree root $1, or a true
# descendant of it. A raw string-prefix test is NOT enough here: root
# "/worktrees/app" would otherwise match sibling cwd "/worktrees/app-2/..."
# (or "/worktrees/app-copy/..."), since that string literally starts with
# the prefix — misclassifying a sibling worktree's process as our own and
# recreating the exact cross-session takeover this file exists to prevent.
# Require exact equality, or the root followed by a path separator. An
# empty or unresolved cwd is NOT considered a match — fail closed, never
# assume an unidentifiable process is ours.
port_holder_belongs_to_worktree() {
  local worktree_root="$1" holder_cwd="$2"
  [[ -n "$holder_cwd" ]] || return 1
  [[ "$holder_cwd" == "$worktree_root" || "$holder_cwd" == "$worktree_root"/* ]]
}

# Recursively send signal (default: TERM) to process group -$pid and all child processes.
kill_process_tree() {
  local pid="$1"
  local sig="${2:-TERM}"
  [ -z "$pid" ] && return 0
  kill -0 "$pid" 2>/dev/null || return 0

  # 1. Try process group kill if pid is PGID leader
  kill -"$sig" "-$pid" 2>/dev/null || true

  # 2. Find and kill all descendant processes recursively
  local children
  children="$(pgrep -P "$pid" 2>/dev/null || true)"
  for child in $children; do
    [ -n "$child" ] && kill_process_tree "$child" "$sig"
  done

  # 3. Kill the target process itself
  kill -"$sig" "$pid" 2>/dev/null || true
}

# Gracefully terminate a process and its child process group/tree, falling back to SIGKILL.
terminate_service() {
  local name="$1" pid="$2" port="${3:-}" max_wait="${4:-3}"
  [ -z "$pid" ] && return 0
  kill -0 "$pid" 2>/dev/null || return 0

  echo "[cleanup] Stopping $name (PID $pid)..."
  kill_process_tree "$pid" TERM

  local waited=0
  while kill -0 "$pid" 2>/dev/null || { [ -n "$port" ] && [ -n "$(port_holder_pid "$port")" ]; }; do
    if [ "$waited" -ge "$max_wait" ]; then
      echo "[cleanup] $name (PID $pid) did not terminate gracefully after ${max_wait}s; sending SIGKILL..." >&2
      kill_process_tree "$pid" KILL
      sleep 0.5
      break
    fi
    sleep 0.5
    waited=$((waited + 1))
  done
}

# Verify specified ports are free. Returns 0 if all free, 1 if any port is still bound.
verify_ports_released() {
  local leaked=0
  for port in "$@"; do
    [ -z "$port" ] && continue
    local pid
    pid="$(port_holder_pid "$port")"
    if [ -n "$pid" ]; then
      local cwd
      cwd="$(port_holder_cwd "$pid")"
      echo "ERROR: port $port is still bound by PID $pid (cwd: ${cwd:-unknown}) after teardown!" >&2
      leaked=1
    else
      echo "[cleanup] port $port confirmed free."
    fi
  done
  if [ "$leaked" -eq 1 ]; then
    return 1
  fi
  return 0
}

