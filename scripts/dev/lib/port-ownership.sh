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
