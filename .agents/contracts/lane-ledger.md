# Lane State Ledger Contract

Maintain a compact state record for each active issue lane to avoid costly full-history or full-repository context re-reads and ensure explicit reviewer matrix tracking:

```yaml
Issue: #<issue#>
Lane: lane-<issue#>
Branch: fix/<issue#>-<desc>
PR: #<pr#>
HEAD: <exact-sha>
Phase: TRIAGE | IMPLEMENTATION | PRE_PUSH_REVIEW | PUSH | REVIEW_RECONCILIATION | MERGED | VERIFIED
Review Reconciliation Status: REVIEW_RECONCILIATION_IN_PROGRESS | BLOCKED | READY_FOR_OWNER_APPROVAL | READY_FOR_OWNER_VISUAL_APPROVAL | READY_TO_MERGE
Last Processed PR Event ID: <id>
Last Processed Timestamp: <iso-timestamp>
Consecutive Quiet Polls: <count>
Tests: PASS | FAIL
Reviewer Matrix:
  pre-push-reviewer: CLEAN FOR COMMIT | CHANGES REQUIRED
  code-reviewer: PASS | REQUEST_CHANGES | PENDING
  ui-reviewer: VISUAL_MATCH | VISUAL_MISMATCH | PARTIAL | PENDING | NOT_REQUIRED
  buyer-visibility-reviewer: PASS | FAIL | PENDING | NOT_REQUIRED
  security-reviewer: PASS | FAIL | PENDING | NOT_REQUIRED
  human-owner-visual-approval: NO | YES | STALE | NOT_REQUIRED
  final-merge-reviewer: READY_FOR_OWNER_APPROVAL | READY_TO_MERGE | BLOCKED | NOT_RUN
Unresolved Findings: None | [<list of unresolved finding descriptions>]
Contradiction Check: CLEAN | REVIEW_STATE_CONTRADICTION
Blocker: None | <description>
Last reviewed HEAD: <exact-sha>
Merge State: BLOCKED | READY_FOR_OWNER_APPROVAL | READY_FOR_OWNER_VISUAL_APPROVAL | READY_TO_MERGE | MERGED
Blocking Reason: None | <description>
```

## Maintenance Rules
1. Update the ledger immediately on phase transitions, after every PR event read, and after every reviewer verdict.
2. The orchestrator MUST derive merge readiness strictly from this ledger state, not from optimistic natural-language summaries.
3. If ANY reviewer field is `PARTIAL`, `BLOCK`, `REQUEST_CHANGES`, `FAIL`, `NEEDS_WORK`, or `*_PENDING`, `Merge State` MUST evaluate to `BLOCKED`. A subsequent `PASS` from another reviewer does NOT erase an unresolved `PARTIAL`/`BLOCK`.
4. Update `Last Processed PR Event ID` and `Last Processed Timestamp` whenever new PR events/comments are read to maintain the polling cursor and avoid duplicate processing.
5. Increment `Consecutive Quiet Polls` only when a polling cycle yields zero new PR events since cursor and target branch HEAD is unchanged. Any code push or new PR comment resets `Consecutive Quiet Polls` to 0.
6. `Review Reconciliation Status` must evaluate to `REVIEW_RECONCILIATION_IN_PROGRESS` until at least 2 consecutive quiet polls complete with 0 unresolved findings and 0 contradictions.
7. Allowed final values for `Review Reconciliation Status`: `REVIEW_RECONCILIATION_IN_PROGRESS`, `BLOCKED`, `READY_FOR_OWNER_APPROVAL`, `READY_FOR_OWNER_VISUAL_APPROVAL`, `READY_TO_MERGE`.
8. `READY_FOR_OWNER_APPROVAL` and `READY_FOR_OWNER_VISUAL_APPROVAL` are non-mergeable states indicating readiness for human owner review. `Merge State` transitions to `READY_TO_MERGE` ONLY AFTER explicit human owner approval (`OWNER_APPROVED_TO_MERGE` or explicit owner merge command) is recorded for the exact current HEAD SHA.
