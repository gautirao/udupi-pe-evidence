# Lane State Ledger Contract

Maintain a compact state record for each active issue lane to avoid costly full-history or full-repository context re-reads:

```yaml
Issue: #<issue#>
Lane: lane-<issue#>
Branch: fix/<issue#>-<desc>
PR: #<pr#>
HEAD: <exact-sha>
Phase: TRIAGE | IMPLEMENTATION | REVIEW | MERGED | VERIFIED
Tests: PASS | FAIL
Review: PENDING | BLOCKED | PASSED
Blocker: None | <description>
Last reviewed HEAD: <exact-sha>
Merge authorization: NO | YES
```

## Maintenance Rules
1. Update the ledger immediately on phase transitions.
2. Use this compact ledger for orchestration decisions rather than re-querying raw GitHub logs repeatedly.
