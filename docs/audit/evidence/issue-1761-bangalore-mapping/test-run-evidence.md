# Issue #1761 — Test Execution Evidence

Recorded by the Main Agent from first-hand re-runs (per Mode-3 backend-PR practice) in the worktree
`issue-1761-blr-macro-regions` (branch `issue-1761-blr-macro-region-mapping`), 2026-07-06.

## DiscoverSummaryServiceIT (Testcontainers, Main Agent re-run)

```toml
[test_evidence]
test_type = "integration"
command = "mvn -q -f backend/pom.xml -Dtest=DiscoverSummaryServiceIT test"
exit_code = 0
assertions_executed = true
status = "PASS"
evidence_path = "backend/target/surefire-reports/com.example.realestate.discover.DiscoverSummaryServiceIT.txt"
notes = "Tests run: 20, Failures: 0, Errors: 0, Skipped: 0 (11.12 s). Flyway applied 109 migrations to fresh postgis/postgis:15-3.4 container, now at v106. getGroupsByCity(bangalore) returned 16 active groups."
```

Covers IT-1..IT-7 of the approved plan plus the V106 idempotency re-execution test:
West Bangalore existence/counting/rollup shape, bangalore membership-uniqueness invariant,
V78 overlap repair (Yelahanka/Hebbal only in north-growth; Marathahalli only in tech-corridor),
exactly-once accounting (sum of region counts == seeded listings), fresh-DB chain application
(16 groups, 314 members = 13 − 3 + 304), and idempotent re-run of the full V106 script.

## Full backend suite (Main Agent re-run)

```toml
[test_evidence]
test_type = "unit+integration"
command = "mvn -f backend/pom.xml test"
exit_code = 0
assertions_executed = true
status = "PASS"
evidence_path = "backend/target/surefire-reports/"
notes = "Full suite re-run after V106 + IT changes: Tests run: 2961, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS."
```

## Browser evidence

Not executed pre-merge: live browser/E2E smoke against the shared hosted Supabase DB is
policy-forbidden (it would apply unmerged Flyway migrations to a shared resource). Post-merge
verification of `GET /api/discover/summary?city=bangalore&listingPurpose=sale` and the city
landing macro-region cards is documented as a follow-up in README §7.

Status labels follow CLAUDE.md §11: the two suites above are AUTOMATED PASS with exit code 0;
browser verification is deferred, not claimed.
