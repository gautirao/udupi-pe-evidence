---
name: quick
description: >-
  Execute a single contained issue or task autonomously from triage to PR creation
  and independent review boundary. Creates isolated worktree, opens draft PR early,
  implements fix, runs tests, and posts evidence. Use when user requests "quick <issue#>"
  or fast-track issue implementation.
---

# Quick Task Execution Skill (`quick <issue#>`)

Autonomous single-issue implementation worker operating inside an isolated worktree lane.

## Shared Contracts
Refer to canonical rules in `.agents/contracts/`:
- `worktree-contract.md` (Path and branch isolation)
- `pr-workflow.md` (Early draft PR & durable channel)
- `exact-head-contract.md` (HEAD SHA commitment)

## Execution Protocol

1. **Worktree & Branch**: Setup/recover worktree at `/Users/gouthamrao/projects/udupi-property-explorer-worktrees/lane-<issue#>`.
2. **Draft PR**: Ensure Draft PR (`gh pr create --draft`) is open early.
3. **Investigation**: Reproduce issue before editing code. Post root-cause finding to PR.
4. **Implementation & Tests**:
   - Make smallest correct fix avoiding unrelated churn.
   - Run focused regression tests (assert 100% pass).
5. **Push & Evidence**:
   - Commit (`git commit -m "fix(...): ... (#<issue#>)"`) and push to remote branch.
   - Mark PR ready for review (`gh pr ready <PR>`).
   - Post exact HEAD SHA, root cause, test evidence, and served UI screenshots (if applicable) to PR.
6. **Compact Status Report**:
   Return concise report to orchestrator:
   ```yaml
   status: READY_FOR_REVIEW
   exact_HEAD: <sha>
   findings: <short-summary>
   evidence: <test-results-or-link>
   blockers: NONE
   next_action: DISPATCH_REVIEWERS
   ```
7. **Stop Boundary**: Do NOT merge or self-certify. Stop at independent review boundary.
