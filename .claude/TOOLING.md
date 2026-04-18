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

**Exception:** When executing inside `ROUTE_AND_RUN` or `SPRINT_EXECUTOR_ROLLING_CHECKPOINT`, the git operations listed in `ROUTE_AND_RUN.md § Git Operations — Pre-Approved` (checkout, add, commit, push, pr create, pr merge) are pre-approved and do not require confirmation.

Rules:
- Do not ask for permission for auto-approved commands.
- Batch auto-approved commands when useful.
- If unsure whether a command is destructive, ask.

## Audio notification rule (MANDATORY)

Play a sound using `afplay` in these situations:

| Event | Command |
|-------|---------|
| Waiting for user approval or input (pre-implementation plan posted, blocking on user) | `afplay /System/Library/Sounds/Ping.aiff` |
| A spawned background agent has finished its task | `afplay /System/Library/Sounds/Hero.aiff` |
| Foreground task completed (no further input needed from user) | `afplay /System/Library/Sounds/Hero.aiff` |
| Hard stop / blocked (CI failure, e2e failure, unresolved review) | `afplay /System/Library/Sounds/Basso.aiff` |

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

## Audio notifications (only when applicable)

Audio notifications apply only when running via Claude CLI **and** an audio command exists (e.g., `afplay` on macOS).
If unavailable, skip audio without comment.

## Command sequencing

Run one command at a time. Do not chain unrelated commands with `&&`, `;`, or `|`.

Exception: sequential git lifecycle pairs where the second command depends on the first may use `&&` (e.g. `git checkout main && git pull origin main`). This exception applies to agent-driven git operations only — not to orchestrator-level shell execution.

**Orchestrator delegation note:** `mvn test`, `npm test`, and `npm run build` are auto-approved for engineer and QA agents. The orchestrator does NOT run these directly — it delegates to agents and reads their reported results.

## E2E test placement rule

Before creating a new e2e spec file, check whether an existing file already
covers the same page or workflow. If yes, add the new test there.

| Workflow | Spec file |
|----------|-----------|
| Infrastructure, auth redirect, CORS, ingestion | `quick-smoke.spec.ts` |
| Map filters, BHK, text search, insights page | `map-filters.spec.ts` |
| Broker role access (dashboard, listings, bookings) | `dealer-smoke.spec.ts` |
| Admin role access | `admin-smoke.spec.ts` |
| Nav link visibility by role | `nav-roles.spec.ts` |
| Listing lifecycle (create → approve → book) | `listing-lifecycle.spec.ts` |
| Broker listing form interactions (PriceField, media, wizard) | `dealer-listing-form.spec.ts` |
| User journeys (saved areas, bookings, insights, listing detail) | `user-journeys.spec.ts` |

Rules:
- Never name spec files by sprint (e.g. `sprint11-12-smoke.spec.ts`). Use feature-area names.
- Create a new spec file only when no existing file covers the workflow.
- Smoke tests (page loads, no crash) and interaction tests may coexist in the same file;
  add interaction tests as a clearly marked section at the bottom.

## E2E gate overview

| Layer | When | How |
|-------|------|-----|
| Pre-push (local) | Before every `git push` | `.githooks/pre-push` → `npm run test:e2e:local` |
| Post-deploy (production) | After every merge to `main` | `.github/workflows/e2e-post-deploy.yml` — waits for Cloudflare + Render, then runs full suite |

Post-deploy failures upload a Playwright report artifact (traces + screenshots)
to GitHub Actions for 14 days. Sentry catches JS errors that slip through.
