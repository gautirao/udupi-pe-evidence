---
name: mode3-run
description: Hands-off Mode-3 execution in Antigravity for an approved GitHub issue with Claude agent parity. Main Agent owns gates; specialist subagents provide disciplined domain verification.
argument-hint: <issue#>
---

# Antigravity Mode 3 Execution: `/mode3-run <issue#>`

This command executes a GitHub issue end-to-end with disciplined engineering practices achieving parity with Claude `/mode3-run`. The Main Agent acts as `team-lead`, orchestrating specialized agents based on issue scope and changed file paths.

## Mandatory Execution Invariants

1. **Issue-Driven Triage Gate**: No code edits may occur before performing formal intake triage (Scope, Risk, Routing, Non-goals) per `.antigravity/commands/route-and-run.md`.
2. **Subagent Orchestration**: Main Agent MUST NOT implement changes directly. It must spawn a `mode3-orchestrator` subagent via `invoke_subagent` running on a high-capability reasoning model (Gemini Pro / High reasoning tier).
3. **jCodemunch Discovery**: Agents should use `jCodemunch-MCP` for code discovery (`search_symbols`, `get_context_bundle`, etc.) when the MCP/index is configured, fresh, and available before calling direct `Read` or `Write` tools.
   - If `jCodemunch-MCP` is unavailable, blocked, stale, or not exposed, the agent must:
     1. state exact fallback reason,
     2. use repository search cautiously,
     3. document fallback in final report,
     4. avoid claiming jCodemunch-backed discovery.
4. **Stop / Continue Policy**:
   - Continue autonomously for scoped implementation and fixable validation failures.
   - Stop with `NEEDS_USER_DECISION` for code contradictions, product choices, scope creep, pre-existing un-isolatable baseline failures, secrets/credentials, or destructive operations.
5. **Review Reconciliation & Merge Halt**: Execute mandatory Review Reconciliation phase after PR push and reviewer dispatch. Maintain cursor (`last_processed_pr_event_id`, `last_processed_timestamp`), require **2 consecutive quiet polls** with unchanged HEAD and 0 unresolved findings before completion. Emit `READY_FOR_OWNER_APPROVAL` (non-UI) or `READY_FOR_OWNER_VISUAL_APPROVAL` (UI) upon passed reconciliation and STOP. **no merge without explicit owner approval token (`OWNER_APPROVED_TO_MERGE`).** Never bypass human review gates or run closeout while `REVIEW_RECONCILIATION_IN_PROGRESS`.

## Execution Choreography (13-Step Workflow)

When `/mode3-run` is invoked, execution must strictly follow these sequential steps:
1. **Read issue scope**: Intake target GitHub issue and examine requirements.
2. **Run explorer-planner**: Classify risk level (`low`, `med`, `high`), identify ownership areas, and draft specialist routing and validation plans.
3. **Run spec-enricher if the issue is unclear**: Improve acceptance criteria, non-goals, edge cases, and test expectations before coding.
4. **Select specialist agents based on scope and changed files**: Apply the Specialist Routing Matrix.
5. **Run implementer only after specialist plan is clear**: Author scoped edits inside designated feature branch (`issue-<N>`) or git worktree.
6. **Run qa-fast or qa depending on task size**: Execute automated validation (`tsconfig.app.json`, baseline-vs-branch tuple comparison, test runners).
7. **Run security-reviewer when auth/security/public endpoint paths are touched**: Block admin link leakage, role bypass, PII exposure, or auth fallback regressions.
8. **Run performance-analyst when queries/indexes/discover/list/map paths are touched**: Verify index usage, query shapes, N+1 exclusion, and pagination limits.
9. **Run database-flyway-supabase-engineer whenever migrations/scripts/db/supabase/Testcontainers are touched**: Enforce Flyway checksum immutability, forward-only migrations, and fixture/seed separation.
10. **Run supervisor-engineer before code-reviewer**: Final supervisory quality gate evaluating scope creep, cross-file impact, and routing compliance.
11. **Run code-reviewer**: Audit all changed code. Must not approve if any required specialist returned `BLOCKER`.
12. **Run review-reconciliation**: Poll PR incrementally using cursor (`last_processed_pr_event_id`, `last_processed_timestamp`), consume new events/comments, classify & reconcile findings, resolve test claims empirically on local HEAD, enforce 2 consecutive quiet polls with unchanged HEAD before exiting.
13. **Run closeout-reporter**: Emit final report and PR closeout summary ONLY when review reconciliation is complete.

## Specialist Routing Matrix

| Touched Files / Scope Area | Required Specialist Agents |
| :--- | :--- |
| `src/**/*.tsx`, `src/**/*.ts` | `frontend-engineer` |
| frontend tests | `frontend-engineer` + `qa-fast` |
| `backend/src/main/java/**` | `backend-engineer` |
| `backend/src/test/**` | `backend-engineer` + `qa-fast` |
| `db/migration/**` | `database-flyway-supabase-engineer` + `backend-engineer` |
| `scripts/db/**` | `database-flyway-supabase-engineer` + data/fixture review if present |
| `supabase/**` | `database-flyway-supabase-engineer` + `security-reviewer` if policies/auth touched |
| `AuthContext`, `JwtConfig`, `SecurityConfig` | `security-reviewer` + `backend-engineer` |
| query / index / performance paths | `performance-analyst` |
| `docs/product/spec/issues` | `spec-enricher` + `architect` |
| UI mock / design files | `ui-designer` + `frontend-engineer` |

## Mandatory Specialist Matrix Before READY_TO_MERGE

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

If any required specialist returns `BLOCKER`, `NEEDS_REWORK`, or `UNVERIFIED`, final execution status must halt at:
```text
STATUS: NEEDS_REWORK
```
not `READY_TO_MERGE`.

## Cross-Tool Handoff Protocol

When saving intermediate transition states or handing off between tool environments, agents must emit a cross-tool handoff packet to disk (`.antigravity/handoffs/issue-<N>/cross-tool-handoff.txt`).
The packet must document:
- What remains: <explicit remaining tasks>
- Validation already run: <exact test commands and status>
