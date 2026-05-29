# Model Tiering & Escalation Policy

> **Authoritative** for: which model tier each agent runs on, who is allowed to choose/raise the tier, when escalation is permitted, and what a subagent must return when it cannot complete safely.
>
> Scope: workflow/orchestration only. This document changes **no product code**. It consolidates rules that were previously implicit or scattered (`SKILL.md:57`, `code-reviewer.md:5`, `mode3-orchestrator.md` forbidden-action #8, "No silent model switch") into one explicit, auditable place.

---

## 0. Core principle

**Model escalation happens only at delegation boundaries and is owned by the orchestration layer — never by the subagent doing the work.**

- A subagent runs on its **configured/default tier** (its `model:` frontmatter) unless the delegator explicitly assigned a different tier in the delegation packet.
- A subagent **MUST NOT** silently raise its own model, spawn a replacement agent, or recursively launch other agents.
- When a subagent's assigned tier or scope is insufficient, it **stops** and returns `ESCALATION_REQUIRED` (§4). It does not "try harder on a bigger model" on its own initiative.
- Raising a tier to Opus, or widening scope, is a **delegator decision** (Orchestrator within its boundary; Main Agent / gate approval for expensive, architectural, or policy-changing work — §3).

This is the cost-control invariant. Expensive model use must be explicit, justified, and traceable to a delegation decision.

---

## 1. Tiers

| Tier | Model id | Use for |
|---|---|---|
| **Cheap / default** | `haiku` (`claude-haiku-4-5`) | bounded grep/search/exploration, simple file inspection, small test classification, formatting-only edits, small doc edits, simple QA smoke checks, mechanical report generation from known evidence |
| **Standard** | `sonnet` (`claude-sonnet-4-6`) | normal implementation, focused frontend/backend changes, non-trivial test fixes, cross-file reasoning within a bounded area, code review needing real reasoning, QA analysis where failures need interpretation |
| **High-context** | `opus` (`claude-opus-4-8`) | architecture decisions, broad refactors, ambiguous root-cause analysis across many files, workflow/gate-policy changes, security-sensitive reasoning, merge-risk decisions, unresolved escalations from Sonnet, anything likely to exceed normal context/reasoning limits |

`model:` frontmatter values must be exactly one of `haiku` | `sonnet` | `opus`. Suffixed forms like `opus 4.6` are malformed and are treated as the bare tier.

### Current tier assignments (realized via each agent's `model:` frontmatter)

We deliberately keep tiering in **existing agent definitions** rather than multiplying `-haiku`/`-sonnet`/`-opus` variant files. The variants would be one tier each anyway; the frontmatter already encodes that, and the Orchestrator can apply the documented per-tier override (§3) without a separate file.

| Agent | Default tier | Notes |
|---|---|---|
| `explorer-planner` | haiku | read-only repo/issue evidence gathering |
| `qa-fast` | haiku | read-only risk scan / smoke test plan |
| `frontend-engineer` | sonnet | |
| `backend-engineer` | sonnet | |
| `supabase-engineer` | sonnet | |
| `qa` | sonnet | test authoring + verification mode |
| `code-reviewer` | sonnet | **opus override** allowed for high-risk (auth/payments/migrations/data-integrity) — `code-reviewer.md` |
| `security-reviewer` | sonnet | opus override allowed for high-risk security reasoning |
| `performance-analyst` | sonnet | |
| `ui-designer` | sonnet | |
| `spec-enricher` | sonnet | read-only sprint spec structuring |
| `architect` | opus | design/decomposition; the standing opus-tier reasoning target for ambiguity escalations |
| `team-lead` | opus | sprint kickoff / decomposition analysis (Modes 1 & 2 only) |
| `mode3-orchestrator` | opus | execution owner (Team Lead) in `/mode3-run` |

There is **no separate `qa-deep` / `code-reviewer-opus` / engineer-opus file.** "Deep QA" or "opus review" is the standard agent run with a documented opus override (§3), decided by the Orchestrator within its boundary — not a new agent type. If a genuinely distinct *behaviour* (not just a bigger model) is ever needed, add a variant per §7.

**What is and is not auto-routed today (no over-claim):**

- The **cheap (haiku) tier is realized by the agents whose frontmatter is already `haiku`** — `qa-fast` and `explorer-planner`. Those are the routine cheap-tier delegations.
- **Raising** a standard agent to opus (`code-reviewer`/`security-reviewer` for high-risk) **is** routed today via the §3 documented override.
- **Lowering** a standard engineer/reviewer to `haiku` for a trivial change (e.g. a 3-line CSS fix) is **technically possible** via the same per-call `model:` parameter, but it is **not an automatic route** — no choreography rule downgrades an engineer to haiku, and it is generally **not recommended** (the correctness risk on real code edits outweighs the small token saving; trivial fixes already have the `/quick` lane and the Main-Agent micro-fix exception). Treat engineer→haiku as an explicit, deliberate delegator override, not a default. If routine engineer-on-haiku ever becomes desirable, wire it as an explicit choreography rule (and update `ROUTE_AND_RUN_TABLES.md`) rather than relying on this policy implying it.

---

## 2. Ownership model

### Main Agent / Planner **owns**

- issue understanding and risk classification
- PLAN_REVIEW handoff and approved-plan materialisation
- **model-escalation approval for architecture, policy, high-risk, or expensive work** (Opus/high-context)
- ChatGPT / OpenAI gate interaction
- final WORKDONE_REVIEW / PR_REVIEW / merge-readiness decision

### Team Lead / Orchestrator **owns** (the `mode3-orchestrator` teammate in `/mode3-run`; `team-lead` in sprint Modes 1–2)

- execution routing — choosing the appropriate subagent **and its tier** at delegation time, within the Main-Agent-declared boundary
- applying the documented per-tier overrides (§3) — e.g. `code-reviewer`→opus for high-risk
- queueing subagents instead of spawning many in parallel (§5)
- receiving subagent results and `ESCALATION_REQUIRED` returns
- preparing an escalation packet and asking the Main Agent / USER_DECISION when escalation is expensive, architectural, or risky
- writing the routing-decision log **before** the first delegation (existing HARD GATE)

### Subagent **owns**

- bounded task execution within its assigned scope only
- evidence collection for its assigned scope
- returning exactly one of: `RESULT` · `BLOCKED` · `ESCALATION_REQUIRED`

### Subagent **must NOT** own

- changing its own model / tier
- spawning replacement agents or recursively launching other agents (also structurally enforced: subagents cannot call `Task`)
- polling indefinitely for another agent
- broad repository scans unless explicitly delegated
- making merge or scope-expansion decisions
- bypassing any gate (PLAN_REVIEW / WORKDONE_REVIEW / PR_REVIEW / code-reviewer / security-reviewer / QA / E2E)

The Main Agent does **not** implement; the Orchestrator does **not** call gates or merge. These boundaries are unchanged by this document — see `.claude/mode3/contracts/main-agent.md` and `.claude/mode3/contracts/team-lead.md`.

---

## 3. Escalation — where and how a tier may be raised

Escalation is allowed **only at a delegation boundary**, and only by the delegator:

| Escalation | Who decides | Pre-condition |
|---|---|---|
| `code-reviewer` → opus | Orchestrator (within boundary) | risk_tier high (auth/payments/migrations/data-integrity), per `code-reviewer.md` |
| `security-reviewer` → opus | Orchestrator (within boundary) | high-risk security reasoning on a Gate-F trigger |
| route an ambiguous root-cause / design question to **`architect`** (opus, read-only) | Orchestrator | investigation specialist returned `ESCALATION_REQUIRED` with a design/ambiguity `remaining_question` |
| engineer/qa → opus, **or any new opus use not listed above** | **Main Agent approval** (and USER_DECISION / ChatGPT gate where workflow convention requires) | expensive / architectural / policy-changing / merge-risk work; or an unresolved escalation from Sonnet |

Rules:

- **The Orchestrator may raise a tier only via the explicitly documented overrides above.** Anything beyond them is a Main-Agent decision. This preserves `mode3-orchestrator.md` forbidden-action #8 ("override model fields only as `code-reviewer.md` allows") — now generalised and made explicit, not weakened.
- **No silent model switch.** A model that cannot perform its own routing/decision writes `blocked.toml(reason_code=UNKNOWN, detail="model_routing_failure: ...")`; the user decides retry. (Unchanged from `mode3-orchestrator.md`.)
- **Receiving `ESCALATION_REQUIRED` is not approval.** The Orchestrator routes it per this policy: apply a documented override itself, or prepare an escalation packet for the Main Agent. The Main Agent decides expensive/Opus escalations.
- Opus/high-context use must be traceable to one of: a documented override (§3 table), an approved plan, or an explicit Main-Agent/USER_DECISION/gate approval recorded in the handoff or `team-lead-execution-log.md`.

### Runtime mechanism (how a tier is actually applied)

Tier override is **executable**, not aspirational:

- The subagent-spawn tool (`Task` / `Agent`) accepts a per-call `model` parameter (`haiku | sonnet | opus`) that **takes precedence over the agent's `model:` frontmatter** (falls back to frontmatter when omitted). This is the same primitive the Main Agent's `Agent` tool exposes.
- Canonical existing usage: `ROUTE_AND_RUN.md` Step 2 ("Determine model override") already instructs the orchestrator to **"add `model: opus` to the Task invocation"** for high-risk `code-reviewer`. This document generalises that one case; it does not invent a new mechanism.
- **Defensive fallback (unchanged):** if the override capability is unavailable in a given runtime build, the orchestrator does **not** silently run on the wrong model — it writes `blocked.toml(reason_code=TOOL_UNAVAILABLE)` (high-risk pre-flight, `team-lead` contract) or `model_routing_failure` (handoff `[escalation_rules]`). The user decides.
- **Honest caveat:** the capability is confirmed from the spawn-tool schema and the pre-existing canonical instruction, but historical `/mode3-run` executions have tended to run **uniform-model** (all-opus or all-sonnet). Mixed-tier per-call routing is **supported but lightly exercised** — the first high-risk run that bumps only `code-reviewer` to opus is the live confirmation. The `TOOL_UNAVAILABLE` guard exists precisely so an unexercised path fails safe rather than silently.

---

## 4. Escalation return format (subagent → delegator)

When a subagent cannot complete safely on its assigned tier/scope, it **stops** and returns this block (template: `.claude/templates/escalation-required.toml`):

```toml
status = "ESCALATION_REQUIRED"
reason = "Why the assigned model/scope is insufficient"
evidence_gathered = ["What was already checked"]
files_inspected = ["List of files inspected"]
remaining_question = "The exact unresolved question"
recommended_next_agent = "agent-name"
recommended_model_tier = "haiku | sonnet | opus"
bounded_task_packet = "Precise task for the next agent"
risk_if_not_escalated = "What could go wrong if we continue cheaply"
```

The delegator (Team Lead / Orchestrator) **must not** treat this as authority to escalate — it routes per §3. `recommended_*` fields are advisory evidence, not instructions.

---

## 5. Parallelism policy

- **Default max parallel subagents: 1.** Sequential is the norm (matches the single-PR-at-a-time / serialize-when-in-doubt rules in `team-lead.md` and `SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md`).
- **2** is allowed only for clearly independent **read-only** investigations (e.g. two non-overlapping evidence sweeps).
- **3+** requires explicit Main-Agent approval recorded in the plan/handoff.
- No subagent may wait indefinitely for another subagent (stall windows + bounded fallback already defined in `.claude/mode3/contracts/notifications.md`).
- **No recursive agent spawning.** Subagents do not launch agents (also structurally enforced).

> **Scope:** this limit governs **subagent fan-out within one orchestration**. It is a different axis from `.claude/skills/PARALLEL_LANES.md` (multiple human-coordinated Claude *sessions* on disjoint migration lanes) — that multi-session protocol is unaffected by this rule.

Rationale: recent usage showed disproportionate cost from subagent-heavy and 4+-parallel sessions.

---

## 6. MCP / context policy

For MCP-heavy tools such as `jcodemunch`:

- Use for **targeted** discovery only — `search_symbols` / `search_text` / `get_file_outline` / `get_symbol_source` / `get_context_bundle` over broad `Read`. (Indexed-first navigation is already mandatory — `mode3-orchestrator.md`, `team-lead` contract.)
- Avoid broad scans unless explicitly approved in the plan.
- Summarise findings into **compact evidence**; do not leave large raw MCP outputs sitting in context.
- Compact after a large tool output (§7).

---

## 7. Compact / checkpoint policy

Compact or emit a checkpoint after:

- PLAN_REVIEW approval
- each substantial subagent evidence return
- a large MCP output
- before WORKDONE_REVIEW
- switching from planning to execution
- switching issues

A compact summary must preserve: issue number · branch · plan-approval status · agents used · escalation decisions · files changed · tests run · unresolved blockers · next action. (Sprint-level checkpoint format: `SPRINT_EXECUTOR_ROLLING_CHECKPOINT.md`; emergency format: `CLAUDE.md` §8.)

---

## 8. Delegation packet

Every delegation (Orchestrator → specialist, or `team-lead` Mode-2 subtask) should be assembled with these fields (template: `.claude/templates/delegation-packet.toml`):

```toml
task_id          = "short-id"
agent            = "agent-name"
model_tier       = "haiku | sonnet | opus | default"   # 'default' = use the agent's frontmatter tier
scope            = "strict bounded scope"
files_allowed    = ["file1", "file2"]
files_forbidden  = ["optional"]
objective        = "exact outcome expected"
non_goals        = ["what not to do"]
allowed_tools    = ["if applicable"]
max_parallelism  = 1
can_spawn_subagents = false
can_escalate_model  = false
return_format    = "RESULT | BLOCKED | ESCALATION_REQUIRED"
evidence_required = ["tests", "diff summary", "files inspected"]
```

`can_escalate_model = false` and `can_spawn_subagents = false` are the defaults for every subagent and encode §0. The existing canonical handoff (`approved-execution-handoff.toml`) and its `[authority]` flags remain the binding scope contract in `/mode3-run`; this packet documents the per-call delegation shape and does not replace handoff integrity checks.

---

## 9. Adding a new tiered agent safely

1. Prefer **not** to. First check whether an existing agent + a documented tier override (§3) covers the need. Multiplying near-identical variants raises maintenance and token overhead.
2. Add a variant only when a genuinely **distinct behaviour** is needed (different prompt/role), not merely a bigger model.
3. If you add one: give it valid `model:` frontmatter (§1), add a row to the §1 assignment table, add the §10 footer, and register it in the relevant allowlists (`team-lead.md` reference scope; `mode3-orchestrator` `category_allowlist` in the handoff). Then update `ROUTE_AND_RUN_TABLES.md`.

---

## 10. Per-agent footer (convention)

Each agent definition carries a short **"Model tier & escalation"** footer stating its default tier, the no-self-escalate / no-spawn rule, and when it should return `ESCALATION_REQUIRED`. The footer points back to this document; this document is authoritative if they ever drift.

---

## Migration note (what changed, why, how to revert/extend)

**What changed** (one atomic PR, `workflow/atomic-agent-model-tiering`):
- Added this policy doc + `.claude/templates/{delegation-packet,escalation-required}.toml`.
- Added a "Model tier & escalation" footer to each model-bearing agent definition.
- Fixed malformed `model:` frontmatter (`architect` `opus 4.6`→`opus`, `frontend-engineer` `sonnet 4.6`→`sonnet`) and resolved committed Git merge-conflict markers in `spec-enricher.md` (→ `sonnet`, compressed branch).
- Wired the policy into `SKILL.md`, `ROUTE_AND_RUN.md`, `mode3-orchestrator.md` (generalised forbidden-action #8 + `ESCALATION_REQUIRED` routing), and the `main-agent` / `team-lead` mode-3 contracts.

**Why:** recent usage showed disproportionate cost from subagent-heavy, high-parallelism, large-context, and MCP-retention sessions. Model use is now explicit, bounded at delegation boundaries, and auditable. **No product/application code changed; no existing gate weakened.**

**Deliberately NOT done:** no new `-haiku`/`-sonnet`/`-opus` variant files. Tiering already lives in each agent's `model:` frontmatter; the Orchestrator applies documented overrides without extra files. This keeps maintenance and token overhead low (§9).

**How to extend:** add a tier only for a genuinely distinct behaviour — see §9.

## Revert story

This is intentionally one atomic, additive, docs-only PR. It changes no product code and weakens no existing gate. If the new routing/escalation language causes friction, **revert this single PR** to return to the previous workflow definitions. The only non-additive edits are: corrected malformed `model:` values, the `spec-enricher.md` merge-conflict resolution, and small reference inserts — all reverted together with the PR.
