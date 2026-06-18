# Mode-3 contract — PLAN_REVIEW + handoff build

> Loaded at Phase 1 (PLAN_REVIEW) and Phase 2 (handoff build). The plan under review is authored by the Team Lead (`team-lead.md` Phase 0.7), not the Main Agent. Semantics unchanged from the original `mode3-run.md`.

## OpenAI eval-checklist mechanism (native, with transcription fallback)

The `eval_checklist` is the acceptance contract the Team Lead must later satisfy item-by-item.

**Native emission (preferred, #1221 shipped).** `openai_gate.py` now sends a per-gate STRICT schema (`_build_gate_schema(gate)`) that requires OpenAI to emit native structured objects: PLAN_REVIEW returns `eval_checklist`, `required_evidence`, `self_critic`, and `bug_repro_check` (nullable — `null` for non-bugs). The capped objects are persisted to `.claude/openai-gates/issue-<N>/<ts>-PLAN_REVIEW/verdict-structured.json` (full untruncated copy in `raw-response.txt`). When `verdict-structured.json` is present, the Main Agent **copies the native `eval_checklist.items` and `required_evidence.must_provide` verbatim** into the `[eval_checklist]` and `[required_evidence]` sections of `approved-execution-handoff.toml`, and records the native `self_critic`.

**Transcription fallback (only when reading OLDER artifacts).** Because PLAN_REVIEW is an extended gate, a current gate run always emits the native objects — strict validation rejects a base-9-only response. The transcription fallback therefore applies only when the Main Agent reads an **older, pre-#1221 stored verdict** that has no `verdict-structured.json`: it then **derives the eval_checklist by verbatim transcription** of OpenAI's `required_changes` + `approved_scope` + `blocking_issues`. This is mechanical transcription, NOT Main-Agent authorship of new criteria. When `self_critic` is unavailable in such an older artifact, it is recorded as `derived = false` and left empty rather than fabricated.

Either path is verbatim copying of OpenAI's own output — never Main-Agent-invented criteria.

### Schema mechanics + backward compatibility (#1221)

`_build_gate_schema(gate)` (strict) requires every structured object for the gate; nullable objects (`bug_repro_check`) carry a `null` type so a non-applicable object is emitted as `null`, not omitted. **The strict schema is used both for the OpenAI call AND for local re-validation (`_validate_verdict`)** — so once #1221 is active, **extended gates (PLAN_REVIEW / WORKDONE_REVIEW / PR_REVIEW) require their structured fields and a base-9-only response fails closed.** The 9 base fields are unchanged and always required. `self_critic` carries only structured findings (a `PASS/WARN/FAIL consistency_check`, short string lists, a `LOW/MED/HIGH decision_risk`) — never hidden chain-of-thought. List sizes are capped on persistence.

**Backward compatibility lives at the artifact/consumer level, not by relaxing the live gate contract:**
- Existing stored verdicts and older gate artifacts remain readable.
- Unextended gates (SCOPE_CHANGE_REVIEW) continue to accept base-9-only responses.
- Extended gates require the new (nullable-where-appropriate) structured fields once #1221 is active.
- Consumers prefer native structured fields when present and fall back to transcription only when reading older artifacts that lack them. (`_build_gate_schema(..., require_structured=False)` exists solely to re-validate those older base-9 artifacts.)

---

## Phase 1 — PLAN_REVIEW (Main Agent submits the Team Lead's plan)

1. Confirm `team-lead-plan.toml` exists (and, for bugs, `bug-repro-report.toml` with an acceptable status). If absent → halt; the Team Lead has not completed planning.
2. The Main Agent assembles the PLAN_REVIEW packet at `.claude/handoffs/issue-<N>/001-plan-review-request.toml` **from `team-lead-plan.toml`** (it transcribes the Team Lead's plan + bug-repro evidence into the gate schema; it does NOT substitute its own plan). For bugs, include the `[bug_repro_check]` inputs (reproduction status + evidence).
3. Invoke `python3 .claude/scripts/openai_gate.py --issue <N> --gate PLAN_REVIEW --input .claude/handoffs/issue-<N>/001-plan-review-request.toml`.
4. **OpenAI PLAN_REVIEW must return an acceptance contract, not just approve/reject.** The intended structured output (see `### OpenAI gate output dependency` for the current transcription mechanism) is:

   ```toml
   gate = "OPENAI_PLAN_REVIEW"
   decision = "APPROVED_FOR_IMPLEMENTATION"   # or NEEDS_REVISION | BLOCKED
   [scope]
   allowed_changes = []
   forbidden_changes = []
   [required_evidence]
   must_provide = []
   [eval_checklist]
   items = []                 # the acceptance items the Team Lead must later satisfy
   [bug_repro_check]          # bugs only
   reproduction_status = "REPRODUCED"
   repro_evidence_sufficient = true
   speculative_fix_detected = false
   root_cause_supported_by_evidence = true
   [self_critic]
   review_consistency = "PASS"
   possible_blind_spots = []
   assumptions_made = []
   evidence_that_would_change_decision = []
   decision_risk = "LOW"
   ```

   `self_critic` is a short structured summary — NOT hidden chain-of-thought. Do not request the model's private reasoning; only structured findings, decision, risks, and a brief self-critique.
5. On `verdict = APPROVED`, materialise the approved plan to `.claude/handoffs/issue-<N>/approved-plan.toml` and to `.claude/state/current-approved-plan.toml`. The approved-plan content is the Team Lead's plan as approved.
6. On `verdict = REVISION_REQUIRED`, halt and surface revisions to the user. **Revisions route back to the Team Lead/specialists** — the Main Agent must NOT invent the implementation mechanism to satisfy OpenAI feedback.

### Validation-level check (part of PLAN_REVIEW)

PLAN_REVIEW MUST validate the `[validation_matrix].level` proposed in `team-lead-plan.toml`. The Team Lead MAY over-classify (a higher level than necessary is allowed; advisory only) but MUST NOT under-classify. PLAN_REVIEW blocks or requires revision on an unsafe downgrade — e.g. an auth change marked `NOT_REQUIRED` → BLOCKED; an OpenSearch/Kafka/indexing change marked `COMPACT` → BLOCKED or REVISION_REQUIRED; a workflow/validator change marked `NOT_REQUIRED` → BLOCKED. A docs typo marked `FULL` is allowed (advisory: may be overkill). Hard-trigger categories and the full decision table live in `.claude/mode3/contracts/validation-matrix.md`.

---

## Phase 2 — Build `approved-execution-handoff.toml` (boundary only)

This phase writes the **boundary** the Orchestrator must operate within. It does NOT write the exact specialist sequence — that is the Orchestrator's decision (Option C, Hybrid; see `.claude/hardening/mode3-routing-authority-design-validation.md`).

1. Compute `sha256(.claude/handoffs/issue-<N>/approved-plan.toml)`.
2. Set `risk_tier` from the approved plan (`trivial | normal | high-risk | doc-only`).
3. Set `issue_type` from the approved plan (`bugfix | small-change | feature | refactor | perf | security | incident | ui`).
4. Derive `executor.allowed_file_globs` from approved plan `files.likely_change`.
5. Derive `executor.forbidden_globs` from approved plan `forbidden`.
6. Build `[executor.specialist_policy]` (replaces exact `allowed_specialists`):
   - `category_allowlist`: broad categories permitted by the approved plan — typically `engineers = [frontend-engineer, backend-engineer, supabase-engineer]`, `reviewers = [code-reviewer, security-reviewer]`, `qa = [qa-fast, qa]`, plus `architect` / `ui-designer` if the plan routing mentions them.
   - `mandatory_gates`: specialists the Orchestrator MUST invoke (e.g. `["qa-fast", "code-reviewer", "qa-verification"]` for Normal; add `"security-reviewer"` for Gate F triggers; the full High-risk minimum from `ROUTE_AND_RUN.md:64` if risk_tier == high-risk).
   - `conditional_gates`: specialists with triggers (e.g. `[{name = "ui-designer", trigger = "ui_design_gate"}, {name = "architect", trigger = "architecture_gate"}, {name = "qa-e2e-authoring", trigger = "qa-fast recommends YES"}]`).
   - `always_forbidden`: non-Route-and-Run agent types (e.g. `["general-purpose", "Plan", "Explore"]`).
   - `skip_authority`: verbatim Route-and-Run citations for when a `mandatory_gate` may be skipped (e.g. `"qa-fast: only via Lean-mode at ROUTE_AND_RUN.md:357-369 if ALL skip conditions hold; code-reviewer: only at ROUTE_AND_RUN.md:472 if risk=low+single-file+no-logic"`).
7. Set `executor.model = "opus"` (the orchestrator/executor teammate MUST run on Opus, never Sonnet). Specialists keep their own configured models — do NOT set a model for them here.
8. Set authority block all false (`openai_gates`, `chatgpt_contact`, `pr_creation`, `merge`, `scope_change`).
9. Copy `qa_requirements` from approved plan (unit_tests_required, e2e_tests_required, justifications if NOT_REQUIRED).
10. Record `indexing.index_command`, `indexing.index_result_summary`, `indexing.indexed_at` from Phase 0.1.
11. Set `contract.must_write = [".claude/handoffs/issue-<N>/team-lead-execution-log.md", "<workdone-candidate.toml OR blocked.toml>"]`.
12. Set `contract.must_not_touch = ["**/.env*", "**/secrets/**", ...forbidden_globs]`.
13. Set `limits.max_specialist_invocations = 12` and `limits.max_minutes = 45` (overridable from plan).
14. Set `[escalation_rules]`: what the Orchestrator does on (a) Gate F discovered after start (ADD security-reviewer; do NOT halt unless re-routing impossible), (b) scope expansion needed (`blocked.toml(SCOPE_EXPANSION_REQUIRED)`), (c) Lean-mode skip eligible (orchestrator MAY skip if all conditions hold AND logs the four AC26 fields).
15. **Transcribe the OpenAI PLAN_REVIEW acceptance contract** into the handoff: copy the `[eval_checklist].items`, `[required_evidence].must_provide`, and `[scope].allowed_changes`/`forbidden_changes` verbatim from the PLAN_REVIEW verdict (or, under the current transcription mechanism, from the verdict's `required_changes` + `approved_scope` + `blocking_issues`). The Team Lead executes against `[eval_checklist]` and self-checks against it before workdone. Do NOT add Main-Agent-invented criteria.
16. **Carry the validation level forward.** Copy the `[validation_matrix]` block (the PLAN_REVIEW-approved `level` + `reason` + `required_artifact`) from `team-lead-plan.toml`/the PLAN_REVIEW verdict into `approved-execution-handoff.toml` verbatim, so WORKDONE_REVIEW and PR_REVIEW can enforce the matrix. See `.claude/mode3/contracts/validation-matrix.md`.

Template: `.claude/templates/approved-execution-handoff.toml`.
