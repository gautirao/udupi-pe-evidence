# /resume-sprint

Generate a resume prompt for the current sprint from checkpoint and GitHub state.

## Steps

**1. Read workflow docs (required before generating resume prompt):**
- `.claude/skills/SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md`
- `.claude/skills/ROUTE_AND_RUN.md`
- `CLAUDE.md` (core rules)

**2. Determine the last completed PR:**

Cross-reference two sources:
```bash
git log --oneline -20
```
```bash
gh pr list --state merged --limit 10 --json number,title,mergedAt --jq 'sort_by(.mergedAt) | reverse | .[:5]'
```
The most recent merged PR that matches a sprint issue pattern is the last completed PR.

**3. Detect the active sprint iteration:**
```bash
gh api graphql -f query='{
  node(id: "PVTIF_lAHOAAVnaM4BSWI7zg_6HeY") {
    ... on ProjectV2IterationField {
      configuration {
        iterations { id title startDate duration }
      }
    }
  }
}' --jq '.data.node.configuration.iterations'
```
The active sprint is the lowest-numbered iteration that has at least one open issue. Do NOT use start dates — sprints run ahead of schedule.

**4. Fetch remaining open issues in the sprint:**
```bash
gh api graphql -f query='{
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
Filter to the active sprint's `iterationId`. These are the remaining issues.

**5. Read the checkpoint file:**
```bash
cat .claude/SPRINT_CHECKPOINT.md
```
The checkpoint is the authoritative source of truth. If it exists and has `Next PR:` set, the resume prompt should start from that PR. If `Enriched specs:` is absent, note that re-enrichment will be needed (rule 6a).

**6. Output the resume prompt:**

Generate a complete resume block that the user can paste into a new session:

```
Resume sprint execution.

Checkpoint file: .claude/SPRINT_CHECKPOINT.md

Last completed PR: [PR number + title]
Next PR: [issue number + title from checkpoint or first remaining open issue]
Active sprint iteration: [iteration title]
Remaining open issues: [count] — [issue numbers]

[If enriched specs absent in checkpoint:]
Note: Enriched specs not found in checkpoint — re-enrichment required before execution resumes (SPRINT_EXECUTOR rule 6a).

[If checkpoint is current and complete:]
Checkpoint is self-contained. Read it, verify state, and proceed to the Next PR without asking questions.
```

## Notes

- This command is read-only — it generates a prompt, it does not execute sprint work.
- If the checkpoint is missing entirely, note that a fresh sprint start is required (Sprint Start steps 0–5b).
- If the checkpoint shows `Status: SPRINT COMPLETE`, tell the user the sprint is done and ask which sprint to start next.
- The generated resume prompt should be complete enough that a fresh conversation can resume without needing this command again.
