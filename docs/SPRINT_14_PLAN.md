# Sprint 14 — Plan (PR-by-PR)

## Theme
**Unblock insights segmentation · Ship alert emails · Add price thresholds · Tune search**

---

## Carryover / Gaps

### PR-13.6 — Blocked: Insights property-type segmentation
`area_price_weekly` and `area_stats_latest` have no `property_type` column.
Three things must happen before the frontend filter can work:
1. **V21 migration** — add `property_type varchar(32)` to both tables
2. **Rollup job update** — re-group aggregations by `(area_key, property_type, …)`
3. **Backfill** — re-run rollup jobs against existing `property_listings` data

Only then can backend filter + frontend toggle land (PR-14.3, completing PR-13.6).

---

## Email Provider: Resend vs SES

| | Resend | SES |
|---|---|---|
| Setup | API key + 1 DNS record, ~10 min | IAM + sandbox approval + bounce config, ~2–4 h |
| Free tier | 3 000 emails/mo | 62 000/mo (in-AWS only) |
| SDK | Simple REST; Java via `RestTemplate`/`WebClient` | `aws-sdk-java-v2` (heavy) |
| Sandbox | None | Required; production access needs approval |
| Cost at scale | $20/mo for 50 k | ~$5/mo for 50 k |

**Pick: Resend.** Lowest setup friction for a small team; swap to SES if monthly volume exceeds 3 000.

---

## Sprint 14 PR List

| PR | Name | Priority | Depends on | Risk |
|----|------|----------|------------|------|
| PR-14.1 | DB: add property_type to rollup tables (V21) | P0 | — | LOW |
| PR-14.2 | Backend: update rollup jobs to group by property_type + backfill | P0 | PR-14.1 | MED |
| PR-14.3 | Insights: property-type segmentation filter (completes PR-13.6) | P0 | PR-14.2 | MED |
| PR-14.4 | Email: Resend integration + alert delivery | P1 | — | LOW |
| PR-14.5 | Price thresholds per area — DB + backend (V22) | P1 | — | MED |
| PR-14.6 | Price thresholds — frontend toggle + input | P1 | PR-14.5 | LOW |
| PR-14.7 | Search: relevance tuning (ts_rank + recency boost) | P2 | — | LOW |
| PR-14.8 | DB + Insights: V23 migration + BHK count segmentation filter | P2 | PR-14.3 | LOW |

---

## PR Details

---

### PR-14.1 — DB: add property_type to rollup tables (V21) (P0)
**Goal:** Expand `area_price_weekly` and `area_stats_latest` to include `property_type` so rollup jobs can produce per-type rows.

**Scope**
- V21 migration: `ALTER TABLE area_price_weekly ADD COLUMN IF NOT EXISTS property_type varchar(32) NOT NULL DEFAULT 'all'`
- Same for `area_stats_latest`
- Update PK/unique constraints if needed (area_key + week_start + property_type for weekly; area_key + property_type for latest)
- Migration idempotent; existing rows get `property_type = 'all'`
- **Note:** `'all'` is a reserved sentinel for aggregate rows only — it is not a real value in `property_listings.property_type`

**Dependencies:** none
**Risk:** LOW — additive column with default

**Acceptance Criteria**
- Migration runs cleanly in Testcontainers
- Existing rows readable with `property_type = 'all'`
- Unique constraint enforces (area_key, week_start, property_type) on weekly table

**Test Plan**
- Flyway migration runs in CI
- Smoke: insert row with explicit property_type; select; confirm
- Confirm existing rows unchanged

**Manual verification**
- Run migration; inspect tables in Supabase dashboard
- Confirm `property_type = 'all'` on pre-existing rows

---

### PR-14.2 — Backend: rollup jobs group by property_type + backfill (P0)
**Goal:** Re-aggregate existing listing data by property type so Insights has real segmented rows.

**Scope**
- Update `AreaPriceWeeklyRollupJob` — GROUP BY `property_type` in addition to `area_key, week_start`; emit one row per type + one row with `'all'`
- Update `AreaStatsLatestRollupJob` — same grouping pattern
- Add one-shot `BackfillRollupRunner` `CommandLineRunner` (Spring profile `backfill`, not `default`) — triggers both jobs once on startup
- Keep existing upsert logic; only the GROUP BY changes

**Dependencies:** PR-14.1
**Risk:** MED — rollup job logic change; affects downstream Insights API

**Acceptance Criteria**
- After backfill: `area_price_weekly` has rows for each `(area_key, property_type)` present in listings
- `property_type = 'all'` row always present for each area
- Scheduled job continues to run correctly after change

**Test Plan**
- Unit tests for updated rollup job SQL grouping
- Integration test (Testcontainers): seed listings of 2 types; run job; assert rows exist per type
- Confirm `'all'` aggregate row exists and covers data for all property types in the area

**Manual verification**
- Run `mvn spring-boot:run -Dspring-boot.run.profiles=backfill` locally
- Query `area_price_weekly` — confirm segmented rows appear

---

### PR-14.3 — Insights: property-type segmentation filter (P0, completes PR-13.6)
**Goal:** Let users filter Insights charts by property type (All / Apartment / House / Land / Plot).

**Scope**
- Backend: add optional `?propertyType=` param to `/api/insights/area-price-trend` and `/api/insights/area-stats`; filter rows when present; omit filter → `property_type = 'all'`
- Frontend: segmented control above charts (All / Apartment / House / Land)
- Pass selected type into insight hooks; refetch on change
- Show empty state when no data for selected type in area

**Dependencies:** PR-14.2
**Risk:** MED — touches Insights API + frontend charts

**Acceptance Criteria**
- Selecting "Apartment" updates chart series or shows empty state
- "All" restores aggregated view
- No crash when area has no data for a selected type

**Test Plan**
- `@WebMvcTest`: propertyType filter applied when param present; absent → `'all'`
- Frontend hook test: hook called with correct propertyType on toggle
- Testcontainers: seed by type; assert filtered results

**Manual verification**
- Toggle all types across 2 areas; confirm chart updates
- Switch area with no "Land" data → empty state shown

---

### PR-14.4 — Email: Resend integration + alert delivery (P1)
**Goal:** Send an email when a new listing appears in a user's saved area (alerts_enabled = true).

**Scope**
- Add `RESEND_API_KEY` env var; fail-fast on missing key at startup
- New `EmailService` using `RestTemplate` → `POST https://api.resend.com/emails`
- Simple HTML template: area name, listing title, price, deep link to `/listing/{id}`
- Wire into `NotificationEventListener.onNewListingInArea` — send email after in-app notification written; failures logged, never rethrown
- From address: `alerts@<configured-domain>`; make domain configurable via env

**Dependencies:** none (parallel to data work)
**Risk:** LOW — fire-and-forget; bounded blast radius

**Acceptance Criteria**
- Alert email delivered to test inbox on listing approval in saved area
- User with `alerts_enabled = false` receives no email
- Email failure does not affect listing approval flow

**Test Plan**
- Unit test `EmailService`: mock RestTemplate; verify POST body + headers
- `NotificationEventListener` test: stub EmailService; verify called once per recipient
- Failure test: EmailService throws → listener swallows; listing still approved

**Manual verification**
- Approve listing in saved area → email in inbox within 30 s
- Disable alerts for area → approve → no email

---

### PR-14.5 — Price thresholds per area — DB + backend (V22) (P1)
**Goal:** Let users set a max price filter per saved area so they only receive alerts for listings below their threshold.

**Scope**
- V22 migration: `ALTER TABLE user_saved_areas ADD COLUMN IF NOT EXISTS price_threshold_rupees bigint` (nullable = no threshold)
- `PATCH /api/saved-areas/:areaKey/threshold` — body `{ "priceThresholdRupees": 5000000 }` (null clears threshold)
- `NotificationEventListener` — skip notification if listing price > threshold (null = no filter)
- Update `SavedAreaResponse` to include `priceThresholdRupees`

**Dependencies:** none
**Risk:** MED — touches notification filtering logic

**Acceptance Criteria**
- PATCH persists threshold; GET reflects it
- Listing above threshold → no notification (in-app + email)
- Null threshold = receive all alerts

**Test Plan**
- Unit test: price above/below/at threshold boundary
- Integration test: set threshold 5 M; approve 6 M listing; assert no notification row
- API test: PATCH → GET round-trip

**Manual verification**
- Set threshold 5 M; approve 4 M listing → notification appears
- Approve 6 M listing → no notification

---

### PR-14.6 — Price thresholds — frontend UI (P1)
**Goal:** Expose price threshold input per saved area in `SavedAreas.tsx`.

**Scope**
- Add price input (rupees) alongside alert toggle in saved area list item
- Debounced PATCH on blur/enter; show save indicator
- Clear button sets threshold to null
- Format input as `₹ X,XX,XXX` (Indian locale)

**Dependencies:** PR-14.5
**Risk:** LOW

**Acceptance Criteria**
- Input persists on refresh
- Empty input clears threshold (PATCH with null)
- Formatting readable (Indian locale)

**Test Plan**
- Component test: input blur → PATCH called with correct value
- Empty input → PATCH with null
- Manual round-trip

**Manual verification**
- Set threshold → refresh → value preserved
- Clear → refresh → input empty

---

### PR-14.7 — Search: relevance tuning (ts_rank + recency boost) (P2)
**Goal:** Order search results by relevance (FTS rank) then recency instead of purely by `created_at`.

**Scope**
- Update `ListingRepository.findBySearch` — add `ts_rank(search_vector, websearch_to_tsquery('english', :q))` to SELECT
- ORDER BY: `ts_rank DESC, created_at DESC`
- Pass rank through to `SearchListingResponse` (optional — not required in UI)
- No UI change required

**Dependencies:** none
**Risk:** LOW — ORDER BY change only; pagination unaffected

**Acceptance Criteria**
- Exact title match appears before partial match
- Two exact matches ordered by recency
- No regression in pagination stability

**Test Plan**
- Repository test: seed 3 listings with varying relevance; assert order
- Confirm no N+1 (EXPLAIN output in test log)

**Manual verification**
- Search known title → exact match first
- Search partial word → best matches first

---

### PR-14.8 — DB + Insights: V23 migration + BHK count segmentation filter (P2)
**Goal:** Allow segmenting Insights charts by bedroom count (All / 1BHK / 2BHK / 3BHK / 4BHK+).

**Scope**
- V23 migration: add `bedrooms integer NOT NULL DEFAULT 0` to `area_price_weekly` and `area_stats_latest`; update unique constraints to include `bedrooms`; `0` is the sentinel for the `'all'` aggregate row
- Update `AreaPriceWeeklyRollupJob` and `AreaStatsLatestRollupJob` to GROUP BY `bedrooms`; emit one row per bedroom count + one aggregate row with `bedrooms = 0`
- Backend: add optional `?bedrooms=` param to Insights endpoints; absent → `bedrooms = 0`
- Frontend: BHK pill selector below property-type selector; pass into hooks

**Dependencies:** PR-14.3 (same rollup + selector pattern)
**Risk:** LOW — same pattern as property_type segmentation

**Acceptance Criteria**
- Selecting 2BHK updates chart or shows empty state
- "All" restores aggregate view
- No crash when no BHK data for area

**Test Plan**
- Same pattern as PR-14.3 tests, substituting `bedrooms`
- Testcontainers: seed listings with different bedrooms; assert filtered results

**Manual verification**
- Toggle BHK values across 2 areas
- Area with no 4BHK listings → empty state

---

## Manual Test Checkpoints

### CP0 — After PR-14.3 (Insights segmentation complete)
- [ ] `area_price_weekly` has rows per property_type after backfill
- [ ] Insights chart updates when property-type toggled
- [ ] "All" shows aggregate (not zero)
- [ ] Empty state shown for type with no data in area
- [ ] Existing Insights views unaffected (no regression)
- [ ] Rollup cron job still produces correct `'all'` rows after schema change
- [ ] No 500s in backend logs during chart load

### CP1 — After PR-14.4 + PR-14.6 (alert email + price threshold)
- [ ] Approve listing in saved area → email delivered within 30 s
- [ ] `alerts_enabled = false` → no email
- [ ] Price above threshold → no in-app notification, no email
- [ ] Price below threshold → notification + email
- [ ] Null threshold → all alerts pass through
- [ ] Email failure → listing approval unaffected
- [ ] Price threshold persists after browser refresh

### CP2 — Release candidate smoke
- [ ] Insights: property-type toggle works across all types
- [ ] Insights: BHK toggle works (if PR-14.8 included)
- [ ] Search: relevant matches ranked above partial matches
- [ ] Alert email delivered end-to-end
- [ ] Price threshold filtering correct at boundary
- [ ] `alerts_enabled` toggle still works (no regression from PR-13.7)
- [ ] Admin audit log shows all sprint actions
- [ ] All backend tests green in CI
- [ ] No console errors on map, insights, saved-areas pages

---

## Out of Scope
- Email unsubscribe link / preference centre (Sprint 15)
- Multi-channel alerts (WhatsApp, SMS)
- Audit log undo / locality rename rollback (deferred indefinitely)
- Search ranking ML / semantic embeddings
- BHK segmentation in `area_stats_latest` median table (follow-on to PR-14.8)

---

## Changes applied
- Kept `user_saved_areas` — confirmed correct table name from Sprint 13 implementation
- Changed threshold endpoint to `PATCH /api/saved-areas/:areaKey/threshold` in PR-14.5
- Added V23 migration explicitly to PR-14.8 title, PR list table, and scope (with `bedrooms = 0` sentinel documented)
- Added note in PR-14.1 that `'all'` is a reserved sentinel for aggregate rows only, not a real `property_listings.property_type` value
- Fixed PR-14.2 test plan: replaced incorrect "sum" assertion with aggregate-existence check
- Changed `plainto_tsquery` to `websearch_to_tsquery` in PR-14.7 scope
- Removed open-ended "SES migration (only if Resend volume exceeded)" from Out of Scope
