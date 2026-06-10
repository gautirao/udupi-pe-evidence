# Agri Regional Discovery UX v2 — Map Sector Overlay (refinement draft)

**Status:** Design / pre-implementation. Reviewable draft only.
**Anchor epic:** #1426 (Agri Regional Discovery UX v2).
**Filed issues:** v2-map-A = #1429, v2-map-B = #1430, v2-map-C = #1431 (all linked to #1426).
**Companion design:** `docs/design/agri-regional-discovery-v2.md` (merged PR #1427).
**Tracking model:** normal GitHub issues **linked to #1426** via dependency comments — **not** child issues, **not** GitHub sub-issue hierarchy. #1426 stays the roadmap/design anchor.

> Scope guard for every issue below: **frontend-only.** No backend, DTO, Flyway, Supabase, or OpenSearch changes. Cross-city geometric classification (#1419) is **out of scope**.

---

## 0. Grounding (verified against the codebase)

| Concern | Reality in repo | Implication |
|---|---|---|
| City centroid | Frontend `CITY_CONFIG` (`src/lib/localityUtils.ts:11-16`): udupi `[13.3409, 74.7421]`, kundapur, mangalore, bangalore. Numerically **identical** to backend `cities.geo_center_lat/lon` (`V71`) used for classification. | Overlay anchors frontend-side; lands on the same origin the backend classified against. **No backend needed.** |
| Direction classification | 45° bins centred on the cardinal bearing (`RegionalGeo.directionKey`): N=0°, NE=45°, E=90°, SE=135°, S=180°, SW=225°, W=270°, NW=315°; N wraps 337.5°→22.5°. | Visual sector should be **45°**, not 30°, to avoid shown-vs-filtered mismatch. |
| Distance bands | `0_10`, `10_25`, `25_50`, **`50_up`** (lower-inclusive km). | Use `50_up` literally; `50_PLUS` would fail `GROUP_REGEX`. |
| URL state | `?journey=agri-first&group=N:10_25` — `group` is **PUSH**, validated by `GROUP_REGEX` (`useDiscoverUrlState.ts:444`); viewport `lat/lon/zoom` is REPLACE. | Overlay is a pure function of an existing URL param; Back/Forward already correct. |
| School circle precedent | react-leaflet `<Circle>` (`PropertyMap.tsx:1280-1302`): dashed, `fillOpacity 0.08`. | Mirror this style for the sector `<Polygon>`. |
| Geo helpers | No turf.js. Only `haversineKm` (`src/lib/geo.ts`). No bearing/destination helper. | Add a small geodesic helper; do not add a dependency. School-circle's planar degree-offset distorts at 50–100 km — do not reuse it. |
| Agri map data | `AgriMapListingItem` = id, areaKey, latitude, longitude, propertyType, locality, boundaryGeoJson, landArea, computedAreaAcres, **pricePaise**. **No images, no video indicator.** | Listing-summary peek media must lazy-load from the existing public listing detail endpoint, not the map payload. |
| Panel states | `agri-landing` → `agri-group-selected` (#1425) → `agri-selected` / `agri-detail` (#1374). `derivePanelContent()` in `src/utils/discoverPanelState.ts`. | Overlay attaches to `agri-group-selected`; peek reuses/extends `agri-detail`. |

---

## 1. #1426 epic wording update

> Append to the #1426 body. If a "Children" heading exists, rename it to **"Linked implementation issues."**

> ### Map sector overlay (added refinement)
> When a regional group (`group=DIR:BAND`) is selected, the map draws an **approximate regional search area** — a directional **45° sector** from the city centre matching the selected direction, clipped to the selected distance band (`0_10` / `10_25` / `25_50` / `50_up`, with `50_up` capped visually at 100 km). The overlay is **frontend-derived** from the existing city centroid (`CITY_CONFIG`) and the existing `group` URL param — **no backend, DTO, Supabase, or OpenSearch changes.** It is explanatory, not an exact geometric filter: listings still come from the group's `areaKeys` (centroid-bucketed classification). True per-listing geometric containment is deferred to **#1419** and is **out of scope here**.
>
> Selecting a map listing/polygon/marker opens a **Level-2 listing-summary peek** in the right panel (media, acreage/price/locality, short description, **View full details** → `/listing/:id`), distinct from the **Level-1 selected-region** listing list.
>
> ### Linked implementation issues
> - **#1425** — Phase 1: selected group → right-panel listings *(linked, closed)*
> - **v2-map-A** — Direction/distance sector overlay on map *(linked; depends on #1425, #1410)*
> - **v2-map-B** — Selected map listing → right-panel summary peek *(linked; depends on #1425)*
> - **v2-map-C** — E2E hardening for overlay + listing-summary journey *(linked; depends on v2-map-A, v2-map-B)*
> - *(plus existing v2-A…v2-F: direction-first landing, distance refinement, "towards" labels, Back/Forward hardening, optional backend fields)*
>
> #1426 remains the roadmap/design anchor. Future work is tracked as normal issues **linked to #1426** via dependency comments — not as GitHub sub-issues.

---

## 2. Issue body — v2-map-A (first implementable)

**Title:** Agri regional discovery — show direction/distance sector overlay on map

**Linked to:** #1426 (Agri Regional Discovery UX v2 epic)
**Depends on:** #1425 (selected-region panel, closed) and #1410 (regional-group map filtering, closed)
**Out of scope:** #1419 (cross-city geometric classification) — do not implement here.
**Layer:** frontend-only. **No** backend / DTO / Flyway / Supabase / OpenSearch.

### Summary
When an agri regional group is selected (`?journey=agri-first&group=DIR:BAND`), draw a directional **sector overlay** from the city centre on the Discover map, matching the selected direction and distance band. The overlay is an **approximate regional search-area backdrop**, fully frontend-derived.

### Geometry
- **Anchor:** city centroid from `CITY_CONFIG` (`src/lib/localityUtils.ts`) for the active city.
- **Direction → centre bearing, 45° span (centre ± 22.5°):** N=0, NE=45, E=90, SE=135, S=180, SW=225, W=270, NW=315; **N wraps** 337.5°→22.5°. Matches backend `RegionalGeo.directionKey` bins (no shown-vs-filtered mismatch).
- **Band → radii:** `0_10` 0–10 km (wedge from centre), `10_25` 10–25, `25_50` 25–50, `50_up` 50–**100 km cap** (dashed/faded outer arc + "50+ km" treatment to read as unbounded).
- **Polygon construction:** add a `destinationPoint(lat, lon, bearingDeg, distanceKm)` geodesic helper in `src/lib/geo.ts`. Build the annular sector by sampling the outer arc start→end bearing (~2° steps) then the inner arc end→start (reversed), closing the ring. For `0_10`, inner radius is 0 (apex at centroid). **No turf.js.** Do not reuse the school-circle planar degree-offset (distorts at 50–100 km).
- **Render:** react-leaflet `<Polygon>` styled like the school `<Circle>` (`PropertyMap.tsx:1280`), **non-interactive** (clicks pass through to markers/polygons), drawn below the marker pane.

### State
Derived purely from the existing validated `group` URL param — **no new URL state.** Overlay appears on group select, disappears on clear; Back/Forward already correct because `group` is a PUSH entry.

### Acceptance criteria
1. Selecting a regional group (`group=DIR:BAND`) renders exactly one sector overlay on the map.
2. Overlay is anchored at the active city's centroid (`CITY_CONFIG`).
3. Overlay's angular span matches the selected **direction** (45°, centred on the cardinal bearing; N wraps correctly).
4. Overlay's radial extent matches the selected **band** (`0_10` / `10_25` / `25_50` / `50_up`; `50_up` capped at 100 km with a distinct unbounded treatment).
5. Map clusters/markers/polygons remain those of the selected group's `areaKeys` (unchanged from #1410) — the overlay does not alter which listings show.
6. Clearing the group removes the overlay; map returns to the prior agri regional/default view.
7. Browser **Back** removes/restores the overlay in lockstep with the `group` param; **Forward** reapplies it.
8. Overlay is non-interactive: clicking through it selects the underlying marker/polygon.
9. Overlay is labelled/treated as an **approximate regional search area** (not an exact filter).
10. Residential and school-first journeys are visually and behaviourally unaffected (no overlay).
11. **No** backend / model / Flyway / Supabase / OpenSearch changes.

### Tests
- **Unit:** `destinationPoint` + sector-polygon generator — vertex bearings/distances per direction; N wrap; annular inner/outer radii; `50_up` cap; `0_10` apex-at-centroid.
- **Component:** overlay renders on group select, removed on clear; non-interactive; absent for residential/school journeys.
- (E2E deferred to v2-map-C.)

---

## 3. Issue body — v2-map-B

**Title:** Agri regional discovery — selected map listing shows summary in right panel

**Linked to:** #1426 (Agri Regional Discovery UX v2 epic)
**Depends on:** #1425 (selected-region panel, closed). Pairs with v2-map-A but is independently shippable.
**Layer:** frontend-only. **No new backend endpoint** unless proven necessary. **No** Flyway / Supabase / OpenSearch.

### Summary
When a user clicks a marker, polygon, or listing result within the selected group, the right panel switches from the **Level-1 selected-region** list to a **Level-2 listing-summary peek**. The peek shows a concise summary and a **View full details** CTA that navigates to `/listing/:id`. This mirrors the locked agri pattern (#1405): polygon/marker → peek (no auto-nav); card or CTA → `/listing/:id`.

### Right-panel summary peek contents
- **Media if available:** image(s) for the listing.
- **Video indicator if available:** a badge/icon when the listing has video.
- **Acreage / price / locality:** instant fields from `AgriMapListingItem` (`computedAreaAcres` / `landArea`, `pricePaise`, `locality`).
- **Short description.**
- **View full details CTA** → `/listing/:id`.

### Data sourcing
- Instant fields (acreage / price / locality) come directly from the already-loaded `AgriMapListingItem` — no fetch needed for first paint.
- **Media + description are not in `AgriMapListingItem`.** Lazy-load them from the **existing public listing detail endpoint** `GET /api/public/listings/{id}` (already returns agri fields + images per #1374 / #1407; reuse `useAgriListingDetail`). **No new endpoint, no DTO change.** Only escalate to a backend change if a concrete gap is proven during implementation (record the evidence first).

### State
- Today, agri selection uses `areaKey`; a *map listing* peek needs the listing id for Back/Forward and Forward-reapply.
- Introduce URL state **only if needed**, likely **`listing=<uuid>`** (PUSH), e.g. `?journey=agri-first&group=N:10_25&listing=<uuid>`.
- Routing: `group + listing` → `agri-detail` (Level 2); `group` alone → `agri-group-selected` (Level 1). Extend `derivePanelContent()` accordingly.

### Back/Forward behaviour
```
listing peek (group + listing) → selected-region list (group) → group list (no group) → prior Discover state
```
Forward reapplies the same states. Because `group` and `listing` are PUSH entries, the ladder falls out of URL history.

### Acceptance criteria
1. Clicking a marker/polygon/listing result in the selected group opens the Level-2 listing-summary peek in the right panel.
2. Peek shows media when available; otherwise a graceful no-media state.
3. Peek shows a video indicator when the listing has video; otherwise none.
4. Peek shows acreage, price, and locality from the map item (no blocking fetch for these).
5. Peek shows a short description (lazy-loaded from the public listing detail endpoint).
6. **View full details** navigates to `/listing/:id`.
7. Selecting a listing does **not** auto-navigate away from Discover (peek only).
8. URL reflects the selected listing (e.g. `listing=<uuid>`) so the peek is shareable and survives reload.
9. **Back** moves listing peek → selected-region list → group list; **Forward** reapplies each.
10. Clearing the group also clears the peek and the `listing` param.
11. Residential and school-first journeys unaffected.
12. **No new backend endpoint** (reuse `/api/public/listings/{id}`); no Flyway / Supabase / OpenSearch changes.

### Tests
- **Unit:** `derivePanelContent` for `group + listing` → `agri-detail`; `listing` URL param round-trip (read/write/clear).
- **Component:** marker/polygon/result click → peek with media / video indicator / acreage / price / locality / description + CTA; no-media and no-video fallbacks; View full details → `/listing/:id`; Level-1 ↔ Level-2 transitions.
- (E2E deferred to v2-map-C.)

---

## 4. Issue body — v2-map-C (optional, later)

**Title:** Agri regional discovery — E2E hardening for sector overlay and listing-summary journey

**Linked to:** #1426 (Agri Regional Discovery UX v2 epic)
**Depends on:** v2-map-A and v2-map-B.
**Layer:** test-only. **No** product/backend/Supabase changes.

### Summary
End-to-end coverage of the combined overlay + listing-summary journey, with Back/Forward assertions and residential/school regression guards. Use a real-seed journey where possible (mirror the #1412 REAL_SEED gating pattern).

### Scope
- Full journey: group select → overlay renders → cluster zoom → listing click → Level-2 peek → **View full details** → `/listing/:id`.
- Back ladder: listing peek → selected-region list → group list → prior Discover state; Forward reapplies.
- Overlay lifecycle: clears with group; not present on landing.
- Regression: residential and school-first journeys behave unchanged (no overlay, no peek bleed-through).

### Acceptance criteria
1. Overlay polygon presence asserted via the Leaflet overlay pane (positive spy, like #1412's marker-count assertions), and absence asserted on clear/landing.
2. Listing peek opens on marker/polygon click and shows the expected summary fields.
3. **View full details** lands on `/listing/:id`.
4. Back/Forward traverse the full ladder correctly (overlay + panel state in lockstep with URL).
5. Residential and school-first journeys pass unchanged.
6. Real-seed run where the environment allows; otherwise gated/deferred with truthful evidence labelling (no false-green).

### Tests
- Playwright E2E spec under `e2e/`, REAL_SEED-gated where a live seeded backend is available; stubbed fallback otherwise. Assert overlay via overlay-pane path selectors; assert URL transitions on Back/Forward.

---

## 5. GitHub posting plan (no writes yet)

Execute **only after explicit user approval**. No GitHub writes have been made.

1. **Update #1426 epic wording** — append the §1 "Map sector overlay" block; rename any "Children" heading to **"Linked implementation issues."**
2. **Create v2-map-A** linked issue from §2.
3. **Create v2-map-B** linked issue from §3.
4. **Optionally create v2-map-C** later from §4 (after A and B are in flight).
5. **Post dependency comments** on each issue:
   - v2-map-A: "Linked to #1426. Depends on #1425 and #1410."
   - v2-map-B: "Linked to #1426. Depends on #1425."
   - v2-map-C: "Linked to #1426. Depends on v2-map-A and v2-map-B."
6. **Language rule:** use "linked to" / "depends on" only. **Do not** use "child" / "sub-issue" / GitHub sub-issue hierarchy. #1426 stays the design/roadmap anchor.

---

## 6. Risks / trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| Shown wedge vs filtered listings mismatch (#1419 areaKey-bucketing) | Med | Match 45° exactly; label "approximate regional search area"; defer exactness to #1419. |
| Centroid drift between `CITY_CONFIG` and backend `cities.geo_center_*` | Low (match today) | Document parity assumption; optional follow-up to source centroid from a backend DTO. |
| `50_up` unbounded geometry blows map bounds | Low | Cap at 100 km + dashed outer arc. |
| Planar-offset distortion at 50–100 km if school-circle math reused | Med | Use geodesic `destinationPoint`, not degree offsets. |
| Overlay intercepting clicks → markers unselectable | Med | `interactive: false` / pointer-events off; overlay below marker pane. |
| Peek media absent from agri-map payload | Med | Lazy-load media/description from existing `/api/public/listings/{id}`; instant fields from map item. |
| Direction-only rendering undefined | Low | Out of scope for v2-map-A; spec'd for the direction-first-landing work. |
| Wrong band code (`50_PLUS` vs `50_up`) | Low but real | Issue bodies pinned to `50_up`; otherwise fails `GROUP_REGEX`. |

---

## 7. Unresolved decisions (need a call before/at implementation)

1. **`50_up` visual cap** — confirm 100 km is the right cap for the coastal-Karnataka corpus (vs city bbox `max_lat/max_lon`). Default proposal: 100 km.
2. **Edge styling within the 45° span** — plain 45° fill vs a brighter 30° core / feathered edge for polish. Default proposal: true 45° boundary with soft edge styling (no narrower boundary).
3. **`listing=<uuid>` URL param (v2-map-B)** — confirm adding a new param vs overloading the existing agri-detail mechanism. Default proposal: add `listing` (PUSH).
4. **Centroid source of truth** — keep `CITY_CONFIG` (matches backend today) vs expose `geo_center_lat/lon` on the regional-groups DTO for guaranteed parity. Default proposal: keep `CITY_CONFIG` now; file a low-priority parity follow-up.
5. **Direction-only mode** — deferred to the direction-first-landing work; not in A/B/C. Confirm that deferral.
