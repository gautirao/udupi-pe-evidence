# CLAUDE README

## Purpose of this document

This README is **the single source of truth** for Claude (or any AI agent) working on this codebase.

The goal is to migrate **all ingestion, processing, and business logic** from Supabase Edge Functions into a **Java (Spring Boot) backend**, while **intentionally keeping Supabase as infrastructure** (Auth, Postgres, Storage).

Claude must **follow this document strictly**. Any deviation should be considered a bug.

---

## Meta-rules for Claude (MANDATORY)

These rules govern **how Claude works**, not just *what* it builds.  
Violating any rule below is considered a failure.

---

### 1. Planning before coding (REQUIRED)

Before writing **any code**, Claude must:

1. Describe the **proposed approach**
2. List:
   * Files to be modified or created
   * New responsibilities introduced
3. Explicitly wait for approval before proceeding

If requirements are **ambiguous or underspecified**, Claude must:

* Ask clarifying questions **before** writing code
* Never guess or “fill in the blanks”

No exceptions.

---

### 2. Task size limits (STRICT)

If a task requires changes to **more than 3 files**:

* STOP immediately
* Propose a breakdown into **smaller, sequential tasks**
* Wait for confirmation on the task split before continuing

Claude must not:

* Make sweeping refactors
* “Just fix it while here”
* Change unrelated files opportunistically

Small, explicit steps only.

---

### 3. Testing and failure analysis (MANDATORY)

After writing code, Claude must always include a section:

```

## What could break?

```

This section must list:

* Edge cases
* Failure modes
* Assumptions that could be violated

And a section:

```

## Suggested tests

```

Including:

* Unit tests
* Integration tests
* Property or idempotency tests where relevant

Code without failure analysis is incomplete.

---

### 4. Bug-fixing protocol (NON-NEGOTIABLE)

When fixing a bug, Claude must follow **this exact order**:

1. Write a test that reproduces the bug
2. Verify the test fails
3. Fix the code
4. Verify the test passes

Claude must not:

* “Fix by inspection”
* Change code without a failing test
* Skip test creation “for speed”

---

### 5. Self-correcting ruleset (VERY IMPORTANT)

Every time the human corrects Claude:

* Claude must propose a **new explicit rule**
* That rule must be added to this README
* The rule must be phrased so the same mistake **cannot happen again**

This document is **living** and must become stricter over time, not looser.

---

## Pull Request rules (MANDATORY)

Every change produced by Claude is treated as a **Pull Request**, even if no GitHub PR exists.

Claude must follow the rules in this section **for every task**.

---

## Mandatory PR template (MUST BE PASTED VERBATIM)

For **every task, change, or code submission**, Claude must paste the following template:

* Once **before any code is written**
* Again **after implementation**, with checkboxes completed

Claude must **not**:
* Modify wording
* Remove items
* Reorder sections
* Skip sections

Failure to paste this template exactly is a violation.

---

### 📌 PRE-IMPLEMENTATION PLAN (REQUIRED BEFORE CODE)

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

### 📌 POST-IMPLEMENTATION CHECKLIST (REQUIRED AFTER CODE)

```

## Post-Implementation Checklist

### Scope & planning

* [ ] Approach was approved before coding
* [ ] All modified files were listed in advance
* [ ] No unapproved scope expansion occurred

### Requirements & correctness

* [ ] This README was re-read before implementation
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

* [ ] “What could break?” section included
* [ ] Edge cases and failure modes listed
* [ ] Invalid assumptions identified

### Self-correction

* [ ] Any human correction resulted in a new rule added to this README

```

---

## Non-goals (DO NOT DO THESE)

Claude must **never**:

* Re-implement authentication (passwords, OAuth, sessions)
* Re-implement Google / Facebook login
* Store user credentials
* Create a Java Supabase “SDK” abstraction
* Move business logic back into Edge Functions
* Use Supabase client libraries for Java (they do not exist and are not desired)
* Put AI calls on synchronous user request paths
* Query raw scraped data directly for dashboards

Supabase is **not** an application framework. It is **managed infrastructure**.

---

## High-level architecture (MANDATORY)

```

Chrome Extension (Facebook scraping)
↓  (Supabase JWT)
Java Spring Boot Backend
↓
Supabase Postgres

```

---

## Final instruction to Claude

**Do not be clever. Be correct.**

If something is unclear:

* Stop
* Ask
* Wait

This document overrides all defaults and assumptions.
