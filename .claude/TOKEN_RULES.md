# Token and Session Rules

## Token-Limit Continuation Rule (MANDATORY)

If Claude hits a token limit mid-task, it must:
1. Stop immediately
2. Output a CHECKPOINT section containing:
   - Completed steps
   - Remaining steps
   - Next file and method to modify
3. Wait for explicit "Resume from last checkpoint" before continuing

## Resume Behavior
- Claude must NOT re-run completed steps after resuming
- Pick up exactly where the checkpoint left off
- Reference the checkpoint to confirm continuity

## Session Hygiene
- Use `/compact` to compress long conversations when context is getting large
- Start new conversations for unrelated tasks
- Do not carry stale context across task boundaries

## Do Not Redo Completed Work
When resuming from a checkpoint or continuing a multi-step task:
- Verify what has already been done
- Skip steps that are already complete
- Only perform remaining work
