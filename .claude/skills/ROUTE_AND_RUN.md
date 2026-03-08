# SKILL: ROUTE_AND_RUN (microservices, deterministic, token-light)

## Purpose
Route each task to the smallest effective set of pre-defined agents and execute them sequentially.

Do NOT redefine agents.
Do NOT merge agent outputs.
Process: triage → route → sequential agent execution → STOP.

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
Routing: qa-fast → backend-engineer

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

### G) Heavy Multi-Stream Work

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

- Engineer agents (`frontend-engineer`, `backend-engineer`) MUST follow these rules — include them verbatim in every engineer Task prompt:
  > 1. **Read every file you will modify before writing any changes.** Do not assume file contents.
  > 2. **Output diffs or targeted snippets only** — never rewrite an entire file unless it is a new file.
  > 3. **Run existing tests** relevant to the changed files after implementing. Report pass/fail.

- `code-reviewer` runs AFTER the engineer completes the implementation.
- Skip `code-reviewer` only when: risk=low AND change is single-file AND no logic/behaviour changes (e.g. a constant, label, or config value).
- If `code-reviewer` returns REQUEST CHANGES: engineer fixes, `code-reviewer` re-runs once.
- If still REQUEST CHANGES after one re-run: stop and surface to user.
- `security-reviewer` always runs last when the Security Gate (E) applies.
- `team-lead` only routes to agents — it does not implement code itself.

---


## Step 3 — E2E Validation (Mandatory after all agents complete)

After the final routed agent completes, run the full e2e suite locally before committing:

```bash
# 1. Start backend via run-local.sh in background
./backend/run-local.sh > /tmp/backend-e2e.log 2>&1 &
BACKEND_PID=$!

# 2. Start frontend (Vite) in background
npm run dev > /tmp/frontend-e2e.log 2>&1 &
FRONTEND_PID=$!

# 3. Wait for both to be ready (poll until responding)
VITE_PORT=${VITE_PORT:-5173}
echo "Waiting for backend..." && until curl -sf http://localhost:8085/actuator/health > /dev/null 2>&1; do sleep 2; done
echo "Waiting for frontend..." && until curl -sf http://localhost:${VITE_PORT} > /dev/null 2>&1; do sleep 2; done

# 4. Run e2e
npm run test:e2e:local
E2E_EXIT=$?

# 5. Stop servers
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true

# 6. Fail the task if e2e failed
[ $E2E_EXIT -eq 0 ] || exit 1
```

Rules:
- Run this after code-reviewer (and security-reviewer if applicable) APPROVE.
- If e2e fails: surface the failure to the user and stop. Do NOT auto-fix and re-run.
- If backend or frontend fails to start within 60s: surface the error log and stop.
- Skip this step ONLY for doc-only changes (*.md, docs/) — never skip for code changes.

---

## Execution Rules (Mandatory)

- Agents execute sequentially.
- Do NOT merge agent outputs.
- After final routed agent completes, run Step 3 (E2E Validation), then STOP.
- Do NOT suggest improvements beyond scope.
- One pass only.
- Only re-run if code-reviewer or security-reviewer marks BLOCKING.
- Prefer qa-fast over qa unless explicit test-writing required.
