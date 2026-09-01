#!/usr/bin/env python3
"""
Shared git-target resolution for Mode-3 verification scripts.

Mode-3 workers execute inside a dedicated git worktree
(.claude/handoffs/issue-<N>/ artefacts are gitignored runtime state and live
ONLY in the main repo checkout, never materialized in a fresh worktree
checkout). verify-mode3-workdone.py and verify-mode3-gate-receipts.py both
need to know, independently of the process's current working directory:

  1. Where the .claude/handoffs/issue-<N>/ artefacts live (--repo, always the
     main repo checkout in Mode-3 worktree runs).
  2. Which git checkout's HEAD/diff/commits are actually being validated
     (--worktree, the worker's dedicated worktree).

These two concerns are decoupled on purpose: artefact discovery must never
be inferred from git target discovery (or vice versa), so a caller can
validate a worktree's commits against a handoff that lives in a completely
different checkout, with no symlinks and no chdir.
"""

import subprocess
import sys
from pathlib import Path
from typing import List, Tuple


def add_target_args(parser) -> None:
    """Register --repo/--worktree on an argparse parser.

    Both default to CWD (backward compatible with the pre-#2283 bare
    subprocess.run() behaviour when the caller doesn't pass either flag).
    """
    parser.add_argument(
        "--repo",
        default=".",
        help="Path to the repo checkout that owns .claude/handoffs/issue-<N>/ "
             "artefacts (default: CWD). Always the main repo checkout in "
             "Mode-3 worktree runs.",
    )
    parser.add_argument(
        "--worktree",
        default=None,
        help="Path to the git worktree/checkout whose HEAD is being "
             "validated (default: same as --repo). Set this explicitly "
             "when validating a Mode-3 worker's dedicated worktree from "
             "the main repo checkout.",
    )


def resolve_target(args) -> Tuple[Path, Path]:
    """Resolve (repo_path, worktree_path) from parsed args.

    Fails loudly (sys.exit, non-zero) if either path doesn't exist. When
    --worktree is EXPLICITLY passed, it must also resolve to a real git work
    tree -- never silently fall back to CWD once a target has been
    explicitly requested. When --worktree is omitted (implicit default of
    --repo, itself defaulting to CWD), git-work-tree-ness is NOT
    pre-validated here -- this preserves the pre-#2283 behaviour where
    callers' own downstream git checks (e.g. check_scope_lock's
    "not a git repository" skip) handle a non-git CWD gracefully instead of
    hard-failing before any check runs.
    """
    repo_path = Path(args.repo).resolve()
    if not repo_path.is_dir():
        sys.exit(f"FATAL: --repo path does not exist or is not a directory: {repo_path}")

    worktree_explicit = args.worktree is not None
    worktree_arg = args.worktree if worktree_explicit else args.repo
    worktree_path = Path(worktree_arg).resolve()
    if not worktree_path.is_dir():
        sys.exit(f"FATAL: --worktree path does not exist or is not a directory: {worktree_path}")

    if worktree_explicit:
        try:
            check = subprocess.run(
                ["git", "-C", str(worktree_path), "rev-parse", "--is-inside-work-tree"],
                capture_output=True, text=True, timeout=10,
            )
        except (OSError, subprocess.SubprocessError) as e:
            sys.exit(f"FATAL: could not invoke git against --worktree {worktree_path}: {e}")

        if check.returncode != 0 or check.stdout.strip() != "true":
            sys.exit(
                f"FATAL: --worktree path is not a git work tree: {worktree_path}\n"
                f"git stderr: {check.stderr.strip()}"
            )

    return repo_path, worktree_path


def run_git(worktree_path: Path, git_args: List[str], timeout: int = 10) -> subprocess.CompletedProcess:
    """Run a git command scoped to worktree_path via `git -C` -- never a bare
    CWD-relative subprocess.run(['git', ...])."""
    return subprocess.run(
        ["git", "-C", str(worktree_path), *git_args],
        capture_output=True, text=True, timeout=timeout,
    )
