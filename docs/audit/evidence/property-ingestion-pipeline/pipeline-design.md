# Issue #1779 — Pipeline Design: property-ingest

**Status:** design only; no code exists yet. Implementation begins in PR2 per [implementation-plan.md](./implementation-plan.md).
**Naming:** the tool is `property-ingest` (`scripts/property_ingest/`). It is **unrelated** to the backend runtime `com.example.realestate.ingestion` package (the `@Scheduled` RawPost AI-classification pipeline).

## No live scraping in PR1/PR2/PR3

PR1 is docs-only. PR2 is a CLI skeleton with **no network code paths**. PR3 is synthetic seed only. Real source adapters arrive PR4+ only after feasibility approval (see [source-feasibility-template.md](./source-feasibility-template.md)). Phase 1 sources are manual CSV, broker/dealer exports, and synthetic seed — **no portal crawling**.

## Stage overview

```
sources.yaml (registry, all enabled:false)
   │  compliance gate (registry.py)
   ▼
[adapter] → raw JSONL → [normalize] → normalized JSONL → [dedupe] → canonical JSONL
                                                              │
                                          [snapshot] → observations.jsonl (append-only)
                                                              │
                                          [report] → Markdown/CSV/JSON reports
```

Each stage is a pure file→file transform, independently re-runnable and testable.

### Local data layout (all gitignored except committed test fixtures)

```
data/property-ingest/
  raw/<source_id>/<run_id>/records.jsonl   # PRIVATE — the only place exact coords may exist
  normalized/<run_id>.jsonl
  canonical/<run_id>.jsonl
  snapshots/observations.jsonl             # append-only time series
  reports/<run_id>/*.{md,csv,json}         # coarsened coords only
  checkpoints/<source_id>.json
```

### Package layout

```
scripts/property_ingest/
  __init__.py
  cli.py                  # argparse root: 6 subcommands
  registry.py             # sources.yaml loader + compliance gate
  schemas.py              # raw/normalized/observation dataclasses + validators
  adapters/__init__.py    # AdapterProtocol
  adapters/manual_csv.py  # disabled by default, like every source
  adapters/broker_export.py
  normalize.py  dedupe.py  snapshot.py  report.py
  geo.py                  # coarsen (GeoCoarsener parity), haversine, direction/band (RegionalGeo parity)
  synth_seed.py           # PR3
  sources.yaml            # ALL sources enabled:false
scripts/test_property_ingest_*.py          # flat pytest files, repo convention
scripts/requirements-property-ingest.txt   # pytest only in Phase 1 (stdlib runtime)
```

## A. Source adapters — common raw record schema

```json
{
  "raw_id": "manual_csv:8f3a…",              // source_id + sha1(source_url | source_listing_id)
  "source_id": "manual_csv",
  "source_listing_id": "BRK-0042",
  "source_url": "https://…",                  // link only — never copied content
  "fetched_at": "2026-07-06T10:00:00Z",
  "listed_at_raw": "3 weeks ago",             // as displayed, resolved during normalize
  "title_raw": "2 acre farmland near Brahmavar",   // HARD CAP 200 chars — no long copied descriptions
  "listing_type_raw": "Agricultural Land",
  "listing_purpose_raw": "sale",
  "city_raw": "Udupi",
  "locality_raw": "Brahmavar",
  "display_location_raw": "Brahmavar, Udupi",
  "lat_raw": 13.4012,                          // exact allowed HERE ONLY (private gitignored file)
  "lng_raw": 74.7433,
  "coordinate_precision": "exact",             // exact|approximate|locality_centroid|synthetic|none
  "price_raw": "₹1.2 Cr",
  "area_raw": "2 acres",
  "bedrooms_raw": null, "bathrooms_raw": null, // residential only
  "attributes_raw": {                          // free-form source attributes
    "road_access": "tar road", "water_source": "borewell",
    "soil_type": "red loam", "cultivation": "coconut",
    "ownership": "single owner", "survey_number": "12/3A"
  },
  "broker_owner_flag_raw": "broker",
  "media_refs": [],                            // URL references ONLY — never downloaded unless permitted
  "photo_urls": [],                            // ALWAYS empty by policy — validator asserts
  "contact_raw": null,                         // ALWAYS null by policy — validator asserts
  "raw_metadata": {}
}
```

Compliance is encoded in the schema validator: non-empty `photo_urls`, non-null `contact_raw`, or `title_raw` over 200 chars is a **validation error**, not a warning.

### Adapter interface

```python
class AdapterProtocol(Protocol):
    source_id: str
    channel: Literal["manual", "export", "api", "crawl"]
    def fetch(self, city: str, since_days: int, checkpoint: Checkpoint,
              rate_limiter: RateLimiter, dry_run: bool) -> Iterator[RawRecord]: ...
```

PR2 ships `manual_csv` and `broker_export` adapters (file readers, `channel: manual/export`) plus the interface. No `crawl`-channel adapter is implemented in PR2–PR3; portal entries in `sources.yaml` exist only as disabled placeholder rows with no code behind them.

## B. Normalization layer

| Field | Type | Derivation |
|---|---|---|
| `raw_id`, `source_id`, `source_url`, `fetched_at` | pass-through | |
| `property_type` | enum | mapped to repo vocab (V86 CHECK values): `agricultural_land`, `plot` (→`land`), `apartment`, `house`, … |
| `agri_land_category` | enum/null | FARMLAND / PLANTATION / FARM_PLOT / AGRICULTURAL_PLOT / OTHER per `AgriFieldOptions.java` |
| `agri_fields` | dict | water_source/soil_type/road_access/cultivation_status/ownership_type mapped to SCREAMING_SNAKE_CASE canon (V91 semantics); unknown → warning, kept raw in `raw_metadata` |
| `survey_number` | string/null | **private-stage only field** — stripped before any public/report output |
| `listing_purpose` | enum | `sale` (default) / `rent` — matches `property_listings` |
| `price_paise` | int/null | parsed from "₹1.2 Cr"/"85 Lakh"/"1.2-1.5 Cr" (midpoint + warning); table-driven tested |
| `price_per_acre_paise`, `price_per_sqft_paise` | int/null | derived |
| `area_value`, `area_unit` | raw pair | acres / cents / guntas / sqft |
| `area_sqm`, `area_acres`, `area_cents` | float/null | normalized; 1 acre = 4046.8564224 m² (backend `ST_Area` constant) |
| `bedrooms`, `bathrooms` | int/null | residential |
| `city_slug` | enum | udupi / bangalore / kundapur / mangalore per `CITY_CONFIG` (`src/lib/localityUtils.ts`) |
| `locality`, `area_key` | string | slugified locality; fuzzy-matched to known areas where possible |
| `lat`, `lng` | float/null | **exact — private artifacts only, never in reports/fixtures/commits** |
| `lat_public`, `lng_public` | float/null | 2dp **truncate-toward-zero** (Python port of `GeoCoarsener.java`, parity-tested incl. negatives + null-safety) |
| `coordinate_precision` | enum | provenance flag carried end-to-end |
| `direction_key`, `distance_band_key`, `distance_km`, `bearing_deg` | derived | Python port of `RegionalGeo.java`: haversine + 8×45° sectors from city centroid; bands `0_10/10_25/25_50/50_up` (V87) |
| `broker_owner_flag` | enum/null | broker / owner / unknown |
| `listed_at` | date/null | relative dates resolved against `fetched_at` |
| `normalization_warnings` | list | funnel accounting per #1723 `validation-report.md` style |

## C. Dedupe layer

**Blocking** (candidate generation, avoids O(n²)): primary block key `(city_slug, property_type, price_band, area_band)` where price_band is log-bucketed (±15%) and area_band is `area_acres` rounded to 0.5; secondary geo block on 3dp-rounded coordinates where present.

**Scoring** within a block (initial weights, tuned via fixtures):

| Signal | Weight |
|---|---|
| Same `source_id` + `source_listing_id` | exact duplicate (score 1.0) |
| Geo distance < 100 m | 0.35 |
| Price within 5% | 0.25 |
| Area within 5% | 0.20 |
| Title similarity ≥ 0.6 (stdlib `difflib`) | 0.15 |
| Same locality slug | 0.05 |
| Same broker/owner flag | tie-breaker only |
| `listed_at` within 30-day window | required condition for cross-source grouping |

Thresholds: score ≥ 0.75 ⇒ same `duplicate_group_id`; 0.55–0.75 ⇒ `is_suspected_duplicate` (mirrors the `property_listings` field). Canonical record = highest `source_confidence` (per-source prior from registry: broker_export 0.9, manual_csv 0.85, gov_dataset 0.7, portal 0.6), then most recent `fetched_at`.

**Output per record:** `canonical_listing_id` (stable hash of the canonical member's `raw_id`), `duplicate_group_id`, `is_canonical`, `source_confidence`, `quality_score` (0–100) + `quality_breakdown` dict (completeness of price/area/locality/coords, coordinate precision, price plausibility within city p1–p99, source confidence) mirroring the `quality_breakdown` jsonb shape.

## D. Snapshot layer (time series)

Append-only `observations.jsonl`; existing rows are never rewritten. One row per canonical listing per run:

```json
{"canonical_listing_id": "…", "run_id": "2026-07-06T10", "observed_at": "2026-07-06T10:12:00Z",
 "source_id": "manual_csv", "source_listing_id": "BRK-0042",
 "status": "active", "price_paise": 12000000000, "price_changed_from_paise": null,
 "city_slug": "udupi", "locality": "brahmavar", "property_type": "agricultural_land",
 "area_acres": 2.0, "direction_key": "N", "distance_band_key": "0_10",
 "coordinate_precision": "exact", "lat_public": 13.40, "lng_public": 74.74,
 "quality_score": 82}
```

**Status transition logic** (from consecutive runs of the same source scope):

- present now, absent before ⇒ `active` (new; `first_observed_at` recorded)
- present in both, price/area unchanged ⇒ `active`
- present in both, price or area differs ⇒ `changed` (+ `price_changed_from_paise`)
- absent now, present before, **and** the source's checkpoint shows the scope was fully queried this run ⇒ `removed`
- source not run / failed / checkpoint incomplete for that scope ⇒ `unknown` — **removal is never inferred from a partial run**

## E. Reporting layer

All reports read only `observations.jsonl` + the canonical file. **All outputs carry `lat_public`/`lng_public` only** — the report stage cannot even see the private `lat`/`lng` fields (they are dropped at canonical-file write time). Outputs: Markdown summary + CSV/JSON per report. Aggregation is stdlib-only (`statistics`, dict groupby).

| Report | Definition | Maps to |
|---|---|---|
| `median_asking_by_locality` | median/p10/p90 `price_paise` per (city, locality, property_type), 90-day active window | `area_overview_stats` (V70) |
| `price_per_acre` | median `price_per_acre_paise` per locality and corridor, agri only | agri discovery |
| `active_count` | active listings per locality per ISO week; **suppress groups < 10** (k-anonymity, matching V94) | `area_intelligence_snapshot` |
| `new_removed_weekly` | first-observed and removed counts per ISO week | `fresh_listing_count` analog |
| `price_changes` | `changed` observations: old→new, pct | trend direction/pct inputs |
| `supply_by_corridor` | active count per (direction_key, distance_band_key) | V87 corridor model |
| `agri_by_distance_band` | agri parcel count + median price_per_acre per distance band | agri discovery |

Synthetic-derived reports are labelled `DATA: SYNTHETIC` in every output header.

## CLI specification

```
python scripts/property_ingest/cli.py <subcommand> [flags]
```

| Subcommand | Purpose | Notes |
|---|---|---|
| `discover-sources --city udupi` | print registry status table (enabled, gate results, evidence links) | read-only, always safe |
| `crawl --city udupi --since-days 90 --source manual_csv --dry-run` | run enabled+gated adapters → raw JSONL | "crawl" is the issue's verb; for manual/export channels it just reads local input files |
| `normalize --input raw.jsonl --output normalized.jsonl` | stage B | |
| `dedupe --input normalized.jsonl --output canonical.jsonl` | stage C | strips private fields (`lat`,`lng`,`survey_number`,`contact`) from canonical output |
| `snapshot --input canonical.jsonl --output observations.jsonl` | stage D | JSONL in Phase 1 (issue's `.parquet` example deferred to Phase 2) |
| `report --city udupi --input observations.jsonl` | stage E | |

**Global behavior:**

- **`--dry-run` is the default.** `--execute` is required to write anything; for `crawl`, `--execute` additionally requires the compliance gate to pass.
- **Source allowlist:** a source runs only if (a) named via `--source` (repeatable), (b) `enabled: true` in `sources.yaml`, and (c) gate checks pass. Any one missing ⇒ exit code 2 with the specific reason. Every source ships `enabled: false`; enabling is a local, evidence-backed act — never committed.
- `--city {udupi,bangalore,kundapur,mangalore}` (validated against `CITY_CONFIG` slugs); `--since-days N` (default 90).
- **Rate limit:** `--rate-limit <req/min>` may only lower the registry's per-source `max_rate_per_min`, never raise it. Token-bucket, single-threaded, jittered.
- **Identifying User-Agent:** `UdupiPropertyExplorer-DataResearch/0.1 (+<contact-email>; issue-1779; respects robots.txt)` — never a browser-spoofing UA (anti-bot bypass is prohibited).
- **Checkpoint/resume:** `checkpoints/<source_id>.json` records run_id, last offset/page, and the list of completed scopes; `--resume` continues; the snapshot stage reads scope-completeness to decide `removed` vs `unknown`.

### Registry + compliance gate (`sources.yaml` / `registry.py`)

```yaml
- source_id: manual_csv
  enabled: false                 # EVERY source ships false — enabling is local + evidence-backed
  channel: manual                # manual | export | api | crawl
  robots_checked: null           # crawl only: date + archived snapshot path in approvals/
  terms_reviewed: null           # crawl only: date + clause citation
  approval_evidence: null        # path into docs/audit/evidence/property-ingestion-pipeline/approvals/
  login_required: false
  max_rate_per_min: 0            # crawl channels only
  source_confidence: 0.85
```

Gate logic:

- `channel: crawl` ⇒ requires `enabled: true` **and** non-null `robots_checked`, `terms_reviewed`, `approval_evidence`. Missing any ⇒ `ComplianceGateError`, non-zero exit, **before any network I/O is attempted**.
- `channel: manual|export` ⇒ requires `enabled: true` + `approval_evidence`.
- `--dry-run` prints which records would be written and which gates pass/fail; performs zero writes and zero network calls.
- The human-side checklist backing these fields is the [source approval gate](./source-feasibility-template.md#source-approval-gate-checklist).

## Storage: Phase 1 = JSONL + stdlib

- **JSONL** for raw/normalized/canonical/snapshot data — matches the #1723 precedent, diffable, streamable, zero deps, sufficient at 10²–10⁴ records.
- **Markdown/CSV/JSON** for reports.
- **No pyarrow dependency yet.** Parquet and DuckDB are **Phase 2 only**, revisited if volume or report complexity demands them.
- Postgres staging later, and only via generated `import.sql` files (#1723 pattern) — never direct writes; no production mutation; no shared Supabase writes.

## Coordinate handling (restated as design invariants)

1. Exact coordinates, if legally sourced, exist **only** in gitignored `data/property-ingest/raw/` (and normalized private files); they are stripped at canonical-file write time.
2. Committed fixtures: **synthetic or coarsened coordinates only.**
3. Reports/trend-dev outputs: **`lat_public`/`lng_public` only** (2dp truncate-toward-zero, `GeoCoarsener` parity).
4. **Exact coordinates are never committed to the repo** and **never required by UI tests**.
5. `coordinate_precision` provenance travels with every record; `synthetic` + `source_id: synthetic` are permanently ineligible for any future DB import generation.

## Synthetic seed design (PR3)

- Deterministic: `random.Random(seed)`, default seed **1779**.
- **Udupi:** ~400 listings, 60% agri (FARMLAND/PLANTATION mix, 0.5–15 acres, price-per-acre log-normal around per-locality means); localities drawn from the real vocabulary (Brahmavar, Kaup, Hiriadka, Manipal, Katapadi, …) with corridor/band assignment via real centroid math (Udupi 13.3409, 74.7421).
- **Bangalore:** ~800 listings, residential-heavy mix for trend comparison.
- Time series: `listed_at`/`observed_at` spread over the trailing 90 days with weekly run_ids so `new_removed_weekly` and `price_changes` produce non-trivial output; ~10% scripted removals and ~8% scripted price changes mid-series.
- Coordinates: jittered synthetic positions, then coarsened to 2dp; `coordinate_precision: "synthetic"`.
- Output doubles as the committed fixture for trend-aggregation tests.

## Test plan (per stage)

| Suite | Asserts |
|---|---|
| `test_property_ingest_schemas.py` | required fields; `photo_urls` empty; `contact_raw` null; title cap; enum membership (property_type vs V86 vocab, agri categories vs `AgriFieldOptions`) |
| `test_property_ingest_registry.py` | **compliance gate:** disabled source + `--execute` ⇒ `ComplianceGateError`, exit ≠ 0, zero network calls (socket mocked); enabled-but-unevidenced crawl source ⇒ same; dry-run writes nothing (tmp_path empty) |
| `test_property_ingest_geo.py` | coarsen parity with `GeoCoarsener.java` (2dp truncate-toward-zero, negatives, null-safe: 13.34091→13.34, −74.74215→−74.74); direction/band parity with `RegionalGeo.java` fixtures (e.g. Manipal → E of Udupi centroid, band 0_10) |
| `test_property_ingest_normalize.py` | table-driven price parser (Cr/Lakh/L/k/ranges/junk); area conversions vs 4046.8564224; relative-date resolution; warning funnel |
| `test_property_ingest_dedupe.py` | exact dup, near-dup (price ±4%, 80 m) grouped; distinct neighbours not grouped; suspected band; canonical selection by source_confidence then recency |
| `test_property_ingest_snapshot.py` | two-run transitions (new/unchanged/changed/removed); partial-run checkpoint ⇒ `unknown`, never `removed`; append-only (no row rewrites) |
| `test_property_ingest_report.py` | fixture-driven exact medians/counts per report; k-anonymity suppression < 10; synthetic label present |
| **coordinate privacy** (asserted in report/snapshot/seed suites) | walk every emitted artifact + every committed fixture: no coordinate value with > 2 decimal places; no `lat`/`lng` keys in public/dev outputs (only `lat_public`/`lng_public`); no exact private pin exposed by default |

Run: `pytest scripts/test_property_ingest_*.py` from repo root (repo convention — no pytest config file).
