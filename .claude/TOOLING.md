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
