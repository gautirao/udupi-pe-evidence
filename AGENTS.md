# AGY AUTONOMOUS OPERATING CONTRACT

Whenever the user asks to work on an issue, bug, feature, or PR (e.g. `work on <issue>`, `fix issue <issue>`, `continue <issue>`, `investigate bug`, `take next issue`), automatically assume the autonomous AGY PR-first workflow (`mode3-run <issue>`), unless explicitly requested analysis-only.

## Core Directives & Invariants

1. **Default PR-First Workflow**:
   - Every code issue runs in an isolated worktree (`/Users/gouthamrao/projects/udupi-property-explorer-worktrees/lane-<issue#>`) and branch (`fix/...`, `feat/...`, `chore/...`).
   - Open a Draft PR early (`gh pr create --draft`). Use the PR as the sole durable execution channel.
   - Refer to shared contracts in `.agents/contracts/` (`pr-workflow.md`, `worktree-contract.md`, `pre-push-review-contract.md`, `exact-head-contract.md`, `merge-gate.md`, `reviewer-routing.md`, `lane-ledger.md`, `startup-check.md`).

2. **Inner-Loop Pre-Push Review**:
   - Implementation engineer works locally in working tree.
   - Dispatch `pre-push-reviewer` to audit `git diff` before commit/push.
   - Engineer fixes findings locally; reviewer re-audits fix delta until `CLEAN FOR COMMIT`.
   - Engineer MUST NOT commit or push until `CLEAN FOR COMMIT` is issued (unless remote CI/preview is required).

3. **Separate Independent PR Reviewers**:
   - PR Code Reviewer audits pushed exact HEAD on GitHub PR and identifies as:
     `Reviewer: PR Code Reviewer`
     `Exact HEAD: <sha>`
   - `CLEAN FOR COMMIT` is local pre-push certification only and is NEVER treated as PR approval.

4. **Token Efficiency & Progressive Disclosure**:
   - Load only skills/contracts required for current stage.
   - Pre-push reviewer starts from working-tree diff; rechecks fix deltas.
   - PR reviewers do not repeat resolved trivial inner-loop findings.
   - Final merge reviewer consumes existing verdicts/evidence and investigates only gaps/contradictions.
   - Maintain compact `lane-ledger` state records instead of re-reading full histories.
   - Subagents return compact reports (`status`, `exact_HEAD`, `findings`, `evidence`, `blockers`, `next_action`).

5. **Owner Interruption Policy**:
   - Never stop for questions answerable from issue descriptions, code, tests, or existing architecture.
   - Interrupt owner ONLY for material architectural boundary changes, destructive production mutations, or legal/cost decisions.
   - Format decision requests cleanly on PR as `Decision required — <short title>`.

6. **Merge Authorization & Autonomous Merging Rules**:
   - **Human-Only Owner Approval Token**: AGY, subagents, reviewers, final reviewers, and orchestrators MUST NEVER emit `OWNER_APPROVED_TO_MERGE` or any agent-generated equivalents ("owner approved", "approved by owner", "owner authorization granted"). The token `OWNER_APPROVED_TO_MERGE` is reserved EXCLUSIVELY for an explicit message from the human owner in the active conversation or GitHub PR comments. AGY agents may only emit `READY_FOR_OWNER_APPROVAL` or, for buyer-visible UI work, `READY_FOR_OWNER_VISUAL_APPROVAL` (which are NOT merge authorization).
   - **Hard Block on PARTIAL / BLOCK / REQUEST_CHANGES**: Merge is strictly prohibited if ANY applicable reviewer on the CURRENT exact HEAD has `PARTIAL`, `BLOCK`, `REQUEST_CHANGES`, `FAIL`, `NEEDS_WORK`, `*_PENDING` or unresolved equivalent findings. A later reviewer `PASS` does NOT erase another reviewer's unresolved `PARTIAL` or `BLOCK`. Any contradiction between reviewers is a `REVIEW_STATE_CONTRADICTION` and must fail the merge gate.
   - **UI / Visual Changes Require Human Visual Approval**: For any material buyer-visible UI change (reskin, layout, spacing, typography, marker/card redesign, responsive layout, visual hierarchy, interaction affordances, mobile presentation), AGY MUST STOP before merge, deploy preview, publish GitHub-visible visual evidence (approved mock, BEFORE, AFTER, mobile AFTER, selected/hover states, preview URL, exact HEAD), post `READY_FOR_OWNER_VISUAL_APPROVAL`, and WAIT for explicit human owner visual approval. No timeout, inference, reviewer PASS, silence, or previous approval may substitute.
   - **Head-Bound Owner Approval**: Owner approval is bound strictly to the exact HEAD SHA. Any code-changing push invalidates it (`OWNER APPROVAL = STALE`), requiring new visual evidence + new owner approval.
   - **Visual Evidence Contract**: Evidence must be visible on GitHub PR (mock ref, BEFORE screenshot, AFTER screenshot, same route/scenario/viewport, mobile AFTER, selected/hover states, preview URL, exact HEAD). Local file paths or prose statements are NOT sufficient.
   - **Visual Reviewer Role**: The visual reviewer (`ui-reviewer`) is an evidence/difference verifier comparing MOCK vs BEFORE vs AFTER (verdicts: `VISUAL_MATCH`, `VISUAL_MISMATCH`, `PARTIAL`). It cannot authorize merge.
   - **Final Merge Reviewer Role**: Verifies exact HEAD SHA, zero unresolved blockers, all applicable reviews PASS/MATCH, CI state, visual evidence, and human owner approval. For UI work, it emits `READY_TO_MERGE` ONLY AFTER explicit human owner visual approval is recorded for current exact HEAD. It MUST NEVER emit `OWNER_APPROVED_TO_MERGE` itself.
   - **Merge Authority**: Non-UI work allows normal autonomous merge after all required independent reviews pass. Material UI work allows autonomous merge ONLY AFTER actual human visual approval is observed for current exact HEAD.

7. **Post-Merge Verification**:
   - For buyer-visible bugs/features or production-sensitive behavior, automatically run post-merge verification (`post-merge-verifier`).
   - Post `POST-MERGE VERIFIED` or `POST-MERGE REGRESSION FOUND`.

---

## Code Exploration Policy

Always use jCodemunch-MCP tools for code navigation. Never fall back to Read, Grep, Glob, or Bash for code exploration.
**Exception:** Use `Read` when you need to edit a file — the agent harness requires a `Read` before `Edit`/`Write` will succeed. Use jCodemunch tools to *find and understand* code, then `Read` only the specific file you're about to modify.

**Start any session:**
1. `resolve_repo { "path": "." }` — confirm the project is indexed. If not: `index_folder { "path": "." }`
2. `suggest_queries` — when the repo is unfamiliar

**Finding code:**
- symbol by name → `search_symbols` (add `kind=`, `language=`, `file_pattern=`, `decorator=` to narrow)
- decorator-aware queries → `search_symbols(decorator="X")` to find symbols with a specific decorator (e.g. `@property`, `@route`); combine with set-difference to find symbols *lacking* a decorator (e.g. "which endpoints lack CSRF protection?")
- string, comment, config value → `search_text` (supports regex, `context_lines`)
- database columns (dbt/SQLMesh) → `search_columns`

**Reading code:**
- before opening any file → `get_file_outline` first
- one or more symbols → `get_symbol_source` (single ID → flat object; array → batch)
- symbol + its imports → `get_context_bundle`
- specific line range only → `get_file_content` (last resort)

**Repo structure:**
- `get_repo_outline` → dirs, languages, symbol counts
- `get_file_tree` → file layout, filter with `path_prefix`

**Relationships & impact:**
- what imports this file → `find_importers`
- where is this name used → `find_references`
- is this identifier used anywhere → `check_references`
- file dependency graph → `get_dependency_graph`
- what breaks if I change X → `get_blast_radius`
- what symbols actually changed since last commit → `get_changed_symbols`
- find unreachable/dead code → `find_dead_code`
- class hierarchy → `get_class_hierarchy`

## Session-Aware Routing

**Opening move for any task:**
1. `plan_turn { "repo": "...", "query": "your task description", "model": "<your-model-id>" }` — get confidence + recommended files; the `model` parameter narrows the exposed tool list to match your capabilities at zero extra requests.
2. Obey the confidence level:
   - `high` → go directly to recommended symbols, max 2 supplementary reads
   - `medium` → explore recommended files, max 5 supplementary reads
   - `low` → the feature likely doesn't exist. Report the gap to the user. Do NOT search further hoping to find it.

**Interpreting search results:**
- If `search_symbols` returns `negative_evidence` with `verdict: "no_implementation_found"`:
  - Do NOT re-search with different terms hoping to find it
  - Do NOT assume a related file (e.g. auth middleware) implements the missing feature (e.g. CSRF)
  - DO report: "No existing implementation found for X. This would need to be created."
  - DO check `related_existing` files — they show what's nearby, not what exists
- If `verdict: "low_confidence_matches"`: examine the matches critically before assuming they implement the feature

**After editing files:**
- If PostToolUse hooks are installed (Claude Code only), edited files are auto-reindexed
- Otherwise, call `register_edit` with edited file paths to invalidate caches and keep the index fresh
- For bulk edits (5+ files), always use `register_edit` with all paths to batch-invalidate

**Token efficiency:**
- If `_meta` contains `budget_warning`: stop exploring and work with what you have
- If `auto_compacted: true` appears: results were automatically compressed due to turn budget
- Use `get_session_context` to check what you've already read — avoid re-reading the same files

## Model-Driven Tool Tiering

Your jcodemunch-mcp server narrows the exposed tool list based on the model you are running as. To avoid wasting requests on primitives when a composite would do, always include `model="<your-model-id>"` in your opening `plan_turn` call.

Replace `<your-model-id>` with your active model:
- Claude Opus variants → `claude-opus-4-7` (or any `claude-opus-*`)
- Claude Sonnet variants → `claude-sonnet-4-6`
- Claude Haiku variants → `claude-haiku-4-5`
- GPT-4o / GPT-5 / o1 / Llama → use the model id as printed by your runner

The `model=` parameter rides on the existing `plan_turn` call — it does **not** add a separate tool invocation. If `plan_turn` is not appropriate for a non-code task, call `announce_model(model="...")` once instead.

## Specialist Code Navigation (jCodemunch-first)

This section is the single canonical home for the Mode-3 specialist navigation rule. It **references** — and does NOT duplicate — the existing policy in project `CLAUDE.md` §9 ("jCodemunch & Code Navigation") and the global **Code Exploration Policy** above. The tool catalogue, re-index mechanics, and start-of-session steps already live there; only the new specialist-facing rules are stated here.

**Rule:** All Mode-3 specialists use jCodemunch-first for code discovery (`search_symbols` / `search_text` / `get_file_outline` / `get_context_bundle` / `find_references`) BEFORE broad file Reads. Direct `Read` is an allowed fallback that MUST be recorded (see CLAUDE.md §9 — the main repo index covers all files; `Read` is also required immediately before any `Edit`/`Write`).

**Recognised fallback reasons** (use the shortest accurate one):
- index stale for the file
- file missing from index / newly created
- exact files already supplied in the approved plan
- docs-only task with no code navigation

**[jcm] evidence block.** A navigating specialist emits a compact `[jcm]` block in its result; a specialist that did no code navigation still emits the block with `used = false` and a short fallback reason. Compact only — NO file-path lists, NO query text, NO result/content dumps.

```
[jcm]
used = true            # bool — was jCodemunch used for code discovery on this call?
queries = 2            # count (or short list) of jCodemunch queries run
files = 3              # count of files navigation targeted/opened
fallback = "NONE"      # "NONE" or a SHORT reason (one of the recognised reasons above)
```

**Discovery-only clause (verbatim intent):** jCodemunch is for DISCOVERY and navigation only. It NEVER replaces an agent's required obligations — code-reviewer must still read every changed file in full before forming conclusions; security-reviewer must still ground findings in directly-read code evidence.
