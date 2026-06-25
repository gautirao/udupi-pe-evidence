---
name: mode3-run
description: Hands-off Mode-3 execution in Antigravity for an approved GitHub issue. Main Agent owns gates; Subagents provide concurrent transport; Route-and-Run defines choreography.
argument-hint: <issue#>
---

# Antigravity Mode 3 Execution: `/mode3-run <issue#>`

This command executes a GitHub issue end-to-end with disciplined engineering practices matching Claude `/mode3-run`. The Main Agent acts as team lead and gatekeeper, delegating investigation and implementation to specialized subagents.

## Mandatory Execution Invariants

1. **Issue-Driven Triage Gate**: No code edits may occur before performing formal intake triage (Scope, Risk, Routing, Non-goals) per `.antigravity/commands/route-and-run.md`.
2. **Subagent Orchestration**: Main Agent MUST NOT implement changes directly. It must spawn a `mode3-orchestrator` subagent via `invoke_subagent` (or `define_subagent`) running on a high-capability reasoning model (Gemini Pro / High reasoning profile).
3. **jCodemunch Navigation**: Agents should use `jCodemunch-MCP` for code discovery (`search_symbols`, `get_context_bundle`, etc.) when the MCP/index is configured, fresh, and available before calling direct `Read` or `Write` tools.
   - If `jCodemunch-MCP` is unavailable, stale, or not configured, the agent must:
     1. state that fallback mode is active,
     2. use repository search and direct file inspection cautiously,
     3. document the fallback in the final report,
     4. avoid claiming jCodemunch-backed discovery or validation.
4. **Stop / Continue Policy**:
   - Continue autonomously for scoped, straightforward implementation and fixable validation failures.
   - Stop with `NEEDS_USER_DECISION` for code contradictions, product choices, scope creep, pre-existing un-isolatable baseline failures, secrets/credentials, or destructive operations.
5. **Merge Halt**: Stop with `READY_TO_MERGE` upon PR opening and verified validation. **No merge without user approval.** No admin/privileged merge bypass.

## Phase Execution Index

| Phase | Actor | Action | Governing Contract |
| :--- | :--- | :--- | :--- |
| **Phase 0** | Main Agent | Preflight scan for duplicate runs & lock acquisition | `.antigravity/contracts/main-agent.md` |
| **Phase 1** | Main Agent | Intake triage & write `team-lead-assignment.toml` | `.antigravity/commands/route-and-run.md` |
| **Phase 2** | Orchestrator | Code discovery (jCodemunch) & author implementation plan | `.antigravity/agents/mode3-orchestrator.md` |
| **Phase 3** | Main Agent | Plan review & materialization | `.antigravity/contracts/main-agent.md` |
| **Phase 4** | Implementer | Scoped code edits in feature branch (`issue-<N>`) | `.antigravity/contracts/implementation.md` |
| **Phase 5** | Validator | Repository validation gates (`tsconfig.app.json`, tests) | `.antigravity/contracts/validation.md` |
| **Phase 6** | Main Agent | Final code review & browser verification | `.antigravity/commands/workdone-review.md` |
| **Phase 7** | Reporter | Open PR & emit standardized final report / handoff | `.antigravity/commands/closeout.md` |

To start: Read the target issue `<issue#>`, perform Phase 0 preflight checks, and proceed through Phase 1.
