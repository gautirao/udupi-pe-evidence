---
name: mode3-run
description: >-
  Orchestrate single or multiple issue lanes end-to-end. Default PR-first workflow for any code issue.
  Manages isolated worktrees, delegates implementation to quick, executes pre-push review loops until CLEAN FOR COMMIT,
  monitors progress via lane ledger, routes decisions via PR, dispatches parallel risk-based PR reviewers,
  enforces exact-HEAD loops, autonomously merges upon OWNER APPROVED TO MERGE, and triggers post-merge verification.
---

# Mode-3 Orchestrator Skill (`mode3-run <issue#>`)

Default PR-first autonomous execution workflow for resolving issues, bugs, features, or PRs.

## Shared Contracts
Refer to canonical rules in `.agents/contracts/`:
- `pr-workflow.md` (PR-first lifecycle)
- `worktree-contract.md` (Lane isolation rules)
- `pre-push-review-contract.md` (Inner-loop pre-push review rules)
- `exact-head-contract.md` (HEAD commitment & invalidation)
- `merge-gate.md` (Merge authorization gate)
- `reviewer-routing.md` (Risk-based parallel reviewer matrix)
- `lane-ledger.md` (Compact state tracking)
- `startup-check.md` (Pre-flight validation)

## Orchestration Sequence

### Phase 0: Startup Self-Check & Recovery
1. Run pre-flight check per `startup-check.md` (skills available including `pre-push-reviewer`, `gh` authenticated, worktree dir writable). Fail early if check fails.
2. Check for existing work (branch, worktree, PR, exact HEAD). Recover existing lane state into the `lane-ledger`.

### Phase 1: Baseline & Draft PR Creation
1. Fetch `origin/main` exact HEAD SHA.
2. Setup worktree at `/Users/gouthamrao/projects/udupi-property-explorer-worktrees/lane-<issue#>`.
3. Push initial branch commit and create Draft PR (`gh pr create --draft`).
4. Initialize lane state ledger.
5. Invoke implementation worker (`quick <issue#>`) via `invoke_subagent`.

### Phase 2: Implementation, Pre-Push Review Loop & Decision Routing
1. Track worker progress and update `lane-ledger`.
2. Worker implements fix locally in working tree.
3. Orchestrator invokes `pre-push-reviewer` via `invoke_subagent` to audit `git diff`.
4. If `pre-push-reviewer` reports `CHANGES REQUIRED`:
   - Route findings back to worker for local correction.
   - Re-dispatch `pre-push-reviewer` to audit fix delta.
   - Repeat until `pre-push-reviewer` returns `CLEAN FOR COMMIT`.
5. Worker commits and pushes to branch ONLY after `CLEAN FOR COMMIT`.
6. Interrupt owner ONLY for material architectural/product ambiguity using standard PR format:
   ```markdown
   Decision required — <short title>
   Finding: | Existing contract: | Evidence: | Options: | Recommended: | Impact:
   ```

### Phase 3: Risk-Based PR Reviewer Routing
When worker pushes commit at exact HEAD:
1. Mark PR ready (`gh pr ready <PR>`).
2. Select and dispatch applicable independent PR reviewers in parallel according to `reviewer-routing.md`.
3. `code-reviewer` identifies as `Reviewer: PR Code Reviewer`, `Exact HEAD: <sha>`.

### Phase 4: Review Loop & Autonomous Merge Gate
1. If any PR reviewer requests changes:
   - Worker fixes locally -> orchestrator invokes `pre-push-reviewer` for `CLEAN FOR COMMIT` -> worker commits and pushes new HEAD.
   - Previous PR reviews are invalidated; dispatch fresh exact-HEAD PR review (using delta A..B evaluation).
2. When `final-merge-reviewer` posts `OWNER APPROVED TO MERGE`:
   - Verify current git HEAD matches reviewed SHA.
   - Confirm GitHub reports `MERGEABLE`.
   - Execute autonomous merge (`gh pr merge <PR> --squash --delete-branch`). Do NOT wait for owner prompt.

### Phase 5: Post-Merge Verification & Close
1. If issue is buyer-visible or production-sensitive, dispatch `post-merge-verifier`.
2. Post final summary and close issue.
