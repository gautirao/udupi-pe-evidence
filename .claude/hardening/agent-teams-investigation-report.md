# Agent Teams Investigation — Replacement for Nested Mode-3 Team Lead

> **Status note:** This document is retained as a dated design/history record. Some recommendations were superseded by the current Mode-3 Agent Teams / routing-authority workflow. Treat current workflow contracts and `.claude/commands/mode3-run.md` as authoritative.

**Date:** 2026-05-15
**Branch:** `hardening/team-lead-orchestration-stability`
**Status:** Investigation complete. Behavioural POC ran successfully. No workflow code changed. No OpenAI gates invoked. No PR.

---

## TL;DR — Recommendation

**Adopt Agent Teams (Option E) as the hands-off Mode-3 replacement.** It is the only option that simultaneously gives:
- one-command start (user kicks off, returns at the end),
- a working Team-Lead-style coordinator that CAN invoke `Task`,
- per-teammate model selection (Sonnet/Haiku executors, Opus lead),
- shared task list and direct inter-agent messaging,
- Main Agent retains all OpenAI / PR / merge / scope authority.

Behavioural probe AT01 (this session, Sonnet teammate in team `probe-mode3-at`) successfully invoked `Task(subagent_type=qa-fast, ...)` and received the sentinel `PROBE_OK_AT01`. Evidence: `.claude/handoffs/agent-team-probe/at01-evidence.txt`.

The previously fatal harness invariant — *"Task is not available inside subagents"* — applies only to subagents. **Teammates spawned via `Agent(team_name=…, name=…)` are full top-level Claude Code sessions and have Task.** This is the missing primitive.

The "manual split-session" plan in #1095 PLAN_REVIEW (already APPROVED) should be **paused and re-scoped to use Agent Teams** before implementation. The two designs share most of the file contracts and the authority model — the swap is mostly mechanical.

---

## Task-by-task answers

### 1. Agent Teams docs read

Authoritative source: `https://code.claude.com/docs/en/agent-teams.md` (Claude Code v2.1.32+). Key properties:

- Experimental, gated by `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (env var or settings.json `env` block).
- One **lead** session (the creator) + N **teammates**. Lead is fixed for the team's lifetime.
- Teammates are **independent top-level Claude Code sessions**, each running in a tmux pane (or in-process). They are NOT subagents.
- **Direct peer messaging** via `SendMessage(to=<name>, message=…)`. No need to route through the lead.
- **Shared task list** at `~/.claude/tasks/{team-name}/` (1:1 with the team). All members read/write.
- Per-member **model** selection at spawn time. Default teammate model configurable.
- `Agent(team_name=…, name=…)` spawns a teammate. `SendMessage` / `TeamCreate` / `TeamDelete` are the team primitives.
- Lifecycle: lead creates team → spawns teammates → distributes tasks → teammates work, message peers, mark tasks done → lead shuts down team via `SendMessage(shutdown_request)` then `TeamDelete`.
- Known limits: no nested teams; teammates cannot spawn teammates; one team per lead at a time; teammate state not restored after `/resume`; file-conflict risk if two teammates edit the same file (must partition).

### 2. Can it be enabled in this repo?

**Already enabled in this environment.** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is live — confirmed by:
- The presence of `TeamCreate`, `TeamDelete`, `SendMessage` in the deferred tool list and by their successful invocation in this session.
- The captured tmux spawn command for the teammate includes `env CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

No repo change is required to *use* the feature. A repo-level commitment (settings.json) is only needed if you want to guarantee it stays on for every future session — recommend doing that as part of the Mode-3 PR.

### 3. POC design (executed)

| Component | Choice |
|---|---|
| Team name | `probe-mode3-at` |
| Lead | Main Agent (opus 4.7), this session |
| Teammate | `executor`, subagent_type=`team-lead`, model=`sonnet` |
| Specialist invoked by teammate | `qa-fast` via Task |
| Sentinel | `PROBE_OK_AT01` |
| Artefacts | `.claude/handoffs/agent-team-probe/at01-evidence.txt` |
| Code touched | none |
| OpenAI calls | none |
| PRs | none |

### 4. Did the Team Lead coordinate specialists without nested Task?

**Yes.** The teammate (top-level Sonnet session) invoked `Task(subagent_type=qa-fast, ...)` successfully on its first turn. Specialist returned the sentinel verbatim:

```
⏺ qa-fast(Behavioural sentinel probe for AT01)
  ⎿  Done (0 tool uses · 10.4k tokens · 0s)

⏺ OBSERVED_TOOLS: Task, Read, Grep, Glob, SendMessage
  TASK_ATTEMPTED: yes
  TASK_ERROR: NONE
  SPECIALIST_RESPONSE: PROBE_OK_AT01
```

**Important caveat surfaced by the probe.** The teammate emitted its result as **plain text in its pane** but did NOT call the `SendMessage` tool. From the lead's perspective only `idle_notification` events arrived — no payload. The docs are explicit: *"Your plain text output is NOT visible to other agents — to communicate, you MUST call this tool."*

Implication for Mode-3 design: **do not rely on teammate plain-text → SendMessage flow.** Use one of:
- **(preferred) file-based handoff**: teammate writes its artefact to a deterministic path under `.claude/handoffs/issue-<N>/` (e.g. `workdone-candidate.toml`). Lead reads from disk. This is identical to the #1095 design and the prior split-session plan.
- explicit `SendMessage` instructions in the teammate prompt, with the four-line schema as the *message* field. Less reliable across model/prompt drift.

### 5. Can the user start one command and return only at the end?

**Yes, with caveats.** Hands-off lifecycle:

1. User: `/mode3-run <issue#>` (single command in their existing session).
2. Lead (Main Agent, opus): reads approved-plan.toml, runs `TeamCreate`, spawns one executor teammate via `Agent(team_name=…, model="sonnet")`, populates the shared task list with the per-step tasks from the plan.
3. Executor teammate works: claims tasks, invokes specialists via `Task`, marks tasks complete, writes `workdone-candidate.toml` on success or `blocked.toml` on failure.
4. Lead is notified via `idle_notification` and (separately) detects the terminal artefact on disk.
5. Lead runs WORKDONE_REVIEW gate, opens PR, awaits user merge approval, merges, shuts down team.

User involvement after step 1: ONE merge approval at the very end (and any blocked-toml triage if execution failed). This is materially closer to the user's "approve at start, inspect at end" goal than the manual two-terminal plan.

**Caveats:**
- The lead session must remain running while teammates work — but that's the user's existing terminal anyway.
- Token cost scales linearly with active teammates. For a single-executor team this is just the executor's Sonnet cost + the small Opus coordination overhead.
- `/resume` does not restore teammates. If the lead session dies mid-execution, the in-flight teammate is orphaned. Mitigation: keep teams short-lived; recover from on-disk artefacts.

### 6. Comparison of options

| Option | Hands-off? | Coordinator can invoke Task? | Cost economy | Implementation effort | Verdict |
|---|---|---|---|---|---|
| **E. Agent Teams** (NEW) | ✅ one command at start, one approval at end | ✅ proven by AT01 | ✅ executor on Sonnet/Haiku, lead on Opus only when needed | ~same as split-session: 3 commands + 4 file contracts + team-create wrapper | **Recommended.** |
| A. Manual split-session (the #1095 plan) | ⚠️ user must open a second terminal and type a second command | ✅ executor session is top-level | ✅ | Already planned and APPROVED | Demote to fallback. |
| B. Local `route_and_run.py` launcher | ✅ once shipped | ✅ launcher spawns top-level CC | ✅ | High: prompt template + CLI flags + tests | Phase 2 if Agent Teams disappoints. |
| C. Queue/Beads/GH-Actions executor | ✅ fully | ✅ | ✅ | Very high: queue, scheduler, runner, telemetry, secrets | Out of scope until A/E are proven. |
| D. Main Agent direct fallback | ✅ but cost-heavy | n/a | ❌ specialists run inside Opus session | Trivial | Keep as documented fallback when team can't start. |

### 7. Lowest-friction, most hands-off recommendation

**Option E — Agent Teams.** Single Mode-3 entrypoint command (`/mode3-run`) on the lead session does everything: create team, spawn executor, populate task list, wait for terminal artefact, run gates, open PR. User return-trip is one merge approval and one team-cleanup confirmation.

---

## Proposed architecture (sketch only — not implementation)

```
                          USER
                            │
                            │  /mode3-run <issue#>
                            ▼
                   ┌────────────────────┐
                   │  Main Agent (opus) │   = Lead
                   │  this session      │
                   └────────┬───────────┘
                            │ TeamCreate(team_name="mode3-<N>")
                            │ TaskCreate(...steps from approved-plan...)
                            │ Agent(team_name=..., name="executor",
                            │       subagent_type="team-lead",
                            │       model="sonnet")
                            ▼
        ┌──────────────────────────────────────┐
        │  executor teammate (sonnet)          │   top-level CC session, in tmux pane
        │  - reads approved-execution-handoff  │
        │  - claims tasks                      │
        │  - invokes specialists via Task:     │
        │      Task(subagent_type="qa-fast")   │
        │      Task(subagent_type="frontend-engineer")  ── these are subagents
        │      Task(subagent_type="code-reviewer")      ── of the executor
        │  - appends team-lead-execution-log   │
        │  - writes workdone-candidate.toml    │
        │    OR blocked.toml                   │
        └──────────────────────────────────────┘
                            │
                            │ (file appears on disk)
                            ▼
                   ┌────────────────────┐
                   │  Main Agent        │
                   │  - sha256 verify    │
                   │  - scope-lock diff  │
                   │  - WORKDONE_REVIEW  │   (opens approved gate)
                   │  - PR + merge       │
                   │  - SendMessage(shutdown_request) → executor
                   │  - TeamDelete        │
                   └────────────────────┘
```

### File contracts: REUSE the #1095 schemas

The four file contracts from the already-APPROVED #1095 plan (`approved-execution-handoff.toml`, `workdone-candidate.toml`, `blocked.toml`, `team-lead-execution-log.md`) carry over verbatim. No schema change required.

### What changes from #1095

- Replace **three slash commands** (`mode3-plan`, `mode3-execute`, `mode3-review`) with **one** (`mode3-run`) that orchestrates all phases from the lead.
- `mode3-execute` prompt becomes the **executor teammate prompt template**, passed via `Agent(prompt=...)` at spawn time.
- Add a **TeamCreate / TeamDelete wrapper** with idempotent re-entry (if `mode3-<N>` team already exists, attach instead of recreate).
- Add `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to `.claude/settings.json` `env` block so the feature is guaranteed on for future sessions.
- Hands-off SendMessage caveat: **do not rely on teammate plain-text output**; mandate file-based handoff in the executor prompt (mirrors the #1095 design — no change to the contract).

### What stays the same from #1095

- All 15 acceptance criteria around authority, scope-lock, prompt-injection refusal, idempotency, rate-limit/timebox, QA/E2E hard gate.
- security-reviewer in routing.
- Authority matrix: executor has zero OpenAI / PR / merge / scope authority.
- Hardening artefact treatment (local planning evidence only).

---

## Risks and footguns

| Risk | Mitigation |
|---|---|
| `/resume` does not restore in-flight teammates | Keep teams short-lived (one issue ≈ one team). Recover from on-disk artefacts; do not depend on in-memory teammate state. |
| Teammate emits result as plain text and never calls `SendMessage` (observed in AT01) | File-based handoff is authoritative. Lead polls disk, ignores chat-channel content. |
| Two teammates editing same file | MVP uses ONE executor teammate. No parallelism. |
| Token cost from idle teammates | Single short-lived executor; shut down on terminal artefact. |
| `~/.claude/teams/` collision across issues | Team name includes issue number: `mode3-<N>`. Idempotency check before TeamCreate. |
| Lead session crash mid-execution | On restart, lead reads `.claude/handoffs/issue-<N>/` to determine state (handoff present? candidate present? blocked present?). State machine drives recovery. |
| Subagents spawned BY the executor (specialists) still cannot invoke Task | Acceptable. Specialists do their own work; if a specialist needs to coordinate further, that is a design smell and should be flagged via blocked.toml. |
| Feature is "experimental" | Document fallback to Path A (manual split-session) if Anthropic disables or changes the flag. The two designs share file contracts, so swap cost is low. |

---

## Open questions for user

1. **Re-scope #1095** from manual-split-session to Agent-Teams-based? PLAN_REVIEW is already APPROVED for the split-session version. Options:
   - **(recommended)** Close #1095 as superseded; open a new issue #1096 "Implement Agent-Teams-based Mode-3 MVP"; run a fresh PLAN_REVIEW against the new packet.
   - Or amend #1095 plan in place and re-run PLAN_REVIEW (cleaner audit, more friction).
2. **Default executor model:** Sonnet for the first 3 dry-runs (matches #1095 decision)? Or jump to Haiku now since the harness primitive works?
3. **Settings change:** add `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to `.claude/settings.json` `env` block as part of the new PR? This affects every session opened in this repo. Probably yes.
4. **Dry-run target:** still a trivial throwaway issue (one-line copy tweak) for the end-to-end test?

---

## Final cleanup

- Probe team `probe-mode3-at`: shutdown request sent to executor; pending `TeamDelete` after teammate confirms shutdown.
- Hardening branch untouched apart from `.claude/handoffs/agent-team-probe/at01-evidence.txt` and this report.
- No commits.
