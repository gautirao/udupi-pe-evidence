---
name: route-and-run
description: Execute GitHub issues using the preserved ROUTE_AND_RUN per-PR orchestration and SPRINT_EXECUTOR_ROLLING_CHECKPOINT sprint-level coordination. Includes full gate preservation, evidence contract validation, ChatGPT approval loop, QA E2E integrity, checkpoint/resume protocol, and no inline code fixes.
---

# Route and Run Skill — entrypoint

This is a **thin entrypoint / loader**. It tells you when to use Route-and-Run, which authoritative documents to load, and the non-negotiable invariants. It does **not** restate the per-PR policy — that lives in the authoritative docs below.

## When to use

- **Single issue execution** (standalone mode) — one GitHub issue end-to-end.
- **Sprint execution** (sprint mode) — a milestone/iteration of issues with checkpoints.
- **Resume** — after context loss or interruption.

## Authoritative documents (load on demand)

| Need | Load |
|---|---|
| Per-PR policy: triage, change classification, execution mode, routing, agent invocation, evidence contracts, materialization, spec-invalidation, QA/E2E gate, failure routing, orchestrator boundary, GSR | **`.claude/skills/ROUTE_AND_RUN.md`** (authoritative) |
| Routing tables A–I (which agents for which change) | **`.claude/skills/ROUTE_AND_RUN_TABLES.md`** (authoritative) |
| Gate packet schemas + gate operations: OpenAI-gate CLI, PLAN_REVIEW / WORKDONE_REVIEW TOML, verdict parsing, approved-plan materialisation, scope-lock & drift control, optional review gates, handoff storage | **`.claude/skills/route-and-run/gates.md`** |
| Sprint-level orchestration: issue ordering, dependencies, checkpoint/resume, merge/close lifecycle, post-merge regressions | **`.claude/skills/SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md`** (authoritative) |
| Hands-off Mode-3 execution of an approved issue (Agent Teams executor) | **`.claude/commands/mode3-run.md`** + **`.claude/mode3/contracts/*`** |
| Routing recommendation analysis (sprint kickoff / complex decomposition) | `.claude/agents/team-lead.md` (Modes 1 & 2 only) |

**Authority order:** `ROUTE_AND_RUN.md` is the single source of truth for per-PR execution policy; `SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md` is authoritative for sprint-level orchestration. If `ROUTE_AND_RUN_TABLES.md` contradicts prose, the table wins. This entrypoint never overrides those docs.

## Single-issue vs sprint vs resume

- **Mode 1 — Single Issue (standalone):** triage → classify → route → execute agents (per `ROUTE_AND_RUN.md`) → QA/E2E gate → PR/merge → stop. Gate packets per `gates.md`.
- **Mode 2 — Sprint:** sprint identity → fetch issues → spec enrichment → `team-lead` pre-flight → checkpoint → per-issue Route-and-Run loop with auto-advance after merge. Owned by `SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md`.
- **Mode 3 — Resume:** load minimal durable state (`.claude/STATE.md`, `.claude/SPRINT_CHECKPOINT.md`, `.claude/state/current-approved-plan.toml`, `current-pr-fixlog.md` if in progress, `git status`); continue from the in-flight recovery point. Do not reload full conversations/logs.
- **Hands-off Mode-3 execution** of an approved issue (distinct from "Mode 3 resume"): use `/mode3-run <issue#>` — see `.claude/commands/mode3-run.md`.

## Cost-aware tiers (orchestration heaviness — does not weaken classification or gates)

| Tier | Typical issue | ChatGPT gate | WORKDONE_REVIEW |
|------|---------------|--------------|-----------------|
| Tier 0 — Tiny | typo, copy, mechanical config | optional | optional |
| Tier 1 — Small | one-file behaviour fix, narrow rule | optional | optional |
| Tier 2 — Medium | multi-file/cross-layer feature/bugfix, URL-state, single-screen Figma | **required** | usually required |
| Tier 3 — Large | API contract, migration, multi-screen journey, security-sensitive | **required** | **required** |

Tier controls orchestration heaviness only. Change classification (doc-only / trivial / normal / high-risk) and all quality gates are governed by `ROUTE_AND_RUN.md` and are non-overridable.

## Non-negotiable invariants (summary — authoritative detail in the docs above)

- **Implementation agents are blocked** until ChatGPT PLAN_REVIEW returns `verdict = "APPROVED"`. Read-only planning agents (`explorer-planner`, `qa-fast`, `architect`, `ui-designer`, `performance-analyst`, `security-reviewer`) are allowed pre-approval. (`gates.md`)
- **All quality gates mandatory; no shortcuts:** PLAN_REVIEW, code-reviewer, security-reviewer (Gate F), QA/E2E, WORKDONE_REVIEW, PR_REVIEW. Token-efficiency controls never skip a gate. (`ROUTE_AND_RUN.md`, `gates.md`)
- **Change classification is non-overridable;** execution mode is derived, not chosen. (`ROUTE_AND_RUN.md`)
- **Scope-lock — no automatic bypass:** every changed file must be in the approved plan's `allowed_files` or pass SCOPE_CHANGE_REVIEW. (`gates.md` Scope Lock & Drift Control)
- **Max 2 fix-verify cycles per agent per PR;** escalate to user after cycle 2. Authoritative rule: `.claude/skills/ROUTE_AND_RUN.md` — Failure Routing Protocol (2-cycle reroute / skip authority).
- **No inline code fixes by the orchestrator** beyond the narrow Main-Agent micro-fix exception (one/two-line, mechanical, in-scope, no specialist judgement, no API/data/auth/security/UX/perf implication, only to unblock). (`ROUTE_AND_RUN.md` Orchestrator Boundary Rules)
- **Durable truth files:** ChatGPT conversation = review history; `current-approved-plan.toml` = execution truth; `SPRINT_CHECKPOINT.md` = resume truth. Approved-plan integrity is anchored by sha256. (`gates.md`)
- **Local E2E is the primary merge gate** (CI green is a bonus; block only on code failure, not infra failure).
- **Mode-3 only:** Main Agent owns all OpenAI gates / PR / merge / scope; the execution owner (`mode3-orchestrator`) cannot contact ChatGPT, invoke `openai_gate.py`, open PRs, merge, or change scope. Sub-agents use their configured/default models unless specifically justified. (`.claude/commands/mode3-run.md`, `.claude/mode3/contracts/*`)

## Usage examples

**Standalone issue (ChatGPT-gated, Tier 2):**
```
Use the route-and-run skill to execute issue #123. Fetch, triage, classify, invoke
explorer-planner if Tier 2+, decide architect, assemble the PLAN_REVIEW TOML (gates.md)
to .claude/handoffs/issue-123/001-plan-review-request.toml, and STOP for ChatGPT review.
On APPROVED, materialise per gates.md and route implementation per ROUTE_AND_RUN.md.
Run WORKDONE_REVIEW before PR. Local E2E is the merge gate.
```

**Sprint kickoff:** Use Mode 2 per `SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md` (declare identity, fetch issues, spec-enrich, team-lead pre-flight, checkpoint, then per-issue loop).

**Resume (post-compaction):** Load minimal durable context only (STATE.md, SPRINT_CHECKPOINT.md, current-approved-plan.toml if present, fixlog if in progress, `git status`); continue from the in-flight recovery point.

**Hands-off execution of an approved issue:** `/mode3-run <issue#>` (`.claude/commands/mode3-run.md`).
