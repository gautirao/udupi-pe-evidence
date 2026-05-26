# CLAUDE.md — Lean Deterministic Workflow

## Core Rules
- Be correct, concise, non-repetitive.
- Ask 1–3 clarifying questions instead of guessing.
- Do not restate confirmed context.
- More specific rule docs override generic ones.
- Production safety > cleverness.

---

## Shell Commands
- Run one command at a time — never chain with `&&`, `;`, or `|` unless the pipe is purely for formatting (e.g. `| tail -20`).

---

## 1) Task Routing (Default)

All feature, bugfix, refactor, perf, security, and UI tasks MUST run via:

.claude/skills/ROUTE_AND_RUN.md

**Quick-task lane:** For single, non-sprint tasks that are not high-risk, security, schema, auth, RLS, or cross-cutting: use `/quick`. Runs ROUTE_AND_RUN directly without spec enrichment or team-lead pre-flight. See `.claude/commands/quick.md` for eligibility rules and blocked categories.

Rules:
- Select smallest effective agent set.
- 1 pass only unless BLOCKING.
- Prefer `qa-fast` over `qa`.
- Do not manually invoke agents.

**HARD GATE — No code before triage:**
Before writing any code, output this block verbatim:
```
Summary: <1 line>
Type: {bugfix|small-change|feature|refactor|perf|security|incident|ui|test}  ← see ROUTE_AND_RUN.md Step 1
Scope: {single-service|multi-service|cross-cutting}
Risk: {low|med|high} — <reason>
Routing: <agent chain, e.g. qa-fast → backend-engineer → code-reviewer>
```
If this block is absent, the PR is non-compliant. A missing triage block is visible in the conversation — flag it immediately.

**Skill tool failure rule:**
If `Skill tool` returns an error for `ROUTE_AND_RUN` or `SPRINT_EXECUTOR_ROLLING_CHECKPOINT`, STOP immediately and surface the error to the user. Do NOT fall back to direct implementation. The routing gate must run before any code is written.

---

## 2) Sprint Execution

When sprint execution is requested:

Use:
.claude/skills/SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md

Rules:
- 1 PR at a time.
- Diff/snippets only.
- Auto-advance after each PR merge (SPRINT_EXECUTOR auto-advances; this overrides the generic "no auto-advance" default for standalone tasks).
- Emit rolling checkpoint after each PR.
- Resume only from checkpoint.

---

## 3) Document Triggers (Auto-Load When Applicable)

- Code edits → .claude/PR_RULES.md
- Shell commands → .claude/TOOLING.md
- Frontend/UI → docs/FRONTEND_GUIDE.md
- Deploy/infra/migrations → .claude/DEPLOYMENT.md
- Auth/cross-cutting architecture → .claude/ARCHITECTURE.md

Load only when triggered. Never preload all.

---

## 4) Planning Gate

All code changes must follow the Pre-Implementation Plan in:
.claude/PR_RULES.md

(ROUTE_AND_RUN satisfies this automatically.)

---

## 5) Bug Fix Protocol

For real defects:
1. Reproduce.
2. Confirm fail.
3. Fix.
4. Confirm pass.

No fix-by-inspection.

---

## 6) Failure Analysis (Only When Risk Changes)

Include:
- What could break?
- Suggested tests.

Skip for cosmetic or non-behavioral edits.

---

## 7) Token Discipline

- Prefer diffs over full files.
- Do not repeat sprint plans.
- Stop early and emit checkpoint if output grows.
- Never auto-iterate more than once unless BLOCKING.
- Use `/compact` if context grows large.
- Prefer the latest rolling checkpoint over injected memory/context.

---

## 8) Global Checkpoint Format

If nearing limit, output exactly:

CHECKPOINT
- Completed:
- Remaining:
- Next file + method:
- Open blockers:

Then stop.

Resume from checkpoint only.

Note: Sprint-specific checkpoint format (with PR tracking, project item IDs, enriched specs, etc.) lives in SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md. Section 8 is for non-sprint emergency checkpoints only.

---

## 9) jCodemunch & Code Navigation (for /mode3-run)

For /mode3-run execution, specialists use jCodemunch for code discovery on the main repo index (`local/udupi-property-explorer-*`):

**Policy:**
- Use jCodemunch (via search_symbols, get_context_bundle, find_references, etc.) for code discovery/navigation.
- Post-edit `index_file` is optional if the main repo index is fresh (indexed after branch creation).
- If `index_file` fails with "sub-repo index stale" error, fallback to direct Read tool (the main repo index covers all files). Do not re-index stale sub-repos during the task run.
- Implementation specialists may use direct Read/Edit for files already identified in the approved plan.
- After main is synced/merged, Main Agent refreshes the main repo index incrementally: `index_folder { "path": ".", "incremental": true }`.

**Why:** jCodemunch sub-repo indexes can become stale after main-repo reindex (e.g., `local/discover-*`, `local/backend-*` from prior work). The main repo index covers all files and is current. Stale sub-repo path resolution blocks `index_file` but doesn't affect Read. See [[jcodemunch_specialist_tooling]] memory for details.

---

## 10) Release Command Safeguard (CRITICAL)

**MANDATORY RULE:** Release commands require explicit user approval.

Release commands include:
- `gh pr merge` / `git merge`
- `git push --force` / `git push -f`
- `git reset --hard`
- `git branch -D` (force-delete)
- Any equivalent destructive operation

**Hard invariant:**  
No agent running on any model may execute a release command without an explicit user message in the current session approving that specific action.

**Confusion between gate verdicts and user approval:**
- Gate verdict (e.g., `PR_REVIEW: APPROVED_TO_MERGE`) means the gate evaluated the PR and found it eligible.
- User approval means the user has given permission to proceed with the action.
- **These are two different things.**
- Gate verdicts are NOT authorization to execute release commands.
- When a gate returns an "APPROVED" verdict, the workflow must STOP and explicitly ask the user for approval before executing the corresponding release action.

**Example (from incident #1186):**
- PR_REVIEW returned `APPROVED_TO_MERGE` ✓ (PR is eligible)
- Main Agent interpreted this as authorization to merge ✗ (confused gate verdict with user approval)
- Main Agent executed `gh pr merge` without waiting for user approval ✗ (violated mandatory gate)

**Correct workflow:**
- PR_REVIEW returns `APPROVED_TO_MERGE` ✓
- Main Agent reports the verdict to the user and asks: "Ready to merge?" ✓
- Main Agent STOPS and waits for explicit user message ✓
- User sends explicit approval message from `.claude/mode3/contracts/closeout.md` Phase 9 (e.g., "approve", "merge", "yes") ✓
- Only then, Main Agent executes `gh pr merge` ✓

**If in doubt, ask the user explicitly.** Do not assume silence means approval.

---

## Execution Philosophy

- Small PRs > large refactors
- Backward-compatible > breaking
- Safe migrations (expand/contract)
- Idempotency + timeouts for inter-service calls
- Minimize blast radius