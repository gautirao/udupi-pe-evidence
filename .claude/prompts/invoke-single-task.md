# Single Task Execution Prompt

Use this when you have a single task — not part of a sprint.

## Prompt

```
<Describe the task in 1-3 sentences>

Route via ROUTE_AND_RUN.
```

## Example

```
Add a "Listed By" filter (Owner/Dealer) to the map filters panel and show seller type badges on listing detail and modal views.

Route via ROUTE_AND_RUN.
```

## What it triggers

triage → routing → sequential agent execution (qa-fast → engineer → code-reviewer) → commit → push
