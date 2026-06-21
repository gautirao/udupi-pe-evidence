#!/usr/bin/env bash
#
# Prepare three M28 Mode-3 worktrees after #1521 has merged.
#
# Dry run:
#   DRY_RUN=1 scripts/dev/run-m28-parallel-mode3.sh
#
# Prepare worktrees + tmux windows, but do not auto-start Claude:
#   scripts/dev/run-m28-parallel-mode3.sh
#
# Prepare and auto-start Claude in each tmux window:
#   AUTO_START=1 CLAUDE_CMD="claude --model opus" scripts/dev/run-m28-parallel-mode3.sh
#
# Attach:
#   tmux attach -t m28-mode3
#
# ---------------------------------------------------------------------------
# What this does
#   * Verifies it runs from the MAIN repo checkout (not a linked worktree).
#   * Verifies required tools, a clean working tree, and that local `main`
#     matches `origin/main` (it never resets/updates your branches).
#   * Verifies the prerequisite has landed on origin/main before doing anything:
#       - logical prerequisite: issue #1521 must already be merged into main;
#       - actual merge vehicle : PR #1570 (the PR that landed the #1521 work —
#         there is no PR literally numbered 1521). The happy path confirms PR
#         #1570 is merged into main (and, where possible, that its landing commit
#         is reachable from origin/main), then proceeds without prompting.
#   * Creates (or safely reuses) three clean worktrees + branches off
#     origin/main, one per M28 issue.
#   * Builds a tmux session with one window per job, each cd'd into its
#     worktree and briefed with its scope + intended /mode3-run command.
#   * Only starts Claude / submits /mode3-run when AUTO_START=1.
#
# What this deliberately NEVER does
#   * No `git worktree remove --force`, no `git branch -D`, no `git reset
#     --hard`, no `git clean -fd`, no `rm -rf`.
#   * Never deletes branches or worktrees, never reuses a dirty worktree.
#   * Never pushes, merges, or opens PRs.
# ---------------------------------------------------------------------------

set -euo pipefail

# ----------------------------- configuration -------------------------------
DRY_RUN="${DRY_RUN:-0}"
AUTO_START="${AUTO_START:-0}"
SESSION_NAME="${SESSION_NAME:-m28-mode3}"
# Default Claude command. Do NOT hardcode Opus; opt in with
#   CLAUDE_CMD="claude --model opus"
CLAUDE_CMD="${CLAUDE_CMD:-claude}"
# Optional escape hatch: set SKIP_1521_CHECK=1 only if you have manually
# verified #1521 is on origin/main and gh is unavailable.
SKIP_1521_CHECK="${SKIP_1521_CHECK:-0}"

# Per-job data (index-aligned arrays).
ISSUES=(1524 1538 1523)
BRANCHES=(
  "feat/m28-admin-intelligence-1524"
  "feat/m28-listing-quality-page-1538"
  "feat/m28-broker-dashboard-v2-1523"
)
DIRNAMES=(
  "issue-1524-admin-intelligence"
  "issue-1538-listing-quality-page"
  "issue-1523-broker-dashboard-v2"
)
WINDOWS=(
  "1524-admin-intelligence"
  "1538-listing-quality"
  "1523-dashboard-v2"
)
SCOPES=(
  "admin intelligence validator only"
  "/broker/listing-quality only"
  "/broker/dashboard only"
)

# Common rules echoed into every window.
COMMON_RULES=(
  "Start from latest origin/main after #1521 has merged."
  "Keep changes scoped to this issue only."
  "Do not share uncommitted files between worktrees."
  "If a shared API type/helper/nav component must change in >1 branch, make the smallest compatible change and report it as a possible merge-conflict area."
  "Do not fake scores, engagement metrics, demand gaps, views, or enquiries."
  "Missing values must render as null/unavailable/limited-data/backfill-incomplete."
  "Run the issue's required backend/frontend tests."
  "Authoritative FE typecheck: node node_modules/.bin/tsc --noEmit -p tsconfig.app.json"
  "If main has existing type/lint failures, use baseline-vs-branch net-new error handling."
  "Stop at READY_TO_MERGE or NEEDS_USER_DECISION."
  "Do not push, do not merge, do not open PRs from here."
)

# ------------------------------- helpers -----------------------------------
c_red()  { printf '\033[31m%s\033[0m\n' "$*"; }
c_grn()  { printf '\033[32m%s\033[0m\n' "$*"; }
c_ylw()  { printf '\033[33m%s\033[0m\n' "$*"; }
log()    { printf '  %s\n' "$*"; }
hdr()    { printf '\n=== %s ===\n' "$*"; }
die()    { c_red "ERROR: $*"; exit 1; }
warn()   { c_ylw "WARN: $*"; }
has_cmd() { command -v "$1" >/dev/null 2>&1; }

# In dry-run, downgrade hard failures to warnings so the full plan still prints.
fail_or_warn() {
  if [[ "$DRY_RUN" == "1" ]]; then
    warn "$* (dry-run: continuing)"
  else
    die "$*"
  fi
}

# Run a state-changing command, or echo it under dry-run.
run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '  [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

# Send a command line to a tmux window (then Enter), or echo it under dry-run.
tmux_send() { # <window> <command-string>
  local win="$1"; shift
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '  [dry-run] tmux send-keys -t %s:%s -- %q Enter\n' "$SESSION_NAME" "$win" "$*"
  else
    tmux send-keys -t "${SESSION_NAME}:${win}" -- "$*" C-m
  fi
}

# Echo a single line inside a tmux window.
win_print() { # <window> <message>
  tmux_send "$1" "printf '%s\n' \"$2\""
}

# Per-issue scope preamble (single-line; submitted as the first Claude prompt
# when AUTO_START=1). Mirrors the multi-line briefing shown in each window.
scope_preamble() { # <issue>
  case "$1" in
    1524) printf '%s' "You are in a dedicated worktree for issue #1524. Scope: admin intelligence validator only. Do not implement #1523 or #1538 broker UI. Keep changes scoped to #1524. Stop at READY_TO_MERGE or NEEDS_USER_DECISION." ;;
    1538) printf '%s' "You are in a dedicated worktree for issue #1538. Scope: /broker/listing-quality only. Do not implement #1523 dashboard except navigation links strictly needed by this page. Keep changes scoped to #1538. Stop at READY_TO_MERGE or NEEDS_USER_DECISION." ;;
    1523) printf '%s' "You are in a dedicated worktree for issue #1523. Scope: /broker/dashboard only. Do not implement #1538 listing-quality page except navigation links strictly needed by this dashboard. Keep changes scoped to #1523. Stop at READY_TO_MERGE or NEEDS_USER_DECISION." ;;
    *)    die "no preamble for issue $1" ;;
  esac
}

# ------------------------- preflight verification --------------------------
hdr "Preflight"

# (1) Repo root + (2) must be the main checkout, not a linked worktree.
has_cmd git || die "git is required."
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Run this from inside the git repository."
cd "$REPO_ROOT"

GITDIR="$(git rev-parse --absolute-git-dir)"
COMMONDIR="$(git rev-parse --git-common-dir)"
case "$COMMONDIR" in
  /*) : ;;
  *)  COMMONDIR="$(cd "$COMMONDIR" && pwd)" ;;
esac
if [[ "$GITDIR" != "$COMMONDIR" ]]; then
  die "This appears to be a linked worktree ($GITDIR). Run from the MAIN checkout: $COMMONDIR"
fi
log "Main repo checkout: $REPO_ROOT"

# (3) Required tools.
MISSING=()
for t in git tmux "${CLAUDE_CMD%% *}"; do
  has_cmd "$t" || MISSING+=("$t")
done
if ((${#MISSING[@]})); then
  fail_or_warn "Missing required tools: ${MISSING[*]}"
fi
if has_cmd gh; then
  HAVE_GH=1
else
  HAVE_GH=0
  warn "gh not found — will verify #1521 via 'git log origin/main' only."
fi

# (4) Clean working tree.
if [[ -n "$(git status --porcelain)" ]]; then
  fail_or_warn "Working tree is not clean. Commit/stash before creating worktrees."
else
  log "Working tree is clean."
fi

# (5) Fetch latest origin.
run git fetch origin --prune

# (6) Local main must match origin/main (never auto-update).
if git show-ref --verify --quiet refs/heads/main; then
  LOCAL_MAIN="$(git rev-parse refs/heads/main)"
  REMOTE_MAIN="$(git rev-parse refs/remotes/origin/main 2>/dev/null || echo '')"
  if [[ -z "$REMOTE_MAIN" ]]; then
    fail_or_warn "origin/main not found. Check your remotes."
  elif [[ "$LOCAL_MAIN" != "$REMOTE_MAIN" ]]; then
    BASE="$(git merge-base refs/heads/main refs/remotes/origin/main || echo '')"
    if [[ "$BASE" == "$LOCAL_MAIN" ]]; then
      fail_or_warn "Local 'main' is BEHIND origin/main. Update it yourself: git checkout main && git pull --ff-only"
    elif [[ "$BASE" == "$REMOTE_MAIN" ]]; then
      fail_or_warn "Local 'main' is AHEAD of origin/main (unpushed commits). Resolve before continuing."
    else
      fail_or_warn "Local 'main' has DIVERGED from origin/main. Reconcile before continuing."
    fi
  else
    log "Local 'main' matches origin/main ($(git rev-parse --short refs/heads/main))."
  fi
else
  warn "No local 'main' branch found; worktrees branch from origin/main regardless."
fi

# (7) Verify the prerequisite has landed on origin/main.
#
#   Logical prerequisite : issue #1521 must already be merged into main.
#   Actual merge vehicle  : PR #1570 ("recompute hooks and one-shot backfill for
#                           listing quality [M28]") is the PR that actually landed
#                           the #1521 work — there is no PR literally numbered 1521.
#
# Happy path: confirm PR #1570 is MERGED into `main` and (where possible) that its
# merge/squash commit is reachable from origin/main, then proceed without prompting.
# If gh is unavailable or the lookup fails, fall back to a conservative git-log
# search for a "#1521" reference. If nothing verifies, the caller prompts (TTY) or
# stops; SKIP_1521_CHECK=1 remains the explicit escape hatch.
verify_1521() {
  local ok=0 state="" base="" mc="" head=""
  if [[ "$HAVE_GH" == "1" ]]; then
    if state="$(gh pr view 1570 --json state -q '.state' 2>/dev/null)" && [[ "$state" == "MERGED" ]]; then
      base="$(gh pr view 1570 --json baseRefName  -q '.baseRefName'    2>/dev/null || true)"
      mc="$(  gh pr view 1570 --json mergeCommit  -q '.mergeCommit.oid' 2>/dev/null || true)"
      head="$(gh pr view 1570 --json headRefName  -q '.headRefName'    2>/dev/null || true)"
      if [[ -z "$base" || "$base" == "main" ]]; then
        if [[ -n "$mc" ]] && git merge-base --is-ancestor "$mc" refs/remotes/origin/main 2>/dev/null; then
          ok=1
          log "gh: PR #1570 MERGED into ${base:-main} (head=${head:-?}); landing commit ${mc:0:12} reachable from origin/main → #1521 present."
        else
          ok=1
          log "gh: PR #1570 MERGED into ${base:-main} (head=${head:-?})${mc:+; landing commit ${mc:0:12} not locally reachable (fetch may be stale)} → #1521 present."
        fi
      else
        warn "gh: PR #1570 merged into '$base', not 'main' — not accepting as the #1521 landing."
      fi
    fi
  fi
  # Conservative fallback / corroboration: a direct #1521 reference in history.
  if [[ "$ok" -ne 1 ]]; then
    if git log refs/remotes/origin/main --oneline -n 400 | grep -Eq '#1521'; then
      ok=1
      log "git: found a #1521 reference in origin/main history."
    fi
  fi
  return $((ok ^ 1))
}

# Prerequisite (user-facing): #1521 must already be merged into main.
# (Implementation accepts its real merge vehicle, PR #1570 — see verify_1521.)
if [[ "$SKIP_1521_CHECK" == "1" ]]; then
  warn "SKIP_1521_CHECK=1 — skipping the #1521 prerequisite check (you asserted it is merged)."
elif verify_1521; then
  c_grn "  Prerequisite OK: issue #1521 is on origin/main (landed via PR #1570)."
else
  if [[ "$DRY_RUN" == "1" ]]; then
    warn "Could not verify #1521 is merged (dry-run: continuing)."
  elif [[ -t 0 ]]; then
    c_ylw "Could not verify issue #1521 is merged into origin/main (checked PR #1570 + git history)."
    read -r -p "  Proceed anyway? [y/N] " ans
    [[ "$ans" =~ ^[Yy]$ ]] || die "Aborted: #1521 not verified. Re-run after #1521 (PR #1570) merges, or set SKIP_1521_CHECK=1."
  else
    die "Could not verify #1521 is merged and no TTY to confirm. Re-run after #1521 (PR #1570) merges, or set SKIP_1521_CHECK=1."
  fi
fi

# --------------------------- worktree creation -----------------------------
hdr "Worktrees"

WORKTREE_ROOT="${WORKTREE_ROOT:-$REPO_ROOT/../udupi-property-explorer-worktrees}"
# Normalize parent dir to an absolute path for clean reporting.
WT_PARENT="$(dirname "$WORKTREE_ROOT")"
if [[ -d "$WT_PARENT" ]]; then
  WORKTREE_ROOT="$(cd "$WT_PARENT" && pwd)/$(basename "$WORKTREE_ROOT")"
fi
log "Worktree root: $WORKTREE_ROOT"
run mkdir -p "$WORKTREE_ROOT"

# Returns the path a branch is checked out at (empty if none).
branch_checkout_path() { # <branch>
  git worktree list --porcelain | awk -v b="refs/heads/$1" '
    /^worktree /  { path=substr($0,10) }
    /^branch /    { if ($2==b) { print path } }
  '
}

prepare_worktree() { # <issue> <branch> <dirname>
  local issue="$1" branch="$2" dir="$3"
  local path="$WORKTREE_ROOT/$dir"
  local existing_branch=""
  existing_branch="$(git rev-parse --verify --quiet "refs/heads/$branch" >/dev/null 2>&1 && echo yes || echo no)"

  if [[ -e "$path" ]]; then
    # Worktree path already exists — only reuse if clean AND on expected branch.
    if [[ "$DRY_RUN" == "1" ]]; then
      log "[dry-run] would inspect existing path $path for clean reuse."
      return 0
    fi
    git -C "$path" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
      || die "$path exists but is not a git worktree. Resolve manually."
    local cur dirty
    cur="$(git -C "$path" rev-parse --abbrev-ref HEAD)"
    dirty="$(git -C "$path" status --porcelain)"
    if [[ "$cur" != "$branch" ]]; then
      die "Worktree $path is on '$cur', expected '$branch'. Resolve manually (no auto-fix)."
    fi
    if [[ -n "$dirty" ]]; then
      die "Worktree $path is DIRTY. Will not reuse. Commit/stash or remove it yourself."
    fi
    c_grn "  Reusing clean worktree $path (on $branch)."
    return 0
  fi

  # Path does not exist yet.
  if [[ "$existing_branch" == "yes" ]]; then
    local where
    where="$(branch_checkout_path "$branch")"
    if [[ -n "$where" ]]; then
      die "Branch '$branch' is already checked out at $where but worktree $path is missing. Resolve manually."
    fi
    log "Branch '$branch' already exists — attaching a worktree to it (not resetting)."
    run git worktree add "$path" "$branch"
  else
    log "Creating branch '$branch' from origin/main."
    run git worktree add -b "$branch" "$path" "refs/remotes/origin/main"
  fi
}

for i in "${!ISSUES[@]}"; do
  prepare_worktree "${ISSUES[$i]}" "${BRANCHES[$i]}" "${DIRNAMES[$i]}"
done

# ------------------------------ tmux session -------------------------------
hdr "tmux session: $SESSION_NAME"

ensure_session() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '  [dry-run] tmux new-session -d -s %s -n %s\n' "$SESSION_NAME" "${WINDOWS[0]}"
    return 0
  fi
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    warn "tmux session '$SESSION_NAME' already exists — reusing it (no windows destroyed)."
  else
    tmux new-session -d -s "$SESSION_NAME" -n "${WINDOWS[0]}"
  fi
}

ensure_window() { # <index> <window-name>
  local idx="$1" win="$2"
  if [[ "$DRY_RUN" == "1" ]]; then
    [[ "$idx" -eq 0 ]] || printf '  [dry-run] tmux new-window -t %s -n %s\n' "$SESSION_NAME" "$win"
    return 0
  fi
  if tmux list-windows -t "$SESSION_NAME" -F '#W' 2>/dev/null | grep -Fxq "$win"; then
    warn "tmux window '$win' already exists — reusing."
  elif [[ "$idx" -eq 0 ]]; then
    tmux rename-window -t "$SESSION_NAME:0" "$win" 2>/dev/null || true
  else
    tmux new-window -t "$SESSION_NAME" -n "$win"
  fi
}

tmux_available=1
if ! has_cmd tmux && [[ "$DRY_RUN" != "1" ]]; then
  tmux_available=0
  warn "tmux unavailable — skipping session creation."
fi

if [[ "$tmux_available" == "1" ]]; then
  ensure_session
  for i in "${!ISSUES[@]}"; do
    issue="${ISSUES[$i]}"; branch="${BRANCHES[$i]}"; dir="${DIRNAMES[$i]}"
    win="${WINDOWS[$i]}"; scope="${SCOPES[$i]}"
    path="$WORKTREE_ROOT/$dir"

    ensure_window "$i" "$win"

    # cd into the worktree and print the briefing.
    tmux_send "$win" "cd $path"
    win_print "$win" "============================================================"
    win_print "$win" "  M28 Mode-3 job - issue #$issue"
    win_print "$win" "  Branch : $branch"
    win_print "$win" "  Scope  : $scope"
    win_print "$win" "  Worktree: $path"
    win_print "$win" "  Command : /mode3-run $issue"
    win_print "$win" "------------------------------------------------------------"
    win_print "$win" "  Common rules:"
    for rule in "${COMMON_RULES[@]}"; do
      win_print "$win" "    - $rule"
    done
    win_print "$win" "============================================================"

    if [[ "$AUTO_START" == "1" ]]; then
      log "AUTO_START: launching Claude in window '$win' for #$issue."
      tmux_send "$win" "$CLAUDE_CMD"
      # Give the CLI a moment to come up, then send scope + the /mode3-run cmd.
      if [[ "$DRY_RUN" != "1" ]]; then
        sleep 4
        tmux send-keys -t "${SESSION_NAME}:${win}" -- "$(scope_preamble "$issue")" C-m
        sleep 1
        tmux send-keys -t "${SESSION_NAME}:${win}" -- "/mode3-run $issue" C-m
      else
        printf '  [dry-run] (sleep 4) send scope preamble for #%s, then "/mode3-run %s"\n' "$issue" "$issue"
      fi
    else
      win_print "$win" "  (prepare-only) Start Claude here, then run: /mode3-run $issue"
    fi
  done
fi

# ------------------------------- summary -----------------------------------
hdr "Summary"
if [[ "$DRY_RUN" == "1" ]]; then
  c_ylw "DRY RUN — nothing was created. The actions above are what WOULD run."
fi

echo
echo "git worktree list:"
if [[ "$DRY_RUN" == "1" ]]; then
  printf '  [dry-run] git worktree list\n'
else
  git worktree list | sed 's/^/  /'
fi

echo
echo "tmux session : $SESSION_NAME"
echo "Worktree root: $WORKTREE_ROOT"
echo "Jobs:"
for i in "${!ISSUES[@]}"; do
  printf '  - #%s  %-34s  %s\n' "${ISSUES[$i]}" "${BRANCHES[$i]}" "$WORKTREE_ROOT/${DIRNAMES[$i]}"
done
echo
if [[ "$AUTO_START" == "1" ]]; then
  echo "Claude auto-started: YES (CLAUDE_CMD=\"$CLAUDE_CMD\"); /mode3-run submitted per window."
else
  echo "Claude auto-started: NO (prepare-only). Start it yourself in each window."
fi
echo
echo "Attach with:"
echo "  tmux attach -t $SESSION_NAME"
echo
c_grn "Done."
