# Flyway slot claims

Append-only. Before opening any migration PR, open a small PR that claims the slot here first. The migration PR must reference this claim in its description.

Current ceiling (as of 2026-04-23): **V70** (`V70__add_area_overview_stats.sql`).

## Claims

| Slot | Claimed by | Date | Purpose | PR |
|---|---|---|---|---|
| V71 | Lane B (B-0, #799) | _pending_ | `cities` + `areas` base tables **with initial seed INSERTs** in one migration (schema + seed combined — see "Seed loading decision" below) | _pending_ |
| V72 | Lane B (B-2) | _pending_ | `area_overview_stats` + `bbox` + `city_slug` + `geo_center_lat/lon` columns (follow-up; only if still needed after B-0) | _pending_ |
| V73 | Lane D (D-2) | _pending_ | PostGIS extension + `geog` GENERATED column + GIST index | _pending_ |

## Seed loading decision (B-0)

**Chosen path:** seed data ships **inside the V71 migration** alongside the schema DDL — single file `V71__cities_and_areas.sql` containing `CREATE TABLE cities`, `CREATE TABLE areas`, and `INSERT INTO cities`/`INSERT INTO areas` statements produced from #800's researcher dataset. INSERTs use `ON CONFLICT (slug|area_key) DO NOTHING` for idempotency.

**Not chosen (rejected):**
- Separate `V71__schema.sql` + `V72__seed.sql`: would shift B-2 to V73 and D-2 to V74, increasing coordination surface area.
- `V71__schema.sql` + `R__cities_and_areas_seed.sql` (repeatable): adds Flyway-prefix complexity without a concrete need — future city additions can land as regular versioned migrations.

**Implication:** #799 (B-0) cannot open its migration PR until #800 has delivered the seed dataset. B-0 is blocked on #800.

## Rules

1. Claim a slot by appending a row and merging this file. Only after merge is the slot yours.
2. If two PRs try to claim the same slot, the second one rebases to the next free slot.
3. Do **not** skip slots. V71 must merge before V72 is claimed; V72 before V73.
4. An unclaimed slot does not exist. Sprint-unrelated migrations must follow this file too.
5. Claim PRs must **edit** the `_pending_` cell of the target row — never append a new row for a pre-seeded slot. If two lanes target the same slot, git will produce a hard merge conflict and force serialization.
