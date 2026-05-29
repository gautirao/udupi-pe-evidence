# TEMPLATE — .claude/templates/team-lead-execution-log.md
#
# Purpose: Append-only audit trail written by the mode3-orchestrator teammate
# during /mode3-run. One section per significant step or specialist invocation.
# Read by Main Agent (Reviewer), security-reviewer, and code-reviewer for
# WORKDONE_REVIEW evidence assembly.
#
# Schema v2 (post-#1098): adds the ROUTING DECISION entry as a HARD GATE
# before the first specialist-call entry. Main Agent WORKDONE_REVIEW intake
# verifies the routing-decision entry timestamp precedes the first specialist
# call. Skip-with-justification entries (AC26) appear as nested fields under
# the routing decision (planned skips) or as separate SKIP entries (runtime).
#
# Copy this file to:
#   .claude/handoffs/issue-<N>/team-lead-execution-log.md
# Append entries chronologically. Never edit or delete prior entries.

# Execution log — Issue #<N>

**Orchestrator:** sonnet teammate (`orchestrator@mode3-<N>`)
**Lead:** Main Agent (opus)
**Branch:** `feat/<N>-short-name`
**Handoff:** `.claude/handoffs/issue-<N>/approved-execution-handoff.toml`
**Choreography source-of-truth:** `.claude/skills/ROUTE_AND_RUN.md`

---

## <ISO-8601 timestamp> — preflight
phase: preflight
index_command: `mcp__jcodemunch__index_folder { path: ".", incremental: true }`
index_result: `<files=N; symbols=N; duration=Ns>`
direct_read_fallback_reason: `<NONE | reason if any large file was read directly>`
notes: `<free-text>`

---

## <ISO-8601 timestamp> — sentinel probe
phase: preflight
specialist: qa-fast
prompt_summary: `Behavioural sentinel probe; reply EXACTLY 'PROBE_OK_<N>_<random6>'.`
files_touched: `.claude/handoffs/issue-<N>/preflight-probe.txt`
result: PASS
evidence_ref: `.claude/handoffs/issue-<N>/preflight-probe.txt`
notes: `Task callable on Orchestrator; Agent Teams transport verified behaviourally.`

---

## <ISO-8601 timestamp> — ROUTING DECISION
# HARD GATE — this entry MUST exist with a timestamp PRECEDING the first
# specialist-call entry below. Main Agent WORKDONE_REVIEW intake rejects the
# run if this entry is missing, out-of-order, or missing any required field.
phase: routing
risk_tier: <trivial | normal | high-risk | doc-only>
issue_type: <bugfix | small-change | feature | refactor | perf | security | incident | ui>
selected_sequence:
  1. <specialist-name> — <Route-and-Run rule citation, e.g. "ROUTE_AND_RUN.md:352 (qa-fast pre-implementation mandatory)">
  2. <specialist-name> — <rule citation>
  3. ...
skipped:
  # ZERO OR MORE skip entries. Each entry MUST have all four AC26 fields.
  - specialist_skipped: <name>
    reason: <one paragraph>
    rule_citation: <file:line, e.g. ROUTE_AND_RUN.md:369 Lean-mode>
    replacement_evidence: <path or NONE>
expected_evidence:
  - <specialist-name>: <what artefact / verdict is expected>
  - ...
gate_f_triggers_detected: <list or NONE>
boundary_compliance_self_check: <PASS — all selected specialists fall within executor.specialist_policy.category_allowlist; all mandatory_gates present>
notes: <free-text>

---

## <ISO-8601 timestamp> — specialist call: qa-fast
phase: specialist-call
specialist: qa-fast
prompt_summary: `<one paragraph; cites approved-execution-handoff.toml scope+authority>`
canonical_artefacts_cited: [
  ".claude/handoffs/issue-<N>/approved-execution-handoff.toml",
  ".claude/handoffs/issue-<N>/approved-plan.toml",
  ".claude/skills/ROUTE_AND_RUN.md",
]
files_touched: `<list or NONE if read-only>`
result: PASS  # PASS | FAIL | NOT_REQUIRED
evidence_ref: `<inline summary or file path>`
direct_read_fallback_reason: `<NONE | reason>`
notes: `Risk register + test-case checklist + ⚠️ SECURITY section if Gate F.`

---

## <ISO-8601 timestamp> — specialist call: <engineer>
phase: specialist-call
specialist: `<frontend-engineer | backend-engineer | supabase-engineer | architect | ui-designer>`
prompt_summary: `<includes qa-fast boundary findings verbatim + allowed_file_globs + AC items>`
canonical_artefacts_cited: [
  ".claude/handoffs/issue-<N>/approved-execution-handoff.toml",
  "qa-fast findings from this log",
  "approved plan AC items",
]
files_touched: [
  "src/path/to/File.ext",
]
result: PASS
evidence_ref: `<git diff stat or path>`
post_edit_index_calls: [
  "mcp__jcodemunch__index_file { path: '/abs/path/File.ext' }",
]
# Compact jCodemunch navigation record (see AGENTS.md § Specialist Code Navigation).
# Copy verbatim from the specialist's [jcm] block. 4 fields only; no path lists / query text / dumps.
[jcm]
used = true            # bool — did the specialist use jCodemunch for code discovery?
queries = 2            # count (or short list) of jCodemunch queries run
files = 3              # count of files navigation targeted/opened
fallback = "NONE"      # "NONE" or a SHORT recognised fallback reason
notes: `<free-text>`

---

## <ISO-8601 timestamp> — specialist call: code-reviewer
phase: specialist-call
specialist: code-reviewer
model_override: `<sonnet (default) | opus (for high-risk auth/payments/migrations/data-integrity)>`
prompt_summary: `<final diff summary + scope + test evidence + prior specialist reports>`
canonical_artefacts_cited: [
  "git diff --name-status origin/main...HEAD output",
  "qa-fast findings",
  "engineer implementation summary",
]
result: APPROVE  # APPROVE | REQUEST_CHANGES
evidence_ref: `<inline summary>`
cycle: 1  # increments on re-invoke; limit = 2 per ROUTE_AND_RUN.md:473-474 (2-cycle reroute rule, Failure Routing Protocol)
notes: `<free-text>`

---

## <ISO-8601 timestamp> — specialist call: security-reviewer (if Gate F)
phase: specialist-call
specialist: security-reviewer
gate_f_trigger_reason: `<auth | JWT | secrets | PII | payments | CORS | CSP | RLS | PII migration>`
prompt_summary: `<Gate F trigger + scope+authority + final diff + qa-fast ⚠️ SECURITY section>`
canonical_artefacts_cited: [
  "Gate F trigger reason",
  "qa-fast ⚠️ SECURITY / DATA INTEGRITY section",
  "final diff",
]
result: APPROVE  # APPROVE | BLOCKING_FINDINGS
evidence_ref: `<inline summary>`
notes: `<free-text>`

---

## <ISO-8601 timestamp> — specialist call: qa verification
phase: qa
specialist: qa
mode: verification  # prompt prefix MUST be "Mode: verification" per qa.md:2-3
prompt_summary: `<engineer implementation summary + qa-fast boundary + Mode: verification prefix>`
canonical_artefacts_cited: [
  "engineer implementation summary",
  "qa-fast findings",
]
test_command: `<verbatim>`
result: PASS  # PASS | FAIL — failure is terminal (qa.md:26)
exit_code: 0
output_excerpt: `<short>`
evidence_ref: `<path to test output>`
notes: `<free-text>`

---

## <ISO-8601 timestamp> — SKIP <specialist>
# Skip-with-justification (AC26). ALL FOUR fields required; any skip lacking
# all four fields fails WORKDONE_REVIEW.
phase: skip
specialist_skipped: `<name>`
reason: `<one paragraph>`
rule_citation: `<file:line, e.g. ROUTE_AND_RUN.md:369 Lean-mode skip>`
replacement_evidence: `<path or NONE>`

---

## <ISO-8601 timestamp> — terminal artefact written
phase: finalise
artefact: `<workdone-candidate.toml | blocked.toml>`
path: `.claude/handoffs/issue-<N>/<artefact>`
sha256: `<hex digest of the artefact>`
notes: `<free-text>`

---

## <ISO-8601 timestamp> — NOTIFICATION
# Dual-channel disk record for a SendMessage notification.
# This block MUST be appended BEFORE the corresponding SendMessage is sent.
# Schema defined in .claude/mode3/contracts/notifications.md.
# Template: .claude/templates/notification.toml
phase: notification

[notification]
event               = ""   # REQUIRED — one of the 12 enum names (PLAN_READY, PLAN_REVIEW_REQUIRED,
                           #   PLAN_REVIEW_RESULT, SPECIALIST_STARTED, SPECIALIST_DONE, BLOCKED,
                           #   WORKDONE_CANDIDATE_READY, WORKDONE_REVIEW_REQUIRED,
                           #   PR_REVIEW_REQUIRED, USER_MERGE_APPROVAL_REQUIRED,
                           #   STALL_DETECTED, RUN_COMPLETE)
issue               = 0    # REQUIRED — integer issue number
run_phase           = ""   # REQUIRED — Mode-3 phase string (e.g. "0.7", "5", "6", "10")
from                = ""   # REQUIRED — "orchestrator" | "main-agent"
to                  = ""   # REQUIRED — "main-agent" | "orchestrator" | "user"
ts                  = ""   # REQUIRED — ISO-8601 UTC timestamp
artefact            = ""   # REQUIRED — disk path to the authoritative backing artefact.
                           # MUST be non-empty. A notification with no on-disk backing
                           # artefact is invalid and MUST NOT be sent.
detail              = ""   # REQUIRED — one-line human summary
status              = ""   # OPTIONAL — verdict if applicable
reason_code         = ""   # OPTIONAL — REQUIRED when event=BLOCKED
specialist          = ""   # OPTIONAL — specialist name for SPECIALIST_STARTED/DONE
next_expected_event = ""   # OPTIONAL — next event recipient should expect
                           # (drives the bounded-fallback 10-min stall window)
