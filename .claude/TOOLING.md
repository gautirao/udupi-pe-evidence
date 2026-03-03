## Claude CLI tool execution policy

When running in Claude CLI, the following permissions are granted by default
for the duration of a task.

### Auto-approved commands (no confirmation required)
These commands are considered read-only and safe:
- ls
- tree
- pwd
- cat
- grep / rg
- find
- sed -n
- git status
- git diff
- git log
- git show
- git branch
- git fetch (no merge)
- mvn test
- npm test
- npm run build
- npm run lint
- afplay

### Single-approval commands (approve once per task)
These commands modify local files but are non-destructive:
- git add
- git rm
- git mv
- npm install
- bun install
- mvn compile
- mvn package

### Always require explicit approval
- git commit
- git push
- git reset --hard
- git clean
- rm -rf
- database mutations
- storage deletions
- production deployments

Rules:
- Do not ask for permission for auto-approved commands.
- Batch auto-approved commands when useful.
- If unsure whether a command is destructive, ask.

## Audio notification rule (MANDATORY)

Play a sound using `afplay` in these situations:

| Event | Command |
|-------|---------|
| Waiting for user approval or input (pre-implementation plan posted, blocking on user) | `afplay /System/Library/Sounds/Ping.aiff` |
| A spawned background agent has finished its task | `afplay /System/Library/Sounds/Glass.aiff` |
| Foreground task completed (no further input needed from user) | `afplay /System/Library/Sounds/Glass.aiff` |

Rules:
- Always play the sound immediately before or after the triggering event (not delayed).
- `afplay` is already auto-approved — no confirmation needed.
- Do not skip this rule for speed or convenience.

## Scope deviation rule

If implementation requires modifying any file not listed in the approved Pre-Implementation Plan:
- STOP immediately
- Explain why
- Request approval for the additional file(s)

Exception:
- Test harness/build configuration changes required to run tests may proceed,
  but must be explicitly called out as soon as discovered and included in the Post-Implementation Checklist.

## Worktree Location Rule

All git worktrees must be created outside the repository root.

Default location:
../worktrees/<branch-name>

Never create worktrees inside the main project directory.

## Audio notifications (only when applicable)

Audio notifications apply only when running via Claude CLI **and** an audio command exists (e.g., `afplay` on macOS).
If unavailable, skip audio without comment.

## Command batching (reduce iterations)

When running tool commands, batch logically related steps into one command block when safe:
- show diff/status
- run tests/lint
- re-run the minimal failing subset
