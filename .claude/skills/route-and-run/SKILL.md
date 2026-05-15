---
name: route-and-run
description: Execute GitHub issues using the preserved ROUTE_AND_RUN per-PR orchestration and SPRINT_EXECUTOR_ROLLING_CHECKPOINT sprint-level coordination. Includes full gate preservation, evidence contract validation, ChatGPT approval loop, QA E2E integrity, checkpoint/resume protocol, and no inline code fixes.
---

# Route and Run Skill

## When to use

- Single issue execution (standalone mode)
- Sprint execution with checkpoint (sprint mode)
- Resume after context loss or interruption

---

## OpenAI Gate Automation (v1 — PLAN_REVIEW)

A local Python CLI at `.claude/scripts/openai_gate.py` automates gate packet
submission to the OpenAI API. This is a developer tool only — gate semantics
and routing rules are unchanged.

**Quick reference:**
```bash
# Dry-run (no key needed):
python .claude/scripts/openai_gate.py \
  --dry-run --issue <N> --gate PLAN_REVIEW \
  --input .claude/handoffs/issue-<N>/<packet>.toml

# Live PLAN_REVIEW:
OPENAI_API_KEY=sk-... python .claude/scripts/openai_gate.py \
  --issue <N> --gate PLAN_REVIEW \
  --input .claude/handoffs/issue-<N>/<packet>.toml
```

On `APPROVED` verdict, writes `current-approved-plan.toml` + state files.
On any other verdict, saves artifacts only — state files are not touched.

See `.claude/docs/openai-gate.md` for full usage, exit codes, and security notes.

---

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
- Materialise the approved plan to `.claude/state/current-approved-plan.toml` AND a stable per-issue copy at `.claude/handoffs/issue-NNN/approved-plan.toml` with `sha256` digest (see § 6.5)
- Update `.claude/SPRINT_CHECKPOINT.md` and `.claude/STATE.md`
- **Choose execution path:** (a) route implementation directly to specialist engineer agents (`frontend-engineer`, `backend-engineer`, `supabase-engineer`, `qa`) for simple issues, OR (b) hand off to Haiku Team Lead via APPROVED_EXECUTION_HANDOFF for Tier 2/Tier 3 and milestone batches (see § Main Planner → Haiku Team Lead Execution Handoff)
- When using Team Lead handoff: receive WORKDONE_CANDIDATE, run the 8-point intake checklist, only then assemble `workdone-review-request.toml` for ChatGPT
- Enforce gates, scope lock, evidence contracts
- Detect blockers/deviations and route to BLOCKER_REVIEW / CLAIM_REVIEW / WORKDONE_REVIEW / SCOPE_CHANGE_REVIEW (see § Optional Review Gates)
- Coordinate PR/merge/cleanup/pull/reindex
- Archive handoff dirs per § Handoff Storage Structure cleanup policy on issue closeout

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

- sprint kickoff analysis (Mode 1)
- genuine complex PR decomposition (Mode 2)
- Tier 3 / large issue requiring multi-workstream coordination (Mode 2)
- 3+ independent workstreams (Mode 2)
- frontend + backend + tests/migration sequencing (Mode 2)
- multiple specialist agents with file-conflict risk (Mode 2)
- Figma journey replication across multiple states (Mode 2)
- implementation deviates from approved plan and needs re-partitioning (Mode 2)
- milestone-level or multi-issue coordination (Mode 1 / Mode 3 milestone batch)
- **execution-orchestrator (Mode 3) — post-PLAN_REVIEW handoff. Runs on Haiku. Main Agent SHOULD invoke with `model: "haiku"`.** See § Main Planner → Haiku Team Lead Execution Handoff.

**`team-lead` does NOT:**

- own ChatGPT approval (Main Agent does)
- own checkpoints (Main Agent does)
- own PR lifecycle (Main Agent does)
- write code (specialist engineers do)
- replace `architect`
- replace specialist engineers
- run for normal single-agent tasks
- contact ChatGPT directly (Mode 3 hard rule)
- invoke `.claude/scripts/openai_gate.py` (Mode 3 hard rule)
- open a PR or merge (Mode 3 hard rule)
- change approved scope (Mode 3 hard rule)
- override specialist agent models (Mode 3 hard rule — specialists keep configured/default models)

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

1. Write the durable plan to **`.claude/state/current-approved-plan.toml`** — this is the post-compaction execution source of truth for the SINGLE in-flight issue.
2. Write a **per-issue stable copy** to **`.claude/handoffs/issue-NNN/approved-plan.toml`** — identical content, decouples handoff integrity from the global file. This is required for milestone mode (2-4 issues planned in batch) and for the APPROVED_EXECUTION_HANDOFF integrity check.
3. Compute `sha256(.claude/handoffs/issue-NNN/approved-plan.toml)` and record the digest. It becomes `approved_plan_sha256` in the APPROVED_EXECUTION_HANDOFF (see § Main Planner → Haiku Team Lead Execution Handoff). Example: `shasum -a 256 .claude/handoffs/issue-NNN/approved-plan.toml`.
4. Update `.claude/SPRINT_CHECKPOINT.md` with the approved plan reference (one-line pointer; do not duplicate content).
5. Optionally post a short approval checkpoint comment on the GitHub issue (do not paste the full plan).

> **Rule:** When milestone mode plans 2-4 issues, `.claude/state/current-approved-plan.toml` is overwritten as each issue rotates into the in-flight slot. The per-issue copy at `.claude/handoffs/issue-NNN/approved-plan.toml` is the **stable integrity source** for the Team Lead handoff — never overwritten.

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

**AC2 — Final Diff vs Approved Scope Hard Gate (before WORKDONE_REVIEW)**

After materialization passes, compare the final diff against the approved scope:

```bash
FINAL_FILES=$(git diff --name-only origin/main...HEAD)
APPROVED_FILES=$(grep -A 100 "^\[scope\]" current-approved-plan.toml | grep "^allowed_files" -A 100 | grep "^\s*\"" | sed 's/.*"\(.*\)".*/\1/')
UNAPPROVED=$(comm -23 <(echo "$FINAL_FILES" | sort) <(echo "$APPROVED_FILES" | sort))
```

**If UNAPPROVED is non-empty:**
- Verdict: `SCOPE_CHANGE_REQUIRED` (not `APPROVED`)
- Do NOT proceed to WORKDONE_REVIEW
- Route to SCOPE_CHANGE_REVIEW gate
- List unapproved files explicitly

**If UNAPPROVED is empty:**
- Verdict: scope validation PASS
- Proceed to WORKDONE_REVIEW

Missing scope evidence (e.g., `current-approved-plan.toml` not found, `allowed_files` not populated) triggers `NEEDS_MORE_EVIDENCE` verdict, not PASS.

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

**AC1 — Universal Scope-Lock Policy (No Automatic Bypass)**

No file family automatically bypasses scope-lock. This includes (but is not limited to):
- Production source code (`.ts`, `.tsx`, `.java`, `.kt`, backend/)
- Test files (`*.spec.ts`, `*.test.ts`, test/, tests/)
- Documentation files (`*.md`, docs/, .claude/*)
- GitHub workflows (`.github/workflows/`)
- Scripts and configuration (`.claude/scripts/`, `scripts/`)
- Generated artifacts (build/, dist/, node_modules/)
- Tooling and process files

All changed files require either:
1. Explicit entry in the approved plan's `[scope].allowed_files`, OR
2. Approval via SCOPE_CHANGE_REVIEW handoff gate before PR creation/merge

If a file appears in the final `git diff --name-only origin/main...HEAD` but is not in the approved scope, the implementation is **OUT OF SCOPE**. This triggers **SCOPE_CHANGE_REQUIRED** verdict at the Pre-Merge gate and blocks PR creation/merge unless explicitly approved.

**AC7 — Regression Example: Issue #1074**

Issue #1074 merged with two process failures that would be caught by this gate:
1. **Unapproved file drift:** `src/utils/discoverPanelState.ts` was modified but NOT in the approved `allowed_files` list
2. **Missing WORKDONE_REVIEW:** PR merged without ChatGPT WORKDONE_REVIEW approval

With the scope-lock enforcement gates (AC2 + AC4 + AC5), both failures would have been blocked:
- Main Agent would detect `src/utils/discoverPanelState.ts` mismatch in the Post-Engineer Materialization Check (AC2)
- Gatekeeper would flag scope drift as SCOPE_DRIFT or SCOPE_UNKNOWN (AC5)
- Main Agent would block PR creation/merge without WORKDONE_REVIEW approval (AC4)

---

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

**AC8 — Diff-vs-Scope Validation**

Before the Pre-Merge Gate (AC2), the Main Agent validates the final diff against approved scope using this command:

```bash
git diff --name-only origin/main...HEAD | while read file; do
  if ! grep -q "^$file$" <(echo "$ALLOWED_FILES"); then
    echo "OUT OF SCOPE: $file"
  fi
done
```

Where `$ALLOWED_FILES` is populated from `current-approved-plan.toml` `[scope].allowed_files`.

Fallback for local-only branches (no origin/main):
```bash
git diff --name-only main...HEAD | ...
```

If any file is flagged as OUT OF SCOPE, the Main Agent:
1. Emits `SCOPE_CHANGE_REQUIRED` verdict
2. Blocks PR creation and merge
3. Routes to SCOPE_CHANGE_REVIEW gate

**AC9 — Verification Dry-Runs**

**Example 1: Clean diff (all files in approved scope)**
```
Approved files: src/components/MapDiscovery.tsx, src/utils/api.ts
Final diff files: src/components/MapDiscovery.tsx, src/utils/api.ts
Result: PASS — all files approved
```

**Example 2: Unapproved file (like #1074)**
```
Approved files: src/components/MapDiscovery.tsx
Final diff files: src/components/MapDiscovery.tsx, src/utils/discoverPanelState.ts
Result: SCOPE_CHANGE_REQUIRED — src/utils/discoverPanelState.ts is unapproved
```

**Example 3: Mid-fix-verify discovery**
Engineer implementing AC2 discovers mid-cycle that unapproved file is necessary:
1. Engineer outputs: "File X is required but not in approved scope"
2. Main Agent: blocks further commits, routes to SCOPE_CHANGE_REVIEW
3. SCOPE_CHANGE_REVIEW approved or rejected before continuing

Drift handled silently — i.e. engineer ships outside `allowed_files` without the Main Agent re-routing — is a process violation. The Main Agent must verify `Files changed` against `allowed_files` during the materialisation check.

---

## Main Planner → Haiku Team Lead Execution Handoff

Token-efficient orchestration split that runs alongside the existing ROUTE_AND_RUN flow. Optional, not mandatory — Main Agent may continue direct specialist routing for simple issues. Recommended for Tier 2/Tier 3 issues and any milestone batch.

### Authority split

| Role | Model | Responsibilities |
|------|-------|------------------|
| **Main Agent** | Opus | Milestone triage; issue selection; PLAN_REVIEW authoring + ChatGPT submission; materialise per-issue approved plan + sha256; create APPROVED_EXECUTION_HANDOFF; receive + validate WORKDONE_CANDIDATE; submit WORKDONE_REVIEW / PR_REVIEW to ChatGPT; PR create / merge / closeout; next issue selection. |
| **Team Lead (Mode 3)** | **Haiku** | Read approved plan + APPROVED_EXECUTION_HANDOFF; verify `approved_plan_sha256`; route specialists; enforce approved scope + stop conditions; collect evidence; run fix-verify loops (max 2 per specialist); prepare WORKDONE_CANDIDATE; hand back to Main Agent. |
| **Specialist agents** | Configured/default | Implementation. Unchanged. Models NOT overridden by Team Lead. |

**Team Lead MUST NOT** (binding — encoded in the handoff `[authority]` block):

1. Contact ChatGPT directly (any channel).
2. Invoke `.claude/scripts/openai_gate.py` or any ChatGPT-facing tool.
3. Open a PR (`gh pr create`).
4. Merge (`gh pr merge`).
5. Approve own work or shortcut a reviewer verdict.
6. Bypass code-reviewer, security-reviewer, or QA gates.
7. Change scope without first returning to Main Agent for SCOPE_CHANGE_REVIEW.
8. Continue past a stop condition.
9. Edit files directly — always route to a specialist.
10. Override specialist agents' model fields.

### APPROVED_EXECUTION_HANDOFF (Main Agent → Team Lead)

Created **only** after ChatGPT `verdict = "APPROVED"` on PLAN_REVIEW AND § 6.5 materialisation produces both the global plan and the per-issue copy + sha256.

Path: `.claude/handoffs/issue-NNN/approved-execution-handoff.toml`
Template: `.claude/templates/approved-execution-handoff.toml`

Required shape:

```toml
gate = "APPROVED_EXECUTION_HANDOFF"
issue = 999
branch = "issue-999-short-name"
source_plan = ".claude/handoffs/issue-999/approved-plan.toml"   # per-issue copy, NOT the global file
approved_plan_sha256 = "<hex digest of source_plan at materialisation>"
materialised_at = "2026-05-15T03:30:00Z"
execution_owner = "team-lead"
execution_model = "haiku"

[authority]                                                       # LOCKED — do not edit
may_execute = true
may_route_subagents = true
may_change_scope = false
may_contact_chatgpt = false
may_invoke_openai_gate_cli = false
may_open_pr = false
may_merge = false

[approved_scope]
allowed_files = [...]                                             # mirrored from approved-plan.toml [scope].allowed_files
forbidden_files = [...]

[acceptance_criteria]
items = [...]                                                     # mirrored from approved-plan.toml [scope].acceptance

[required_gates]
items = [
  "scope-lock diff check before WORKDONE_CANDIDATE",
  "code-reviewer",
  "security-reviewer if applicable",
  "QA / E2E if applicable",
  "gatekeeper pre-screen if applicable",
]

[required_evidence]
items = [
  "git diff --name-only origin/main...HEAD",
  "git diff --stat origin/main...HEAD",
  "test command output",
  "scope compliance table",
  "reviewer verdicts",
  "known deviations",
  "WORKDONE_CANDIDATE",
]

[stop_conditions]
items = [
  "unapproved file needed",
  "approved approach is wrong",
  "new dependency needed",
  "backend/schema/auth change needed but not approved",
  "test requires changing acceptance criteria",
  "security finding outside approved scope",
  "specialist recommends scope expansion",
  "approved_plan_sha256 mismatch at start of execution",
]
```

**Path B — Main Agent materialisation (post-#1093):** Before invoking team-lead, Main Agent **verifies `approved_plan_sha256`** itself (Team Lead has no Bash under Path B and cannot recompute it). Then Main Agent invokes team-lead via the Task tool with `model: "haiku"` and passes the handoff path. Team Lead reads the handoff and approved plan, confirms the authority block (`may_*` flags), orchestrates specialists via Task, and returns a **structured text report** to Main Agent (see § team-lead.md Step 5). Main Agent then independently runs `git diff --name-only origin/main...HEAD`, reconciles against the approved scope, and **materialises** `.claude/handoffs/issue-NNN/workdone-candidate.toml` from the text report. Team Lead does NOT write the candidate file under Path B — it has no Write tool. The 8-point intake checklist then runs against the Main-Agent-materialised candidate.

### TOOLING_BLOCKED fallback (Team Lead → Main Agent, #1090 / #1093)

At Step 0.5, Team Lead inspects its runtime toolkit and confirms `Task` is callable (the only tool it strictly needs to invoke specialists under Path B). If `Task` is not callable, Team Lead returns `status = "TOOLING_BLOCKED"` in its text report with the tool gap described, and Main Agent materialises `.claude/handoffs/issue-NNN/tooling-blocked.toml` (template at `.claude/templates/tooling-blocked.toml`) on Team Lead's behalf — Team Lead has no Write tool. On receipt of `gate = "TOOLING_BLOCKED"`, Main Agent treats it as a **recoverable BLOCKED state**: it MUST NOT proceed to specialist routing under Mode 3, MUST NOT bypass any downstream gate (PLAN_REVIEW, scope-lock, code-reviewer, security-reviewer, QA, WORKDONE_REVIEW, PR_REVIEW), and MAY only fall back to Main Agent direct orchestration with **explicit user authorisation** (same path used for #1086). TOOLING_BLOCKED is a process signal, not an execution authority.

### Team Lead QA/E2E readiness gate (post-#1093)

Team Lead may NOT return `status = "READY_FOR_WORKDONE_REVIEW"` until the test evidence required by the approved plan is collected. Under Path B, Team Lead orchestrates this via the responsible specialist (qa, qa-fast, or an engineer running its own unit/integration tests). The structured text report's `tests` block MUST include, for each required test, the command/runner, owner (specialist that ran it), result (PASS/FAIL/SKIPPED), timestamp, output excerpt, known skips/flakes, and the `.e2e-passed` (or equivalent) sentinel value when applicable. If a required test cannot be run, Team Lead returns `status = "QA_BLOCKED"` (or `"WORKDONE_BLOCKED"` for broader gaps) and Main Agent materialises a partial WORKDONE_CANDIDATE with `recommendation_to_main_agent.status = "BLOCKED"`. Main Agent independently re-verifies the evidence before submitting WORKDONE_REVIEW to ChatGPT.

### Pre-merge RUNTIME_PROBE rule (post-#1093 — binding)

For any PR whose diff touches `.claude/agents/**`, `.claude/skills/**`, agent tool declarations, subagent routing logic, harness/tool provisioning, authority flags, gate execution, OpenAI gate invocation, or Task/subagent routing, the WORKDONE_REVIEW packet MUST include a `[runtime_probe]` block produced by a **fresh-spawn** subagent following `.claude/templates/runtime-probe.md`. The probe MUST distinguish *declared* (frontmatter), *schema-visible* (subagent's function schema), and *actually callable* (invocation succeeds) for every tool the change claims to affect. **Static evidence can prove only static claims; runtime claims require runtime evidence before merge.** This rule is additive and does not bypass or weaken any existing gate (PLAN_REVIEW, scope-lock, code-reviewer, security-reviewer, QA, WORKDONE_REVIEW, PR_REVIEW, and intake checklist remain mandatory whenever they were mandatory before).

### WORKDONE_CANDIDATE (Team Lead → Main Agent)

**INTERNAL only.** This is NOT a ChatGPT-facing packet. Never submitted to `openai_gate.py`. Never pasted into ChatGPT. Main Agent converts it into `workdone-review-request.toml` for ChatGPT only after the intake checklist passes.

Path: `.claude/handoffs/issue-NNN/workdone-candidate.toml`
Template: `.claude/templates/workdone-candidate.toml`

Required shape (machine-checkable, #1076-style):

```toml
gate = "WORKDONE_CANDIDATE"
issue = 999
branch = "issue-999-short-name"
approved_plan_ref = ".claude/handoffs/issue-999/approved-plan.toml"
approved_plan_sha256 = "<digest verified at execution start>"
handoff_ref = ".claude/handoffs/issue-999/approved-execution-handoff.toml"
completed_at = "2026-05-15T05:00:00Z"

[implemented]
summary = "..."

# Machine-checkable scope-lock fields
approved_files = [...]
actual_changed_files = [...]                                      # = git diff --name-only origin/main...HEAD
unapproved_files = [...]                                          # = actual_changed_files \ approved_files
scope_verdict = "PASS"                                            # PASS | SCOPE_CHANGE_REQUIRED
requires_scope_change_review = false

[[ac_mapping]]
ac = "..."
status = "done"                                                   # done | partial | deferred
evidence = "file:line"

[[tests.run]]
command = "..."
result = "PASS"                                                   # PASS | FAIL | SKIPPED
output_excerpt = "..."

[[tests.not_run]]
name = "..."
reason = "..."

[review_verdicts]
code_reviewer = "APPROVE"                                         # APPROVE | REQUEST_CHANGES | N/A
security_reviewer = "N/A"                                         # APPROVE | REQUEST_CHANGES | N/A
qa = "PASS"                                                       # PASS | FAIL | SKIPPED

[deviations]
items = []

[risks]
items = []

[recommendation_to_main_agent]
status = "READY_FOR_WORKDONE_REVIEW"                              # READY_FOR_WORKDONE_REVIEW | NEEDS_FIX | BLOCKED
reason = "..."
```

### Main Agent intake checklist (HARD GATE — before assembling WORKDONE_REVIEW)

Run all 8 checks on the received WORKDONE_CANDIDATE. ALL must PASS.

1. **Digest integrity:** recompute `sha256(approved_plan_ref)`; MUST equal `approved_plan_sha256`. Mismatch ⇒ tampering or stale handoff. STOP.
2. **Scope verdict:** `scope_verdict == "PASS"` AND `unapproved_files == []`. If `SCOPE_CHANGE_REQUIRED` ⇒ route to SCOPE_CHANGE_REVIEW (do not assemble WORKDONE_REVIEW).
3. **Diff cross-check:** independently run `git diff --name-only origin/main...HEAD`; result MUST equal `actual_changed_files`. Mismatch ⇒ re-route to Team Lead.
4. **AC mapping completeness:** every AC from `approved-plan.toml [scope].acceptance` has a corresponding `[[ac_mapping]]` entry with `status` + `evidence`.
5. **Reviewer verdicts:** `code_reviewer == APPROVE`; `security_reviewer ∈ {APPROVE, N/A with reason}`; `qa ∈ {PASS, SKIPPED with documented reason}`.
6. **Test evidence:** every item from `approved-plan.toml [tests_required]` appears in `tests.run` (with PASS/FAIL/SKIPPED + output) or `tests.not_run` with explicit reason.
7. **Deviations:** if non-empty, each item MUST reference a Main-Agent-authorised resolution (revised plan, SCOPE_CHANGE_REVIEW outcome, or explicit user waiver).
8. **Stop-condition trace:** if any stop-condition fired during Team Lead execution, confirm Main Agent already authorised the resolution.

If any check fails: do NOT assemble WORKDONE_REVIEW. Either (a) re-route to Team Lead with delta, or (b) escalate to user.

### Milestone Mode

- Main Agent MAY plan 2-4 issues in a milestone batch.
- Each issue has its OWN `.claude/handoffs/issue-NNN/approved-plan.toml` + `approved-execution-handoff.toml` + `workdone-candidate.toml`.
- Global `.claude/state/current-approved-plan.toml` is **resume anchor** for the single in-flight issue; NOT the integrity source for the Team Lead handoff.
- Team Lead executes **one issue at a time** unless Main Agent explicitly authorises parallel execution.
- Parallel issues MUST NOT share branches unless explicitly approved by Main Agent + user.
- Main Agent holds milestone-wide context; Team Lead holds per-issue execution context only.

### Dry-runs

#### Dry-run 1 — Normal flow

1. Main Agent triages issue → Tier 2 → assembles PLAN_REVIEW TOML.
2. User submits to ChatGPT → `verdict = "APPROVED"`.
3. Main Agent writes BOTH `.claude/handoffs/issue-NNN/approved-plan.toml` AND `.claude/state/current-approved-plan.toml`. Computes `sha256` of per-issue copy.
4. Main Agent writes `approved-execution-handoff.toml` with `source_plan` + `approved_plan_sha256` + authority block locked.
5. Main Agent invokes team-lead with `model: "haiku"` and handoff path.
6. Team Lead Mode 3 Step 0: verifies sha256 matches → PASS.
7. Team Lead routes specialists (qa-fast where applicable → engineer → code-reviewer → qa). All gates PASS.
8. Team Lead runs scope-lock diff: `actual_changed_files \ approved_files == []` → `scope_verdict = PASS`.
9. Team Lead writes `workdone-candidate.toml` with `recommendation_to_main_agent.status = READY_FOR_WORKDONE_REVIEW`.
10. Team Lead returns to Main Agent.
11. Main Agent runs 8-point intake checklist → ALL PASS.
12. Main Agent assembles `workdone-review-request.toml` from candidate fields.
13. User submits to ChatGPT → `verdict = "APPROVED_FOR_PR"`.
14. Main Agent creates PR, merges, archives handoff dir per archive policy.

#### Dry-run 2 — Scope drift discovery

1. Steps 1-6 as in Dry-run 1.
2. Team Lead routes `frontend-engineer`. Engineer reports: *"`src/utils/discoverPanelState.ts` must change but is NOT in `approved_files`."*
3. Team Lead recognises stop condition `"unapproved file needed"`. **HALTS** specialist routing immediately.
4. Team Lead writes a partial `workdone-candidate.toml` with:
   - `scope_verdict = "SCOPE_CHANGE_REQUIRED"`
   - `unapproved_files = ["src/utils/discoverPanelState.ts"]`
   - `requires_scope_change_review = true`
   - `deviations.items = ["unapproved file needed: src/utils/discoverPanelState.ts (frontend-engineer cycle 1)"]`
   - `recommendation_to_main_agent.status = "BLOCKED"`
5. Team Lead returns to Main Agent. Does NOT continue. Does NOT contact ChatGPT. Does NOT invoke `openai_gate.py`.
6. Main Agent intake checklist FAILS at step 2 (scope verdict != PASS). Routes to SCOPE_CHANGE_REVIEW.
7. Main Agent decides:
   - **(a)** Revise PLAN_REVIEW + resubmit to ChatGPT. On `APPROVED` revised plan: re-write `approved-plan.toml` (new sha256), re-issue `approved-execution-handoff.toml` with expanded `allowed_files` + new digest, Team Lead resumes Mode 3.
   - **(b)** Reject scope expansion + instruct Team Lead to find in-scope solution. Team Lead resumes within original scope.
   - **(c)** Escalate BLOCKED to user.
8. PR is NEVER created with unapproved files. Pre-Merge Guard (existing AC4 in § Scope Lock & Drift Control) hard-blocks per #1076.

### OpenAI gate automation placement

- Main Agent MAY invoke `.claude/scripts/openai_gate.py` for PLAN_REVIEW and WORKDONE_REVIEW packet submission.
- Team Lead **MUST NOT** invoke `openai_gate.py` (encoded in `authority.may_invoke_openai_gate_cli = false`).
- APPROVED_EXECUTION_HANDOFF and WORKDONE_CANDIDATE are NEVER passed to `openai_gate.py` — they are internal handoffs, not ChatGPT-facing packets.
- Gate authority, verdict schema, exit codes, and CLI flags are unchanged by this workflow.
- Verification: `.claude/scripts/.venv/bin/pytest .claude/scripts/tests/` (mocked suite). Live OpenAI smoke is out of scope for the workflow-introduction PR.

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

**AC4 — Main Agent Pre-Merge Guard (Explicit Requirements)**

The Main Agent MUST NOT create a PR or merge until ALL of these conditions are satisfied:

1. ✅ ChatGPT WORKDONE_REVIEW verdict = `APPROVED_FOR_PR`
2. ✅ Final diff scope validation passes (AC2) OR SCOPE_CHANGE_REVIEW is approved
3. ✅ PR_REVIEW (if required) approves scope compliance

Merge gate pseudo-code:
```
if workdone_review.verdict != "APPROVED_FOR_PR":
  BLOCK("WORKDONE_REVIEW not approved")
if scope_validation_verdict == "SCOPE_CHANGE_REQUIRED":
  BLOCK("Scope change not reviewed — route to SCOPE_CHANGE_REVIEW")
if pr_exists and pr_review_required:
  if pr_review.scope_compliance != "APPROVE":
    BLOCK("PR_REVIEW scope check failed")
# All gates passed — safe to create PR / merge
```

> **Rule:** When ChatGPT-gated mode is active, do NOT create a PR or merge until WORKDONE_REVIEW returns `APPROVED_FOR_PR` AND final diff matches approved scope, **unless the user explicitly waives this gate** for a specific issue.

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
.claude/templates/                    # TRACKED — reusable workflow templates
  approved-execution-handoff.toml     # Main Agent → Team Lead handoff template
  workdone-candidate.toml             # Team Lead → Main Agent return template

.claude/handoffs/                     # GITIGNORED — per-issue runtime audit trail
  issue-NNN/
    001-plan-review-request.toml
    001-plan-review-response.toml
    002-plan-review-request.toml      # if revision was required
    002-plan-review-response.toml
    approved-plan.toml                # per-issue stable copy (integrity source for handoff)
    approved-execution-handoff.toml   # Main Agent → Team Lead (Mode 3 only)
    workdone-candidate.toml           # Team Lead → Main Agent (Mode 3 only)
    workdone-review-request.toml
    workdone-review-response.toml
    blocker-review-request.toml       # only if used
    blocker-review-response.toml
  archive/
    issue-NNN/
      YYYY-MM-DD/                     # archived handoffs on closeout
        ...
      summary-YYYY-MM-DD.md           # compact closeout summary (alternative to raw archive)
```

Rules:

- Main Agent **writes** request files; user **pastes** them into ChatGPT Pro manually (or invokes `.claude/scripts/openai_gate.py`).
- User **pastes ChatGPT's reply back**; Main Agent **stores** it as the response file.
- On approval, Main Agent normalises the approved plan into BOTH `.claude/state/current-approved-plan.toml` (durable execution truth for the in-flight issue) AND `.claude/handoffs/issue-NNN/approved-plan.toml` (stable per-issue integrity source for Team Lead handoff). See § 6.5.
- `approved-execution-handoff.toml` and `workdone-candidate.toml` are **INTERNAL** to the Main Agent ↔ Team Lead exchange. NEVER submitted to ChatGPT. NEVER passed to `openai_gate.py`. Team Lead's authority block hard-blocks both channels.
- GitHub issue checkpoint stays clean — post only the approved plan summary if the workflow requires it. Do not spam every revision.

### Handoff Archive / Cleanup Policy

- **Active:** `.claude/handoffs/issue-NNN/` for the current issue plus the most recent 3 closed issues by default.
- **Archive on closeout (Main Agent action only):**
  - **Option A — move:** `mv .claude/handoffs/issue-NNN/ .claude/handoffs/archive/issue-NNN/YYYY-MM-DD/`
  - **Option B — summarise:** write `.claude/handoffs/archive/issue-NNN/summary-YYYY-MM-DD.md` containing the verdicts + AC mapping + final commit ref; delete raw handoffs ONLY with explicit user instruction.
- **No automatic deletion.** Cleanup is user-triggered. Do not script silent purges.
- **No secrets** in handoff TOML — no API keys, no raw transcripts, no live credentials. If a packet would contain a secret, redact before writing.
- **OpenAI runtime artefacts** stay under `.claude/openai-gates/` (already gitignored). Those are CLI-generated; do not move them into `handoffs/`.
- **`.gitignore` recommendation:** `.claude/state/` is already gitignored. `.claude/handoffs/` and `.claude/handoffs/archive/` are local audit trails — repo maintainer decides whether to add them to `.gitignore`. Not auto-added.

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
