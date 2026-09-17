# Exact HEAD Review & Invalidation Contract

1. **Strict Commitment to HEAD**:
   - Every review verdict, test assertion, and readiness certification MUST reference the exact `HEAD` commit SHA audited (e.g. `Audited HEAD: a415508c`).
2. **Push Invalidation Rule**:
   - Any code-changing push to the PR branch after a review verdict immediately invalidates all previous reviews and owner authorization tokens.
   - A fresh exact-HEAD review and a new owner authorization comment (`OWNER_APPROVED_TO_MERGE head:<new-sha>`) are required.
3. **Delta-Based Re-Reviews**:
   - When reviewing follow-up commits (HEAD B following HEAD A), reviewers audit the `A..B` diff plus affected surrounding contracts.
   - Full re-audit is required only if changes touch core contracts or architecture.
4. **Final Exact-HEAD Check**:
   - Before merging, the owner-approved HEAD SHA MUST match `git rev-parse HEAD` on the remote PR branch exactly.
