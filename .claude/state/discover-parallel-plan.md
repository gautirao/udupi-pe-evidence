# /discover parallel migration — canonical plan

**Status:** active
**Owner epic:** #763
**Tracker issue:** see pinned at top of the parallel-migration tracking issue.
**Source of truth for lane definitions, file ownership, and queue order.** Read-only after landing; live mutable state lives in the GitHub tracking issue and `.claude/state/flyway-claims.md`.

---

## Lanes

| Lane | Scope | Owner session |
|---|---|---|
| A | Frontend UX correctness + #794 shell | Terminal 1 |
| B | Area summary (backend + hook) | Terminal 2 |
| C | Marker/detail split | Terminal 3 |
| D | Viewport scaling + PostGIS | Terminal 4 |
| E | E2E + dev HUD | Terminal 5 |
| — | Switch-queue coordinator | Terminal 6 |

## Issues per lane (tightened)

### Lane A — 3 PRs
- **A-lib** (introduce) — `mapUtils.computeFocusBounds` reducer fix + new `filterByCity` util in `localityUtils.ts`. Files: `src/lib/mapUtils.ts`, `src/lib/localityUtils.ts`, `src/lib/__tests__/*`.
- **A-components** (introduce) — new `AreaMarkerLayer.tsx`, `CityChip.tsx`, `CitySelect.tsx`. No Index wiring.
- **A-5** (switch) — bundles #794 mounting + city-scope wiring + `.limit(2000)` cap + icon memoisation + ScaleHud dev mount + warning note on #794. Touches `Index.tsx`, `PropertyMap.tsx`, `usePropertyListings.ts`.

### Lane B — 6 PRs
- **B-0** (#799) **V71 migration — `cities` + `areas` base tables (geography source of truth) with initial seed INSERTs combined in one migration**. Blocked on #800 seed dataset. Must merge before B-2/B-3.
- **B-2** **V72 migration**: `area_overview_stats` + `bbox` + `city_slug` + **`geo_center_lat` / `geo_center_lon`** columns (retained as analytics cache; source of truth for placement is now `areas`).
- **B-3** `AreaOverviewRollupJob` aggregates **FROM `areas` LEFT JOIN `property_listings`** (not derived from listings); populates `listing_count_90d` and analytics columns for every seeded area including zero-listing ones.
- **B-4** `AreaSummaryController` implementation (new file, `GET /api/discover/areas`) — returns ALL areas for a city from `areas`, JOINs stats when available.
- **B-5** `useDiscoverAreas` hook (introduce).
- **B-switch** Index consumes `useDiscoverAreas`; replaces area-card data source with server summary; uses server `bbox` for area click / fitBounds. Removes any residual `usePropertyListings` usage **only if still present after C-switch**. Does **not** refactor the map marker path or selected-listing popover path — those are owned by Lane C (C-switch).

**Source-of-truth rule:** `cities` / `areas` define geography; rollup defines stats. Areas must exist before listings arrive — rollup must never invent areas from listings.

**Placement contract (MANDATORY):** `geo_center_lat/lon` **from `areas`** drives UI marker placement (area cards). `centroid_lat/lon` (on `area_overview_stats`) remains for analytics only (trend / density / clustering) and MUST NOT be used for placement. `bbox` drives `fitBounds` on area click. See #799 "cities + areas base tables", #797 "Geo-center vs centroid clarification", and #794 "Marker positioning contract".

### Lane C — 5 PRs
- **C-1** `ListingMarkersController` (new file, `GET /api/listings/markers`, city-scoped, bbox param reserved-but-unused).
- **C-2** `AreaListingsController` (new file, `GET /api/discover/areas/{areaKey}/listings`).
- **C-3** `useDiscoverMarkers` hook.
- **C-4** `useDiscoverAreaListings` + `useListingDetail` hooks (combined PR).
- **C-switch** map consumes skinny markers; popover hydrates lazily. `usePropertyListings` still alive for sidebar until B-switch.

### Lane D — 5 PRs
- **D-1** ADR: PostGIS adoption.
- **D-2** **V73 migration**: `postgis` extension + `geog` column + GIST index.
- **D-4** bbox + zoom implementation on `ListingMarkersController`.
- **D-5** bbox rounding + abort + zoom bucketing — extends `useDiscoverMarkers.ts` (append-only).
- **D-switch** zoom-band layer strategy in `Index.tsx`/`PropertyMap.tsx`.

### Lane E — 5 PRs
- **E-HUD** standalone `src/dev/ScaleHud.tsx` (component only, mount folded into A-5).
- **E-2′** `e2e/discover-city-switch.spec.ts` — after A-5 merges.
- **E-1′** `e2e/discover-area-cards.spec.ts` — after B-switch merges.
- **E-3′** `e2e/discover-viewport.spec.ts` — after D-switch merges.
- **E-5** append cases to `e2e/discover-to-trends.spec.ts` — after C-switch merges.

---

## Switch queue order (strict)

1. **A-5** — correctness + #794 + caps
2. **C-switch** — lazy markers + lazy popover (biggest wire-size win)
3. **B-switch** — area cards from `/api/discover/areas`
4. **D-switch** — zoom-band + bbox + abort
5. **E-5** — E2E append (may overlap with D-switch if conflict-free)

Only one switch PR may be open against `Index.tsx` or `PropertyMap.tsx` at a time. Token held in the tracking issue's pinned comment.

---

## File ownership

### Frontend

| File | Introduce-phase owner | Switch-phase owner(s) |
|---|---|---|
| `src/pages/Index.tsx` | **none — forbidden** | A-5 → C-switch → B-switch → D-switch |
| `src/components/map/PropertyMap.tsx` | **none — forbidden** | A-5 → C-switch → D-switch |
| `src/hooks/usePropertyListings.ts` | **none — forbidden** | A-5 (cap) → C-switch (remove from map path) → B-switch (remove residual discover usage only if still present) |
| `src/lib/mapUtils.ts` | Lane A | — |
| `src/lib/localityUtils.ts` | Lane A | — |
| `src/components/map/AreaMarkerLayer.tsx` (new) | Lane A | — |
| `src/components/discover/CityChip.tsx` (new) | Lane A | — |
| `src/components/discover/CitySelect.tsx` (new) | Lane A | — |
| `src/hooks/useDiscoverAreas.ts` (new) | Lane B | — |
| `src/hooks/useDiscoverMarkers.ts` (new) | Lane C; Lane D append-only after C-3 merges | — |
| `src/hooks/useDiscoverAreaListings.ts` (new) | Lane C | — |
| `src/hooks/useListingDetail.ts` (new) | Lane C | — |
| `src/dev/ScaleHud.tsx` (new) | Lane E | — |
| `e2e/discover-to-trends.spec.ts` | append-only, Lane E | — |

### Backend

| File | Owner |
|---|---|
| `backend/src/main/resources/db/migration/V71__cities_and_areas.sql` (new — schema + seed combined, blocked on #800) | Lane B |
| `backend/src/main/resources/db/migration/V72__area_bbox_city_slug.sql` (new) | Lane B |
| `backend/src/main/resources/db/migration/V73__postgis_geog.sql` (new) | Lane D |
| `backend/src/main/java/com/example/realestate/geo/City.java` + `Area.java` entities (new) | Lane B |
| `backend/src/main/java/com/example/realestate/geo/CityRepository.java` + `AreaRepository.java` (new) | Lane B |
| `backend/.../analytics/AreaOverviewRollupJob.java` | Lane B |
| `backend/.../discover/AreaSummaryController.java` (new) | Lane B |
| `backend/.../discover/ListingMarkersController.java` (new) | Lane C creates; Lane D edits method body only (no signature change) |
| `backend/.../discover/AreaListingsController.java` (new) | Lane C |
| `backend/.../discover/*Response.java` DTOs | creating lane owns each |
| `docs/adr/NNNN-postgis-adoption.md` (new) | Lane D |

**Seed-loading contract (B-0):** `V71__cities_and_areas.sql` is a single migration containing `CREATE TABLE cities`, `CREATE TABLE areas`, and `INSERT INTO cities` / `INSERT INTO areas` statements with `ON CONFLICT … DO NOTHING` for idempotency. No separate seed migration, no Flyway repeatable (`R__`), no admin import script. The migration is blocked on #800 delivering the researcher dataset.

---

## Conflict-avoidance rules

1. **Introduce PRs never edit shared files.** Shared files = `Index.tsx`, `PropertyMap.tsx`, `usePropertyListings.ts`.
2. **Switch queue is single-holder.** Claim via editing the tracking issue's pinned comment (see operator playbook).
3. **Backend-before-frontend-switch.** Any frontend switch PR must link the deployed backend endpoint. Verify with `curl` against local or staging before requesting review.
4. **Flyway slot claim** is append-only to `.claude/state/flyway-claims.md` via its own tiny PR before the migration PR opens.
5. **Append-only shared files.** `useDiscoverMarkers.ts` (Lane C) and `DiscoverController` splits: new methods/tests append to the end of the file. No reordering.
6. **No cross-lane refactors.** Lane A does not touch Lane B files "while we're here." File a follow-up issue instead.
7. **No speculative scaffolds.** Don't create an empty controller/hook just to reserve it. Ship the first real method/test with the file.
8. **One introduce PR per lane at a time.** CI stability; avoids migration race conditions.

---

## Cross-reference

- Executive review: prior conversation (turn 2).
- Migration design: prior conversation (turn 3).
- Parallel model evolution: prior conversation (turns 4–5).
- Scale gates: §7 of migration design.
- #794 warning note: attached to issue when A-5 opens.
