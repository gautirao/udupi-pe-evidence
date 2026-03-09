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
2. Fetch full descriptions for all issues (one `get_issue` call each) — needed for spec enrichment and team-lead pre-flight.
3. **Spec enrichment (all issues, once)** — for each issue, derive a structured spec from the title + description:

   For each issue produce:
   ```
   [RE-XX] <title>
   AC:
   - [ ] <testable acceptance criterion>
   - [ ] <testable acceptance criterion>
   (2–5 criteria max; each must be verifiable by a test or manual step)
   Out of scope: <explicit or inferred exclusions, or NONE>
   Key unknowns: <ambiguities that block safe implementation, or NONE>
   ```

   Rules:
   - Derive AC from description. If description is too sparse (< 50 chars or no behavior stated), treat as spec gap — do NOT invent criteria.
   - "Out of scope" captures implicit exclusions (e.g., "no mobile layout changes" if work is backend-only).
   - "Key unknowns" are ambiguities that could block safe implementation — feed these directly into team-lead step 4.
   - Store all enriched specs in the checkpoint preamble as `Enriched specs:` — one block per issue.
   - These specs are the authoritative input to team-lead, qa-fast, and engineers for the rest of the sprint. Do NOT re-derive them per-PR.

4. **Invoke team-lead pre-flight analysis** — pass all issue IDs, titles, descriptions, AND enriched specs as context:
   > "Sprint issues: [paste all issue IDs + titles + descriptions + enriched specs]. Run Mode 1: Sprint Kickoff Analysis."
   - team-lead returns: recommended execution order, dependency warnings, file conflicts, pre-review flags, spec gaps.
   - Store the recommended execution order in the checkpoint preamble as `Execution order:`.
   - If team-lead flags pre-review requirements (architect/security), add them to the routing for the affected issues.
   - If team-lead flags spec gaps, OR if enrichment produced `Key unknowns` for any issue: play `afplay /System/Library/Sounds/Ping.aiff`, surface all gaps/unknowns to the user and **pause for confirmation** before starting execution. Do not proceed until each gap is resolved or explicitly waived by the user.
5. Execute issues in the team-lead recommended order. If no reordering was recommended, use the original Linear order.
6. Do NOT re-fetch individual issues each PR. Use cached descriptions from step 2 and enriched specs from step 3. Re-fetch only if the checkpoint is stale. A checkpoint is stale when any of the following are true:
   - The cached issue description is missing or truncated to fewer than 50 characters
   - The issue title in the checkpoint does not match the issue title in Linear
   - The execution order in the checkpoint does not match the current approved execution order for this sprint (team-lead-derived order if pre-flight ran, or original Linear order if no reorder was applied)
   - The repo is not on the expected branch or has unexpected uncommitted changes on main

---

## Execution Loop (Mandatory)

For each Linear issue (PR N):

1. **Use cached spec** — use the description cached during Sprint Start step 2 and the enriched spec from step 3. Only call `get_issue` again if the checkpoint is stale (see Sprint Start step 6). State issue id + title (1 line); copy AC from enriched spec into the checkpoint `Acceptance criteria` field for this PR.
2. **Mark In Progress** — `save_issue state=In Progress`
3. **Bug fix gate** — if issue type is bugfix (Linear issue type = Bug, or title starts with `fix:`/`bug:`, or description explicitly says "bug" or "defect"):
   - Reproduce the defect with a targeted test or manual step. Confirm it fails. Document in checkpoint.
   - Do NOT proceed to engineer until failure is confirmed.
4. **Run ROUTE_AND_RUN** — execute the full triage → route → agents sequence per `ROUTE_AND_RUN.md`. Routing logic, agent invocation rules, code-reviewer skip conditions, and Security Gate triggers are all defined in `ROUTE_AND_RUN.md` — do not re-derive them here.

   Sprint-specific context for `qa-fast` — always pass this prompt:
   > "Review the codebase and identify risks for this planned change: [issue description]. Acceptance criteria: [AC from enriched spec]. The feature does not exist yet."

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
Acceptance criteria (last PR):
- [ ] <criterion 1>
- [ ] <criterion 2>
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
