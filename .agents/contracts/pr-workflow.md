# PR-First Workflow Contract

For every code-changing issue, feature, or bug fix:

1. **Default Mode**: Always operate in PR-first mode (`mode3-run <issue>`) unless explicit analysis-only mode is requested.
2. **Worktree & Branch**: Create or recover an isolated worktree (`lane-<issue#>`) and branch (`fix/<issue#>-<desc>`, `feat/...`, or `chore/...`).
3. **Early Draft PR**: Push initial branch commit and open a Draft PR (`gh pr create --draft`) immediately.
4. **Durable Channel**: Use the PR as the sole durable record. All findings, root-cause analysis, decision requests, test evidence, screenshots, reviewer verdicts, and merge authorizations MUST be posted to the PR comments.
5. **Continuous Review Loop**:
   - Worker implements fix -> pushes new HEAD SHA -> marks PR ready.
   - Independent reviewers audit exact HEAD SHA.
   - If changes requested: worker commits fix -> pushes new HEAD -> invalidates prior review -> fresh exact-HEAD review dispatched.
6. **Authorization & Merge**:
   - Merge requires mandatory `OWNER APPROVED TO MERGE` phrase from `final-merge-reviewer` auditing current exact HEAD.
   - Once authorized, merge autonomously (`gh pr merge --squash --delete-branch`).
7. **Post-Merge Verification**:
   - For buyer-visible or production-sensitive features, run post-merge verification on served app.
   - Post `POST-MERGE VERIFIED` or `POST-MERGE REGRESSION FOUND` to PR.
