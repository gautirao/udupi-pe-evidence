# TEMPLATE — .claude/templates/team-lead-execution-log.md
#
# Purpose: Append-only audit trail written by the executor teammate during
# /mode3-run. One section per significant step or specialist invocation.
# Read by Main Agent (Reviewer), security-reviewer, and code-reviewer for
# WORKDONE_REVIEW evidence assembly.
#
# Copy this file to:
#   .claude/handoffs/issue-<N>/team-lead-execution-log.md
# Append entries chronologically. Never edit or delete prior entries.

# Execution log — Issue #<N>

**Executor:** sonnet teammate (`executor@mode3-<N>`)
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
notes: `Task callable on executor; Agent Teams transport verified behaviourally.`

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
cycle: 1  # increments on re-invoke; limit = 2 per ROUTE_AND_RUN.md:473-474 / SKILL.md:57
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
