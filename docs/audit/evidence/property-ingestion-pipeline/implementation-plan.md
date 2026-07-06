# Issue #1779 — Compliant Listing Ingestion Pipeline: Implementation Plan

**Status:** PLAN_APPROVED_WITH_SMALL_ADJUSTMENTS (plan-only; no code in this PR)
**Companion docs:** [source-feasibility-template.md](./source-feasibility-template.md) · [pipeline-design.md](./pipeline-design.md)

## Goal

A compliance-first, CLI-only, local/dev listing-ingestion pipeline that can eventually feed the trends pages and agri discovery with Udupi + Bangalore data (agricultural land + residential comparison, ~90-day observation windows). The #1723 Housing.com import proved the need: its raw→normalized→import.sql transform was run out-of-band and never committed; #1779 formalizes that gap into a real, gated pipeline.

## Phase 1 recommendation (explicit)

Phase 1 is **exactly** this, and nothing more:

- **manual CSV import** (adapter, disabled by default like all sources)
- **broker/dealer export import** (adapter, disabled by default)
- **synthetic seed data** for trends-page development
- **local JSONL outputs** (gitignored `data/property-ingest/`)
- **no portal crawling**

Portal adapters remain **research-only** unless and until a source feasibility row in [source-feasibility-template.md](./source-feasibility-template.md) is explicitly approved through the source approval gate. No compliant automated source currently covers Udupi agricultural listings — broker exports, manual CSV, and synthetic seed are the honest Phase 1 reality.

## No live scraping in PR1/PR2/PR3

| PR | Scope | Network calls to listing sources |
|---|---|---|
| PR1 | **Docs only** (this PR) | None |
| PR2 | **CLI skeleton only** — schemas, registry, disabled adapters, local file I/O, tests | **None** (no network code paths at all) |
| PR3 | **Synthetic/dev seed only** — deterministic generator + trend fixture tests + README | None |
| PR4+ | May add real source adapters (CSV/export first) **only after** the corresponding feasibility row is approved via the source approval gate | Only per approved row, rate-limited, robots/terms-gated |

Live scraping of any portal is out of scope for PR1–PR3 unconditionally.

## 1. Current repo findings

- **Language/CLI convention:** Python is the established data-tooling language. Reference CLI: `scripts/opensearch_rebuild.py` (argparse, module-docstring usage examples, `--dry-run`, `--allow-non-localhost` safety gate, env-var config). Dependencies in per-tool `scripts/requirements-*.txt` with each dep commented with its owning issue number. Tests are flat pytest files `scripts/test_<tool>.py` (e.g. `scripts/test_opensearch_rebuild.py`, `scripts/test_gen_perf_listings.py`). Frontend uses npm; no Makefile/pyproject.
- **Synthetic-data precedent:** `scripts/gen_perf_listings.py` + `scripts/README-perf-generator.md` + `scripts/requirements-perf.txt`.
- **Seed fixtures:** `scripts/db/fixtures/*.sql` (`discover-smoke-seed.sql`, `agricultural-listings-seed.sql`) applied via `scripts/db/seed-*.sh` wrappers (`set -euo pipefail`, "NEVER run against production" header, `PG_TEST_PORT` default 5434).
- **Prior import (#1723):** `data/imports/bangalore-housing-1723/` — `raw-apify-output.json` → `normalised-listings.json` → `import.sql` + `validation-report.md` (exclusion funnel, no-fabrication rules). The transform script was never committed. Known constraint: Apify actor `unfenced-group/housing-scraper` covers 11 metros only (Bengaluru yes, ~1782-listing ceiling; **no Udupi/Mangalore**).
- **Trends data contracts:** trends read **precomputed rollup tables**, not live listings — `area_overview_stats` (V70, populated by `AreaOverviewRollupJob`, rolling 90-day window: `median_price_paise`, p10/p90, `property_type_dist` jsonb, trend direction/pct, confidence tier) and `area_intelligence_snapshot` (V94: active/fresh counts, dominant property type, k-anonymity suppression below 10 active). Endpoints: `TrendsController.java`, `BuyerAreaIntelligenceController.java`. **All prices in paise (Long).**
- **`property_listings` essentials:** lowercase `property_type` CHECK including `'agricultural_land'` (V86); `price_paise` source of truth; `land_area`/`land_area_unit` + normalized `area_sqm/sqft/cent`; `latitude/longitude` + `boundary geography(Polygon,4326)` (agri acreage computed at read: `ST_Area / 4046.8564224`); `locality/area_key/area_label`; city derived via `areas.city_id → cities.slug` join (no city column); dedupe fields `is_duplicate/is_suspected_duplicate/dedupe_hash`; `quality_score` + `quality_breakdown` jsonb.
- **Agri vocabulary:** `AgriFieldOptions.java` — SCREAMING_SNAKE_CASE canonical sets (LAND_CATEGORIES: FARMLAND, PLANTATION, FARM_PLOT, AGRICULTURAL_PLOT, OTHER); frontend mirror `src/lib/agriFieldLabels.ts`; `AGRICULTURAL_LAND_PROPERTY_TYPE = 'agricultural_land'` in `src/lib/listing-constants.ts`.
- **Corridor/direction/distance-band model:** V87 `regional_distance_bands` (`0_10/10_25/25_50/50_up`), `regional_directions` (8×45° sectors), `regional_area_classifications`; V88 human corridor labels ("E towards Manipal"); geo helper `RegionalGeo.java` (`bearingDeg`, `directionKey`). Udupi centroid 13.3409, 74.7421. Frontend `CITY_CONFIG` in `src/lib/localityUtils.ts` (udupi/kundapur/mangalore/bangalore).
- **Coordinate privacy:** `backend/src/main/java/com/example/realestate/geo/GeoCoarsener.java` — `PUBLIC_COORD_DECIMALS = 2`, truncate-toward-zero (~1.1 km), null-safe; parity across anonymous surfaces is itself a security requirement. `coordinate_precision` provenance-flag precedent on schools (V68: `exact_school`/`approximate_village`). Gate F (security-reviewer) is mandatory for coordinate/PII work per `.claude/skills/ROUTE_AND_RUN_TABLES.md`. Field-classification audit template: `docs/audit/evidence/issue-1726-public-pin-exposure/audit.md`.
- **Naming collision:** the backend already has a runtime `com.example.realestate.ingestion` package (`@Scheduled` RawPost AI-classification pipeline). The new tool is named **`property-ingest`** and is entirely unrelated to that package.

**Recommended location:** `scripts/property_ingest/` Python package (a justified, documented deviation from the flat single-file convention — this is a 6-subcommand, multi-stage pipeline), with flat `scripts/test_property_ingest_*.py` pytest files and `scripts/requirements-property-ingest.txt` per repo convention.

**Recommended language/runtime: Python 3.** Every existing data CLI in this repo is Python/argparse/pytest; TypeScript under `scripts/` exists only as `.mjs` UI-capture helpers with no test wiring. A TS pipeline would introduce a second toolchain with no precedent.

## 2. Source feasibility approach

The feasibility matrix design, pre-filled rows, portal-source policy, and the **source approval gate checklist** live in [source-feasibility-template.md](./source-feasibility-template.md). Summary of the standing policy:

- Every candidate source starts **RESEARCH_ONLY** unless it is permissioned by construction (manual CSV, broker/dealer exports).
- **Housing.com, 99acres, MagicBricks, and NoBroker are NOT implementation targets.** They are RESEARCH_ONLY by default, no crawling enabled, and no adapter implementation beyond a disabled placeholder unless a feasibility row for them is explicitly approved.
- Uncertainty in any column ⇒ RESEARCH_ONLY. Never assume a portal is allowed.

## 3. Pipeline architecture

Full schemas, dedupe algorithm, snapshot status logic, reporting definitions, CLI spec, and compliance-gate design live in [pipeline-design.md](./pipeline-design.md). Shape:

```
sources.yaml (registry, all enabled:false)
   │  compliance gate
   ▼
[adapter] → raw JSONL → [normalize] → normalized JSONL → [dedupe] → canonical JSONL
                                                              │
                                          [snapshot] → observations JSONL (append-only time series)
                                                              │
                                          [report] → Markdown/CSV/JSON trend-dev reports
```

Five pure file→file stages, each re-runnable and testable in isolation. All runtime data lives under gitignored `data/property-ingest/`.

## 4. Storage recommendation

**Phase 1: JSONL for raw/normalized/canonical/snapshot data; Markdown/CSV/JSON for reports; no pyarrow dependency.**

| Option | Verdict |
|---|---|
| **JSONL** | **Phase 1 choice for all pipeline stages.** Matches the #1723 precedent, diffable, streamable, zero dependencies, sufficient at realistic volume (10²–10⁴ records). |
| Parquet | **Phase 2 only.** pyarrow (~80 MB) conflicts with the repo's lean, commented-requirements convention for no query benefit at this scale. The issue's `property-ingest snapshot --output snapshots.parquet` example is simplified to `.jsonl` in Phase 1. |
| DuckDB | **Phase 2 only.** Plain-Python `statistics.median` + dict groupby covers every Phase 1 report with stdlib alone. Revisit if report complexity or volume grows. |
| Postgres staging tables | Later, only when the pipeline graduates toward feeding `area_overview_stats`-shaped rollups — and then via generated `import.sql` files like #1723, never direct writes (hard constraints: no production mutation, no shared Supabase writes). |

## 5. CLI design

Summary (full flag semantics in [pipeline-design.md](./pipeline-design.md)):

```
python scripts/property_ingest/cli.py discover-sources --city udupi
python scripts/property_ingest/cli.py crawl --city udupi --since-days 90 --source manual_csv --dry-run
python scripts/property_ingest/cli.py normalize --input raw.jsonl --output normalized.jsonl
python scripts/property_ingest/cli.py dedupe --input normalized.jsonl --output canonical.jsonl
python scripts/property_ingest/cli.py snapshot --input canonical.jsonl --output observations.jsonl
python scripts/property_ingest/cli.py report --city udupi --input observations.jsonl
```

- `--dry-run` is the **default**; `--execute` is required to write anything.
- Source allowlist: a source runs only if named via `--source` **and** `enabled: true` in `sources.yaml` **and** all compliance-gate checks pass. Every source ships `enabled: false`.
- `--city` validated against `CITY_CONFIG` slugs; `--since-days` default 90.
- Strong rate limit: CLI `--rate-limit` can only lower the registry's per-source `max_rate_per_min`, never raise it.
- Identifying User-Agent: `UdupiPropertyExplorer-DataResearch/0.1 (+<contact>; issue-1779; respects robots.txt)` (contact email = open decision).
- Checkpoint/resume per source; checkpoint completeness drives the snapshot layer's removed-vs-unknown distinction.
- Robots/terms gate enforced in `registry.py` before any I/O.

## 6. PR breakdown

- **PR1 — docs only (this PR):** the three documents in this directory. No code, no crawling, no DB/Supabase writes, no adapters, no backend/API changes.
- **PR2 — CLI skeleton only, no network calls:** `scripts/property_ingest/{cli,registry,schemas,geo,normalize,dedupe,snapshot,report}.py`; `adapters/{__init__,manual_csv,broker_export}.py` (adapter interface + **disabled** stubs); `sources.yaml` (every source `enabled: false`); `scripts/requirements-property-ingest.txt`; `.gitignore` entry for `data/property-ingest/`; pytest suites for schemas, compliance gate, geo parity, normalize, dedupe, snapshot.
- **PR3 — synthetic Udupi/Bangalore seed + trend fixture tests + README:** `synth_seed.py` (deterministic, seed=1779), committed fixture JSONL (synthetic coordinates only), report/trend-aggregation fixture tests, `scripts/README-property-ingest.md`.
- **PR4+ (later, gated):** manual CSV / broker-export adapters made enable-able first (still `enabled: false` in-repo; flipped locally with approval evidence). **No portal crawling adapter unless its feasibility row reaches ENABLE_CANDIDATE with recorded sign-off.**

## 7. Test plan

| Test area | Asserts |
|---|---|
| Raw schema validation | Required fields; `photo_urls` must be empty; `contact_raw` must be null; title length cap — compliance encoded as schema tests |
| Normalization | Table-driven price parser (₹ Cr/Lakh/L/k, ranges, junk → null + warning); area conversions (acre/cent/gunta/sqft) against the backend constant 4046.8564224; relative-date parsing |
| Geo parity | Python coarsen matches `GeoCoarsener.java` semantics (2dp truncate-toward-zero incl. negatives, null-safe); direction/band matches `RegionalGeo.java` on known fixtures |
| Dedupe | Fixture pairs: exact dup, near-dup grouped; distinct neighbours not grouped; suspected band; canonical selection by source confidence |
| Snapshot | Two-run fixtures: new→active, unchanged→active, price change→changed, disappeared→removed; partial/failed run→unknown (never inferred removal) |
| Trend aggregation | Fixture-driven exact expected medians/counts per report; k-anonymity suppression below 10 |
| **Coordinate privacy** | Walk every report/snapshot/seed output and every committed fixture: no coordinate with more than 2 decimal places; no `lat`/`lng` fields in public/dev outputs (only `lat_public`/`lng_public`); no exact private pin exposed by default |
| **Compliance gate** | Attempting `crawl --execute` on a disabled or unevidenced source ⇒ `ComplianceGateError`, non-zero exit, zero network calls (socket mocked); `--dry-run` writes nothing |

## 8. Exact-coordinate handling policy

- Raw **exact** coordinates, if legally sourced, may exist **only** in gitignored local raw/private output (`data/property-ingest/raw/`).
- **Committed fixtures must use synthetic or coarsened coordinates only.**
- Reports and trend-dev outputs must expose **only public-safe/coarsened coordinates** (`lat_public`/`lng_public`, 2dp truncate-toward-zero, `GeoCoarsener` parity).
- **Exact coordinates must never be committed to the repo.**
- **Exact coordinates must never be required for UI tests.**
- Every record carries a `coordinate_precision` provenance flag (`exact` / `approximate` / `locality_centroid` / `synthetic` / `none`); `exact` records are valid only inside the private raw stage.

## 9. Fable implementation handoff (after PR1 merges)

The next safe implementation ask (PR2+PR3 scope) is, verbatim:

> Implement the property-ingest CLI skeleton per `docs/audit/evidence/property-ingestion-pipeline/pipeline-design.md`:
> - create the Python CLI skeleton under `scripts/property_ingest/`
> - **no network calls anywhere**
> - source registry (`sources.yaml`) with **all portal sources disabled**
> - **manual CSV adapter only** (plus the adapter interface)
> - synthetic seed generator (deterministic, Udupi + Bangalore)
> - schema validation tests
> - coordinate privacy tests
> - compliance-gate tests

Anything beyond that list (real broker-export parsing, any portal adapter, any DB import) requires a separate approval referencing an approved feasibility row.

## 10. Risks and open user decisions

Risks:

- **Synthetic-data leakage into real trends:** mitigated by `source_id: synthetic` + `coordinate_precision: synthetic` being permanently ineligible for any future `import.sql` generation; the importer must filter on both.
- **ToS drift:** a source approved once may change terms; the approval gate records a checked date and robots snapshot so re-verification is auditable.
- **Udupi data scarcity:** Phase 1 trend development depends on synthetic seed until broker/manual channels produce volume; reports must label synthetic-derived output clearly.
- **Name confusion** with the backend `ingestion` package: documented here and in the PR2 README.

Open decisions needed from the user:

1. **Contact email / User-Agent string** for the identifying UA.
2. **Whether exact private coordinates should ever be stored beyond local raw files** (e.g. a future private/internal table) — default is local-only.
3. **Whether to prioritize Udupi broker CSV/manual import first** (recommended: yes — the only compliant Udupi agri channel today; requires a broker-outreach/collection workflow).
4. **Whether to allocate budget for licensed data providers** (PropEquity / CRE Matrix class); if yes, Udupi-coverage research becomes the top acquisition task.
5. **Whether JSONL-only Phase 1 is approved** (Parquet/DuckDB deferred to Phase 2).
6. **Who signs off source feasibility rows** (compliance-approval owner; Gate F security-reviewer involvement for coordinate surfaces).
