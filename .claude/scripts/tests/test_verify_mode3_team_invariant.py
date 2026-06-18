#!/usr/bin/env python3
"""
Tests for verify-mode3-team-invariant.py

Locks the Mode-3 team + orchestrator-model invariants that regressed when the
Agent-Teams harness migrated to a single implicit team:

1. Real repo satisfies every invariant (exit 0).
2. A sonnet orchestrator override is rejected (orchestrator must be Opus).
3. A reintroduced TeamCreate() dependency is rejected (tool was removed).
4. A reverted `Task(` specialist-spawn is rejected (spawn tool is now `Agent`).
5. Dropping the fail-fast / no-silent-fallback language is rejected.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / ".claude" / "scripts" / "verify-mode3-team-invariant.py"

FILES = [
    ".claude/commands/mode3-run.md",
    ".claude/agents/mode3-orchestrator.md",
    ".claude/mode3/contracts/plan-review.md",
    ".claude/templates/approved-execution-handoff.toml",
]


def run(root: Path):
    r = subprocess.run(
        [sys.executable, str(SCRIPT), "--root", str(root), "--json"],
        capture_output=True, text=True, timeout=30,
    )
    return r.returncode, json.loads(r.stdout) if r.stdout.strip() else {}


def make_copy(tmp: Path) -> Path:
    root = tmp / "repo"
    for rel in FILES:
        dst = root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(REPO / rel, dst)
    return root


def mutate(root: Path, rel: str, old: str, new: str):
    p = root / rel
    txt = p.read_text(encoding="utf-8")
    assert old in txt, f"fixture anchor not found in {rel}: {old!r}"
    p.write_text(txt.replace(old, new), encoding="utf-8")


def test_real_repo_passes():
    code, out = run(REPO)
    assert code == 0, f"real repo failed invariants: {out.get('failed')}"
    assert out["passed"] is True
    assert out["failed"] == []


def test_sonnet_orchestrator_override_rejected(tmp_path):
    root = make_copy(tmp_path)
    mutate(root, ".claude/commands/mode3-run.md", 'model: "opus", name: "orchestrator"',
           'model: "sonnet", name: "orchestrator"')
    code, out = run(root)
    assert code == 1
    assert "spawn_model_opus" in out["failed"]
    assert "spawn_model_not_sonnet" in out["failed"]


def test_agent_def_sonnet_rejected(tmp_path):
    root = make_copy(tmp_path)
    mutate(root, ".claude/agents/mode3-orchestrator.md", "model: opus", "model: sonnet")
    code, out = run(root)
    assert code == 1
    assert "agent_def_model_opus" in out["failed"]


def test_teamcreate_dependency_rejected(tmp_path):
    root = make_copy(tmp_path)
    mutate(root, ".claude/commands/mode3-run.md",
           "4. Spawn the Orchestrator teammate",
           '4. `TeamCreate({ team_name: "mode3-<N>" })`. Spawn the Orchestrator teammate')
    code, out = run(root)
    assert code == 1
    assert "no_removed_team_tools" in out["failed"]


def test_task_spawn_tool_rejected(tmp_path):
    root = make_copy(tmp_path)
    mutate(root, ".claude/agents/mode3-orchestrator.md",
           "Invoke `Agent(subagent_type=<specialist-name>",
           "Invoke `Task(subagent_type=<specialist-name>")
    code, out = run(root)
    assert code == 1
    assert "orchestrator_no_task_spawn" in out["failed"]


def test_silent_fallback_language_required(tmp_path):
    root = make_copy(tmp_path)
    # remove the fail-fast guarantee
    mutate(root, ".claude/commands/mode3-run.md",
           "**No silent fallback. Fail fast.**", "Proceed however is convenient.")
    code, out = run(root)
    assert code == 1
    assert "fail_fast_on_team_failure" in out["failed"]


if __name__ == "__main__":
    sys.exit(subprocess.call([sys.executable, "-m", "pytest", __file__, "-v"]))
