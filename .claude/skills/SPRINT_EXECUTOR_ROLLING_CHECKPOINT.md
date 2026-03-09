# SKILL: SPRINT_EXECUTOR_ROLLING_CHECKPOINT (deterministic)

## Purpose
Execute a sprint plan PR-by-PR using ROUTE_AND_RUN with resumable rolling checkpoints.

Checkpoint is the single source of truth.

**Authority:** `SPRINT_EXECUTOR_ROLLING_CHECKPOINT` is the single source of truth for sprint execution state, rolling checkpoints, PR lifecycle, and resume behavior. It delegates per-PR execution to `ROUTE_AND_RUN`, which owns routing logic, agent invocation rules, and the default E2E validation policy.

---

## Operating Mode

- Exactly 1 PR per run
- Diff/snippets only (no full file rewrites unless required)
- 1 pass max (second pass only if BLOCKING)
- Auto-advance to next PR after merge — emit checkpoint and continue without pausing
- Always emit checkpoint before stopping

---

## Sprint Start (Once per sprint, not per PR)

Before the first PR:
1. Fetch all sprint issue IDs + titles in one Linear call — store in checkpoint preamble as `Sprint issues:` list.
2. Fetch full descriptions for all issues (one `get_issue` call each) — needed for team-lead pre-flight.
3. **Invoke team-lead pre-flight analysis** — pass all issue IDs, titles, and descriptions as context:
   > "Sprint issues: [paste all issue IDs + titles + descriptions]. Run Mode 1: Sprint Kickoff Analysis."
   - team-lead returns: recommended execution order, dependency warnings, file conflicts, pre-review flags, spec gaps.
   - Store the recommended execution order in the checkpoint preamble as `Execution order:`.
   - If team-lead flags pre-review requirements (architect/security), add them to the routing for the affected issues.
   - If team-lead flags spec gaps: play `afplay /System/Library/Sounds/Ping.aiff`, surface them to the user and **pause for confirmation** before starting execution. If the gap is in acceptance criteria or ambiguous scope, do not proceed until resolved or explicitly waived by the user.
4. Execute issues in the team-lead recommended order. If no reordering was recommended, use the original Linear order.
5. Do NOT re-fetch individual issues each PR. Use cached descriptions from step 2. Re-fetch only if the checkpoint is stale. A checkpoint is stale when any of the following are true:
   - The cached issue description is missing or truncated to fewer than 50 characters
   - The issue title in the checkpoint does not match the issue title in Linear
   - The execution order in the checkpoint does not match the current approved execution order for this sprint (team-lead-derived order if pre-flight ran, or original Linear order if no reorder was applied)
   - The repo is not on the expected branch or has unexpected uncommitted changes on main

---

## Execution Loop (Mandatory)

For each Linear issue (PR N):

1. **Use cached spec** — use the description cached during Sprint Start step 2. Only call `get_issue` again if the checkpoint is stale (see Sprint Start step 5). State issue id + title (1 line); capture first 300 chars of description into checkpoint `issue_description` field.
2. **Mark In Progress** — `save_issue state=In Progress`
3. **Bug fix gate** — if issue type is bugfix (Linear issue type = Bug, or title starts with `fix:`/`bug:`, or description explicitly says "bug" or "defect"):
   - Reproduce the defect with a targeted test or manual step. Confirm it fails. Document in checkpoint.
   - Do NOT proceed to engineer until failure is confirmed.
4. **Run ROUTE_AND_RUN** — execute the full triage → route → agents sequence per `ROUTE_AND_RUN.md`. Routing logic, agent invocation rules, code-reviewer skip conditions, and Security Gate triggers are all defined in `ROUTE_AND_RUN.md` — do not re-derive them here.

   Sprint-specific context for `qa-fast` — always pass this prompt:
   > "Review the codebase and identify risks for this planned change: [issue description]. The feature does not exist yet."

   Bug-fix tasks: reproduction is already confirmed in step 3. `ROUTE_AND_RUN` will not re-run it.

5. **E2E validation** — run `ROUTE_AND_RUN` Step 3 (E2E Validation Policy). All E2E rules, failure handling, and the default doc-only skip are owned by `ROUTE_AND_RUN`.

   Sprint-layer skip override (extends `ROUTE_AND_RUN` doc-only skip): also skip E2E when the PR touches only non-runtime reference artifacts that produce no local frontend/backend behavior change (e.g., SQL reference copies in `supabase-rpcs/`). Do not extend this override to files that affect runtime behavior.

   If e2e fails: play `afplay /System/Library/Sounds/Basso.aiff`, surface the failure to the user and stop. Do NOT auto-fix.

   **Sprint-layer override boundary:** any sprint-layer override declared here must be narrow, additive, and state-related (e.g., skip conditions, caching, checkpoint fields). Sprint-layer overrides must not redefine routing logic, reviewer gates, invocation rules, or E2E script behavior — those are owned by `ROUTE_AND_RUN`.

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
7. **Close issue** — `save_issue state=Done`
8. **Play chime** — `afplay /System/Library/Sounds/Hero.aiff`
9. **Emit checkpoint**, then auto-advance to next issue

---

## CHECKPOINT Format (Flat + Deterministic)

Output exactly:

=== ROLLING CHECKPOINT START ===
Sprint: <name/id>
Sprint issues: <RE-XX Title | RE-XX Title | ...> (all issues, one line)
Execution order: <RE-XX | RE-XX | ...> (team-lead recommended order, or ORIGINAL if no reorder)
Last completed PR: <id + title>
Status: <DONE|BLOCKED>
Issue description (last PR, first 300 chars):
  <truncated spec text or NONE>
Bugfix reproduced: <YES|NO|N/A>
Routing used: <agent chain, e.g. qa-fast → backend-engineer → code-reviewer>
Tests passed: <YES|NO|N/A>
E2E passed: <YES|SKIPPED(doc-only)|BLOCKED — reason>
Touched files:
- <file1>
- <file2>
Key files read (context):
- <file read for context, not modified — or NONE>
Key decisions:
- <decision or NONE>
Risks:
- <risk or NONE>
Open blockers:
- <blocker or NONE>
Next PR:
- <id + title>
Next routing guess:
- <agent chain or NONE>
=== ROLLING CHECKPOINT END ===

User instruction:
"To resume, paste the checkpoint and say: Resume sprint execution."

---

## Resume Protocol

When user pastes checkpoint + says resume:

- Treat checkpoint as authoritative state (it overrides conversational memory).
- Do NOT infer prior context outside checkpoint.
- Do NOT re-triage completed PRs.
- Use `Sprint issues:` list to know remaining work — do NOT re-fetch the full sprint from Linear.
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
