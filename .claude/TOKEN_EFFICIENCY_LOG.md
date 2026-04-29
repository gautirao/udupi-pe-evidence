# Token Efficiency Log

Best-effort bookkeeping. Missing values → `UNKNOWN`. Log failure does not block any gate.

Written by: PostToolUse Bash hook in `.claude/settings.json` — fires automatically on every `gh pr merge` command.

## Columns

| Column | Source |
|---|---|
| `date` | YYYY-MM-DD of PR merge or BLOCKED stop |
| `issue` | GitHub issue number |
| `pr` | GitHub PR number (`N/A` if no PR was created) |
| `tier` | Classification tier from GSR (trivial/normal/high-risk/doc-only) |
| `mode` | Execution mode from GSR (Lean/Standard/Full Guardrail/N/A) |
| `cost_route` | Cost route from GSR (DIRECT/HAIKU/SONNET/OPUS) |
| `agents` | Subagents used from GSR, comma-separated |
| `sonnet_out` | Sonnet output tokens from usage snapshot delta, else UNKNOWN |
| `haiku_out` | Haiku output tokens from usage snapshot delta, else UNKNOWN |
| `cost_usd` | Cost in USD from usage snapshot delta, else UNKNOWN |
| `changed_lines` | Lines changed from `git diff --stat HEAD~1` or PR stats, else UNKNOWN |
| `review_cycles` | `code-review-cycles` from fixlog |
| `qa_cycles` | `qa-verify-cycles` from fixlog |
| `e2e` | QA E2E result from GSR (PASS/SKIPPED/FAIL/BLOCKED/PARTIAL) |
| `quality_regression` | YES if any QA Failures row Status=NEW · NO if none · UNKNOWN if fixlog absent |

## Log

| date | issue | pr | tier | mode | cost_route | agents | sonnet_out | haiku_out | cost_usd | changed_lines | review_cycles | qa_cycles | e2e | quality_regression |
|------|-------|----|------|------|------------|--------|-----------|----------|---------|--------------|--------------|---------|-----|--------------------|
| 2026-04-29 | #916 | #927 | normal | Standard | SONNET | frontend-engineer | UNKNOWN | UNKNOWN | UNKNOWN | +249/-1 | 0 | 1 | PASS | NO |
| 2026-04-29 | #null | #928 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 94 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| 2026-04-29 | #931 | #933 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 40 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
