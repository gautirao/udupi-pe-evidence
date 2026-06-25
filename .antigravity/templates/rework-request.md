# Rework Request Brief

This brief is generated when a validation gate or review identifies required fixes.

## Gate Verdict
STATUS: NEEDS_FIXES / REVISION_REQUIRED

## Revision Instructions
- Target Gate: <PLAN_REVIEW | WORKDONE_REVIEW | PR_REVIEW | VALIDATION>
- Required Fixes: <Exact description of required modifications and line numbers>
- Scope Constraints: Must remain within approved issue globs.

---

## Cross-Tool Handoff Packet

Issue: <Issue Number or Title>
Branch: <Feature Branch Name>
Base commit: <SHA of branch origin>
Current commit: <SHA of HEAD>
Files changed: <Comma-separated list of modified paths>
What was done: <Summary of completed implementation steps>
What remains: <Explicit list of remaining fixes required by review>
Validation already run: <Exact commands executed and their exit status>
Known failures: <Details of baseline or test failures>
Next recommended action: <Immediate next step for implementer subagent or resuming tool>
