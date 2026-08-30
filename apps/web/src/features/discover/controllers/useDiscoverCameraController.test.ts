import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockUseDiscoverCameraOrchestration = vi.hoisted(() => vi.fn());
const mockCheckIsSelectedNodeOutOfView = vi.hoisted(() => vi.fn());
const mockGetCameraIntentForRecenter = vi.hoisted(() => vi.fn());

vi.mock('@/features/discover/state/useDiscoverCameraOrchestration', () => ({
  useDiscoverCameraOrchestration: mockUseDiscoverCameraOrchestration,
}));
vi.mock('@/pages/MapDiscovery.recenter', () => ({
  isSelectedNodeOutOfView: mockCheckIsSelectedNodeOutOfView,
  getCameraIntentForRecenter: mockGetCameraIntentForRecenter,
}));

import { useDiscoverCameraController } from './useDiscoverCameraController';
import type { UseDiscoverCameraControllerParams } from './useDiscoverCameraController';

const CAMERA_RESULT = {
  schoolFocusTick: 0,
  schoolMarkerFocusTick: 0,
  schoolFocusLat: undefined,
  schoolFocusLon: undefined,
  agriGroupFocusBounds: null,
  canonicalNodeFitCount: 0,
  isColdNavigate: false,
};

const SCOPE_NAMESPACES = { regionKeys: new Set<string>(), groupSlugs: new Set<string>() };

function baseParams(
  overrides: Partial<UseDiscoverCameraControllerParams> = {},
): UseDiscoverCameraControllerParams {
  return {
    showAreasNavigationJourney: false,
    areasNavigationJourney: { node: null, children: [], isLoading: false, error: null, selectNode: vi.fn() } as never,
    mapBbox: null,
    publishRecenterCameraIntent: vi.fn(),
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
    scopeNamespaces: SCOPE_NAMESPACES,
    regionScopedGroupsData: undefined,
    isLoadingRegionScopedGroups: false,
    viewport: null,
    areaKey: null,
    discoverAreasData: undefined,
    ...overrides,
  };
}

/**
 * Issue #2142 (correction pass) — assertions inherited verbatim from the
 * deleted useDiscoverMapPresentationController.test.ts (recenter affordance +
 * scopeNamespaces threading + composed-output), plus new coverage for the
 * three camera-adjacent identity stabilisers this controller now owns.
 */
describe('useDiscoverCameraController (#1823/#2143 sole owner)', () => {
  beforeEach(() => {
    mockUseDiscoverCameraOrchestration.mockReset().mockReturnValue(CAMERA_RESULT);
    mockCheckIsSelectedNodeOutOfView.mockReset().mockReturnValue(false);
    mockGetCameraIntentForRecenter.mockReset().mockReturnValue(null);
  });

  it('isSelectedNodeOutOfView is false when showAreasNavigationJourney is false, without calling the predicate', () => {
    const { result } = renderHook(() => useDiscoverCameraController(baseParams()));
    expect(result.current.isSelectedNodeOutOfView).toBe(false);
    expect(mockCheckIsSelectedNodeOutOfView).not.toHaveBeenCalled();
  });

  it('isSelectedNodeOutOfView delegates to checkIsSelectedNodeOutOfView(node, mapBbox) when the journey is showing', () => {
    mockCheckIsSelectedNodeOutOfView.mockReturnValue(true);
    const node = { nodeKey: 'n:1' } as never;
    const { result } = renderHook(() =>
      useDiscoverCameraController(
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

  // Issue #2203 follow-up (review Finding 2, PR #2211) — this controller is
  // deliberately journey-agnostic: it only ever sees the flattened
  // `showAreasNavigationJourney` boolean, not `nav.journey` itself. The
  // journey-specific gating (school-first/agri-first at the NODE level, both
  // proven true in useDiscoverNavigationController.test.ts) all funnels
  // through that SAME boolean before reaching this controller, so the
  // delegation test above already exercises the code path both journeys hit.
  // This test pins that reachability explicitly for agri-first (mirroring
  // school-first, which reaches the identical `showAreasNavigationJourney:
  // true` state via `isSchoolsNavNodeLevel`) so Recenter's agri-first
  // coverage can't silently regress without a dedicated failure.
  it('isSelectedNodeOutOfView / Recenter is reachable for agri-first at the NODE level (mirrors school-first via the same showAreasNavigationJourney flattening)', () => {
    mockCheckIsSelectedNodeOutOfView.mockReturnValue(true);
    mockGetCameraIntentForRecenter.mockReturnValue({
      cameraBounds: [[1, 2], [3, 4]],
      centre: [5, 6],
      kind: 'leaf',
    });
    // showAreasNavigationJourney: true is exactly what
    // useDiscoverNavigationController computes for
    // `journey === 'agri-first' && !selectedLocality` (isAgriNavNodeLevel).
    const node = { nodeKey: 'agri:n:1' } as never;
    const publishRecenterCameraIntent = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverCameraController(
        baseParams({
          showAreasNavigationJourney: true,
          areasNavigationJourney: { node, children: [], isLoading: false, error: null, selectNode: vi.fn() } as never,
          mapBbox: [1, 2, 3, 4],
          publishRecenterCameraIntent,
        }),
      ),
    );
    expect(result.current.isSelectedNodeOutOfView).toBe(true);
    act(() => result.current.handleRecenterOnSelectedNode());
    expect(publishRecenterCameraIntent).toHaveBeenCalledWith([[1, 2], [3, 4]], [5, 6], 'leaf');
  });

  it('handleRecenterOnSelectedNode is a no-op when getCameraIntentForRecenter returns null', () => {
    const publishRecenterCameraIntent = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverCameraController(baseParams({ publishRecenterCameraIntent })),
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
      useDiscoverCameraController(baseParams({ publishRecenterCameraIntent })),
    );
    act(() => result.current.handleRecenterOnSelectedNode());
    expect(publishRecenterCameraIntent).toHaveBeenCalledWith([[1, 2], [3, 4]], [5, 6], 'leaf');
  });

  it('threads the SAME scopeNamespaces reference into useDiscoverCameraOrchestration (single source of truth, issue #1910)', () => {
    renderHook(() => useDiscoverCameraController(baseParams({ scopeNamespaces: SCOPE_NAMESPACES })));
    expect(mockUseDiscoverCameraOrchestration).toHaveBeenCalledWith(
      expect.objectContaining({ scopeNamespaces: SCOPE_NAMESPACES }),
    );
  });

  it('re-exports canonicalNodeFitCount/isColdNavigate UNRENAMED (window.__debug Playwright contract, #2143)', () => {
    mockUseDiscoverCameraOrchestration.mockReturnValue({ ...CAMERA_RESULT, canonicalNodeFitCount: 3, isColdNavigate: true });
    const { result } = renderHook(() => useDiscoverCameraController(baseParams()));
    expect(result.current.canonicalNodeFitCount).toBe(3);
    expect(result.current.isColdNavigate).toBe(true);
  });

  it('memoizedInitialCenter is undefined with no viewport and [lat, lon] with one, keeping a stable identity across re-renders', () => {
    const viewport = { lat: 12.9, lon: 77.6, zoom: 13 } as never;
    const { result, rerender } = renderHook(
      (props: UseDiscoverCameraControllerParams) => useDiscoverCameraController(props),
      { initialProps: baseParams({ viewport }) },
    );
    expect(result.current.memoizedInitialCenter).toEqual([12.9, 77.6]);
    const first = result.current.memoizedInitialCenter;
    rerender(baseParams({ viewport }));
    expect(result.current.memoizedInitialCenter).toBe(first);
    rerender(baseParams({ viewport: null }));
    expect(result.current.memoizedInitialCenter).toBeUndefined();
  });

  it('areaRestoreArea resolves the URL areaKey against discoverAreasData, else null', () => {
    const area = { areaKey: 'IN|KA|Bangalore|Indiranagar' };
    const discoverAreasData = { areas: [area] } as never;
    expect(
      renderHook(() => useDiscoverCameraController(baseParams({ areaKey: null, discoverAreasData })))
        .result.current.areaRestoreArea,
    ).toBeNull();
    expect(
      renderHook(() =>
        useDiscoverCameraController(baseParams({ areaKey: 'IN|KA|Bangalore|Indiranagar', discoverAreasData })),
      ).result.current.areaRestoreArea,
    ).toBe(area);
    expect(
      renderHook(() => useDiscoverCameraController(baseParams({ areaKey: 'missing', discoverAreasData })))
        .result.current.areaRestoreArea,
    ).toBeNull();
  });

  it('schoolMarkerPositions drops null coords and keeps a stable identity while schoolListings is unchanged (#1547 ITEM 6)', () => {
    const schoolListings = [
      { lat: 1, lon: 2 },
      { lat: null, lon: 4 },
      { lat: 5, lon: null },
    ] as never;
    const { result, rerender } = renderHook(
      (props: UseDiscoverCameraControllerParams) => useDiscoverCameraController(props),
      { initialProps: baseParams({ schoolListings }) },
    );
    expect(result.current.schoolMarkerPositions).toEqual([{ lat: 1, lon: 2 }]);
    const first = result.current.schoolMarkerPositions;
    rerender(baseParams({ schoolListings }));
    expect(result.current.schoolMarkerPositions).toBe(first);
  });
});
