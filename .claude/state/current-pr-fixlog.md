# PR Fixlog — #746 feat(map): View Area Overview button + New badge on listing cards

## Counters
| Field | Value |
|-------|-------|
| engineer-cycles | 2 |
| code-review-cycles | 2 |
| qa-verify-cycles | 0 |
| qa-targeted-reruns | 0 |
| qa-full-reruns | 0 |

## Reviewer Baseline
baseline_sha: 226d8f7

## Findings
| ID | Severity | File | Line | Status |
|----|----------|------|------|--------|
| F1 | BLOCKING | usePropertyListings.ts | polygonResponseToListing | OPEN — areaKey not mapped in polygon path; button always invisible in polygon-draw mode |
| F2 | BLOCKING | Index.tsx | areaOverviewKey memo | OPEN — stale listings race on locality switch; cross-check l.locality === filters.localities[0] |
| F3 | ADVISORY | MapFilters.test.tsx | (missing) | OPEN — no test for button conditional render + navigation |
| F4 | ADVISORY | Index.tsx | isNew | OPEN — isNew defined inside render body; move to module-level pure function |
| F5 | ADVISORY | Index.tsx | isNew | OPEN — isNew boundary and null-guard untested |

## QA Failures
| ID | Spec | Test | Status | Notes | Rerun Scope |
|----|------|------|--------|-------|-------------|

## Agent Ledger
| Step | Agent | Action | Notes |
|------|-------|--------|-------|
| 1 | qa-fast | Pre-impl risk scan | areaKey blocker resolved: derive from first visible listing's areaKey; New badge UTC 7×24h; E2E YES |
| 2 | frontend-engineer | Implement #746 | MapFilters.tsx + Index.tsx + usePropertyListings.ts; 266 unit tests pass |
| 3 | code-reviewer | Review | REQUEST CHANGES — F1 (polygon path missing areaKey), F2 (stale listings race) |
| 4 | frontend-engineer | Fix F1-F5 | polygon mapper + locality guard + isNew module-level + tests |
| 5 | code-reviewer | Delta review | APPROVED — isNew boundary test flaky (fixed inline with fake timers) |
