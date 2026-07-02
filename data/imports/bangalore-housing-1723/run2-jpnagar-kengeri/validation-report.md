# Bangalore housing.com import — RUN 2 validation report (issue #1723, JP Nagar + Kengeri houses)

Follow-up to the run-1 import (`../import.sql`, `../validation-report.md`). This run adds real houses for
JP Nagar and Kengeri, and the `public.areas` seed rows required to make them discoverable. Target: PR #1725
(add to it; do not commit/push/PR here per `on_complete`).

## 1. Housing.com area identifiers (discovered from real scraped data)

- **JP Nagar** — `localityUuid = 8ed8d5bf353b04db43c7` (canonical locality string "JP Nagar"; 11/12 sampled
  listings in this locality carried this UUID).
- **Kengeri** — `localityUuid = 542902d6718832d09bb7` (canonical locality string "Kengeri").

(See `discovery-evidence.md` section 1 for the derivation method — scanning real listings whose `locality`
field matched the target string and reading their Housing-assigned `localityUuid`.)

## 2. Bounding boxes / centroid (OSM Nominatim — real, source-attributed)

- **JP Nagar** — OSM `relation 17205864` (class=boundary/administrative). display_name "JP Nagar, Bengaluru
  South City Corporation, …". Nominatim-reported centroid **12.9096941, 77.5866067** (used verbatim as
  `geo_center_lat/lon`). bbox (S,N,W,E) = **12.8975486, 12.9175497, 77.5730508, 77.6018204**.
  Source: `https://nominatim.openstreetmap.org/search?q=JP+Nagar,+Bengaluru,+Karnataka,+India&format=jsonv2`
- **Kengeri** — OSM `relation 19883453` (class=boundary/administrative). display_name "Kengeri, Bengaluru West
  City Corporation, …". Nominatim's top hit for "Kengeri, Bengaluru" was a railway-station **NODE**
  (308062102) with a synthetic ~0.01° box — **REJECTED**; the administrative relation above (the real
  boundary) is what was used. No explicit administrative centroid was captured for this relation, so
  `geo_center_lat/lon` is the **bbox midpoint** (a real-bbox-derived approximation, documented, not an
  independently fabricated coordinate): lat=(12.9139790+12.9333808)/2=**12.9236799**,
  lon=(77.4786482+77.4989021)/2=**77.4887752**. bbox (S,N,W,E) = **12.9139790, 12.9333808, 77.4786482,
  77.4989021**.
  Source: `https://nominatim.openstreetmap.org/search?q=Kengeri,+Bengaluru+West,+Karnataka,+India&format=jsonv2`

Both bboxes are real, source-attributed OSM administrative boundaries.

## 3. `public.areas` schema investigation (r1 — cited, not assumed)

Investigated `backend/src/main/resources/db/migration` for every migration touching `public.areas`:

- **`V71__cities_and_areas.sql`** (lines 21-32) creates the table:
  ```
  area_key       TEXT PRIMARY KEY            <- unique key
  city_id        INTEGER NOT NULL REFERENCES public.cities (id)
  name           TEXT NOT NULL
  district       TEXT                        (nullable)
  geo_center_lat DOUBLE PRECISION NOT NULL   <- polygon/area centroid, used for map marker placement
  geo_center_lon DOUBLE PRECISION NOT NULL
  min_lat/min_lon/max_lat/max_lon DOUBLE PRECISION  (nullable — bbox corners)
  ```
  V71's own seed INSERT (lines 51-107) is the idempotent pattern mirrored by `area-seed.sql`: `SELECT` from a
  `VALUES` list joined to `cities` on `slug`, `ON CONFLICT (area_key) DO NOTHING`.
- **`V100__add_area_slug_to_areas.sql`** adds `area_slug TEXT NOT NULL` + `UNIQUE (city_id, area_slug)`, but a
  `BEFORE INSERT OR UPDATE` trigger (`areas_populate_area_slug`) auto-derives `area_slug` from `name` when
  `NULL` — no explicit value is required in `area-seed.sql`.
- No other migration (checked all 104: `V0.1` … `V103`) touches `public.areas` — in particular, **no
  polygon/geometry column exists on `public.areas` at all**, only the centroid (`geo_center_lat/lon`) and
  optional bbox corners (`min/max_lat/lon`) shown above.

**Conclusion:** the r1 fallback ("if a NOT-NULL geometry column exists, build a rectangle polygon from the
real OSM bbox") does not apply to this schema — there is no such column. `area-seed.sql` populates
`geo_center_lat/lon` (real Nominatim centroid for JP Nagar; real-bbox-derived midpoint for Kengeri, both
documented above) and the four bbox corner columns directly from the real OSM data. **`ON CONFLICT (area_key)
DO NOTHING`** is the correct idempotency target — `area_key` is the actual primary key, identical to V71's
own seed pattern.

## 4. Actor runs

- **AUTHORITATIVE**: run `mQsO6K0joPnswbt5G` (SUCCEEDED, exit 0). Input: `cities=[bengaluru]`,
  `transaction=[buy]`, `daysOld=365`, `fetchDetails=false`, `maxItems=3000`, `maxPagesPerCity=100`,
  `pageSize=30`. **1776 items** → `raw-apify-output.json` (this dir).
- **DISCARDED**: run `O14rm1B0qhgG2derL` (`startUrls` = the user-provided saved-search permalink
  `https://housing.com/in/buy/searches/D2M2P3yqqmgmdvlqoqz0nS6Y1` "house in JP Nagar listed by owner"). The
  actor did **not** resolve that opaque `/searches/<id>` URL — it returned 200 Mumbai apartments (Mira Road
  East, Virar West, Vasai East, Mulund West, …), all `apartment`, `propertyType=resale`. Not used
  (dataset `Ykc7obcr8NLrU8sBs`).

## 5. Filter method + funnel: 1776 raw → 4 normalised

Per-listing assignment: match to JP Nagar / Kengeri via `localityUuid == discovered id` **OR** `lat/long`
inside the OSM bbox. Dwelling type derived from title/subtitle/propertyTags (raw `propertyType` is
project/resale build-status, not a dwelling type). Recency: `postedDate` within 365 days (also natively
enforced by `daysOld=365`).

| Stage | Count | Notes |
|---|---:|---:|
| Raw items | 1776 | |
| In-area (localityUuid or bbox match, JP Nagar or Kengeri) | (see house-candidates.json) | |
| Derived type = `residential_plot` | **0** | no plots exist in this actor's Bengaluru buy inventory for these two areas across all 1776 items |
| Derived type = `house` | **4** | see below |
| A2 plausibility rule applied (`bedrooms>=8 AND built_area/bedrooms<300`) | 0 excluded | only the 12 BHK / 7000 sqft row (20225587) has `bedrooms>=8`; 7000/12 = 583.3 sqft/bedroom, well above the 300 threshold → **retained** |
| **Normalised / imported** | **4** | 0 apartments/villas mapped in (excluded — only house/plot are in scope per r2) |

No padding: 4 real houses, 0 real plots. Not inflated to any target count.

## 6. Borderline calls (r3 — resolved, documented)

**(a) `20335327` "3 BHK Independent Builder Floor" (JP Nagar) — include or exclude?**
**Decision: INCLUDE as `house`.** "Builder Floor" denotes a semi-independent floor of a standalone/independent
house — it fits `house` under the same derivation rule established in run-1
(`independent house|house -> house`; no other target enum value — apartment/villa/residential_plot — fits
better). The row is matched via `localityUuid` (in-area, high confidence) and falls within the real JP Nagar
OSM bbox. No PII/trust-signal changes to the decision either way.

**(b) `20436795` "2 BHK Independent House", raw locality "Gnana Bharathi" (Kengeri OSM bbox) — assign to
Kengeri or exclude?**
**Decision: INCLUDE, assigned to Kengeri via bbox match.** lat/long (12.931261, 77.497265) falls inside the
real Kengeri OSM administrative bbox (S12.9139790/N12.9333808/W77.4786482/E77.4989021) per the documented
bbox-match method (discovery-evidence.md section 4). **Checked whether a distinct "Gnana Bharathi" area
already exists in the seeded `public.areas` table**: it does not — `V71__cities_and_areas.sql`'s full
Bangalore area list is Whitefield, Koramangala, Indiranagar, Hebbal, HSR Layout, Sarjapur Road, Yelahanka,
Jayanagar, Marathahalli, Electronic City; no "Gnana Bharathi" entry. No conflicting/duplicate area seed risk.
Flagged for code-reviewer: the raw locality string ("Gnana Bharathi") differs from the assigned area name
("Kengeri") — this is an intentional bbox-derived assignment per the documented method, not a data error.

## 7. Normalisation (r2)

- `property_type = 'house'` (lowercase, matches the V103 CHECK constraint) for all 4 rows.
- `area_key`: `IN|KA|Bengaluru|JP Nagar` ×3, `IN|KA|Bengaluru|Kengeri` ×1.
- `listing_purpose = 'sale'` for all 4 (all `transactionType=buy` in the raw data).
- Deterministic PK: `(md5('housing.com:' || listingId))::uuid` (byte-identical expression to run-1's
  `import.sql`).
- `created_by = '2bcf2d76-fb18-6375-485c-3cdbb94bc77a'` (same run-1 seed profile; re-inserted idempotently
  in `import-listings.sql` so the file is self-contained).
- `parsed_data = {"source": "housing.com", "housingListingId": "<id>", "importIssue": 1723, "run": 2}`.
- `address_confirmed = false` for all 4 (mirrors run-1; unverified self-uploads must not be marked confirmed).
- `title` synthesized from `bedrooms + "House" + locality` only (e.g. `"3 BHK House in JP Nagar"`) — no raw
  scraped `title`/`description` text stored.

### PII / trust-signal stripping (verified absent from `normalised-listings.json` and both SQL files)

`sellerFirm`, `sellerCount`, `sellerType`, `isVerified`, `isVerifiedProperty`, `isReraVerified`,
`isMyGateCertified`, `isTitanium`, `isMostContacted`, `isBrokerageChargeable`, `isExclusiveProperty`,
`boostedAs`, `reviewRating`, `label`, `badge`, `highlights`, `nearByPlaces`, `description`, `videoTourUrl`,
`digitourUrl`, `verificationStatus` — none of these fields appear in `normalised-listings.json`,
`import-listings.sql`, or `area-seed.sql`. Only `photoUrls`/`coverImageUrl` (non-PII CDN image URLs),
structural fields (bedrooms/bathrooms/area/price/facing/age/coords), and the synthesized title are carried
forward.

## 8. Final counts by area × property type

| area_key | property_type | imported |
|---|---|---:|
| `IN\|KA\|Bengaluru\|JP Nagar` | house | 3 |
| `IN\|KA\|Bengaluru\|Kengeri` | house | 1 |
| **Total** | | **4** |

0 `residential_plot` rows (none found in-area for this run — not padded).

## 9. Local Docker/Flyway validation (fresh ephemeral container, never live, torn down after)

- Container: `postgis/postgis:15-3.4`, container name `pg-1723-run2`, host port `54332`, ephemeral
  db/user/pw (`housing1723r2`/`housing1723r2db`), removed at end of run.
- Harness-only prerequisites applied first (**not** part of `import-listings.sql`/`area-seed.sql` — same
  convention as `scripts/db/fixtures/discover-smoke-seed.sql` and run-1's harness): `authenticated`/`anon`/
  `service_role` roles, minimal `auth` schema + `auth.uid()` stub + `auth.users` stub table, empty
  `flyway_schema_history`, empty `supabase_realtime` publication.
  - Command: `psql -h localhost -p 54332 -U housing1723r2 -d housing1723r2db -v ON_ERROR_STOP=1 -f harness-prereqs.sql` → **exit 0**.
- Applied all **104** Flyway migration files (`V0.1` … `V103`) in numeric version order, substituting the one
  `${concurrently_keyword}` placeholder (in `V73__postgis_geog.sql`) with `CONCURRENTLY `.
  - Command: `psql -h localhost -p 54332 -U housing1723r2 -d housing1723r2db -v ON_ERROR_STOP=1 -f all_migrations_fresh.sql` → **exit 0**. 0 `ERROR`-containing lines (grep-checked programmatically over the full 524-line log).
- Post-migration harness stub (drops the real-Supabase auto-profile trigger, inserts a stub `auth.users` row
  for the seed `created_by` UUID so the FK on `property_listings.created_by`/`profiles` resolves locally):
  `psql ... -f 02_post_migration_stub.sql` → **exit 0**.

### Two-way discoverable-only-after-seed proof (AC5 / r5)

Ordered as: apply `import-listings.sql` **first** (before `area-seed.sql`), prove SEARCHABLE = 0, then apply
`area-seed.sql`, prove SEARCHABLE = 4.

1. **`import-listings.sql` applied** (`psql -h localhost -p 54332 -U housing1723r2 -d housing1723r2db -v ON_ERROR_STOP=1 -f import-listings.sql`) → **exit 0**. `property_listings` count for this run = **4** (all 4 rows inserted; FK to `profiles`/`auth.users` satisfied by the harness stub + the file's own idempotent profile re-insert).
2. **`areas` check before seed**: `SELECT count(*) FROM areas WHERE area_key IN ('IN|KA|Bengaluru|JP Nagar','IN|KA|Bengaluru|Kengeri');` → **0** (areas not yet seeded).
3. **SEARCHABLE (run-1's proven predicate) before seed**:
   ```sql
   SELECT count(*) FROM property_listings pl
   WHERE pl.parsed_data->>'run'='2' AND pl.created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a'
     AND pl.status='LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate=false
     AND pl.area_key IN (SELECT a.area_key FROM areas a JOIN cities c ON c.id=a.city_id WHERE c.slug='bangalore');
   ```
   → **0** (exit 0, PASS — the 4 houses exist but are NOT discoverable yet, since their `area_key`s aren't in `areas`).
4. **`area-seed.sql` applied** (`psql ... -v ON_ERROR_STOP=1 -f area-seed.sql`) → **exit 0**. `INSERT 0 2` (2 areas inserted).
5. **`areas` check after seed**: `SELECT a.area_key, a.name, a.geo_center_lat, a.geo_center_lon, c.slug FROM areas a JOIN cities c ON c.id=a.city_id WHERE a.area_key IN (...)` →
   ```
   IN|KA|Bengaluru|JP Nagar | JP Nagar | 12.9096941 | 77.5866067 | bangalore
   IN|KA|Bengaluru|Kengeri  | Kengeri  | 12.9236799 | 77.4887752 | bangalore
   ```
   Both present, correctly joined to `cities.slug='bangalore'` (exit 0, PASS).
6. **SEARCHABLE after seed** (same query as step 3) → **4** (exit 0, PASS — matches the imported listing count exactly; the two-way proof is complete).

### RUN-TWICE (idempotency)

- Re-applied `import-listings.sql` unchanged: **exit 0**. All 29 `INSERT` statements (1 profile + 4 listings +
  24 images) reported `INSERT 0 0` (0 additional rows for every one). Listing count after re-run: **4**
  (unchanged). PASS.
- Re-applied `area-seed.sql` unchanged: **exit 0**. `INSERT 0 0` (0 additional rows). Areas count after
  re-run: **2** (unchanged). PASS.

### NO-DUP

```sql
SELECT parsed_data->>'housingListingId' k, count(*)
FROM property_listings WHERE parsed_data->>'run'='2' AND created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a'
GROUP BY k HAVING count(*)>1;
```
→ **0 rows** (exit 0, PASS).

### RESIDENTIAL-ONLY

```sql
SELECT DISTINCT property_type FROM property_listings WHERE parsed_data->>'run'='2' AND created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a';
```
→ `{house}` (exit 0, PASS).

### IMAGES (cover/position)

```sql
SELECT li.listing_id, count(*) FROM listing_images li JOIN property_listings pl ON pl.id=li.listing_id
WHERE pl.parsed_data->>'run'='2' AND pl.created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a' AND li.position=0
GROUP BY li.listing_id HAVING count(*)>1;
```
→ **0 rows** (no listing has more than one cover image; exit 0, PASS).

```sql
SELECT count(*) FROM listing_images li JOIN property_listings pl ON pl.id=li.listing_id
WHERE pl.parsed_data->>'run'='2' AND pl.created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a' AND li.position=0;
```
→ **4** (one cover image per listing, all 4 listings have at least one photo; exit 0, PASS).

Total images: **24** (6 per listing × 4 listings).

### Final counts by area × property type (post-seed)

```sql
SELECT area_key, property_type, count(*) FROM property_listings
WHERE parsed_data->>'run'='2' AND created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a'
GROUP BY area_key, property_type ORDER BY area_key;
```
→
```
IN|KA|Bengaluru|JP Nagar | house | 3
IN|KA|Bengaluru|Kengeri  | house | 1
```
(exit 0, matches section 8 exactly).

Container torn down (`docker rm -f pg-1723-run2`) after all checks completed.

## 10. NO DDL confirmation

Both `import-listings.sql` and `area-seed.sql` contain **zero** `CREATE`/`ALTER`/`DROP` statements (verified
by inspection — only `BEGIN`/`INSERT ... ON CONFLICT ... DO NOTHING`/`COMMIT`). Neither file was applied
against live Supabase at any point; all validation ran against the ephemeral local container above.

## Tooling note

`jCodemunch`'s read-guard blocks `grep`/`cat`/`find`-content inspection on some paths in this session; all
file inspection here used the `Read` tool, and all migration concatenation / log-scanning used inline Python
(`python3 -`) instead of shell `grep`/`cat`, per the task's tooling-fallback note. Recorded as the tooling
fallback used.

## 11. Final verdict

**SQL_READY_FOR_REVIEW**

- Both SQL files are idempotent (proven via run-twice, `INSERT 0 0` on second application), contain no DDL,
  and were validated on a fresh local ephemeral Postgres/PostGIS container against all 104 real Flyway
  migrations (never live Supabase).
- The two-way discoverable-only-after-seed proof is complete: 0 SEARCHABLE before `area-seed.sql`, 4 after.
- 4 real houses imported (0 residential plots — none exist in-area for this actor run), matching
  `house-candidates.json` exactly; both borderline calls (r3a, r3b) resolved to INCLUDE with documented
  rationale.
- PII/third-party trust signals confirmed absent from all three deliverables (`normalised-listings.json`,
  `import-listings.sql`, `area-seed.sql`).
- `address_confirmed=false` for all 4 rows (unverified self-uploads, consistent with run-1).
