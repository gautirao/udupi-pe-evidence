# PR-First Workflow Contract

For every code-changing issue, feature, or bug fix:

1. **Default Mode**: Always operate in PR-first mode (`mode3-run <issue>`) unless explicit analysis-only mode is requested.
2. **Worktree & Branch**: Create or recover an isolated worktree (`lane-<issue#>`) and branch (`fix/<issue#>-<desc>`, `feat/...`, or `chore/...`).
3. **Early Draft PR**: Push initial branch commit and open a Draft PR (`gh pr create --draft`) immediately.
4. **Durable Channel**: Use the PR as the sole durable record. All findings, root-cause analysis, decision requests, visual evidence, screenshots, reviewer verdicts, and merge state ledgers MUST be posted to GitHub PR comments.
5. **Inner-Loop Local Review (Pre-Push)**:
   - Worker implements fix locally in working tree.
   - Dispatch `pre-push-reviewer` to audit `git diff`.
   - Worker addresses findings locally; `pre-push-reviewer` re-audits fix delta.
   - Repeat until `pre-push-reviewer` issues `CLEAN FOR COMMIT`.
   - Worker commits and pushes to branch only after `CLEAN FOR COMMIT`.
6. **PR Review Loop (Post-Push)**:
   - Worker marks PR ready for review (`gh pr ready <PR>`).
   - Independent PR reviewers audit pushed exact HEAD SHA.
   - PR Code Reviewer identifies itself on PR as `Reviewer: PR Code Reviewer`, `Exact HEAD: <sha>`.
   - Visual Reviewer (`ui-reviewer`) acts as evidence/difference verifier (MOCK vs BEFORE vs AFTER) emitting `VISUAL_MATCH`, `VISUAL_MISMATCH`, or `PARTIAL`.
7. **Mandatory Review Reconciliation Phase**:
   - AGY MUST NOT finish its lifecycle upon merely dispatching PR reviewers. It enters `REVIEW_RECONCILIATION_IN_PROGRESS`.
   - **Incremental Polling & Cursor**: Maintain a cursor (`last_processed_pr_event_id`, `last_processed_timestamp`). Incrementally query PR comments/reviews/events using `gh pr view --json comments,reviews` or `gh api`. Do not re-read full comment history repeatedly.
   - **Consume Actual Findings**: Read and classify new events/comments. Owner comments arriving during reconciliation are new input and must be read.
   - **Classify & Reconcile**:
     - Resolve test failure claims reported in comments empirically against current exact HEAD SHA (run tests locally on HEAD SHA) rather than blindly editing code.
     - Hard Block Invariant: A later `PASS` from one reviewer cannot erase another reviewer's unresolved `PARTIAL`, `BLOCK`, `REQUEST_CHANGES`, `FAIL`, or `NEEDS_WORK` finding.
     - Contradictions (e.g. `PASS` vs `PARTIAL`) evaluate to `REVIEW_STATE_CONTRADICTION` and set state to `BLOCKED`.
   - **Actionable Fix Loop**:
     - If findings are actionable: keep work in the SAME WORKER LANE -> fix locally -> `pre-push-reviewer` checks `CLEAN FOR COMMIT` -> commit & push new HEAD.
     - Every code-changing push invalidates previous certifications, clears consecutive quiet polls (`consecutive_quiet_polls = 0`), and resets reconciliation status to `REVIEW_RECONCILIATION_IN_PROGRESS`.
   - **Quiet Poll Exit Criteria**:
     - Require **two consecutive quiet polling cycles** (no new PR events since cursor + unchanged HEAD SHA) with zero unresolved current-head findings and zero contradictions before exiting reconciliation.
8. **Visual Evidence & Owner Approval Gate (Material UI Tasks)**:
   - For material buyer-visible UI changes, AGY must deploy exact HEAD preview and publish GitHub-visible visual evidence (approved mock, BEFORE, AFTER, mobile AFTER, selected/hover states, preview URL, exact HEAD).
   - Local filesystem paths or prose statements are prohibited as visual evidence.
   - Emits `READY_FOR_OWNER_VISUAL_APPROVAL` and STOPs for explicit human owner approval.
   - Agents MUST NEVER emit `OWNER_APPROVED_TO_MERGE`.
9. **Final Review & Closeout Gate**:
   - `closeout-reporter` and lifecycle completion reports CANNOT run while review reconciliation is incomplete (`REVIEW_RECONCILIATION_IN_PROGRESS`).
   - Allowed final lifecycle states: `REVIEW_RECONCILIATION_IN_PROGRESS`, `BLOCKED`, `READY_FOR_OWNER_APPROVAL`, `READY_FOR_OWNER_VISUAL_APPROVAL`, `READY_TO_MERGE`.
   - `final-merge-reviewer` verifies exact HEAD, reviewer state matrix, zero blockers, CI status, visual evidence, human owner approval, and review reconciliation completion.
   - **Owner Merge Authorization Requirement**: Neither `READY_FOR_OWNER_APPROVAL` nor `READY_FOR_OWNER_VISUAL_APPROVAL` permits merge execution. Merge occurs ONLY AFTER an explicit human owner merge command (`OWNER_APPROVED_TO_MERGE` or explicit owner command) is observed for the exact current HEAD SHA. Never merge automatically without explicit owner command.
10. **Post-Merge Verification**:
   - For buyer-visible or production-sensitive features, run post-merge verification on served app (`post-merge-verifier`).
   - Post `POST-MERGE VERIFIED` or `POST-MERGE REGRESSION FOUND` to PR.
