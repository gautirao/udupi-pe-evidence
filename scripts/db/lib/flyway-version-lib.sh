#!/usr/bin/env bash
# scripts/db/lib/flyway-version-lib.sh — #2686
#
# Pure(ish), sourceable helpers shared by:
#   - scripts/db/check-migration-version-order.sh   (checkpoint 2: pre-merge ENFORCEMENT)
#   - scripts/db/next-migration-version.sh           (checkpoint 1: pre-authoring ADVISORY)
# split out on the same pattern as scripts/dev/lib/pre-push-classify.sh, so
# the version-parsing/comparison logic has exactly one implementation and can
# be exercised directly by scripts/dev/tests/flyway-version-lib.test.sh.
#
# Deliberately bash-3.2 compatible (macOS's default /bin/bash) — no
# `declare -A`, no GNU-only flags (see the `xargs -r` incident this file's
# `list_versioned_files_at_ref` fixes: BSD xargs has no `-r`/--no-run-if-empty,
# so a script that relied on it silently returned zero files on every macOS
# run, making the guard a permanent no-op there — caught in code review for
# #2686, never in CI, because CI only runs Linux/GNU xargs).
#
# Not meant to be executed directly — `source` this file.

# Flyway's own versioned-migration filename convention: V<version>__<description>.sql
# <version> may contain digits and dots (e.g. "126", "0.1") — same pattern
# FlywayMigrationVersionUniquenessTest.java's VERSIONED_MIGRATION regex uses.
FLYWAY_VERSION_REGEX='^V([0-9]+(\.[0-9]+)*)__.*\.sql$'

# version_of <filename> -> the raw dotted version string, or empty if the
# filename doesn't match Flyway's versioned-migration convention.
version_of() {
  local name="$1"
  if [[ "$name" =~ $FLYWAY_VERSION_REGEX ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

# normalize_version <dotted-version> -> the same version with leading zeros
# stripped from every segment (e.g. "001" -> "1", "1.05" -> "1.5"). Flyway
# treats V001 and V1 as the SAME version; comparing/grouping on the raw
# string misses that (qa-fast HIGH-4 finding). Only used for equality
# grouping (duplicate detection) — ordering comparisons go through
# version_cmp, which already casts with base-10 (`10#$x`) and doesn't need
# this.
normalize_version() {
  local v="$1"
  local -a parts
  IFS='.' read -r -a parts <<< "$v"
  local out="" seg n
  for seg in "${parts[@]}"; do
    n=$((10#$seg))
    if [[ -z "$out" ]]; then out="$n"; else out="${out}.${n}"; fi
  done
  printf '%s' "$out"
}

# version_cmp <a> <b> -> echoes -1, 0, or 1. Numeric, per dotted segment —
# NOT lexicographic (qa-fast CRITICAL-1: bash's `[[ "1.9" < "1.10" ]]` is
# lexicographic and wrongly says true; Flyway orders 1.10 after 1.9). Missing
# trailing segments are treated as 0, so "1" and "1.0" compare equal.
# Base-10 casts (`10#$x`) avoid bash's octal misparse of leading-zero
# segments like "08".
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

# next_version_after <dotted-version> -> the next free INTEGER version after
# the given one, i.e. floor(major-component) + 1. Matches this repo's own
# existing convention (plain integer versions — V126, V127, ... — see e.g.
# the historical "next free version is V88" / "V92" / "V130" notes recorded
# in .claude/openai-gates/**/input-packet.toml); a dotted patch version
# (V0.1) is treated as belonging under its major integer, consistent with
# how the codebase has always allocated new top-level versions.
next_version_after() {
  local v="$1"
  echo $(( ${v%%.*} + 1 ))
}

# fetch_ref_fail_closed <remote> <branch> -> fetches <branch> from <remote>
# into refs/remotes/<remote>/<branch> (the ref every caller reads afterward).
# Fails LOUDLY (non-zero exit, stderr visible) on any fetch error rather than
# silently falling back to a form that updates only FETCH_HEAD — a prior
# version of this script had a fallback fetch with no `:dest` refspec, which
# left the tracking ref stale on failure while swallowing the primary
# fetch's stderr; the script then proceeded under `set -e` comparing against
# a stale base with zero warning, reproducing the exact #2686 incident shape
# INSIDE the guard meant to prevent it (code review BLOCKING-2 for #2686).
# Fail-closed is the correct behavior for a merge gate: if we cannot fetch a
# fresh base, we must not silently compare against a stale one.
fetch_ref_fail_closed() {
  local remote="$1" branch="$2"
  if ! git fetch "$remote" "refs/heads/${branch}:refs/remotes/${remote}/${branch}"; then
    echo "[flyway-version-lib] ERROR: git fetch of ${remote}/${branch} failed." >&2
    echo "  Refusing to compare against a possibly-stale ref — fix connectivity/auth and retry." >&2
    return 1
  fi
}

# list_versioned_files_at_ref <git-ref> <migration-dir> -> newline-separated
# versioned migration basenames present at that ref's tree, or nothing if
# the directory doesn't exist there. Does NOT require `xargs -r`/BSD-xargs
# support (the bug this file's header documents) — loops instead.
list_versioned_files_at_ref() {
  local ref="$1" dir="$2" path
  git ls-tree -r --name-only "$ref" -- "$dir" 2>/dev/null | while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    basename "$path"
  done | grep -E "$FLYWAY_VERSION_REGEX" || true
}

# migration_dir_exists_at_ref <git-ref> <migration-dir> -> exit 0 if the
# directory is a real tree object at that ref, exit 1 otherwise. Lets callers
# fail explicitly (qa-fast MEDIUM-7) on a misconfigured path instead of
# silently treating "directory missing" the same as "directory present but
# empty".
migration_dir_exists_at_ref() {
  local ref="$1" dir="$2"
  git cat-file -e "${ref}:${dir}" 2>/dev/null
}

# max_version_of <newline-separated versioned filenames> -> the highest
# dotted version among them (numeric compare via version_cmp), or empty if
# the list is empty.
max_version_of() {
  local files="$1" f v max=""
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    v="$(version_of "$f")"
    [[ -z "$v" ]] && continue
    if [[ -z "$max" ]] || [[ "$(version_cmp "$v" "$max")" == "1" ]]; then
      max="$v"
    fi
  done <<< "$files"
  printf '%s' "$max"
}
