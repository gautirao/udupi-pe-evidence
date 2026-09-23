# #2607 — Agricultural staging boundary

## What this is

The additive Agricultural Land staging boundary (V141), sibling to the #2575 Commercial
staging boundary (V136). Schema, adapter validation, and discrimination tests are
implemented and passing against a real Postgres — including against the real 34
owner-supplied rows, now staged. **See "The 34 rows — RESOLVED" below.**

## What is implemented

- `apps/api/src/main/resources/db/migration/V141__agricultural_import_staging.sql` —
  `agricultural_import_batch` + `agricultural_import_candidate`, additive-only, mirroring
  V136's identity/outcome/reject-reason conventions. No existing table is altered; V136's
  `chk_cic_subtype` is untouched.
- `adapter_agricultural.py` — validation/mapping contract: category/subtype/area-type
  gates, an explicit bedroom/BHK reject (never a silent strip, and run BEFORE the subtype
  gate so a BHK-labelled subtype string is caught with the informative reason rather than
  a generic mismatch), PII stripping.
- `stage_agricultural_2607.py` — mirrors `data/imports/commercial-inventory-2575/load_staging_sql.py`'s
  convention: reads an owner-supplied raw export (supplied out-of-band, never committed to
  this repo), runs it through `adapter_agricultural.build_candidate`, writes sanitized audit
  artifacts, and emits `agricultural-load-staging.sql` (one `BEGIN`/`COMMIT` batch per city,
  since `agricultural_import_batch.city` is `NOT NULL`, same as `commercial_import_batch.city`).
  **This script does not apply the generated SQL to any database** — see "Applying the SQL"
  below.
- `test_adapter_agricultural.py` — 19 unit tests against the adapter contract, using
  synthetic fixture rows only.
- `apps/api/src/test/java/com/example/realestate/listing/AgriculturalStagingDiscrimination2607IT.java`
  — 12 integration tests against a real Testcontainers Postgres, proving:
  - the discrimination guarantee in BOTH directions, against BOTH synthetic fixtures AND
    the real 34 rows (a Commercial subtype cannot enter `agricultural_import_candidate`;
    `AGRICULTURAL_LAND` still cannot enter `commercial_import_candidate` — a regression
    proof that V136 is unmodified),
  - structural prevention: `built_area` and every bedroom/BHK column are *absent* from
    the table (querying them raises "column does not exist", not merely a CHECK
    violation) — checked against the real load too,
  - reject-reason-forced and promoted-not-rejected constraints,
  - idempotent upsert proven by an actual second insert on the same identity, not merely
    asserted,
  - the real load's by-city split matches the #2575 export manifest's own deferred-rows
    table exactly (Mysore 30, Udupi 1, Mangalore 3).

All 12 Java tests and all 19 Python tests pass. The pre-existing 15-test
`CommercialImportPromotion2575IT` suite (#2575) was re-run as a regression check and
still passes unmodified.

## The 34 rows — RESOLVED

The owner supplied the previously-missing export
(`housing_inventory_2026-09-16/agricultural.jsonl.json`, outside this repo tree). Verified
directly before use, not assumed:

- Exactly 34 lines, every one `propertySignalCategory=AGRICULTURAL`,
  `propertySignalSubtype=AGRICULTURAL_LAND`, `source=housing.com`.
- By-city split: Mangalore 3, Mysore 30, Udupi 1 — an **exact match** to the #2575 export
  manifest's own deferred-rows table.
- PII fields present (`sellerName`, `sellerId`, `sellerFirm`, `sellerType`,
  `sellerProfileUrl`, `sellerPhoneMasked`, `sellerIsPrime`, `sellerIsCertified`) are
  byte-identical to `adapter_agricultural.py`'s existing `PII_FIELDS` denylist — no adapter
  change was needed.

Running `stage_agricultural_2607.py` against the real file: **all 34 rows staged, 0
rejected.** No row failed a validation gate (no bedroom/BHK signal, no non-Plot-Area type,
no out-of-bounds coordinates, no unmapped purpose) — reported honestly rather than
assumed clean.

Residual-PII sweep performed on the committed, sanitized artifacts before commit:
- Field-name check: zero of the 8 PII field names appear in
  `agricultural-staging-candidates.json`, `agricultural-reject-report.json`, or
  `agricultural-load-staging.sql`.
- Name-invariant check: zero occurrences of any `sellerName`/`sellerFirm` value inside any
  `address`/`description`/`title` free-text field, checked against the RAW (pre-sanitisation)
  file — a name surviving in free text would not be caught by the field-name check alone.
- Bare-10-digit-sequence check (phone-shaped literals): all matches traced to numeric CDN
  path segments inside `imageUrl`/`imageUrls` fields — confirmed false positives, not phone
  numbers. `imageUrl(s)` is not stripped, matching the existing `adapter_housing_commercial.py`
  convention (image URLs were never treated as PII by that pipeline either).

## Applying the SQL

`agricultural-load-staging.sql` is a committed, sanitized artifact — **it is not applied to
any database by this PR, this script, or CI.** `AgriculturalStagingDiscrimination2607IT`
loads it into an ephemeral, throwaway Testcontainers Postgres purely to *prove* it applies
cleanly and stages correctly; that container is destroyed when the test JVM exits. This
mirrors the #2575/#2597 convention exactly: that PR committed `udupi-load-staging.sql` /
`mangalore-load-staging.sql` / `bengaluru-load-staging.sql` without applying them as part of
the PR ("No production data mutated" — #2597). Applying `agricultural-load-staging.sql` to
any persistent database (dev, shared, or production) is a separate, deliberate step outside
this PR's scope, to be run explicitly by whoever owns that infrastructure decision.

## Mysore re-collection beyond page 1 — still open

Separately from the 34 now-staged rows, deeper re-collection of Mysore's remaining
agricultural inventory (54 advertised, 30 in this export's first-page capture) still
requires the same Housing.com scraping infrastructure that #2597 records as paused pending
Actor rework (bot-detection posture unresolved). Not attempted here; raised as a distinct,
still-open item on the PR.
