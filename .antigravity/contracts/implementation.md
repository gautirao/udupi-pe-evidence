# Contract: Implementation Discipline

This contract governs code modification by implementer subagents.

## Mandatory Invariants

1. **Feature Branch Isolation**: All edits must reside on feature branch `issue-<N>`. Direct commits to `main` are strictly forbidden.
2. **jCodemunch Code Exploration**: Agents should use `jCodemunch-MCP` for code discovery (`search_symbols`, `get_context_bundle`) when the MCP/index is configured, fresh, and available. If unavailable, stale, or not configured, state that fallback mode is active, use repository search cautiously, document the fallback in the final report, and avoid claiming jCodemunch-backed discovery or validation.
3. **Scope Lock**: Edits must strictly adhere to `allowed_file_globs` in the approved plan. Unscoped edits invalidate the run.
4. **Stop / Continue Policy**:
   - Continue without user confirmation when scope is clear and validation failures are locally fixable.
   - Stop with `NEEDS_USER_DECISION` if existing code contradicts the issue, external credentials/secrets are required, or changes expand beyond approved scope.
