# Agricultural Land Discovery — MVP2

**Status:** Draft
**Last updated:** 2026-06-06
**Owner:** Product / Engineering
**Milestone:** `M29 — Agricultural Land Discovery (MVP2)`
**Depends on:** `M28 — Agricultural Land Listing Creation (MVP1)` (polygon persistence)
**Related:** `docs/product/agricultural-land-mvp1-listing-creation.md`, `docs/MVP_SPEC.md`, `docs/DISCOVER_FIGMA_AUDIT_FRESH_2026_05_09.md`, `docs/adr/0001-postgis-adoption.md`

> This is a product spec, not an implementation. It defines scope, journey, map display
> strategy, UX states, risks and open questions for MVP2. Implementation is tracked by the
> issues in milestone **M29**.

## 1. Product goal

Enable **buyers / searchers** to discover **agricultural land separately** from
residential/school search, using **area search**, **agriculture-only counts**,
**clusters**, and **saved plot polygons** drawn by brokers/owners in MVP1.

## 2. User story

> As a buyer/searcher,
> I want to search only agricultural land by area,
> so that I can explore available plots and understand their approximate boundaries on the map.

## 3. Scope boundary (read first)

- **No buyer-drawn polygon search.** Buyers only *view* saved polygons. (The `DrawControl`
  primitive stays confined to the broker listing-creation flow from MVP1.)
- **Do not mix agriculture into the school search journey.** Agriculture is a third,
  independent journey alongside `area-first` and `school-first`. School controls are hidden
  in agriculture mode; residential listings are not shown in agriculture mode.
- **Production remains Postgres-first.** No OpenSearch cutover dependency. The existing
  `RoutingDiscoverListingsService` already defaults to the Postgres read path; agriculture
  queries use Postgres/PostGIS.

## 4. Current architecture (post-inspection)

| Concern | Existing asset | MVP2 impact |
|---|---|---|
| Discover page | `src/pages/MapDiscovery.tsx` | Add agriculture journey entry + agriculture map/panel branches. |
| Journey state | `DiscoverJourney = 'area-first' \| 'school-first'` in `src/hooks/useDiscoverUrlState.ts`; entry cards in `src/components/discover/JourneySwitcher.tsx`. | Add a third journey value (e.g. `agri-first`) + URL `journey` param value; add a third entry card. |
| Right panel | `src/components/discover/DiscoverRightPanel.tsx` + `panels/*`. | Add an agriculture listing detail panel. |
| Map markers / clusters | `src/components/map/PropertyMap.tsx`, `AreaMarkerLayer.tsx`, `leaflet.markercluster`. | Render agriculture clusters; add a polygon layer (read-only `L.polygon` / react-leaflet `Polygon`). |
| Polygon source | Saved `boundary geography(Polygon,4326)` from MVP1 (M28). | Read + serialize polygon geometry to the client for rendering. |
| Discover read APIs | `DiscoverListingsController`, `DiscoverMarkersController` / `ListingMarkersController`, `AreaSummaryController`, `AreaGroupsController`, `CityAreaListingsController`; routed by `RoutingDiscoverListingsService` (Postgres default, OpenSearch behind flag). | Add agriculture-only filtering + counts; expose polygon geometry on agriculture results. Postgres path only. |
| Spatial | PostGIS GiST on `geog` (Point); ADR 0001. | Polygon read uses PostGIS (`ST_AsGeoJSON` / `ST_Simplify` for medium-zoom outlines). |
| E2E | Playwright `e2e/discover-*.spec.ts`; projects smoke/journey/full. | Add `e2e/discover-agri-*.spec.ts` journey coverage. |

## 5. Core journey

1. User opens Discover (`/discover`).
2. User sees a dedicated entry point: **Search Agricultural Land** (third `JourneySwitcher` card).
3. User enters agriculture mode (`journey=agri-first`).
4. **School controls are hidden.**
5. User searches / selects an area.
6. Area results show **agriculture-only** counts (and optional total acreage).
7. User clicks an area.
8. Map shows **agriculture clusters** at low zoom.
9. At higher zoom, **saved agricultural plot polygons** are displayed.
10. User clicks a polygon.
11. Right panel shows **agriculture-specific** listing details.
12. Listings **without polygon geometry** have a graceful **point-marker / card fallback**.

## 6. Map display strategy

| Zoom | Display |
|---|---|
| Low | Cluster bubbles labelled with **agriculture listing counts**. |
| Medium | Simplified parcel outlines if feasible (PostGIS `ST_Simplify`); otherwise clusters. |
| High | Full parcel polygons, selectable + highlighted on selection. |
| Right panel | Agriculture-specific listing details + boundary/area + disclaimer. |
| Fallback | Point marker / card for agriculture listings that have no polygon. |

## 7. UX states

- **Discover landing** → three journey cards; agriculture card visually distinct.
- **Agriculture mode, no area selected** → prompt to search/select an area; school controls absent.
- **Area results** → agriculture-only counts; clear empty state when none exist.
- **Map low zoom** → agriculture clusters only (not mixed with residential clusters).
- **Map high zoom, polygons present** → polygons rendered; hover/selected highlight.
- **Polygon selected** → right panel opens with that listing's details.
- **Listing without geometry** → fallback marker; selecting it opens the same panel.
- **Empty / missing agriculture fields** → handled gracefully (no blank crashes).
- **Loading / error** → reuse existing Discover loading + error patterns.

## 8. Agriculture right-panel content

- Agriculture-specific fields (acres, price, price/acre, water source, soil type,
  cultivation status, road access, ownership type, nearby village, survey number if present).
- Boundary / approximate-area info when available.
- The MVP1 disclaimer: *"The boundary drawn on the map is approximate and should be legally
  verified before purchase."*

## 9. MVP2 non-goals

- No buyer-drawn polygon search.
- No school-radius behaviour in agriculture mode.
- No residential listings mixed into agriculture mode.
- No legal verification of boundaries.
- No OpenSearch cutover dependency.
- No advanced polygon analytics (overlap, parcel merge, area ranking, etc.).

## 10. Risks

| Risk | Mitigation |
|---|---|
| Polygon rendering performance at scale | Cluster at low zoom; only fetch/render polygons within viewport at high zoom; `ST_Simplify` for medium zoom. |
| Agriculture leaking into school/residential journeys | Strict journey gating; agriculture-only query filter; journey-isolation tests. |
| Listings without geometry disappearing | Mandatory point-marker fallback (acceptance criterion). |
| Mixed cluster counts (residential + agri) | Separate agriculture cluster source; counts exclude non-agriculture. |
| Coupling to MVP1 not yet shipped | MVP2 can ship counts/clusters/fallback markers independently; full polygon rendering gated on M28 persistence. |

## 11. Open questions

1. New journey value name: `agri-first` vs `agriculture` (URL `journey` param)?
2. Polygon serialization format to client: GeoJSON via `ST_AsGeoJSON`, or encoded coord array like `DrawControl`'s `[lat,lng][]`?
3. At what zoom threshold do polygons replace clusters?
4. Is medium-zoom simplified-outline rendering in MVP2 scope or deferred?
5. Should agriculture counts include only `approved` listings (consistent with existing Discover visibility rules)?

## 12. Dependency note

> **MVP2 depends on MVP1 (M28) polygon persistence for full polygon rendering.**
> However, MVP2 can still ship the agriculture journey, agriculture-only counts/clusters,
> and a **fallback point/marker display** for agriculture listings without geometry.

## 13. Issue map (milestone M29)

| # | Issue | Primary labels |
|---|---|---|
| 1 | define agricultural discovery product spec | enhancement, product, discover, agri |
| 2 | add agriculture search entry point on Discover | enhancement, frontend, discover, agri |
| 3 | support agriculture-only area search and counts | enhancement, backend, discover, agri |
| 4 | render agriculture clusters on map | enhancement, frontend, discover, agri |
| 5 | render saved agricultural plot polygons | enhancement, frontend, discover, agri |
| 6 | add agriculture listing right-panel details | enhancement, frontend, discover, agri |
| 7 | E2E coverage for agriculture discovery journey | test, e2e, discover, agri |
