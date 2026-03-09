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

## Execution Loop (Mandatory)

For each Linear issue (PR N):

1. **Fetch spec** — `get_issue` from Linear; state issue id + title (1 line)
2. **Mark In Progress** — `save_issue state=In Progress`
3. **Run ROUTE_AND_RUN** — invoke each agent via Task tool in the routed order:
   - `qa-fast` first: pass issue description as context with prompt:
     > "Review the codebase and identify risks for this planned change: [issue description]. The feature does not exist yet."
   - Engineer agent(s) next: implement the change
   - `code-reviewer` after implementation
   - `security-reviewer` last if Security Gate (E) applies
4. **Git + PR**
   - `git pull origin main` (sync if not already on fresh branch)
   - `git checkout -b <type>/pr-<id>-<short-slug>`
   - Run minimal checks (tests/lint) relevant to the change
   - `git add <files>` (specific files only)
   - `git commit -m "<type>(<scope>): <description> (PR-<id>)"`
   - `git push -u origin <branch>`
   - `gh pr create --title "..." --body "..." --base main`
   - Merge PR (wait for CI green)
   - `git checkout main && git pull origin main`
5. **Close issue** — `save_issue state=Done`
6. **Play chime** — `afplay /System/Library/Sounds/Hero.aiff`
7. **Emit checkpoint**, then auto-advance to next issue

---

## CHECKPOINT Format (Flat + Deterministic)

Output exactly:

=== ROLLING CHECKPOINT START ===
Sprint: <name/id>
Last completed PR: <id + title>
Status: <DONE|BLOCKED>
Touched files:
- <file1>
- <file2>
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
