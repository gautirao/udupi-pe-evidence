---
name: mode3-run
description: Hands-off Mode-3 execution for an approved GitHub issue. Main Agent owns gates; Agent Teams provides the runtime transport; Route-and-Run defines the choreography.
argument-hint: <issue#>
---

# /mode3-run \<issue#\>

**Agent Teams is transport; Route-and-Run defines choreography.**

This command runs one issue end-to-end with a single user kick-off and a single user merge approval. Main Agent is the Agent Team lead; one **Opus** `mode3-orchestrator` teammate (a background Agent-Teams teammate spawned into the session's single implicit team) coordinates specialists. File artefacts under `.claude/handoffs/issue-<N>/` are authoritative. Plain teammate pane output is **not** authoritative.

> **HARD INVARIANT — Mode-3 REQUIRES a team.** Execution may not begin until the `orchestrator` teammate has been spawned AND its behavioural sentinel probe has round-tripped through disk (Phase 0.2). If the spawn or the probe fails, the run writes `blocked.toml` and HALTS. The Main Agent MUST NOT perform implementation work itself and MUST NOT silently fall back to ad-hoc background subagents. The orchestrator MUST run on **Opus** (never Sonnet).

### Mode-3 team invariant (binding)

1. `/mode3-run` MUST spawn an **Opus** orchestrator via the `Agent` tool.
2. That orchestrator is the **team anchor** (it materialises the session's implicit team).
3. The orchestrator MUST be able to **nested-spawn specialists** via `Agent` (verified by the Phase 0.2 sentinel probe).
4. The **Main Agent MUST NOT perform implementation work directly** — it owns gates, validation, PR, and merge handoff only.
5. **Failure to establish or probe the orchestrator MUST block the run** (`blocked.toml(AGENT_TEAMS_UNAVAILABLE | TOOL_UNAVAILABLE)`) — never continue as a plain implementation agent.
6. All teammate work MUST be **observable** through task transcripts (`tasks/<id>.output`), the append-only `team-lead-execution-log.md`, and `SendMessage` notifications.

> **Harness migration note (not a repo regression).** The explicit `TeamCreate` / `TeamDelete` tools were **removed from the Claude Code harness**; Mode-3 now uses the harness's **single implicit per-session team** (the Main Agent is its lead) and spawns the orchestrator via `Agent`. This repair does **not** re-create the old explicit-team API. Whether teammates render in **separate tmux panes** is governed by the harness `teamMateMode` setting and session context (top-level vs child session) — it is a harness/terminal concern, **not** something this workflow or repo controls. Pane visibility being absent in a given session is therefore not a Mode-3 regression.

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
            consumes 7A/7B evidence; checks validation-matrix presence/verdict) [Phase 7C]
  ↓
VALIDATION_MATRIX: risk-triggered evidence packet (NOT_REQUIRED | COMPACT | FULL);
            required matrix complete before PR_REVIEW is sent                    [between 7C and 8]
  ↓
Main Agent: PR / PR_REVIEW (consumes the matrix) / merge gate / closeout / loop  [Phase 8–12]
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
| 7C | Main Agent | OpenAI WORKDONE_REVIEW (consumes 7A/7B evidence; checks validation matrix) | `.claude/mode3/contracts/workdone-review.md` + `.claude/mode3/contracts/validation-matrix.md` |
| VM | Team Lead / Main Agent | Validation matrix (NOT_REQUIRED \| COMPACT \| FULL) — evidence packet PR_REVIEW consumes; required matrix complete before PR_REVIEW | `.claude/mode3/contracts/validation-matrix.md` |
| 8–12 | Main Agent | PR / PR_REVIEW (consumes matrix) / merge / cleanup / sync / closeout | `.claude/mode3/contracts/closeout.md` |
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
| 7C | WORKDONE_REVIEW REVISION_REQUIRED (NEEDS_FIXES) | outer-gate failure; does NOT consume the inner specialist 2-cycle budget. Write `rework-request-workdone-review-<n>.toml` (disk-before-send), resume the orchestrator by `agent_id` (else respawn a fresh Opus orchestrator from durable artefacts), route the fix, re-enter Phase 7A browser re-validation, then re-submit WORKDONE_REVIEW. Main Agent never authors the fix. See `main-agent.md` → Rework routing. |
| 9 | PR_REVIEW REVISION_REQUIRED | outer gate, no shared counter with inner specialist loop. Write `rework-request-pr-review-<n>.toml` (disk-before-send), resume-or-respawn the Opus orchestrator, route the fix, re-run required validation, then re-run PR_REVIEW. Main Agent never authors the fix. See `main-agent.md` → Rework routing. |
| 10 | User declines merge | halt with PR open; do not merge |

## Artefacts produced under `.claude/handoffs/issue-<N>/`

0a. `team-lead-assignment.toml` — written by Main Agent (lead) in Phase 0.6. Lightweight assignment ONLY: problem, acceptance intent, constraints, known context. NO implementation recipe.
0b. `team-lead-plan.toml` — written by the Team Lead (orchestrator) in Phase 0.7 after specialist investigation. The implementation plan. Becomes the PLAN_REVIEW input packet. Main Agent does NOT author this.
0c. `bug-repro-report.toml` — written by the Team Lead (orchestrator, via QA) in Phase 0.7 for bug issues, BEFORE `team-lead-plan.toml`. See `.claude/mode3/contracts/bug-repro.md`.
1. `approved-execution-handoff.toml` — written by Main Agent (lead) after PLAN_REVIEW APPROVED. Now also carries the `[eval_checklist]` + `[required_evidence]` transcribed from the OpenAI PLAN_REVIEW verdict.
1b. `orchestrator-agent.toml` — written by Main Agent at every orchestrator spawn (initial bootstrap + any respawn). Durable record of the live/last-known orchestrator identity + `agent_id` for resume; survives compaction/crash. Template: `.claude/templates/orchestrator-agent.toml`.
2. `team-lead-execution-log.md` — append-only, written by executor after each significant step.
3. `workdone-candidate.toml` — written by executor on success; QA/E2E gate satisfied.
4. `blocked.toml` — written by executor on failure or unsafe condition.
4b. `rework-request-<gate>-<n>.toml` — written by Main Agent (disk-before-send) for every rework/course-correction event before messaging the orchestrator. Authoritative fix-routing brief; lets a resumed OR freshly-respawned orchestrator route the fix from disk alone. Template: `.claude/templates/rework-request.toml`.
5. `preflight-probe.txt` — written by executor during Phase 4 behavioural sentinel probe.
6. `product-verification.toml` — written by the product-check specialist during Phase 7A (final browser product verification). Authoritative; the lead reads it from disk to decide the gate outcome.
7. `product-sweep.toml` — written by the exploratory specialist during Phase 7B (conditional exploratory product sweep) when its triggers fire. Authoritative; the lead reads it from disk to decide the gate outcome. Absent when Phase 7B is skipped.
8. `validation-matrix.md` — written by the Team Lead during Phase 5–6 when `validation_matrix.level` = `COMPACT`/`FULL`. The risk-triggered evidence packet PR_REVIEW consumes. Absent for `NOT_REQUIRED` (one-line justification lives in `team-lead-plan.toml`/`workdone-candidate.toml`). Policy: `.claude/mode3/contracts/validation-matrix.md`.

File artefacts are authoritative. SendMessage is for notifications only. Lead determines completion state by reading from disk.

> **Notification flow:** The orchestrator sends proactive SendMessage notifications at phase boundaries and terminal/stall states (SPECIALIST_DONE, BLOCKED, WORKDONE_CANDIDATE_READY, STALL_DETECTED and others). Main Agent REACTS to these notifications; bounded fallback polling (stall window 10 min, max 3 reconciliation reads per phase) is a safety net only. Full 12-event catalogue, payload schema, dual-channel invariant, and numeric bounds: `.claude/mode3/contracts/notifications.md`.

---

## Phase 0 — Pre-flight (always inline; runs every time)

### 0.1 — JCode Munch / RTK repo index check (mandatory)

Run `mcp__jcodemunch__resolve_repo { "path": "." }`. If the repo is not indexed or the last index timestamp is older than the most recent `git log -1 --format=%cI`, run `mcp__jcodemunch__index_folder { "path": ".", "incremental": true }`. Record the command and the result summary in the approved-execution-handoff.toml `[indexing]` section.

If indexing fails (tool unavailable, repo unrecognised, fatal error): write `blocked.toml(reason_code=INDEX_UNAVAILABLE)` and halt.

If the index is stale and refresh fails: write `blocked.toml(reason_code=INDEX_STALE)` and halt.

**Indexing is an optimisation, not authority.** If indexed output later conflicts with direct file content or git state, direct file + git state win. Verify suspicious indexed results against a direct read before acting.

### 0.2 — Team establishment + behavioural sentinel probe (mandatory)

Self-report is NOT sufficient. The team must be established AND the probe must succeed behaviourally before any real work begins.

> **Harness model (current).** This harness exposes a **single implicit team per session**; there is no separate `TeamCreate`/`TeamDelete` tool, and the `Agent` tool's `team_name` parameter is deprecated/ignored. The team is **materialised by spawning the `orchestrator` teammate** via the `Agent` tool (step 3). Teammates spawn — and themselves spawn specialists — with the `Agent` tool (the prior `Task` spawn tool was removed; nested `Agent` spawning is supported). A successfully spawned, addressable `orchestrator` teammate whose sentinel probe round-trips through disk **is** "the team exists" for every later invariant in this workflow.

Steps:
1. Verify the `Agent` (teammate spawn) and `SendMessage` tools are callable from this session. (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `settings.json` is retained for back-compat but is no longer load-bearing — the implicit team is always available.) If `Agent` is not callable → `blocked.toml(reason_code=AGENT_TEAMS_UNAVAILABLE)` and HALT.
2. If `.claude/handoffs/issue-<N>/` already holds in-progress execution artefacts: refuse to silently recreate state. If `orchestrator-agent.toml` records a prior teammate, prefer **resume** (`SendMessage({ to: "orchestrator", ... })` by bare name; the persisted `agent_id` confirms identity) over a new bootstrap. If resume is not possible, do not "attach" (the harness has no attach primitive) — **respawn a fresh Opus orchestrator and re-brief it from durable artefacts** per `.claude/mode3/contracts/main-agent.md` → Rework routing, reusing the intact `approved-execution-handoff.toml` + `team-lead-execution-log.md`. Never silently overwrite a non-stale terminal artefact; if a terminal `workdone-candidate.toml`/`blocked.toml` is present and the user has not confirmed resume, surface it and ask. The expected-sentinel value persisted in step 3 makes the bootstrap idempotent across crashes/resumes.
3. **Lead generates the random suffix locally** (e.g. `python3 -c "import secrets;print(secrets.token_hex(3))"`) and **writes it to disk first**: `.claude/handoffs/issue-<N>/expected-sentinel.txt` containing exactly `PROBE_OK_<N>_<random6>`. The expected value is now durable across crashes and resumes.
4. Spawn the Orchestrator teammate (this is the team-establishment step):
   `Agent({ subagent_type: "mode3-orchestrator", model: "opus", name: "orchestrator", mode: "auto", run_in_background: true, prompt: <sentinel probe prompt below> })`.
   - `model: "opus"` is **mandatory** — the orchestrator MUST run on Opus, never Sonnet. (Specialists keep their own configured models; do not override them.)
   - `subagent_type` is `mode3-orchestrator` (NOT `team-lead`) — see `.claude/agents/mode3-orchestrator.md`. The teammate `name` is `orchestrator`.
   - `run_in_background: true` makes it a persistent teammate that can SendMessage `main` per the notification contract.
   - **CRITICAL:** `mode: "auto"` auto-approves all tool use without permission prompts, which is required for the orchestrator to proceed with Phase 0.7 investigation without hanging on permission gates.
   - **Persist identity immediately (durable).** Capture the `agent_id` from the spawn result (format `<name>@session-<id>`) and write `.claude/handoffs/issue-<N>/orchestrator-agent.toml` (template `.claude/templates/orchestrator-agent.toml`) with `spawn_kind = "initial"`, `spawn_context = "phase-0.2-bootstrap"`, `requested_model = "opus"`. This durable record confirms identity for a later resume (the teammate is addressed by its **bare name** `orchestrator` — the harness rejects the full `agent_id` string as a `to:` value) and survives Main-session compaction or crash. Every later respawn overwrites it, retiring the prior identity into `[[previous_spawns]]`. See `.claude/mode3/contracts/main-agent.md` → Rework routing.
   - If the spawn call fails or returns no addressable teammate → `blocked.toml(reason_code=AGENT_TEAMS_UNAVAILABLE)` and HALT. Do NOT do the work yourself.
5. Orchestrator's first instruction is the file-based sentinel probe: invoke `Agent({ subagent_type: "qa-fast", prompt: "Behavioural sentinel probe. Reply with EXACTLY this single line and nothing else: PROBE_OK_<N>_<random6>" })` (with the lead-generated suffix interpolated into the prompt), then `Write` the returned line to `.claude/handoffs/issue-<N>/preflight-probe.txt`.
6. Lead reads `.claude/handoffs/issue-<N>/preflight-probe.txt` AND `.claude/handoffs/issue-<N>/expected-sentinel.txt` from disk. Pass = both files exist and their contents match exactly. Self-report by the Orchestrator is ignored.

On probe failure:
- If the orchestrator cannot spawn a specialist via `Agent` (nested spawn not callable in this context) → `blocked.toml(reason_code=TOOL_UNAVAILABLE)`; document evidence in `blocked.toml.detail`.
- If the team could not be established (orchestrator teammate could not be spawned) → `blocked.toml(reason_code=AGENT_TEAMS_UNAVAILABLE)`.

**No silent fallback. Fail fast.** If team establishment or the sentinel probe fails, HALT and report to the user — never continue by having the Main Agent implement the issue or by spawning loose background subagents. If the user wants to proceed via Path C (Main Agent direct orchestration), they must request it **explicitly**; the run is then logged as Path-C fallback in `team-lead-execution-log.md`. See `.claude/mode3/contracts/main-agent.md` → Fallback: Path C.

---

## Phase 0.6 — TEAM_LEAD_ASSIGNMENT

Main Agent writes the lightweight `team-lead-assignment.toml`. **Load `.claude/mode3/contracts/main-agent.md`** for the assignment template and the "no implementation recipe" rule.

## Phase 0.7 — Team Lead investigation + plan authoring

Main Agent SendMessages the Team Lead pointing to the assignment; the Team Lead investigates and authors `team-lead-plan.toml`. **Load `.claude/mode3/contracts/team-lead.md`.** If the issue is a BUG, the Team Lead runs BUG_REPRO first — **load `.claude/mode3/contracts/bug-repro.md`**.

## Phase 1 — PLAN_REVIEW · Phase 2 — Build handoff

Main Agent submits the Team Lead's plan to OpenAI PLAN_REVIEW, then materialises the approved plan and builds the execution handoff (transcribing the eval_checklist). **Load `.claude/mode3/contracts/plan-review.md`.**

## Phase 3 — Team lifecycle (already established in 0.2)

The team (implicit session team) was established and the `orchestrator` teammate was spawned during the behavioural probe. Reuse the live `orchestrator` teammate for the implementation phase; do NOT spawn a second **concurrent** orchestrator during Phase 5 execution. (Rework AFTER a terminal artefact is different: per `.claude/mode3/contracts/main-agent.md` → Rework routing, a later gate fix resumes this teammate by `agent_id`, or — if it is no longer addressable — respawns a fresh Opus orchestrator briefed from durable artefacts. The orchestrator is disposable and reconstructible; it is always Opus.)

## Phase 4 — Sentinel probe (already passed in 0.2)

The behavioural sentinel was a precondition to proceeding. Phases 1–3 only ran because Phase 0.2 passed. If Phase 4 work uncovers a regression in Task callability (e.g. the executor process died and was replaced), re-run the sentinel before continuing.

## Phase 5 — Real execution

Team Lead orchestrates specialists within the handoff boundary (routing decision log, Route-and-Run choreography, reroute loop, QA/E2E hard gate). **Load `.claude/mode3/contracts/team-lead.md`.** Specialists follow jCodemunch-first code navigation and emit a compact `[jcm]` block per **AGENTS.md § Specialist Code Navigation (jCodemunch-first)**.

## Phase 6 — Wait for terminal artefact · Phase 7C — WORKDONE_REVIEW

Main Agent polls for the terminal artefact, then (after 7A/7B) runs WORKDONE_REVIEW. **Load `.claude/mode3/contracts/workdone-review.md`.**

## Phase 7A / 7B — Browser validation

Main Agent runs independent browser validation BEFORE WORKDONE_REVIEW (user-visible changes only). **Load `.claude/mode3/contracts/browser-validation.md`.**

## Phase 8–12 — PR / merge / closeout

Main Agent creates the PR, runs PR_REVIEW, stops for the mandatory user merge approval, shuts down the orchestrator (by its persisted `agent_id`; closeout proceeds on durable artefacts if no live/resumable teammate remains), syncs main, and prints the closeout (including the stale-PR/branch safety policy). **Load `.claude/mode3/contracts/closeout.md`.** Shutdown happens **only** here at Phase 10 — never earlier; the orchestrator stands by (best-effort) through all gate/rework cycles until then.

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
- `.claude/mode3/contracts/validation-matrix.md` — risk-triggered validation matrix (NOT_REQUIRED \| COMPACT \| FULL); proposed at Phase 0.7, validated at PLAN_REVIEW, authored at Phase 5–6, checked at WORKDONE_REVIEW, consumed by PR_REVIEW
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
