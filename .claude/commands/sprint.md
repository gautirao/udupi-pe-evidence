Execute sprint work using `.claude/skills/SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md`.

**Step 1 — Determine execution mode:**

Read `.claude/SPRINT_CHECKPOINT.md`.

RESUME — if the checkpoint has a `Next PR:` set and the sprint is not marked complete:
  Treat checkpoint as authoritative. Start immediately on the listed "Next PR".
  Re-read files in `Touched files:` from the last completed PR before invoking the engineer.

NEW SPRINT — if the checkpoint is missing, shows `Status: COMPLETE`, or all execution-order issues are ✅:
  Find the next sprint to execute: query the GitHub Project (PVT_kwHOAAVnaM4BSWI7) and identify
  the lowest-numbered iteration that has at least one item with state=OPEN and status ≠ Done.
  Do NOT use iteration start dates to determine "current" — sprints run ahead of schedule.
  Once identified, run Sprint Start steps 0–6 from SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md:
  resolve iteration ID → fetch issues → spec-enricher → team-lead pre-flight →
  pause for spec gaps → begin execution.

**Step 2 — Execute:**
1 PR at a time. Auto-advance after each merge — emit checkpoint and continue without pausing.
Persist rolling checkpoint to `.claude/SPRINT_CHECKPOINT.md` after every PR.
Play `afplay /System/Library/Sounds/Hero.aiff` after each merge.
