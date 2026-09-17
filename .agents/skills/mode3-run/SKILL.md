---
name: mode3-run
description: >-
  Orchestrate single or multiple issue lanes end-to-end. Default PR-first workflow for any code issue.
  Manages isolated worktrees, delegates implementation to quick, monitors progress via lane ledger,
  routes decisions via PR, dispatches parallel risk-based specialist reviewers, enforces exact-HEAD loops,
  autonomously merges upon OWNER APPROVED TO MERGE, and triggers post-merge verification.
---

# Mode-3 Orchestrator Skill (`mode3-run <issue#>`)

Default PR-first autonomous execution workflow for resolving issues, bugs, features, or PRs.

## Shared Contracts
Refer to canonical rules in `.agents/contracts/`:
- `pr-workflow.md` (PR-first lifecycle)
- `worktree-contract.md` (Lane isolation rules)
- `exact-head-contract.md` (HEAD commitment & invalidation)
- `merge-gate.md` (Merge authorization gate)
- `reviewer-routing.md` (Risk-based parallel reviewer matrix)
- `lane-ledger.md` (Compact state tracking)
- `startup-check.md` (Pre-flight validation)

## Orchestration Sequence

### Phase 0: Startup Self-Check & Recovery
1. Run pre-flight check per `startup-check.md` (skills available, `gh` authenticated, worktree dir writable). Fail early if check fails.
2. Check for existing work (branch, worktree, PR, exact HEAD). Recover existing lane state into the `lane-ledger` instead of duplicating work.

### Phase 1: Baseline & Draft PR Creation
1. Fetch `origin/main` exact HEAD SHA.
2. Setup worktree at `/Users/gouthamrao/projects/udupi-property-explorer-worktrees/lane-<issue#>`.
3. Push initial branch commit and create Draft PR (`gh pr create --draft`).
4. Initialize lane state ledger.
5. Invoke implementation worker (`quick <issue#>`) via `invoke_subagent`.

### Phase 2: Monitoring & Decision Routing
1. Update `lane-ledger` on worker progress.
2. Interrupt owner ONLY for material architectural/product ambiguity using standard PR format:
   ```markdown
   Decision required — <short title>
   Finding: | Existing contract: | Evidence: | Options: | Recommended: | Impact:
   ```

### Phase 3: Risk-Based Reviewer Routing
When worker reports ready at exact HEAD:
1. Mark PR ready (`gh pr ready <PR>`).
2. Select and dispatch applicable specialist reviewers in parallel according to `reviewer-routing.md`.

### Phase 4: Review Loop & Autonomous Merge Gate
1. If any reviewer requests changes:
   - Route findings to worker for minimal fix.
   - Worker commits and pushes new HEAD.
   - Previous reviews are invalidated; dispatch fresh exact-HEAD review (using delta A..B evaluation).
2. When `final-merge-reviewer` posts `OWNER APPROVED TO MERGE`:
   - Verify current git HEAD matches reviewed SHA.
   - Confirm GitHub reports `MERGEABLE`.
   - Execute autonomous merge (`gh pr merge <PR> --squash --delete-branch`). Do NOT wait for owner prompt.

### Phase 5: Post-Merge Verification & Close
1. If issue is buyer-visible or production-sensitive, dispatch `post-merge-verifier`.
2. Post final summary and close issue.
