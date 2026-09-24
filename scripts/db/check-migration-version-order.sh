#!/usr/bin/env bash
# scripts/db/check-migration-version-order.sh — #2686
#
# Durable pre-merge guard against the production Flyway ordering incident:
#
#   lane A fetches main, sees the highest migration is V141, allocates V142
#   lane B independently advances main first — its own migration lands as V143
#   lane A's V142 (chosen against a now-STALE base) merges afterward
#   -> production Flyway refuses startup:
#      "Detected resolved migration not applied to database: 142"
#
# The existing FlywayMigrationVersionUniquenessTest (#2272 regression guard,
# apps/api/src/test/java/com/example/realestate/migration/) scans ONE
# checkout for two files that declare the SAME version. It cannot see this
# incident shape at all: there is no filename collision — V142 and V143 are
# different files with different numbers. The defect is that V142 is LOWER
# than a version (V143) that fresh origin/main already carries by the time
# V142 actually merges. Detecting that requires comparing against fresh
# origin/main, not just the files already present in this branch's own
# checkout — which is exactly what a same-checkout test structurally cannot
# do (see FlywayV142V144OutOfOrderIT for the after-the-fact regression IT
# that reproduces the concrete 2026-09-23 incident this generalizes from).
#
# This script must be run twice, per the incident-prevention contract:
#   1. Before creating a new migration (informational — prints the next free
#      version against fresh main).
#   2. Immediately before merge/readiness (enforcing — exit non-zero blocks
#      the merge if another lane has since landed a higher version).
# A check run only at step 1 goes stale the moment another lane merges
# between step 1 and the actual merge — this is why the CI job
# (.github/workflows/ci.yml: migration-version-guard) runs step 2 on every
# PR sync, and why branch-protection's "require branches up to date before
# merging" setting matters: it forces this job to re-run against a fresh
# base immediately before merge is allowed, rather than trusting a run from
# whenever the PR was last pushed.
#
# Usage:
#   scripts/db/check-migration-version-order.sh [remote/branch]
#   (defaults to origin/main)
#
# Exit 0  = no ordering or duplicate-version violation found.
# Exit 1  = violation found; renumbering guidance is printed to stdout.
set -euo pipefail

# Resolve the repo root from the CALLER's working directory, not from where
# this script file physically lives — a worktree/lane running its own
# checkout must be checked against ITS tree, never silently redirected to
# whatever repo this file happens to be vendored from (see memory:
# agent-thread-bash-cwd-resets-between-calls / worktree-hazards-index for why
# that class of mistake is easy to make here).
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "[migration-version-guard] ERROR: not inside a git working tree (cwd: $(pwd))." >&2
  exit 2
}
MIGRATION_DIR="apps/api/src/main/resources/db/migration"
# Same convention as FlywayMigrationVersionUniquenessTest's VERSIONED_MIGRATION
# pattern: V<digits>(.<digits>)*__<description>.sql
VERSION_REGEX='^V([0-9]+(\.[0-9]+)*)__.*\.sql$'

cd "$REPO_ROOT"

BASE_REF="${1:-origin/main}"
REMOTE="${BASE_REF%%/*}"
BRANCH="${BASE_REF#*/}"

if [[ "$REMOTE" == "$BASE_REF" ]]; then
  echo "[migration-version-guard] ERROR: expected <remote>/<branch> (e.g. origin/main), got: $BASE_REF" >&2
  exit 2
fi

echo "[migration-version-guard] fetching fresh ${REMOTE}/${BRANCH} ..."
git fetch --quiet "$REMOTE" "refs/heads/${BRANCH}:refs/remotes/${REMOTE}/${BRANCH}" 2>/dev/null \
  || git fetch --quiet "$REMOTE" "$BRANCH"

# version_of <filename> -> dotted version string, or empty if not a versioned migration
version_of() {
  local name="$1"
  if [[ "$name" =~ $VERSION_REGEX ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

# version_cmp <a> <b> -> echoes -1, 0, or 1. Numeric per dotted segment
# (handles "0.1" style versions and leading zeros without octal misparsing).
version_cmp() {
  local a="$1" b="$2"
  local -a A B
  IFS='.' read -r -a A <<< "$a"
  IFS='.' read -r -a B <<< "$b"
  local max=${#A[@]}
  (( ${#B[@]} > max )) && max=${#B[@]}
  local i x y
  for ((i = 0; i < max; i++)); do
    x="${A[i]:-0}"; y="${B[i]:-0}"
    x=$((10#$x)); y=$((10#$y))
    if (( x < y )); then echo -1; return; fi
    if (( x > y )); then echo 1; return; fi
  done
  echo 0
}

# list_versioned_files_at_ref <git-ref> -> versioned migration basenames at that ref
list_versioned_files_at_ref() {
  local ref="$1"
  git ls-tree -r --name-only "$ref" -- "$MIGRATION_DIR" 2>/dev/null \
    | xargs -r -n1 basename 2>/dev/null \
    | grep -E "$VERSION_REGEX" || true
}

fresh_main_files="$(list_versioned_files_at_ref "${REMOTE}/${BRANCH}")"
local_files="$(list_versioned_files_at_ref HEAD)"

if [[ -z "$local_files" ]]; then
  echo "[migration-version-guard] no versioned migration files found under $MIGRATION_DIR at HEAD — nothing to check."
  exit 0
fi

# --- 1) Duplicate-version check across this branch's own migration set. ---
# (Belt-and-braces alongside FlywayMigrationVersionUniquenessTest — this is
# the check that runs pre-merge against exactly what is about to land.)
# Deliberately avoids `declare -A` (bash 3.2, macOS's default /bin/bash, has
# no associative arrays) — sorts "<version>\t<filename>" pairs instead so
# duplicates land on adjacent lines.
version_filename_pairs=""
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  v="$(version_of "$f")"
  [[ -z "$v" ]] && continue
  version_filename_pairs+="${v}"$'\t'"${f}"$'\n'
done <<< "$local_files"
version_filename_pairs="$(printf '%s' "$version_filename_pairs" | sort)"

dup_report=()
prev_v=""
prev_f=""
while IFS=$'\t' read -r v f; do
  [[ -z "$v" ]] && continue
  if [[ "$v" == "$prev_v" ]]; then
    dup_report+=("V${v} -> ${prev_f}, ${f}")
  fi
  prev_v="$v"
  prev_f="$f"
done <<< "$version_filename_pairs"

if [[ ${#dup_report[@]} -gt 0 ]]; then
  echo "[migration-version-guard] FAIL — duplicate Flyway version(s) in this branch's migration set:"
  printf '  %s\n' "${dup_report[@]}"
  exit 1
fi

# --- 2) Determine fresh remote's highest version. ---
fresh_max=""
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  v="$(version_of "$f")"
  [[ -z "$v" ]] && continue
  if [[ -z "$fresh_max" ]] || [[ "$(version_cmp "$v" "$fresh_max")" == "1" ]]; then
    fresh_max="$v"
  fi
done <<< "$fresh_main_files"

if [[ -z "$fresh_max" ]]; then
  echo "[migration-version-guard] WARNING — no versioned migrations found on ${REMOTE}/${BRANCH}; skipping ordering check (nothing to compare against)."
  exit 0
fi

# --- 3) Migration files new on this branch (by filename, absent from fresh remote). ---
new_files=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if ! grep -qxF "$f" <<< "$fresh_main_files"; then
    new_files+=("$f")
  fi
done <<< "$local_files"

if [[ ${#new_files[@]} -eq 0 ]]; then
  echo "[migration-version-guard] OK — no new migration files relative to fresh ${REMOTE}/${BRANCH}; nothing to order-check."
  exit 0
fi

# --- 4) Every new file's version must be strictly GREATER than fresh max. ---
violations=()
for f in "${new_files[@]}"; do
  v="$(version_of "$f")"
  cmp="$(version_cmp "$v" "$fresh_max")"
  if [[ "$cmp" != "1" ]]; then
    violations+=("$f (V${v}) is not greater than fresh ${REMOTE}/${BRANCH}'s highest V${fresh_max}")
  fi
done

if [[ ${#violations[@]} -gt 0 ]]; then
  next_major="$(( ${fresh_max%%.*} + 1 ))"
  echo "[migration-version-guard] FAIL — this branch's migration version(s) are stale against fresh ${REMOTE}/${BRANCH}:"
  printf '  %s\n' "${violations[@]}"
  echo ""
  echo "  Fresh ${REMOTE}/${BRANCH} highest migration version is V${fresh_max}."
  echo "  Renumber the file(s) above to V${next_major} (or higher, keeping every version unique"
  echo "  and strictly increasing), re-run this script, and re-run migration tests before merging."
  echo ""
  echo "  This is the #2686 incident shape: this branch chose a version against a base"
  echo "  that another lane has since advanced past. Do NOT merge as-is."
  exit 1
fi

echo "[migration-version-guard] OK — new migration(s) [${new_files[*]}] are all newer than fresh ${REMOTE}/${BRANCH}'s highest V${fresh_max}."
exit 0
