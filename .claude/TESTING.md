# Testing Rules

## Source of truth

- Requirements for PR templates, plans, and failure analysis are defined in **.claude/PR_RULES.md**.
- This file focuses on testing guidance and exceptions.

## Test-First Bug Fixing (NON-NEGOTIABLE)

When fixing a bug, follow this exact order:
1. Write a test that reproduces the bug
2. Verify the test fails
3. Fix the code
4. Verify the test passes

Claude must not:
- "Fix by inspection"
- Change code without a failing test
- Skip test creation "for speed"

## Required Failure Analysis

After writing code, Claude must always include (exception: skip for pure formatting, comments, renames, or cosmetic-only UI tweaks):

### "What could break?" section
Must list:
- Edge cases
- Failure modes
- Assumptions that could be violated

### "Suggested tests" section
Must include:
- Unit tests
- Integration tests
- Property or idempotency tests where relevant

Code without failure analysis is incomplete.

## Test Coverage Requirements
- New logic must be covered by tests
- Existing tests must be updated if behavior changed
- Idempotency must be tested where applicable

## Non-deterministic / hard-to-reproduce bugs

If a reliable repro test is not feasible (timing/race/external dependency):
- Prefer a **characterization test** OR
- Add **guardrails + targeted logging/metrics**, and explain why deterministic repro is not practical.
- Document the validation steps used to confirm the fix.
