# Full Bengaluru housing.com import — validation report (issue #1723, run-3)

## ⚠️ UPDATE (rework pass) — 300927 re-included as villa via Option A tie-break; **1737 listings, true 50/50 superset restored**

**This supersedes the "1736 listings, 49/50 superset, 300927 accepted-excluded" verdict recorded
below.** Per user ruling (`.claude/handoffs/issue-1723/rework-request-run3-resolution.toml`,
Option A), `housingListingId 300927` has been re-included in run-3's authoritative set as
`property_type='villa'`, scoped to **exactly this one row** — no other row was reclassified,
added, or removed.

- **Rationale:** `300927`'s raw subtitle text is `"3, 3.5, 4, 4.5 BHK Villa,Flats"` — a genuine
  villa+flats mixed project. Villa is a real, present component of that raw text, so classifying
  it `villa` honours run-1's original gated classification (not fabrication) — this is a
  documented, narrow, single-row tie-break exception to the general "exclude on >1 target type"
  rule, not a change to that rule for any other row.
- **All other fields derived from `300927`'s real raw record** in `raw-apify-output-union.json`
  (`listingId: "300927"`, index 243): `area_key='IN|KA|Bengaluru|Sarjapur'` (locality `Sarjapur`,
  already a seeded area — no `area-seed.sql` change needed), `latitude=12.857559,
  longitude=77.786392`, `bedrooms=3`, `built_area=1921` sqft, `price=14703334`,
  `price_paise=1470333400`, 6 `photoUrls` (the raw record's `imageCount:91` metadata field does
  not match its actual `photoUrls` array length — 6 is the real, usable image list), cover =
  `photoUrls[0]` at `position=0`, `title='3 BHK Villa in Sarjapur'` (same synthesis pattern as
  all other rows), `parsed_data={"source":"housing.com","housingListingId":"300927",
  "importIssue":1723,"run":3}`, `created_by='2bcf2d76-fb18-6375-485c-3cdbb94bc77a'`,
  `address_confirmed=false`, `listing_family='RESIDENTIAL'`, `status='LIVE'`,
  `listing_purpose='sale'`. PII stripped via the same allowlist as all other 1736 rows (no
  seller/phone/trust-badge/raw-description fields carried over).
- **Deterministic PK:** `(md5('housing.com:' || '300927'))::uuid` = **`0698eb00-fa57-7a2e-f8b3-288a451594f3`**
  — computed via Python `hashlib.md5` and independently confirmed identical via `SELECT
  md5('housing.com:300927')::uuid;` against the live validation container (see "Rework Docker/Flyway
  validation" section below).
- **New totals: 1737 listings** (`apartment=1589, villa=76, house=72, residential_plot=0` — the
  75 villas from the original 1736-row set + this 1 new villa = 76), **10300 images** (10294 + 6
  new for `300927`).
- **Superset-safety proof (updated): 50/50 — all run-1 (46) + run-2 (4) `housingListingId`s are
  now present in run-3's `normalised-listings.json` and `import.sql`.** No missing IDs.
- **`housingListingId 20569725` confirmed absent** from both `full-bengaluru/normalised-listings.json`
  and `full-bengaluru/import.sql` (it remains correctly A2-excluded — 12 BHK / 3000 sqft = 250
  sqft/bed < 300 sqft/bed threshold; this row was never touched by the rework).
- **Discoverable count changes from 1214 to 1215** (non-discoverable stays 522; 1215+522=1737):
  `300927`'s `area_key` (`IN|KA|Bengaluru|Sarjapur`) is one of the pre-existing seeded areas, so
  the new row is discoverable via the same public Discover predicate used throughout this report.
- Full fresh-container Docker/Flyway re-validation of the new 1737-row set (commands + exit codes
  + observed values) is recorded in **"Rework Docker/Flyway validation — 1737 listings"** near the
  end of this file.
- The 3 pilot SQL file deletions (`../import.sql`, `../run2-jpnagar-kengeri/import-listings.sql`,
  `../run2-jpnagar-kengeri/area-seed.sql`) remain staged as `git rm` deletes — unchanged by this
  rework; run-3's supersession of run-1/run-2 SQL still stands.

**Everything below this point (except the new final section) is the original run-3 validation
record and is retained for provenance; where it conflicts with the update above (1736 vs 1737,
49/50 vs 50/50, 300927 excluded vs included, discoverable 1214 vs 1215), the update above is
authoritative.**

## Verdict (original, pre-rework)

**SUPERSESSION EXECUTED — SQL_READY_FOR_REVIEW.**

r1–r5 and r7 (normalisation, both SQL files, local Docker/Flyway validation) are complete and
pass every proof below. **r6 (delete the pilot SQL) was initially HELD**: the mandatory 50-id
superset safety check found **1 of 50** run-1/run-2 `housingListingId`s (`300927`) is **not**
present in run-3's normalised set under the type-derivation rule applied consistently across all
1782 rows. Deleting the pilot files would silently drop that one real, already-imported listing,
so per the task's hard constraint this run initially reported BLOCKED rather than deleting.

**The workflow owner (team-lead) has since reviewed and AFFIRMED the run-3 exclusion set (41
unclassifiable + 5 A2 = correct) and EXPLICITLY DIRECTED the supersession deletes**, accepting
`300927`'s exclusion as a rule-consistent, documented outcome. The three pilot SQL files
(`../import.sql`, `../run2-jpnagar-kengeri/import-listings.sql`,
`../run2-jpnagar-kengeri/area-seed.sql`) have now been **removed via `git rm`** (staged, not
committed). See **"SUPERSESSION — EXECUTED"** and **"SUPERSEDED-ROW EXCLUSION — listingId
300927"** below for the full record — read those two sections before merging.

This run-3 `import.sql` + `area-seed.sql` are **additive** (ON CONFLICT DO NOTHING everywhere)
and were **not modified** by the supersession step — only the now-redundant pilot files were
removed. The Docker/Flyway validation below (1736/10294/168, run-twice `INSERT 0 0`, no-dup 0,
discoverable 1214/non-discoverable 522) still stands unchanged **(superseded — see update at top
of file for the current 1737-row numbers)**.

## Source / dedupe provenance

Union already prepared by Main Agent and handed off verbatim at
`raw-apify-output-union.json` (1782 items): 3 real Apify runs of
`unfenced-group/housing-scraper`, deduped by `listingId`:

| Run id | Raw items |
|---|---:|
| `qPXcBlae6Lr13RedE` | 745 |
| `mQsO6K0joPnswbt5G` | 1776 |
| `gorYNS3XcYnSyFcU7` | 899 |
| **Union (deduped by `listingId`)** | **1782** |

Verified independently: 1782 items in `raw-apify-output-union.json`, 0 duplicate `listingId`
within the union file. All 1782 have `transactionType: "buy"` (no rent rows in this scrape, same
observation as run-1/run-2). All resolve to real lat/lon and a real `builtUpArea`.

## Property-type derivation rule (mirrors run-1's documented rule, word-boundary-corrected)

Source text: `title` for `propertyType == 'resale'` rows (e.g. `"3 BHK Flat"`), `subtitle` for
`propertyType == 'project'` rows (a unit-mix string, e.g. `"2, 3 BHK Flats"`). Regex-matched
(case-insensitive, `\b` word boundaries, plural-aware):

```
residential_plot: residential plots?|residential lands?|\bplots?\b|\blands?\b
house:            independent houses?|\bhouses?\b
villa:            \bvillas?\b
apartment:        builder floors?|\bflats?\b|\bstudios?\b
```

If the source text matches **zero** or **more than one** of these four target types, the row is
**excluded** (never guessed), exactly as documented in run-1's report.

**Note on word boundaries:** run-1's report documents the same four rules without `\b` boundaries.
Applying them literally as substring search on this larger, more varied corpus produces false
positives — e.g. `"house"` matches inside `"Penthouses"` — which inflates `house` and creates
spurious mixed-type exclusions. `\b` boundaries (with explicit plural handling, since `\bflat\b`
does not match `"Flats"`) were required to get a rule that behaves as documented. This is the
same rule, corrected to actually implement its own stated intent.

### Type-exclusion result: **41 of 1782** (not the 0 the brief's facts block anticipated)

The brief stated `type_breakdown = apartment=1609, house=110, villa=61, residential_plot=2` and
suggested "0 type-exclusions expected." That did **not** hold up against the actual data:
re-running the documented rule (word-boundary-corrected) over all 1782 rows finds **41
exclusions** — all genuinely ambiguous or off-target text, not a rule bug:

- Rows whose only type token is a non-target word: `Duplex`, `Penthouse` (e.g. `"9 BHK Duplex"`,
  `"3 BHK Penthouse"`) — these are legitimate housing.com unit types but don't map to one of the
  four target enum values.
- Rows whose subtitle spans >1 target type, e.g. `"3, 4 BHK Villa,Row Houses"` (villa + house),
  `"2, 3, 4 BHK Flat,Penthouse,Villas"` (apartment + villa), `"Residential Plot, 4 BHK Villas"`
  (residential_plot + villa).

Full exclusion list (41 `housingListingId`s + source text) was generated during this run and
cross-checked manually; every one is a genuine Duplex/Penthouse-only or mixed-type row — none
were arbitrarily dropped.

**Type breakdown, pre-A2 (1741 rows after type-exclusion):** `apartment=1590, house=76,
villa=75, residential_plot=0`.

`residential_plot` is genuinely **0** in this dataset: only **one** raw row anywhere in the 1782
mentions "plot"/"land" at all (`housingListingId 320124`, `"Residential Plot, 4 BHK Villas"`),
and it's mixed-type (plot + villa), so it's excluded, not counted as a plot. The brief's
`residential_plot=2` guess does not hold.

## Plausibility filter (A2) — same rule as run-1, applied to the full 1741-row pool

```
EXCLUDE IF bedrooms >= 8 AND (built_area / bedrooms) < 300  -- sqft per bedroom
```

**5 rows excluded** (run-1's single 899-item pool only had 1 such row; this pool is ~2x larger
and pre-locality/type-unfiltered, so a proportionally larger absolute count is expected):

| housingListingId | bedrooms | built_area (sqft) | sqft/bedroom |
|---|---:|---:|---:|
| 20569725 | 12 | 3000 | 250.0 |
| 20285207 | 9 | 1920 | 213.3 |
| 16816692 | 10 | 2400 | 240.0 |
| 19446737 | 12 | 750 | 62.5 |
| 20592976 | 12 | 1200 | 100.0 |

`20569725` is the same row run-1's A2 rework excluded from its own 899-item pool (it appears in
the full union too, confirming consistency across runs). Exclusion-only — no value clamped,
rounded, or fabricated.

## Final imported count

```
1782 raw (union)
 -41  type-derivation exclusion (zero or >1 target type)
 -5   A2 plausibility exclusion
----
1736  imported
```

**Type breakdown, final imported (1736 rows):** `apartment=1589, house=72, villa=75,
residential_plot=0` (DB-verified: `SELECT DISTINCT property_type` on the loaded data returns
exactly `{apartment, house, villa}` — a strict subset of the allowed `{apartment, house, villa,
residential_plot}` CHECK-constraint set, confirmed against `V103__residential_listing_fields_expand.sql`'s
`chk_listing_property_type` CHECK, which is a superset including `'house', 'apartment', ...,
'villa', 'residential_plot'`).

## Area OSM funnel (321 raw localities → 168 seedable)

`area-bbox-evidence.json` (per-locality OSM Nominatim lookup, done by Main Agent, 0 errors):

| Status | Count | Meaning |
|---|---:|---|
| `resolved-boundary` (seedable) | 168 | real `relation`/`way` administrative or landuse boundary — geo_center + bbox seeded |
| `node-only` | 92 | best OSM hit was a bare point (no boundary) — NOT seeded |
| `none` | 61 | no usable OSM hit at all — NOT seeded |
| **Total** | **321** | |

168 + 92 + 61 = 321. **153 non-seedable localities are NOT seeded** (their listings import but
remain non-discoverable via the public Discover area predicate).

### node-only (92, not seeded)
Anantapura, Annapurneshwari Nagar, BTM Layout, BTM Layout 2nd Stage, Balagere, Banashankari,
Basavanagudi, Basaveshwara Nagar, Benson Town, Bidaraguppe, Bileshivale, Bommenahalli,
Brookefield, C V Raman Nagar, Challaghatta, Chansandra, Chikkagubbi Village, Cooke Town,
Deepanjali Nagar, Devanahalli, Dodda Banaswadi, Doddakallasandra, Doddanekundi, Domlur Layout,
Dooravani Nagar, Electronic City Phase 2, Frazer Town, Gangasandra, Gonighattapura, Gummanahalli,
Gunjur Palya, Gunjur Village, Hancharahalli Village, Haralur, Harohalli, Hebbal Kempapura,
Huvinayakanahalli, Indira Nagar, Ittangur, Jalahalli West, **Jayanagar**, Junnasandra, K
Channasandra, KPC Layout, KSRTC Colony, Kadagrahara, Kaikondrahalli, Kalena Agrahara, Kalyan
Nagar, Kannamangala - Ballari road, Kannamangala - Whitefield Hoskote Road, Kartik Nagar,
Kattigenahalli, Konadasapura, Koppa Gate, **Koramangala**, Kudlu Gate, Kyalasanahalli, Lal Bahadur
Shastri Nagar, Langford Gardens, Madivala, Mahalakshmi Layout, Mailasandra, Mallasandra Hosakote,
Malur, Margondanahalli, Muddanahalli, Muneshwara Nagar, Nagareshwara - Nagenahalli, Nekkundi
Dommasandra, New Tippasandra, RMV Extension Stage 2, RT Nagar, Rajajinagar, Ramamurthy Nagar,
Richmond Town, SMV Layout, Sadenahalli, Samethanahalli, Shanti Nagar, Sidedahalli, Sompura,
Sudhama Nagar, T Dasarahalli, Tunganagara, Ullalu, Upparahalli, Varanasi, Vijayanagar,
Virupakshapura, Virupakshipura, Yeswanthpur.

### none (61, not seeded)
Aavalahalli, Adigara Kallahalli, Amani Byrathikhane, BEML Cooperative Society Layout,
Badamanavarathekaval, Bagalakunte, Bandaramanahalli, Bangalore City Municipal Corporation Layout,
Bennigana Halli, Bettahalsoor, Bhoganhalli, Bidare Agraha, Bikasipura, Binnipete, Boodihal,
Boovanahalli, Byagadadhenahalli, Chandra Layout Extension, Chikkabana Halli, Chikkabellandur,
Chikkanayakanahalli, Choodasandra (raw locality key, comma is part of the source string),
Chinnapanna Halli, Choudadenahalli, Essel Gardens, Hallehalli, Jeevan Bima Nagar, Jnana Ganga
Nagar, Jyotipuram, Kacharakanahalli,Bisnahalli (raw locality key), Kasuvanahalli, Katamnallur,
Kaval Bairasandra, Kempalingapura, Kithiganur, Kodalagurki, Kothnur Narayanapura, Kumbalgodu,
Lingadheeranahalli, Mukkidipeta, Mullur, Munnekollal, Navarathna Agrahara, R.K. Hegde Nagar, RS
Gardens, Ramanashree California Gardens Layout, Rustam Bagh Layout, Sannatammanahalli, Sathnur,
Srinivaspur, Srinivaspura, Talaghattapura, Thirumalashettyhally, Thurahalli, Tirumanahalli, Ullal
Uppanagar, Uttarahalli -Manavarthekaval, Uttarahalli Hobli, Vaderamanchana Halli, Venkatapura,
Kambipura, Yelachanayakanapura, Yerthiganahalli.

**Important — `Koramangala` and `Jayanagar` are node-only per this run's OSM lookup, but their
listings are still discoverable.** Both already exist as pre-seeded `public.areas` rows from
`V71__cities_and_areas.sql` (with V71's own bbox/centroid, not OSM-derived) — some raw
`locality` values in this scrape literally equal `"Koramangala"` (20 listings) and `"Jayanagar"`
(5 listings), so their `area_key` matches the pre-existing V71 area row directly, independent of
this run's own (node-only, non-seedable) OSM lookup for those query strings. This is why the
DB-measured discoverable count (1214) is 25 higher than a naive "listings in the 168 seedable
localities" count (1189) — see reconciliation below.

## Centroid-fidelity caveat (documented, does not affect discoverability)

Some `seedable` entries resolve to a real OSM boundary/landuse feature that is **not the true
locality boundary** — a smaller, unrelated feature that happened to rank first for that query
string. Two examples, verified directly against `area-bbox-evidence.json`:

- **Electronic City** → OSM way 287685707, `landuse=residential`, `display_name: "Prime City
  Apartments, Electronic City, ..."` — a single apartment complex's landuse polygon, not
  Electronic City itself. bbox is ~0.002° × 0.003° (a few hundred metres).
- **K R Puram** → OSM way 135078007, `landuse=commercial`, `display_name: "Government Hospital,
  K.R. Puram, ..."` — a hospital compound's landuse polygon. bbox is ~0.0015° × 0.0012°.

Both are seeded as-is (real OSM data, not fabricated) — the geo_center/bbox is imprecise for
these two (and possibly a handful of others sharing the same failure mode: locality name matched
a small landuse feature rather than an administrative boundary), but this does **not** break
discoverability, since the Discover predicate matches on `area_key` (a string), not on
geographic containment against the bbox. Map-pin placement for these two areas will be visually
off; this is a known, documented, pre-existing limitation of Nominatim-only geocoding without a
manual review pass, not something introduced or hidden by this rework.

## area-seed.sql: ON CONFLICT correctly skips pre-existing areas (confirmed)

Of the 168 seedable localities, **6 already exist** as `public.areas` rows seeded by
`V71__cities_and_areas.sql` with V71's own (non-OSM) centroid: `Whitefield`, `Electronic City`,
`Yelahanka`, `HSR Layout`, `Hebbal`, `Marathahalli`. Applying `area-seed.sql` against a
freshly-migrated database confirms `ON CONFLICT (area_key) DO NOTHING` **did not overwrite**
their original V71 values (DB-queried `geo_center_lat/lon` for all 6 differs from this run's OSM
centroid — e.g. DB `Whitefield` = `(12.9698, 77.75)` (V71's own value) vs. this run's OSM
centroid `(12.9696365, 77.7497448)` — confirming the skip, not a silent overwrite).

**162 net-new areas inserted** (168 seedable − 6 pre-existing = 162). Total `bangalore`-city
areas after seeding: **172** = 10 pre-existing V71 areas (6 overlapping our 168 + `Indiranagar`,
`Jayanagar`, `Koramangala`, `Sarjapur Road` — 4 more V71 areas not among our 168 OSM-seedable
set at all) + 162 newly seeded.

## Discoverable vs. non-discoverable — actuals + reconciliation vs. the brief's 1217/565

Run-1's proven public Discover predicate:

```sql
status='LIVE' AND archived_at IS NULL AND is_duplicate=false
  AND area_key IN (SELECT a.area_key FROM areas a JOIN cities c ON c.id=a.city_id WHERE c.slug='bangalore')
```

DB-measured (fresh container, after both SQL files applied):

| | Count |
|---|---:|
| DISCOVERABLE | **1214** |
| NON-DISCOVERABLE (area_key present, but not a seeded/existing bangalore area) | **522** |
| **Sum** | **1736** = imported ✓ |

**Reconciliation vs. the brief's 1217/565 (sum 1782):** the brief's numbers do not match the
actuals, for two compounding, fully-explained reasons:

1. **Base is different.** The brief's split sums to 1782 (the raw union, before any exclusion).
   The actual imported base is 1736 (1782 − 41 type-exclusions − 5 A2-exclusions). Applying the
   brief's implied ~68.3% discoverable ratio to 1736 would give ~1186, not the 1214 actually
   measured — so exclusions alone don't explain the gap either.
2. **The `Koramangala`/`Jayanagar` alias effect** (documented above): 25 listings are
   discoverable via a literal-string match against pre-existing V71 areas that are **not** among
   the 168 `seedable` OSM-resolved localities in `area-bbox-evidence.json`. A naive
   "listings-in-168-seedable-localities" count (computed directly from the normalised JSON
   against just the 168 seedable keys) gives **1189**; the DB-measured discoverable count is
   **1214** — the +25 delta is exactly the Koramangala (20) + Jayanagar (5) rows, confirmed by
   direct query.

Both effects are real, not fabricated to force a match — the actual 1214/522 split (summing to
1736) is what this run's SQL, once applied, actually produces, and is the number that should be
carried forward, not the brief's pre-exclusion estimate.

## ⚠️ SUPERSESSION — EXECUTED (49/50 superset; 300927 explicitly accepted-excluded)

**READ THIS SECTION BEFORE MERGING.**

This run's mandatory 50-id superset safety check (below) found **49 of 50** run-1/run-2
`housingListingId`s present in run-3's final set — **1 missing: `housingListingId 300927`**.
Per the task's hard constraint, the initial pass of this run **STOPPED and reported BLOCKED**
rather than deleting the pilot SQL silently.

**The workflow owner (team-lead) has since reviewed this exact finding and explicitly directed
the supersession to proceed**, affirming:
- The run-3 exclusion set (41 unclassifiable rows including `300927` + 5 A2 plausibility rows)
  is **correct and rule-consistent**.
- `300927`'s exclusion from the authoritative import is an **accepted, documented decision**,
  not an oversight.

**Action taken this session:** the 3 pilot SQL files were removed via `git rm` (staged, not
committed — see "Files created / modified / deleted" below for the exact list). Run-3's
`import.sql`/`area-seed.sql` are now the sole authoritative SQL for this import; run-3's
`normalised-listings.json`/import.sql do **not** contain `300927`.

See the subsection immediately below for the full detail on `300927` specifically, and
"Supersession superset-safety proof" further down for the original derivation of the 49/50
result.

### SUPERSEDED-ROW EXCLUSION — listingId 300927

- **What happened:** `300927` was imported by run-1's pilot `import.sql` with
  `property_type='villa'`. Run-3's consistent type-derivation rule (documented above, applied
  identically to all 1782 rows in this run) instead **excludes** `300927` because its source
  subtitle text — `"3, 3.5, 4, 4.5 BHK Villa,Flats"` — matches **two** target types (villa +
  apartment/flat), and the rule's own stated intent is "exclude on ambiguity, never guess."
- **Effect of this supersession:** because run-1's pilot `import.sql` has now been deleted (per
  team-lead direction), `300927` is **dropped from the authoritative import** — it is not present
  in run-3's `import.sql`/`normalised-listings.json`, and no other SQL file re-adds it.
- **Why this is accepted, not a bug:** run-1's own classification of `300927` as `'villa'` was
  produced by an undocumented tie-break rule not written down anywhere in run-1's report (run-1's
  own report already flags this exact class of inconsistency). Applying run-3's documented rule
  *consistently* to `300927` — the same rule applied to the other 40 unclassifiable rows in this
  run and to all 1782 rows overall — correctly excludes it. Special-casing `300927` back in would
  require re-deriving run-1's undocumented rule and applying it to at least 34 other rows sharing
  the same ambiguity pattern, for consistency; the workflow owner chose NOT to do that and
  instead affirmed the rule-consistent exclusion.
- **Decision status:** explicit, non-silent, workflow-owner-directed. This is the one place a
  reviewer should look to understand why the authoritative import's row count (1736) differs from
  a naive "all 46 run-1 + 4 run-2 pilot ids carried forward" expectation by exactly one row.
- **Provenance retained:** run-1's raw `raw-apify-output.json`/`raw-apify-input.json` (kept, not
  deleted) still contain `300927`'s original scraped record, so the source data is not lost —
  only the derived SQL insert for it is no longer part of the authoritative import.

## Supersession superset-safety proof — 49/50 (1 missing: 300927, accepted per above)

Per the task's hard constraint, before deleting any pilot SQL the 46 run-1 + 4 run-2
`housingListingId`s must all be present in the run-3 final set.

**Note on source-of-truth:** `../normalised-listings.json` (the run-1 JSON artifact on disk)
currently contains **47** rows including `housingListingId 20569725`, which contradicts run-1's
own `validation-report.md` (which documents the A2 rework removing exactly that row, leaving
46). The actually-committed, authoritative `../import.sql` (the file r6 asks to delete) contains
exactly **46** `INSERT` rows and correctly excludes `20569725` — matching its own report. The
JSON artifact on disk is therefore treated as **stale/non-authoritative** for this check; the SQL
file is ground truth. IDs were extracted directly from the two pilot `import.sql`/
`import-listings.sql` files by regex, not from the JSON.

```
run-1 import.sql ids:  46 (0 dupes)
run-2 import-listings.sql ids: 4 (0 dupes)
overlap(run-1, run-2): 0
union: 50
```

Checked against run-3's final `housingListingId` set (1736 ids, from `normalised-listings.json`
generated this run):

**Missing: 1 — `housingListingId 300927`.**

Root cause: `300927`'s raw subtitle text is `"3, 3.5, 4, 4.5 BHK Villa,Flats"` — genuinely mixed
(villa + apartment/flat keywords both present). Run-3's type-derivation rule (documented above,
applied identically and consistently to all 1782 rows, matching run-1's own stated rule of
"exclude on >1 distinct target type, never guess") correctly excludes it as ambiguous. Run-1's
*actual* committed `import.sql`, however, classified this exact row as `'villa'` — meaning
run-1's real pipeline applied at least one additional, undocumented disambiguation rule beyond
what's written in its own report. This is not a new discovery: run-1's own report already flags
this exact class of inconsistency in its "On promotion (A2 rework)" section (a naive
re-derivation of its rule could not reproduce its own approved output for a different row,
for the same underlying reason).

**RESOLVED — team-lead decision (this session):** per the task's original hard instruction ("If
ANY of the 50 is missing, STOP and report BLOCKED — do not delete"), this run initially stopped
and reported BLOCKED rather than deleting silently. The workflow owner (team-lead) subsequently
reviewed the finding above, **affirmed the run-3 exclusion set as correct** (41 unclassifiable +
5 A2), and **explicitly directed the supersession deletes to proceed**, accepting `300927`'s
exclusion (option 1 below was considered and explicitly declined in favour of option-2-equivalent
behaviour for `300927` specifically: it is not special-cased back in). The three pilot files —
`../import.sql`, `../run2-jpnagar-kengeri/import-listings.sql`, and
`../run2-jpnagar-kengeri/area-seed.sql` — have been **removed via `git rm` this session** (staged,
not committed). See "SUPERSESSION — EXECUTED" and "SUPERSEDED-ROW EXCLUSION — listingId 300927"
above for the full record.

**The two options originally identified (for record):**
1. Special-case `300927` into run-3's normalised set with `property_type='villa'` (matching
   run-1's precedent), accepting a documented, narrow, single-row deviation from the strict
   "exclude on ambiguity" rule. **NOT taken** — would require re-deriving run-1's undocumented
   tie-break rule and applying it to ≥34 other rows sharing the same ambiguity pattern for
   consistency (see the "capped Whitefield×apartment" note in run-1's original report for the
   same unresolved issue).
2. Keep both pilot imports permanently alongside run-3 (drop r6 entirely). **NOT taken** — the
   workflow owner directed the supersession deletes instead, accepting the single-row exclusion.

## Local Docker/Flyway validation — fresh ephemeral container, torn down after

Container: `postgis/postgis:15-3.4`, name `verify1723run3`, port `54331`, throwaway
credentials (`verify1723`/`verify1723`/`verify1723db`), never live Supabase.

| Step | Command | Exit | Result |
|---|---|---:|---|
| Start container | `docker run -d --name verify1723run3 -e POSTGRES_PASSWORD=verify1723 -e POSTGRES_USER=verify1723 -e POSTGRES_DB=verify1723db -p 54331:5432 postgis/postgis:15-3.4` | 0 | up |
| Harness prereqs (roles/auth schema/realtime pub/flyway_schema_history stub — LOCAL SCAFFOLDING ONLY) | `psql -f harness-prereqs.sql` | 0 | roles+schema created |
| Apply all 104 Flyway migrations (`${concurrently_keyword}` substituted to empty) | `python3 apply_migrations_run3.py` | 0 | "All 104 migrations applied successfully." |
| Post-migration stub: drop `on_auth_user_created`, insert stub `auth.users` row for seed UUID | `psql -f 02_post_migration_stub.sql` | 0 | trigger dropped, 1 row inserted |
| Apply `area-seed.sql` | `psql -f area-seed.sql` | 0 | `INSERT 0 162` (162 net-new; 6 skipped — pre-existing V71 areas, confirmed not overwritten) |
| Apply `import.sql` | `psql -f import.sql` | 0 | 1736 property_listings rows + 10294 image rows + 1 profile row, all `INSERT 0 1` |
| Listings count | `SELECT count(*) FROM property_listings WHERE created_by='2bcf2d76-...'` | 0 | **1736** |
| Images count | `SELECT count(*) FROM listing_images li JOIN property_listings pl ...` | 0 | **10294** |
| Profile count | `SELECT count(*) FROM profiles WHERE user_id='2bcf2d76-...'` | 0 | **1** |
| Discoverable count | predicate query (above) | 0 | **1214** |
| Non-discoverable count | inverse predicate query | 0 | **522** (1214+522=1736 ✓) |
| No-dup check | `SELECT parsed_data->>'housingListingId', count(*) ... GROUP BY 1 HAVING count(*)>1` | 0 | **0 rows** (no dupes) |
| Residential-only type check | `SELECT DISTINCT property_type ...` | 0 | `{house, apartment, villa}` — subset of `{apartment,house,villa,residential_plot}` ✓ |
| Images cover/position check | `SELECT count(*) FROM (SELECT listing_id, count(*) FROM listing_images ... WHERE position=0 GROUP BY listing_id HAVING count(*)<>1)` | 0 | **0** (exactly one position=0 cover per listing, no dup covers) |
| Re-run `area-seed.sql` | `psql -f area-seed.sql` | 0 | `INSERT 0 0` |
| Re-run `import.sql` | `psql -f import.sql` | 0 | all 12031 INSERT statements returned `INSERT 0 0`/`INSERT 0 1`(profile, itself `0` on 2nd run) — **0 net new rows** |
| Post-rerun counts unchanged | listings / areas count | 0 | **1736** listings, **172** bangalore areas (unchanged) |
| Profile count post-rerun | | 0 | **1** (unchanged) |
| Tear down | `docker rm -f verify1723run3` | 0 | removed |

## NO-DDL / PII confirmation

Both `import.sql` and `area-seed.sql` contain **zero** `CREATE`/`ALTER`/`DROP` statements — only
`BEGIN`/`INSERT ... ON CONFLICT ... DO NOTHING`/`COMMIT` against existing tables
(`public.property_listings`, `public.listing_images`, `public.profiles`, `public.areas`).
Verified by grep over both files (0 matches for `CREATE|ALTER|DROP`, case-insensitive).

PII / third-party trust signals stripped via **allowlist** (not denylist): only
`bedrooms, bathrooms, built_area(+unit), land_area(+unit)(always NULL — 0 plot rows this run),
price, price_paise, facing, property_age, latitude, longitude, locality, area_key/area_label,
photoUrls/coverImageUrl, synthesized title, address_confirmed=false, listing_family='RESIDENTIAL',
listing_purpose='sale', housingListingId (in id-derivation + parsed_data), created_by (seed UUID),
parsed_data={source,housingListingId,importIssue:1723,run:3}` are carried into
`normalised-listings.json`/`import.sql`. `sellerFirm`, `sellerType`, `sellerCount`, `isVerified*`,
`isReraVerified`, `isMyGateCertified`, `isExclusiveProperty`, `isTitanium`, `isMostContacted`,
`isBrokerageChargeable`, `verificationStatus`, `badge`, `label`, raw `description`/
`descriptionMarkdown`, `highlights`, `nearByPlaces`, `videoTourUrl`, `digitourUrl`, `features`,
`propertyTags`, `saleTag`, `entityProjectName`, `boostedAs`, `reviewRating` are all **never
read** by the normalisation script — confirmed by inspection of `normalise_run3.py`'s field
list, which only accesses the allowlisted keys above plus `listingId`/`propertyType`/`title`/
`subtitle` (used transiently for type derivation, never stored) and `locality`/`sublocality`.

## Files created / modified / deleted

**Created** (all under `data/imports/bangalore-housing-1723/full-bengaluru/`):
- `normalised-listings.json` (1736 rows)
- `import.sql` (1736 listings + 10294 images + 1 profile, idempotent)
- `area-seed.sql` (168 areas, idempotent)
- `validation-report.md` (this file)

**Untouched / kept for provenance** (already existed, read-only):
- `raw-apify-output-union.json`, `area-bbox-evidence.json`, `localities.txt`

**DELETED this session (`git rm`, staged — r6 SUPERSESSION EXECUTED per team-lead direction; see
"SUPERSESSION — EXECUTED" above):**
- `../import.sql` (run-1 pilot, 46 listings — superseded by this run's `import.sql`, minus
  `300927`, see "SUPERSEDED-ROW EXCLUSION — listingId 300927" above)
- `../run2-jpnagar-kengeri/import-listings.sql` (run-2 pilot, 4 listings — superseded)
- `../run2-jpnagar-kengeri/area-seed.sql` (run-2 pilot area seed — superseded)

**Retained for provenance (NOT deleted):**
- `../normalised-listings.json`, `../raw-apify-input.json`, `../raw-apify-output.json` (run-1)
- `../run2-jpnagar-kengeri/raw-apify-output.json`, `raw-apify-input.json`,
  `discovery-evidence.md`, `house-candidates.json`, `normalised-listings.json`,
  `validation-report.md` (run-2)

This run-3 `import.sql` and `area-seed.sql` were **not modified** by the supersession step — only
the 3 now-redundant pilot SQL files were removed. No files outside
`data/imports/bangalore-housing-1723/` were touched. No DDL, no live Supabase, no re-scrape, no
product/backend/frontend code changed. The `git rm` deletes are staged but **not committed** —
left for the Main Agent to commit.

## Rework Docker/Flyway validation — 1737 listings (300927 re-included)

Fresh ephemeral container, same harness pattern as the original run-3 validation above
(`postgis/postgis:15-3.4`, throwaway credentials, never live Supabase, torn down after). Harness
scaffolding (roles/`auth` schema/`auth.uid()`/`auth.users` stub/empty `supabase_realtime`
publication/pre-created empty `flyway_schema_history`) is LOCAL TEST SCAFFOLDING ONLY — not part
of the product SQL files.

Container: name `verify1723run3`, port `54331`, user/pass/db `verify1723`/`verify1723`/`verify1723db`.

| Step | Command | Exit | Result |
|---|---|---:|---|
| Start container | `docker run -d --name verify1723run3 --network verify1723net -e POSTGRES_PASSWORD=verify1723 -e POSTGRES_USER=verify1723 -e POSTGRES_DB=verify1723db -p 54331:5432 postgis/postgis:15-3.4` | 0 | up |
| Harness prereqs (roles/auth schema/realtime pub/flyway_schema_history stub) | `psql -h localhost -p 54331 -U verify1723 -d verify1723db -v ON_ERROR_STOP=1 -f harness-prereqs.sql` | 0 | roles+schema+stub table created |
| Apply all 104 Flyway migrations (`${concurrently_keyword}` substituted to empty; `-- flyway:no-transaction` files like V90 run outside a wrapping transaction since psql -f is autocommit per-statement) | `python3 apply_migrations_run3.py` | 0 | "All 104 migrations applied successfully." |
| Post-migration stub: drop `on_auth_user_created`, insert stub `auth.users` row for seed UUID | `psql ... -f 02_post_migration_stub.sql` | 0 | `DROP TRIGGER`, `INSERT 0 1` |
| Apply `area-seed.sql` | `psql ... -f area-seed.sql` | 0 | `INSERT 0 162` (162 net-new; `Sarjapur` — 300927's locality — was already a pre-existing seeded area, confirming no `area-seed.sql` change was needed) |
| Bangalore areas count | `SELECT count(*) FROM areas a JOIN cities c ON c.id=a.city_id WHERE c.slug='bangalore'` | 0 | **172** (unchanged from original run-3 validation — no new area added) |
| Apply `import.sql` (1737 listings) | `psql ... -f import.sql` | 0 | `BEGIN` + 1737 `property_listings` inserts + 10300 `listing_images` inserts + 1 profile insert, all `INSERT 0 1`, `COMMIT` |
| Listings count | `SELECT count(*) FROM property_listings WHERE created_by='2bcf2d76-...'` | 0 | **1737** |
| Images count | `SELECT count(*) FROM listing_images li JOIN property_listings pl ...` | 0 | **10300** (10294 + 300927's 6 real photoUrls) |
| Profile count | `SELECT count(*) FROM profiles WHERE user_id='2bcf2d76-...'` | 0 | **1** |
| Discoverable count | predicate query (same predicate as original run-3 validation, `status='LIVE' AND archived_at IS NULL AND is_duplicate=false AND area_key IN (bangalore areas)`) | 0 | **1215** (was 1214; +1 because `300927`'s area `IN\|KA\|Bengaluru\|Sarjapur` is a seeded/discoverable bangalore area) |
| Non-discoverable count | inverse predicate query | 0 | **522** (unchanged) |
| Discoverable + non-discoverable sum check | — | — | 1215 + 522 = **1737** ✓ (matches imported total) |
| Re-run `area-seed.sql` (idempotency) | `psql ... -f area-seed.sql` | 0 | `INSERT 0 0` |
| Re-run `import.sql` (idempotency) | `psql ... -f import.sql` | 0 | all 12038 `INSERT` statements returned `INSERT 0 0` — **0 net-new rows** |
| Post-rerun listings/areas/profile counts unchanged | — | 0 | **1737** listings, **172** areas, **1** profile |
| No-dup `housingListingId` check | `SELECT parsed_data->>'housingListingId', count(*) FROM property_listings WHERE created_by='2bcf2d76-...' GROUP BY 1 HAVING count(*)>1` | 0 | **0 rows** (no dupes) |
| Residential-only type check | `SELECT DISTINCT property_type FROM property_listings WHERE created_by='2bcf2d76-...'` | 0 | exactly `{apartment, house, villa}` |
| Images cover/position check | `SELECT count(*) FROM (SELECT listing_id, count(*) FROM listing_images ... WHERE position=0 GROUP BY listing_id HAVING count(*)<>1)` | 0 | **0** (exactly one `position=0` cover per listing, no dup covers) |
| Listings missing a cover check | `SELECT count(*) FROM property_listings pl WHERE NOT EXISTS (SELECT 1 FROM listing_images li WHERE li.listing_id=pl.id AND li.position=0)` | 0 | **0** |
| `20569725` absence check | `SELECT count(*) FROM property_listings WHERE parsed_data->>'housingListingId' = '20569725'` | 0 | **0** (confirmed absent, correctly remains A2-excluded) |
| `300927` deterministic-PK verify | `SELECT md5('housing.com:300927')::uuid;` | 0 | `0698eb00-fa57-7a2e-f8b3-288a451594f3` — **matches** the value computed independently via Python `hashlib.md5` and the value embedded in `import.sql`'s `(md5('housing.com:' || '300927'))::uuid` expression |
| `300927` row/image-count verify | `SELECT ... FROM property_listings WHERE parsed_data->>'housingListingId'='300927'` / `SELECT count(*) FROM listing_images WHERE listing_id=(md5('housing.com:300927'))::uuid` | 0 | `property_type=villa, area_key='IN\|KA\|Bengaluru\|Sarjapur', bedrooms=3, built_area=1921, price=14703334, price_paise=1470333400, lat=12.857559, lon=77.786392`; **6** images |
| Tear down | `docker rm -f verify1723run3` then `docker network rm verify1723net` | 0 | removed |

**Result: all proofs PASS on the new 1737-listing set.** No DDL was touched (harness-prereqs.sql
is local test scaffolding, not a product file); `import.sql`/`area-seed.sql` remain pure
`INSERT ... ON CONFLICT DO NOTHING` against existing tables.
