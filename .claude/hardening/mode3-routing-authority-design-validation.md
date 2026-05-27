# Mode-3 Routing Authority — Design Validation Report

**Date:** 2026-05-15
**Branch:** `main` (post-#1097 merge)
**Status:** Validation report. No implementation. No PR. No OpenAI gates invoked.
**Prompted by:** Safety dry-run on 2026-05-15 (`.claude/handoffs/agent-team-safety-probe/probe-evidence.toml`) revealed that the executor refuses the role; before patching, we need to nail down the routing-authority split first.

---

## TL;DR — Final Recommendation

**Adopt Option C — Hybrid. Main Agent writes the *boundary*; the Mode-3 Orchestrator decides the *sequence within that boundary*; Main Agent verifies the routing log before WORKDONE_REVIEW.**

The current `/mode3-run` is Option A in disguise (Main Agent pre-fills `allowed_specialists` from approved plan routing). That's not wrong, but it's stricter than necessary and arguably collapses the Orchestrator into a glorified shell script. Option B (pure Orchestrator autonomy) is too loose for an experimental top-level Agent Teams pattern. Option C splits authority cleanly: Main Agent owns "what may be done" (boundary, risk tier, mandatory gates, allowed/forbidden globs); Orchestrator owns "in what order, by whom, and why" (sequencing, per-call routing, evidence logging).

Follow-up implementation should ship as a single small workflow PR after PLAN_REVIEW. Suggested title: **"Mode-3 Orchestrator: split routing authority + dedicated agent definition"**.

---

## 1. Current policy (as it exists today, post-#1097)

### Route-and-Run choreography (already authoritative)

`.claude/skills/ROUTE_AND_RUN.md` + `.claude/skills/ROUTE_AND_RUN_TABLES.md` define the choreography. Verbatim policy from the supplement-002 inspection report:

- **qa-fast first** (`ROUTE_AND_RUN.md:352`, mandatory unless ALL Lean-mode skip conditions hold `ROUTE_AND_RUN.md:357–369`)
- Engineer (frontend/backend/supabase per issue type; architect first if architecture trigger; ui-designer first if UI design trigger)
- **code-reviewer** AFTER engineer (`ROUTE_AND_RUN.md:471`; skip only `risk=low AND single-file AND no-logic`). Default sonnet, **opus override for high-risk auth/payments/migrations/data-integrity** (`code-reviewer.md:5`)
- **security-reviewer** (Gate F triggers: auth/JWT/secrets/PII/payments/CORS/CSP/RLS/PII migrations, `ROUTE_AND_RUN_TABLES.md:68–72`)
- qa E2E authoring (conditional; only when qa-fast recommends YES)
- **qa verification** mandatory for Normal/High-risk before commit/push/PR (`ROUTE_AND_RUN.md:495`, `qa.md:2–3`)
- **Reroute limit: 2 cycles per specialist per PR** (`ROUTE_AND_RUN.md:473–474`, `SKILL.md:57`)
- **High-risk minimum**: qa-fast + engineer + code-reviewer(opus) + security-reviewer + qa verification (`ROUTE_AND_RUN.md:64` tier table)

**Who chooses specialists today, in non-Mode-3 ROUTE_AND_RUN?**
- The Main Agent does, walking the routing tables in `ROUTE_AND_RUN_TABLES.md`. There is no separate orchestrator role for ordinary issue execution.

**Who chose specialists in pre-#1097 Mode-3 (Path B nested Team Lead)?**
- `team-lead.md` Mode-3 prose (now removed by #1097) said: *"Route specialists via the Task tool, one at a time. Use the standard ROUTE_AND_RUN sequence."* The Team Lead subagent DID own per-call routing; the Main Agent supplied the approved plan but not the exact sequence. This is essentially Option B (Orchestrator policy-based routing). It failed for transport reasons, not authority reasons.

**Who chooses specialists in post-#1097 `/mode3-run`?**
- Ambiguous. The current `/mode3-run` Phase 2 step 4 says *"Derive `executor.allowed_specialists` from approved plan routing"* — i.e. Main Agent pre-fills a fixed list. The executor's prompt then describes the choreography but doesn't say "you may choose order." In practice this is Option A.

**Concept of mandatory/optional specialists by risk tier:**
- Already exists in `ROUTE_AND_RUN.md:64` tier table. High-risk has a non-negotiable minimum set. Low-risk has narrow skip authority. This is the natural seam for Option C.

---

## 2. Correct future design

### Comparison of the three options against project goals

| Aspect | A: Main Agent bounded routing | **C: Hybrid (recommended)** | B: Team Lead policy-based |
|---|---|---|---|
| Token economy | ❌ Main Agent walks routing tables on Opus | ✅ Orchestrator (Sonnet) walks tables | ✅ Orchestrator walks tables |
| Main Agent burden | High — must pre-decide sequence | Low — declares boundary, verifies log | Low — declares boundary |
| Orchestrator role | Glorified shell | Genuine orchestrator | Full orchestrator |
| Safety | Tight | Tight (with audit) | Looser (audit must catch drift) |
| Audit | Trivial (just check the list) | Strong (route decision logged + verified) | Strong if guardrails hold |
| User goal alignment | Worst (defeats point of cheap Team Lead) | Best (matches stated goal verbatim) | Good (but no guardrail backstop) |

### Recommendation: **Option C — Hybrid**

Reasoning: the user's stated goal is *"Main Agent plans and gates; cheaper Team Lead orchestrates; user only approves at start/end."* Option A makes the Main Agent orchestrate. Option B has no harness-level safety net if Route-and-Run policy is misinterpreted. Option C gives the Orchestrator real routing authority within a Main-Agent-defined boundary AND requires an auditable routing log that Main Agent verifies before WORKDONE_REVIEW.

---

## 3. Recommended responsibility split

| Responsibility | Owner |
|---|---|
| Issue intake (read body, comments, labels, milestone) | **Main Agent** |
| Approved plan (PLAN_REVIEW packet authoring + gate invocation) | **Main Agent** |
| Risk tier classification (`trivial \| normal \| high-risk \| doc-only`) | **Main Agent** (per ROUTE_AND_RUN.md Step 1B) |
| Allowed file scope (`allowed_file_globs`) | **Main Agent** |
| Forbidden file scope (`forbidden_globs`, plus mandatory `**/.env*`, `**/secrets/**`) | **Main Agent** |
| Specialist allowlist (broad category — engineers/reviewers/qa) | **Main Agent** (derived from issue type) |
| Mandatory gates (e.g. security-reviewer for Gate F) | **Main Agent** (derived from risk tier + triggers) |
| **Deciding specialist sequence** (which engineer, when to add ui-designer/architect, when to re-route) | **Orchestrator** |
| Invoking specialists via `Task` | **Orchestrator** |
| Re-routing after QA/reviewer feedback (within 2-cycle limit) | **Orchestrator** |
| Deciding blocked vs continue | **Orchestrator** (writes `blocked.toml` on stop conditions) |
| Writing `workdone-candidate.toml` | **Orchestrator** |
| Writing `team-lead-execution-log.md` (including routing decisions) | **Orchestrator** |
| **Scope-lock verification (authoritative)** | **Main Agent** (via `git diff --name-status`) |
| **OpenAI gates (PLAN_REVIEW, WORKDONE_REVIEW, PR_REVIEW)** | **Main Agent** |
| PR creation | **Main Agent** |
| Merge | **Main Agent** (with explicit user approval) |
| Closeout + main sync + re-index | **Main Agent** |

---

## 4. Handoff contract design

### `approved-execution-handoff.toml` SHOULD contain:

| Field | Inclusion | Notes |
|---|---|---|
| `plan.approved_plan_path` + `approved_plan_sha256` | ✅ | Integrity chain anchor |
| `risk_tier` | ✅ NEW | `trivial \| normal \| high-risk \| doc-only` |
| `issue_type` | ✅ NEW | `bugfix \| small-change \| feature \| refactor \| perf \| security \| incident \| ui` |
| `executor.allowed_file_globs` | ✅ | Main Agent owns |
| `executor.forbidden_globs` | ✅ | Main Agent owns; always includes `**/.env*`, `**/secrets/**` |
| `executor.specialist_policy.category_allowlist` | ✅ CHANGE | Broad: `engineers = [frontend-engineer, backend-engineer, supabase-engineer]` rather than a single exact list. Orchestrator picks within. |
| `executor.specialist_policy.always_forbidden` | ✅ NEW | e.g. `general-purpose` (not in Route-and-Run vocabulary), any agent type not in the standard set |
| `executor.specialist_policy.mandatory_gates` | ✅ NEW | `["qa-fast", "code-reviewer", "qa-verification"]` for Normal; add `"security-reviewer"` for Gate F triggers; add architect for architecture gates |
| `executor.specialist_policy.conditional_gates` | ✅ NEW | `[{name = "ui-designer", trigger = "ui_design_gate"}, {name = "architect", trigger = "architecture_gate"}, {name = "qa-e2e-authoring", trigger = "qa-fast recommends YES"}]` |
| `executor.specialist_policy.skip_authority` | ✅ NEW | Quotes the policy verbatim with rule citations |
| `executor.model` | ✅ | MVP: `sonnet`. See §8. |
| `executor.token_budget` | ✅ NEW | `max_specialist_invocations`, `max_minutes` already exist; add `target_tokens` as advisory |
| `authority.*` (5 false flags) | ✅ | Locked |
| `qa_requirements.*` | ✅ | Already present |
| `indexing.*` | ✅ | Already present |
| `[stop_conditions]` | ✅ | Already present |
| `escalation_rules` | ✅ NEW | What Orchestrator does on (a) Gate F discovered after start, (b) scope expansion needed, (c) Lean-mode skip eligible — see §6 |
| **Exact `allowed_specialists` list** | ❌ REMOVE | Replaced by `specialist_policy.category_allowlist + mandatory_gates + conditional_gates`. Orchestrator decides exact route. |
| **Exact specialist sequence** | ❌ NEVER | That is the Orchestrator's decision per Route-and-Run policy |

### What the Orchestrator MUST log per routing decision

`team-lead-execution-log.md` gets a new entry type: **routing decision**, written BEFORE the first specialist call.

```md
## <ts> — ROUTING DECISION
phase: routing
risk_tier: normal
issue_type: bugfix
selected_sequence:
  1. qa-fast — mandatory per ROUTE_AND_RUN.md:352
  2. frontend-engineer — chosen because issue touches src/components/**/*.tsx
  3. code-reviewer (sonnet) — mandatory per ROUTE_AND_RUN.md:471
  4. qa (Mode: verification) — mandatory per ROUTE_AND_RUN.md:495
skipped:
  - architect: not needed; no architecture decision pending (approved plan does not flag it)
  - security-reviewer: Gate F triggers absent (no auth/JWT/secrets/PII/payments/CORS/CSP/RLS in scope)
  - ui-designer: no UI redesign requested
  - qa E2E authoring: qa-fast did not recommend YES
expected_evidence:
  - qa-fast: risk register + test-case checklist
  - frontend-engineer: diff + commits + test command output
  - code-reviewer: APPROVE | REQUEST_CHANGES verdict
  - qa: PASS | FAIL with output_excerpt
```

The Main Agent re-reads this log during WORKDONE_REVIEW intake. If the Orchestrator's decisions violate the boundary or skip a mandatory gate without justification, the lead writes `blocked.toml(REVIEW_FAILED \| SECURITY_FAILED \| QA_FAILED \| OUT_OF_SCOPE)` as appropriate.

---

## 5. Orchestrator routing policy

### Inputs the Orchestrator reads (all canonical, no chat context)

1. `.claude/handoffs/issue-<N>/approved-execution-handoff.toml`
2. `.claude/handoffs/issue-<N>/approved-plan.toml`
3. `.claude/skills/ROUTE_AND_RUN.md` + `.claude/skills/ROUTE_AND_RUN_TABLES.md`
4. qa-fast boundary findings (after Phase 5 step 1 runs)
5. Prior specialist evidence (when re-invoking after REQUEST_CHANGES, max 2 cycles)
6. Issue body (from `gh issue view` excerpt embedded in approved plan)

### Decision procedure

1. **Read risk tier from handoff.** High-risk → must include qa-fast + engineer + code-reviewer(opus override) + security-reviewer + qa verification. Normal → must include qa-fast + engineer + code-reviewer + qa verification, plus security-reviewer if Gate F triggers. Trivial → may use Lean-mode skip if ALL conditions hold. Doc-only → may skip engineer.
2. **Map issue type → engineer specialist.** Use ROUTE_AND_RUN_TABLES.md sections A-I.
3. **Detect Gate F triggers from approved plan scope.** If any allowed_file_glob is under auth / RLS / payments / secrets paths, add `security-reviewer` even if Main Agent did not require it. (Orchestrator may ADD mandatory gates; never REMOVE.)
4. **Detect architecture/UI gates.** If `architect` was named in approved plan routing, add it first. If `ui-designer` was named, add it first for frontend issues.
5. **Write the routing decision log entry** (template in §4) BEFORE invoking the first specialist.
6. **Execute sequentially**, appending log entries after each call.
7. **On REQUEST_CHANGES**, re-invoke engineer once; if cycle-2 fails → `blocked.toml(REROUTE_LIMIT_EXCEEDED \| REVIEW_FAILED)`.
8. **On terminal artefact**, write `workdone-candidate.toml` if QA/E2E gate satisfied; else `blocked.toml`.

### Routing decisions the Orchestrator may NOT make on its own

- Skipping a Main-Agent-declared mandatory gate
- Adding a specialist outside `specialist_policy.category_allowlist`
- Editing files outside `allowed_file_globs`
- Using a model override that's not authorised by Main Agent (e.g. cannot promote code-reviewer to opus if Main Agent didn't tier it high-risk — must escalate via `blocked.toml(SCOPE_EXPANSION_REQUIRED)`)

---

## 6. Guardrails

| Guardrail | Enforcement layer |
|---|---|
| Routing decision MUST be logged before first specialist call | Orchestrator prompt + Main Agent WORKDONE_REVIEW intake checks |
| Cannot call specialists outside `category_allowlist` | Orchestrator prompt + verified by Main Agent reading log |
| Cannot touch `forbidden_globs` or `must_not_touch` | Orchestrator prompt + Main Agent scope-lock `git diff --name-status` |
| Cannot change scope | `authority.scope_change = false` flag (locked) |
| Cannot skip mandatory gates | Orchestrator prompt + Main Agent verifies all mandatory specialists appear in log with verdicts |
| MUST write `blocked.toml` on ambiguity, scope expansion need, Gate F triggers discovered late | Orchestrator prompt + new reason codes already shipped |
| Main Agent verifies routing log BEFORE WORKDONE_REVIEW | New explicit intake step (currently implicit) |
| `security-reviewer` MUST run for workflow / authority changes | Already in supplement AC13; carries over |
| Behavioural Task probe required pre-execution | Existing /mode3-run Phase 0.2 |
| File-based handoff authoritative; pane output not | Existing AC6 |
| Adversarial probe required before first production dry-run | FU3 (post-merge) |
| No silent model escalation (Haiku → Sonnet) | New Orchestrator prompt rule (see §8) |

---

## 7. Agent file design

### Recommended name: **`mode3-orchestrator`**

`.claude/agents/mode3-orchestrator.md` — purpose-built agent definition.

**Why not reuse `team-lead.md`?**
- The 2026-05-15 safety dry-run proved that the spawn pattern `Agent(subagent_type="team-lead", team_name=…)` is self-blocked by the role refusal we added in #1097. The model reads the agent definition and refuses regardless of spawn context.
- Reusing `team-lead.md` would force prompt-level overrides — fragile and confusing.
- A dedicated agent file makes the role unambiguous: this file's prose IS the Orchestrator role.

### Persistent vs per-issue separation

| Lives in `mode3-orchestrator.md` | Lives in `approved-execution-handoff.toml` |
|---|---|
| Role identity + authority constraints | issue, risk tier, scope, mandatory gates |
| Refusal rules (prompt injection / authority) | qa_requirements |
| File-handoff-authoritative invariant | indexing baseline |
| Indexed-first navigation rule | specialist_policy boundary |
| Reroute-loop policy (2 cycles) | model + token budget |
| Routing decision log template | escalation rules |
| Source-of-truth invariant | execution timeline |

### `team-lead.md` after this follow-up

- Frontmatter unchanged (`tools: Read, Grep, Glob`).
- Modes 1 + 2 prose retained.
- "Mode 3 has moved" pointer retained AND tightened: *"...moved to the **`mode3-orchestrator` agent** invoked via `/mode3-run`. The team-lead subagent does not participate in Mode 3."*

### `/mode3-run` update

- Phase 0.2 step 4 changes from `Agent(subagent_type="team-lead", …)` to `Agent(subagent_type="mode3-orchestrator", …)`.
- No other change in `/mode3-run` flow.

---

## 8. Model choice

### Recommended MVP default: **Sonnet**, NOT Haiku

The user proposes "default Haiku for orchestration with behavioural probe + escalation policy." I disagree for the MVP, and here is why:

1. **Safety probe evidence.** The 2026-05-15 dry-run showed a Sonnet teammate REFUSED a role definition it didn't recognise. Haiku is generally more rigid about following stated rules. If Sonnet refused, Haiku will almost certainly refuse the same way. Move to Haiku only after we've seen Sonnet succeed end-to-end repeatedly.
2. **Routing complexity.** Option C requires the Orchestrator to read Route-and-Run policy, map issue type to engineer, detect Gate F triggers, write a routing decision log, and re-route on REQUEST_CHANGES within a 2-cycle limit. That is non-trivial multi-step reasoning. Sonnet handles it. Haiku may not — and we have no behavioural evidence either way.
3. **Reliability before cost.** The MVP goal is to prove the architecture works. After 3 successful Sonnet dry-runs (FU4), evaluate Haiku in a controlled comparison.
4. **No silent escalation.** Agreed in principle. Concrete rule: if `mode3-orchestrator` on its declared model encounters a routing decision it cannot make (e.g. refuses to choose, returns vague output, fails to invoke Task), Orchestrator writes `blocked.toml(reason_code=UNKNOWN, detail="model_routing_failure: …")`. Main Agent reports to user. User decides whether to retry on Sonnet/Opus. No autoswap.

### Policy summary

- **MVP**: `executor.model = "sonnet"` for the first 3 successful dry-runs (matches approved supplement decision).
- **Haiku trial**: post-3-successes (FU4) — a controlled comparison, dedicated issue, with cost telemetry.
- **No silent escalation**: a model that can't perform the role writes `blocked.toml` and stops; user decides next.
- **Behavioural probe before real work**: existing `/mode3-run` Phase 0.2 sentinel probe stays mandatory regardless of model.

---

## 9. Final recommendation

### Recommended option
**Option C — Hybrid.** Main Agent declares the boundary; Orchestrator decides the sequence within the boundary; Main Agent verifies the routing log before WORKDONE_REVIEW.

### Proceed with follow-up issue?
**Yes.** The current `/mode3-run` is partially Option A and is **self-blocked by the team-lead.md role refusal** (safety dry-run evidence). A small, scoped follow-up PR unblocks the design and aligns it with the user's stated goal.

### Suggested issue title
**`Mode-3 Orchestrator: split routing authority + dedicated agent definition`**

### Exact implementation scope (allowlist for the follow-up PR)

```
.claude/agents/mode3-orchestrator.md             (NEW — purpose-built role definition)
.claude/commands/mode3-run.md                    (UPDATE — Phase 2 step 4 change; Phase 0.2 spawn subagent_type; routing-decision log entry pre-call requirement)
.claude/templates/approved-execution-handoff.toml (UPDATE — replace exact allowed_specialists with [executor.specialist_policy] section: category_allowlist, mandatory_gates, conditional_gates, skip_authority, always_forbidden; add risk_tier, issue_type, escalation_rules)
.claude/templates/team-lead-execution-log.md     (UPDATE — add routing-decision entry template)
.claude/templates/workdone-candidate.toml        (UPDATE — add [routing_decision_log] section the lead reads during intake; add skip_log entries that mirror routing decisions)
.claude/agents/team-lead.md                      (UPDATE — tighten Mode-3 pointer to name the new mode3-orchestrator agent)
.claude/skills/route-and-run/SKILL.md            (UPDATE — Main Agent Role bullet repointed; one new sentence on routing-decision-log verification)
.claude/skills/ROUTE_AND_RUN.md                  (UPDATE — Mode-3 top-of-file callout repointed)
.claude/hardening/mode3-routing-authority-rollback.md (NEW — rollback doc)
```

**Forbidden (same as #1096):** product code, qa.md, qa-fast.md, openai_gate.py, hardening forensic files (except the new rollback doc), unrelated workflow telemetry (#1091).

### Exact acceptance criteria (numbered for PLAN_REVIEW)

```
AC1 — `.claude/agents/mode3-orchestrator.md` exists with frontmatter `tools: Read, Grep, Glob, Task, Bash, Write, Edit` (full top-level teammate toolkit; the spawn is via Agent Teams so these will be schema-callable). Prose enumerates the Orchestrator role: read handoff + approved plan + Route-and-Run; write routing decision log entry BEFORE first Task call; invoke specialists in chosen order; append execution log; reroute within 2-cycle limit; write workdone-candidate.toml OR blocked.toml; file-handoff-authoritative invariant; prompt-injection refusal (12-item list mirroring /mode3-run); source-of-truth invariant.

AC2 — `mode3-orchestrator.md` MUST contain the verbatim line: "Agent Teams is transport; Route-and-Run defines choreography. The Orchestrator follows Route-and-Run; it does not redefine it."

AC3 — `mode3-orchestrator.md` MUST contain a routing-decision log template that the Orchestrator writes BEFORE the first specialist call, listing selected_sequence with rule citations, skipped specialists with justification, and expected_evidence per specialist.

AC4 — `.claude/templates/approved-execution-handoff.toml` schema updated: replace `executor.allowed_specialists` with `[executor.specialist_policy]` containing `category_allowlist`, `mandatory_gates`, `conditional_gates`, `skip_authority`, `always_forbidden`. Add top-level `risk_tier` and `issue_type`. Add `[escalation_rules]` (what to do on Gate F discovered late, scope expansion, Lean-mode skip eligible).

AC5 — `.claude/commands/mode3-run.md` Phase 0.2 step 4 changes from `subagent_type="team-lead"` to `subagent_type="mode3-orchestrator"`. Phase 2 (build handoff) writes the new `specialist_policy` block instead of exact `allowed_specialists`.

AC6 — `.claude/commands/mode3-run.md` Phase 5 requires the Orchestrator to write the routing decision log entry BEFORE the first specialist call. Main Agent Phase 7 intake reads this entry and verifies it matches the boundary (no mandatory gate skipped, no forbidden specialist used, all selected specialists within category_allowlist).

AC7 — `.claude/templates/team-lead-execution-log.md` has the routing-decision entry template documented.

AC8 — `.claude/templates/workdone-candidate.toml` includes `[routing_decision_log]` section that summarises the sequence + skip justifications + Route-and-Run rule citations. WORKDONE_REVIEW fails if this section is missing.

AC9 — `.claude/agents/team-lead.md` Mode-3 pointer mentions the new `mode3-orchestrator` agent by name.

AC10 — `.claude/skills/route-and-run/SKILL.md` and `.claude/skills/ROUTE_AND_RUN.md` Mode-3 callouts repointed to the new agent name. Add one sentence under Main Agent Role: "When using /mode3-run, Main Agent verifies the Orchestrator's routing decision log against the handoff boundary before invoking WORKDONE_REVIEW."

AC11 — Adversarial probe instructions added to mode3-orchestrator.md (12-item refusal list mirroring /mode3-run §"Authority hardening").

AC12 — No model silent escalation. Orchestrator on its declared model writes blocked.toml(UNKNOWN) on routing failure; user decides retry.

AC13 — security-reviewer in PR routing (Gate F triggers: new authority boundary).

AC14 — Rollback documented at `.claude/hardening/mode3-routing-authority-rollback.md`: deleting `mode3-orchestrator.md` and reverting /mode3-run spawn to `team-lead` falls back to the post-#1097 state (which is non-functional but recoverable to Path C).

AC15 — Re-run the safety probe successfully against the new spawn pattern: Orchestrator completes all 5 parts (tool inheritance self-report via actual invocation, per-action authority refusal, behavioural Task sentinel, file-based handoff, finalisation), writes probe-evidence.toml itself, lead reads from disk.

AC16 — End-to-end dry-run on a trivial throwaway issue (one-line copy tweak) completes Planner → Orchestrator → Reviewer, producing all four handoff artefacts and a real merged PR. Cost telemetry recorded.

AC17 — No product code touched. Allowed-change set limited to the 9 paths listed in the implementation scope above.

AC18 — qa.md and qa-fast.md UNTOUCHED.

AC19 — openai_gate.py UNTOUCHED.
```

### PLAN_REVIEW supplement needed?

**Yes — a fresh PLAN_REVIEW for the follow-up issue.** This is enough of a design change (new agent file, schema change in approved-execution-handoff, new routing-decision log entry) that #1096's approval does not transitively cover it. Submit a new packet against the new issue number.

### Important constraints honoured

- ✅ Route-and-Run NOT weakened — Orchestrator follows it verbatim; Main Agent enforces by reading the routing log.
- ✅ qa-fast / qa / code-reviewer / security-reviewer NOT skipped where policy requires them — encoded as `mandatory_gates`.
- ✅ Main Agent orchestration burden NOT increased — Main Agent declares boundary, then steps back during execution.
- ✅ User goal preserved — Main Agent plans + gates; cheaper Orchestrator (Sonnet) orchestrates; user approves at start + end.
- ✅ Agent Teams is transport; Route-and-Run defines choreography — the new agent definition states this verbatim.

---

## Appendix — Why the safety probe outcome motivates this validation

The 2026-05-15 safety probe (`.claude/handoffs/agent-team-safety-probe/probe-evidence.toml`) showed:

1. The Sonnet teammate read `team-lead.md` (the post-#1097 version) and refused to act because the prose explicitly says "refuse Mode-3 orchestration requests as a subagent."
2. The model has no reliable way to introspect "I am a teammate (top-level CC session), not a subagent." Both spawn paths land on the same agent definition.
3. Consequence: the documented `/mode3-run` pattern is currently self-blocked.

A purpose-built `mode3-orchestrator` agent file removes the ambiguity at the **role-definition layer**, not at the **prompt-override layer**. That is the cleaner fix and it also gives us a natural home for the Option C routing-authority changes recommended here.

The validation report is now complete. **No code has been written.** When you say go, I will open the follow-up issue with the AC1–AC19 list above and prepare its PLAN_REVIEW packet for OpenAI submission.
