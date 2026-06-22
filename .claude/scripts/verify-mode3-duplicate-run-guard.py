#!/usr/bin/env python3
"""
Mode-3 duplicate-run guard checker.

Two independent guarantees, both required to exit 0:

A) STATIC doc-invariant checks — the /mode3-run workflow definition still
   documents the duplicate-run preflight guard introduced after incident #1534
   (two sessions/worktrees ran the SAME issue concurrently and produced
   conflicting PATH_B/PATH_C decisions, duplicated artefacts, and a tampered
   decision file). Specifically:
     1. Phase 0.0 "Duplicate-run preflight guard" exists in the command and
        scans worktrees + branches + lock + sessions before a run starts.
     2. The run-lock mechanism (.claude/active-runs/issue-<N>.lock) + template
        + git-ignore scaffolding are documented and present.
     3. The second-attempt rule (explicit user phrase + -attempt-<k> suffix +
        second_attempt_approved flag) is documented.
     4. The single-writer decision-file rule + freeze-on-duplicate-writer
        procedure is documented (command + main-agent contract).
     5. The closeout run-lock cleanup rule is documented.

B) ACTIVE-RUN scan — fails (exit 1) when two active worktrees/locks exist for
   the SAME issue without an approved second attempt. Scans
   `.claude/active-runs/*.lock` and `git worktree list --porcelain`.

A legitimate single run owns BOTH a lock and a worktree for its issue; that is
NOT a duplicate. A duplicate is: two distinct worktrees for the same
(issue, attempt) slot, or an attempt>=2 marker (lock/worktree) that is not
backed by a lock with `second_attempt_approved = true`.

Output: compact JSON (--json) or human lines. Exit 0 = both guarantees hold.

Usage:
    python .claude/scripts/verify-mode3-duplicate-run-guard.py [--root R] [--json]
                 [--active-runs-dir D] [--worktrees-from FILE] [--docs-only]
                 [--active-only]
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

CMD = ".claude/commands/mode3-run.md"
MAIN_AGENT = ".claude/mode3/contracts/main-agent.md"
CLOSEOUT = ".claude/mode3/contracts/closeout.md"
LOCK_TMPL = ".claude/templates/active-run-lock.toml"
ACTIVE_GITIGNORE = ".claude/active-runs/.gitignore"

# Both patterns capture the issue number with a greedy \d+, which consumes every
# digit up to the '-' separator. That is what keeps "issue-15" and "issue-150"
# distinct: a search for the digits in "issue-150" yields 150, never 15, because
# \d+ cannot stop at the '5'. (LOCK_NAME_RE additionally anchors the whole name.)
LOCK_NAME_RE = re.compile(r"^issue-(\d+)(?:-attempt-(\d+))?\.lock$")
WORKTREE_ISSUE_RE = re.compile(r"issue-(\d+)(?:-attempt-(\d+))?")
APPROVED_RE = re.compile(r"second_attempt_approved\s*=\s*true", re.IGNORECASE)


def read(root: Path, rel: str) -> str:
    p = root / rel
    return p.read_text(encoding="utf-8", errors="ignore") if p.exists() else ""


def section(text: str, start: str) -> str:
    """Return the slice of `text` from heading `start` up to the next `##` heading
    (or end of file). Used so a doc check verifies content lives in its OWN
    section, not merely somewhere in the file."""
    i = text.find(start)
    if i < 0:
        return ""
    rest = text[i + len(start):]
    m = re.search(r"\n##\s", rest)
    return rest[: m.start()] if m else rest


def _norm(p: str) -> str:
    return str(Path(p)).rstrip("/")


# --------------------------------------------------------------------------- #
# A) Static doc-invariant checks
# --------------------------------------------------------------------------- #

def doc_checks(root: Path) -> List[Tuple[str, bool, str]]:
    cmd = read(root, CMD)
    main_agent = read(root, MAIN_AGENT)
    closeout = read(root, CLOSEOUT)
    lock_tmpl = read(root, LOCK_TMPL)
    gitignore = read(root, ACTIVE_GITIGNORE)
    checks: List[Tuple[str, bool, str]] = []

    def add(cid: str, ok: bool, detail: str):
        checks.append((cid, ok, detail))

    # 1 — Phase 0.0 preflight guard present + scans all four signals
    add("phase_0_0_present",
        "0.0 — Duplicate-run preflight guard" in cmd,
        "command defines Phase 0.0 duplicate-run preflight guard")
    add("preflight_scans_all_signals",
        all(s in cmd for s in ("git worktree list", "git branch --list",
                               "active-runs/issue-<N>.lock", "tmux")),
        "Phase 0.0 scans worktrees + branches + lock file + sessions")
    cmd_lower = cmd.lower()
    add("preflight_stops_before_new_worktree",
        "create a new worktree" in cmd_lower
        and ("do not create a new worktree" in cmd_lower
             or "stop before creating a new worktree" in cmd_lower
             or "do not proceed" in cmd_lower),
        "Phase 0.0 stops before creating a new worktree/lock when a run is found")

    # 2 — lock mechanism documented + scaffolding present
    add("lock_mechanism_documented",
        ".claude/active-runs/issue-<N>.lock" in cmd
        and "active-run-lock.toml" in cmd,
        "run-lock path + template referenced in the command")
    add("lock_template_present",
        bool(lock_tmpl) and "second_attempt_approved" in lock_tmpl
        and "current_phase" in lock_tmpl and "selected_ports" in lock_tmpl,
        "active-run-lock.toml template present with required fields")
    add("lock_gitignored",
        "*.lock" in gitignore,
        "active-runs/.gitignore ignores *.lock (locks are runtime state)")

    # 3 — second-attempt rule
    add("second_attempt_rule",
        "Start a second independent attempt for issue" in cmd
        and "Start a second independent attempt for issue" in main_agent,
        "explicit second-attempt authorisation phrase documented (command + contract)")
    add("second_attempt_suffix",
        "issue-<N>-attempt-2" in cmd and "issue-<N>-attempt-2" in main_agent,
        "approved second attempt uses an issue-<N>-attempt-<k> suffix")

    # 4 — single-writer rule + freeze procedure
    add("single_writer_rule",
        "Single-writer decision-file rule" in cmd
        and "single-writer decision-file" in main_agent.lower(),
        "single-writer decision-file rule documented (command + contract)")
    add("freeze_on_duplicate_writer",
        "freeze immediately" in cmd.lower() and "freeze immediately" in main_agent.lower()
        and "which run is authoritative" in main_agent.lower(),
        "duplicate-writer freeze procedure documented (freeze + stop + preserve + report + ask)")

    # 5 — closeout cleanup rule
    add("closeout_cleanup_rule",
        "Run-lock cleanup" in closeout and "Remove the lock only after" in closeout,
        "closeout documents the run-lock cleanup conditions")
    cleanup_section = section(closeout, "Run-lock cleanup")
    add("closeout_cleanup_conditions",
        all(s in cleanup_section for s in ("PR is merged", "abandoned", "worktree",
                                           "branch", "final status is reported")),
        "cleanup gated on merge/abandon + worktree + branch + final status reported "
        "(within the Run-lock cleanup section)")

    # 6 — unique-ports rule (change 4)
    add("ports_rule_documented",
        "lsof -i :" in cmd and "lsof -i :" in main_agent
        and "selected_ports" in cmd and "selected_ports" in main_agent
        and "checkpoint report" in main_agent.lower(),
        "unique-ports rule documented (lsof preflight + record selected_ports + checkpoint mention)")

    # 7 — credentials-from-main-workspace rule (change 5)
    add("credentials_rule_documented",
        ".env.e2e" in cmd and ".env.e2e" in main_agent
        and "credentials from the main workspace only" in cmd.lower()
        and "credentials from the main workspace only" in main_agent.lower()
        and "git-ignored" in main_agent.lower()
        and "print credentials" in main_agent.lower(),
        "credentials-only-from-main-workspace rule documented (.env/.env.e2e, no commit/copy/print, git-ignored)")

    # 8 — shared-DB safety rule (change 6)
    add("shared_db_rule_documented",
        all(s in cmd for s in ("unmerged Flyway", "Testcontainers", "NEEDS_USER_DECISION"))
        and "shared Supabase" in cmd
        and all(s in main_agent for s in ("unmerged Flyway", "Testcontainers", "NEEDS_USER_DECISION"))
        and "shared Supabase" in main_agent,
        "shared-DB safety rule documented (no unmerged Flyway on shared Supabase; Testcontainers; NEEDS_USER_DECISION)")

    # 9 — closeout surfaces ports + credential source in the checkpoint summary
    add("closeout_records_ports_and_creds",
        "Selected ports" in closeout and "Credentials source" in closeout,
        "closeout summary records selected ports + credentials source")

    return checks


# --------------------------------------------------------------------------- #
# B) Active-run duplicate scan
# --------------------------------------------------------------------------- #

def parse_locks(active_dir: Path) -> List[Dict]:
    locks: List[Dict] = []
    if not active_dir.is_dir():
        return locks
    for p in sorted(active_dir.glob("*.lock")):
        m = LOCK_NAME_RE.match(p.name)
        if not m:
            continue
        approved = bool(APPROVED_RE.search(p.read_text(encoding="utf-8", errors="ignore")))
        locks.append({
            "issue": int(m.group(1)),
            "attempt": int(m.group(2)) if m.group(2) else 1,
            "approved": approved,
            "path": str(p),
        })
    return locks


def parse_worktrees(porcelain: str, exclude: Optional[set] = None) -> List[Dict]:
    # `exclude` holds normalised paths to ignore — chiefly the main checkout, which
    # `git worktree list` always emits first. If the repo itself were cloned under
    # an `issue-<N>` path it must NOT be counted as an active issue worktree, or
    # every run would permanently self-block.
    exclude = exclude or set()
    wts: List[Dict] = []
    for line in porcelain.splitlines():
        line = line.strip()
        if not line.startswith("worktree "):
            continue
        path = line[len("worktree "):].strip()
        if _norm(path) in exclude:
            continue
        m = WORKTREE_ISSUE_RE.search(path)
        if not m:
            continue
        wts.append({
            "issue": int(m.group(1)),
            "attempt": int(m.group(2)) if m.group(2) else 1,
            "path": path,
        })
    return wts


def git_worktrees(root: Path) -> Tuple[str, Optional[str]]:
    """Return (porcelain_text, note). note is set when git is unavailable."""
    try:
        r = subprocess.run(
            ["git", "-C", str(root), "worktree", "list", "--porcelain"],
            capture_output=True, text=True, timeout=20,
        )
        if r.returncode != 0:
            return "", "git_worktree_list_failed"
        return r.stdout, None
    except (OSError, subprocess.SubprocessError):
        return "", "git_unavailable"


def scan_active(locks: List[Dict], worktrees: List[Dict]) -> List[Dict]:
    """Return a list of violation dicts. Empty list = no duplicate runs."""
    # Two attempt-1 locks for the same issue are structurally impossible — the
    # lock filename (`issue-<N>.lock`) is unique on the filesystem, so racing
    # writers are serialised by the OS. Duplicate *primary* runs therefore only
    # surface as two distinct worktrees for attempt 1 (caught below).
    violations: List[Dict] = []
    issues = {l["issue"] for l in locks} | {w["issue"] for w in worktrees}
    for n in sorted(issues):
        ilocks = [l for l in locks if l["issue"] == n]
        iwts = [w for w in worktrees if w["issue"] == n]
        attempts = {l["attempt"] for l in ilocks} | {w["attempt"] for w in iwts}
        for a in sorted(attempts):
            a_lock_paths = [l["path"] for l in ilocks if l["attempt"] == a]
            a_wt_paths = sorted({w["path"] for w in iwts if w["attempt"] == a})
            approved = any(l["approved"] for l in ilocks if l["attempt"] == a)

            # Two distinct worktrees for the same (issue, attempt) = duplicate run.
            if len(a_wt_paths) > 1:
                violations.append({
                    "issue": n, "attempt": a, "kind": "duplicate_worktree",
                    "markers": a_wt_paths,
                })
            # attempt >= 2 must be an approved second attempt.
            if a >= 2 and not approved:
                violations.append({
                    "issue": n, "attempt": a, "kind": "unapproved_second_attempt",
                    "markers": a_lock_paths + a_wt_paths,
                })
    return violations


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None,
                    help="Repo root containing .claude (default: inferred from this script)")
    ap.add_argument("--active-runs-dir", default=None,
                    help="Override the active-runs dir scanned (default: <root>/.claude/active-runs)")
    ap.add_argument("--worktrees-from", default=None,
                    help="Read `git worktree list --porcelain` output from a file instead of running git")
    ap.add_argument("--docs-only", action="store_true", help="Run only the static doc checks")
    ap.add_argument("--active-only", action="store_true", help="Run only the active-run scan")
    ap.add_argument("--json", action="store_true", help="JSON output only")
    args = ap.parse_args()

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[2]

    result: Dict = {"root": str(root), "failed": []}
    docs_passed = True
    active_passed = True

    if not args.active_only:
        checks = doc_checks(root)
        docs_passed = all(ok for _, ok, _ in checks)
        result["docs"] = {
            "passed": docs_passed,
            "checks": [{"id": c, "ok": ok, "detail": d} for c, ok, d in checks],
        }
        result["failed"].extend(c for c, ok, _ in checks if not ok)

    if not args.docs_only:
        active_dir = Path(args.active_runs_dir).resolve() if args.active_runs_dir \
            else root / ".claude" / "active-runs"
        note = None
        if args.worktrees_from:
            porcelain = Path(args.worktrees_from).read_text(encoding="utf-8", errors="ignore")
        else:
            porcelain, note = git_worktrees(root)
        locks = parse_locks(active_dir)
        worktrees = parse_worktrees(porcelain, exclude={_norm(str(root))})
        violations = scan_active(locks, worktrees)
        active_passed = not violations
        result["active_runs"] = {
            "passed": active_passed,
            "active_dir": str(active_dir),
            "locks": len(locks),
            "worktrees": len(worktrees),
            "violations": violations,
            "note": note,
        }
        result["failed"].extend(
            f"duplicate_run:{v['issue']}:attempt-{v['attempt']}:{v['kind']}" for v in violations)

    all_ok = docs_passed and active_passed
    result["passed"] = all_ok

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if "docs" in result:
            for c in result["docs"]["checks"]:
                print(f"[{'PASS' if c['ok'] else 'FAIL'}] {c['id']}: {c['detail']}")
        if "active_runs" in result:
            ar = result["active_runs"]
            if ar.get("note"):
                print(f"[NOTE] active-run scan: {ar['note']} (worktree signal unavailable)")
            print(f"[{'PASS' if ar['passed'] else 'FAIL'}] active_runs: "
                  f"{ar['locks']} lock(s), {ar['worktrees']} issue-worktree(s), "
                  f"{len(ar['violations'])} duplicate-run violation(s)")
            for v in ar["violations"]:
                print(f"        - issue {v['issue']} attempt-{v['attempt']}: "
                      f"{v['kind']} :: {', '.join(v['markers'])}")
        print()
        print(f"RESULT: {'PASS' if all_ok else 'FAIL'}")
        if not all_ok:
            print("FAILED:", ", ".join(result["failed"]))

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
