# #1786 — Test run evidence

All commands run from `backend/` (via `mvn -f backend/pom.xml ...` to satisfy the "one command per
invocation, no `&&` chaining" shell rule). Real exit codes captured; PASS reported only where the
command exited 0 AND assertions actually executed (surefire report tests-run counts confirmed per
CLAUDE.md §11).

| Command | Exit code | Tests run | Failures | Errors | Status |
|---|---|---|---|---|---|
| `mvn -q clean compile -DskipTests` | 0 | n/a (compile only) | n/a | n/a | PASS |
| `mvn -q test -Dtest=ListingResponseMapperTest` | 0 | 60 | 0 | 0 | PASS |
| `mvn -q test -Dtest=PublicListingControllerTest` | 0 | 35 | 0 | 0 | PASS |
| `mvn -q test -Dtest=AdminListingControllerTest` | 0 | 40 | 0 | 0 | PASS |
| `mvn -q test -Dtest=ListingControllerTest` | 0 | 73 | 0 | 0 | PASS |
| `mvn -q test -Dtest=ListingControllerAgriValidationTest` | 0 | 12 | 0 | 0 | PASS |
| `mvn -q test -Dtest=ListingControllerFamilyValidationTest` | 0 | 68 | 0 | 0 | PASS |

Tests-run counts were read directly from each test's
`backend/target/surefire-reports/com.example.realestate.listing.api.<TestClass>.txt` report after
each run (e.g. `Tests run: 60, Failures: 0, Errors: 0, Skipped: 0`), not inferred from console
output alone.

## Why the last 4 commands were needed

Adding a new component to the `ListingResponse` record shifts its canonical positional constructor.
Besides the one production call site (`ListingResponseMapper.build`, already updated), four test
files construct `ListingResponse` directly via the positional constructor to synthesize mapper
mocks:

- `AdminListingControllerTest.java` (mocks `toResponse` — internal, admin-facing)
- `ListingControllerAgriValidationTest.java` (mocks `toResponse` — internal)
- `ListingControllerFamilyValidationTest.java` (mocks `toResponse` — internal)
- `ListingControllerTest.java` (mocks `toResponse` — internal)

Each received a single mechanical fix: insert `null` for the new `trustBadge` argument in the exact
positional slot immediately after `trustTier`, with no other argument shifted and no assertion
changed. This mirrors production `toResponse` (internal) behavior, where `trustBadge` is always
`null`. This was flagged as a blocker before being applied, and scope was explicitly expanded by
the orchestrator to authorize the fix before it was made.

`PublicListingControllerTest.java`'s `toPublicResponse` mock (already in original scope) was
updated to *behave* like the real public-projection mapper — `trustTier` is now hardcoded `null`
and `trustBadge` is computed via `TrustBadge.publicBadge(l.getTrustTier())` — so the two
authenticated-buyer detail tests assert a *meaningful* security invariant (raw grade never present
in the public JSON) rather than trivially passing against a stale mock.
