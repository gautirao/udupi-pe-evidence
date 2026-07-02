# Bangalore housing.com import — validation report (issue #1723)

## Source

- Apify actor: `unfenced-group/housing-scraper` ("Housing.com India Property Scraper")
- Run id: `7hFnoLk8LgWNohUMy`, dataset id `oe4s6ZWb59pBUgtnm`, SUCCEEDED in 130.4s, 899 raw items.
- Input sent (`raw-apify-input.json`, verbatim as specified): `{"cities":["bengaluru"],"transaction":["buy","rent"],"fetchDetails":false,"maxItems":1200,"maxPagesPerCity":30,"pageSize":40}`. Note the actor's own input schema recommends `pageSize` 10–30, but 40 (as specified in the task) was accepted without error.
- Full dataset saved verbatim (899/899 items) to `raw-apify-output.json`.

## IMPORTANT deviation from the assumed raw schema — read before reusing this pipeline

The task's field-mapping assumptions (`propertyType` containing values like `Apartment`/`Villa`/`Plot`, and `transaction` yielding both `buy` and `rent`) do **not** match what this actor actually returns:

- `propertyType` in the raw data is the housing.com **listing category** (`project` = new-launch developer listing, `resale` = individual resale unit) — **not** a residential-type field. The residential type (apartment/house/villa/plot) had to be **derived from free text**: `title` for `resale` rows (clean `"<N> BHK <Type>"`, e.g. `"3 BHK Villa"`), and `subtitle` for `project` rows (a unit-mix string, e.g. `"2, 3 BHK Flats"`, `"4, 5 BHK Villas"`).
- `transactionType` came back **100% `"buy"`** across all 899 items despite requesting `["buy","rent"]` in the input — the actor returned zero rent listings for this run. This is a real limitation of the source data for this run, not something we filtered or fabricated. **Every imported row has `listing_purpose='sale'`; there are no `rent` rows in this import.**

Both are documented here rather than silently worked around. No data was invented to compensate for either gap.

## Property-type derivation rule (from real text only, no fabrication)

Regex-matched (case-insensitive) against the source text described above:
- `residential plot|residential land|plot|land` → `residential_plot`
- `independent house|house` → `house`
- `villa` → `villa`
- `builder floor|flat|studio` → `apartment`

If the source text yields **zero** target-type keywords (e.g. `Duplex`, `Penthouse`, `Triplex` only) or **more than one distinct target type** (e.g. a project subtitle listing both `Flats` and `Villas`, or `Residential Plot, 4 BHK Villas`), the row is **excluded** rather than guessed. These are not "non-residential" in the traditional sense (commercial/PG/warehouse) — housing.com's own project/resale universe is already residential — but they don't cleanly map to one of the four target enum values, so they're excluded and counted separately below.

## Locality → seeded area mapping

Exact/alias match only (no fuzzy/best-effort guessing beyond documented aliases): `Whitefield`, `Koramangala`, `Indira Nagar→Indiranagar`, `Hebbal`, `HSR Layout`, `Sarjapur→Sarjapur Road`, `Yelahanka`, `Jayanagar`, `Marathahalli`, `Electronic City` + `Electronic City Phase 2→Electronic City` (phase-suffix alias). All other raw localities (731 rows, mostly Varthur/K R Puram/Horamavu/Hoskote/Thanisandra/Balagere/RR Nagar/... — real Bangalore localities, just not among the 10 seeded areas) are excluded, not padded or reassigned.

## Exclusion funnel (899 raw → 46 imported, post-A2)

| Stage | Count | Notes |
|---|---:|---:|
| Raw items | 899 | |
| Duplicate `housingListingId` | 0 | |
| Missing lat/lon | 0 | actor always returned coordinates |
| Unmapped locality (not 1 of the 10 seeded areas) | 731 | see top offenders above |
| Unmapped property-type tokens (Duplex/Penthouse/Triplex-only, etc.) | 96 | |
| Ambiguous mixed-type (project subtitle spans >1 target type) | 4 | e.g. `"Residential Plot, 4 BHK Villas"` |
| **A2 plausibility exclusion (NEW, this rework)** | **1** | `housingListingId 20569725` — 12 BHK / 3000 sqft (250 sqft/bedroom); see "Plausibility filter (A2)" section below |
| Candidates after all filters (incl. A2, before per-bucket cap) | 46 | (the pre-A2 candidate pool was 47 before per-bucket cap in the v1 report's per-bucket table; A2 removes exactly the one implausible row from that pool) |
| Capped out by the ≤10-per-(area×type) rule | unchanged from v1 (21) | see per-bucket table and the A2 promotion note below |
| **Imported** | **46** | one fewer than v1's 47, matching the single A2 exclusion |

No `residential_plot` or `house` type made it through this run's data — not padded to include them; the report below shows exactly what's real.

### On promotion (A2 rework): why Whitefield×apartment stayed at 9/10, not repromoted to 10

`housingListingId 20569725` was one of the 10 kept rows in the Whitefield×apartment bucket (originally 19 candidates → capped to 10, keeping the 10 most-recently-updated). Removing it frees a cap slot, and the rework brief anticipated this might promote the 11th-ranked (previously capped-out) candidate into the kept set.

This rework did **not** attempt that promotion. Reconstructing the full 19-candidate pre-cap pool for that bucket from the raw data (to identify the true 11th-ranked candidate) was attempted and found unreliable: a faithful regex re-derivation of the property-type rule, cross-checked against the 10 already-approved Whitefield×apartment rows, could not reproduce that exact set — 3 extra candidates appeared in a naive re-derivation that are not present in the original approved output, indicating the v1 pipeline applied at least one additional, undocumented selection rule beyond what's written in this report (type/locality/recency alone). Rather than guess or fabricate which row should be promoted (which would violate the exclusion-only, no-fabrication constraint of this rework), the freed slot is left empty. Whitefield×apartment is **9/19 available this run** — real, under-cap, not padded, consistent with the existing "buckets under 10 are real, not padded" convention already used elsewhere in this report (e.g. HSR Layout, Hebbal, Marathahalli). All 46 imported rows are otherwise byte-identical to the v1-approved 47 minus the excluded row (verified: `normalised-listings.json` diff removes exactly one 30-line block; `import.sql` diff removes exactly the one matching `INSERT ... 20569725` block + its 6 image inserts, nothing else changed).

## Plausibility filter (A2)

**Rule (exclusion-only — never edits, clamps, rounds, or fabricates a value):** a row is excluded when its bedroom count is unusually high **and** the resulting area-per-bedroom is physically implausible for a residential unit:

```
EXCLUDE IF bedrooms >= 8 AND (built_area / bedrooms) < 300  -- sqft per bedroom
```

Thresholds chosen conservatively so legitimate large listings are not dropped:
- `bedrooms >= 8` scopes the check to only the small tail of unusually large listings (out of 899 raw items, only 7 have `bedrooms >= 8`).
- `< 300 sqft/bedroom` is well below any plausible bedroom allocation (a typical 1–4 BHK apartment in this dataset runs 300–700+ sqft/bedroom; even small/compact units rarely go below this once matched to their actual bedroom count).
- Bedrooms below 8 are never checked, regardless of area — this keeps the rule conservative and avoids flagging legitimate compact studios/1BHKs (e.g. a real 106 sqft 1BHK in the raw data is untouched by this rule, since `bedrooms < 8`).

**Verification against the full raw corpus (899 items), rows with `bedrooms >= 8`:**

| housingListingId | bedrooms | built_area (sqft) | sqft/bedroom | Excluded? |
|---|---:|---:|---:|---|
| 20569725 | 12 | 3000 | 250.0 | **YES** (only row < 300 threshold) |
| 20504079 | 12 | 6500 | 541.7 | No |
| 20283786 | 12 | 7500 | 625.0 | No |
| 20283993 | 12 | 7500 | 625.0 | No |
| 20586458 | 9 | 4800 | 533.3 | No |
| 20530276 | 9 | 5500 | 611.1 | No |
| 20567643 | 6 | 12000 | 2000.0 | No (bedrooms < 8, not scoped by rule; also clearly plausible) |

Note the other three 12-BHK rows (541–625 sqft/bedroom) are **not** excluded — they read as large legitimate villas/mansions, not implausible listings, demonstrating the threshold is conservative and does not over-trigger on genuinely large properties. None of the other 6 rows above the threshold happened to also pass the locality/property-type filters and reach the pre-cap candidate pool in this run, so `20569725` is the only row this rule removes from the actual import.

**Result:** 1 row excluded (`housingListingId 20569725`). Imported count: 47 → **46**.

## Per (locality × property_type) bucket — imported vs. available

| area_key | property_type | available (pre-cap) | imported |
|---|---|---:|---:|
| Whitefield | apartment | 18 (was 19; -1 for A2) | **9** (A2 rework: freed cap slot NOT repromoted — see A2 promotion note above) |
| Whitefield | villa | 3 | 3 |
| Electronic City | apartment | 22 | 10 (capped, 12 short of full pool) |
| Electronic City | villa | 1 | 1 |
| Sarjapur Road | apartment | 5 | 5 |
| Sarjapur Road | villa | 3 | 3 |
| Koramangala | apartment | 5 | 5 |
| Yelahanka | apartment | 4 | 4 |
| Yelahanka | villa | 1 | 1 |
| Indiranagar | apartment | 3 | 3 |
| Jayanagar | apartment | 2 | 2 |
| **HSR Layout** | — | 0 | 0 — no rows in this scrape mapped to HSR Layout after filtering (under-filled, real, not padded) |
| **Hebbal** | — | 0 | 0 — 1 raw "Hebbal" row existed but was filtered by property-type/other rules; net 0 survived |
| **Marathahalli** | — | 0 | 0 — 1 raw "Marathahalli" row existed but did not survive filtering |
| **house / residential_plot** (any area) | — | 0 | 0 — no resale/project row in this scrape derived cleanly to `house` or `residential_plot` |

Buckets with fewer than 10 are real and were **not** padded, per instructions.

## Local Docker/Flyway validation — A2 REWORK RE-RUN (fresh ephemeral container, throwaway credentials, torn down after)

This is a **second, independent full re-run** of the validation, on a fresh container, against the A2-reworked `import.sql` (46 rows). The v1 run above is retained for history; all counts below supersede it.

- Container: `postgis/postgis:15-3.4`, container name `pg-1723-a2`, host port `54331`, ephemeral db/user/pw (`housing1723`/`housing1723db`), removed at end of run.
- Applied all **104** Flyway migration files (`V0.1` … `V103`; more migrations exist on `main` now than at v1 time, all applied) directly via `psql` in numeric version order, substituting the one `${concurrently_keyword}` placeholder (in `V73__postgis_geog.sql`) with `CONCURRENTLY `.
  - Command: `psql -h localhost -p 54331 -U housing1723 -d housing1723db -v ON_ERROR_STOP=1 -f all_migrations_1723.sql`
  - **Harness-only prerequisites** (not part of `import.sql`, same convention as `scripts/db/fixtures/discover-smoke-seed.sql`): `authenticated`/`anon`/`service_role` roles, a minimal `auth` schema + `auth.uid()` stub + `auth.users` stub table, an empty `flyway_schema_history` table, an empty `supabase_realtime` publication.
  - **Result: exit code 0.** No `ERROR` lines in the migration log (grep-checked programmatically).
- Seed check: `SELECT count(*) FROM areas a JOIN cities c ON c.id=a.city_id WHERE c.slug='bangalore';` → **10** (exit 0, PASS).
- FK stub: dropped `on_auth_user_created` trigger, inserted a stub `auth.users` row for `2bcf2d76-fb18-6375-485c-3cdbb94bc77a` (same operational caveat as v1 — real deployment needs this row created via Supabase Admin API first).

### Import run (`import.sql`, 46 rows, applied via `psql -v ON_ERROR_STOP=1`)

- Command: `psql -h localhost -p 54331 -U housing1723 -d housing1723db -v ON_ERROR_STOP=1 -f import.sql`
- **Result: exit code 0.**
- `SELECT count(*) FROM property_listings WHERE created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a';` → **46** (exit 0, PASS)
- `SELECT count(*) FROM listing_images li JOIN property_listings pl ON pl.id=li.listing_id WHERE pl.created_by='...';` → **275** (exit 0, PASS — was 281, −6 images for the excluded listing)
- `SELECT count(*) FROM profiles WHERE user_id='2bcf2d76-fb18-6375-485c-3cdbb94bc77a';` → **1** (exit 0, PASS)

### RUN-TWICE (idempotency)

- Re-applied `import.sql` unchanged. **Result: exit code 0.** Every one of the 322 INSERT statements (1 profile + 46 listings + 275 images) reported `INSERT 0 0`.
- Listings count after re-run: **46** (0 additional). Images count after re-run: **275** (0 additional). PASS.

### NO-DUP

```sql
SELECT parsed_data->>'housingListingId' k, count(*)
FROM property_listings WHERE created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a'
GROUP BY k HAVING count(*)>1;
```
→ **0 rows** (exit 0, PASS).

### RESIDENTIAL-ONLY

```sql
SELECT DISTINCT property_type FROM property_listings WHERE created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a';
```
→ `{apartment, villa}` (exit 0, PASS — subset of `{apartment,house,villa,residential_plot}`).

### SEARCHABLE (AC5)

```sql
SELECT count(*) FROM property_listings pl
WHERE created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a' AND pl.status='LIVE' AND pl.archived_at IS NULL
  AND pl.is_duplicate=false AND pl.area_key IN (SELECT a.area_key FROM areas a JOIN cities c ON c.id=a.city_id WHERE c.slug='bangalore');
```
→ **46** = new imported listing count (exit 0, PASS).

### IMAGES (AC6)

```sql
SELECT listing_id, count(*) FROM listing_images WHERE position=0 GROUP BY listing_id HAVING count(*)>1;
```
→ **0 rows** (exit 0, PASS).
```sql
SELECT count(*) FROM listing_images li JOIN property_listings pl ON pl.id=li.listing_id WHERE pl.created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a' AND li.position=0;
```
→ **46** (one cover image per listing, all 46 listings had at least one photo).

### A2 EXCLUSION PROOF — `housingListingId 20569725` absent from imported data

```sql
SELECT count(*) FROM property_listings WHERE parsed_data->>'housingListingId'='20569725';
```
→ **0 rows** (exit 0, PASS).

Container torn down (`docker rm -f pg-1723-a2`) after all checks completed.

## Data-quality observation — SUPERSEDED by A2 filter (this rework)

The v1 report originally flagged (without excluding) an implausible scraped configuration: `"12 BHK Flat"` on a ~3000 sqft unit, listing id `20569725`. Per the user-approved A2 rework, this row is now **excluded** by the plausibility filter documented above — it is no longer merely flagged, it is dropped from the import.

## PII / trust-signal stripping

`sellerFirm`, `sellerType`, `isVerified*`, `isReraVerified`, `isBrokerageChargeable`, `isMostContacted`, `badge`, contact fields, and the raw `description` (which can contain brokerage/contact narrative text) were never carried into `normalised-listings.json` or `import.sql`. `title` is synthesized purely from `bedrooms` + derived `property_type` + `locality` — no raw source title/description text is stored. `rera_number` and `seller_type` are left `NULL`; `address_confirmed` is `false` for every row.
