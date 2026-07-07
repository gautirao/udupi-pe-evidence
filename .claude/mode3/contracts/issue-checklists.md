# Mode-3 contract — Per-issue-type checklists

> **Purpose:** one compact checklist per issue type — specialist set, required evidence, and type-specific stop conditions — so intake (Phase 0.6) and planning (Phase 0.7) pick the same expectations.
> **When to load:** Phase 0.6 (Main Agent intake classification) and Phase 0.7 (Team Lead planning). Cheap to keep loaded through Phase 5.
> **Actors:** Main Agent (classification), Team Lead (routing + evidence planning).
> **Inputs:** issue body + labels; `ROUTE_AND_RUN.md` classification (authoritative for risk tier / execution mode).
> **Allowed scope:** these checklists ADD type-specific requirements; they never remove a Route-and-Run gate or a validation-matrix hard trigger.
> **Forbidden:** using a checklist to justify skipping a mandatory gate; mixing types to pick the weakest requirements (when an issue spans types, apply the union).
> **Stop conditions:** each checklist lists its own; the global stop-conditions table in `mode3-run.md` always applies on top.
> **Outputs:** informs `team-lead-assignment.toml` (issue_type/risk), `team-lead-plan.toml` (specialist sequence, qa requirements, `[validation_matrix]` level).

Shared baseline for every type (from Route-and-Run; restated once here, not per checklist): qa-fast pre-implementation (unless Lean-mode skip), engineer per issue-type mapping, code-reviewer, security-reviewer on any Gate F trigger, qa verification for Normal/High-risk, 2-cycle reroute limit, stop at PR-ready, merge only on explicit user approval.

---

## 1. Backend / API issue

- **Specialists:** qa-fast → `backend-engineer` → code-reviewer → [security-reviewer if Gate F: auth/JWT/public exposure/PII] → qa verification.
- **Evidence required:** exact test commands + exit codes (`mvn test` and `mvn verify` are separate rows — surefire vs failsafe); request/response evidence for changed endpoints (curl/test output with URL, params, status code); regression test named; API-contract note if any public shape changed.
- **Validation matrix:** COMPACT minimum; FULL if public/anonymous endpoint, auth, listing visibility, or indexing/search is touched.
- **Type stop conditions:** endpoint would expose OpenSearch directly to the frontend (keep OpenSearch behind the backend unless explicitly scoped); contract change without callers verified; live smoke would need an unmerged migration on shared Supabase → `NEEDS_USER_DECISION`.

## 2. Frontend / UX issue

- **Specialists:** qa-fast → [`ui-designer` if visible redesign/new screen] → `frontend-engineer` → code-reviewer → [qa e2e-authoring if recommended] → qa verification → Phase 7A browser verification (mandatory — user-visible).
- **Evidence required:** screenshots or Playwright trace of the changed journey (`[evidence_chain]` fully populated — exact URL, spec path, env file, artefact path); URL/map/panel/badge state consistency where relevant; MANUAL_PASS vs AUTOMATED_PASS labelled separately (CLAUDE.md §11).
- **Validation matrix:** COMPACT typical; NOT_REQUIRED only for a one-line CSS/class tweak with no logic.
- **Type stop conditions:** visual parity with the approved design not met → do not claim PASS, reroute or halt; browser evidence missing for a user-visible change → 7A cannot pass; sweep findings must NOT widen the PR (follow-ups instead).

## 3. Security / privacy issue

- **Specialists:** qa-fast (⚠️ SECURITY section) → engineer per layer → code-reviewer (opus override — high-risk) → security-reviewer (mandatory, blocking) → qa verification.
- **Evidence required:** security evidence doc (threat addressed, before/after behaviour, negative tests — e.g. unauthorised request rejected with status code); proof no secrets in diff; RLS/authz tests where applicable.
- **Validation matrix:** FULL (hard trigger — always).
- **Type stop conditions:** unapproved secret exposure discovered → freeze and report (never commit, never print); fix requires weakening RLS/authz elsewhere → SCOPE_EXPANSION_REQUIRED; security-reviewer BLOCKING_FINDINGS → `blocked.toml(SECURITY_FAILED)`.

## 4. DB / migration issue

- **Specialists:** [architect if schema design is open] → `backend-engineer` (Flyway) or `supabase-engineer` (RLS/RPC/storage) → code-reviewer (opus override) → security-reviewer if RLS/PII → qa verification.
- **Evidence required:** migration tested against Testcontainers / local ephemeral DB (command + exit code); expand/contract safety note (backward-compatible? rollback path?); never a new edit to an existing applied migration — new versioned file only.
- **Validation matrix:** FULL (hard trigger — data model/schema/migration).
- **Type stop conditions:** any step would run an unmerged migration against hosted/shared Supabase → STOP, `NEEDS_USER_DECISION` (no shared-DB mutation during unmerged validation — ever); migration ordering/slot conflict with another branch → report before proceeding.

## 5. Docs-only issue

- **Specialists:** engineer-of-record for the doc area (may be handled per Main-Agent Documentation rules in `main-agent.md` when no codebase diagnosis is needed) → code-reviewer only if the doc states factual/behavioural claims.
- **Evidence required:** link/path check for changed references; for docs making factual claims, a claims-traceability row per claim (validation-matrix FULL applies to workflow/gate/validator docs — a "docs" change to `.claude/` workflow files is NOT a docs-only change, it is a workflow change).
- **Validation matrix:** NOT_REQUIRED (true typo/wording) or COMPACT (claims needing evidence); FULL if the doc IS a workflow/gate/validator file.
- **Type stop conditions:** the "docs" edit turns out to alter behaviour (workflow, scripts, config) → reclassify, do not proceed under docs-only; Phase 7A/7B skipped with the skip recorded in the packet.

## 6. Data-ingestion / scraping issue

- **Specialists:** qa-fast → `backend-engineer` (+ architect if pipeline shape is new) → code-reviewer → security-reviewer if credentials/PII flows → qa verification.
- **Evidence required:** dry-run output on a bounded sample (command + exit code + row counts); idempotency note (safe to re-run?); rate-limit/politeness note for external sources; data-quality spot-check (before/after counts, sample records); no live/shared-DB writes during validation — Testcontainers or a local ephemeral DB.
- **Validation matrix:** FULL when the script creates/updates/deletes data (hard trigger); COMPACT for read-only fetch prototypes.
- **Type stop conditions:** run would mutate shared Supabase or production-like data before merge → `NEEDS_USER_DECISION`; scope grows from "ingest X" to "redesign pipeline" → SCOPE_EXPANSION_REQUIRED; source requires credentials not already provisioned → stop, never invent or copy credentials.

## 7. Refactor / cleanup issue

- **Specialists:** relevant engineer → code-reviewer → qa verification if behaviour could be affected.
- **Evidence required:** behaviour-preservation proof (same test suite green before and after, exit codes for both runs); diff summary showing no functional change; rollback note.
- **Validation matrix:** COMPACT typical; NOT_REQUIRED only for provably cosmetic moves.
- **Type stop conditions:** refactor starts changing behaviour → stop, reclassify; "unrelated cleanup" temptation (deleting stashes/branches/untracked files, drive-by fixes) → forbidden without explicit approval; `_ds_bundle.js` and other explicitly-protected files stay untouched unless the issue scope names them.
