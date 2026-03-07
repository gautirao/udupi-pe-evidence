# SKILL: ROUTE_AND_RUN (microservices, deterministic, token-light)

## Purpose
Route each task to the smallest effective set of pre-defined agents and execute them sequentially.

Do NOT redefine agents.
Do NOT merge agent outputs.
Process: triage → route → sequential agent execution → STOP.

## Agents
qa-fast, backend-engineer, frontend-engineer, code-reviewer, performance-analyst, architect, security-reviewer, qa, team-lead, ui-designer

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
Low risk:
Routing: qa-fast → backend-engineer

Medium/high risk (data integrity, transactions, concurrency, auth, money):
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

### E) Security Gate (Non-negotiable)

If task touches:
auth/authz/JWT, secrets, PII, payments, permission changes, CORS/CSP, destructive migrations

Append:
→ security-reviewer

Examples:
Routing: qa-fast → backend-engineer → security-reviewer
Routing: qa-fast → architect → backend-engineer → code-reviewer → security-reviewer

---

### F) Heavy Multi-Stream Work

If >3 parallel subtasks or cross-domain:

Routing: team-lead

team-lead must:
- Produce decomposition plan
- Then delegate to appropriate agents

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

These apply during sprint execution and all ROUTE_AND_RUN agent runs.

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
- `code-reviewer` runs AFTER the engineer completes the implementation.
- If `code-reviewer` returns REQUEST CHANGES: engineer fixes, `code-reviewer` re-runs once.
- If still REQUEST CHANGES after one re-run: stop and surface to user.
- `security-reviewer` always runs last when the Security Gate (E) applies.
- `team-lead` only routes to agents — it does not implement code itself.

---


## Execution Rules (Mandatory)

- Agents execute sequentially.
- Do NOT merge agent outputs.
- After final routed agent completes, STOP.
- Do NOT suggest improvements beyond scope.
- One pass only.
- Only re-run if code-reviewer or security-reviewer marks BLOCKING.
- Prefer qa-fast over qa unless explicit test-writing required.
