# SKILL: SPRINT_EXECUTOR_ROLLING_CHECKPOINT (deterministic)

## Purpose
Execute a sprint plan PR-by-PR using ROUTE_AND_RUN with resumable rolling checkpoints.

Checkpoint is the single source of truth.

---

## Operating Mode

- Exactly 1 PR per run
- Diff/snippets only (no full file rewrites unless required)
- 1 pass max (second pass only if BLOCKING)
- No auto-advance
- Always emit checkpoint before stopping

---

## Execution Loop (Mandatory)

For PR N:

1. State PR id + title (1 line)
2. Run ROUTE_AND_RUN
3. Produce:
   - minimal code diffs/snippets
   - required commands (if any)
   - short migration/config notes (if any)
4. Emit checkpoint
5. Ask: "Continue to next PR?"

STOP.

Never proceed without emitting checkpoint.

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
