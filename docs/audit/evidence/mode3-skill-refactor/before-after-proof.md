# Mode-3 Skill Refactor — Before/After Proof

This file proves the claims in `refactor-summary.md` with counts, verbatim old-vs-new wording, and reproducible checks.

## Headline metrics

| Metric | Value |
|---|---|
| Files read in full during discovery | ~85 (15 agent defs · 9 mode3 contracts · 3 commands · 6 skills docs · 7 prompts · 14 templates · 8 scripts+tests · 7 hardening docs · docs/state/settings/memory/adjacent) |
| Files changed | 30 (25 existing edited + 5 new: 1 contract, 1 validator script, 3 audit docs beyond this one) |
| Direct conflicts fixed (S1/S2/S3, map §A) | 8 (A1–A8) |
| Stale-reference classes fixed (map §B) | 8 (B1–B8), covering 20+ individual sites |
| Live docs cured of removed-`Task` instructions | 8 files, 13 sites (hardening history intentionally untouched) |
| Drifted line-number citations → stable section anchors | 14 sites across 6 files |
| Contracts standardized to the common header format | 10 (9 existing + 1 new `issue-checklists.md`) |
| Net text change in `.claude/` docs | +201 / −121 lines — net +80 for 8 conflict fixes, 10 standard headers, 2 lane declarations, and 3 new hard safety rules; pure duplication removed in `team-lead.md` contract: −77/+… (file shrank from 182 to 168 lines while gaining a 13-line header — ~27 lines of duplicated rule text deleted) |
| New automated guard | `verify-mode3-docs-consistency.py` — 7 violation classes, 54 files scanned, exit-code gated |

## Old vs new wording (verbatim)

### 1. Merge command (S1 — the headline safety fix)

`.claude/mode3/contracts/closeout.md`

> **Before:** `gh pr merge <PR#> --squash --admin`
>
> **After:** `gh pr merge <PR#> --squash` + new binding rules: “**Never pass `--admin`.** Bypassing branch protection is forbidden, even with user merge approval — merge approval authorises a *normal* merge only. **Never force-merge** or override failing required checks…”

### 2. Merge pre-approval (S1)

`.claude/skills/ROUTE_AND_RUN.md § Git Operations`

> **Before:** listed under “Pre-Approved (No Confirmation Required)”: “`gh pr merge <number> --merge --delete-branch` — merge pull request”
>
> **After:** “**`gh pr merge` is NOT pre-approved — CLAUDE.md §10 wins in every lane.** Merging is a release command: it requires an explicit user approval message in the current session… `gh pr merge <number> --squash --delete-branch` … Never pass `--admin`, never bypass branch protection, never force merge.”

### 3. Gate verdicts (S2)

`.claude/mode3/contracts/plan-review.md`

> **Before:** `decision = "APPROVED_FOR_IMPLEMENTATION"   # or NEEDS_REVISION | BLOCKED` — values `openai_gate.py` never emits; the same file’s prose used `verdict = APPROVED`.
>
> **After:** `verdict = "APPROVED"   # or REVISION_REQUIRED | BLOCKED | NEEDS_USER_DECISION | NEEDS_MORE_EVIDENCE` — exactly `PER_GATE_ENUMS["PLAN_REVIEW"]` from the script.

`.claude/commands/mode3-run.md` stop-conditions

> **Before:** “PR_REVIEW REVISION_REQUIRED” (a verdict the PR_REVIEW gate cannot return)
>
> **After:** “PR_REVIEW NEEDS_FIXES (the PR_REVIEW rework verdict — this gate never returns REVISION_REQUIRED) … NEEDS_MORE_EVIDENCE / NEEDS_USER_DECISION → halt to user.”

### 4. Routing-decision marker (S2 — latent preflight failure)

`.claude/templates/team-lead-execution-log.md`

> **Before:** `## <ISO-8601 timestamp> — ROUTING DECISION` — while `verify-mode3-workdone.py:146` requires the literal `[ROUTING DECISION]`; a template-following run failed check 2.
>
> **After:** `## <ISO-8601 timestamp> — [ROUTING DECISION]` + comment: “The heading MUST contain the literal marker `[ROUTING DECISION]` — verify-mode3-workdone.py greps for it.” (Same fix in `team-lead.md` contract and `mode3-orchestrator.md`.)

### 5. Removed spawn tool (S2)

`.claude/mode3/contracts/team-lead.md`

> **Before:** “Coordinate read-only investigation specialists via `Task`…” / “A `Task` call before the routing-decision entry exists on disk is a procedural violation.”
>
> **After:** “Coordinate read-only investigation specialists via the `Agent` tool…” / “A specialist `Agent` call before the routing-decision entry exists on disk is a procedural violation.”

`.claude/agents/team-lead.md`

> **Before:** “### Step 5: Delegate via Task tool” (this agent’s toolset is `Read, Grep, Glob` — the step was unexecutable) and “full toolkit `Task, Bash, Read, Write, Edit, Grep, Glob`” (wrong tools).
>
> **After:** “### Step 5: Hand the partition plan back for delegation — You do not delegate yourself (your toolkit is read-only…)” and “full toolkit `Agent, Bash, Read, Write, Edit, Grep, Glob, SendMessage`”.

### 6. Drifted citations → anchors (S3)

> **Before:** “mandatory unless ALL Lean-mode skip conditions hold per `ROUTE_AND_RUN.md:357–369`” (the block had moved), “`mode3-run.md` line 120 remains word-for-word …” (the sentence is at line 147).
>
> **After:** “per `ROUTE_AND_RUN.md` § "qa-fast may be skipped (Lean mode only)"”, “The `mode3-run.md` source-of-truth sentence (in "Artefacts produced under `.claude/handoffs/issue-<N>/`") remains word-for-word…”.

### 7. Duplication removed (S3)

`.claude/mode3/contracts/team-lead.md § Authority hardening`

> **Before:** 12-bullet restatement of the refusal list, ending “The canonical 12-item refusal list is in `.claude/agents/mode3-orchestrator.md`.” (two full copies in the load path)
>
> **After:** “**The canonical 12-item refusal list lives in `.claude/agents/mode3-orchestrator.md` → Authority hardening — it is not restated here.** In summary: …” (one canonical copy + 3-line summary). Same treatment for the routing-log template (canonical in the template file; the contract now shows only the marker line).

## Clearer ownership, stop conditions, and evidence

- **Ownership:** every contract now opens with an **Actor** line; the Team Lead = Orchestrator = `mode3-orchestrator` equivalence is stated once as a binding equivalence table in the `team-lead.md` contract header.
- **Stop conditions:** every contract header names its stop conditions (previously scattered mid-document); type-specific stop conditions are enumerated per issue type in `issue-checklists.md` (e.g. “live smoke would need an unmerged migration on shared Supabase → `NEEDS_USER_DECISION`”, “visual parity not met → do not claim PASS”).
- **Evidence:** `validation-matrix.md` is declared the **canonical evidence grammar** (command + exit code + scope + freshness + provenance); `ROUTE_AND_RUN.md § Stage Evidence Contract` now cross-references it; per-type evidence requirements are listed in `issue-checklists.md`.

## Reproducible verification (run on this branch)

| Check | Command | Result |
|---|---|---|
| Team/model invariants (pre-existing) | `python3 .claude/scripts/verify-mode3-team-invariant.py` | PASS 24/24 |
| Duplicate-run guard invariants (pre-existing) | `python3 .claude/scripts/verify-mode3-duplicate-run-guard.py` | PASS 17/17 |
| New consistency guard | `python3 .claude/scripts/verify-mode3-docs-consistency.py` | PASS — 54 files, 0 violations |
| Script test suite | `python3 -m pytest .claude/scripts/tests/ -q` | 104 passed, 0 failed |
| No live `--admin` merge instruction | `grep -rn "gh pr merge" .claude --include="*.md" \| grep -- --admin` | only prohibition sentences + historical `.claude/state/parallel-runbook.md` (untouched history, flagged for archive) |
| No live `via \`Task\`` instruction | `grep -rn 'via \`Task\`' .claude` | only `.claude/hardening/*` (dated history, exempt by design) |
| No `.claude/.claude/` typo | `grep -rn '\.claude/\.claude' .claude` | none |

Baseline note: before installing `requirements.txt` deps, `pytest` showed 17 failures — **identical on the untouched pre-refactor tree** (missing `jsonschema`/`openai` modules), proving they are environmental, not regressions. After `pip install jsonschema openai`, the refactored tree is fully green.
