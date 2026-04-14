# /resume-sprint

Generate a resume prompt for the current sprint. Read-only — produces a prompt block; does not execute sprint work.

---

## Step 0 — Read STATE.md and determine Resume Mode

Read `.claude/STATE.md` first, before any GitHub calls or checkpoint reads:
```bash
cat .claude/STATE.md
```

**Terminal phases** (Mode A does NOT trigger if Phase matches any of these):
```
done | idle | closed | complete | COMPLETE | ABORTED | BLOCKED_AWAITING_USER
```
`idle` — treated as inactive (no execution in progress; system is at rest waiting for new work, not paused mid-execution).

**Mode decision tree:**

```
STATE.md exists AND has "Active Issue:" field set
  AND Phase is NOT in terminal phase list
    → Mode A — In-flight execution

STATE.md missing OR terminal
  AND GitHub has open issues in an active sprint
    → Mode B — Sprint resume

STATE.md missing OR terminal
  AND no GitHub sprint issues found
    → Mode C — Kickoff
```

Record:
- Which mode was selected
- Which condition triggered it
- Which sources were checked and why each was accepted or rejected

---

## Step 1 — Read workflow docs (always required)

- `.claude/skills/SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md`
- `.claude/skills/ROUTE_AND_RUN.md`
- `CLAUDE.md` (core rules)

---

## Step 2 — Mode A path (in-flight execution)

**Skip all GitHub calls entirely.** Do NOT fetch iterations, project items, or merged PRs.

From STATE.md, extract:
- `Active Issue:` — this is the Next PR
- `Phase:` — confirms non-terminal state
- `Last session:` — for context
- `Resume action:` — the stated next step

Read the checkpoint file for additional context (cache only — STATE.md takes precedence):
```bash
cat .claude/SPRINT_CHECKPOINT.md
```

Check for fixlog (indicates mid-PR interruption):
```bash
cat .claude/state/current-pr-fixlog.md
```

Produce output using the Mode A output format (see Step 6).

---

## Step 3 — Mode B/C path (GitHub queries)

Run only when STATE.md is absent or terminal.

**Determine the last completed PR:**
```bash
rtk git log --oneline -20
```
```bash
rtk gh pr list --state merged --limit 10 --json number,title,mergedAt --jq 'sort_by(.mergedAt) | reverse | .[:5]'
```
The most recent merged PR that matches a sprint issue pattern is the last completed PR.

**Detect active sprint — dual-model, checkpoint-preferred:**

Read `.claude/SPRINT_CHECKPOINT.md` first. The resolution rule is:

1. **Checkpoint declares `Sprint identity:` explicitly** → use the recorded values directly. No discovery query needed.
   - `Sprint identity: Model A` → use `Iteration:` (title + ID) and `Current sprint iteration ID:` verbatim; skip all Model B queries.
   - `Sprint identity: Model B` → use `Milestone:` and `Sprint label:` verbatim; skip all Model A queries.
2. **Checkpoint is absent OR lacks `Sprint identity:`** (old-format archive, new conversation) → run the fallback discovery below.
3. **`HANDOFF.md` exists with a sprint identity block** → advisory only; use it to bias disambiguation when fallback discovery returns multiple candidates, never as authoritative identity.

**Grace rule for older archives:** checkpoints written before the dual-model policy had no `Sprint identity:` field. When resuming such a checkpoint, infer the model from what IS recorded:
- `Current sprint iteration ID:` present and not `WAIVED` → treat as Model A; use that ID.
- Only `Milestone:` + sprint-like label visible in commit history → treat as Model B; run fallback discovery scoped to that milestone.
- Neither present → run full fallback discovery.

---

**Fallback discovery (only when checkpoint is absent/silent on identity):**

_Model A fallback — active iteration:_
```bash
rtk gh api graphql -f query='{
  node(id: "PVTIF_lAHOAAVnaM4BSWI7zg_6HeY") {
    ... on ProjectV2IterationField {
      configuration {
        iterations { id title startDate duration }
      }
    }
  }
}' --jq '.data.node.configuration.iterations'
```
Active Model A sprint = lowest-numbered iteration with at least one open issue. Do NOT use start dates — sprints run ahead of schedule.

_Model B fallback — open milestone + sprint-label discovery:_

GitHub CLI `--label` matches exactly (no wildcards), so discovery is a two-step query:
```bash
# Step 1: list open milestones with open issues
rtk gh api "repos/gautirao/udupi-property-explorer/milestones?state=open" --jq '.[] | select(.open_issues > 0) | {number, title, open_issues, closed_issues}'

# Step 2: for each candidate milestone, list its open issues with labels
rtk gh issue list --milestone "<milestone-title>" --state open --json number,title,labels --limit 50 \
  --jq '.[] | {number, title, sprintLabels: [.labels[].name | select(startswith("sprint-"))]}'
```
Active Model B sprint = the milestone whose open issues share a single consistent `sprint-*` label. If multiple candidates or multiple conflicting sprint-labels within one milestone: surface to user, do NOT guess.

---

**Fetch remaining open issues in the sprint:**

_Model A path:_
```bash
rtk gh api graphql -f query='{
  node(id: "PVT_kwHOAAVnaM4BSWI7") {
    ... on ProjectV2 {
      items(first: 50) {
        nodes {
          id
          status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          iteration: fieldValueByName(name: "Sprint") { ... on ProjectV2ItemFieldIterationValue { title iterationId } }
          content { ... on Issue { number title state } }
        }
      }
    }
  }
}' --jq '.data.node.items.nodes | map(select(.content != null and .content.state == "OPEN")) | map({number: .content.number, title: .content.title, status: .status.name, iteration: .iteration.title, itemId: .id})'
```
Filter to the active sprint's `iterationId`. If no issues match AND Model B detection also finds nothing: Mode C applies.

_Model B path — exact milestone + label query (not glob):_
```bash
rtk gh issue list --milestone "<exact-milestone-title>" --label "<exact-sprint-label>" --state open --json number,title,labels,milestone --limit 50
```
Both values MUST be the exact recorded strings — GitHub CLI does not expand wildcards. If `<exact-sprint-label>` came from fallback discovery (not the checkpoint), surface the resolved pair to the user before proceeding. Issues do NOT need to be Project items for Model B membership; Project items (when present) are for `Status` reconciliation only.

**Read checkpoint (cache — Mode B only):**
```bash
cat .claude/SPRINT_CHECKPOINT.md
```
Use `Next PR:` from checkpoint if it aligns with the GitHub open issues list. If checkpoint and GitHub disagree, GitHub wins for sprint membership; checkpoint wins for execution order within the sprint.

Check for enriched specs:
```bash
ls .claude/sprint-enriched-specs.md
```

---

## Step 4 — Authority model

| Source | Role | Precedence |
|--------|------|-----------|
| `STATE.md` | Execution state (Mode A trigger only) | Highest — checked first |
| GitHub sprint state — Model A: Project v2 Sprint iteration; Model B: milestone + sprint label | Sprint membership | Authoritative for Mode B/C (dual-model) |
| `SPRINT_CHECKPOINT.md` | Execution order cache + declared `Sprint identity:` | Cache only for membership; authoritative for which identity model to use |
| `HANDOFF.md` | Advisory context | Advisory only — never overrides a newer STATE.md |

Rules:
- `HANDOFF.md`, if present, may add context but must never override a newer `STATE.md`.
- `SPRINT_CHECKPOINT.md` must never override active execution state from `STATE.md`.
- In Mode A, GitHub queries are not run — `STATE.md` fully drives the resume decision.

---

## Step 5 — Execution-state field values

Use explicit states — never use `N/A` as a catch-all:

| Field | When not yet executed | When skipped intentionally |
|-------|-----------------------|---------------------------|
| `Routing used` | `NOT_STARTED` | `SKIPPED(reason)` |
| `Tests passed` | `NOT_RUN` | `SKIPPED(reason)` |
| `Engineer materialization` | `NOT_STARTED` | `SKIPPED(reason)` |
| `E2E passed` | `NOT_RUN` | `SKIPPED(reason)` |

---

## Step 6 — Output format (mandatory)

Always output the decision block first, then the resume prompt block.

### Decision block:

```
Resume Mode: <A — In-flight execution | B — Sprint resume | C — Kickoff>
Source of truth for resume decision: <STATE.md | GitHub sprint state (ProjectV2) | none>
Ignored sources:
- <SPRINT_CHECKPOINT.md — cache only; cannot override active execution state>
- <HANDOFF.md — advisory only; cannot override STATE.md> (omit if not present)
Decision path:
- <primary trigger condition that fired>
- <GitHub sprint detection skipped (Mode A short-circuit)> (Mode A only)
Action: <what the resume prompt instructs the executor to do>
```

### Resume prompt block:

**Mode A:**
```
Resume sprint execution.

Resume Mode: A — In-flight execution
STATE.md active issue: [issue number + title]
Phase at interruption: [phase value from STATE.md]
Resume action from STATE.md: [resume action text]

[If fixlog exists:]
Fixlog found at .claude/state/current-pr-fixlog.md — mid-PR interruption detected.
Restore engineer-cycles, code-review-cycles, qa-verify-cycles, baseline_sha, Findings,
and QA Failures from fixlog before proceeding. Do NOT overwrite fixlog on resume.

[If checkpoint exists:]
Checkpoint file: .claude/SPRINT_CHECKPOINT.md (cache — use for execution order context only)

Do not re-run GitHub sprint detection. Proceed directly to the active issue without asking questions.
```

**Mode B:**
```
Resume sprint execution.

Resume Mode: B — Sprint resume
Checkpoint file: .claude/SPRINT_CHECKPOINT.md

Last completed PR: [PR number + title]
Next PR: [issue number + title from checkpoint or first remaining open issue]
Sprint identity: [Model A — iteration "<title>" | Model B — milestone "<name>" + label "<label>"]
Remaining open issues: [count] — [issue numbers]

[If enriched specs absent in checkpoint:]
Note: Enriched specs not found in checkpoint — re-enrichment required before execution resumes (SPRINT_EXECUTOR rule 6a).

[If checkpoint is current and complete:]
Checkpoint is self-contained. Read it, verify state, and proceed to the Next PR without asking questions.
```

**Mode C:**
```
Resume sprint execution.

Resume Mode: C — Kickoff
No active sprint found via either identity model:
- Model A: no Project v2 iteration has open issues.
- Model B: no open milestone + sprint-* label pair has open issues.
No active execution state found in STATE.md.

Action required: Begin a new sprint. Run Sprint Start steps 0–5b per SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md — declare identity model (A or B) first.
[If user has indicated a sprint to start, include sprint name/issues here.]
```

---

## Notes

- This command is read-only — it generates a prompt; it does not execute sprint work.
- Mode A does NOT require GitHub sprint labels. STATE.md fully drives execution — validation sprints, ad hoc work, and label-free sprints all work.
- Sprint identity is dual-model (see `SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md` § Sprint Identity). When the checkpoint declares `Sprint identity: Model B`, do not fall back to iteration-based detection. When the checkpoint is missing, try Model A first, then Model B; never assert "no sprint" after only checking iterations.
- If `SPRINT_CHECKPOINT.md` shows `Status: SPRINT COMPLETE` and STATE.md is also terminal, Mode C applies — tell the user the sprint is done and ask which sprint to start next.
- The generated resume prompt must be complete enough that a fresh conversation can resume without needing this command again.
- Do NOT rewrite existing GitHub GraphQL queries — preserve them exactly (they are correct for Mode B).
