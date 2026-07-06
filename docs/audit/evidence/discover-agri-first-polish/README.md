# Issue #1771 — Discover Agri-First Journey Polish: Evidence

**Initial verification failed visual parity; Claude continuation polish applied.**

The first implementation pass (Antigravity, checkpointed at `f2c0a6ec` / `2cc03488`)
passed its tests and captured screenshots, but the Udupi agri-first UI did not match
the approved Bangalore agri mock closely enough. This continuation reworked the three
agri-first right-panel views and the agri map legend to mock parity, Udupi-first.

## Before / after summary

| Area | Before (Antigravity pass) | After (this continuation) |
| --- | --- | --- |
| Agri landing | Navy hero + info band, but corridor cards were dense rows of tiny badges with a compass tile, guided-step block, and a chevron affordance | Mock-parity corridor cards: solid green direction disc, bold title + "Up to X km from the city" subtitle, parcel-count badge top-right, two pale-green stat bands (towns / acres), TOWNS chip row, "Explore direction →" CTA bottom-right; section header shows "N corridors" |
| Corridor selected | Tinted `SummaryBandCard` ("Change corridor"), plain distance chips without counts, flat town rows with chevrons, sparse body | "← Back to directions" link; dark navy hero with breadcrumb (Discover Udupi › Agricultural land › North), DIRECTION / CORRIDOR label, serif corridor title, description, parcels/towns/acres stat row; distance chips with per-tier counts and a check on the strong-green selected chip; pale green summary band ("4 Agri parcels for sale · grouped into 2 towns" + mono acres/distance line); town cards with location icon block, parcel count · acreage, "View parcels →" CTA |
| Locality selected | Compact plain bordered text cards, chip-capped facts, no hero, no filters | Dark navy locality hero with full breadcrumb + TOWN / LOCALITY label + parcels/acres stat row; grouped inline filter block (Land size / Price range / Soil–cultivation pills with selected state, Road access + Water available chips) that client-side filters the parcels; image-led parcel cards in a two-column grid: gradient field-placeholder header with land-size overlay pill, price row (auth-gated), category tag, title, two-column metadata rows (road, water, soil, cultivation, ownership, farmhouse, fencing), For Sale tag + updated date, full-width "View parcel" button |
| Map | Static legend always listing Corridors / Village clusters / Parcels | Contextual legend per stage: landing → Corridors; corridor → Corridors + Village clusters; locality → Parcels (data-stage attribute asserted in e2e). Corridor sector polygon and acreage-pill parcel markers were already present (#1429/#1410) and are unchanged |

## Routes tested (exact)

Primary acceptance routes (Udupi first):

1. `http://localhost:5174/discover?city=udupi&lat=13.34090&lon=74.74210&zoom=11&journey=agri-first`
2. `http://localhost:5174/discover?city=udupi&lat=13.45334&lon=74.74023&zoom=12&journey=agri-first&region=N&maxKm=25`
3. `http://localhost:5174/discover?city=udupi&lat=13.45340&lon=74.74033&zoom=12&journey=agri-first&region=N&maxKm=25&locality=Brahmavar`

Bangalore mock-mirror routes:

4. `/discover?city=bangalore&journey=agri-first`
5. `/discover?city=bangalore&journey=agri-first&region=N&maxKm=100`
6. `/discover?city=bangalore&journey=agri-first&region=N&maxKm=100&locality=Yelahanka%20Rural`

Regression routes:

7. `/discover?city=bangalore&journey=area-first`
8. `/discover?city=bangalore&journey=school-first`

(Screenshots were captured against a local worktree Vite dev server on port 5197 with
all Discover agri APIs route-mocked in Playwright — fully offline, no backend and no
shared Supabase. The `5174` host in the issue routes is the usual local dev port; the
path + query strings used are identical.)

## Screenshots

| File | Content |
| --- | --- |
| `1_udupi_agri_first_landing.png` | Udupi agri landing — navy hero, corridor cards with stat bands + town chips + Explore CTA |
| `2_udupi_agri_direction_selected.png` | Udupi N corridor — navy hero, counted distance chips (Up to 25 km selected), green summary band, town cards, sector polygon + contextual legend |
| `3_udupi_agri_locality_selected.png` | Brahmavar — navy locality hero, grouped filter block, two-column image-led parcel cards |
| `4_bangalore_agri_first_landing.png` | Bangalore landing (24 parcels / 4 corridors, N towards Doddaballapur card mirrors mock) |
| `5_bangalore_agri_direction_selected.png` | Bangalore N corridor selected (Up to 100 km) |
| `6_bangalore_agri_locality_selected.png` | Yelahanka Rural parcel cards (1-acre nursery plot / 2.4-acre vegetable farm mirror mock cards) |
| `7_area_first_regression_after_agri_polish.png` | Area-first landing unchanged ("Choose an area in Bangalore") |
| `8_school_first_regression_after_agri_polish.png` | School-first landing unchanged |

## How the final UI matches the mock

- **Landing**: dark navy hero card with breadcrumb, green icon tile, serif title, stat
  row; pale-green "Dedicated agricultural model" band; "DIRECTION / CORRIDOR" section
  header with corridor count; corridor cards match the mock's hierarchy (disc, title,
  km subtitle, parcel badge, stat bands, town chips, bottom-right CTA).
- **Corridor**: back link, navy hero (breadcrumb › North, DIRECTION / CORRIDOR label,
  serif title, stat row), distance chips with counts + check-marked solid-green
  selected chip, "Includes parcels at closer distances too." helper, pale green
  grouped-summary band, town cards with icon block and "View parcels →".
- **Locality**: navy hero (breadcrumb › North › Brahmavar, TOWN / LOCALITY label, stat
  row), grouped filter container (Land size / Price range / Soil–cultivation pill rows
  with dark selected state, Road access / Water available chips), image-led parcel
  cards in a 2-column grid with land-size overlay, prominent price position, category
  tag, metadata rows and a "View parcel" button.
- **Map**: legend is contextual per stage; corridor sector polygon and per-parcel
  acreage/price pill markers render as in the mock.

## Known intentional differences vs the mock

- **No listing photos**: the public agri DTO (`AgriMapListingItem`) carries no image
  URLs, so parcel cards use a deterministic field-placeholder header (gradient +
  sprout) with the mock's land-size overlay pill. No fake photos are shown.
- **No trust badges**: trustTier is not in the public agri DTO (and is unmapped
  platform-wide), so the mock's "Trusted/Verified" image badges are omitted rather
  than fabricated.
- **No per-town "~N km" distances / "N km from city" hero stat / survey numbers**:
  these fields do not exist in the corridor/parcel API responses; they are omitted
  rather than invented.
- **Prices in evidence**: screenshots are anonymous sessions, so parcel-card prices
  render as "Sign in to view price" (per the #1547 anon price gate) and the Price
  range filter pills are locked with a "Sign in to filter by price." note. Map marker
  price pills appear only because the offline fixtures include `pricePaise`; in
  production the anon API returns `pricePaise: null` (#1551/#1726), so anon markers
  fall back to land-area labels.
- **Corridor descriptions**: the mock's editorial corridor copy (e.g. "Airport-side
  farmland…") has no data source; the corridor hero uses a deterministic
  data-derived line ("Agricultural land up to X km north of Udupi — parcels grouped
  by town and distance.").
- **Locality inline filters are client-side**: they filter the already-fetched
  parcels locally (presentational parity); the URL-backed advanced agri filters
  remain in the corridor panel's Filters drawer (#1457/#1458).

## Validation results

| Check | Command | Result |
| --- | --- | --- |
| TypeScript (project config) | `npx tsc --noEmit -p tsconfig.json` | exit 0 — PASS |
| TypeScript (app config, strict test files) | `npx tsc --noEmit -p tsconfig.app.json` | 114 pre-existing error lines in untouched test files (main baseline: 116); **0 errors in files changed by this issue** |
| Discover unit/component tests | `npx vitest run src/components/discover src/pages/__tests__` | 76 files, **1174 passed**, 3 skipped — PASS (exit 0) |
| Map component tests | `npx vitest run src/components/map/__tests__` | **164 passed** — PASS (exit 0) |
| Evidence capture e2e (offline, route-mocked) | `npx playwright test capture-discover-agri-first-polish-1771 --project=full` | **8 passed** — PASS (exit 0) |

Coordinate-coarsening compatibility (#1726/#1776) is preserved: no backend/API files
were touched, the anon `skipAuth` fetch paths are unchanged, and the UI never assumes
exact pins.

Superseded screenshots from the first (failed-parity) pass were removed from this
directory; they remain available in git history at commit `2cc03488`.
