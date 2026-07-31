# Issue #1956 PR-4 — scope decision: R1 predicate-drift class

Tracking doc for PR-4 of 6 ("AREA listings, preview sheet and restoration parity").
Opened to host a Stage-B scope decision that needs explicit user sign-off before
implementation proceeds, per this repo's Mode-3 workflow.

## Approved plan

`team-lead-plan-pr4.toml` (plan_version = 2), PLAN_REVIEW-approved
(`.claude/openai-gates/issue-1956/20260730T081846Z-PLAN_REVIEW`, 0 blocking / 0
required changes). Risk tier: high-risk.

## What Stage-B found (qa-fast, verified by the orchestrator)

The plan's top risk, R1, was scoped as a two-site "byte-identical predicate pair"
(`MapDiscovery.tsx:1624-1628` and `useMarkerSelection.ts:272-278`) that must move in
lock-step. Verification during Stage B found it is actually a **four-site** problem:
two guard test files replicate the predicate's boolean formula as a local copy
(`isMarkerPopoverEligibleReplica`) rather than importing it, because the real
predicate is an unexported inline local in `MapDiscovery.tsx`:

- `tests/discover/marker-popover-1738-gating.test.ts:102-112`
- `tests/discover/marker-popover-1798-group-results-gating.test.ts:46`

Because these tests assert against their own copy of the formula, they PASS even when
production diverges from the test's copy — they cannot detect the exact drift they
exist to guard against. `tests/discover/**` is not in PR-4's approved `allowed_file_globs`,
so neither replica can be fixed without a scope-lock change.

## The decision

- **Option A** — widen only the two production sites (`MapDiscovery.tsx`,
  `useMarkerSelection.ts`). No scope change. Ships a green suite, but leaves both
  test files' "MUST stay byte-identical" contract silently false — the guard tests
  keep asserting against a formula copy that can now diverge from production without
  either test noticing.
- **Option B (orchestrator-2's recommendation)** — extract the predicate once as a
  named export under `src/features/discover/navigation/**` (already an allowed
  glob), and have both production call sites and both guard tests import it. This
  turns the "must stay byte-identical" risk from a review-discipline problem into a
  compile-time guarantee, permanently closing the replica-drift class. Requires
  adding the two `tests/discover/**` files above to PR-4's `allowed_file_globs`.
  `tests/discover/marker-popover-1738-gating.test.ts:64-71`'s own docstring already
  proposes this extraction.

Neither option touches PR-3's clustering module, backend code, or any other
forbidden glob.

## Recommendation

Option B. It fully closes the bug class rather than leaving a known-stale test
contract behind, consistent with how this project has previously chosen to sweep
sibling defects to completion rather than patch the one instance a gate happened to
catch.
