# Staging load — closing the adapter↔V136 seam (#2575, MED-3)

Recorded 2026-09-15. This closes the gap an exact-head review named: the adapter and the V136
staging schema were **each verified and not connected**.

---

## 1. The gap, precisely

The adapter emitted two fields V136 does not declare (`area_resolution_reason`, `run`) and omitted
four V136 requires (`batch_id`, `outcome`, `raw_payload`, `payload_checksum`). The other 29 fields
aligned by name. Nothing carried a row from capture to staging table in one motion, and
`CommercialImportPromotion2575IT` seeded staging with hand-written SQL instead.

Two halves passing with an untested join between them is the shape where each side stays green and
the seam is where it breaks.

## 2. Why the loader emits SQL instead of connecting to a database

The exact-head review verified "cannot write to `property_listings` by construction" by tracing
this directory's **import closure** — no database driver, no subprocess, no socket. Importing
`psycopg2` here would have broken that verified property for a convenience.

So `load_staging_sql.py` emits a `.sql` artefact, exactly as `generate_sql.py` emits `import.sql`
and as `promote.sql` is a file.

### 2.1 A false measurement, corrected — and how it was wrong

An earlier revision of this section stated the loader's closure as
~~`argparse · hashlib · json · warnings`~~. **That was wrong.** The actual imports are:

```
argparse · hashlib · json · os · sys
```

`warnings` is not imported at all; **`os` is**, and `os` is the one module in that list that can
reach a subprocess.

**How the wrong figure was produced, because the method is the real defect.** It came from diffing
`sys.modules` before and after importing the loader. `os` and `sys` were already imported by the
harness running the probe, so they never appeared as "added" — the probe measured *what importing
the loader caused to load*, not *what the file imports*. `warnings` appeared for the same reason in
reverse: something in the probe pulled it in. A snapshot diff answers a different question than the
one being asked, and it answers it plausibly enough to pass unread.

This matters more than a list being wrong. The whole value of that sentence was that it was a
**measurement** rather than an assurance — and a measurement taken by the wrong instrument is worth
less than an honest "not checked", because it invites the reader to stop looking.

**Why the property still holds, stated rather than assumed.** `os` is present, so "no module that
could reach a subprocess" would be false. The accurate claim is narrower and checkable: this file
contains **no `os.system`, `os.popen`, `os.exec*`, `os.spawn*` or `os.fork` call** — grepped, not
recalled — and uses `os` only for `os.path` joins and `os.path.basename`. There is no database
driver, no socket, no HTTP client and no `subprocess` import anywhere in the closure. So the loader
still cannot write to `property_listings`, and cannot reach the network, by construction.

## 3. A defect the database caught that the generator's own check did not

The first generated SQL reported **`LOAD_SQL: PASS`** and was almost certainly unappliable.

`INSERT ... SELECT FROM (VALUES ...)` makes Postgres **infer** each column's type from the
literals. A column that is NULL in *every* row infers as `unknown` → `text`, and `text` does not
coerce into `BIGINT` or `INTEGER`. Measured across all **three** captures, three columns are NULL
in every single row:

| column | declared type | why it is uniformly NULL |
|---|---|---|
| `monthly_rent` | BIGINT | all **300** captured rows are `Sale` |
| `floor_number` | INTEGER | the source never populates it |
| `commercial_furnishing_status` | TEXT | harmless — already `text` |

The first two would have failed on apply. **The generator's own pre-check passed them**, which is
the point worth recording: a self-check is not the authority, and here it disagreed with the
database while reporting green.

**Fix: every emitted value now carries an explicit `::type` cast, NULL included.** Casting only the
currently-all-NULL columns would have fixed today's data and left the identical trap for the next
capture where some other column happens to come back empty. Casting everything removes the class.
It also covers `scraped_at` / `source_updated_at`, which are `TIMESTAMPTZ` receiving ISO strings
that inference would have treated as text. An unknown column name now raises rather than emitting
an uncast value, since a typo would otherwise reintroduce inference for exactly one column — the
hardest version of this bug to see.

## 4. Provenance V136 has no column for

`area_resolution_reason` records *how* an area was resolved (`alias`,
`per_listing_containment_in_<area>`, or the reason it failed). V136 has no column for it. It is
folded into `raw_payload` under a `_derived` key rather than dropped: silently discarding
provenance is the loss this pipeline exists to prevent, and a reader asking "why is this row in
Manipal?" should not have to re-run the adapter to find out.

## 5. Verified against real Postgres — not against the generator's opinion

```
mvn -f apps/api/pom.xml test -Dtest=CommercialStagingLoad2575IT -DfailIfNoTests=true
Tests run: 8, Failures: 0, Errors: 0, Skipped: 0      BUILD SUCCESS
```

Untagged and no `-P`, for the reason recorded throughout: surefire includes `**/*IT.java` and
excludes the `integration` group, while every `-P` profile skips surefire and narrows failsafe to
one named file, so this IT under a profile would execute **nowhere** and still report success.

What the **eight** cover — this section said "seven" until the Mangalore arm was added, which is the
self-falsifying-comment class recurring in the very artefact that names it at its foot:

| case | asserts |
|---|---|
| Udupi load applies | 1 batch, 100 candidates, 11 STAGED / 89 REJECTED |
| Bengaluru load applies | 100 candidates, 32 / 68, and **2 WAREHOUSE** rows — the subtype Udupi could not populate |
| **Mangalore load applies** | 100 candidates, **18 STAGED / 82 REJECTED**, `unsupported_area_unit` = 3, STAGED `SHOP` = 4 — the one city whose generated load had never been applied to real Postgres, while the evidence table cited only the generator's own pre-check |
| both cities coexist | 2 batches, 200 candidates, 43 staged — identity is per source listing, not per city |
| re-applying is idempotent | candidate count unchanged; rows repoint to the newest batch rather than splitting |
| **the seam, end to end** | `M91395690` arrives as `commercial` / `OFFICE`; every row carries `raw_payload` + `payload_checksum`; `area_resolution_reason` survives for all 11 staged |
| rejects are inspectable | zero REJECTED rows without a reason; all five Udupi reject reasons present |
| **CONTROL: the CHECKs bite** | **all six** V136 CHECKs are armed — a sale row with `monthly_rent` (`chk_cic_purpose_money`), a REJECTED row with no reason (`chk_cic_reject_reason`), a sixth subtype (`chk_cic_subtype`), a PROMOTED row carrying a reject reason (`chk_cic_promoted_not_rejected`), `'lease'` (`chk_cic_listing_purpose`), and a fourth outcome value (`chk_cic_outcome`) are each **rejected by Postgres**. This row described three until the last two arms were added. |

The control is what keeps the rest honest. Without it every constraint assertion would pass
identically against a database whose CHECKs had been dropped — they would show only that the
generated data happens to comply, never that the schema forbids the alternative.

## 6. Still open

- **Promotion has an area prerequisite, and it is WIDER than this section first recorded.** The
  original wording was "Bengaluru's `area_key`s come from V71/V106, so any target must have those
  migrations applied". `CommercialPipelineEndToEnd2575IT` found the sharper version: **two Udupi
  keys — `IN|KA|Udupi|Ambagilu` and `IN|KA|Udupi|Brahmagiri`, across three listings — are seeded by
  #2304's `area-seed.sql`, which is an import artefact and not a Flyway migration at all.**

  So applying every migration is **not sufficient** to promote these rows. Measured over the Udupi
  and Bengaluru captures: of **24** distinct area keys emitted, 22 are covered by V71+V106 and 2 by
  `area-seed.sql`, and **none is covered by nothing** — the pipeline fabricates no keys. The gap is
  in what seeds them, not in what it invents.

  **Re-measured after Mangalore, because the 24 above is scoped to the two captures it names.**
  Distinct emitted area keys are now Udupi 5 · Bengaluru 19 · Mangalore 5, a **union of 29**, so
  Mangalore contributes **5 new** keys. Those 5 need no new prerequisite: `resolve_area_mangalore`
  resolves *only* against the `IN|KA|Mangalore|*` bounds parsed out of V71, so every key it can
  emit is V71-seeded **by construction** — that is a structural argument, not a row count, and it
  is labelled as one. The `area-seed.sql` prerequisite therefore still stands at exactly the same
  2 Udupi keys across 3 listings; Mangalore neither widens nor relieves it.

  Asserted in **both directions**, so the prerequisite is load-bearing rather than a sentence
  someone has to remember: with migrations alone three listings resolve to no area; after
  `area-seed.sql` zero do. Simply applying the seed in setup would have made the failure vanish and
  taught nobody. If those areas later become part of a migration, the first assertion fails — which
  is the correct way for this record to die rather than quietly becoming untrue.

## 5.1 The whole chain, proved in one motion

```
mvn -f apps/api/pom.xml test -Dtest=CommercialPipelineEndToEnd2575IT -DfailIfNoTests=true
Tests run: 7, Failures: 0, Errors: 0, Skipped: 0      BUILD SUCCESS
```

Every stage had its own green test while the chain had none — and this lane had already been bitten
twice by exactly that shape (the adapter and V136 each passing while their join was broken; the
generated SQL passing its own checker while being unappliable). A suite of green stages is not
evidence that a pipeline works.

| case | asserts |
|---|---|
| whole chain, three cities | all 61 rows carry through as **DRAFT** — scraping alone cannot publish |
| rejects never promote | 239 rejects keep their outcome; none acquires a `promoted_listing_id` |
| **Mangalore promotion path contract** | all 18 accepted Mangalore rows become DRAFT listings, resolve to ACTIVE canonical Mangalore areas, route to correct detail tables (11 OFFICE, 4 SHOP, 2 LAND, 1 WAREHOUSE), leaving 82 rejects unpromoted |
| **V135 accepts the newly in-scope OFFICE rows** | all five land in `listing_commercial_space_details` as OFFICE, V102 agreeing with V104 |
| routing by `property_type` | Bengaluru's 2 WAREHOUSE and 6 LAND rows reach their own detail tables |
| **area prerequisite** | 3 unresolved without the seed, 0 with it |
| idempotency | re-running the whole chain yields 61 listings, not 122 |

The V135 case is the one worth naming: before the #2594 sync those five rows sat in
`listing_commercial_building_details`, which carries no `commercial_subtype` column and lies
outside the trigger's scope entirely. Promoting them is what **demonstrates** the guard accepts the
converged write, where the staged data could only show the classification.
- **`Commercial Office/Space`** (1 Bengaluru row) remains rejected as `unmapped_type`, flagged for
  a reviewed mapping rule rather than inferred into OFFICE.
- **Rent remains SYNTHETIC-only** across all three cities: all **300** captured rows are `Sale`.
  Three captures makes this a property of what `searchMode=commercial` returns from this source
  rather than an accident of one city — **no further 99acres run will populate that contract.**
- **BUILDING remains 0** in all three cities, so that subtype axis is still vacuous: an assertion
  on it passes by having nothing to examine, and volume does not fix that.

> **Scope note.** The two bullets above, and §3's column table, said "both captures / 200 rows"
> until the Mangalore commit made them stale — the same self-falsifying-comment class as the
> `SEED_ONLY_AREA_KEYS` "two"→"six" correction. They were never false about the captures they
> named; their SCOPE was overtaken by this PR's own later commit, which is the harder version to
> notice because nothing reddens. Raised as LOW-4 in the exact-head review of `393c8cd1`.
