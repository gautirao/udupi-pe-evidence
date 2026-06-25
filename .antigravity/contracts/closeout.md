# Contract: Closeout & Merge Safeguard

This contract governs PR opening, reporting, and session termination.

## Mandatory User Approval Halt

1. **No Automated Merging**: No agent running on any model tier may execute release commands (`gh pr merge`, `git push -f`) without an explicit human user message approving that specific action in the current turn.
2. **Gate Verdicts vs. User Approval**: A gate verdict of `APPROVED_TO_MERGE` or `READY_TO_MERGE` indicates technical eligibility only. The workflow must STOP and prompt the user: "Ready to merge?"
3. **No Admin Bypass**: Admin or privileged merge bypasses are strictly prohibited.
4. **Final Reporting**: Ensure `.antigravity/templates/final-report.md` is populated with branch name, commit SHA, PR URL, changed files, and validation evidence.
