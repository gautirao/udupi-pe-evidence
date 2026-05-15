# Rollback — Mode-3 Agent Teams MVP (Issue #1096)

This document records how to back out the Agent-Teams-based Mode-3 MVP shipped by Issue #1096 if it ever proves unstable or if Anthropic disables / changes the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` flag.

The rollback target is **Path C — Main Agent direct orchestration**: Main Agent invokes specialists itself via `Task` in the same Route-and-Run choreography order (qa-fast → engineer → code-reviewer → [security-reviewer] → qa verification). The Opus token cost falls on Main Agent. The process remains identical; only the runtime transport changes.

## What #1096 added (revert these to roll back)

1. `.claude/commands/mode3-run.md` — slash command entry point.
2. `.claude/templates/approved-execution-handoff.toml` — REVISED schema. Previous schema is in git history.
3. `.claude/templates/workdone-candidate.toml` — REVISED schema. Previous schema is in git history.
4. `.claude/templates/blocked.toml` — NEW.
5. `.claude/templates/team-lead-execution-log.md` — NEW.
6. `.claude/templates/runtime-probe.md` — added behavioural-only rule.
7. `.claude/agents/team-lead.md` — frontmatter `tools:` reduced to `Read, Grep, Glob`; Mode-3 prose removed; pointer to `/mode3-run` added.
8. `.claude/skills/route-and-run/SKILL.md` — § Main Agent Role bullet repointed to `/mode3-run`.
9. `.claude/skills/ROUTE_AND_RUN.md` — top-of-file Mode-3 callout repointed to `/mode3-run`.
10. `.claude/settings.json` — added `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"`.
11. This file (`.claude/hardening/mode3-agent-teams-rollback.md`).

## Rollback steps

### Option 1 — Disable Agent Teams runtime, keep file contracts

If the issue is **only** harness flakiness with Agent Teams:

```bash
# 1. Remove the env flag from settings.json
#    Delete the "env" block (or set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS to "0").
rtk git checkout -b fix/<N>-disable-agent-teams main
# manually edit .claude/settings.json to remove the env block

# 2. /mode3-run Phase 0.2 will now fail the Agent Teams availability check
#    and write blocked.toml(AGENT_TEAMS_UNAVAILABLE) automatically.
#    The user can explicitly authorise Path C fallback in response.
```

Pros: no schema thrash; can re-enable Agent Teams by flipping one flag.
Cons: every `/mode3-run` invocation will trip the pre-flight before falling back.

### Option 2 — Full rollback of #1096

```bash
rtk git checkout -b fix/<N>-rollback-mode3 main

# Use git log to find the #1096 merge sha, then:
rtk git revert <merge-sha> --no-edit

# Or, if surgical edits are preferred:
rtk git rm .claude/commands/mode3-run.md
rtk git rm .claude/templates/blocked.toml
rtk git rm .claude/templates/team-lead-execution-log.md
rtk git rm .claude/hardening/mode3-agent-teams-rollback.md
rtk git checkout main -- .claude/templates/approved-execution-handoff.toml
rtk git checkout main -- .claude/templates/workdone-candidate.toml
rtk git checkout main -- .claude/templates/runtime-probe.md
rtk git checkout main -- .claude/agents/team-lead.md
rtk git checkout main -- .claude/skills/route-and-run/SKILL.md
rtk git checkout main -- .claude/skills/ROUTE_AND_RUN.md
rtk git checkout main -- .claude/settings.json
```

After the revert/rollback PR merges, **Mode-3 reverts to nested-subagent behaviour** — which has been proven non-functional. The only working fallback is Path C (Main Agent direct orchestration); the rolled-back team-lead.md still references the old broken Mode-3 prose, so document Path C as the actual operating model in CLAUDE.md or in the rollback PR description.

### Option 3 — Keep #1096 schemas, retire the slash command

If Agent Teams works but the `/mode3-run` UX is wrong, you can keep the file contracts and rewrite the command without rolling back the templates.

## Path C operational notes

When Path C is active:

1. Main Agent classifies the issue, runs PLAN_REVIEW, materialises `approved-plan.toml`.
2. Main Agent invokes specialists itself via `Task`, in Route-and-Run order:
   - `Task({ subagent_type: "qa-fast", ... })`
   - `Task({ subagent_type: "<engineer>", ... })` (with qa-fast findings in prompt)
   - `Task({ subagent_type: "code-reviewer", ... })` (model override for high-risk)
   - `Task({ subagent_type: "security-reviewer", ... })` if Gate F triggers
   - `Task({ subagent_type: "qa", ... })` with prompt prefix `Mode: verification`
3. Main Agent writes `workdone-candidate.toml` directly (no executor teammate).
4. Main Agent runs scope-lock, WORKDONE_REVIEW, PR creation, PR_REVIEW.
5. User approves merge; Main Agent merges and re-indexes.

Path C is fully functional today — it is what we used for #1086, #1093, and any other Mode-3 attempt before #1096. The only cost is Opus tokens during orchestration.

## Decision flags

| Symptom | Recommended rollback |
|---|---|
| Agent Teams flag disabled / unstable | Option 1 (disable env, keep schemas) |
| Schema bug surfaces in workdone-candidate or blocked | Option 3 (keep transport, rewrite command) |
| Anthropic deprecates Agent Teams entirely | Option 2 (full rollback to subagent text-report path B + Path C fallback) |
| Behavioural drift in executor teammate | Option 1 first; escalate to Option 2 if Path C also misbehaves |

## Cross-references

- Hardening report: `.claude/hardening/team-lead-orchestration-stability-report.md`
- Agent Teams investigation: `.claude/hardening/agent-teams-investigation-report.md`
- Probe evidence: `.claude/handoffs/agent-team-probe/at01-evidence.txt`
- Approved plan: `.claude/handoffs/issue-1096/approved-plan.toml`
- Base PLAN_REVIEW verdict: `.claude/openai-gates/issue-1096/20260515T133820Z-PLAN_REVIEW/`
- Supplement PLAN_REVIEW verdict: `.claude/openai-gates/issue-1096/20260515T135705Z-PLAN_REVIEW/`
