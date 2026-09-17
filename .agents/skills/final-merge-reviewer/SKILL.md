---
name: final-merge-reviewer
description: >-
  Independent final merge readiness reviewer subagent. Inspects current exact PR HEAD SHA,
  verifies issue Definition of Done (DoD), confirms all required focused tests and reviews pass,
  checks GitHub mergeability, and posts the readiness verdict "READY_FOR_OWNER_MERGE_AUTHORIZATION".
---

# Final Merge Reviewer Skill (`final-merge-reviewer`)

Independent final gatekeeper for pull request merge readiness certification.

## Shared Contracts
Refer to canonical rules in `.agents/contracts/`:
- `merge-gate.md` (Owner merge authorization requirement & readiness gate)
- `exact-head-contract.md` (Exact HEAD SHA verification)
- `pr-workflow.md` (PR lifecycle compliance)
- `reviewer-routing.md` (Consuming existing reviewer verdicts)

## Merge Readiness Invariant

This reviewer acts as a final readiness certification gate. It MUST NOT emit or impersonate owner authorization phrases (`OWNER APPROVED TO MERGE` or `OWNER_APPROVED_TO_MERGE`).

When all readiness conditions pass, this reviewer posts:

`READY_FOR_OWNER_MERGE_AUTHORIZATION`

Any subsequent code push invalidates prior reviews and requires a fresh exact-head readiness audit.

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
  If clean: `READY_FOR_OWNER_MERGE_AUTHORIZATION`
  If blocked: `REQUEST CHANGES` (with specific blocking findings)
