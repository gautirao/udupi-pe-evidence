---
name: route-and-run
description: Execute GitHub issues using the preserved ROUTE_AND_RUN per-PR orchestration and SPRINT_EXECUTOR_ROLLING_CHECKPOINT sprint-level coordination. Includes full gate preservation, evidence contract validation, ChatGPT approval loop, QA E2E integrity, checkpoint/resume protocol, and no inline code fixes.
---

# Route and Run Skill

## When to use

- Single issue execution (standalone mode)
- Sprint execution with checkpoint (sprint mode)
- Resume after context loss or interruption

## Operating principles

**Authority & Non-Override:**
- ROUTE_AND_RUN.md is the authoritative source for per-PR execution policy: change classification, routing, agent invocation rules, evidence gates, review/security retry loops, materialization checks, spec invalidation, E2E gate policy.
- SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md is the authoritative source for sprint-level orchestration: issue ordering, dependency handling, checkpoint persistence, resume behavior, merge/close lifecycle, post-merge regressions.
- This skill compresses both into interactive workflow without redefining or overriding existing semantics.
- When ambiguity exists between source docs and this skill, source docs are authoritative.

**Core guardrails:**
- No CI assumption (local E2E is primary gate)
- ChatGPT-gated PLAN_REVIEW + WORKDONE_REVIEW (compact TOML by default — see § ChatGPT-Gated Mode)
- Implementation agents are blocked until ChatGPT returns `verdict = "APPROVED"` on PLAN_REVIEW
- Checkpoint/resume protocol fully preserved
- All gates mandatory; no shortcuts
- Orchestrator boundary rules strictly enforced: no inline code fixes (narrow Main Agent micro-fix exception only — see § Main Agent Role)
- Maximum 2 fix-verify cycles per agent per PR (escalate to user after cycle 2)

---

## Main Agent Role & Coding Boundary

The **Main Agent** is the lifecycle owner and routing orchestrator — **not** the default coder. Substantive code goes to specialist engineer agents.

### Responsibilities (Main Agent)

- Fetch GitHub issue, comments, labels, milestone, linked context
- Classify tier/risk (Step 2 / Step 3)
- Enter **PLAN_ONLY** mode when ChatGPT-gated mode is active (default)
- Invoke read-only planning agents when useful (see § ChatGPT-Gated Mode → Pre-approval read-only allowance)
- Decide whether `architect` is needed (see § Architect Trigger Rule)
- Assemble compact **TOML PLAN_REVIEW** package
- Handle ChatGPT verdict and revise if needed
- Materialise the approved plan to `.claude/state/current-approved-plan.toml`
- Update `.claude/SPRINT_CHECKPOINT.md` and `.claude/STATE.md`
- Route implementation to specialist engineer agents (`frontend-engineer`, `backend-engineer`, `supabase-engineer`, `qa`)
- Enforce gates, scope lock, evidence contracts
- Detect blockers/deviations and route to BLOCKER_REVIEW / CLAIM_REVIEW / WORKDONE_REVIEW (see § Optional Review Gates)
- Coordinate PR/merge/cleanup/pull/reindex

### Coding boundary (Main Agent micro-fix exception)

Main Agent MAY make a code edit only when **all** of the following hold:

1. The change is a one- or two-line **mechanical** fix
2. It is **inside the approved scope** (file family allowed by `current-approved-plan.toml`)
3. **No specialist judgement** is required
4. **No** API / data / auth / security / UX / performance implication
5. The change exists only to **unblock progress** for a specialist agent already running

Allowed examples: typo, import path correction, obvious config string, mechanical formatting required by prior agent output.

Forbidden examples (always route to specialist):

| Work | Owner |
|------|-------|
| React component behaviour | `frontend-engineer` |
| Backend controller / service / repository logic | `backend-engineer` |
| Flyway migrations, schema design | `backend-engineer` (+ architect if shape matters) |
| RLS policies, Supabase storage policies, RPCs, edge function maintenance | `supabase-engineer` |
| Auth / security logic, session handling | `backend-engineer` + `security-reviewer` |
| API contract changes, DTO shape changes | `backend-engineer` (+ architect) |
| URL-state logic, deep-link routing | `frontend-engineer` (+ architect) |
| Figma-parity UI work | `frontend-engineer` (+ optional `ui-designer`) |
| Performance-sensitive logic | `backend-engineer` / `frontend-engineer` (+ `performance-analyst`) |
| Test writing or non-trivial test execution | `qa` |
| Code review | `code-reviewer` (security-sensitive: `security-reviewer`) |
| UX review / design exploration | `ui-designer` |

If a "two-line mechanical fix" is tempting but fails any of the 5 conditions above: **stop and route to the appropriate specialist** instead. Bloated Main Agent context and cross-file dependency bugs are the historical reason this boundary exists.

**Pre-approval scope of the micro-fix exception:** The micro-fix exception does NOT apply to application code before ChatGPT PLAN_REVIEW returns `verdict = "APPROVED"`. The only edits the Main Agent may make before approval are **process / handoff files**: `.claude/state/*.toml`, `.claude/handoffs/**`, `.claude/SPRINT_CHECKPOINT.md`, `.claude/STATE.md`, and the agent's own scratch notes. Any application file (`src/**`, `backend/**`, `tests/**`, `e2e/**`, migrations, config, SQL) is forbidden territory until PLAN_REVIEW approval lands, regardless of how trivial the change appears.

---

## Cost-Aware Issue Tiers (ChatGPT-Gated Mode)

Tiering controls how heavy the orchestration is. It does **not** weaken classification (Step 3) or any quality gate. ChatGPT-gated mode applies by default at Tier 2 and Tier 3.

| Tier | Typical issue | ChatGPT gate | Architect | Team Lead | Explorer/Planner | Specialist engineer | WORKDONE_REVIEW |
|------|---------------|--------------|-----------|-----------|------------------|---------------------|-----------------|
| **Tier 0 — Tiny** | typo, copy fix, comment, mechanical config string | optional (only if user requests) | no | no | no | only if coding judgement required | optional |
| **Tier 1 — Small** | one-file behaviour fix, narrow validation rule | optional | only if system shape changes | no | optional | required when code change exists | optional |
| **Tier 2 — Medium** | multi-file feature/bugfix, cross-layer flow, URL-state, Figma parity for one screen | **required** (PLAN_REVIEW + usually WORKDONE_REVIEW) | when shape/contract/UX matters | no | recommended | required | usually required |
| **Tier 3 — Large** | API contract change, migration, multi-screen Figma journey, security-sensitive feature | **required** | **required** | only if 3+ independent workstreams | required | required (often multiple) | **required** |

Examples:

- *Tier 0:* "Fix label 'Add Listing' → 'Add listing'" → Main Agent may handle directly inside the micro-fix boundary, or route to `frontend-engineer` if any judgement is needed.
- *Tier 1:* "Validate phone number is 10 digits before submit" → `frontend-engineer` only; ChatGPT gate skippable unless user opts in.
- *Tier 2:* "Wire selected-school radius panel to property filter request" → explorer-planner → architect (skip if shape obvious) → PLAN_REVIEW TOML → `frontend-engineer` + `backend-engineer` → code-reviewer → qa → WORKDONE_REVIEW.
- *Tier 3:* "Introduce school-journey URL contract + paginated school marker layer" → explorer-planner → architect → optional team-lead → PLAN_REVIEW → multi-engineer routing → WORKDONE_REVIEW.

Tier is recorded in PLAN_REVIEW TOML as `classification`. Tier upgrades happen freely; downgrades require explicit justification in the GSR.

---

## Modes

### Mode 1: Single Issue (Standalone)

- User provides issue URL or number
- Triage → classify → route → execute agents → E2E gate → PR creation/merge → ship log → STOP
- No sprint checkpoint; minimal state
- Return control with exit status

### Mode 2: Sprint Execution

- Sprint Start: declare identity (Model A iteration-based or Model B milestone-based) → fetch issues → spec enrichment → team-lead pre-flight → build caches → write initial checkpoint
- Execution Loop: triage → classify (cached routing eligible) → run ROUTE_AND_RUN per-issue → fixlog updates → git+PR → close/status → ship log → next issue → emit checkpoint
- Auto-advance to next issue after merge; emit checkpoint before stopping
- Sprint Completion: integration validation (full E2E) → completion gate checks → archive checkpoint → summary

### Mode 3: Resume

- Read `.claude/STATE.md` + `.claude/SPRINT_CHECKPOINT.md` → if `Status: IN_PROGRESS`: read `.claude/state/current-pr-fixlog.md` → read next issue's spec from `.claude/sprint-enriched-specs.md` (next section only)
- If `Status: IN_PROGRESS`: check dangling branch, merged PR, uncommitted changes; recover in-flight state
- If sprint enrichment missing: re-run Sprint Start steps 2–5b (fetch descriptions, enrich, team-lead pre-flight)
- Continue from next issue or in-flight recovery point

---

## Workflow

### Step 1: Load Issue Context

**Mode 1 (standalone):**
- Fetch GitHub issue: `gh issue view <number> --json title,body`
- Use description directly for triage

**Mode 2 (sprint kickoff):**
- Declare sprint identity (Model A: iteration field; Model B: milestone + label)
- Fetch sprint issues: `gh issue list --milestone "<name>" --label "<label>" --json number,title` (Model B) or query project iteration items (Model A)
- Fetch full descriptions for all issues (needed for enrichment + team-lead pre-flight)
- Invoke `spec-enricher` agent with all issues (opus, consistent quality, no paraphrasing)
- Write enriched specs to `.claude/sprint-enriched-specs.md` (AC + Out of Scope + Key unknowns per issue)
- Invoke `team-lead` pre-flight: execution order, dependencies, file conflicts, spec gaps
- If spec gaps found: play `afplay /System/Library/Sounds/Ping.aiff`, surface gaps to user, pause until resolved/waived
- Write initial checkpoint preamble with Project item IDs map, Sprint issues, Execution order, Dependencies, routing cache (if homogeneous)
- Build qa-risk cache from Sprint-level conventions (normalized format: `qa-risk: <area>::<component|endpoint|table> — <finding> (from RE-XX)`)

**Mode 2 (per-issue execution):**
- Use cached issue description from Sprint Start step 2
- Read issue's enriched spec from `.claude/sprint-enriched-specs.md`
- Write in-flight marker: `Status: IN_PROGRESS` in checkpoint
- Initialize fixlog (overwrite fresh; preserve on resume with existing counters/baseline/findings)
- Write capsule (`.claude/state/current-pr.md`): AC + Out of Scope from enriched spec, Touched Files Hint = PENDING (filled by qa-fast)

**Bug fix pre-check (Execution Loop step 3):**
- If issue type is bugfix: reproduce defect with targeted test or manual step, confirm failure, document. Do NOT proceed to engineer until reproduced.

### Step 2: Triage (HARD GATE — Always)

Output ≤ 8 lines:
```
Summary: <1 line>
Type: {bugfix|small-change|feature|refactor|perf|security|incident|ui}
Scope: {single-service|multi-service|cross-cutting}
Risk: {low|med|high} + <1 reason>
Classification: {trivial|normal|high-risk|doc-only} ← derived via Step 2B
<If trivial>: Changed files: [list] | Behavior impact: NONE — [justification]
Acceptance: max 3 bullets
Tests: max 3 bullets
```

### Step 3: Classification (HARD GATE — Immediately After Triage)

Mechanical — no override:

| Tier | Criteria | Minimum workflow |
|------|----------|-----------------|
| Doc-only | Only `*.md`, `docs/`, non-behavioral config | Process-doc self-review if `.claude/agents/`, `.claude/skills/`, `.claude/prompts/`, `.github/workflows/`, CI/CD config |
| Trivial | Single-file, non-behavioral, risk=low + behavior-impact NONE evidence | Skip all gates; pre-push hook backstop only |
| Normal | Code change with logic/behavior NOT meeting high-risk criteria | qa-fast (conditional), engineer, code-reviewer, E2E (mandatory) |
| High-risk | Auth/authz/JWT, payments, destructive DDL, RLS, PII, cross-cutting, or risk=high | qa-fast (required override), engineer, code-reviewer (opus), security-reviewer, E2E (mandatory) |

**Tie-breaker:** If uncertain, classify stricter (more scrutiny).

**Process-doc self-review (required for doc-only process-files):**
```
## Process-Doc Review Evidence
Change summary: [1-2 sentences]
Affected invariants: [gates/boundaries/rules touched — or NONE]
Checklist:
- [ ] No quality gates weakened/removed
- [ ] No agent boundaries loosened
- [ ] No skip conditions added without justification
- [ ] Changes consistent with existing workflow invariants
```
If scenario walkthrough needed: add trivial/normal/high-risk examples showing expected classifications.

### Step 4: Execution Mode (Derived, Non-Overridable)

| Mode | Conditions | Token effect | Pre-E2E agent budget |
|------|-----------|-------------|-------------------|
| Lean | Normal + sprint PR 2+ + Phase 2 active + qa-risk cache covers touched area | qa-fast skip-eligible; ADVISORY-FIX-STYLE deferred | ≤2 agents |
| Standard | Normal + sprint PR 1, OR Phase 2 inactive | qa-fast required; ADVISORY-FIX always re-run | ≤3 agents |
| Full Guardrail | High-risk OR Gate F (security) | qa-fast required; all findings mandatory | ≤4 agents |

**No mode changes:**
- Classification, E2E gate, review gate, security gate, materialization check, or orchestrator boundaries
- Budget overage without justification = compliance gap
- When budget ceiling reached: MUST stop further non-gate routing

### Step 5: Routing (from ROUTE_AND_RUN_TABLES.md sections A–I)

Output one line: `Routing: A → B → C`

**Typical paths:**
- Backend bugfix/small: qa-fast → backend-engineer → code-reviewer
- Feature work: qa-fast → [architect] → engineer → code-reviewer
- Frontend/UI: qa-fast → [ui-designer] → frontend-engineer → code-reviewer
- RLS/RPCs: qa-fast → supabase-engineer → security-reviewer OR code-reviewer
- Security gate (append): → security-reviewer
- Migration/schema: architect + code-reviewer (opus if destructive)
- Test-only: qa-fast → qa → code-reviewer
- Doc-only: (none) or process-doc self-review
- Heavy multi-stream: team-lead (Mode 2)

**Authority:** If ROUTE_AND_RUN_TABLES.md contradicts this skill, ROUTE_AND_RUN_TABLES.md wins.

### Step 5B: Architect Trigger Rule (consider before PLAN_REVIEW)

The Main Agent MUST decide whether to invoke `architect` before assembling PLAN_REVIEW.

**Invoke `architect` when the issue involves any of:**

- API contract or DTO response-shape change
- backend/frontend boundary change
- data model or migration strategy
- URL-state contract change
- auth/access-control behaviour
- performance/scalability design
- Figma journey/state-machine across multiple UI states
- cache/pagination/query-shape design
- spatial query design
- multiple plausible approaches with material trade-offs
- scope split or follow-up issue decision

**Do NOT invoke `architect` for:**

- isolated UI polish
- one-file bug fix
- copy / CSS tweak
- simple validation rule using an established pattern
- mechanical test update
- implementation detail when the shape is already approved

If `architect` is skipped, PLAN_REVIEW TOML MUST include `architect = "skipped: <reason>"`.

`architect` is read-only. It does not implement, and it does not approve its own design — ChatGPT PLAN_REVIEW remains the approval gate.

### Step 5C: Team Lead Conditional Rule (do not broaden)

`team-lead` is **not** invoked just because ChatGPT review is enabled.

**Use `team-lead` only for:**

- sprint kickoff analysis
- genuine complex PR decomposition
- Tier 3 / large issue requiring multi-workstream coordination
- 3+ independent workstreams
- frontend + backend + tests/migration sequencing
- multiple specialist agents with file-conflict risk
- Figma journey replication across multiple states
- implementation deviates from approved plan and needs re-partitioning
- milestone-level or multi-issue coordination

**`team-lead` does NOT:**

- own ChatGPT approval (Main Agent does)
- own checkpoints (Main Agent does)
- own PR lifecycle (Main Agent does)
- write code (specialist engineers do)
- replace `architect`
- replace specialist engineers
- run for normal single-agent tasks

`team-lead` may help prepare decomposition evidence for WORKDONE_REVIEW, but the Main Agent remains lifecycle owner.

### Step 6: ChatGPT-Gated Mode (HARD GATE — PLAN_REVIEW)

Default for Tier 2 and Tier 3 issues. Optional for Tier 0/1.

#### 6.1 Pre-approval read-only allowance

**Allowed before ChatGPT PLAN_REVIEW approval** (read-only — no implementation files edited):

- `explorer-planner` — repo discovery, compact evidence
- `qa-fast` — pre-implementation risk scan
- `architect` — design/contract advice (read-only)
- `ui-designer` — UI/UX state or Figma-parity questions
- `performance-analyst` — performance/scalability concerns
- `security-reviewer` — security-design concerns

**Forbidden before ChatGPT PLAN_REVIEW approval:**

- `frontend-engineer` implementation
- `backend-engineer` implementation
- `supabase-engineer` implementation
- `qa` test-writing mode
- application-code edits by Main Agent

> **Rule:** Do not invoke implementation agents or edit implementation files until ChatGPT returns `verdict = "APPROVED"`. Read-only planning agents are allowed before PLAN_REVIEW when they reduce ambiguity or token load.

#### 6.2 Compact TOML PLAN_REVIEW (default format)

Write the package to `.claude/handoffs/issue-<NNN>/<NNN>-plan-review-request.toml` (zero-padded counter starting at `001`). Surface the file path to the user with a one-line "send this to ChatGPT Pro" instruction. Do **not** paste the full content into the conversation unless the user requests it.

```toml
gate = "PLAN_REVIEW"
issue = 999
title = "Short issue title"
classification = "normal"     # tier-0 | tier-1 | normal | high-risk
mode = "standard"             # lean | standard | full-guardrail
branch = "issue-999-short-name"
routing = ["explorer-planner", "architect?", "frontend-engineer", "code-reviewer", "qa"]
architect = "used | skipped: reason"
team_lead = "used | skipped: reason"

[goal]
summary = "One or two sentence goal."

[acceptance]
items = [
  "AC1 short text",
  "AC2 short text"
]

[current_state]
summary = "Brief current behaviour summary."

[[evidence]]
ref = "src/path/File.tsx:L10-L40"
proves = "What this confirms."

[[evidence]]
ref = "backend/path/File.java:L80-L110"
proves = "What this confirms."

[plan]
steps = [
  "Step 1 short action.",
  "Step 2 short action.",
  "Step 3 short action."
]

[files]
likely_change = [
  "src/path/File.tsx",
  "backend/path/File.java",
  "tests/path/spec.ts"
]

[impact]
api = "none | minor | describe briefly"
data = "none | migration required | describe briefly"
ux = "none | describe briefly"
perf = "none | describe briefly"
security = "none | describe briefly"

[tests]
planned = [
  "Unit: ...",
  "Integration: ...",
  "E2E/smoke: ..."
]

[risks]
items = [
  "Risk 1",
  "Risk 2"
]

[out_of_scope]
items = [
  "Thing intentionally not done"
]

[scope_lock]
approved_plan_ref = ""        # filled at materialisation time
allowed_files = [
  "src/path/File.tsx",
  "backend/path/File.java"
]
change_requires_review = [
  "new API contract",
  "new migration",
  "new UX state",
  "new acceptance criterion",
  "different file family than approved plan"
]

[claude_recommendation]
status = "READY_FOR_REVIEW"
reason = "Short reason."

[request_to_chatgpt]
instruction = "Review strictly. Do not rubber-stamp. Check AC coverage, evidence, scope, routing, tests, UX/API/data/security/perf risk, and whether implementation is safe to start. Return APPROVED, REVISION_REQUIRED, BLOCKED, NEEDS_USER_DECISION, or NEEDS_MORE_EVIDENCE."
```

**Token rules — PLAN_REVIEW:**

- TOML is the **default** format for ChatGPT handoffs. Markdown is **deprecated** except when narrative explanation outweighs token cost.
- PLAN_REVIEW must normally stay **under 1,200 words**.
- Evidence cap: **10 citations default, 15 max** (large/high-risk only).
- No raw `grep` logs, no full file dumps, no full issue body unless exact wording is decisive.
- Each `[[evidence]]` item proves **one specific claim**.
- Do not repeat the same AC across multiple sections.

#### 6.3 ChatGPT response format (expected)

User pastes the ChatGPT reply back; Main Agent saves it to `.claude/handoffs/issue-<NNN>/<NNN>-plan-review-response.toml`.

Approved verdict:

```toml
gate = "PLAN_REVIEW"
verdict = "APPROVED"
may_proceed = true

[summary]
text = "Concise review summary."

[blocking_issues]
items = []

[required_revisions]
items = []

[evidence_gaps]
items = []

[non_blocking_notes]
items = []

[claude_instruction]
text = "Proceed to checkpoint the approved plan in GitHub and .claude/state/current-approved-plan.toml, update .claude/SPRINT_CHECKPOINT.md, then implement under ROUTE_AND_RUN using specialist agents."
```

Non-approved verdict (example: REVISION_REQUIRED):

```toml
gate = "PLAN_REVIEW"
verdict = "REVISION_REQUIRED"
may_proceed = false

[summary]
text = "Plan is close but needs stronger evidence/test coverage."

[blocking_issues]
items = ["Issue 1", "Issue 2"]

[required_revisions]
items = ["Revise X", "Add evidence for Y", "Clarify test Z"]

[evidence_gaps]
items = ["Missing file:line evidence for current behaviour."]

[non_blocking_notes]
items = ["Optional improvement."]

[claude_instruction]
text = "Revise the PLAN_REVIEW TOML by adding evidence for X, mapping AC2 to implementation steps, and strengthening the test plan. Do not implement yet."
```

#### 6.4 Verdict parsing

| Verdict | Action |
|---------|--------|
| `APPROVED` | Proceed to § 6.5 (materialisation) → Step 7 (implementation routing) |
| `REVISION_REQUIRED` | Revise PLAN_REVIEW TOML, increment counter (`002-plan-review-request.toml`), resubmit. Do NOT implement. |
| `NEEDS_MORE_EVIDENCE` | Run additional read-only planning agents (typically `explorer-planner`), append evidence, resubmit. Do NOT implement. |
| `BLOCKED` | Stop. Surface blocker to user; await direction. Do NOT implement. |
| `NEEDS_USER_DECISION` | Stop. Present the decision prompt to the user; await answer. Do NOT implement. |

#### 6.5 Approved-plan materialisation (durable execution truth)

After ChatGPT returns `verdict = "APPROVED"`, the Main Agent MUST:

1. Write the durable plan to **`.claude/state/current-approved-plan.toml`** — this is the post-compaction execution source of truth.
2. Update `.claude/SPRINT_CHECKPOINT.md` with the approved plan reference (one-line pointer; do not duplicate content).
3. Optionally post a short approval checkpoint comment on the GitHub issue (do not paste the full plan).

`current-approved-plan.toml` MUST contain:

```toml
gate = "APPROVED_PLAN"
issue = 999
title = "Short issue title"
branch = "issue-999-short-name"
classification = "normal"
mode = "standard"
approved_at = "2026-05-08T12:00:00Z"
chatgpt_verdict_summary = "One-line summary of ChatGPT approval rationale."
handoff_ref = ".claude/handoffs/issue-999/001-plan-review-response.toml"

[routing]
agents = ["frontend-engineer", "code-reviewer", "qa"]

[scope]
acceptance = ["AC1 short text", "AC2 short text"]
allowed_files = ["src/path/File.tsx", "backend/path/File.java"]
expected_files = ["src/path/File.tsx", "backend/path/File.java", "tests/path/spec.ts"]
non_goals = ["Thing explicitly not done"]

[tests_required]
items = ["Unit: ...", "Integration: ...", "E2E/smoke: ..."]

[risks]
items = ["Risk 1"]

[scope_lock]
change_requires_review = [
  "new API contract",
  "new migration",
  "new UX state",
  "new acceptance criterion",
  "different file family than approved plan"
]
```

> **Rule:** ChatGPT conversation is **review history**. `current-approved-plan.toml` is **execution truth**. `SPRINT_CHECKPOINT.md` is **resume truth**.

#### 6.6 Decision Lock & Delta-Only Prompts (Token-Efficient Execution)

**After PLAN_REVIEW approval,** settled architectural and product decisions are locked:
- Decision Lock: Approved decisions MUST NOT be reopened by later agents (code-reviewer, QA, tests) unless **new evidence invalidates the plan**.
- Exception: If code-reviewer finds implementation non-compliance (code doesn't match approved decision), re-invoke engineer to fix alignment — do NOT reopen the decision itself.
- If new evidence contradicts an approved decision: surface to user with evidence cited; await explicit override.

**Delta-Only Agent Prompts (after PLAN_REVIEW approval):**
- Agents MUST use compact delta-only summaries: approved plan reference, changed files only, blockers+fixes since last agent, test results, AC evidence gained.
- Forbidden: full plan re-paste, complete issue body, prior conversation context, complete diffs.
- Rationale: Once planning is complete and approved, re-submitting full context at every agent invocation consumes tokens without adding information. Delta-only cuts token usage 60–80% without sacrificing fidelity.

**Token-Efficient Controls Do NOT Weaken Gates:**
- Delta-only does NOT skip PLAN_REVIEW, WORKDONE_REVIEW, code-reviewer verdict, E2E gate, scope-lock, or approval requirements.
- All gates remain mandatory. Delta-only only reduces repetition, not enforcement.

Implementation agents are now unblocked. Proceed to Step 7.

### Step 7: Execute Agents (Sequential, No Merging)

All agents via Task tool with `mode: "dontAsk"`.

**qa-fast (always runs before engineer writes code):**

Override rules (always required when ANY holds):
1. Classification = High-risk
2. First PR of sprint (no qa-risk cache yet)
3. Module/file path NOT covered by `qa-risk:` entry in Sprint-level conventions
4. Backend + frontend coupling present
5. Auth/session/permission changes in scope

Skip rules (Lean only, ALL must hold):
1. Mode = Lean
2. `qa-risk:` entry explicitly covers touched surface (same component/endpoint/table)
3. No new cross-layer coupling
4. No auth/session/permission-adjacent paths
5. **Surface constraint:** matching `qa-risk:` entry covers the SAME surface area + no changes to API contract, validation rules, or cross-layer data flow

Invalidation triggers (qa-fast required even with qa-risk match):
- DB schema change
- API contract change
- Auth/RLS/permission logic change
- Change to shared utility used by qa-risk entry's area
- Event handlers, API calls, state transitions, conditional rendering that affects flow

**Engineers (backend-engineer, frontend-engineer, supabase-engineer):**

Hard gate — Pre-flight checklist (mandatory before writing code):
1. Read ARCHITECTURE.md, PR_RULES.md, feature spec
2. Verify actual code locations (don't assume paths)
3. List exact files to modify + reason for each
4. State secondary impact areas: security config | migrations | validation | DTO/API contract | routing/state/UI | tests (YES + location, or NO + reason)
5. List top 3 likely failure modes

**Hard gate — Pre-flight evidence block (required before code):**
```
Pre-flight:
  Guidance read: [files]
  Files inspected: [existing files surveyed]
  Planned files to modify: [with reason]
  Secondary impact areas: [areas affected]
  Likely failure modes: [top 3]
```
Missing Pre-flight = protocol violation. Re-invoke engineer.

Implementation rules (after pre-flight):
6. Output diffs or targeted snippets only
7. Run existing tests after implementing; report pass/fail
8. Output AC coverage table: `| AC | COVERED? | file:line |`
   - Mark OUT OF SCOPE as `OUT OF SCOPE — reason` only if acceptable (backend endpoint not implemented yet, UI component doesn't exist, feature behind disabled flag)

**code-reviewer (after engineer completes):**

Skip only when: risk=low AND single-file AND no logic/behaviour changes (constant, label, config value).

Invocation rules:
- Determine `review_mode`: backend | frontend | both
- Determine `model`: opus if high-risk, sonnet otherwise
- If REQUEST CHANGES: engineer fixes, code-reviewer re-runs once (delta review using `git diff <baseline_sha>..HEAD`)
- If still REQUEST CHANGES after 1 re-run: play `afplay /System/Library/Sounds/Basso.aiff`, stop, surface to user

**ADVISORY sub-classification:**
- **ADVISORY-FIX** — Low-effort, high-value (< 15 min) fix that reduces real risk. Engineer must address.
- **ADVISORY-DEFER** — Tracked for follow-up; does NOT block PR.

In Lean mode, sub-classify ADVISORY-FIX:
- **ADVISORY-FIX-QUALITY** (always re-run): off-by-one, missing assertions, missing null guards, broken contract alignment
- **ADVISORY-FIX-STYLE** (defer in Lean): extract-method, rename, comment improvement (if no performance/a11y/security/data-correctness aspect)

Tie-breaker: Default to QUALITY if unclear.

**qa in verification mode (after all reviewers APPROVE):**

Mandatory for Normal and High-risk.

**E2E applicability rules:**
| PR type | Required? | Rationale |
|---------|-----------|-----------|
| Frontend — new page/route | YES | New routes break navigation |
| Frontend — existing page change | YES | Could break rendering |
| Backend — API consumed by FE | YES | Contract change breaks FE |
| Backend — ALL FIVE skip conditions confirmed | SKIP | Skip only if all 5 confirmed |
| Doc-only / Trivial | SKIP | No runtime change |

**Backend-only skip — ALL FIVE must be true:**
1. No frontend files changed
2. No existing frontend consumer depends on changed behavior
3. No API contract/response shape/schema change affects FE
4. No qa-fast or routing evidence of new/modified cross-layer flow
5. No uncertainty

**When in doubt, do not skip.** Invalid skip reasons: `SKIPPED(no E2E infra)`, `SKIPPED(no FE consumer)` (standalone), `SKIPPED(server not running)`.

**Mandatory server check:** Before invoking QA, both frontend (Vite) and backend (Spring Boot) must run. If either fails to start: surface as BLOCKED (not a valid skip).

**QA E2E failure routing (max 2 fix-verify cycles):**
1. QA reports FAIL → identify responsible engineer
2. Re-invoke engineer with exact failure output
3. Re-invoke QA (cycle 2)
4. If still FAIL → escalate to user (cycle 2 exhausted, no cycle 3)

**Early escalation (after cycle 1 instead of allowing cycle 2):**
- Ownership ambiguous
- Cross-cutting failure (frontend + backend)
- Flaky/environmental failure (non-deterministic)
- Engineer's fix didn't change any files impacted by failing test

**QA Targeted Rerun Protocol (cycle 2+):**
- Activation: fixlog exists AND qa-verify-cycles ≥ 1
- Scope priority: test-level → spec-level → full suite (only if narrower scope infeasible)
- Update fixlog: for each OPEN/STILL_OPEN row, state FIXED | STILL_OPEN | NEW
- Do NOT run full suite without stating why narrower scope failed

**security-reviewer (Gate F applies):**

Always runs last when security gate applies.

---

## Evidence Contracts (Mandatory — No skips)

### Engineer output (required)
```
## Engineer Evidence
Pre-flight: [see above — 5 fields]
Changed files: [list with paths]
Tests run: [exact command]
Test results: [X passed / Y failed / Z skipped]
Failures: [details or NONE]
AC coverage:
| AC | COVERED? | file:line |
Claim status: DONE | PARTIAL (<list>) | BLOCKED (<list>)
```

**Claim status rules:**
- `PARTIAL` or `BLOCKED` → issue MUST NOT close; do NOT emit `All gates satisfied: YES`
- `DONE` → all fields must be populated; `Verification` must show actual command output + pass/fail

**Orchestrator checks (engineer output):**
| Field | Failure condition | Action |
|-------|-------------------|--------|
| Verification | No command or only "tests pass" | `Status: PARTIAL — evidence missing` + re-invoke |
| Screenshots | Blank when UI touched | `Status: PARTIAL` + re-invoke |
| Claim status | Missing or DONE with gaps | `Status: PARTIAL` + re-invoke |
| Files changed | Differs from Preflight without explanation | Flag discrepancy; engineer justifies |

### Code-reviewer output (required for Normal/High-risk)
```
## Review Evidence
Verdict: APPROVE | REQUEST CHANGES
Review mode: backend | frontend | both
Model: sonnet | opus
Findings: [BLOCKING/ADVISORY-FIX/ADVISORY-DEFER/SUGGESTION with file:line]
```

### QA verification output (required for Normal/High-risk)
```
## E2E Verification Report
[Full format: pass count, fail count, exact failure output for any failures]
```

### Gate Satisfaction Record (required before commit — HARD GATE)
```
Classification: [tier]
Execution mode: [mode]
qa-fast: RAN | SKIPPED(<reason with qa-risk entry AND surface constraint>) | SKIPPED(trivial)
Engineer tests: PASS | FAIL | SKIPPED(trivial, non-executable)
Code-reviewer: APPROVE | N/A
Security-reviewer: APPROVE | N/A
E2E authoring: DONE | SKIPPED(...)
QA E2E: PASS | SKIPPED(...) | BLOCKED — [reason]
Engineer materialization: PASS | FAIL | N/A
Spec invalidation: CLEAN | PARTIAL(N of M) | N/A
All gates satisfied: YES
```

**GSR derivability invariant:** Every field MUST be derivable from actual execution this PR cycle — not inferred/memory. `qa-risk:` skip citations MUST exist verbatim in checkpoint at skip time. Budget overages MUST have `budget_exceeded: YES — <reason>`.

---

## Post-Engineer Materialization Check (HARD GATE for Normal/High-risk)

Before proceeding to code-reviewer, orchestrator MUST validate:

1. **Pre-flight present** — 5 fields populated
2. **Changed files non-empty** — at least one file listed
3. **Implementation artifact present** — branch name or worktree path
4. **Summary consistent** — references files in `Changed files`
5. **Evidence block complete** — all required fields populated

If ANY fails: re-invoke engineer with (a) specific failed check(s), (b) original qa-fast context, (c) enriched spec.

If fails on second run: escalate to user (BLOCKED).

---

## Spec Invalidation Check (Sprint context only — HARD GATE)

After materialization passes, if sprint enriched specs available, examine engineer's AC coverage table:

- `OUT OF SCOPE` with acceptable reason (backend not implemented, component missing, feature behind flag): log as deferred AC warning
- `OUT OF SCOPE` with unacceptable reason (already covered without cite, no reason, vague): re-invoke engineer
- **50% safeguard:** If ≥50% of AC bullets are OUT OF SCOPE: play `afplay /System/Library/Sounds/Ping.aiff`, surface to user "Over half of ACs deferred — spec misaligned. Proceed?" HARD STOP until user decides.

Record result: `Spec invalidation: CLEAN | PARTIAL(N of M) | N/A`

---

## PR Creation Gate (HARD GATE — Before commit/push)

ALL of the following must be true:

1. Required stage evidence exists (engineer output, code-reviewer verdict, QA report per tier)
2. Full GSR emitted (no FAIL, no invalid SKIPPED reason)
3. `All gates satisfied: YES` present
4. Evidence gate: `Claim status` field present + is DONE/PARTIAL/BLOCKED; `Verification` shows command + output; `Screenshots` non-blank for UI changes; `Files changed` non-empty for code tasks
5. Fixlog gate (if fixlog exists): NO Findings rows with Status=OPEN/STILL_OPEN/NEW; NO QA Failures rows with Status=OPEN/STILL_OPEN/NEW (DEFERRED allowed only with populated Notes: `defer: <reason> | agreed: <context>`)
6. Runtime Verification (R0): public routes = anonymous journey complete; routing = deep-link works + canonical URL; data = correct endpoint + correct params; entry points = all verified; AC verified against live behavior; multi-issue journey = full E2E before close
7. E2E Integrity Check: `.e2e-passed` matches HEAD; tests NOT `test.skip()` unconditionally; public routes = ≥1 test covers anonymous journey; assertions target correct navigation outcomes

If ANY gate fails: STOP. Do NOT proceed to commit/push/PR. Surface failure to user.

---

## Scope Lock & Drift Control

After PLAN_REVIEW approval, `current-approved-plan.toml` is the **implementation contract**. Engineer prompts MUST include:

- `approved_plan_ref` (path to `current-approved-plan.toml`)
- specific ACs the engineer owns
- allowed file families (from `[scope].allowed_files`)
- non-goals (from `[scope].non_goals`)
- stop conditions (see below)
- tests expected (from `[tests_required]`)

**Engineers MUST stop and return to Main Agent if any of these hold:**

- they need a new API contract
- they need a new migration not in the approved plan
- they need a new UX state
- they need to touch files outside the approved file families
- they discover the approved plan is factually wrong
- they need to expand or reduce AC scope
- new test evidence materially changes merge risk

**On stop, Main Agent decides:**

1. Update plan and resubmit revised PLAN_REVIEW TOML to ChatGPT
2. Run BLOCKER_REVIEW (see § Optional Review Gates)
3. Ask user
4. Route to `architect`
5. Continue inside approved scope (only if the deviation can be eliminated)

Drift handled silently — i.e. engineer ships outside `allowed_files` without the Main Agent re-routing — is a process violation. The Main Agent must verify `Files changed` against `allowed_files` during the materialisation check.

---

## WORKDONE_REVIEW (HARD GATE — Before PR/Merge under ChatGPT-Gated Mode)

Required for Tier 3 issues; usually required for Tier 2; optional for Tier 0/1. Runs **after** all per-PR gates pass (engineer materialisation, code-reviewer, security-reviewer if applicable, QA E2E) and **before** PR creation/merge.

Write the request to `.claude/handoffs/issue-<NNN>/workdone-review-request.toml`:

```toml
gate = "WORKDONE_REVIEW"
issue = 999
branch = "issue-999-short-name"
approved_plan_ref = ".claude/state/current-approved-plan.toml"

[implemented]
summary = "Short summary of actual work."

[files_changed]
items = [
  "src/path/File.tsx",
  "backend/path/File.java",
  "tests/path/spec.ts"
]

[[ac_mapping]]
ac = "AC1 short text"
status = "done"
evidence = "src/path/File.tsx:L10-L45"

[[ac_mapping]]
ac = "AC2 short text"
status = "done"
evidence = "tests/path/spec.ts:L20-L80"

[tests]
run = [
  "npm test -- ...",
  "cd backend && mvn test"
]
not_run = [
  "E2E not run because ..."
]

[deviations]
items = []

[risks]
items = []

[pr]
title = "Fix: concise PR title"
body_summary = "Short PR body summary."

[request_to_chatgpt]
instruction = "Review whether this is ready for PR/merge. Return APPROVED_FOR_PR, NEEDS_FIXES, NEEDS_USER_DECISION, or NEEDS_MORE_EVIDENCE."
```

User pastes ChatGPT response back; Main Agent saves it to `.claude/handoffs/issue-<NNN>/workdone-review-response.toml`.

**Verdict parsing:**

| Verdict | Action |
|---------|--------|
| `APPROVED_FOR_PR` | Proceed to commit / push / `gh pr create` / merge |
| `NEEDS_FIXES` | Re-route to responsible specialist engineer with the listed fixes; re-run downstream gates; resubmit WORKDONE_REVIEW |
| `NEEDS_USER_DECISION` | Stop; surface decision prompt to user |
| `NEEDS_MORE_EVIDENCE` | Add the requested evidence (test output, AC citations) and resubmit |

> **Rule:** When ChatGPT-gated mode is active, do NOT create a PR or merge until WORKDONE_REVIEW returns `APPROVED_FOR_PR`, **unless the user explicitly waives this gate** for a specific issue.

---

## Optional Review Gates (TOML — use only when material)

These are not required for every issue. Use only when a material question exists.

### BLOCKER_REVIEW

Use when implementation hits a material blocker:

- scope conflict
- migration / data-safety question
- UX ambiguity
- API contract change
- test strategy dispute
- implementation deviation from approved plan

### CLAIM_REVIEW

Use when an important claim needs ChatGPT confirmation before action:

- "this issue is fully satisfied"
- "this failure is pre-existing"
- "no backend change is needed"
- "this can be safely de-scoped"
- "this PR can close the issue"

### CLOSEOUT_REVIEW

Use only for non-trivial closure / de-scope / follow-up decisions.

All three formats are compact TOML, written under `.claude/handoffs/issue-<NNN>/`. They follow the same shape as PLAN_REVIEW: `gate`, a short `[summary]`, focused `[[evidence]]`, an explicit `[[ac_mapping]]` or `[claim]` section, and a `[request_to_chatgpt]` field. Verdicts mirror PLAN_REVIEW (`APPROVED`, `REVISION_REQUIRED`, `BLOCKED`, `NEEDS_USER_DECISION`, `NEEDS_MORE_EVIDENCE`).

---

## Handoff Storage Structure (manual ChatGPT Pro)

While we are not using the OpenAI API, the Main Agent maintains a local audit trail of every ChatGPT exchange:

```text
.claude/handoffs/
  issue-NNN/
    001-plan-review-request.toml
    001-plan-review-response.toml
    002-plan-review-request.toml      # if revision was required
    002-plan-review-response.toml
    approved-plan.toml                # local copy / mirror
    workdone-review-request.toml
    workdone-review-response.toml
    blocker-review-request.toml       # only if used
    blocker-review-response.toml
```

Rules:

- Main Agent **writes** request files; user **pastes** them into ChatGPT Pro manually.
- User **pastes ChatGPT's reply back**; Main Agent **stores** it as the response file.
- On approval, Main Agent **normalises** the approved plan into `.claude/state/current-approved-plan.toml` (the durable execution truth) and references the handoff path inside it.
- GitHub issue checkpoint stays clean — post only the approved plan summary if the workflow requires it. Do not spam every revision.

**`.gitignore` recommendation:** `.claude/state/` is already gitignored. `.claude/handoffs/` is a local audit trail — recommend adding it to `.gitignore` (it is not added automatically; defer to repo maintainer). If the team wants the audit trail tracked, leave it un-ignored intentionally.

---

## Git + PR Workflow (Pre-Approved Operations)

- `git checkout -b <type>/pr-<id>-<slug>`
- `git add <files>` (specific, never `git add .`)
- `git commit -m "<type>(<scope>): <description> (PR-<id>)"`
- `git push -u origin <branch>`
- `gh pr create --title "..." --body "..."`
  - **Invariant:** PR body MUST include `Closes #<issue-number>`
- `gh pr merge <number> --merge --delete-branch`
- `git checkout main && git pull origin main`
- `gh issue close <number>` (always, idempotent safety net)
- `gh project item-edit --id <ITEM_ID> --field-id PVTSSF_... --single-select-option-id 25c24fa1` (set project status to Done)

**Local E2E is primary merge gate.** If pre-push hook E2E passed: merge immediately. CI green is bonus; only block on CI if code failure (test fails, compile fails, lint fails, type errors) — infrastructure failures (timeout, billing, network, Docker, runner) are non-blocking when local E2E passed.

---

## Checkpoint/Resume Protocol

**Checkpoint preamble (first PR):**
```
=== ROLLING CHECKPOINT START ===
Sprint: <name>
Sprint identity: <Model A | Model B> + resolved fields
GitHub Project: RE Trends (PVT_kwHOAAVnaM4BSWI7)
Project item IDs: #NNN → <id> | ...
Sprint issues: #NNN Title | #NNN Title | ...
Execution order: #NNN | #NNN | ...
Dependencies: RE-XX depends on RE-YY [confirmed|likely|speculative] | NONE
Enriched specs: SEE .claude/sprint-enriched-specs.md
Current PR: #NNN Title | NONE
Status: IN_PROGRESS | DONE | BLOCKED | NEEDS FOLLOW-UP | SPRINT COMPLETE
[... additional fields from source doc checkpoint format ...]
=== ROLLING CHECKPOINT END ===
```

**Resume (Mode 3) — minimal durable context only:**

On resume, the Main Agent loads only the minimal durable state. Do **not** reload full ChatGPT conversations, full issue threads, full agent logs, or all sprint specs unless the checkpoint indicates missing or invalid state.

1. Read `.claude/STATE.md` (~25 lines) — project/session context
2. Read `.claude/SPRINT_CHECKPOINT.md` (authoritative resume state)
3. Read `.claude/state/current-approved-plan.toml` if it exists — durable execution truth for the in-flight issue (post-compaction recovery)
4. Read `.claude/state/current-pr-fixlog.md` if `Status: IN_PROGRESS` (counters, findings, QA failures with statuses)
5. Run `git status` and check current branch — confirm dangling branch, merged PR, uncommitted changes
6. Read the in-flight issue's spec from `.claude/sprint-enriched-specs.md` (next section only) — do NOT load all specs
7. If enriched specs missing: re-run Sprint Start steps 2–5b
8. Continue from Next PR or in-flight recovery point (~90 lines total resume context)

> **Rule:** ChatGPT conversation is review history; `current-approved-plan.toml` is execution truth; `SPRINT_CHECKPOINT.md` is resume truth. Trust the durable files; do not reconstruct from prior conversation.

---

## Failure Modes & Escalation

**Max fix-verify cycles:** 2 per agent per PR. Escalate after cycle 2.

**Early escalation triggers:**
- Ownership ambiguous
- Cross-cutting failure
- Flaky/environmental failure (non-deterministic)
- Engineer's fix didn't change impacted files

**When encountering gates:**
- No interpreting test failures as "acceptable"
- No dismissing pre-existing failures without user approval
- No override of E2E gate (Normal/High-risk must run E2E)
- No pre-checking server availability (start servers unconditionally)
- No inline code fixes (always re-invoke engineer)

---

## Orchestrator Boundary Rules (Mandatory)

**MUST NOT:**
1. Write/edit application code, tests, config, SQL — except inside the **Main Agent micro-fix exception** (see § Main Agent Role: one/two-line, mechanical, in-scope, no specialist judgement, no API/data/auth/security/UX/perf implication, only to unblock progress). Anything that fails any of those 5 conditions is forbidden.
2. Run tests (`mvn test`, `npm test`, `npm run test:e2e:local`)
3. Run build commands
4. Interpret test failures as acceptable
5. Apply reviewer findings directly (always re-invoke engineer)
6. Override E2E gate for Normal/High-risk
7. Reclassify to dodge gates
8. Resolve implementation decisions before engineer pre-flight (pass risks/defects, not solutions)
9. Invoke implementation agents (`frontend-engineer`, `backend-engineer`, `supabase-engineer`, `qa` test-writing) before ChatGPT PLAN_REVIEW returns `verdict = "APPROVED"`

**MUST:**
1. Route decisions (select agents, construct prompts, sequence invocations)
2. Parse agent outputs (extract verdicts, warnings, failures)
3. Manage git operations (commit, push, PR, merge)
4. Emit checkpoints
5. Escalate to user (max cycles exhausted, conflicts detected)
6. Enforce stage gates (no skips, no shortcuts)

---

## Usage Examples

### Standalone Issue (ChatGPT-gated, Tier 2)
```
Use the route-and-run skill to execute issue #123. Fetch the issue, triage, classify (tier 0/1/2/3),
invoke explorer-planner if Tier 2+, decide architect, assemble compact TOML PLAN_REVIEW, write it to
.claude/handoffs/issue-123/001-plan-review-request.toml, and STOP for ChatGPT review. On APPROVED,
materialise to .claude/state/current-approved-plan.toml and route implementation to specialist
engineers. After all per-PR gates pass, run WORKDONE_REVIEW before PR creation. Local E2E is the
merge gate.
```

### Sprint Kickoff
```
Use the route-and-run skill for sprint execution (Mode 2). Declare sprint identity, fetch issues, run
spec enrichment, team-lead pre-flight, build qa-risk cache, write checkpoint, then start execution
(per-issue: PLAN_REVIEW → APPROVED → implement → WORKDONE_REVIEW → merge).
```

### Resume (post-compaction)
```
Resume execution. Load minimal durable context only: .claude/STATE.md, .claude/SPRINT_CHECKPOINT.md,
.claude/state/current-approved-plan.toml (if present), .claude/state/current-pr-fixlog.md (if in
progress), and `git status`. Do NOT reload prior ChatGPT conversations or agent logs. Continue from
the in-flight recovery point.
```

---

## Known Conflicts / Ambiguities

**None detected.** Both source documents maintain clear boundaries: ROUTE_AND_RUN owns per-PR policy; SPRINT_EXECUTOR owns sprint orchestration.

---

## Self-Audit Summary

**Gate count by source:**
- ROUTE_AND_RUN.md: 25 major gate categories (triage, classification, execution mode, routing, agent invocation rules, post-engineer materialization, spec invalidation, E2E applicability, failure routing, orchestrator boundaries, evidence contracts, GSR)
- SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md: 37 major gate categories (sprint identity, execution loop steps 1–9d, sprint completion, revert protocol, resume protocol, mid-sprint addition, sprint completion gate, failure/token limit protocol)

**Total gates preserved: 62** (differs from preliminary "23" estimate; actual count is higher due to sub-gates within each major category)

**Compression strategy confirmed:**
- ✅ All mandatory gates preserved (process-doc review, preflight, materialization check, E2E gate, PR creation gating, evidence contracts)
- ✅ All retry protocols preserved (code-reviewer cycle 2+ delta review, QA targeted rerun, engineer fix cycles)
- ✅ All skip conditions preserved with evidence requirements (qa-fast Lean skip rules, E2E backend skip conditions)
- ✅ All failure routing preserved (max 2 cycles, early escalation triggers)
- ✅ All checkpoint/resume semantics preserved (in-flight recovery, dangling branch detection, fixlog lifecycle)
- ✅ All non-override rules preserved (classification is non-overridable, mode derived not chosen, orchestrator boundaries)
- ✅ ChatGPT-gated PLAN_REVIEW + WORKDONE_REVIEW (TOML by default) integrated as HARD GATEs
- ✅ Pre-approval read-only allowance defined (explorer-planner, qa-fast, architect, ui-designer, performance-analyst, security-reviewer)
- ✅ Implementation agents blocked until `verdict = "APPROVED"`
- ✅ Main Agent micro-fix exception scoped narrowly (5 conjoint conditions); all substantive code routed to specialists
- ✅ Approved-plan materialisation (`.claude/state/current-approved-plan.toml`) durable across compaction
- ✅ Scope-lock & drift control wired into engineer prompts and materialisation check

**No gates removed; all compressed without weakening.**
