#!/usr/bin/env bash
# scripts/dev/lib/repo-resolution.sh — resolve the SHARED (main) checkout of a
# git repository from git metadata, never from where a script file lives (#2551).
#
# WHY THIS EXISTS
# ---------------
# scripts/dev-worktree-stack.sh used to compute the main repo as
#
#     MAIN_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
#
# The script is a TRACKED file, so it exists in every worktree checkout. Running
# `<worktree>/scripts/dev-worktree-stack.sh` therefore resolved MAIN_REPO to the
# WORKTREE ITSELF. The script then looked for the shared env files inside the
# worktree, did not find them, and printed
#
#     --  .env not present in main repo, skipping
#
# for files that were sitting in the primary checkout the whole time. Nothing
# failed; the stack came up without its shared configuration and the operator
# had been told, in so many words, that the main repo did not have them.
#
# A path-location heuristic cannot tell these two invocations apart. Git can:
# it records the relationship explicitly. So ask git, and if git cannot answer,
# FAIL LOUDLY rather than guess — an absence claim about the main repo is only
# worth making once you have actually established what the main repo is.
#
# Deliberately NOT used here: directory-naming conventions ("*-worktrees/*"),
# upward walks looking for a known repo name, or $PWD. All three are wrong the
# moment someone checks the repo out somewhere unexpected.
#
# Not executable on its own — source it:  source ".../repo-resolution.sh"

# Absolute, symlink-resolved path of the git COMMON directory (the one shared
# by the main checkout and every linked worktree) as seen from $1.
#
# `git rev-parse --git-common-dir` may print a path relative to git's working
# directory, which is $1 here because of `-C`. Normalise both shapes; do not
# assume absolute (`--path-format=absolute` needs git >= 2.31, and this must
# work on whatever git the operator has).
resolve_git_common_dir() {
  local at="${1:-}" common
  [[ -n "$at" ]] || return 1
  common="$(git -C "$at" rev-parse --git-common-dir 2>/dev/null)" || return 1
  [[ -n "$common" ]] || return 1
  [[ "$common" == /* ]] || common="$at/$common"
  (cd "$common" 2>/dev/null && pwd -P)
}

# Print the absolute path of the MAIN working tree of the repository that
# contains $1 (a worktree root, or any directory inside the repo).
#
# Returns 0 and prints the path on success. Returns non-zero and explains on
# stderr when the relationship cannot be established from git metadata — a bare
# repository, a path outside any repository, a main working tree that has been
# moved or deleted, or a reference path whose repository does not match the
# resolved root. Callers MUST treat a non-zero return as fatal.
resolve_main_repo() {
  local ref="${1:-}"
  local porcelain line first_worktree="" saw_bare=0
  local main_root ref_common main_common

  if [[ -z "$ref" ]]; then
    printf 'resolve_main_repo: a reference path is required\n' >&2
    return 1
  fi
  if [[ ! -d "$ref" ]]; then
    printf 'resolve_main_repo: %s is not an existing directory\n' "$ref" >&2
    return 1
  fi
  if ! git -C "$ref" rev-parse --git-dir >/dev/null 2>&1; then
    printf 'resolve_main_repo: %s is not inside a git repository\n' "$ref" >&2
    return 1
  fi

  # git-worktree(1): "The main worktree is listed first." The first porcelain
  # record is therefore the shared checkout, regardless of which worktree is
  # asking or where the asking script file happens to live on disk.
  if ! porcelain="$(git -C "$ref" worktree list --porcelain 2>/dev/null)"; then
    printf 'resolve_main_repo: `git worktree list` failed for %s\n' "$ref" >&2
    return 1
  fi

  # Read the FIRST record only — records are separated by a blank line.
  while IFS= read -r line; do
    [[ -n "$line" ]] || break
    case "$line" in
      "worktree "*) first_worktree="${line#worktree }" ;;
      bare)         saw_bare=1 ;;
    esac
  done <<< "$porcelain"

  if [[ -z "$first_worktree" ]]; then
    printf 'resolve_main_repo: git reported no worktrees for %s\n' "$ref" >&2
    return 1
  fi
  if [[ "$saw_bare" -eq 1 ]]; then
    printf 'resolve_main_repo: the main entry (%s) is a BARE repository — it has no working tree, so there is no shared checkout to read env files from\n' \
      "$first_worktree" >&2
    return 1
  fi
  if [[ ! -d "$first_worktree" ]]; then
    printf 'resolve_main_repo: git records the main working tree as %s, but that directory does not exist (moved or deleted?)\n' \
      "$first_worktree" >&2
    return 1
  fi

  main_root="$(cd "$first_worktree" 2>/dev/null && pwd -P)" || {
    printf 'resolve_main_repo: cannot enter the recorded main working tree %s\n' "$first_worktree" >&2
    return 1
  }

  # Defence in depth: prove via a SECOND, independent git mechanism that the
  # resolved root really shares a repository with the reference path. Catches a
  # stale/relocated gitdir pointer, which would otherwise hand back a perfectly
  # plausible directory belonging to a different repo.
  ref_common="$(resolve_git_common_dir "$ref")" || {
    printf 'resolve_main_repo: cannot resolve the git common dir for %s\n' "$ref" >&2
    return 1
  }
  main_common="$(resolve_git_common_dir "$main_root")" || {
    printf 'resolve_main_repo: cannot resolve the git common dir for %s\n' "$main_root" >&2
    return 1
  }
  if [[ "$ref_common" != "$main_common" ]]; then
    printf 'resolve_main_repo: %s resolved to main working tree %s, but they do not share a git directory (%s vs %s)\n' \
      "$ref" "$main_root" "$ref_common" "$main_common" >&2
    return 1
  fi

  printf '%s\n' "$main_root"
}
