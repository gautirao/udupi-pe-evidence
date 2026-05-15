# Rollback — Mode-3 Orchestrator routing-authority repair (Issue #1098)

This document records how to back out the changes shipped by Issue #1098 if the new `mode3-orchestrator` agent or the Option-C routing-authority split proves unsafe or unstable.

Two rollback levels are documented: **immediate** (revert #1098 only, return to the broken-but-present post-#1097 state) and **deeper** (revert #1098 + #1097 + return to Path C — Main Agent direct orchestration).

The deeper rollback is documented in detail at `.claude/hardening/mode3-agent-teams-rollback.md` and is referenced here.

---

## What #1098 added (revert these for immediate rollback)

1. `.claude/agents/mode3-orchestrator.md` — NEW dedicated Mode-3 orchestrator agent.
2. `.claude/commands/mode3-run.md` — UPDATED: spawn target changed from `team-lead` to `mode3-orchestrator`; Phase 2 writes `[executor.specialist_policy]` boundary; Phase 5 requires routing-decision-log entry before first specialist call; Phase 7 verifies routing log.
3. `.claude/templates/approved-execution-handoff.toml` — schema v2; replaces `executor.allowed_specialists` with `[executor.specialist_policy]` (category_allowlist, mandatory_gates, conditional_gates, always_forbidden, skip_authority). Adds top-level `risk_tier`, `issue_type`, `[escalation_rules]`.
4. `.claude/templates/workdone-candidate.toml` — UPDATED: adds `[routing_decision_log]` section.
5. `.claude/templates/team-lead-execution-log.md` — UPDATED: adds ROUTING DECISION hard-gate entry template; "Executor" → "Orchestrator" terminology.
6. `.claude/agents/team-lead.md` — UPDATED: Mode-3 pointer paragraph now names `mode3-orchestrator` explicitly.
7. `.claude/skills/route-and-run/SKILL.md` — UPDATED: Main Agent Role bullet now references `/mode3-run` spawning `mode3-orchestrator` and Main Agent verifying the routing log before WORKDONE_REVIEW.
8. `.claude/skills/ROUTE_AND_RUN.md` — UPDATED: top-of-file Mode-3 callout repointed to `mode3-orchestrator`.
9. `.claude/hardening/mode3-routing-authority-rollback.md` — THIS FILE.

---

## Immediate rollback — Option A (recommended for routing-authority instability)

Revert the #1098 changes; return to the post-#1097 state (which is non-functional due to the team-lead role refusal, but is the immediate prior commit and preserves the file-handoff and Agent Teams transport machinery).

```bash
# Find the #1098 merge sha:
rtk gh pr view <N> --json mergeCommit --jq .mergeCommit.oid

# Create a revert branch from main:
rtk git checkout main
rtk git pull --ff-only origin main
rtk git checkout -b fix/rollback-1098

# Revert the merge commit:
rtk git revert <merge-sha> --no-edit -m 1
```

OR, if a surgical revert is preferred:

```bash
# Step 1 — Capture the pre-#1098 parent sha EXPLICITLY (do NOT rely on
# `origin/main~1` if any commit lands between #1098 and the rollback).
rtk gh pr view <1098-PR-number> --json mergeCommit --jq .mergeCommit.oid
# Record the merge sha as MERGE_SHA. Its first parent is the pre-#1098 state:
rtk git log --oneline -3 <MERGE_SHA>^
# Confirm the listed commits are the pre-#1098 state you expect.
# Use that exact sha (PARENT_SHA) below.

rtk git checkout -b fix/rollback-1098 main
rtk git rm .claude/agents/mode3-orchestrator.md
rtk git rm .claude/hardening/mode3-routing-authority-rollback.md
rtk git checkout <PARENT_SHA> -- .claude/commands/mode3-run.md
rtk git checkout <PARENT_SHA> -- .claude/templates/approved-execution-handoff.toml
rtk git checkout <PARENT_SHA> -- .claude/templates/workdone-candidate.toml
rtk git checkout <PARENT_SHA> -- .claude/templates/team-lead-execution-log.md
rtk git checkout <PARENT_SHA> -- .claude/agents/team-lead.md
rtk git checkout <PARENT_SHA> -- .claude/skills/route-and-run/SKILL.md
rtk git checkout <PARENT_SHA> -- .claude/skills/ROUTE_AND_RUN.md
```

After this rollback, **Mode 3 is non-functional** (the post-#1097 self-block returns). Use Path C (Main Agent direct orchestration) as the documented operating model — see `.claude/hardening/mode3-agent-teams-rollback.md` Path C operational notes.

---

## Deeper rollback — return to Path C (Main Agent direct orchestration)

If both #1098 AND #1097 are problematic, follow `.claude/hardening/mode3-agent-teams-rollback.md` Option 2 (full rollback of #1096) AND apply this rollback on top. Net result: repo returns to the pre-#1096 state where Main Agent invokes specialists directly via Task on every issue.

Path C operational notes (verbatim from `mode3-agent-teams-rollback.md`):

1. Main Agent classifies the issue, runs PLAN_REVIEW, materialises `approved-plan.toml`.
2. Main Agent invokes specialists itself via `Task`, in Route-and-Run order:
   - `Task({ subagent_type: "qa-fast", ... })`
   - `Task({ subagent_type: "<engineer>", ... })` (with qa-fast findings in prompt)
   - `Task({ subagent_type: "code-reviewer", ... })` (model override for high-risk)
   - `Task({ subagent_type: "security-reviewer", ... })` if Gate F triggers
   - `Task({ subagent_type: "qa", ... })` with prompt prefix `Mode: verification`
3. Main Agent writes `workdone-candidate.toml` directly (no Orchestrator teammate).
4. Main Agent runs scope-lock, WORKDONE_REVIEW, PR creation, PR_REVIEW.
5. User approves merge; Main Agent merges and re-indexes.

Path C is functional today — it is the operating model for any issue not routed through `/mode3-run`. The only cost is Opus tokens during orchestration.

---

## Decision matrix

| Symptom | Recommended rollback |
|---|---|
| `mode3-orchestrator` agent definition causes routing failures (e.g. orchestrator refuses to choose a specialist; routing-decision log is malformed) | Immediate rollback (Option A above); use Path C until a corrected `mode3-orchestrator.md` is shipped. |
| `[executor.specialist_policy]` schema misinterpretation causes WORKDONE_REVIEW intake to falsely block | Either fix the intake logic in `/mode3-run` Phase 7 step 2, or immediate rollback. |
| Routing-decision log false-positive flags (Main Agent intake rejects valid runs) | Immediate rollback OR a hotfix to the Phase 7 step 2 verification rules. |
| Agent Teams transport fails (TeamCreate/spawn errors) | Disable env flag `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` per `mode3-agent-teams-rollback.md` Option 1; this still leaves /mode3-run pre-flight to write blocked.toml(AGENT_TEAMS_UNAVAILABLE). Fall back to Path C with user authorisation. |
| Sonnet model proves unreliable for routing decisions | Do NOT auto-swap to Opus/Haiku — that would violate `no_silent_escalation`. Document the failure, open a separate issue to evaluate model choice empirically. |
| Anthropic deprecates Agent Teams entirely | Deeper rollback per `mode3-agent-teams-rollback.md` Option 2. |

---

## Verification after rollback

After any rollback:

1. `rtk git diff --name-status origin/main...HEAD` (verify expected paths reverted; no product code touched)
2. `python3 -c "import tomllib; tomllib.load(open('.claude/templates/approved-execution-handoff.toml','rb')); print('PARSE_OK')"` (template parses on the rolled-back schema)
3. `rtk gh issue create ...` for a tiny throwaway issue and route it through Path C end-to-end (specialist invocations + scope-lock + WORKDONE_REVIEW + PR_REVIEW)
4. Confirm WORKDONE_REVIEW gate still functions on the rolled-back state

---

## Cross-references

- Hardening report: `.claude/hardening/team-lead-orchestration-stability-report.md`
- Agent Teams investigation: `.claude/hardening/agent-teams-investigation-report.md`
- Probe (subagent Task invariant): `.claude/handoffs/agent-team-probe/at01-evidence.txt`
- Probe (team-lead self-block): `.claude/handoffs/agent-team-safety-probe/probe-evidence.toml`
- Design validation: `.claude/hardening/mode3-routing-authority-design-validation.md`
- Earlier rollback (Agent Teams MVP): `.claude/hardening/mode3-agent-teams-rollback.md`
- Approved plan #1098: `.claude/handoffs/issue-1098/002-plan-review-revision.toml`
- PLAN_REVIEW verdict #1098: `.claude/openai-gates/issue-1098/20260515T183534Z-PLAN_REVIEW/verdict.toml`
