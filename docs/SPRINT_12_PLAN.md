# Sprint 12 — Plan (PR-by-PR)

## Theme
**Make Insights real + improve findability + reduce future drift**
- Populate Insights data (pg_cron + backfill) so charts show meaningful values
- Improve discovery (text search + BHK filter)
- Add admin tooling to reduce locality noise (normalizer)
- Prepare for scale (E2E smoke coverage, alert MVP groundwork)

---

## Inputs / Carryover
- Carry over anything **not shipped** from Sprint 11 + items explicitly deferred.
- Assumption: Sprint 11 may be partially shipped — **verify merge/deploy state** before starting Sprint 12 execution.

---

## Sprint 12 PR List (ordered)

| PR | Name | Priority | Dependencies | Risk | Status |
|----|------|----------|--------------|------|--------|
| PR-12.1 | Supabase pg_cron job — populate `area_price_weekly` | P0 | none | MEDIUM | ✅ DONE |
| PR-12.2 | Admin: locality normalizer (backend + RPC/API) | P1 | none | MEDIUM | ✅ DONE |
| PR-12.3 | Admin UI: locality normalizer tool | P1 | PR-12.2 | LOW | ✅ DONE |
| PR-12.4 | Map: bedroom (BHK) filter | P1 | none | LOW | ✅ DONE |
| PR-12.5 | Listing text search | P1 | none | LOW | ✅ DONE |
| PR-12.6 | Insights: cross-area comparison chart | P2 | PR-12.1 (data) | MEDIUM | ✅ DONE |
| PR-12.7 | Cleanup: remove dead code from PropertyMap | P2 | none | LOW | ✅ DONE |
| PR-12.8 | Price alerts: new listing notifications for saved areas | P2 | PR-12.2 (area keys) | HIGH | ✅ DONE |
| PR-12.9 | E2E: Playwright smoke tests for Sprint 11+12 core flows | P2 | none | LOW | ✅ DONE |

---

## PR Details

### PR-12.1 — Supabase pg_cron job: populate `area_price_weekly` (P0)
**Goal:** Ensure Insights has real, refreshed data (not empty/placeholder).

**Scope**
- Create/confirm table + schema for `area_price_weekly`
- Create idempotent refresh function (safe to run repeatedly)
- Add pg_cron schedule (weekly) + one-time backfill command/script
- Add rollback instructions (unschedule cron)

**Acceptance Criteria**
- Backfill produces rows for expected areas/weeks
- Weekly job scheduled and verified with at least one successful run
- Re-running refresh does not duplicate rows or corrupt history

**Test Plan**
- SQL verification queries for row counts + sample outputs
- Run refresh twice; confirm idempotency
- Confirm cron is scheduled and can be unscheduled cleanly

**Risks / Notes**
- Timezone/week-boundary edge cases
- Large backfill runtime (keep safe, paged/partitioned if needed)

---

### PR-12.2 — Locality normalizer backend (P1)
**Goal:** Provide stable, canonical “area keys” to reduce duplicates and enable alerts/search/analytics.

**Scope**
- Normalization rules (trim/casefold/common aliases)
- Canonical locality mapping store (table or config)
- RPC/API endpoints:
    - list candidates (raw → suggested canonical)
    - apply mapping (raw → canonical)
    - preview impact (how many listings affected)

**Acceptance Criteria**
- Backend can compute suggested canonical locality for a raw input
- Can apply a mapping and confirm affected records count changes as expected
- Safe and reversible (mappings can be updated)

**Test Plan**
- Unit tests for normalization rules
- Integration test for mapping apply + preview

**Risks / Notes**
- Avoid destructive updates without preview
- Keep changes backward compatible for existing filters

---

### PR-12.3 — Locality normalizer admin UI (P1, depends PR-12.2)
**Goal:** Give admins a usable UI to review + apply normalization safely.

**Scope**
- Admin page/route
- Table of candidates: raw locality, suggested canonical, count
- Approve/apply mapping + confirm result
- Basic guardrails (confirm modal, undo guidance)

**Acceptance Criteria**
- Admin can see candidate list and apply mapping
- UI shows counts before/after
- Errors handled without breaking admin session

**Test Plan**
- Manual admin smoke (happy path + error states)
- (Optional) lightweight UI unit test if present

---

### PR-12.4 — Map BHK filter (P1)
**Goal:** Improve map filtering for apartments/houses.

**Scope**
- Add BHK filter UI control
- Apply filter to map pins/list results consistently
- Ensure filter composes correctly with existing filters

**Acceptance Criteria**
- Selecting BHK filters results on map + list view
- Clear/reset works and restores full set
- Works with locality + property type filters

**Test Plan**
- Manual filter combinations
- Regression check: existing filters still work

---

### PR-12.5 — Listing text search (P1)
**Goal:** Allow users to search listing title/description quickly.

**Scope**
- Add search input (debounced)
- Filter listing results by title/description (case-insensitive)
- Guardrail note: if dataset grows large, move search server-side

**Acceptance Criteria**
- Search matches substrings in title/description
- Clear search restores full results
- No noticeable UI lag on typical dataset size

**Test Plan**
- Manual: query variations + empty + special chars
- Quick perf sanity: large list doesn’t freeze UI

---

### PR-12.6 — Insights cross-area comparison chart (P2, depends PR-12.1)
**Goal:** Compare trends/medians across areas now that weekly data exists.

**Scope**
- Multi-area selection (2–5 areas)
- Comparison chart using `area_price_weekly`
- Sensible empty state if data missing for an area

**Acceptance Criteria**
- Chart renders multiple series accurately
- Handles missing/partial data gracefully
- Default selection works (e.g., top 3 areas by listings)

**Test Plan**
- Manual: 2-area + 5-area comparisons
- Verify values line up with SQL samples from PR-12.1

---

### PR-12.7 — Cleanup PropertyMap dead code (P2)
**Goal:** Reduce maintenance overhead without functional changes.

**Scope**
- Remove unused code paths / dead components / commented blocks
- Ensure no behavior changes

**Acceptance Criteria**
- No user-visible behavior change
- Lint/tests pass

**Test Plan**
- Run unit/lint + quick manual map smoke

---

### PR-12.8 — Price alerts MVP (P2, depends PR-12.2)
**Goal:** Notify users about new listings in saved areas (minimal, safe).

**Scope**
- Users can save an area (canonical key)
- Job or trigger identifies new listings per saved area
- Send notification (email) best-effort (must not break listing approval flow)
- Unsubscribe/minimal preference management

**Acceptance Criteria**
- Saving an area results in alerts for new matching listings
- Notification failures do not affect core workflows
- Basic unsubscribe works

**Test Plan**
- Manual: create saved area → add new listing → alert received
- Failure simulation: email service down → core flow still succeeds

**Risks / Notes**
- Must be async/best-effort; avoid coupling to approval transaction
- Privacy/PII handling must be reviewed

---

### PR-12.9 — Playwright E2E smoke tests (P2)
**Goal:** Catch regressions cheaply once core flows stabilize.

**Scope**
- Smoke coverage for:
    - Load map + apply filters
    - Open listing detail
    - Search listings
    - Insights loads (basic)
- CI-friendly run (headless)

**Acceptance Criteria**
- Tests run reliably and finish quickly
- Failures are actionable (clear assertions)

**Test Plan**
- Run locally + in CI
- Fix flakiness before adding more coverage

---

## Manual Test Checkpoints

### CP0 — After PR-12.1 completes (data foundation)
**Stop and manually verify**
- App loads (no console errors)
- Insights loads (even if minimal) and does not crash
- Map + listing detail still load

### CP1 — After PR-12.4 + PR-12.5 (core discovery)
- Map filters (including BHK) work in combination
- Text search works, clear works
- Listing detail still correct

### CP2 — Before “done” (after PR-12.6/12.8/12.9)
- Full smoke across key flows:
    - Map + filters + search
    - Listing detail
    - Insights charts (with real data)
    - Alerts (MVP flow)
    - E2E suite green

---

## Execution Notes (for Claude / automation)
- Use Sprint Executor: **1 PR at a time**, diff/snippets only, rolling checkpoint required.
- After each PR: stage changes + propose commit message, ask approval for `git commit`.

---

## Out of Scope (explicit)
- Full server-side search + ranking (only add if dataset forces it)
- Advanced alert rules (price thresholds, frequency controls) beyond MVP
- Large-scale redesign of Insights UI

---

## Candidate Backlog for Sprint 13 (optional)
- Server-side full-text search + indexes
- Alert preferences UI (frequency, thresholds)
- Admin tooling hardening (audit log, bulk apply, rollback UI)
- More robust Insights (segmentation by property type/BHK)