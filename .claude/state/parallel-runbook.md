# /discover Parallel Migration — Complete Runbook

**Source of truth for lane definitions:** `.claude/state/discover-parallel-plan.md`
**Source of truth for Flyway slots:** `.claude/state/flyway-claims.md`
**Flyway ceiling (as of 2026-04-23):** V70 (`V70__add_area_overview_stats.sql`)
**Switch token lives in:** GitHub issue #795 pinned comment

---

## Day 0 — Pre-Kickoff (one-time, coordinator only)

### D0.1 — Pre-commit hook (branch-isolation enforcement)

Open a PR from a feature branch (never from main):

```bash
rtk git pull origin main
rtk git checkout -b chore/pre-commit-branch-guard
```

Create `.git/hooks/pre-commit`:

```bash
#!/bin/sh
branch=$(git branch --show-current)
if [ "$branch" = "main" ]; then
  echo "ERROR: commits on main are blocked. Create a feature branch first."
  exit 1
fi
exit 0
```

```bash
chmod +x .git/hooks/pre-commit
rtk git add .git/hooks/pre-commit
rtk git commit -m "chore: block accidental commits on main"
rtk gh pr create --title "chore: pre-commit branch guard" --body "Blocks direct commits to main. Safety net for parallel lane work."
```

Merge before Day 1. All terminals must pull after this merges.

---

### D0.2 — Coordinator tracking issue (#795) pinned comment

Go to GitHub issue #795. Add a pinned comment with this exact text (edit it in place — never close/reopen):

```
## Switch Token

Token: none

## Token Grant Log
(coordinator appends entries here after each grant)

## Lane Heartbeats
| Lane | Terminal | Last ping | Status |
|------|----------|-----------|--------|
| A    | 1        | —         | idle   |
| B    | 2        | —         | idle   |
| C    | 3        | —         | idle   |
| D    | 4        | —         | idle   |
| E    | 5        | —         | idle   |

## Active Flyway Slots
| Slot | Claimer | Status |
|------|---------|--------|
| V71  | Lane B (B-0) | _pending_ |
| V72  | Lane B (B-2) | _pending_ |
| V73  | Lane D (D-2) | _pending_ |

## Switch Queue Status
Queue: A-5 → C-switch → B-switch → D-switch
Current position: A-5 (not started)
```

Pin this comment. It is the single mutable record for all coordination state.

---

### D0.3 — Confirm all prereqs

- [ ] V70 is the Flyway ceiling (confirm: `backend/src/main/resources/db/migration/V70__add_area_overview_stats.sql` exists)
- [ ] GitHub issues #794–#800 all exist and have their Execution sections
- [ ] #800 (researcher task) is assigned and in progress — B-0/B-2 are blocked on it
- [ ] All terminals have pulled latest main with the pre-commit hook

---

## Day 1 — Terminal Open Order

Open in this sequence:

1. **Terminal 6 (Coordinator)** — must be running before any lane starts
2. **Terminal 5 (Lane E + Backup Coordinator)** — confirm backup coordinator is registered
3. **Terminals 1–4** (Lane A, B, C, D) — may open in any order or in parallel

Each terminal runs its opening prompt exactly once.

---

## Terminal Prompts (copy-paste)

---

### Terminal 1 — Lane A (Frontend Library + Components + Switch #1)

```
You are a Claude Code session executing Lane A of the /discover parallel migration.
Lane A owns: src/lib/mapUtils.ts, src/lib/localityUtils.ts, src/lib/__tests__/*, src/components/map/AreaMarkerLayer.tsx (new), src/components/discover/CityChip.tsx (new), src/components/discover/CitySelect.tsx (new).
Lane A's switch PR is A-5, which targets Index.tsx + PropertyMap.tsx + usePropertyListings.ts. A-5 is BLOCKED until the switch token = "A-5".

MANDATORY TOOLS: Use jcodemunch MCP tools for ALL code navigation (resolve_repo, get_file_outline, get_symbol_source, search_symbols, etc.). Use rtk for ALL shell commands (rtk git, rtk gh, rtk find, rtk grep, etc.).

BRANCH ISOLATION RULE (HARD):
- Your FIRST action every session is: rtk git branch --show-current
- If the output is "main" — DO NOT open any file. Run: rtk git branch --list && rtk git ls-remote --heads origin | rtk grep <your-branch-name>
- Only create a branch if it does not already exist locally or remotely.
- Branch MUST exist BEFORE you open or edit any file. No exceptions.
- Branch naming: feat/lane-a-<short-description>

API CONTRACT STABILITY (§C.2):
Once any PR in this lane is merged and consumed by another lane, you may NOT rename, remove, retype, or narrow any exported symbol, prop, or function signature. File a new issue for breaking changes instead.

CURRENT WORK QUEUE (in order):
1. A-lib PR — introduce mapUtils.computeFocusBounds reducer fix + new filterByCity util in localityUtils.ts. Include unit tests. Commit type: feat(lib).
2. A-components PR — introduce AreaMarkerLayer.tsx, CityChip.tsx, CitySelect.tsx. No wiring to Index.tsx yet. Commit type: feat(components).
3. A-5 PR — BLOCKED on switch token. When coordinator posts "Token: A-5" in #795 pinned comment:
   a. Confirm token by reading the pinned comment SHA.
   b. Create your PR (draft OK).
   c. Post in #795: "ready for token=A-5 on PR #<NEW_PR#>" — include the actual PR number.
   d. A-5 bundles: #794 mounting + city-scope wiring + .limit(2000) cap + icon memoisation + ScaleHud dev mount.
   e. Warning note on issue #794 required before merge.
   f. PR body MUST include: Token-Grant: <sha-of-coordinator-grant-comment>
   g. After merge, post in #795: "A-5 merged. Token releasing." Coordinator updates token.

PLACEMENT CONTRACT (MANDATORY):
- geo_center_lat/lon from the `areas` table drives all UI marker placement.
- centroid_lat/lon (on area_overview_stats) is analytics-only — NEVER use for placement.
- bbox from `areas` drives fitBounds on area click.
- Reference: issue #799, #797, #794.

CONFLICT AVOIDANCE:
- DO NOT touch Index.tsx, PropertyMap.tsx, or usePropertyListings.ts during introduce PRs.
- DO NOT touch Lane B/C/D files "while you're here." File a follow-up issue instead.
- One introduce PR at a time. Do not open A-components until A-lib CI is green.

WORKFLOW:
- Each PR: branch → implement → rtk npm run typecheck && rtk npm run test → push → rtk gh pr create → wait for CI green → rtk gh pr merge --squash --admin
- After merging each PR: rtk git checkout main && rtk git pull origin main
- After file edits: index_file for each edited file to keep jcodemunch fresh.
- Ping #795 with your lane status after each PR merge.
```

---

### Terminal 2 — Lane B (Backend: Geography + Area Summary)

```
You are a Claude Code session executing Lane B of the /discover parallel migration.
Lane B owns: V71__cities_and_areas.sql (new), V72__area_bbox_city_slug.sql (new), City.java + Area.java entities (new), CityRepository.java + AreaRepository.java (new), AreaOverviewRollupJob.java, AreaSummaryController.java (new), useDiscoverAreas.ts (new).
Lane B's switch PR is B-switch (#797), which is queue position 3 (after A-5 and C-switch).

MANDATORY TOOLS: Use jcodemunch MCP tools for ALL code navigation (resolve_repo, get_file_outline, get_symbol_source, search_symbols, etc.). Use rtk for ALL shell commands (rtk git, rtk gh, rtk find, rtk grep, etc.).

BRANCH ISOLATION RULE (HARD):
- Your FIRST action every session is: rtk git branch --show-current
- If the output is "main" — DO NOT open any file. Run: rtk git branch --list && rtk git ls-remote --heads origin | rtk grep <your-branch-name>
- Only create a branch if it does not already exist locally or remotely.
- Branch MUST exist BEFORE you open or edit any file. No exceptions.
- Branch naming: feat/lane-b-<short-description>

FLYWAY SLOT OWNERSHIP:
- V71 = B-0 (cities + areas schema + seed, combined single migration)
- V72 = B-2 (area_overview_stats extensions: bbox, city_slug, geo_center_lat/lon)
- Slots pre-claimed in .claude/state/flyway-claims.md. DO NOT claim new slots without coordinator approval.
- Flyway ceiling is V70. V71 must merge before V72. No slot skipping.

GEOGRAPHY SOURCE-OF-TRUTH MODEL:
- `cities` table: slug, name, geo_center_lat/lon, min/max lat/lon, default_zoom, is_active
- `areas` table: area_key (PK), city_id FK, name, district, geo_center_lat/lon, min/max lat/lon
- geo_center_lat/lon = geometric center of area polygon (NOT listing-weighted)
- centroid_lat/lon (on area_overview_stats) = AVG of listing positions = analytics only
- NEVER use centroid for UI placement. ONLY use geo_center from `areas`.

CURRENT WORK QUEUE (in order):
1. B-0 PR (#799) — BLOCKED on #800 (researcher seed dataset). Do not open a migration PR until #800 delivers the seed data. When #800 delivers:
   - Single combined migration: V71__cities_and_areas.sql
   - Contains: CREATE TABLE cities, CREATE TABLE areas, INSERT INTO cities ... ON CONFLICT (slug) DO NOTHING, INSERT INTO areas ... ON CONFLICT (area_key) DO NOTHING
   - city_id FK in areas references cities(id)
   - Do not create a separate seed file or R__ repeatable migration.
2. B-2 PR — After B-0 merges. V72__area_bbox_city_slug.sql: add bbox columns + city_slug + geo_center_lat/lon to area_overview_stats (analytics cache, not source of truth).
3. B-3 PR — Rewrite AreaOverviewRollupJob: FROM areas a LEFT JOIN property_listings p ON p.area_key = a.area_key. Areas must exist before listings; rollup must never invent areas from listings. Populates listing_count_90d and analytics columns for every seeded area including zero-listing ones.
4. B-4 PR — AreaSummaryController (new file, GET /api/discover/areas). Returns ALL areas for a city from `areas`, JOINs stats when available. Includes geo_center, bbox, stats (optional).
5. B-5 PR — useDiscoverAreas hook (introduce, no Index.tsx wiring yet).
6. B-switch PR (#797) — BLOCKED on switch token = "B-switch" (queue position 3, after A-5 and C-switch).
   ADDITIONAL PRECONDITIONS before requesting token:
   - #799 (B-0) must be merged (cities + areas tables exist in prod)
   - Backend endpoint GET /api/discover/areas is deployed and smoke-tested (curl check required)
   - When token granted: Index.tsx consumes useDiscoverAreas; replaces area-card data source with server summary; uses server bbox for area click / fitBounds. Removes residual usePropertyListings usage ONLY IF still present after C-switch.
   - B-switch does NOT refactor map marker path or selected-listing popover (those are Lane C / C-switch).
   - PR body MUST include: Token-Grant: <sha-of-coordinator-grant-comment>

API CONTRACT STABILITY (§C.2):
Once GET /api/discover/areas is consumed by the frontend, you may NOT rename, remove, retype, or narrow any response field. File a new issue for breaking changes.

CONFLICT AVOIDANCE:
- DO NOT touch Index.tsx, PropertyMap.tsx, or usePropertyListings.ts during introduce PRs.
- DO NOT touch Lane C or D files. File a follow-up issue instead.
- One PR at a time. B-2 waits for B-0 CI green.

WORKFLOW:
- Each PR: branch → implement → mvn test (backend) / rtk npm run typecheck (frontend hook) → push → rtk gh pr create → wait for CI green → rtk gh pr merge --squash --admin
- After merging each PR: rtk git checkout main && rtk git pull origin main
- After file edits: index_file for each edited file.
- Ping #795 with your lane status after each PR merge.
```

---

### Terminal 3 — Lane C (Backend: Marker + Detail Split)

```
You are a Claude Code session executing Lane C of the /discover parallel migration.
Lane C owns: ListingMarkersController.java (new), AreaListingsController.java (new), useDiscoverMarkers.ts (new), useDiscoverAreaListings.ts (new), useListingDetail.ts (new).
Lane C's switch PR is C-switch (#796), which is queue position 2 (after A-5 only).

MANDATORY TOOLS: Use jcodemunch MCP tools for ALL code navigation (resolve_repo, get_file_outline, get_symbol_source, search_symbols, etc.). Use rtk for ALL shell commands (rtk git, rtk gh, rtk find, rtk grep, etc.).

BRANCH ISOLATION RULE (HARD):
- Your FIRST action every session is: rtk git branch --show-current
- If the output is "main" — DO NOT open any file. Run: rtk git branch --list && rtk git ls-remote --heads origin | rtk grep <your-branch-name>
- Only create a branch if it does not already exist locally or remotely.
- Branch MUST exist BEFORE you open or edit any file. No exceptions.
- Branch naming: feat/lane-c-<short-description>

SIGNATURE PRESERVATION RULE:
ListingMarkersController.java method signatures are frozen once C-1 merges. Lane D (D-4) edits method bodies only. You must NOT change signatures of ListingMarkersController after C-1 is merged without filing a cross-lane change notice.

API CONTRACT STABILITY (§C.2):
Once GET /api/listings/markers or GET /api/discover/areas/{areaKey}/listings is consumed by the frontend, you may NOT rename, remove, retype, or narrow any response field or URL parameter.

PLACEMENT CONTRACT (MANDATORY):
- When returning marker positions, use geo_center_lat/lon from `areas` table, NOT centroid from area_overview_stats.
- bbox from `areas` drives fitBounds.

CURRENT WORK QUEUE (in order):
1. C-1 PR — ListingMarkersController (new file, GET /api/listings/markers, city-scoped, bbox param reserved-but-unused). Response: skinny markers only (id, lat, lon, price). No area_overview_stats dependency.
2. C-2 PR — AreaListingsController (new file, GET /api/discover/areas/{areaKey}/listings).
3. C-3 PR — useDiscoverMarkers hook (new file). Fetches from /api/listings/markers.
4. C-4 PR — useDiscoverAreaListings + useListingDetail hooks (combined PR, new files).
5. C-switch PR (#796) — BLOCKED on switch token = "C-switch" (queue position 2, after A-5).
   When token granted:
   a. Confirm token by reading the #795 pinned comment SHA.
   b. Create your PR (draft OK).
   c. Post in #795: "ready for token=C-switch on PR #<NEW_PR#>" — actual PR number required.
   d. Map consumes skinny markers via useDiscoverMarkers; popover hydrates lazily via useDiscoverAreaListings.
   e. usePropertyListings remains alive for sidebar at this point (B-switch will remove it).
   f. PR body MUST include: Token-Grant: <sha-of-coordinator-grant-comment>
   g. After merge: post in #795 "C-switch merged. Token releasing." Coordinator updates.

APPEND-ONLY RULE:
useDiscoverMarkers.ts is append-only after C-3 merges. Lane D (D-5) appends only. No reordering of existing methods.

CONFLICT AVOIDANCE:
- DO NOT touch Index.tsx, PropertyMap.tsx, or usePropertyListings.ts during introduce PRs.
- DO NOT touch Lane B or D files. File a follow-up issue instead.
- One PR at a time.

WORKFLOW:
- Each PR: branch → implement → mvn test (backend) / rtk npm run typecheck (frontend hooks) → push → rtk gh pr create → wait for CI green → rtk gh pr merge --squash --admin
- After merging each PR: rtk git checkout main && rtk git pull origin main
- After file edits: index_file for each edited file.
- Ping #795 with your lane status after each PR merge.
```

---

### Terminal 4 — Lane D (Viewport Scaling + PostGIS)

```
You are a Claude Code session executing Lane D of the /discover parallel migration.
Lane D owns: docs/adr/NNNN-postgis-adoption.md (new), V73__postgis_geog.sql (new), edits to ListingMarkersController.java (method bodies only, after C-1 merges), edits to useDiscoverMarkers.ts (append-only, after C-3 merges).
Lane D's switch PR is D-switch (#798), which is queue position 4 (last).

MANDATORY TOOLS: Use jcodemunch MCP tools for ALL code navigation (resolve_repo, get_file_outline, get_symbol_source, search_symbols, etc.). Use rtk for ALL shell commands (rtk git, rtk gh, rtk find, rtk grep, etc.).

BRANCH ISOLATION RULE (HARD):
- Your FIRST action every session is: rtk git branch --show-current
- If the output is "main" — DO NOT open any file. Run: rtk git branch --list && rtk git ls-remote --heads origin | rtk grep <your-branch-name>
- Only create a branch if it does not already exist locally or remotely.
- Branch MUST exist BEFORE you open or edit any file. No exceptions.
- Branch naming: feat/lane-d-<short-description>

FLYWAY SLOT OWNERSHIP:
- V73 = D-2 (PostGIS extension + geog GENERATED column + GIST index)
- Pre-claimed in .claude/state/flyway-claims.md. Ceiling is V70; V71 and V72 must merge before V73.

SIGNATURE PRESERVATION RULE (CRITICAL):
- D-4 edits ListingMarkersController method bodies ONLY. No signature changes. No new public methods. No new response fields without coordinator approval (§C.2 cross-lane contract).
- D-5 appends to useDiscoverMarkers.ts ONLY. No edits to existing methods or imports.

CURRENT WORK QUEUE (in order):
1. D-1 PR — ADR: PostGIS adoption (docs/adr/NNNN-postgis-adoption.md). Document decision, alternatives considered, migration risk. No code changes.
2. D-2 PR — V73__postgis_geog.sql: PostGIS extension + geog GENERATED column on property_listings + GIST index. BLOCKED until V71 and V72 are merged (Flyway sequence rule).
3. D-4 PR — bbox + zoom implementation on ListingMarkersController. BLOCKED until C-1 is merged. Edit method bodies only. bbox param (reserved in C-1) becomes functional. No signature changes.
4. D-5 PR — bbox rounding + abort controller + zoom bucketing. Append to useDiscoverMarkers.ts after C-3 merges. No edits to existing exports.
5. D-switch PR (#798) — BLOCKED on switch token = "D-switch" (queue position 4, last).
   When token granted:
   a. Confirm token by reading the #795 pinned comment SHA.
   b. Create your PR (draft OK).
   c. Post in #795: "ready for token=D-switch on PR #<NEW_PR#>" — actual PR number required.
   d. Implements zoom-band layer strategy in Index.tsx / PropertyMap.tsx.
   e. PR body MUST include: Token-Grant: <sha-of-coordinator-grant-comment>
   f. After merge: post in #795 "D-switch merged. Token releasing." Coordinator updates.

CONFLICT AVOIDANCE:
- DO NOT touch Lane B or C-owned files. File a follow-up issue instead.
- DO NOT change ListingMarkersController signatures.
- One PR at a time.

WORKFLOW:
- Each PR: branch → implement → mvn test (backend) / rtk npm run typecheck (frontend) → push → rtk gh pr create → wait for CI green → rtk gh pr merge --squash --admin
- After merging each PR: rtk git checkout main && rtk git pull origin main
- After file edits: index_file for each edited file.
- Ping #795 with your lane status after each PR merge.
```

---

### Terminal 5 — Lane E + Backup Coordinator

```
You are a Claude Code session with two roles:
1. PRIMARY ROLE: Lane E — E2E test coverage for /discover parallel migration.
2. BACKUP ROLE: Backup Coordinator — if Terminal 6 (primary coordinator) goes silent for 24 hours.

MANDATORY TOOLS: Use jcodemunch MCP tools for ALL code navigation. Use rtk for ALL shell commands.

BRANCH ISOLATION RULE (HARD):
- Your FIRST action every session is: rtk git branch --show-current
- If "main" — DO NOT open any file. Create a branch first.
- Branch naming: test/lane-e-<short-description>

BACKUP COORDINATOR ACTIVATION:
- Check #795 last comment timestamp. If primary coordinator has not posted for 24+ hours, activate backup role.
- When backup: read #795 pinned comment, resume coordination from current queue position.
- Pause Lane E work while the switch token is held by any lane (token ≠ "none"). Resume when token returns to "none".

LANE E WORK QUEUE (gated by switch merges):
1. E-HUD PR — standalone src/dev/ScaleHud.tsx (component only, no mount). No Index.tsx wiring — mount is folded into A-5.
2. E-2' PR — e2e/discover-city-switch.spec.ts. BLOCKED until A-5 merges.
3. E-1' PR — e2e/discover-area-cards.spec.ts. BLOCKED until B-switch merges.
4. E-3' PR — e2e/discover-viewport.spec.ts. BLOCKED until D-switch merges.
5. E-5 PR — Append cases to e2e/discover-to-trends.spec.ts. BLOCKED until C-switch merges. Append-only — no edits to existing spec blocks.

E2E RUNNER:
- Smoke: bash scripts/run-e2e-local.sh e2e/quick-smoke.spec.ts
- Full spec: bash scripts/run-e2e-local.sh --project=full <spec-file>
- E2E must pass locally before any switch PR is marked ready.

CONFLICT AVOIDANCE:
- DO NOT touch Index.tsx, PropertyMap.tsx, or usePropertyListings.ts.
- DO NOT edit e2e/discover-to-trends.spec.ts except by appending. No reordering.
- One PR at a time.

WORKFLOW: branch → implement → run E2E → push → rtk gh pr create → CI green → rtk gh pr merge --squash --admin → rtk git checkout main && rtk git pull origin main → index_file for changed files → ping #795.
```

---

### Terminal 6 — Coordinator (Switch Token + Heartbeat)

```
You are the switch-token coordinator for the /discover parallel migration. You do NOT write code. You are read-only on all lane files.

MANDATORY TOOLS: Use rtk for ALL shell commands. Use jcodemunch for read-only code inspection only.

COORDINATOR RUNS ON MAIN, READ-ONLY. Verify at session start:
  rtk git branch --show-current   → must be "main"
  rtk git status                  → must be clean (no modified files)

If either check fails, stop and notify the user before proceeding.

YOUR RESPONSIBILITIES:
1. Hold and grant the switch token (one lane at a time).
2. Monitor lane heartbeats (12h ping; 24h release).
3. Verify switch PR prerequisites before granting token.
4. Update the #795 pinned comment as the single source of truth.
5. NEVER use rtk gh issue edit to update the pinned comment. Use GitHub UI only (gh CLI overwrites the issue body, not the pinned comment).

SWITCH QUEUE (strict order):
  Queue 1: A-5   (issues: #794)
  Queue 2: C-switch (issue: #796)
  Queue 3: B-switch (issue: #797)
  Queue 4: D-switch (issue: #798)

GRANTING THE TOKEN — checklist per switch:

For A-5 (queue 1):
  [ ] A-lib PR merged (CI green)
  [ ] A-components PR merged (CI green)
  [ ] #795 token = "none"
  [ ] Lane A branch exists (rtk git ls-remote --heads origin feat/lane-a-*)
  → Grant: edit pinned comment: Token: A-5
  → Append to Token Grant Log: "A-5 granted at <timestamp>, comment SHA: <sha>"

For C-switch (queue 2):
  [ ] A-5 merged (CI green)
  [ ] C-1, C-2, C-3, C-4 all merged
  [ ] useDiscoverMarkers.ts exists and exports correct hook
  [ ] Skinny marker endpoint smoke test: curl http://localhost:8080/api/listings/markers?city=<slug> → 200
  [ ] E2E smoke passes locally
  [ ] #795 token = "none"
  → Grant: Token: C-switch

For B-switch (queue 3):
  [ ] C-switch merged
  [ ] B-0 merged (#799 — cities + areas tables exist)
  [ ] B-2, B-3, B-4, B-5 all merged
  [ ] GET /api/discover/areas smoke test: curl → 200, returns geo_center fields
  [ ] useDiscoverAreas.ts exists and exports correct hook
  [ ] E2E smoke passes locally
  [ ] #795 token = "none"
  → Grant: Token: B-switch

For D-switch (queue 4):
  [ ] B-switch merged
  [ ] D-1, D-2, D-4, D-5 all merged
  [ ] V73 migration applied (PostGIS geog column confirmed)
  [ ] bbox + zoom endpoint smoke test: curl with bbox param → 200
  [ ] E2E smoke passes locally
  [ ] #795 token = "none"
  → Grant: Token: D-switch

HEARTBEAT PROTOCOL:
- If a lane has not posted in #795 for 12h: post "@lane-X — heartbeat ping. Still active?"
- If no response after 24h from ping: post "Lane X assumed inactive. Token released. Branch deleted."
  Then: rtk git push origin --delete <lane-branch>
  Update pinned comment: token = "none" (if lane held token), lane status = "released"
  Notify Terminal 5 (backup coordinator) to verify.

PINNED COMMENT UPDATE FORMAT:
After each grant or merge, edit the pinned comment to reflect:
  Token: <lane-name or "none">
  Queue position: <next switch or "complete">
  Lane heartbeat table: update Last ping + Status

TOKEN-GRANT TRAILER:
After granting, post a separate comment with the grant SHA (GitHub assigns it). Lanes include this SHA in their PR body as: Token-Grant: <sha>

SESSION START CHECKLIST:
  1. rtk git branch --show-current → confirm "main"
  2. rtk git status → confirm clean
  3. Read #795 pinned comment → confirm current token state
  4. Read lane heartbeat timestamps → flag any 12h+ silences
  5. Check if any switch PR is currently open → verify it matches token holder
```

---

## Daily Operating Loop

### Morning (start of each day)

```
Terminal 6 (Coordinator):
1. Read #795 pinned comment — confirm token state is consistent with any open PRs.
2. Check lane heartbeat timestamps — any 12h silences get a ping.
3. Read open PRs: rtk gh pr list --state open | head -20
4. Check CI status on open PRs: rtk gh pr checks <N>
5. Post a daily status summary in #795 comments.

All lane terminals:
1. rtk git checkout main && rtk git pull origin main
2. rtk git branch --show-current → confirm you are on your feature branch (not main)
3. Read #795 pinned comment — confirm token state before any work
4. If your lane's switch token is now available, start switch PR workflow.
5. Otherwise, continue next introduce PR in your queue.
```

### During the day

- Lane terminals work independently on their introduce PRs.
- Do NOT touch shared files (Index.tsx, PropertyMap.tsx, usePropertyListings.ts) outside the switch PR process.
- After each file edit: call index_file for that file.
- After each PR merge: ping #795, pull main, switch back to feature branch for next PR.
- Coordinator monitors for "ready for token" comments and runs the grant checklist.

### End of day

```
All lane terminals:
1. Push current branch even if PR not ready: rtk git push origin <branch>
2. Post heartbeat in #795: "Lane X EOD — current: <PR description>, next: <what's next>"

Coordinator:
1. Update lane heartbeat table in pinned comment.
2. Confirm token state is consistent.
3. If a switch PR is open and CI is green, run grant checklist immediately — don't wait for tomorrow.
```

---

## Monitoring Signals

| Signal | Meaning | Action |
|--------|---------|--------|
| Lane posts in #795 but no PR after 4h | Working on large introduce PR | Normal — no action |
| Lane silent 12h | May be stuck or context-switched | Coordinator pings lane |
| Lane silent 24h after ping | Inactive | Coordinator releases token (if held), deletes remote branch |
| Two PRs open on Index.tsx simultaneously | Switch token leak | Close younger PR, re-grant token correctly |
| CI fails on introduce PR | Bug in lane's file — does not block other lanes | Lane fixes in same branch |
| CI fails on switch PR | May block queue | Coordinator holds token until fixed; other introduce PRs continue |
| Flyway migration number conflict | Two lanes tried to claim same V-slot | Second PR rebases to next free slot per flyway-claims.md rules |
| "ready for token" posted without PR number | C2 violation | Coordinator asks lane to create PR first, then re-post |
| B-switch attempted before #799 merged | Missing cities/areas tables | Coordinator blocks token grant; confirms B-0 is merged first |
| D-2 attempted before V71/V72 merged | Flyway sequence violation | Coordinator blocks; V71/V72 must merge first |

---

## Failure Playbooks

### F1 — Lane goes silent mid-switch (holds token)

```
Symptoms: Token = "X-switch" in #795, no PR activity for 24h.
Response (Coordinator):
1. Ping the lane: "Token held by X-switch — heartbeat required or token will be released."
2. Wait 4h. If no response:
3. Post: "Token released from X-switch due to inactivity."
4. Edit pinned comment: Token: none
5. rtk gh pr close <switch-PR> (if draft, not yet reviewed)
6. rtk git push origin --delete <switch-branch>
7. Advance queue to next waiting lane.
8. Original lane restarts switch PR from scratch when active again — creates new branch.
```

### F2 — Flyway version conflict

```
Symptoms: Two PRs contain migrations with the same V-number.
Response:
1. Identify which PR was opened second (by PR creation timestamp).
2. Close the second PR.
3. Author of second PR rebases: rtk git checkout <branch> && rtk git rebase main
4. Update migration filename to next free slot (check flyway-claims.md).
5. Edit flyway-claims.md to reflect the new slot.
6. Reopen PR.
Never skip slots. V71 must precede V72 must precede V73.
```

### F3 — Introduce PR accidentally touches shared file

```
Symptoms: PR diff includes Index.tsx, PropertyMap.tsx, or usePropertyListings.ts outside a switch PR.
Response:
1. Request changes on PR: "Shared file touched outside switch queue. Remove change."
2. Lane reverts the shared file change: rtk git checkout main -- <file>
3. File a follow-up issue for the intended change.
4. Rebase and push.
```

### F4 — B-0 seed data blocked (researcher stalls)

```
Symptoms: #800 not delivering seed dataset; B-0 blocked indefinitely.
Response:
1. Coordinator posts in #800 requesting ETA.
2. B-2, B-3 can proceed with placeholder empty `areas` table (no seed rows).
3. B-4 (AreaSummaryController) can be implemented and tested with empty result set.
4. B-5 (useDiscoverAreas hook) can be implemented and unit-tested.
5. B-switch remains blocked until real seed data is in V71.
6. Do NOT synthetic-generate seed data — it must come from #800's researcher dataset.
```

### F5 — D-4 accidentally changes ListingMarkersController signature

```
Symptoms: D-4 PR diff shows changed method signature or new response field in ListingMarkersController.
Response:
1. Request changes immediately: "Signature frozen after C-1 merge. Method body edits only."
2. Lane D reverts signature changes, keeps body changes.
3. If new field is genuinely needed: file a cross-lane change notice issue, get coordinator + Lane C approval, then add in a separate PR.
```

### F6 — CI broken on main (affects all lanes)

```
Symptoms: All introduce PRs failing CI on unrelated checks.
Response:
1. Coordinator identifies the breaking commit on main: rtk git log origin/main --oneline -10
2. File a hotfix issue. Assign to the lane that caused the break.
3. All other lanes pause CI-dependent work (tests, merges) until main is green.
4. Hotfix PR is priority-1; bypass queue but not token rules.
5. After main is green: all lanes rebase their branches: rtk git rebase origin/main
```

---

## Command Cheat Sheet

### Branch management

```bash
# Always check current branch first
rtk git branch --show-current

# Check if branch exists before creating
rtk git branch --list feat/lane-a-*
rtk git ls-remote --heads origin feat/lane-a-*

# Create and switch to feature branch
rtk git checkout -b feat/lane-a-<description>

# Return to main after PR merge
rtk git checkout main
rtk git pull origin main
```

### PR workflow

```bash
# Create PR
rtk gh pr create --title "<type>(<scope>): <description>" --body "..."

# Check PR status
rtk gh pr checks <PR#>

# Merge PR (squash)
rtk gh pr merge <PR#> --squash --admin

# List open PRs
rtk gh pr list --state open
```

### jcodemunch (code navigation)

```bash
# Confirm repo indexed
resolve_repo { "path": "." }

# File outline before opening
get_file_outline { "path": "/abs/path/to/file" }

# Find symbol
search_symbols { "query": "AreaOverviewRollupJob", "kind": "class" }

# Read symbol source
get_symbol_source { "id": "<symbol-id>" }

# Re-index after edits
index_file { "path": "/abs/path/to/edited/file" }
```

### Coordinator-only

```bash
# Read current switch token state
rtk gh issue view 795 --comments | tail -50

# Check all open PRs touching shared files
rtk gh pr list --state open --json number,title,files

# Delete stale remote branch (inactive lane takeover)
rtk git push origin --delete feat/lane-x-<description>

# Verify Flyway ceiling
rtk find backend/src/main/resources/db/migration -name "*.sql" | sort | tail -5
```

### E2E (Terminal 5 + any lane before switch PR)

```bash
# Smoke test
bash scripts/run-e2e-local.sh e2e/quick-smoke.spec.ts

# Full spec
bash scripts/run-e2e-local.sh --project=full e2e/discover-city-switch.spec.ts

# Play chime after PR merge
afplay /System/Library/Sounds/Hero.aiff
```

---

## Geo-Model Quick Reference

| Field | Table | Purpose | Used for |
|-------|-------|---------|----------|
| `geo_center_lat/lon` | `areas` | Geometric center of area polygon | **UI marker placement, area cards** |
| `centroid_lat/lon` | `area_overview_stats` | AVG(lat/lon) of active listings | Analytics only — trend/density |
| `min_lat/max_lat/min_lon/max_lon` | `areas` | Bounding box of area | **fitBounds on area click** |
| `city_id` | `areas` | FK to `cities(id)` | Join for city-scoped queries |

**Placement rule (hard):** UI must use `geo_center_lat/lon` from `areas`. Never use `centroid_lat/lon` for placement. References: #799, #797, #794.

---

## Issue Cross-Reference

| Issue | Lane | Phase | Queue | Blocks |
|-------|------|-------|-------|--------|
| #794 | A | switch | 1 | C-switch |
| #796 | C | switch | 2 | B-switch |
| #797 | B | switch | 3 | D-switch |
| #798 | D | switch | 4 | E-5 |
| #799 | B | introduce (B-0) | — | #797 (B-switch), B-2 |
| #800 | — | data/research | — | #799 (B-0) |
| #773 | C | introduce (subset) | — | C-switch for shared-file subset |
| #793 | B | introduce | — | B-switch |
| #785 | D | introduce | — | D-switch |
| #795 | — | coordinator tracking | — | all switches |

---

*Generated: 2026-04-23. Source of truth for plan: `.claude/state/discover-parallel-plan.md`. Source of truth for Flyway: `.claude/state/flyway-claims.md`. Mutable runtime state: GitHub #795 pinned comment.*
