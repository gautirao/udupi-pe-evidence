# Worktree & Lane Isolation Contract

1. **Path Standard**: Every active issue lane runs in a dedicated worktree directory:
   `/Users/gouthamrao/projects/udupi-property-explorer-worktrees/lane-<issue#>`
2. **Branch Standard**:
   - Fix: `fix/<issue#>-<short-description>`
   - Feature: `feat/<issue#>-<short-description>`
   - Chore/Tooling: `chore/<issue#>-<short-description>`
3. **Strict 1:1 Mapping**:
   - 1 Issue = 1 Branch = 1 Worktree = 1 Draft PR Channel.
4. **No Concurrent Mutation**:
   - Never allow two subagents or processes to mutate the same worktree simultaneously.
5. **Recovery**:
   - On startup, check if worktree or branch already exists. Recover existing state instead of duplicating work.
