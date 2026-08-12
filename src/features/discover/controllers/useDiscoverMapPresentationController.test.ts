import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockUseDiscoverInteractionState = vi.hoisted(() => vi.fn());
const mockUseAreaSearchState = vi.hoisted(() => vi.fn());
const mockUseRegionGuideState = vi.hoisted(() => vi.fn());
const mockUseReducedMotion = vi.hoisted(() => vi.fn());
const mockUseDiscoverCameraOrchestration = vi.hoisted(() => vi.fn());
const mockUseDiscoverJourneyPredicates = vi.hoisted(() => vi.fn());
const mockUseDiscoverMapPresentation = vi.hoisted(() => vi.fn());
const mockCheckIsSelectedNodeOutOfView = vi.hoisted(() => vi.fn());
const mockGetCameraIntentForRecenter = vi.hoisted(() => vi.fn());

vi.mock('@/features/discover/state/useDiscoverInteractionState', () => ({
  useDiscoverInteractionState: mockUseDiscoverInteractionState,
}));
vi.mock('@/features/discover/state/useAreaSearchState', () => ({ useAreaSearchState: mockUseAreaSearchState }));
vi.mock('@/features/discover/state/useRegionGuideState', () => ({ useRegionGuideState: mockUseRegionGuideState }));
vi.mock('@/features/discover/state/useReducedMotion', () => ({ useReducedMotion: mockUseReducedMotion }));
vi.mock('@/features/discover/state/useDiscoverCameraOrchestration', () => ({
  useDiscoverCameraOrchestration: mockUseDiscoverCameraOrchestration,
}));
vi.mock('@/features/discover/presentation/useDiscoverJourneyPredicates', () => ({
  useDiscoverJourneyPredicates: mockUseDiscoverJourneyPredicates,
}));
vi.mock('@/features/discover/presentation/useDiscoverMapPresentation', () => ({
  useDiscoverMapPresentation: mockUseDiscoverMapPresentation,
}));
vi.mock('@/pages/MapDiscovery.recenter', () => ({
  isSelectedNodeOutOfView: mockCheckIsSelectedNodeOutOfView,
  getCameraIntentForRecenter: mockGetCameraIntentForRecenter,
}));

import { useDiscoverMapPresentationController } from './useDiscoverMapPresentationController';
import type { UseDiscoverMapPresentationControllerParams } from './useDiscoverMapPresentationController';

const INTERACTION_RESULT = {
  view: { hoveredListingId: null, hoveredAreaKeyForMap: null, highlightedAreaKeys: null },
  commands: {},
};
const AREA_SEARCH_RESULT = { areaSearchQuery: '', debouncedAreaSearchQuery: '', setAreaSearchQuery: vi.fn() };
const REGION_GUIDE_RESULT = {
  view: { regionSelectSource: null, regionSelectNonce: 0, regionGuideDismissed: false },
  commands: { armRegionSelect: vi.fn(), dismissRegionGuide: vi.fn() },
};
const CAMERA_RESULT = {
  schoolFocusTick: 0,
  schoolMarkerFocusTick: 0,
  schoolFocusLat: undefined,
  schoolFocusLon: undefined,
  agriGroupFocusBounds: null,
  canonicalNodeFitCount: 0,
  isColdNavigate: false,
};
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
  overrides: Partial<UseDiscoverMapPresentationControllerParams> = {},
): UseDiscoverMapPresentationControllerParams {
  return {
    showAreasNavigationJourney: false,
    areasNavigationJourney: { node: null, children: [], isLoading: false, error: null, selectNode: vi.fn() } as never,
    mapBbox: null,
    publishRecenterCameraIntent: vi.fn(),
    urlState: {} as never,
    cameraOrchestrationUrlState: {} as never,
    selectedSchool: null,
    setPanToArea: vi.fn(),
    isLoadingAreaListings: false,
    discoverAreas: [],
    areasLoading: false,
    areaGroupsData: undefined,
    isLoadingAreaGroups: false,
    agriMapListingsData: undefined,
    cityCenter: undefined,
    focusedGroup: null,
    summaryRegions: [],
    selectedRegion: null,
    selectedMaxKm: null,
    schoolListings: [],
    regionScopedGroupsData: undefined,
    isLoadingRegionScopedGroups: false,
    scopeNamespaces: SCOPE_NAMESPACES,
    resolvedPanelContent: 'guided-entry' as never,
    effectiveSelectedArea: null,
    cityTotal: 0,
    isAgriJourney: false,
    mapZoom: 12,
    isLoadingRegionalAreaGroups: false,
    isLandingState: false,
    corridorGroups: [],
    agriAreasData: undefined,
    city: 'udupi',
    selectedMarkerListing: null,
    visibleMemberSet: undefined,
    actions: { setRegionWithMaxKm: vi.fn(), setScope: vi.fn(), selectGroup: vi.fn() } as never,
    handleAreaClick: vi.fn(),
    ...overrides,
  };
}

describe('useDiscoverMapPresentationController (#2142 Commit 3 C4 — moved verbatim from MapDiscovery.tsx, composition test)', () => {
  beforeEach(() => {
    mockUseDiscoverInteractionState.mockReset().mockReturnValue(INTERACTION_RESULT);
    mockUseAreaSearchState.mockReset().mockReturnValue(AREA_SEARCH_RESULT);
    mockUseRegionGuideState.mockReset().mockReturnValue(REGION_GUIDE_RESULT);
    mockUseReducedMotion.mockReset().mockReturnValue(false);
    mockUseDiscoverCameraOrchestration.mockReset().mockReturnValue(CAMERA_RESULT);
    mockUseDiscoverJourneyPredicates.mockReset().mockReturnValue(JOURNEY_PREDICATES_RESULT);
    mockUseDiscoverMapPresentation.mockReset().mockReturnValue(MAP_PRESENTATION_RESULT);
    mockCheckIsSelectedNodeOutOfView.mockReset().mockReturnValue(false);
    mockGetCameraIntentForRecenter.mockReset().mockReturnValue(null);
  });

  it('isSelectedNodeOutOfView is false when showAreasNavigationJourney is false, without calling the predicate', () => {
    const { result } = renderHook(() => useDiscoverMapPresentationController(baseParams()));
    expect(result.current.isSelectedNodeOutOfView).toBe(false);
    expect(mockCheckIsSelectedNodeOutOfView).not.toHaveBeenCalled();
  });

  it('isSelectedNodeOutOfView delegates to checkIsSelectedNodeOutOfView(node, mapBbox) when the journey is showing', () => {
    mockCheckIsSelectedNodeOutOfView.mockReturnValue(true);
    const node = { nodeKey: 'n:1' } as never;
    const { result } = renderHook(() =>
      useDiscoverMapPresentationController(
        baseParams({
          showAreasNavigationJourney: true,
          areasNavigationJourney: { node, children: [], isLoading: false, error: null, selectNode: vi.fn() } as never,
          mapBbox: [1, 2, 3, 4],
        }),
      ),
    );
    expect(result.current.isSelectedNodeOutOfView).toBe(true);
    expect(mockCheckIsSelectedNodeOutOfView).toHaveBeenCalledWith(node, [1, 2, 3, 4]);
  });

  it('handleRecenterOnSelectedNode is a no-op when getCameraIntentForRecenter returns null', () => {
    const publishRecenterCameraIntent = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverMapPresentationController(baseParams({ publishRecenterCameraIntent })),
    );
    act(() => result.current.handleRecenterOnSelectedNode());
    expect(publishRecenterCameraIntent).not.toHaveBeenCalled();
  });

  it('handleRecenterOnSelectedNode republishes the resolved intent via publishRecenterCameraIntent', () => {
    mockGetCameraIntentForRecenter.mockReturnValue({
      cameraBounds: [[1, 2], [3, 4]],
      centre: [5, 6],
      kind: 'leaf',
    });
    const publishRecenterCameraIntent = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverMapPresentationController(baseParams({ publishRecenterCameraIntent })),
    );
    act(() => result.current.handleRecenterOnSelectedNode());
    expect(publishRecenterCameraIntent).toHaveBeenCalledWith([[1, 2], [3, 4]], [5, 6], 'leaf');
  });

  it('threads the SAME scopeNamespaces reference into both useDiscoverCameraOrchestration and useDiscoverMapPresentation (single source of truth, issue #1910)', () => {
    renderHook(() => useDiscoverMapPresentationController(baseParams({ scopeNamespaces: SCOPE_NAMESPACES })));
    expect(mockUseDiscoverCameraOrchestration).toHaveBeenCalledWith(
      expect.objectContaining({ scopeNamespaces: SCOPE_NAMESPACES }),
    );
    expect(mockUseDiscoverMapPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ scopeNamespaces: SCOPE_NAMESPACES }),
    );
  });

  it('handleOverviewAreaClick resolves scope via the SAME scopeNamespaces (not a reconstructed copy) and routes macro-region bubbles through setScope', () => {
    const regionKeys = new Set(['north']);
    const scopeNamespaces = { regionKeys, groupSlugs: new Set<string>() };
    mockUseDiscoverJourneyPredicates.mockReturnValue({ ...JOURNEY_PREDICATES_RESULT, mapLayerKind: 'macro-region-bubbles' });
    const actions = { setRegionWithMaxKm: vi.fn(), setScope: vi.fn(), selectGroup: vi.fn() } as never;
    const { result } = renderHook(() =>
      useDiscoverMapPresentationController(baseParams({ scopeNamespaces, actions })),
    );
    act(() => result.current.handleOverviewAreaClick({ areaKey: 'north' } as never));
    expect((actions as { setScope: ReturnType<typeof vi.fn> }).setScope).toHaveBeenCalledWith('north');
  });

  it('handleOverviewAreaClick falls back to handleAreaClick for a plain area (no scope match)', () => {
    const handleAreaClick = vi.fn();
    const area = { areaKey: 'IN|KA|Udupi|Manipal' } as never;
    const { result } = renderHook(() =>
      useDiscoverMapPresentationController(baseParams({ handleAreaClick })),
    );
    act(() => result.current.handleOverviewAreaClick(area));
    expect(handleAreaClick).toHaveBeenCalledWith(area);
  });

  it('returns the composed output from all 7 wrapped hooks', () => {
    const { result } = renderHook(() => useDiscoverMapPresentationController(baseParams()));
    expect(result.current.hoveredListingId).toBe(INTERACTION_RESULT.view.hoveredListingId);
    expect(result.current.debouncedAreaSearchQuery).toBe(AREA_SEARCH_RESULT.debouncedAreaSearchQuery);
    expect(result.current.regionSelectSource).toBe(REGION_GUIDE_RESULT.view.regionSelectSource);
    expect(result.current.prefersReducedMotion).toBe(false);
    expect(result.current.schoolFocusTick).toBe(CAMERA_RESULT.schoolFocusTick);
    expect(result.current.mapLayerKind).toBe(JOURNEY_PREDICATES_RESULT.mapLayerKind);
    expect(result.current.overviewAreas).toBe(MAP_PRESENTATION_RESULT.overviewAreas);
  });
});
