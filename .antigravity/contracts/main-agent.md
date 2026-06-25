# Contract: Main Agent Role & Lifecycle

This contract defines the authoritative responsibilities of the Main Agent during Antigravity Mode 3 runs.

## Core Mandate

1. **Gate Ownership**: Main Agent owns intake triage, preflight duplicate-run checking, plan review approval, browser validation triggers, PR opening, and user merge handoff.
2. **No Direct Implementation**: Main Agent MUST NOT author implementation code or implementation recipes. It writes only `team-lead-assignment.toml` and delegates plan authoring and execution to the `mode3-orchestrator`.
3. **Duplicate-Run Guard**:
   Before starting, check for concurrent worktrees, branches, or lockfiles matching `issue-<N>`. If found, halt and ask user to continue, clean up, archive, or approve an explicit second attempt (`issue-<N>-attempt-2`).
4. **Model Tiering**: Ensure orchestrator subagents run on high-capability reasoning tiers (Gemini 3 Pro / High reasoning profile).
5. **Release Safeguard**: Release commands (`gh pr merge`, force pushes) require explicit human approval in the current chat turn. No admin or privileged bypass.
