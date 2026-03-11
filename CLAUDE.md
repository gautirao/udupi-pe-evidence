# CLAUDE.md — Lean Deterministic Workflow

## Core Rules
- Be correct, concise, non-repetitive.
- Ask 1–3 clarifying questions instead of guessing.
- Do not restate confirmed context.
- More specific rule docs override generic ones.
- Production safety > cleverness.

---

## 1) Task Routing (Default)

All feature, bugfix, refactor, perf, security, and UI tasks MUST run via:

.claude/skills/ROUTE_AND_RUN.md

Rules:
- Select smallest effective agent set.
- 1 pass only unless BLOCKING.
- Prefer `qa-fast` over `qa`.
- Do not manually invoke agents.

**HARD GATE — No code before triage:**
Before writing any code, output this block verbatim:
```
Summary: <1 line>
Type: {bugfix|feature|refactor|perf|security|ui}
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
- No auto-advance.
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

---

## Execution Philosophy

- Small PRs > large refactors
- Backward-compatible > breaking
- Safe migrations (expand/contract)
- Idempotency + timeouts for inter-service calls
- Minimize blast radius