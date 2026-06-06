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
- **preflight check:** verify the local frontend/backend servers are running before starting the main verification
- open the local app,
- run one or two direct URLs,
- click through the exact changed flow,
- inspect visible UI,
- inspect network only when relevant,
- capture concise evidence.

**Server preflight requirement:**

Before opening the browser, the agent MUST verify:
```bash
curl -s http://localhost:5174 | head -1  # Frontend reachable
curl -s http://localhost:8085/health      # Backend ready (or skip if not needed)
```

If servers are unavailable, report `BLOCKED` with the preflight failure reason. Do NOT attempt the browser checks if the server is unreachable.

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

#### CODE_VERIFIED — definition and validity rules

`CODE_VERIFIED` is a verification **method**, not a verdict — it means the AC was confirmed from source code and/or unit tests without running the browser.

`verdict = "PASS"` with `method = "CODE_VERIFIED"` is valid **only when all three hold:**
1. The AC is purely static/deterministic — no runtime observation needed (e.g. "does field X exist in source?", "is section Y excluded by a boolean gate?").
2. Passing unit tests directly assert the relevant code path (not just "tests pass overall").
3. `[notes].advisory` is prefixed `INCOMPLETE_BROWSER_VERIFICATION:` listing which ACs were code-only and why.

`verdict = "PASS"` with `method = "CODE_VERIFIED"` is **NOT valid** when any AC requires runtime observation: form submission, network request, server response, auth-gated UI, or any behaviour that only manifests in a running browser.

When CODE_VERIFIED cannot produce a valid PASS, report `verdict = "BLOCKED"`, `method = "CODE_VERIFIED"`, and state the exact auth/env blocker in `[notes].blocker`.

### Evidence quality rules (CRITICAL)

**A test/check may only be reported as PASS if evidence shows the intended check actually executed.**

- Automated test PASS — e.g., `npx playwright test spec.ts --headed` exits with code 0 and all assertions executed. If the command fails (ERR_CONNECTION_REFUSED, timeout, server unavailable), report `TEST_ENV_FAILURE` or `INCONCLUSIVE`, not PASS. Include the command + exit code in evidence.
- Manual browser verification PASS — e.g., user manually opened URLs and visually confirmed UI matches ACs. Label this separately as `MANUAL_PASS`, not `AUTOMATED_PASS`.
- Unit/integration tests PASS — e.g., `npm run test` exits 0 and all assertions passed in JSDOM. This proves *logic* in isolation, not end-to-end *browser* behaviour.

**DO NOT conflate these:**
- Unit tests PASS + browser test failed to run = NOT "browser verification PASS"
- Manual visual check worked + automated test couldn't run = report as MANUAL_PASS with clear distinction

**Evidence must include:**
```toml
[evidence_chain]
automated_test_command = "npx playwright test spec.ts --headed"   # exact command run; NOT invented
automated_test_exit_code = 0 | "ERR_CONNECTION_REFUSED" | "timeout" | ...
automated_test_executed = true | false
manual_verification = true | false
manual_verification_notes = "user verified at URL X"
server_preflight_check = "PASS" | "FAIL" | "NOT_RUN"
env_file = ".env.e2e"           # REQUIRED: exact env file loaded (e.g. .env.e2e); must be repo-grounded
command_executed = "bash scripts/run-e2e-local.sh e2e/spec.ts"  # REQUIRED: exact shell command; must exist in repo
artefact_path = "playwright-report/index.html | screenshots/step1.png | N/A — BLOCKED"
                                # REQUIRED: path to screenshot, trace, video, or HTML report;
                                #           "N/A" only if verdict is BLOCKED, with reason
spec_or_script_path = "e2e/smoke/broker-listing.spec.ts"
                                # REQUIRED: repo-relative path to spec/script run;
                                #           must exist in repo (ls-verified); "N/A — BLOCKED" if not run
target_url = "http://localhost:5174/broker/listings/new"
                                # REQUIRED: exact URL opened in browser;
                                #           "N/A — CODE_VERIFIED" only if no browser was launched
pass_fail_output = "5 passed, 0 failed"
                                # REQUIRED: actual test output or observation caption; NOT invented;
                                #           copy from terminal or screenshot caption
skip_reason = ""                # REQUIRED when any AC was not checked; blank if all ACs were checked
```

If automated test did not execute (exit != 0), report verdict based on what DID run (manual verification, unit tests, or INCONCLUSIVE).

**All `[evidence_chain]` fields are mandatory.** A `product-verification.toml` that omits any field, or that sets any field to an invented/unverified value, is rejected — treat the same as a missing evidence artefact (WORKDONE_REVIEW must not be submitted until corrected).

**Advisory wording rule:** When any AC was not verified by actually running the browser, `[notes].advisory` MUST be prefixed with `INCOMPLETE_BROWSER_VERIFICATION:` followed by the reason (e.g. `"auth-gated route; no test credentials"`). Phrases such as "All ACs verified" are prohibited unless the browser was launched and the journey was driven for each AC claimed as PASS.

### Anti-fabrication rules (CRITICAL)

Never invent file paths, env var names, commands, URLs, test accounts, or credentials. Fabrication invalidates the gate.

**Forbidden fabrications — do NOT use these (named to prevent recurrence):**
- `VITE_TEST_EMAIL`, `VITE_TEST_PASSWORD` — these env vars do not exist in this repo
- `.env.local` cited as an E2E credentials file — the real file is `.env.e2e`, loaded by `playwright.config.ts`
- test accounts not confirmed present in `.env.e2e` (e.g. "dealer@example.com", "admin@test.com")
- Playwright spec paths not found under `e2e/` (e.g. "e2e/agri.spec.ts" when no such file exists)
- CLI commands not present in the repo

**Repo-grounded defaults (verified):**

| Resource | Correct value |
|---|---|
| E2E credentials file | `.env.e2e` (NOT `.env.local`) |
| E2E runner | `bash scripts/run-e2e-local.sh <spec>` |
| Frontend dev server | `npm run dev` → `http://localhost:5174` |
| Playwright config | `playwright.config.ts` (loads `.env.e2e` at line ~10) |
| Backend health | `http://localhost:8085/health` (HTTP 401 when live) |

Before citing any path, env var, or command not in the table above, verify it exists: `ls <path>` or `grep -r "VAR_NAME" . --include="*.ts" --include="*.env*"`. If you cannot verify it, do NOT cite it — report `BLOCKED` with reason `"unable to verify env/credentials"`.

**Negative gate rule:** If any `[evidence_chain]` field is found to contain a fabricated value — a path that doesn't exist, an env var not in the repo, a command that was not actually run — Phase 7A is retroactively FAILED. WORKDONE_REVIEW must not be accepted; the verification must be re-run from scratch with verified evidence.

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
