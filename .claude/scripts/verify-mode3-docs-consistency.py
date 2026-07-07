#!/usr/bin/env python3
"""
Mode-3 docs consistency checker (added by the mode3 skill-system refactor).

Static, dependency-free guard that the LIVE Mode-3 workflow docs stay free of
the conflict classes removed by the refactor:

  1. No `gh pr merge ... --admin` instruction in live workflow docs
     (branch-protection bypass ban; prohibition sentences are allowed).
  2. No instruction to spawn specialists "via `Task`" in live docs
     (the Task spawn tool was removed from the harness; the tool is `Agent`).
  3. No `.claude/.claude/` double-prefix path typos.
  4. No legacy gate-verdict vocabulary (`decision = "APPROVED_FOR_IMPLEMENTATION"`,
     `NEEDS_REVISION`) in the mode3 contracts — the canonical field is `verdict`
     with the per-gate enums in openai_gate.py.
  5. The routing-decision heading marker `[ROUTING DECISION]` is present in the
     execution-log template and in both docs that restate the template
     (verify-mode3-workdone.py greps the live log for that literal).
  6. Every `.claude/mode3/contracts/*.md` path referenced by the dispatcher
     exists on disk.
  7. No new `status = "REPRO_CONFIRMED"` assignments in bug-repro.md
     (canonical vocabulary is REPRODUCED; the alias is read-only legacy).
  8. Token-discipline anchors stay in place (added by the token-usage pass):
     the dispatcher carries the "Context loading & token policy" section, the
     orchestrator's Step 0 forbids a full ROUTE_AND_RUN.md read (targeted
     section loads only, with the mandatory read-before-skip rule), and the
     team-lead contract carries the compact-handoff rules.

Historical records are exempt by design: .claude/hardening/, .claude/archive/,
.claude/state/, .claude/openai-gates/, .antigravity/ — they document what past
runs did and must not be rewritten.

Output: compact JSON. Exit 0 = consistent; exit 1 = one or more violations.

Usage:
    python3 .claude/scripts/verify-mode3-docs-consistency.py [--root <repo-root>] [--json]
"""

import argparse
import json
import re
import sys
from pathlib import Path

LIVE_DOC_GLOBS = [
    ".claude/commands/mode3-run.md",
    ".claude/commands/quick.md",
    ".claude/mode3/contracts/*.md",
    ".claude/agents/*.md",
    ".claude/skills/ROUTE_AND_RUN.md",
    ".claude/skills/ROUTE_AND_RUN_TABLES.md",
    ".claude/skills/SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md",
    ".claude/skills/route-and-run/*.md",
    ".claude/templates/*.toml",
    ".claude/templates/*.md",
    ".claude/templates/*.template",
    ".claude/prompts/*.md",
    ".claude/TOOLING.md",
    ".claude/docs/openai-gate.md",
]

DISPATCHER = ".claude/commands/mode3-run.md"
EXEC_LOG_TEMPLATE = ".claude/templates/team-lead-execution-log.md"
ROUTING_MARKER_DOCS = [
    EXEC_LOG_TEMPLATE,
    ".claude/mode3/contracts/team-lead.md",
    ".claude/agents/mode3-orchestrator.md",
]

PROHIBITION_WORDS = re.compile(r"never|do not|don't|forbidden|not pre-approved|ban", re.IGNORECASE)


def live_files(root: Path):
    seen = []
    for pattern in LIVE_DOC_GLOBS:
        seen.extend(sorted(root.glob(pattern)))
    return [p for p in seen if p.is_file()]


def run(root: Path):
    violations = []
    files = live_files(root)

    for path in files:
        rel = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8", errors="ignore")
        lines = text.splitlines()

        for i, line in enumerate(lines, 1):
            # 1 — --admin merge instruction (allow prohibition sentences)
            if "gh pr merge" in line and "--admin" in line and not PROHIBITION_WORDS.search(line):
                violations.append(f"{rel}:{i}: merge instruction uses --admin (branch-protection bypass)")
            # 2 — removed Task spawn tool instructed as live behaviour
            if "via `Task`" in line:
                violations.append(f"{rel}:{i}: instructs spawning via removed `Task` tool (use `Agent`)")
            # 3 — path typo
            if ".claude/.claude/" in line:
                violations.append(f"{rel}:{i}: double-prefix path typo `.claude/.claude/`")

        # 4 — legacy verdict vocabulary in mode3 contracts only
        if rel.startswith(".claude/mode3/contracts/"):
            if 'decision = "APPROVED_FOR_IMPLEMENTATION"' in text or '"NEEDS_REVISION"' in text:
                violations.append(f"{rel}: legacy gate verdict vocabulary (canonical field is `verdict`; see openai_gate.py PER_GATE_ENUMS)")

        # 7 — legacy repro assignment in bug-repro.md
        if rel.endswith("bug-repro.md") and re.search(r'status\s*=\s*"REPRO_CONFIRMED"', text):
            violations.append(f"{rel}: writes legacy status REPRO_CONFIRMED (canonical: REPRODUCED)")

    # 5 — routing-decision marker present where the template is (re)stated
    for rel in ROUTING_MARKER_DOCS:
        p = root / rel
        if not p.exists() or "[ROUTING DECISION]" not in p.read_text(encoding="utf-8", errors="ignore"):
            violations.append(f"{rel}: missing literal `[ROUTING DECISION]` marker (verify-mode3-workdone.py greps for it)")

    # 8 — token-discipline anchors (context policy, targeted R&R loading, compact handoffs)
    token_anchors = [
        (DISPATCHER, "Context loading & token policy",
         "dispatcher missing the Context loading & token policy section"),
        (".claude/agents/mode3-orchestrator.md", "in full",
         "orchestrator Step 0 must forbid a full ROUTE_AND_RUN.md read (targeted loads)"),
        (".claude/agents/mode3-orchestrator.md", "before** any skip decision",
         "orchestrator must require reading the cited skip section BEFORE any skip"),
        (".claude/mode3/contracts/team-lead.md", "Compact-handoff rules",
         "team-lead contract missing the compact-handoff rules"),
    ]
    for rel, needle, msg in token_anchors:
        p = root / rel
        if not p.exists() or needle not in p.read_text(encoding="utf-8", errors="ignore"):
            violations.append(f"{rel}: {msg}")

    # 6 — dispatcher-referenced contract paths exist
    dispatcher = root / DISPATCHER
    if dispatcher.exists():
        for m in sorted(set(re.findall(r"\.claude/mode3/contracts/[a-z0-9-]+\.md", dispatcher.read_text(encoding="utf-8", errors="ignore")))):
            if not (root / m).exists():
                violations.append(f"{DISPATCHER}: references missing contract {m}")
    else:
        violations.append(f"{DISPATCHER}: dispatcher file missing")

    return {
        "checker": "verify-mode3-docs-consistency",
        "files_scanned": len(files),
        "violations": violations,
        "ok": not violations,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[2]
    result = run(root)
    print(json.dumps(result, indent=None if args.json else 2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
