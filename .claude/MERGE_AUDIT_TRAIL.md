# Workflow Doc Merge Audit Trail

**Date:** 2026-03-30 | **Commit:** 0bd0b1c | **PRs resolved:** #541, #499

## Context

Two workflow PRs had unresolvable merge conflicts with main:
- **PR #541** (`chore/orchestrator-dropin-improvements`): D1–D7 orchestrator enhancements
- **PR #499** (`chore/workflow-compliance-gates`): compliance gate hardening

Both branches had diverged significantly from main (which advanced through Sprints 30, 31, 32). Manual merge was infeasible; branches would have required complete rebase. **Decision:** merge intent-based rather than by branch.

## What Was Adopted (Commit 0bd0b1c)

### ROUTE_AND_RUN.md
| Content | Source | Status |
|---------|--------|--------|
| Known repo rule: `DragEvent` dispatch for file drops in E2E | PR #541 | ✅ Merged — fiber-walk removed in Sprint 32 #667 |

### SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md
| Content | Source | Status |
|---------|--------|--------|
| Parallel-Safe Execution section (user-directed only, 5 eligibility rules) | PR #541 | ✅ Merged |
| Pre-commit compliance check HARD GATE (5 conditions before git commit) | PR #499 | ✅ Merged |
| `Gate record:` compact audit field in both checkpoint formats | PR #499 | ✅ Merged |
| `Evidence refs:` agent-tracing field in both checkpoint formats | PR #499 | ✅ Merged |
| Gate record: rules subsection (sourcing + resume validation) | PR #499 | ✅ Merged |

**Already present in main (no action needed):** authority statement, evidence verbosity by tier, invalid skip reasons, engineer pre-flight checklist, SPRINT_EXECUTOR boundary rule, all richer checkpoint fields (Integration validation, Sprint-level conventions, Revert Protocol).

## What Was Intentionally NOT Adopted

### PR #499: `gh pr checks --watch` (CI-wait logic) — Step 6
**Decision:** ❌ Deliberately excluded
**Reason:** Conflicts with main's **local-E2E-primary** model (documented in memory as of Sprint 32). Main correctly prioritizes:
- Pre-push hook E2E as the **primary merge gate** (not CI)
- CI green as a **bonus signal, not blocker**
- Infrastructure failures (billing, runner timeout, network) do NOT block merge when local E2E passed

Adding `gh pr checks --watch` would introduce a CI-first expectation that contradicts this intentional design.

### PR #499: Reviewer feedback HARD RULE in SE Step 4 — "When code-reviewer returns REQUEST CHANGES"
**Decision:** ❌ Not duplicated
**Reason:** Already fully covered elsewhere (not lost). **Exact reference:**
- **File:** `.claude/skills/ROUTE_AND_RUN.md`
- **Section:** Orchestrator Boundary Rules → MUST NOT item #5
- **Location:** Line 512 onward
- **Content:** "Apply reviewer findings directly — always re-invoke the responsible engineer" + full retry cycle rules

This rule is enforced globally at the ROUTE_AND_RUN level, not just at SPRINT_EXECUTOR. Adding it to SE would be redundant and weaken the single-source-of-truth principle.

## Audit Summary

- **PRs closed:** #541, #499 (without merge, via direct commit)
- **Changelog:** 36 lines added, 1 line updated across 2 files
- **Conflicts resolved:** Yes (intent-based, not auto-merge)
- **Process loss:** None (all workflow discipline principles preserved)
- **Durable audit:** This document + commit message 0bd0b1c

**Verification:** Both files reread post-commit to confirm correct placement, no duplication, clean context integration. All merged sections contextualize correctly with neighboring rules.
