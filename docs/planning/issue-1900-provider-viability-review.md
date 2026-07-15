# Issue #1900 — Provider Viability Review: OSM/Geofabrik vs Official Government Geo-Data

**Status:** Investigation and prototype only. No production code, no Flyway migrations, no
canonical database rows were created or modified. All extraction ran against local,
disposable files and a scratch virtualenv; no shared Supabase or production database was
touched; no public request-path calls were made to any geography provider; no
Google/Mappls/HERE/Nominatim geocoding and no LLM-filled localities were used.

**Trial cities:** Bangalore (Bengaluru) and Udupi, Karnataka.

**Related work:** this investigation was originally scoped to feed
[`issue-1900-geography-curation-plan-review.md`](issue-1900-geography-curation-plan-review.md)'s
database-backed architecture (the `geo_provider` / `geo_provider_extract` /
`geo_raw_candidate` / `curated_area_candidate` / `curated_candidate_provenance` /
`curated_candidate_alias` / `curated_dataset` model). **That model was the
original design; it is now retained only as a future-scale option**, per the
superseding decision added to that document — the investigation's own
findings (node/way-level OSM discovery plus mandatory human reconciliation,
§9 below) motivated deferring it in favour of an offline extraction →
reviewed artifact → #1887 batch/dry-run/apply MVP. `curated_area_candidate`
etc. are **not** the active architecture this report's recommendations feed
into; §10 below reflects the current, narrower scope. The existing #1887
`CandidateInput` handoff contract (`areaKey, name, geoCenterLat, geoCenterLon,
minLat, minLon, maxLat, maxLon, geometrySource, externalSourceId`) remains
directly relevant and is now wrapped in a batch-level `CandidateBatchFile`
(dataset/provider/checksum identity) on `main`.

---

## 1. Executive verdict

| Source category | Verdict |
|---|---|
| **OpenStreetMap / Geofabrik — locality discovery, identity, naming** | **VIABLE_PRIMARY** for locality candidate discovery, buyer-facing display names, alternate/vernacular names, and Kannada names. This part of the verdict rests on complete, trustworthy node/way counts (§3/§4). |
| **OpenStreetMap / Geofabrik — administrative-polygon extraction** | **OPERATIONALLY UNVALIDATED AT FULL SCALE.** Relation/multipolygon area-assembly was proven *mechanically correct* on a bounded 3-record sample (§5.3.1) but a full, bbox-correct, per-city polygon count was never completed — every full-file attempt was killed by this investigation's sandbox before finishing. Treat per-city polygon coverage as an open measurement, not a confirmed percentage, until a dedicated-compute or pre-clipped-extract run is done. |
| **Official Indian government sources** | **VIABLE_CORROBORATING**, not primary. The clean, unambiguously-licensed layer (Local Government Directory + India Post PIN directory + Survey of India admin boundaries, all GODL-India) gives authoritative *names, codes, and PIN-level locality references* but **no usable polygon geometry** for either city. The one source that could plausibly supply ward/village *polygons* for both cities (KGIS) has an unverified licence and was unreachable from this environment — **VIABLE_WITH_LIMITATIONS** pending manual browser confirmation. Bangalore-specific ward geometry exists (OpenCity, DataMeet) but is licence-encumbered or community-derived, not official-source-clean. This investigation found no reachable, licence-verified government or community ward-polygon dataset for Udupi. |

**Visible limitations carried forward from this verdict (not buried in later sections):**
1. OSM polygon/relation coverage is *unmeasured at full scale* — only a 3-record proof-of-concept exists (§5.3.1).
2. The Bangalore/Udupi §3/§4 sample-locality tables include relation matches found **by name only** in the defective v1 pass (no resolved geometry) alongside genuinely bbox-filtered node/way matches — the two are now labelled separately (§3/§4) and must not be treated as equally verified.
3. The 711 "duplicate normalised name" count (§3) is computed over the full leak-contaminated 6,483-record file, not a clean Bangalore-bbox-scoped set — see the caveat in §3.
4. KGIS licence/reachability is unresolved; ODbL derivative-database scope for a combined OSM+government+manual dataset is not legally settled; BBMP-derived ward geometry has an unclear upstream licence. All three are open items in "Unresolved decisions requiring user approval" below, not implicitly closed by the recommended strategy in §9.

**Recommended initial strategy:** **OSM primary + government corroboration (identity/codes only, not geometry) + manual curation for the sub-locality/vernacular layer.** See §9.

---

## 2. Source inventory

| Provider/dataset | Authority | Coverage | Format | Geometry | Stable IDs | Aliases/languages | Licence | Cost | Automation | Recommended role |
|---|---|---|---|---|---|---|---|---|---|---|
| Geofabrik Southern Zone extract | OpenStreetMap Foundation (via Geofabrik) | Blr ✅ Udupi ✅ (+ all South India) | `.osm.pbf` | Point (nodes) + polygon (ways/relations via area assembly) | OSM element type+id (stable but can be reissued on redraw) | `name`, `name:kn`, `name:en`, `alt_name`, `old_name` present on a meaningful subset | ODbL 1.0, share-alike | Free | High — scriptable, reproducible | **IDENTITY, DISPLAY_NAME, ALIAS, GEOMETRY (admin boundaries)** |
| Local Government Directory (LGD) | Ministry of Panchayati Raj | Blr ✅ Udupi ✅ (all-India) | CSV (+ mirror 7z archives) | None | LGD code (govt-assigned, very stable) | Official name only, no vernacular aliases | GODL-India | Free | Medium — bulk CSV, no live API found | **ADMIN_PARENT, OFFICIAL_NAME, CORROBORATION** |
| All India Pincode Directory | India Post / OGD (data.gov.in) | Blr ✅ Udupi ✅ | CSV + JSON API (key required) | None (no lat/long) | Pincode + office name (stable) | Office name only | GODL-India | Free (registration for API) | Medium — bot-blocked in this environment, needs keyed/browser access | **CORROBORATION** (PIN-level locality reference) |
| Survey of India admin boundaries | Survey of India | Blr ✅ Udupi ✅ (state→district→taluk) | Shapefile/.gdb/PDF | Polygon (to taluk level only) | Official codes | No | GODL-India / NDSAP | Free, registration likely | Medium | **ADMIN_PARENT, GEOMETRY (district/taluk only — too coarse for locality search)** |
| KGIS (Karnataka GIS, KSRSAC) | Govt of Karnataka | Blr ✅ Udupi ✅ (statewide, incl. **ward** + **village** per search snippets) | Shapefile / KML/KMZ | Polygon | Unclear | Unclear | **No explicit licence found; portal unreachable from this environment** | Unknown | **Unverified** | **VIABLE_WITH_LIMITATIONS — highest-value unknown; verify manually before relying on it** |
| BBMP Ward Information (OpenCity) | BBMP (via OpenCity/Data{Meet}) | Bangalore only | KML, CSV, PDF | Polygon (rich, current — 2025-11-27) | BBMP ward number | Ward name only | **"No License Provided"** | Free | High (direct download) but **legally blocked from storage/redistribution** | **CORROBORATION only, pending licence clarification** |
| DataMeet Bangalore Municipal Spatial Data | DataMeet (community, derived from BBMP) | Bangalore only | GeoJSON/KML/Shapefile | Polygon | BBMP ward number | Ward name only | **CC BY 4.0** (community re-wrap of BBMP data) | Free | High | **GEOMETRY (Bangalore wards) with attribution — cleanest of the Bangalore ward sources, but upstream (BBMP) itself has no explicit licence** |
| Udupi district/CMC admin pages | Udupi District Admin / CMC | Udupi only | HTML/PDF | None | None | None | Govt website ToU | Free | Low — manual reference only | **MANUAL_REFERENCE_ONLY** |
| Bhuvan/NRSC | ISRO/NRSC | Both | WMS/WFS/imagery | Varies | N/A | N/A | Restrictive NRSC terms | Free/registration | Low | **Not investigated further per task scope; assume restrictive** |
| Listing locality text | *(explicitly excluded per task constraints)* | — | — | — | — | — | — | — | — | **NOT USED as a candidate source** |

Full detail and licence quotes for the government sources are in the dedicated research pass — see §6.

---

## 3. Bangalore results (OSM/Geofabrik)

Extraction: Geofabrik Southern Zone `.osm.pbf`, bbox `[77.35, 12.75, 77.85, 13.20]`
(covers BBMP + immediate satellite towns), pyosmium `SimpleHandler` scanning
**77,669,725 nodes / 11,599,249 ways / 47,084 relations** in the whole Southern
Zone file (osmium has no spatial index, so every pass scans the full file
regardless of bbox — a real cost of this extract choice, discussed in §5).

**Coverage metrics** — final trusted figures only, from
`docs/audit/evidence/issue-1900-provider-viability/metrics/bangalore_metrics_v1.json`.
Node and closed-way records were bbox-filtered correctly at extraction time and
are complete; a full-file polygon/relation recount was never completed within
this investigation's sandboxed time budget (§5.3.1 explains why, and gives the
small-scale proof that the corrected area-assembly logic is mechanically
correct). No interim/partial counts are reported below — only the final
node/way pass:

| Metric | Value | Status |
|---|---|---|
| `place=*` node candidates in bbox | **1,762** | Final, bbox-filtered, trustworthy |
| Closed-way `place=*`/`boundary=administrative` candidates in bbox | **72** | Final, bbox-filtered, trustworthy |
| By place type (node+way total, final) | neighbourhood 915, village 472, quarter 234, hamlet 136, suburb 114, locality 40, town 10, city 2, state 1 | Final, bbox-filtered, trustworthy |
| `boundary=administrative` relations, file-wide | 4,581 total in the whole Southern Zone file | **Not city-scoped** — a naive first-pass extractor that does not resolve relation geometry cannot bbox-filter these at all (§5 lesson learned); this was caught and fixed in this investigation, not papered over, but no bbox-correct per-city relation count exists (§5.3.1) |

- Kannada name coverage (`name:kn`): **36.6%** of all candidates in the raw
  metrics file (node+way+leak-affected relations combined — see duplicate-name
  caveat below for why this percentage should be read as file-wide, not
  strictly Bangalore-bbox-scoped), concentrated in named nodes — the
  well-known suburb-level names (Hebbal, Yelahanka, Koramangala, etc.)
  reliably carry both `name` and `name:kn`.
- Postal-code tag coverage on OSM place nodes: **0.6%** — OSM place nodes are not
  a reliable PIN source; that gap is exactly what the India Post PIN directory
  fills (§6).
- **Duplicate normalised names: 711 groups** — this count is computed across
  the *entire* 6,483-record `bangalore_metrics_v1.json` file, which includes
  the 4,649 nationwide `relation` records affected by the v1 geometry/bbox-leak
  defect (§5.3, §4's parallel caveat). It is **not** a clean Bangalore-bbox-scoped
  duplicate count — it mixes genuine same-city duplicates (e.g. a `node` place
  tag *and* an administrative `relation` for the same locality, such as Hebbal
  or Whitefield below) with duplicate names arising purely from the nationwide
  relation leak (e.g. "Gandhinagar" recurring as both a Bangalore locality and
  a Gujarat city). **Do not use 711 as a Bangalore-specific metric** until
  duplicates are recomputed on a bbox-correct, leak-free candidate set.

**Sample locality check (8/8 requested Bangalore names, from `bangalore_metrics_v1.json`).**
Verification-type key: **[SV-node]** = bbox/spatially-verified node (real lat/lon
inside bbox); **[SV-way]** = bbox/spatially-verified closed way (real resolved
polygon); **[NM-relation]** = relation matched **by name only** in the
defective v1 pass — `has_polygon: true` in the raw JSON reflects the
`boundary=administrative` *tag*, not a resolved geometry (`centroid: null` for
every relation match below), so this is **not** spatially verified; **[SA-relation]**
= spatially verified relation from the corrected area-assembly logic — none of
the Bangalore/Udupi sample localities below have this label, since only 3
unrelated island territories (§5.3.1's `api_probe2`) were confirmed this way:

| Locality | Found | OSM type(s) | Notes |
|---|---|---|---|
| Hebbal | ✅ | node (suburb) **[SV-node]** + relation **[NM-relation]**, admin_level 10 | A colloquial suburb node (spatially verified) and a same-named administrative relation (name-matched only, geometry unresolved) — a real "same locality, two representations" reconciliation case, but only one representation is spatially confirmed |
| Yelahanka | ✅ | node (suburb) **[SV-node]** | No administrative relation match found for this specific node |
| JP Nagar | ✅ | node (suburb) **[SV-node]** + relation **[NM-relation]** | Same dual-representation pattern as Hebbal — relation match is name-only, not spatially verified |
| Jayanagar | ✅ | node (suburb) **[SV-node]** | — |
| Whitefield | ✅ | node (suburb) **[SV-node]** + relation **[NM-relation]**, admin_level 10 | — |
| Electronic City | ✅ | node (town) **[SV-node]** | Found on full-file scan (was a false negative on an earlier partial read during this investigation — corrected before reporting) |
| Koramangala | ✅ | node (suburb) **[SV-node]** | — |
| Indiranagar | ✅ | 2× node (suburb + neighbourhood) **[SV-node]** + relation **[NM-relation]**, admin_level 10 | Three distinct OSM records for one buyer-facing locality — the clearest evidence that naive node-count "coverage" overstates distinct real-world localities without reconciliation; only the two nodes are spatially verified |

**Known gaps (Bangalore):** vernacular micro-localities that buyers actually
search for (e.g. specific apartment-adjacent layouts) are inconsistently present
as `place=neighbourhood`/`quarter` nodes — good density (915 neighbourhood +
234 quarter tags) but with no official standing and uneven editor coverage.
Postal-code linkage is essentially absent on OSM nodes.

---

## 4. Udupi results (OSM/Geofabrik)

Extraction bbox `[74.60, 13.15, 74.90, 13.50]` (Udupi town, Manipal, Kaup taluk
area). Sample locality check (5/8 found on the first-pass node-only extractor;
Brahmavar, Santhekatte, and Kunjibettu were not found as `place=*` nodes in this
pass — see below for the caveat this creates):

Verification-type key (same as §3): **[SV-node]** = bbox/spatially-verified
node; **[NM-relation]** = relation matched by name only, geometry unresolved
(not spatially verified); no Udupi sample below carries an **[SA-relation]**
(spatially-verified-via-corrected-area-assembly) label.

| Locality | Found | OSM type(s) | Notes |
|---|---|---|---|
| Udupi | ✅ | node (city, postal_code 576101) **[SV-node]** + relation **[NM-relation]**, admin_level 5 | City node is spatially verified; the district-level administrative relation match is name-only, geometry unresolved |
| Manipal | ✅ | node (town) **[SV-node]** | — |
| Brahmavar | ❌ (as a `place=*` node in this pass) | — | A real, well-known town — likely present only as an administrative relation (village/town panchayat) rather than a `place=*` node, or as a node outside the tested bbox edge; needs the corrected polygon-aware pass (§5) before concluding it is genuinely missing |
| Kapu | ✅ | node (village) **[SV-node]** | — |
| Malpe | ✅ | node (suburb) **[SV-node]** | — |
| Santhekatte | ❌ | — | Same caveat as Brahmavar — a locally well-known junction/locality name that may only exist as an unnamed sub-feature of a larger relation, or may genuinely be absent from OSM for this area |
| Parkala | ✅ | node (village) **[SV-node]** | — |
| Kunjibettu | ❌ | — | Same caveat |

**Coverage metrics (node/way pass only, from `udupi_metrics_v1.json`):**
`place=*` node candidates: **145** across village/city/town/locality/suburb/
hamlet/neighbourhood/quarter types. Kannada name coverage **23.0%** — lower
than Bangalore, consistent with Udupi/coastal Karnataka OSM data being edited
by a smaller, more English-first contributor base. `wikidata` coverage 44.6%
is notably *higher* than Bangalore (33.9%), suggesting better cross-linking
of the well-known towns even where sub-locality density is thinner.

**Important caveat on the Udupi relation/admin_level figures:** the first
extraction pass had a real defect — administrative relation records were
written without resolved polygon geometry and therefore without any bbox
filter, so the same nationwide set of ~4,649 `boundary=administrative`
relations leaked into *both* the Bangalore and Udupi output files identically
(same counts by `admin_level` in both cities' v1 metrics — an unmistakable
tell). This is documented, not hidden, and was corrected with a proper
two-pass area-assembly extractor (§5). **Do not use the v1 `by_admin_level`
or relation counts as city-scoped coverage numbers** — only the node-level
`place=*` figures and the sample-locality name lookups (which matched by name,
not by the broken bbox filter) are trustworthy from the v1 run.

**Known gaps (Udupi):** three of eight well-known local names were not found
as `place=*` nodes in the first pass; Udupi coastal-belt OSM density is
materially thinner than Bangalore's, which is the expected pattern for a
tier-2/tier-3 town versus a metro. This investigation found no reachable,
licence-verified government or community ward-polygon dataset for Udupi
CMC's 35 wards, and no spatially-verified OSM administrative-relation polygon
for Udupi either (§5.3.1) — this is an absence of evidence found, not proof
that no such dataset exists anywhere.

---

## 5. OSM extraction prototype

### 5.1 Reproducible commands

```bash
# 1. Download the smallest official extract containing both trial cities
curl -L -o southern-zone-latest.osm.pbf \
  https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf
shasum -a 256 southern-zone-latest.osm.pbf   # record for provenance

# 2. Disposable Python venv (no system-wide install)
python3 -m venv venv
./venv/bin/pip install osmium shapely

# 3. Extract candidates for a city bbox (see extract_candidates_v2.py)
./venv/bin/python scripts/extract_candidates_v2.py \
  southern-zone-latest.osm.pbf bangalore 77.35 12.75 77.85 13.20 \
  bangalore_candidates.jsonl

./venv/bin/python scripts/extract_candidates_v2.py \
  southern-zone-latest.osm.pbf udupi 74.60 13.15 74.90 13.50 \
  udupi_candidates.jsonl
```

### 5.2 What the script does (two-pass design)

- **Pass 1 (nodes + closed ways):** a single `pyosmium.SimpleHandler` pass with
  `locations=True` captures every `place=*` node directly (point geometry) and
  every closed `way` tagged `place=*`/`boundary=administrative` (simple
  polygon via `WKBFactory.create_polygon`), bbox-filtering each record as it is
  found.
- **Pass 2 (multipolygon relations — `osmium.area.AreaManager`):** OSM models
  most real administrative boundaries as *relations* (`type=multipolygon` or
  `type=boundary`), not simple ways. Resolving their actual polygon geometry
  requires osmium's two-sub-pass `AreaManager`: a first sub-pass that collects
  candidate relations, and a second sub-pass (re-reading the file with
  locations) that assembles the multipolygon and calls back with a real
  `shapely`-loadable WKB geometry, from which a true centroid and bbox can be
  computed and — critically — used for bbox filtering.
- Every record retains: OSM element type + id (identity), full raw tag
  dictionary (nothing discarded), name variants (`name`, `name:kn`, `name:en`,
  `alt_name`, `old_name`, etc.), `wikidata`/`wikipedia` cross-references,
  geometry type/availability, centroid, and bbox — deliberately *not* reduced
  to the #1887 `CandidateInput` shape yet, per the task's instruction to
  preserve reconciliation-relevant detail.

### 5.3 A real lesson learned (documented, not hidden)

The first version of this extractor (`extract_candidates.py`, kept in the
evidence bundle for transparency) captured relation tags but never resolved
relation *geometry*, and therefore could not bbox-filter relations at all —
it silently wrote the same nationwide set of administrative relations into
every city's output file. This was caught by comparing the Bangalore and
Udupi `by_admin_level` counts (identical, which is a statistical impossibility
for two non-overlapping bboxes) and fixed by adding the `AreaManager` two-pass
step (`extract_candidates_v2.py`). **This is exactly the kind of geometry
resolution complexity a production #1900 OSM adapter must budget for** — a
naive "read tags, ignore geometry resolution" implementation looks like it
works (record counts are non-zero, spot-checks by name succeed) while
silently producing meaningless per-city aggregates. Any production adapter
must either use a real area-assembly library (osmium, or GDAL/`ogr2ogr`'s
built-in multipolygon handling) or explicitly document that it only supports
point-geometry candidates.

### 5.3.1 Operational-cost finding: full-file polygon resolution vs. sandbox time budget

After fixing the pass-1 defect (§5.3), three successive corrected extractors
(`extract_candidates_v2.py`, `v3.py`, `v4.py` — each iterating on the correct
`osmium.area.AreaManager` API for the installed pyosmium version) were run
against the full 555 MB Southern Zone file. Each requires at minimum one
tag-only full-file scan (`AreaManager.first_pass_handler()`, fast) plus one
location-resolving full-file scan (to assemble real multipolygon geometry for
~4,600 administrative relations across 9 states) — and every attempt at the
second, expensive scan was terminated by this investigation's sandboxed
execution environment before completing, even though a single
location-resolving pass *without* area assembly (the original, defect-bearing
`extract_candidates.py` run) **did** complete in comparable time. This points
to genuine per-node area-membership bookkeeping overhead, not merely
environment flakiness.

**This was not silently worked around.** Before concluding, a small, bounded
proof-of-concept (`api_probe2`, 3-match limit) was run to confirm the
corrected approach is *mechanically correct*, independent of whether a full
run fits this sandbox's time budget:

```
Car Nicobar  admin_level=6  relation/10088782  centroid=(92.77, 9.17)
Kiltan       admin_level=6  relation/10088358  centroid=(73.01, 11.48)
Bitra        admin_level=6  relation/10088363  centroid=(72.19, 11.60)
```

Real administrative-boundary names, levels, stable relation ids, and valid
resolved centroids — the area-assembly logic itself works. What did not fit
in this environment was running it to completion, unfiltered, across an
entire 9-state, 77-million-node file for two named cities. **This is itself a
material finding for #1900's implementation planning**, not a gap to paper
over: a production OSM adapter must either (a) run on dedicated,
non-shared compute with a realistic multi-tens-of-minutes budget per city (or
per batch of cities) rather than an interactive/sandboxed shell, or (b)
pre-clip the source file to a much smaller regional extract before area
assembly (e.g., a one-time Karnataka-only `.osm.pbf` derived from the
Southern Zone file), which was out of scope to build correctly in the
remaining investigation time (a correct clip must preserve full relation
membership completeness, which itself requires a location-resolving pass).

**Consequence for the coverage numbers in §3/§4:** the polygon/geometry
percentages reported there are from the *node/way-only* v1 pass (valid,
complete, unaffected by this issue) plus the specific relation matches v1's
name-based sample lookup surfaced incidentally (Hebbal, JP Nagar, Whitefield,
Indiranagar, Udupi city — all confirmed to have a `boundary=administrative`
relation counterpart, per §3/§4 tables) — not from a full, bbox-correct count
of every administrative relation touching each city. Treat "how many
administrative-boundary polygons exist per city" as **not reliably measured
by this investigation** (unlike the node-level `place=*` metrics, which are
solid); a real answer needs either a dedicated-compute run of the same
corrected script or a pre-clipped regional file.

### 5.4 Reusability for another city

The script takes `city_label` and a bbox as plain arguments — running it for a
third city (e.g. Mangalore) requires no code change, only a new bbox, matching
the task's "run for another city without rewriting the extraction logic"
requirement.

---

## 6. Government-data extraction prototype

Investigation performed via `WebSearch`/`WebFetch` only (no scraping, no
credential bypass). Two portals central to this space — `kgis.ksrsac.in` and
`data.gov.in` — refused automated fetches from this environment (connection
refused / HTTP 403); those findings are flagged **NOT DIRECTLY
FETCH-VERIFIED** below and must be re-checked in a real browser before any
production dependency is taken.

### 6.1 Fetch-verified findings

- **All India Pincode Directory** (India Post / data.gov.in): confirmed
  coverage for both cities — **Udupi H.O. = 576101** (7 constituent post
  offices: Udupi H.O., Adi-Udupi B.O., Bannanje S.O., Chitpadi B.O., Kukkikatte
  B.O., Mission Compound S.O., Udupi Courts S.O.), **Manipal = 576104**;
  Bangalore = 560xxx range. Fields: Circle/Region/Division/Office Name,
  Pincode, Office Type, Delivery flag, District, State. **No lat/long** —
  point/area reference only, not a geometry source. Licence: **GODL-India**
  (commercial reuse permitted with attribution). Bulk CSV + JSON API exist but
  require a free registered API key; automated fetch got HTTP 403 here.
- **Local Government Directory (LGD)**, Ministry of Panchayati Raj: assigns a
  stable government code to every state/district/sub-district/village and
  every rural/urban ward, all-India — includes both BBMP wards and Udupi
  CMC wards/villages. Community mirror `ramseraph.github.io/opendata/lgd/`
  publishes daily 7-zipped CSV archives. **Codes + names only — no
  geometry.** Licence: GODL-India (upstream).
- **OpenCity BBMP Ward Information**: fetch-verified, current as of
  **2025-11-27** — Final Wards 2023 (225 wards, KML), Proposed Wards 2023,
  Ward Map 2022 (243 wards), Ward Map 2015 (198 wards), Zone boundaries, CSV
  ward↔constituency mappings, delimitation PDF. **Licence: "No License
  Provided"** — high-quality, current, Bangalore-only, but not safe to store
  or redistribute without clarifying rights.
- **DataMeet Bangalore Municipal Spatial Data** (GitHub): BBMP ward polygons
  in GeoJSON/KML/Shapefile, **CC BY 4.0** — the cleanest *licensed* Bangalore
  ward geometry found, though it is a community re-wrap of the same
  unlicensed BBMP source data (a residual provenance question, not a solved
  one).

### 6.2 Search-corroborated but NOT fetch-verified

- **KGIS (Karnataka GIS, KSRSAC)** — `kgis.ksrsac.in` (`ECONNREFUSED` here).
  Search snippets describe State/District/Taluk/Hobli/**Town-Ward**/**Village**
  boundary layers as Shapefile/KML. If real and licensed, this is the single
  most complete official geometry source for *both* trial cities — but no
  explicit licence was found in any search-indexed page, and a GitHub mirror
  (`datameet/kgis`) carries **no LICENSE file** and, notably, **does not even
  include a ward layer** (only village/taluk/district/hobli/state) — so even
  the mirror cannot substitute for confirming the primary portal. **This is
  the highest-value unresolved question in this investigation** (see §10).

### 6.3 No reachable official ward-polygon source found for Udupi in this investigation

Despite specifically searching Udupi district administration, Udupi CMC, and
the LGD/KGIS avenues, **this investigation found no reachable, licence-verified
government or community ward-polygon dataset for Udupi's 35 CMC wards** on any
portal it could access. This is a material, named gap in what was found — not
a proof that no such dataset exists (KGIS in particular remains unverified,
§6.2) — and it is the reason OSM (§4) and manual curation remain necessary for
Udupi regardless of what KGIS turns out to contain for Bangalore.

---

## 7. Cross-source comparison

| Aspect | OSM/Geofabrik | Official government |
|---|---|---|
| **Identity stability** | OSM element type+id — stable in practice but *can* be reissued if a feature is redrawn/split/merged; needs a `superseded_at` provenance model (already designed into #1900's `curated_candidate_provenance`) | LGD codes are the most stable identity available — government-assigned, rarely reissued |
| **Official name / codes** | `name`, `official_name` tags — present but not authoritative | LGD + Census — authoritative, this is their whole purpose |
| **Vernacular/colloquial names buyers actually search** | Strong — OSM captures neighbourhood-level informal names editors have mapped (Hebbal, Koramangala, Malpe, etc.) | Weak/absent — administrative directories don't track colloquial locality names |
| **Geometry (ward/village polygon)** | Present via relations, but requires proper area-assembly (§5); density and quality vary by editor coverage | Present for Bangalore only via OpenCity/DataMeet (licence-encumbered/community); **absent for Udupi**; KGIS unverified |
| **Kannada/local-language names** | 36.6% (Blr) / 23.0% (Udupi) of candidates carry `name:kn` | Not present in any government source found |
| **PIN-code linkage** | Essentially absent (<1%) | India Post directory is the authoritative PIN source |
| **Licence clarity** | Single, well-understood licence (ODbL) applying uniformly | Fragmented — GODL-India sources are clean; BBMP-derived sources are not; KGIS unknown |

**No single source wins on every field** — this is the basis for the
recommended multi-provider reconciliation model in §9, which mirrors what
`issue-1900-geography-curation-plan-review.md` already designed
(`IDENTITY | OFFICIAL_NAME | DISPLAY_NAME | GEOMETRY | ADMIN_PARENT | ALIAS |
CORROBORATION` roles).

---

## 8. Licensing assessment

### 8.1 ODbL 1.0 (OpenStreetMap / Geofabrik)

Per Geofabrik's own licence page (fetched 2026-07-15): OSM data is licensed
under **ODbL 1.0**, a share-alike database licence. The assessments below use
a four-tier scale rather than presenting anything as a settled legal
conclusion: **clearly permitted** (unambiguous under the plain licence text) /
**apparently permitted with attribution** (permitted on a plain reading,
attribution required, no share-alike trigger identified) / **external
redistribution/share-alike assessment required** (plausibly triggers ODbL's
share-alike clause once data leaves the organisation — needs a deliberate
decision, not necessarily a lawyer) / **formal legal review required**
(genuinely unclear, or high-consequence enough that this investigation should
not be the basis for a decision). **None of this is a legal opinion** — it is
a non-lawyer's reading of the publicly posted licence terms, offered to scope
what needs real legal input before #1900 builds anything customer-facing on
top of it.

| Action | Assessment |
|---|---|
| Download and process | **Clearly permitted** |
| Retain raw extracts privately | **Clearly permitted** |
| Store normalized records in Postgres | **Clearly permitted** — this is exactly the "collective/derivative database" use ODbL is designed for |
| Combine with other providers | **Clearly permitted** for the act of combining — ODbL explicitly allows it; if the *combined* database is itself redistributed as a database, see "external redistribution" below |
| Create a derived canonical-area database (internal use / in-app display only) | **Apparently permitted with attribution** — this is squarely what ODbL calls a "derivative database"; internal use and in-app display are not restricted on a plain reading |
| Expose names/boundaries in the public application | **Apparently permitted with attribution** — ordinary application display is a "produced work" under ODbL, which does not itself need to be share-alike, but still requires the standard attribution ("© OpenStreetMap contributors") |
| Distribute exports (e.g. the `curated_dataset` JSON/CSV round-trip files #1900 proposes) leaving the organisation | **External redistribution/share-alike assessment required** — if an export is a substantial extract of the OSM-derived data and is shared *outside* the organisation, ODbL's share-alike clause likely requires that extract be offered under ODbL or a compatible licence; internal round-trip files (curator ↔ Postgres, never leaving the org) are a different case and are apparently permitted with attribution |
| Retain historical snapshots | **Clearly permitted** |
| Whether the *combined* OSM + government + manually-curated database (as a whole, once redistributed or exported) is settled under any single tier | **Formal legal review required** — this investigation does **not** classify the combined-database case as settled; see the open questions below |

**Formal legal-confirmation questions for OSM/ODbL:**
1. Does #1900's *combined* canonical database (OSM + government + manual),
   once it includes government/manual-curated data that did not originate
   from OSM, still count as an ODbL "derivative database" for the
   OSM-sourced rows specifically, or does mixing dilute the obligation?
   (ODbL's "collective database" provision may apply if sources stay
   separable — worth confirming.)
2. If #1900 ever ships a public "download this city's area boundaries" export
   feature, must that export be re-offered under ODbL (with a public offer to
   share the underlying data), and does that conflict with the project's
   general policy of not open-sourcing its curated dataset?

### 8.2 Government sources

| Source | Licence | Assessment |
|---|---|---|
| data.gov.in / LGD / Survey of India | **GODL-India** (Gazette-notified 2017-02-13): worldwide, royalty-free, non-exclusive right to use, adapt, publish, translate, display, add value, and create derivative works for **commercial and non-commercial** purposes, with **mandatory attribution** | **CONFIRMED_PERMITTED** for download, storage, Postgres normalization, combination with OSM, public display, and redistribution — all with attribution. Excludes personal/sensitive data and third-party IP, neither of which applies to admin-boundary/PIN data. |
| KGIS | No explicit licence found; portal unreachable | **UNCLEAR** — do not depend on this source until the portal's actual terms are read in a browser |
| OpenCity BBMP ward data | "No License Provided" | **APPARENTLY_PROHIBITED** for storage/redistribution until BBMP or OpenCity clarifies terms; safe only as a manual, non-stored reference during human curation |
| DataMeet Bangalore ward data | CC BY 4.0 | **CONFIRMED_PERMITTED with attribution** for the wrapper licence, but the upstream BBMP source's own rights are unclear — flag as **legal-review-recommended** for anything beyond low-stakes internal corroboration |

---

## 9. Recommended provider strategy

**OSM primary + official corroboration (identity/codes only) + manual curation
for the vernacular/sub-locality layer** — with one open item before this can
be finalized: **KGIS must be manually verified** (reachability + licence) since
if it is real and open, it changes the geometry story materially by supplying
ward/village polygons for *both* cities from a single clean official source,
which would upgrade the strategy to "OSM + KGIS geometry corroboration."

Concretely, mapped to the #1900 contribution roles:

- **IDENTITY:** OSM element type+id, paired with LGD codes where a government
  admin-level match exists.
- **OFFICIAL_NAME / ADMIN_PARENT:** LGD (cleanest, most stable, GODL-licensed).
- **DISPLAY_NAME / ALIAS:** OSM `name`/`name:kn`/`alt_name` — this is the only
  source with meaningful vernacular/colloquial coverage.
- **GEOMETRY:** OSM (area-assembled relations) as the default; KGIS as a
  pending upgrade pending licence/reachability confirmation; BBMP-derived
  sources (OpenCity/DataMeet) as manual-curation-only corroboration for
  Bangalore, never stored/redistributed until their licence is resolved.
  This investigation found no reachable, licence-verified government or
  community ward-polygon dataset for Udupi beyond OSM's own unresolved-at-scale
  relations.
- **CORROBORATION:** India Post PIN directory (locality↔PIN cross-check),
  Survey of India (district/taluk-level sanity check only — too coarse for
  locality search).

**Manual curation burden:** meaningful but bounded. The reconciliation cases
surfaced in this investigation (Hebbal/JP Nagar/Whitefield/Indiranagar each
having 2–3 distinct OSM records for one real-world locality, at least one of
which is spatially verified and one name-matched only, §3; plus 711 duplicate
normalised names in the leak-affected Bangalore metrics file, scope caveat in
§3) show that **automatic
dedup/merge cannot be fully trusted** — a human curator must resolve
node-vs-relation duplicates and cross-source naming conflicts per candidate.
This matches — and validates — the human-in-the-loop `CANDIDATE → RECONCILED
→ REVIEWED` state machine already designed in
`issue-1900-geography-curation-plan-review.md` §6; nothing in this
investigation suggests that workflow can be skipped or automated away.

---

## 10. Impact on #1900 child issues

**Recommend implementing the OSM/Geofabrik adapter first** in whichever child
issue owns the first concrete `GeoProvider` implementation (#1900b or
equivalent), because:

1. It is the only source with proven, both-cities coverage of the
   buyer-facing vernacular locality layer that the government sources
   structurally cannot provide.
2. Its licence (ODbL) is well-understood and precedented (Geofabrik's own
   guidance distinguishes produced-work display from database
   redistribution), versus KGIS's currently-unknown terms.
3. The extraction pipeline is fully reproducible and city-agnostic (§5.4) —
   the adapter's `extract(ExtractRequest)` can wrap the two-pass osmium
   approach directly.

**Schema/adapter requirements this investigation surfaced, not previously
visible from the architecture-only review:**

- `geo_raw_candidate.raw_payload` must be large enough / structured to hold a
  **full OSM tag dictionary**, not just a handful of expected fields — real
  candidates carry 5–15 tags each (name variants, wikidata, wikipedia,
  postal_code, admin_level, etc.) that later reconciliation stages want.
- The OSM adapter's `provider_record_id` must encode **both** OSM element type
  and numeric id (`node/429853335`, `relation/19883364`, not just a bare
  integer) — type is not implied by id.
  and must be built to be **reissue-tolerant**: this investigation observed
  no reissues directly (single extraction snapshot), but multiple
  representations of one real-world place (a `place=suburb` node **and** a
  `boundary=administrative` relation with a different id) is the *rule*, not
  the exception, for well-known Bangalore localities — the reconciliation
  engine must expect 1 candidate ← 2–3 raw OSM records routinely, not
  occasionally.
- Any OSM adapter must budget for the two-pass area-assembly cost (§5.3) —
  a naive tag-only relation reader silently produces meaningless per-city
  data. This should be an explicit code-review checklist item when #1900b
  is implemented.
- Government-source `geo_provider` rows (LGD, India Post) should be modelled
  from day one even though they contribute no geometry, because they are the
  cleanest `OFFICIAL_NAME`/`ADMIN_PARENT`/`CORROBORATION` sources and are
  trivially GODL-licensed — there is no reason to defer them behind the OSM
  adapter.

**Provisional sample keys** (illustrative only, not minted for real use):
`IN|KA|Bengaluru Urban|Hebbal` (provisional), `IN|KA|Udupi|Manipal`
(provisional) — both would need #1900's key-minting rule and human dedup
review before being real `curated_area_candidate.proposed_area_key` values.

---

## 11. Evidence bundle

Stored under `docs/audit/evidence/issue-1900-provider-viability/`:

- `SOURCE_METADATA.md` — full source URLs, extraction dates, licence
  quotes/paraphrases, and the ODbL attribution notice.
- `osm-samples/bangalore_node_sample.jsonl`, `osm-samples/udupi_node_sample.jsonl`
  — 15-record excerpts of the raw candidate extraction (small, ODbL-attributed,
  redistributable samples — not the full extract).
- `metrics/bangalore_metrics_v1.json`, `metrics/udupi_metrics_v1.json` — full
  coverage/quality metrics from the analysis script (node/way figures are
  trustworthy; relation/admin_level figures in these v1 files are known-buggy,
  see §5.3, and were **not** superseded by a completed full-file re-run — see
  §5.3.1 for why, and for the small-scale proof that the fix is mechanically
  correct).
- `metrics/area_assembly_proof.txt` — the 3-match `AreaManager` proof-of-concept
  output referenced in §5.3.1 (real administrative-boundary names, levels,
  relation ids, and resolved centroids), evidencing that the corrected
  extraction logic works even though a full-file run could not complete in
  this sandbox.
- `metrics/geofabrik_southern_zone_sha256.txt` — checksum of the downloaded
  555,443,481-byte `.osm.pbf` for provenance.
- `metrics/southern-zone.poly` — Geofabrik's own polygon boundary definition
  for the Southern Zone extract (small, official, redistributable).

The full 555 MB `.osm.pbf` raw extract itself is **not committed** (per task
instruction not to commit large provider extracts) — its checksum, source URL,
and extraction date are recorded instead so the same file can be re-fetched
deterministically.

---

## Unresolved decisions requiring user approval

1. **KGIS reachability + licence** — must be manually verified in a real
   browser (this environment's automated fetch was refused). This is the
   single highest-leverage open question: if KGIS is real, open, and covers
   ward/village polygons for both cities, it upgrades the recommended
   strategy materially.
2. **ODbL "derivative database" scope for the combined dataset** — whether
   #1900's OSM+government+manual `curated_area_candidate` table, and any
   future public export feature, triggers ODbL share-alike obligations on the
   OSM-derived portion. Recommend formal legal confirmation before building
   any customer-facing "export area data" feature.
3. **BBMP-derived ward geometry (OpenCity "No License", DataMeet CC BY 4.0 over
   an unlicensed upstream)** — whether this project is willing to accept
   DataMeet's CC BY wrapper as sufficient, given the upstream provenance
   question, for internal curation corroboration (not primary geometry).
4. **India Post / data.gov.in API access** — both were bot-blocked in this
   environment; a registered API key and/or manual browser session is needed
   before the PIN-directory corroboration source can be automated.
