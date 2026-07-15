# City geography preparation (issue #1900)

Operator runbook for the OFFLINE, file-based pipeline that turns a local
OpenStreetMap extract into a byte-deterministic, checksummed batch JSON
consumable by the already-merged #1887 `AreaOnboardingRunner` /
`AreaOnboardingService.dryRun` path — with NO ad-hoc transformation.

The entire pipeline runs on your local machine against a local `.osm.pbf`
(or a tiny `.osm` XML fixture for testing). Nothing here talks to the
network, writes to any database (local or shared/hosted Supabase), or
exposes an HTTP endpoint. The only output that matters to the rest of the
system is a JSON file you hand off to a #1887 operator.

```
.osm.pbf + city + bbox
    │  extract_osm_candidates.py
    ▼
raw candidate JSONL
    │  build_review_csv.py
    ▼
reviewer CSV  ──(human review, fills in decision columns)──▶  reviewed CSV
                                                                    │  build_batch_json.py
                                                                    ▼
                                                    validated, checksummed batch JSON
                                                    (hand off to a #1887 operator)
```

## 0. Prerequisites

```bash
pip install -r scripts/geography/requirements.txt
```

`osmium` + `shapely` are needed ONLY for the extraction step
(`extract_osm_candidates.py`). The CSV/JSON builder scripts are pure
Python stdlib and never import them.

## 1. Download a local OSM extract (never committed to git)

Download a regional `.osm.pbf` from Geofabrik (or another ODbL-licensed
OSM mirror) covering the target city — for Karnataka cities, the
"Southern Zone" extract. Save it OUTSIDE the repo, or anywhere under the
repo root — `.gitignore` excludes `*.osm.pbf` and `southern-zone*`
regardless of location, so it can never be accidentally committed.

**The ~530MB Geofabrik Southern Zone PBF, or any full raw city output, is
NEVER committed to this repository.** Only tiny fixtures, aggregate
metrics, checksums, and the one small compat-IT sample batch JSON are
committed (see §6).

## 2. Extract candidates: Udupi end-to-end

```bash
python3 scripts/geography/extract_osm_candidates.py \
    /path/to/southern-zone-latest.osm.pbf \
    udupi \
    74.60 13.15 74.90 13.50 \
    scripts/geography/output/udupi_raw_candidates.jsonl
```

Args: `pbf` `city` `min_lon` `min_lat` `max_lon` `max_lat` `out`. The bbox
above matches `scripts/geography/city_config.py`'s `udupi` entry — pass
`city_config.get_city_config("udupi")["bbox"]` if scripting this instead
of hardcoding.

**This PR extracts NODE + SIMPLE CLOSED WAY candidates only** (any
`place=city|town|suburb|quarter|neighbourhood|village|hamlet|locality|
isolated_dwelling` node, or a simple closed way with the same tag).
**Administrative-relation/multipolygon area assembly (osmium
`AreaManager` two-pass boundary geometry) is explicitly DEFERRED to a
future PR** — it is NOT performed here, and this script NEVER emits an
unassembled or unfiltered administrative relation. A future PR will add
relation assembly once it is validated to run within an operational time
budget (the investigation that produced this pipeline found every
full-file relation-assembly run killed by a sandbox time limit — see
`docs/audit/evidence/issue-1900-provider-viability/provider-viability-review.md`
§5.3.1). Until then, any administrative-boundary-only locality that has no
corresponding `place=*` node/way simply will not appear as a candidate —
this is a known, deliberate, documented gap, not silently dropped data.

`scripts/geography/output/` is git-ignored — raw extraction output for a
real city never needs to be committed.

## 3. Build the reviewer CSV

```bash
python3 scripts/geography/build_review_csv.py \
    scripts/geography/output/udupi_raw_candidates.jsonl \
    KA udupi \
    scripts/geography/output/udupi_review.csv
```

Every row carries READ-ONLY evidence columns (raw OSM element id/type,
every name variant, place type, admin_level, centroid, bbox, postal code,
wikidata id, a `geometry_trust` value computed by the SAME rule as
`GeometryTrust.classify` in `AreaOnboardingService`, and a digest of the
raw OSM tag dict) plus EMPTY editable decision columns:

| column                     | meaning                                                                 |
|-----------------------------|--------------------------------------------------------------------------|
| `decision`                 | `INCLUDE` \| `EXCLUDE` \| `MERGE` \| `RENAME` — REQUIRED for every row   |
| `merge_target_key`         | required (and must resolve) when `decision=MERGE`                       |
| `canonical_name_override`  | required when `decision=RENAME`; the emitted candidate's `name`         |
| `proposed_area_key`        | pre-filled with a provisional minted key; editable — THE emitted `areaKey` |
| `reviewer`                 | your name/handle — REQUIRED for every row                               |
| `reviewed_at`               | ISO-8601 offset date-time — REQUIRED for every row                      |
| `review_reason`            | free-text note — REQUIRED for `EXCLUDE`/`MERGE`/`RENAME`/`ALIAS`, optional for `INCLUDE` |
| `aliases`                  | optional, `;`-delimited manual alternate names — emitted to the review manifest sidecar (see §5a), never to the #1887 batch JSON |
| `alias_langs`              | optional, `;`-delimited tokens from `name:kn`, `name:en`, `alt_name`, `old_name` — promotes that row's own already-verified evidence value to an alias in the review manifest |

`decision=ALIAS` marks a whole element as an alternate name of another area
(never emitted as its own candidate, like `MERGE`) — its target reuses the
`merge_target_key` column.

**The `;` delimiter constraint**: `aliases` and `alias_langs` are
semicolon-delimited. A raw name variant containing a literal `;` cannot be
represented — none of the current fixtures/real-world OSM name tags in this
pipeline are expected to contain one, but this is a hard format constraint
of the CSV columns, not silently handled.

## 4. Human review

Open the CSV in a spreadsheet tool and, for every row:

- Set `decision`, `reviewer`, and `reviewed_at` — ALL THREE are mandatory
  for every row regardless of decision, or the batch build refuses to
  emit (see §5).
- For `INCLUDE`/`RENAME` rows, check (and edit if needed)
  `proposed_area_key` — it must be a valid `IN|<state>|<district>|<area>`
  key. `RENAME` additionally requires `canonical_name_override`. Optionally
  set `aliases`/`alias_langs` for alternate names to preserve.
- For `MERGE`/`ALIAS` rows, set `merge_target_key` to the area key this
  candidate should merge into or is an alternate name of (either another
  row's `proposed_area_key` in this same CSV, or an existing canonical area
  key — see `--canonical-area-inventory` in §5a). Set `review_reason`.
- **Never edit an evidence column** (`osm_id`, raw names, `place`,
  centroid/bbox, `wikidata`, `geometry_trust`, `raw_tags_digest`, ...).
  This is CODE-ENFORCED, not just a convention: `build_batch_json.py`
  cross-checks every row's evidence columns against the ORIGINAL raw
  candidate JSONL (matched by the row's stable `osm_type`/`osm_id`
  identity) and **refuses to emit** (non-zero exit, naming the exact
  diverging field and OSM id) if any evidence cell was hand-edited. Only
  the decision columns are meant to be filled in by a human.

Two rows minting the SAME `proposed_area_key` within one city are a hard
validation error in the next step — they are **never auto-suffixed**.
Resolve the collision by hand (rename one, or `MERGE` one into the other).

## 5. Build and validate two artefacts: the batch JSON + the review manifest

This step produces **two separate, deterministic, checksummed artefacts**:
the unchanged #1887 batch JSON (§6 below) and a NEW, #1900-owned
`city-area-review-manifest.json` sidecar that carries everything the batch
JSON structurally cannot: every reviewed row (including excluded/merged/
aliased ones), aliases, reviewer identity, review timestamps/reasons, and
full source provenance. Their checksums are DELIBERATELY split:
`artifactChecksum`/`candidatePayloadChecksum` cover only the emitted
candidate list (unchanged from before); `reviewArtifactChecksum` covers the
entire reviewed dataset, so two materially different reviews that happen to
emit the same candidates are never checksum-identical.

### 5a. Prerequisite: write a source manifest

Default (final) mode REQUIRES a source manifest — a small operator-authored
JSON file recording exactly where the raw OSM data came from and its
licence, since none of that is machine-verifiable from the PBF itself (this
pipeline never reads the PBF's own bytes for provenance):

```json
{
  "provider": "OSM",
  "sourceArtifact": "southern-zone-latest.osm.pbf",
  "sourceArtifactSha256": "<64-hex-char sha256 of your local .osm.pbf>",
  "sourceDownloadUrl": "https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf",
  "sourceDownloadedAt": "2026-07-14T00:00:00+00:00",
  "sourceExtractedAt": "2026-07-15T00:00:00Z",
  "licence": {
    "id": "ODbL-1.0",
    "name": "Open Database Licence 1.0",
    "url": "https://opendatacommons.org/licenses/odbl/1-0/",
    "attribution": "Contains data from OpenStreetMap, licensed under the Open Database Licence (ODbL) 1.0. (c) OpenStreetMap contributors. https://www.openstreetmap.org/copyright"
  },
  "cityConfig": { "slug": "udupi", "stateCode": "KA", "bbox": [74.60, 13.15, 74.90, 13.50] },
  "extractionToolVersion": "extract_osm_candidates.py@<git sha or version tag>"
}
```

Compute `sourceArtifactSha256` yourself, e.g.:

```bash
shasum -a 256 /path/to/southern-zone-latest.osm.pbf
```

**Scripts never read the (potentially ~530MB) PBF themselves** —
`sourceArtifactSha256` is always operator-supplied. See
`scripts/geography/fixtures/source_manifest_sample.json` for a complete
worked example. `licence.id` must be a known licence id (`ODbL-1.0` for
OSM); `sourceExtractedAt` is required and becomes the batch JSON's
`sourceExtractedAt` (the single source of truth for that field in final
mode — the CLI's own `--provider`/`--source-extracted-at` flags are
PROVISIONAL-ONLY overrides, ignored whenever `--source-manifest` is given).

### 5b. Optional: a canonical-area inventory for MERGE/ALIAS targets

A `MERGE`/`ALIAS` row's target must resolve — either against another row's
`proposed_area_key` in the SAME reviewed CSV, or against an operator-
exported canonical-area inventory (a JSON array of area-key strings, or a
CSV with an `area_key` column) covering already-onboarded production areas.
This is a **passive, manually-exported input file** — this pipeline adds no
new backend code, HTTP endpoint, or database export tooling to produce it.
Shape-only resolution (any syntactically valid 4-segment key, whether or
not it actually resolves) is accepted ONLY under `--provisional`.

### 5c. Build

```bash
python3 scripts/geography/build_batch_json.py \
    scripts/geography/output/udupi_review.csv \
    scripts/geography/output/udupi_batch.json \
    --raw-jsonl scripts/geography/output/udupi_raw_candidates.jsonl \
    --dataset-id osm-udupi-2026-07 \
    --dataset-version v1 \
    --source-manifest scripts/geography/output/udupi_source_manifest.json \
    --review-manifest-out scripts/geography/output/udupi_review_manifest.json \
    --canonical-area-inventory scripts/geography/output/udupi_canonical_areas.json
```

`--raw-jsonl` MUST point at the SAME raw candidate JSONL that
`build_review_csv.py` (§3) read — it is the AC5 evidence-immutability
cross-check's source of truth (see §4).

**Default mode is strict/final**: `--source-manifest` and
`--review-manifest-out` are REQUIRED, and every `MERGE`/`ALIAS` target must
actually resolve (not merely look shape-valid). Pass `--provisional` for an
early/draft run that relaxes both: manifest args become optional, and
`MERGE`/`ALIAS` targets fall back to shape-only validation. A batch with 0
emitted candidates is refused unless `--allow-empty` is passed.

This step **refuses to emit** (non-zero exit, every problem reported) on
any of:

- an `areaKey` that fails 4-segment validation, or is not idempotent under
  `area_key.normalise()` (i.e. was not minted/edited using the correct
  district CASE rules);
- duplicate emitted area keys — **never auto-suffixed**;
- duplicate `externalSourceId`;
- a duplicate raw candidate identity in `--raw-jsonl` itself (byte-identical
  or conflicting — the conflicting case names every differing field);
- a `geo_center`/bbox lat or lon outside a generous India-wide sanity
  range;
- a bbox with `min > max`;
- a row with no (or an unrecognised) `decision`;
- a blank `reviewer` or `reviewed_at` on ANY row, or a blank `review_reason`
  on an `EXCLUDE`/`MERGE`/`RENAME`/`ALIAS` row;
- `aliases`/`alias_langs` populated on an `EXCLUDE`/`MERGE` row, an unknown
  `alias_langs` token, or an `alias_langs` token whose referenced evidence
  cell is blank;
- a `MERGE`/`ALIAS` row with an absent or unresolved `merge_target_key`
  (shape-only accepted ONLY under `--provisional`);
- a `RENAME` row missing `canonical_name_override`;
- a missing/invalid `--source-manifest` in default (final) mode (bad
  sha256, unknown licence, missing `sourceExtractedAt`, `bbox` with
  `min > max`, ...);
- 0 candidates emitted without `--allow-empty`;
- a blank/unsupported `datasetId`/`datasetVersion`/`provider`/
  `inputSchemaVersion`, or an unparsable `sourceExtractedAt`;
- **any evidence column that diverges from the raw candidate JSONL**
  (matched by `osm_type`/`osm_id`) — including a row with no matching raw
  record at all, or a tampered `geometry_trust` (recomputed and checked,
  not merely trusted);
- (when `--expected-checksum`/`--expected-review-checksum` is supplied) a
  recomputed checksum that does not match.

On success it prints the emitted candidate count, `artifactChecksum`, and
(when a manifest was written) `reviewArtifactChecksum`, and writes
byte-deterministic JSON files: fixed top-level key order, candidates/
reviewed rows sorted (`areaKey` / `externalSourceId` respectively),
deterministic (locale-independent) float formatting, LF line endings,
UTF-8. **Re-running this command against the exact same inputs always
produces byte-identical output and identical checksums** — this is what
makes both artefacts reproducible and auditable.

## 6. Hand off to #1887

The output file (`udupi_batch.json` above) is the exact
`CandidateBatchFile` shape `AreaOnboardingRunner` reads:

```json
{
  "datasetId": "...", "datasetVersion": "...", "artifactChecksum": "...",
  "provider": "OSM", "inputSchemaVersion": "1",
  "sourceExtractedAt": "2026-07-15T00:00:00Z" | null,
  "candidates": [
    { "areaKey": "...", "name": "...", "geoCenterLat": 13.34, "geoCenterLon": 74.75,
      "minLat": null, "minLon": null, "maxLat": null, "maxLon": null,
      "geometrySource": "OSM", "externalSourceId": "node/245620117" }
  ]
}
```

Hand this file to a #1887 operator to point
`app.area-onboarding.candidates-resource` at (classpath or filesystem
resource URL) and run a dry-run. **This file's shape and bytes are
UNCHANGED by the user-correction rework** — it never carries reviewer
identity, aliases, source provenance, or excluded/merged rows; all of that
lives in the separate `city-area-review-manifest.json` sidecar (§6a) built
alongside it. This repository commits ONE tiny, already-produced sample at
`backend/src/test/resources/area-onboarding/sample-1900-udupi-batch.json`,
consumed by `AreaOnboarding1900ArtifactCompatIT` — a Testcontainers test
that deserializes it via the REAL Spring `ObjectMapper` bean into
`CandidateBatchFile` and runs it through `AreaOnboardingService.dryRun`
against real Postgres, proving the artefact this pipeline produces is
directly consumable with no transformation. A byte-level sha256 assertion
in that same test class guards this file's bytes never drifting (see the
class's `SAMPLE_RESOURCE_SHA256` constant).

### 6a. The review manifest sidecar

`city-area-review-manifest.json` (`--review-manifest-out`) is a SEPARATE,
`#1900`-owned artefact — never consumed by `AreaOnboardingRunner`/
`AreaOnboardingService` today (a future issue may add a consumer). Shape:

```json
{
  "manifestSchemaVersion": "1",
  "datasetId": "...", "datasetVersion": "...", "provider": "OSM",
  "licence": { "id": "ODbL-1.0", "name": "...", "url": "...", "attribution": "..." },
  "source": {
    "sourceArtifact": "...", "sourceArtifactSha256": "...",
    "rawCandidateJsonlSha256": "...", "reviewedCsvSha256": "...",
    "sourceDownloadUrl": "...", "sourceDownloadedAt": "..." ,
    "sourceExtractedAt": "...", "extractionToolVersion": "..."
  },
  "cityConfig": { "slug": "udupi", "stateCode": "KA", "bbox": [74.60, 13.15, 74.90, 13.50] },
  "reviewSummary": { "totalRows": 0, "includeCount": 0, "excludeCount": 0,
                      "mergeCount": 0, "renameCount": 0, "aliasCount": 0, "emittedCount": 0 },
  "reviewedRows": [
    { "osmType": "node", "osmId": "245620117", "externalSourceId": "node/245620117",
      "rawName": "Udupi", "decision": "INCLUDE",
      "canonicalAreaKey": "IN|KA|Udupi|Udupi", "canonicalName": "Udupi",
      "mergeTargetKey": null,
      "aliases": [{ "value": "ಉಡುಪಿ", "lang": "kn", "source": "osm" }],
      "reviewer": "...", "reviewedAt": "...", "reviewReason": null,
      "emittedToBatch": true }
  ],
  "emittedBatch": { "candidateCount": 0, "candidatePayloadChecksum": "..." },
  "reviewArtifactChecksum": "..."
}
```

`reviewedRows` includes EVERY row — `INCLUDE`, `EXCLUDE`, `MERGE`, `RENAME`,
and `ALIAS` alike, sorted by `externalSourceId`; each row's `aliases` array
is sorted by `(source, value)`. The manifest carries no float fields at all
(lat/lon stay in the batch JSON), which is what makes its checksum
trivially float-format-safe.

**`source.rawCandidateJsonlSha256` / `source.reviewedCsvSha256`** are
**program-computed** — `build_batch_json.py` hashes the ACTUAL bytes of the
`--raw-jsonl` and `--reviewed-csv` files it was invoked with (SHA-256, via
`compute_file_sha256`) and writes the result here on every run. This is
DELIBERATELY different from `source.sourceArtifactSha256` immediately
above it, which is always OPERATOR-SUPPLIED (the tool never reads the
underlying PBF and so can't verify that value itself). Because both hashes
live inside `source`, they are automatically covered by
`reviewArtifactChecksum` (§ above) — closing the gap where an approved
review's manifest previously had no cryptographic tie to the exact raw
extraction it was reviewed against. In particular, a MERGE/EXCLUDE/ALIAS
row's `reviewedRows` entry retains only a reduced subset of its original
evidence (OSM identity, raw name, decision, target, aliases, reviewer
metadata) — `rawCandidateJsonlSha256` is what makes a later, undetected
edit to that row's *original* raw evidence (followed by regenerating a
CSV consistent with the tampered raw JSONL) detectable: the hash — and
therefore `reviewArtifactChecksum` — changes even though every recorded
`reviewedRows` field for that row is unaffected.

**The checksum split**: `emittedBatch.candidatePayloadChecksum` is the
IDENTICAL value (same algorithm, same bytes) as the batch JSON's own
`artifactChecksum` — nothing about that computation changed.
`reviewArtifactChecksum` is a DIFFERENT, broader checksum: a sha256 over
the ENTIRE manifest (everything above except the checksum field itself),
canonicalised via `json.dumps(sort_keys=True, ensure_ascii=False,
separators=(",",":"))`. Two reviews that emit the identical 3 candidates
but differ in which rows were excluded, or in reviewer/alias/provenance
metadata, are therefore GUARANTEED to have different
`reviewArtifactChecksum` values even though their `artifactChecksum`/
`candidatePayloadChecksum` match. Pass `--expected-review-checksum` to
verify reproducibility the same way `--expected-checksum` already does for
the batch.

This repository additionally commits
`backend/src/test/resources/area-onboarding/sample-1900-udupi-review-manifest.json`
— the manifest for the exact same compat-IT sample dataset, proving the
manifest sidecar regenerates byte-identically alongside the unchanged batch
JSON (see `scripts/geography/tests/test_build_batch_json.py::TestD2RegressionGuard`).

### Exact regeneration commands (compat-IT sample)

```bash
python3 scripts/geography/build_batch_json.py \
    scripts/geography/fixtures/reviewed_udupi_compat_it_sample.csv \
    /tmp/regen-batch.json \
    --raw-jsonl scripts/geography/fixtures/compat_it_raw_candidates.jsonl \
    --dataset-id issue-1900-udupi-compat-sample --dataset-version v1 \
    --source-manifest scripts/geography/fixtures/source_manifest_sample.json \
    --review-manifest-out /tmp/regen-manifest.json
# /tmp/regen-batch.json is byte-identical to
# backend/src/test/resources/area-onboarding/sample-1900-udupi-batch.json;
# /tmp/regen-manifest.json is byte-identical to
# backend/src/test/resources/area-onboarding/sample-1900-udupi-review-manifest.json
```

## 7. A second city: Bangalore, config-only

Onboarding a second (or third) city requires **zero script changes** —
only a `scripts/geography/city_config.py` entry:

```python
CITY_CONFIG = {
    "udupi":     {"state_code": "KA", "bbox": (74.60, 13.15, 74.90, 13.50)},
    "bangalore": {"state_code": "KA", "bbox": (77.35, 12.75, 77.85, 13.20)},
}
```

Then repeat §2-§6 with `city=bangalore` and the Bangalore bbox — same
scripts, same validation, same byte-determinism guarantees.

## Data provenance, licensing, and exclusion rules

- **Source**: OpenStreetMap, via a Geofabrik regional `.osm.pbf` extract.
  **Contains data from OpenStreetMap, licensed under the Open Database
  Licence (ODbL) 1.0. © OpenStreetMap contributors.
  https://www.openstreetmap.org/copyright** — every OSM-derived artefact
  this pipeline produces or that is committed to this repository
  (`scripts/geography/fixtures/tiny_city.osm`,
  `scripts/geography/fixtures/raw_candidates_sample.jsonl`, the compat-IT
  sample batch JSON) carries this attribution, either inline (see
  `scripts/geography/fixtures/NOTICE.md`) or in this document.
  Downloading, processing, storing extracted candidates in Postgres via
  #1887, and internal display are all permitted under ODbL with
  attribution; external redistribution of a substantial extract would
  trigger ODbL's share-alike clause — a legal consideration for whoever
  operates a public-facing redistribution of this data, not a constraint
  on this offline preparation pipeline itself.
- **Never committed to this repository**: the Geofabrik `.osm.pbf` extract
  (hundreds of MB), any full raw city output (`scripts/geography/output/`
  is git-ignored), or any "No License Provided" / unverified provider data
  (e.g. OpenCity, BBMP raw exports, KGIS). Only tiny hand-authored or
  hand-excerpted ODbL fixtures, aggregate metrics, checksums, and the one
  small compat-IT sample are committed.
- **Never used as a candidate source**: listing text, broker free text,
  search-engine snippets, or LLM-generated locality lists. The extractor
  reads OSM tags only; there is no `WebSearch`/LLM call anywhere in this
  pipeline.

## What this PR does NOT do

- No administrative-relation/multipolygon area assembly (§2, deferred).
- No DB-backed curation platform, no new Flyway migration, no new
  canonical/curation table, no write to shared/hosted Supabase, no
  OpenSearch integration, no new HTTP endpoint.
- No modification of the merged #1887 PR1 code
  (`AreaOnboardingRunner`/`AreaOnboardingService`/`AreaKeyFormat`/
  `GeometryTrust`/`V115`) or the in-progress #1887 PR2 branch — this
  pipeline builds strictly on top of that already-merged contract.

## Tests

```bash
# Pure-Python + transform-step tests (osmium-free where possible; the
# extractor test is guarded with pytest.importorskip and is skipped, not
# failed, when osmium isn't installed):
python3 -m pytest scripts/geography/tests/ -v --tb=short

# Testcontainers compat proof (requires Docker):
cd backend && mvn -Dtest=AreaOnboarding1900ArtifactCompatIT test
```
