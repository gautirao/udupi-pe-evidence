# Token Efficiency Audit: /mode3-run and Route-and-Run Workflows
## Investigation Report — Coordination & Verification Checks

**Date:** 2026-05-26  
**Scope:** Main Agent coordination, Team Lead orchestration, verification gates, artifact polling  
**Status:** Investigation only — no implementation yet

---

## Executive Summary

The Mode-3 and Route-and-Run workflows include ~15 mechanical verification checks currently performed by Main Agent in prose/reasoning, and 3 polling patterns where the Main Agent waits on file state rather than receiving explicit notifications. These can be optimized via:

1. **Verification script suite** (~6 scripts, 50–100 LOC each) — deterministic validation of artifacts, checksums, routing decisions, scope locks
2. **SendMessage checkpoints** (3 key points) — replace polling with explicit Team Lead/gate notifications  
3. **Artifact summary script** (1 script) — stale PR/branch detection at Phase 12 closeout

**Estimated token savings:** 800–1200 tokens per Mode-3 run (5–8% of Main Agent workload) + latency reduction on Phase 6–7 waits.

---

## Current Token-Burning Patterns

### A. Verification checks (Main Agent prose/reasoning)

#### A1. SHA256 integrity chain (2 checks)
**Current:** Main Agent reads two files from disk, computes checksums, compares text in prose.  
**Phase:** 7C (WORKDONE_REVIEW pre-flight)  
**Tokens:** 150–200 per check  
**Frequency:** Every Mode-3 run

Check 1: `sha256(approved-execution-handoff.toml) == workdone-candidate.toml.handoff_sha256`  
Check 2: `sha256(approved-plan.toml) == approved-execution-handoff.toml.plan.approved_plan_sha256`

**Proposal:**
```bash
verify-sha256-chain.py \
  --handoff .claude/handoffs/issue-<N>/approved-execution-handoff.toml \
  --candidate .claude/handoffs/issue-<N>/workdone-candidate.toml \
  --plan .claude/handoffs/issue-<N>/approved-plan.toml
```
Output: JSON `{ pass: bool, details: { check1: ..., check2: ... }, ... }`

---

#### A2. Routing-decision-log verification (5 sub-checks)
**Current:** Main Agent reads log + workdone-candidate TOML, verifies:
1. Timestamp ordering (routing-decision entry precedes first specialist call)
2. Mandatory gates present (all entries from `[executor.specialist_policy].mandatory_gates` in log)
3. Skip field completeness (every skipped entry has 4 fields: specialist_skipped, reason, rule_citation, replacement_evidence)
4. Specialist allowlist (every named specialist in log is in allowlist OR triggered conditional)
5. Log/toml consistency (routing_decision_log in toml matches log entry)

**Current:** ~300 tokens (5 separate validation steps + prose)  
**Phase:** 7C (WORKDONE_REVIEW pre-flight)  
**Frequency:** Every Mode-3 run

**Proposal:**
```bash
verify-routing-decision-log.py \
  --log .claude/handoffs/issue-<N>/team-lead-execution-log.md \
  --candidate .claude/handoffs/issue-<N>/workdone-candidate.toml \
  --handoff .claude/handoffs/issue-<N>/approved-execution-handoff.toml \
  --required-gates <COMMA_SEPARATED_GATES>
```
Output: JSON with 5 boolean fields + details for each failure

---

#### A3. Scope-lock verification (git diff check)
**Current:** Main Agent runs `git diff --name-status origin/main...HEAD`, manually compares against `executor.allowed_file_globs` and `executor.forbidden_globs`.

**Current:** ~100 tokens (prose reasoning)  
**Phase:** 7C  
**Frequency:** Every Mode-3 run

**Proposal:**
```bash
verify-scope-lock.sh \
  --handoff .claude/handoffs/issue-<N>/approved-execution-handoff.toml \
  --allowed-globs <FILE> \
  --forbidden-globs <FILE>
```
Output: JSON `{ pass: bool, violations: [...], ... }`

---

#### A4. QA/E2E evidence verification
**Current:** Main Agent reads evidence artifact files, checks if PASS/NOT_REQUIRED exists, and makes prose judgment.

**Current:** ~100 tokens (prose + artifact reading)  
**Phase:** 7C  
**Frequency:** Every Mode-3 run

**Proposal:**
```bash
verify-qa-evidence.py \
  --handoff .claude/handoffs/issue-<N>/approved-execution-handoff.toml \
  --candidate .claude/handoffs/issue-<N>/workdone-candidate.toml \
  --evidence-dir .claude/handoffs/issue-<N>/
```
Output: JSON `{ pass: bool, required: [...], found: [...], missing: [...], ... }`

---

#### A5. Eval-checklist satisfaction matrix
**Current:** Main Agent reads `[eval_checklist_result]` from workdone-candidate, compares each item against `[eval_checklist].items` from handoff, reports coverage in prose.

**Current:** ~150 tokens (prose + reading + comparison)  
**Phase:** 7C  
**Frequency:** Every Mode-3 run

**Proposal:**
```bash
verify-eval-checklist.py \
  --handoff .claude/handoffs/issue-<N>/approved-execution-handoff.toml \
  --candidate .claude/handoffs/issue-<N>/workdone-candidate.toml \
  --issue <N>
```
Output: JSON `{ pass: bool, coverage: N/M, items: [...], missing: [...], ... }`

---

#### A6. Phase 7A/7B product verification artifacts
**Current:** Main Agent reads `product-verification.toml`, checks if `decision = PASS`, then reads `product-sweep.toml` if present, checks for BLOCKING_REGRESSION.

**Current:** ~80 tokens (prose + artifact reading)  
**Phase:** 7C (pre-flight before WORKDONE_REVIEW)  
**Frequency:** Every Mode-3 run with user-visible changes

**Proposal:**
```bash
verify-product-verification.py \
  --issue <N> \
  --verification-artifact .claude/handoffs/issue-<N>/product-verification.toml \
  --sweep-artifact .claude/handoffs/issue-<N>/product-sweep.toml (optional)
```
Output: JSON `{ 7a_pass: bool, 7b_present: bool, 7b_blocking: bool, ... }`

---

#### A7. jCodemunch index freshness
**Current:** Main Agent reasons about whether index timestamp is current relative to git log.

**Current:** ~50 tokens (prose)  
**Phase:** 0.1  
**Frequency:** Every Mode-3 run

**Proposal:**
```bash
verify-index-fresh.py \
  --repo-path . \
  --index-id local/udupi-property-explorer-5ccf76f9
```
Output: JSON `{ fresh: bool, last_indexed: ISO, git_head: ISO, ... }`

---

### B. Polling patterns (latency + repeated file reads)

#### B1. Terminal artifact polling (Phase 6)
**Current:**  
- Main Agent: "Loop until workdone-candidate.toml OR blocked.toml exists"  
- Main Agent: reads execution log to discover phase completion  
- Main Agent: waits on file state (polling loop in prose)

**Polling overhead:** 2–3 re-reads of the same files + context overhead  
**Latency impact:** 5–15 min wait with no explicit notification

**Proposal:**  
Team Lead sends explicit SendMessage when ready:
```
SendMessage({
  to: "main-agent",
  message: "Terminal artifact ready: workdone-candidate.toml (timestamp: ...)",
  summary: "Execution complete, workdone-candidate ready for Phase 7"
})
```
Main Agent receives notification immediately, reads artifact once.

---

#### B2. Phase 7A/7B artifact readiness detection
**Current:**  
- Main Agent: polls for product-verification.toml existence  
- Main Agent: reads log to see if Phase 7A is done  
- Main Agent: waits for explicit sign-off in prose

**Polling overhead:** repeated log reads + artifact existence checks  
**Latency impact:** 1–3 min wait

**Proposal:**  
Product verification specialist sends notification when done:
```
SendMessage({
  to: "main-agent",
  message: "Phase 7A product verification: PASS (details in product-verification.toml)",
  summary: "Browser validation passed, ready for WORKDONE_REVIEW"
})
```

---

#### B3. Gate verdict polling
**Current:**  
- Main Agent: "Invoke openai_gate.py, wait for response"  
- Main Agent: reads verdict files + gate output  
- Main Agent: parses prose to extract decision

**Not true polling, but gate output parsing is manual.** No optimization needed here (gates return structured verdicts after #1221).

---

### C. Artifact reference validation (low frequency, but detectable patterns)

#### C1. Handoff contract references
**Current:** Main Agent verifies paths like `.claude/mode3/contracts/plan-review.md` are correct line-refs.

**Current:** ~20 tokens (prose)  
**Phase:** Every phase load  
**Frequency:** ~12 times per run (once per phase)

**Proposal:** Lightweight static check at setup:
```bash
verify-contract-refs.py \
  --mode3-root .claude/mode3/contracts/
```
Output: JSON `{ all_valid: bool, broken_refs: [...], ... }`  
Run once at Mode-3 start (Phase 0.1), cache result.

---

#### C2. ROUTE_AND_RUN.md line references (specialist routing)
**Current:** Main Agent resolves references like `ROUTE_AND_RUN.md:357-369` when verifying skip authority.

**Current:** ~30 tokens (prose lookup)  
**Phase:** 7C (routing-decision-log verification)  
**Frequency:** Once per run

**Proposal:** Embed reference map in script:
```bash
verify-skill-references.py \
  --skill .claude/skills/route-and-run/SKILL.md \
  --refs-to-verify ROUTE_AND_RUN.md:357,ROUTE_AND_RUN.md:472
```
Output: JSON `{ valid: bool, sections: { "357": "...", ... }, ... }`

---

## Coordination Points (SendMessage Optimization)

### High-impact SendMessage checkpoints (replace polling)

| Phase | Current (polling) | Proposed (SendMessage) | Savings | Latency |
|---|---|---|---|---|
| 6 | Main Agent polls for workdone-candidate.toml | Team Lead sends "Terminal artifact ready" | 2–3 artifact reads | -5–15 min |
| 7A | Main Agent waits for 7A gate + reads log | Product specialist sends "Phase 7A PASS" | 1 log read + prose reasoning | -1–3 min |
| 7C | Main Agent runs verification checks sequentially (prose) | Gate verification script outputs JSON summary | ~400 tokens / run | -2–3 min (parallel checks) |
| 8 | Main Agent checks PR creation readiness | Coordinator sends "PR ready: #NN" | 1 PR lookup | -1 min |

---

## Script Implementation Plan (Proposed)

**Location:** `.claude/scripts/verify-*.py`  
**Pattern:** Each script is deterministic, returns JSON, designed to be called by Main Agent during gate phases.

### Scripts to create (by priority):

#### Tier 1 (immediate impact, single gate)
1. `verify-sha256-chain.py` — 50 LOC, ~100 token savings/run
2. `verify-routing-decision-log.py` — 120 LOC, ~150 token savings/run
3. `verify-scope-lock.sh` — 40 LOC, ~80 token savings/run
4. `verify-eval-checklist.py` — 80 LOC, ~100 token savings/run

#### Tier 2 (conditional gates)
5. `verify-qa-evidence.py` — 60 LOC, ~80 token savings/run
6. `verify-product-verification.py` — 70 LOC, ~70 token savings/run

#### Tier 3 (setup + diagnostics)
7. `verify-index-fresh.py` — 50 LOC, ~50 token savings/run
8. `verify-contract-refs.py` — 40 LOC, ~15 token savings/run (one-time, Phase 0.1)
9. `detect-stale-artifacts.sh` — 100 LOC, ~100 token savings/run (Phase 12 closeout)

**Total implementation:** ~700 LOC across 9 scripts.

---

## SendMessage Notification Points (Proposed)

No code needed — workflow change only. Replace prose-based polling with explicit Team Lead/specialist notifications:

### Phase 6 (Team Lead → Main Agent)
```markdown
# Before (polling)
Main Agent: "Team Lead is idle. Check for workdone-candidate.toml or blocked.toml..."
[repeated reads of .claude/handoffs/issue-<N>/ on each context window]

# After (SendMessage)
Team Lead: "Terminal artifact ready: workdone-candidate.toml"
[Main Agent receives notification immediately, reads once]
```

### Phase 7A (Product specialist → Main Agent)
```markdown
# Before (polling + prose)
Main Agent: "Read product-verification.toml... Decision is PASS? Or 7B pending?"
[repeated reads of log + artifact file]

# After (SendMessage)
Product specialist: "Phase 7A verification: PASS (details in product-verification.toml)"
[Main Agent receives, proceeds to Phase 7C]
```

### Phase 7C (Verification suite → Main Agent)
```markdown
# Before (prose verification)
Main Agent: "Check sha256... check routing-decision-log... check scope-lock... check QA evidence..."
[~400 tokens of sequential verification prose]

# After (script output)
Main Agent: "Run verify-*.py scripts in parallel → summary JSON"
[reads 1 summary; scripts do the work]
```

---

## Risk Assessment & Safeguards

### Verification scripts
**Risk:** Script logic diverges from contract requirements.  
**Safeguard:** Scripts are read-only, deterministic. Main Agent still reads TOML files independently if script output is unexpected. Scripts fail closed (return `{ pass: false }` on parsing error).

### SendMessage checkpoints
**Risk:** Team Lead forgets to send notification, Main Agent hangs.  
**Safeguard:** Add a backup polling timeout (e.g., "if no message received within 10 min, poll for artifact"). Notification is acceleration, not a replacement guard.

### Stale artifact detection
**Risk:** Script misclassifies a PR/branch as stale.  
**Safeguard:** Script output is read-only report-only at Phase 12. Main Agent makes final decision on action; user must approve any cleanup.

---

## Compatibility & Backward Compatibility

- Scripts do NOT change workflow logic or gates.
- Scripts do NOT touch product code or issue scope.
- Scripts are opt-in during Phase 0.1 (Main Agent can skip if jCodemunch unavailable).
- SendMessage notifications are supplementary (polling fallback remains).
- Existing artifact formats (TOML, JSON) unchanged.

---

## Token & Latency Savings Summary

### Per-run savings (by script)
| Script | Tokens / run | Latency reduction |
|---|---|---|
| sha256-chain | ~100 | <1 min |
| routing-decision-log | ~150 | <1 min |
| scope-lock | ~80 | <1 min |
| eval-checklist | ~100 | <1 min |
| qa-evidence | ~80 | <1 min |
| product-verification | ~70 | <1 min |
| index-fresh | ~50 | <1 min |
| contract-refs | ~15 | <1 min |
| detect-stale-artifacts | ~100 | <1 min |
| **Subtotal (scripts)** | **~745** | **~9 min** |
| SendMessage notifications (Phase 6, 7A, 7C) | ~200 | **5–15 min** |
| **Total per run** | **~950–1000** | **14–24 min** |

**Cumulative (10 Mode-3 runs):** ~10,000 tokens + 2–4 hours latency reduction.

---

## Next Steps

1. **Phase 1 (Planning):** User confirmation on priority (Tier 1 scripts first?).
2. **Phase 2 (Implementation):** Create `.claude/scripts/verify-*.py` suite.
3. **Phase 3 (Integration):** Update `.claude/mode3/contracts/workdone-review.md` Phase 7C to call scripts.
4. **Phase 4 (Testing):** Dry-run on next Mode-3 issue (e.g., #1232 or next).
5. **Phase 5 (SendMessage):** Add notification points to team-lead.md (Phase 5–6 transitions).

---

## Appendix: Detailed Verification Script Specs

### A. verify-sha256-chain.py
**Inputs:**  
- `--handoff <path>` — approved-execution-handoff.toml  
- `--candidate <path>` — workdone-candidate.toml  
- `--plan <path>` — approved-plan.toml

**Logic:**
1. Read `approved-execution-handoff.toml`; compute sha256.
2. Read `workdone-candidate.toml`; extract `.handoff_sha256`.
3. Compare: handoff sha256 == candidate.handoff_sha256 → `check1_pass`.
4. Read `approved-plan.toml`; compute sha256.
5. Read `approved-execution-handoff.toml`; extract `.plan.approved_plan_sha256`.
6. Compare: plan sha256 == handoff.plan.approved_plan_sha256 → `check2_pass`.
7. Return JSON `{ pass: check1_pass && check2_pass, check1: {...}, check2: {...} }`.

---

### B. verify-routing-decision-log.py
**Inputs:**  
- `--log <path>` — team-lead-execution-log.md  
- `--candidate <path>` — workdone-candidate.toml  
- `--handoff <path>` — approved-execution-handoff.toml  
- `--required-gates <CSV>` — e.g., "qa-fast,frontend-engineer,code-reviewer"

**Logic:**
1. Parse log for `[ROUTING DECISION]` entry; extract timestamp.
2. Parse log for first specialist call; extract timestamp.
3. Check: routing-decision timestamp < first specialist timestamp → `check1_pass`.
4. Read `approved-execution-handoff.toml` `[executor.specialist_policy].mandatory_gates`.
5. Parse log `selected_sequence`; check all mandatory gates present → `check2_pass`.
6. Parse log `skipped` entries; verify each has 4 fields: `specialist_skipped`, `reason`, `rule_citation`, `replacement_evidence` → `check3_pass`.
7. Read `category_allowlist` + `conditional_gates` from handoff.
8. For each specialist in log `selected_sequence`: check it's in allowlist OR a triggered conditional → `check4_pass`.
9. Extract `routing_decision_log` section from candidate TOML; compare against log entry JSON serialization → `check5_pass`.
10. Return JSON `{ pass: all, check1: ..., check2: ..., check3: ..., check4: ..., check5: ... }`.

---

### C. verify-scope-lock.sh
**Inputs:**  
- `--handoff <path>` — approved-execution-handoff.toml  
- `--allowed-globs <CSV or file>` — from `executor.allowed_file_globs`  
- `--forbidden-globs <CSV or file>` — from `executor.forbidden_globs`

**Logic:**
1. Run `git diff --name-status origin/main...HEAD`; collect all paths.
2. For each path: check against `allowed_file_globs` (must match at least one).
3. For each path: check against `forbidden_globs` (must NOT match any).
4. Collect violations (paths outside allowed OR in forbidden).
5. Return JSON `{ pass: violations.empty(), violations: [...] }`.

---

### D. verify-eval-checklist.py
**Inputs:**  
- `--handoff <path>` — approved-execution-handoff.toml  
- `--candidate <path>` — workdone-candidate.toml  
- `--issue <N>` — for logging

**Logic:**
1. Read `approved-execution-handoff.toml` `[eval_checklist].items`.
2. Read `workdone-candidate.toml` `[eval_checklist_result]`.
3. For each handoff item: check if there's a matching result item marked `PASS`.
4. Collect missing or non-PASS items.
5. Return JSON `{ pass: coverage == 100%, required_count: N, passed_count: M, missing: [...] }`.

---

### E. verify-qa-evidence.py
**Inputs:**  
- `--handoff <path>` — approved-execution-handoff.toml  
- `--candidate <path>` — workdone-candidate.toml  
- `--evidence-dir <path>` — .claude/handoffs/issue-<N>/

**Logic:**
1. Read `approved-execution-handoff.toml` `[qa_requirements]`.
2. List all artifact files in evidence-dir matching patterns (e.g., `*-unit-test-run.txt`, `*-e2e-run.txt`).
3. For each required evidence type: check if file exists AND contains "PASS" or "NOT_REQUIRED".
4. Return JSON `{ pass: all_required_present, required: [...], found: [...], missing: [...] }`.

---

### F. verify-product-verification.py
**Inputs:**  
- `--issue <N>`  
- `--verification-artifact <path>` — product-verification.toml  
- `--sweep-artifact <path>` (optional) — product-sweep.toml

**Logic:**
1. Read `product-verification.toml`; extract `decision` field.
2. Check: decision == "PASS" → `7a_pass`.
3. If `sweep-artifact` provided:
   - Read `product-sweep.toml`; extract `decision` field.
   - Check: decision == "BLOCKING_REGRESSION" → `7b_blocking` (halt).
4. Return JSON `{ 7a_pass: bool, 7b_present: bool, 7b_blocking: bool, decision: "..." }`.

---

### G. verify-index-fresh.py
**Inputs:**  
- `--repo-path <path>` (e.g., `.`)  
- `--index-id <str>` (e.g., `local/udupi-property-explorer-5ccf76f9`)

**Logic:**
1. Run `git log -1 --format=%cI` → get latest commit timestamp.
2. Query jCodemunch `resolve_repo { "path": "." }` → get index metadata (last indexed timestamp).
3. Compare: git_head_timestamp <= index_timestamp → `fresh = true`.
4. Return JSON `{ fresh: bool, git_head_timestamp: ISO, indexed_at: ISO, ... }`.

---

## End of Report

**Recommendation:** Implement Tier 1 scripts immediately (4 scripts, 300 LOC, ~430 token/run savings). Evaluate SendMessage checkpoints after Tier 1 is live (requires team-lead.md updates + testing).
