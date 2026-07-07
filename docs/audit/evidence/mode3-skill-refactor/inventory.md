# Mode-3 Skill System — Discovery Inventory

Date: 2026-07-07 · Branch: `refactor/mode3-run-skill-system` · Scope: every file that defines, constrains, or supports `/mode3-run` execution.

Legend — Status: **active** (load-bearing today) · **duplicate** (restates another source) · **stale** (references removed tools/paths or superseded flows) · **unclear** (ownership/consumer ambiguous). Recommendation: keep / merge / simplify / fix / delete / needs-user-decision.

---

## 1. Core lifecycle (dispatcher + contracts) — read in full

| # | File | Lines | Purpose | Owner / consumer | Status | Recommendation |
|---|---|---|---|---|---|---|
| 1 | `.claude/commands/mode3-run.md` | 311 | `/mode3-run` dispatcher: phase index, stop conditions, Phase 0 preflight (dup-run guard, index check, team + sentinel probe) | User invokes; Main Agent executes | active; 1 path typo (`.claude/.claude/`); stale line-ref (`line 120`/`line 147` citations) | keep + fix |
| 2 | `.claude/mode3/contracts/main-agent.md` | 387 | Main Agent role: scope policy, file-read budget, rework routing (resume-then-respawn), duplicate-run guard detail, Phase 0.6 assignment, Path C | Main Agent | active; stale `Task` refs; "Phase C"/"Path C" naming drift | keep + fix |
| 3 | `.claude/mode3/contracts/team-lead.md` | 182 | Team Lead (orchestrator) Phase 0.7 planning + Phase 5 execution choreography, skip rules, notifications | Main Agent (command-side view of orchestrator) | active; duplicates mode3-orchestrator.md heavily; stale `Task` refs; stale `mode3-run.md line 147` citation | simplify + fix |
| 4 | `.claude/mode3/contracts/bug-repro.md` | 361 | Bugfix Fast Path: B0–B5, BUG_REPRO_REPORT schema, severity shortcuts | Team Lead + Main Agent (bugs only) | active; dual vocabulary `REPRO_CONFIRMED` vs `REPRODUCED` (B4 uses legacy, B1 uses new) | keep + fix vocabulary |
| 5 | `.claude/mode3/contracts/plan-review.md` | 93 | Phase 1 PLAN_REVIEW + Phase 2 handoff build; eval-checklist mechanism (#1221 native schema) | Main Agent | active | keep |
| 6 | `.claude/mode3/contracts/workdone-review.md` | 96 | Phase 6 terminal artefact + Phase 7C WORKDONE_REVIEW preflight/manual checks | Main Agent | active | keep |
| 7 | `.claude/mode3/contracts/browser-validation.md` | 323 | Phase 7A product verification + 7B exploratory sweep; evidence-chain + anti-fabrication rules | Main Agent + product-check specialist | active; stale `Task` refs | keep + fix |
| 8 | `.claude/mode3/contracts/validation-matrix.md` | 408 | Risk-triggered evidence packet policy (NOT_REQUIRED/COMPACT/FULL); single source of truth | Team Lead, PLAN/WORKDONE/PR_REVIEW | active; well-factored (others reference it) | keep |
| 9 | `.claude/mode3/contracts/closeout.md` | 191 | Phases 8–12: PR, PR_REVIEW, merge gate, team+lock cleanup, stale-PR/branch safety policy | Main Agent | active; **CRITICAL: instructs `gh pr merge --squash --admin`**, violating the no-admin/no-bypass standing rule | keep + fix (remove `--admin`) |
| 10 | `.claude/mode3/contracts/notifications.md` | 174 | 12-event notification catalogue, payload schema, dual-channel invariant, bounded fallback polling | Orchestrator + Main Agent | active; stale "line 120" citation into mode3-run.md | keep + fix |
| 11 | `.claude/agents/mode3-orchestrator.md` | 255 | The spawned Opus teammate's own instructions (Stage A plan, Stage B execution, 12-item refusal list, forbidden actions) | Spawned via Agent tool by Main Agent | active; residual `Task` term in Differences table (:239); 2 dead probe-evidence paths (:252–253) | keep + fix |
| 12 | `.claude/agents/chatgpt-gatekeeper.md` | 239 | Legacy internal pre-screen of gate packets before "ChatGPT" review | Unclear — superseded by `openai_gate.py` automated gates; listed in handoff `always_forbidden` | **stale/unclear**: no YAML frontmatter, undefined verdict `READY_FOR_CHATGPT_REVIEW` (:142), describes a manual-ChatGPT-loop workflow replaced by the OpenAI gate CLI | needs-user-decision (recommend: mark deprecated, keep for reference) |
| 13 | `.claude/skills/route-and-run/SKILL.md` | 76 | Route-and-Run thin entrypoint/loader; authority order; non-negotiable invariants | Skill tool; Main Agent | active | keep |

## 2. Specialist agent definitions (`.claude/agents/`) — 15 files

Full per-file detail from the discovery sweep (line-verified):

| File | Lines | Purpose / consumer | Status | Recommendation |
|---|---|---|---|---|
| architect.md | 179 | Read-only design/decomposition; Stage A + architecture gate | active | keep / simplify (invariants duplicate ARCHITECTURE.md) |
| backend-engineer.md | 138 | Spring Boot implementation; Stage B engineer | active | keep |
| code-reviewer.md | 176 | Read-only review; AC3 scope-compliance block | active | keep |
| explorer-planner.md | 98 | Read-only repo discovery feeding PLAN_REVIEW | active | keep |
| frontend-engineer.md | 250 | React/Vite implementation; Stage B engineer | active | keep / simplify later (convention bulk) |
| performance-analyst.md | 133 | Read-only perf analysis; conditional gate | active | keep |
| qa-fast.md | 94 | Read-only pre-impl risk scan; E2E-authoring recommendation; warning channel | active | keep (orchestrator-immutable) |
| qa.md | 130 | Test engineer; verification mode is a read-only terminal gate | active | keep (orchestrator-immutable) |
| security-reviewer.md | 148 | Read-only security review; Gate F target | active | keep |
| spec-enricher.md | 71 | Sprint-kickoff spec structuring (sprint-tier, not Mode-3) | active | keep (out of Mode-3 scope) |
| supabase-engineer.md | 195 | Supabase infra specialist; canonical Supabase-mutation ban | active | keep |
| team-lead.md | 161 | Modes 1–2 analysis + Mode-3 deprecation shim | active but **stale**: describes orchestrator toolkit as `Task, Bash, …` (:132, :134 — actual is `Agent, …, SendMessage`); Mode-2 "Delegate via Task tool" (:99) contradicts its own no-Task toolset (:19); dead probe paths (:130, :138) | fix stale refs; Mode-2 delegation needs-user-decision |
| ui-designer.md | 451 | Read-only UI audit/exploration | active | simplify later (largest file, near-zero Mode-3 coupling) |
| mode3-orchestrator.md / chatgpt-gatekeeper.md | — | see §1 rows 11–12 | — | — |

Cross-file boilerplate measured across agent files (consolidation targets):

- `## Model tier & escalation` + pointer to `MODEL_TIERING_AND_ESCALATION.md`: **12 files**, structurally identical with divergent wording ("never raise your own model and never spawn agents" in 11 files; architect and spec-enricher use variant phrasings).
- `ESCALATION_REQUIRED` template pointer: 7 files, three different trailing clauses.
- jCodemunch-first `[jcm]` clause: 7 files, identical base sentence; code-reviewer/security-reviewer append a "discovery only" caveat.
- Supabase-mutation ban: canonical in supabase-engineer.md; echoed in backend-engineer.md and architect.md.
- `_ds_bundle.js` ban, literal "do not merge", worktree rules: **absent from all agent files** (they live at the workflow layer — CLAUDE.md §10, mode3 contracts, AGENTS.md).

## 3. Route-and-Run / sprint layer

| File | Lines | Purpose | Consumer | Status | Recommendation |
|---|---|---|---|---|---|
| `.claude/skills/ROUTE_AND_RUN.md` | 987 | Canonical per-PR execution policy: triage, classification, execution modes, routing, gates, evidence contracts, GSR | Main Agent, `/quick`, sprint executor, mode3 (choreography source) | active/canonical | keep; **fix §10 conflict** (pre-approved `gh pr merge`); de-dup Decision-Lock/Delta-Only with gates.md (deferred) |
| `.claude/skills/ROUTE_AND_RUN_TABLES.md` | 142 | Routing decision tables A–I | Orchestrator Step 2 | active/companion | keep; resolve "who wins" contradiction with SKILL.md |
| `.claude/skills/SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md` | 830 | Sprint-level orchestration + rolling checkpoint | Sprint mode, `/resume-sprint` | active/canonical | keep (out of Mode-3 edit scope except merge-approval precedence) |
| `.claude/skills/PARALLEL_LANES.md` | 172 | Multi-session protocol for the discover migration (#795) | Human-coordinated sessions | active/narrow, orthogonal to Mode-3 | keep untouched; archive is a user decision |
| `.claude/skills/route-and-run/SKILL.md` | 76 | Thin skill entrypoint/loader + invariants summary | Skill tool | active/canonical entrypoint | keep; fix authority-order wording |
| `.claude/skills/route-and-run/gates.md` | 624 | Gate packet schemas + gate ops (manual ChatGPT lane) | Main Agent (standalone lane) | active, heavy overlap with mode3 contracts; pre-#1221 schema | keep; add explicit lane statement (manual vs automated); enum unification deferred to user decision |
| `.claude/commands/quick.md` | 35 | `/quick` low-ceremony lane with eligibility blocklist | User | active | keep |
| `.claude/commands/resume-sprint.md` | 287 | Sprint resume prompt generator | User | active | keep; "Mode 3 resume" naming collision noted |
| `.claude/prompts/invoke-*.md` (4) | 13–35 | Trigger-phrase prompts | User | active | keep |
| `.claude/prompts/code-review-{backend,frontend}.md` | 71/76 | Review brief templates | code-reviewer invocation | active; **dead pointer** to non-existent `code-review-orchestrator.md` | keep + fix pointer |
| `.claude/prompts/review-templates/scope-change-review-template.toml` | 35 | SCOPE_CHANGE_REVIEW packet | scope-lock flow, openai_gate.py | active | keep |
| `.claude/PR_RULES.md` | 136 | Manual-lane PR discipline | Manual tasks | active; superseded inside automated lanes | keep (clarification deferred) |
| `.claude/MODEL_TIERING_AND_ESCALATION.md` | 245 | Model tiers, escalation authority, parallelism | Orchestration layer | active/canonical | keep |
| `.claude/TOOLING.md` | 124 | Command permission policy, E2E placement | All agents | active; merge pre-approval exception needs §10 cross-ref | keep + cross-ref |
| `.claude/TESTING.md` | 49 | Test-first rules | Engineers/qa | active | keep |

## 4. Templates, gate scripts, hardening docs, runtime state

### Templates (`.claude/templates/`, 14 files)

| File | Purpose / consumer | Status | Recommendation |
|---|---|---|---|
| approved-execution-handoff.toml | Main-Agent→orchestrator boundary packet (schema v2); read by verify-mode3-workdone + team-invariant | active, load-bearing | keep; field names frozen (`[plan].approved_plan_sha256`, `[executor].forbidden_globs`, `[eval_checklist].items`, `[executor].model`) |
| workdone-candidate.toml | Orchestrator success packet (`handoff_sha256`, `[eval_checklist_result]`, `[routing_decision_log]`) | active, load-bearing | keep; fields frozen |
| blocked.toml | Failure/halt packet, 18 reason codes; supersedes tooling-blocked.toml | active | keep |
| active-run-lock.toml | Phase 0.0 duplicate-run lock | active, load-bearing | keep; fields frozen (`second_attempt_approved`, `current_phase`, `selected_ports`) |
| orchestrator-agent.toml | Durable orchestrator identity (Design B respawn) | active | keep |
| rework-request.toml | Disk-before-send rework brief | active | keep |
| notification.toml | Dual-channel notification payload | active | keep (schema intentionally mirrored in execution-log template) |
| team-lead-execution-log.md | Append-only audit-trail template incl. ROUTING DECISION hard-gate entry | active; **BUG: heading `— ROUTING DECISION` lacks the `[ROUTING DECISION]` marker verify-mode3-workdone.py:146 greps for** | keep + fix marker |
| validation-matrix.md | Copy-to-issue COMPACT/FULL skeletons (NOT a duplicate of the contract — policy vs skeleton pair) | active | keep |
| EXECUTOR_PROMPT.md.template | Legacy split-session executor prompt, still wired via `openai_gate.py` `{{ISSUE}}`/`{{GATE}}` substitution on PLAN_REVIEW APPROVED | legacy but wired (unclear) | keep untouched; needs-user-decision to modernise (script edit required in lockstep) |
| runtime-probe.md | Behavioural tool-availability probe doctrine | active | keep |
| delegation-packet.toml / escalation-required.toml | Generic delegation/escalation shapes (MODEL_TIERING §0/§3/§8) | active, tangential | keep |
| tooling-blocked.toml | Path-B (nested-subagent era, #1093) fallback; `required_tools` includes removed `Task` | **stale — superseded** (blocked.toml header + hardening report both say so; no live consumer) | mark deprecated (deletion = user decision) |

### Gate + verify scripts (`.claude/scripts/`)

| File | Enforces | Tests |
|---|---|---|
| openai_gate.py | Secure OpenAI gate submission; strict verdict schema — **canonical field is `verdict`**; per-gate enums: PLAN_REVIEW `APPROVED/REVISION_REQUIRED/BLOCKED/NEEDS_USER_DECISION/NEEDS_MORE_EVIDENCE`; WORKDONE_REVIEW `APPROVED_FOR_PR/NEEDS_FIXES/NEEDS_MORE_EVIDENCE/NEEDS_USER_DECISION`; PR_REVIEW `APPROVED_TO_MERGE/NEEDS_FIXES/NEEDS_MORE_EVIDENCE/NEEDS_USER_DECISION`; #1221 structured objects | ✅ test_openai_gate.py |
| verify-mode3-workdone.py | Phase-7C preflight: sha chain, routing-log (`[ROUTING DECISION]` literal), scope-lock diff, eval-checklist coverage | ✅ |
| verify-mode3-team-invariant.py | Static doc invariants: Opus-everywhere, Agent-not-Task, fail-fast, Design-B continuity phrases | ✅ |
| verify-mode3-duplicate-run-guard.py | Static doc invariants for the #1534 guard + live active-run scan | ✅ |

### Hardening docs (`.claude/hardening/`, 7 files)

All historical/forensic design records (three carry explicit "history record" banners); current rules live in the contracts. Two are operational rollback runbooks (mode3-agent-teams-rollback, mode3-routing-authority-rollback). Recommendation: keep all; never treat as active rule sources; consolidation/archive = user decision. Their `via Task` wording is accurate history and is left untouched.

### Runtime state / adjacent

| Path | Status vs Mode-3 | Recommendation |
|---|---|---|
| `.claude/active-runs/README.md` + `.gitignore` | active, load-bearing (`*.lock` gitignore asserted by guard script) | keep |
| `.claude/autopilot/**` (3 files) | design-only, DRY-RUN, unwired | keep untouched |
| `.claude/docs/openai-gate.md` + `.claude/openai-gates/README.md` | active; manual omits the #1221 `verdict-structured.json` sidecar | keep + minor fix |
| `.claude/state/*` (current-pr, flyway-claims, discover plans), STATE.md, MERGE_AUDIT_TRAIL.md, SHIP_LOG.md | ROUTE_AND_RUN/sprint runtime state, not Mode-3 infra; some stale | leave untouched (out of scope) |
| `.claude/settings.json` | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is the Mode-3 transport enabler; hooks block chained Bash; PostToolUse merge-log hook has a machine-specific absolute path | keep untouched |
| `memory/MEMORY.md` | product/sprint memory; "sequential only" user preference constrains orchestrator parallelism | keep untouched |
| `.antigravity/**` | manual downstream mirror; its verifier checks self-consistency only, NOT drift vs `.claude` | keep untouched; sync policy = user decision |

## 5. Adjacent systems (inventoried, explicitly out of edit scope)

| Path | What it is | Why out of scope |
|---|---|---|
| `.antigravity/**` | Parity port of Mode-3 for the Antigravity tool (own commands/contracts/verifiers) | Separate consumer; syncing it is a follow-up decision, not part of this refactor |
| `.claude/skills/SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md`, `resume-sprint.md`, `spec-enricher` | Sprint-level orchestration | Only touched where it conflicts with Mode-3 docs |
| `.claude/autopilot/**` | DRY-RUN-only DoD gate design (#1273) | Explicitly unwired by design; left untouched |
