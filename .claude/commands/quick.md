# /quick — Quick Task Execution

Execute a single contained task with minimal ceremony. Use for doc-only changes, single-service bugfixes, small UI fixes, and test additions.

## Steps

**1. Triage:** Run ROUTE_AND_RUN Step 1 + Step 1B (classification and type).

**2. Eligibility check — BLOCKED if any of:**
- Classification = `high-risk`
- Type = `security`
- Routing would trigger Path F (security gate) or F2 (migration/schema gate)
- Scope = `cross-cutting` or `multi-service`
- Changed files include `db/migration/` (Flyway migrations)
- Task touches auth / JWT / RLS / storage policies

If BLOCKED: output "This task needs structured execution — use `/sprint` or standalone ROUTE_AND_RUN." Do not proceed.

**3. Execute:** Run ROUTE_AND_RUN from Step 2 (routing) onward.

**4. Ship log:** Append a brief entry to `.claude/SHIP_LOG.md`.

**5. State update:** Update `.claude/STATE.md` — add to "Recent Completions", update "Session Continuity".

## What this skips

No spec enrichment. No team-lead pre-flight. No sprint checkpoint.

## When NOT to use /quick

- Schema changes (Flyway migrations) → use `/sprint` or standalone ROUTE_AND_RUN
- Auth / JWT / session changes → same
- RLS or storage policy changes → same
- Cross-layer work (backend + frontend + DB in one task) → needs architect or team-lead decomposition
- Anything that classifies as high-risk → needs full gate chain
