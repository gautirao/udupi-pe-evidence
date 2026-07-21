# 02 — Production Baseline Audit

Read-only audit of the current production Discover implementation: frontend architecture,
map/geospatial layer, and backend data model / city-launch pipeline. All findings below are from
3 parallel specialist agents, reconciled. Every claim below is CONFIRMED via direct file/DOM
citation unless marked INFERRED or UNRESOLVED.

**Tooling caveat (applies to all three sections):** the jCodemunch MCP index used by this repo is
truncated (2,000 of 8,065 files indexed; backend Java is almost entirely dropped from the index).
Frontend/map findings lean on direct `Read`/`git grep`; backend findings lean on `git grep` +
direct `Read` of Flyway migrations and entity classes, not the MCP index. Anywhere a finding is
softer than the rest, it's marked. **Recommendation:** raise `JCODEMUNCH_MAX_FOLDER_FILES` (or the
equivalent config) and re-index before the next large audit on this repo — the truncation cost
real time across every agent in this session.

---

## A. Frontend architecture

**Stack:** Vite + React + `react-router-dom` + `@tanstack/react-query` + Leaflet/`react-leaflet` +
Tailwind (ReTrends HSL design-token system). Frontend root: `src/`.

1. **Route entry.** Single route: `src/App.tsx:100` — `<Route path="/discover" element={<MapDiscovery />} />`.
   No nested Discover routes. `MapDiscovery` is **eagerly imported** (`App.tsx:16`, marked
   "critical path for first paint"), unlike the lazy-loaded Trends/Broker/Admin routes.
2. **Main orchestrator — still large.** `src/pages/MapDiscovery.tsx` is **1,944 lines**. The prior
   #1824/#1891 decomposition effort is real (visible `Slice Sx` comments) but reduced *extracted
   JSX regions*, not the file itself, to <600 LOC — the file as a whole remains a
   1944-line prop-drilling hub: ~840 lines of state/data-hook wiring (composing ~28 hooks: ~8
   state hooks, ~7 presentation hooks, ~13 data hooks), then a ~206-line JSX return that drills
   100+ props into `<DiscoverMapCanvas>` and ~80 props into `<DiscoverRightPanelContainer>`.
   **This is the single biggest structural risk for a V2 rewrite** — any redesign that touches
   the shell should plan to break this prop-drilling (context or a store), not just re-skin
   around it.
3. **URL state.** Owned entirely by `src/hooks/useDiscoverUrlState.ts` (~1,701 lines). Uses
   **query params, not a hash** (`useSearchParams()`), so state is derived synchronously from the
   URL on every render — refresh and Back/Forward work by re-reading the URL, not by restoring
   from a separate store. Rich param vocabulary: `city`, `areaKey`, `lat`/`lon`/`zoom`,
   `journey` (`area-first|school-first|agri-first`), `groupId`, `scope`, `region` (agri corridor
   direction), `maxKm`, `schoolPicking`, `groupResults`, `locality`, `listing` (uuid, for the
   listing-peek popover deep link), `intent` (rent), `schoolId`, `radiusKm`, `q`, plus full filter
   sets for residential and agricultural. Push-vs-replace discipline is deliberate: city/journey/
   group/area-select push; viewport (debounced 300ms), live filters, scope, intent replace;
   *committed* filters push. A normalization shim (`discoverUrlNormalize.ts`) handles legacy
   `journey` aliases and a legacy `group=DIR:BAND` → `region=DIR` migration.
   **~60 Playwright specs assert against this exact contract — it must be preserved or
   deliberately migrated, not silently changed.**
4. **API hooks (all `api.get()` + TanStack Query).** The Discover-relevant hook inventory:
   `useDiscoverFilteredMarkers` (→ `GET /api/discover/markers`, honours filters/areaKeys/bbox —
   this is the map's actual marker source), `useDiscoverAreas`, `useDiscoverListings`,
   `useDiscoverCityListings`, `useDiscoverRegionSummary` (→ `GET /api/discover/cities/{citySlug}/regions`
   — **the new region-model endpoint**), `useAreaGroups` (→ legacy `/api/discover/area-groups`),
   `useRegionScopedAreaGroups` (→ `/regions/{regionKey}/groups`), `useRegionalAreaGroups` (agri),
   `useAgriMapListings`, `useSchoolsByArea`, `useSchoolRadiusListings`, and a legacy
   `useDiscoverSummary` superseded by `useDiscoverRegionSummary`.
   - **Correction to a prior assumption:** the "two marker endpoints" story is real but
     asymmetric. `/api/discover/markers` (filter-honouring) is the only one with a live frontend
     consumer. `/api/listings/markers` (the ignoring one) has **no live FE consumer** — the only
     trace of it is an explanatory code comment (`MapDiscovery.tsx:277-281`) documenting *why* it
     was rejected. Treat it as dead weight on the frontend side, not an active hazard.
5. **Map components.** Leaflet 1.9.4 + `react-leaflet` 4.2.1 + `leaflet.markercluster` 1.5.3 +
   `leaflet-draw` 1.0.4. `PropertyMap.tsx` (1,893 lines) hosts many imperative `useMap()`
   sub-controllers (`AreaPanner`, `SchoolFocusPanner`, `SchoolMarkerFocusPanner`,
   `AreaRestorePanner`/`CityRestorePanner`, `URLViewportController`) plus one single camera-owner
   `MapController` (seq-guarded `fitBounds`/`flyTo`/`setView`, per issue #1801). Layer exclusivity
   is enforced by `useZoomBand` + `selectPrimaryMapLayer` (`src/lib/map/zoomPolicy.ts`) — only one
   primary marker layer renders per zoom band, already landed under #1882 Track A.
6. **Results panel.** `DiscoverRightPanelContainer.tsx` is a thin (~90-prop) wrapper with no state
   of its own around the real shell, `DiscoverRightPanel.tsx` (~1,884 lines). Panel content is a
   `switch` (`:1103`) over a `DiscoverPanelContent` union **derived purely from the URL** by
   `derivePanelContent()` (`src/utils/discoverPanelState.ts:59-179`) — ~17 cases covering every
   journey/state combination, with a TypeScript exhaustiveness guard. **This URL-derived switch is
   the cleanest seam in the codebase to rebuild the V2 panel against** — it already matches the
   frozen design's "one hierarchy level, two synced views" model structurally.
7. **Filters.** Fully controlled, state lives entirely in the URL
   (`useDiscoverUrlState.ts` — no local `useState` holds filter values). `MapFilters.tsx` is
   presentational only.
8. **Within-area property search.** Owned by `useDiscoverSearchState.ts` — writes both a local
   debounced value (drives map badge/marker highlighting) and the URL `q` param (drives the
   server-side full-text search via `/api/discover/listings?q=`). Structurally distinct from the
   global area-jump control (§9), matching the design's requirement that these stay separate.
9. **Global area-jump / autocomplete — genuinely missing.** No cross-city, mode-aware
   "type any area and jump" control exists. What exists instead: `ScopedSearch.tsx` (a per-city,
   client-side substring filter over already-loaded areas, capped at 8 results, cannot reach
   other cities) and `CitySelect.tsx` (a fixed dropdown, not free-text — the *only* cross-city
   control today). **This is a real, net-new frontend gap versus the frozen design's single
   global autocomplete.**
10. **Schools journey — fully exists.** Entry via `JourneySwitcher.tsx`. Full drill-down:
    `SchoolBrowsePanel` → `SchoolGroupAreasPanel` → `SchoolsInAreaPanel` (schools + "Homes in
    {area}" grid) → `SchoolSelectedPanel` (3/5/10 km radius chips, "Homes near {School}" grid with
    haversine distance) / `AreaSchoolCombinedPanel`. Backed by `useSchoolListings.ts` (anon → the
    public radius endpoint; authed → filtered). Map overlays: `SchoolMarkerLayer`,
    `SchoolRadiusMapOverlay`.
11. **Agricultural journey — fully exists.** Entry via `JourneySwitcher.tsx`. URL axis is
    `region` (corridor direction) + `maxKm` (distance band) — orthogonal to the residential
    `groupId`/`areaKey` axis, matching the design's origin/direction/distance model. Flow:
    `AgriRegionalGroupsPanel` → `AgriGroupLocalityPanel` → `AgriGroupSelectedPanel` →
    `AgriGroupListingPeek` → `AgriListingPanel`. Data via `useAgriMapListings` (anon-coarsened) +
    `useFilteredAgriListings`.
12. **Listing cards + trust badges — CONFIRMED correct (a prior memory item is stale).**
    `PropertyCard.tsx:62-66,299-312` renders a trust badge only for the public words
    `verified`/`trusted`/`listed` (`data-testid="trust-badge"`) — the raw internal A/B/C/D grade
    never reaches the frontend. **The previously-recorded "trustTier returns D/null, no badge
    renders" issue is fixed / no longer accurate** and should be corrected in any memory that
    still cites it. (One real gap: authenticated school-first cards hard-code `trustBadge: null`
    in `useSchoolListings.ts:97-104` — no badge renders there; and `MarkerPopoverCard.tsx` has no
    trust badge at all.)
13. **Favourites — fully wired.** Heart icon in `PropertyCard.tsx:274-298`; anon click opens the
    auth modal, authenticated click does an optimistic mutate against
    `GET/POST/DELETE /api/me/saved-listings*` via `useSavedListings.ts`, with rollback on failure.
14. **Listing-detail navigation — CONFIRMED at runtime (upgraded from INFERRED).** Route
    `/listing/:id` (eager). Cards call `navigate()` (a plain history push). Live-verified against
    a running dev instance (real Bangalore data, 1,737 listings): deep-linking to an area-selected
    URL, opening a listing's "View details", then pressing Back returned to the **exact** prior
    `/discover?...areaKey=...&lat=...&lon=...&zoom=...` URL with the full panel (breadcrumb,
    filters, map viewport, listing count) rehydrated correctly. The one remaining theoretical edge
    case — the viewport (`lat`/`lon`/`zoom`) is written with a **debounced replace**, so an
    in-flight pan at the exact instant of navigating to a listing could in principle be lost on
    Back — was not hit in this test and remains a narrow, unconfirmed risk, not a demonstrated
    bug.
    **Incidental finding (out of original audit scope, worth a follow-up look):** the telemetry
    consent banner reappeared after a full navigation round-trip in this test (Decline did not
    visibly persist across the reconstructed page) — flagged for someone to check separately, not
    part of this Discover V2 plan's scope.
15. **Loading / empty / error states.** No single shared wrapper — each panel case owns its own
    treatment (skeletons, empty CTAs, error+retry). A shared `emptyStateCopy.ts` derives the
    correct empty-state copy (filters / search / both / genuinely empty) feeding a common
    `EmptyState` component. A whole-city takeover exists (`CityNotSupported`).
16. **Responsive — the biggest visual gap. CONFIRMED at runtime.** There is **no `≤820px`
    breakpoint logic anywhere** in the current implementation — only a single Tailwind `lg`
    (1024px) breakpoint (`flex flex-col lg:flex-row`). Live-measured at a 606px viewport: the map
    half (`lg:w-1/2 h-64 lg:h-full`) stacks above the results panel, confirming the fixed-256px
    mobile band; at ~1562px it renders side-by-side. Below `lg`, the map is a **hard fixed `h-64`
    (256px) band**, not the frozen design's proportional `~42%`-height stacking sheet with a grab
    handle. **The ≤820px proportional stacking sheet must be built from scratch.**
17. **Reusable inventory worth knowing about before building V2 components:** `PropertyCard`,
    `MarkerPopoverCard`, `panels/_shared/SummaryBandCard` (a tinted hero band — the single most
    reusable redesign primitive already in the codebase), `ActiveContextChips`, `CityChip`,
    `PanelEyebrow`, `PanelColumn`, `PanelHero`, `TrustStrip`, and a full family of map legends
    (`DiscoverMapLegend` + per-mode variants).
18. **Design tokens — already mature and close to the target.** `src/index.css:11-179` defines a
    full HSL CSS-variable token system (light + dark) mapped through `tailwind.config.ts`, with
    the *exact same three brand accents the frozen design uses per mode* — copper (Areas),
    plum/evergreen already present as named tokens. Token drift is minor: a couple of raw
    Tailwind-palette hex values in intent badges (`AgriListingPanel.tsx:138-139`,
    `DiscoverRightPanel.tsx:1273`) and unavoidable hardcoded hex inside Leaflet's own injected DOM
    styles (`index.css`).
19. **Tests.** Extensive: ~32 component tests, ~20 panel tests, ~11 presentation-state tests, ~30
    hook tests, and **~60 Discover-scoped Playwright E2E specs** covering drill-downs, the agri
    corridor, school-first, filters, URL-state, viewport, anon pricing, and trust badges. See
    [04-testing-quality-gates.md](04-testing-quality-gates.md) for gaps and gate recommendations.

---

## B. Map / geospatial implementation

**Headline: far more of the frozen design's map behaviour already exists in production than the
design brief assumed.** The compass-directional-region model, the directional search wedge,
school markers + radius, bidirectional map/panel sync, and anonymized price pins are all
**confirmed in production code**. The genuinely net-new work is concentrated in a backend
region-projection persistence layer and mid-zoom cluster aggregation — and most of that is
already scoped and plan-approved under issue #1882 (see
[05-issue-roadmap-reconciliation.md](05-issue-roadmap-reconciliation.md)).

1. **Library.** Leaflet + React-Leaflet, not Mapbox/Google (`package.json`: `leaflet ^1.9.4`,
   `react-leaflet ^4.2.1`, `leaflet.markercluster ^1.5.3` for listing clustering,
   `leaflet-draw ^1.0.4` for agri polygon drawing).
2. **Camera/bounds fitting.** A single-owner `CameraIntent { seq, bounds, center, framing }`
   pattern (`src/hooks/useDiscoverMapData.ts`), consumed by exactly one component,
   `MapController` (`PropertyMap.tsx:1092-1260`), which is the only thing calling Leaflet's
   `fitBounds` — with a one-shot sequence guard and an 8-second suppress TTL to prevent camera
   fights. Per-scope panner components handle area/school/URL-restore/city-restore framing.
   Zoom-band flipping lives in `src/lib/map/zoomPolicy.ts`
   (`AREA_LAYER_MAX_ZOOM=12`, hysteresis dead-band, `selectPrimaryMapLayer()` — **this is already
   #1882 Track-A work, landed on `main`**).
3. **Marker layers (5 distinct).** `AreaMarkerLayer` (area rings, group bubbles, macro-region
   compass bubbles), `MarkerClusterLayer` (residential listing pins via
   `leaflet.markercluster`), `AgriMarkerClusterLayer` + `AgriPolygonLayer` (farmland
   markers/plot boundaries), `SchoolMarkerLayer` + `SchoolZoneLabelLayer`, `SectorOverlay`
   (directional wedge).
4. **Clustering — two independent systems.** Real proximity clustering for listings via
   `leaflet.markercluster` (tunable `CLUSTER_DISABLE_AT_ZOOM=16`,
   `CLUSTER_MAX_RADIUS_PX=50`), plus a **custom directional/proximity bucketing system for area
   chips** (`src/lib/map/areaClusterSplit.ts`) that collapses dense areas into a cluster chip —
   this is a *different* mechanism from the design's proposed "generated local directional
   cluster" backend tier (§ below), and should not be confused with it.
5. **Area/region geometry is canonical, not derived from listing coordinates.** Persisted in
   `cities` (geo_center, bbox, default_zoom), `areas` (geo_center, bbox), `area_groups`
   (region_label, focus, bbox) — this matters because it means region/area boundaries are a real
   data model, not something a redesign has to invent.
6. **Directional/compass/bearing model — largely already built (the single biggest finding of this
   audit).** `src/lib/map/regionCompassLayout.ts` maps a backend `region_key`
   (`CENTRAL_CARDINAL_8`: CENTRAL/N/NE/E/SE/S/SW/W/NW) to a **screen-space compass position**,
   explicitly documented in its own source comment as
   *"navigational compass selectors, not geographic centroid pins"* — exactly the frozen design's
   "orientation over exact position" principle. Backed by a real backend directional model:
   `regional_area_classifications` (8-direction × 4-band), `RegionalGeo`,
   `city_regional_direction_labels`, `CityRegionProjection.java`. **A legacy client-side
   aggregation utility, `src/utils/macroRegionResolver.ts`, hardcodes city-name string literals
   and does its own count aggregation on the client — this is flagged for deletion** (violates
   single-source-of-truth, superseded by the backend region model; issue #1882 §3 already slates
   its removal).
   **Conclusion: the directional-region concept itself is not net-new.** What's missing is the
   backend persistence/onboarding layer that makes it authoritative and versioned (see the backend
   section, and [06-target-architecture-and-pr-plan.md](06-target-architecture-and-pr-plan.md)).
7. **Map ↔ panel synchronization — confirmed bidirectional, not missing.** Hover and select flow
   both ways: panel → map via `onAreaHover`/`onHoverResultListing` callbacks wired through
   `PropertyCard`'s mouse/focus/blur handlers; map → panel via marker layers consuming
   `hoveredAreaKey`/`selectedAreaKey`/`hoveredListingId`/`selectedListingId` and swapping marker
   icons accordingly.
8. **Listing pins, including the anon price band — confirmed.** `deriveMarkerLabel`
   (`PropertyMap.tsx:114`) resolves exact price / a coarsened price band / a residual "—" for
   anonymous users, matching recent commit `79113151` and the accessible labelling added for
   #1941/#1942 ("Approximate price…" / "Price unavailable" — deliberately not a sign-in prompt).
9. **School markers / radius overlay — confirmed present, not missing.** `SchoolMarkerLayer`,
   `SchoolZoneLabelLayer`, a `SchoolCircle` type + prop on `PropertyMap`, and dedicated panner
   components for school-radius framing. This is a full, tested capability
   (`PropertyMap.schoolCircle.test.tsx`).
10. **Agricultural sector / distance bands / town markers — mostly confirmed, one partial gap.**
    The directional wedge is real (`SectorOverlay.tsx` + `buildSectorPolygon` in `geo.ts` — a
    45°-wide wedge sampled every 2°, translucent fill, E2E-hardened). Town/parcel markers exist
    (`AgriMarkerClusterLayer` + `AgriPolygonLayer`). **The one partial gap: only a single outer
    arc renders today at the selected distance band — the frozen design's concentric cumulative
    rings at every band (10/25/50/100 km simultaneously) are not rendered.** The underlying math
    (`destinationPoint`, arc sampling) already supports adding the additional rings — this is a
    small frontend extension, not new geometry work.
11. **Prior work under issue #1882 is locked-in and must not be contradicted.**
    `docs/planning/issue-1882-map-zoom-camera-region-plan.md` is a PLAN_REVIEW-approved
    (2026-07-14) document tackling exactly the camera/region problem this plan also touches. It
    already decides: a Track A (3-PR UX, Postgres-served) / Track B (parallel OpenSearch
    scale-out) split; new backend persistence tables `city_region_policy`, `city_regions`,
    `city_region_memberships`, `regional_area_overrides`, `region_reindex_job`; a corrected
    "Central" rule (`distance_km ≤ central_radius_km`); a new endpoint
    `GET /api/discover/cities/{citySlug}/regions` returning all regions in a **stable order never
    driven by listing count**; and that the OpenSearch read path stays flag-off until a separate
    go/no-go (#1321). **`zoomPolicy.ts` is already the Track-A landed portion of this plan.** Any
    V2 plan must build on top of this, not re-litigate it.

---

## C. Backend data model & city-launch pipeline

1. **Two parallel region models coexist — the single biggest backend blocker for V2.**
   - **(A) Legacy, editorial, currently-live model:** `area_groups`
     (`V77__area_groups_schema.sql`), with a free-text `region_label` column, seeded across
     `V78`/`V99`/`V101`/**`V106`** (70KB, 304 Bangalore localities; labels like
     `north-growth`/`airport-belt`/`tech-corridor`/`outer-ring`). **This is what production
     currently reads for Discover, and it has no Centre bucket** — confirming the "4 macro
     regions, no Central" behaviour seen in production.
   - **(B) New, proper, currently-empty model:** `city_regions` (`V113__city_region_geometry_foundation.sql`,
     part of #1882 Track A) — `city_region_policy` (region model type + central radius +
     versioned `policy_fingerprint`), `city_regions` (materialized N/E/S/W/**Centre**, explicit
     `display_order` documented as "never from listing volume", fingerprint, `generated_at`),
     `city_region_memberships` (AUTO/OVERRIDE), `regional_area_overrides`. **This table is empty
     until `CityRegionOnboardingService.apply()` is run for a given city.** The live read path
     (`GET /api/discover/cities/{citySlug}/regions` + `/regions/{regionKey}/groups`) already
     exists and points at this new model — it is simply unpopulated for launch cities today.
   - **The frozen design's "primary directional region, N/E/S/W/Centre, versioned" requirement
     already exists as model (B) — it is not the model the current UI actually reads (model A).
     Resolving which model Discover V2 builds on is the #1 sequencing decision for this whole
     plan.**
2. **Listing model.** A hybrid typed-table design matching ADR #1624: a `property_listings` core
   + a `listing_family` discriminator (RESIDENTIAL/COMMERCIAL/AGRICULTURAL) + 1:1 typed detail
   tables (`ResidentialUnitDetail`/`CommercialSpaceDetail`/`AgriculturalLandDetail`) + child
   tables for amenities/features/tenants/suitable-uses. Confirmed current and unchanged.
3. **Schools — a real, existing entity.** `School.java` (`schools` table, `V58`, extended
   through `V69`); area linkage is a soft `area_key` text column auto-assigned by a 2 km PostGIS
   trigger (`V80`), not a foreign key; listing linkage is geospatial-radius only. Public API:
   `SchoolController` → `/api/public/schools/{search,nearby,popular,by-area,{id}}`. **The Schools
   backend needs no new work for V2** — only the frontend re-skin.
4. **Agricultural / farmland — parcels exist, towns/destinations do not.** Agricultural parcels
   are ordinary listings (`listing_family = AGRICULTURAL`, `AgriculturalLandDetail`). **There is
   no Town/Destination/Village entity anywhere in the codebase** — an exhaustive search for such a
   class turned up nothing beyond `AgriculturalLandDetail`. The "destination town" results the
   frozen design shows have **no backing entity at all today** — only manually-seeded label
   strings (`city_regional_direction_labels`). **This is the second-largest backend gap in the
   whole plan.**
5. **Discover-facing APIs (current, all confirmed public/anon-safe read paths):**
   `/api/discover/markers`, `/listings`, `/summary`, `/area-groups` (legacy model), `/areas`,
   `/regional-area-groups` (agri), `/cities/{citySlug}/regions` + `/regions/{regionKey}/groups`
   (new model), `/cities/{city}/listings`, `/agri-map-listings`,
   `/cities/{city}/school-radius-listings`, `POST /events`, plus
   `/api/public/areas/{areaKey}/overview`/`/trending` and `/api/trends/*`. A routing layer
   (`RoutingDiscover{Listings,Markers,Summary}Service`) fronts markers/listings/summary and
   chooses OpenSearch vs. Postgres per request.
6. **City-launch mechanism — a mature, versioned subsystem already exists.** A full
   `discover/citylaunch/` subsystem: `city_launch_revision` (`V118`, #1911) with an explicit
   lifecycle state machine (PREPARING → PREPARED → VALIDATED → PROMOTING → PROMOTED →
   SUPERSEDED → FAILED), revision numbers, checksums for drift detection, and partial unique
   indexes enforcing at most one in-flight and one live revision per city. Six `sandbox_*` tables
   mirror production geography column-for-column, allowing verbatim promotion once validated.
   Services: `CityLaunchPreparationService`, `CityLaunchPreviewService`,
   `CityLaunchPromotionService`, `CityRegionOnboardingService` (the same service that would
   generate the new local-directional-cluster tier, if built), `AreaOnboardingApplyService`.
   Admin API at `/api/admin/city-launch/**`. **Deterministic generation + versioning already
   exists as a pattern in this codebase (`policy_fingerprint`, `revision_number`, checksums) — a
   new cluster-generation service should follow this exact pattern, not invent a new one.**
   **Correction (verified by direct code investigation, 2026-07-21):** the `V118` migration
   header's comment scoping sandbox→production promotion to "PR8+" is **stale documentation, not an
   accurate gap** — `CityLaunchPromotionService.launch()` is fully implemented (guarded
   `VALIDATED→PROMOTING` CAS, checksum verification, six-table compare-before-write promotion in
   lock order, `PROMOTING→PROMOTED` CAS, `cities.is_active` flip, all in one `@Transactional`
   method, shipped as "#1911 PR5" per its own javadoc) and is covered end to end by real
   Testcontainers/HTTP integration tests (`CityLaunchPromotionServiceIT`,
   `AdminCityLaunchLaunchControllerIT`) that drive the actual prepare→validate→promote cycle, not a
   hand-seeded shortcut. The migration header was simply never updated after the promotion service
   shipped. Treat promotion as **shipped and safe to extend** (e.g. to a seventh table for a
   recursive hierarchy tier), not as a blocker requiring further verification.
7. **OpenSearch — fully built, deliberately dormant.** `discover.opensearch.enabled: false` in
   `application.yml`; the full adapter/DSL/shadow-parity/outbox layer is built, but Postgres is
   the live path. Turning it on is a configuration and hosting decision, not a code-writing task —
   **this should not gate Discover V2 sequencing.**
8. **Counts and aggregations — no enforced cross-level invariant.** Listing aggregates are
   computed live (gated behind `includeAggregates=false` by default); the region summary is
   Caffeine-cached (120s TTL); area analytics run as a separate scheduled rollup
   (`area_overview_stats`, analytics-only, not used for live UI markers). **There is no
   materialized or enforced guarantee that "a cluster's total equals the sum of its member
   areas' listings"** — and a historical double-count bug between `V78` and `V106` is concrete
   evidence that this invariant has been violated before, not just a theoretical risk. Any new
   cluster-tier work must either compute counts live from the same query path every time, or add
   an explicit enforced invariant (materialized view + a test that fails on drift).
9. **Anonymous vs. authenticated data exposure — confirmed, residential-specific.** The entire
   `/api/discover/*` surface coarsens unconditionally for anonymous users via shared helpers
   (`PriceBand.of()`, `GeoCoarsener.coarsen()`, `TrustBadge.publicBadge()`), reused by both the
   Postgres and OpenSearch mapping paths (`DiscoverListingsService.buildListing`). **This
   coarsening logic is residential-specific — a new Schools or Agricultural anon surface would
   need its own equivalent, audited coarsening funnel**, not an assumption that the existing one
   generalizes automatically. (Schools already has a public radius endpoint that appears to
   handle this correctly per the frontend audit — Agricultural's town/destination surface, once
   built, will need the same scrutiny.)
10. **The "optional local directional cluster" tier — 100% net-new, confirmed by exhaustive
    search.** An exhaustive `git grep -i cluster` across the backend turns up nothing but
    OpenSearch infrastructure and unrelated editorial prose (e.g. "industrial clusters near
    Padubidri" in area descriptions). There is no structural level between `city_regions` and
    `areas` — `area_groups` is flat, under-city, curated by hand, not density-triggered, not
    directional, and not versioned; `city_regions` has no child table; direction labels
    (`city_regional_direction_labels`) are manually seeded per city, not generated. **A generated,
    density-triggered, deterministically-named, versioned cluster tier is fully net-new
    engineering work.** Minimal footprint estimate: a new `city_region_clusters` table (parent FK
    → `city_regions`, `representative_area_key`, `display_label`, `display_order`, fingerprint,
    `generated_at`), a `cluster_key` column on area memberships, a sandbox mirror alongside the
    existing V118 sandbox family, a generator inside `CityRegionOnboardingService`/
    `CityRegionProjection`, and a new `/regions/{regionKey}/clusters` read endpoint.

### Dependencies that MUST resolve before Discover V2 frontend region/cluster work proceeds

1. **Resolve the dual region model** (item 1 above) — this is the top blocker; every downstream
   frontend region/cluster decision forks on it.
2. **Populate `city_regions` for every launch city** if the new model is adopted — the onboarding
   job must actually run per city (Bangalore, Udupi, Mangalore, Kundapur), or the new region
   endpoints return empty.
3. **Build the net-new local-directional-cluster model** (item 10) — the single largest net-new
   engineering item in this entire plan.
4. **Design and build the Agricultural Town/Destination entity** (item 4) — required before the
   Agricultural journey's town-results step can honestly render anything beyond raw parcels.
5. **Enforce or verify the cluster-total invariant** (item 8) before shipping any cluster-level UI
   that displays aggregate counts.
6. **Design an anon-safe projection funnel for any new Schools/Agricultural surface** (item 9) —
   don't assume the residential coarsening helpers generalize without an explicit audit.
7. **Treat OpenSearch as a configuration decision, not a sequencing blocker** (item 7).
8. **Verify the city-launch promotion pipeline actually ships end-to-end** (item 6) before
   assuming new cities can launch through it without manual intervention.
9. **All of the above is Flyway expand/contract SQL-table work, not JPA entity work** — coordinate
   changes with the existing checksum/fingerprint versioning conventions already used by the
   city-launch subsystem, don't invent a new versioning scheme.
