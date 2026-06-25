---
name: closeout
description: Closeout and reporting choreography for Antigravity Mode 3 execution. Enforces mandatory user merge approval and standardized reports.
---

# Closeout & Reporting Choreography

When implementation and validation are complete, the workflow transitions to closeout.

## Mandatory Release Safeguard

**Release commands require explicit human user approval.**
Release commands include:
- `gh pr merge` / `git merge`
- `git push --force`
- `git reset --hard`
- `git branch -D`

**Hard Invariant:** No agent or model may merge a PR or execute destructive operations without an explicit user message in the current session approving that specific action (e.g., "approve", "merge", "yes"). PR review approval is NOT user merge approval.

## Closeout Protocol

1. **Pull Request Creation**: Push the feature branch (`issue-<N>`) and open a pull request.
2. **Final Report Generation**: Populate `.antigravity/templates/final-report.md` and emit it into the chat.
3. **Cross-Tool Handoff**: Write `.antigravity/handoffs/issue-<N>/cross-tool-handoff.txt` to enable cross-tool transition if needed.
4. **Report Status & Halt**:
   - If PR is open and validation passed: Report `READY_TO_MERGE` and stop. Wait for user merge decision.
   - If blocked or product decisions needed: Report `NEEDS_USER_DECISION` or `BLOCKED` and stop.
