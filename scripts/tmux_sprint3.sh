#!/usr/bin/env bash
# Sprint 3 — tmux agent workspace setup
# Creates session "sprint3" with one window per agent + log piping.
# Usage: ./scripts/tmux_sprint3.sh
# Re-run safely: kills old session if it exists.

set -euo pipefail

SESSION="sprint3"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs/agents"

mkdir -p "$LOG_DIR"

AGENTS=(
  team-lead
  backend-engineer
  frontend
  qa
  qa-fast
  security-reviewer
  performance-analyst
  code-reviewer
)

# ── Kill old session if exists ────────────────────────────────────────────────
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Killing existing session: $SESSION"
  tmux kill-session -t "$SESSION"
fi

# ── Create session with first window ─────────────────────────────────────────
FIRST="${AGENTS[0]}"
tmux new-session -d -s "$SESSION" -n "$FIRST" -x 220 -y 50
tmux pipe-pane -t "$SESSION:$FIRST" -o "cat >> $LOG_DIR/${FIRST}.log"
echo "  [window] $FIRST  →  logs/agents/${FIRST}.log"

# ── Create remaining windows ──────────────────────────────────────────────────
for AGENT in "${AGENTS[@]:1}"; do
  tmux new-window -t "$SESSION" -n "$AGENT"
  tmux pipe-pane -t "$SESSION:$AGENT" -o "cat >> $LOG_DIR/${AGENT}.log"
  echo "  [window] $AGENT  →  logs/agents/${AGENT}.log"
done

# ── Switch to team-lead as default active window ──────────────────────────────
tmux select-window -t "$SESSION:team-lead"

# ── Print sprint header into each pane ───────────────────────────────────────
for AGENT in "${AGENTS[@]}"; do
  tmux send-keys -t "$SESSION:$AGENT" \
    "echo '=== Sprint 3 | Agent: $AGENT | $(date) ===' && cd $PROJECT_ROOT" Enter
done

echo ""
echo "Session '$SESSION' ready."
echo "Attach:  tmux attach -t $SESSION"
echo "Logs:    tail -f $LOG_DIR/<agent>.log"
echo ""
echo "Quick tail all logs:"
echo "  tail -f $LOG_DIR/*.log"
