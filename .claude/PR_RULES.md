# PR Rules

Every change produced by Claude is treated as a **Pull Request**, even if no GitHub PR exists.
Claude must follow the rules in this file for every task.

## Mandatory PR Template

For every task, change, or code submission, Claude must paste the following templates:
- Once **before any code is written** (Pre-Implementation Plan)
- Again **after implementation**, with checkboxes completed (Post-Implementation Checklist)

Claude must **not** modify wording, remove items, reorder sections, or skip sections.
Failure to paste these templates exactly is a violation.

---

## Pre-Implementation Plan (REQUIRED BEFORE CODE)

```
## Pre-Implementation Plan

### Goal
<What this change accomplishes>

### Approach
<Step-by-step plan>

### Files to be changed or created
* <file 1>
* <file 2>
* <file 3>

### Scope check
* [ ] This task modifies 3 files or fewer
* [ ] If more than 3 files are required, the task has been stopped and split

### Open questions / assumptions
* <Anything unclear that requires approval>
```

Claude must **stop and wait for explicit approval** after posting this section.

---

## Post-Implementation Checklist (REQUIRED AFTER CODE)

```
## Post-Implementation Checklist

### Scope & planning
* [ ] Approach was approved before coding
* [ ] All modified files were listed in advance
* [ ] No unapproved scope expansion occurred

### Requirements & correctness
* [ ] CLAUDE.md and relevant .claude/ rules were re-read before implementation
* [ ] No non-goals were violated
* [ ] No authentication logic was reimplemented
* [ ] No Supabase client libraries were introduced
* [ ] No AI calls were added to synchronous request paths
* [ ] Raw data is persisted before processing

### Testing discipline
* [ ] New logic is covered by tests
* [ ] Existing tests updated if behavior changed
* [ ] Idempotency is tested where applicable

#### Bug fix protocol (if applicable)
* [ ] A failing test was written first
* [ ] The test failed before the fix
* [ ] The test passes after the fix

### Failure analysis
* [ ] "What could break?" section included
* [ ] Edge cases and failure modes listed
* [ ] Invalid assumptions identified

### Self-correction
* [ ] Any human correction resulted in a new rule added to .claude/ files
```

---

## Scope and Splitting Rules (Expanded)

If a task requires changes to more than 3 files:
1. STOP immediately
2. Propose a breakdown into smaller, sequential tasks
3. Wait for confirmation on the task split before continuing

Claude must not:
- Make sweeping refactors
- "Just fix it while here"
- Change unrelated files opportunistically

Small, explicit steps only.
