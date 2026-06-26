# Antigravity Mode 3 Parity Workflow

This document explains the Antigravity workflow setup designed to achieve full agent parity with Claude's `/mode3-run` disciplined engineering workflow. It enables engineers and autonomous agents to seamlessly switch between Claude and Antigravity when tokens run out or environment context shifts, without losing process discipline, issue lifecycle tracking, validation rigor, or reporting standards.

---

## 1. Conceptual Mapping: Claude vs. Antigravity

| Feature / Dimension | Claude (`/mode3-run`) | Antigravity Equivalent |
| :--- | :--- | :--- |
| **Workflow Root** | `.claude/` | `.antigravity/` (alongside global `AGENTS.md`) |
| **Command Entry Points** | `.claude/commands/*.md`, `.claude/skills/ROUTE_AND_RUN.md` | `.antigravity/commands/*.md` |
| **Agent Roles** | `.claude/agents/*.md` | `.antigravity/agents/*.md` |
| **Phase & Gate Contracts** | `.claude/mode3/contracts/*.md` | `.antigravity/contracts/*.md` |
| **Execution Concurrency** | Agent Teams (implicit session team + background teammates via `Agent` tool) | Subagents (`invoke_subagent` / `define_subagent`) + Reactive Background Messaging |
| **Model Tiering** | Hardcoded Claude Opus / Sonnet assumptions | Dynamic capability tiering (Gemini Pro / High Reasoning model selection) |
| **State & Artefacts** | `.claude/handoffs/issue-<N>/` | `.antigravity/handoffs/issue-<N>/` |

### What Was Copied Conceptually
- **Issue-Driven Execution Gate**: Hard gate requiring formal intake triage (Scope, Risk, Routing, Non-goals) before editing code.
- **Strict Stop/Continue Policy**: Clear boundaries on autonomous progression vs. mandatory escalation (`NEEDS_USER_DECISION`).
- **Branch & PR Discipline**: Isolation in feature branch (`issue-<N>`) or worktree, atomic commits, and mandatory user merge approval.
- **Validation Discipline**: Rigorous execution of repository-specific test gates (e.g., frontend typechecking via `tsconfig.app.json` and `baseline-vs-branch` diffing).
- **Standardized Handoffs & Reporting**: Authoritative disk-backed final report and cross-tool transition packets.

### What Was Adapted for Antigravity
- **Subagent & Messaging Architecture**: Claude's experimental Agent Teams (tmux pane transport) is replaced by Antigravity's native `invoke_subagent` tool and asynchronous reactive messaging. Subagents report back directly into context without loop polling.
- **Model Agnosticism**: Removed hardcoded provider model strings (e.g., `opus`, `sonnet`). Instructions enforce capability tiers (e.g., "high-capability reasoning model") matching Antigravity runner profiles.
- **Navigation Integration**: Aligned with repository `AGENTS.md` rules: agents should use `jCodemunch-MCP` for code discovery when the MCP/index is configured, fresh, and available. If unavailable, stale, or not configured, state that fallback mode is active, use repository search cautiously, document the fallback in the final report, and avoid claiming jCodemunch-backed discovery.

---

## 2. Claude Agent Parity Table

Every agent currently present in Claude (`.claude/agents/*.md`) has an equivalent specialist agent in Antigravity (`.antigravity/agents/*.md`), adhering to a standardized 9-section definition format.

| Claude Agent Name / Path | Claude Responsibility | Antigravity Equivalent Agent Path | Parity Status | Action Taken |
| :--- | :--- | :--- | :--- | :--- |
| `.claude/agents/mode3-orchestrator.md` | Core execution anchor and workflow coordinator | `.antigravity/agents/mode3-orchestrator.md` | exact | Updated to standard 9-section format and 12-step choreography |
| `.claude/agents/explorer-planner.md` | Pre-coding codebase investigation, risk classification, and routing plan creation | `.antigravity/agents/explorer-planner.md` | exact | Created new specialist agent definition |
| `.claude/agents/spec-enricher.md` | Pre-implementation specification refinement, non-goals lock, and edge case analysis | `.antigravity/agents/spec-enricher.md` | exact | Created new specialist agent definition |
| `.claude/agents/team-lead.md` | Delivery sequencing, branch hygiene, scope lock, and PR reviewability ownership | `.antigravity/agents/team-lead.md` | exact | Created new specialist agent definition |
| `.claude/agents/chatgpt-gatekeeper.md` | Final supervisory engineering gate auditing scope creep and cross-file side effects | `.antigravity/agents/supervisor-engineer.md` | adapted | Created supervisor-engineer to mirror ChatGPT gatekeeper quality gate |
| `.claude/agents/architect.md` | System abstraction design, cross-cutting architecture oversight, and route governance | `.antigravity/agents/architect.md` | exact | Created new specialist agent definition |
| `.claude/agents/frontend-engineer.md` | React component, hook, routing, and client state authoring and authoritative TS validation | `.antigravity/agents/frontend-engineer.md` | exact | Created new specialist agent definition |
| `.claude/agents/backend-engineer.md` | Java Spring Boot controller, service, DTO, and repository authoring and query check | `.antigravity/agents/backend-engineer.md` | exact | Created new specialist agent definition |
| `.claude/agents/ui-designer.md` | Visual aesthetics, HSL palettes, dark mode layouts, and micro-animation polish | `.antigravity/agents/ui-designer.md` | exact | Created new specialist agent definition |
| `.claude/agents/performance-analyst.md` | Database read/write path audit, index check, pagination check, and scale analysis | `.antigravity/agents/performance-analyst.md` | exact | Created new specialist agent definition |
| `.claude/agents/qa.md` | Comprehensive validation planning, acceptance criteria audit, and regression testing | `.antigravity/agents/qa.md` | exact | Created new specialist agent definition |
| `.claude/agents/qa-fast.md` | Fast smoke validation and targeted changed-file testing for small tasks | `.antigravity/agents/qa-fast.md` | exact | Created new specialist agent definition |
| `.claude/agents/security-reviewer.md` | Auth, RBAC, JWT, admin route leak prevention, public endpoint safety, and PII audit | `.antigravity/agents/security-reviewer.md` | exact | Created new specialist agent definition |
| `.claude/agents/code-reviewer.md` | Comprehensive final code review of all PR modifications and specialist matrix verification | `.antigravity/agents/code-reviewer.md` | exact | Created new specialist agent definition |
| `.claude/agents/supabase-engineer.md` | Supabase schema, RLS policies, Flyway SQL migrations, Testcontainers, and fixtures gate | `.antigravity/agents/database-flyway-supabase-engineer.md` | adapted | Created database-flyway-supabase-engineer extending Supabase scope to Flyway safety |

---

## 3. Specialist Routing Matrix & Choreography

Antigravity `/mode3-run` enforces a strict 12-step execution choreography:
1. **Read issue scope**.
2. **Run explorer-planner**.
3. **Run spec-enricher if the issue is unclear**.
4. **Select specialist agents based on scope and changed files**.
5. **Run implementer only after specialist plan is clear**.
6. **Run qa-fast or qa depending on task size**.
7. **Run security-reviewer when auth/security/public endpoint paths are touched**.
8. **Run performance-analyst when queries/indexes/discover/list/map paths are touched**.
9. **Run database-flyway-supabase-engineer whenever migrations/scripts/db/supabase/Testcontainers are touched**.
10. **Run supervisor-engineer before code-reviewer**.
11. **Run code-reviewer**.
12. **Run closeout-reporter**.

### Routing Matrix
- `src/**/*.tsx`, `src/**/*.ts` -> `frontend-engineer`
- frontend tests -> `frontend-engineer` + `qa-fast`
- `backend/src/main/java/**` -> `backend-engineer`
- `backend/src/test/**` -> `backend-engineer` + `qa-fast`
- `db/migration/**` -> `database-flyway-supabase-engineer` + `backend-engineer`
- `scripts/db/**` -> `database-flyway-supabase-engineer` + data/fixture review if present
- `supabase/**` -> `database-flyway-supabase-engineer` + `security-reviewer` if policies/auth touched
- `AuthContext`, `JwtConfig`, `SecurityConfig` -> `security-reviewer` + `backend-engineer`
- query/index/performance paths -> `performance-analyst`
- `docs/product/spec/issues` -> `spec-enricher` + `architect`
- UI mock/design files -> `ui-designer` + `frontend-engineer`

---

## 4. Mandatory Specialist Sign-Off Matrix Before READY_TO_MERGE

Before returning `READY_TO_MERGE`, `/mode3-run` must output this exact sign-off block into the trajectory:

```text
Specialist review matrix:
- explorer-planner: required/not required, verdict
- spec-enricher: required/not required, verdict
- architect: required/not required, verdict
- frontend-engineer: required/not required, verdict
- backend-engineer: required/not required, verdict
- database-flyway-supabase-engineer: required/not required, verdict
- performance-analyst: required/not required, verdict
- qa-fast: required/not required, verdict
- qa: required/not required, verdict
- security-reviewer: required/not required, verdict
- supervisor-engineer: required, verdict
- code-reviewer: required, verdict
- closeout-reporter: required, verdict
```

If any required specialist returns `BLOCKER`, `NEEDS_REWORK`, or `UNVERIFIED`, final execution status halts at:
```text
STATUS: NEEDS_REWORK
```
not `READY_TO_MERGE`.

---

## 5. Golden Regression Example: PR #1644

The importance of the mandatory `database-flyway-supabase-engineer` gate is illustrated by historical PR #1644.

In PR #1644, an existing Flyway migration (`V90__idx_property_listings_agri_live.sql`) was modified directly after deployment. Under standard CI/CD pipelines, modifying an already-applied migration triggers a checksum validation failure during application startup, crashing production environments.

Under the updated Mode 3 parity workflow, `/mode3-run` delegates any touch on `db/migration/**` to `database-flyway-supabase-engineer`. The specialist executes mandatory check #1 ("Existing Flyway migrations must not be edited after they may have been applied") and halts execution before code review:

```text
database-flyway-supabase-engineer: BLOCKER

Reason:
PR #1644 modified existing Flyway migration V90__idx_property_listings_agri_live.sql.
That creates Flyway checksum risk for databases where V90 is already applied.
The fix must not edit old migrations.
```

---

## 6. Cross-Tool Handoff Protocol

Save transition states to `.antigravity/handoffs/issue-<N>/cross-tool-handoff.txt` (or `.claude/handoffs/issue-<N>/cross-tool-handoff.txt`) documenting:
- What remains: <explicit remaining tasks>
- Validation already run: <exact test commands and status>

---

## 7. Validation & Quality Discipline

### Authoritative Frontend Correctness
All frontend TypeScript correctness checks MUST execute:
```bash
node node_modules/.bin/tsc --noEmit -p tsconfig.app.json
```

### Baseline-vs-Branch Comparison
Agents must compare baseline errors against branch errors using normalized tuples: `file + TS code + normalized message`. Only net-new regressions fail validation.

---

## 8. Infrastructure Verification

To verify infrastructure compliance, execute:
```bash
python3 .antigravity/scripts/verify-antigravity-mode3.py
```
This verifier checks for all required files and invariant rules (`READY_TO_MERGE`, `NEEDS_USER_DECISION`, `no merge without user approval`, `tsconfig.app.json`, `baseline-vs-branch`).
