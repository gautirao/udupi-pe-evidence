# CLAUDE.md — Router + Minimal Defaults (Token-Efficient)

## Defaults (always)
- Be correct, concise, and non-repetitive.
- Do not restate confirmed assumptions or unchanged context.
- Do not quote or summarize policy docs unless the user asks.
- Exception: when `.claude/PR_RULES.md` requires pasting templates, paste them verbatim.
- Prefer asking 1–3 clarifying questions over guessing.
- If rules conflict, the more specific triggered doc (e.g., PR_RULES / TOOLING / TOKEN_RULES) overrides these defaults.

## Routing (consult only when triggered)
- Any code changes / patches / file edits (including tests/config/docs) → `.claude/PR_RULES.md`
- Any shell commands → `.claude/TOOLING.md`
- Frontend/UI changes → `docs/FRONTEND_GUIDE.md`
- Deployment/infra/env/CI/migrations/data rules → `.claude/DEPLOYMENT.md`
- Auth/permissions/cross-cutting architecture → `.claude/ARCHITECTURE.md`

## Planning gate
Use the Pre-Implementation Plan template in `.claude/PR_RULES.md` (required for all code changes).

## Bug fixes (real behavior defects)
Reproduce first (test or clear failing case) → confirm fail → fix → confirm pass.
No “fix by inspection” for real bugs.

## Failure analysis (only when behavior or risk changes)
Include:
- What could break? (bullets)
- Suggested tests (bullets)

Skip failure analysis for formatting, comments, pure renames, or cosmetic-only UI tweaks.

## Agent teams (rare)
Consult `.claude/agents/*` only when the user explicitly requests agent/parallel work.

## Token checkpoint (if near limit)
Output:
CHECKPOINT
- Completed
- Remaining
- Next file + method (or next concrete edit location)
Then stop and wait for: "Resume from last checkpoint".
- When resuming: do not re-run completed steps; verify state, then continue.
- Use `/compact` to compress long conversations when context grows large.
- Start new conversations for unrelated tasks.
