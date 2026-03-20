# SKILL: ROUTE_AND_RUN (microservices, deterministic, token-light)

## Purpose
Route each task to the smallest effective set of pre-defined agents and execute them sequentially.

Do NOT redefine agents.
Do NOT merge agent outputs.
Process: triage → route → sequential agent execution → STOP.

**Authority:** `ROUTE_AND_RUN` is the single source of truth for routing logic, agent invocation rules, and the default E2E validation policy. `SPRINT_EXECUTOR_ROLLING_CHECKPOINT` invokes this skill for per-PR execution and may declare sprint-layer overrides on top of it — but does not redefine its core rules.

## Agents
qa-fast, backend-engineer, frontend-engineer, supabase-engineer, code-reviewer, performance-analyst, architect, security-reviewer, qa, team-lead, ui-designer

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
| Normal | required | required | required (sonnet) | only if Gate F | **conditional** (qa-fast signal) | **required** | best-effort local backstop |
| High-risk | required | required | required (**opus**) | **required** | **conditional** (qa-fast signal) | **required** | best-effort local backstop |

### Trivial classification evidence (required)

When classifying as Trivial, the orchestrator MUST include in the triage block:
- `Changed files:` [exact file list]
- `Behavior impact: NONE` — [one-line justification why no runtime behavior changes]

If the orchestrator cannot confidently declare `Behavior impact: NONE`, classify as Normal. Trivial is an explicit opt-in with evidence, not a default.

**Trivial engineer-test rule:** Trivial changes may skip engineer tests ONLY when `Behavior impact: NONE` is declared AND the changed file is purely non-executable (e.g., a display string, placeholder text, comment, or static label). If the changed file is executable code (`.java`, `.ts`, `.tsx`, `.kt`, `.sql`, etc.), engineer tests are still required even for Trivial classification.

The pre-push hook runs as a best-effort local backstop for Trivial changes — it is not a guarantee and must not be relied upon as the quality gate.

### Process-doc self-review (required structured evidence)

Required when doc-only classification involves process-doc files: `.claude/agents/` (agent prompts), `.claude/skills/` (routing/checkpoint files), `.claude/prompts/` (review templates), `.github/workflows/` (CI/CD), or any file that defines workflow gates, classification criteria, or agent boundaries.

Before committing, the orchestrator MUST output the following structured evidence block:

```
## Process-Doc Review Evidence
Change summary: [1-2 sentences describing what changed]
Affected invariants: [list which workflow gates, agent boundaries, classification rules, or skip conditions are touched — or NONE]
Checklist:
- [ ] No quality gates were weakened or removed
- [ ] No agent boundaries were loosened
- [ ] No classification criteria were made more permissive
- [ ] No skip conditions were added without justification
- [ ] Changes are consistent with existing workflow invariants
Scenario walkthrough (required if routing/classification logic changed):
- Trivial example: [task] → expected classification: [tier] — [correct? Y/N]
- Normal example: [task] → expected classification: [tier] — [correct? Y/N]
- High-risk example: [task] → expected classification: [tier] — [correct? Y/N]
```

If any checklist item fails or any scenario produces an unexpected classification, escalate to user before committing.

---

## Step 2 — Routing

Output one line:

Routing: A → B → C

Choose the smallest valid path.

### A) Backend bugfix / small change
Low risk, single-file, no logic change (e.g. config value, constant, label):
Routing: backend-engineer

Low/medium risk with logic change:
Routing: qa-fast → backend-engineer → code-reviewer

High risk (data integrity, transactions, concurrency, auth, money):
Routing: qa-fast → backend-engineer → code-reviewer

---

### B) Feature work

Single service, no migration/contract change:
Routing: qa-fast → backend-engineer → code-reviewer

Requires API contract decision, DB migration, or multi-service change:
Routing: qa-fast → architect → backend-engineer → code-reviewer

---

### C) Performance-sensitive work

If performance investigation OR DB queries added/modified OR potential N+1:
Routing: qa-fast → performance-analyst → backend-engineer → code-reviewer

---

### D) Frontend/UI work

UI-only:
Routing: qa-fast → frontend-engineer → code-reviewer

UX/state/layout refinement:
Routing: qa-fast → ui-designer → frontend-engineer → code-reviewer

Backend contract impacting UI:
Routing: qa-fast → backend-engineer → frontend-engineer → code-reviewer

---

### E) Supabase layer work

If task touches RLS policies, Supabase Storage policies, PostgreSQL RPCs (supabase-rpcs/), or existing Supabase Edge Functions:

RLS or storage policies (access control changes):
Routing: qa-fast → supabase-engineer → security-reviewer

RPCs or edge function maintenance (no access control change):
Routing: qa-fast → supabase-engineer → code-reviewer

Note: RLS and storage policy routes already end with `security-reviewer` — section F does not need to be separately applied for those cases.

---

### F) Security Gate (Non-negotiable)

If task touches:
auth/authz/JWT, secrets, PII, payments, permission changes, CORS/CSP, migrations that alter auth tables, RLS policies, or PII columns

Append:
→ security-reviewer

Examples:
Routing: qa-fast → backend-engineer → security-reviewer
Routing: qa-fast → architect → backend-engineer → code-reviewer → security-reviewer

---

### F2) Migration / Schema Change Gate

If the task includes Flyway migrations or significant schema changes:

**Additive migrations** (new table, new nullable column, new index):
- Architect review via routing section B (already routes DB migration → architect → engineer → code-reviewer)
- code-reviewer on sonnet (Normal) or opus (if High-risk per other criteria)
- Note: a column with a non-null DEFAULT on a large table may rewrite rows or acquire locks — treat as destructive if the table has significant data. When in doubt, classify as destructive.

**Destructive or altering migrations** (ALTER existing column type/constraint, DROP, data backfill, column rename):
- Architect review (routing section B) — for design/reversibility concerns
- code-reviewer on **opus** — data integrity review
- security-reviewer (if migration touches auth tables, RLS, or PII columns) — via Gate F

**RLS policy changes:**
- Handled by routing section E (already routes to supabase-engineer → security-reviewer)

The distinction: architect reviews schema design and reversibility. security-reviewer reviews access control and data exposure. code-reviewer on opus reviews data integrity and migration safety. These are separate concerns — a migration can need architect + opus code-reviewer without needing security-reviewer (e.g., adding a denormalized column with backfill).

---

### G) Doc-only / read-only changes

If the task touches only documentation, comments, or non-code config:

**Low-impact docs** (`README.md`, `docs/`, general comments, typo fixes):
Routing: (none — commit directly)

**Process docs** (`.claude/agents/`, `.claude/skills/`, `.claude/prompts/`, `.github/workflows/`, CI/CD config, checkpoint/workflow/gate policy files):
Routing: (none — but process-doc self-review with structured evidence required before commit, see Step 1B)

---

### H) Heavy Multi-Stream Work

If the task genuinely requires multiple parallel workstreams that cannot be safely handled by a single agent pass (e.g. new backend endpoint + Flyway migration + frontend wiring, or supabase schema change + RLS + Spring Boot service changes):

Routing: team-lead (Mode 2: Complex PR Decomposition)

team-lead must:
- Confirm decomposition is warranted (not just a large single-stream task)
- Produce a decomposition plan with subtasks, owners, non-goals, and gates
- Delegate to the appropriate specialist agents
- Verify integration across subtasks before declaring complete (team-lead Mode 2 Step 6)

**E2E for team-lead work:** invoke `qa` in verification mode after team-lead has completed integration verification (Mode 2 Step 6), not after each individual subtask. The final E2E covers the fully assembled change.

Note: sprint kickoff analysis (team-lead Mode 1) is handled by SPRINT_EXECUTOR, not here.

---

## Git Operations — Pre-Approved (No Confirmation Required)

The following git/GitHub operations are unconditionally pre-approved.
Never pause to ask for confirmation before executing any of these:

- `git checkout -b <branch>` — create feature branch
- `git add <files>` — stage specific files
- `git commit -m "..."` — commit staged changes
- `git push -u origin <branch>` — push feature branch to remote
- `gh pr create ...` — open pull request
- `gh pr merge <number> --merge --delete-branch` — merge pull request
- `git checkout main && git pull origin main` — sync main after merge

These pre-approvals apply to git operations performed within `ROUTE_AND_RUN`'s execution scope. The full sprint PR lifecycle — branch creation, commit, push, PR creation, CI monitoring, merge, and post-merge checkout — is owned by `SPRINT_EXECUTOR_ROLLING_CHECKPOINT`, not by this skill.

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

- **Agent permission mode**: ALL agents MUST be launched with `mode: "dontAsk"`. Do NOT use `mode: "bypassPermissions"` — it skips PreToolUse hooks (e.g. the combined-commands blocker). `dontAsk` auto-approves tool calls while still enforcing hooks.

- `qa-fast` runs BEFORE the engineer writes any code.
  When invoking pre-implementation, use this Task prompt pattern:
  > "Review the codebase and identify risks for this planned change: [paste issue/PR description].
  > The feature does not exist yet — scan the surrounding codebase and flag what could go wrong."

- Engineer agents (`frontend-engineer`, `backend-engineer`, `supabase-engineer`) MUST follow these rules — include them verbatim in every engineer Task prompt:
  > 1. **Read every file you will modify before writing any changes.** Do not assume file contents.
  > 2. **Output diffs or targeted snippets only** — never rewrite an entire file unless it is a new file.
  > 3. **Run existing tests** relevant to the changed files after implementing. Report pass/fail.
  > 4. **Output an AC coverage table** after implementing — one row per AC bullet from the enriched spec:
  >    `| AC | COVERED? | file:line |`
  >    Mark any AC deliberately excluded as `OUT OF SCOPE — reason`. This table is required; omitting it is a protocol violation.

- When invoked by `SPRINT_EXECUTOR` on a bug-fix task, bug reproduction is already confirmed upstream. Proceed directly to implementation — do not re-run reproduction.

- After `qa-fast` completes, include its key findings (Critical Paths, Edge Cases, Risks) in the engineer's Task prompt as `qa-fast context:`. This lets the engineer skip redundant codebase exploration and address flagged risks proactively.
- `code-reviewer` runs AFTER the engineer completes the implementation.
- Skip `code-reviewer` only when: risk=low AND change is single-file AND no logic/behaviour changes (e.g. a constant, label, or config value).
- If `code-reviewer` returns REQUEST CHANGES: engineer fixes, `code-reviewer` re-runs once.
- If still REQUEST CHANGES after one re-run: play `afplay /System/Library/Sounds/Basso.aiff`, stop and surface to user.
- **ADVISORY sub-classification (code-reviewer MUST tag each advisory):**
  - **ADVISORY-FIX** — Low-effort, high-value fix that the engineer should address before merge. Criteria: can be fixed in < 15 min AND reduces real risk. Examples: missing test cases for covered logic, extract-method for duplicated code, constants extraction for magic values, off-by-one in boundary checks.
  - **ADVISORY-DEFER** — Tracked for follow-up but does not block the current PR. Examples: architecture concerns requiring design decisions, integration test infra that doesn't exist yet, cross-cutting refactors spanning multiple modules.
  - After code-reviewer completes, the orchestrator MUST re-invoke the engineer for ALL **ADVISORY-FIX** items (same cycle as BLOCKING, just lower priority). ADVISORY-DEFER items are logged in the checkpoint Risks section AND appended to `.claude/TECH_DEBT.md` (grouped by backend/frontend/database/infra). The tech debt log is reviewed at sprint end.
  - If the code-reviewer does not tag advisories, the orchestrator classifies them: if effort < 15 min and reduces test coverage gaps or code duplication → FIX; otherwise → DEFER.
- `qa` in **E2E authoring mode** runs AFTER code-reviewer (and security-reviewer if applicable) APPROVE, BEFORE `qa` verification mode, for Normal and High-risk changes only. Conditional — triggered only when qa-fast recommended `E2E authoring recommended: YES`.
  When invoking E2E authoring mode, use this exact Task prompt:
  > "Mode: e2e-authoring. Write E2E tests for the new/modified user flow introduced by this change. Follow TOOLING.md E2E test placement rules. qa-fast context: [paste qa-fast E2E justification]. Changed files: [list files]. Implementation summary: [1-2 line summary of what the engineer built]. Run the new/updated spec file(s) using a targeted Playwright command to confirm the authored tests pass. Only run the full suite (`npm run test:e2e:local`) if targeted validation is not feasible. Do NOT modify implementation code."

  **Skip conditions** (orchestrator skips E2E authoring even when qa-fast says YES):
  - Triage Type is `refactor` AND ALL of: no new UI route, no new API endpoint, no changed user-visible workflow step, AND qa-fast did not signal missing E2E coverage for this path
  - An existing E2E spec file that explicitly covers this specific user flow is identified — either qa-fast cited it by name, or the orchestrator located it via Grep — AND qa-fast recommended NO

  **Uncertainty tie-breaker:** If it is unclear whether the change introduces or modifies a cross-layer flow requiring E2E authoring, default to YES. The skip conditions above are the only valid escape hatches.
- `qa` in **verification mode** runs AFTER all reviewers APPROVE (and after E2E authoring if applicable), BEFORE commit/push/PR, for Normal and High-risk changes only.
  When invoking verification mode, use this exact Task prompt:
  > "Mode: verification. Run the full E2E suite (`npm run test:e2e:local`) and report results. Do NOT write or modify any code. Do NOT fix failing tests. Report pass/fail with exact failure output for any failures. Changed files in this PR: [list files]. Classification: [normal|high-risk]."
  If QA reports FAIL, apply the Failure Routing Protocol in Step 3. Do NOT proceed to commit/push/PR until QA reports PASS.

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
- React fiber-walk for file drops in E2E
- `UriComponentsBuilder.build(false)` for user-input query params
- Leaflet `invalidateSize()` before `flyTo()` in hidden containers
- `house` type for E2E tests (avoids type-specific required fields)
- Radix Slider `role="slider"` is on Thumb, not Root

**Step 4 — Summarize results back to user/checkpoint:**
- Preserve severity (BLOCKING/ADVISORY/SUGGESTION)
- Preserve exact file:line references
- Separate backend and frontend findings if both were reviewed
- Never dilute BLOCKING findings in the summary
- **Agent-to-Checkpoint Warning Channel (NEW):** Any agent (`qa-fast`, `code-reviewer`, `security-reviewer`, `architect`, etc.) can emit structured warnings that are captured in the checkpoint's `Risks` field. Format:
  ```
  ROUTE_AND_RUN_WARNING: <severity:LOW|MED|HIGH> <message>
  ```
  Example from code-reviewer: `ROUTE_AND_RUN_WARNING: MED This PR introduces a second error response format. Consider standardizing in a follow-up.`
  After each agent completes, parse agent output for any `ROUTE_AND_RUN_WARNING:` lines and collect them. Append all collected warnings to the checkpoint's Risks section with prefix `[<agent-name>] <severity>: <message>`.
- `security-reviewer` always runs last when the Security Gate (F) applies.
- `team-lead` only routes to agents — it does not implement code itself.

---

## Step 3 — QA E2E Gate

### When it runs (per classification tier)

| Tier | QA E2E gate | Pre-push hook |
|------|-------------|---------------|
| Doc-only | skip | skips (doc pattern match) |
| Trivial | skip | skips (marker or runs if no marker) |
| Normal | **required** (see applicability rules below) | skips if marker exists |
| High-risk | **required** (see applicability rules below) | skips if marker exists |

### E2E applicability rules (Normal and High-risk)

| PR type | E2E required? | Rationale |
|---------|--------------|-----------|
| Frontend — new page/route | YES — full suite | New routes could break existing navigation |
| Frontend — existing page change | YES — full suite | Could break rendering |
| Backend — API consumed by existing FE page | YES — full suite | API contract change could break FE |
| Backend — no FE consumer yet (new endpoint, no FE page wired) | SKIP — `SKIPPED(no FE consumer)` | No frontend route to test against |
| Doc-only / Trivial | SKIP | No runtime change |

When skipping, the Gate Satisfaction Record must state the specific skip reason (e.g., `SKIPPED(no FE consumer)` or `SKIPPED(backend-only, no API contract change)`).

### Gate sequence (Normal and High-risk only)

After code-reviewer (and security-reviewer if applicable) APPROVE:

1. **E2E authoring check** — if qa-fast output includes `E2E authoring recommended: YES` AND skip conditions are not met, invoke `qa` in **E2E authoring mode**.
2. **E2E applicability check** — if the PR matches a SKIP row in the applicability table above, record the skip reason and proceed to commit/push/PR. Do NOT invoke QA verification mode.
3. Invoke `qa` agent in **verification mode** (see Invocation Rules above for exact prompt).
4. QA reports structured result: pass count, fail count, exact failure details.
5. **If PASS** — write the E2E marker, then proceed to commit/push/PR.
6. **If FAIL** — enter Failure Routing Protocol below.

### E2E marker (deduplication with pre-push hook)

After E2E passes (either via QA verification mode or manual `npm run test:e2e:local`), the orchestrator MUST write the marker file:

```bash
echo "$(git rev-parse HEAD)" > .e2e-passed
echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> .e2e-passed
```

The pre-push hook checks this marker: if the SHA matches HEAD, it skips the redundant E2E run. This prevents double-running E2E (once in QA gate, once on push) and avoids flaky failures from auth rate limiting.

The marker is gitignored and ephemeral — it exists only in the local working tree. See `.claude/E2E_GATE.md` for the full design.

### PR creation is a gated state transition

PR creation (commit → push → `gh pr create`) is **not** a step that happens eventually after agents finish. It is a state transition that is **only permitted** when ALL of the following are satisfied:

| Gate | Required for | Evidence |
|------|-------------|----------|
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
- After final routed agent completes, run Step 3 (QA E2E Gate). If gate PASS (or skipped for Trivial/Doc-only), play `afplay /System/Library/Sounds/Hero.aiff` and STOP.
- Do NOT suggest improvements beyond scope.
- One pass only.
- Only re-run if code-reviewer or security-reviewer marks BLOCKING.
- Prefer qa-fast over qa unless explicit test-writing required.

---

## Orchestrator Boundary Rules (Mandatory)

### MUST NOT

1. **Write or edit code** — not source, not tests, not config, not SQL. Not even "trivial one-line fixes."
2. **Run tests** — not `mvn test`, not `npm test`, not `npm run test:e2e:local`. Delegate to engineer (unit/integration) or QA (E2E verification).
3. **Run build commands** — not `npm run build`, not `mvn compile`.
4. **Interpret test failures as acceptable** — if a test fails, route to agent. Never skip.
5. **Apply reviewer findings directly** — always re-invoke the responsible engineer.
6. **Override the E2E gate** — if classification is Normal or High-risk, QA E2E must run. No exceptions.
7. **Reclassify to dodge gates** — if triage says risk=med or the change has logic, it cannot be Trivial.

### MUST

1. Route decisions — select agents, construct prompts, sequence invocations.
2. Parse agent outputs — extract verdicts, warnings, failure details.
3. Manage git operations — commit, push, PR creation, merge.
4. Emit checkpoints — under SPRINT_EXECUTOR.
5. Escalate to user — when max fix cycles exhausted or conflict detected.
6. Enforce stage gates — no skipping, no shortcuts.

**Why this matters:** Orchestrator inline fixes lose specialist context, bloat the main conversation window, and have proven to introduce cross-file dependency bugs (RE-110: import fixes required multiple rounds because the orchestrator missed cross-file dependencies when applying fixes directly).

---

## Stage Evidence Contract (Mandatory)

Each stage must produce minimum structured evidence. Missing evidence is a gate failure — the orchestrator must not proceed.

### Engineer output (required)
```
## Engineer Evidence
Changed files: [list with file paths]
Tests run: [exact command]
Test results: [X passed / Y failed / Z skipped]
Failures: [details or NONE]
AC coverage:
| AC | COVERED? | file:line |
```

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
Classification: [tier]
Classification evidence: [changed files + behavior impact for trivial; or N/A]
Engineer tests: PASS | FAIL | SKIPPED(trivial, non-executable)
Code-reviewer: APPROVE | N/A(trivial)
Security-reviewer: APPROVE | N/A
E2E authoring: DONE | SKIPPED(qa-fast=NO) | SKIPPED(trivial) | SKIPPED(doc-only) | SKIPPED(refactor-single-service) | SKIPPED(no FE consumer)
QA E2E: PASS | SKIPPED(trivial) | SKIPPED(doc-only) | SKIPPED(no FE consumer) | SKIPPED(backend-only, no API contract change)
Process-doc review: PASS | N/A
All gates satisfied: YES
```

If the orchestrator cannot output `All gates satisfied: YES`, it MUST NOT proceed to commit/push/PR.
