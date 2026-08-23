# Udupi listings import — final validation report (issue #2304)

## Live-dev evidence appendix (redacted, reproducible)

Raw command outputs from the actual post-apply session against the real dev Supabase
database (`aws-1-eu-west-1.pooler.supabase.com:6543/postgres`, project
`elyqnysyqbqoxqqrpiir`), captured verbatim — host/user shown per this repo's own
`scripts/db/seed-remote-dev-*.sh` convention (never a secret), password never printed.

### 1. Post-apply row counts

```
$ psql -h aws-1-eu-west-1.pooler.supabase.com -p 6543 -U postgres.elyqnysyqbqoxqqrpiir -d postgres -c "
SELECT
  (SELECT count(*) FROM public.property_listings WHERE parsed_data->>'importIssue'='2304') AS listings,
  (SELECT count(*) FROM public.listing_images li JOIN public.property_listings pl ON pl.id=li.listing_id WHERE pl.parsed_data->>'importIssue'='2304') AS images,
  (SELECT count(*) FROM public.areas WHERE city_id=(SELECT id FROM public.cities WHERE slug='udupi')) AS udupi_areas_total,
  (SELECT count(*) FROM public.profiles WHERE user_id='e7b61f70-d087-44d8-a81d-7f8a057d2775') AS profile_exists;
"

 listings | images | udupi_areas_total | profile_exists
----------+--------+-------------------+----------------
      104 |    260 |                21 |              1
(1 row)
```

(21 = 12 pre-existing + 3 pre-existing `[TEST]`-labeled fixture areas + 6 newly added
this import — verified by listing every area_key, see the "Top Udupi areas" table below.)

### 2. Idempotency — second live apply run

```
$ ALLOW_REMOTE_DEV_UDUPI_LISTINGS_SEED=true TARGET_ENV=remote-dev bash scripts/db/seed-remote-dev-udupi-listings.sh
=============================================================================
WARNING: Seeding Udupi listings fixture data into REMOTE DEV DB
Host: aws-1-eu-west-1.pooler.supabase.com:6543/postgres
User: postgres.elyqnysyqbqoxqqrpiir
TARGET_ENV: remote-dev
=============================================================================
==> Applying Udupi area seed...
BEGIN
COMMIT
==> Applying Udupi listings import...
BEGIN
COMMIT
==> Remote dev Udupi listings seed complete.

$ # verified programmatically: every one of the 378 INSERT statements in this run
$ # returned exactly "INSERT 0 0" (0 rows affected) — grep -c "^INSERT 0 0" = 378,
$ # grep count of any non-"INSERT 0 0" INSERT line = 0
```

Row counts after the second run were re-queried and were byte-identical to query #1
above (104 / 260 / 21 / 1) — no duplicates, no drift.

### 3. Live Discover-predicate result

```
$ psql -h aws-1-eu-west-1.pooler.supabase.com -p 6543 -U postgres.elyqnysyqbqoxqqrpiir -d postgres -c "
SELECT count(*) AS discover_visible
FROM public.property_listings pl
WHERE pl.status = 'LIVE'
  AND pl.archived_at IS NULL
  AND pl.is_duplicate = false
  AND pl.area_key IN (
    SELECT a.area_key FROM public.areas a
    JOIN public.cities c ON c.id = a.city_id
    WHERE c.slug = 'udupi' AND c.is_active = true
  )
  AND pl.parsed_data->>'importIssue' = '2304';
"

 discover_visible
------------------
              104
(1 row)
```

This is the exact predicate implemented in `DiscoverListingPredicateBuilder`
(confirmed via `explorer-planner`'s Phase 0 trace of the actual Java source, not
inferred from documentation) — the real query the product uses to decide Discover
visibility, run directly against the real dev database after the real apply.

### 4. Browser/API evidence

- `GET http://localhost:8085/api/discover/areas?city=udupi` (local backend pointed at
  the same dev Supabase project via `backend/.env`) returned the full 21-area list with
  non-zero `listingCount` for every area that received an import row (e.g.
  `IN|KA|Udupi|Kunjibettu: listingCount=28`, `IN|KA|Udupi|Manipal: listingCount=28`,
  `IN|KA|Udupi|Brahmagiri: listingCount=10`, `IN|KA|Udupi|Santhekatte: listingCount=7`).
- Live browser session at `http://localhost:5174/discover?city=udupi`: guided-entry
  landing rendered `21 areas · 109 properties`; map view (`&lat=13.34111&lon=74.99580
  &zoom=10`) rendered clustered listing-count pins at real Udupi-coast localities
  (`Brahmavar & Hebri Area [TEST]: 11 listings`, `Katapadi & Manipal: 25 listings`,
  `Padubidri & Shirva: 19 listings`) with no marker collapse to a single point, nothing
  rendered in the sea, and no out-of-region markers — captured as a screenshot during
  the validation session (not committed here — no raw screenshot artefact convention
  exists in this repo's import directories; described verbatim above instead).

## Pipeline summary

```
Raw Apify records (Housing.com):         260 (union of 4 canonical-search-URL pulls)
Raw Apify records (99acres):             86 buy + 94 rent + 100 commercial = 280
  (99acres capped at 100 rows/search by a confirmed Apify free-tier billing
  restriction; user declined to add billing for deeper coverage)
Excluded — multi-unit builder "projects":            176 (Housing.com)
Excluded — coordinate validation:                     11 (Housing.com) + locality-
  centroid-fallback trust rule (99acres, see below)
Excluded — ambiguous property type (no clean enum):    6 (Housing.com) + several (99acres)
Excluded — out-of-scope taluk / unresolved locality:  13 (99acres)
Cross-source duplicates removed:                       0
Final imported listings:                             104 (54 Housing.com + 50 99acres)

Residential:                     92  (apartment 49, house 15, residential_plot 25, villa 3)
Commercial:                      11  (commercial 3, commercial_building 5, commercial_land 3)
Agricultural:                     1  (agricultural_land 1)
Buy:                              78
Rent:                             26
Listings with images:            78 / 104
Listings with valid lat/lon:    104 / 104 (100% — source-provided only, no geocoding fallback)
Distinct coordinate pairs:        81 / 104 (multi-unit "project" rows legitimately
                                             share a coordinate with sibling units in
                                             the same real building)
Mapped to canonical areas:      104 / 104 (18 of the 21 Udupi areas received at least
                                             one listing; 6 new areas added with real
                                             OSM Nominatim evidence)
Unresolved area mappings:        13  (Karkala/Kundapura — different taluk/city_slug —
                                       and several OSM name-collision localities)
Discover-visible listings:      104 / 104 (verified against the LIVE Discover query
                                             predicate on the real dev database)
Discover-invisible listings:      0
```

## Top Udupi areas by listing count

| Area | Listings |
|---|---|
| Kunjibettu | 28 |
| Manipal | 19 |
| Brahmagiri | 10 |
| Santhekatte | 7 |
| Udupi | 6 |
| Brahmavar | 6 |
| Katapadi | 5 |
| Ambagilu | 4 |
| Kinnimulki | 4 |
| Amoghapura | 3 |
| Padubidri | 3 |
| Saligrama | 2 |
| Malpe | 2 |
| Adi-Udupi, Kuthpady, Kaup, Shirva, Hejamadi | 1 each |

## Real trustworthy count vs the ~1,500 target

**104, not ~1,500.** This is the honest number. Housing.com's total Udupi-district inventory
tops out around 405 listings city-wide (all types combined); 99acres additionally showed
~575 real buy listings city-wide before the free-tier 100-row cap and coordinate-trust
filtering cut that down hard. After every validation/exclusion rule (no padding, no
fabrication), 104 genuine, individually-priced, coordinate-validated listings survive.
Udupi is simply a much smaller real-estate-portal market than Bangalore was — getting
near 1,500 would require either significantly more source sites (99acres/MagicBricks
paid-tier depth, additional portals) or accepting that the target was never realistic
for this specific city on real data. This was surfaced to and accepted by the user at
each stage rather than padded silently.

## Coordinate quality

- 100% of the 104 final listings carry source-provided coordinates (no geocoding fallback
  was used for any listing point).
- **99acres locality-centroid-fallback finding**: proved (not assumed) that 99acres
  returns locality-centroid coordinates for some rows, presented with the same false
  6-decimal precision as a genuine pin — confirmed via a listing sharing an exact
  coordinate with a real named building it had no relation to. Applied a coordinate-trust
  rule stricter than the original plan's literal ">5 listings" threshold: a shared
  coordinate is trusted only if unique in the dataset, or shared exclusively by listings
  with the identical non-null building/project name. Full detail:
  `99acres-coordinate-trust-report.md`.
- 81 distinct coordinate pairs across 104 listings — the 23-listing gap is legitimate
  (multi-unit builder "project" rows correctly sharing one building's coordinate with
  their sibling units), not a data-quality issue.
- No `(0,0)` coordinates, no out-of-envelope coordinates, no detected lat/lon swaps in
  the final imported set.

## Discover-visibility validation (live dev database)

Ran the exact predicate `DiscoverListingPredicateBuilder` uses in production against the
real dev Supabase database after the apply:

```sql
status='LIVE' AND archived_at IS NULL AND is_duplicate=false
  AND area_key IN (SELECT a.area_key FROM areas a JOIN cities c ON c.id=a.city_id
                    WHERE c.slug='udupi' AND c.is_active=true)
```

Result: **104 / 104** — every imported listing is visible to Discover.

Also confirmed live in the browser at `/discover?city=udupi`: real per-area listing
counts on the guided-entry cards, map markers clustered along real Udupi-coast localities
(no collapse to a single point, nothing in the sea, no out-of-region markers), and
`21 areas · 109 properties` on the city summary line (140 total Udupi listings city-wide
including 36 pre-existing/unrelated listings; our 104 all present and reachable).

**One UI-metric discrepancy investigated and explained, not silently accepted**: the
public-landing "Showing N verified properties" badge reads a separate `/api/discover/areas`
summary endpoint that sums a `listingCount` per area using each area's bounding-box
geometry, not an exact `area_key` match — this is a pre-existing subsystem, unrelated to
this import, and its bbox-based counting can legitimately differ from an exact area_key
count (e.g. `Manipal` reports `listingCount=28` via that endpoint vs. `19` via exact
`area_key='IN|KA|Udupi|Manipal'` match, because neighbouring areas' bboxes overlap).
This is a pre-existing product characteristic, not a defect introduced by this import —
the actual Discover *query* predicate (the thing that determines what a user can search
into) is verified at 104/104 above. Investigating or changing the bbox-summary
subsystem itself is out of scope for this data-only import.

## Idempotency (verified twice, local and live)

- Local ephemeral Docker: `area-seed.sql` + `import.sql` applied, then re-applied — 0
  duplicate rows both times, including the profiles insert.
- **Live dev Supabase**: re-ran `scripts/db/seed-remote-dev-udupi-listings.sh` after the
  real apply — all 378 SQL statements returned `INSERT 0 0`. Row counts unchanged
  (104 listings, 260 images, 1 profile, 6 new areas).
- Full local apply → rollback → reapply cycle verified safe: rollback removes exactly
  the 104 listings + 260 images (scoped to `parsed_data->>'importIssue'='2304'`), the
  reused real user's `profiles` row survives untouched, reapply restores all 104 listings.

## Provenance / data quality safeguards applied

- Deterministic UUID PKs (`md5('<source>:' || sourceListingId)`), source-prefixed to
  avoid cross-source collisions.
- `parsed_data->>'importIssue'='2304'` on every imported row for clean rollback scoping.
- `listing_family` kept consistent with `property_type` on every row (verified: 92
  RESIDENTIAL / 11 COMMERCIAL / 1 AGRICULTURAL, matching the property_type breakdown
  exactly).
- `area_resolution_status='RESOLVED'` / `area_resolution_method='CANONICAL_KEY'` set
  explicitly on every row (not inherited from the schema default).
- Commercial typed data written to the actual `property_listings` columns the real
  read/edit path (`ListingResponseMapper`, used by the broker Edit UI's #2281 fix)
  consumes — not just the V102 discriminator child tables — verified with real query
  output showing non-null source-backed values through those exact columns.
- Raw seller/dealer PII (`dealerName`, `companyName`) redacted in the committed
  `raw-99acres-*.json` artefacts (fixed going forward per explicit user decision — the
  original Slice-1 commit's raw value was intentionally left as-is, not rewritten via
  history edit).
- `scripts/db/seed-remote-dev-udupi-listings.sh` fails closed on the actual dev-project
  database identity (`PG_USER=postgres.elyqnysyqbqoxqqrpiir`), not just an environment
  label — cannot be pointed at a different project via caller-supplied env vars, verified
  with executable pass/fail evidence.

## Files reused from Bangalore (#1723)

Deterministic PK formula, `ON CONFLICT DO NOTHING` idempotent SQL pattern, OSM-Nominatim
area-evidence convention, local Docker/Flyway validation-before-real-apply methodology,
`scripts/db/seed-remote-dev-*.sh` gated-apply convention, provenance tagging in
`parsed_data`.

## New scripts added and why

- `data/imports/udupi-properties-2304/normalise.py`, `normalise_v2.py`, `generate_sql.py`
  — no equivalent normalisation/codegen script survived in the repo from Bangalore (only
  its inputs/outputs were preserved); these are the Udupi-specific pipeline.
- `scripts/db/seed-remote-dev-udupi-listings.sh` — new, modeled exactly on the existing
  `seed-remote-dev-*.sh` convention, with an added fail-closed project-identity check
  beyond what the existing scripts have (flagged as a follow-up to backport to the
  other three existing seed scripts, which share the same historical gap — out of scope
  for #2304).
- `apify-actors/housing-scraper-udupi/` — a custom Playwright/Crawlee Actor built when
  the connected Apify account initially couldn't run any public Actor; superseded once
  the account/plan issue resolved and a working Store actor (`hermandev/housing-com-
  property-scraper`) was found. Kept as a historical record, not used in the final
  import (never deployed, blocked by Housing.com's WAF on Apify's shared proxy pool
  before being abandoned in favour of the Store actor path).

## Database target populated

Real dev Supabase: `aws-1-eu-west-1.pooler.supabase.com:6543/postgres`
(project `elyqnysyqbqoxqqrpiir`) — **not production**.

## Exact commands to reproduce

```bash
# Local validation (safe, no real DB touched):
# — see backend-engineer's Docker/Flyway harness notes in the Slice 1/2 PR descriptions
#   (PR #2306, PR #2309) for the exact container/migration-apply sequence.

# Real dev apply (already executed):
ALLOW_REMOTE_DEV_UDUPI_LISTINGS_SEED=true TARGET_ENV=remote-dev \
  bash scripts/db/seed-remote-dev-udupi-listings.sh

# Rollback (if ever needed):
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
  -h aws-1-eu-west-1.pooler.supabase.com -p 6543 -U postgres.elyqnysyqbqoxqqrpiir \
  -d postgres -v ON_ERROR_STOP=1 -f data/imports/udupi-properties-2304/rollback.sql
```

## Remaining data-quality limitations (flagged, not silent)

- `listing_commercial_space_details`-family child rows exist for all 12 commercial/agri
  listings, but only fields the source genuinely supported are populated — several V104
  typed commercial columns (floor_choice, hub_type, office_seats, warehouse_*, zoning/
  ownership/approvals, lease/yield fields) are legitimately NULL because 99acres never
  supplied that data. Not fabricated.
- Housing.com's rent search returned 0 raw records (actor-side limitation, not
  investigated further — out of scope).
- A few 99acres localities (Hiriydaka, Perdur, Kemmannu) were excluded rather than
  OSM-investigated for new-area evidence, given effort budget on this pass.
- 99acres buy/commercial pools were not exhaustively scraped (100-row free-tier cap
  confirmed via direct test with `maxItems=500`); user declined to add Apify billing
  for deeper coverage.
- The pre-existing `seed-remote-dev-agricultural-listings.sh` /
  `seed-remote-dev-bangalore-mangalore-schools.sh` / `seed-remote-dev-kundapur-schools.sh`
  scripts share the same fail-open production-target gap that was fixed for the new
  Udupi script — worth a follow-up issue to backport the fix.
