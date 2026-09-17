# PR-First Workflow Contract

For every code-changing issue, feature, or bug fix:

1. **Default Mode**: Always operate in PR-first mode (`mode3-run <issue>`) unless explicit analysis-only mode is requested.
2. **Worktree & Branch**: Create or recover an isolated worktree (`lane-<issue#>`) and branch (`fix/<issue#>-<desc>`, `feat/...`, or `chore/...`).
3. **Early Draft PR**: Push initial branch commit and open a Draft PR (`gh pr create --draft`) immediately.
4. **Durable Channel**: Use the PR as the sole durable record. All findings, root-cause analysis, decision requests, test evidence, screenshots, reviewer verdicts, and merge authorizations MUST be posted to the PR comments.
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
   - If PR reviewers request changes: worker fixes locally -> `pre-push-reviewer` checks `CLEAN FOR COMMIT` -> worker commits and pushes new HEAD -> invalidates prior PR review -> fresh exact-HEAD PR review.
7. **Authorization & Merge**:
   - Merge requires mandatory `OWNER APPROVED TO MERGE` phrase from `final-merge-reviewer` auditing current exact HEAD.
   - Once authorized, merge autonomously (`gh pr merge --squash --delete-branch`).
8. **Post-Merge Verification**:
   - For buyer-visible or production-sensitive features, run post-merge verification on served app.
   - Post `POST-MERGE VERIFIED` or `POST-MERGE REGRESSION FOUND` to PR.
