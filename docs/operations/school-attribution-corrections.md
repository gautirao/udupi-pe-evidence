# Operating rule — correcting school coordinates or canonical locality

**Status:** binding operating rule. Introduced with #1828 / #1829.

## The rule

> Future corrections to a school's **coordinates** (`latitude`/`longitude`) or its **canonical
> locality** (`schools.area_key`) MUST be delivered through a **reviewed Flyway migration** (or a
> dedicated, reviewed correction workflow).
>
> They MUST NOT be delivered by editing and re-running the seed fixtures under
> `scripts/db/fixtures/`.

This applies to `bangalore-mangalore-schools-seed.sql`, `kundapur-schools-seed.sql`, and any future
school fixture.

## Why

The fixtures are **first-load seeds, not a source of truth for existing rows.** Two independent
mechanisms make re-running them unsafe as a correction channel:

1. **The fixture's `area_key` column is inert on insert.** The V80 trigger
   (`BEFORE INSERT OR UPDATE OF latitude, longitude, district`) overwrites whatever the fixture
   supplies, assigning the nearest area centroid from the catalogue *as it exists at that moment*.
   The DB row — not the fixture literal — is the source of truth.

2. **Re-running the seed used to silently re-derive attribution.** The fixtures' original
   `ON CONFLICT ... DO UPDATE` wrote `latitude`/`longitude`, which re-fired the V80 trigger against
   the *expanded* 313-locality catalogue. This was measured to move 26 of 32 Bengaluru schools and
   collapse curated school counts from **32 to 6**, dropping six curated areas to zero.

**As of #1828 the fixtures no longer write `latitude`, `longitude`, or `area_key` in their
`ON CONFLICT ... DO UPDATE` set**, so a re-run is now attribution-neutral in both directions: it can
neither re-fire V80 nor overwrite a durable operator correction.

That hardening is what makes re-running the seed *safe*. It is also what makes it **ineffective as a
correction channel** — and that is the trap this rule exists to prevent:

> A developer who updates a coordinate in a fixture file and re-runs the seed will see **no change**
> to an existing database row, and may wrongly conclude the correction was applied.

## What to do instead

Deliver the correction as a migration, following the pattern of
`V109__correct_bengaluru_school_area_keys.sql`:

- **Key on `udise_code`**, never on `id` (`id` is `gen_random_uuid()` and is unstable across
  environments) — and never hardcode a UUID.
- Write **only** the column being corrected. A bare `area_key` write does **not** fire the V80
  trigger, so the correction lands as a durable operator override rather than being recomputed away.
- Make it **idempotent and convergent**: `WHERE udise_code = ? AND area_key IS DISTINCT FROM ?`
  reaches the correct end state from either the pre-fix or already-fixed state, and is a no-op on
  re-run.
- **Never** re-derive `schools.area_key` wholesale against the full catalogue. That path is the
  measured 32 → 6 collapse and is forbidden.
- Correcting `latitude`/`longitude` **will** re-fire V80 (by design) and therefore re-derive
  `area_key`, which in turn fires the #1828 coverage trigger. That is legitimate for a genuine
  geocoding fix, but it is a **behavioural change** and must be reviewed as one — state the expected
  before/after attribution in the PR.

## V110 is IMMUTABLE (product ruling)

**`V110__school_discover_area_coverage.sql` has been applied to the shared dev database. It must
never be edited.**

Any change to the coverage model — the table, its constraints, the `relationship_type` / `source`
vocabularies, the indexes, or the `sync_school_discover_area_coverage()` trigger — **must ship as a
new forward Flyway migration.**

Editing V110 in place would change its checksum and break Flyway validation on every environment that
has already applied it, starting with shared dev (backend startup would fail outright).

This is why, for example, the missing containment-specific `source` value was **not** fixed by
amending V110's CHECK constraint: it would have to be a new migration, and it did not justify one.
The same rule applies to V111 and V112 the moment they are applied anywhere.

## Retiring a curated area — read this first (changed by #1829)

`school_discover_area_coverage.curated_area_key` is `REFERENCES areas(area_key) ON DELETE RESTRICT`.

V110's own comment claimed this could never fire in practice, reasoning that "a pure mirror means any
area with coverage rows necessarily has a school pointing at it via `schools.area_key`, so V108's
existing area-delete guard already blocks the delete first."

**#1829 falsified that.** Coverage is no longer a mirror. An area can now hold a `contained` coverage
row while **no** school has `area_key` pointing at it — Indiranagar is exactly this case (Poornaprajna's
canonical locality is New Tippasandra; it counts toward Indiranagar only via `contained` coverage).

Consequence for a future area-retire migration written in the V108 style:

- V108's guard `NOT EXISTS (SELECT 1 FROM schools s WHERE s.area_key = a.area_key)` **passes**,
- the `DELETE FROM areas` then trips the coverage FK and fails with a raw foreign-key violation.

This **fails closed** — no wrong counts, no data loss — but the error is opaque. Any migration or
runbook that retires a curated area must **also** guard on (or explicitly clean up)
`school_discover_area_coverage`, not just `schools.area_key`.

## Related

- Canonical locality vs curated coverage: `docs/audit/evidence/issue-1828-school-attribution-model/`
- The 13 ambiguous rulings: `docs/audit/evidence/issue-1829-thirteen-ambiguous-schools/`
- The original attribution audit: `docs/audit/evidence/issue-1737-school-area-attribution/`
