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

Output ≤ 7 lines:

- Summary (1 line)
- Type: {bugfix|small-change|feature|refactor|perf|security|incident|ui}
- Scope: {single-service|multi-service|cross-cutting}
- Risk: {low|med|high} + 1 reason
- Acceptance: max 3 bullets
- Tests: max 3 bullets
- Assumptions: max 2 bullets (only if needed)

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
auth/authz/JWT, secrets, PII, payments, permission changes, CORS/CSP, destructive migrations

Append:
→ security-reviewer

Examples:
Routing: qa-fast → backend-engineer → security-reviewer
Routing: qa-fast → architect → backend-engineer → code-reviewer → security-reviewer

---

### G) Doc-only / read-only changes

If the task touches only documentation, comments, or non-code config (e.g. `*.md`, `docs/`, `*.toml` with no behavioral change):

Routing: (none — no agents needed)

Skip qa-fast, engineer, code-reviewer, and E2E validation. Commit directly.

---

### H) Heavy Multi-Stream Work

If the task genuinely requires multiple parallel workstreams that cannot be safely handled by a single agent pass (e.g. new backend endpoint + Flyway migration + frontend wiring, or supabase schema change + RLS + Spring Boot service changes):

Routing: team-lead (Mode 2: Complex PR Decomposition)

team-lead must:
- Confirm decomposition is warranted (not just a large single-stream task)
- Produce a decomposition plan with subtasks, owners, non-goals, and gates
- Delegate to the appropriate specialist agents
- Verify integration across subtasks before declaring complete (team-lead Mode 2 Step 6)

**E2E for team-lead work:** run E2E only after team-lead has completed integration verification (Mode 2 Step 6), not after each individual subtask. The final E2E covers the fully assembled change.

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
| `qa` | `.claude/agents/qa.md` | Write tests (only when explicitly required) | Test files |

### Invocation Rules

- `qa-fast` runs BEFORE the engineer writes any code.
  When invoking pre-implementation, use this Task prompt pattern:
  > "Review the codebase and identify risks for this planned change: [paste issue/PR description].
  > The feature does not exist yet — scan the surrounding codebase and flag what could go wrong."

- Engineer agents (`frontend-engineer`, `backend-engineer`, `supabase-engineer`) MUST follow these rules — include them verbatim in every engineer Task prompt:
  > 1. **Read every file you will modify before writing any changes.** Do not assume file contents.
  > 2. **Output diffs or targeted snippets only** — never rewrite an entire file unless it is a new file.
  > 3. **Run existing tests** relevant to the changed files after implementing. Report pass/fail.

- When invoked by `SPRINT_EXECUTOR` on a bug-fix task, bug reproduction is already confirmed upstream. Proceed directly to implementation — do not re-run reproduction.

- After `qa-fast` completes, include its key findings (Critical Paths, Edge Cases, Risks) in the engineer's Task prompt as `qa-fast context:`. This lets the engineer skip redundant codebase exploration and address flagged risks proactively.
- `code-reviewer` runs AFTER the engineer completes the implementation.
- Skip `code-reviewer` only when: risk=low AND change is single-file AND no logic/behaviour changes (e.g. a constant, label, or config value).
- If `code-reviewer` returns REQUEST CHANGES: engineer fixes, `code-reviewer` re-runs once.
- If still REQUEST CHANGES after one re-run: play `afplay /System/Library/Sounds/Basso.aiff`, stop and surface to user.

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

## Step 3 — E2E Validation Policy

E2E validation is handled by the **pre-push git hook** — not by an explicit in-workflow E2E step. This eliminates double E2E runs.

Rules:
- After code-reviewer (and security-reviewer if applicable) APPROVE, proceed directly to commit + push.
- The pre-push hook runs the full E2E suite automatically during `git push`.
- If the pre-push hook fails: play `afplay /System/Library/Sounds/Basso.aiff`, surface the failure to the user and stop. Do NOT auto-fix and re-run.
- **Default skip:** doc-only changes (`*.md`, `docs/`, non-behavioral config) are not gated by E2E.
- Sprint-layer callers may declare additional skip overrides — see `SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md`.

---

## Execution Rules (Mandatory)

- Agents execute sequentially.
- Do NOT merge agent outputs.
- After final routed agent completes, run Step 3 (E2E Validation), then play `afplay /System/Library/Sounds/Hero.aiff` and STOP.
- Do NOT suggest improvements beyond scope.
- One pass only.
- Only re-run if code-reviewer or security-reviewer marks BLOCKING.
- Prefer qa-fast over qa unless explicit test-writing required.
