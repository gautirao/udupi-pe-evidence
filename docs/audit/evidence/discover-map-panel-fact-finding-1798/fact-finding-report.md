# Discover Map/Panel Fact-Finding Report — #1798

> **Status: fact-finding only.** No code was modified. No tests were run. No PR opened.
> All statements below are derived from reading the design docs and the current
> `feature/journey-parity` working tree (base commit `56e97239`). Claims about runtime
> behaviour are *static-analysis inferences* and are labelled as such — none of them were
> reproduced in a browser during this pass.

---

## 1. Executive verdict

**The app is not ready to implement PR-B directly, but it is much closer than the design docs assume.**

The two things worth knowing before anything else:

1. **PR-B's marker work is already largely landed in the app.** `src/lib/map/areaMarkerBucketing.ts`
   and `src/components/map/AreaMarkerLayer.tsx` already implement the `AREA_MARKER_UX.md`
   degradation model: bands, grid bucketing, per-quadrant coverage guarantee, a 12-label cap,
   navigation area-clusters that are visually distinct from listing clusters and carry an
   **area** count (never a property sum), demoted hover-dots, forced-always promotion of
   selected/searched/hovered areas, and zoom-only recompute. The `Showing X of N areas on the
   map` panel note is wired end-to-end. A naive PR-B implementation would rebuild all of this.

2. **The real defects are in the wiring around that layer, not in the layer.** Specifically:
   a listing-marker surface that falls back to unfiltered city-wide markers once a group is
   selected and the user zooms in; an area-cluster chip that calls `map.fitBounds` directly
   (bypassing the single-camera-owner invariant established by #1801) with no
   "can't zoom further" guard and no panel-side handler; a cluster chip that is **named after
   its dominant area** rather than neutral; and school search that has no group scope at all.

So the mismatch is real, but it is a *seam* problem, not a *build-the-feature* problem.
The recommended shape is **two stages**, not three, and Stage 1 is correctness-only.

Confidence: high on the code facts (all cited), medium on the runtime repro chains (not
browser-verified this pass — see §5).

---

## 2. Design documents reviewed

Under `docs/design/retrends-design-system/ui_kits/discover/`:

| Document | What it contributes |
|---|---|
| `src/MAP_PANEL_ALIGNMENT.md` | The 13-row state-by-state alignment table; the "panel is the complete source of truth, map is a decluttered subset of the *same scope*" principle; direct-access rules; the acceptance checklist. |
| `src/MARKER_PLACEMENT_SPEC.md` | True-anchor vs visible-chip separation; the ≥16 px leader-line rule; priority order; per-layer placement; collision rects; jitter/stability rules; mobile label-cap tightening. |
| `src/AREA_MARKER_UX.md` | The degradation bands (1–8 / 9–15 / 16–30 / 30+); ranking; grid bucketing + quadrant guarantee; area-cluster vs listing-cluster semantics table; search promotion; camera rules; the Thanisandra–Hennur Belt worked example. |
| `src/PR_B_IMPLEMENTATION.md` | What the prototype actually shipped, including the "gap-fix pass (review round 2)" — the seven items that map almost 1:1 onto the app's remaining gaps. |
| `src/MAP_MARKER_UX.md` | Base marker spec that `AREA_MARKER_UX.md` supersedes for the area layer. |
| `index.html`, `src/PortalMap.jsx`, `src/DiscoverPanel.jsx`, `src/data.js` | The prototype itself (reference only — **mock fixture data, must not be copied into app code**). |

Screenshots referenced (present, not pixel-diffed this pass):
`guide-01-city-declutter.png`, `guide-02-group-overview.png`, `01-guide-03-belt.png`,
`02-guide-03-belt.png`, `guide-05-area-listings.png`, `03-prb-listing-popup.png`,
`02-prb-school-search.png`, `02-prb-school-jump.png`, `01-prb-direct-access.png`,
`02-prb-direct-access.png`, `guide-11-mobile.png`.

---

## 3. Current implementation inventory

| File | What it controls |
|---|---|
| `src/pages/MapDiscovery.tsx` (~3,638 lines) | The orchestrator. Owns URL state, derives `mapLayerCategory`, decides which `areas` array and which `listings` array reach the map, owns the camera-intent publisher, and renders the right panel. This is where the scope decisions live. |
| `src/components/map/PropertyMap.tsx` (~1,725 lines) | Leaflet shell. `MapController` (:1022) is the **sole camera owner** for area navigation, gated on `cameraIntent.seq` with a TTL-bounded suppression window (`CAMERA_SUPPRESS_TTL_MS = 8000`). Also hosts `MarkerClusterLayer`, `AgriMarkerClusterLayer`, `AgriPolygonLayer`, and the five `*Panner` components. |
| `src/components/map/AreaMarkerLayer.tsx` (499 lines) | Two effects: a **legacy path** (every area → full labelled pin, filtered by `focusedGroupAreas`) and an opt-in **degraded path** (`enableDegradation`) that renders representatives + hover-dots + area-cluster chips. |
| `src/lib/map/areaMarkerBucketing.ts` | Pure, Leaflet-free ranking/bucketing. Exports `computeBand`, `computeAreaMarkers`. Implements bands, grid cells (`cellPx` default 110), rank comparator, quadrant guarantee, `labelCap` default 12, forced-always promotion. |
| `src/components/discover/MarkerPopoverCard.tsx` | The listing-marker popup: photo, price (auth-gated), title, type pill + locality, one **View details** CTA. |
| `src/components/discover/panels/AreaGroupSelectedPanel.tsx` | Group detail panel; renders the `Showing X of N areas on the map — all N are listed below.` note (:331–337). |
| `src/components/discover/panels/AreaGroupsLandingPanel.tsx` | City landing + group-level panel; hosts `ScopedSearch` at both levels. |
| `src/components/discover/ScopedSearch.tsx` | The Area/School segmented toggle + result list. |
| `src/hooks/useSchoolSearch.ts` | `GET /api/public/schools/search?q=…&limit=10[&city=…]`. |
| `src/hooks/useDiscoverFilteredMarkers.ts` | `GET /api/discover/markers` — the authed endpoint that **does** honour `areaKeys` + filters. |
| `src/hooks/useDiscoverAreas.ts` | `GET /api/discover/areas` — the area set (`geo_center_*`, `bbox`, counts). |
| `src/components/discover/panels/*` (`AreaSelectedPanel`, `SchoolJourneyPanels`, `AgriGroupLocalityPanel`) | Each runs its own `selectedListingId` effect that highlights + `scrollIntoView({block:'nearest',behavior:'smooth'})` the matching card. |

---

## 4. Behaviour matrix

Severity: **P0** = user-visible correctness / scope lie · **P1** = UX contract broken · **P2** = polish.

| Behaviour | Design expectation | Current app status | Gap | Severity | Likely files |
|---|---|---|---|---|---|
| **Map/panel scope alignment** | Map marker layer ⊆ panel scope, always (`MAP_PANEL_ALIGNMENT.md` principle 1) | **Broken on one path.** The `listings` IIFE (`MapDiscovery.tsx:2883–2951`) ends in `return isAuthenticated ? markerListings : [];`. `markerListings` comes from `useDiscoverFilteredMarkers(...)` called **without `areaKeys`** (`useDiscoverMapData.ts:215`) → city-wide, bbox-filtered only. With `groupId` set, no `areaKey`, not `isGroupResultsState`, and `mapZoom > AREA_LAYER_MAX_ZOOM (12)`, an authenticated user gets city-wide Bangalore markers while the panel shows the group's areas. | Group-selected state leaks unfiltered city markers above zoom 12 | **P0** | `MapDiscovery.tsx:2883–2951`, `useDiscoverMapData.ts:215` |
| Same, secondary | — | The area-selected branches use `areaMarkerListings.length > 0 ? areaMarkerListings : markerListings` (`:2940`, `:2946`) — an **empty area falls back to city-wide markers** rather than showing nothing. | Empty-area fallback shows out-of-scope markers | **P0** | `MapDiscovery.tsx:2938–2948` |
| **Area-marker density / degradation** | Bands 1–8 / 9–15 / 16–30 / 30+; ≤12 labelled reps; quadrant guarantee | **Implemented.** `computeBand` + `selectCellsForRepresentation` (quadrant reserve, `labelCap=12`). Gated on `enableAreaMarkerDegradation = mapZoom <= AREA_LAYER_MAX_ZOOM && !!focusedGroupAreas` (`MapDiscovery.tsx:2987`). | None on the group-selected path. **Not** enabled for city landing / region bubbles (those use synthesized group bubbles — arguably correct). | — | `areaMarkerBucketing.ts`, `AreaMarkerLayer.tsx` |
| **Area cluster semantics** | Neutral chip: `+13 nearby areas · Tap to expand`. Area count, never a property sum. **Never named after an area** (`PR_B_IMPLEMENTATION.md` gap-fix #2). | **Partially wrong.** `makeClusterIcon` (`AreaMarkerLayer.tsx:267–279`) renders `${dominantName}` + `+N areas`. Count is correctly `cluster.count` (area count). Visual is correctly a soft outline chip (paper fill, accent border, stack glyph) — distinct from the solid listing disc. | Chip is **named** → a dominant area can appear both as a rep pin and as the chip's name; no `Tap to expand` affordance | **P1** | `AreaMarkerLayer.tsx:267–279` |
| **Marker decluttering / leader lines** | Chip may offset in screen space; leader line + anchor dot when offset ≥16 px; deterministic; no reshuffle on hover | **Absent.** `areaMarkerBucketing.ts` does **no** screen-space offsetting, no leader lines, no anchor dots. Chips and reps anchor exactly at `geo_center_*`. Collision is avoided *by construction* (one label per 110 px grid cell), which is a legitimate alternative to offsetting — but there is no label-rect collision pass, so a long label can still overrun its cell into a neighbour's. | No leader lines / anchor dots / chip offsets; no label-rect collision pass | **P1** | `areaMarkerBucketing.ts`, `AreaMarkerLayer.tsx` |
| Determinism / no hover reshuffle | Recompute on zoom only; hover swaps icon in place | **Correct.** `zoomTick` from `zoomend` is the only recompute trigger; pan is deliberately excluded from deps (`AreaMarkerLayer.tsx:355–410`). Hover does `marker.setIcon(...)` in place (`:447–448`). | None | — | `AreaMarkerLayer.tsx` |
| **No empty cluster clicks** | Chip click flies to split; **if `getBoundsZoom` shows the camera can't get closer, don't fly — highlight + scroll the member rows** | **Broken.** Cluster click unconditionally calls `map.fitBounds(unionBounds(clusterAreas), {padding:[50,50], maxZoom:16})` (`AreaMarkerLayer.tsx:470`). No `getBoundsZoom` guard. And `onAreaClusterClick` is **never passed** by `MapDiscovery` → the panel does nothing. | Can zoom to a state that doesn't split; no panel fallback; also **bypasses the sole-camera-owner invariant** from #1801 | **P0** | `AreaMarkerLayer.tsx:465–480`, `MapDiscovery.tsx` (prop absent) |
| **Listing popup** | Compact infographic: photo, tier, price, facts, `‹ n/N ›` stepper, **Show in list** + View details | **Partial.** `MarkerPopoverCard.tsx` shows photo (`:166`), price or auth-gated placeholder (`:192`), title (`:204`), type pill + locality (`:210`), and **only** a `View details` CTA (`:224`). No trust/tier badge, no facts rows, no `n/N` stepper, no `Show in list`. | Missing stepper, facts, tier badge, Show-in-list | **P1** | `MarkerPopoverCard.tsx` |
| Popup ↔ card sync | Marker click highlights + scrolls the matching card | **Works, indirectly.** Click → `handleSelectMarkerListing` → `actions.setSelectedListing(id)` → URL `listing` param → each panel's own effect highlights + `scrollIntoView` (`AreaSelectedPanel.tsx:147–151`, `SchoolJourneyPanels.tsx:1166`, etc.). | None functionally. Note the popup is gated off in **agri-first** and **school-first** (`isMarkerPopoverEligible`, `MapDiscovery.tsx:2770–2773`). | P2 | `MapDiscovery.tsx`, panels |
| **Panel → map hover sync** | Panel hover promotes the marker (dot → label; clustered → chip highlights). No camera move. | **Half-wired.** `AreaMarkerLayer` accepts `hoveredAreaKey` and forces it to a representative via `applyForcedAlways`. Camera is correctly untouched (`hoveredListingId` never reaches `MapController` — `PropertyMap.tsx:452,462`). But there is no "chip shows *Includes ‹name›*" transient caption for a hovered area that sits inside a cluster. | Missing clustered-hover caption | P2 | `AreaMarkerLayer.tsx` |
| **Direct area search** | City-landing area search → jump straight to area listings | **Works.** `ScopedSearch` → `handlePickArea` → `onSelectArea(areaKey)` → `MapDiscovery:3478` `onSelectAreaKey` → flyTo + URL update. Rendered on the landing (`AreaGroupsLandingPanel.tsx:670`). | None | — | `ScopedSearch.tsx`, `AreaGroupsLandingPanel.tsx` |
| **Direct school search** | City-landing school search → jump straight to school context | **Works.** `handlePickSchool` → `handleSelectSchoolById` → `urlActions.setSchoolJourney({schoolId,…})` (`MapDiscovery.tsx:1465–1475`). | None | — | `ScopedSearch.tsx`, `useSchoolSearch.ts` |
| City boundary strict (no Udupi leak into Bangalore) | Hard requirement | **Holds.** `useSchoolSearch(query, city)` appends `city` when non-blank (`useSchoolSearch.ts:49–50`); panels thread `citySlug` (`AreaGroupsLandingPanel.tsx:597`). Landed per session note S1817. | None (worth a regression test, since it's a one-line guard) | — | `useSchoolSearch.ts` |
| **Group-scoped school search** | Inside a group, search schools across all group areas first; on no match, auto-widen **one level with an explicit `· outside ‹Group›` label**, never past the city | **Absent.** `useSchoolSearch` sends only `q`, `limit`, `city`. No `groupId` / `areaKeys` param exists on the request. No "outside" label anywhere in `src/components/discover/**`. Group-level search is therefore identical to city-level search. | Entire group-scoping + labelled-widen behaviour missing | **P1** | `useSchoolSearch.ts`, `ScopedSearch.tsx`, backend `schools/search` |
| **Camera jitter guards** | Fit once on level/selection change; no move on hover / scroll / typing; `panInside` for focus | **Mostly correct.** `MapController` gates on `cameraIntent.seq` with `lastHandledSeqRef` (`PropertyMap.tsx:1083–1087`) + TTL suppression. Typing drives marker promotion only, "never URL/camera state" (`MapDiscovery.tsx:1051`). Area-pin click publishes an intent rather than moving the camera (#1801). | Two holes: (a) the cluster chip's direct `map.fitBounds` (above); (b) **`panInside` is used nowhere in the repo** — only `flyTo`/`fitBounds`/`setView`. So "Show on map" / listing focus does a full move rather than a minimal pan. | **P1** | `AreaMarkerLayer.tsx:470`, `PropertyMap.tsx` |
| **Mobile** | Map above, panel as bottom sheet; label cap tightens to ~8 below 520 px; taps ≥44 px | **Divergent.** `MapDiscovery.tsx:2857` is `flex flex-col lg:flex-row`; the map is a fixed `h-64` (256 px) block with the panel stacked beneath (`:2861`). No bottom sheet for results. No viewport-width label-cap tightening — `labelCap` stays at the default 12 regardless of map width. | No sheet; no small-map cap | P2 | `MapDiscovery.tsx`, `areaMarkerBucketing.ts` |
| **Area-marker direct drill** (product invariant) | Area marker click → area listings, **no intermediate preview popup** | **Preserved.** Both the legacy loop and the degraded representatives loop do `onAreaClick?.(area); onAreaCameraIntent?.(area);` (`AreaMarkerLayer.tsx:328–335`, `:430–433`). Hover-dots also drill on click (`:449–453`). | None — **must not regress** | — | `AreaMarkerLayer.tsx` |

---

## 5. Reproduction notes

**None of the following were executed in a browser during this pass.** They are code-derived
predictions with the exact fall-through cited, written so a Stage-1 implementer can confirm
each one *before* writing a fix (per the Bug Fix Protocol: reproduce → confirm fail → fix →
confirm pass).

Relevant constant: `AREA_LAYER_MAX_ZOOM = 12`.

### R1 — Map/panel scope mismatch (P0)

- **Route:** `/discover?city=bangalore&lat=13.07513&lon=77.59987&zoom=12&journey=area-first&groupId=north-growth`
- **Steps:** sign in (the leak is auth-gated). Load the URL. Observe zoom 12 → no listing markers (correct: the `mapZoom <= AREA_LAYER_MAX_ZOOM` early-return at `:2900` fires). Now **zoom in one step to 13**.
- **Expected:** map shows only markers within the North Growth group's areas — or nothing.
- **Predicted actual:** the area pins disappear (`overviewAreas` is `[]` above the zoom gate, `:2480`) and city-wide Bangalore listing markers appear, unrelated to the two areas the panel lists.
- **Suspected cause:** `MapDiscovery.tsx:2950` — `return isAuthenticated ? markerListings : [];`. `markerListings` is `useDiscoverFilteredMarkers(city, agriFilters, markersEnabled, bbox, debouncedSearch, listingPurpose, excludePropertyType)` (`useDiscoverMapData.ts:215`) — the `areaKeys` argument is **omitted**, so `/api/discover/markers` is queried city-wide with only a bbox predicate. The group-scoped variant already exists three lines earlier (`if (isGroupResultsState) return groupResultsMarkers;`) but `isGroupResultsState` does not cover the plain group-selected state.
- **Anon note:** anonymous users get `[]` here, so this reproduces **only when signed in**. Any repro attempt must be authenticated or it will look like a false negative.

### R2 — Empty area falls back to city markers (P0)

- **Route:** any `…&areaKey=<an area with zero listings>` in area-first.
- **Predicted actual:** `areaMarkerListings.length > 0 ? areaMarkerListings : markerListings` (`:2946`) → the empty area yields city-wide markers.
- **Expected:** empty state, no markers.
- **Suspected cause:** the `||`-style fallback treats "empty result" and "not loaded" identically. `isLoadingAreaListings` already covers the loading case on the preceding line, so the fallback is reachable only in the genuinely-empty case.

### R3 — Area-cluster click zooms into a non-splitting view / does nothing to the panel (P0)

- **Route:** Thanisandra–Hennur Belt / dense Bangalore North group, at zoom ≤ 12 with degradation active.
- **Steps:** click a `+N areas` chip whose members are tightly co-located (the spec's "dense knot" — Nagavara / Ganganagar / Bileshivale / Kaval Bairasandra).
- **Expected (spec `MAP_PANEL_ALIGNMENT.md` row 3b):** if `getBoundsZoom` shows the camera cannot get closer, **do not fly** — highlight + scroll the member rows in the panel.
- **Predicted actual:** `map.fitBounds(unionBounds(clusterAreas), {padding:[50,50], maxZoom:16})` always fires (`AreaMarkerLayer.tsx:470`). Nothing happens in the panel because `onAreaClusterClick` is never passed from `MapDiscovery`. Note that at `maxZoom: 16` the map has also crossed `AREA_LAYER_MAX_ZOOM = 12`, so the area layer unmounts entirely — which is likely the "clicking a cluster zooms into an empty map" symptom in the brief.
- **Suspected cause:** two independent omissions — no `getBoundsZoom` guard, and an unwired callback. The direct `map.fitBounds` also violates the sole-camera-owner invariant that #1801 established for every other area interaction.

### R4 — Named area cluster duplicates a named pin (P1)

- **Route:** dense belt group.
- **Predicted actual:** `makeClusterIcon` renders `${cluster.dominantName}` alongside `+N areas` (`AreaMarkerLayer.tsx:271`). If the dominant area is also a grid-cell representative elsewhere in view, its name is on the map twice with different semantics.
- **Expected:** neutral `+13 nearby areas · Tap to expand`.

### R5 — Group-level school search is not group-scoped (P1)

- **Route:** `…&journey=area-first&groupId=north-growth` → right panel → School tab → type `hebbal`.
- **Expected (spec row 5):** schools in the belt's areas first; a Hebbal match outside the belt returned **with** a `· outside Thanisandra–Hennur Belt` label; never a Udupi school.
- **Predicted actual:** identical results to the city landing. `useSchoolSearch.ts:43–59` builds `?q=…&limit=10` plus `city` only. No scope, no label. City boundary *does* hold.
- **Suspected cause:** no group scope has ever been plumbed; `ScopedSearch` receives `citySlug` but not `groupId`/`areaKeys`.

### R6 — Hebbal selected area / School-first Hebbal / city-landing Hebbal search

- These three are believed **healthy** and should be run as **regression baselines before Stage 1**, not as bug repros. Direct area search (`ScopedSearch → onSelectArea → MapDiscovery:3478`), direct school search (`→ handleSelectSchoolById → setSchoolJourney`), and the marker popup + card scroll all have concrete code paths. Capturing a clean "before" here is what makes the Stage-1 scope changes safe.

---

## 6. Backend / API impact

**Stage 1 is frontend-only. Stage 2 is frontend-only except for one item.**

| Fix | Verdict | Why |
|---|---|---|
| R1 map/panel scope leak | **Frontend-only** | `/api/discover/markers` already accepts `areaKeys` and honours the full predicate — `useDiscoverFilteredMarkers` is called *with* `areaKeys` for the group-results state (`MapDiscovery.tsx:697,706`). The fix is to pass the focused group's `area_keys` on the group-selected path too. No new contract. (Also note the comment at `:690–693`: the public `/api/listings/markers` silently ignores `areaKeys` — do **not** route through it.) |
| R2 empty-area fallback | **Frontend-only** | Remove the `||`-fallback; the loading case is already handled. |
| R3 cluster click | **Frontend-only** | `getBoundsZoom` is a Leaflet API. Wiring `onAreaClusterClick` to a panel highlight/scroll is FE state. Moving the fly through `publishCameraIntent` reuses the existing `cameraIntent.seq` channel. |
| R4 neutral chip label | **Frontend-only** | Pure `makeClusterIcon` change. `cluster.dominantName` stays available for the hover "Includes ‹name›" caption. |
| R5 group-scoped school search | **Backend likely required — flagging as the one contract gap** | `GET /api/public/schools/search` takes `q`, `limit`, `city`. Group scoping needs either (a) a new `areaKeys` (or `groupId`) request param so the server can rank in-group matches first and label the rest, or (b) an FE composition over per-area school lists. **(b) is not sound**: the server applies `limit=10` *before* the FE could filter, so in-group schools ranked 11+ would silently vanish. The auto-widen label (`· outside ‹Group›`) also needs the server to tell the FE *which* results were in-scope. Recommend a small additive `areaKeys` param + an `inScope: boolean` field on each result. **Additive only — no schema change, no migration.** |
| R6 leader lines / offsets | **Frontend-only** | Screen-space presentation; spec explicitly forbids persisting offsets. |
| Mobile sheet | **Frontend-only** | Layout. |

Nothing here touches DB schema, Flyway, OpenSearch, ingestion (#1779), or `_ds_bundle.js`.

---

## 7. Risk assessment

- **Coordinate privacy — LOW, but one thing to watch.** True anchors are `areas.geo_center_lat/lon`, and the leaf listing layer stays clustered until zoom. The one hazard is R3's fix: if the cluster-split path is allowed to `maxZoom: 16` it crosses the area layer's own `AREA_LAYER_MAX_ZOOM = 12` band. Any change to cluster zoom must not become a back-door to exact private pins at high zoom. Screen-space offsets (Stage 2) must never be persisted or round-tripped through the URL.
- **Saved homes — LOW.** No stage touches the saved-homes surface. Assert it in the Stage-2 regression pass since `MarkerPopoverCard` sits adjacent to listing identity.
- **Trust badges — MEDIUM if the popup grows.** Adding a "tier" row to `MarkerPopoverCard` intersects a known trap: `[[discovery-trusttier-unmapped]]` — `trustTier` currently returns `"D"`/`null` (unmapped), so a naively-added badge would render nothing or something wrong, on a **public-safe** surface. **Recommendation: do not add the tier badge in this workstream.** Ship the stepper + Show-in-list, leave tier out, and let it ride with whatever fixes the tier mapping.
- **Existing journey routing — MEDIUM. This is the biggest regression surface.** `MapDiscovery.tsx:2883–2951` is a hand-tuned cascade carrying fixes from #1074, #1118, #1156, #1261, #1412, #1597, #1745. Changing the terminal `return isAuthenticated ? markerListings : []` must not disturb the agri-drilldown, school-radius three-tier, or group-results branches above it. Note also that the **degraded path in `AreaMarkerLayer` has no in-layer `focusedGroupAreas` guard** — the legacy path filters, the degraded path relies entirely on `MapDiscovery` pre-filtering `overviewAreas`. That is a latent trap: any future caller that enables degradation with a wider `areas` array gets out-of-group markers with no warning. A defensive in-layer filter is cheap insurance and belongs in Stage 1.
- **Mobile — LOW for Stages 1–2** (no layout change), **MEDIUM if a bottom sheet is attempted.** Recommend deferring the sheet entirely.
- **Fake/mock data — LOW, with an explicit guardrail.** The prototype's `src/data.js` deterministically *generates* the 29-area belt. `PR_B_IMPLEMENTATION.md` says so plainly. **Nothing from `data.js` may enter app code.** The app's `north-growth` group ID must not be renamed to match the prototype's "Thanisandra–Hennur Belt" naming, and no counts, areas, schools, or distances may be synthesized. `onMarkersComputed` already derives `shown`/`total` from real bucketing output and real `areas.length` — that pattern is the one to follow.
- **Camera invariant — MEDIUM.** #1801 established `MapController` as the sole camera owner and paid for it with a P0 remediation (`focusBoundsBlockedRef` TTL). `AreaMarkerLayer.tsx:470` is a live exception to that invariant. Fixing it is a correctness win, but it must route through `publishCameraIntent`/`cameraIntent.seq` rather than adding a second imperative caller.

---

## 8. Recommended staged plan

Two stages. A third is listed only to name what is being deliberately deferred.

### Stage 1 — Scope correctness and camera invariant (P0s)

**Scope**
- Pass the focused group's `area_keys` to the marker query on the group-selected path so `/api/discover/markers` returns group-scoped markers (R1). Reuse the existing `groupResultsMarkers` pattern rather than inventing a second one.
- Remove the `areaMarkerListings.length > 0 ? … : markerListings` fallback so an empty area shows an empty map (R2).
- Add a defensive `focusedGroupAreas` filter inside `AreaMarkerLayer`'s degraded effect, mirroring the legacy effect — so the layer cannot render out-of-scope markers regardless of caller.
- Guard the area-cluster click with `map.getBoundsZoom(...)`: if the camera cannot get closer, **do not fly**; instead fire `onAreaClusterClick` and let the panel highlight + scroll the member rows (R3). Wire `onAreaClusterClick` in `MapDiscovery`.
- Route the cluster's fly through `publishCameraIntent` so `MapController` remains the sole camera owner (#1801 invariant).

**Non-goals:** no visual/marker restyling, no popup changes, no search changes, no mobile work, no `panInside` migration.

**Files likely touched:** `src/pages/MapDiscovery.tsx` (the `listings` IIFE `:2883–2951`; the `onAreaClusterClick` prop; a panel-scroll handler), `src/hooks/useDiscoverMapData.ts` (`:215` — thread `areaKeys`), `src/components/map/AreaMarkerLayer.tsx` (`:465–480` cluster handler; degraded-effect guard), `src/components/map/PropertyMap.tsx` (prop pass-through).

**Tests required:** unit tests on the `listings` selector asserting group-scoped markers at zoom 13 with `groupId` set and `isAuthenticated=true`, and `[]` for an empty area; an `AreaMarkerLayer` test that the degraded path drops non-`focusedGroupAreas` markers; a cluster-click test asserting **no** `fitBounds` when `getBoundsZoom` returns the current zoom, and that `onAreaClusterClick` fires either way. Extend the existing `src/components/map/__tests__/AreaMarkerLayer.test.tsx`. Regression: the existing 197 map tests from #1801, plus the `panels-parity` suite — noting `[[prexisting-agri-parity-test-failure]]` (the "corridor band not solid evergreen" failure is pre-existing on clean `main` and is **not** caused by this work; cite the clean-base proof rather than re-debugging).

**Browser evidence required:** authenticated session (the R1 leak is auth-gated — an anon repro will look clean and mislead). Deep link `?city=bangalore&…&zoom=12&journey=area-first&groupId=north-growth`, zoom to 13, screenshot before/after. Per `[[browser-verify-console-tab-crosscontamination]]`: **one clean tab, throttled, three runs** — the console tool pools by domain, not by tab, so camera/URL/timing repros are false-positive-prone. Also re-verify the #1738 marker-popup regression, which `[[discover-portal-1745-marker-popup-checklist-carryforward]]` says to attach to the first slice touching map/listing render — **that is this slice.**

**Parallelism:** must land first. Stage 2 rebases on it.

---

### Stage 2 — Marker UX, popup, and group-scoped school search

**Scope**
- Neutral area-cluster chip: `+N nearby areas · Tap to expand`; drop `dominantName` from the chip face; surface it instead as a transient "Includes ‹name›" caption on panel hover (R4).
- Screen-space chip offsets with leader lines + anchor dots per `MARKER_PLACEMENT_SPEC.md` §1 (≥16 px threshold), plus a label-rect collision pass so long labels can't overrun their grid cell. Offsets are presentation-only, never persisted.
- `MarkerPopoverCard`: add the `‹ n/N ›` stepper and a **Show in list** action (which reuses the existing `setSelectedListing` → panel `scrollIntoView` path). **Explicitly excluded: the tier/trust badge** — see §7.
- Group-scoped school search with labelled auto-widen (R5). Requires the additive backend param; see §6.
- Migrate focus moves from `flyTo`/`setView` to `panInside` where the spec calls for it ("Show on map", listing focus).

**Non-goals:** no mobile layout change; no new journey states; no camera-key redesign; no tier badge; no changes to `/api/listings/markers`.

**Files likely touched:** `src/components/map/AreaMarkerLayer.tsx`, `src/lib/map/areaMarkerBucketing.ts` (offset/leader output), `src/components/discover/MarkerPopoverCard.tsx`, `src/components/discover/ScopedSearch.tsx`, `src/hooks/useSchoolSearch.ts`, plus the backend `schools/search` controller for the additive `areaKeys` param + `inScope` field.

**Tests required:** bucketing unit tests for offset determinism (same viewport + dataset → identical layout) and the ≥16 px leader threshold; `MarkerPopoverCard` tests for the stepper and Show-in-list; school-search tests for in-group-first ordering, the `outside ‹Group›` label, and **strict city boundary (no Udupi school in a Bangalore group search)**. Per `[[seeded-data-correctness-over-mocked]]`, the backend scoping change wants a real Testcontainers seeded-data test, not just a mocked-API FE test.

**Browser evidence required:** dense-belt group at zoom ≤12 — no overlapping labels, leaders visible on offset chips, chip reads `+N nearby areas`. Listing popup with stepper. Group-level school search for `hebbal` showing the widen label.

**Parallelism:** the school-search sub-item is **independent of the marker sub-items** and can be a separate PR running in parallel once Stage 1 lands — it touches `ScopedSearch`/`useSchoolSearch`/backend, disjoint from `AreaMarkerLayer`/`MarkerPopoverCard`. The marker + popup sub-items must serialize (both touch the map render path).

---

### Stage 3 — Deferred (recommend: do not schedule now)

Mobile bottom sheet, small-map label-cap tightening (`labelCap` 12 → ~8 below 520 px), guidance copy, caption noise. None of it is correctness. `MARKER_PLACEMENT_SPEC.md` §6 wants a sheet; the app stacks a fixed `h-64` map. That is a real divergence but it is not on the critical path, and the brief itself says "no big redesign unless necessary."

---

## 9. Recommendation

**Proceed with Stage 1 first, as a single focused PR. Do not merge the school-search work ahead of it.**

Three reasons:

1. **Stage 1 is the only stage that fixes a lie.** Everything else is a UX contract gap — the map showing city-wide markers while the panel shows two areas is the map telling the user something false about scope. That is the bug in the brief, and it is a ~3-line change at `MapDiscovery.tsx:2950` plus a guard.

2. **Design cleanup is not needed.** This was the surprise of this pass. `AREA_MARKER_UX.md`'s degradation model is *already in the app* — bands, quadrant guarantee, 12-cap, area-count clusters, zoom-only recompute, the `Showing X of N` note. Treating PR-B as greenfield would duplicate `areaMarkerBucketing.ts`. The docs are ahead of the app on exactly four things: leader lines, neutral chip copy, the popup stepper, and group-scoped school search. Everything else is wiring.

3. **School search should not go first, despite being tempting.** It is the one item needing a backend contract change, it is disjoint from the P0s, and shipping it first would leave the scope lie in production while a lower-severity gap gets attention. Land Stage 1, then run the school-search PR **in parallel** with the Stage-2 marker PR — they touch disjoint files.

Two things to settle before Stage 1 opens:

- **Confirm R1 in an authenticated browser session before writing the fix.** The Bug Fix Protocol requires reproduce → confirm fail → fix → confirm pass, and the leak is invisible to anonymous users. A signed-out repro will read as "no bug."
- **Decide the tier-badge question.** §7 recommends leaving it out of the popup entirely, because `trustTier` is unmapped (`"D"`/`null`) and this is a public-safe surface. If the intent is to ship it, that is a separate issue gated on fixing the tier mapping — not a line item in Stage 2.

---

*Prepared as fact-finding for #1798. No code modified; no tests executed; no PR opened.*
