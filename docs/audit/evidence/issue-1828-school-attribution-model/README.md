# Issue #1828 — school attribution model: fact-finding report

Pre-implementation investigation. **No schema or code was changed to produce this document.**
Every claim below carries a `file:line` citation into the repo at `b94c4802` (the merged #1737 /
PR #1827 head). Where a number is quoted, it was *measured* from the real repo sources, not
transcribed from a previous document.

Companion artefacts in this directory:

| File | What it is |
|---|---|
| `README.md` | This report. |
| `measured-distances.json` | Machine-readable: all 32 Bengaluru schools with measured distances. |
| `measure.py` | The script that produced it, reading the **real** migrations + fixture. |

---

## PR1 implementation note (post-merge addendum)

PR1 (#1828) shipped as designed in the approved plan (rev 002, all 5 blocking issues answered
with proofs — see `.claude/handoffs/issue-1828/002-plan-review-request.toml`):

- `V110__school_discover_area_coverage.sql` — new `school_discover_area_coverage` junction table
  (composite PK `(school_id, curated_area_key)`, `curated_area_key` FK `ON DELETE RESTRICT`,
  `school_id` FK `ON DELETE CASCADE`), a pure `'primary'`/`'area_key_mirror'` backfill over every
  school with a non-NULL `area_key` (all cities, keyed on `schools.id`), a `DO $$` identity guard
  comparing the legacy `schools.area_key` string-equality count against the new coverage count for
  every row of `areas`, and an `AFTER INSERT OR UPDATE OF area_key` trigger that keeps coverage
  convergent without ever downgrading a `'reviewed_override'` row back to `'primary'`.
- `AreaSummaryService.java` — both `AREAS_BY_CITY_SQL` and `AREAS_BY_CITY_TYPE_FILTERED_SQL` now
  derive their school-count subquery from one shared `SCHOOL_COUNT_SUBQUERY` constant (zero bind
  parameters, positive `relationship_type IN (...)` list) instead of a byte-identical hand-copy of
  `(SELECT COUNT(*) FROM schools s WHERE s.area_key = a.area_key)`.
- Seed fixtures (`bangalore-mangalore-schools-seed.sql`, `kundapur-schools-seed.sql`) had
  `latitude`, `longitude`, and `area_key` removed from their `ON CONFLICT ... DO UPDATE SET` list
  (AC7), so a re-run can neither re-fire V80 nor overwrite a durable attribution correction.

**Verification performed, not just asserted:** the identity guard was deliberately neutered
(backfill `WHERE ... AND false`) and proven to `RAISE EXCEPTION` + fail all 9
`SchoolCoverageBackfillIT` tests (Flyway migration failure, non-zero exit), then restored and
re-proven to pass 9/9 (exit 0) — see the PR1 implementation summary for exact commands/output.
This is the load-bearing proof that PR1 is count-neutral by construction, not by claim.

Follow-up: #1829 (PR2) resolves the 13 ambiguous schools using `'reviewed_override'` rows; this is
where curated counts may legitimately move for the first time since #1737.

---

## 0. The question this report exists to answer

`schools.area_key` is a **single column answering two different questions**:

1. *Where is this school actually located?* (canonical locality — wants the finest truthful answer)
2. *Which curated Discover areas should surface and count this school?* (curated coverage — wants
   the coarse editorial area)

Today one string must satisfy both, so the two consumers are in direct conflict: making the
locality truthful (JP Nagar) mechanically removes the school from the curated area's count badge
(Jayanagar). This report establishes the facts needed to split those concepts.

---

## 1. Every reader and writer of `schools.area_key`

### 1.1 Writers — SQL only. There is **no Java writer.**

`School.setAreaKey` exists (`backend/src/main/java/com/example/realestate/school/School.java:110`)
but has **zero call sites** under `backend/src/main/java`. `schools.area_key` is written
exclusively by:

| Writer | Location | Behaviour |
|---|---|---|
| V79 backfill | `db/migration/V79__add_school_area_key.sql:17-48` | `WHERE ... s.area_key IS NULL` — only ever fills blanks; **never re-attributes**. |
| V80 trigger | `db/migration/V80__school_area_key_trigger.sql:6-74` | `BEFORE INSERT OR UPDATE OF latitude, longitude, district`. Nearest area centroid in the same normalised district, 10 km hard cap. |
| V109 correction | `db/migration/V109__correct_bengaluru_school_area_keys.sql` | Bare `area_key` write for 5 schools, keyed on `udise_code`. |

**Load-bearing consequence:** the V80 trigger does **not** fire on a bare `area_key` write (its `OF`
clause lists only lat/lon/district). This is what lets a corrective migration act as a durable
operator override — and it is the mechanism any new model must also respect.

### 1.2 Readers

| # | Consumer | Location | How it reads `area_key` |
|---|---|---|---|
| R1 | **`AreaSummaryService` — the count badge** | `discover/AreaSummaryService.java:172` (blended) and `:215` (type-filtered) | `(SELECT COUNT(*) FROM schools s WHERE s.area_key = a.area_key)` — **byte-identical in both SQL variants**; the property-type filter does *not* affect the school count. |
| R2 | Group-scoped school search (#1812) | `school/SchoolRepository.java:81-109` | `CASE WHEN s.area_key IN (:areaKeys) THEN true ELSE false END AS "inScope"`, and the same expression in `ORDER BY` — in-scope schools sort first. Selects `s.area_key AS "areaKey"`. |
| R3 | Popular-by-area | `school/SchoolRepository.java:303-322` | `WHERE s.area_key = :areaKey AND s.prominence_tier = 'notable'` |
| R4 | Schools-by-area | `school/SchoolRepository.java:340-363` | `WHERE s.area_key = :areaKey` (+ board/category filters) |
| R5 | API DTO | `school/SchoolResponse.java:28` | `String areaKey` — **a public JSON field** (see §4). |

### 1.3 Two things that look like readers but are not

- **`SchoolRepository.countByAreaKey`** (`SchoolRepository.java:284-285`) reads
  `SELECT COUNT(*) FROM **areas** WHERE area_key = :areaKey`. Despite the name it counts *areas*,
  not schools — it is an existence probe to distinguish 404 from empty-200. **Easy to misread
  during a data-model change.**
- **School *radius* search does not touch the `schools` table at all.**
  `PublicSchoolRadiusListingsService` receives `schoolLat`/`schoolLon`/`schoolRadiusKm` as
  caller-supplied primitives and queries only `property_listings`
  (`discover/PublicSchoolRadiusListingsService.java:43-51, 89-120`).
  `DiscoverListingPredicateBuilder.java:194` carries an explicit comment that `schools.geog` is not
  referenced. **Radius search is therefore already geometry-driven and is unaffected by this work.**

### 1.4 The contradiction already in the codebase

Two services disagree, today, on what "schools in this area" means:

- `AreaSummaryService` **counts** by FK string equality (`schools.area_key = areas.area_key`).
- `AreaOverviewService.querySchools` (`area/AreaOverviewService.java:352-371`) **lists** schools
  within **3 km of the area centroid** via PostGIS (`SCHOOL_RADIUS_KM = 3.0`, `:36-37`).

The areas-grid badge and the area-overview page can therefore already disagree for the same area,
by construction. **Proximity-based coverage is not a new concept being invented here — there is a
shipped 3 km precedent.**

---

## 2. Schema as it exists today

### 2.1 `schools`

Created `V58__create_schools_table.sql:4-20`; extended by V66, V67, V68, V69, V75, V76, V79.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK DEFAULT gen_random_uuid()` | **Unstable across environments** — the fixture regenerates it. Not a usable key for migrations. |
| `udise_code` | `VARCHAR(20)` NULL | Unique **only via a partial index**: `idx_schools_udise_code ... WHERE udise_code IS NOT NULL` (`V66:14-16`). **This is the stable key** and is what V109 keys on. |
| `area_key` | `TEXT NULL REFERENCES areas(area_key)` | FK, no `ON DELETE` rule (default RESTRICT). Index `idx_schools_area_key`. |
| `latitude`/`longitude` | `DOUBLE PRECISION NOT NULL` | Writing these **re-fires the V80 trigger**. |
| `district` | `VARCHAR(100)` | Free text. No FK, no CHECK. |
| `geog` | `geography(Point,4326)` `GENERATED ALWAYS ... STORED` | `V75:13-15`; GiST index `V76`. |

> **Constraint on any migration:** `udise_code` uniqueness is a *partial* index. A junction table
> cannot FK to it. Coverage must therefore key on `schools.id` (the real PK) and be **populated by
> looking up `udise_code`**, not by hardcoding UUIDs.

### 2.2 `areas` — and the critical gap

`V71__cities_and_areas.sql:21-32`. PK is `area_key TEXT` (format `IN|KA|<District>|<Name>`).
The only later ALTER is `V100` (adds `area_slug`).

**There is no column distinguishing curated-coarse areas from fine-grained localities.** No
`source`, `tier`, `level`, or `is_curated`. Both sets live in one flat table:

- **10 coarse Bengaluru areas**, seeded `V71:67-76`: Whitefield, Koramangala, Indiranagar, Hebbal,
  HSR Layout, Sarjapur Road, Yelahanka, Jayanagar, Marathahalli, Electronic City.
- **304 fine localities**, seeded `V106:43-366` (same insert shape, `ON CONFLICT DO NOTHING`).

Total 313 (after `V108` deletes the mis-geocoded `Mukkidipeta`). The only data-shape tell is
coordinate precision (V71 hand-rounded to 4 dp; V106 real exports at 7 dp) — **not** a schema
column.

**Design consequence:** a coverage table should FK to `areas(area_key)` generically rather than to
a "curated" subset, because no such subset is expressible in the schema today. This *removes* the
need to invent a discriminator column.

### 2.3 Area groups

`V77__area_groups_schema.sql:8-43` — `area_groups` (PK `id`, `UNIQUE (city_id, slug)`) and
`area_group_members` (`UNIQUE (area_group_id, area_key)`, FK → `areas.area_key`). V106 adds 11
Bangalore groups + 304 member rows, and ends with an invariant guard (`V106:729-747`) raising if
any bangalore `area_key` belongs to more than one group. Group-scoped school search resolves a
group to its member `area_keys` and passes them to R2.

---

## 3. Count semantics — what does the badge *mean* today?

Answering investigation item 10 directly. Today the badge means, strictly:

> **the number of schools whose single stored `area_key` string equals this area's key.**

It does *not* mean "physically inside the area" (there is no containment test anywhere in the
count path), nor "within a radius" (that is `AreaOverviewService`'s separate 3 km definition), nor
"editorially curated" (no such data exists). It is an artefact of *where the nearest centroid
happened to be at the moment the row was inserted* — which, for the Bengaluru schools, was against
the 10-area catalogue, before V106 existed.

This is why the count is fragile: it is not a measurement of anything, it is a frozen side-effect.

---

## 4. API and frontend impact

### 4.1 The DTO already exposes the raw key

`SchoolResponse` (`school/SchoolResponse.java`) is a record with component `String areaKey` (`:28`)
and `Boolean inScope` (`:29`). No `@JsonProperty`, no `@JsonNaming`, **no `@JsonInclude(NON_NULL)`**
— so `"areaKey": null` is emitted on every endpoint that does not populate it (asserted at
`SchoolControllerTest.java:265`).

Population is **inconsistent across endpoints** — a live trap:

| Endpoint | `areaKey` populated? |
|---|---|
| `GET /api/public/schools/{id}` | ✅ from `School.getAreaKey()` |
| `GET /api/public/schools/search` (both scoped + unscoped) | ✅ |
| `GET /api/public/schools/nearby` | ❌ hard-coded `null` |
| `GET /api/public/schools/by-area` | ❌ hard-coded `null` |
| `GET /api/public/schools/popular?areaKey=` | ❌ hard-coded `null` (`AreaSchoolProjection` doesn't select it) |

### 4.2 The frontend derives the displayed locality by pipe-splitting that key

`src/hooks/useSchoolSearch.ts:4-30` — `SchoolResult.areaKey?: string | null`. **There is no
`areaName`/locality field**; the label is always `key.split('|').pop()`.

- School breadcrumb: `src/components/discover/panels/SchoolJourneyPanels.tsx:1408-1409`
  `school?.areaKey?.split('|').pop() ?? urlState.areaKey?.split('|').pop()`.
- Map breadcrumb: `src/pages/MapDiscovery.tsx:3243-3252` via `areaKeyToLabel()`
  (`SchoolRadiusMapOverlay.tsx:40-43`).

**So `schools.area_key` is *already* the canonical-locality display field.** Keeping it as the
canonical concept preserves truthful display for free; the #1737 fix is what makes the breadcrumb
read "JP Nagar".

### 4.3 A coupling that is *not* display-only

`useDiscoverUrlState.setSchoolJourney` (`src/hooks/useDiscoverUrlState.ts:1122-1163`) resolves the
single URL `areaKey` that drives the **listings fetch**, with priority:

1. backend `school.areaKey`
2. first area whose bbox contains the school's lat/lon
3. omit + `console.warn` (listings do not fetch)

Canonical locality therefore steers *which area's listings load*, not just a label. Any change to
canonical granularity changes that target. (Post-#1737 this is already live for the 5 corrected
schools.)

### 4.4 Count consumer

`DiscoverArea.schoolCount` (`src/hooks/useDiscoverAreas.ts:4-25`, required `number`) from
`/api/discover/areas` is the **single source** of per-area school counts app-wide: map marker chip
(`AreaMarkerLayer.tsx:268-269`), zone label sums (`SchoolZoneLabelLayer.tsx:42-45`), zone/area
cards (`SchoolGroupAreasPanel.tsx:98-99, 159`), and the in-area summary stat
(`SchoolsInAreaPanel.tsx:268`).

Separately, `MapDiscovery.tsx:2775` filters landing-state markers by
`(a.listingCount ?? 0) > 0` — **listingCount, not schoolCount**. So a school-rich, listing-empty
area (e.g. JP Nagar) renders no landing marker regardless of this work. That is the pre-existing
#1588/#1607 gate, and it is **out of scope**.

---

## 5. Search-indexed / cached representation

**None.** `scripts/db/opensearch_rebuild.py` contains **zero** references to schools (verified by
full-text search over the file). Schools are Postgres-only. There is no OpenSearch mapping, no
reindex, and no parity obligation for this work — unlike #1461/#1541, this change has no search-index
surface at all.

---

## 6. Seed and import scripts

| Script | Loads schools? | Wired into a runnable path? |
|---|---|---|
| `scripts/db/fixtures/bangalore-mangalore-schools-seed.sql` | 32 rows (27 Bengaluru + Mangalore) | ✅ via `scripts/db/seed-bangalore-mangalore-schools.sh` (local) and a gated remote-dev wrapper. |
| `scripts/db/fixtures/kundapur-schools-seed.sql` | 5 rows | ✅ via `seed-kundapur-schools.sh` |
| `scripts/db/fixtures/discover-smoke-seed.sql:132-156` | 1 synthetic E2E school | ✅ via `restore-test-fixture.sh` → `run-real-data-smoke.sh` |
| `scripts/data/schools/output/karnataka_schools_seed.sql` | **31,781 rows** | ❌ **orphaned** — no script, CI job, or test loads it. |
| `scripts/prepare_schools_data.py` | generator of the above | ❌ orphaned |

**The re-run hazard, verbatim** (`bangalore-mangalore-schools-seed.sql:61-69`):

```sql
ON CONFLICT (udise_code) WHERE udise_code IS NOT NULL DO UPDATE SET
    ...
    latitude   = EXCLUDED.latitude,
    longitude  = EXCLUDED.longitude,
    ...
    area_key   = EXCLUDED.area_key;
```

Because `DO UPDATE` touches `latitude`/`longitude`, it **re-fires the V80 trigger**, which
re-derives `area_key` against the *current* (313-area) catalogue and overwrites the seeded literal.
This is precisely the naive path that produces the 32 → 6 collapse. The fixture's `area_key`
column is **inert on insert**. `discover-smoke-seed.sql` already demonstrates the safe pattern: a
*separate, bare* `UPDATE ... SET area_key = ...` that cannot fire the trigger.

---

## 7. Measured geography (the numbers that force a product decision)

Measured by `measure.py` in this directory, parsing the **real** V71 + V106 migrations and the real
fixture. No hardcoded area list; no fixture copied into a test.

**Self-validation of the method:** the historical coarse attribution is recovered by
nearest-centroid over *only* the 10 V71 areas. Cross-checked against the 27 schools PR #1827 did
not touch: **0 mismatches / 27**. (This re-derivation is necessary because PR #1827 *edited the
fixture*, so its `area_key` literal for the 5 corrected schools is now the corrected fine value,
not the historical coarse one — reading the fixture column naively understates the collapse.)

### 7.1 If canonical locality becomes the finest truthful answer, how much curated coverage survives at radius X?

| Radius | Schools retaining coarse coverage | Curated areas dropping to **zero** |
|---|---|---|
| 2000 m | 14 / 32 | Hebbal, Jayanagar, Yelahanka |
| 2500 m | 19 / 32 | Hebbal, Jayanagar |
| **3000 m** *(= the shipped `AreaOverviewService` radius)* | 21 / 32 | **Hebbal** |
| **3500 m** | 24 / 32 | **none** |
| 4000 m | 27 / 32 | none |
| 5000 m | 29 / 32 | none |
| 8000 m | 31 / 32 | none |
| 10000 m *(= the V79/V80 cap)* | 32 / 32 | none |

**3500 m is the smallest radius at which no curated area collapses.** That is exactly why it must
not be chosen by an engineer: picking the threshold *because* it is the one that saves the badges is
fabricating coverage to preserve counts — the thing the guardrails forbid. The threshold is a
product decision and is escalated, not resolved, by this report.

Note the tension the numbers expose: the codebase's own existing precedent (3 km, from
`AreaOverviewService`) **does** zero Hebbal. There is no threshold that is simultaneously
"consistent with existing product behaviour" and "preserves every badge."

### 7.2 Extremes worth eyeballing

| School | Historical coarse area | Distance to its centroid | Nearest of 313 | Distance |
|---|---|---|---|---|
| National Public School, Banashankari | Jayanagar | **7693 m** | Subramanyapura | 502 m |
| Narayana eTechno — KR Puram | Marathahalli | **5193 m** | Hoodi | 496 m |
| RMS International School | Jayanagar | 4753 m | Konanakunte | 1154 m |
| Narayana eTechno — Kaggadasapura *(V109)* | Kaggadasapura | 371 m | Kaggadasapura | 371 m |

A school 7.7 km from the Jayanagar centroid, sitting 502 m from Subramanyapura, is currently
**counted as a Jayanagar school**. Any rule generous enough to keep it there is not a proximity
rule; it is the absence of one.

---

## 8. Is #1830 independent? — **Yes.**

Evidence-based, not assumed:

- #1830's entire surface is the district-normalisation `CASE` inside V79/V80
  (`V79:24-31`, `V80:21, 33`), which maps only
  `'bengaluru urban' | 'bangalore urban' | 'bangalore' → 'bengaluru'` and therefore misses the
  UDISE spellings `BENGALURU U SOUTH` / `U NORTH` / `RURAL`.
- The canonical-locality concept in this work **is** `schools.area_key`, which the V80 trigger
  already populates with the *finest* available area (it has always taken the nearest centroid over
  whatever catalogue exists). **This work does not need to modify the trigger function.**
- Therefore #1828 and #1830 share **no file**. Both add a new migration, so they collide only on
  version numbering (a trivial rebase), not on logic.
- Confirmed non-urgent: the only seed carrying the unnormalised spellings
  (`karnataka_schools_seed.sql`) is loaded by **no script in the repo** (§6).

**One genuine interaction to record (not a blocker):** if #1830 ever backfills `area_key` for
previously-NULL rows, or the 31,781-row seed is loaded, the new coverage table must gain rows for
those schools. Coverage maintenance must therefore be defined as a repeatable/convergent operation
rather than a one-shot backfill. That is a property #1828 should have anyway.

**Recommendation: #1830 may proceed in parallel, in its own PR. It must not be folded into the
attribution work.**

---

## 9. Open decisions escalated to PRODUCT_DECISION_REVIEW

These are **not** engineering choices and are deliberately left unresolved here:

1. **Does proximity-based (`nearby`) coverage contribute to the curated count badge at all?**
2. **If yes, what radius?** §7.1 shows the outcome is highly threshold-sensitive and that the only
   badge-preserving value (3500 m) is *not* the value with existing precedent (3000 m).
3. **Is a school 7.7 km from Jayanagar's centroid legitimately "a Jayanagar school"?** If the honest
   answer is no, then some curated counts *should* fall, and the correct outcome is a lower count —
   not a wider radius.
