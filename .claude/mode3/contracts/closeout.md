# Mode-3 contract — PR / merge / closeout (Phases 8–12)

> **Purpose:** PR creation, PR_REVIEW gate, mandatory user merge approval, team/lock cleanup, main sync, closeout report.
> **When to load:** Phase 8 onward only.
> **Actor:** Main Agent (the orchestrator never creates or merges PRs).
> **Inputs:** approved handoff, `workdone-candidate.toml`, 7A/7B evidence, validation matrix (when required).
> **Allowed scope:** push the run's feature branch, create/update the run's PR, run PR_REVIEW, merge only after explicit user approval, clean up only this run's artefacts.
> **Forbidden:** `--admin` / branch-protection bypass / force merge; touching stale PRs, branches, worktrees, or untracked files without explicit user approval; merging on a gate verdict alone.
> **Stop conditions:** PR_REVIEW `NEEDS_FIXES` (rework loop), `NEEDS_MORE_EVIDENCE` / `NEEDS_USER_DECISION` (halt to user), user declines merge, branch protection blocks the merge.
> **Outputs:** merged PR (or open PR + halt), run-lock disposition, Phase-12 closeout summary.
>
> Includes the Stale PR and branch safety policy. Semantics otherwise unchanged from the original `mode3-run.md`.

## Phase 8 — PR creation

1. `git push -u origin <branch>`.
2. `gh pr create --title "<conventional>" --body "<assembled from approved plan + workdone-candidate>"`. PR body includes Closes #<N> reference.
3. Assemble `.claude/handoffs/issue-<N>/pr-review-request.toml`. For `validation_matrix.level` = `COMPACT`/`FULL`, **include the validation matrix** (`.claude/handoffs/issue-<N>/validation-matrix.md`) as the evidence packet PR_REVIEW consumes; for `NOT_REQUIRED`, include the one-line justification.
4. **Gate before PR_REVIEW is sent (validation matrix consumption).** PR_REVIEW MUST NOT be submitted/approved while the required matrix is incomplete. PR_REVIEW MUST NOT approve if: the required matrix is missing; its verdict is `REQUEST_CHANGES`; required changes remain; hard safety/failure-mode rows are missing for `FULL`; factual claims are unsupported; or deferred `NOT_PROVEN` items invalidate the PR's main goal. PR_REVIEW MAY approve **with non-blocking follow-ups** when the main goal is proven, deferred items are explicitly out of scope, follow-ups are documented, and no safety rule is violated. Full rules: `.claude/mode3/contracts/validation-matrix.md`.
5. Invoke `python3 .claude/scripts/openai_gate.py --issue <N> --gate PR_REVIEW --input .claude/handoffs/issue-<N>/pr-review-request.toml`.
6. On `APPROVED_TO_MERGE` → Phase 9. On `NEEDS_FIXES` (the PR_REVIEW rework verdict per `openai_gate.py` PER_GATE_ENUMS — this gate never returns `REVISION_REQUIRED`) → rework re-entry (OUTER gate; does not consume the inner specialist 2-cycle counter). On `NEEDS_MORE_EVIDENCE` or `NEEDS_USER_DECISION` → halt and surface to the user. Full rework mechanism: `.claude/mode3/contracts/main-agent.md` → Rework routing. In short:
   1. **Disk-before-send:** write `.claude/handoffs/issue-<N>/rework-request-pr-review-<n>.toml` (template `.claude/templates/rework-request.toml`) with the PR_REVIEW verdict, concrete required changes, evidence pointers, classification, and `revalidation.rerun` (the required validation + a re-run of PR_REVIEW).
   2. **Resume the orchestrator by `agent_id`** (`orchestrator-agent.toml`); if unavailable/degraded → **respawn a fresh Opus orchestrator** (`model: "opus"`) briefed from durable artefacts only. **If respawn fails → `blocked.toml(reason_code=AGENT_TEAMS_UNAVAILABLE)` and stop.**
   3. The orchestrator routes the fix to a specialist; **the Main Agent never authors the fix.** Re-run the required validation, then re-run PR_REVIEW.

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

**Only after receiving explicit user approval**, Main Agent executes a **normal squash merge**:
```bash
gh pr merge <PR#> --squash
```

**Merge-command hard rules (binding):**
- **Never pass `--admin`.** Bypassing branch protection is forbidden, even with user merge approval — merge approval authorises a *normal* merge only.
- **Never force-merge** or override failing required checks. If branch protection or required checks block the merge, report the blocker to the user and stop; resolving it (re-running CI, rebasing, or an explicit user-driven exception) is a separate user decision.
- Squash is the only merge strategy for Mode-3 PRs (no merge commits, no rebase-merge) unless the user explicitly requests otherwise.

On user decline: leave the PR open; halt the run; record the approval decision and user message in `team-lead-execution-log.md`.

**HARD RULE: No agent running on any model may execute `gh pr merge` or equivalent without an explicit user approval message in the current session.**

### Recording approval for audit trail

Main Agent **MUST record** the user's approval message — the exact text, for example "yes, approve" or "merge" — in the execution log. This creates an audit trail that the approval was explicit and informed.

---

## Phase 10 — Team cleanup

This harness has no `TeamDelete`; the session's single implicit team is released when the session ends. **Shutdown is explicit and happens ONLY here at Phase 10**, after merge + closeout — never earlier. The orchestrator stands by (best-effort) through every gate and rework cycle until this point. Release it gracefully:

1. Read `orchestrator-agent.toml` to confirm the live teammate. `SendMessage({ to: "orchestrator", message: { type: "shutdown_request", reason: "issue <N> complete" } })` — address the **bare name** (the harness rejects the full `agent_id` string; the persisted `agent_id` is the identity handle, not the address). This reaches a teammate that may have completed its last turn and gone dormant.
2. On `shutdown_response.approve = true` OR timeout (`60s`), consider the teammate released. (Approving shutdown terminates the teammate process.)
3. **If no live/resumable orchestrator remains** (no `orchestrator-agent.toml`, unaddressable `agent_id`, or already reaped after a long approval wait): do **NOT** fail the closeout. Log "no live/resumable orchestrator at shutdown; closed on durable artefacts" and proceed — the run's correctness rests on the disk artefacts, not on a live teammate.
4. Record the teammate shutdown (approval, timeout, or no-live-teammate) in `team-lead-execution-log.md`.

---

## Phase 10.5 — Run-lock cleanup

The Phase-0.0 run lock (`.claude/active-runs/issue-<N>.lock`, or `issue-<N>-attempt-K.lock` for an approved second attempt) records that the issue has an active run. Releasing it too early would let a sibling session start a duplicate run while this one is still finishing; never releasing it would permanently block legitimate future runs. **Remove the lock only after ALL of the following hold:**

1. the **PR is merged** (or the issue was explicitly **abandoned** by the user — record which);
2. the **worktree** is cleaned/removed **or explicitly preserved** by user choice (report-first per the Stale PR and branch safety policy below — destructive worktree removal needs explicit approval);
3. the **branch** is cleaned **or explicitly preserved** (the only branch the run may delete without a fresh prompt is the feature branch it created and merged this run);
4. the **final status is reported** in the Phase 12 closeout summary.

Until all four hold, the lock stays in place. If the run halts **without** merging (blocked, user-declined merge, or abandoned), leave the lock unless the user explicitly authorises release — a stale-but-present lock fails safe (it forces the next invocation through the Phase 0.0 continue/clean-up/archive prompt) whereas a prematurely-deleted lock silently re-opens the duplicate-run hole. Record the lock disposition (removed / preserved-by-user / left-for-blocked-run) in `team-lead-execution-log.md` and the closeout summary.

---

## Phase 11 — Main sync + re-index

1. `git checkout main`.
2. `git pull --ff-only origin main`.
3. `mcp__jcodemunch__index_folder { "path": ".", "incremental": true }`. If incremental fails, run a full re-index.
4. Record the post-merge index state (timestamp + brief stats) for the closeout summary.

---

## Phase 12 — Closeout summary

Print a one-screen summary — **compact but complete**: every field below is required; use table/bullet form, cite artefact paths instead of pasting their contents, no logs, no run-history narration. Compactness never drops a required field.
- PR URL and merged sha.
- Final index status (timestamp + summary).
- Team cleanup confirmation.
- **Run-lock disposition** — `removed` (all four Phase-10.5 conditions met) / `preserved-by-user` / `left-for-blocked-run`, with the lock path.
- **Selected ports** — the frontend/backend port pair this run reserved (from the run lock's `selected_ports`); surfaced in the visible checkpoint report per `.claude/mode3/contracts/main-agent.md` → Worktree run hygiene.
- **Credentials source** — confirmation that any local-validation credentials came only from the main-workspace `.env` / `.env.e2e` and that both remain git-ignored (no credentials committed, copied to tracked files, or printed).
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
