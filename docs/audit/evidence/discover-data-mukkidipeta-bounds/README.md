# #1819 — Mukkidipeta mis-geocoded outlier poisoning "North Bangalore Emerging" bounds

## Source-row confirmation (pre-fix)

`backend/src/main/resources/db/migration/V106__seed_bangalore_macro_region_mapping.sql` (already-applied,
immutable migration):

- **Line 276** — `areas` seed row for `IN|KA|Bengaluru|Mukkidipeta`, all six geo columns
  (`geo_center_lat/lon`, `min_lat/min_lon`, `max_lat/max_lon`) = `13.826627` / `77.490273`. This is a
  village near the Gauribidanur / Andhra Pradesh border, ~55km north of Bengaluru — not a Bengaluru
  urban locality.
- **Line 568** — `area_group_members` row: `('north-emerging', 'IN|KA|Bengaluru|Mukkidipeta', 42)` — the
  42nd of 49 members of the "north-emerging" (North Bangalore Emerging) Bengaluru area group.
- **Line 397** — `area_groups` seed row for `north-emerging`:
  `('north-emerging', 'North Bangalore Emerging', ..., 12.980578, 77.490273, 13.826627, 77.724281)`
  i.e. stored `max_lat = 13.826627` and `min_lon = 77.490273` — exactly Mukkidipeta's coordinates,
  confirming it is the sole source of both extremes.

The Discover map frames macro-region selections by unioning **member area** bounding boxes at render
time (`src/utils/discoverGroupBounds.ts` `computeGroupBounds()`), not by reading the stored
`area_groups` bounds column (`src/hooks/useAreaGroups.ts` drops it) — so the fix must remove
Mukkidipeta's *membership*, not just correct the stored bounds column.

## Fix

New migration `backend/src/main/resources/db/migration/V108__fix_mukkidipeta_north_emerging_bounds.sql`
(V106 is an already-applied migration and immutable; V108 is the next free version after V107):

1. **DELETE** Mukkidipeta's `north-emerging` membership row (WHERE-scoped to city slug `bangalore` +
   group slug `north-emerging` + the exact area_key), mirroring V106's own overlap-repair DELETE
   pattern.
2. **UPDATE** the `north-emerging` group's stored `min_lat/min_lon/max_lat/max_lon` to the MIN/MAX
   aggregate over its **remaining** members (a correlated subquery scoped to city `bangalore` + group
   `north-emerging`). `focus_lat`/`focus_lon` are intentionally left untouched.
3. **Guarded DELETE** of the now-orphaned `areas` row for Mukkidipeta, gated by three `NOT EXISTS`
   guards (`area_group_members`, `property_listings`, `schools`) — see FK rationale below.

### REMOVE, not CORRECT — rationale

Mukkidipeta has no reliable Bengaluru coordinate available (it is a genuinely different, distant
locality near the AP border, not a mis-typed digit of a real Bengaluru place). Per the fix-decision
constraint (correct coordinates only if a reliable Bengaluru coordinate exists, otherwise
remove/exclude), removing it from the group (and, guarded, from `areas`) is the smallest safe correct
fix — there is no coordinate to "correct" it to.

### Guard rationale (schools FK)

- `property_listings.area_key` is a plain `TEXT` column with **no FK** to `areas` (V6) — cannot block a
  delete, but is still guarded defensively.
- `schools.area_key` **is** a FK: `TEXT NULL REFERENCES areas(area_key)` with **no `ON DELETE` rule**
  (default `RESTRICT`, V79). A referencing school row would otherwise block (error out) a delete of the
  `areas` row for Mukkidipeta. Guarded via `NOT EXISTS (SELECT 1 FROM public.schools s WHERE
  s.area_key = a.area_key)`.
- `area_group_members.area_key` also FKs to `areas` (V77) — guarded first by construction (step 1 removes
  the only membership row before step 3 runs), and defensively re-guarded via `NOT EXISTS` in step 3.
- Repo-wide search confirms Mukkidipeta is referenced **only** in V106 (the areas seed row + the
  north-emerging membership row) — no listing, school, or other seed/migration/test fixture references
  it. All three guards are satisfied and step 3 deletes cleanly in this environment; if a production
  reference ever existed, the guard safely no-ops and steps 1–2 alone still fix the visible map bug.

## Before / after — `north-emerging` stored bounds

| | min_lat | min_lon | max_lat | max_lon |
|---|---|---|---|---|
| **Before** (V106 seed) | 12.980578 | 77.490273 (Mukkidipeta) | **13.826627** (Mukkidipeta) | 77.724281 |
| **After** (V108, empirically confirmed) | 12.980578 (unchanged) | 77.4995979 (Abbigere) | **13.311576** (Kodalagurki) | 77.724281 (unchanged) |

`max_lat` drops from Mukkidipeta's 13.826627 to Kodalagurki's 13.311576 — the next-highest legitimate
north-emerging member, ~0.5 deg (~55km) closer to real North Bangalore. `min_lon` shifts negligibly
(Mukkidipeta's 77.490273 → Abbigere's 77.4995979, both ~77.49). `min_lat`/`max_lon` are unaffected
(unrelated members already held those extremes).

## Regression protection

New IT `backend/src/test/java/com/example/realestate/discover/AreaGroupBengaluruBoundsEnvelopeIT.java`
runs the full Flyway migration chain (through V108) against a real `postgis/postgis:15-3.4` container
(Testcontainers) and asserts:

1. **`everyBengaluruAreaGroupMember_liesWithinPlausibleEnvelope`** — every bangalore `area_group`
   member area's bbox corners (`min_lat/max_lat/min_lon/max_lon`) and center
   (`geo_center_lat/geo_center_lon`) lie within a plausible Bengaluru coordinate envelope
   (lat `[12.5, 13.4]`, lon `[77.15, 78.0]`). This directly encodes the bug condition — Mukkidipeta's
   13.826627 lat violates the upper bound, so this assertion fails pre-fix (`Mukkidipeta` still a
   member) and passes post-fix with zero violators.
2. **`northEmergingBounds_areCorrectedAfterMukkidipetaRemoval`** — the `north-emerging` group's own
   stored `max_lat` is `<= 13.4` and specifically `≈ 13.311576` (Kodalagurki), and no
   `area_group_members` row for Mukkidipeta remains under bangalore.
3. **`airportBeltAndThanisandraHennurBelt_memberCountsAreUnchanged`** — `airport-belt` (6 members) and
   `thanisandra-hennur-belt` (29 members) member counts are unchanged from their V106 seed, proving the
   fix is scoped to `north-emerging` only.
4. **`reRunningV108_isANoOpAndDoesNotError`** (AC4) — re-executes the V108 SQL script a second time
   against the already-migrated DB (via `ScriptUtils.executeSqlScript`) and asserts no error is thrown
   and the `north-emerging` bounds are unchanged — proving the migration is idempotent / safe to re-run.

Envelope bounds and the tightest legitimate extents on record are documented as named constants in the
test with citations (Kodalagurki 13.311576, Virupakshipura 12.579089 / 77.230649, Malur 77.940854) — see
`.claude/handoffs/issue-1819/approved-plan.toml` `[envelope_verification]` for the full source
enumeration this was grounded in.

## Test run (see `it-run-output.txt` in this directory)

```
mvn -f backend/pom.xml test -Dtest=AreaGroupBengaluruBoundsEnvelopeIT -DfailIfNoTests=true
```

Result: **`Tests run: 4, Failures: 0, Errors: 0, Skipped: 0`** — real `postgis/postgis:15-3.4`
Testcontainers Postgres, full Flyway chain (111 migrations) applied and validated
("Successfully validated 111 migrations" / "Successfully applied 111 migrations ... now at version
v108").

No-regression spot check: `AreaSummaryServiceAgriIT` (pre-existing, unrelated agri-count IT sharing the
same Testcontainers harness) re-run and still passes — confirms V108 does not disturb the Flyway chain
for other tests.

## Flyway validate

A standalone `flyway:validate` CLI run against a live database was not practical — the backend's real
database is a remote cloud Supabase requiring explicit interactive user auth (no `DATABASE_URL` was
available in this environment), consistent with the plan's documented environment constraint. Flyway
validation was instead exercised as part of every Testcontainers-backed Spring context startup above:
each run logs `"Successfully validated 111 migrations"` followed by
`"Successfully applied 111 migrations to schema 'public', now at version v108"` — i.e. Flyway's own
validate step ran and passed against a real Postgres instance as a side effect of the IT runs.

## Scope confirmation

`git diff --stat` against
`backend/src/main/resources/db/migration/V106__seed_bangalore_macro_region_mapping.sql` is empty — V106
is byte-identical / untouched. Only three new files were added, all within the approved boundary:

- `backend/src/main/resources/db/migration/V108__fix_mukkidipeta_north_emerging_bounds.sql`
- `backend/src/test/java/com/example/realestate/discover/AreaGroupBengaluruBoundsEnvelopeIT.java`
- `docs/audit/evidence/discover-data-mukkidipeta-bounds/` (this directory)

No frontend files, `.env`/secrets, or any other migration were touched.
