# Mode-3 contract — Notification flow

> **Purpose:** defines the proactive orchestrator→Main-Agent SendMessage notification flow that replaces open-ended Main-Agent polling between phase boundaries. Main Agent REACTS to notifications; bounded fallback polling is a safety net only. Disk artefacts remain the sole source of truth.

---

## Overview

Previously the Main Agent polled `.claude/handoffs/issue-<N>/` files to learn when specialists finished or a run stalled. This contract replaces that open-ended loop with a **12-event lifecycle catalogue** sent via SendMessage, each backed by a durable on-disk record.

**Invariants that do NOT change:**

- The gate sequence (PLAN_REVIEW → WORKDONE_REVIEW → PR_REVIEW) is **unchanged**.
- CLAUDE.md §10 (mandatory user merge-approval halt before any `gh pr merge`) is **unchanged**.
- `mode3-run.md` line 120 remains word-for-word: `File artefacts are authoritative. SendMessage is for notifications only. Lead determines completion state by reading from disk.`

---

## 12-event catalogue

| # | Name | Direction | Required | Fires at | Backing artefact |
|---|---|---|---|---|---|
| 1 | PLAN_READY | O2M | true | End of Phase 0.7 — `team-lead-plan.toml` (and `bug-repro-report.toml` for bugs) written | `team-lead-plan.toml` + `team-lead-execution-log.md` (Stage-A entry) |
| 2 | PLAN_REVIEW_REQUIRED | O2M | true | End of Phase 0.7, together with/immediately after PLAN_READY | `team-lead-plan.toml` |
| 3 | PLAN_REVIEW_RESULT | M2O | true | End of Phase 1 — Main Agent relays APPROVED / REVISION_REQUIRED | `approved-execution-handoff.toml` (APPROVED) or PLAN_REVIEW verdict file (REVISION_REQUIRED) |
| 4 | SPECIALIST_STARTED | O2M | false | Phase 5 — each time orchestrator invokes a specialist via Agent | `team-lead-execution-log.md` (specialist-call entry) |
| 5 | SPECIALIST_DONE | O2M | **true** | Phase 5 — each time a specialist returns a terminal verdict | `team-lead-execution-log.md` (specialist-call entry with result) |
| 6 | BLOCKED | O2M | **true** | Any phase — orchestrator writes `blocked.toml` | `blocked.toml` |
| 7 | WORKDONE_CANDIDATE_READY | O2M | true | Phase 6 — orchestrator writes `workdone-candidate.toml` | `workdone-candidate.toml` |
| 8 | WORKDONE_REVIEW_REQUIRED | O2M | true | Phase 6→7C boundary — candidate + QA/E2E evidence complete | `workdone-candidate.toml` + eval_checklist_result matrix |
| 9 | PR_REVIEW_REQUIRED | M2O | false | Phase 8→9 — after PR created, Main Agent announces PR_REVIEW | PR URL recorded in handoff dir / closeout artefacts |
| 10 | USER_MERGE_APPROVAL_REQUIRED | M2U | true | Phase 10 — PR_REVIEW returns APPROVED_TO_MERGE | PR_REVIEW verdict + closeout prompt |
| 11 | STALL_DETECTED | O2M | **true** | Any phase — expected notification did not arrive within stall window | `team-lead-execution-log.md` (stall entry) |
| 12 | RUN_COMPLETE | M2U | false | Phase 12 — after merge + closeout + main sync/re-index | closeout summary |

**Direction key:** O2M = orchestrator→Main-Agent · M2O = Main-Agent→orchestrator · M2U = Main-Agent→user

### Per-event notes

**PLAN_READY** — Replaces Main-Agent polling for the plan between Phase 0.7 and Phase 1. Already specified in `team-lead.md` step 5; now formalised.

**PLAN_REVIEW_REQUIRED** — Main Agent still owns the gate; this only signals readiness. Gate sequence unchanged.

**PLAN_REVIEW_RESULT** — Main-Agent→orchestrator direction; uses Main Agent's existing SendMessage. Does not alter the gate decision.

**SPECIALIST_STARTED** — Progress visibility so the Main Agent does NOT re-inspect the log mid-execution. Informational.

**SPECIALIST_DONE** — REQUIRED — not optional/poll-only. Orchestrator MUST notify after each specialist completion per the acceptance contract. Not sending this notification is a procedural violation.

**BLOCKED** — REQUIRED — not optional/poll-only. Blocked states must be explicitly notified, not discovered by polling. Orchestrator writes `blocked.toml` first, then sends the BLOCKED notification.

**WORKDONE_CANDIDATE_READY** — Replaces the Phase 6 "Lead polls for terminal artefact" loop. The core polling-removal win.

**WORKDONE_REVIEW_REQUIRED** — Signals readiness; Main Agent still owns the gate and still runs Phase 7A/7B first. Gate sequence unchanged.

**PR_REVIEW_REQUIRED** — Main-Agent-side lifecycle milestone (Main owns PR_REVIEW). Informational notification for run observability.

**USER_MERGE_APPROVAL_REQUIRED** — Makes the existing mandatory stop explicit as a named event. Does NOT weaken §10: **gate verdict != user approval; no auto-merge**. PR_REVIEW returning APPROVED_TO_MERGE means the gate found the PR eligible; it is NOT authorisation to execute `gh pr merge`. The run STOPS and explicitly asks the user for merge approval. This is the run's stop condition per CLAUDE.md §10.

**STALL_DETECTED** — REQUIRED — not optional/poll-only. Directly addresses the "stalled-run confusion" in the problem statement. Orchestrator MUST send this when an expected event has not occurred within the stall window (see Bounded fallback polling below).

**RUN_COMPLETE** — Terminal lifecycle event. For issue #1279's own run, the stop condition is USER_MERGE_APPROVAL_REQUIRED — RUN_COMPLETE only fires for issues whose run proceeds through merge.

---

## Rework channel + extended lifecycle events (Design B)

The 12-event catalogue above covers the forward (plan → execute → review) path. Lifecycle continuity (rework after a gate, course correction, resume/respawn) adds the following **best-effort** events. All obey the same dual-channel invariant: the durable artefact is written first; the message is a pointer. None is load-bearing for correctness — a dropped message is recovered via bounded disk reconciliation.

| Name | Direction | Required | Fires at | Backing artefact |
|---|---|---|---|---|
| REWORK_REQUEST | M2O | false (disk-authoritative) | Any rework/course-correction (WORKDONE_REVIEW NEEDS_FIXES, PR_REVIEW REVISION_REQUIRED, OpenAI review, user correction, QA/E2E reroute) | `rework-request-<gate>-<n>.toml` |
| READY | O2M | false | Orchestrator has read assignment/handoff and started | `team-lead-execution-log.md` |
| IDLE_READY | O2M | false | Orchestrator finished a unit of work / a rework cycle and is standing by | `team-lead-execution-log.md` (or terminal artefact) |
| REWORK_RECEIVED | O2M | false | Orchestrator ingested a `rework-request-*.toml` and will route it | `team-lead-execution-log.md` (`phase: rework-intake`) |
| VALIDATION_STARTED / VALIDATION_COMPLETED | O2M | false | Orchestrator drives a qa/e2e validation step | `team-lead-execution-log.md` |
| SHUTDOWN_RESPONSE | O2M | true (when a shutdown_request was sent) | Phase 10 — reply to the Main Agent's `shutdown_request` | `team-lead-execution-log.md` |

**REWORK_REQUEST (M2O) — disk-before-send is mandatory.** The Main Agent writes `rework-request-<gate>-<n>.toml` **before** sending REWORK_REQUEST. The message body is a concise pointer (rework type + artefact path + expected stage re-entry + "ack required"), never inline TOML. The orchestrator routes the fix from the on-disk artefact, so a lost REWORK_REQUEST never loses the instruction. Full mechanism (resume-by-`agent_id`, respawn-fresh-Opus fallback, brief-from-artefacts, Main-Agent-never-implements, respawn-fail→blocked): `.claude/mode3/contracts/main-agent.md` → **Rework routing**.

**Addressing.** O2M uses `SendMessage({ to: "main", ... })`. M2O addresses the orchestrator by its **bare teammate name** (`SendMessage({ to: "orchestrator", ... })`) — the harness resolves SendMessage by name within the single session team and rejects the full `agent_id` string as a `to:` value. The persisted `agent_id` (`<name>@session-<id>`, in `orchestrator-agent.toml`) is the durable identity/audit handle (stable per `(name, session)`), not the SendMessage address. If the teammate is no longer resumable (e.g. across a CLI restart), the Main Agent respawns a fresh **Opus** orchestrator (never Sonnet) and re-briefs it from durable artefacts.

---

## Notification payload schema

Every SendMessage notification body IS a `[notification]` TOML block. The **identical block** is also appended to `team-lead-execution-log.md` as a `## <ts> — NOTIFICATION` entry before/with the SendMessage call. This keeps the dual-channel invariant (see below).

### Fields

```toml
[notification]
event             = ""   # REQUIRED — one of the 12 enum names above
issue             = 0    # REQUIRED — integer issue number
run_phase         = ""   # REQUIRED — Mode-3 phase index string (e.g. "0.7", "5", "6", "7C", "10")
from              = ""   # REQUIRED — "orchestrator" | "main-agent"
to                = ""   # REQUIRED — "main-agent" | "orchestrator" | "user"
ts                = ""   # REQUIRED — ISO-8601 UTC timestamp
artefact          = ""   # REQUIRED — disk path to the authoritative backing artefact.
                         # Never empty — a notification with no on-disk backing is invalid.
detail            = ""   # REQUIRED — one-line human summary
status            = ""   # OPTIONAL — verdict where applicable
                         # (PASS|FAIL|APPROVE|REQUEST_CHANGES|BLOCKING_FINDINGS|NOT_REQUIRED|
                         #  APPROVED|REVISION_REQUIRED|NEEDS_FIXES|APPROVED_FOR_PR|APPROVED_TO_MERGE)
reason_code       = ""   # OPTIONAL — REQUIRED when event=BLOCKED; one of the 18 reason codes
specialist        = ""   # OPTIONAL — specialist name for SPECIALIST_STARTED / SPECIALIST_DONE
next_expected_event = "" # OPTIONAL — the event the recipient should expect next
                         # (drives the bounded-fallback stall window)
```

### Example

```toml
[notification]
event = "SPECIALIST_DONE"
issue = 1279
run_phase = "5"
from = "orchestrator"
to = "main-agent"
ts = "2026-05-28T23:55:00Z"
artefact = ".claude/handoffs/issue-1279/team-lead-execution-log.md"
detail = "code-reviewer returned APPROVE (cycle 1)"
status = "APPROVE"
specialist = "code-reviewer"
next_expected_event = "SPECIALIST_DONE (qa verification)"
```

---

## Dual-channel invariant

Every notification has a corresponding on-disk record. **SendMessage is a notification pointer only; it is never itself the source of truth.** If a notification and the disk artefact ever disagree, the **disk wins**.

Orchestrator-originated notifications (O2M) are each mirrored as a `## <ts> — NOTIFICATION` block (the `[notification]` payload) appended to `team-lead-execution-log.md` before/with the SendMessage. This keeps `mode3-run.md` line 120 true verbatim and makes the flow crash-safe and resumable.

Main-Agent-originated notifications (M2O, M2U) are similarly mirrored in the relevant handoff artefact or closeout summary.

---

## Bounded fallback polling

The Main Agent **ACTS** on received notifications; it does not run an open-ended re-inspection loop.

| Rule | Detail |
|---|---|
| Default behaviour | Main Agent acts on received O2M notifications (no open-ended loop). |
| Stall window | If an expected notification (see `next_expected_event`) does not arrive within **10 minutes** (or `executor.max_minutes` if smaller), the Main Agent performs **ONE** authoritative disk reconciliation read of `.claude/handoffs/issue-<N>/`. |
| Hard cap | **At most 3 reconciliation reads per phase.** After the 3rd read with no terminal artefact and no progress, the Main Agent escalates STALL_DETECTED to the user and halts. This is the explicit upper bound that replaces open-ended polling. |
| Not weakened | Bounded fallback is a safety net for missed/dropped notifications; it never bypasses a gate and never substitutes for the disk artefact being authoritative. |

**Numeric bounds (summary):** stall window = 10 min (default) · max reconciliation reads per phase = 3 · after cap → STALL_DETECTED escalation to user.

### Known caveat — SendMessage may degrade in some spawned contexts

`SendMessage` delivery is **best-effort, not guaranteed**. In some spawned contexts (e.g. a background teammate or a child/nested session), `SendMessage` notifications may be **delayed, dropped, or not delivered at all**. This is a known transport limitation of the current harness, not a Mode-3 regression.

Mode-3 is designed to remain correct under this caveat:

- **Disk artefacts are the authoritative source of truth** — every notification is mirrored to disk before/with the send (dual-channel invariant above), so a lost `SendMessage` never loses state.
- **Bounded fallback polling is the authoritative fallback** — when an expected notification (`next_expected_event`) does not arrive within the stall window, the Main Agent performs the bounded disk reconciliation reads above (≤3 per phase) and proceeds from what it reads on disk.
- A run therefore **never blocks on `SendMessage` succeeding**: notifications accelerate the happy path; disk + bounded polling guarantee progress and correctness if delivery degrades.

---

## Gate sequence and CLAUDE.md §10 — unchanged

This contract does NOT alter:

- The gate sequence: PLAN_REVIEW → WORKDONE_REVIEW → PR_REVIEW.
- CLAUDE.md §10: the run STOPS and asks the user for explicit merge approval before any `gh pr merge`. Gate verdicts (including APPROVED_TO_MERGE and WOULD_AUTOMERGE) are eligibility findings, not release authorisation.
- Any authority-hardening rule in `mode3-orchestrator.md`.
- Any specialist choreography order in Route-and-Run.

See also: `.claude/commands/mode3-run.md` line 120 (source-of-truth invariant, verbatim preserved).
