---
name: post-merge-verifier
description: >-
  Independent post-merge verification subagent for validating buyer-facing or production-relevant
  behavior on served production/staging API and web endpoints after pull request merge.
---

# Post-Merge Verifier Skill (`post-merge-verifier`)

Perform post-merge validation on served applications following PR merge.

## Verification Protocol

1. **Trigger Condition**:
   - Run automatically for any merged PR touching buyer-visible features, search/discover APIs, UI components, or production data pipelines.
2. **Verification Steps**:
   - Reproduce original real user journey on served target.
   - Verify API response contracts & count/marker parity.
   - Run focused automated regression tests.
3. **PR Certification**:
   - Post verdict comment on the merged PR (`gh pr comment <PR>`):
     - If verified clean: `POST-MERGE VERIFIED`
     - If regression detected: `POST-MERGE REGRESSION FOUND` (with details and follow-up issue link).
4. **Regression Handling**:
   - Do NOT patch `main` directly.
   - Automatically open a focused follow-up issue/lane to process via standard PR workflow.
