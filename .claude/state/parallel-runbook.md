# /discover Parallel Migration — Complete Runbook

**Source of truth for lane definitions:** `.claude/state/discover-parallel-plan.md`
**Source of truth for Flyway slots:** `.claude/state/flyway-claims.md`
**Flyway ceiling (as of 2026-04-23):** V70 (`V70__add_area_overview_stats.sql`)
**Switch token lives in:** GitHub issue #795 pinned comment

---

## Day 0 — Pre-Kickoff (one-time, coordinator only)

### D0.1 — Pre-commit hook (branch-isolation enforcement)

Open a PR from a feature branch (never from main). The hook file is committed into `.githooks/` so it is repo-tracked and works for every contributor. Do NOT place hooks under `.git/hooks/` — that directory is untracked and cannot be reviewed or shared.

```bash
rtk git pull origin main
rtk git checkout -b chore/pre-commit-branch-guard
mkdir -p .githooks
```

Create `.githooks/pre-commit`:

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
chmod +x .githooks/pre-commit
rtk git config core.hooksPath .githooks
rtk git add .githooks/pre-commit
rtk git commit -m "chore: add repo-tracked pre-commit branch guard"
rtk git push -u origin chore/pre-commit-branch-guard
rtk gh pr create --title "chore: repo-tracked pre-commit branch guard" --body "Adds .githooks/pre-commit and sets core.hooksPath. Blocks accidental commits to main. Each terminal must run: rtk git config core.hooksPath .githooks after pulling."
```

Merge before Day 1. After merge, every terminal must run:

```bash
rtk git checkout main
rtk git pull origin main
rtk git config core.hooksPath .githooks
```

**Note:** `rtk git config core.hooksPath` writes to `.git/config`, which is local-only. Every terminal must run it once after pulling main. The hook script itself is tracked in `.githooks/`.

---

### D0.2 — Coordinator tracking issue (#795) pinned comment

Go to GitHub issue #795. Add a pinned comment with this exact text (edit it in place via GitHub UI — never use `gh issue edit`, which overwrites the issue body not the pinned comment; never close/reopen):

```
## Switch Token

Token: none
Current switch PR: none

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

Pin this comment. It is the single mutable record for all coordination state. If it ever diverges from observable reality (open PRs, branch state, actual merge timestamps), fix the comment before any other action.

**When granting a token, the coordinator MUST update both fields in the same edit:**
- `Token: <lane-switch>` (e.g. `Token: A-5`)
- `Current switch PR: #<PR number>` (e.g. `Current switch PR: #812`)

When a switch PR merges, reset both:
- `Token: none`
- `Current switch PR: none`

---

### D0.3 — Confirm all prereqs

- [ ] V70 is the Flyway ceiling (confirm: `backend/src/main/resources/db/migration/V70__add_area_overview_stats.sql` exists)
- [ ] GitHub issues #794–#800 all exist and have their Execution sections
- [ ] #800 (researcher task) is assigned and in progress — B-0/B-2 are blocked on it
- [ ] `.githooks/pre-commit` is committed and merged to main
- [ ] All terminals have pulled latest main and run `rtk git config core.hooksPath .githooks`

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
Lane A's switch PR is A-5, which targets Index.tsx + PropertyMap.tsx + usePropertyListings.ts. A-5 merge is blocked until token grant; draft PR preparation is allowed before token.

MANDATORY TOOLS: Use jcodemunch MCP tools for ALL code navigation (resolve_repo, get_file_outline, get_symbol_source, search_symbols, etc.). Use rtk for ALL shell commands (rtk git, rtk gh, rtk find, rtk grep, etc.).

BRANCH ISOLATION RULE (HARD):
- Your FIRST action every session is: rtk git branch --show-current
- If the output is "main" — DO NOT open any file. Use the branch creation procedure below.
- Branch MUST exist BEFORE you open or edit any file. No exceptions.
- Also confirm hook is active: rtk git config core.hooksPath → must return .githooks

BRANCH CREATION PROCEDURE (set BRANCH for the current PR, then run the 5 lines below):
  For A-lib:        BRANCH="feat/lane-a-a-lib-$(date '+%Y%m%d-%H%M')"
  For A-components: BRANCH="feat/lane-a-a-components-$(date '+%Y%m%d-%H%M')"
  For A-5:          BRANCH="feat/lane-a-a-5-$(date '+%Y%m%d-%H%M')"
  Then:
  rtk git branch --list "$BRANCH"
  rtk git ls-remote --heads origin "$BRANCH"
  # if either command returns any output, choose a new timestamp and retry
  rtk git checkout main
  rtk git pull origin main
  rtk git checkout -b "$BRANCH"

API CONTRACT STABILITY (§C.2):
Once any PR in this lane is merged and consumed by another lane, you may NOT rename, remove, retype, or narrow any exported symbol, prop, or function signature. File a new issue for breaking changes instead.

CURRENT WORK QUEUE (in order):
1. A-lib PR — introduce mapUtils.computeFocusBounds reducer fix + new filterByCity util in localityUtils.ts. Include unit tests. Commit type: feat(lib).
   Merge: self-merge after CI green with rtk gh pr merge --squash --admin.
2. A-components PR — introduce AreaMarkerLayer.tsx, CityChip.tsx, CitySelect.tsx. No wiring to Index.tsx yet. Commit type: feat(components).
   Merge: self-merge after CI green with rtk gh pr merge --squash --admin.
3. A-5 PR — Switch PR for shared files. Token gates merge, not preparation. Complete in this order:
   a. Create branch using the BRANCH CREATION PROCEDURE (A-5 line above).
   b. Implement: A-5 bundles #794 mounting + city-scope wiring + .limit(2000) cap + icon memoisation + ScaleHud dev mount.
   c. Add warning note on issue #794 (required before merge).
   d. Push branch and open a DRAFT PR.
   e. Post in #795: "ready for token=A-5 on PR #$PR_NUMBER" — include the actual PR number.
   f. Wait for coordinator to grant the token and post the grant comment (Token: A-5 in #795 pinned comment, grant SHA posted separately).
   g. Update PR body to include: Token-Grant: $GRANT_SHA (the SHA of the coordinator's grant comment).
   h. Convert draft to ready-for-review.
   i. DO NOT self-merge A-5. Coordinator verifies the Token-Grant trailer and merges it.
      After coordinator merges and updates the pinned comment: rtk git checkout main && rtk git pull origin main.
      Post in #795: "Lane A pulled main. Ready for next."

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
- Introduce PRs: branch → implement → rtk npm run typecheck && rtk npm run test → push → rtk gh pr create → CI green → rtk gh pr merge --squash --admin → rtk git checkout main && rtk git pull origin main
- Switch PR (A-5): branch → implement → push → open draft PR → post "ready for token=A-5 on PR #$PR_NUMBER" in #795 → wait for token grant → update PR body with Token-Grant: $GRANT_SHA → coordinator merges → pull main.
- After file edits: index_file for each edited file to keep jcodemunch fresh.
- Ping #795 with your lane status after each PR merge.
```

---

### Terminal 2 — Lane B (Backend: Geography + Area Summary)

```
You are a Claude Code session executing Lane B of the /discover parallel migration.
Lane B owns: V71__cities_and_areas.sql (new), V72__area_bbox_city_slug.sql (new), City.java + Area.java entities (new), CityRepository.java + AreaRepository.java (new), AreaOverviewRollupJob.java, AreaSummaryController.java (new), useDiscoverAreas.ts (new).
Lane B's switch PR is B-switch (#797), queue position 3 (after A-5 and C-switch). B-switch merge is blocked until token grant; draft PR preparation is allowed before token.

MANDATORY TOOLS: Use jcodemunch MCP tools for ALL code navigation (resolve_repo, get_file_outline, get_symbol_source, search_symbols, etc.). Use rtk for ALL shell commands (rtk git, rtk gh, rtk find, rtk grep, etc.).

BRANCH ISOLATION RULE (HARD):
- Your FIRST action every session is: rtk git branch --show-current
- If the output is "main" — DO NOT open any file. Use the branch creation procedure below.
- Branch MUST exist BEFORE you open or edit any file. No exceptions.
- Also confirm hook is active: rtk git config core.hooksPath → must return .githooks

BRANCH CREATION PROCEDURE (set BRANCH for the current PR, then run the 5 lines below):
  For B-0:      BRANCH="feat/lane-b-b-0-$(date '+%Y%m%d-%H%M')"
  For B-2:      BRANCH="feat/lane-b-b-2-$(date '+%Y%m%d-%H%M')"
  For B-3:      BRANCH="feat/lane-b-b-3-$(date '+%Y%m%d-%H%M')"
  For B-4:      BRANCH="feat/lane-b-b-4-$(date '+%Y%m%d-%H%M')"
  For B-5:      BRANCH="feat/lane-b-b-5-$(date '+%Y%m%d-%H%M')"
  For B-switch: BRANCH="feat/lane-b-b-switch-$(date '+%Y%m%d-%H%M')"
  Then:
  rtk git branch --list "$BRANCH"
  rtk git ls-remote --heads origin "$BRANCH"
  # if either command returns any output, choose a new timestamp and retry
  rtk git checkout main
  rtk git pull origin main
  rtk git checkout -b "$BRANCH"

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
   Merge: self-merge after CI green with rtk gh pr merge --squash --admin.
2. B-2 PR — After B-0 merges. V72__area_bbox_city_slug.sql: add bbox columns + city_slug + geo_center_lat/lon to area_overview_stats (analytics cache, not source of truth).
   Merge: self-merge after CI green.
3. B-3 PR — Rewrite AreaOverviewRollupJob: FROM areas a LEFT JOIN property_listings p ON p.area_key = a.area_key. Areas must exist before listings; rollup must never invent areas from listings. Populates listing_count_90d and analytics columns for every seeded area including zero-listing ones.
   Merge: self-merge after CI green.
4. B-4 PR — AreaSummaryController (new file, GET /api/discover/areas). Returns ALL areas for a city from `areas`, JOINs stats when available. Includes geo_center, bbox, stats (optional).
   Merge: self-merge after CI green.
5. B-5 PR — useDiscoverAreas hook (introduce, no Index.tsx wiring yet).
   Merge: self-merge after CI green.
6. B-switch PR (#797) — Switch PR (queue position 3, after A-5 and C-switch). Token gates merge, not preparation.
   ADDITIONAL PRECONDITIONS that must be met before posting "ready":
   - #799 (B-0) must be merged (cities + areas tables exist in prod)
   - Backend endpoint GET /api/discover/areas is deployed and smoke-tested (curl check required)
   Complete in this order:
   a. Create branch using the BRANCH CREATION PROCEDURE (B-switch line above).
   b. Implement: Index.tsx consumes useDiscoverAreas; replaces area-card data source with server summary; uses server bbox for area click / fitBounds. Removes residual usePropertyListings usage ONLY IF still present after C-switch.
   c. B-switch does NOT refactor map marker path or selected-listing popover (those are Lane C / C-switch).
   d. Push branch and open a DRAFT PR.
   e. Verify additional preconditions above are met.
   f. Post in #795: "ready for token=B-switch on PR #$PR_NUMBER" — include the actual PR number.
   g. Wait for coordinator to grant the token and post the grant comment (Token: B-switch in #795 pinned comment, grant SHA posted separately).
   h. Update PR body to include: Token-Grant: $GRANT_SHA (the SHA of the coordinator's grant comment).
   i. Convert draft to ready-for-review.
   j. DO NOT self-merge B-switch. Coordinator verifies the Token-Grant trailer and merges it.
      After coordinator merges and updates the pinned comment: rtk git checkout main && rtk git pull origin main.
      Post in #795: "Lane B pulled main. Ready for next."

API CONTRACT STABILITY (§C.2):
Once GET /api/discover/areas is consumed by the frontend, you may NOT rename, remove, retype, or narrow any response field. File a new issue for breaking changes.

CONFLICT AVOIDANCE:
- DO NOT touch Index.tsx, PropertyMap.tsx, or usePropertyListings.ts during introduce PRs.
- DO NOT touch Lane C or D files. File a follow-up issue instead.
- One PR at a time. B-2 waits for B-0 CI green.

WORKFLOW:
- Introduce PRs (B-0 through B-5): branch → implement → mvn test (backend) / rtk npm run typecheck (frontend hook) → push → rtk gh pr create → CI green → rtk gh pr merge --squash --admin → rtk git checkout main && rtk git pull origin main
- Switch PR (B-switch): branch → implement → push → open draft PR → verify preconditions → post "ready for token=B-switch on PR #$PR_NUMBER" in #795 → wait for token grant → update PR body with Token-Grant: $GRANT_SHA → coordinator merges → pull main.
- After file edits: index_file for each edited file.
- Ping #795 with your lane status after each PR merge.
```

---

### Terminal 3 — Lane C (Backend: Marker + Detail Split)

```
You are a Claude Code session executing Lane C of the /discover parallel migration.
Lane C owns: ListingMarkersController.java (new), AreaListingsController.java (new), useDiscoverMarkers.ts (new), useDiscoverAreaListings.ts (new), useListingDetail.ts (new).
Lane C's switch PR is C-switch (#796), queue position 2 (after A-5 only). C-switch merge is blocked until token grant; draft PR preparation is allowed before token.

MANDATORY TOOLS: Use jcodemunch MCP tools for ALL code navigation (resolve_repo, get_file_outline, get_symbol_source, search_symbols, etc.). Use rtk for ALL shell commands (rtk git, rtk gh, rtk find, rtk grep, etc.).

BRANCH ISOLATION RULE (HARD):
- Your FIRST action every session is: rtk git branch --show-current
- If the output is "main" — DO NOT open any file. Use the branch creation procedure below.
- Branch MUST exist BEFORE you open or edit any file. No exceptions.
- Also confirm hook is active: rtk git config core.hooksPath → must return .githooks

BRANCH CREATION PROCEDURE (set BRANCH for the current PR, then run the 5 lines below):
  For C-1:      BRANCH="feat/lane-c-c-1-$(date '+%Y%m%d-%H%M')"
  For C-2:      BRANCH="feat/lane-c-c-2-$(date '+%Y%m%d-%H%M')"
  For C-3:      BRANCH="feat/lane-c-c-3-$(date '+%Y%m%d-%H%M')"
  For C-4:      BRANCH="feat/lane-c-c-4-$(date '+%Y%m%d-%H%M')"
  For C-switch: BRANCH="feat/lane-c-c-switch-$(date '+%Y%m%d-%H%M')"
  Then:
  rtk git branch --list "$BRANCH"
  rtk git ls-remote --heads origin "$BRANCH"
  # if either command returns any output, choose a new timestamp and retry
  rtk git checkout main
  rtk git pull origin main
  rtk git checkout -b "$BRANCH"

SIGNATURE PRESERVATION RULE:
ListingMarkersController.java method signatures are frozen once C-1 merges. Lane D (D-4) edits method bodies only. You must NOT change signatures of ListingMarkersController after C-1 is merged without filing a cross-lane change notice.

API CONTRACT STABILITY (§C.2):
Once GET /api/listings/markers or GET /api/discover/areas/{areaKey}/listings is consumed by the frontend, you may NOT rename, remove, retype, or narrow any response field or URL parameter.

PLACEMENT CONTRACT (MANDATORY):
- GET /api/listings/markers returns individual listing positions: use latitude/longitude from property_listings. Do NOT use geo_center_lat/lon from `areas` for listing markers.
- geo_center_lat/lon from `areas` is for area card / area summary placement only (owned by Lane B / AreaSummaryController).
- bbox from `areas` drives fitBounds on area click.

CURRENT WORK QUEUE (in order):
1. C-1 PR — ListingMarkersController (new file, GET /api/listings/markers, city-scoped, bbox param reserved-but-unused). Response: skinny markers only (id, lat, lon, price). No area_overview_stats dependency.
   Merge: self-merge after CI green with rtk gh pr merge --squash --admin.
2. C-2 PR — AreaListingsController (new file, GET /api/discover/areas/{areaKey}/listings).
   Merge: self-merge after CI green.
3. C-3 PR — useDiscoverMarkers hook (new file). Fetches from /api/listings/markers.
   Merge: self-merge after CI green.
4. C-4 PR — useDiscoverAreaListings + useListingDetail hooks (combined PR, new files).
   Merge: self-merge after CI green.
5. C-switch PR (#796) — Switch PR (queue position 2, after A-5). Token gates merge, not preparation. Complete in this order:
   a. Create branch using the BRANCH CREATION PROCEDURE (C-switch line above).
   b. Implement: Map consumes skinny markers via useDiscoverMarkers; selected-listing popover hydrates lazily via useListingDetail(selectedId). useDiscoverAreaListings is for area-scoped list data, not the popover detail.
   c. usePropertyListings remains alive for sidebar at this point (B-switch will remove it).
   d. Push branch and open a DRAFT PR.
   e. Post in #795: "ready for token=C-switch on PR #$PR_NUMBER" — actual PR number required.
   f. Wait for coordinator to grant the token and post the grant comment (Token: C-switch in #795 pinned comment, grant SHA posted separately).
   g. Update PR body to include: Token-Grant: $GRANT_SHA (the SHA of the coordinator's grant comment).
   h. Convert draft to ready-for-review.
   i. DO NOT self-merge C-switch. Coordinator verifies the Token-Grant trailer and merges it.
      After coordinator merges and updates the pinned comment: rtk git checkout main && rtk git pull origin main.
      Post in #795: "Lane C pulled main. Ready for next."

APPEND-ONLY RULE:
useDiscoverMarkers.ts is append-only after C-3 merges. Lane D (D-5) appends only. No reordering of existing methods.

CONFLICT AVOIDANCE:
- DO NOT touch Index.tsx, PropertyMap.tsx, or usePropertyListings.ts during introduce PRs.
- DO NOT touch Lane B or D files. File a follow-up issue instead.
- One PR at a time.

WORKFLOW:
- Introduce PRs (C-1 through C-4): branch → implement → mvn test (backend) / rtk npm run typecheck (frontend hooks) → push → rtk gh pr create → CI green → rtk gh pr merge --squash --admin → rtk git checkout main && rtk git pull origin main
- Switch PR (C-switch): branch → implement → push → open draft PR → post "ready for token=C-switch on PR #$PR_NUMBER" in #795 → wait for token grant → update PR body with Token-Grant: $GRANT_SHA → coordinator merges → pull main.
- After file edits: index_file for each edited file.
- Ping #795 with your lane status after each PR merge.
```

---

### Terminal 4 — Lane D (Viewport Scaling + PostGIS)

```
You are a Claude Code session executing Lane D of the /discover parallel migration.
Lane D owns: docs/adr/NNNN-postgis-adoption.md (new), V73__postgis_geog.sql (new), edits to ListingMarkersController.java (method bodies only, after C-1 merges), edits to useDiscoverMarkers.ts (append-only, after C-3 merges).
Lane D's switch PR is D-switch (#798), queue position 4 (last). D-switch merge is blocked until token grant; draft PR preparation is allowed before token.

MANDATORY TOOLS: Use jcodemunch MCP tools for ALL code navigation (resolve_repo, get_file_outline, get_symbol_source, search_symbols, etc.). Use rtk for ALL shell commands (rtk git, rtk gh, rtk find, rtk grep, etc.).

BRANCH ISOLATION RULE (HARD):
- Your FIRST action every session is: rtk git branch --show-current
- If the output is "main" — DO NOT open any file. Use the branch creation procedure below.
- Branch MUST exist BEFORE you open or edit any file. No exceptions.
- Also confirm hook is active: rtk git config core.hooksPath → must return .githooks

BRANCH CREATION PROCEDURE (set BRANCH for the current PR, then run the 5 lines below):
  For D-1:      BRANCH="feat/lane-d-d-1-$(date '+%Y%m%d-%H%M')"
  For D-2:      BRANCH="feat/lane-d-d-2-$(date '+%Y%m%d-%H%M')"
  For D-4:      BRANCH="feat/lane-d-d-4-$(date '+%Y%m%d-%H%M')"
  For D-5:      BRANCH="feat/lane-d-d-5-$(date '+%Y%m%d-%H%M')"
  For D-switch: BRANCH="feat/lane-d-d-switch-$(date '+%Y%m%d-%H%M')"
  Then:
  rtk git branch --list "$BRANCH"
  rtk git ls-remote --heads origin "$BRANCH"
  # if either command returns any output, choose a new timestamp and retry
  rtk git checkout main
  rtk git pull origin main
  rtk git checkout -b "$BRANCH"

FLYWAY SLOT OWNERSHIP:
- V73 = D-2 (PostGIS extension + geog GENERATED column + GIST index)
- Pre-claimed in .claude/state/flyway-claims.md. Ceiling is V70; V71 and V72 must merge before V73.

SIGNATURE PRESERVATION RULE (CRITICAL):
- D-4 edits ListingMarkersController method bodies ONLY. No signature changes. No new public methods. No new response fields without coordinator approval (§C.2 cross-lane contract).
- D-5 appends to useDiscoverMarkers.ts ONLY. No edits to existing methods or imports.

CURRENT WORK QUEUE (in order):
1. D-1 PR — ADR: PostGIS adoption (docs/adr/NNNN-postgis-adoption.md). Document decision, alternatives considered, migration risk. No code changes.
   Merge: self-merge after CI green with rtk gh pr merge --squash --admin.
2. D-2 PR — V73__postgis_geog.sql: PostGIS extension + geog GENERATED column on property_listings + GIST index. BLOCKED until V71 and V72 are merged (Flyway sequence rule).
   Merge: self-merge after CI green.
3. D-4 PR — bbox + zoom implementation on ListingMarkersController. BLOCKED until C-1 is merged. Edit method bodies only. bbox param (reserved in C-1) becomes functional. No signature changes.
   Merge: self-merge after CI green.
4. D-5 PR — bbox rounding + abort controller + zoom bucketing. Append to useDiscoverMarkers.ts after C-3 merges. No edits to existing exports.
   Merge: self-merge after CI green.
5. D-switch PR (#798) — Switch PR (queue position 4, last). Token gates merge, not preparation. Complete in this order:
   a. Create branch using the BRANCH CREATION PROCEDURE (D-switch line above).
   b. Implement: zoom-band layer strategy in Index.tsx / PropertyMap.tsx.
   c. Push branch and open a DRAFT PR.
   d. Post in #795: "ready for token=D-switch on PR #$PR_NUMBER" — actual PR number required.
   e. Wait for coordinator to grant the token and post the grant comment (Token: D-switch in #795 pinned comment, grant SHA posted separately).
   f. Update PR body to include: Token-Grant: $GRANT_SHA (the SHA of the coordinator's grant comment).
   g. Convert draft to ready-for-review.
   h. DO NOT self-merge D-switch. Coordinator verifies the Token-Grant trailer and merges it.
      After coordinator merges and updates the pinned comment: rtk git checkout main && rtk git pull origin main.
      Post in #795: "Lane D pulled main. Ready for next."

CONFLICT AVOIDANCE:
- DO NOT touch Lane B or C-owned files. File a follow-up issue instead.
- DO NOT change ListingMarkersController signatures.
- One PR at a time.

WORKFLOW:
- Introduce PRs (D-1 through D-5): branch → implement → mvn test (backend) / rtk npm run typecheck (frontend) → push → rtk gh pr create → CI green → rtk gh pr merge --squash --admin → rtk git checkout main && rtk git pull origin main
- Switch PR (D-switch): branch → implement → push → open draft PR → post "ready for token=D-switch on PR #$PR_NUMBER" in #795 → wait for token grant → update PR body with Token-Grant: $GRANT_SHA → coordinator merges → pull main.
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
- If "main" — DO NOT open any file. Use the branch creation procedure below.
- Branch MUST exist BEFORE you open or edit any file. No exceptions.
- Also confirm hook is active: rtk git config core.hooksPath → must return .githooks

BRANCH CREATION PROCEDURE (set BRANCH for the current PR, then run the 5 lines below):
  For E-HUD:  BRANCH="test/lane-e-e-hud-$(date '+%Y%m%d-%H%M')"
  For E-2':   BRANCH="test/lane-e-e-2-$(date '+%Y%m%d-%H%M')"
  For E-1':   BRANCH="test/lane-e-e-1-$(date '+%Y%m%d-%H%M')"
  For E-3':   BRANCH="test/lane-e-e-3-$(date '+%Y%m%d-%H%M')"
  For E-5:    BRANCH="test/lane-e-e-5-$(date '+%Y%m%d-%H%M')"
  Then:
  rtk git branch --list "$BRANCH"
  rtk git ls-remote --heads origin "$BRANCH"
  # if either command returns any output, choose a new timestamp and retry
  rtk git checkout main
  rtk git pull origin main
  rtk git checkout -b "$BRANCH"

PINNED COMMENT INVARIANT (hard stop):
Before activating backup coordinator role OR before acting on any switch-related state:
1. Read #795 pinned comment (current token state).
2. Cross-check against observable reality:
   a. If token ≠ "none": confirm an open switch PR exists for that lane.
      rtk gh pr view $SWITCH_PR --json state,mergedAt  # set $SWITCH_PR to the PR# from the pinned comment
      state must be OPEN and mergedAt must be null.
      If the PR is already merged or closed → pinned comment is stale. Fix it before proceeding.
   b. If token = "none": confirm no switch PR is currently open for any lane.
      rtk gh pr list --state open --json number,title
      If a switch PR is open without a token → investigate before proceeding.
3. If pinned comment does not match observable reality: stop all other work, fix the comment, then proceed.

BACKUP COORDINATOR ACTIVATION:
- Check #795 last comment timestamp. If primary coordinator has not posted for 24+ hours, activate backup role.
- Run the PINNED COMMENT INVARIANT check before taking any coordinator action.
- When backup: read #795 pinned comment, resume coordination from current queue position.
- Pause Lane E work while the switch token is held by any lane (token ≠ "none"). Resume when token returns to "none".

LANE E WORK QUEUE (gated by switch merges):
1. E-HUD PR — standalone src/dev/ScaleHud.tsx (component only, no mount). No Index.tsx wiring — mount is folded into A-5.
   Merge: self-merge after CI green with rtk gh pr merge --squash --admin.
2. E-2' PR — e2e/discover-city-switch.spec.ts. BLOCKED until A-5 merges.
   Merge: self-merge after CI green.
3. E-1' PR — e2e/discover-area-cards.spec.ts. BLOCKED until B-switch merges.
   Merge: self-merge after CI green.
4. E-3' PR — e2e/discover-viewport.spec.ts. BLOCKED until D-switch merges.
   Merge: self-merge after CI green.
5. E-5 PR — Append cases to e2e/discover-to-trends.spec.ts. BLOCKED until C-switch merges. Append-only — no edits to existing spec blocks.
   Merge: self-merge after CI green.

E2E RUNNER:
- Smoke: bash scripts/run-e2e-local.sh e2e/quick-smoke.spec.ts
- Full spec: bash scripts/run-e2e-local.sh --project=full e2e/discover-city-switch.spec.ts
- E2E must pass locally before any switch PR is marked ready.

CONFLICT AVOIDANCE:
- DO NOT touch Index.tsx, PropertyMap.tsx, or usePropertyListings.ts.
- DO NOT edit e2e/discover-to-trends.spec.ts except by appending. No reordering.
- One PR at a time.

WORKFLOW (all Lane E PRs are introduce PRs — self-merge is permitted):
branch → implement → run E2E → push → rtk gh pr create → CI green → rtk gh pr merge --squash --admin → rtk git checkout main && rtk git pull origin main → index_file for changed files → ping #795.
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
5. Merge all switch PRs after verifying prerequisites, token, and Token-Grant trailer.
6. NEVER use rtk gh issue edit to update the pinned comment. Use GitHub UI only (gh CLI overwrites the issue body, not the pinned comment).

SWITCH QUEUE (strict order):
  Queue 1: A-5       (issue: #794)
  Queue 2: C-switch  (issue: #796)
  Queue 3: B-switch  (issue: #797)
  Queue 4: D-switch  (issue: #798)

SESSION START CHECKLIST:
  1. rtk git branch --show-current → confirm "main"
  2. rtk git status → confirm clean
  3. Read #795 pinned comment → note current token state
  4. Read lane heartbeat timestamps → flag any 12h+ silences
  5. Check open switch PRs: rtk gh pr list --state open --json number,title
  6. INVARIANT CHECK — pinned comment must match observable reality:
     a. If token = X-switch: confirm the corresponding switch PR is still open (not merged or closed).
        rtk gh pr view $SWITCH_PR --json state,mergedAt  # set $SWITCH_PR from the open PR list
        state must be OPEN; mergedAt must be null.
        If mergedAt is not null → PR already merged; update pinned comment to token: none before anything else.
     b. If token = "none": confirm no switch PR is open for any lane. If one is found, investigate and reconcile.
     c. If any mismatch: fix the pinned comment before any other action. Do not grant or verify until the comment is accurate.

GRANTING THE TOKEN — checklist per switch:

For A-5 (queue 1):
  [ ] A-lib PR merged — verify: rtk gh pr view $PR_NUMBER --json state,mergedAt (mergedAt must not be null)
  [ ] A-components PR merged — verify: same (use that PR's number)
  [ ] #795 token = "none"
  [ ] Lane A has posted "ready for token=A-5 on PR #$PR_NUMBER" in #795 and a DRAFT PR is open
  [ ] Switch PR head is not main: rtk gh pr view $PR_NUMBER --json headRefName  (must not be "main")
  [ ] Changed files are within A-5 scope: rtk gh pr view $PR_NUMBER --json files
      (expected: src/pages/Index.tsx, src/components/map/PropertyMap.tsx, src/hooks/usePropertyListings.ts)
      Do not grant if diff includes files outside this set.
  → Grant: edit pinned comment — update BOTH fields:
      Token: A-5
      Current switch PR: #$PR_NUMBER
  → Append to Token Grant Log: "A-5 granted at [timestamp], comment SHA: [sha]"

For C-switch (queue 2):
  [ ] A-5 PR merged — verify: rtk gh pr view $PR_NUMBER --json state,mergedAt (mergedAt must not be null)
  [ ] C-1 merged — verify: same (use C-1's PR number)
  [ ] C-2 merged — verify: same
  [ ] C-3 merged — verify: same
  [ ] C-4 merged — verify: same
  [ ] useDiscoverMarkers.ts exists and exports correct hook
  [ ] Skinny marker endpoint smoke test: curl http://localhost:8080/api/listings/markers?city=udupi → 200
  [ ] E2E smoke passes locally
  [ ] #795 token = "none"
  [ ] Lane C has posted "ready for token=C-switch on PR #$PR_NUMBER" in #795 and a DRAFT PR is open
  [ ] Switch PR head is not main: rtk gh pr view $PR_NUMBER --json headRefName  (must not be "main")
  [ ] Changed files are within C-switch scope: rtk gh pr view $PR_NUMBER --json files
      (expected: src/pages/Index.tsx, src/components/map/PropertyMap.tsx, src/hooks/usePropertyListings.ts)
      Do not grant if diff includes files outside this set.
  → Grant: edit pinned comment — update BOTH fields:
      Token: C-switch
      Current switch PR: #$PR_NUMBER

For B-switch (queue 3):
  [ ] C-switch PR merged — verify: rtk gh pr view $PR_NUMBER --json state,mergedAt (mergedAt must not be null)
  [ ] B-0 merged (#799) — verify: same (use B-0's PR number)
  [ ] B-2 merged — verify: same
  [ ] B-3 merged — verify: same
  [ ] B-4 merged — verify: same
  [ ] B-5 merged — verify: same
  [ ] GET /api/discover/areas smoke test: curl http://localhost:8080/api/discover/areas?city=udupi → 200, returns geo_center fields
  [ ] useDiscoverAreas.ts exists and exports correct hook
  [ ] E2E smoke passes locally
  [ ] #795 token = "none"
  [ ] Lane B has posted "ready for token=B-switch on PR #$PR_NUMBER" in #795 and a DRAFT PR is open
  [ ] Switch PR head is not main: rtk gh pr view $PR_NUMBER --json headRefName  (must not be "main")
  [ ] Changed files are within B-switch scope: rtk gh pr view $PR_NUMBER --json files
      (expected: src/pages/Index.tsx, src/hooks/usePropertyListings.ts)
      Do not grant if diff includes files outside this set.
  → Grant: edit pinned comment — update BOTH fields:
      Token: B-switch
      Current switch PR: #$PR_NUMBER

For D-switch (queue 4):
  [ ] B-switch PR merged — verify: rtk gh pr view $PR_NUMBER --json state,mergedAt (mergedAt must not be null)
  [ ] D-1 merged — verify: same
  [ ] D-2 merged — verify: same
  [ ] D-4 merged — verify: same
  [ ] D-5 merged — verify: same
  [ ] V73 migration applied (PostGIS geog column confirmed)
  [ ] bbox + zoom endpoint smoke test: curl http://localhost:8080/api/listings/markers?city=udupi&bbox=... → 200
  [ ] E2E smoke passes locally
  [ ] #795 token = "none"
  [ ] Lane D has posted "ready for token=D-switch on PR #$PR_NUMBER" in #795 and a DRAFT PR is open
  [ ] Switch PR head is not main: rtk gh pr view $PR_NUMBER --json headRefName  (must not be "main")
  [ ] Changed files are within D-switch scope: rtk gh pr view $PR_NUMBER --json files
      (expected: src/pages/Index.tsx, src/components/map/PropertyMap.tsx)
      Do not grant if diff includes files outside this set.
  → Grant: edit pinned comment — update BOTH fields:
      Token: D-switch
      Current switch PR: #$PR_NUMBER

MERGING SWITCH PRs:
After the lane posts "ready for token=X on PR #$PR_NUMBER" and you have granted the token:
  1. Confirm PR is open: rtk gh pr view $SWITCH_PR --json state,mergedAt → state must be OPEN
  2. Confirm PR body contains: Token-Grant: $GRANT_SHA  # the SHA of your grant comment
  3. Confirm CI is green: rtk gh pr checks $SWITCH_PR
  4. Merge: rtk gh pr merge $SWITCH_PR --squash --admin
  5. Update pinned comment — reset BOTH fields:
       Token: none
       Current switch PR: none
  6. Post in #795: "X merged. Token: none. Queue advancing to $NEXT_SWITCH."

HEARTBEAT PROTOCOL:
- If a lane has not posted in #795 for 12h: post "@lane-X — heartbeat ping. Still active?"
- If no response after 24h from ping: post "Lane X assumed inactive. Token released. Branch deleted."
  Then identify the lane branch and delete it:
  rtk git ls-remote --heads origin 'feat/lane-X-*'  # find $LANE_BRANCH
  rtk git push origin --delete $LANE_BRANCH
  Update pinned comment: token = "none" (if lane held token), lane status = "released"
  Notify Terminal 5 (backup coordinator) to verify.

PINNED COMMENT UPDATE FORMAT:
After each grant or merge, edit the pinned comment to reflect:
  Token: [current token or "none"]
  Queue position: [next switch or "complete"]
  Lane heartbeat table: update Last ping + Status

TOKEN-GRANT TRAILER:
After granting, post a separate comment with the grant SHA (GitHub assigns it). Lanes include this SHA in their PR body as: Token-Grant: $GRANT_SHA
```

---

## Daily Operating Loop

### Morning (start of each day)

```
Terminal 6 (Coordinator):
1. Run SESSION START CHECKLIST (includes invariant check — see Terminal 6 prompt).
2. Check lane heartbeat timestamps — any 12h silences get a ping.
3. Read open PRs: rtk gh pr list --state open
4. Check CI status on open PRs: rtk gh pr checks $PR_NUMBER
5. Post a daily status summary in #795 comments.

All lane terminals:
1. rtk git branch --show-current → note your current branch.
2. rtk git config core.hooksPath .githooks  (confirm hook active each session)
3. If on main:
     rtk git pull origin main
     Then checkout your current lane branch by its exact name:
       rtk git checkout feat/lane-X-pr-name-YYYYMMDD-HHMM
     If no lane branch exists yet (starting a new PR) → use the BRANCH CREATION PROCEDURE
     in your terminal's prompt for the next PR in your queue.
   If already on your lane branch:
     Continue — no checkout needed.
   Never auto-pick using wildcards or the first matching branch.
4. rtk git branch --show-current → confirm you are on your lane branch (not main)
5. Read #795 pinned comment — confirm token state before any work
6. If your lane's switch token is now available, start switch PR workflow.
7. Otherwise, continue next introduce PR in your queue.
```

### During the day

- Lane terminals work independently on their introduce PRs.
- Introduce PRs: self-merge after CI green.
- Switch PRs: branch → implement → push → open draft PR → post "ready for token=X on PR #$PR_NUMBER" in #795 → wait for coordinator to grant token → update PR body with Token-Grant: $GRANT_SHA → coordinator verifies trailer + CI → coordinator merges. Do NOT self-merge.
- Do NOT touch shared files (Index.tsx, PropertyMap.tsx, usePropertyListings.ts) outside the switch PR process.
- After each file edit: call index_file for that file.
- After each PR merge: ping #795, pull main, switch back to feature branch for next PR.

### End of day

```
All lane terminals:
1. Push current branch: rtk git push origin "$(rtk git branch --show-current)"
2. Post heartbeat in #795: "Lane X EOD — current: [PR description], next: [what's next]"

Coordinator:
1. Update lane heartbeat table in pinned comment.
2. Run invariant check: pinned comment token state must match open PRs and mergedAt values.
3. If a switch PR is open and CI is green, verify and merge immediately — don't wait for tomorrow.
```

---

## Monitoring Signals

| Signal | Meaning | Action |
|--------|---------|--------|
| Lane posts in #795 but no PR after 4h | Working on large introduce PR | Normal — no action |
| Lane silent 12h | May be stuck or context-switched | Coordinator pings lane |
| Lane silent 24h after ping | Inactive | Coordinator releases token (if held), deletes remote branch |
| Two PRs open on Index.tsx simultaneously | Switch token leak | Close younger PR, fix pinned comment, re-grant token correctly |
| CI fails on introduce PR | Bug in lane's file — does not block other lanes | Lane fixes in same branch |
| CI fails on switch PR | May block queue | Coordinator holds token until fixed; other introduce PRs continue |
| Flyway migration number conflict | Two lanes tried to claim same V-slot | Second PR rebases to next free slot per flyway-claims.md rules |
| "ready for token" posted without PR number | Missing PR reference | Coordinator asks lane to provide PR number before proceeding |
| B-switch attempted before #799 merged | Missing cities/areas tables | Coordinator blocks token grant; verify B-0 mergedAt is not null |
| D-2 attempted before V71/V72 merged | Flyway sequence violation | Coordinator blocks; verify V71/V72 mergedAt before granting |
| Pinned comment token ≠ "none" but no open switch PR | Stale comment | Coordinator fixes comment immediately (invariant violation) |
| Switch PR self-merged by lane | Protocol violation | Revert if possible; coordinator audits and updates pinned comment |

---

## Failure Playbooks

### F1 — Lane goes silent mid-switch (holds token)

```
Symptoms: Token = "X-switch" in #795, no PR activity for 24h.
Response (Coordinator):
1. Ping the lane: "Token held by X-switch — heartbeat required or token will be released."
2. Wait 4h. If no response:
3. Confirm PR state:
   rtk gh pr view $SWITCH_PR --json state,mergedAt  # set $SWITCH_PR from the pinned comment
   If mergedAt is not null → PR was already merged; update pinned comment (token: none) and continue.
   If state is OPEN → proceed with takeover.
4. Post: "Token released from X-switch due to inactivity."
5. Edit pinned comment: Token: none
6. rtk gh pr close $SWITCH_PR  (if draft/open, not yet reviewed)
7. Identify the switch branch and delete it:
   rtk git ls-remote --heads origin 'feat/lane-X-*'  # find $SWITCH_BRANCH
   rtk git push origin --delete $SWITCH_BRANCH
8. Advance queue to next waiting lane.
9. Original lane restarts switch PR from scratch when active again — creates new branch.
```

### F2 — Flyway version conflict

```
Symptoms: Two PRs contain migrations with the same V-number.
Response:
1. Identify which PR was opened second (by PR creation timestamp).
2. Close the second PR.
3. Author of second PR checks out their branch and rebases:
   rtk git checkout "$(rtk git branch --show-current)"
   rtk git rebase main
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
2. Lane reverts the specific shared file:
   rtk git checkout main -- src/pages/Index.tsx
   # or: rtk git checkout main -- src/components/map/PropertyMap.tsx
   # or: rtk git checkout main -- src/hooks/usePropertyListings.ts
3. File a follow-up issue for the intended change.
4. Rebase and push.
```

### F4 — B-0 seed data blocked (researcher stalls)

```
Symptoms: #800 not delivering seed dataset; B-0 blocked indefinitely.
Response:
1. Coordinator posts in #800 requesting ETA.
2. B-0 remains blocked. B-2 and B-3 also remain blocked — B-2 alters area_overview_stats
   which depends on cities/areas existing, and B-3 rewrites the rollup to JOIN from areas.
   Neither can land before B-0 creates the tables.
3. B-4 (AreaSummaryController) can be implemented and unit-tested in isolation (no migration dependency).
4. B-5 (useDiscoverAreas hook) can be implemented and unit-tested in isolation.
5. B-switch remains blocked until B-0 through B-5 are all merged.
6. Do NOT synthetic-generate seed data and do NOT proceed with a placeholder empty areas table
   unless the architecture is explicitly changed in a separate issue.
7. Escalate #800 to unblock the lane — seed data is the critical path.
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

# Confirm hook is active (run once per session)
rtk git config core.hooksPath

# Create a new lane branch — set BRANCH for the current PR, then run the 5 lines
# Lane A examples:
#   BRANCH="feat/lane-a-a-lib-$(date '+%Y%m%d-%H%M')"
#   BRANCH="feat/lane-a-a-components-$(date '+%Y%m%d-%H%M')"
#   BRANCH="feat/lane-a-a-5-$(date '+%Y%m%d-%H%M')"
# Lane B examples:
#   BRANCH="feat/lane-b-b-0-$(date '+%Y%m%d-%H%M')"
#   BRANCH="feat/lane-b-b-switch-$(date '+%Y%m%d-%H%M')"
# Lane C examples:
#   BRANCH="feat/lane-c-c-1-$(date '+%Y%m%d-%H%M')"
#   BRANCH="feat/lane-c-c-switch-$(date '+%Y%m%d-%H%M')"
# Lane D examples:
#   BRANCH="feat/lane-d-d-1-$(date '+%Y%m%d-%H%M')"
#   BRANCH="feat/lane-d-d-switch-$(date '+%Y%m%d-%H%M')"
# Lane E examples:
#   BRANCH="test/lane-e-e-hud-$(date '+%Y%m%d-%H%M')"
#   BRANCH="test/lane-e-e-5-$(date '+%Y%m%d-%H%M')"
rtk git branch --list "$BRANCH"
rtk git ls-remote --heads origin "$BRANCH"
rtk git checkout main
rtk git pull origin main
rtk git checkout -b "$BRANCH"

# After a PR merge: return to main, pull, then checkout the next lane branch by exact name
rtk git checkout main
rtk git pull origin main
rtk git checkout feat/lane-X-next-pr-name-YYYYMMDD-HHMM  # use the exact branch for the next PR
# No next branch yet? Use the BRANCH CREATION PROCEDURE for the next PR in your queue.
```

### PR workflow

```bash
# Create PR
rtk gh pr create --title "feat(lane-a): description" --body "..."

# Check PR status and verify merge (set $PR_NUMBER to the actual PR number)
rtk gh pr view $PR_NUMBER --json state,mergedAt

# Check CI
rtk gh pr checks $PR_NUMBER

# Merge introduce PR (lane self-merges)
rtk gh pr merge $PR_NUMBER --squash --admin

# List open PRs
rtk gh pr list --state open --json number,title

# NOTE: switch PRs are merged by coordinator only, never by the lane terminal
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

# Check all open PRs
rtk gh pr list --state open --json number,title

# Verify a PR is truly merged (set $PR_NUMBER to actual PR number)
rtk gh pr view $PR_NUMBER --json state,mergedAt

# Delete stale remote branch (inactive lane takeover)
rtk git ls-remote --heads origin 'feat/lane-X-*'   # identify $LANE_BRANCH
rtk git push origin --delete $LANE_BRANCH

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
| #773 | E | introduce | — | — |
| #793 | E | introduce | — | — |
| #785 | A | introduce | — | — |
| #795 | — | coordinator tracking | — | all switches |

---

*Generated: 2026-04-23. Source of truth for plan: `.claude/state/discover-parallel-plan.md`. Source of truth for Flyway: `.claude/state/flyway-claims.md`. Mutable runtime state: GitHub #795 pinned comment.*
