#!/usr/bin/env python3
"""
Tests for verify-mode3-duplicate-run-guard.py

Locks the Mode-3 duplicate-run guard introduced after incident #1534:

A) STATIC doc invariants (run with --docs-only against a copied repo):
   1. Real repo documents the guard (exit 0).
   2. Dropping Phase 0.0 is rejected.
   3. Dropping the second-attempt authorisation phrase is rejected.
   4. Dropping the closeout run-lock cleanup rule is rejected.
   5. Dropping the unique-ports rule is rejected.
   6. Dropping the credentials-from-main-workspace rule is rejected.
   7. Dropping the shared-DB safety rule is rejected.
   8. Dropping selected_ports from the lock template is rejected.

B) ACTIVE-RUN scan (run with --active-only against fixture dirs/files):
   9.  Clean state (no locks/worktrees) passes.
   10. One lock + its matching worktree (a single legitimate run) passes.
   11. Two worktrees for the same issue fails (duplicate_worktree).
   12. A primary lock + an UNAPPROVED attempt-2 lock fails (unapproved_second_attempt)
       — i.e. a new run started for an issue that already has one.
   13. An attempt-2 worktree with no approved lock fails (second attempt needs approval).
   14. An APPROVED attempt-2 lock + its worktree passes (authorised second attempt).
   15. issue-15 and issue-150 are NOT conflated (word-boundary on the issue number).
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / ".claude" / "scripts" / "verify-mode3-duplicate-run-guard.py"

DOC_FILES = [
    ".claude/commands/mode3-run.md",
    ".claude/mode3/contracts/main-agent.md",
    ".claude/mode3/contracts/closeout.md",
    ".claude/templates/active-run-lock.toml",
    ".claude/active-runs/.gitignore",
]


def run(*args):
    r = subprocess.run(
        [sys.executable, str(SCRIPT), "--json", *args],
        capture_output=True, text=True, timeout=30,
    )
    return r.returncode, (json.loads(r.stdout) if r.stdout.strip() else {})


def make_doc_copy(tmp: Path) -> Path:
    root = tmp / "repo"
    for rel in DOC_FILES:
        dst = root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(REPO / rel, dst)
    return root


def mutate(root: Path, rel: str, old: str, new: str):
    p = root / rel
    txt = p.read_text(encoding="utf-8")
    assert old in txt, f"fixture anchor not found in {rel}: {old!r}"
    p.write_text(txt.replace(old, new), encoding="utf-8")


def write_lock(active_dir: Path, name: str, approved: bool = False):
    active_dir.mkdir(parents=True, exist_ok=True)
    (active_dir / name).write_text(
        f'issue = "x"\nsecond_attempt_approved = {"true" if approved else "false"}\n'
        f'current_phase = "5"\nselected_ports = [5183, 8083]\n',
        encoding="utf-8",
    )


def write_porcelain(tmp: Path, *paths: str) -> Path:
    f = tmp / "worktrees.txt"
    blocks = []
    for p in paths:
        blocks.append(f"worktree {p}\nHEAD 0000000000000000000000000000000000000000\n")
    f.write_text("\n".join(blocks), encoding="utf-8")
    return f


# --------------------------- A) static doc invariants ------------------------ #

def test_real_repo_docs_pass():
    code, out = run("--docs-only", "--root", str(REPO))
    assert code == 0, f"real repo failed doc invariants: {out.get('failed')}"
    assert out["passed"] is True
    assert out["failed"] == []


def test_missing_phase_0_0_rejected(tmp_path):
    root = make_doc_copy(tmp_path)
    mutate(root, ".claude/commands/mode3-run.md",
           "0.0 — Duplicate-run preflight guard", "0.0 — (removed)")
    code, out = run("--docs-only", "--root", str(root))
    assert code == 1
    assert "phase_0_0_present" in out["failed"]


def test_missing_second_attempt_rule_rejected(tmp_path):
    root = make_doc_copy(tmp_path)
    mutate(root, ".claude/commands/mode3-run.md",
           "Start a second independent attempt for issue", "just start another run for issue")
    code, out = run("--docs-only", "--root", str(root))
    assert code == 1
    assert "second_attempt_rule" in out["failed"]


def test_missing_closeout_cleanup_rejected(tmp_path):
    root = make_doc_copy(tmp_path)
    mutate(root, ".claude/mode3/contracts/closeout.md",
           "Remove the lock only after", "Delete the lock whenever")
    code, out = run("--docs-only", "--root", str(root))
    assert code == 1
    assert "closeout_cleanup_rule" in out["failed"]


def test_missing_ports_rule_rejected(tmp_path):
    root = make_doc_copy(tmp_path)
    mutate(root, ".claude/mode3/contracts/main-agent.md", "lsof -i :", "check ports somehow ")
    code, out = run("--docs-only", "--root", str(root))
    assert code == 1
    assert "ports_rule_documented" in out["failed"]


def test_missing_credentials_rule_rejected(tmp_path):
    root = make_doc_copy(tmp_path)
    mutate(root, ".claude/mode3/contracts/main-agent.md", ".env.e2e", ".env.SOMETHING")
    code, out = run("--docs-only", "--root", str(root))
    assert code == 1
    assert "credentials_rule_documented" in out["failed"]


def test_missing_shared_db_rule_rejected(tmp_path):
    root = make_doc_copy(tmp_path)
    mutate(root, ".claude/commands/mode3-run.md", "NEEDS_USER_DECISION", "just continue")
    code, out = run("--docs-only", "--root", str(root))
    assert code == 1
    assert "shared_db_rule_documented" in out["failed"]


def test_lock_template_records_ports(tmp_path):
    root = make_doc_copy(tmp_path)
    mutate(root, ".claude/templates/active-run-lock.toml", "selected_ports", "ports_unused")
    code, out = run("--docs-only", "--root", str(root))
    assert code == 1
    assert "lock_template_present" in out["failed"]


# --------------------------- B) active-run scan ------------------------------ #

def test_clean_active_state_passes(tmp_path):
    active = tmp_path / "active-runs"
    active.mkdir()
    porcelain = write_porcelain(tmp_path)  # no worktrees
    code, out = run("--active-only", "--active-runs-dir", str(active),
                    "--worktrees-from", str(porcelain))
    assert code == 0, out
    assert out["active_runs"]["violations"] == []


def test_single_run_lock_and_worktree_passes(tmp_path):
    active = tmp_path / "active-runs"
    write_lock(active, "issue-1534.lock")
    porcelain = write_porcelain(tmp_path, "/tmp/wt/issue-1534-broker-demand-gaps")
    code, out = run("--active-only", "--active-runs-dir", str(active),
                    "--worktrees-from", str(porcelain))
    assert code == 0, out
    assert out["active_runs"]["violations"] == []


def test_two_worktrees_same_issue_fails(tmp_path):
    active = tmp_path / "active-runs"
    active.mkdir()
    porcelain = write_porcelain(tmp_path,
                                "/tmp/wt-a/issue-1534-broker", "/tmp/wt-b/issue-1534-demand")
    code, out = run("--active-only", "--active-runs-dir", str(active),
                    "--worktrees-from", str(porcelain))
    assert code == 1
    kinds = {v["kind"] for v in out["active_runs"]["violations"]}
    assert "duplicate_worktree" in kinds
    assert "duplicate_run:1534:attempt-1:duplicate_worktree" in out["failed"]


def test_existing_lock_plus_unapproved_new_lock_fails(tmp_path):
    active = tmp_path / "active-runs"
    write_lock(active, "issue-1534.lock")
    write_lock(active, "issue-1534-attempt-2.lock", approved=False)
    porcelain = write_porcelain(tmp_path)
    code, out = run("--active-only", "--active-runs-dir", str(active),
                    "--worktrees-from", str(porcelain))
    assert code == 1
    kinds = {v["kind"] for v in out["active_runs"]["violations"]}
    assert "unapproved_second_attempt" in kinds


def test_unapproved_second_attempt_worktree_fails(tmp_path):
    active = tmp_path / "active-runs"
    write_lock(active, "issue-1534.lock")
    porcelain = write_porcelain(tmp_path,
                                "/tmp/wt/issue-1534-broker",
                                "/tmp/wt2/issue-1534-attempt-2-rogue")
    code, out = run("--active-only", "--active-runs-dir", str(active),
                    "--worktrees-from", str(porcelain))
    assert code == 1
    kinds = {v["kind"] for v in out["active_runs"]["violations"]}
    assert "unapproved_second_attempt" in kinds


def test_approved_second_attempt_passes(tmp_path):
    active = tmp_path / "active-runs"
    write_lock(active, "issue-1534.lock")
    write_lock(active, "issue-1534-attempt-2.lock", approved=True)
    porcelain = write_porcelain(tmp_path,
                                "/tmp/wt/issue-1534-broker",
                                "/tmp/wt2/issue-1534-attempt-2-fresh")
    code, out = run("--active-only", "--active-runs-dir", str(active),
                    "--worktrees-from", str(porcelain))
    assert code == 0, out
    assert out["active_runs"]["violations"] == []


def test_lock_plus_two_worktrees_same_issue_fails(tmp_path):
    active = tmp_path / "active-runs"
    write_lock(active, "issue-1534.lock")
    porcelain = write_porcelain(tmp_path,
                                "/tmp/wt-a/issue-1534-broker", "/tmp/wt-b/issue-1534-demand")
    code, out = run("--active-only", "--active-runs-dir", str(active),
                    "--worktrees-from", str(porcelain))
    assert code == 1
    kinds = {v["kind"] for v in out["active_runs"]["violations"]}
    assert "duplicate_worktree" in kinds


def test_main_checkout_under_issue_path_not_self_blocked(tmp_path):
    # The repo itself is cloned under an issue-named path; its main checkout shows
    # up first in `git worktree list`. It must NOT be counted as an active issue
    # worktree, or a single legitimate run (main checkout + one run worktree)
    # would false-positive as a duplicate.
    root = tmp_path / "issue-1534-clone"
    root.mkdir()
    active = tmp_path / "active-runs"
    active.mkdir()
    porcelain = write_porcelain(tmp_path, str(root), "/tmp/wt/issue-1534-run")
    code, out = run("--active-only", "--root", str(root),
                    "--active-runs-dir", str(active), "--worktrees-from", str(porcelain))
    assert code == 0, out
    assert out["active_runs"]["worktrees"] == 1  # main checkout excluded
    assert out["active_runs"]["violations"] == []


def test_distinct_issue_numbers_not_conflated(tmp_path):
    active = tmp_path / "active-runs"
    write_lock(active, "issue-15.lock")
    write_lock(active, "issue-150.lock")
    porcelain = write_porcelain(tmp_path,
                                "/tmp/a/issue-15-foo", "/tmp/b/issue-150-bar")
    code, out = run("--active-only", "--active-runs-dir", str(active),
                    "--worktrees-from", str(porcelain))
    assert code == 0, out
    assert out["active_runs"]["violations"] == []


if __name__ == "__main__":
    sys.exit(subprocess.call([sys.executable, "-m", "pytest", __file__, "-v"]))
