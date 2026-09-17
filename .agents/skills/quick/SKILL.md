---
name: quick
description: >-
  Execute a single contained issue or task autonomously from triage to PR creation
  and independent review boundary. Creates isolated worktree, opens draft PR early,
  implements fix, waits for orchestrator pre-push review loop CLEAN FOR COMMIT, commits, pushes, and posts evidence.
---

# Quick Task Execution Skill (`quick <issue#>`)

Autonomous single-issue implementation worker operating inside an isolated worktree lane.

## Shared Contracts
Refer to canonical rules in `.agents/contracts/`:
- `worktree-contract.md` (Path and branch isolation)
- `pre-push-review-contract.md` (Pre-push inner review loop)
- `pr-workflow.md` (Early draft PR & durable channel)
- `exact-head-contract.md` (HEAD SHA commitment)

## Execution Protocol

1. **Worktree & Branch**: Setup/recover worktree at `/Users/gouthamrao/projects/udupi-property-explorer-worktrees/lane-<issue#>`.
2. **Draft PR**: Ensure Draft PR (`gh pr create --draft`) is open early.
3. **Investigation**: Reproduce issue before editing code. Post root-cause finding to PR.
4. **Local Implementation & Pre-Push Review Loop**:
   - Make smallest correct fix avoiding unrelated churn.
   - Run focused regression tests (assert 100% pass).
   - Report working-tree diff ready for orchestrator pre-push review (`pre-push-reviewer`).
   - Fix any reported findings locally; repeat until orchestrator returns `CLEAN FOR COMMIT`.
5. **Commit & Push**:
   - Do NOT commit or push until `CLEAN FOR COMMIT` is received from orchestrator.
   - Commit (`git commit -m "fix(...): ... (#<issue#>)"`) and push to remote branch.
   - Mark PR ready for review (`gh pr ready <PR>`).
   - Post exact HEAD SHA, root cause, test evidence, and served UI screenshots (if applicable) to PR.
6. **Compact Status Report**:
   Return concise report to orchestrator:
   ```yaml
   status: READY_FOR_REVIEW
   pre_push_verdict: CLEAN FOR COMMIT
   exact_HEAD: <sha>
   findings: <short-summary>
   evidence: <test-results-or-link>
   blockers: NONE
   next_action: DISPATCH_PR_REVIEWERS
   ```
7. **Stop Boundary**: Do NOT merge or self-certify. Stop at independent PR review boundary.
