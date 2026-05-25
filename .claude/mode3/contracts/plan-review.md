# Mode-3 contract — PLAN_REVIEW + handoff build

> Loaded at Phase 1 (PLAN_REVIEW) and Phase 2 (handoff build). The plan under review is authored by the Team Lead (`team-lead.md` Phase 0.7), not the Main Agent. Semantics unchanged from the original `mode3-run.md`.

## OpenAI eval-checklist mechanism (current vs intended)

The `eval_checklist` is the acceptance contract the Team Lead must later satisfy item-by-item. Today `openai_gate.py` returns a fixed 9-field verdict (`additionalProperties: False`), so OpenAI cannot emit a native `[eval_checklist]`/`[self_critic]` block. Until the gate schema is extended (tracked follow-up #1221 — see `### OpenAI gate output dependency`), the Main Agent **derives the eval_checklist by verbatim transcription** of OpenAI's `required_changes` + `approved_scope` + `blocking_issues` into the `[eval_checklist]` and `[required_evidence]` sections of `approved-execution-handoff.toml`. This is mechanical transcription, NOT Main-Agent authorship of new criteria. The `self_critic` summary, when the gate cannot emit it, is recorded as `derived = false` and left empty rather than fabricated.

### OpenAI gate output dependency (follow-up, out of scope here)

To make `eval_checklist`, `self_critic` (PLAN_REVIEW) and `contract_check`, `self_critic` (WORKDONE_REVIEW) native gate outputs, `openai_gate.py`'s `VERDICT_SCHEMA` must gain optional structured objects and the gate prompt must request them (without requesting hidden chain-of-thought — only structured findings, decision, risks, and a short self-critique). This is a separate, tested code change (tracked in #1221) and is **not** performed by the docs-only workflow update. Until then, use the transcription mechanism above.

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
7. Set `executor.model = "sonnet"` (MVP default; first 3 dry-runs).
8. Set authority block all false (`openai_gates`, `chatgpt_contact`, `pr_creation`, `merge`, `scope_change`).
9. Copy `qa_requirements` from approved plan (unit_tests_required, e2e_tests_required, justifications if NOT_REQUIRED).
10. Record `indexing.index_command`, `indexing.index_result_summary`, `indexing.indexed_at` from Phase 0.1.
11. Set `contract.must_write = [".claude/handoffs/issue-<N>/team-lead-execution-log.md", "<workdone-candidate.toml OR blocked.toml>"]`.
12. Set `contract.must_not_touch = ["**/.env*", "**/secrets/**", ...forbidden_globs]`.
13. Set `limits.max_specialist_invocations = 12` and `limits.max_minutes = 45` (overridable from plan).
14. Set `[escalation_rules]`: what the Orchestrator does on (a) Gate F discovered after start (ADD security-reviewer; do NOT halt unless re-routing impossible), (b) scope expansion needed (`blocked.toml(SCOPE_EXPANSION_REQUIRED)`), (c) Lean-mode skip eligible (orchestrator MAY skip if all conditions hold AND logs the four AC26 fields).
15. **Transcribe the OpenAI PLAN_REVIEW acceptance contract** into the handoff: copy the `[eval_checklist].items`, `[required_evidence].must_provide`, and `[scope].allowed_changes`/`forbidden_changes` verbatim from the PLAN_REVIEW verdict (or, under the current transcription mechanism, from the verdict's `required_changes` + `approved_scope` + `blocking_issues`). The Team Lead executes against `[eval_checklist]` and self-checks against it before workdone. Do NOT add Main-Agent-invented criteria.

Template: `.claude/templates/approved-execution-handoff.toml`.
