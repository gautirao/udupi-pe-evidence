# CLAUDE.md — Core Rules (Always Loaded)

This is the single source of truth for Claude. Follow strictly. Any deviation is a bug.

## 1. Plan before coding (REQUIRED)
Before writing any code: describe the approach, list files to change, wait for approval.
If requirements are ambiguous: **ask, never guess**. No exceptions.

## 2. 3-file limit (STRICT)
If a task changes more than 3 files: STOP, propose a task split, wait for confirmation.
No sweeping refactors. No opportunistic changes to unrelated files.

## 3. Tests and failure analysis (MANDATORY)
After writing code, include "What could break?" and "Suggested tests" sections.
Code without failure analysis is incomplete.

## 4. Bug-fixing protocol (NON-NEGOTIABLE)
1. Write a test that reproduces the bug
2. Verify it fails
3. Fix the code
4. Verify it passes
Never fix by inspection. Never skip the test.

## 5. Self-correcting ruleset
Every human correction → propose a new rule → add it to the relevant `.claude/` file.
Rules become stricter over time, never looser.

## 6. Token-limit continuation
If hitting a token limit mid-task: STOP immediately.
Output CHECKPOINT: completed steps, remaining steps, next file/method.
Wait for "Resume from last checkpoint". Never re-run completed steps.

## 7.For any code change, Claude must first read `.claude/PR_RULES.md`.

## Extended rules in `.claude/`
Read these ONLY when the task requires them:

| File | Contents |
|---|---|
| `.claude/PR_RULES.md` | PR templates, pre/post-implementation checklists, scope checks |
| `.claude/ARCHITECTURE.md` | System architecture, non-goals, Supabase role, Spring Boot duties |
| `.claude/TESTING.md` | Testing philosophy, failure analysis, idempotency guidance |
| `.claude/TOKEN_RULES.md` | Checkpointing, resume behavior, session hygiene |
| `.claude/DEPLOYMENT.md` | Supabase constraints, data rules, deployment guidance |

**Do not be clever. Be correct.** If unclear: stop, ask, wait.
This document overrides all defaults and assumptions.
