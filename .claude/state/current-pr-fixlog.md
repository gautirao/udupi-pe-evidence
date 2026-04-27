# PR Fixlog — #847 [E2E] Anonymous vs authenticated gallery behaviour

## Counters
| Field | Value |
|-------|-------|
| engineer-cycles | 2 |
| code-review-cycles | 2 |
| qa-verify-cycles | 0 |
| qa-targeted-reruns | 0 |
| qa-full-reruns | 0 |

## Reviewer Baseline
baseline_sha: bfb9503a43d244a6fe105eabf8e60f3e2de01d67

## Findings
| ID | Severity | File | Line | Status |
|----|----------|------|------|--------|
| F1 | BLOCKING | gallery-behaviour.spec.ts | 96 | FIXED |
| F2 | ADVISORY | ListingDetail.tsx | 393 | FIXED |
| F3 | ADVISORY | gallery-behaviour.spec.ts | 220 | FIXED |
| F4 | ADVISORY | gallery-behaviour.spec.ts | 255 | FIXED |

## Finding Details
- F1: Counter selector div.absolute.top-3.right-3 ambiguous — add data-testid="gallery-counter" to ListingDetail.tsx and use getByTestId in spec
- F2: z-10 has no comment explaining stacking intent — add inline comment
- F3: A5 doesn't confirm gallery image loaded before asserting thumbnail absence — could pass vacuously
- F4: B-tests lack early auth-failure signal — add tablist visibility assertion before nav assertions

## QA Failures
| ID | Spec | Test | Status | Notes | Rerun Scope |
|----|------|------|--------|-------|-------------|

## Agent Ledger
| Step | Agent | Action | Notes |
|------|-------|--------|-------|
| 1 | qa-fast | COMPLETE | classification=low/test, selectors + guard patterns identified |
| 2 | qa | COMPLETE | 9/9 E2E pass; z-index bug found + fixed; page.evaluate workaround removed |
| 3 | code-reviewer | REQUEST_CHANGES | 1 BLOCKING (counter selector), 3 ADVISORY |
| 4 | frontend-engineer | COMPLETE | F1-F4 all fixed; 9/9 E2E pass, 41/41 unit pass |
| 5 | code-reviewer | APPROVE | delta-only; all 4 findings FIXED, no new blockers |
