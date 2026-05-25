# SKILL: ROUTE_AND_RUN (microservices, deterministic, token-light)

## Purpose
Route each task to the smallest effective set of pre-defined agents and execute them sequentially.

Do NOT redefine agents.
Do NOT merge agent outputs.
Process: triage → route → sequential agent execution → STOP.

<!-- Line budget: ~650 lines. Routing tables (A–I) extracted to ROUTE_AND_RUN_TABLES.md. -->
**Authority:** `ROUTE_AND_RUN` is the single source of truth for per-PR execution policy: change classification, routing logic, agent invocation rules, reviewer/security retry loops, process-doc review requirements, post-engineer materialization checks, and E2E validation policy. `SPRINT_EXECUTOR_ROLLING_CHECKPOINT` supplies sprint context and records gate outcomes, but must not redefine or override these per-PR rules.

**Return protocol (when invoked from SPRINT_EXECUTOR):** After the final routed agent completes and the E2E gate is satisfied, return control to SPRINT_EXECUTOR — do NOT emit STOP or play Hero chime. SPRINT_EXECUTOR owns the git lifecycle, merge, post-merge steps, chime, and checkpoint. In standalone use (not invoked from SPRINT_EXECUTOR), ROUTE_AND_RUN owns the full lifecycle: play Hero chime and STOP.

## Agents
qa-fast, explorer-planner, backend-engineer, frontend-engineer, supabase-engineer, code-reviewer, performance-analyst, architect, security-reviewer, qa, team-lead, ui-designer

> **ChatGPT-gated mode:** Pre-approval allowed agents are `explorer-planner`, `qa-fast`, `architect`, `ui-designer`, `performance-analyst`, `security-reviewer`. Implementation agents (`frontend-engineer`, `backend-engineer`, `supabase-engineer`, `qa` test-writing) are **blocked** until ChatGPT PLAN_REVIEW returns `verdict = "APPROVED"`. See `.claude/skills/route-and-run/gates.md` § ChatGPT-Gated Mode and § Main Agent role & coding boundary for the full contract. The Main Agent's micro-fix exception (one/two-line mechanical, in-scope, no specialist judgement) is the only orchestrator coding allowance.

> **Main Planner → Mode-3 Agent Teams Orchestrator (`/mode3-run`, optional, Tier 2/Tier 3 + milestone batches):** After PLAN_REVIEW `verdict = "APPROVED"`, Main Agent (Opus) MAY hand execution orchestration to a **Sonnet `mode3-orchestrator` teammate** (top-level Claude Code session in tmux, spawned via Agent Teams — **not** a nested subagent) by invoking `/mode3-run <issue#>` (`.claude/commands/mode3-run.md`). The Orchestrator (`.claude/agents/mode3-orchestrator.md`) decides the per-call specialist sequence per Route-and-Run policy within a Main-Agent-declared boundary; Main Agent verifies the Orchestrator's routing decision log against that boundary before invoking WORKDONE_REVIEW. Agent Teams is the runtime transport; ROUTE_AND_RUN defines the choreography. Authority is unchanged: Orchestrator **cannot** contact ChatGPT, invoke `openai_gate.py`, open PRs, merge, or change scope. Per-issue `approved-plan.toml` + `sha256` binds handoff integrity. File contracts (tracked, committed): `.claude/templates/approved-execution-handoff.toml` (schema v2 with `[executor.specialist_policy]` boundary), `.claude/templates/workdone-candidate.toml` (with `[routing_decision_log]`), `.claude/templates/blocked.toml`, `.claude/templates/team-lead-execution-log.md` (with ROUTING DECISION hard-gate entry). Runtime per-issue artefacts remain under gitignored `.claude/handoffs/issue-<N>/`. Behavioural findings that justified the architecture: `.claude/hardening/team-lead-orchestration-stability-report.md` (subagents structurally cannot invoke `Task`), `.claude/handoffs/agent-team-probe/at01-evidence.txt` (Agent Teams teammate behaviourally can), `.claude/handoffs/agent-team-safety-probe/probe-evidence.toml` (why a dedicated `mode3-orchestrator` agent file is required vs reusing `team-lead.md`).

---

## Step 1 — Quick Triage (ALWAYS)

Output ≤ 8 lines:

- Summary (1 line)
- Type: {bugfix|small-change|feature|refactor|perf|security|incident|ui}
- Scope: {single-service|multi-service|cross-cutting}
- Risk: {low|med|high} + 1 reason
- Classification: {trivial|normal|high-risk|doc-only} (derive using Step 1B below)
-   If trivial → Changed files: [list] | Behavior impact: NONE — [justification]
- Acceptance: max 3 bullets
- Tests: max 3 bullets
- Assumptions: max 2 bullets (only if needed)

---

## Step 1B — Change Classification (ALWAYS, immediately after triage)

Derive the change tier from the triage fields. This is mechanical — do not override.

### Tier definitions

| Tier | Criteria |
|------|----------|
| **Doc-only** | Only `*.md`, `docs/`, non-behavioral config. No code changes. Two sub-tiers: **(a) Low-impact**: README, general docs, comments, typo fixes → commit directly. **(b) Process-doc**: agent prompt files (`.claude/agents/`), routing/skill files (`.claude/skills/`), review templates (`.claude/prompts/`), checkpoint/workflow policy files, `.github/workflows/`, CI/CD config → requires process-doc self-review (see below) before commit. Process-docs can alter system behavior indirectly. |
| **Trivial** | Single-file AND purely non-behavioral AND risk=low. Allowed: copy/text/labels, comments, static styling (CSS-only with no conditional logic), non-executable config (display strings, placeholder text). **Never trivial** (always Normal or higher): logic, control flow, API contracts, persistence/queries, auth/permissions, validation, routing, state management, feature flags, test code, build tooling, CI config, migrations. |
| **Normal** | Any code change with logic/behaviour change that does not meet High-risk criteria. Standard features, bugfixes, refactors, UI components, new endpoints, test-only. |
| **High-risk** | Any change touching: auth/authz/JWT, payments, destructive or schema-altering DDL migrations (ALTER existing column, DROP, data backfill, column rename), RLS policies, PII handling, cross-cutting architecture — OR risk=high in triage. Additive-only migrations (new table, new nullable column, new index) are Normal unless they interact with auth/RLS/PII. Any migration that rewrites existing rows, changes constraints, performs backfill, or may cause significant table locking is High-risk regardless of whether the DDL statement appears "additive." |

**Classification is non-overridable.** If any high-risk condition is present, it is High-risk regardless of LOC count or urgency. If any logic change is present, it cannot be Trivial.

**Tie-breaker:** If classification is uncertain between two tiers, always classify to the stricter tier. Err toward more scrutiny, not less.

### Minimum workflow per tier

| Tier | qa-fast | Engineer | Code-reviewer | Security-reviewer | E2E authoring | QA E2E gate | Pre-push hook |
|------|---------|----------|---------------|-------------------|---------------|-------------|---------------|
| Doc-only | skip | skip | skip | skip | skip | skip | skips (doc pattern) |
| Trivial | skip | see Trivial engineer-test rule below | skip | skip | skip | skip | best-effort local backstop |
| Normal | **conditional** (Standard: required; Lean: skip-eligible — see § Step 1C) | required | required (sonnet) | only if Gate F | **conditional** (qa-fast signal) | **required** | best-effort local backstop |
| High-risk | required | required | required (**opus**) | **required** | **conditional** (qa-fast signal) | **required** | best-effort local backstop |

### Trivial classification evidence (required)

When classifying as Trivial, the orchestrator MUST include in the triage block:
- `Changed files:` [exact file list]
- `Behavior impact: NONE` — [one-line justification why no runtime behavior changes]

If the orchestrator cannot confidently declare `Behavior impact: NONE`, classify as Normal. Trivial is an explicit opt-in with evidence, not a default.

**Trivial engineer-test rule:** Trivial changes may skip engineer tests ONLY when `Behavior impact: NONE` is declared AND the changed file is purely non-executable (e.g., a display string, placeholder text, comment, or static label). If the changed file is executable code (`.java`, `.ts`, `.tsx`, `.kt`, `.sql`, etc.), engineer tests are still required even for Trivial classification.

The pre-push hook runs as a best-effort local backstop for Trivial changes — it is not a guarantee and must not be relied upon as the quality gate.

### Evidence verbosity by tier

- **Doc-only / Trivial:** use compact evidence only — classification, changed files, behavior impact, and gate result.
- **Normal:** use standard evidence — routing used, changed files, tests run, reviewer result, E2E result.
- **High-risk / failure / escalation:** use full structured evidence with rationale and failure details.

Prefer compact status fields over narrative prose unless a gate fails, escalates, or requires manual judgment. If a Normal-risk run encounters a gate failure or escalation mid-flow, switch to full evidence for the failing stage onward.

### Process-doc self-review (required)

Required when doc-only classification involves process-doc files: `.claude/agents/` (agent prompts), `.claude/skills/` (routing/checkpoint files), `.claude/prompts/` (review templates), `.github/workflows/` (CI/CD), or any file that defines workflow gates, classification criteria, or agent boundaries.

Before committing, the orchestrator MUST output this evidence block:

```
## Process-Doc Review Evidence
Change summary: [1-2 sentences]
Affected invariants: [workflow gates / agent boundaries / classification rules / skip conditions touched — or NONE]
Checklist:
- [ ] No quality gates were weakened or removed
- [ ] No agent boundaries were loosened
- [ ] No classification criteria were made more permissive
- [ ] No skip conditions were added without justification
- [ ] Changes are consistent with existing workflow invariants
```

**Scenario walkthrough is required only if the change materially alters routing, classification, retry behavior, gate order, or skip logic.** In that case add:

```
Scenario walkthrough:
- Trivial example: [task] → expected classification: [tier]
- Normal example: [task] → expected classification: [tier]
- High-risk example: [task] → expected classification: [tier]
```

If any checklist item fails or any required scenario produces an unexpected result, escalate to the user before committing.

---

## EXECUTION MODE — EVIDENCE REQUIRED (HARD RULE)

Applies to every issue execution, every classification tier, every agent. No exceptions.

### Forbidden completion claims

The orchestrator MUST NOT emit — and MUST reject from any agent — the following terms when unaccompanied by the mandatory evidence blocks defined in this section:

> `done` · `implemented` · `verified` · `tests pass` · `matches mock` · `complete`

If any such claim appears without the mandatory evidence: output `Status: PARTIAL — evidence missing` for the missing field and re-invoke the responsible agent.

### Preflight Output Block (REQUIRED — no implementation before this)

Before any engineer writes a single line of code, the orchestrator MUST confirm the following block exists in the engineer's output. No implementation is permitted until it is present.

```text
Preflight:
  Issue: <issue number + title>
  Scope: <what is in scope; what is explicitly not>
  Files affected: <list of files expected to change>
  Reuse opportunities: <existing components, hooks, utilities, services to reuse — or NONE>
  Risks: <top 3 — e.g. API contract mismatch, state leakage, cross-layer coupling>
  Test plan: <how the change will be tested — unit, integration, E2E, manual>
```

A missing Preflight block is a protocol violation. The orchestrator must reject the agent output and re-invoke with explicit instruction to produce the block first.

### Mandatory Issue Completion Output Format

Every issue execution MUST end with this block, output by the implementing engineer. The orchestrator MUST verify each field is populated before emitting `All gates satisfied: YES` in the GSR.

```text
Implementation Summary: <1–3 bullets describing what was built>
Files changed: <exact file paths>
Quality Report:
  Frontend (if applicable):
    Reuse: <components/hooks reused — or created fresh + why>
    State management: <approach — local state, TanStack Query, context>
    Duplication avoided: <YES — explain | NO — explain why new code was needed>
  Backend (if applicable):
    API contract: <endpoint + response shape confirmed>
    Service vs controller: <business logic in service layer YES|NO>
    Validation: <input validation present YES|NO + location>
    Backward compatibility: <YES — no breaking changes | NO — breaking change + reason>
  Database (if applicable):
    Indexes: <new indexes added YES|NO + which columns>
    Query pattern: <query type — point lookup, range scan, join>
    Scaling risk: <LOW|MED|HIGH — reason>
Scalability Report: <behaviour at 10x / 100x data or traffic — or N/A>
Verification: <exact test command(s) run + pass/fail result>
Screenshots: <attached | N/A — no UI changes>
Known gaps: <list or NONE>
Claim status: DONE | PARTIAL (<list what is incomplete>) | BLOCKED (<list what is blocking>)
```

**Claim status rules:**
- `PARTIAL` or `BLOCKED` → issue MUST NOT be closed; GSR MUST NOT show `All gates satisfied: YES`.
- `DONE` → all fields above must be populated; Verification must show actual command output, not a narrative.

### Orchestrator quality checks (after engineer returns)

| Field | Failure condition | Action |
|---|---|---|
| `Verification:` | Present but shows no command or shows only "tests pass" | `Status: PARTIAL — evidence missing` + re-invoke engineer |
| `Screenshots:` | Blank when UI was touched | `Status: PARTIAL — evidence missing` + re-invoke engineer |
| `Claim status:` | Missing, or DONE despite open gaps | `Status: PARTIAL — evidence missing` + re-invoke engineer |
| `Files changed:` | Does not match Preflight `Files affected:` with no explanation | Flag discrepancy; engineer must justify delta |

---

## Step 1C — Execution Mode (v2)

Execution mode is **derived** from classification and sprint context. It controls token spend and routing intensity. It does **not** alter classification criteria, gate requirements, or any High-risk behavior.

| Mode | Conditions | Token effect |
|------|-----------|-------------|
| **Lean** | Normal + sprint PR 2+ + Phase 2 active + sprint risk cache covers touched area | qa-fast skip-eligible; style ADVISORY-FIX deferred to TECH_DEBT; ≤2 pre-E2E agents |
| **Standard** | Normal + first sprint PR, OR Phase 2 not yet active | qa-fast required; all ADVISORY-FIX trigger re-run; ≤3 pre-E2E agents |
| **Full Guardrail** | High-risk OR Gate F applies | qa-fast required; all findings mandatory; ≤4 pre-E2E agents |

**Mode does NOT affect:** change classification, E2E gate, review gate, security gate, spec invalidation gate, materialization check, or orchestrator boundaries. High-risk is always Full Guardrail — no exception.

**Agent budget** (non-gate agents — security-reviewer, qa verification, and qa E2E authoring are mandatory gates excluded from this count):

| Mode | Max pre-E2E agents | Typical chain |
|------|--------------------|---------------|
| Doc-only | 0 | — |
| Trivial | 1 | engineer (if code) |
| Normal Lean | 2 | engineer + code-reviewer (if qa-fast triggers → +1, effectively Standard) |
| Normal Standard | 3 | qa-fast + engineer + code-reviewer |
| Full Guardrail | 4 | qa-fast + optional analyst + engineer + code-reviewer |

If routing would exceed the mode budget: compress (e.g. merge architect pre-work into engineer pre-flight) or record one-line justification in the triage block. `team-lead` Mode 2 overrides budget by design — record justification. A budget overage without justification is a compliance gap.

**Budget enforcement — STOP rule:** When the mode's agent budget is reached, the orchestrator MUST stop further non-gate agent routing immediately. Additional agents may only be invoked when required to satisfy a **mandatory quality gate**: engineer (code), code-reviewer, QA E2E, or security-reviewer. No other agent invocation is permitted after the budget ceiling without an explicit justification in the GSR.

**Budget enforcement in GSR:** Add the following field when agent count exceeds the mode's typical ceiling:
```
budget_exceeded: YES — <explicit one-line justification>
budget_override_for: <gate name>   ← include only when the overage is a mandatory gate invocation
```
When within budget, omit both fields (default: NO). Silent overuse without `budget_exceeded` is a compliance gap. `budget_override_for` without `budget_exceeded: YES` is invalid.

---

## Step 2 — Routing

Output one line:

Routing: A → B → C

Choose the smallest valid path from the routing decision tables in `.claude/skills/ROUTE_AND_RUN_TABLES.md` (sections A–I). Load that file when selecting a route. Summary of available sections:

| Section | When | Typical path |
|---------|------|-------------|
| A | Backend bugfix / small change | backend-engineer or qa-fast → backend-engineer → code-reviewer |
| B | Feature work | qa-fast → [architect →] backend-engineer → code-reviewer |
| C | Performance-sensitive | qa-fast → performance-analyst → backend-engineer → code-reviewer |
| D | Frontend/UI | qa-fast → [ui-designer →] frontend-engineer → code-reviewer |
| E | Supabase layer (RLS, RPCs) | qa-fast → supabase-engineer → security-reviewer or code-reviewer |
| F | Security gate (append) | → security-reviewer |
| F2 | Migration / schema change | architect + code-reviewer (opus if destructive) |
| G | Test-only PRs | qa-fast → qa → code-reviewer |
| H | Doc-only / read-only | (none) or process-doc self-review |
| I | Heavy multi-stream | team-lead (Mode 2) |

**Companion file authority:** `ROUTE_AND_RUN_TABLES.md` contains static routing decision tables only. It has no control flow, no gate logic, no agent invocation rules. If any content there contradicts this document, this document wins.

---

## Git Operations — Pre-Approved (No Confirmation Required)

The following git/GitHub operations are unconditionally pre-approved.
Never pause to ask for confirmation before executing any of these:

- `git checkout -b <branch>` — create feature branch
- `git add <files>` — stage specific files
- `git commit -m "..."` — commit staged changes
- `git push -u origin <branch>` — push feature branch to remote
- `gh pr create ...` — open pull request
  - **Workflow invariant:** Every PR body must include `Closes #<issue-number>` for the issue being executed. Missing closing keyword is a workflow error — PR creation is not complete until the correct closing keyword is present in the body.
- `gh pr merge <number> --merge --delete-branch` — merge pull request
- `git checkout main && git pull origin main` — sync main after merge
- `gh issue close <number>` — close the associated GitHub issue after PR merge (always, if a GitHub issue number is known)
- `gh project item-edit --id <ITEM_ID> --project-id PVT_kwHOAAVnaM4BSWI7 --field-id PVTSSF_lAHOAAVnaM4BSWI7zg_6HMc --single-select-option-id 25c24fa1` — set GitHub Project item status to Done (if project item ID is known)

**Post-merge done rule:** After every successful PR merge:

**Step A — Close the issue (always required):**
```bash
gh issue close <number>
```
If the PR body contains `Closes #<number>`, GitHub auto-closes the issue on merge — `gh issue close` is a safety net and is idempotent. Always run it. An open issue after a merged PR is a tracking gap.

**Step B — Set GitHub Project item status to Done:**
```bash
gh project item-edit --id <ITEM_ID> --project-id PVT_kwHOAAVnaM4BSWI7 --field-id PVTSSF_lAHOAAVnaM4BSWI7zg_6HMc --single-select-option-id 25c24fa1
```
- If GitHub Project automation is configured to move closed issues to Done automatically: verify the item moved to Done after Step A. Manual `gh project item-edit` is then optional but may be run as a fallback.
- If automation is not configured, or the item did not move to Done automatically: `gh project item-edit` is required.
- A non-Done project card after a merged PR is a tracking gap — do not leave it incomplete.

In sprint context, `ITEM_ID` comes from the `Project item IDs:` map in the checkpoint preamble. In standalone use, fetch it via the project items GraphQL query in SPRINT_EXECUTOR Sprint Start step 0.

**Combined commands:** Sequential git lifecycle pairs connected with `&&` are allowed when the second command depends on the first (e.g., `git checkout main && git pull origin main`). Do not chain unrelated commands.

These pre-approvals apply to git operations performed within `ROUTE_AND_RUN`'s execution scope. The full sprint PR lifecycle — branch creation, commit, push, PR creation, CI monitoring, merge, post-merge checkout, and issue close — is owned by `SPRINT_EXECUTOR_ROLLING_CHECKPOINT` when invoked from a sprint context. In standalone use, ROUTE_AND_RUN is responsible for the issue close step.

---

## Agent Invocation (Mandatory)

All agents live in `.claude/agents/<name>.md`. Launch each via the **Task tool** in sequence.
Do NOT simulate agents inline. Do NOT merge outputs.

### Agent Registry

| Agent | File | Role | Output |
|-------|------|------|--------|
| `qa-fast` | `.claude/agents/qa-fast.md` | Pre-implementation risk scan | Critical Paths, Edge Cases, Smoke Script, Risks |
| `backend-engineer` | `.claude/agents/backend-engineer.md` | Implements backend code | Working code + tests |
| `frontend-engineer` | `.claude/agents/frontend-engineer.md` | Implements frontend UI code | Working UI code |
| `supabase-engineer` | `.claude/agents/supabase-engineer.md` | RLS policies, storage policies, RPCs, edge function maintenance | Working SQL / TypeScript |
| `code-reviewer` | `.claude/agents/code-reviewer.md` | Reviews completed implementation | APPROVE or REQUEST CHANGES table |
| `architect` | `.claude/agents/architect.md` | API/schema/design decisions | Read-only design output |
| `performance-analyst` | `.claude/agents/performance-analyst.md` | Query/perf analysis | Read-only analysis |
| `security-reviewer` | `.claude/agents/security-reviewer.md` | Security audit | CRITICAL/HIGH/MEDIUM/LOW severity table |
| `ui-designer` | `.claude/agents/ui-designer.md` | Screen audit, UX guidance | Read-only design output |
| `team-lead` | `.claude/agents/team-lead.md` | Decompose + delegate heavy tasks | Subtask plan + agent delegation |
| `qa` | `.claude/agents/qa.md` | **Test-writing mode**: write/update/run automated tests (when explicit authoring required). **E2E authoring mode**: write E2E tests for new cross-layer flows (conditional, triggered by qa-fast). **Verification mode**: run E2E suite, report pass/fail, no code changes (pre-PR quality gate for Normal/High-risk). | Test files (test-writing or e2e-authoring) or pass/fail report (verification) |
| `spec-enricher` | `.claude/agents/spec-enricher.md` | Sprint kickoff only — convert raw issue descriptions to structured specs | Enriched spec blocks (read-only) |

### Invocation Rules

#### Agent Context Loading Rule

When constructing a Task prompt for any agent, the orchestrator MUST:

**Capsule-first (sprint context — when `.claude/state/current-pr.md` exists):**
1. Prepend to every agent Task prompt: `"Read .claude/state/current-pr.md for acceptance criteria and out-of-scope guardrails before starting."` Do NOT paste AC inline — agents read it from the capsule file.
2. For re-entry agents (cycle ≥ 2, i.e. any agent running after a REQUEST_CHANGES cycle): also prepend: `"Read .claude/state/current-pr-fixlog.md for open findings and cycle counters."` First-pass agents do NOT read the fixlog.
3. Include `qa-fast` findings for the current issue only (as inline `qa-fast context:` — these are ephemeral scan results, not in the capsule).
4. Include `Sprint-level conventions` and `Known temporary exceptions` from the checkpoint.
5. Do NOT include: enriched spec text for other issues, previous PRs' evidence blocks, or accumulated conversational history.

**Standalone context (no capsule — when `.claude/state/current-pr.md` does NOT exist):**
1. Include only the enriched spec snippet for the **current issue** (read the relevant section from `.claude/sprint-enriched-specs.md`).
2–5. Same as sprint context items 3–5 above.

Rationale: each agent runs in a fresh context window. The capsule file is a stable, overwrite-protected source for AC and out-of-scope guardrails — it eliminates re-pasting and ensures consistent AC across all agents in a PR cycle. Re-entry agents additionally need the fixlog to reconstruct what has already been found and fixed.

#### Delta-Only Agent Prompts (After PLAN_REVIEW Approval)

Once an architect or ui-designer has approved a design direction and recorded it in `current-approved-plan.toml`, all subsequent agent prompts MUST use delta-only summaries to reduce token waste:

**Delta-only content (required after PLAN_REVIEW):**
- `approved_plan_ref: "<decision-id> from current-approved-plan.toml"`
- `changed_files: [list of actual file changes since last agent]`
- `blockers_and_fixes: [open issues from prior agent, fixes applied]`
- `test_results: [command and result from prior run]`
- `ac_evidence: [which ACs are newly covered by changes]`

**What must NOT be included (forbidden after PLAN_REVIEW):**
- Full PLAN_REVIEW output or architect design doc — link to `current-approved-plan.toml` instead
- Complete issue body or enriched spec — link to `.claude/sprint-enriched-specs.md` instead
- Prior conversation context or agent output summaries — summarize findings only
- Full diff of all files — name changed files only

Rationale: Once planning is complete and approved, re-pasting the full plan and issue context at every agent invocation consumes tokens without adding information. Delta-only prompts keep agents focused on unresolved problems and changes since the last run, cutting token usage by 60–80% without sacrificing fidelity.

---

- **Agent permission mode**: ALL agents MUST be launched with `mode: "dontAsk"`. Do NOT use `mode: "bypassPermissions"` — it skips PreToolUse hooks (e.g. the combined-commands blocker). `dontAsk` auto-approves tool calls while still enforcing hooks.

- `qa-fast` runs BEFORE the engineer writes any code.
  When invoking pre-implementation, use this Task prompt pattern:
  > "Review the codebase and identify risks for this planned change: [paste issue/PR description].
  > The feature does not exist yet — scan the surrounding codebase and flag what could go wrong."

  **qa-fast is always required when ANY condition holds (override Lean skip):**
  1. Classification is High-risk
  2. This is the first PR of the sprint (no sprint risk cache yet)
  3. The PR touches a module, file path, or flow NOT referenced by a `qa-risk:` entry in `Sprint-level conventions`
  4. Backend + frontend coupling is present in this change
  5. Auth, session, or permission changes are in scope

  **qa-fast may be skipped (Lean mode only) when ALL conditions hold:**
  1. Execution Mode is Lean (see § Step 1C)
  2. `Sprint-level conventions` in the checkpoint contains a `qa-risk:` entry explicitly covering the touched area or module
  3. No new cross-layer coupling is present
  4. No auth/session/permission-adjacent paths are in scope

  **qa-risk scope constraint — skip is only valid when the entry covers the same surface:**
  A `qa-risk:` entry may only justify skipping qa-fast if the current change touches the **same surface area**, meaning at least one of:
  - Same frontend component(s) (same `.tsx` file or named component), OR
  - Same backend endpoint(s) (same controller method or route path), OR
  - Same database table(s)
  AND none of the following differ from when the entry was written:
  - API contract (request/response shape, new required field, changed error contract)
  - Validation rules
  - Cross-layer data flow path
  If any of the above differ → qa-fast is REQUIRED (override Lean skip regardless of entry existence).

  **Event/flow heuristic (additional override — qa-fast required even with same surface match):**
  Even when the surface area matches, qa-fast MUST NOT be skipped if the change touches ANY of:
  - Event handlers (`onClick`, `onSubmit`, `onChange`, `useEffect` with side effects)
  - API calls (fetch, axios, service layer invocations)
  - State transition logic (`setState`, reducers, form state, computed/derived state)
  - Conditional rendering that affects flow (not purely cosmetic, e.g. hides/shows a form step)
  These patterns change runtime behavior in ways the original qa-fast scan cannot cover. If any are present → qa-fast is REQUIRED regardless of `qa-risk:` entry existence.

  **qa-risk invalidation triggers:**
  If the current PR includes ANY of the following, `qa-risk:` entries with a **matching `<area>` prefix** are considered **stale** and qa-fast MUST run (even in Lean mode):
  - DB schema change (migration touching existing tables or constraints)
  - API contract change
  - Auth, RLS, or permission logic change
  - Change to a shared utility or core service used by the `qa-risk:` entry's area

  **Invalidation is scoped, not global.** Only entries whose `<area>` prefix matches the affected area are invalidated. Example: a change to `dealer-form` invalidates `qa-risk: dealer-form::*` entries but does NOT invalidate `qa-risk: discovery-api::*` or `qa-risk: auth-flow::*`.

  When qa-fast runs due to invalidation: its new findings MUST overwrite (not append to) the prior `qa-risk:` entries for that area. Add to the Gate Satisfaction Record:
  ```
  qa-risk-invalidated: <area>::* — <reason>
  ```
  A GSR missing this field when invalidation occurred is incomplete — reviewers should flag it.

  When skipping qa-fast, record in Gate Satisfaction Record: `qa-fast: SKIPPED(Lean — qa-risk: <area>::<component|endpoint|table> covers same surface; no contract/validation/flow change)`. A skip record that does not cite the exact `qa-risk:` entry and confirm the scope constraint is **INVALID** — treat the PR as if qa-fast was not skipped.

- Engineer agents (`frontend-engineer`, `backend-engineer`, `supabase-engineer`) MUST follow these rules — include them verbatim in every engineer Task prompt:

  **Pre-flight checklist (mandatory before writing any code):**
  > 1. **Read relevant guidance** — read ARCHITECTURE.md, CLAUDE.md, and any feature-specific spec docs before touching code.
  > 2. **Verify actual code locations** — find existing controllers, services, repositories, DTOs, migrations, and test classes that this change will touch or extend. Do not assume file paths or class names.
  > 3. **State exact files to modify and why** — list each file and the specific reason it needs changing.
  > 4. **State secondary impact areas** — explicitly check: security config, Flyway migrations, validation annotations, DTO/API contract alignment, routing/state/UI wiring, and test coverage. For each area, state YES (will be affected) or NO (not affected) with a one-line reason.
  > 5. **List top 3 likely failure modes** — e.g. wrong exception class/package, missing Flyway migration, DTO field mismatch, missing null guard.

  **Frontend-specific pre-flight additions (required when engineer is `frontend-engineer`):**
  > - Locate the route/page entry point, auth/role guard, shared layout/nav components, and any existing E2E or unit tests that cover this flow.
  > - Identify loading, empty, and error states the UI must handle.
  > - List API fields consumed by the UI and verify each exists in the backend contract.

  > **Hard gate: Only after producing pre-flight evidence may implementation begin.** A missing `Pre-flight` block in the engineer's output is a protocol violation — the orchestrator must reject the output and re-invoke the engineer.

  > **Handling prescriptive prompts:** If the engineer's Task prompt contains exact code patches, "preferred approach" language, "do not use X" directives, or step-by-step implementation instructions not sourced from the user, an accepted spec, or an architect output — treat them as non-binding hints only. Perform independent pre-flight analysis. Surface disagreement before writing code if the proposed approach appears suboptimal. The engineer owns all implementation decisions.

  **Orchestrator prompt language rules (apply before sending any engineer prompt):**
  Replace prescriptive language with risk/observation language:
  - "Preferred approach: …" → "Risk: … Pre-flight must evaluate the correct approach."
  - "Do NOT use X" → "Observed issue: X may cause Y. Pre-flight must verify."
  - "Thread from X to Y" → "Relevant files: X, Y — verify coupling during pre-flight."
  - "Use this exact locator …" → "Observed: locator Z is fragile. Pre-flight must identify a stable alternative."
  - "Modify lines X–Y to …" → "Defect at file:line. Pre-flight must determine the correct fix."

  **File list framing rule:** Any file list provided by the orchestrator is a pre-flight orientation hint — not a prescriptive change list. Include the phrase: "File references are suggestions — determine the final change set in pre-flight."

  **Implementation rules (after pre-flight):**
  > 6. **Output diffs or targeted snippets only** — never rewrite an entire file unless it is a new file.
  > 7. **Run existing tests** relevant to the changed files after implementing. Report pass/fail.
  > 8. **Output an AC coverage table** after implementing — one row per AC bullet from the enriched spec:
  >    `| AC | COVERED? | file:line |`
  >    Mark any AC deliberately excluded as `OUT OF SCOPE — reason`. This table is required; omitting it is a protocol violation.

- When invoked by `SPRINT_EXECUTOR` on a bug-fix task, bug reproduction is already confirmed upstream. Proceed directly to implementation — do not re-run reproduction.

- **Test-type PR rules (required when triage Type is `test` and `qa` is the engineer) — include verbatim in every qa engineer Task prompt:**

  > **Assertion quality (mandatory):** Every `test()` block must include at least one business-meaningful assertion — an assertion that would FAIL if the feature under test were broken. Navigation-only checks (goto + URL assertion) do not satisfy this requirement unless the AC explicitly asks for page reachability only. Ask yourself: "If the feature I'm testing stopped working, would this assertion catch it?" If not, the assertion is not meaningful.
  >
  > **Hard waits are banned:** Do not use `waitForTimeout()` or `page.waitForTimeout()`. Use Playwright's built-in auto-waiting, `waitForSelector`, `waitForResponse`, or network-idle strategies. If a specific timing constraint genuinely requires a hard wait, document it with an inline comment explaining why, and log it in Key decisions — this is the only exception, and it must be explicit.
  >
  > **Test suppression is banned:** Do not use `test.skip()`, `test.fixme()`, or empty test bodies. If an AC cannot be tested because the underlying feature or backend endpoint does not yet exist, mark it `OUT OF SCOPE — [reason]` in the AC coverage table and explain in Key decisions. The issue remains open.
  >
  > **Production code changes — testability hooks only:** The only permitted production code changes in a test-type PR are additive testability hooks such as `data-testid` attributes. No behavioral, business-logic, styling, or refactor changes are permitted. Any added `data-testid` attributes must be listed in Changed files and noted in Key decisions. Prefer `data-testid` over CSS classes, `nth-child`, or DOM structure for selectors.

- After `qa-fast` completes, include its key findings (Critical Paths, Edge Cases, Risks) in the engineer's Task prompt as `qa-fast context:`. These findings must feed into pre-flight steps 2–5, not just the implementation step. This lets the engineer skip redundant codebase exploration and address flagged risks proactively.

  **qa-fast output scope constraint (orchestrator must enforce):** When passing qa-fast output to the engineer, include only:
  - risks (what could go wrong)
  - edge cases (boundary conditions to consider)
  - likely relevant files (for pre-flight orientation — not a prescriptive file list)
  - missing coverage gaps
  - open questions requiring engineer judgment

  Do NOT pass forward (strip before including in engineer prompt):
  - "preferred approach" or "do X not Y" language
  - resolved trade-offs (the engineer must resolve trade-offs in pre-flight)
  - state threading instructions or specific hook/API recommendations
  - naming decisions (test IDs, variable names, helper names)

  **qa-fast is a risk scanner, not an implementation designer.** If qa-fast output contains implementation prescriptions, the orchestrator strips them before forwarding — pass the underlying risk, not the proposed solution.
- If the routing includes `security-reviewer`, add this note to the engineer's Task prompt: `Security review will follow — pay attention to: input validation, RLS alignment, no secrets in code, @Transactional boundaries.`
- If previous PRs in the same sprint had reviewer BLOCKING findings, include those patterns as warnings in the engineer's Task prompt (e.g., "Prior sprint finding: use List<> not Optional<> for non-UNIQUE FK queries").
- `code-reviewer` runs AFTER the engineer completes the implementation.
- Skip `code-reviewer` only when: risk=low AND change is single-file AND no logic/behaviour changes (e.g. a constant, label, or config value).
- If `code-reviewer` returns REQUEST CHANGES: engineer fixes, `code-reviewer` re-runs once.
- If still REQUEST CHANGES after one re-run: play `afplay /System/Library/Sounds/Basso.aiff`, stop and surface to user.
- **ADVISORY sub-classification (code-reviewer MUST tag each advisory):**
  - **ADVISORY-FIX** — Low-effort, high-value fix that the engineer should address before merge. Criteria: can be fixed in < 15 min AND reduces real risk. Examples: missing test cases for covered logic, extract-method for duplicated code, constants extraction for magic values, off-by-one in boundary checks.
  - **ADVISORY-DEFER** — Tracked for follow-up but does not block the current PR. Examples: architecture concerns requiring design decisions, integration test infra that doesn't exist yet, cross-cutting refactors spanning multiple modules.
  - After code-reviewer completes, the orchestrator MUST re-invoke the engineer for ALL **ADVISORY-FIX** items (same cycle as BLOCKING, just lower priority). ADVISORY-DEFER items are logged in the checkpoint Risks section AND appended to `.claude/TECH_DEBT.md` (grouped by backend/frontend/database/infra). The tech debt log is reviewed at sprint end.
  - If the code-reviewer does not tag advisories, the orchestrator classifies them: default to FIX unless effort > 30 min or the fix requires design decisions spanning multiple modules. Log the classification and reason in the checkpoint Risks section.
  - **Lean mode ADVISORY-FIX override (Normal Lean only — see § Step 1C):** In Lean mode, ADVISORY-FIX items are sub-classified before deciding whether to trigger an engineer re-run:
    - **ADVISORY-FIX-QUALITY** (engineer re-run required in ALL modes): off-by-one, missing assertions for covered logic, missing null guards on inputs with boundary behavior, broken contract alignment.
    - **ADVISORY-FIX-STYLE** (Lean mode: deferred to TECH_DEBT, no engineer re-run): extract-method, constants extraction for magic values, rename, comment improvement. **Scope constraint:** an item may only be classified as ADVISORY-FIX-STYLE if it does NOT relate to performance, accessibility, security, data correctness, or user-visible functional ambiguity. If any of these are in scope, classify as ADVISORY-FIX-QUALITY.
    - **Tie-breaker:** If sub-classification is unclear between STYLE and QUALITY, default to ADVISORY-FIX-QUALITY (more scrutiny, not less).
    - When ALL remaining ADVISORY-FIX items are STYLE in Lean mode: code-reviewer does NOT re-run. When ANY QUALITY items remain: delta review is still required after engineer fix.
    - Standard and Full Guardrail modes treat all ADVISORY-FIX as QUALITY — no sub-classification needed.
- `qa` in **E2E authoring mode** runs AFTER code-reviewer (and security-reviewer if applicable) APPROVE, BEFORE `qa` verification mode, for Normal and High-risk changes only. Conditional — triggered only when qa-fast recommended `E2E authoring recommended: YES`.
  When invoking E2E authoring mode, use this exact Task prompt:
  > "Mode: e2e-authoring. Write E2E tests for the new/modified user flow introduced by this change. Follow TOOLING.md E2E test placement rules. qa-fast context: [paste qa-fast E2E justification]. Changed files: [list files]. Implementation summary: [1-2 line summary of what the engineer built]. Run the new/updated spec file(s) using a targeted Playwright command to confirm the authored tests pass. Only run the full suite (`npm run test:e2e:local`) if targeted validation is not feasible. Do NOT modify implementation code."

  **Skip conditions** (orchestrator skips E2E authoring even when qa-fast says YES):
  - Triage Type is `refactor` AND ALL of: no new UI route, no new API endpoint, no changed user-visible workflow step, AND qa-fast did not signal missing E2E coverage for this path
  - An existing E2E spec file that explicitly covers this specific user flow is identified — the orchestrator MUST cite the spec file path AND the specific test name (e.g. `dealer-listing-form.spec.ts → "should submit listing form"`) — either qa-fast cited it by name, or the orchestrator located it via Grep — AND qa-fast recommended NO

  **Uncertainty tie-breaker:** If it is unclear whether the change introduces or modifies a cross-layer flow requiring E2E authoring, default to YES. The skip conditions above are the only valid escape hatches.
- `qa` in **verification mode** runs AFTER all reviewers APPROVE (and after E2E authoring if applicable), BEFORE commit/push/PR, for Normal and High-risk changes only.
  When invoking verification mode, construct the Task prompt based on context:

  **Default (standalone or no targeted-files override):**
  > "Mode: verification. Run the full E2E suite (`npm run test:e2e:local`) and report results. Do NOT write or modify any code. Do NOT fix failing tests. Report pass/fail with exact failure output for any failures. Changed files in this PR: [list files]. Classification: [normal|high-risk]."

  **Targeted-first (when sprint context provides `targeted_files` and no full-suite trigger):**
  > "Mode: verification. Run targeted E2E first: `npx playwright test [targeted_files] --project=chromium`. If all targeted tests pass, report PASS (targeted-only). Do NOT run the full suite unless a targeted test fails. Do NOT write or modify any code. Report pass/fail with exact failure output for any failures. Changed files in this PR: [list files]. Classification: [normal|high-risk]."

  **Full-suite triggers (override targeted-first back to full suite):** every 3rd PR in a sprint, last PR in the sprint, PR modified any shared fixture file (`e2e/fixtures/`, `e2e/pages/`, `global-setup.ts`, `playwright.config.ts`), or PR modified auth/session setup.

  If QA reports FAIL, apply the Failure Routing Protocol in Step 3. Do NOT proceed to commit/push/PR until QA reports PASS.

#### QA Targeted Rerun Protocol (Cycle 2+)

**Activation condition:** `.claude/state/current-pr-fixlog.md` exists AND `qa-verify-cycles` ≥ 1. When this condition is met, this protocol replaces the default full-suite re-run. When the condition is NOT met (cycle 1, or no fixlog), use the standard verification mode prompts above.

**Rerun scope priority (orchestrator must attempt in this order):**
1. **Test-level rerun** — if the Playwright runner supports `--grep "<test name>"`, rerun the exact failing tests: `npx playwright test --grep "<pattern>" --project=chromium`
2. **Spec-level rerun** — if test-level is not feasible, rerun only the failing spec files: `npx playwright test [spec-file-paths] --project=chromium`
3. **Full suite** — only if neither narrower scope is technically possible; must be stated explicitly with a one-line reason

**QA Task prompt — prepend verbatim before the standard verification prompt:**
> "This is a targeted rerun (cycle 2+). Do the following in order:
> 1. Read `.claude/state/current-pr.md` for AC and out-of-scope context.
> 2. Read `.claude/state/current-pr-fixlog.md`. Identify all QA Failures rows where Status is OPEN or STILL_OPEN — these are the only failures requiring a verdict.
> 3. Build rerun scope from those rows using the priority order: test-level → spec-level → full suite (only if narrower scope is not possible; state why if falling back to full suite).
> 4. Run only the in-scope tests. Do NOT run the full suite unless the fallback applies.
> 5. For each QA Failures row: state FIXED (now passes), STILL_OPEN (still fails), or NEW (newly discovered failure not in prior rows). Include exact failure output for STILL_OPEN and NEW.
> 6. Do NOT re-raise failures already marked FIXED or DEFERRED."

**What must NOT happen on cycle 2+:** running the full suite without stating why narrower scope was not possible; silently dropping or recreating QA Failures rows; losing stable row identity across cycles.

**Invariants preserved:** all existing QA gate semantics, escalation triggers, and the maximum 2 fix-verify cycles rule (Failure Routing Protocol) remain unchanged.

#### Code-Reviewer Invocation Protocol

When invoking `code-reviewer`, the orchestrator MUST construct a structured review brief. Never send a vague prompt like "review this" or "check for issues."

**Step 1 — Determine review_mode:**
- `.java`, `.kt`, migrations, backend config → `review_mode: backend`
- `.tsx`, `.ts` in `src/`, frontend hooks/components → `review_mode: frontend`
- Both layers changed → prefer **two separate calls** (one backend, one frontend) for higher quality. Use `review_mode: both` only for small mixed changes.

**Step 2 — Determine model override:**
- risk=high (auth, payments, migrations, data integrity, concurrency) → add `model: opus` to the Task invocation
- risk=low or risk=med → use default (sonnet)

**Step 3 — Construct the review brief using the template:**
- Backend → fill in `.claude/prompts/code-review-backend.md`
- Frontend → fill in `.claude/prompts/code-review-frontend.md`
- Always fill in: `pr_summary`, `change_intent`, `changed_files`
- Include `known_repo_rules` when the change touches established patterns (see list below)
- Include `risk_notes` when triage identified specific concerns
- **When invoked from SPRINT_EXECUTOR**: include `ac_checklist` — paste the enriched spec AC bullets verbatim. Instruct the reviewer: "For each AC, state PRESENT or MISSING in the diff. A MISSING item that the engineer did not mark OUT OF SCOPE is a BLOCKING finding."

**Known repo rules** (pass to reviewer when relevant — reviewer must not flag these):
- CSS display-toggle for wizard panels (preserves image upload state)
- `applyVideoUrl: boolean` for partial-update APIs
- NaN-safe clamp: `Math.max(1, Math.min(N, parseInt(param, 10) || 1))`
- Hook-level `onError` only (double-toast prevention)
- `DragEvent` dispatch for file drops in E2E (`zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))`) — fiber-walk removed in #667
- `UriComponentsBuilder.build(false)` for user-input query params
- Leaflet `invalidateSize()` before `flyTo()` in hidden containers
- `house` type for E2E tests (avoids type-specific required fields)
- Radix Slider `role="slider"` is on Thumb, not Root

**Test-type PR focus areas (required when triage Type is `test`) — add to review brief:**

Include the following `focus_areas` when reviewing test-only PRs. These are BLOCKING-eligible — the reviewer may classify any finding as BLOCKING if the test would pass even if the feature under test were broken.

- `assertion_meaningfulness`: Flag any test block whose assertions would still pass if the feature under test were removed or broken. Navigation-only checks (page load + URL match) do not count as meaningful assertions unless the AC is explicitly about page reachability. Trace each assertion to a specific behavior the AC requires.
- `no_op_and_suppression`: Flag empty test bodies, TODO/FIXME placeholders, `test.skip()`, `test.fixme()`, `test.describe.skip()`, or any equivalent suppression. These are BLOCKING — a suppressed test is not a merged test.
- `hard_waits`: Flag `waitForTimeout()` or `page.waitForTimeout()`. Any hard wait without an accompanying inline comment explaining why Playwright's built-in waiting is insufficient is BLOCKING.
- `selector_fragility`: Flag selectors using CSS class names, `nth-child`, positional DOM traversal, or other implementation-coupled selectors. `data-testid`, `getByRole`, `getByLabel`, and `getByText` are preferred. ADVISORY-FIX unless the fragile selector is on a frequently-changing path, in which case BLOCKING.
- `seed_and_mock_leakage`: Flag assertions that verify hard-coded seed data literals (specific IDs, specific strings from the test database) rather than testing business behavior. ADVISORY-FIX.
- `testability_hook_scope`: If the PR adds `data-testid` attributes to production code, verify that (a) each attribute is listed in Changed files, (b) the attribute name is stable and does not expose implementation internals, (c) no other production code was changed.

**Step 3b — Passing findings to the engineer (MANDATORY rule):**

After `code-reviewer` returns REQUEST CHANGES, the orchestrator re-invokes the engineer. The findings passed to the engineer MUST describe defects — they must NOT prescribe fixes.

The orchestrator MUST:
- describe **what is wrong** (defect)
- explain **why it is wrong** (reason / risk)
- point to the **relevant file and location** (reference)

The orchestrator MUST NOT:
- provide exact before/after code
- specify exact line replacements
- prescribe dependency arrays, hook structures, or API call bodies
- provide copy-paste patch instructions

The engineer is responsible for determining the fix during pre-flight.

**Example — correct (defect + reason + location):**
```
code-reviewer finding:
File: src/components/broker/AddressPicker.tsx, useEffect at line ~193
Defect: The useEffect dependency array may be incomplete — a variable used inside the callback is not listed as a dependency.
Risk: Stale closure on async resolution if the variable's reference changes between renders.
Pre-flight must: verify all variables captured by the effect closure and confirm the dependency array is exhaustive.
```

**Example — incorrect (patch instruction — FORBIDDEN):**
```
Change line 260:
}, [initialLocality, initialLatitude, initialLongitude]);
to:
}, [initialLocality, initialLatitude, initialLongitude, toast]);
```

**Step 4 — Summarize results back to user/checkpoint:**
- Preserve severity (BLOCKING/ADVISORY/SUGGESTION)
- Preserve exact file:line references
- Separate backend and frontend findings if both were reviewed
- Never dilute BLOCKING findings in the summary
- **Agent-to-Checkpoint Warning Channel:** Any agent (`qa-fast`, `code-reviewer`, `security-reviewer`, `architect`, etc.) can emit structured warnings that are captured in the checkpoint's `Risks` field. Format:
  ```
  ROUTE_AND_RUN_WARNING: <severity:LOW|MED|HIGH> <message>
  ```
  Example from code-reviewer: `ROUTE_AND_RUN_WARNING: MED This PR introduces a second error response format. Consider standardizing in a follow-up.`
  After each agent completes, parse agent output for any `ROUTE_AND_RUN_WARNING:` lines and collect them. Append all collected warnings to the checkpoint's Risks section with prefix `[<agent-name>] <severity>: <message>`.

#### Delta-Only Re-Review Protocol (Cycle 2+)

**Activation condition:** `.claude/state/current-pr-fixlog.md` exists AND `code-review-cycles` ≥ 1. When this condition is met, this protocol replaces the default full-diff review. When the condition is NOT met (cycle 1, or no fixlog), use the standard Code-Reviewer Invocation Protocol above.

**Baseline refresh rule (orchestrator, before every cycle-2+ reviewer invocation):** Always capture a fresh baseline at the current HEAD immediately before invoking the reviewer — run `git rev-parse HEAD` and write the result to `baseline_sha` in the fixlog, overwriting any prior value. This baseline is scoped to the next delta-review cycle only; it is refreshed again before each subsequent cycle. Do not reuse a stale baseline from a prior cycle.

**Reviewer Task prompt — prepend verbatim before the standard review brief:**
> "This is a delta-only re-review (cycle 2+). This review is scoped to unresolved findings and the code delta since the last review — you must not re-review the full PR from the beginning. Do the following in order:
> 1. Read `.claude/state/current-pr.md` for AC and out-of-scope context.
> 2. Read `.claude/state/current-pr-fixlog.md`. Identify all Findings rows where Status is OPEN or STILL_OPEN — these are the only prior findings requiring a verdict.
> 3. Run `git diff <baseline_sha>..HEAD` (substituting the actual SHA from the fixlog) to see only the changes since the last review.
> 4. For each OPEN/STILL_OPEN finding: state FIXED, STILL_OPEN, or NEW (new problem introduced by the fix, at a potentially different location). Include a file:line reference for each verdict.
> 5. You may raise NEW findings for problems introduced by the fix that were not in the original review — these get the next monotonic ID in the fixlog.
> 6. Do NOT re-raise findings already marked FIXED or DEFERRED unless a new issue is introduced adjacent to them.
> 7. Re-verify any AC item that the fix may have affected."

**What must NOT happen on cycle 2+:** re-reading the full PR diff from the beginning; re-raising already-FIXED findings; producing a fresh full review brief that ignores the fixlog.

**Invariants preserved:** `ac_checklist` (step 3 of standard protocol), `review_mode` (step 1), and `model` override (step 2) remain unchanged. ADVISORY-FIX and ADVISORY-DEFER still apply to any new issues discovered on cycle 2+.

- `security-reviewer` always runs last when the Security Gate (F) applies.
- `team-lead` only routes to agents — it does not implement code itself.

---

## Decision Lock (After Code-Reviewer APPROVE)

After code-reviewer signals APPROVE and before proceeding to QA E2E gate, settled product and architecture decisions must be locked:

**When a decision was approved during planning (via architect, ui-designer, or team-lead output):**
1. Capture the decision in `current-approved-plan.toml` under a `[decision_lock]` section with the exact decision ID and rationale.
2. Record the approval evidence: agent name, output file reference, decision date.
3. Write to Gate Satisfaction Record: `decision_lock: <decision-id> approved by <agent>, recorded in current-approved-plan.toml`.

**Later agent behavior (cycle 2+, code-reviewer re-review, QA findings):**
- Later agents MUST NOT reopen locked decisions.
- If a code-reviewer challenges a locked decision, classify it as either:
  - **Implementation non-compliance** (code doesn't match the approved decision) → re-invoke engineer to fix alignment
  - **BLOCKER_REVIEW** (new evidence invalidates the approved plan) → surface to user with new evidence cited; do not proceed without explicit decision override
- QA findings that conflict with a locked decision are treated as implementation bugs (engineer fix), not design issues.

**Invariant:** A locked decision remains final unless explicitly overridden by user or architect. It is not revisited during normal code review or testing cycles.

---

## Step 3 — QA E2E Gate

### When it runs (per classification tier)

| Tier | QA E2E gate | Pre-push hook |
|------|-------------|---------------|
| Doc-only | skip | skips (doc pattern match) |
| Trivial | skip | skips (marker or runs if no marker) |
| Normal | **must be evaluated** — recorded as PASS or explicit documented SKIP under applicability rules (see below) | skips if marker exists |
| High-risk | **must be evaluated** — recorded as PASS or explicit documented SKIP under applicability rules (see below) | skips if marker exists |

### E2E applicability rules (Normal and High-risk)

| PR type | E2E required? | Rationale |
|---------|--------------|-----------|
| Frontend — new page/route | YES — full suite | New routes could break existing navigation |
| Frontend — existing page change | YES — full suite | Could break rendering |
| Backend — API consumed by existing FE page | YES — full suite | API contract change could break FE |
| Backend — all five skip conditions confirmed (see below) | SKIP — `SKIPPED(backend-only, no FE files, no FE consumer, no contract change, no cross-layer flow)` | No frontend path affected |
| Doc-only / Trivial | SKIP | No runtime change |

**Backend-only skip conditions — ALL five must be confirmed before skipping:**
1. No frontend files changed
2. No existing frontend consumer depends on the changed backend behavior
3. No API contract, response shape, or schema change affects an existing frontend consumer
4. No qa-fast or routing evidence of a new or modified cross-layer user flow
5. No uncertainty about frontend impact

**When in doubt, do not skip.** If any condition is unconfirmed or uncertain, E2E must run. The skip reason in the Gate Satisfaction Record must be recorded as `SKIPPED(backend-only, no FE files, no FE consumer, no contract change, no cross-layer flow)` — using the shortened form `SKIPPED(no FE consumer)` is no longer valid for backend skips; all five conditions must be named.

**Invalid skip reasons (never accepted):**
- `SKIPPED(no E2E infra)` — not applicable; this project has full E2E infrastructure.
- `SKIPPED(no FE consumer)` — only valid as part of the full five-condition check above, not standalone.
- `SKIPPED(server not running)` — servers must be started before invoking QA; "server not running" is not a skip reason, it is a BLOCKED condition. Surface the failure to the user.

### Gate sequence (Normal and High-risk only)

After code-reviewer (and security-reviewer if applicable) APPROVE:

**Mandatory server check:** Before invoking QA, both frontend (Vite dev server) and backend (Spring Boot) must be running. If either is not running, start it. Do NOT pre-check and skip — "server not running" is not a valid skip reason. If a server fails to start, surface as BLOCKED.

1. **E2E authoring check** — if qa-fast output includes `E2E authoring recommended: YES` AND skip conditions are not met, invoke `qa` in **E2E authoring mode**.
2. **E2E applicability check** — if the PR matches a SKIP row in the applicability table above, record the skip reason and proceed to commit/push/PR. Do NOT invoke QA verification mode.
3. Invoke `qa` agent in **verification mode** (see Invocation Rules above for exact prompt).
4. QA reports structured result: pass count, fail count, exact failure details.
5. **If PASS** — proceed to commit/push/PR.
6. **If FAIL** — enter Failure Routing Protocol below.

### PR creation is a gated state transition

PR creation (commit → push → `gh pr create`) is **not** a step that happens eventually after agents finish. It is a state transition that is **only permitted** when ALL of the following are satisfied:

| Gate | Required for | Evidence |
|------|-------------|----------|
| Engineer materialization PASS | Normal, High-risk | Materialization check output (Post-Engineer Materialization Check) |
| Engineer tests pass | Normal, High-risk; Trivial per engineer-test rule (Step 1B) | Engineer's test results in output |
| Code-reviewer APPROVE | Normal, High-risk | Reviewer verdict |
| Security-reviewer APPROVE | High-risk + Gate F | Reviewer verdict |
| QA E2E PASS | Normal, High-risk | QA verification report |
| Trivial evidence | Trivial only | Changed files + behavior-impact: NONE declaration |
| Process-doc review | Doc-only (process sub-tier) | Process-Doc Review Evidence block (see Step 1B) |

If ANY required gate is not satisfied, the orchestrator MUST NOT proceed to commit/push/PR. There is no "commit now, fix later" path.

### Failure Routing Protocol

```
QA reports FAIL
  │
  ▼
Orchestrator reads QA report:
  - Which test(s) failed?
  - Which engineer(s) ran in this routing chain?
  - Check early escalation triggers (see Rules below)
  │
  ▼
Re-invoke RESPONSIBLE ENGINEER (see Responsibility Assignment below) with:
  - Their changed file list
  - Exact failure output from QA
  - Instruction: fix the issue, run unit tests, report changes
  │
  ▼
Re-invoke QA verification mode (cycle 2)
  │
  ├─ PASS → proceed to commit/push/PR
  │
  └─ FAIL → HARD STOP (cycle 2 exhausted)
           Play afplay /System/Library/Sounds/Basso.aiff
           Surface to user, emit BLOCKED checkpoint
```

**Rules:**
- **Maximum 2 fix-verify cycles**: Engineer gets two attempts. Escalate to user after second failure.
- **Early escalation triggers** (escalate after cycle 1 instead of allowing cycle 2):
  - Ownership is ambiguous (failure doesn't clearly map to one engineer)
  - Failure is cross-cutting (spans frontend + backend layers)
  - Failure appears flaky or environmental (non-deterministic, stack health issue)
  - Engineer's cycle-1 fix did not change any of the failing test's impacted files
- **QA never fixes code**: QA reports pass/fail. The engineer diagnoses and fixes. QA re-verifies only.
- **Orchestrator never fixes code**: route the failure, do not interpret test output and apply inline fixes.
- **No dismissing failures**: all failures must be surfaced verbatim. The orchestrator cannot decide failures are "minor" or "known" without user approval.
- **Flaky/environmental failures still block**: failures classified by QA as `likely-flaky` or `environmental` still block PR creation — they are not auto-dismissed. However, they should not be automatically treated as feature regressions owned by the implementing engineer unless QA's triage evidence links the failure to the changed files. When escalating flaky/environmental failures, include QA's failure character classification so the user can make an informed decision.

### Test-type E2E failure attribution (when triage Type is `test`)

When the implementing agent is `qa` (test-type PR per section G), E2E failures require attribution before routing:

**Scenario A — failing spec was created or modified by THIS PR:**
Treat as a test bug, not an app regression. Re-invoke `qa` agent with the exact failure output. Standard one-retry rule applies. After qa fixes the test, **re-invoke code-reviewer for a delta review** — pass only the diff since the original APPROVE with instruction: "Delta review: these lines changed after your original APPROVE to fix a failing E2E test. Check for: weakened assertions, added hard waits, removed test blocks, suppression (`skip`/`fixme`), or any change that makes the test less rigorous. Verdict: APPROVE or REQUEST CHANGES." If REQUEST CHANGES: standard fix cycle. If still failing after one qa retry: surface to user, do not proceed.

**Scenario B — failing spec was NOT modified by THIS PR:**
This is not the current PR's fault. Do NOT route the failure to the current PR's `qa` agent.
1. If sprint context is available: check if the failing spec was introduced by an earlier sprint PR (compare against `Touched files` in previous checkpoints). If yes: classify as `cross-PR regression`. Surface to user: "Spec `<name>` introduced by RE-XX is failing during RE-YY's E2E run. This is not RE-YY's fault. Options: (a) fix the earlier spec now, (b) quarantine and continue, (c) pause." Log `ROUTE_AND_RUN_WARNING: MED Cross-PR regression: <spec-name>` in Risks.
2. If no sprint context, or the spec predates this sprint: classify as `pre-existing regression`. Surface to user with the same options.
3. In all Scenario B cases: the current PR's E2E gate is BLOCKED until the user decides. The orchestrator does NOT auto-dismiss.

### Responsibility assignment (for failure routing)

1. **Primary rule**: route to the implementation agent whose changed files are in the failing test's execution path. If only one engineer ran → that engineer.
2. **Ambiguity rule**: if multiple engineers ran and the failure doesn't clearly map to one layer, route to the **first implementation agent in the routed chain that made code changes for this ticket**.
3. **Escalation rule**: if the responsible engineer's cycle-1 fix does not resolve the failure AND ownership remains ambiguous, escalate to user immediately — do not bounce between agents.

Heuristics (inform, not override, the rules above):
- E2E tests in `e2e/broker-*` or UI-interaction failures → likely frontend-engineer
- API response errors, 4xx/5xx status codes in test output → likely backend-engineer
- Database constraint violations, migration errors → likely backend-engineer

### Pre-push hook: smart backstop with marker deduplication

The `.githooks/pre-push` hook uses a marker-based approach:

1. **Doc-only changes** → skips E2E (same as before)
2. **`.e2e-passed` marker exists and SHA matches HEAD** → skips E2E (already verified by QA gate or prior run)
3. **No marker or stale marker** → runs full E2E suite (catches manual pushes outside the workflow)

The hook also writes the marker on success, so retries and subsequent pushes of the same commit skip.

This eliminates redundant E2E runs for workflow-driven pushes while preserving safety for manual pushes. See `.claude/E2E_GATE.md` for the full design.

If the pre-push hook fails (no marker, stale marker, E2E actually fails): play `afplay /System/Library/Sounds/Basso.aiff`, surface the failure to the user and stop. Do NOT auto-fix.

---

## Execution Rules (Mandatory)

- Agents execute sequentially.
- Do NOT merge agent outputs.
- After final routed agent completes, run Step 3 (QA E2E Gate). If gate PASS (or skipped for Trivial/Doc-only): play `afplay /System/Library/Sounds/Hero.aiff`, append a brief entry to `.claude/SHIP_LOG.md` and update `.claude/STATE.md` "Recent Completions" and "Session Continuity", then STOP (standalone only — see Return protocol when invoked from SPRINT_EXECUTOR). When invoked from SPRINT_EXECUTOR, skip the chime/ship-log/state steps — SPRINT_EXECUTOR owns those via steps 7, 9b, 9c.
- Do NOT suggest improvements beyond scope.
- Single forward pass by default.
- Re-runs are allowed only through the defined retry paths: engineer materialization failure (Post-Engineer Materialization Check), reviewer REQUEST CHANGES, ADVISORY-FIX remediation, and QA failure routing (Step 3).
- Prefer qa-fast over qa unless explicit test-writing required.

---

## Orchestrator Boundary Rules (Mandatory)

### MUST NOT

1. **Write or edit code** — not source, not tests, not config, not SQL. Not even "trivial one-line fixes."
2. **Run tests** — not `mvn test`, not `npm test`, not `npm run test:e2e:local`. Delegate to engineer (unit/integration) or QA (E2E verification).
3. **Run build commands** — not `npm run build`, not `mvn compile`.
4. **Interpret test failures as acceptable** — if a test fails, route to agent. Never skip.
5. **Apply reviewer findings directly** — always re-invoke the responsible engineer.
6. **Override the E2E gate** — if classification is Normal or High-risk, QA E2E must run (or be explicitly satisfied by a valid skip reason per the E2E applicability rules). No exceptions. Run `npm run test:e2e:local` unconditionally; do not pre-check server availability. "Backend not running" is not a valid skip reason — if a server fails to start, surface as BLOCKED. `SKIPPED(no E2E infra)` and `SKIPPED(server not running)` are never valid — see the "Invalid skip reasons" section in Step 3.
7. **Reclassify to dodge gates** — if triage says risk=med or the change has logic, it cannot be Trivial.
8. **Resolve implementation decisions before engineer pre-flight.** This includes:
   - choosing implementation approach or design pattern
   - specifying state ownership or data-flow strategy
   - defining component/service structure
   - deciding API field propagation
   - defining UI behavior details (hook types, dep arrays, locator patterns)
   - defining naming conventions (test IDs, variables, helpers)
   - writing patch-level instructions derived from qa-fast or code-reviewer findings

   When a design or implementation ambiguity is detected, pass it forward as a **risk**, **defect description**, or **open question** — not as a resolved solution. If an engineer prompt contains implementation-prescriptive language without a valid cited source (user instruction, accepted spec, or architect output), the orchestrator must rewrite the prompt before invoking the engineer.

   **Reading rule:** The orchestrator may read repository files for classification, routing, and verification (e.g., confirming a fix was applied). It must not perform engineer-level implementation planning — reading full file contents to author patch instructions is overreach.

### MUST

1. Route decisions — select agents, construct prompts, sequence invocations.
2. Parse agent outputs — extract verdicts, warnings, failure details.
3. Manage git operations — commit, push, PR creation, merge.
4. Emit checkpoints — under SPRINT_EXECUTOR.
5. Escalate to user — when max fix cycles exhausted or conflict detected.
6. Enforce stage gates — no skipping, no shortcuts.

**Why this matters:** Orchestrator inline fixes lose specialist context, bloat the main conversation window, and have proven to introduce cross-file dependency bugs (RE-110: import fixes required multiple rounds because the orchestrator missed cross-file dependencies when applying fixes directly).

---

## Post-Engineer Materialization Check (Mandatory)

After every engineer agent run (for Normal and High-risk code tasks), the orchestrator MUST validate the following before proceeding to code-reviewer:

1. **Pre-flight evidence present** — the engineer's output includes a `Pre-flight` sub-block in Engineer Evidence with all 5 fields populated.
2. **Changed files non-empty** — `Changed files:` lists at least one file. An empty list for a code task is a materialization failure.
3. **Implementation artifact present** — the agent returned a branch name (default mode), or a `worktreePath` if and only if the run was explicitly started in worktree mode. A narrative summary with no associated file changes is hallucinated output.
4. **Summary consistent with changed files** — the implementation summary references files that appear in `Changed files:`. A summary describing 10+ files while `Changed files` lists 0 is a contradiction.
5. **Engineer Evidence block complete** — all required fields present: Pre-flight, Changed files, Tests run, Test results, Failures, AC coverage.

**If any check fails:**
- Do NOT pass engineer output to code-reviewer. Treat the run as invalid.
- Re-invoke the engineer agent with: (a) the specific failed check(s) named explicitly, (b) the original qa-fast context, (c) the full enriched spec.
- If materialization fails on the second run: play `afplay /System/Library/Sounds/Basso.aiff`, emit BLOCKED checkpoint with `Engineer materialization: FAIL` in the Gate Satisfaction Record, and surface to user. Do NOT proceed.

**Not applicable to:** read-only agents (qa-fast, code-reviewer, security-reviewer, architect, ui-designer, performance-analyst) or Doc-only changes.

---

## Spec Invalidation Check (sprint context only)

After materialization passes and before proceeding to code-reviewer, if the current execution is invoked from SPRINT_EXECUTOR (enriched spec ACs are available), examine the engineer's AC coverage table:

- If any AC is marked `OUT OF SCOPE — [reason]`: emit `ROUTE_AND_RUN_WARNING: MED Deferred AC: [AC bullet] — [reason]` for each. These warnings flow to the checkpoint Risks section via the standard warning channel.
- **Acceptable reasons:** "backend endpoint not yet implemented", "UI component does not exist yet", "feature is behind a disabled flag". These are logged — they do not block code-reviewer.
- **Unacceptable reasons:** "already covered by existing test" (unless the engineer cites the exact spec file path AND test name), "out of scope" without explanation, or no reason given. Treat these as engineer materialization failure — re-invoke the engineer per the materialization retry rules above.
- **50% safeguard:** If 50% or more of the enriched spec's AC bullets are OUT OF SCOPE: play `afplay /System/Library/Sounds/Ping.aiff`, surface to user: "Over half of this issue's acceptance criteria are OUT OF SCOPE. The spec may be misaligned with the codebase. Do not proceed without explicit user decision." This is a HARD STOP — do not proceed to code-reviewer until the user responds.

Record result in Gate Satisfaction Record as:
`Spec invalidation: CLEAN | PARTIAL(N of M ACs deferred — reasons logged in Risks) | N/A(standalone or no enriched spec)`

**Not applicable to:** standalone ROUTE_AND_RUN invocations (no enriched spec available), Doc-only, or Trivial changes.

---

## Stage Evidence Contract (Mandatory)

Each stage must produce minimum structured evidence. Missing evidence is a gate failure — the orchestrator must not proceed.

### Engineer output (required)
```
## Engineer Evidence
Pre-flight:
  Guidance read: [ARCHITECTURE.md, PR_RULES.md, feature spec, other files consulted]
  Files inspected: [list of existing files surveyed before coding]
  Planned files to modify: [list with reason for each]
  Secondary impact areas: [security config | migrations | validation | DTO/API contract | routing/state/UI | tests — or NONE]
  Likely failure modes: [top 3 — e.g. wrong exception pattern, cross-module repo violation, missing null guard]
Frontend checks (required for frontend-engineer, N/A otherwise):
  Route/page entry point: [file:line or N/A]
  Auth/role guard impact: [affected guard or NONE]
  Loading/empty/error states handled: [YES — component:line | NO — reason]
  API fields verified against contract: [YES | field-name missing from contract]
Changed files: [list with file paths]
Tests run: [exact command]
Test results: [X passed / Y failed / Z skipped]
Failures: [details or NONE]
AC coverage:
| AC | COVERED? | file:line |
Claim status: DONE | PARTIAL (<list what is incomplete>) | BLOCKED (<list what is blocking>)
```

> **Evidence gate (orchestrator):** If `Claim status` is not `DONE`, or if `Tests run` is absent/narrative-only, or if `Screenshots` is blank for a UI change — the orchestrator MUST output `Status: PARTIAL — evidence missing` and re-invoke the engineer before proceeding to code-reviewer.

### Code-reviewer output (required for Normal/High-risk)
```
## Review Evidence
Verdict: APPROVE | REQUEST CHANGES
Review mode: backend | frontend | both
Model: sonnet | opus
Findings: [BLOCKING/ADVISORY-FIX/ADVISORY-DEFER/SUGGESTION with file:line]
- Each ADVISORY must be tagged FIX or DEFER — if the reviewer omits the tag, the orchestrator classifies per the rules in the Invocation Rules section
```

### QA verification output (required for Normal/High-risk)
```
## E2E Verification Report
[Full format as defined in qa.md Verification Mode section]
```

### Security-reviewer output (required when Gate F applies)
```
## Security Review Evidence
Verdict: APPROVE | REQUEST CHANGES
Findings: [CRITICAL/HIGH/MEDIUM/LOW with file:line and exploit path]
```

### Orchestrator gate log (required — output before commit)
```
## Gate Satisfaction Record

Gate outcomes should be recorded in compact status form by default (e.g. `classification=normal`, `materialization=PASS`, `reviewer=APPROVE`, `security=N/A`, `e2e=PASS`). Add prose only when a gate fails, escalates, or requires explanation.

Classification: [tier]
Execution mode: Lean | Standard | Full Guardrail | N/A(trivial|doc-only)
Classification evidence: [changed files + behavior impact for trivial; or N/A]
qa-fast: RAN | SKIPPED(Lean — qa-risk: <area>::<component|endpoint|table> covers same surface; no contract/validation/flow change) | SKIPPED(trivial) | SKIPPED(doc-only)
Engineer tests: PASS | FAIL | SKIPPED(trivial, non-executable)
Code-reviewer: APPROVE | N/A(trivial)
Security-reviewer: APPROVE | N/A
E2E authoring: DONE | SKIPPED(qa-fast=NO) | SKIPPED(trivial) | SKIPPED(doc-only) | SKIPPED(refactor-single-service) | SKIPPED(backend-only, no FE files, no FE consumer, no contract change, no cross-layer flow)
QA E2E: PASS | SKIPPED(trivial) | SKIPPED(doc-only) | SKIPPED(backend-only, no FE files, no FE consumer, no contract change, no cross-layer flow)
E2E coverage relevance: COVERED | GAP(no auth fixture) | GAP(no spec for flow) | N/A(backend-only) | N/A(trivial) | N/A(doc-only)
Engineer materialization: PASS | FAIL | N/A(doc-only) | N/A(trivial)
Spec invalidation: CLEAN | PARTIAL(N of M) | BLOCKED(50%+) | N/A(standalone)
Process-doc review: PASS | N/A
All gates satisfied: YES
```

If the orchestrator cannot output `All gates satisfied: YES`, it MUST NOT proceed to commit/push/PR.

If `Engineer materialization` is not `PASS` for Normal or High-risk code tasks, `All gates satisfied` cannot be `YES`.

**GSR derivability invariant:** Every field in the GSR MUST be derivable from actual execution in this PR cycle — not inferred from memory or prior PRs. Specifically:
- If `qa-fast: SKIPPED(Lean — ...)`: the cited `qa-risk:` entry MUST exist verbatim in `Sprint-level conventions` at the time of skip. A skip citing an entry that does not exist in the checkpoint is an INVALID record.
- If `code-reviewer: APPROVE` but ADVISORY-FIX-STYLE items were deferred: those items MUST appear in TECH_DEBT.md at commit time. An APPROVE with undocumented deferred style items is an incomplete record.
- If `budget_exceeded` is absent: actual agent count must be ≤ mode ceiling. If reviewer finds more agents ran than the ceiling permits without this field, flag as compliance gap.
