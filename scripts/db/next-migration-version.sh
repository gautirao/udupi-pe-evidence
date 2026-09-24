#!/usr/bin/env bash
# scripts/db/next-migration-version.sh — #2686
#
# Checkpoint 1 (ADVISORY) of the #2686 incident-prevention workflow.
# Companion to scripts/db/check-migration-version-order.sh (checkpoint 2,
# enforcing).
#
# Run this BEFORE creating a new Flyway migration file. It fetches fresh
# origin/main and prints the next free version number. It does NOT gate
# anything by itself — nothing stops a developer or agent from ignoring its
# output and hand-picking a number anyway. Its job is to make the correct
# behavior (fetch fresh, then allocate) the path of least resistance, not to
# enforce it — check-migration-version-order.sh (wired into CI as
# `migration-version-guard`) is the actual backstop, and catches a stale
# choice regardless of whether this helper was consulted at all.
#
# This matters because a number allocated here can still go stale: if
# another lane lands a migration between running this script and this
# branch actually merging, the enforcing check at merge time is what catches
# it — not this one. Re-run this (or just re-check with
# check-migration-version-order.sh) immediately before merge, not only when
# the migration file is first created.
#
# Usage:
#   scripts/db/next-migration-version.sh [remote/branch]
#   (defaults to origin/main)
#
# Exit 0 on success (prints the next free version to stdout).
# Exit 2 on a usage/environment error (not a git repo, fetch failed, missing
# migration directory) — fails closed rather than guessing.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "[next-migration-version] ERROR: not inside a git working tree (cwd: $(pwd))." >&2
  exit 2
}
cd "$REPO_ROOT"

MIGRATION_DIR="apps/api/src/main/resources/db/migration"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/flyway-version-lib.sh
source "$SCRIPT_DIR/lib/flyway-version-lib.sh"

BASE_REF="${1:-origin/main}"
REMOTE="${BASE_REF%%/*}"
BRANCH="${BASE_REF#*/}"

if [[ "$REMOTE" == "$BASE_REF" ]]; then
  echo "[next-migration-version] ERROR: expected <remote>/<branch> (e.g. origin/main), got: $BASE_REF" >&2
  exit 2
fi

echo "[next-migration-version] fetching fresh ${REMOTE}/${BRANCH} ..." >&2
fetch_ref_fail_closed "$REMOTE" "$BRANCH" || exit 2

if ! migration_dir_exists_at_ref "${REMOTE}/${BRANCH}" "$MIGRATION_DIR"; then
  echo "[next-migration-version] ERROR: $MIGRATION_DIR does not exist at fresh ${REMOTE}/${BRANCH}." >&2
  exit 2
fi

fresh_main_files="$(list_versioned_files_at_ref "${REMOTE}/${BRANCH}" "$MIGRATION_DIR")"
fresh_max="$(max_version_of "$fresh_main_files")"

if [[ -z "$fresh_max" ]]; then
  echo "[next-migration-version] ERROR: no versioned migrations found on ${REMOTE}/${BRANCH} under $MIGRATION_DIR." >&2
  exit 2
fi

next_free="$(next_version_after "$fresh_max")"

echo "[next-migration-version] fresh ${REMOTE}/${BRANCH} highest migration version is V${fresh_max}." >&2
echo "[next-migration-version] next free version: V${next_free}" >&2
echo "" >&2
echo "  This is a snapshot, not a reservation — if another lane lands a migration" >&2
echo "  between now and when this branch merges, V${next_free} can go stale." >&2
echo "  Re-run scripts/db/check-migration-version-order.sh immediately before" >&2
echo "  merge/readiness; it will force a renumber if that happens." >&2
echo "" >&2

# Print the bare number to stdout so this composes in scripts, e.g.:
#   V="$(scripts/db/next-migration-version.sh)"; touch "apps/api/src/main/resources/db/migration/V${V}__my_change.sql"
printf '%s\n' "$next_free"
exit 0
