# Exact HEAD Review & Invalidation Contract

1. **Strict Commitment to HEAD**:
   - Every review verdict, test assertion, readiness certification, and approval request MUST reference the exact `HEAD` commit SHA audited (e.g. `Audited HEAD: a415508c`).
2. **Head-Bound Owner Visual Approval**:
   - When requesting human owner visual approval, report exact metadata:
     ```
     READY_FOR_OWNER_VISUAL_APPROVAL
     PR: #<pr#>
     EXACT HEAD: <sha>
     PREVIEW: <url>
     ```
3. **Push Invalidation Rule**:
   - Any code-changing push to the PR branch after a review verdict or human owner approval immediately invalidates all prior reviews and owner approvals (`OWNER APPROVAL = STALE`).
   - A fresh exact-HEAD review, new GitHub-visible visual evidence, and a new human owner approval are required.
4. **Delta-Based Re-Reviews**:
   - When reviewing follow-up commits (HEAD B following HEAD A), reviewers audit the `A..B` diff plus affected surrounding contracts.
   - Full re-audit is required only if changes touch core contracts or architecture.
5. **Final Exact-HEAD Check**:
   - Before merging, the approved HEAD SHA MUST match `git rev-parse HEAD` on the remote PR branch exactly.
