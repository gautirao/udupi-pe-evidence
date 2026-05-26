# Mode-3 contract — PR / merge / closeout (Phases 8–12)

> Loaded at Phase 8 onward. Includes the Stale PR and branch safety policy. Semantics unchanged from the original `mode3-run.md`.

## Phase 8 — PR creation

1. `git push -u origin <branch>`.
2. `gh pr create --title "<conventional>" --body "<assembled from approved plan + workdone-candidate>"`. PR body includes Closes #<N> reference.
3. Assemble `.claude/handoffs/issue-<N>/pr-review-request.toml`.
4. Invoke `python3 .claude/scripts/openai_gate.py --issue <N> --gate PR_REVIEW --input .claude/handoffs/issue-<N>/pr-review-request.toml`.
5. On APPROVED → Phase 9. On REVISION_REQUIRED → reroute.

---

## Phase 9 — PR_REVIEW gate → Phase 9.1 — Merge gate (MANDATORY USER APPROVAL)

After PR_REVIEW returns APPROVED_TO_MERGE:

**CRITICAL INVARIANT:**  
```
PR_REVIEW APPROVED_TO_MERGE is NOT user approval.
It only means the PR is eligible to be presented to the user.
The workflow MUST stop and wait for explicit user approval before executing any merge command.
```

Main Agent **MUST**:
1. Report the PR_REVIEW verdict to the user
2. Print the PR URL, scope-lock table, and test results
3. **Explicitly ask for user approval** (e.g., "Ready to merge?")
4. **STOP and wait for explicit user response**

User must send a message approving merge (e.g., "approve", "merge", "yes") or declining ("hold", "no", "don't merge").

**Only after receiving explicit user approval**, Main Agent executes:
```bash
gh pr merge <PR#> --squash --admin
```

On user decline: leave the PR open; halt the run; record the approval decision and user message in `team-lead-execution-log.md`.

**HARD RULE: No agent running on any model may execute `gh pr merge` or equivalent without an explicit user approval message in the current session.**

### Recording approval for audit trail

Main Agent **MUST record** the user's approval message — the exact text, for example "yes, approve" or "merge" — in the execution log. This creates an audit trail that the approval was explicit and informed.

---

## Phase 10 — Team cleanup

1. `SendMessage({ to: "executor", message: { type: "shutdown_request" } })`.
2. On executor `shutdown_response.approve = true` OR timeout (`60s`), `TeamDelete()`.
3. Verify `~/.claude/teams/mode3-<N>/` no longer exists.
4. If the executor tmux pane is orphaned (lingering after TeamDelete), `tmux kill-pane -t <pane-id>`.

---

## Phase 11 — Main sync + re-index

1. `git checkout main`.
2. `git pull --ff-only origin main`.
3. `mcp__jcodemunch__index_folder { "path": ".", "incremental": true }`. If incremental fails, run a full re-index.
4. Record the post-merge index state (timestamp + brief stats) for the closeout summary.

---

## Phase 12 — Closeout summary

Print a one-screen summary:
- PR URL and merged sha.
- Final index status (timestamp + summary).
- Team cleanup confirmation.
- `team-lead-execution-log.md` path for the audit trail.
- Token telemetry (planner Opus tokens, executor Sonnet tokens, reviewer Opus tokens) if available.
- "Ready for next issue."

The closeout MUST additionally report current-run artefacts and stale artefacts **separately** (see the Stale PR and branch safety policy below):
- **Current-run, this session:** PRs merged this session; local branches deleted this session.
- **Stale PRs detected but NOT touched:** number/title/age each (see triage report fields).
- **Stale branches/worktrees detected but NOT touched:** counts by category (merged / unmerged / worktree-agent / unknown).
- **Dirty/untracked files left untouched** (pre-existing, not produced by this run).
- **Audit artefacts preserved** (`.claude/handoffs/issue-<N>/*`, `.claude/openai-gates/issue-<N>/*`).
- An **explicit statement** that no stale PR/branch cleanup, merge, close, rebase, or prune was performed unless the user explicitly approved it (cite the approval if one was given).

---

## Stale PR and branch safety policy

This policy governs how the Main Agent and Orchestrator treat PRs, branches, and worktrees that are NOT part of the current approved handoff. After several Mode 3 runs, old PRs and local/worktree branches accumulate; some PRs may be weeks old and overlap with newer merged work. **These are stale artefacts requiring triage, never active merge candidates.** The agent must not blindly merge, rebase, force-push, close, retarget, mark-ready, delete, or prune any of them without explicit user approval.

### Stale PRs

A PR is **stale** if ANY of these are true:
- it is older than the current active run,
- it was created in a previous session,
- it targets files that have changed significantly since it was created,
- it overlaps with closed/merged issues,
- it overlaps with newer active issues,
- it is not referenced by the current approved handoff.

For a stale PR, the agent MUST NOT:
- merge,
- rebase,
- force-push,
- close,
- retarget,
- mark ready,
- assume it is still valid.

Instead, the agent MUST report (read-only triage):
- PR number / title / age,
- branch,
- likely overlap (which issue/PR/area it touches),
- whether it conflicts with current `main`,
- a recommended action, one of:
  - keep open,
  - close as stale,
  - rebase and re-review,
  - superseded by newer issue/PR,
  - needs user decision.

**Any action on a stale PR requires explicit user approval.**

### Stale branches / worktrees

This covers stale local branches, remote branches, and `worktree-agent-*` branches.

The agent MUST NOT delete or prune any of them unless the user explicitly asks.

Before any cleanup, the agent MUST report:
- the count of stale branches,
- categories: **merged**, **unmerged**, **worktree/agent**, **unknown**,
- whether each deletion is safe,
- the exact commands that would be run.

**Destructive cleanup (branch/worktree deletion or prune) requires explicit user approval.**

#### Canonical safe command for deleting tip-merged local branches

When the user explicitly approves deleting tip-merged local branches, use this canonical command. It deletes ONLY truly-merged branches (`-d`, never `-D`) and explicitly excludes the current branch, the worktree marker, `main`, `master`, and ALL `worktree-agent-*` branches:

```bash
git branch --format='%(refname:short)' --merged main \
  | grep -vE '^(main|master)$' \
  | grep -vE '^worktree-agent-' \
  | xargs -r -n1 git branch -d
```

Notes:
- `git branch --format='%(refname:short)'` MUST be used. The default decorated `git branch` output prefixes branches checked out in linked worktrees with `+` (and the current branch with `*`); parsing that decorated output leaks a stray `+`/`*` token into the pipeline and is unsafe. Cleanup commands MUST NOT parse the default decorated output.
- `xargs -r` avoids running `git branch -d` with no input.
- `git branch -d` (not `-D`) is mandatory: it refuses any branch not fully merged to its upstream, so unmerged/remote-divergent branches are left alone automatically.
- Branches attached to a linked worktree will still be refused by `git branch -d` ("used by worktree"); the `worktree-agent-` exclusion is a second, defence-in-depth guard so they are never even attempted.

#### `worktree-agent-*` branches are NEVER part of generic cleanup

Even if a `worktree-agent-*` branch is tip-merged into `main` and has no attached worktree, it MUST NOT be deleted by the generic merged-branch cleanup above. Worktree/agent branches and their worktrees are cleaned up only by a **separate, dedicated worktree/agent cleanup pass with explicit user approval** (report-first per the rules above, then `git worktree remove` + `git branch -D` per item only after approval). Generic merged-branch deletion must always exclude them (hence the `grep -vE '^worktree-agent-'` guard).

### Actions that ALWAYS require explicit user approval

- merging stale PRs,
- closing stale PRs,
- rebasing old branches,
- deleting local or remote branches,
- pruning worktrees,
- deleting audit artefacts,
- deleting untracked files NOT created by the current run.

The only branch cleanup the agent may perform without a fresh prompt is deleting the local feature branch(es) it created and merged **during the current run** — and even that is reported in the Phase 12 closeout.
