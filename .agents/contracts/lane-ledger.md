# Lane State Ledger Contract

Maintain a compact state record for each active issue lane to avoid costly full-history or full-repository context re-reads and ensure explicit reviewer matrix tracking:

```yaml
Issue: #<issue#>
Lane: lane-<issue#>
Branch: fix/<issue#>-<desc>
PR: #<pr#>
HEAD: <exact-sha>
Phase: TRIAGE | IMPLEMENTATION | REVIEW | MERGED | VERIFIED
Tests: PASS | FAIL
Reviewer Matrix:
  pre-push-reviewer: CLEAN FOR COMMIT | CHANGES REQUIRED
  code-reviewer: PASS | REQUEST_CHANGES | PENDING
  ui-reviewer: VISUAL_MATCH | VISUAL_MISMATCH | PARTIAL | PENDING | NOT_REQUIRED
  buyer-visibility-reviewer: PASS | FAIL | PENDING | NOT_REQUIRED
  security-reviewer: PASS | FAIL | PENDING | NOT_REQUIRED
  human-owner-visual-approval: NO | YES | STALE | NOT_REQUIRED
  final-merge-reviewer: READY_FOR_OWNER_APPROVAL | READY_TO_MERGE | BLOCKED | NOT_RUN
Contradiction check: CLEAN | REVIEW_STATE_CONTRADICTION
Blocker: None | <description>
Last reviewed HEAD: <exact-sha>
Merge State: BLOCKED | READY_TO_MERGE | MERGED
Blocking Reason: None | <description>
```

## Maintenance Rules
1. Update the ledger immediately on phase transitions and after every reviewer verdict.
2. The orchestrator MUST derive merge readiness strictly from this ledger state, not from optimistic natural-language summaries.
3. If ANY reviewer field is `PARTIAL`, `BLOCK`, `REQUEST_CHANGES`, `FAIL`, `NEEDS_WORK`, or `*_PENDING`, `Merge State` MUST evaluate to `BLOCKED`.
