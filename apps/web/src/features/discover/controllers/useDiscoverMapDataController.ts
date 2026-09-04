import { useEffect, useMemo, useRef } from 'react';
import { useDiscoverMapData } from '@/hooks/useDiscoverMapData';
import { AREA_LAYER_MAX_ZOOM, shouldShowMarkers } from '@/lib/map/zoomPolicy';
import { useDiscoverSource } from '@/features/discover/state/DiscoverDataSourceContext';
import { useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { resolveDiscoverMarkerScope } from '@/features/discover/selectors/markerScope';
import { computeAreaSetCameraTarget } from '@/features/discover/selectors/areaSetCameraBounds';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

export interface UseDiscoverMapDataControllerParams {
  nav: DiscoverNavContextValue;
  city: string;
  /** The legacy/canonical AREA bridge from useDiscoverPageStateController. */
  effectiveSelectedArea: AreaPoint | null;
  /** The RAW legacy areaKey-driven selection — used ONLY by the agri-first arm of isTopGroupedLevel. */
  legacySelectedArea: AreaPoint | null;
  filters: PropertyFilters;
  selectedSchool: SchoolResult | null;
  debouncedSearch: string;
  isAuthenticated: boolean;
  fitTick: number;
  groupAreaKeysForMapData: string[] | undefined;
  areasNavigationJourney: UseAreasNavigationJourneyResult;
  boundedSearchTriggered: boolean;
  mapZoom: number;
  mapReady: boolean;
  page: number;
  mapBbox: [number, number, number, number] | null;
  intentListingPurpose: string;
  /** From useAuth via the page context — part of the isLoading aggregate. */
  authLoading: boolean;
  /** useDiscoverPageState's delayed-spinner setter, driven by the effect below. */
  setShowLoader: (show: boolean) => void;
}

/**
 * Issue #2142 (correction pass) — everything that decides WHAT MAP DATA THIS
 * PAGE FETCHES, moved verbatim off MapDiscovery.tsx.
 *
 * Owns, as one capability:
 *   - `effectiveFilters`  — the combined area+school bbox-polygon injection
 *                           (AC4). Its only consumer is the query below.
 *   - `isTopGroupedLevel` — the issue #1655 grouped-overview guard that gates
 *                           BOTH `markersEnabled` and `listingsEnabled`.
 *   - `useDiscoverMapData` itself.
 *   - `isLoading` + the delayed-spinner effect. Every input to `isLoading`
 *     except `authLoading` is an output of the query above, so the aggregate
 *     belongs with its producer rather than 350 lines away on the page.
 *
 * ORDERING NOTE (behaviour-preserving, verified): the 200 ms delayed-spinner
 * effect used to be declared ~450 lines below the query. It now runs earlier,
 * ahead of the school controller's journey-restore effects. Those effects
 * never read `showLoader` and this one never reads any of their state, so the
 * two orderings are observationally identical within a commit.
 */
export function useDiscoverMapDataController({
  nav,
  city,
  effectiveSelectedArea,
  legacySelectedArea,
  filters,
  selectedSchool,
  debouncedSearch,
  isAuthenticated,
  fitTick,
  groupAreaKeysForMapData,
  areasNavigationJourney,
  boundedSearchTriggered,
  mapZoom,
  mapReady,
  page,
  mapBbox,
  intentListingPurpose,
  authLoading,
  setShowLoader,
}: UseDiscoverMapDataControllerParams) {
  // Area-scoping for the combined panel (AC4): when BOTH area and school are selected
  // and no user-drawn polygon is present, derive a bounding-box polygon from the area's
  // bbox so the listings request is spatially constrained to the intersection of area
  // bounds AND school proximity.
  //
  // Guard: !nav.schoolId restricts injection to combined state only.
  // Without this guard, area-first journey (area selected, no school) would also have
  // the polygon injected, routing the request through the polygon endpoint (capped at 200)
  // and breaking authenticated-user pagination.
  //
  // Polygon format: [[s,w],[s,e],[n,e],[n,w],[s,w]] — five [lat,lon] pairs matching
  // the PropertyFilters.polygon convention used by useDiscoverListings/the backend.
  const effectiveFilters = useMemo((): PropertyFilters => {
    // Only inject area-bbox polygon in combined state (area + school both present).
    // FIX CYCLE 2 (opus review, nit) — was `selectedArea?.bbox`, which never
    // injected a polygon for a canonical AREA-leaf + school combined state
    // (the node journey never sets the legacy `selectedArea`). Uses
    // `effectiveSelectedArea` — the same area+node bridge every other
    // selectedArea-driven gate on this page already reads — so a node leaf
    // gets the same area-bbox scoping a legacy areaKey selection does.
    if (!nav.schoolId || !effectiveSelectedArea?.bbox || filters.polygon) return filters;
    const [[s, w], [n, e]] = effectiveSelectedArea.bbox;
    const bboxPolygon: [number, number][] = [[s, w], [s, e], [n, e], [n, w], [s, w]];
    return { ...filters, polygon: bboxPolygon };
  }, [filters, effectiveSelectedArea, nav.schoolId]);

  // Issue #1655 — top-grouped-level guard: at the grouped overview level, individual
  // property markers and paginated listings should NOT be fetched. Only group/zone
  // count markers (from useDiscoverAreas / useAreaGroups / useRegionalAreaGroups)
  // are needed. This boolean mirrors the isTopGroupedAreaOrSchool / isTopGroupedAgri
  // definitions in useDiscoverJourneyPredicates but is computed here so it can gate
  // the data hooks.
  const isTopGroupedLevel = (() => {
    if (
      (nav.journey === 'area-first' || nav.journey === 'school-first') &&
      !nav.groupId &&
      !nav.areaKey &&
      // Issue #1956 PR-4 (gate 1) — `effectiveSelectedArea` also carries the
      // canonical AREA-leaf bridge, so a resolved node leaf correctly clears
      // this grouped-overview guard exactly like a legacy areaKey selection
      // does.
      !effectiveSelectedArea &&
      !nav.schoolId &&
      !selectedSchool &&
      !nav.nodeListings
    ) return true;
    if (
      nav.journey === 'agri-first' &&
      !nav.selectedRegion &&
      !nav.areaKey &&
      !legacySelectedArea &&
      !nav.selectedLocality &&
      !nav.selectedGroup
    ) return true;
    return false;
  })();

  // Issue #2185 S2 — the source of truth for what geography the map's
  // marker fetch is scoped to. See `resolveDiscoverMarkerScope`'s own doc
  // for the full precedence and why it must be computed in THIS ONE place
  // (this controller is the sole caller of the selector).
  const source = useDiscoverSource();
  const markerScope = resolveDiscoverMarkerScope({
    sourceMode: source.mode,
    journey: nav.journey,
    schoolId: nav.schoolId,
    rawNodeParam: nav.rawNodeParam,
    resolvedNodeKey: areasNavigationJourney.node?.nodeKey ?? null,
    groupAreaKeys: groupAreaKeysForMapData,
  });

  // Issue #2016 — the committed geography (AREA_SET | POLYGON | VIEWPORT |
  // null), read from `nav` (which already carries the full facade state —
  // see DiscoverContext.tsx's `nav = { ...urlState, viewport: removed }`).
  // Forwarded to useDiscoverMapData so its two direct query hooks
  // (useDiscoverListings/useDiscoverFilteredMarkers) share the SAME
  // scopeFingerprint as every other consumer of this ResultScope, and so a
  // committed VIEWPORT's bounds reach the new `viewportScope` request param.
  // Orthogonal to `markerScope` above: markerScope stays the navigation-
  // resolution view (city/node/legacy-areas/unresolved) per the approved
  // decision — POLYGON already reaches the query via the `filters.polygon`
  // bridge (useDiscoverPageState.ts), this is purely for the shared identity.
  const resultScope = nav.resultScope?.active ?? null;

  // Issue #2016 code-review Finding 11 — a committed POLYGON/VIEWPORT scope
  // and a navigation-derived AREA_SET-equivalent markerScope (areas/node)
  // are NOT independent at the wire level: buildDiscoverSearchParams would
  // emit BOTH areaKeys/nodeKey (from markerScope) AND polygon (from the
  // filters.polygon bridge) on the same request, exactly the combination
  // the new backend 400 exclusivity check forbids. Suppress the
  // navigation-derived scope down to unscoped-city at the single point the
  // query params are assembled whenever a non-AREA_SET result scope is
  // committed — resolveDiscoverMarkerScope itself stays untouched (pure
  // navigation view, per the approved decision).
  //
  // Issue #2016 code-review Finding 3 — `markerScope.kind !== 'unresolved'`
  // guard added: an `{kind:'unresolved'}` markerScope (mid-resolution — a
  // `node=` still resolving, or a legacy group cold-load) must NEVER be
  // rewritten to `{kind:'city'}` here, even while a non-AREA_SET result
  // scope is committed — that would defeat useDiscoverFilteredMarkers.ts's
  // own `scope.kind !== 'unresolved'` enabled-guard, whose whole purpose is
  // "never silently degrade a mid-resolution scope to unscoped city-wide".
  const effectiveMarkerScope =
    resultScope && resultScope.kind !== 'AREA_SET' && markerScope.kind !== 'unresolved'
      ? { kind: 'city' as const }
      : markerScope;

  // Issue #2015 code-review BLOCKING fix — `mapBbox` (useDiscoverViewportTracker)
  // is a LIVE value that keeps drifting on every pan/zoom, regardless of what
  // scope is actually committed. Once a VIEWPORT scope is committed, its
  // frozen rectangle already reaches the query as its own `viewportScope`
  // request param (see useDiscoverListings.ts/useDiscoverFilteredMarkers.ts —
  // `resultScope.kind === 'VIEWPORT' ? resultScope.bounds : null`). `bbox` is
  // a SEPARATE always-on render/perf prefilter that the backend ANDs with
  // viewportScope (DiscoverListingPredicateBuilder.java) — so forwarding the
  // still-drifting live `mapBbox` here would silently narrow every committed
  // VIEWPORT result set to the intersection of the frozen rectangle and
  // wherever the user has panned to since, without the user re-clicking
  // "Search this area". Suppressed to `null` exactly like `effectiveMarkerScope`
  // suppresses the AREA_SET-shaped marker scope for any non-AREA_SET commit —
  // the frozen `viewportScope` param is already the sole spatial filter for a
  // committed VIEWPORT scope.
  const effectiveBbox = resultScope?.kind === 'VIEWPORT' ? null : mapBbox;

  const mapData = useDiscoverMapData({
    // Issue #1956 PR-4 (gate 3) — feeds the bridged AreaPoint so the
    // areaKeys derivation (useDiscoverMapData.ts:511) resolves to
    // [effectiveSelectedArea.areaKey] instead of [] at a canonical AREA leaf.
    city, selectedArea: effectiveSelectedArea, filters: effectiveFilters, debouncedSearch,
    urlSchoolId: nav.schoolId, isAuthenticated, fitTick,
    // Issue #2185 S2 — replaces the separate groupAreaKeys/nodeKey params
    // (#1806/#2087). The canonical node journey never sets nav.groupId, so
    // groupAreaKeysForMapData was always undefined there and the marker
    // fetch reached this hook with NO scope at all (unscoped city-wide) —
    // the map/panel divergence this issue fixes. markerScope now resolves
    // deterministically for every journey/state combination.
    // Issue #2016 code-review Finding 11 — effectiveMarkerScope (not raw
    // markerScope) so a committed POLYGON/VIEWPORT scope never leaves a
    // stale areaKeys/nodeKey param on the request alongside it.
    scope: effectiveMarkerScope,
    // Issue #1118: do NOT include !!nav.schoolId here. The /api/discover/markers
    // endpoint is auth-gated (returns 401 for anonymous users). Enabling the query for
    // unauthenticated school-first users caused a delayed marker disappearance: placeholderData
    // kept stale markers visible briefly, then the 401 settled and markers vanished while the
    // right panel was already empty (useDiscoverListings is also auth-gated synchronously).
    // Unauthenticated school-first users fall back to areaMarkerListings.
    // Issue #1160 v3 Bug A2 — explicit auth+journey gating.
    //   Area-first: auth users only (matches existing behaviour).
    //   School-first: auth users only AND only when a schoolId is selected
    //     (top-level school-first browsing without schoolId leaves markers disabled
    //     since useDiscoverFilteredMarkers needs schoolLat/schoolLon to be meaningful).
    //   Anon school-first remains disabled (Issue #1118 regression guard — /api/discover/markers
    //     returns 401 for anon, which causes a delayed marker disappearance).
    // Issue #1115 — school-first branch additionally requires boundedSearchTriggered so
    // the /api/discover/markers fetch does NOT auto-fire on school select. The CTA in
    // SchoolSelectedPanel sets this flag. Area-first branch is untouched.
    // Issue #1655 — top-grouped guard: disable markers at grouped level so
    // useDiscoverFilteredMarkers does not fire for individual property coordinates.
    markersEnabled:
      !isTopGroupedLevel &&
      isAuthenticated &&
      (nav.journey === 'area-first' ||
        // Issue #1372 — agri-first journey must also enable markers so AgriMarkerClusterLayer
        // receives data. Without this, useDiscoverFilteredMarkers is never enabled in
        // agri-first mode and the cluster layer renders empty.
        nav.journey === 'agri-first' ||
        (nav.journey === 'school-first' &&
          !!nav.schoolId &&
          filters.schoolLat != null &&
          filters.schoolLon != null &&
          boundedSearchTriggered)) &&
      // zoomPolicy.shouldShowMarkers gate (same threshold as before:
      // zoom > AREA_LAYER_MAX_ZOOM). This live gate is the tested equivalent
      // of deriveScopeAwareMarkersEnabled (useDiscoverMapData.ts), which
      // covers the scope.kind==='group'||'area' && shouldShowMarkers(zoom)
      // contract in isolation (scopeAwareMarkers.test.tsx).
      // Issue #2087 — bounded listings bypass the zoom threshold and always
      // show property markers to replace the area navigation bubbles.
      (nav.nodeListings || shouldShowMarkers(mapZoom)),
    // Issue #1655 — suppress the paginated listings fetch at grouped overview level.
    // At top-grouped states the right panel shows groups/zones, not individual listings,
    // so there is no consumer for this data. Drilling down into a group/area/school
    // clears isTopGroupedLevel and re-enables the fetch.
    listingsEnabled: !isTopGroupedLevel,
    page,
    // Issue #2015 code-review BLOCKING fix — see `effectiveBbox`'s doc above.
    bbox: effectiveBbox,
    journey: nav.journey,
    // Issue #1494 — thread buy/rent intent as listingPurpose filter
    listingPurpose: intentListingPurpose,
    // Issue #2016 — see the `resultScope` const's doc above.
    resultScope,
  });

  // Issue #2017 (Step 7) — when a MULTI-area (N>1) AREA_SET scope is
  // committed (via AreaSetChips.tsx's "Search these areas" CTA, or already
  // present on a deep-linked/refreshed URL), publish ONE recenter camera
  // intent framing the union of the committed areas' bounds.
  //
  // Lives here rather than on AreaSetChips.tsx (or a new prop threaded down
  // to it) because this controller already has both the committed
  // `resultScope` and `mapData.discoverAreasData`/`publishRecenterCameraIntent`
  // in scope — no new coupling between the chip component and the camera
  // system is needed.
  //
  // Strictly N>1: a single-area AREA_SET commit already has its own,
  // untouched camera-intent flow via selectArea()/publishCameraIntent, and
  // must stay byte-for-byte identical to today's behaviour (the #2017
  // no-regression requirement) — this effect must never fire alongside it.
  //
  // Gated on the committed areaKeys' SIGNATURE (not object identity, which
  // is fresh every render) — mirrors useAreaSetDraft.ts's lastSeedSignature
  // pattern. The ref is only advanced once a target is actually computed and
  // published, so if discoverAreasData hasn't loaded yet on a cold multi-area
  // deep link, the effect retries on the next render once the areas arrive.
  const committedAreaSetKeys = resultScope?.kind === 'AREA_SET' ? resultScope.areaKeys : [];
  const committedAreaSetSignature = committedAreaSetKeys.join(' ');
  const lastAreaSetCameraSignature = useRef<string | null>(null);

  useEffect(() => {
    if (committedAreaSetKeys.length <= 1) return;
    if (committedAreaSetSignature === lastAreaSetCameraSignature.current) return;
    const target = computeAreaSetCameraTarget(
      committedAreaSetKeys,
      mapData.discoverAreasData?.areas ?? [],
    );
    if (!target) return;
    lastAreaSetCameraSignature.current = committedAreaSetSignature;
    mapData.publishRecenterCameraIntent(target.bounds, target.center, 'overview');
    // committedAreaSetKeys is derived fresh from committedAreaSetSignature
    // every render; only the signature (plus the data needed to resolve it)
    // should gate this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedAreaSetSignature, mapData.discoverAreasData, mapData.publishRecenterCameraIntent]);

  // Issue #2017 (Fit all / focus-one, MUST-HAVE confirmed by the owner as
  // part of #2017's approved design contract — see DiscoverShellContextValue's
  // AreaSetCameraActions doc) — registers the two user-triggered, camera-only
  // actions for a committed AREA_SET into DiscoverShellContext, via the SAME
  // `computeAreaSetCameraTarget` + `publishRecenterCameraIntent` machinery
  // the auto-fit-on-commit effect above already uses.
  //
  // Deliberately does NOT touch `resultScope`/`rareas` or call any
  // DiscoverActionsContext action — both are camera intent only, so the
  // committed multi-area result set (and its `rareas` URL param) is
  // untouched by either call, exactly the requirement.
  //
  // `focusAreaSetMember` reuses `computeAreaSetCameraTarget` with a
  // single-element areaKeys array rather than a bespoke single-area path —
  // that helper already has the correct bbox/centre-fallback null-safety
  // for one area (see its own doc), so this is the same union logic
  // degenerately applied to N=1. Framed as `'leaf'` (not `'overview'`),
  // matching `publishRecenterCameraIntent`'s documented framing convention
  // for a single resolved area.
  const shell = useDiscoverShell();
  useEffect(() => {
    shell.registerAreaSetCameraActions({
      fitAreaSet: () => {
        const keys = resultScope?.kind === 'AREA_SET' ? resultScope.areaKeys : [];
        if (keys.length <= 1) return;
        const target = computeAreaSetCameraTarget(keys, mapData.discoverAreasData?.areas ?? []);
        if (!target) return;
        mapData.publishRecenterCameraIntent(target.bounds, target.center, 'overview');
      },
      focusAreaSetMember: (areaKey: string) => {
        const keys = resultScope?.kind === 'AREA_SET' ? resultScope.areaKeys : [];
        if (!keys.includes(areaKey)) return;
        const target = computeAreaSetCameraTarget([areaKey], mapData.discoverAreasData?.areas ?? []);
        if (!target) return;
        mapData.publishRecenterCameraIntent(target.bounds, target.center, 'leaf');
      },
    });
    return () => shell.registerAreaSetCameraActions(null);
  }, [shell, resultScope, mapData.discoverAreasData, mapData.publishRecenterCameraIntent]);

  // isLoading depends on both hooks and useAuth — must be computed here (Rule 1).
  const isLoading =
    authLoading || !mapReady || mapData.areasLoading || mapData.listingDataLoading
    || (isAuthenticated && shouldShowMarkers(mapZoom) && mapData.markersLoading);

  // Delayed-show spinner: only show after 200 ms to prevent flicker on fast loads.
  useEffect(() => {
    if (!isLoading) { setShowLoader(false); return; }
    const t = setTimeout(() => setShowLoader(true), 200);
    return () => clearTimeout(t);
  }, [isLoading, setShowLoader]);

  return {
    ...mapData,
    effectiveFilters,
    isTopGroupedLevel,
    isLoading,
    areaLayerMaxZoom: AREA_LAYER_MAX_ZOOM,
  };
}
