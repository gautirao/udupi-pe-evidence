# Startup Self-Check Contract

Before beginning execution on an issue lane (`mode3-run`), validate environment capabilities:

1. **Skill Availability**:
   - Confirm `quick`, `pre-push-reviewer`, `code-reviewer`, `final-merge-reviewer`, and required specialist skills exist.
2. **GitHub Access**:
   - Run `gh auth status` or verify GitHub CLI access.
3. **Repository Cleanliness**:
   - Verify worktree root directory (`/Users/gouthamrao/projects/udupi-property-explorer-worktrees`) is accessible and writable.
4. **Fail Early**:
   - If any required tool or auth capability is missing, FAIL IMMEDIATELY with an explicit diagnostic message before opening branches or creating PRs.
