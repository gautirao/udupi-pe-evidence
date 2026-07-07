# Mode-3 contract — Bugfix Fast Path (bug issues only)

> **Purpose:** reproduction-first bug protocol — Phases B0–B5, the BUG_REPRO_REPORT schema, severity shortcuts, and bug gate-packet requirements.
> **When to load:** ONLY after the issue is classified as a BUG; the BUG_REPRO gate (Phase B1) runs in Phase 0.7 BEFORE the Team Lead authors `team-lead-plan.toml`.
> **Actor:** Team Lead (via QA for reproduction), then normal Stage-B specialists.
> **Inputs:** issue reproduction steps/URL, expected vs observed behaviour.
> **Allowed scope:** smallest safe fix targeting the reproduced failure.
> **Forbidden:** speculative fixes for NOT_REPRODUCED bugs, broad refactors, unrelated cleanup, opportunistic test rewrites (full list: Phase B3).
> **Stop conditions:** NOT_REPRODUCED with no OpenAI-approved exception or user authorisation; same scenario cannot be retested.
> **Outputs:** `bug-repro-report.toml`, `[bug_reproduction]`/`[bug_fix_verification]`/`[regression_test]`/`[bug_eval_checklist_result]` blocks in the WORKDONE packet.
>
> Canonical status vocabulary: `REPRODUCED | NOT_REPRODUCED | PARTIALLY_REPRODUCED | ENVIRONMENT_OR_DATA_DEPENDENT` (`REPRO_CONFIRMED`/`REPRO_NOT_CONFIRMED` are accepted only as legacy aliases when reading old artefacts — never write them in new artefacts). Semantics unchanged from the original `mode3-run.md`.

Use this path when the issue is a concrete bug with a user-provided reproduction or observable failure.

## Principle

A bug is not ready for implementation until QA has reproduced it locally or has explicitly proven it cannot be reproduced.

A bug is not ready for PR until QA has verified that the original failing scenario now passes.

The user is the final acceptance gate, not the primary tester.

The key invariant is:

```text
same_scenario_retested = true
```

---

## Phase B0 — Bug intake

Main agent may only capture:

- issue number,
- user-reported observed behaviour,
- expected behaviour,
- reproduction URL or steps,
- affected journey/component,
- known related issues,
- explicit out-of-scope items.

Main agent must not diagnose root cause from code at this stage.

Main agent must not start broad repository exploration.

---

## Phase B1 — BUG_REPRO gate (reproducibility first)

**HARD INVARIANT — for bug issues, no implementation plan (`team-lead-plan.toml`) is valid until the Team Lead has classified reproduction into exactly one of four statuses with evidence.** The Team Lead runs this in Phase 0.7 BEFORE authoring the plan; QA owns the reproduction attempt. The Team Lead must NOT do extensive orchestration or any implementation for a bug it cannot reproduce.

The Team Lead (via QA) writes `.claude/handoffs/issue-<N>/bug-repro-report.toml`:

```toml
gate = "BUG_REPRO_REPORT"
issue = 0
status = "REPRODUCED"   # REPRODUCED | NOT_REPRODUCED | PARTIALLY_REPRODUCED | ENVIRONMENT_OR_DATA_DEPENDENT
[bug_claim]
expected = ""
actual = ""
user_impact = ""
[reproduction]
environment = ""
steps = []
evidence = []
[observations]
console_errors = []
network_errors = []
logs = []
screenshots = []
database_findings = []
[scope_understanding]
likely_area = ""
backend_required = false
frontend_required = false
data_required = false
uncertainties = []
[decision]
next_step = "CREATE_IMPLEMENTATION_PLAN"   # CREATE_IMPLEMENTATION_PLAN | NO_SPECULATIVE_FIX | REQUEST_OPENAI_REVIEW | DIAGNOSTIC_ONLY
classification = ""    # set to "EVIDENCE_BASED_NON_REPRO_FIX" when requesting that exception
reason = ""
```

### Status → allowed next step

- **REPRODUCED** → the Team Lead may author `team-lead-plan.toml`; Main Agent submits to PLAN_REVIEW.
- **NOT_REPRODUCED** → **no speculative implementation.** A NOT_REPRODUCED bug cannot move directly to implementation. Allowed outcomes only:
  - add diagnostic logging (if approved),
  - add a regression test if the behaviour can be modelled,
  - comment on the issue with reproduction attempts + evidence,
  - request missing data only if absolutely necessary,
  - file a follow-up for missing environment/data,
  - close/defer as not reproducible if appropriate.
- **PARTIALLY_REPRODUCED** or **ENVIRONMENT_OR_DATA_DEPENDENT** → the Team Lead proposes a **bounded** diagnostic or evidence-based path; **OpenAI must approve (PLAN_REVIEW) before any implementation.**

### Evidence-based non-repro fix exception (narrow, OpenAI-approved only)

If runtime reproduction is impossible but the root cause is strongly supported by production logs, stack traces, data samples, or code inspection, the Team Lead may request OpenAI approval for an `EVIDENCE_BASED_NON_REPRO_FIX`:

```toml
[decision]
next_step = "REQUEST_OPENAI_REVIEW"
classification = "EVIDENCE_BASED_NON_REPRO_FIX"
reason = "Production stack trace points to the exact null-access path, but local data cannot reproduce it."
```

OpenAI decides whether the evidence is strong enough. The Main Agent does NOT grant this exception itself.

### OpenAI bug PLAN_REVIEW checks

For a bug, the PLAN_REVIEW packet must carry the reproduction evidence, and OpenAI must check:

```toml
[bug_repro_check]
reproduction_status = "REPRODUCED"
repro_evidence_sufficient = true
speculative_fix_detected = false
root_cause_supported_by_evidence = true
[eval_checklist]
items = [
  "Original bug was reproduced or valid exception approved",
  "Root cause is explained using evidence",
  "Fix addresses the reproduced/supported behaviour",
  "Regression test fails before fix or directly covers the bug condition",
  "No unrelated behaviour changed",
  "Post-fix evidence shows the bug no longer occurs",
]
[self_critic]
possible_blind_spots = []
evidence_that_would_change_decision = []
```

The legacy `REPRO_CONFIRMED` / `REPRO_NOT_CONFIRMED` markers map to `REPRODUCED` / `NOT_REPRODUCED`. The only way past a non-reproduced bug into implementation is an explicit OpenAI-approved exception or explicit user authorisation.

---

## Phase B2 — Minimal diagnosis

After QA reproduction, assign only the smallest necessary specialist set.

Examples:

- frontend engineer for UI/state/rendering bugs,
- backend/API engineer for request/response/data-contract bugs,
- performance engineer only when the proposed fix touches data volume, query paths, marker/list rendering, caching, map-fit loops, or API-call behaviour,
- test infra only for flaky or harness-level problems.

Specialist must answer:

- exact root cause,
- smallest safe fix,
- exact files proposed,
- why this fix targets the reproduced failure,
- how it avoids scope expansion.

Do not produce broad architecture alternatives unless required.

Do not allow the main agent to invent the mechanism after OpenAI gate feedback. If OpenAI requests more concrete detail, route that request back to the relevant specialist.

---

## Phase B3 — Fix against the reproduction

Engineer implements only the smallest fix that addresses the reproduced failure.

Forbidden in Bugfix Fast Path:

- broad refactors,
- unrelated cleanup,
- opportunistic test rewrites,
- changing unrelated journeys,
- fixing nearby issues,
- adding new API endpoints unless diagnosis proves it is required,
- performance redesign unless the bug is performance-related,
- merging adjacent feature work,
- changing tests to pass without proving the product bug is fixed.

---

## Phase B4 — Same-scenario verification gate

QA must rerun the exact original reproduction steps.

Required verification evidence:

- same URL / same starting state,
- same user steps,
- before/after comparison,
- network evidence if relevant,
- UI evidence that the failure no longer occurs,
- regression test name,
- targeted test result,
- smoke result or explicit reason smoke is not required.

The WORKDONE packet must include:

```toml
[bug_reproduction]
status = "REPRODUCED"   # canonical vocabulary; do not write the legacy alias REPRO_CONFIRMED
evidence = "..."

[bug_fix_verification]
status = "FIX_VERIFIED"
same_scenario_retested = true
evidence = "..."

[regression_test]
added_or_updated = true
test_name = "..."
```

WORKDONE_REVIEW must not be submitted unless:

```toml
same_scenario_retested = true
```

If the same scenario cannot be retested, stop and ask for user decision.

---

## Phase B5 — PR and merge

The **Final Product Verification Gate (Phase 7A)** applies to bug fixes and **must include the original failing scenario in the browser**. For a bug fix, the product-verification report cannot PASS unless:

```toml
same_scenario_checked = true
```

If the original failing scenario was not re-driven in the browser, Phase 7A cannot PASS and the PR must not be created.

PR may be created only after:

- reproduction confirmed,
- fix implemented,
- same scenario verified,
- Phase 7A product verification PASS (original failing scenario re-driven in browser, `same_scenario_checked = true`),
- regression coverage added or justified,
- code reviewer approved.

PR_REVIEW must include:

- original failing scenario,
- proof it now passes,
- tests run,
- scope confirmation,
- performance/scale note if relevant.

Stop before merge for user manual acceptance.

---

## Bugfix severity shortcuts

### Small UI bugs

- QA reproduction can be a short Playwright/manual local proof.
- PLAN_REVIEW can be compact.
- Do not require multiple specialists unless the failure crosses boundaries.
- Still require same-scenario verification before PR.

### Data/API bugs

- Backend/API specialist is mandatory.
- Network evidence is mandatory.
- Verification must include request URL, params, status code, and response behaviour where relevant.
- Do not label a bug "data issue" if the user provides a working URL/flow showing the data exists.

### Marker/map/listing bugs

Frontend specialist is mandatory.

QA must capture:

- network calls,
- marker visibility,
- listing visibility,
- map state where relevant,
- URL before/after,
- panel state.

Performance note is mandatory.

Performance engineer is required if any of the following are introduced or changed:

- query keys,
- marker filtering,
- listing filtering,
- cache behaviour,
- map-fit loops,
- new API call,
- changed API call,
- broader data loading.

The fix must not:

- fetch all properties globally,
- scan all listings client-side,
- introduce duplicate API calls,
- re-fit map on every render,
- degrade with large numbers of areas, schools, listings, or markers.

### Flaky tests

- QA or test infra owns diagnosis.
- Product engineers should not patch product code unless the flake reveals a real product race.
- If a known flake blocks push, document the related issue and ask user before any `--no-verify` bypass.

---

## Gate behaviour

OpenAI gates should run automatically.

The user should only be asked for:

- merge approval,
- scope expansion,
- policy exception,
- inability to reproduce,
- product decision.

Do not ask the user to approve routine PLAN_REVIEW or WORKDONE_REVIEW when OpenAI gates are available.

If OpenAI returns `REVISION_REQUIRED`, the main agent must route the revision to the relevant specialist instead of inventing the mechanism itself.

---

## Gate packet requirements

Bugfix gate packets must include role provenance.

Include:

```toml
[provenance]
main_agent_files_read = []
specialist_files_read = []
path_c_used = false
scope_expansion = false
```

WORKDONE packet for bugs must also include:

```toml
[bug_reproduction]
status = "REPRODUCED"   # REPRODUCED | NOT_REPRODUCED | PARTIALLY_REPRODUCED | ENVIRONMENT_OR_DATA_DEPENDENT (REPRO_CONFIRMED accepted as legacy alias of REPRODUCED)
evidence = "..."

[bug_fix_verification]
status = "FIX_VERIFIED"
same_scenario_retested = true
evidence = "..."

[regression_test]
added_or_updated = true
test_name = "..."

# Satisfaction matrix against the OpenAI bug PLAN_REVIEW eval_checklist.
# Every item must be PASS (with evidence) — any FAIL/BLOCKED means the work is not done.
[bug_eval_checklist_result]
"Original bug was reproduced or valid exception approved" = "PASS - evidence..."
"Root cause is explained using evidence" = "PASS - evidence..."
"Fix addresses the reproduced/supported behaviour" = "PASS - evidence..."
"Regression test fails before fix or directly covers the bug condition" = "PASS - evidence..."
"No unrelated behaviour changed" = "PASS - evidence..."
"Post-fix evidence shows the bug no longer occurs" = "PASS - evidence..."
```
