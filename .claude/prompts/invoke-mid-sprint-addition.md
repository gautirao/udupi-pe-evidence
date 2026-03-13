# Mid-Sprint Issue Addition Prompt

Use this when a new issue needs to be inserted into an already-running sprint.

## Prompt

```
Add RE-XX to the current sprint.

Use SPRINT_EXECUTOR_ROLLING_CHECKPOINT mid-sprint addition protocol:
1. Fetch RE-XX from Linear
2. Run spec-enricher — show full output before proceeding
3. Run lightweight team-lead conflict check against completed/in-progress work
4. Update checkpoint with new enriched spec and revised execution order
5. Continue sprint from next pending PR

Current checkpoint:
[paste .claude/SPRINT_CHECKPOINT.md contents here]
```

## What it triggers

spec-enricher (opus) → prints enriched spec to conversation → lightweight team-lead conflict check → checkpoint updated → sprint continues

## When to use

- A new issue is created mid-sprint and needs to be pulled in immediately
- A backlog issue is re-prioritised into the current sprint
- A blocking issue is discovered during implementation and needs to be tracked

## Notes

- If spec-enricher flags a SPEC GAP, the flow pauses for your input before team-lead runs
- If team-lead flags a file conflict with completed/in-progress PRs, the flow pauses for your input before inserting the issue into the execution order
- The checkpoint preamble (`Enriched specs:`, `Execution order:`, `Dependencies:`) is updated in place — no sprint restart required
