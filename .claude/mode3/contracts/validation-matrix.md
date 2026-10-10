# Mode-3 contract — Validation Matrix (risk-triggered evidence packet)

> **Purpose:** the risk-triggered evidence packet policy (NOT_REQUIRED | COMPACT | FULL) and the repo's **canonical evidence grammar** (test-suite precision rules below — command + exit code + scope + freshness + provenance). Other docs (ROUTE_AND_RUN evidence contracts, CLAUDE.md §11) state compatible subsets; when evidence wording differs, this contract's grammar is the superset to follow.
> **When to load:** Phase 0.7 (Team Lead classifies the level), Phase 1 (PLAN_REVIEW validates it), Phase 5–6 (Team Lead authors the matrix for COMPACT/FULL), Phase 7C (WORKDONE_REVIEW checks presence/verdict/credibility), Phase 8 (PR_REVIEW consumes it).
> **Actor:** Team Lead proposes/authors; gates validate/consume.
> **Forbidden:** under-classifying below a hard-trigger category; vague evidence rows; log dumps.
> **Stop conditions:** unsafe downgrade at PLAN_REVIEW; missing/REQUEST_CHANGES matrix at WORKDONE/PR_REVIEW.
> **Outputs:** `[validation_matrix]` plan block; `.claude/handoffs/issue-<N>/validation-matrix.md` for COMPACT/FULL.
>
> This is the single source of truth for the validation-matrix policy; other contracts reference it rather than restating it.

## What the validation matrix is — and is NOT

The validation matrix is the **evidence packet that PR_REVIEW consumes**. It makes PR_REVIEW stronger by giving it clear, traceable evidence of:

- what was proven,
- what was **not** proven,
- which acceptance criteria passed,
- which safety / failure modes were checked,
- which claims are traceable to code / tests / reports,
- which follow-ups are non-blocking.

It is **NOT** a replacement for WORKDONE_REVIEW or PR_REVIEW, and it is **NOT** mandatory for trivial changes. It must be useful but compact — never an over-engineered ritual (see *Token-efficiency constraints* below).

## Levels (exactly three)

Every Mode-3 plan MUST classify validation as exactly one of:

```text
NOT_REQUIRED
COMPACT
FULL
```

No other value is valid.

## Ownership model

```text
Team Lead proposes the validation level during planning (team-lead-plan.toml).
PLAN_REVIEW validates that the level is appropriate (rejects unsafe downgrades).
WORKDONE_REVIEW checks that the required artefact exists and is credible.
PR_REVIEW consumes the validation matrix as part of merge-readiness assessment.
```

- The Team Lead MAY choose a **higher** level than necessary (over-classification is allowed; advisory-only).
- The Team Lead MAY NOT choose a **lower** level than the hard-trigger categories require.
- PR_REVIEW MUST NOT be sent until the required validation matrix is complete for `COMPACT` or `FULL`.

## Workflow placement

```text
implementation
→ tests
→ specialist reviews
→ WORKDONE_REVIEW
→ VALIDATION_MATRIX
→ PR_REVIEW
→ USER_MERGE_APPROVAL_REQUIRED
```

One final matrix per issue is enough. Do not require every specialist to write a separate matrix.

## Required artefact path

For `COMPACT` or `FULL`, the Team Lead creates exactly one:

```text
.claude/handoffs/issue-<issue-number>/validation-matrix.md
```

For `NOT_REQUIRED`, **no file is required**, but `team-lead-plan.toml` and/or `workdone-candidate.toml` MUST carry the one-line justification (see the planning contract block below).

Copy-to-issue templates (COMPACT + FULL) live in `.claude/templates/validation-matrix.md`.

---

## When `NOT_REQUIRED` applies

```toml
[validation_matrix]
level = "NOT_REQUIRED"
```

Only for genuinely trivial changes, such as:

- typo / wording-only docs change
- comment-only change
- dead-link fix
- harmless formatting
- dependency-free README update
- one-line CSS/class tweak with no logic
- generated snapshot update with no behaviour change
- test wording/selector-only fix with no product-assertion weakening

`NOT_REQUIRED` is allowed **only if the change touches none of**:

- product logic
- auth / security
- listing visibility / status
- data model / schema / migrations
- indexing / search / OpenSearch / Kafka / outbox
- public endpoint exposure
- scripts that create / update / delete data
- workflow / gates / validators / agent definitions
- cache policy
- metrics / cardinality-sensitive observability
- E2E assertion weakening

For `NOT_REQUIRED`, the plan MUST record a one-line justification:

```toml
[validation_matrix]
level = "NOT_REQUIRED"
reason = "Docs typo only; no behaviour, workflow, data, auth, infra or safety impact."
required_artifact = ""   # may be empty for NOT_REQUIRED
```

## When `COMPACT` is required

```toml
[validation_matrix]
level = "COMPACT"
required_artifact = ".claude/handoffs/issue-<id>/validation-matrix.md"
```

For normal bounded work, such as:

- small frontend behaviour change
- normal backend endpoint behaviour change with no auth/security/public-exposure risk
- bounded bug fix
- ordinary unit-testable logic
- small E2E test update
- non-dangerous CLI helper
- low-risk documentation where claims still need evidence

Compact matrix template:

```markdown
## Validation verdict

APPROVE / REQUEST_CHANGES

## Acceptance criteria

| AC | Evidence | Status |
|---|---|---|

## Not proven / deferred

| Item | Reason | Follow-up |
|---|---|---|

## Required changes before PR_REVIEW
```

## When `FULL` is required

```toml
[validation_matrix]
level = "FULL"
required_artifact = ".claude/handoffs/issue-<id>/validation-matrix.md"
```

`FULL` is mandatory for the **hard-trigger categories**:

- auth / role / session / JWT / permission changes
- public or anonymous endpoint exposure
- listing visibility / LIVE vs non-LIVE rules
- listing lifecycle / approval / rejection / deletion / archive behaviour
- data migration / schema / geospatial logic
- indexing / search / OpenSearch / Kafka / outbox
- backfill / rebuild / reset / cleanup scripts
- scripts that create / update / delete data
- cache policy
- metrics / observability with tags / cardinality risk
- workflow / gate / validator / agent changes
- security-sensitive product paths
- any change where PR claims must be factually traced to reports / docs / code
- any issue where failure modes matter

Full matrix template:

```markdown
## Validation verdict

APPROVE / REQUEST_CHANGES

## Acceptance criteria matrix

| AC | Requirement | Evidence | Status |
|---|---|---|---|

## Safety matrix

| Safety concern | Evidence | Status |
|---|---|---|

## Code traceability matrix

| Behaviour | File/function/test | Evidence | Status |
|---|---|---|---|

## Failure-mode matrix

| Failure mode | Expected behaviour | Evidence | Status |
|---|---|---|---|

## Claims / factual traceability matrix

| Claim | Source of truth | Evidence | Status |
|---|---|---|---|

## Not proven / deferred

| Item | Why deferred | Follow-up |
|---|---|---|

## Required changes before PR_REVIEW

## Optional follow-ups
```

The **claims / factual traceability matrix** is especially important for docs/design PRs whose output makes factual claims based on prior reports, ADRs, source code, metrics, or POC evidence.

---

## Evidence rules

A matrix row may be marked `PASS` / `VERIFIED` / `APPROVE` **only** if it has real evidence.

Acceptable evidence types:

- test command + result (command + exit code)
- file / function reference
- runtime output
- browser / E2E evidence
- PR / report citation
- code-reviewer / security-reviewer finding
- explicit `NOT_PROVEN` with reason and follow-up

Vague rows are **not** acceptable evidence:

```text
Evidence: implemented
Evidence: looks good
Evidence: verified by agent
```

For deferred items, be honest:

```text
NOT_PROVEN — deferred because local environment lacks PostGIS
NOT_PROVEN — production Kafka not deployed in this issue
NOT_PROVEN — 100k run deferred for safety
```

## Test suite evidence — precision rules

Any test-suite row in a validation matrix MUST report all of the following fields.
A row that omits any of these is NOT acceptable evidence.

| Field | Required values / format |
|---|---|
| `command_executed` | Exact shell command verbatim (e.g. `mvn test -pl backend`, `npm run test:e2e:gate`) |
| `runner_or_phase` | Maven phase (`surefire` / `failsafe`), test runner (`vitest` / `playwright` / `tsc`), etc. |
| `scope_pattern` | What classes/files ran: e.g. `*Test.java` (surefire), `*IT.java` (failsafe), `src/pages/broker`, `e2e/*.spec.ts` |
| `branch` | Branch the command was run on |
| `freshness` | `CURRENT_SESSION` — command was run in the current session; or `HISTORICAL` — from project memory / prior session |
| `exit_code` | Integer exit code of the exact command, or `NOT_RUN` if the command was not executed |
| `source_of_evidence` | `DIRECT_RUN`, `PROJECT_MEMORY`, or `PRIOR_SESSION` |

**Rules:**

1. `mvn test`, `mvn verify`, `npm test`, Playwright, and TypeScript checks are **different commands** and MUST be reported as **separate rows** — never combined into one row.
2. `mvn test -pl backend` runs the Maven `test` phase (surefire, `*Test.java` unit tests only). It does **not** run `*IT.java` integration tests; those require `mvn verify` (failsafe phase). These two phases have separate exit codes and MUST NOT be conflated.
3. A command that was **not run** in the current session MUST say `freshness = HISTORICAL` and `exit_code = NOT_RUN`. It MUST NOT imply a pass or fail for the current session.
4. **Project memory cannot be presented as fresh evidence.** If a failure or pass is known from prior sessions (MEMORY.md, earlier PR work), it MUST be labelled `HISTORICAL` and cite the source (memory entry / prior PR number). A `HISTORICAL` row does NOT satisfy a `CURRENT_SESSION` evidence requirement.
5. Pre-existing failures on `main` (unrelated to the current PR) MUST be labelled `HISTORICAL / NOT_RUN_THIS_SESSION` and MUST name the source (e.g. `MEMORY.md`, `main` branch run from PR #XYZ).
6. No validation row may combine a fresh command result with historical failure evidence from a different command (e.g. `mvn test` exit 0 paired with `mvn verify` failure evidence in the same row — these are two different commands and must be two rows).

**Acceptable test suite baseline example:**

| command_executed | runner_or_phase | scope_pattern | branch | freshness | exit_code | source_of_evidence |
|---|---|---|---|---|---|---|
| `mvn test -pl backend` | surefire | `*Test.java` | feat/my-branch | CURRENT_SESSION | 0 | DIRECT_RUN |
| `mvn verify -pl backend` | failsafe + surefire | `*IT.java` + `*Test.java` | feat/my-branch | NOT_RUN | NOT_RUN | — |
| `npm run test:e2e:gate` | playwright/chromium (canonical config) | `e2e/canonical/**` | feat/my-branch | CURRENT_SESSION | 0 | DIRECT_RUN |
| `npx tsc --noEmit` | tsc | all `*.ts` / `*.tsx` | feat/my-branch | CURRENT_SESSION | 0 | DIRECT_RUN |

**NOT acceptable:**

```text
Evidence: mvn test passed, integration failures pre-existing (project memory)
Exit code: 0
```
_(Mixes a direct-run result with historical memory in one row — violates rule 6.)_

```text
Evidence: mvn test exit 0
Limitations: mvn test exits 1 due to pre-existing IT failures
```
_(States exit 0 and exit 1 for what appears to be "the same command" but is actually two different Maven phases; must be two separate rows — violates rules 1 and 2.)_

---

## Token-efficiency constraints

The matrix must be useful but compact — never a verbose ritual:

- Do not paste huge logs into the matrix.
- Prefer command summary + exit code + file path.
- Link or reference detailed artefacts instead of copying them.
- Keep normal `COMPACT` matrices short.
- Use `FULL` only for risk-triggered categories.
- Do not require every specialist to write a separate matrix.
- One final matrix per issue is enough.

---

## Decision table

```text
Docs typo                                → NOT_REQUIRED
Small CSS visual tweak                   → NOT_REQUIRED or COMPACT
E2E stale selector fix                   → COMPACT
Normal frontend state bug                → COMPACT
Backend endpoint behaviour change        → COMPACT or FULL
Public/anonymous endpoint change         → FULL
Auth/role/security change                → FULL
Listing visibility/status lifecycle      → FULL
OpenSearch/Kafka/outbox/search indexing  → FULL
Backfill/rebuild/cleanup script          → FULL
Workflow/gate/validator/agent change     → FULL
```

Examples from recent work:

```text
#1311 OpenSearch FTS/read-model docs        → FULL
#1315 OpenSearch rebuild/alias script       → FULL
#1308 E2E CTA selector/assertion fix        → COMPACT
#1287 validator TOML parsing fix            → FULL
Tiny README typo                            → NOT_REQUIRED
```

---

## Planning contract block (Team Lead — Phase 0.7)

The Team Lead MUST include this block in `team-lead-plan.toml`:

```toml
[validation_matrix]
level = "NOT_REQUIRED"   # or "COMPACT" or "FULL"
reason = "..."           # one line; mandatory for NOT_REQUIRED, recommended otherwise
required_artifact = ".claude/handoffs/issue-<id>/validation-matrix.md"   # may be empty for NOT_REQUIRED
```

The approved-execution-handoff carries this block forward verbatim so WORKDONE_REVIEW and PR_REVIEW can enforce it.

## PLAN_REVIEW behaviour (Phase 1)

PLAN_REVIEW MUST validate the chosen level and block or require revision if it is **under-classified**:

```text
Auth change marked NOT_REQUIRED            → BLOCKED
OpenSearch/Kafka/indexing change marked COMPACT → BLOCKED or REVISION_REQUIRED
Workflow validator change marked NOT_REQUIRED   → BLOCKED
Docs typo marked FULL                      → allowed but may be overkill; advisory only
```

Rules:
- Team Lead MAY choose a higher level than necessary.
- Team Lead MAY NOT choose a lower level than hard-trigger categories require.
- PLAN_REVIEW MUST reject unsafe downgrades.

## WORKDONE_REVIEW behaviour (Phase 7C)

WORKDONE_REVIEW MUST check:

- if `validation_matrix.level = NOT_REQUIRED`, the justification exists and is plausible;
- if `COMPACT` or `FULL`, the matrix file exists at `required_artifact`;
- the matrix verdict is `APPROVE`;
- no `Required changes before PR_REVIEW` remain;
- `NOT_PROVEN` items are honestly documented and either acceptable or linked to follow-up;
- the matrix does not contradict tests / reviews / evidence already captured.

If any check fails → halt; do NOT invoke WORKDONE_REVIEW (or, if discovered after, return NEEDS_FIXES).

## PR_REVIEW behaviour (Phase 8)

PR_REVIEW consumes the matrix. PR_REVIEW MUST NOT approve if:

- the required matrix is missing,
- the matrix verdict is `REQUEST_CHANGES`,
- required changes remain,
- hard safety / failure-mode rows are missing for `FULL` validation,
- factual claims are unsupported,
- deferred `NOT_PROVEN` items invalidate the PR's main goal.

PR_REVIEW MAY approve **with non-blocking follow-ups** if:

- the main goal is proven,
- deferred items are explicitly out of scope,
- follow-ups are documented,
- no safety rule is violated.

---

## Relationship to existing gates and evidence

- The validation matrix does **not** weaken or replace any existing gate. PLAN_REVIEW, WORKDONE_REVIEW, PR_REVIEW, Phase 7A/7B browser validation, scope-lock, and the mandatory **user merge approval** (CLAUDE.md §10) all remain in force.
- It is conditional: `NOT_REQUIRED` for trivial work, `COMPACT` for normal bounded work, `FULL` for the hard-trigger categories.
- It complements (does not duplicate) the dry-run autopilot evidence packet (`.claude/autopilot/templates/evidence-packet.toml`); the validation matrix is the live, PR_REVIEW-facing evidence packet, while the autopilot DoD review remains DRY-RUN only.
