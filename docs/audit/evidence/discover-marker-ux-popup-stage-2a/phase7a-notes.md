# Phase 7A browser verification notes — issue #1810 (re-run, stack up)

Date: 2026-07-10 22:07-22:36 GMT+1
Frontend: http://localhost:5180 (Vite, live)
Backend: http://localhost:8090 (local PostGIS fixture jar)
Tab: single clean MCP tab (tabId 600522446), no cross-tab contamination.

## Fixture correction (important)

The orchestrator's suggested deep link used `groupId=north-growth`, described as the
"design name thanisandra-hennur-belt" dense fixture (~29 areas / 181 listings). This is
WRONG for this jar build. Verified via:

```
curl -s "http://localhost:8090/api/discover/area-groups?city=bangalore"
```

Result (`area-groups.json`, group sizes by areaKeys count):
- north-growth: 2 areas (Hebbal, Yelahanka) — NOT the dense fixture
- thanisandra-hennur-belt: 29 areas, 181 properties — THIS is the dense fixture, matching
  the [[bangalore-area-group-sizes]] memory note from a prior session.

Used corrected deep link:
`http://localhost:5180/discover?city=bangalore&journey=area-first&groupId=thanisandra-hennur-belt`
— confirmed in-browser: right panel shows "Thanisandra-Hennur Belt · 29 areas · 181 properties".

## AC1/AC2/AC3 — area-cluster chip

Zoomed screenshot of the "+2 nearby areas · Tap to expand" chip (region [160,280]-[460,400]
of the dense-group view) shows:
- neutral copy "+N nearby areas · Tap to expand", no area name on the chip face
- soft-outline pill (copper outline, white fill) with a stacked-chevron glyph icon
- a thin leader line + small dark anchor dot connecting the chip to its true centroid
- visually distinct from named-area representative markers, which use a solid pin icon +
  dark-text pill with area name + "N properties" (e.g. "Thanisandra 46 properties",
  "Sahakara Nagar 9 properties")
PASS.

## AC4/AC5 — labels, pin placement, leader lines, no jitter

- Long/short labels rendered without visible truncation artifacts in the captured views
  (e.g. "Hebbal Kempapura", "R.K. Hegde Nagar" render in full within their pill width).
- Representative pins visually sit at plausible geocoded points along roads/localities.
- Leader line + anchor dot present on offset chips (see AC1-3 zoom).
- No-jitter check: captured 3 consecutive screenshots at the same idle viewport
  (post-load, +hover at [240,346], +hover away then back) — marker positions/labels were
  pixel-identical across all 3 (Agrahara Layout, Jakkur, R.K. Hegde Nagar, Kvalasanahalli,
  Hebbal Kempapura, Bileshivale, +chips, Cooke Town all at same coordinates).
- Pan check: dragged map (350,600)->(400,550), waited 1s, screenshot; then a further
  screenshot after another 1s wait was pixel-identical to the first post-pan screenshot —
  no post-settle reshuffle.
PASS.

## AC6 — named area pin click drills straight to listings (regression)

Clicked the "Thanisandra 46 properties" marker. URL updated to
`...&areaKey=IN%7CKA%7CBengaluru%7CThanisandra` and the panel immediately rendered
"Properties in Thanisandra" (breadcrumb Bangalore > North Bangalore > Thanisandra-Hennur
Belt > Thanisandra, 20 verified properties for sale, listing cards). No intermediate
popup/card was shown between click and the listings view.
PASS.

## AC7 — area-cluster chip only expands (regression)

Returned to the group view and clicked the "+12 nearby areas · Tap to expand" chip.
The map zoomed in and revealed more area markers (4 of 29 -> 8 of 29 areas shown); the
right panel remained on "Choose an area in Bangalore" (unchanged), no navigation to a
listings view occurred, and the map was never emptied.
PASS.

## AC8/AC9 — listing-popup stepper + Show-in-list (NOT auth-blocked in this fixture)

Correction to the orchestrator's premise: anonymous users DO see listing markers in this
jar build once zoomed into an area (small pin icons showing a blank price "–"), and the
popup IS reachable anonymously — this fixture does not gate markerListings behind auth
the way the task briefing assumed.

Verified via `GET http://localhost:8090/api/discover/cities/bangalore/listings?areaKeys=...`
returning 200 (not empty) while `/api/discover/summary` returned 401 (confirming the
briefing's 401 claim was specific to the city-summary endpoint, not marker listings).

- Clicked a listing pin near Thanisandra -> popup opened: title "3 BHK Apartment in
  Thanisandra", stepper "19/20" with < / > arrows, "Sign in to view price", "Show in
  list" (View details / Show in list buttons).
- Clicked the stepper's ">" arrow: stepper advanced to "20/20", title updated to
  "2 BHK Apartment in Thanisandra". Map camera URL params (lat=13.05222, lon=77.63121,
  zoom=15) were IDENTICAL before and after the step — no camera move/panInside on step
  (this was the explicit out-of-scope MODEL-B behaviour to fail on; confirmed NOT present).
- Clicked "Show in list": popup closed, and the corresponding listing card in the right
  list panel was highlighted (orange border) and scrolled into view.

Both AC8 and AC9 were exercised live in-browser, not just via JSDOM tests. PASS
(browser-verified, not CODE_VERIFIED-only as the briefing anticipated).

## Out of scope (not tested, per briefing)

School search, tier/trust badge, backend/API correctness beyond what was needed to locate
the dense fixture, Central-Bangalore taxonomy, and Model-B stepper camera-move behaviour
(actively checked for and NOT observed — see AC8 note above).
