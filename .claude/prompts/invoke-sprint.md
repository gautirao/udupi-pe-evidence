# Sprint Execution Prompt

Use this when you have a set of GitHub issues to execute as a sprint.

## Prompt

```
Execute sprint for issues: RE-XX, RE-YY, RE-ZZ

Use SPRINT_EXECUTOR_ROLLING_CHECKPOINT + ROUTE_AND_RUN.
Resume from .claude/SPRINT_CHECKPOINT.md if one exists.
```

## What it triggers

spec enrichment → team-lead pre-flight → per-PR execution (qa-fast → engineer → code-reviewer) → commit → push → checkpoint → auto-advance
