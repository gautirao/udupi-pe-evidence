# Mode-3 Skill System Refactor — Summary

Branch: `refactor/mode3-run-skill-system` · Date: 2026-07-07
Companion docs in this directory: `inventory.md` · `overlap-conflict-map.md` · `before-after-proof.md` · `dry-run-simulations.md`

## What this refactor did

**Discovery first, edits second.** ~85 files were read in full across four sweeps (core lifecycle, agent definitions, Route-and-Run/sprint layer, templates+scripts+hardening) and inventoried in `inventory.md` before any edit. Every issue was documented in `overlap-conflict-map.md` with severity and disposition before being fixed.

### Safety fixes (S1 — could cause a wrong/unsafe action)

1. **Removed the `--admin` merge instruction** from `closeout.md` Phase 9.1 and added binding merge-command rules: never `--admin`, never bypass branch protection, never force merge, squash-only.
2. **Removed `gh pr merge` from the "Pre-Approved (No Confirmation Required)" list** in `ROUTE_AND_RUN.md` — CLAUDE.md §10 (explicit user merge approval) now explicitly wins in every lane; the sprint executor's merge step and `TOOLING.md`'s pre-approval exception were aligned to the same rule. Merge strategy unified to normal squash merge.

### Correctness fixes (S2 — could stall or fail a run)

3. **Gate verdict vocabulary aligned to the enforcing script.** `plan-review.md`/`workdone-review.md` documented a `decision =` field with values `openai_gate.py` never emits; `mode3-run.md`/`closeout.md` routed PR_REVIEW rework on `REVISION_REQUIRED`, a verdict that gate cannot return. All mode3 contracts now use `verdict =` with the real PER_GATE_ENUMS values (`APPROVED`/`REVISION_REQUIRED`… for PLAN_REVIEW; `APPROVED_FOR_PR`/`NEEDS_FIXES`… for WORKDONE_REVIEW; `APPROVED_TO_MERGE`/`NEEDS_FIXES`… for PR_REVIEW).
4. **Fixed the latent `[ROUTING DECISION]` marker bug.** `verify-mode3-workdone.py` greps the execution log for the literal `[ROUTING DECISION]`, but the template and both contract restatements emitted `— ROUTING DECISION` (no brackets) — a template-following run would fail Phase-7C preflight. The heading is now `## <ts> — [ROUTING DECISION]` in all three places, with the requirement spelled out.
5. **Purged live instructions referencing the removed `Task` spawn tool** (replaced by `Agent`) from 8 live docs; historical/hardening records were deliberately left untouched as dated history.

### Consistency and maintainability (S3)

6. Fixed the `.claude/.claude/` path typo, the dead `code-review-orchestrator.md` pointers, the dead probe-evidence paths (annotated as historical), the gatekeeper's undefined `READY_FOR_CHATGPT_REVIEW` verdict, the wrong orchestrator-toolkit description in `team-lead.md`, and its unexecutable "Delegate via Task tool" step.
7. **Line-number citations → section-name anchors.** Load-bearing cross-references (`ROUTE_AND_RUN.md:357-369`, `:472`, `:64`, `mode3-run.md line 120/147`, `qa.md:26`, …) had all drifted. They now cite stable section names.
8. **Bug-repro vocabulary unified** to `REPRODUCED` (legacy `REPRO_CONFIRMED` accepted read-only for old artefacts).
9. **Two gate lanes declared explicitly.** `gates.md` (manual ChatGPT lane) and the mode3 contracts (automated `openai_gate.py` lane) each now state their lane and vocabulary at the top, ending the enum confusion.
10. **Authority-order contradiction resolved** (`SKILL.md` said "table wins"; both other docs said main doc wins — main doc wins, stated once).
11. **Deduplication:** `team-lead.md` contract no longer restates the 12-item refusal list (points at the canonical list in `mode3-orchestrator.md`) or the full routing-log template (points at the canonical template); `tooling-blocked.toml` carries a deprecation banner (superseded by `blocked.toml`; deletion left to the user).

### Structure standardization

12. All 9 mode3 contracts now open with a **standard header block**: Purpose · When to load · Actor · Inputs · Allowed scope · Forbidden · Stop conditions · Outputs. Bodies were preserved (all verifier-asserted phrases intact).
13. **New contract `issue-checklists.md`:** seven per-issue-type checklists (backend/API, frontend/UX, security/privacy, DB/migration, docs-only, data-ingestion/scraping, refactor/cleanup), each with specialists, required evidence, validation-matrix level, and type-specific stop conditions. Wired into Phase 0.6 intake and Phase 0.7 planning.
14. **New validator `verify-mode3-docs-consistency.py`:** dependency-free static checker that fails on regressions of the classes fixed here (`--admin` merge instructions, `via Task` spawning, path typos, legacy verdict vocabulary, missing `[ROUTING DECISION]` marker, dead contract references). Green on the refactored tree (54 files scanned, 0 violations).

## Standing rules — explicitly preserved (verified by grep + verifier scripts)

Stop at PR-ready until explicit user merge approval · normal squash merge only · no `--admin` (now *stronger*: previously instructed, now banned) · no branch-protection bypass · no force merge · one issue per worktree (duplicate-run guard intact) · no shared-Supabase/live-DB mutation during unmerged validation (`NEEDS_USER_DECISION` halt intact) · screenshots/browser evidence for UX changes (Phase 7A + evidence_chain intact) · security/API evidence + reviewer gates (Gate F intact) · OpenSearch stays behind the backend (restated in backend checklist) · specialists never spawn sub-agents or self-escalate models · scope changes only via SCOPE_CHANGE_REVIEW/PLAN_REVIEW · no silent cleanup of stashes/branches/worktrees/untracked files (stale-artefact policy intact) · `_ds_bundle.js` protected (restated in refactor checklist) · test provenance labelled (CLAUDE.md §11 + validation-matrix grammar, now declared canonical).

## Deliberately NOT changed

- **`openai_gate.py`, the three verify scripts, and their tests** — the enforcing implementations; docs were aligned *to them*, keeping runtime behaviour identical.
- **Hardening reports (`.claude/hardening/`)** — dated forensic history; their `Task`-era wording is accurate history.
- **`.claude/state/parallel-runbook.md`** and other stale runtime-state docs — historical run plans (they contain `--admin` merges as a record of a past migration; flagged for archive, user decision).
- **`.antigravity/**`** — downstream manual mirror; sync policy is a user decision (its verifier does not detect drift from `.claude`).
- **`EXECUTOR_PROMPT.md.template`** — legacy but still wired into `openai_gate.py` materialisation; changing it requires a lockstep script change (user decision).
- **`chatgpt-gatekeeper.md` retirement, gate-enum unification across the two lanes, "Mode 3 resume" rename, agent-file boilerplate consolidation** — recorded as user decisions in `overlap-conflict-map.md`.
- **All application/product code, backend/frontend behaviour, sprint/product state files** — untouched (diff is `.claude/**` + `docs/audit/**` only).

## Validation status

- `verify-mode3-team-invariant.py` — **PASS (24/24)**
- `verify-mode3-duplicate-run-guard.py` — **PASS (17/17 incl. live scan)**
- `verify-mode3-docs-consistency.py` (new) — **PASS (54 files, 0 violations)**
- `pytest .claude/scripts/tests/` — **104 passed, 0 failed** (17 baseline failures were environmental — missing `jsonschema`/`openai` modules — identical on the untouched tree; resolved by installing the deps from `requirements.txt`)
- Reference-path check over every changed file — all cited `.claude/` paths exist.
