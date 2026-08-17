import { useEffect, useMemo } from 'react';
import { useDiscoverMapData } from '@/hooks/useDiscoverMapData';
import { AREA_LAYER_MAX_ZOOM, shouldShowMarkers } from '@/lib/map/zoomPolicy';
import { useDiscoverSource } from '@/features/discover/state/DiscoverDataSourceContext';
import { resolveDiscoverMarkerScope } from '@/features/discover/selectors/markerScope';
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
    scope: markerScope,
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
    bbox: mapBbox,
    journey: nav.journey,
    // Issue #1494 — thread buy/rent intent as listingPurpose filter
    listingPurpose: intentListingPurpose,
  });

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
