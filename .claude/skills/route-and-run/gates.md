# Route-and-Run — Gate Packets & Gate Operations

> Migrated from `route-and-run/SKILL.md` (which is now a thin entrypoint). This file holds the standalone Route-and-Run gate packet schemas and gate-operational details. **Authoritative per-PR policy remains `.claude/skills/ROUTE_AND_RUN.md`**; this file carries the ChatGPT-gated packet formats and gate mechanics that support it. Sprint-level orchestration is `.claude/skills/SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md`. Mode-3 hands-off execution is `.claude/commands/mode3-run.md` + `.claude/mode3/contracts/*`. Content moved verbatim; no gate weakened.

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

## Main Agent role & coding boundary (micro-fix exception)

The **Main Agent** is the lifecycle owner and routing orchestrator — **not** the default coder. Substantive code goes to specialist engineer agents. (The authoritative orchestrator boundary is `.claude/skills/ROUTE_AND_RUN.md` § Orchestrator Boundary Rules; this section preserves the micro-fix detail and forbidden-work table.)

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

## ChatGPT-Gated Mode (HARD GATE — PLAN_REVIEW)

Default for Tier 2 and Tier 3 issues. Optional for Tier 0/1.

### Pre-approval read-only allowance

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

### Compact TOML PLAN_REVIEW (default format)

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

### ChatGPT response format (expected)

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

### Verdict parsing

| Verdict | Action |
|---------|--------|
| `APPROVED` | Proceed to materialisation → implementation routing |
| `REVISION_REQUIRED` | Revise PLAN_REVIEW TOML, increment counter (`002-plan-review-request.toml`), resubmit. Do NOT implement. |
| `NEEDS_MORE_EVIDENCE` | Run additional read-only planning agents (typically `explorer-planner`), append evidence, resubmit. Do NOT implement. |
| `BLOCKED` | Stop. Surface blocker to user; await direction. Do NOT implement. |
| `NEEDS_USER_DECISION` | Stop. Present the decision prompt to the user; await answer. Do NOT implement. |

### Approved-plan materialisation (durable execution truth)

After ChatGPT returns `verdict = "APPROVED"`, the Main Agent MUST:

1. Write the durable plan to **`.claude/state/current-approved-plan.toml`** — this is the post-compaction execution source of truth for the SINGLE in-flight issue.
2. Write a **per-issue stable copy** to **`.claude/handoffs/issue-NNN/approved-plan.toml`** — identical content, decouples handoff integrity from the global file. This is required for milestone mode (2-4 issues planned in batch) and for the APPROVED_EXECUTION_HANDOFF integrity check.
3. Compute `sha256(.claude/handoffs/issue-NNN/approved-plan.toml)` and record the digest. It becomes `approved_plan_sha256` in the APPROVED_EXECUTION_HANDOFF. Example: `shasum -a 256 .claude/handoffs/issue-NNN/approved-plan.toml`.
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

### Decision Lock & Delta-Only Prompts (Token-Efficient Execution)

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

## Mode-3 execution handoff (pointer — live owner is mode3-run)

The Main-Planner → execution-owner handoff machinery (APPROVED_EXECUTION_HANDOFF, WORKDONE_CANDIDATE, the Main Agent 8-point intake checklist, TOOLING_BLOCKED fallback, the pre-merge RUNTIME_PROBE rule, Milestone Mode, and the execution dry-runs) is now **owned by Mode-3**:

- Slash command: `.claude/commands/mode3-run.md`
- Contracts: `.claude/mode3/contracts/*` (`main-agent.md`, `team-lead.md`, `plan-review.md`, `workdone-review.md`, `browser-validation.md`, `bug-repro.md`, `closeout.md`)
- Durable templates: `.claude/templates/approved-execution-handoff.toml`, `.claude/templates/workdone-candidate.toml`, `.claude/templates/blocked.toml`, `.claude/templates/tooling-blocked.toml`, `.claude/templates/team-lead-execution-log.md`, `.claude/templates/runtime-probe.md`

> The earlier "Haiku Team Lead" execution-handoff framing in `SKILL.md` is **retired**. The Mode-3 execution owner is the `mode3-orchestrator` teammate (top-level Agent Teams session, default model per its agent file — NOT a nested subagent, NOT pinned to Haiku); see `.claude/agents/mode3-orchestrator.md`. The 8-point WORKDONE_CANDIDATE intake now lives in `.claude/mode3/contracts/workdone-review.md`. The authority split (Main Agent owns gates/PR/merge; execution owner cannot contact ChatGPT, invoke `openai_gate.py`, open PRs, merge, or change scope) is unchanged and stated authoritatively there.

Standalone (non-Mode-3) Route-and-Run does not use the execution-handoff machinery — it routes specialists directly per `.claude/skills/ROUTE_AND_RUN.md` and uses the PLAN_REVIEW / WORKDONE_REVIEW packets in this file.

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
- On approval, Main Agent normalises the approved plan into BOTH `.claude/state/current-approved-plan.toml` (durable execution truth for the in-flight issue) AND `.claude/handoffs/issue-NNN/approved-plan.toml` (stable per-issue integrity source for Team Lead handoff). See § Approved-plan materialisation.
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
