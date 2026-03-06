# Sprint 13 — Plan (PR-by-PR)

## Theme
**Scale search + deepen insights + harden admin**
- Move listing search server-side (FTS) so it scales beyond in-memory filtering
- Add property-type segmentation to Insights charts
- Add per-area alert preferences so users control their noise
- Add admin audit log for locality renames and listing decisions (append-only)

---

## Inputs / Carryover
- Sprint 12 fully shipped. CI live. Flyway at V17.
- Client-side text search (PR-12.5) is the baseline; Sprint 13 replaces it with server-side FTS.
- Price alerts MVP (PR-12.8) fires on every approval; Sprint 13 adds user controls.
- Admin locality bulk-rename exists; Sprint 13 adds auditability.

---

## Sprint 13 PR List (ordered)

| PR | Name | Priority | Dependencies | Risk | Status |
|----|------|----------|--------------|------|--------|
| PR-13.1 | DB: full-text search vector column + GIN index (V18) | P0 | none | MEDIUM | |
| PR-13.2 | Backend: listing search API endpoint (FTS) | P0 | PR-13.1 | MEDIUM | |
| PR-13.3 | Frontend: wire map/list search to backend FTS | P1 | PR-13.2 | LOW | |
| PR-13.4 | DB: admin audit log table (append-only) (V19) | P1 | none | LOW | |
| PR-13.5 | Backend: write audit events for approve/reject/locality rename | P1 | PR-13.4 | LOW | |
| PR-13.6 | Insights: property-type segmentation filter | P1 | Data readiness (property_type populated) | MEDIUM | |
| PR-13.7a | Alert preferences: DB + backend enable/disable per area (V20) | P2 | none | LOW | |
| PR-13.7b | Alert preferences UI: per-area toggle | P2 | PR-13.7a | LOW | |
| PR-13.8 | Admin UI: audit log viewer | P2 | PR-13.5 | LOW | |

---

## PR Details

### PR-13.1 — DB: full-text search vector + GIN index (P0)
**Goal:** Add a `tsvector` column to `property_listings` and a GIN index to enable server-side FTS without sequential scans.

**Scope**
- V18 migration: add `search_vector tsvector GENERATED ALWAYS AS (...) STORED` on `title || ' ' || locality || ' ' || coalesce(description, '')`
- GIN index: `CREATE INDEX IF NOT EXISTS idx_property_listings_search_vector ON property_listings USING gin(search_vector)`
- Column language: `english`
- Fallback note: if generated column migration proves heavy, switch to a normal `tsvector` column + backfill in batches + trigger to maintain

**Dependencies:** none  
**Risk:** MEDIUM — generated column may lock/scan depending on table size

**Acceptance Criteria**
- `EXPLAIN` on `WHERE search_vector @@ websearch_to_tsquery(...)` uses index (no seq scan)
- Migration is idempotent (`IF NOT EXISTS` where applicable)
- Existing listing reads unaffected

**Test Plan**
- SQL verification: insert test row, confirm `search_vector` populated; query with `websearch_to_tsquery`
- Confirm index exists via `pg_indexes`
- Flyway migration runs cleanly in test container

**Manual test note**
- Run migration against local/staging DB; confirm no timeout/lock errors
- Query a known listing by partial title; confirm row returned

---

### PR-13.2 — Backend: listing search API endpoint (FTS) (P0)
**Goal:** Expose `GET /api/public/listings/search?q=&locality=&propertyType=&bedrooms=&page=&size=` using Postgres FTS.

**Scope**
- Endpoint requires `q` (min length 2). If missing/blank → return 400 (frontend should use normal “list all” endpoint for no-search)
- Query: `status = 'LIVE' AND search_vector @@ websearch_to_tsquery('english', :q)`
- Compose optional locality/propertyType/bedrooms filters (AND)
- Return paginated `ListingSearchResult` projection (id, title, locality, price, propertyType, bedrooms, firstImageUrl, latitude, longitude)
- Public endpoint; apply existing rate limiting if available

**Dependencies:** PR-13.1  
**Risk:** MEDIUM — correctness + pagination + query parsing + perf

**Acceptance Criteria**
- `GET /api/public/listings/search?q=house&locality=Udupi` returns correct results
- Pagination stable (no duplicates across pages)
- Blank/short `q` returns 400 with a clear message
- Special characters in `q` do not cause SQL errors

**Test Plan**
- `@WebMvcTest`: validate 400 on missing/short `q`
- Integration test (Testcontainers): seed listings; verify search results + pagination
- Edge: `q` with quotes/minus (e.g., `"river view" -land`) returns 200 (even if empty) and never throws

**Manual test note**
- Curl endpoint with normal and special queries; confirm 200/400 behavior
- `EXPLAIN` confirms index usage for typical queries

---

### PR-13.3 — Frontend: wire map/list search to backend FTS (P1)
**Goal:** Replace client-side `useMemo` filtering with backend FTS; preserve debounce and UX.

**Scope**
- New hook `useListingSearch(q, filters)` → calls `GET /api/public/listings/search`
- Replace in-memory search in `PropertyMap` / listing list component with hook result
- Keep debounce (300ms); show loading state during fetch
- Clear search → use existing “list all LIVE listings” endpoint (not the search endpoint)
- Cancel in-flight searches when query changes (AbortController) to avoid racey UI updates
- Remove now-unused client-side filter logic

**Dependencies:** PR-13.2  
**Risk:** LOW — UI behavior should remain the same; only data source changes

**Acceptance Criteria**
- Typing triggers backend call after debounce (visible in network tab)
- Map pins update to reflect search results
- Clearing search restores full pin set cleanly (no flash/jitter)
- No stale results due to race conditions

**Test Plan**
- Unit test `useListingSearch`: mock fetch, verify debounce + abort behavior
- Component test: type in search box; verify request args and UI updates
- Manual: search + clear; verify map/list consistency

**Manual test note**
- Test on dataset 100+ listings to confirm no client-side freeze
- Verify BHK + locality filters still compose correctly with search

---

### PR-13.4 — DB: admin audit log table (append-only) (P1)
**Goal:** Persist an append-only record of admin actions (approve, reject, locality rename).

**Scope**
- V19 migration: `admin_audit_log` table:
    - `id uuid PK`
    - `admin_id uuid NOT NULL`
    - `action varchar(64) NOT NULL`
    - `entity_type varchar(64)`
    - `entity_id uuid`
    - `before_json jsonb`
    - `after_json jsonb`
    - `created_at timestamptz DEFAULT now()`
- Indexes: `(admin_id, created_at DESC)`, `(entity_type, entity_id)`
- Guardrail: prevent UPDATE/DELETE at DB level (permissions or trigger) to keep table append-only
- RLS/permissions: admins can SELECT; backend service role writes

**Dependencies:** none  
**Risk:** LOW — additive table

**Acceptance Criteria**
- Table + indexes created idempotently
- UPDATE/DELETE not permitted
- Flyway migration runs cleanly in CI/test container

**Test Plan**
- Migration runs via Testcontainers
- Smoke: insert row, select row

**Manual test note**
- Confirm table visible in Supabase dashboard after migration

---

### PR-13.5 — Backend: write audit events for admin actions (P1)
**Goal:** Record approve, reject, and locality-rename actions to `admin_audit_log` after each commit.

**Scope**
- New `AuditLogRepository` (Spring Data JPA) writes to `admin_audit_log`
- New `AdminAuditService.record(adminId, action, entityType, entityId, beforeJson, afterJson)`
- Hook in `AdminListingController.approve()` → `listing_approved`
- Hook in `AdminListingController.reject()` → `listing_rejected`
- Hook in `AdminLocalityController.apply()` → `locality_renamed` with before/after counts
- Audit write must not affect primary action (use async and/or `REQUIRES_NEW`); failures swallowed and logged

**Dependencies:** PR-13.4  
**Risk:** LOW

**Acceptance Criteria**
- Approving listing inserts one `listing_approved` row
- Locality rename inserts one `locality_renamed` row with before/after JSON
- If audit write throws, primary action still returns 200

**Test Plan**
- `@WebMvcTest`: verify record(...) called with expected args
- IT test: approve listing → query audit table → row exists
- Failure test: force audit error → approve still succeeds

**Manual test note**
- Approve listing; inspect `admin_audit_log` in Supabase
- Rename locality; confirm row includes before/after counts

---

### PR-13.6 — Insights: property-type segmentation filter (P1)
**Goal:** Allow users to segment Insights charts by property type (All / Apartment / House / Land).

**Scope**
- Data readiness check FIRST:
    - Verify `area_price_weekly` includes `property_type` and it is populated
    - If missing/unpopulated: include a small migration/backfill step (or split into PR-13.6a)
- Backend: add optional `propertyType` param to Insights endpoints; apply filter when present
- Frontend: segmentation toggle above charts; pass `propertyType` into hooks; refetch on change
- Empty state when an area has no data for selected type

**Dependencies:** Data readiness (property_type populated)  
**Risk:** MEDIUM — depends on weekly aggregation shape

**Acceptance Criteria**
- Switching to "Apartment" updates chart series (or shows empty state)
- "All" restores aggregated view
- No crashes when data missing for a type

**Test Plan**
- Backend unit test: filter applied when propertyType is non-null
- Frontend hook test: hooks called with correct propertyType when toggled
- Manual: toggle all types across at least 2 areas

**Manual test note**
- SQL check property_type presence/population before wiring UI
- If missing: treat PR-13.6 as blocked until backfill lands

---

### PR-13.7a — Alert preferences: DB + backend enable/disable per area (V20) (P2)
**Goal:** Let users silence area alerts without un-saving the area.

**Scope**
- V20 migration: add `alerts_enabled boolean NOT NULL DEFAULT true` to `saved_areas`
- Backend: `PATCH /api/saved-areas/:areaKey/alerts` toggles `alerts_enabled`
- Notification logic honors `alerts_enabled=false` (skip)
- No UI in this PR

**Dependencies:** none  
**Risk:** LOW

**Acceptance Criteria**
- Toggle API persists state
- Alerts skipped when disabled
- Defaults unchanged (enabled)

**Test Plan**
- IT: alerts_enabled=false → approve listing → no notification row
- IT: alerts_enabled=true → notification row created
- API test: PATCH toggles and persists

**Manual test note**
- Toggle via curl; verify persistence

---

### PR-13.7b — Alert preferences UI: per-area toggle (P2)
**Goal:** Expose per-area alert toggle in UI.

**Scope**
- Toggle switch per saved area
- Optimistic update + rollback on failure
- Calls PATCH endpoint from PR-13.7a

**Dependencies:** PR-13.7a  
**Risk:** LOW

**Acceptance Criteria**
- Toggle persists on refresh
- Error shows non-blocking message and reverts UI

**Test Plan**
- Component test: toggle calls PATCH with correct payload
- Manual: toggle off → refresh → still off

---

### PR-13.8 — Admin UI: audit log viewer (P2)
**Goal:** Give admins a paginated read-only view of recent admin actions.

**Scope**
- Backend: `GET /api/admin/audit-log?page=&size=` (admin-only), ORDER BY created_at DESC
- Admin page `/admin/audit-log`: table (Action | Entity | Admin | Timestamp)
- Linked from Admin nav
- Read-only view (no delete/edit)

**Dependencies:** PR-13.5  
**Risk:** LOW

**Acceptance Criteria**
- Admin can view paginated rows
- Non-admin denied/redirected
- Actions/timestamps render human-readably

**Test Plan**
- `@WebMvcTest`: admin JWT 200; non-admin 403
- E2E: admin navigates to audit log; page renders
- Component test: empty state renders when list empty

**Manual test note**
- Perform approve + locality rename; confirm both appear in audit log

---

## Manual Test Checkpoints

### CP0 — After PR-13.3 (FTS end-to-end complete)
Stop and manually verify before continuing.

- [ ] Search "apartment" → map pins filter correctly
- [ ] Search partial word (e.g. "udup") → matching listings returned
- [ ] Clear search → all pins restored via normal listings endpoint
- [ ] BHK + text search compose correctly
- [ ] Locality + text search compose correctly
- [ ] Empty results show empty state (not crash)
- [ ] No console errors during search flow
- [ ] Listing detail unaffected
- [ ] Backend logs indicate FTS path (not client filtering)
- [ ] No 500s in backend logs

### CP1 — After PR-13.6 + PR-13.7b (Insights + alert controls)
- [ ] Insights loads without crash
- [ ] Property-type toggle changes chart or shows empty state gracefully
- [ ] "All" restores aggregated view
- [ ] Alert toggle persists (disable → refresh → still disabled)
- [ ] Disabling alerts prevents new notification rows
- [ ] Re-enabling resumes notifications
- [ ] No regressions in map/list flows

### CP2 — Release candidate smoke (after PR-13.8)
- [ ] Map + search + filters working end-to-end
- [ ] Insights segmentation working
- [ ] Alert toggle persists + behavior correct
- [ ] Audit log page accessible to admin and sorted newest-first
- [ ] Audit log inaccessible to non-admin
- [ ] Approve → audit row appears
- [ ] Locality rename → audit row appears with before/after
- [ ] All tests green in CI

---

## Out of Scope (explicit)
- Email delivery for alerts (in-app only)
- Price threshold alerts (on/off only; thresholds later)
- Audit log rollback/undo (read-only)
- Search ranking/relevance tuning beyond basic FTS
- Insights segmentation by BHK (property-type only)

---

## Candidate Backlog for Sprint 14 (optional)
- Email delivery for alerts (Resend/SES)
- Price thresholds per area
- Insights segmentation by BHK count
- Audit rollback / locality rename undo
- Search relevance tuning (weights, recency boost)