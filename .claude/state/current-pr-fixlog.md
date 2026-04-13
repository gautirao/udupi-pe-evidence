# PR Fixlog — #745 feat(frontend): listing detail — two-column layout, sidebar, Locality Insights card, Key Highlights

## Counters
| Field | Value |
|-------|-------|
| engineer-cycles | 1 |
| code-review-cycles | 1 |
| qa-verify-cycles | 0 |
| qa-targeted-reruns | 0 |
| qa-full-reruns | 0 |

## Reviewer Baseline
baseline_sha: a5e0aa6

## Findings
| ID | Severity | File | Line | Status |
|----|----------|------|------|--------|

## QA Failures
| ID | Spec | Test | Status | Notes | Rerun Scope |
|----|------|------|--------|-------|-------------|

## Agent Ledger
| Step | Agent | Action | Notes |
|------|-------|--------|-------|
| 1 | qa-fast | Pre-impl risk scan | Breakpoint must be lg: (1024px) not md: (768px); E2E YES (UJ1); RequestViewingModal reused as-is, "Contact Broker" button label from caller |
| 2 | backend-engineer | Add areaKey to ListingResponse + mapper | 5 files touched; 1401 tests pass |
| 3 | frontend-engineer | Two-column layout + sidebar + Locality Insights + Key Highlights | ListingDetail.tsx + useBrokerListings.ts |
| 4 | code-reviewer | Review | APPROVE WITH COMMENTS — no BLOCKING; advisory: areaKey JSON assertions missing in tests, Contact Broker label/intent note, Key Highlights duplicates chip card |
