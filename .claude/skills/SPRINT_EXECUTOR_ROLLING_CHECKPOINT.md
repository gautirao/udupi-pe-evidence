# SKILL: SPRINT_EXECUTOR_ROLLING_CHECKPOINT (deterministic)

## Purpose
Execute a sprint plan PR-by-PR using ROUTE_AND_RUN with resumable rolling checkpoints.

Checkpoint is the single source of truth.

**Authority:** `SPRINT_EXECUTOR_ROLLING_CHECKPOINT` is the sprint-level source of truth for issue ordering, dependency handling, project state transitions, merge/close flow, checkpoint persistence, and resume behavior. `ROUTE_AND_RUN.md` is the single source of truth for per-PR execution policy: change classification, routing logic, agent invocation rules, reviewer/security retry loops, process-doc review requirements, post-engineer materialization checks, and E2E validation policy. `SPRINT_EXECUTOR_ROLLING_CHECKPOINT` may supply sprint context and record outputs, but must not redefine or override these per-PR rules.

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

   **Mode selection:** If the user says "lightweight" at sprint kickoff, OR if all issue descriptions are 200+ characters with explicit behavioral statements, invoke with:
   > "Mode: lightweight. Enrich specs for the following sprint issues: [paste all issue IDs + titles + descriptions]."
   Otherwise, use the default (full mode) invocation:
   > "Enrich specs for the following sprint issues: [paste all issue IDs + titles + descriptions]."
   When in doubt, use full mode.

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
4. **Run ROUTE_AND_RUN** — execute the full triage → route → agents sequence per `ROUTE_AND_RUN.md`.

   Sprint-specific context for `qa-fast` — always pass this prompt:
   > "Review the codebase and identify risks for this planned change: [issue description]. Acceptance criteria: [AC from enriched spec]. The feature does not exist yet."

   Bug-fix tasks: reproduction is already confirmed in step 3. `ROUTE_AND_RUN` will not re-run it.

   **Boundary rule:** `ROUTE_AND_RUN.md` owns change classification, reviewer/security retry loops, process-doc review, post-engineer materialization checks, and E2E gate policy. `SPRINT_EXECUTOR_ROLLING_CHECKPOINT` records the outcomes of those gates in the checkpoint but does not restate, reinterpret, or override them here.

5. **Git + PR**
   - `git pull origin main` (sync if not already on fresh branch)
   - Verify no uncommitted changes on main: `git status --short`
   - `git checkout -b <type>/pr-<id>-<short-slug>`
   - `git add <files>` (specific files only — never `git add .`)
   - `git commit -m "<type>(<scope>): <description> (PR-<id>)"`
   - `git push -u origin <branch>`
   - `gh pr create --title "..." --body "..." --base main`
   - **Workflow invariant:** Every PR body must include `Closes #<issue-number>` for the issue being executed. The issue number comes from the sprint checkpoint's `Sprint issues:` map. Missing closing keyword is a workflow error — this step is not complete until the correct closing keyword is present in the PR body.
   - **Local E2E is the primary merge gate.** If the pre-push hook ran E2E and it passed (40/0 failures, marker written), proceed to merge immediately — do NOT wait for CI.
   - CI green is a bonus signal, not a merge blocker. Only block on CI if the failure is clearly a **code failure** (test failures, compile errors, linting): play `afplay /System/Library/Sounds/Basso.aiff`, stop, surface failure log to user, emit BLOCKED checkpoint. Infrastructure failures (billing limits, runner unavailability, network timeouts) do NOT block merge when local E2E passed.
   - Merge PR via `gh pr merge <number> --merge --delete-branch`
   - `git checkout main && git pull origin main`
6. **Close issue + update project status**
   **Step A — Close the issue (always required):**
   ```bash
   gh issue close <number>
   ```
   If the PR body contains `Closes #<number>`, GitHub auto-closes the issue on merge — `gh issue close` is idempotent, always run it.

   **Step B — Set project status to Done:**
   ```bash
   gh project item-edit --id <ITEM_ID> --project-id PVT_kwHOAAVnaM4BSWI7 --field-id PVTSSF_lAHOAAVnaM4BSWI7zg_6HMc --single-select-option-id 25c24fa1
   ```
   - If GitHub Project automation moved the item to Done automatically (triggered by issue close): verify the item status, then skip — `gh project item-edit` is optional.
   - If automation did not fire or is not configured: `gh project item-edit` is required.
   - Do not leave a non-Done project card after a merged PR.
7. **Play chime + emit sprint progress line** — `afplay /System/Library/Sounds/Hero.aiff`

   Immediately after the chime, output a single progress line using the execution order from the checkpoint preamble:
   ```
   RE-NNN merged. Sprint progress: RE-AAA ✅ · RE-BBB ✅ · RE-NNN ✅ · RE-CCC (next) · RE-DDD
   ```
   - Completed issues: `RE-NNN ✅`
   - Next issue: `RE-CCC (next)`
   - Remaining issues after next: just the ID, no annotation
   - All issues in execution order on one line, separated by ` · `

**8. Inter-PR Plan Check (after PR N completes, before PR N+1 starts)**
   - If this is not the last PR: read the checkpoint's `Touched files` and `Key decisions` from the PR that just completed.
   - Cross-reference against the enriched spec for the next PR (cached from Sprint Start step 3).
   - Check the `Dependencies:` section: if the next PR depends on any blocked PR, flag it.
   - If the next PR's likely files overlap with files modified by PR N, compare their specs and key decisions: does PR N invalidate PR N+1's spec or scope?
   - If conflict detected: play `afplay /System/Library/Sounds/Ping.aiff`, surface the conflict to the user with affected issue IDs and specs, and pause.
   - If no conflict: proceed silently to step 9.

9. **Emit checkpoint + persist to file**
   - **Conversation output:** use the slim checkpoint format (omitting Sprint issues, Execution order, Dependencies, Enriched specs — already established in preamble). Full format only for the first checkpoint of a sprint.
   - **File output:** always write the FULL checkpoint to `.claude/SPRINT_CHECKPOINT.md` — preamble format with Sprint issues, Execution order, Dependencies, and ALL enriched specs for remaining issues. This file is the authoritative resume source and must be self-contained (readable by a fresh conversation with no prior history).

**9a. Compact before next PR (conditional)**
   - After writing the checkpoint file, invoke `/compact` only if context growth is making responses noticeably slower or the conversation is approaching context limits.
   - After compaction, read `.claude/SPRINT_CHECKPOINT.md` to restore full sprint context before starting the next PR.
   - If context is still lean, skip compaction and continue — the checkpoint file is the fallback on automatic context compression regardless.

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
Engineer materialization: <PASS|FAIL|N/A>
E2E passed: <YES|SKIPPED(trivial)|SKIPPED(doc-only)|SKIPPED(backend-only, no FE files, no FE consumer, no contract change, no cross-layer flow)|BLOCKED — reason>
E2E coverage relevance: <COVERED|GAP(no auth fixture)|GAP(no spec for flow)|N/A>
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
Engineer materialization: <PASS|FAIL|N/A>
E2E passed: <YES|SKIPPED(trivial)|SKIPPED(doc-only)|SKIPPED(backend-only, no FE files, no FE consumer, no contract change, no cross-layer flow)|BLOCKED — reason>
E2E coverage relevance: <COVERED|GAP(no auth fixture)|GAP(no spec for flow)|N/A>
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
"To resume, say: Resume sprint execution. The checkpoint file at .claude/SPRINT_CHECKPOINT.md will be read automatically."

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

Resume is triggered by any of:
- User says "resume sprint execution" (with or without pasting a checkpoint)
- Automatic context compression mid-session
- Starting a new conversation after a previous session ended mid-sprint

On resume:

1. **Read `.claude/SPRINT_CHECKPOINT.md`** — this is the authoritative sprint state. If the user also pastes a checkpoint in conversation, prefer the file version (it uses full preamble format with enriched specs).
2. Treat checkpoint as authoritative state (it overrides conversational memory).
3. Do NOT infer prior context outside checkpoint.
4. Do NOT re-triage completed PRs.
5. Use `Sprint issues:` list to know remaining work — do NOT re-fetch the full sprint from GitHub Project unless the checkpoint is stale.
6. Use `Enriched specs:` from the checkpoint as the authoritative AC for remaining issues — do NOT re-derive them.
7. Use `Key files read` to know which files carry relevant context — re-read them before the engineer runs if they are likely modified by the next PR.
8. Use `Routing used` from the last completed PR as a reference signal — re-derive routing for the next PR but compare against the stored chain to catch inconsistencies.
9. Immediately start on "Next PR".
10. Re-run ROUTE_AND_RUN only for that PR.

---

## Failure / Token Limit Protocol

If output grows large:

- Stop immediately.
- Emit checkpoint with:
  Status: BLOCKED
  Open blockers: Output budget
- Provide next single action to take.

Never lose resumability.
