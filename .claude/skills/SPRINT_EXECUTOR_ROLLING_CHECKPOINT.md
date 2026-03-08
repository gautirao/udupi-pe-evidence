# SKILL: SPRINT_EXECUTOR_ROLLING_CHECKPOINT (deterministic)

## Purpose
Execute a sprint plan PR-by-PR using ROUTE_AND_RUN with resumable rolling checkpoints.

Checkpoint is the single source of truth.

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
   - If team-lead flags spec gaps, surface them to the user before starting execution.
4. Execute issues in the team-lead recommended order. If no reordering was recommended, use the original Linear order.
5. Do NOT re-fetch individual issues each PR unless the checkpoint is stale. Use cached descriptions from step 2.

---

## Execution Loop (Mandatory)

For each Linear issue (PR N):

1. **Fetch spec** — `get_issue` from Linear; capture full description into checkpoint `issue_description` field (first 300 chars). State issue id + title (1 line).
2. **Mark In Progress** — `save_issue state=In Progress`
3. **Bug fix gate** — if issue type is bugfix (title starts with `fix` or `bug`):
   - Reproduce the defect with a targeted test or manual step. Confirm it fails. Document in checkpoint.
   - Do NOT proceed to engineer until failure is confirmed.
4. **Run ROUTE_AND_RUN** — invoke each agent via Task tool in the routed order:
   - `qa-fast` first: pass issue description as context with prompt:
     > "Review the codebase and identify risks for this planned change: [issue description]. The feature does not exist yet."
   - Engineer agent(s) next: implement the change. Include in every engineer Task prompt:
     > 1. Read every file you will modify before writing any changes. Do not assume file contents.
     > 2. Output diffs or targeted snippets only — never rewrite an entire file unless it is new.
     > 3. Run existing tests relevant to the changed files after implementing. Report pass/fail.
   - `code-reviewer` after implementation (skip only if: risk=low AND single-file AND no logic change)
   - `security-reviewer` last if Security Gate (E) applies
5. **E2E validation** — run ROUTE_AND_RUN Step 3 (e2e suite) before committing. If e2e fails, stop and surface to user. Do NOT auto-fix.
6. **Git + PR**
   - `git pull origin main` (sync if not already on fresh branch)
   - Verify no uncommitted changes on main: `git status --short`
   - `git checkout -b <type>/pr-<id>-<short-slug>`
   - `git add <files>` (specific files only — never `git add .`)
   - `git commit -m "<type>(<scope>): <description> (PR-<id>)"`
   - `git push -u origin <branch>`
   - `gh pr create --title "..." --body "..." --base main`
   - Wait for CI: `gh pr checks <pr-number> --watch --timeout 600`
   - If CI fails: stop, surface failure log to user, emit BLOCKED checkpoint.
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
