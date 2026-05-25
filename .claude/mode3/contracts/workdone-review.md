# Mode-3 contract — terminal artefact + WORKDONE_REVIEW

> Loaded at Phase 6 (wait for terminal artefact) and Phase 7C (WORKDONE_REVIEW). WORKDONE_REVIEW runs AFTER Phase 7A/7B browser validation (`.claude/mode3/contracts/browser-validation.md`). Semantics unchanged from the original `mode3-run.md`.

## Phase 6 — Wait for terminal artefact

Lead polls `.claude/handoffs/issue-<N>/` for one of:
- `workdone-candidate.toml` (success path) → continue to Phase 7A (browser validation runs before WORKDONE_REVIEW).
- `blocked.toml` (failure / safe halt) → **WORKDONE_REVIEW is NOT invoked** regardless of reason_code (a blocked run has no workdone-candidate to review). Lead's response depends on the code:
  - `RATE_LIMITED`, `TIMEBOX_EXCEEDED`, `TOOL_UNAVAILABLE`, `AGENT_TEAMS_UNAVAILABLE`, `REVIEW_FAILED`, `SECURITY_FAILED`, `REROUTE_LIMIT_EXCEEDED`, `INDEX_UNAVAILABLE`, `INDEX_STALE` → report to user; halt.
  - `OUT_OF_SCOPE`, `SCOPE_EXPANSION_REQUIRED` → these are typically prompt-injection or scope-drift halts. Route via SCOPE_CHANGE_REVIEW path; do NOT proceed to WORKDONE_REVIEW until scope is re-approved.
  - `AMBIGUOUS_PLAN`, `SPECIALIST_NOT_ALLOWED`, `SPECIALIST_FAILURE`, `QA_FAILED`, `E2E_FAILED`, `CONFLICTING_EVIDENCE`, `UNKNOWN` → triage and route back to Planner / user.

If after the Orchestrator's `idle_notification` arrives neither file exists → incomplete execution. Report to user with the contents of `team-lead-execution-log.md` and stop.

If BOTH files exist → `CONFLICTING_EVIDENCE`; stop.

---

## Phase 7C — WORKDONE_REVIEW (Main Agent / lead)

Runs **after** Phase 7A (and 7B if triggered) have PASSed. WORKDONE_REVIEW is the final gate before PR creation, and it reviews the browser-validated result — not a pre-validation candidate.

1. **Two sha256 checks for the integrity chain:**
   - (a) `sha256(approved-execution-handoff.toml on disk) == workdone-candidate.toml.handoff_sha256` — confirms the Orchestrator wrote the candidate against the same handoff the lead authored. On mismatch → stop.
   - (b) `sha256(approved-plan.toml on disk) == approved-execution-handoff.toml.plan.approved_plan_sha256` — confirms the handoff itself was authored against the approved plan. On mismatch → stop.

   `workdone-candidate.toml.handoff_sha256` is the **handoff** digest (as defined in the workdone-candidate template comments), not the approved-plan digest. The approved-plan integrity is anchored by the handoff (step b), not directly by the candidate.
2. **Routing-decision-log verification (NEW per #1098):**
   - Read `.claude/handoffs/issue-<N>/team-lead-execution-log.md` and locate the ROUTING DECISION entry (one per run, phase: routing).
   - Verify the entry's timestamp precedes the timestamp of the first specialist-call entry. If a specialist call precedes the routing-decision entry → halt; do NOT invoke WORKDONE_REVIEW.
   - Verify `selected_sequence` contains all `[executor.specialist_policy].mandatory_gates` from the handoff. Any missing mandatory gate → halt.
   - Verify every entry in `skipped` has all four AC26 fields: `specialist_skipped`, `reason`, `rule_citation`, `replacement_evidence`. Any missing field → halt.
   - Verify every specialist named in `selected_sequence` is in `category_allowlist` OR a triggered `conditional_gates` entry. Any unlisted specialist → halt.
   - Verify the `[routing_decision_log]` section of `workdone-candidate.toml` summarises the same sequence + skip justifications + rule citations as the log entry. Mismatch → halt.
3. Run authoritative scope-lock: `git diff --name-status origin/main...HEAD`. Any A/M/D/R path (or rename source/target) outside `executor.allowed_file_globs` blocks WORKDONE_REVIEW unless scope expansion is explicitly approved by the user. Orchestrator's `scope_lock_self_check` is advisory; lead's is authoritative.
4. Independently verify QA/E2E evidence files exist and contain PASS or justified NOT_REQUIRED. Re-run tests locally if the approved plan requires it.
5. **Confirm Phase 7A (and 7B if triggered) PASSed.** Read `product-verification.toml` (and `product-sweep.toml` if present). If 7A is not PASS, or 7B is BLOCKING_REGRESSION, do NOT invoke WORKDONE_REVIEW — the run should already have rerouted/halted upstream.
6. **Verify the eval-checklist satisfaction matrix.** Read `workdone-candidate.toml` `[eval_checklist_result]` (and `[bug_eval_checklist_result]` for bugs). Confirm it covers every `[eval_checklist].items` entry from `approved-execution-handoff.toml`. Any item not marked `PASS` (i.e. `FAIL`/`BLOCKED`/missing) → halt; do NOT invoke WORKDONE_REVIEW. The Team Lead must not hand back work with an unsatisfied eval-checklist item presented as done.
7. Assemble `.claude/handoffs/issue-<N>/workdone-review-request.toml` per the standard schema, including: **original issue, approved Team Lead plan ref, the OpenAI PLAN_REVIEW `[eval_checklist]`, the Team Lead `[eval_checklist_result]` satisfaction matrix, Phase 7A evidence (`product-verification.toml`), Phase 7B evidence if run (`product-sweep.toml`), diff summary, deviations/risks**, scope-lock table, AC mapping, reviewer verdicts, test evidence, runtime-probe block, and **routing_decision_log_summary**.
8. Invoke `python3 .claude/scripts/openai_gate.py --issue <N> --gate WORKDONE_REVIEW --input .claude/handoffs/issue-<N>/workdone-review-request.toml`. **OpenAI WORKDONE_REVIEW compares actual work against: the original issue, the approved Team Lead plan, OpenAI's own PLAN_REVIEW eval_checklist, the Team Lead checklist satisfaction matrix, the Phase 7A (+7B) browser evidence, the diff summary, and the deviations/risks.** Intended structured output (transcription mechanism applies until the gate schema is extended — see `.claude/mode3/contracts/plan-review.md` → `### OpenAI gate output dependency`):

   ```toml
   gate = "OPENAI_WORKDONE_REVIEW"
   decision = "APPROVED_FOR_PR"   # or NEEDS_FIXES | BLOCKED
   [contract_check]
   approved_plan_followed = true
   eval_checklist_satisfied = true
   scope_creep_detected = false
   [evidence_check]
   build_evidence_ok = true
   test_evidence_ok = true
   browser_evidence_ok = true
   [self_critic]
   possible_blind_spots = []
   evidence_that_would_change_decision = []
   decision_risk = "LOW"
   final_consistency_check = "PASS"
   ```

   No hidden chain-of-thought is requested — structured findings, decision, risks, and a short self-critique only.
9. On APPROVED_FOR_PR → **Phase 8 (PR create/update)**. On NEEDS_FIXES → reroute per Route-and-Run reroute loop (2-cycle limit per inner specialist; this is an OUTER gate, halt to user; the inner counter does not consume). **NEEDS_FIXES routes the concrete mechanism back to the Team Lead/specialists — the Main Agent does not author the fix.** A fix after WORKDONE_REVIEW re-enters Phase 7A (browser re-validation) before a re-submitted WORKDONE_REVIEW.
