---
name: mode3-run
description: Hands-off Mode-3 execution for an approved GitHub issue. Main Agent owns gates; Agent Teams provides the runtime transport; Route-and-Run defines the choreography.
argument-hint: <issue#>
---

# /mode3-run \<issue#\>

**Agent Teams is transport; Route-and-Run defines choreography.**

This command runs one issue end-to-end with a single user kick-off and a single user merge approval. Main Agent is the Agent Team lead; one Sonnet `mode3-orchestrator` teammate (top-level Claude Code session, **not** a subagent) coordinates specialists. File artefacts under `.claude/handoffs/issue-<N>/` are authoritative. Plain teammate pane output is **not** authoritative.

> **This file is a thin dispatcher / phase index.** Full phase detail lives in `.claude/.claude/mode3/contracts/*.md`, loaded **on demand** per the phase index below — this keeps per-run token load low without weakening any gate. Semantics are identical to the prior single-file workflow; only the layout changed. Load a contract when its phase fires; do not preload all of them.

## Scope and authority (summary — full detail in `.claude/mode3/contracts/main-agent.md`)

Main Agent owns: issue intake, the lightweight assignment, all OpenAI gates (PLAN_REVIEW / WORKDONE_REVIEW / PR_REVIEW), approved-plan materialisation, sha256 verification, Agent Team lifecycle, scope-lock, Phase 7A/7B browser validation, PR creation, merge handoff, closeout, final main sync + re-index.

The Team Lead (`mode3-orchestrator` teammate) owns: investigation, bug reproduction, **authoring the implementation plan**, execution orchestration, evidence collection, and the eval-checklist self-check.

Executor teammate **MUST NOT**: invoke OpenAI gates, contact ChatGPT, create PRs, merge, change scope, approve scope expansion, use unlisted specialists, touch `**/.env*` or `**/secrets/**`, edit outside `executor.allowed_file_globs`, mark work done without QA/E2E evidence, bypass any Route-and-Run gate. Specialist output is **evidence, not authority**.

**Workflow filesystem access:** within `/mode3-run`, Claude may create/update required workflow artefacts under `.claude/` (handoffs, state, logs, contracts, templates, reports, checkpoints) without asking for extra permission — it must still ask/stop for product code outside the approved scope, and this never bypasses any gate or integrity check. Full rule + allowed paths/artefacts: `.claude/mode3/contracts/main-agent.md` → Workflow filesystem access.

## Plan ownership — corrected Mode-3 sequence (binding)

> **The "Team Lead" (execution owner) is the `mode3-orchestrator` teammate.** The literal `team-lead.md` subagent was retired for Mode-3 (subagents cannot call `Task`). Wherever this workflow says "Team Lead", it means the spawned `mode3-orchestrator` teammate.

**HARD INVARIANT — the Main Agent MUST NOT author the implementation plan.** It writes only a lightweight `TEAM_LEAD_ASSIGNMENT` (problem + buyer-facing acceptance intent + constraints + known context); NO implementation recipe. Plan authoring is the Team Lead's.

```text
Main Agent: pick issue + write team-lead-assignment.toml                       [Phase 0.6]
  ↓
Team Lead: INVESTIGATE (explorer-planner / architect / qa for BUG_REPRO)
           → AUTHOR team-lead-plan.toml                                         [Phase 0.7]
  ↓  (BUGS: bug-repro-report.toml must reach REPRODUCED or an OpenAI-approved
      exception BEFORE team-lead-plan.toml is valid — see .claude/mode3/contracts/bug-repro.md)
Main Agent: submit team-lead-plan.toml to OpenAI PLAN_REVIEW                     [Phase 1]
  ↓
OpenAI PLAN_REVIEW: decision + scope + required_evidence + EVAL_CHECKLIST + self_critic
  ↓
Main Agent: materialise approved-plan.toml + build approved-execution-handoff.toml
            (transcribes eval_checklist + required_evidence into the handoff)   [Phase 2]
  ↓
Team Lead: execute against eval_checklist; self-check; write workdone-candidate.toml
           (includes eval_checklist_result satisfaction matrix)                 [Phase 5–6]
  ↓
Main Agent: independent Phase 7A browser validation → Phase 7B if triggered     [Phase 7A/7B]
  ↓
Main Agent: submit to OpenAI WORKDONE_REVIEW (contract_check + self_critic;
            consumes 7A/7B evidence)                                            [Phase 7C]
  ↓
Main Agent: PR / PR_REVIEW / merge gate / closeout / loop to next issue         [Phase 8–12]
```

---

## Inputs

- `$ARGUMENTS` — GitHub issue number `<N>`, e.g. `1094`.

## Phase index (load the contract when the phase fires)

| Phase | Actor | What | Contract to load |
|---|---|---|---|
| 0.1 | Main Agent | Repo index check | inline below (always) |
| 0.2 | Main Agent | Agent Teams + sentinel probe (spawns Team Lead) | inline below (always) |
| 0.6 | Main Agent | Write lightweight `team-lead-assignment.toml` | `.claude/mode3/contracts/main-agent.md` |
| 0.7 | Team Lead | Investigate + author `team-lead-plan.toml`; **BUG_REPRO first if bug** | `.claude/mode3/contracts/team-lead.md` (+ `.claude/mode3/contracts/bug-repro.md` only if bug) |
| 1 | Main Agent | OpenAI PLAN_REVIEW of the Team Lead plan | `.claude/mode3/contracts/plan-review.md` |
| 2 | Main Agent | Materialise approved-plan + build handoff (transcribe eval_checklist) | `.claude/mode3/contracts/plan-review.md` |
| 3 | Main Agent | Team lifecycle (reuse — created in 0.2) | inline below |
| 4 | Main Agent | Sentinel probe (already passed in 0.2) | inline below |
| 5 | Team Lead | Real execution (routing log, choreography, reroute, QA/E2E gate) | `.claude/mode3/contracts/team-lead.md` |
| 6 | Main Agent | Act on WORKDONE_CANDIDATE_READY / BLOCKED notification; bounded fallback per notifications.md | `.claude/mode3/contracts/workdone-review.md` + `.claude/mode3/contracts/notifications.md` |
| 7A | Main Agent | Final Product Verification (browser) — user-visible changes | `.claude/mode3/contracts/browser-validation.md` |
| 7B | Main Agent | Conditional Exploratory Product Sweep | `.claude/mode3/contracts/browser-validation.md` |
| 7C | Main Agent | OpenAI WORKDONE_REVIEW (consumes 7A/7B evidence) | `.claude/mode3/contracts/workdone-review.md` |
| 8–12 | Main Agent | PR / PR_REVIEW / merge / cleanup / sync / closeout | `.claude/mode3/contracts/closeout.md` |
| Fallback | Main Agent | Path C (direct orchestration) — explicit only | `.claude/mode3/contracts/main-agent.md` |

**Conditional loads:** `.claude/mode3/contracts/bug-repro.md` loads only after the issue is classified a BUG. `.claude/mode3/contracts/browser-validation.md` loads only for user-visible changes (skip for docs/backend-only/test-only/pure-refactor). `.claude/mode3/contracts/closeout.md`'s stale-PR/branch safety policy is needed only at Phase 8–12. Do not load any contract before its phase.

## Stop conditions (the run halts at the first match)

| Phase | Stop condition | Next state |
|---|---|---|
| 0 | Agent Teams unavailable / probe fail | `blocked.toml(AGENT_TEAMS_UNAVAILABLE \| TOOL_UNAVAILABLE)`; report to user |
| 0 | Repo index unavailable / stale unrecoverable | `blocked.toml(INDEX_UNAVAILABLE \| INDEX_STALE)` |
| 0.7 | Bug `status = NOT_REPRODUCED` and no OpenAI exception / user authorisation | no speculative fix; diagnostic/test/comment/follow-up only; halt to user |
| 0.7 | `team-lead-plan.toml` absent after Team Lead idle | planning incomplete; report to user; do not submit PLAN_REVIEW |
| 1 | PLAN_REVIEW REVISION_REQUIRED | halt; show revisions to user (route mechanism back to Team Lead/specialists, not Main Agent) |
| 5 | Executor writes `blocked.toml` (any reason_code) | report to user; do not proceed to WORKDONE_REVIEW for terminal reasons |
| 6 | Neither `workdone-candidate.toml` nor `blocked.toml` after executor goes idle | incomplete; report to user |
| 6 | Both `workdone-candidate.toml` AND `blocked.toml` present | `CONFLICTING_EVIDENCE`; stop |
| 7A | Product verification FAIL | do NOT proceed to WORKDONE_REVIEW or create PR; route observed bug back to specialist (2-cycle reroute limit); halt to user if unresolved |
| 7A | Product verification BLOCKED (app won't start / no test data / URL unreachable) | report blocker; user decision only if team cannot resolve |
| 7B | Exploratory sweep BLOCKING_REGRESSION (direct regression caused by this PR) | do NOT proceed to WORKDONE_REVIEW or create PR; route back to specialist (2-cycle reroute limit); halt to user if unresolved |
| 7B | Exploratory sweep BLOCKED (environment/data prevented sweep) | report blocker; user decision only if team cannot resolve |
| 7C | sha256 mismatch on approved-plan | stop; do not invoke WORKDONE_REVIEW |
| 7C | scope-lock violation outside `allowed_file_globs` | stop; require explicit scope-change approval |
| 7C | QA/E2E evidence missing or FAIL, or eval-checklist item not PASS | stop; do not invoke WORKDONE_REVIEW |
| 7C | WORKDONE_REVIEW REVISION_REQUIRED (NEEDS_FIXES) | halt to user; outer-gate failure, does NOT consume the inner specialist 2-cycle budget. Fix re-enters Phase 7A browser re-validation before re-submitting WORKDONE_REVIEW. |
| 9 | PR_REVIEW REVISION_REQUIRED | halt to user; same separation as Phase 8 — outer gate, no shared counter with inner specialist loop. |
| 10 | User declines merge | halt with PR open; do not merge |

## Artefacts produced under `.claude/handoffs/issue-<N>/`

0a. `team-lead-assignment.toml` — written by Main Agent (lead) in Phase 0.6. Lightweight assignment ONLY: problem, acceptance intent, constraints, known context. NO implementation recipe.
0b. `team-lead-plan.toml` — written by the Team Lead (orchestrator) in Phase 0.7 after specialist investigation. The implementation plan. Becomes the PLAN_REVIEW input packet. Main Agent does NOT author this.
0c. `bug-repro-report.toml` — written by the Team Lead (orchestrator, via QA) in Phase 0.7 for bug issues, BEFORE `team-lead-plan.toml`. See `.claude/mode3/contracts/bug-repro.md`.
1. `approved-execution-handoff.toml` — written by Main Agent (lead) after PLAN_REVIEW APPROVED. Now also carries the `[eval_checklist]` + `[required_evidence]` transcribed from the OpenAI PLAN_REVIEW verdict.
2. `team-lead-execution-log.md` — append-only, written by executor after each significant step.
3. `workdone-candidate.toml` — written by executor on success; QA/E2E gate satisfied.
4. `blocked.toml` — written by executor on failure or unsafe condition.
5. `preflight-probe.txt` — written by executor during Phase 4 behavioural sentinel probe.
6. `product-verification.toml` — written by the product-check specialist during Phase 7A (final browser product verification). Authoritative; the lead reads it from disk to decide the gate outcome.
7. `product-sweep.toml` — written by the exploratory specialist during Phase 7B (conditional exploratory product sweep) when its triggers fire. Authoritative; the lead reads it from disk to decide the gate outcome. Absent when Phase 7B is skipped.

File artefacts are authoritative. SendMessage is for notifications only. Lead determines completion state by reading from disk.

> **Notification flow:** The orchestrator sends proactive SendMessage notifications at phase boundaries and terminal/stall states (SPECIALIST_DONE, BLOCKED, WORKDONE_CANDIDATE_READY, STALL_DETECTED and others). Main Agent REACTS to these notifications; bounded fallback polling (stall window 10 min, max 3 reconciliation reads per phase) is a safety net only. Full 12-event catalogue, payload schema, dual-channel invariant, and numeric bounds: `.claude/mode3/contracts/notifications.md`.

---

## Phase 0 — Pre-flight (always inline; runs every time)

### 0.1 — JCode Munch / RTK repo index check (mandatory)

Run `mcp__jcodemunch__resolve_repo { "path": "." }`. If the repo is not indexed or the last index timestamp is older than the most recent `git log -1 --format=%cI`, run `mcp__jcodemunch__index_folder { "path": ".", "incremental": true }`. Record the command and the result summary in the approved-execution-handoff.toml `[indexing]` section.

If indexing fails (tool unavailable, repo unrecognised, fatal error): write `blocked.toml(reason_code=INDEX_UNAVAILABLE)` and halt.

If the index is stale and refresh fails: write `blocked.toml(reason_code=INDEX_STALE)` and halt.

**Indexing is an optimisation, not authority.** If indexed output later conflicts with direct file content or git state, direct file + git state win. Verify suspicious indexed results against a direct read before acting.

### 0.2 — Agent Teams availability + behavioural Task sentinel probe (mandatory)

Self-report is NOT sufficient. The probe must succeed behaviourally before any real work begins.

Steps:
1. Verify `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set and the `TeamCreate`, `TeamDelete`, `SendMessage` tools are callable from this session.
2. If a team `mode3-<N>` already exists for this issue: refuse to silently recreate. Either attach safely (only if previous artefacts are intact and the user explicitly confirms resume) or instruct the user to run `TeamDelete` and re-run `/mode3-run`. Never silently overwrite.
3. `TeamCreate({ team_name: "mode3-<N>", description: "Mode-3 MVP execution for issue <N>", agent_type: "main-agent" })`.
4. **Lead generates the random suffix locally** (e.g. `python3 -c "import secrets;print(secrets.token_hex(3))"`) and **writes it to disk first**: `.claude/handoffs/issue-<N>/expected-sentinel.txt` containing exactly `PROBE_OK_<N>_<random6>`. The expected value is now durable across crashes and resumes.
5. Spawn the Orchestrator teammate: `Agent({ subagent_type: "mode3-orchestrator", model: "sonnet", team_name: "mode3-<N>", name: "orchestrator", prompt: <sentinel probe prompt below> })`. Note: `subagent_type` is `mode3-orchestrator` (NOT `team-lead`) — see `.claude/agents/mode3-orchestrator.md`. The teammate `name` is `orchestrator` (NOT `executor`) so the spawn pattern is unambiguously distinct from the retired team-lead-as-executor pattern.
6. Orchestrator's first instruction is the file-based sentinel probe: invoke `Task({ subagent_type: "qa-fast", prompt: "Behavioural sentinel probe. Reply with EXACTLY this single line and nothing else: PROBE_OK_<N>_<random6>" })` (with the lead-generated suffix interpolated into the prompt), then `Write` the returned line to `.claude/handoffs/issue-<N>/preflight-probe.txt`.
7. Lead reads `.claude/handoffs/issue-<N>/preflight-probe.txt` AND `.claude/handoffs/issue-<N>/expected-sentinel.txt` from disk. Pass = both files exist and their contents match exactly. Self-report by the Orchestrator is ignored.

On probe failure:
- If `Task` is not callable inside the executor → `blocked.toml(reason_code=TOOL_UNAVAILABLE)`; document evidence in `blocked.toml.detail`.
- If the team could not be created or the executor could not be spawned → `blocked.toml(reason_code=AGENT_TEAMS_UNAVAILABLE)`.

No silent fallback. If the user wants to proceed via Path C (Main Agent direct orchestration), they must request it explicitly; the run is then logged as Path-C fallback in `team-lead-execution-log.md`. See `.claude/mode3/contracts/main-agent.md` → Fallback: Path C.

---

## Phase 0.6 — TEAM_LEAD_ASSIGNMENT

Main Agent writes the lightweight `team-lead-assignment.toml`. **Load `.claude/mode3/contracts/main-agent.md`** for the assignment template and the "no implementation recipe" rule.

## Phase 0.7 — Team Lead investigation + plan authoring

Main Agent SendMessages the Team Lead pointing to the assignment; the Team Lead investigates and authors `team-lead-plan.toml`. **Load `.claude/mode3/contracts/team-lead.md`.** If the issue is a BUG, the Team Lead runs BUG_REPRO first — **load `.claude/mode3/contracts/bug-repro.md`**.

## Phase 1 — PLAN_REVIEW · Phase 2 — Build handoff

Main Agent submits the Team Lead's plan to OpenAI PLAN_REVIEW, then materialises the approved plan and builds the execution handoff (transcribing the eval_checklist). **Load `.claude/mode3/contracts/plan-review.md`.**

## Phase 3 — Team lifecycle (already created in 0.2)

The team was created and the executor was spawned during the behavioural probe. Reuse `mode3-<N>`. Do NOT recreate.

## Phase 4 — Sentinel probe (already passed in 0.2)

The behavioural sentinel was a precondition to proceeding. Phases 1–3 only ran because Phase 0.2 passed. If Phase 4 work uncovers a regression in Task callability (e.g. the executor process died and was replaced), re-run the sentinel before continuing.

## Phase 5 — Real execution

Team Lead orchestrates specialists within the handoff boundary (routing decision log, Route-and-Run choreography, reroute loop, QA/E2E hard gate). **Load `.claude/mode3/contracts/team-lead.md`.**

## Phase 6 — Wait for terminal artefact · Phase 7C — WORKDONE_REVIEW

Main Agent polls for the terminal artefact, then (after 7A/7B) runs WORKDONE_REVIEW. **Load `.claude/mode3/contracts/workdone-review.md`.**

## Phase 7A / 7B — Browser validation

Main Agent runs independent browser validation BEFORE WORKDONE_REVIEW (user-visible changes only). **Load `.claude/mode3/contracts/browser-validation.md`.**

## Phase 8–12 — PR / merge / closeout

Main Agent creates the PR, runs PR_REVIEW, stops for the mandatory user merge approval, cleans up the team, syncs main, and prints the closeout (including the stale-PR/branch safety policy). **Load `.claude/mode3/contracts/closeout.md`.**

---

## Source-of-truth invariant

> **Agent Teams is the runtime transport for executor teammate spawning. Route-and-Run (`.claude/skills/ROUTE_AND_RUN.md`) defines the specialist choreography. The executor follows Route-and-Run; it does NOT redefine it.**

This statement is the source-of-truth for any future drift question. Any change to executor behaviour must either (a) align with Route-and-Run, or (b) accompany a corresponding Route-and-Run update reviewed by `security-reviewer` and `code-reviewer`.

## Bugfix Fast Path

For bug issues, the full Bugfix Fast Path (Principle, Phases B0–B5, BUG_REPRO_REPORT, severity shortcuts, gate behaviour, gate packet requirements) lives in **`.claude/mode3/contracts/bug-repro.md`** — loaded only when the issue is classified a BUG.

## Contract index

- `.claude/mode3/contracts/main-agent.md` — Main Agent role, scope policy, Phase 0.6 assignment, Path C
- `.claude/mode3/contracts/team-lead.md` — Team Lead Phase 0.7 planning + Phase 5 execution + authority hardening
- `.claude/mode3/contracts/bug-repro.md` — Bugfix Fast Path (load only for bugs)
- `.claude/mode3/contracts/plan-review.md` — Phase 1 PLAN_REVIEW + Phase 2 handoff build + eval-checklist mechanism
- `.claude/mode3/contracts/workdone-review.md` — Phase 6 terminal artefact + Phase 7C WORKDONE_REVIEW
- `.claude/mode3/contracts/browser-validation.md` — Phase 7A/7B (load only for user-visible changes)
- `.claude/mode3/contracts/closeout.md` — Phases 8–12 + stale-PR/branch safety policy
- `.claude/mode3/contracts/notifications.md` — 12-event notification catalogue, payload schema, dual-channel invariant, bounded fallback polling (replaces open-ended Phase 6 polling)

## Definition-of-Done (DoD) autopilot review gate — FOUNDATION, DRY-RUN ONLY

> **DRY-RUN ONLY.** A Definition-of-Done (DoD) autopilot review gate has been **designed**
> (not wired) as a foundation for future trusted autonomous execution. In its current form
> it would run as **Phase 9B** (after `PR_REVIEW` surfaces `APPROVED_TO_MERGE`, before the
> user merge-approval halt) and emit a `WOULD_AUTOMERGE` verdict when an issue's DoD is
> satisfied by captured evidence. **It performs no real merge, no PR-state update, and has
> no side effects.** No executable wiring is added: `openai_gate.py` and
> `verify-mode3-workdone.py` are unchanged.
>
> **DRY RUN — no merge has been or will be executed.**

**`PR_REVIEW` approval is NOT merge approval.** A `PR_REVIEW: APPROVED_TO_MERGE` verdict —
and likewise an `AUTOPILOT_DOD_REVIEW: WOULD_AUTOMERGE` verdict — means a gate found the PR
eligible / the DoD satisfied. Neither authorizes a release command. Per CLAUDE.md §10, the
run STOPS and asks the user for explicit approval before any `gh pr merge`.

Foundation artefacts (docs/templates only — see issue #1273):

- `.claude/product-truth/discover.md` — authoritative, implementation-independent buyer-facing product truth for Discover (DoD criteria reference its section anchors).
- `.claude/autopilot/templates/definition-of-done.toml` — reusable per-issue DoD template (product-truth-anchored, machine-checkable pass/fail; `autopilot_merge = false`).
- `.claude/autopilot/templates/evidence-packet.toml` — reusable evidence template (`dry_run = true`; product-level vs implementation-level evidence split; missing-evidence convention).
- `.claude/autopilot/gates/AUTOPILOT_DOD_REVIEW.md` — the full gate DESIGN (purpose, inputs, decision schema, verdict enum incl. `WOULD_AUTOMERGE` + `DOD_NOT_MET` + indeterminate verdicts, Phase 9B placement, dry-run-only behaviour, and a clearly-marked out-of-scope future-wiring appendix).
