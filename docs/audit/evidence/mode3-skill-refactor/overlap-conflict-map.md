# Mode-3 Skill System — Overlap & Conflict Map

Documented BEFORE fixing (per refactor process step 2). Each item: severity · what conflicts · where · disposition (FIXED in this refactor / DEFERRED with reason / USER-DECISION).

Severity: **S1** = can cause a wrong/unsafe action in a live run · **S2** = can stall or fail a run incorrectly · **S3** = maintenance hazard / reader confusion.

---

## A. Direct conflicts

| # | Sev | Conflict | Evidence | Disposition |
|---|---|---|---|---|
| A1 | **S1** | Merge command uses `--admin` (bypasses branch protection) | `closeout.md:40` `gh pr merge <PR#> --squash --admin`; standing rule: no `--admin`, no bypassing branch protection, no force merge | **FIXED** — command becomes `gh pr merge <PR#> --squash`; explicit "never `--admin` / never bypass branch protection / never force merge" policy added to closeout + CLAUDE.md §10 already bans unapproved release commands |
| A2 | **S1** | `gh pr merge` listed as "Pre-Approved (No Confirmation Required)" in the standalone/sprint lane, contradicting CLAUDE.md §10 mandatory user merge approval | `ROUTE_AND_RUN.md:248–259` (`--merge --delete-branch`, pre-approved) vs `CLAUDE.md §10`, `closeout.md` Phase 9.1, `notifications.md` event 10 | **FIXED** — ROUTE_AND_RUN merge step now requires explicit user approval (CLAUDE.md §10 wins universally) and uses squash merge per the repo's standing "normal squash merge only when approved" rule; TOOLING.md exception cross-referenced to §10 |
| A3 | **S2** | PR_REVIEW rework routed on verdict `REVISION_REQUIRED`, which `openai_gate.py` can never return for PR_REVIEW (enum: `APPROVED_TO_MERGE / NEEDS_FIXES / NEEDS_MORE_EVIDENCE / NEEDS_USER_DECISION`) | `mode3-run.md` stop-conditions row Phase 9; `closeout.md:12`; vs `openai_gate.py:175–180` PER_GATE_ENUMS | **FIXED** — docs aligned to `NEEDS_FIXES` (with NEEDS_MORE_EVIDENCE/NEEDS_USER_DECISION handling noted) |
| A4 | **S2** | PLAN_REVIEW/WORKDONE_REVIEW contracts document a `decision =` field with values (`APPROVED_FOR_IMPLEMENTATION`, `NEEDS_REVISION`, `BLOCKED` for WORKDONE) that the enforcing script does not emit; canonical field is `verdict` with different values; `plan-review.md` itself mixes `decision` (schema block) and `verdict` (prose) | `plan-review.md:36–58`, `workdone-review.md:75` vs `openai_gate.py` VERDICT_SCHEMA + PER_GATE_ENUMS | **FIXED** — contract schema blocks rewritten to `verdict =` + the real enums; structured objects (`eval_checklist`, `self_critic`, …) unchanged (they exist in GATE_STRUCTURED_FIELDS) |
| A5 | **S2** | ROUTING DECISION marker mismatch: verifier requires literal `[ROUTING DECISION]` in the execution log; the template + both contracts emit `## <ts> — ROUTING DECISION` (no brackets) → a template-following run fails Phase-7C preflight | `verify-mode3-workdone.py:146` vs `templates/team-lead-execution-log.md:48`, `team-lead.md` contract, `mode3-orchestrator.md` Step-1 template; test fixture uses `## [ROUTING DECISION]` | **FIXED** — heading standardized to `## <ISO-8601 UTC> — [ROUTING DECISION]` in template + both docs (script/tests untouched) |
| A6 | **S3** | Authority-order contradiction: SKILL.md says "if TABLES contradicts prose, the table wins"; ROUTE_AND_RUN.md:244 and TABLES.md:3 say the main document wins | `route-and-run/SKILL.md:28` vs `ROUTE_AND_RUN.md:244`, `ROUTE_AND_RUN_TABLES.md:3` | **FIXED** — SKILL.md aligned: main doc wins on policy/control-flow; tables are the route-selection detail |
| A7 | **S3** | Gatekeeper verdict not in its own enum (`READY_FOR_CHATGPT_REVIEW` used in an example; enum defines `READY_FOR_HUMAN_APPROVAL`) | `chatgpt-gatekeeper.md:142` vs `:20–26` | **FIXED** — example corrected; file also given an explicit status header (see D3) |
| A8 | **S3** | Bug-repro vocabulary split: Phase B1 statuses are `REPRODUCED/...`; Phase B4 WORKDONE packet demands legacy `REPRO_CONFIRMED` | `bug-repro.md:50` vs `:192` vs `:340` (which says legacy is only an accepted alias) | **FIXED** — B4 block uses `REPRODUCED` (legacy alias note retained) |

## B. Stale references (removed tools / dead paths / drifted line numbers)

| # | Sev | Item | Where | Disposition |
|---|---|---|---|---|
| B1 | S2 | `Task` spawn tool (removed from harness; replaced by `Agent`) still instructed in live contracts | `team-lead.md` contract :17, :35, :37; `main-agent.md` :257, :376, :381; `browser-validation.md` :43, :248; `mode3-orchestrator.md` :239 (Differences table); `agents/team-lead.md` :99, :132, :134 | **FIXED** in all live docs (hardening/* left as dated history) |
| B2 | S3 | Path typo `.claude/.claude/mode3/contracts/*.md` | `mode3-run.md:26` | **FIXED** |
| B3 | S3 | Drifted line-number citations: `mode3-run.md line 120` (actual 147), `line 147` (actual ~211), `ROUTE_AND_RUN.md:357–369/:472/:495/:64` (all shifted), `qa.md:26`, `qa-fast.md:42–44`, `code-reviewer.md:5`, `ROUTE_AND_RUN_TABLES.md:68–72` | `notifications.md`, `team-lead.md` contract, `mode3-orchestrator.md`, `plan-review.md`, `templates/approved-execution-handoff.toml` skip_authority examples | **FIXED** — line-number citations replaced with stable section-name anchors (e.g. `ROUTE_AND_RUN.md § "qa-fast may be skipped (Lean mode only)"`) |
| B4 | S3 | Dead evidence paths `.claude/handoffs/agent-team-probe/at01-evidence.txt`, `.claude/handoffs/agent-team-safety-probe/probe-evidence.toml` | `mode3-orchestrator.md:252–253`; `agents/team-lead.md:130, :138` | **FIXED** — annotated "(historical runtime artefact; not retained in repo)" |
| B5 | S3 | Dead pointer `code-review-orchestrator.md` (file never existed post-migration; content lives in ROUTE_AND_RUN.md "Known repo rules") | `prompts/code-review-backend.md:67,72`; `prompts/code-review-frontend.md:72` | **FIXED** — pointers redirected |
| B6 | S3 | `agents/team-lead.md` describes the orchestrator toolkit as `Task, Bash, Read, Write, Edit, Grep, Glob` (wrong tool, missing SendMessage); Mode-2 "Step 5: Delegate via Task tool" contradicts its own `tools: Read, Grep, Glob` | `agents/team-lead.md:19, :99, :132, :134` vs `agents/mode3-orchestrator.md:5` | **FIXED** toolkit description; Mode-2 delegation step reworded to "hand the partition plan back to the Main Agent, which delegates via `Agent`" (team-lead is read-only and cannot delegate) |
| B7 | S3 | `docs/openai-gate.md` omits the #1221 `verdict-structured.json` sidecar artifact | `.claude/docs/openai-gate.md` artifacts list | **FIXED** — sidecar documented |
| B8 | S3 | `tooling-blocked.toml` superseded by `blocked.toml` (its own header says so; hardening report says "can be retired"; `required_tools` names removed `Task`; no live consumer — grep shows references only from blocked.toml header + hardening history) | `.claude/templates/tooling-blocked.toml` | **FIXED** — deprecation banner added (file kept; deletion left to user per "do not delete without user decision") |

## C. Duplication (same rule restated with drift risk)

| # | Rule | Copies | Disposition |
|---|---|---|---|
| C1 | Route-and-Run choreography order (qa-fast → engineer → code-reviewer → [security-reviewer] → [qa e2e-authoring] → qa verification) | ROUTE_AND_RUN.md (canonical) · team-lead.md contract · mode3-orchestrator.md · main-agent.md Path C · SKILL.md summary | **PARTIALLY FIXED** — copies now explicitly marked as mirrors of the canonical ROUTE_AND_RUN.md order; full de-dup deferred (each copy serves a different loading context; removing them would break the "load one contract per phase" token design) |
| C2 | Executor forbidden-actions / authority list | mode3-run.md §Scope · main-agent.md · team-lead.md contract · mode3-orchestrator.md (canonical 12-item list) | **PARTIALLY FIXED** — team-lead.md contract now points at the canonical list instead of restating all items; mode3-run.md keeps its one-paragraph summary (dispatcher needs it inline) |
| C3 | Routing-decision log template (3 verbatim copies) | templates/team-lead-execution-log.md (canonical) · team-lead.md contract · mode3-orchestrator.md | **FIXED** — team-lead.md contract now references the template; orchestrator agent keeps one copy (it cannot be assumed to load the template file); both carry the `[ROUTING DECISION]` marker fix |
| C4 | `## Model tier & escalation` boilerplate + "never raise your own model / never spawn agents" | 12 agent files, 3 wording variants | **DEFERRED** — consolidation into a shared include would touch all 15 agent files for wording-only gain; divergent wordings documented here; canonical statement remains MODEL_TIERING_AND_ESCALATION.md |
| C5 | Decision-Lock + Delta-Only prompts | ROUTE_AND_RUN.md:644–660/:329–346 (full) vs gates.md:316–330 (condensed) | **DEFERRED** — gates.md belongs to the standalone ChatGPT lane; merging risks breaking that lane mid-refactor. gates.md now carries an explicit lane statement (see D2) |
| C6 | Evidence grammar (test provenance) — 3 vocabularies: exact command + pass/fail (ROUTE_AND_RUN), command + output (SPRINT_EXECUTOR), command + exit code + freshness + provenance (validation-matrix, superset) | ROUTE_AND_RUN.md:167/:181 · SPRINT_EXECUTOR:412 · validation-matrix.md test-suite precision rules · CLAUDE.md §11 | **PARTIALLY FIXED** — validation-matrix.md declared the canonical evidence grammar; ROUTE_AND_RUN evidence sections cross-reference it. Full rewording of sprint docs deferred (out of Mode-3 scope) |
| C7 | Scope-lock statement | gates.md AC1/AC7–AC9 (full) · SKILL.md summary · mode3 workdone-review step 3 (authoritative for Mode-3) | no change needed — each lane's statement is internally consistent; map records the split |
| C8 | validation-matrix contract embeds abbreviated copies of the COMPACT/FULL skeletons that also live in templates/validation-matrix.md | contracts/validation-matrix.md:132–215 | **DEFERRED** — inline examples aid PLAN_REVIEW readers; template header already cross-references policy |

## D. Unclear boundaries / ambiguous authority

| # | Issue | Disposition |
|---|---|---|
| D1 | "Team Lead" naming: the retired `team-lead.md` agent vs the mode3-orchestrator teammate vs `.claude/mode3/contracts/team-lead.md`; plan artefact still named `team-lead-plan.toml` | **PARTIALLY FIXED** — contract headers now state the equivalence table (Team Lead = orchestrator teammate) in the standard header block; artefact names unchanged (frozen by scripts/templates) |
| D2 | Two gate lanes with different verdict vocabularies and tier thresholds: gates.md (manual ChatGPT-Pro lane, tier-optional) vs mode3 contracts + openai_gate.py (automated lane, always-mandatory) | **PARTIALLY FIXED** — gates.md and the mode3 contracts now each declare their lane explicitly at the top; enum unification across lanes = **USER-DECISION** |
| D3 | chatgpt-gatekeeper.md: no frontmatter, not spawnable, listed in `always_forbidden`, describes the manual-lane pre-screen; whether it is still used at all is unclear | **PARTIALLY FIXED** — status header added declaring it a legacy manual-lane aid, not part of `/mode3-run`; retirement = **USER-DECISION** |
| D4 | Permission-mode guidance split: orchestrator spawned with `mode: "auto"` (mode3-run 0.2) while ROUTE_AND_RUN mandates `mode: "dontAsk"` for specialist agents and bans `bypassPermissions` | recorded; both are deliberate (different spawn contexts) — a clarifying note added in `ROUTE_AND_RUN.md § Stage Evidence Contract` (mode3-run.md Phase 0.2 step 4 already explains `mode: "auto"`); no behavioural change |
| D5 | "Mode 3" naming collision: route-and-run "Mode 3 = resume" vs `/mode3-run` hands-off execution | recorded; SKILL.md already disambiguates; renaming = **USER-DECISION** |
| D6 | EXECUTOR_PROMPT.md.template uses the pre-Agent-Teams `[scope].allowed_files` schema but is still wired into openai_gate.py materialisation | recorded; **USER-DECISION** (script+template must change in lockstep) |
| D7 | `.antigravity/` mirror has no cross-tree drift detection; this refactor changes `.claude` only | recorded; sync policy = **USER-DECISION** |
| D8 | PARALLEL_LANES.md is orthogonal (multi-session, human-coordinated); could be misread as Mode-3 parallelism policy | recorded; MODEL_TIERING §5 already disambiguates; no change |

## E. Places specialists could exceed scope (reviewed, mostly already guarded)

- Engineer edits outside `allowed_file_globs` — guarded (handoff globs + WORKDONE preflight diff + authoritative lead scope-lock). No change.
- Stage-A read-only investigators editing files — guarded by tools frontmatter (`explorer-planner`, `qa-fast` have no Write/Edit) and Stage-A "strictly read-only" clause. No change.
- Orchestrator editing agent definitions / scripts — guarded (forbidden action #3). No change.
- **Gap fixed:** 7B sweep findings auto-expanding the PR — rule existed (browser-validation Scope control) but the per-issue-type checklists now restate the stop condition where implementers look (new `issue-checklists.md`).
- **Gap fixed:** `--admin` merge in closeout was the single biggest scope/authority escape hatch (A1).

## F. Verify-script phrase freeze (constraints honoured by this refactor)

The refactor preserved verbatim every phrase statically asserted by `verify-mode3-team-invariant.py` and `verify-mode3-duplicate-run-guard.py` (e.g. "Mode-3 team invariant (binding)", "Harness migration note", "teamMateMode", "resume-then-respawn", "disk-before-send", "MUST NOT author or apply the fix", "0.0 — Duplicate-run preflight guard", "Single-writer decision-file rule", "Run-lock cleanup", "Remove the lock only after", "Credentials from the main workspace only", `lsof -i :`, `.env.e2e`, "unmerged Flyway", "Testcontainers", "NEEDS_USER_DECISION", spawn-site literal `Agent({ subagent_type: "mode3-orchestrator", model: "opus", ... })`), plus all template field names listed in inventory §4. Both scripts + full pytest suite run green post-refactor (see before-after-proof.md).
