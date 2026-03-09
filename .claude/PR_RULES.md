# PR Rules

All Claude-generated changes are treated as Pull Requests.

For any task that modifies files:
1. Post Pre-Implementation Plan
2. Wait for explicit approval
3. Implement
4. Post Post-Implementation Checklist

No code may be written before approval.

## Fast Path (optional, user-invoked)

If the user explicitly says **"fast path"** or **"pre-approved"** for a change:
- Still paste the **Pre-Implementation Plan** template first (verbatim).
- Do **not** wait for explicit approval after the plan.
- Proceed immediately to implementation.
- Still paste the **Post-Implementation Checklist** template at the end (verbatim).
- All other PR_RULES constraints still apply.

## Terminology

When these rules reference roles:
- "engineer" means: **backend-engineer**, **frontend-engineer**, or **supabase-engineer** (whichever applies)
- "qa-validate" means: **qa-fast final** (or **qa** only when test-writing is required)
- "architect" means: **architect agent** (design-only, no direct code edits)

---

## What counts as a file

Any created or modified file, including:
- source code
- tests
- config
- documentation
- env templates
- build/deployment files

---

## Pre-Implementation Plan (REQUIRED BEFORE CODE)

## Pre-Implementation Plan

### Goal
<What this change accomplishes>

### Approach
<Step-by-step plan>

### Files
* <file 1>
* <file 2>
* <file 3>

### Scope
* [ ] 3 files or fewer
* [ ] If more than 3 files are required, task stopped and split

### Open questions
* <Assumptions requiring approval>

Claude must stop after this section and wait for approval.

**Note:** When running via `ROUTE_AND_RUN`, the `qa-fast` pre-scan and `code-reviewer` gate satisfy this planning requirement automatically. The stop-and-wait only applies to manual (non-ROUTE_AND_RUN) tasks.

---

## Post-Implementation Checklist (REQUIRED AFTER CODE)

## Post-Implementation Checklist

### Scope
* [ ] Plan approved before coding
* [ ] All modified files were listed in advance
* [ ] No unapproved scope expansion

### Correctness
* [ ] CLAUDE.md and .claude rules reviewed
* [ ] PROJECT_CONTEXT.md consulted
* [ ] No non-goals violated
* [ ] Architecture constraints respected

### Testing
* [ ] New logic covered by tests
* [ ] Existing tests updated if needed
* [ ] Idempotency tested where applicable

#### Bug fix protocol (if applicable)
* [ ] Failing test written first
* [ ] Test failed before fix
* [ ] Test passes after fix

### Failure analysis
* [ ] “What could break?” included
* [ ] Edge cases listed
* [ ] Invalid assumptions identified

### Self-correction
* [ ] Human corrections converted into rules

---

## Scope Rules

If a task requires changes to more than 3 files:
1. Stop immediately
2. Propose task split
3. Wait for confirmation

No opportunistic refactors.
No unrelated file changes.

---

## Analysis-only / No-code tasks

If zero files are modified:
- Provide Goal and Approach only
- Explicitly state: "No code changes made"
- Post-Implementation Checklist not required

---

## Routing

Agent routing and risk tiers are defined in `.claude/skills/ROUTE_AND_RUN.md` — that is the single source of truth. Do not re-derive routing here.

---

Small, explicit steps only.