# Exact HEAD Review & Invalidation Contract

1. **Strict Commitment to HEAD**:
   - Every review verdict, test assertion, and merge authorization MUST reference the exact `HEAD` commit SHA audited (e.g. `Audited HEAD: a415508c`).
2. **Push Invalidation Rule**:
   - Any code-changing push to the PR branch after a review verdict immediately invalidates all previous reviews.
   - Self-certification by implementation workers is strictly prohibited.
3. **Delta-Based Re-Reviews**:
   - When reviewing follow-up commits (HEAD B following HEAD A), reviewers audit the `A..B` diff plus affected surrounding contracts.
   - Full re-audit is required only if changes touch core contracts or architecture.
4. **Final Exact-HEAD Check**:
   - Before authorization or merging, the audited HEAD SHA MUST match `git rev-parse HEAD` on the remote PR branch exactly.
