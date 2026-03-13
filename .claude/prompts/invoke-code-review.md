# Code Review Only Prompt

Use this when changes are already made and you just want a review — no implementation.

## Prompt

```
Review the changes on branch `feat/my-branch` (PR #NNN).

Use code-reviewer with review_mode: backend|frontend|both.
Focus on: <specific concerns if any>.
```

## Example

```
Review the changes on branch `feat/re-86-owner-listing-backend` (PR #134).

Use code-reviewer with review_mode: backend.
Focus on: seller type inference correctness, owner limit race safety, test coverage.
```

## What it triggers

Reads the diff, constructs a structured review brief from `.claude/prompts/code-review-{backend|frontend}.md`, invokes code-reviewer agent with appropriate model (sonnet default, opus for high-risk).
