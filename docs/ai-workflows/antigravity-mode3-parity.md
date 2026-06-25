# Antigravity Mode 3 Parity Workflow

This document explains the Antigravity workflow setup designed to achieve practical parity with Claude's `/mode3-run` disciplined engineering workflow. It enables engineers and autonomous agents to seamlessly switch between Claude and Antigravity when tokens run out or environment context shifts, without losing process discipline, issue lifecycle tracking, validation rigor, or reporting standards.

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
- **Branch & PR Discipline**: Isolation in feature branches (`issue-<N>`), atomic commits, and mandatory user merge approval.
- **Validation Discipline**: Rigorous execution of repository-specific test gates (e.g., frontend typechecking via `tsconfig.app.json` and `baseline-vs-branch` diffing).
- **Standardized Handoffs & Reporting**: Authoritative disk-backed final reports and cross-tool transition packets.

### What Was Adapted for Antigravity
- **Subagent & Messaging Architecture**: Claude's experimental Agent Teams (tmux pane transport) is replaced by Antigravity's native `invoke_subagent` tool and asynchronous reactive messaging. Subagents report back directly into context without loop polling.
- **Model Agnosticism**: Removed hardcoded provider model strings (e.g., `opus`, `sonnet`). Instructions enforce capability tiers (e.g., "high-capability reasoning model") matching Antigravity runner profiles.
- **Navigation Integration**: Aligned with repository `AGENTS.md` rules: agents should use `jCodemunch-MCP` for code discovery when the MCP/index is configured, fresh, and available. If unavailable, stale, or not configured, state that fallback mode is active, use repository search cautiously, document the fallback in the final report, and avoid claiming jCodemunch-backed discovery.

---

## 2. How to Run Antigravity Mode 3

To execute an issue end-to-end in Antigravity with Mode 3 discipline:

1. **Start the Session**: Ensure your Antigravity session is initialized at the repository root.
2. **Invoke the Command Prompt**: Instruct Antigravity to execute `.antigravity/commands/mode3-run.md` with the target GitHub issue number or pasted issue body:
   ```text
   Run .antigravity/commands/mode3-run.md for Issue #1094
   ```
3. **Phase Execution**:
   - **Intake & Triage**: Antigravity inspects the issue, verifies repository index freshness, and writes `team-lead-assignment.toml`.
   - **Planning**: The `mode3-orchestrator` agent investigates via jCodemunch tools and authors an implementation plan.
   - **Execution & Validation**: The implementer executes scoped edits in a feature branch, running required validation gates.
   - **Review & Gate Check**: Independent browser and code verification run before marking work done.
4. **Merge Halt**: Upon completion and PR opening, Antigravity halts and reports `READY_TO_MERGE`. **No merge occurs without explicit user approval.**

---

## 3. Cross-Tool Handoff Protocol

When switching tools mid-task (e.g., due to token rate limits or context window exhaustion), both Claude and Antigravity rely on standardized disk-backed handoff packets.

### Standard Handoff Format
Save transition states to `.antigravity/handoffs/issue-<N>/cross-tool-handoff.txt` (or `.claude/handoffs/issue-<N>/cross-tool-handoff.txt`) using this exact schema:

```text
Issue: <Issue Number or Title>
Branch: <Feature Branch Name>
Base commit: <SHA of branch origin>
Current commit: <SHA of HEAD>
Files changed: <Comma-separated list of modified paths>
What was done: <Summary of completed implementation steps>
What remains: <Explicit list of remaining tasks or gates>
Validation already run: <Exact commands executed and their status>
Known failures: <Details of baseline or test failures>
Next recommended action: <Immediate next step for resuming tool>
```

### Handing Off from Claude to Antigravity
1. In Claude, instruct the agent to halt and emit a cross-tool handoff:
   `Generate cross-tool handoff for Issue #<N>`
2. Open Antigravity and provide the resume prompt:
   ```text
   Resume execution for Issue #<N> following .antigravity/commands/mode3-run.md. 
   Read state from .claude/handoffs/issue-<N>/cross-tool-handoff.txt
   ```
3. Antigravity reads the base/current commit, checks out the feature branch, transcribes remaining tasks into its orchestrator plan, and continues execution.

### Handing Off from Antigravity back to Claude
1. In Antigravity, request a transition stop:
   `Write cross-tool handoff packet to .antigravity/handoffs/issue-<N>/cross-tool-handoff.txt and stop.`
2. Open Claude and run:
   ```text
   /mode3-run <N> --resume-from .antigravity/handoffs/issue-<N>/cross-tool-handoff.txt
   ```

---

## 4. Validation & Quality Discipline

Antigravity enforces strict verification contracts defined in `.antigravity/contracts/validation.md`.

### Authoritative Frontend Correctness
Bare `tsc --noEmit` is strictly prohibited. All frontend TypeScript correctness checks MUST execute:
```bash
node node_modules/.bin/tsc --noEmit -p tsconfig.app.json
```

### Baseline-vs-Branch Comparison
If pre-existing TypeScript errors exist on `main`, agents must NOT claim "0 errors" unless net-new errors are isolated. Agents must compare baseline errors against branch errors using normalized tuples:
```text
file + TS code + normalized message
```
Only errors absent from the baseline tuple set are treated as net-new regressions.

---

## 5. Known Limitations

1. **Pane Visibility**: Unlike Claude Code's tmux split-pane layout, Antigravity subagents run asynchronously in background conversation IDs. Visibility is maintained via transcript logs and summary notifications rather than terminal panes.
2. **Hook Invalidation**: Claude's `PostToolUse` auto-reindexing hooks are not present in Antigravity. Agents explicitly invoke index refresh or follow jCodemunch MCP fallback guidelines.
3. **Privileged Bypasses**: Neither tool supports admin or branch-protection bypasses. Release commands always require interactive human confirmation.

---

## 6. Infrastructure Verification

To verify the integrity of the Antigravity Mode 3 parity setup, run:
```bash
python3 .antigravity/scripts/verify-antigravity-mode3.py
```
This script checks for all required command, agent, contract, and template files and verifies the presence of critical discipline invariants (`READY_TO_MERGE`, `NEEDS_USER_DECISION`, `tsconfig.app.json`, `baseline-vs-branch`, `no merge without user approval`).
