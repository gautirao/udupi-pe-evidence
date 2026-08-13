import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUseDiscoverJourneyPredicates = vi.hoisted(() => vi.fn());
const mockUseDiscoverMapPresentation = vi.hoisted(() => vi.fn());

vi.mock('@/features/discover/presentation/useDiscoverJourneyPredicates', () => ({
  useDiscoverJourneyPredicates: mockUseDiscoverJourneyPredicates,
}));
vi.mock('@/features/discover/presentation/useDiscoverMapPresentation', () => ({
  useDiscoverMapPresentation: mockUseDiscoverMapPresentation,
}));

import { useDiscoverMapLayerController } from './useDiscoverMapLayerController';
import type { UseDiscoverMapLayerControllerParams } from './useDiscoverMapLayerController';

const JOURNEY_PREDICATES_RESULT = {
  mapLayerKind: 'all-areas',
  mapLayerCategory: 'area-selected',
  isAreaFirstCityLanding: false,
  liveAreas: [],
  cityHasNoListings: false,
  isTopGroupedAreaOrSchool: false,
  isTopGroupedAgri: false,
};
const MAP_PRESENTATION_RESULT = {
  overviewAreas: [],
  areaSearchMatchKeys: undefined,
  resolvedRegionLabel: null,
  isRegionOverview: false,
  regionOverviewMarkerKind: null,
  regionOverviewShortLabel: null,
  areaJourneySegments: [],
  schoolJourneySegments: [],
};

const SCOPE_NAMESPACES = { regionKeys: new Set<string>(), groupSlugs: new Set<string>() };

function baseParams(
  overrides: Partial<UseDiscoverMapLayerControllerParams> = {},
): UseDiscoverMapLayerControllerParams {
  return {
    resolvedPanelContent: 'guided-entry' as never,
    focusedGroup: null,
    effectiveSelectedArea: null,
    selectedSchool: null,
    discoverAreas: [],
    areasLoading: false,
    cityTotal: 0,
    urlState: {} as never,
    isAgriJourney: false,
    mapZoom: 12,
    isLoadingAreaGroups: false,
    isLoadingRegionalAreaGroups: false,
    isLandingState: false,
    areaGroupsData: undefined,
    corridorGroups: [],
    agriAreasData: undefined,
    summaryRegions: [],
    cityCenter: undefined,
    debouncedAreaSearchQuery: '',
    city: 'udupi',
    selectedMarkerListing: null,
    scopeNamespaces: SCOPE_NAMESPACES,
    regionScopedGroupsData: undefined,
    visibleMemberSet: undefined,
    ...overrides,
  };
}

describe('useDiscoverMapLayerController', () => {
  beforeEach(() => {
    mockUseDiscoverJourneyPredicates.mockReset().mockReturnValue(JOURNEY_PREDICATES_RESULT);
    mockUseDiscoverMapPresentation.mockReset().mockReturnValue(MAP_PRESENTATION_RESULT);
  });

  it('threads the SAME scopeNamespaces reference into useDiscoverMapPresentation (single source of truth, issue #1910)', () => {
    renderHook(() => useDiscoverMapLayerController(baseParams({ scopeNamespaces: SCOPE_NAMESPACES })));
    expect(mockUseDiscoverMapPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ scopeNamespaces: SCOPE_NAMESPACES }),
    );
  });

  it('feeds the predicates hook output (mapLayerKind/liveAreas/isAreaFirstCityLanding) into the presentation hook — the coupling that keeps these two in ONE controller', () => {
    mockUseDiscoverJourneyPredicates.mockReturnValue({
      ...JOURNEY_PREDICATES_RESULT,
      mapLayerKind: 'macro-region-bubbles',
      liveAreas: [{ areaKey: 'a:1' }],
      isAreaFirstCityLanding: true,
    });
    renderHook(() => useDiscoverMapLayerController(baseParams()));
    expect(mockUseDiscoverMapPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        mapLayerKind: 'macro-region-bubbles',
        liveAreas: [{ areaKey: 'a:1' }],
        isAreaFirstCityLanding: true,
      }),
    );
  });

  it('passes effectiveSelectedArea (the legacy/canonical bridge) as `selectedArea` to BOTH wrapped hooks, never a raw legacy value', () => {
    const effectiveSelectedArea = { areaKey: 'a:1' } as never;
    renderHook(() => useDiscoverMapLayerController(baseParams({ effectiveSelectedArea })));
    expect(mockUseDiscoverJourneyPredicates).toHaveBeenCalledWith(
      expect.objectContaining({ selectedArea: effectiveSelectedArea }),
    );
    expect(mockUseDiscoverMapPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ selectedArea: effectiveSelectedArea }),
    );
  });

  it('returns the composed output of both wrapped hooks', () => {
    const { result } = renderHook(() => useDiscoverMapLayerController(baseParams()));
    expect(result.current.mapLayerKind).toBe(JOURNEY_PREDICATES_RESULT.mapLayerKind);
    expect(result.current.mapLayerCategory).toBe(JOURNEY_PREDICATES_RESULT.mapLayerCategory);
    expect(result.current.overviewAreas).toBe(MAP_PRESENTATION_RESULT.overviewAreas);
    // Schools-canonical-geography (#2124) — produced here and nowhere else.
    expect(result.current.schoolJourneySegments).toBe(MAP_PRESENTATION_RESULT.schoolJourneySegments);
  });
});
