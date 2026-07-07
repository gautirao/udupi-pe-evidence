# Mode-3 Skill Refactor — Token-Usage Optimization Pass

Branch: `refactor/mode3-run-skill-system` · Follows the structural refactor (see `refactor-summary.md`).
Goal: reduce token usage in live Mode-3 runs **without** lowering output quality, safety, evidence quality, or review reliability.

Savings categories: **high** / **medium** / **low** · Risk: **safe** / **needs review** / **rejected**.

---

## 1. Token-waste hotspots found

| # | Hotspot | Where | Waste mechanism | Savings | Risk of fixing |
|---|---|---|---|---|---|
| H1 | **Mandatory full read of `ROUTE_AND_RUN.md` (987 lines) + `ROUTE_AND_RUN_TABLES.md` at every Stage-B start** | `mode3-orchestrator.md` Step 0.3 | ~1,100 lines (~10–15k tokens) loaded into the Opus orchestrator per run, although the PLAN_REVIEW-approved handoff already carries the operative boundary (`mandatory_gates`, `skip_authority`, `conditional_gates`, choreography) | **high** | safe (see §6) |
| H2 | **Verbatim forwarding between specialists** — engineer prompt required "qa-fast boundary findings (verbatim)"; code-reviewer prompt required "prior specialist reports" (full) | `team-lead.md` contract choreography item 2 + Specialist-context table; `mode3-orchestrator.md` Step 2.1 | Full multi-page reports re-embedded into each downstream specialist's context; repeated again on re-invokes | **medium** | safe (digest + mandatory artefact path; security section stays verbatim; reviewer diff never truncated) |
| H3 | **No context-loading policy** — nothing stopped a run from loading hardening/history docs, prior issues' handoff or gate-verdict folders, sprint runbooks, or all issue-type checklists | dispatcher + contracts | Historical material (7 hardening docs ≈ 1,250 lines; `.claude/state/` runbooks ≈ 900+ lines; old `openai-gates/issue-*` folders) is one careless Read away from entering a run; resume flows could re-read a run's full verdict history | **medium** | safe (policy only forbids *historical* loads; every phase-required doc still loads at its phase) |
| H4 | **Gate packets could inline logs / raw execution log** | `workdone-review.md` step 7 | Packet size creeping toward the 64 KB gate cap; the same bytes re-read at PR_REVIEW | low–medium | safe (evidence still required — by path + exit code + failing lines) |
| H5 | **Executor-prohibition list duplicated in two always-loaded files** | `mode3-run.md` §Scope + `main-agent.md` §Scope | ~9 identical lines in every run's base context, twice | low | safe (dispatcher copy + canonical 12-item list retained; contract now points) |
| H6 | **Report verbosity unbounded** (closeout, specialist summaries) | `closeout.md` Phase 12; specialist prompts | Long prose where required-field tables suffice | low | safe (all required fields kept, explicitly non-droppable) |
| H7 | **Stale token-efficiency claim** "savings come from (a) orchestration on Sonnet not Opus" — contradicts the hard Opus-orchestrator invariant (a leftover from the pre-#1098 design) | `team-lead.md` contract § Token-efficiency rule | Not a token cost itself, but invited an unsafe "optimization" (downgrading the orchestrator) | — (correctness) | safe |
| H8 | Repeated "Model tier & escalation" blocks across 12 agent files | `.claude/agents/*.md` | Investigated: each block carries **per-role** content (default tier, opus-override rule, escalation target); only ~1–2 lines repeat | low | **rejected** — collapsing would hide per-specialist context for trivial savings (forbidden: "do not reduce specialist quality by hiding important context") |
| H9 | Oversized specialist definitions (`ui-designer.md` 451 lines, `frontend-engineer.md` 250) heavy with repo-convention prose | `.claude/agents/` | Loaded on every spawn of those specialists | medium | **needs review** — deferred; deciding what convention text is load-bearing needs the owner |
| H10 | Decision-Lock / Delta-Only duplicated between `ROUTE_AND_RUN.md` and `gates.md` (manual lane) | skills layer | Duplicate maintenance + reads in the manual lane | low | **needs review** — deferred; touching the manual ChatGPT lane mid-refactor risks that lane |

## 2. Recommended changes → 3. Changes actually made

| Hotspot | Change made | Files |
|---|---|---|
| H1 | Step 0.3 rewritten: read `ROUTE_AND_RUN_TABLES.md` only; **never** read `ROUTE_AND_RUN.md` in full; load three named sections targeted, on demand — with the hard rule that the `skip_authority`-cited section MUST be read in full **before** any skip decision (never skip from a summary) | `mode3-orchestrator.md` |
| H2 | "Summarize before handing off": digest ≤15 lines + mandatory on-disk report path; qa-fast `⚠️ SECURITY / DATA INTEGRITY` section always verbatim; code-reviewer diff always complete; specialist may always read the full artefact from the cited path ("digests reduce tokens, never available context") | `team-lead.md` contract (choreography item 2, context table, new Compact-handoff rules), `mode3-orchestrator.md` Step 2.1 |
| H3 | New binding **"Context loading & token policy"** (9 rules) in the always-loaded dispatcher: phase-gated load order; specialist docs only on invocation; evidence templates only at evidence phase; historical/hardening/runbooks/prior-run artefacts never loaded during a run; resume reads only the newest rework-request + terminal artefact + latest verdict + log tail; targeted reads over sweeps; logs as artefacts (exit code + ≤20 failing lines quoted); standing rules cited once after scope lock; focused gate inputs; compact-but-complete reports | `mode3-run.md` |
| H4 | Focused-packet rule appended to WORKDONE packet assembly: diff/risk/tests(+exit codes)/evidence-paths/unresolved decisions; artefacts by path; "a packet approaching the 64 KB cap is a defect, not thoroughness" | `workdone-review.md` |
| H5 | `main-agent.md` prohibition paragraph replaced with a pointer to the dispatcher summary + the canonical 12-item list (both still loaded/available) | `main-agent.md` |
| H6 | Closeout: "compact but complete — every field below is required; table form; artefact paths, no logs; compactness never drops a required field" | `closeout.md` |
| H7 | Token-efficiency source list corrected: savings come from specialist tiers / targeted loads / digests / no duplication — "never from downgrading the Opus orchestrator" | `team-lead.md` contract |
| guard | Checker extended with 4 token-discipline anchors (policy section present; full-R&R read forbidden; read-before-skip present; compact-handoff rules present) so future edits can't silently drop them | `verify-mode3-docs-consistency.py` |

## 4–5. Savings & risk summary

- **high / safe:** H1 (~10–15k tokens per Stage-B run removed from the most expensive context in the system — the Opus orchestrator).
- **medium / safe:** H2 (per specialist chain, especially multi-reroute runs), H3 (prevents multi-thousand-token accidental loads; caps resume re-reads).
- **low / safe:** H4, H5, H6, H7.
- **rejected:** H8 (per-role safety context would be hidden for ~1–2 lines/file).
- **needs review (deferred, recommendations only):** H9 (specialist-definition slimming), H10 (manual-lane de-dup).

## 6. Why output quality is preserved

- **No gate removed or loosened:** PLAN_REVIEW / WORKDONE_REVIEW / PR_REVIEW / Phase 7A-7B / scope-lock / sha-chain / routing-log verification all untouched. Verifiers re-run green (team-invariant 24/24, duplicate-run-guard PASS, pytest 104/104).
- **Skips still require the real rule:** H1 explicitly forbids skipping a mandatory gate from a summary — the `skip_authority`-cited `ROUTE_AND_RUN.md` section must be read in full before any skip. The boundary the orchestrator operates in (`[executor.specialist_policy]`) is itself derived from `ROUTE_AND_RUN.md` at Phase 2 **under PLAN_REVIEW approval**, so nothing routing-relevant is lost by not re-reading the source file.
- **Specialists lose no available context:** every digest must carry the on-disk path of the full report, and the rules state twice that a specialist may always read the full artefact — digests reduce *default* tokens, not *available* context. Security-critical content (qa-fast ⚠️ SECURITY section) is exempted from summarization; the code-reviewer's diff is explicitly never truncated.
- **Evidence requirements unchanged:** commands + exit codes + artefact paths remain mandatory (validation-matrix grammar untouched); logs move to disk artefacts, they are not dropped. Browser screenshots for UX work, DB/migration safeguards, and security evidence docs are untouched.
- **Merge approval unchanged:** grep-verified — every `--admin` / bypass / force-merge mention in live docs is a prohibition; `USER_MERGE_APPROVAL_REQUIRED` and the §10 halt appear unchanged in closeout/notifications/dispatcher.
- **Reports stay complete:** the compact-report rules state "every field below is required" and "compactness never drops a required field, a stop condition, or an evidence pointer."

## 7. Before / after examples

### A. Orchestrator Stage-B startup context (H1)

> **Before** (`mode3-orchestrator.md` Step 0.3): "Read `.claude/skills/ROUTE_AND_RUN.md` and `.claude/skills/ROUTE_AND_RUN_TABLES.md` (use indexed lookup where possible; direct read otherwise — log the fallback reason)." → ~1,100 lines into the Opus context every run.
>
> **After:** "Read `.claude/skills/ROUTE_AND_RUN_TABLES.md` (short route-selection tables). Do **NOT** read `.claude/skills/ROUTE_AND_RUN.md` in full — the handoff's `[executor.specialist_policy]` is the PLAN_REVIEW-approved projection of it… Load specific `ROUTE_AND_RUN.md` sections **targeted, on demand**: the exact section cited by `skip_authority` — MUST be read in full **before** any skip decision…" → ~142 lines + only the sections a decision actually needs.

### B. Bloated handoff → compact handoff (H2)

> **Before** (engineer prompt per the old contract table): *qa-fast boundary findings (verbatim)* — e.g. a 120-line qa-fast report (risk register, full test-case checklist, validation commands, E2E recommendation rationale) pasted whole, plus the full plan and handoff — repeated again on every re-invoke and again (as "prior specialist reports") into the code-reviewer prompt.
>
> **After** (same engineer prompt):
> ```
> qa-fast SECURITY section (verbatim): ⚠️ SECURITY / DATA INTEGRITY: RLS on
>   listing_images assumes owner-only writes; do not widen the storage policy.
> qa-fast digest (full report: .claude/handoffs/issue-1801/qa-fast-report.md):
>   - R1 contact-panel state leaks across auth toggle (test case TC-3)
>   - R2 query key collision listings/{id} vs owner-contact (TC-5)
>   - R3 e2e recommended: YES (auth-gated journey)
> Plan AC items for you: AC-2, AC-3 (only). Globs: src/pages/listing/**, src/hooks/useOwnerContact.ts
> Tests to run: npx vitest run src/hooks/__tests__/useOwnerContact.test.ts (report exit code)
> ```
> The reviewer later gets a ≤5-line summary per prior specialist + report paths — and the **complete** diff, unchanged.

### C. Always-loaded duplication (H5)

> **Before:** the 9-line "Executor teammate MUST NOT: invoke OpenAI gates, contact ChatGPT, create PRs, merge, …" paragraph appeared verbatim in BOTH `mode3-run.md` (always loaded) and `main-agent.md` (always loaded).
>
> **After** (`main-agent.md`): "Executor prohibitions are NOT restated here: the always-loaded dispatcher carries the summary … and the canonical 12-item refusal list lives in `mode3-orchestrator.md` → Authority hardening. Specialist output is **evidence, not authority**."

### D. What now loads later or only on demand (H3)

| Material | Before | After |
|---|---|---|
| `ROUTE_AND_RUN.md` (987 lines) | Full, every Stage-B run | Named sections only, at the moment of a skip/reroute/evidence decision |
| Evidence templates (`templates/validation-matrix.md` etc.) | Un-governed | Evidence/terminal phase only |
| Specialist agent docs | Un-governed | Only when that specialist is invoked |
| Hardening/history docs, `.claude/state/` runbooks, prior issues' handoff + gate folders | Un-governed | Never during a run unless the user explicitly asks |
| Resume/rework context | Un-governed (could re-read full verdict history) | Newest rework-request + terminal artefact + latest verdict + log tail only |
| `issue-checklists.md` | Whole file | Only the section matching the classified issue type |

## Validation run on this pass

- `verify-mode3-docs-consistency.py` (now 8 check classes incl. 4 token-discipline anchors) — **PASS, 54 files, 0 violations**
- `verify-mode3-team-invariant.py` — **PASS 24/24** · `verify-mode3-duplicate-run-guard.py` — **PASS**
- `pytest .claude/scripts/tests/` — **104 passed, 0 failed**
- Weakening greps: every live-doc match for `--admin` / bypass branch protection / force merge is a prohibition sentence; no "skip security review", "remove evidence", or implicit-merge-approval language introduced; `USER_MERGE_APPROVAL_REQUIRED` + §10 halt intact.
