---
name: mode3-run
description: >-
  Orchestrate single or multiple issue lanes end-to-end. Default PR-first workflow for any code issue.
  Manages isolated worktrees, delegates implementation to quick, executes pre-push review loops until CLEAN FOR COMMIT,
  monitors progress via lane ledger, routes decisions via PR, dispatches parallel risk-based PR reviewers,
  enforces exact-HEAD loops, enforces hard blocks on PARTIAL/BLOCK, manages human owner visual approval gate,
  autonomously merges when authorized, and triggers post-merge verification.
---

# Mode-3 Orchestrator Skill (`mode3-run <issue#>`)

Default PR-first autonomous execution workflow for resolving issues, bugs, features, or PRs.

## Shared Contracts
Refer to canonical rules in `.agents/contracts/`:
- `pr-workflow.md` (PR-first lifecycle)
- `worktree-contract.md` (Lane isolation rules)
- `pre-push-review-contract.md` (Inner-loop pre-push review rules)
- `exact-head-contract.md` (HEAD commitment & invalidation)
- `merge-gate.md` (Merge authorization gate & owner token requirement)
- `reviewer-routing.md` (Risk-based parallel reviewer matrix)
- `lane-ledger.md` (Compact state tracking & reviewer matrix)
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

### Phase 3: Risk-Based PR Reviewer Routing & State Ledger
When worker pushes commit at exact HEAD:
1. Mark PR ready (`gh pr ready <PR>`).
2. Select and dispatch applicable independent PR reviewers in parallel according to `reviewer-routing.md`.
3. Update `lane-ledger` reviewer matrix with incoming reviewer verdicts.
4. **Hard Block Enforcement**: If ANY reviewer reports `PARTIAL`, `BLOCK`, `REQUEST_CHANGES`, `FAIL`, `NEEDS_WORK`, or `*_PENDING`, `lane-ledger` merge state MUST evaluate to `BLOCKED`. A subsequent `PASS` from another reviewer does NOT erase an unresolved `PARTIAL`/`BLOCK`.
5. **Contradiction Check**: Scan current-head reviewer verdicts. If contradictions exist (e.g. `PASS` vs `PARTIAL`), set `Contradiction check: REVIEW_STATE_CONTRADICTION` and do NOT choose optimistic results.

### Phase 4: Visual Evidence & Owner Approval Gate (Material UI Tasks)
1. If the PR involves material buyer-visible UI changes:
   - Deploy exact HEAD preview URL.
   - Publish full GitHub-visible visual evidence on PR (approved mock reference, BEFORE screenshot, AFTER screenshot, same route/scenario/viewport, mobile AFTER, selected/hover states, preview URL, exact HEAD). Local file paths or prose statements are prohibited.
   - Post exact format to owner:
     ```
     READY_FOR_OWNER_VISUAL_APPROVAL
     Issue: #<issue#>
     PR: #<pr#>
     Exact HEAD: <sha>
     Preview: <url>
     Visual evidence: <links>
     Remaining known differences from mock: <NONE or explicit list>
     ```
   - **STOP Execution & Await Human Owner Visual Approval**.
   - NEVER emit `OWNER_APPROVED_TO_MERGE` or agent-synthesized approval tokens.

### Phase 5: Final Merge Review & Autonomous Merge
1. Once all independent reviewers pass (or visual approval is granted for UI tasks):
   - Dispatch `final-merge-reviewer`.
   - For non-UI work: `final-merge-reviewer` emits `READY_FOR_OWNER_APPROVAL`.
   - For material UI work: `final-merge-reviewer` verifies human owner visual approval for current exact HEAD, then emits `READY_TO_MERGE`.
2. Merge Execution:
   - Verify `lane-ledger` merge state is clean with zero unresolved blockers and zero contradictions.
   - Verify remote PR HEAD SHA matches approved exact HEAD SHA.
   - Confirm GitHub reports `MERGEABLE`.
   - Execute autonomous squash merge (`gh pr merge <PR> --squash --delete-branch`).

### Phase 6: Post-Merge Verification & Close
1. If issue is buyer-visible or production-sensitive, dispatch `post-merge-verifier`.
2. Post final summary and close issue.
