# Team Lead Orchestration Stability — Hardening Report

**Branch:** `hardening/team-lead-orchestration-stability`
**Base sha:** `0eb211e8af3eaca2d503a90fa31da6ef86cccbfb`
**Date:** 2026-05-15
**Author:** Main Agent (sandbox hardening run, no OpenAI, no PR)

---

## Executive Summary

**Recommendation: Path C — Team Lead cannot be trusted with `Task` in the current Claude Code harness. Retire Team Lead as a Mode-3 active subagent invoker. Main Agent must directly invoke specialists.**

Root cause (behavioural evidence, 7/7 trials):

> The Claude Code harness enforces a structural rule: **`Task` is not available inside subagents.** Any agent declaring `tools: Task, ...` in its frontmatter receives that declaration silently dropped when it runs as a subagent. There is no model, prompt, target-specialist, or frontmatter variant that bypasses this.

This invalidates the post-#1085 / post-#1093 "Task = CALLABLE" runtime probe conclusion, which was based on Team Lead **self-report** of its visible tool schema rather than on an **actual specialist invocation returning a sentinel**. The probe template at `.claude/templates/runtime-probe.md` correctly warns that "declared ⊇ schema-visible ⊇ callable" — the schema-visible layer is exactly what gave false confidence here.

Confidence: **HIGH.** 7/7 deterministic failure across haiku/sonnet/default-model, full and minimal prompts, two distinct target specialists. The verbatim harness error message is explicit and consistent.

---

## Baseline

- `.claude/agents/team-lead.md` frontmatter: `tools: Task, Read, Grep, Glob` (Path B, post-#1093)
- `model: opus` with Mode-3 caller passing `model: "haiku"`
- All authority flags remain false (no OpenAI/PR/merge/scope-change authority granted to Team Lead during this run).
- No product code changes on the branch.
- WIP screenshots/log stashed to `pre-hardening-stash`.

---

## Probe Design

A passing probe required behavioural proof — a specialist actually invoked through Task returning a sentinel string `PROBE_OK_<TRIAL_ID>`. Self-report by Team Lead ("Task appears in my schema") was explicitly rejected.

Each trial spawned a fresh Team Lead via `Agent(subagent_type=team-lead, ...)` and asked it to call `Task(subagent_type=qa-fast, prompt="Reply EXACTLY: PROBE_OK_<id>")`. Pass = the trial output line `SPECIALIST_RESPONSE: PROBE_OK_<id>`.

---

## Trial Results

| #   | model   | target        | prompt-variant       | result | verbatim error |
|-----|---------|---------------|----------------------|--------|----------------|
| T01 | haiku   | qa-fast       | full Mode-3 framing  | FAIL   | "Task tool not available in this runtime environment" |
| T02 | haiku   | qa-fast       | full Mode-3 framing  | FAIL   | **"Task is not available inside subagents"** |
| T03 | haiku   | qa-fast       | full Mode-3 framing  | FAIL   | "no Task tool in my available function set" |
| T04 | sonnet  | qa-fast       | concise              | FAIL   | "Task tool is not available in this environment" |
| T05 | default (opus) | qa-fast | concise              | FAIL   | "Task tool is not available in this agent's tool set" |
| T06 | haiku   | qa-fast       | minimal, no framing  | FAIL   | "Tool 'Task' is not available" |
| T07 | haiku   | code-reviewer | concise, alt target  | FAIL   | **"No such tool available: Task. Task is not available inside subagents."** |

**Pass rate: 0/7.** The user's success-standard of ≥10 consecutive passing trials is unreachable; the failure is deterministic and harness-imposed, not stochastic. Additional same-condition trials would only re-confirm the invariant.

### Variant coverage achieved
- **Models tested:** haiku, sonnet, default (opus) — all FAIL
- **Prompts tested:** full Mode-3, concise, minimal-no-framing — all FAIL
- **Targets tested:** qa-fast, code-reviewer — all FAIL
- **Frontmatter variants:** not pursued. The verbatim error explicitly identifies the constraint as *positional* ("inside subagents"), not declarative. Frontmatter edits cannot move a subagent out of the "inside-a-subagent" position.

---

## Root-Cause Hypothesis (HIGH confidence)

Claude Code's harness implements a hard rule: **the `Task` tool is provisioned only to the top-level orchestrator (Main Agent).** When a subagent is spawned, the harness strips `Task` from its callable set regardless of:
- the agent's frontmatter `tools:` line
- the user's `.claude/settings.json` `Task(*)` allow rule
- the model assigned to the subagent
- the prompt phrasing

This is not configurable from inside the repo. The `.claude/` configuration that previously suggested otherwise (e.g., `team-lead.md` lines 5/15, `runtime-probe.md`, the #1093 evidence) was authored against a self-reported schema view, not against behavioural execution.

### Why prior probes appeared to pass
The #1093 runtime probe asked Team Lead "is Task in your tool schema?" Team Lead answered "yes" (truthful — the harness leaks the declared name into the schema view) and reported `callable_tools = ["Task", ...]`. No actual specialist was ever invoked. The first time real Mode-3 work tried to use Task (Issue #1007), it emitted TOOLING_BLOCKED — that was the harness rule finally surfacing.

---

## Recommended Path: **Path C — Retire Team Lead as Mode-3 Orchestrator**

### Workflow changes

1. **Main Agent becomes the Mode-3 Execution Orchestrator.** After PLAN_REVIEW APPROVED, Main Agent (not Team Lead) directly invokes specialists via Task per the approved-plan TOML.
2. **Team Lead retained for Modes 1 & 2 only** — sprint kickoff analysis and complex PR decomposition. These modes are advisory/planning; they don't invoke Task. Team Lead's existing frontmatter (`tools: Task, Read, Grep, Glob`) should drop `Task` to reflect reality:
   ```
   tools: Read, Grep, Glob
   ```
3. **Mode 3 invocation no longer routes through Team Lead.** ROUTE_AND_RUN's post-approval step becomes:
   - Main Agent reads `APPROVED_EXECUTION_HANDOFF`
   - Main Agent verifies sha256 of `approved-plan.toml`
   - Main Agent invokes specialists in the order specified by the plan
   - Main Agent runs scope-lock diff, OpenAI WORKDONE_REVIEW gate, PR creation, merge
4. **Haiku token-economy concern (the original motivation for Haiku Team Lead in Mode 3):** Main Agent is already opus; the savings hypothesis was that a Haiku Team Lead would dispatch specialists cheaply. Since Team Lead can't dispatch at all, this saving was illusory. If cost is a concern, address it by selecting cheaper specialist models, not by inserting a non-functional orchestration layer.
5. **Update `.claude/templates/runtime-probe.md`** to require *behavioural* proof (specialist sentinel return) before any `Task=CALLABLE` claim. Self-report of schema visibility is insufficient.

### Proposed acceptance criteria for the workflow change
- `team-lead.md` frontmatter no longer declares `Task`.
- ROUTE_AND_RUN docs (`.claude/skills/ROUTE_AND_RUN.md`, `SKILL.md`) describe Mode 3 as Main-Agent-orchestrated; no Mode-3 Team Lead handoff.
- `APPROVED_EXECUTION_HANDOFF` template no longer references Team Lead as recipient.
- `tooling-blocked.toml` template can be retired (no more Team Lead Task probes needed).
- A new behavioural probe template requires a sentinel return.

### Should Issue #1007 proceed?
**Yes — via direct Main Agent orchestration.** Do not retry Mode-3 Team Lead handoff for #1007. Apply the workflow change first (or run #1007 ad-hoc under the new model and let the workflow PR follow).

---

## Files Touched During Hardening

- `.claude/hardening/log.md` (new — trial log)
- `.claude/hardening/team-lead-orchestration-stability-report.md` (this file)

No edits were made to `.claude/agents/team-lead.md`, ROUTE_AND_RUN, settings, or any product code. The branch is clean apart from the two new files under `.claude/hardening/`.

---

## Rollback

```
rtk git checkout main
rtk git branch -D hardening/team-lead-orchestration-stability
rtk git stash pop   # restore pre-hardening screenshots/log WIP
```

The hardening files do not exist on `main`; deleting the branch removes them.

---

## Final Git Status (at report time)

Branch `hardening/team-lead-orchestration-stability`. Untracked under `.claude/hardening/`:
- `log.md`
- `team-lead-orchestration-stability-report.md`

No commits made. No push.

---

## Open Questions for User

1. Approve Path C? If yes, I'll draft the workflow PR on a fresh branch (`workflow/retire-mode3-team-lead`) — separate from this hardening branch.
2. Should Issue #1007 be unblocked immediately via direct Main Agent orchestration, ahead of the workflow PR landing?
3. Keep this hardening branch as a forensic record, or delete after the workflow PR merges?
