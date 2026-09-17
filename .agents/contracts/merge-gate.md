# Merge Authorization Gate Contract

1. **Owner Merge Authorization Requirement**:
   - A PR MUST NOT be merged based on worker self-reports or agent-synthesized approval phrases alone.
   - Merge authorization requires an explicit top-level GitHub comment authored by the project owner containing:
     `OWNER_APPROVED_TO_MERGE head:<full-current-sha>`
   - Posted after the reviewed HEAD and final clean review.
   - Reviewer subagents (including `final-merge-reviewer`) MUST NOT synthesize or impersonate this owner authorization decision.

2. **Final Merge Readiness Certification**:
   - `final-merge-reviewer` acts as the final readiness gatekeeper.
   - When all checks pass, `final-merge-reviewer` emits the readiness verdict:
     `READY_FOR_OWNER_MERGE_AUTHORIZATION`

3. **Pre-Merge Verification Checklist**:
   Before executing merge, `mode3-run` MUST verify:
   - Top-level owner comment containing `OWNER_APPROVED_TO_MERGE head:<full-current-sha>` exists on PR.
   - Owner-approved HEAD SHA matches current remote PR HEAD SHA exactly.
   - `final-merge-reviewer` issued `READY_FOR_OWNER_MERGE_AUTHORIZATION`.
   - All required specialist PR reviews passed (`PASS`).
   - Focused unit/integration tests pass 100%.
   - Required served UI/visual evidence exists on PR (if user-facing).
   - GitHub reports `MERGEABLE` (`gh pr view <PR> --json mergeable`).

4. **Autonomous Execution**:
   - Once the exact owner-authored token `OWNER_APPROVED_TO_MERGE head:<full-current-sha>` is verified on the PR comment thread and all pre-merge conditions pass, execute squash merge autonomously:
     `gh pr merge <PR> --squash --delete-branch`
