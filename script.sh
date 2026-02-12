set -euo pipefail

BASE_BRANCH="feature/convert-to-java-microservices"
WT_DIR="../worktrees"

echo "==> Updating base branch: $BASE_BRANCH"
git switch "$BASE_BRANCH"
git fetch origin
git pull --ff-only

echo "==> Pruning stale worktree metadata"
git worktree prune

echo "==> Ensuring worktree directory exists: $WT_DIR"
mkdir -p "$WT_DIR"

create_wt () {
  local branch="$1"
  local dir="$2"

  if [ -d "$dir" ]; then
    echo "==> Removing existing directory: $dir"
    git worktree remove --force "$dir" || true
    rm -rf "$dir" || true
  fi

  if git show-ref --verify --quiet "refs/heads/$branch"; then
    echo "==> Deleting existing local branch: $branch"
    git branch -D "$branch" || true
  fi

  echo "==> Creating worktree $dir on branch $branch"
  git worktree add -b "$branch" "$dir" "$BASE_BRANCH"
}

create_wt "pr-dashboard-area-insights"      "$WT_DIR/pr-dashboard-area-insights"
create_wt "pr-dashboard-map-listings"       "$WT_DIR/pr-dashboard-map-listings"
create_wt "pr-dashboard-opportunity-finder" "$WT_DIR/pr-dashboard-opportunity-finder"

echo "==> Done. Active worktrees:"
git worktree list

