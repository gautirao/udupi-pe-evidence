#!/usr/bin/env python3
"""
Mode-3 team + orchestrator-model invariant checker.

Static (no-runtime) guard that the /mode3-run workflow definition keeps the
invariants that regressed when the Agent-Teams harness migrated to a single
implicit team (TeamCreate/TeamDelete removed; Task spawn tool renamed to Agent):

  1. /mode3-run resolves to the Mode-3 workflow (command file present + routes
     to the `mode3-orchestrator` teammate).
  2. The Mode-3 workflow establishes a team via a Phase-0.2 orchestrator-spawn
     (bootstrap) and does NOT depend on the removed TeamCreate/TeamDelete tools.
     (Post-Design-B the run may legitimately RESPAWN the orchestrator for rework,
     so "exactly one spawn site" is no longer asserted — instead EVERY spawn site
     must be Opus.)
  3. Team-establishment / probe failure fails fast (blocked.toml) and forbids a
     silent fallback to ad-hoc background subagents.
  4. EVERY orchestrator spawn (bootstrap + any rework/resume respawn) resolves to
     Opus, never Sonnet — at the spawn sites (command + contracts), in the agent
     definition, and in the handoff defaults.
  5. The orchestrator spawns specialists via the `Agent` tool (not the removed
     `Task` spawn tool).
  6. Design-B lifecycle continuity is documented: orchestrator identity is
     persisted (`orchestrator-agent.toml`), rework uses disk-before-send
     (`rework-request-*.toml`), the resume-then-respawn fallback exists, the Main
     Agent never authors the rework fix, a failed respawn blocks, and specialists
     keep their configured models.

Output: compact JSON. Exit 0 = all invariants hold; exit 1 = one or more failed.

Usage:
    python .claude/scripts/verify-mode3-team-invariant.py [--root <repo-root>] [--json]
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import List, Tuple

CMD = ".claude/commands/mode3-run.md"
AGENT = ".claude/agents/mode3-orchestrator.md"
PLAN_REVIEW = ".claude/mode3/contracts/plan-review.md"
HANDOFF_TMPL = ".claude/templates/approved-execution-handoff.toml"
MAIN_AGENT = ".claude/mode3/contracts/main-agent.md"
WORKDONE_REVIEW = ".claude/mode3/contracts/workdone-review.md"
CLOSEOUT = ".claude/mode3/contracts/closeout.md"
NOTIFICATIONS = ".claude/mode3/contracts/notifications.md"

# Matches an orchestrator-spawn site: Agent({ ... subagent_type: "mode3-orchestrator" ... })
SPAWN_RE = re.compile(r'Agent\(\{[^}]*subagent_type:\s*"mode3-orchestrator"[^}]*\}\)')


def read(root: Path, rel: str) -> str:
    p = root / rel
    if not p.exists():
        return ""
    return p.read_text(encoding="utf-8", errors="ignore")


def check(checks: List[Tuple[str, bool, str]], cid: str, ok: bool, detail: str):
    checks.append((cid, ok, detail))


def run(root: Path) -> Tuple[List[Tuple[str, bool, str]], bool]:
    checks: List[Tuple[str, bool, str]] = []

    cmd = read(root, CMD)
    agent = read(root, AGENT)
    plan_review = read(root, PLAN_REVIEW)
    handoff = read(root, HANDOFF_TMPL)
    main_agent = read(root, MAIN_AGENT)
    workdone_review = read(root, WORKDONE_REVIEW)
    closeout = read(root, CLOSEOUT)
    notifications = read(root, NOTIFICATIONS)

    # 1 — command exists and routes to the Mode-3 orchestrator
    check(checks, "command_present", bool(cmd) and "name: mode3-run" in cmd,
          f"{CMD} present with mode3-run front-matter")
    check(checks, "routes_to_orchestrator",
          'subagent_type: "mode3-orchestrator"' in cmd or "mode3-orchestrator" in cmd,
          "command routes to the mode3-orchestrator teammate")

    # 2 — no dependency on the removed TeamCreate/TeamDelete tools (live command)
    no_teamcreate = "TeamCreate(" not in cmd and "TeamDelete(" not in cmd
    check(checks, "no_removed_team_tools", no_teamcreate,
          "command does not call removed TeamCreate()/TeamDelete() tools")

    # bootstrap orchestrator-spawn site exists in the command (Phase 0.2 team-establishment).
    # Design B: respawn for rework is legitimate, so we no longer require EXACTLY one
    # spawn site — only that the bootstrap exists AND every spawn site is Opus (below).
    cmd_spawns = SPAWN_RE.findall(cmd)
    check(checks, "bootstrap_spawn_present", len(cmd_spawns) >= 1,
          f"Phase-0.2 orchestrator bootstrap spawn present in command; found {len(cmd_spawns)}")

    # every orchestrator-spawn site (command + contracts: bootstrap AND rework respawn)
    # is Opus and never Sonnet.
    all_spawns: List[str] = []
    for txt in (cmd, main_agent, closeout, workdone_review):
        all_spawns.extend(SPAWN_RE.findall(txt))
    spawns_opus = bool(all_spawns) and all('model: "opus"' in s for s in all_spawns) \
        and all('"sonnet"' not in s for s in all_spawns)
    check(checks, "all_orchestrator_spawns_opus", spawns_opus,
          f"all {len(all_spawns)} orchestrator-spawn site(s) use model: \"opus\" and none use sonnet")

    # 3 — fail-fast + no silent fallback
    fail_fast = ("blocked.toml" in cmd
                 and re.search(r"AGENT_TEAMS_UNAVAILABLE", cmd) is not None
                 and re.search(r"[Ff]ail fast|No silent fallback", cmd) is not None)
    check(checks, "fail_fast_on_team_failure", fail_fast,
          "command halts with blocked.toml(AGENT_TEAMS_UNAVAILABLE) and forbids silent fallback")
    check(checks, "main_agent_must_not_implement",
          "MUST NOT perform implementation work" in cmd,
          "command forbids the Main Agent from doing implementation work itself")

    # 4 — orchestrator model = Opus everywhere; never Sonnet
    spawn_line = next((ln for ln in cmd.splitlines()
                       if 'subagent_type: "mode3-orchestrator"' in ln), "")
    check(checks, "spawn_model_opus", 'model: "opus"' in spawn_line,
          'orchestrator spawn uses model: "opus"')
    check(checks, "spawn_model_not_sonnet", '"sonnet"' not in spawn_line,
          "orchestrator spawn does not use sonnet")

    m = re.search(r"^model:\s*(\S+)\s*$", agent, re.MULTILINE)
    check(checks, "agent_def_model_opus", bool(m) and m.group(1).strip() == "opus",
          f"mode3-orchestrator.md front-matter model = {m.group(1) if m else 'MISSING'}")

    check(checks, "plan_review_executor_opus",
          'executor.model = "opus"' in plan_review and 'executor.model = "sonnet"' not in plan_review,
          "plan-review contract sets executor.model = opus")
    check(checks, "handoff_template_model_opus",
          re.search(r'^\s*model\s*=\s*"opus"', handoff, re.MULTILINE) is not None
          and re.search(r'^\s*model\s*=\s*"sonnet"', handoff, re.MULTILINE) is None,
          "handoff template [executor].model = opus")

    # 5 — orchestrator spawns specialists via Agent, not the removed Task spawn tool
    tm = re.search(r"^tools:\s*(.+)$", agent, re.MULTILINE)
    tools = tm.group(1) if tm else ""
    check(checks, "agent_tools_have_agent", "Agent" in tools,
          f"orchestrator tools include Agent: {tools.strip()}")
    check(checks, "orchestrator_no_task_spawn",
          "Task(subagent_type" not in agent and "`Task(`" not in agent,
          "orchestrator def does not invoke removed Task() spawn tool")
    check(checks, "orchestrator_spawns_via_agent",
          "Agent(subagent_type=" in agent,
          "orchestrator invokes specialists via Agent(subagent_type=...)")

    # 6b — explicit binding invariant + observability documented
    check(checks, "binding_invariant_present",
          "Mode-3 team invariant (binding)" in cmd,
          "command states the explicit binding Mode-3 team invariant")
    check(checks, "observability_documented",
          "team-lead-execution-log.md" in cmd and "SendMessage" in cmd
          and re.search(r"tasks/<id>\.output|observable", cmd) is not None,
          "teammate work documented as observable (transcripts + execution log + SendMessage)")

    # 7 — accurate harness-migration note (TeamCreate removed -> implicit team; panes are a harness concern)
    check(checks, "migration_note_accurate",
          "Harness migration note" in cmd
          and "removed from the Claude Code harness" in cmd
          and "teamMateMode" in cmd,
          "migration note is accurate (explicit team tools removed; panes governed by teamMateMode)")

    # 8 — Design-B lifecycle continuity (standing best-effort orchestrator + durable respawn)
    rework_combined = main_agent + workdone_review + closeout

    check(checks, "respawn_path_documented",
          "resume-then-respawn" in main_agent and "Respawn a fresh orchestrator" in main_agent,
          "main-agent contract documents the resume-then-respawn rework path")

    check(checks, "orchestrator_identity_persisted",
          "orchestrator-agent.toml" in cmd and "orchestrator-agent.toml" in main_agent,
          "orchestrator identity persisted to orchestrator-agent.toml (spawn + rework brief)")

    check(checks, "rework_request_disk_before_send",
          "disk-before-send" in main_agent.lower() and "rework-request" in main_agent
          and "disk-before-send" in workdone_review.lower(),
          "rework uses disk-before-send (rework-request-*.toml written before SendMessage)")

    check(checks, "main_agent_not_author_rework_fix",
          "MUST NOT author or apply the fix" in main_agent,
          "Main Agent is forbidden from authoring/applying the rework fix itself")

    check(checks, "resume_respawn_failure_blocks",
          "respawn itself fails" in main_agent
          and "blocked.toml(reason_code=AGENT_TEAMS_UNAVAILABLE)" in main_agent
          and "AGENT_TEAMS_UNAVAILABLE" in rework_combined,
          "a failed respawn writes blocked.toml(AGENT_TEAMS_UNAVAILABLE) and stops")

    check(checks, "specialists_keep_models",
          "Specialists keep their own configured models" in cmd,
          "specialists keep their configured/default models (orchestrator-only Opus rule)")

    all_ok = all(ok for _, ok, _ in checks)
    return checks, all_ok


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None,
                    help="Repo root containing .claude (default: inferred from this script)")
    ap.add_argument("--json", action="store_true", help="JSON output only")
    args = ap.parse_args()

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[2]

    checks, all_ok = run(root)
    result = {
        "root": str(root),
        "passed": all_ok,
        "checks": [{"id": c, "ok": ok, "detail": d} for c, ok, d in checks],
        "failed": [c for c, ok, _ in checks if not ok],
    }

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for c, ok, d in checks:
            print(f"[{'PASS' if ok else 'FAIL'}] {c}: {d}")
        print()
        print(f"RESULT: {'PASS' if all_ok else 'FAIL'} "
              f"({sum(ok for _, ok, _ in checks)}/{len(checks)} checks)")
        if not all_ok:
            print("FAILED:", ", ".join(result["failed"]))

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
