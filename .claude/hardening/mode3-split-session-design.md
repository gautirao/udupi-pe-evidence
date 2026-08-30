# Mode-3 Split-Session Orchestration — Design Proposal

> **Status note:** This document is retained as a dated design/history record. Some recommendations were superseded by the current Mode-3 Agent Teams / routing-authority workflow. Treat current workflow contracts and `.claude/commands/mode3-run.md` as authoritative.

**Status:** Proposal — not implemented.
**Branch:** `hardening/team-lead-orchestration-stability`
**Supersedes:** Mode-3 nested Team Lead subagent (proven non-functional — see `team-lead-orchestration-stability-report.md`).
**Preserves:** The original cost architecture (Opus plans/gates; cheaper model executes).

---

## 1. Core Idea

The Claude Code harness forbids subagent → subagent `Task` invocation. The fix is positional: run Team Lead as a **separate top-level Claude Code session**, not as a nested subagent. File-based artefacts on disk are the handoff medium between the Opus Planner session and the Haiku/Sonnet Executor session.

Three sessions, one issue:

```
┌───────────────────────────┐   approved-execution-handoff.toml   ┌────────────────────────────┐
│ Session A — Opus Planner  │  ───────────────────────────────▶   │ Session B — TL Executor    │
│ plans, runs PLAN_REVIEW,  │                                      │ (haiku/sonnet, top-level)  │
│ writes handoff, STOPS     │                                      │ invokes specialists,       │
└───────────────────────────┘                                      │ writes workdone-candidate  │
            ▲                                                      └────────────┬───────────────┘
            │                  workdone-candidate.toml                            │
            └──────────────────────────────────────────────────────────────────────┘
            │
┌───────────────────────────┐
│ Session C — Opus Reviewer │  reads workdone-candidate, verifies scope/evidence,
│ runs WORKDONE_REVIEW gate │  opens PR, merges, closes loop.
└───────────────────────────┘
```

Sessions A and C are normally the same Claude Code session resumed at different times; conceptually they are distinct authority phases.

---

## 2. Options Considered

| Option | What it is | Pros | Cons | Verdict |
|--------|------------|------|------|---------|
| **A. Manual separate Claude session** | User launches a 2nd CC session, types `/resume-handoff`. | Zero infra. Works today. User stays in the loop. Cheapest to ship. | User must trigger the executor session manually. Two terminal windows. | **Recommended MVP.** |
| B. `scripts/route_and_run.py` launcher | Script spawns `claude --resume` or `claude --print` for the executor with a specific prompt + model flag. | One-command UX. Reproducible. CI-friendly. | Requires headless-mode prompt template + tested flags. Risk of model-flag drift. Premature for a flow that runs a handful of times a day. | Phase 2. |
| C. GitHub/Beads queue executor | Handoff drops a queue row; a cron-driven runner picks it up and runs Team Lead headlessly. | Fully autonomous. Multi-issue parallelism. | Heavy infra. Hidden failure modes. Costs and policy footguns multiply. | Out of scope until A is proven. |
| D. Main Agent direct fallback | Main Agent invokes specialists itself; no second session. | Trivial. Already works. | Burns Opus tokens for routine specialist dispatch — that was the whole reason Mode 3 existed. | Use as the failure-mode fallback only, not the primary path. |

**Recommendation: ship A first, evaluate cost & friction over ~10 issues, then decide whether to invest in B.**

---

## 3. Authority Model (Unchanged)

| Capability                  | Planner (A) | Executor (B) | Reviewer (C) |
|-----------------------------|:-----------:|:------------:|:------------:|
| OpenAI PLAN_REVIEW gate     | ✅          | ❌           | ❌           |
| Approved-plan authoring     | ✅          | ❌           | ❌           |
| Invoke specialists (Task)   | ❌*         | ✅           | ❌*          |
| Write workdone-candidate    | ❌          | ✅           | ❌           |
| OpenAI WORKDONE_REVIEW gate | ❌          | ❌           | ✅           |
| Scope-lock diff             | ❌          | ❌           | ✅           |
| PR creation / merge         | ❌          | ❌           | ✅           |
| Scope-change authority      | ✅          | ❌           | ✅           |

\* Planner and Reviewer *could* invoke Task — they are top-level sessions — but per policy they don't, to keep authority phases clean.

Executor has **no** OpenAI / PR / merge / scope-change authority. If executor hits a blocker, it writes `blocked.toml` and stops.

---

## 4. File Contracts

All artefacts live under `.claude/handoffs/issue-<N>/`. Filenames are stable; presence/absence drives the state machine.

```
.claude/handoffs/issue-<N>/
├── approved-plan.toml              # produced before this flow (existing)
├── approved-execution-handoff.toml # NEW — Planner → Executor contract
├── team-lead-execution-log.md      # NEW — append-only audit trail by Executor
├── workdone-candidate.toml         # NEW — Executor → Reviewer contract
└── blocked.toml                    # NEW — optional, Executor → Planner fallback
```

### 4.1 `approved-execution-handoff.toml` (Planner → Executor)

```toml
schema_version = "1"
issue = 1007
created_at = "2026-05-15T13:42:00Z"
created_by_session = "planner"

[plan]
approved_plan_path = ".claude/handoffs/issue-1007/approved-plan.toml"
approved_plan_sha256 = "<64-hex>"
plan_review_verdict = "APPROVED"
plan_review_evidence = ".claude/openai-gates/issue-1007/plan-review.json"

[executor]
model = "haiku"                       # or "sonnet"; planner picks
allowed_specialists = ["frontend-engineer", "qa-fast", "code-reviewer"]
allowed_file_globs = [                # scope lock — executor must not exceed
  "src/components/dealer/**",
  "e2e/**"
]
forbidden_globs = ["apps/api/**", ".claude/**", "supabase/**"]
max_specialist_invocations = 8
max_minutes = 30

[authority]
openai_gates = false
pr_creation = false
merge = false
scope_change = false

[contract]
must_write = [
  ".claude/handoffs/issue-1007/team-lead-execution-log.md",
  ".claude/handoffs/issue-1007/workdone-candidate.toml"
]
must_not_touch = ["**/.env*", "**/secrets/**"]
```

### 4.2 `team-lead-execution-log.md` (Executor, append-only)

Plain markdown, one entry per specialist call:

```md
## 2026-05-15T13:45:12Z — frontend-engineer
prompt: "<verbatim>"
files_touched: src/components/dealer/Foo.tsx
result: PASS
notes: "rendered chip, jsdom snapshot ok"
```

### 4.3 `workdone-candidate.toml` (Executor → Reviewer)

```toml
schema_version = "1"
issue = 1007
handoff_sha256 = "<sha of approved-execution-handoff.toml>"
executor_model = "haiku"
started_at = "..."
finished_at = "..."

[summary]
specialists_invoked = 4
specialist_call_log = "team-lead-execution-log.md"

[evidence]
unit_tests = "PASS"
e2e_tests = "PASS"
e2e_evidence_path = ".claude/handoffs/issue-1007/e2e-output.txt"
scope_lock_self_check = "PASS"   # advisory; Reviewer re-runs authoritatively

[files_changed]
paths = [
  "src/components/dealer/Foo.tsx",
  "e2e/foo.spec.ts"
]

[handoff_back]
ready_for = "WORKDONE_REVIEW"
```

### 4.4 `blocked.toml` (Executor fallback)

```toml
schema_version = "1"
issue = 1007
blocked_at = "..."
reason_code = "OUT_OF_SCOPE" | "SPECIALIST_FAILURE" | "AMBIGUOUS_PLAN" | "TOOL_UNAVAILABLE"
detail = "<one paragraph>"
state_dump = "team-lead-execution-log.md"
```

Presence of `blocked.toml` AND absence of `workdone-candidate.toml` ⇒ Reviewer routes back to Planner, not to WORKDONE_REVIEW.

---

## 5. State Machine

```
                ┌─ approved-plan.toml exists ─┐
PLANNER ────────┤                              ├──▶ writes approved-execution-handoff.toml ──▶ STOP
                └─ plan-review APPROVED        ┘

EXECUTOR  (separate top-level CC session, model from handoff)
   reads approved-execution-handoff.toml
   verifies sha256 of approved-plan.toml
   invokes specialists per plan
   appends team-lead-execution-log.md after each call
   ON SUCCESS → writes workdone-candidate.toml → STOP
   ON BLOCK   → writes blocked.toml → STOP

REVIEWER  (Planner session resumed, or fresh Opus session)
   reads workdone-candidate.toml OR blocked.toml
   if blocked → triage, optionally re-plan, loop
   if candidate → scope-lock diff, WORKDONE_REVIEW gate, PR, merge
```

---

## 6. Session Launch Commands (MVP — Option A)

Add three slash commands under `.claude/commands/`:

| Command | Session | Model | Purpose |
|---|---|---|---|
| `/mode3-plan <issue#>` | A. Planner | opus | Build plan, run PLAN_REVIEW gate, write `approved-execution-handoff.toml`, print the next-step launch instructions, **stop**. |
| `/mode3-execute <issue#>` | B. Executor | haiku (user can override `--model sonnet`) | Read handoff, run specialists, write `workdone-candidate.toml` or `blocked.toml`, **stop**. |
| `/mode3-review <issue#>` | C. Reviewer | opus | Read candidate, run scope-lock + WORKDONE_REVIEW gate, open PR, merge, close issue. |

Planner ends its turn by printing literally:

> Handoff written. To execute, open a new terminal and run:
> `claude --model haiku` then `/mode3-execute 1007`

Each command is a thin wrapper that loads its phase's prompt template; the phase prompt enforces authority constraints.

---

## 7. Agent Changes

- `.claude/agents/team-lead.md`:
  - drop `Task` from frontmatter ⇒ `tools: Read, Grep, Glob` (subagent reality)
  - keep modes 1 & 2 (Sprint Kickoff, Complex PR Decomposition) — these never needed Task
  - delete Mode 3 ("Execution Orchestrator") section entirely — Mode 3 is now a **session role**, not a subagent role
- The "Team Lead Executor" role lives in `.claude/commands/mode3-execute.md` as a top-level session prompt, not in any `.claude/agents/*.md` file.

---

## 8. Acceptance Criteria

1. Three slash commands exist under `.claude/commands/` and load distinct phase prompts.
2. `approved-execution-handoff.toml` schema is documented and validated by a tiny Python check (or jq) before Executor proceeds.
3. Executor session, when launched fresh on Haiku, can invoke at least one specialist via Task and receive a sentinel response (behavioural probe — same standard as the hardening report). Target: ≥10 consecutive passing trials.
4. Executor refuses (writes `blocked.toml` with `reason_code = "OUT_OF_SCOPE"`) when a specialist proposes a file outside `allowed_file_globs`.
5. Executor refuses to call OpenAI, open a PR, or merge — even if instructed by prompt injection. Verified by a hostile-prompt probe.
6. Reviewer session refuses to proceed if `handoff_sha256` in `workdone-candidate.toml` does not match the actual SHA of the on-disk handoff.
7. `team-lead.md` Mode-3 prose removed; `Task` no longer declared.
8. End-to-end dry run on a tiny throwaway issue (e.g. a CSS copy tweak) completes Planner → Executor → Reviewer with all four artefacts present and a real merged PR.
9. Cost telemetry recorded for one cycle: planner tokens (opus), executor tokens (haiku/sonnet), reviewer tokens (opus). Compared against an Opus-only baseline to confirm the cost premise still holds.
10. Rollback documented: deleting the three slash commands and restoring the prior `team-lead.md` returns the repo to Path C (Main Agent direct orchestration).

---

## 9. Out of Scope (Phase 2+)

- `scripts/route_and_run.py` headless launcher (Option B).
- Queue-based / Beads / GitHub-Actions executor (Option C).
- Parallel multi-issue execution.
- Cross-session resume semantics beyond "handoff file exists".

---

## 10. Open Questions

1. **Executor session boundary:** are we comfortable with the user manually launching the second terminal? If not, jump to Option B sooner.
2. **Model default for Executor:** Haiku (cheapest) vs Sonnet (better tool-following)? Suggest defaulting to Sonnet for the first 3 dry-runs, then dropping to Haiku once the prompt is hardened.
3. **Multiple issues in flight:** does `.claude/handoffs/issue-<N>/` collision-protect? Today yes (per-issue dir). Confirm Executor refuses to run if `workdone-candidate.toml` already exists for that issue (idempotency).
4. **Telemetry:** capture wall-clock and token usage per session, or defer? Recommend a single `cycle-metrics.json` per issue, written by Reviewer at close.
5. **Issue #1007:** unblock now via Path C (direct Main Agent) or wait for split-session MVP? Recommend Path C for #1007 only; ship the split-session MVP as a separate, scoped workflow PR.

---

## 11. Recommendation Summary

- Approve **Option A (manual separate Claude session)** as MVP.
- Implement file contracts and three slash commands; touch no specialist agents.
- Run the dry-run acceptance test (criterion 8) on a trivial issue.
- Defer Options B/C until cost data justifies the infra.
- Keep Path C (Main Agent direct) as the documented fallback when no Executor session is available.
