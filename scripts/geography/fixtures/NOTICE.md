# Attribution — scripts/geography/fixtures/

Every OSM-derived fixture in this directory (`tiny_city.osm`,
`raw_candidates_sample.jsonl`) contains data from OpenStreetMap:

> Contains data from OpenStreetMap, licensed under the Open Database
> Licence (ODbL) 1.0. © OpenStreetMap contributors.
> https://www.openstreetmap.org/copyright

`tiny_city.osm` is hand-authored (illustrative coordinates, not real
extracted geometry) for exercising the osmium extraction step without
committing the 555MB Geofabrik Southern Zone PBF.

`raw_candidates_sample.jsonl` is a tiny excerpt (place=node records only,
real Udupi-district OSM data) reused from the already-committed,
already-reviewed provider-viability evidence at
`docs/audit/evidence/issue-1900-provider-viability/osm-samples/udupi_node_sample.jsonl`
— used here to exercise the pure-transform (JSONL -> CSV -> JSON) steps
without requiring osmium at all. It carries one record per OSM element id
referenced by `reviewed_udupi_sample.csv` (Belman/Udupi/Ambagilu) so
`build_batch_json.py`'s AC5 evidence cross-check (every reviewed-CSV row's
evidence columns must match the corresponding raw JSONL record) can run
against this fixture end-to-end.

`compat_it_raw_candidates.jsonl` mirrors the same three real Udupi-district
OSM points (Ambagilu/Mabukala/Mundkina Jaddu) already committed, reviewed,
and attributed via `backend/src/test/resources/area-onboarding/
sample-1900-udupi-batch.json` — reconstructed here so the #1900 rework's D2
regression-guard tests can prove that file's bytes are still produced
byte-for-byte by `build_batch_json.py`. Same ODbL/OpenStreetMap attribution
applies.

`reviewed_udupi_alias_merge_sample.csv` / `raw_candidates_alias_merge_sample.jsonl`
are hand-authored/illustrative (like `tiny_city.osm`), not real extracted
OSM data — used only to exercise the ALIAS/MERGE decision types, the
alias/alias_langs columns (including a real Kannada string, for the
non-ASCII round-trip test), and the review-manifest sidecar end-to-end.

No 555MB PBF, no full raw city output, no "No License Provided"
(OpenCity/BBMP) or unverified (KGIS) source data is committed anywhere in
this repository — see `.gitignore` and `docs/ops/city-geography-preparation.md`.
