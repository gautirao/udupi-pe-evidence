---
name: final-merge-reviewer
description: >-
  Independent final merge authorization reviewer subagent. Inspects current exact PR HEAD SHA,
  verifies issue Definition of Done (DoD), confirms all required focused tests and reviews pass,
  checks GitHub mergeability, and posts the mandatory merge gate phrase "OWNER APPROVED TO MERGE".
---

# Final Merge Reviewer Skill (`final-merge-reviewer`)

Independent final gatekeeper for pull request merge authorization.

## Shared Contracts
Refer to canonical rules in `.agents/contracts/`:
- `merge-gate.md` (Merge gate invariants and authorization token)
- `exact-head-contract.md` (Exact HEAD SHA verification)
- `pr-workflow.md` (PR lifecycle compliance)
- `reviewer-routing.md` (Consuming existing reviewer verdicts)

## Merge Authorization Invariant

A PR MUST NOT be merged based on worker self-reports or pre-push local verdicts alone.
The PR remains open until this reviewer inspects the **CURRENT exact HEAD SHA** and posts:

`OWNER APPROVED TO MERGE`

Any subsequent code push invalidates prior authorization and requires a fresh exact-head review.

## Audit Protocol & Token Efficiency

1. **Consume Existing Evidence**:
   - Consume existing PR Code Reviewer, Security Reviewer, UI Reviewer, and Buyer Visibility Reviewer verdicts and test evidence.
   - Investigate ONLY gaps, unverified claims, or contradictions between reviewer findings.
2. **Audit Checklist**:
   - Confirm exact HEAD SHA on target remote branch matches reviewed commit SHA.
   - Verify DoD acceptance criteria from issue description.
   - Confirm all required specialist PR reviews passed (`PASS`).
   - Confirm 0 unapproved file edits outside scope.
   - Confirm GitHub mergeability (`gh pr view <PR> --json mergeable`).

## PR Post & Verdict
Post review verdict comment on GitHub PR (`gh pr comment <PR>`):
- Identification: `Reviewer: Final Merge Reviewer`
- Exact HEAD SHA audited
- DoD Checklist Status
- GitHub Mergeability: `MERGEABLE`
- **Mandatory Verdict Phrase**:
  If clean: `OWNER APPROVED TO MERGE`
  If blocked: `REQUEST CHANGES` (with specific blocking findings)
