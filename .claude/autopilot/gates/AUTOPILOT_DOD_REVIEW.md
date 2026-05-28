# AUTOPILOT_DOD_REVIEW — Gate Design (DRY-RUN ONLY)

> **THIS GATE IS DRY-RUN ONLY. IT DOES NOT MERGE, DOES NOT UPDATE PR STATE, AND HAS
> NO SIDE EFFECTS.** It may emit a `WOULD_AUTOMERGE` verdict, which is a *signal only*
> describing what a future autonomous system *would* do. No real merge is performed in
> this change under any circumstance.
>
> **DRY RUN — no merge has been or will be executed.**

This document **designs** the Definition-of-Done (DoD) autopilot review gate. It defines
purpose, inputs, the decision schema, the verdict enum, and where the gate sits in the
Mode-3 phase chain. **No executable wiring is added in this change** — `openai_gate.py`
and `verify-mode3-workdone.py` are NOT modified. Real enforcement is a future, separately
approved step (see [Future-wiring appendix](#future-wiring-appendix-out-of-scope)).

---

## Purpose

After `PR_REVIEW` surfaces `APPROVED_TO_MERGE`, the Mode-3 run halts for explicit user
merge approval (CLAUDE.md §10). The `AUTOPILOT_DOD_REVIEW` gate runs in that window and
**machine-evaluates whether every applicable Definition-of-Done criterion is satisfied by
captured evidence**. It emits `WOULD_AUTOMERGE` when the DoD is fully met (a dry-run
signal only) or a negative/indeterminate verdict otherwise.

Today completion is inferred from implementation assumptions. This gate makes "done" mean
**buyer-facing product truth satisfied with captured evidence**, judged against an
authoritative product-truth document — independent of implementation.

---

## Inputs

The gate consumes (reads from disk; it does not re-run anything):

| Input | Role |
|---|---|
| `.claude/product-truth/discover.md` | Authoritative, implementation-independent buyer-facing product truth. DoD criteria reference its section anchors. |
| `.claude/product-truth/listing-lifecycle.md` | Authoritative supply-side lifecycle truth. DoD criteria for the owner_submission / broker_submission / admin_moderation / listing_visibility / search_indexing categories reference its section anchors. |
| `.claude/handoffs/issue-<N>/definition-of-done.toml` | The per-issue DoD: which criteria apply, each `truth_anchor`, `evidence_required`, and `pass_condition`. |
| `.claude/handoffs/issue-<N>/evidence-packet.toml` | Captured evidence proving each criterion (product-level vs implementation-level split; `dry_run = true`). |
| `product-verification.toml` (Phase 7A) | Independent browser product verification evidence. |
| `product-sweep.toml` (Phase 7B, when present) | Exploratory sweep findings. |
| `workdone-candidate.toml` (Phase 7C) | `eval_checklist_result` + test evidence. |
| `verify-mode3-workdone.py` preflight result | Pre-verified integrity anchor (sha256 chain, routing-log, scope-lock, eval-checklist coverage). Consumed as already-verified; **not re-run, not modified**. |

If `product_truth_ref` (from the DoD file) does not resolve to an existing document, the
gate emits `NEEDS_MORE_EVIDENCE` rather than silently skipping DoD evaluation.

---

## Decision schema

The verdict object mirrors the existing OpenAI strict-schema gate verdicts in
`.claude/scripts/openai_gate.py` (base fields shared with `PLAN_REVIEW` / `WORKDONE_REVIEW`
/ `PR_REVIEW`), adding a `dod_check` object and reusing the shared `self_critic` shape:

```json
{
  "gate": "AUTOPILOT_DOD_REVIEW",
  "issue": 0,
  "verdict": "WOULD_AUTOMERGE | DOD_NOT_MET | NEEDS_MORE_EVIDENCE | NEEDS_USER_DECISION",
  "summary": "one-paragraph rationale",
  "blocking_issues": [],
  "required_changes": [],
  "approved_scope": null,
  "approved_files": null,
  "next_action": "...",

  "dod_check": {
    "criteria_evaluated": 0,
    "criteria_passed": 0,
    "criteria_failed": 0,
    "failed_criteria": [],
    "evidence_gaps": [],
    "dry_run_mode": true
  },

  "self_critic": {
    "consistency_check": "...",
    "possible_blind_spots": [],
    "assumptions_made": [],
    "evidence_that_would_change_decision": [],
    "decision_risk": "LOW | MED | HIGH"
  }
}
```

- The base fields (`gate`, `issue`, `verdict`, `summary`, `blocking_issues`,
  `required_changes`, `approved_scope`, `approved_files`, `next_action`) match the shared
  `VERDICT_SCHEMA` in `openai_gate.py`; `approved_scope` / `approved_files` carry `null`
  when not applicable (as they are for this gate). The `self_critic` keys above match the
  existing per-gate `_SELF_CRITIC_SCHEMA` in `openai_gate.py` — keep them in lock-step when
  the gate is wired.
- `dod_check.dry_run_mode` **MUST be `true`** in this foundation. A verdict with
  `dry_run_mode: false` is invalid until a separate, explicitly-approved change removes the
  dry-run constraint.
- The verdict object carries **no** `merge_action` field. There is intentionally no field
  by which the gate could instruct a merge.

### Governance-path pre-filter (evaluated FIRST, before any criterion)

**This pre-filter is the first thing the gate evaluates — before the all-or-nothing roll-up
below, and before any `[[criterion]]` is scored.** It is deliberately **not** a DoD
`[[criterion]]`: if it were, it would be swept into the all-or-nothing roll-up and surface as
`DOD_NOT_MET`, which is the wrong verdict. It is a phase-entry short-circuit.

**Rule.** If the PR diff touches **any** governance-sensitive path, the gate emits
`NEEDS_USER_DECISION` **immediately** and does not evaluate the DoD criteria. This holds
**regardless of file type** — a docs-only or test-only diff that touches a governance path
still yields `NEEDS_USER_DECISION`, **even if every applicable DoD criterion would otherwise
PASS**. **File-type (docs-only / test-only) classification alone cannot override the governance
check.** A change to the rules that govern what *future* changes may merge must never be
auto-merge-eligible; it requires explicit human judgment.

**Ordering invariant.** Governance pre-filter → (only if it does **not** fire) all-or-nothing
criterion roll-up. `WOULD_AUTOMERGE` is **unreachable** for any diff that touches a
governance-sensitive path. If a PR both touches a governance path *and* fails a DoD criterion,
the governance pre-filter wins and `NEEDS_USER_DECISION` is emitted first — the governance signal
is never silently swallowed by a `DOD_NOT_MET`.

**Whole-PR scope.** The unit of evaluation is the whole PR diff. If **any** file in the diff
matches a governance-sensitive path, the **entire** PR routes to `NEEDS_USER_DECISION` — even if
the same PR also touches non-governance files. (Simpler and safer: the human reviews the full
change in context.)

**Governance-sensitive path list.** A path is governance-sensitive if it matches any of:

- `.claude/autopilot/**` — the DoD autopilot gate, its templates, and product-truth wiring
- `.claude/scripts/openai_gate.py` — the OpenAI gate runner / verdict schema
- `.claude/scripts/verify-mode3-workdone.py` — the deterministic workdone preflight validator
- `.claude/scripts/**` — any other gate / validator / release-control script
- `.claude/commands/**` — Mode-3 / quick-lane command definitions: the phase index and
  task-lane routing/eligibility (e.g. `mode3-run.md`, `quick.md`)
- `.claude/skills/**` — Route-and-Run + sprint-executor choreography: per-PR change
  classification, routing logic, reviewer/gate retry loops, and E2E validation policy
  (e.g. `ROUTE_AND_RUN.md`, `ROUTE_AND_RUN_TABLES.md`, `SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md`)
- `.claude/mode3/**` — Mode-3 contracts (gate dispatch, routing, closeout, merge approval)
- `.claude/templates/**` — handoff / workdone / blocked schemas that gates consume
- `.claude/product-truth/**` — the authoritative "done" definitions the DoD evaluates against
- `.claude/agents/**` — agent definitions, including reviewer / gate agents
- `CLAUDE.md`, `AGENTS.md` — top-level workflow / agent governance (`AGENTS.md` is named as a
  **forward-looking guard**: it is protected if/when it is added to the repo)
- **Catch-all:** any file that controls **merge approval, gate verdicts, DoD validation,
  workflow routing, release commands, the OpenAI gate schema, or validator scripts** — even if
  not explicitly listed above.

**Not, by itself, governance-sensitive:** ordinary product / application code and its tests
(`src/**`, `backend/**`, `e2e/**`, `**/*.spec.*`, `**/*.test.*`). Those follow the normal DoD
roll-up below and **remain eligible for `WOULD_AUTOMERGE`** when no governance path is touched.
(Security-sensitive *product* changes — auth / public endpoints / RLS / migrations / secrets —
are escalated by a **separate** mechanism tracked under issue #1277; they are **not** in scope
for this self-governance / merge-policy pre-filter. Do not conflate the two.)

**Signal source + audit trail.** The gate derives the changed-path set from the PR diff (the
same `git diff --name-only origin/main...HEAD` / approved-scope changed-files list the run
already produces). When the pre-filter fires, the matched governance path(s) are recorded in the
verdict `summary` (and may be carried in `dod_check`) so there is an audit trail of *why* the PR
was escalated.

**Still DRY-RUN ONLY.** The pre-filter adds **no** new verdict (it reuses the existing
`NEEDS_USER_DECISION`), **no** new merge authority, and **no** side effect.
`dod_check.dry_run_mode` stays `true`. `NEEDS_USER_DECISION` is a **halt-for-user-decision** (the
run surfaces the governance diff and waits), exactly consistent with the CLAUDE.md §10
user-approval gate — it is **not** a merge-block and **not** a prohibition. After human review the
change may still be approved and merged by the user; the gate simply refuses to *auto*-treat a
self-governance change as done.

### Partial satisfaction rule (all-or-nothing)

> Evaluated **only after** the governance-path pre-filter above does **not** fire. The
> pre-filter short-circuits to `NEEDS_USER_DECISION` before this roll-up runs.

- `WOULD_AUTOMERGE` requires **every applicable criterion = PASS** *and* the governance-path
  pre-filter did not fire.
- Any criterion = FAIL → `DOD_NOT_MET`.
- Any criterion = INDETERMINATE (missing/absent evidence) → `NEEDS_MORE_EVIDENCE`.
- Any criterion flagged `requires_human_judgment` that cannot be resolved from evidence, **or**
  the governance-path pre-filter fired → `NEEDS_USER_DECISION` *(when the pre-filter fires this
  roll-up is not reached at all; this bullet names the emitted verdict for completeness)*.

A partial pass **never** yields `WOULD_AUTOMERGE`.

---

## Verdict enum

| Verdict | Meaning | Action taken |
|---|---|---|
| `WOULD_AUTOMERGE` | Every applicable DoD criterion is PASS against captured evidence. | **Dry-run signal only.** Logged + surfaced to the user. **No merge, no PR update, no side effect.** Run still halts for explicit user merge approval. |
| `DOD_NOT_MET` | One or more criteria failed (evidence shows the buyer-facing contract is not satisfied). | Surfaced; route back per Mode-3 failure handling. No merge. |
| `NEEDS_MORE_EVIDENCE` | One or more criteria are indeterminate — a referenced artefact/flow is missing. | Surfaced; capture the missing evidence and re-evaluate. No merge. |
| `NEEDS_USER_DECISION` | Either the **governance-path pre-filter fired** (the diff touches a governance-sensitive path — see [Governance-path pre-filter](#governance-path-pre-filter-evaluated-first-before-any-criterion)), **or** a criterion needs human judgment (e.g. an ambiguous visual outcome). | Surfaced to the user for a decision. No merge. |

`WOULD_AUTOMERGE` names a **future** capability. The word "automerge" describes what an
autonomous system *would* do once real wiring exists and is separately approved; it is
**not** an instruction to merge now.

---

## Dry-run classification examples

These illustrate the verdict the gate *would* emit (dry-run signal only — no merge happens in
any case). They show how the governance-path pre-filter interacts with the all-or-nothing
roll-up:

1. **#1275-style self-governance docs change → `NEEDS_USER_DECISION`.** A docs-only PR that edits
   `.claude/autopilot/**` (e.g. this gate doc or the DoD templates) — or a file under the separate
   `.claude/product-truth/**` entry. The governance-path pre-filter fires on the first governance
   path matched, so the gate emits
   `NEEDS_USER_DECISION` **even though the diff is docs-only and every DoD criterion would
   pass**. `WOULD_AUTOMERGE` is unreachable for this PR.

2. **#1267-style test-only NON-governance PR → `WOULD_AUTOMERGE`.** A PR that only adds / updates
   `e2e/**` or `**/*.spec.*` for product behaviour and touches **no** governance path. The
   pre-filter does not fire; the all-or-nothing roll-up runs; if every applicable DoD criterion is
   PASS, the gate emits the `WOULD_AUTOMERGE` dry-run signal (and the run still halts for explicit
   user approval per CLAUDE.md §10).

3. **#1272-style buyer-facing product code change without required buyer-journey evidence →
   `NEEDS_MORE_EVIDENCE`.** A PR that changes `src/**` product code but whose evidence packet is
   missing a required buyer-journey artefact. The pre-filter does not fire (no governance path); the
   roll-up finds an INDETERMINATE criterion, so the gate emits `NEEDS_MORE_EVIDENCE` — not
   `WOULD_AUTOMERGE`.

---

## Evaluated checks (category-driven)

The criteria the gate evaluates are selected by the issue's **category** (from
`definition-of-done.toml` → `category` / `categories`; see its `[category_product_truth_map]`).
Depending on the category, the gate evaluates — **where relevant** — the following checks
against the captured evidence and the referenced product-truth document(s):

- **Product truth satisfied** — every applicable DoD criterion maps to PASS evidence
  against its `truth_anchor` in the mapped product-truth file
  (`.claude/product-truth/discover.md` and/or `.claude/product-truth/listing-lifecycle.md`).
- **Buyer journey preserved** (`buyer_discover`) — `discover.md` journeys (area-first /
  school-first / contextual search / anon+auth marker visibility) hold.
- **Owner/broker submission journey preserved** (`owner_submission` / `broker_submission`) —
  `listing-lifecycle.md → owner_broker_submission`: submissions start non-public; required
  fields validated; both owner and broker submissions follow the same lifecycle.
- **Admin moderation journey preserved** (`admin_moderation`) — `listing-lifecycle.md →
  admin_moderation`: approve → `LIVE`, reject → `REJECTED` (reason required), no leakage of
  rejection reasons / internal notes.
- **Listing visibility rules preserved** (`listing_visibility`) — `listing-lifecycle.md →
  search_display_truth`: only `LIVE` is public, applied consistently across results,
  markers, badges/counts, and cards.
- **No unapproved listing appears in public search** — a draft / pending / rejected /
  archived / deleted listing must be absent from all public results (validated via the
  lifecycle-state evidence in `evidence-packet.toml`).
- **No private/auth-only listing fields leak into public results or markers** — rejection
  reasons, internal moderation notes, and owner/broker PII must not appear in any public
  card, marker, or count.

> **Adding supply-side checks does not change the dry-run-only nature of the gate; all
> checks are inputs to the same WOULD_AUTOMERGE dry-run signal and never trigger a real
> merge.**

These category-driven checks are **evaluation criteria only**. They feed the **same single
dry-run `WOULD_AUTOMERGE` verdict** described above — they add **no** new verdict, **no** new
merge authority, **no** new side effects, and they do **not** weaken or bypass any guardrail
(`dry_run = true`, `autopilot_merge = false`, `dod_check.dry_run_mode = true`, no
`merge_action` field, the comparison table, and the CLAUDE.md §10 user-approval gate all
remain in force). A check failing simply yields `DOD_NOT_MET` / `NEEDS_MORE_EVIDENCE` /
`NEEDS_USER_DECISION` per the all-or-nothing roll-up; no check can produce a merge.

---

## Placement in the Mode-3 phase chain

Per the phase index in `.claude/commands/mode3-run.md` (Phase index 0.1 → 12; Phases 8–12
cover PR / PR_REVIEW / merge / closeout), the gate slots as **Phase 9B**, between the
`PR_REVIEW` verdict (Phase 9) and the mandatory user-approval halt:

```
Phase 8    PR creation (gh pr create)
Phase 9    PR_REVIEW → APPROVED_TO_MERGE surfaced to user
Phase 9B   AUTOPILOT_DOD_REVIEW (NEW, dry-run)
           inputs: definition-of-done.toml + evidence-packet.toml + 7A/7B/7C artefacts
           output: dod-review-verdict.toml at .claude/handoffs/issue-<N>/
           emits WOULD_AUTOMERGE or a negative/indeterminate verdict — NEVER merges
Phase 9C   User explicit merge-approval halt (UNCHANGED — CLAUDE.md §10)
Phase 10   gh pr merge (user-approved ONLY, UNCHANGED)
```

**Rationale:** the gate needs the full evidence chain — both the code-quality gate
(`PR_REVIEW`) and the product-quality evidence (Phase 7A/7B/7C) — before it can judge DoD
completeness. Running it after Phase 9 and before the user-approval halt means the user
sees the DoD verdict **alongside** the merge prompt, with no change to the existing
release-command safeguard.

---

## Dry-run-only behaviour and safety

- The gate emits a **verdict only**. It performs **no merge, no PR-state update, and no
  side effects**.
- Both templates carry the dry-run guards: `evidence-packet.toml` sets `dry_run = true`;
  `definition-of-done.toml` sets `autopilot_merge = false`. The verdict object sets
  `dod_check.dry_run_mode = true`.
- When `WOULD_AUTOMERGE` is emitted, the surfacing message **MUST** contain the literal
  string **`DRY RUN — no merge has been or will be executed`** and the run then halts for
  explicit user approval, exactly as it does for `APPROVED_TO_MERGE` today.

### `WOULD_AUTOMERGE` vs `PR_REVIEW: APPROVED_TO_MERGE`

| | `AUTOPILOT_DOD_REVIEW: WOULD_AUTOMERGE` | `PR_REVIEW: APPROVED_TO_MERGE` |
|---|---|---|
| What it asserts | DoD criteria met by captured evidence (dry-run signal) | PR is **eligible** for merge (code review passed) |
| Authorizes `gh pr merge`? | **No** | **No** |
| Performs a merge? | **No** (no wiring; dry-run only) | **No** |
| Requires explicit user approval before merge? | **Yes** (CLAUDE.md §10) | **Yes** (CLAUDE.md §10) |
| Side effects | **None** | None (verdict only) |

### PR_REVIEW approval is NOT merge approval (CLAUDE.md §10)

A gate verdict — `PR_REVIEW: APPROVED_TO_MERGE` **or** `AUTOPILOT_DOD_REVIEW:
WOULD_AUTOMERGE` — means the gate evaluated the PR and found it eligible / DoD-satisfied.
It is **not** authorization to run a release command. Per CLAUDE.md §10, no agent on any
model may execute `gh pr merge` (or any equivalent) without an explicit user message in the
current session approving that specific action. The workflow STOPS and asks the user before
any merge.

---

## Future-wiring appendix (OUT OF SCOPE)

The following describes what real enforcement *would* require. **None of it is implemented
or changed in this change** — it is documented here only so a future, separately-approved
issue has a starting point:

- Register the gate in `openai_gate.py`: add `AUTOPILOT_DOD_REVIEW` to the gate-name enum
  in the verdict schema, add its verdict enum to `PER_GATE_ENUMS`, and add `dod_check` +
  `self_critic` to `GATE_STRUCTURED_FIELDS`.
- Add a hard schema assertion that `dod_check.dry_run_mode` exists (and, while dry-run is
  in force, that it is `true`).
- Optionally extend `verify-mode3-workdone.py` to confirm the evidence-packet references
  exist before the gate runs.
- Any move from dry-run to a real `automerge` capability must be its **own** issue, must
  rename/relabel the verdict to remove the dry-run framing, must update every doc here, and
  must preserve the CLAUDE.md §10 user-approval gate. There is **no silent upgrade** from
  dry-run to real merge.

`openai_gate.py` and `verify-mode3-workdone.py` remain **untouched** by this change.
