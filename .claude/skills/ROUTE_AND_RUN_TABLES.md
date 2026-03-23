# ROUTE_AND_RUN — Routing Decision Tables (A–I)

**Authority:** This file is a static reference companion to `ROUTE_AND_RUN.md`. It contains routing decision tables only — no control flow, no gate logic, no agent invocation rules. `ROUTE_AND_RUN.md` is the sole authority for execution policy. If a rule here contradicts `ROUTE_AND_RUN.md`, the main document wins.

**Usage:** The orchestrator loads this file when Step 2 (Routing) requires selecting a path. Choose the smallest valid path that matches the task characteristics.

---

## A) Backend bugfix / small change

Low risk, single-file, no logic change (e.g. config value, constant, label):
Routing: backend-engineer

Low/medium risk with logic change:
Routing: qa-fast → backend-engineer → code-reviewer

High risk (data integrity, transactions, concurrency, auth, money):
Routing: qa-fast → backend-engineer → code-reviewer

---

## B) Feature work

Single service, no migration/contract change:
Routing: qa-fast → backend-engineer → code-reviewer

Requires API contract decision, DB migration, or multi-service change:
Routing: qa-fast → architect → backend-engineer → code-reviewer

---

## C) Performance-sensitive work

If performance investigation OR DB queries added/modified OR potential N+1:
Routing: qa-fast → performance-analyst → backend-engineer → code-reviewer

---

## D) Frontend/UI work

UI-only:
Routing: qa-fast → frontend-engineer → code-reviewer

UX/state/layout refinement:
Routing: qa-fast → ui-designer → frontend-engineer → code-reviewer

Backend contract impacting UI:
Routing: qa-fast → backend-engineer → frontend-engineer → code-reviewer

---

## E) Supabase layer work

If task touches RLS policies, Supabase Storage policies, PostgreSQL RPCs (supabase-rpcs/), or existing Supabase Edge Functions:

RLS or storage policies (access control changes):
Routing: qa-fast → supabase-engineer → security-reviewer

RPCs or edge function maintenance (no access control change):
Routing: qa-fast → supabase-engineer → code-reviewer

Note: RLS and storage policy routes already end with `security-reviewer` — section F does not need to be separately applied for those cases.

---

## F) Security Gate (Non-negotiable)

If task touches:
auth/authz/JWT, secrets, PII, payments, permission changes, CORS/CSP, migrations that alter auth tables, RLS policies, or PII columns

Append:
→ security-reviewer

Examples:
Routing: qa-fast → backend-engineer → security-reviewer
Routing: qa-fast → architect → backend-engineer → code-reviewer → security-reviewer

---

## F2) Migration / Schema Change Gate

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

## G) Test-only PRs

If the task adds or modifies automated tests only (unit tests, integration tests, E2E specs) with no changes to production code:

Routing: qa-fast → qa → code-reviewer

Rules:
- `qa` acts as the implementing engineer for test-only PRs — it writes, updates, and runs tests.
- Exempt from the 3-file scope limit in PR_RULES.md (test suites frequently span many files).
- Test-only PRs classify as Normal tier regardless of file count.
- Code-reviewer reviews test quality, coverage completeness, and fixture correctness.
- E2E applicability: if the PR adds or modifies E2E specs, run the full suite to confirm the authored tests pass.

---

## H) Doc-only / read-only changes

If the task touches only documentation, comments, or non-code config:

**Low-impact docs** (`README.md`, `docs/`, general comments, typo fixes):
Routing: (none — commit directly)

**Process docs** (`.claude/agents/`, `.claude/skills/`, `.claude/prompts/`, `.github/workflows/`, CI/CD config, checkpoint/workflow/gate policy files):
Routing: (none — but process-doc self-review with structured evidence required before commit, see Step 1B)

---

## I) Heavy Multi-Stream Work

If the task genuinely requires multiple parallel workstreams that cannot be safely handled by a single agent pass (e.g. new backend endpoint + Flyway migration + frontend wiring, or supabase schema change + RLS + Spring Boot service changes):

Routing: team-lead (Mode 2: Complex PR Decomposition)

team-lead must:
- Confirm decomposition is warranted (not just a large single-stream task)
- Produce a decomposition plan with subtasks, owners, non-goals, and gates
- Delegate to the appropriate specialist agents
- Verify integration across subtasks before declaring complete (team-lead Mode 2 Step 6)

**E2E for team-lead work:** invoke `qa` in verification mode after team-lead has completed integration verification (Mode 2 Step 6), not after each individual subtask. The final E2E covers the fully assembled change.

Note: sprint kickoff analysis (team-lead Mode 1) is handled by SPRINT_EXECUTOR, not here.
