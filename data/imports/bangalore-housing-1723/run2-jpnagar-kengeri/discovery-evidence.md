# Run-2 discovery evidence — JP Nagar & Kengeri houses/plots (#1723 follow-up)

Data-acquisition performed by Main Agent (Apify MCP + OSM Nominatim reachable in main session). Team owns normalisation, SQL, validation.

## 1. Housing.com area identifiers (discovered from real scraped data — NOT guessed)
Derived by scanning real listings whose `locality` == the target area and reading their Housing-assigned `localityUuid`:
- **JP Nagar** → `localityUuid = 8ed8d5bf353b04db43c7` (11/12 sampled listings; canonical locality string "JP Nagar")
- **Kengeri** → `localityUuid = 542902d6718832d09bb7` (canonical locality string "Kengeri")

## 2. Real bounding boxes (OSM Nominatim — administrative boundary relations)
- **JP Nagar** — OSM `relation 17205864`, class=boundary/administrative. display_name: "JP Nagar, Bengaluru South City Corporation, …". centroid 12.9096941, 77.5866067.
  bbox (S,N,W,E) = 12.8975486, 12.9175497, 77.5730508, 77.6018204
  source: https://nominatim.openstreetmap.org/search?q=JP+Nagar,+Bengaluru,+Karnataka,+India&format=jsonv2
- **Kengeri** — OSM `relation 19883453`, class=boundary/administrative. display_name: "Kengeri, Bengaluru West City Corporation, …".
  bbox (S,N,W,E) = 12.9139790, 12.9333808, 77.4786482, 77.4989021
  source: https://nominatim.openstreetmap.org/search?q=Kengeri,+Bengaluru+West,+Karnataka,+India&format=jsonv2
  NOTE: Nominatim's TOP hit for "Kengeri, Bengaluru" was a railway-station NODE (308062102) with a synthetic ~0.01° box — REJECTED. The administrative relation above is the real boundary and is what we use.

Both bboxes are real, source-attributed OSM administrative boundaries → evidence-based area-seed SQL is permitted for BOTH areas.

## 3. Actor runs
- **AUTHORITATIVE**: run `mQsO6K0joPnswbt5G` (SUCCEEDED, exit 0). Input: cities=[bengaluru], transaction=[buy], daysOld=365, fetchDetails=false, maxItems=3000, maxPagesPerCity=100, pageSize=30. **1776 items** → raw-apify-output.json in this dir.
- **DISCARDED**: run `O14rm1B0qhgG2derL` (startUrls = the user-provided saved-search permalink https://housing.com/in/buy/searches/D2M2P3yqqmgmdvlqoqz0nS6Y1 "house in JP Nagar listed by owner"). The actor did NOT resolve that permalink — it returned **200 Mumbai apartments** (Mira Road East, Virar West, Vasai East, Mulund West, …), all `apartment`, propertyType resale. Conclusion: the actor cannot consume that opaque `/searches/<id>` URL and falls back to its Mumbai default. NOT used. (dataset Ykc7obcr8NLrU8sBs)

## 4. Post-filter method (authoritative run, 1776 items)
For each listing, assign to JP Nagar / Kengeri if `localityUuid` matches the discovered id OR lat/long falls inside the OSM bbox. Dwelling type derived from title/subtitle/propertyTags (raw `propertyType` is project/resale build-status, not a dwelling type). Keep only derived type ∈ {house, residential_plot}. Recency: postedDate within 365 days (also natively enforced by daysOld=365).

## 5. Result — HOUSES = 4, RESIDENTIAL PLOTS = 0
No residential plots exist in the Bengaluru buy inventory via this actor for these areas (0 across all 1776 items in-area). House candidates (see house-candidates.json for full records):

| target_area | derived_type | match | listingId | title | area (sqft) | postedDate | seller | caveat |
|---|---|---|---|---|---|---|---|---|
| JP Nagar | house | localityUuid | 20335327 | 3 BHK Independent Builder Floor | 1600 | 2026-05-28 | Seller | "Builder Floor" — semi-independent; borderline "house" (team/code-reviewer to confirm include) |
| JP Nagar | house | localityUuid | 20225587 | 12 BHK Independent House | 7000 | 2026-05-13 | Seller | 12 BHK but 583 sqft/bed → PASSES the run-1 A2 plausibility rule (bedrooms>=8 AND <300 sqft/bed); large but retained |
| JP Nagar | house | localityUuid | 19441784 | 3 BHK Independent House | 1100 | 2026-06-18 | Seller | clean |
| Kengeri | house | bbox | 20436795 | 2 BHK Independent House | 900 | 2026-06-10 | Seller | locality="Gnana Bharathi" (inside Kengeri OSM bbox but not exact "Kengeri" locality string) — bbox-derived assignment |

All 4 are real, within-last-year, "Seller"-listed (strip any contact/PII regardless). All have lat/long, price, coverImageUrl, imageCount.

## 6. Constraints carried from run-1
No fabrication; no PII (fetchDetails=false; strip contact/seller-trust); third-party verification/broker signals NOT mapped; existing schema only; apply the run-1 A2 plausibility rule consistently; import only what is real (never pad to 10).
