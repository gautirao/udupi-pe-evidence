# CLAUDE.md — Core Rules (Always Loaded)

This is the single source of truth for Claude. Follow strictly. Any deviation is a bug.

## 1. Plan before coding (REQUIRED)
Before writing any code: describe the approach, list files to change, wait for approval.
If requirements are ambiguous: **ask, never guess**. No exceptions.

## 1.1 Tooling rules

- Tool execution rules are defined in `.claude/TOOLING.md`
- Read and apply them before running any shell commands
- Treat auto-approved commands as pre-authorized

## 1.2 Project context (MANDATORY READ)
- This repo uses a structured system context file: `PROJECT_CONTEXT.md`
- Read it **before planning or making assumptions** about:
  - repo layout
  - frontend/backend responsibilities
  - auth model
  - deployment targets
  - environment variables
  - external services (Supabase, Render, Cloudflare Pages, Google Maps, Google AI)
- Treat `PROJECT_CONTEXT.md` as **authoritative for system facts**
- If new system facts are discovered, propose an update to `PROJECT_CONTEXT.md`

## 1.3 Frontend rules (MANDATORY READ FOR FRONTEND TASKS)
For any frontend change, Claude must read and follow `docs/FRONTEND_GUIDE.md`.

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

## 7. For any code change, Claude must first read `.claude/PR_RULES.md`.

## 8. Agent teams + tmux (CAPABILITY NOTE)

Claude has full agent-team capability via `TeamCreate` / `Task` / `SendMessage`.
Settings (`~/.claude/settings.json`) are:
```json
{
"teamMateMode": "tmux",
"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
```

With `teamMateMode: "tmux"`, each spawned teammate runs in its **own tmux pane** — output is visible live, not collected silently in background.

**Rules:**
- For any parallel multi-PR work (≥ 2 independent PRs), prefer a team over background Task agents.
- At session start, check if Claude is running inside a tmux session:
  ```bash
  echo $TMUX
  ```
  If empty (not in tmux), prompt the user:
  > "I work best in a tmux session so teammate agents get their own panes. Run `tmux` first, then relaunch `claude`. Want to do that now?"
  Do NOT proceed with team spawning outside tmux — pane routing will silently fall back to foreground.

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
