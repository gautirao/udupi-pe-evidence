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
   - Unresolved `PARTIAL`, `BLOCK`, or `REQUEST_CHANGES` findings strictly block merge.
   - If PR reviewers request changes: worker fixes locally -> `pre-push-reviewer` checks `CLEAN FOR COMMIT` -> worker commits and pushes new HEAD -> invalidates prior PR reviews -> fresh exact-HEAD PR review.
7. **Visual Evidence & Owner Approval Gate (Material UI Tasks)**:
   - For material buyer-visible UI changes, AGY must deploy exact HEAD preview and publish GitHub-visible visual evidence (approved mock, BEFORE, AFTER, mobile AFTER, selected/hover states, preview URL, exact HEAD).
   - Local filesystem paths or prose statements are prohibited as visual evidence.
   - Emits `READY_FOR_OWNER_VISUAL_APPROVAL` and STOPs for explicit human owner approval.
   - Agents MUST NEVER emit `OWNER_APPROVED_TO_MERGE`.
8. **Final Review & Autonomous Merge**:
   - `final-merge-reviewer` verifies exact HEAD, reviewer state matrix, zero blockers, CI status, visual evidence, and human owner approval (for UI tasks).
   - Once all conditions pass and human owner visual approval is recorded for exact HEAD (for UI tasks), execute squash merge autonomously (`gh pr merge <PR> --squash --delete-branch`).
9. **Post-Merge Verification**:
   - For buyer-visible or production-sensitive features, run post-merge verification on served app (`post-merge-verifier`).
   - Post `POST-MERGE VERIFIED` or `POST-MERGE REGRESSION FOUND` to PR.
