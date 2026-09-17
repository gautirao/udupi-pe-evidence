# Merge Authorization Gate Contract

1. **Authorization Token**:
   - A PR MUST NOT be merged until `final-merge-reviewer` inspects the current exact HEAD SHA and explicitly posts:
     `OWNER APPROVED TO MERGE`
2. **Pre-Merge Verification Checklist**:
   - Exact reviewed HEAD matches remote PR HEAD.
   - All required specialist reviews (code, security, ui, buyer-visibility) are PASS.
   - Focused unit/integration tests pass 100%.
   - Required served UI/visual evidence exists on PR (if user-facing).
   - GitHub reports `MERGEABLE` (`gh pr view <PR> --json mergeable`).
3. **Autonomous Execution**:
   - Once `OWNER APPROVED TO MERGE` is posted and pre-merge conditions are verified, execute squash merge autonomously:
     `gh pr merge <PR> --squash --delete-branch`
   - Do NOT ask the owner to merge manually.
