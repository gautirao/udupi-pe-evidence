# Mode-3 contract — browser validation (Phase 7A / 7B)

> Loaded at Phase 7A/7B, **only for user-visible changes**. Skip entirely for docs-only / backend-only-with-no-route / test-only / pure-refactor changes (record the skip in the WORKDONE/PR packet). Browser validation runs BEFORE WORKDONE_REVIEW (`.claude/mode3/contracts/workdone-review.md`). Semantics unchanged from the original `mode3-run.md`.

## Phase 7 — Final validation then WORKDONE_REVIEW (gate order)

After the Team Lead writes `workdone-candidate.toml` (Phase 6), the Main Agent runs **independent browser validation FIRST, then submits WORKDONE_REVIEW**, so OpenAI reviews the actual browser-validated result rather than a pre-validation candidate. Authoritative order:

```text
Phase 6   TEAM_LEAD_WORKDONE_CANDIDATE (on disk)
  ↓
Phase 7A  Main Agent — Final Product Verification Gate (browser)
  ↓
Phase 7B  Main Agent — Conditional Exploratory Product Sweep (only when triggers fire)
  ↓
Phase 7C  OpenAI WORKDONE_REVIEW — consumes 7A (+7B) evidence
  ↓
Phase 8   PR create/update + PR_REVIEW gate
```

All three (7A, 7B-if-run, 7C) must pass before PR creation. If 7A FAILs or 7B reports a BLOCKING_REGRESSION, the run does NOT reach WORKDONE_REVIEW or PR — it reroutes to the Team Lead/specialists (2-cycle limit) or halts to the user. None of these gates is removed or weakened.

---

## Phase 7A — Final Product Verification Gate (browser)

**Mandatory after the Team Lead `workdone-candidate.toml` (Phase 6) and before WORKDONE_REVIEW (Phase 7C) for any user-visible frontend/product change.** A lightweight product-check agent opens the local app in a browser and confirms the changed behaviour actually works against the issue acceptance criteria, so the user is never the first person to discover an obvious product failure during manual spot-check.

This is **not** a broad exploratory QA pass and **not** a replacement for automated tests. It is a focused browser sanity check of the exact journey this PR changed.

### Purpose

After the Team Lead `workdone-candidate.toml` (Phase 6), and before WORKDONE_REVIEW (Phase 7C), verify in the real running app:

- Does the changed user journey actually work?
- Do the visible UI states match the acceptance criteria?
- Are there obvious regressions in the directly affected flow?
- Are map / list / panel / badge / chip / URL states consistent where relevant?
- Is there any bug a user would immediately notice?

### Who runs it

The Agent Team is still alive (cleanup is Phase 10). The Main Agent requests the Orchestrator to invoke **one** product-verification specialist via `Task` — `qa` in a focused browser product-verification mode (the project `verify` skill / Playwright-driven browser), **not** a full E2E suite run. The specialist writes `.claude/handoffs/issue-<N>/product-verification.toml`. The Main Agent reads that file from disk (authoritative) and decides the gate outcome. Under Path C, the Main Agent invokes the single product-verification specialist directly via `Task` in the same way.

This gate does not consume the inner specialist 2-cycle budget; it is an outer gate like WORKDONE_REVIEW / PR_REVIEW.

### Token-efficiency rules (this gate must be deliberately small)

The product-check agent **MUST NOT**:

- read broad source code,
- inspect unrelated files,
- produce long architecture analysis,
- audit unrelated journeys,
- exercise the app beyond the changed flow,
- create speculative follow-up lists,
- debug deeply unless the product check fails.

The product-check agent **MAY**:

- read the issue acceptance criteria,
- read the WORKDONE summary,
- open the local app,
- run one or two direct URLs,
- click through the exact changed flow,
- inspect visible UI,
- inspect network only when relevant,
- capture concise evidence.

**Default budget:** 1 focused product journey; plus 1 regression journey only if the issue affects navigation/state; plus 1 negative/empty-state check only if it is part of the ACs. Any expansion beyond this must be justified back to the Orchestrator before proceeding.

### Required inputs to the product-check agent

The handoff includes only:

1. issue number and title,
2. PR/branch under test,
3. local app URL/port,
4. exact reproduction / verification URL(s),
5. acceptance criteria,
6. WORKDONE summary,
7. files-changed summary,
8. known out-of-scope items,
9. what NOT to test.

Do not dump long logs or full diffs unless necessary.

### Required output (`product-verification.toml`)

```toml
[product_verification]
verdict = "PASS"            # PASS | FAIL | BLOCKED | NEEDS_USER_DECISION
browser_checked = true
same_scenario_checked = true
urls_checked = ["..."]
journeys_checked = ["..."]

[checks]
ac_passed = ["..."]
ac_failed = ["..."]
regressions_observed = ["..."]
out_of_scope_observations = ["..."]

[evidence]
summary = "Concise visible-browser evidence."
screenshots_or_trace = "path or N/A"
network_checked = "yes/no; reason"

[recommendation]
next = "proceed_to_pr"      # proceed_to_pr | fix_before_pr | user_decision
```

### Verdict rules

- **PASS** — only when the main user-visible ACs were checked in browser, the changed journey works, no obvious directly-related bug was seen, and any skipped checks are explicitly justified. On PASS → **Phase 7B (Conditional Exploratory Product Sweep) if its triggers fire, otherwise Phase 7C (WORKDONE_REVIEW)**.
- **FAIL** — the product does not work in browser, the UI contradicts the ACs, URL/map/list/panel/badge/chip states disagree, or a clear regression is observed in the directly-affected flow. On FAIL → **do not proceed to WORKDONE_REVIEW or create the PR**; route the observed bug back through the Orchestrator to the appropriate specialist (engineer fix → re-verify), bounded by the existing 2-cycle reroute limit, then halt to user if unresolved.
- **BLOCKED** — app cannot start, login/test data unavailable, local environment unavailable, or the reproduction URL cannot be reached. Report the blocker; ask for a user decision only if the team cannot resolve it.
- **NEEDS_USER_DECISION** — only for true product ambiguity, not implementation uncertainty.

### When this gate may be skipped

Skip **only** for: docs-only workflow PRs, backend-only changes with no local UI route to test, test-only PRs, or pure refactors with no user-visible change. If skipped, the WORKDONE / PR packet must include:

```toml
[product_verification]
skipped = true
reason = "docs-only/backend-only/test-only/refactor-only"
```

### Where this gate fits

1. PLAN_REVIEW gate
2. implementation
3. QA verification
4. code-reviewer
5. **Final Product Verification Gate (Phase 7A)** — mandatory for user-visible changes
6. **Conditional Exploratory Product Sweep (Phase 7B)** — only when its triggers fire (larger/high-impact changes)
7. WORKDONE_REVIEW gate (Phase 7C) — consumes the 7A/7B evidence
8. PR creation (Phase 8)
9. PR_REVIEW gate
10. user manual spot-check / merge approval (Phase 9)

The user remains the final merge gate, but the team must do this browser sanity check first.

---

## Phase 7B — Conditional Exploratory Product Sweep

**Conditional, NOT automatic.** Phase 7B runs only for larger / high-impact product changes (triggers below), after Phase 7A PASS and before WORKDONE_REVIEW (Phase 7C). Where Phase 7A verifies the *exact issue acceptance criteria*, Phase 7B explores the *nearby user journey* with a lay buyer/broker lens to surface obvious UX bugs, inconsistencies, or improvement opportunities a real user would notice.

Phase 7A stays focused and mandatory for user-visible changes; Phase 7B never replaces or weakens it. If Phase 7A FAILs/BLOCKs, Phase 7B does not run.

### Who runs it

Same pattern as Phase 7A: the Main Agent requests the Orchestrator to invoke **one** exploratory specialist via `Task` — `qa` (or the project `verify`/`run` browser approach) — which drives the nearby journeys in a real browser and writes `.claude/handoffs/issue-<N>/product-sweep.toml`. The Main Agent reads it from disk and decides. Under Path C, the Main Agent invokes the single specialist directly. Outer gate — does not consume the inner specialist 2-cycle budget.

### When Phase 7B SHOULD run (any one is sufficient)

- the issue is a `feature` or a larger UX change;
- the issue touches a full user journey rather than a single component;
- the issue affects map / list / panel / badge / chip / URL consistency;
- the issue affects Back, Start Over, journey switching, filters, search, school radius, or area grouping;
- the PR changes **3+ user-facing files**;
- the issue had **2+ reroutes** or repeated manual-test findings;
- QA, code-reviewer, OpenAI, or the user flagged high product risk;
- the user explicitly asks for exploratory testing.

### When Phase 7B should be SKIPPED

Skip for: docs-only changes; test-only changes; backend-only changes with no browser route; trivial copy/prop fixes; isolated one-component fixes with narrow ACs; refactors with no user-visible behaviour. If skipped, record in the WORKDONE / PR packet:

```toml
[exploratory_sweep]
skipped = true
reason = "trivial/narrow/docs-only/test-only/backend-only/refactor-only"
```

### Token-efficiency constraints (must be bounded)

- **max 3 user journeys**;
- **max 5 findings**;
- no broad source-code reading;
- no implementation;
- no unrelated product audit;
- no speculative architecture analysis;
- network inspection only if relevant;
- **stop if the budget is exceeded and ask for approval** before continuing.

### Explorer lens (lay buyer / broker)

1. Do I understand where I am?
2. Do map, panel, URL, chips, badge, listings, and markers agree?
3. Are loading, empty, and error states clear?
4. Do Back, Clear, Start Over, and browser Back behave predictably?
5. Are counts and filters trustworthy?
6. Are CTAs clear and non-destructive?
7. Does anon/auth behaviour differ unexpectedly?
8. Is there any obvious mobile/responsive issue if relevant?

### Output schema (`product-sweep.toml`)

```toml
[exploratory_sweep]
verdict = "NO_MAJOR_FINDINGS"   # NO_MAJOR_FINDINGS | FINDINGS_REPORTED | BLOCKING_REGRESSION | BLOCKED
triggered = true
reason = "..."
journeys_checked = ["..."]
budget = "max 3 journeys / max 5 findings"

[[findings]]
severity = "P0|P1|P2|P3"
type = "bug|ux|copy|performance|accessibility|test-gap"
title = "..."
repro = "..."
expected = "..."
actual = "..."
caused_by_current_pr = true
suggested_action = "block_pr|file_followup|report_only|needs_product_decision"
```

### Verdict rules

- **BLOCKING_REGRESSION** — a direct regression caused by the current PR. **Do NOT proceed to WORKDONE_REVIEW / do NOT create the PR**; route back to the specialist (engineer fix → re-verify) bounded by the 2-cycle reroute limit, then halt to user if unresolved.
- **FINDINGS_REPORTED** — non-blocking or unrelated findings. Continue to Phase 7C (WORKDONE_REVIEW), but report them clearly (and file follow-ups per Scope control).
- **NO_MAJOR_FINDINGS** — proceed to Phase 7C (WORKDONE_REVIEW).
- **BLOCKED** — environment/data issue prevented the sweep. Report the blocker; ask for a user decision only if the team cannot resolve it.

### Scope control (findings must not auto-expand the PR)

A finding may be fixed **in the current PR only** if (a) it is a direct regression caused by this PR, or (b) the user explicitly approves scope expansion. Otherwise report it or file a separate follow-up issue — do not silently widen scope.
