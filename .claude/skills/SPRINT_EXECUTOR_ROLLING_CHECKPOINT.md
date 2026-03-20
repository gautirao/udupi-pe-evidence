# SKILL: SPRINT_EXECUTOR_ROLLING_CHECKPOINT (deterministic)

## Purpose
Execute a sprint plan PR-by-PR using ROUTE_AND_RUN with resumable rolling checkpoints.

Checkpoint is the single source of truth.

**Authority:** `SPRINT_EXECUTOR_ROLLING_CHECKPOINT` is the single source of truth for sprint execution state, rolling checkpoints, PR lifecycle, and resume behavior. It delegates per-PR execution to `ROUTE_AND_RUN`, which owns routing logic, agent invocation rules, and the default E2E validation policy.

---

## GitHub Project Config (RE Trends)

Issue tracking source: **GitHub Issues** (work items)
Sprint/status layer: **GitHub Projects v2** ("RE Trends", project number 1)

| Constant | Value |
|----------|-------|
| Project number | `1` |
| Project node ID | `PVT_kwHOAAVnaM4BSWI7` |
| Status field ID | `PVTSSF_lAHOAAVnaM4BSWI7zg_6HMc` |
| Sprint iteration field ID | `PVTIF_lAHOAAVnaM4BSWI7zg_6HeY` |
| Status option — Todo | `bfa63ded` |
| Status option — In Progress | `1a1777ea` |
| Status option — In Review | `701d63ab` |
| Status option — Done | `25c24fa1` |

These IDs are stable project constants. Sprint iteration IDs change per sprint — fetch the current sprint's iteration ID at sprint start (see Sprint Start step 0 below).

---

## Operating Mode

- Exactly 1 PR per run
- Diff/snippets only (no full file rewrites unless required)
- 1 pass max (second pass only if BLOCKING)
- Auto-advance to next PR after merge — emit checkpoint and continue without pausing
- Always emit checkpoint before stopping

**This skill is a pure orchestrator — it NEVER writes, patches, or edits code itself.**
All code changes are delegated exclusively to engineer agents (`backend-engineer`, `frontend-engineer`, `supabase-engineer`) via the Task tool.
When a reviewer (`code-reviewer`, `security-reviewer`) returns REQUEST CHANGES, the orchestrator MUST re-invoke the relevant engineer agent with the reviewer's findings — it must NOT apply the fix inline, interpret the diff, or make edits directly.
If the orchestrator catches itself about to write or edit code, STOP and invoke the engineer agent instead.

---

## Sprint Start (Once per sprint, not per PR)

Before the first PR:
0. **Resolve current sprint iteration ID** — fetch the Sprint field's iteration list and identify the active iteration:
   ```bash
   gh api graphql -f query='{ node(id: "PVTIF_lAHOAAVnaM4BSWI7zg_6HeY") { ... on ProjectV2IterationField { configuration { iterations { id title startDate } } } } }' --jq '.data.node.configuration.iterations'
   ```
   Store the active iteration's `id` in the checkpoint preamble as `Current sprint iteration ID:`. All project item status updates and sprint assignment use this ID.

   Also build the **issue → project item ID map** — needed for status updates via `gh project item-edit`:
   ```bash
   gh api graphql -f query='{ node(id: "PVT_kwHOAAVnaM4BSWI7") { ... on ProjectV2 { items(first: 50) { nodes { id content { ... on Issue { number title } } } } } } }' --jq '.data.node.items.nodes | map(select(.content != null)) | map({number: .content.number, title: .content.title, itemId: .id})'
   ```
   Store this map in the checkpoint preamble as `Project item IDs:` (format: `#NNN → <item-id>`).

1. Fetch all sprint issue numbers + titles from the current GitHub Project iteration — store in checkpoint preamble as `Sprint issues:` list. Filter the project item list (from step 0) to only items assigned to the current sprint iteration. Issues not yet in the project can be added via `gh project item-add 1 --owner gautirao --url <issue-url>`.
2. Fetch full descriptions for all issues (one `gh issue view <number> --json title,body` call each) — needed for spec enrichment and team-lead pre-flight.
3. **Spec enrichment (all issues, once)** — invoke the `spec-enricher` agent (Task tool) with all issue IDs, titles, and descriptions:
   > "Enrich specs for the following sprint issues: [paste all issue IDs + titles + descriptions]."

   `spec-enricher` runs on `opus` regardless of your current model — consistent quality is the reason it is a dedicated agent.

   - `spec-enricher` prints its full output to the conversation (all spec blocks + summary + any spec gaps). **Do not suppress or paraphrase this output** — the user must be able to read every enriched spec before team-lead runs.
   - Store all enriched spec blocks in the checkpoint preamble as `Enriched specs:` — one block per issue.
   - These specs are the authoritative input to team-lead, qa-fast, and engineers for the rest of the sprint. Do NOT re-derive them per-PR.

4. **Invoke team-lead pre-flight analysis** — pass all issue IDs, titles, descriptions, AND enriched specs as context:
   > "Sprint issues: [paste all issue IDs + titles + descriptions + enriched specs]. Run Mode 1: Sprint Kickoff Analysis."
   - team-lead returns: recommended execution order, dependency warnings, file conflicts, pre-review flags, spec gaps.
   - Store the recommended execution order in the checkpoint preamble as `Execution order:`.
   - **Store all dependency findings** in checkpoint preamble as `Dependencies:` (format: `- #NNN depends on #MMM [confirmed|likely|speculative]`)
   - If team-lead flags pre-review requirements (architect/security), add them to the routing for the affected issues.
   - If team-lead flags spec gaps, OR if enrichment produced `Key unknowns` for any issue: play `afplay /System/Library/Sounds/Ping.aiff`, surface all gaps/unknowns to the user and **pause for confirmation** before starting execution. Do not proceed until each gap is resolved or explicitly waived by the user.
5. Execute issues in the team-lead recommended order. If no reordering was recommended, use the original GitHub Project iteration order.
6. Do NOT re-fetch individual issues each PR. Use cached descriptions from step 2 and enriched specs from step 3. Re-fetch only if the checkpoint is stale. A checkpoint is stale when any of the following are true:
   - The cached issue description is missing or truncated to fewer than 50 characters
   - The issue title in the checkpoint does not match the issue title in GitHub (`gh issue view <number> --json title`)
   - The execution order in the checkpoint does not match the current approved execution order for this sprint (team-lead-derived order if pre-flight ran, or original GitHub issue order if no reorder was applied)
   - The repo is not on the expected branch or has unexpected uncommitted changes on main

---

## Execution Loop (Mandatory)

For each GitHub issue (PR N):

1. **Use cached spec** — use the description cached during Sprint Start step 2 and the enriched spec from step 3. Only call `gh issue view <number> --json title,body` again if the checkpoint is stale (see Sprint Start step 6). State issue number + title (1 line); copy AC from enriched spec into the checkpoint `Acceptance criteria` field for this PR.
2. **Mark In Progress** — set GitHub Project item status to "In Progress":
   ```bash
   gh project item-edit --id <ITEM_ID> --project-id PVT_kwHOAAVnaM4BSWI7 --field-id PVTSSF_lAHOAAVnaM4BSWI7zg_6HMc --single-select-option-id 1a1777ea
   ```
   `ITEM_ID` comes from the `Project item IDs:` map in the checkpoint preamble.
3. **Bug fix gate** — if issue type is bugfix (GitHub issue has label `bug`, or title starts with `fix:`/`bug:`, or description explicitly says "bug" or "defect"):
   - Reproduce the defect with a targeted test or manual step. Confirm it fails. Document in checkpoint.
   - Do NOT proceed to engineer until failure is confirmed.
4. **Run ROUTE_AND_RUN** — execute the full triage → route → agents sequence per `ROUTE_AND_RUN.md`. Routing logic, agent invocation rules, code-reviewer skip conditions, and Security Gate triggers are all defined in `ROUTE_AND_RUN.md` — do not re-derive them here.

   Sprint-specific context for `qa-fast` — always pass this prompt:
   > "Review the codebase and identify risks for this planned change: [issue description]. Acceptance criteria: [AC from enriched spec]. The feature does not exist yet."

   Bug-fix tasks: reproduction is already confirmed in step 3. `ROUTE_AND_RUN` will not re-run it.

   **Reviewer feedback cycle (HARD RULE — orchestrator must not break this):**
   When `code-reviewer` or `security-reviewer` returns REQUEST CHANGES:
   - The main agent summarises each finding (severity + what needs fixing).
   - The orchestrator MUST re-invoke the **engineer agent** (Task tool) with the reviewer's exact findings attached.
     - The orchestrator MUST NOT apply the fix itself, even for "trivial" or "one-line" changes.
     - After the engineer fixes, re-invoke `code-reviewer` or `security-reviewer` once for a second pass.
     - If still REQUEST CHANGES after one re-run: play `afplay /System/Library/Sounds/Basso.aiff`, stop, and surface to user.
     - If findings are CONCERN or SUGGESTION only (no BLOCKING): proceed to commit without a fix pass; log findings in checkpoint Risks.
     - There are no exceptions to this rule — inline fixes by the orchestrator are always a violation.

5. **E2E gate** — Owned by `ROUTE_AND_RUN` Step 3. For Normal and High-risk changes, `qa` runs in verification mode after all reviewers APPROVE, before commit/push/PR. Change classification (trivial/normal/high-risk/doc-only) is determined by ROUTE_AND_RUN Step 1B — no sprint-layer override.

   If QA E2E gate fails: ROUTE_AND_RUN Step 3 handles failure routing (back to engineer, max 2 fix-verify cycles — see ROUTE_AND_RUN Step 3 for early escalation triggers). If still failing after max cycles: play `afplay /System/Library/Sounds/Basso.aiff`, surface failure to user, emit BLOCKED checkpoint. Do NOT auto-fix.

6. **Git + PR**
   - `git pull origin main` (sync if not already on fresh branch)
   - Verify no uncommitted changes on main: `git status --short`
   - `git checkout -b <type>/pr-<id>-<short-slug>`
   - `git add <files>` (specific files only — never `git add .`)
   - `git commit -m "<type>(<scope>): <description> (PR-<id>)"`
   - `git push -u origin <branch>`
   - `gh pr create --title "..." --body "..." --base main`
   - Wait for CI: `gh pr checks <pr-number> --watch --timeout 600`
   - If CI fails: play `afplay /System/Library/Sounds/Basso.aiff`, stop, surface failure log to user, emit BLOCKED checkpoint.
   - If CI green: merge PR via `gh pr merge <number> --merge --delete-branch`
   - `git checkout main && git pull origin main`
7. **Close issue** — set GitHub Project item status to "Done" and close the issue:
   ```bash
   gh project item-edit --id <ITEM_ID> --project-id PVT_kwHOAAVnaM4BSWI7 --field-id PVTSSF_lAHOAAVnaM4BSWI7zg_6HMc --single-select-option-id 25c24fa1
   gh issue close <number>
   ```
8. **Play chime** — `afplay /System/Library/Sounds/Hero.aiff`

**9. Inter-PR Plan Check (NEW — after PR N completes, before PR N+1 starts)**
   - If this is not the last PR: read the checkpoint's `Touched files` and `Key decisions` from the PR that just completed.
   - Cross-reference against the enriched spec for the next PR (cached from Sprint Start step 3).
   - Check the `Dependencies:` section: if the next PR depends on any blocked PR, flag it.
   - If the next PR's likely files overlap with files modified by PR N, compare their specs and key decisions: does PR N invalidate PR N+1's spec or scope?
   - If conflict detected: play `afplay /System/Library/Sounds/Ping.aiff`, surface the conflict to the user with affected issue IDs and specs, and pause.
   - If no conflict: proceed silently to step 10.

10. **Emit checkpoint**, then auto-advance to next issue

---

## CHECKPOINT Format (Flat + Deterministic)

### First checkpoint (preamble — includes full sprint context):

=== ROLLING CHECKPOINT START ===
Sprint: <name/id>
GitHub Project: RE Trends (project 1, PVT_kwHOAAVnaM4BSWI7)
Current sprint iteration ID: <iteration-id from Sprint Start step 0>
Project item IDs: #NNN → <item-id> | #NNN → <item-id> | ... (all sprint issues)
Sprint issues: <#NNN Title | #NNN Title | ...> (all issues, one line, GitHub issue numbers)
Execution order: <#NNN | #NNN | ...> (team-lead recommended order, or ORIGINAL if no reorder)
Dependencies: <RE-XX depends on RE-YY [confirmed|likely|speculative] | NONE>
Last completed PR: <id + title>
Status: <DONE|BLOCKED>
Routing used: <agent chain>
Tests passed: <YES|NO|N/A>
E2E passed: <YES|SKIPPED(trivial)|SKIPPED(doc-only)|BLOCKED — reason>
Touched files:
- <file1>
- <file2>
Key decisions:
- <decision or NONE>
Risks (includes agent warnings):
- <risk or agent warning or NONE>
Open blockers:
- <blocker or NONE>
Next PR:
- <id + title>
Next routing guess:
- <agent chain or NONE>
=== ROLLING CHECKPOINT END ===

### Subsequent checkpoints (slim — sprint context already established):

=== ROLLING CHECKPOINT START ===
Sprint: <name/id>
Last completed PR: <id + title>
Status: <DONE|BLOCKED>
Routing used: <agent chain>
Tests passed: <YES|NO|N/A>
E2E passed: <YES|SKIPPED(trivial)|SKIPPED(doc-only)|BLOCKED — reason>
Touched files:
- <file1>
- <file2>
Key decisions:
- <decision or NONE>
Risks (includes agent warnings):
- <risk or agent warning or NONE>
Open blockers:
- <blocker or NONE>
Next PR:
- <id + title>
Next routing guess:
- <agent chain or NONE>
=== ROLLING CHECKPOINT END ===

Note: Subsequent checkpoints omit `Sprint issues`, `Execution order`, `Dependencies` (already in preamble). On resume, use the preamble checkpoint for full sprint context.

User instruction:
"To resume, paste the checkpoint and say: Resume sprint execution."

---

## Mid-Sprint Issue Addition

When a new issue is added to the sprint after kickoff (user says "add RE-XX to sprint", or pulls an issue in from backlog):

1. **Fetch the issue** — `gh issue view <number> --json title,body` to obtain title and full description. Also fetch its project item ID (if not already in the checkpoint preamble map): query the project items GraphQL endpoint and add the mapping to `Project item IDs:`.
2. **Run spec-enricher** — invoke `spec-enricher` (Task tool) for this issue alone:
   > "Enrich spec for one issue: [RE-XX title + description]."
   - `spec-enricher` prints its full output to the conversation. Do not suppress it — the user reviews the enriched spec before team-lead runs.
   - If spec-enricher flags a spec gap (Key unknowns = SPEC GAP): play `afplay /System/Library/Sounds/Ping.aiff`, surface the gap to the user, and pause. Do not insert the issue into the execution order until resolved or waived.
3. **Run lightweight team-lead conflict check** — invoke `team-lead` (Task tool) with:
   > "A new issue RE-XX is being added mid-sprint. Completed PRs: [list]. In-progress PR: [current]. Remaining planned issues: [list + enriched specs]. Enriched spec for RE-XX: [paste]. Mode: mid-sprint insertion — return only: (a) recommended insertion point in execution order, (b) any file conflicts with completed or in-progress work, (c) any dependency on remaining issues."
   - team-lead returns insertion point and conflict flags — do NOT re-run full pre-flight.
   - If team-lead flags conflicts: surface to user and pause.
4. **Update checkpoint preamble** — append new enriched spec to `Enriched specs:`, insert RE-XX into `Execution order:` at team-lead's recommended position, add any new dependencies to `Dependencies:`.
5. **Proceed** — continue sprint execution with updated order. No restart required.

---

## Resume Protocol

When user pastes checkpoint + says resume:

- Treat checkpoint as authoritative state (it overrides conversational memory).
- Do NOT infer prior context outside checkpoint.
- Do NOT re-triage completed PRs.
- Use `Sprint issues:` list to know remaining work — do NOT re-fetch the full sprint from GitHub Project unless the checkpoint is stale.
- Use `Enriched specs:` from the checkpoint preamble as the authoritative AC for remaining issues — do NOT re-derive them.
- Use `Key files read` to know which files carry relevant context — re-read them before the engineer runs if they are likely modified by the next PR.
- Use `Routing used` from the last completed PR as a reference signal — re-derive routing for the next PR but compare against the stored chain to catch inconsistencies.
- Immediately start on "Next PR".
- Re-run ROUTE_AND_RUN only for that PR.

---

## Failure / Token Limit Protocol

If output grows large:

- Stop immediately.
- Emit checkpoint with:
  Status: BLOCKED
  Open blockers: Output budget
- Provide next single action to take.

Never lose resumability.
