#!/usr/bin/env python3
"""
Tests for mode3_git_target.py and its --repo/--worktree wiring into
verify-mode3-workdone.py (check_scope_lock) and
verify-mode3-gate-receipts.py (git_changed_files_since / reviewed-commit
freshness). (#2283)

Before #2283 both verifier scripts ran bare CWD-relative `git diff`/`git
rev-parse` calls, so validating a Mode-3 worker's dedicated git worktree
from the main repo checkout (where `.claude/handoffs/issue-<N>/` artefacts
live) silently checked the WRONG checkout's git state -- a scope violation
committed only in the worker's worktree would vacuously pass because the
verifier's `git diff` ran against the main checkout, which never saw the
violating commit.

Coverage:
 1. main checkout only (no --worktree) -- resolves to CWD-equivalent default
 2. separate worktree with a changed file -- verifier sees the worktree's
    diff, not the main checkout's
 3. CRITICAL -- scope violation committed ONLY in the worktree ->
    check_scope_lock must FAIL (the exact case the old bug passed vacuously)
 4. clean in-scope change in worktree -> check_scope_lock passes
 5. reviewed-commit freshness -- a commit added after reviewed_commit in the
    worktree is detected as "changed files since"
 6. --worktree pointing at a nonexistent / non-git path -> exits non-zero
    with a clear error, never silently falls back
 7. handoff artefacts in --repo, git target in a different --worktree,
    zero symlinks between the two
"""

import argparse
import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_DIR))

import mode3_git_target as gt  # noqa: E402


def _load_module(filename: str, modname: str):
    path = SCRIPTS_DIR / filename
    spec = importlib.util.spec_from_file_location(modname, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


workdone_mod = _load_module("verify-mode3-workdone.py", "_verify_mode3_workdone_test_target")
gate_mod = _load_module("verify-mode3-gate-receipts.py", "_verify_mode3_gate_receipts_test_target")


def git(cwd: Path, *args):
    r = subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True, timeout=20)
    assert r.returncode == 0, f"git {args} failed: {r.stderr}"
    return r.stdout.strip()


def init_repo(root: Path, branch: str = "main"):
    root.mkdir(parents=True, exist_ok=True)
    git(root, "init", "-q", "-b", branch)
    git(root, "config", "user.email", "test@example.com")
    git(root, "config", "user.name", "Test")
    (root / "README.md").write_text("init\n")
    git(root, "add", "README.md")
    git(root, "commit", "-q", "-m", "init")


class _Args:
    def __init__(self, repo=".", worktree=None):
        self.repo = repo
        self.worktree = worktree


# --------------------------------------------------------------------------- #
# 1. main checkout only -- no --worktree passed
# --------------------------------------------------------------------------- #

def test_add_target_args_defaults():
    parser = argparse.ArgumentParser()
    gt.add_target_args(parser)
    args = parser.parse_args([])
    assert args.repo == "."
    assert args.worktree is None


def test_resolve_target_default_no_worktree(tmp_path):
    init_repo(tmp_path)
    repo_path, worktree_path = gt.resolve_target(_Args(repo=str(tmp_path)))
    assert repo_path == tmp_path.resolve()
    assert worktree_path == tmp_path.resolve()


def test_run_git_uses_dash_c_worktree_path(tmp_path):
    init_repo(tmp_path)
    result = gt.run_git(tmp_path, ["rev-parse", "--is-inside-work-tree"])
    assert result.returncode == 0
    assert result.stdout.strip() == "true"


# --------------------------------------------------------------------------- #
# 2. separate worktree with a changed file -- verifier sees the worktree's
#    diff, not the main checkout's
# --------------------------------------------------------------------------- #

def test_check_scope_lock_sees_worktree_diff_not_main(tmp_path):
    main_root = tmp_path / "main"
    init_repo(main_root)
    worktree_root = tmp_path / "wt"
    git(main_root, "worktree", "add", "-q", str(worktree_root), "-b", "feature")

    (worktree_root / "src.txt").write_text("wt change\n")
    git(worktree_root, "add", "src.txt")
    git(worktree_root, "commit", "-q", "-m", "wt change")

    handoff_path = main_root / "approved-execution-handoff.toml"
    handoff_path.write_text('[executor]\nallowed_file_globs = ["**"]\nforbidden_globs = []\n')

    pass_wt, _details_wt, changed_wt, _viol_wt = workdone_mod.check_scope_lock(
        "main", 8888, handoff_path, worktree_root
    )
    assert pass_wt is True
    assert "src.txt" in changed_wt

    # Against the main checkout itself: nothing was committed there.
    _pass_main, _details_main, changed_main, _viol_main = workdone_mod.check_scope_lock(
        "main", 8888, handoff_path, main_root
    )
    assert changed_main == []


# --------------------------------------------------------------------------- #
# 3. CRITICAL -- scope violation committed ONLY in the worktree
# --------------------------------------------------------------------------- #

def test_check_scope_lock_worktree_only_violation_fails(tmp_path):
    main_root = tmp_path / "main"
    init_repo(main_root)
    worktree_root = tmp_path / "wt"
    git(main_root, "worktree", "add", "-q", str(worktree_root), "-b", "feature")

    secret = worktree_root / "secrets" / "leak.txt"
    secret.parent.mkdir(parents=True)
    secret.write_text("leaked\n")
    git(worktree_root, "add", "secrets/leak.txt")
    git(worktree_root, "commit", "-q", "-m", "oops")

    handoff_path = main_root / "approved-execution-handoff.toml"
    handoff_path.write_text(
        '[executor]\nallowed_file_globs = ["src/**"]\nforbidden_globs = ["secrets/**"]\n'
    )

    ok, _details, _changed, violations = workdone_mod.check_scope_lock(
        "main", 8889, handoff_path, worktree_root
    )
    assert ok is False
    assert "secrets/leak.txt" in violations

    # The old CWD-relative bug: validating against the main checkout (which
    # never saw the violating commit) must NOT surface any violation --
    # proving the fix is what makes the worktree-scoped check meaningful.
    ok_main, _details_main, changed_main, violations_main = workdone_mod.check_scope_lock(
        "main", 8889, handoff_path, main_root
    )
    assert changed_main == []
    assert violations_main == []
    assert ok_main is True


# --------------------------------------------------------------------------- #
# 4. clean in-scope change in worktree -> passes
# --------------------------------------------------------------------------- #

def test_check_scope_lock_in_scope_change_passes(tmp_path):
    main_root = tmp_path / "main"
    init_repo(main_root)
    worktree_root = tmp_path / "wt"
    git(main_root, "worktree", "add", "-q", str(worktree_root), "-b", "feature")

    src = worktree_root / "src" / "app.py"
    src.parent.mkdir(parents=True)
    src.write_text("print('ok')\n")
    git(worktree_root, "add", "src/app.py")
    git(worktree_root, "commit", "-q", "-m", "add app")

    handoff_path = main_root / "approved-execution-handoff.toml"
    handoff_path.write_text(
        '[executor]\nallowed_file_globs = ["src/**"]\nforbidden_globs = ["**/secrets/**"]\n'
    )

    ok, _details, changed, violations = workdone_mod.check_scope_lock(
        "main", 8890, handoff_path, worktree_root
    )
    assert ok is True
    assert changed == ["src/app.py"]
    assert violations == []


# --------------------------------------------------------------------------- #
# 5. reviewed-commit freshness -- a commit added after reviewed_commit in
#    the worktree must be detected as "changed files since"
# --------------------------------------------------------------------------- #

def test_git_changed_files_since_detects_worktree_only_commit(tmp_path):
    main_root = tmp_path / "main"
    init_repo(main_root)
    reviewed_commit = git(main_root, "rev-parse", "HEAD")

    worktree_root = tmp_path / "wt"
    git(main_root, "worktree", "add", "-q", str(worktree_root), "-b", "feature")

    (worktree_root / "changed.txt").write_text("new\n")
    git(worktree_root, "add", "changed.txt")
    git(worktree_root, "commit", "-q", "-m", "post-review change")

    assert gate_mod.git_commit_resolvable(worktree_root, reviewed_commit) is True
    changed_wt = gate_mod.git_changed_files_since(worktree_root, reviewed_commit)
    assert changed_wt == ["changed.txt"]

    # Main checkout's own HEAD never moved -- nothing changed since reviewed_commit there.
    changed_main = gate_mod.git_changed_files_since(main_root, reviewed_commit)
    assert changed_main == []


# --------------------------------------------------------------------------- #
# 6. --worktree pointing at a nonexistent / non-git path -> exits non-zero
# --------------------------------------------------------------------------- #

def test_resolve_target_nonexistent_worktree_exits_nonzero(tmp_path):
    init_repo(tmp_path)
    nonexistent = tmp_path / "does-not-exist"
    with pytest.raises(SystemExit) as exc_info:
        gt.resolve_target(_Args(repo=str(tmp_path), worktree=str(nonexistent)))
    assert "does not exist" in str(exc_info.value.code)


def test_resolve_target_worktree_not_git_repo_exits_nonzero(tmp_path):
    repo_root = tmp_path / "repo"
    init_repo(repo_root)
    not_git = tmp_path / "plain-dir"
    not_git.mkdir()
    with pytest.raises(SystemExit) as exc_info:
        gt.resolve_target(_Args(repo=str(repo_root), worktree=str(not_git)))
    assert "not a git work tree" in str(exc_info.value.code)


# --------------------------------------------------------------------------- #
# 7. handoff artefacts in --repo, git target in a different --worktree,
#    zero symlinks between the two
# --------------------------------------------------------------------------- #

def test_workdone_cli_repo_and_worktree_are_independent_dirs_no_symlinks(tmp_path):
    repo_dir = tmp_path / "repo"
    handoff_dir = repo_dir / ".claude" / "handoffs" / "issue-7777"
    handoff_dir.mkdir(parents=True)
    handoff_path = handoff_dir / "approved-execution-handoff.toml"
    handoff_path.write_text('[executor]\nallowed_file_globs = ["**"]\nforbidden_globs = []\n')

    worktree_dir = tmp_path / "worktree"
    init_repo(worktree_dir)

    assert not (repo_dir / ".git").exists()
    assert not any(p.is_symlink() for p in tmp_path.rglob("*"))

    cmd = [
        sys.executable, str(SCRIPTS_DIR / "verify-mode3-workdone.py"),
        "--issue", "7777", "--base", "main",
        "--repo", str(repo_dir), "--worktree", str(worktree_dir),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    assert "FATAL" not in r.stderr, f"unexpected git-target FATAL: {r.stderr}"
    assert r.stdout.strip(), f"expected JSON on stdout, got empty; stderr={r.stderr}"
