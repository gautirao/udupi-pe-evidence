# School-first visual parity continuation polish

Continuation polish of the school-first discovery journey to visual parity with the
approved Bangalore mock (mock screenshots supplied by the user in-session are the
source of truth). Branch: `ui/school-first-visual-parity-polish`, base `f8469bea`
(latest main at cut time). Frontend-only.

## Exact routes tested

Captured via click-through (Playwright, `scripts/pv-school-first-visual-parity.mjs`)
against FE `localhost:5173` (Vite, worktree root) → BE `localhost:8085` (Spring Boot,
branch == main backend, read-only browsing; no DB mutations):

1. `/discover?city=udupi&journey=school-first` (landing)
2. → Explore zone "University Belt" (zone selected)
3. → View schools "Manipal" — final URL `...&groupId=university-belt&areaKey=IN|KA|Udupi|Manipal`
4. → View homes "Aloysius PU College" — final URL `...&schoolId=afb4ea6b-...&radiusKm=3`
5. `/discover?city=bangalore&journey=school-first` (landing)
6. → Explore zone (North growth cluster) `groupId=north-growth`
7. → View schools "Hebbal"→ `areaKey=IN|KA|Bengaluru|Mallasandra`
8. → View homes → `schoolId=59ec42ce-...&radiusKm=3`
9. `/discover?city=udupi&journey=area-first` (regression)
10. `/discover?city=udupi&journey=agri-first` (regression)

## Screenshots

1. `1_udupi_school_first_landing.png`
2. `2_udupi_school_zone_selected.png`
3. `3_udupi_school_area_selected.png`
4. `4_udupi_school_selected_radius.png`
5. `5_bangalore_school_first_landing.png`
6. `6_bangalore_school_zone_selected.png`
7. `7_bangalore_school_area_selected.png`
8. `8_bangalore_school_selected_radius.png`
9. `9_area_first_regression_after_school_polish.png`
10. `10_agri_first_regression_after_school_polish.png`

## What changed vs the previous school-first polish

- **Landing**: zone cards rebuilt to mock structure — icon square, bold title,
  description line, "AREAS" small-caps + bordered per-area chips (capped, `+ N more`
  overflow), full-width plum "schools" stat band + copper "listings" stat band,
  "Explore zone →" CTA; "School zones" heading gained a right-aligned zone count;
  Area/School segmented toggle added (navigates via the existing journey setter —
  no URL-state semantics change); search input restyled to rounded pill + icon.
- **Zone selected**: new dark-navy `SchoolJourneyHero` (breadcrumb, "SCHOOL ZONE"
  label, serif title, description, schools + homes-for-sale stat row); area cards
  redesigned (pin icon square, name, description, "X schools · Y homes",
  "View schools →"); back link copy "Back to school zones".
- **Area selected**: navy hero ("SCHOOLS IN AREA", serif "Schools in {Area}",
  helper "Choose a school to see homes within 3, 5 or 10 km.", stat row); school
  cards with dark board chip + level chip; old "how school search works"
  instructional strip removed.
- **School selected**: navy hero (breadcrumb to school, "SELECTED SCHOOL" label,
  serif school name, locality, homes-for-sale stat, "Change school" button); radius
  chips restyled to three wide equal buttons, active = plum border + tinted fill with
  count under label; results heading names the school ("Homes near {School}");
  two-column image-led listing grid (pre-existing `PropertyCard` already mock-conformant:
  distance-from-school pill on image, price, type pill, heart, "View details").
- **Map**: new contextual `MapSchoolLegend` (landing "School zones" / zone "Areas" /
  area "Schools"; school-selected keeps existing `SchoolRadiusLegend` with
  Schools / Homes / radius); bottom status pill is now stage-aware for school-first —
  "Showing X schools" on landing/zone/area, "Showing X homes|rentals" once a school
  is selected; stray pre-existing "No schools found in this area" toast on
  landing/zone states eliminated by gating school markers on a resolved `areaKey`
  (verified pre-existing on base commit; the layer only ever had data post-areaKey).

## How the new UI matches the mock

Dark navy hero cards with breadcrumb/label/serif-title/stat rows on all four states;
segmented Area/School toggle; pill search input; zone cards with dual stat bands and
CTA; spacious area/school cards with right-aligned CTAs and board/level chips; strong
active radius chip with count; image-led two-column listings with distance overlay,
price prominence, type pill and "View details"; contextual map legends and
schools/homes status pill.

## Known intentional differences

- Top nav/global chrome unchanged by instruction (mock shows a simplified public
  header).
- Search placeholder remains "Search school name..." (live locator in 2 unit test
  files + 5 e2e specs; styling updated, copy kept).
- Landing hero helper reads "Pick a school zone below, or search a school by name."
  (existing copy, same intent as mock's phrasing).
- Inactive radius chips show no counts — no per-radius count fetch exists; only the
  active radius has a real count (no fabricated data).
- Trust badges absent on Udupi listing cards — public DTO `trustTier` is "D"/null in
  this dataset (known unmapped tier); badge renders only when a mapped tier exists.
- Listing-card photos fall back to the existing safe placeholder when
  `primaryImageUrl` is absent (seed data has no images); layout stays image-led.
- Hero "21 schools" vs map pill "Showing 23 schools" on Udupi landing: two
  pre-existing real aggregates (city school total vs sum over discover areas);
  both honest, not reconciled in this UI-only pass.
- Landing scope-variant back link ("...in {scope}") not implemented — scope context
  is not currently plumbed to that panel.

## Validation results

- `npx tsc --noEmit -p tsconfig.json`: exit 0, no output.
- `npx tsc --noEmit -p tsconfig.app.json`: 218 pre-existing baseline errors,
  byte-identical before/after (`diff` = identical) — **0 changed-file errors**.
- Vitest (school-first + map suites): MapDiscovery suites 11 files / 100 tests PASS;
  school panels + legend + regression set 12 files / 269 tests — 268 PASS, 1 FAIL:
  `tests/discover/panels-parity.test.tsx › AgriGroupSelectedPanel corridor band` —
  **verified pre-existing on base commit f8469bea** (fails on clean checkout; stale
  agri-first assertion from before #1771's navy corridor hero; agri code untouched).
- Browser evidence (AUTOMATED capture, MANUAL review of renders): click-through
  zone → area → school → radius for both cities; back/forward and buy/rent toggle
  preserved through states (URL-state mechanism untouched); marker popup behavior
  unchanged (no marker component edits).
- Console: 4× `403 Forbidden` static-asset noise — known worktree symlinked
  `node_modules` Vite `/@fs` false negative, not an app regression.

## Confirmations

- No backend/API/DTO changes (diff contains no `backend/**` files).
- No OpenSearch changes.
- No Supabase config or migration changes.
- No top nav/global chrome changes.
- No `_ds_bundle.js` changes.
- No agri-first logic changes (agri files untouched; regression verified via
  screenshot 10 + agri legend tests).
- No area-first logic changes (regression verified via screenshot 9).
- No coordinate-coarsening (#1726/#1776) file changes; map markers consume the same
  public coarsened data as before.
