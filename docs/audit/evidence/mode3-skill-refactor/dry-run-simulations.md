# Mode-3 Skill Refactor — Dry-Run Simulations

Three simulated issue executions through the refactored system. **No commands were executed; no code, DB, or GitHub state was touched.** Each simulation shows the mode/skill invoked, the specialists that would run, the evidence required, where the run stops, and the final report shape — and calls out where the refactor changes the outcome vs the old docs.

---

## Simulation 1 — Backend/security issue

**Issue (hypothetical #1801):** "Anonymous users can fetch `/api/listings/{id}/owner-contact` — should require an authenticated session."

| Step | What happens under the refactored system |
|---|---|
| Invocation | `/mode3-run 1801` → mode3-run dispatcher |
| Phase 0.0–0.2 | Duplicate-run scan (no `issue-1801` worktree/branch/lock) → lock acquired with unique ports → index check → Opus `orchestrator` teammate spawned (`mode: "auto"`), sentinel probe round-trips through disk |
| Phase 0.6 | Main Agent classifies via `issue-checklists.md § 3 Security / privacy` + `§ 1 Backend/API` (union — spans types): `issue_type = security`, `risk_tier = high-risk`. Writes lightweight assignment (problem + acceptance intent only; no recipe) |
| Phase 0.7 | Team Lead investigates (explorer-planner + qa-fast with ⚠️ SECURITY section); authors `team-lead-plan.toml` with `[validation_matrix] level = "FULL"` (hard trigger: auth + public endpoint exposure — under-classification would be BLOCKED at PLAN_REVIEW) |
| Phase 1–2 | PLAN_REVIEW via `openai_gate.py` → `verdict = "APPROVED"` (correct enum — old docs said `decision = "APPROVED_FOR_IMPLEMENTATION"`, which the script never returns); handoff built with `mandatory_gates = [qa-fast, code-reviewer(opus), security-reviewer, qa-verification]` (High-risk minimum) |
| Phase 5 | Routing entry `## <ts> — [ROUTING DECISION]` written **before** the first specialist call (bracketed marker — pre-refactor a template-following log failed `verify-mode3-workdone.py` check 2). Sequence: qa-fast → backend-engineer → code-reviewer (opus) → security-reviewer → qa verification |
| Evidence required | Security evidence doc (threat, before/after, negative test: unauthenticated request → 401/403 with status code captured); `mvn test` and `mvn verify` as **separate rows** with exit codes; regression test named; FULL validation matrix incl. safety + failure-mode rows; no shared-Supabase mutation (Testcontainers only) |
| Phase 7A/7B | Skipped only if no user-visible route; here the contact panel is user-visible → 7A drives the journey anonymous vs authenticated, `[evidence_chain]` fully populated |
| Phase 7C | `verify-mode3-workdone.py` preflight (sha chain, routing log, scope-lock, eval-checklist) → WORKDONE_REVIEW → `APPROVED_FOR_PR` |
| Phase 8–9 | PR created; PR_REVIEW consumes the FULL matrix → `APPROVED_TO_MERGE` |
| **STOP** | **USER_MERGE_APPROVAL_REQUIRED.** Run halts with PR open. On approval: `gh pr merge <PR#> --squash` — **no `--admin`** (pre-refactor closeout.md instructed `--squash --admin`, i.e. a branch-protection bypass on every merge) |
| Final report | Phase-12 closeout: PR URL + merged sha, scope-lock table, FULL matrix verdict, security evidence pointer, lock disposition, ports, credentials-source confirmation, stale artefacts listed-not-touched |

**Refactor delta:** correct verdict enum keys the rework loop; `[ROUTING DECISION]` marker means preflight passes; merge no longer bypasses branch protection.

---

## Simulation 2 — Frontend/UX visual polish issue

**Issue (hypothetical #1802):** "Listing cards: price badge overlaps the photo carousel dots on mobile; align to the design reference."

| Step | What happens |
|---|---|
| Invocation | `/mode3-run 1802` (or `/quick` would be *rejected*? No — eligible: small UI, not high-risk; but the user asked for mode3, so mode3 runs) |
| Phase 0.6 | `issue-checklists.md § 2 Frontend/UX`: `issue_type = ui`, `risk_tier = normal` |
| Phase 0.7 | qa-fast risk scan; ui-designer NOT triggered (no redesign — polish only); plan proposes `[validation_matrix] level = "COMPACT"`; qa requirements: unit NOT_REQUIRED (justified — CSS-only), e2e NOT_REQUIRED (justified), **browser evidence mandatory** |
| Phase 1–2 | PLAN_REVIEW `verdict = "APPROVED"`; handoff `mandatory_gates = [qa-fast, code-reviewer, qa-verification]` |
| Phase 5 | `[ROUTING DECISION]` → qa-fast → frontend-engineer → code-reviewer → qa verification |
| Evidence required | Screenshots/trace at mobile viewport before + after; `[evidence_chain]` with exact URL (`http://localhost:5174/...`), spec/script path that exists (ls-verified), `.env.e2e` as the only credentials source; MANUAL_PASS vs AUTOMATED_PASS labelled separately (CLAUDE.md §11) |
| Phase 7A | **Mandatory** (user-visible). Product-check agent drives the exact card journey. **Type stop condition:** *visual parity not met → do not claim PASS* — a "close enough" render FAILs and reroutes (2-cycle limit) |
| Phase 7B | Trigger check: single component, narrow AC, <3 user-facing files → **skipped**, skip recorded in the packet |
| Phase 7C–9 | COMPACT matrix (AC table + not-proven table) → WORKDONE_REVIEW `APPROVED_FOR_PR` → PR → PR_REVIEW `APPROVED_TO_MERGE` |
| **STOP** | PR-ready halt for user merge approval; user does the manual spot-check as final acceptance |
| Final report | Closeout with screenshot artefact paths, COMPACT matrix, skip records (7B, unit/e2e NOT_REQUIRED justifications), untouched-stale-artefact statement |

**Refactor delta:** the frontend checklist makes screenshot evidence + visual-parity stop condition explicit at intake (previously implicit until Phase 7A); anti-fabrication `[evidence_chain]` unchanged but now cross-referenced from the checklist.

---

## Simulation 3 — Docs-only / data-pipeline planning issue

**Issue (hypothetical #1803):** "Write the design doc for the school-data ingestion pipeline (sources, dedupe strategy, refresh cadence). No implementation."

| Step | What happens |
|---|---|
| Invocation | `/mode3-run 1803` |
| Phase 0.6 | `issue-checklists.md § 5 Docs-only` + `§ 6 Data-ingestion` (planning doc *about* a pipeline): `issue_type = feature`(doc deliverable), `risk_tier = doc-only`. **Checklist guard:** a "docs" change touching `.claude/` workflow/gates would be *reclassified* — not applicable here (product design doc under `docs/`) |
| Phase 0.7 | Team Lead routes read-only investigation only: explorer-planner (existing ingestion code/HAR evidence), architect (pipeline shape options). **No implementation specialists.** Plan proposes `[validation_matrix] level = "FULL"` — the doc makes factual claims that must be traceable (claims/factual-traceability matrix is the FULL-template section built for exactly this) |
| Phase 1–2 | PLAN_REVIEW validates: doc-only scope, `allowed_file_globs = ["docs/architecture/school-ingestion*.md"]`, forbidden: everything else — specialists cannot "helpfully" prototype the scraper (OUT_OF_SCOPE halt) |
| Phase 5 | `[ROUTING DECISION]` → explorer-planner evidence → doc authored → code-reviewer only for factual-claims review; qa verification NOT_REQUIRED (justified — no behaviour) |
| Evidence required | Claims-traceability rows (each factual claim → source file/report/HAR citation); link/path check for referenced repo paths; **no dry-run of any scraper against live sources, no DB writes** (type stop condition: run would mutate shared data before merge → `NEEDS_USER_DECISION`) |
| Phase 7A/7B | **Skipped** — docs-only; skip recorded in the packet (`[product_verification] skipped = true, reason = "docs-only"`) |
| Phase 7C–9 | FULL matrix (claims matrix populated; safety/failure-mode rows honest `NOT_PROVEN — design-stage, implementation deferred to follow-up #`) → WORKDONE_REVIEW → PR → PR_REVIEW |
| **STOP** | PR-ready halt for user merge approval |
| Final report | Closeout naming the doc path, claims-matrix verdict, explicit deferrals with follow-up issue links, no-cleanup statement |

**Refactor delta:** docs-only checklist prevents the two classic failure modes — silently reclassifying a workflow-file edit as "just docs", and letting a planning issue leak into implementation (forbidden globs + type stop conditions at intake, not discovered mid-run).

---

## Common shape across all three (the standardized lifecycle)

```
intake (0.0–0.6, checklist-classified) → issue/context read → plan (0.7, Team Lead)
→ scope lock (PLAN_REVIEW + handoff globs) → implementation (5, choreographed)
→ evidence (per-type checklist + validation matrix) → validation (7A/7B when user-visible)
→ review gates (7C WORKDONE_REVIEW → PR_REVIEW) → PR-READY STOP
→ merge ONLY on explicit user approval (squash, no --admin, no bypass)
→ closeout (lock/ports/worktree disposition; stale artefacts reported, never touched)
```
