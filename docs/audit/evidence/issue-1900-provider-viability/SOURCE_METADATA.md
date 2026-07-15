# Source metadata — issue #1900 provider-viability investigation

Investigation-only evidence bundle. No production code, no Flyway migrations, no
canonical database rows were created. All extraction was performed against local,
disposable files; no shared Supabase or production database was touched.

## OpenStreetMap / Geofabrik

- **Source dataset:** Geofabrik "Southern Zone" extract of India (covers Andhra
  Pradesh, Karnataka, Kerala, Tamil Nadu, Telangana, Puducherry — includes both
  Bangalore and Udupi).
- **Download URL:** `https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf`
  (redirected at extraction time to the dated file `southern-zone-260714.osm.pbf`).
- **Format:** `.osm.pbf` (protocol-buffer binary OSM format).
- **File size at extraction:** 555,443,481 bytes (~530 MB).
- **Extraction date:** 2026-07-15.
- **SHA-256:** see `metrics/geofabrik_southern_zone_sha256.txt`.
- **Update frequency:** Geofabrik publishes this extract on a rolling basis; the
  India country page shows dated snapshots at roughly daily cadence in the days
  immediately preceding this investigation (`india-260710` through `india-260714`
  were all present), and the Southern Zone sub-extract tracks the same feed.
- **Licence:** OpenStreetMap data — **ODbL 1.0** ("Open Database License").
  Geofabrik's own free-data page (`https://www.geofabrik.de/geofabrik/free.html`,
  fetched 2026-07-15) states data is offered "without any additional restrictions
  beyond those imposed by the source license (ODbL 1.0 for OSM data)" and that
  most Geofabrik-distributed data uses a share-alike licence requiring that
  derivative databases remain redistributable, but that **produced works**
  (rendered maps, most ordinary application use) do not themselves inherit
  share-alike obligations — only genuine database extraction/redistribution does.
  Standard attribution line: **"© OpenStreetMap contributors"**, with a link to
  `https://www.openstreetmap.org/copyright`.
- **Why this extract, not full India or a GeoPackage:** the full India `.osm.pbf`
  was ~1.69 GB at extraction time; the Southern Zone extract is ~530 MB and
  contains both trial cities plus every other city we are likely to onboard next
  in South India, at roughly 1/3 the download/processing cost. A GeoPackage
  equivalent exists (`southern-zone-latest-free.gpkg.zip`) but `.osm.pbf` was
  chosen because it preserves full tag sets and OSM element identity (type + id)
  losslessly; some GeoPackage/Shapefile exports flatten or drop tags.

## Government / official sources

Government-source findings in the main report were gathered via `WebSearch` /
`WebFetch` only — no scraping, no login bypass, no automated download of
restricted portals. `kgis.ksrsac.in` and `data.gov.in` refused automated fetches
(connection refused / HTTP 403) from this environment; those rows in the report
are explicitly flagged **NOT DIRECTLY FETCH-VERIFIED** and should be re-checked
in a real browser before any dependency is taken on them. Fetch-verified sources
(OpenCity BBMP ward data, DataMeet Bangalore municipal spatial data, the LGD
community mirror, the GODL licence text) are cited with their exact URLs in the
main report.

No government dataset files are vendored into this evidence bundle — only the
research findings (source table + licence analysis) in the main report. This
avoids any question about redistribution rights for data this investigation
could not itself confirm as downloadable-and-licensed.

## Attribution requirement for this bundle

Any sample file under `osm-samples/` is a small, hand-picked excerpt of
OpenStreetMap data (ODbL 1.0). If this evidence bundle or its samples are ever
copied outside this investigation, retain the following notice:

> Contains data from OpenStreetMap, licensed under the Open Database Licence
> (ODbL) 1.0. © OpenStreetMap contributors. https://www.openstreetmap.org/copyright
