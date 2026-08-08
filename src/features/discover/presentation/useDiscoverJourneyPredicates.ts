import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import {
  toLayerInput,
  selectDiscoverMapLayer,
  type DiscoverMapLayerKind,
} from '@/utils/discoverLayerRegistry';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

// Issue #1824 Slice S11d — mirrors the AREA_LAYER_MAX_ZOOM threshold defined in
// src/pages/MapDiscovery.tsx (not exported from there — importing it back would
// create a circular page↔hook dependency). Same pattern already used by the e2e
// specs (e.g. e2e/discover-area-nav-journey.spec.ts) to mirror this constant.
// Keep this value in sync with src/pages/MapDiscovery.tsx's AREA_LAYER_MAX_ZOOM.
const AREA_LAYER_MAX_ZOOM = 12;

export interface UseDiscoverJourneyPredicatesParams {
  resolvedPanelContent: DiscoverPanelContent;
  focusedGroup: AreaGroup | null;
  selectedArea: AreaPoint | null;
  selectedSchool: SchoolResult | null;
  discoverAreas: AreaPoint[];
  areasLoading: boolean;
  cityTotal: number;
  urlState: DiscoverUrlState;
  isAgriJourney: boolean;
  mapZoom: number;
}

export interface UseDiscoverJourneyPredicatesResult {
  mapLayerKind: DiscoverMapLayerKind;
  mapLayerCategory: DiscoverMapLayerKind;
  isAreaFirstCityLanding: boolean;
  liveAreas: AreaPoint[];
  cityHasNoListings: boolean;
  isTopGroupedAreaOrSchool: boolean;
  isTopGroupedAgri: boolean;
}

/**
 * Issue #1824 Slice S11d — pre-layer "C1" predicate cluster extracted verbatim
 * from src/pages/MapDiscovery.tsx (the block immediately preceding the
 * useDiscoverMapPresentation call). Pure derivation — no React hooks inside,
 * so callers get a fresh result object every render (matching the page's
 * previous per-render `const` semantics exactly).
 *
 * See docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s11d-implementation.md.
 */
export function useDiscoverJourneyPredicates({
  resolvedPanelContent,
  focusedGroup,
  selectedArea,
  selectedSchool,
  discoverAreas,
  areasLoading,
  cityTotal,
  urlState,
  isAgriJourney,
  mapZoom,
}: UseDiscoverJourneyPredicatesParams): UseDiscoverJourneyPredicatesResult {
  // Issue #1607 — the area-first CITY-LEVEL landing (group cards shown, no group or
  // area resolved yet). Treated like the public guided-entry landing for map chrome:
  // only areas WITH live properties get a marker (zero-listing areas — including any
  // seed/test areas — never render as misleading pins), plus the "Home › City › Areas"
  // breadcrumb, the Areas legend, and the centred city-wide summary pill. Zero areas
  // stay fully discoverable through the right-panel group/area lists.
  const isAreaFirstCityLanding =
    resolvedPanelContent === 'area-groups-landing' && !focusedGroup && !selectedArea;
  // liveAreas: fresh array per render, NOT memoized. Do not wrap in useMemo.
  const liveAreas = discoverAreas.filter((a) => (a.listingCount ?? 0) > 0);
  // Issue #1588 follow-up — the selected city has finished loading and has zero live
  // properties. Gated on !areasLoading so the empty-state notice never flashes during
  // the load window (when cityTotal is transiently 0). City-scoped: discoverAreas comes
  // from /api/discover/areas for the current city, so this is true only for the real
  // selected city, never leaked from another city's data.
  const cityHasNoListings = !areasLoading && cityTotal === 0;

  const isTopGroupedAreaOrSchool =
    (urlState.journey === 'area-first' || urlState.journey === 'school-first') &&
    !urlState.groupId &&
    !urlState.areaKey &&
    !selectedArea &&
    !urlState.schoolId &&
    !selectedSchool &&
    !urlState.nodeListings;

  const isTopGroupedAgri =
    isAgriJourney &&
    !urlState.selectedRegion &&
    !urlState.areaKey &&
    !selectedArea &&
    !urlState.selectedLocality &&
    !urlState.selectedGroup;

  // Issue #1745 Batch B map-hierarchy fix — single derivation rule deciding WHICH
  // family of map markers `overviewAreas` (below) and the `listings` prop selection
  // (in the PropertyMap render further down) should use for the current URL state.
  // `mapLayerCategory` is the URL-driven category IGNORING the current zoom (bucket
  // forced to 'overview') — used wherever a decision must NOT flip with manual
  // zooming (e.g. suppressing raw listing markers at a grouped/landing state).
  // `mapLayerKind` additionally folds in the REAL current zoom bucket — used for the
  // area-marker layer itself, which already always hid above AREA_LAYER_MAX_ZOOM.
  // Composes with `computeDiscoverLayer`/`derivePanelContent` for the panel axis
  // (see discoverLayerRegistry.ts); does not duplicate journey-precedence routing.
  const discoverLayerInput = toLayerInput(urlState);
  const mapLayerCategory: DiscoverMapLayerKind = selectDiscoverMapLayer(discoverLayerInput, 'overview');
  const mapLayerKind: DiscoverMapLayerKind = selectDiscoverMapLayer(
    discoverLayerInput,
    mapZoom > AREA_LAYER_MAX_ZOOM ? 'detail' : 'overview',
  );

  return {
    mapLayerKind,
    mapLayerCategory,
    isAreaFirstCityLanding,
    liveAreas,
    cityHasNoListings,
    isTopGroupedAreaOrSchool,
    isTopGroupedAgri,
  };
}
