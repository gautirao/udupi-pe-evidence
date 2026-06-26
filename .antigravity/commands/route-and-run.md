---
name: route-and-run
description: Route-and-Run planning discipline and specialist triage gate for Antigravity workflows.
---

# Route-and-Run Discipline

All tasks in Antigravity must undergo structured Route-and-Run triage before executable edits occur.

## Hard Gate: No Code Before Triage

Before writing or editing any product code, the Main Agent or Orchestrator MUST output this exact block into the conversation trajectory:

```text
Summary: <1 line description>
Type: {bugfix | small-change | feature | refactor | perf | security | incident | ui | test}
Scope: {single-service | multi-service | cross-cutting}
Risk: {low | med | high} — <explicit rationale>
Routing: <specialist agent routing chain, e.g. explorer-planner -> implementer -> supervisor-engineer -> code-reviewer>
Non-Goals: <explicit list of excluded boundaries>
Validation Plan: <exact test commands to verify success>
```

If this triage block is missing, execution is non-compliant and must stop immediately.

## Planning Rules

1. **Issue Classification**: Accurately classify whether the issue represents product implementation, architectural design, security audit, defect debugging, or tech-debt cleanup.
2. **Dependency Mapping**: Identify prerequisite modules, database schemas, or environment secrets before launching subagents.
3. **Specialist Agent Routing**: Do not spawn superfluous subagents. Select targeted specialist roles (`explorer-planner`, `spec-enricher`, `frontend-engineer`, `backend-engineer`, `database-flyway-supabase-engineer`, `security-reviewer`, `performance-analyst`, `qa-fast`, `qa`, `supervisor-engineer`, `code-reviewer`) matching the issue risk level and touched files per `/mode3-run` routing matrix.
4. **jCodemunch Discovery**: Agents should use `jCodemunch-MCP` for code exploration (`search_symbols`, `get_file_outline`) when the MCP/index is configured, fresh, and available to populate the implementation plan accurately. If unavailable, stale, or not configured, state that fallback mode is active, use repository search cautiously, document the fallback in the final report, and avoid claiming jCodemunch-backed discovery.
