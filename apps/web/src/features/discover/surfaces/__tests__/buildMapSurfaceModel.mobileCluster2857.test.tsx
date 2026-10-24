/**
 * Issue #2857 (FU-LOWER-A) — L91 trim replacement (`e2e/discover-schools-mobile-cluster-2124.spec.ts`).
 *
 * Proves:
 *   - G3-M11 (`e2e/discover-schools-mobile-cluster-2124.spec.ts` lines 257-260, G3-N9):
 *     `buildMapSurfaceModel.tsx:895-900` forwards `activeAreasNavigationJourney` (from
 *     `useDiscoverOverviewNavigationController`) into `view.overlays.mobileCluster.journey`
 *     with `eligibilityJourney: 'schools'` when `navJourney === 'school-first'`, and when
 *     rendered into `MobileClusterSheet`, clicking an `AREA` member row invokes
 *     `activeAreasNavigationJourney.selectNode(nodeKey)` -> `handleAreaSelect(manipalArea)`
 *     (canonical `areaKey` routing), paired in the same `it` with the `area-first` control
 *     (`eligibilityJourney: 'areas'`, `actions.goToNode('a:manipal')`).
 *   - 230-233 (`e2e/discover-schools-mobile-cluster-2124.spec.ts` lines 230-233, G3-N10):
 *     when `mobileMapOpen === true`, `buildMapSurfaceModel` mounts the mobile Map overlay
 *     (`mobile-map-close-list-button` in `view.mobile.mobileListButton`, wiring `setMobileView('LIST')`)
 *     and sets `view.overlays.mobileCluster.visible = true` so `mobile-cluster-sheet` mounts,
 *     paired with `mobileMapOpen === false` negative control.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, renderHook, screen, fireEvent } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));
import {
  buildMapSurfaceModel,
  type BuildMapSurfaceViewParams,
} from '../buildMapSurfaceModel';
import { useDiscoverOverviewNavigationController } from '@/features/discover/controllers/useDiscoverOverviewNavigationController';
import { MobileClusterSheet } from '@/features/discover/views/mobile/MobileClusterSheet';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';

const MANIPAL_AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  lat: 13.3525,
  lon: 74.7868,
  listingCount: 9,
  schoolCount: 4,
  medianPricePerSqft: 5200,
};

const KUNJIBETTU_AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Kunjibettu',
  areaLabel: 'Kunjibettu',
  lat: 13.345,
  lon: 74.77,
  listingCount: 5,
  schoolCount: 2,
  medianPricePerSqft: 4800,
};

function makeBaseNavigationJourney(
  selectNode = vi.fn(),
): UseAreasNavigationJourneyResult {
  const rawChildren = [
    {
      nodeKey: 'a:manipal',
      displayLabel: 'Manipal',
      nodeType: 'AREA',
      areaKey: 'IN|KA|Udupi|Manipal',
      lat: 13.3525,
      lon: 74.7868,
    },
    {
      nodeKey: 'a:kunjibettu',
      displayLabel: 'Kunjibettu',
      nodeType: 'AREA',
      areaKey: 'IN|KA|Udupi|Kunjibettu',
      lat: 13.345,
      lon: 74.77,
    },
  ];
  return {
    node: {
      nodeKey: 'd:udupi:east',
      displayLabel: 'East of Udupi',
      nodeType: 'DIRECTION',
      children: rawChildren,
    },
    children: [
      {
        nodeKey: 'a:manipal',
        displayLabel: 'Manipal',
        nodeType: 'AREA',
        listingCount: 9,
        schoolCount: 4,
        matchingAreaCount: 1,
      },
      {
        nodeKey: 'a:kunjibettu',
        displayLabel: 'Kunjibettu',
        nodeType: 'AREA',
        listingCount: 5,
        schoolCount: 2,
        matchingAreaCount: 1,
      },
    ],
    nodeCount: {
      listingCount: 14,
      matchingAreaCount: 2,
      childCounts: [
        { nodeKey: 'a:manipal', listingCount: 9, schoolCount: 4, matchingAreaCount: 1 },
        { nodeKey: 'a:kunjibettu', listingCount: 5, schoolCount: 2, matchingAreaCount: 1 },
      ],
    },
    selectNode,
  } as unknown as UseAreasNavigationJourneyResult;
}

function makeSurfaceParams(
  overrides: Partial<BuildMapSurfaceViewParams> = {},
): BuildMapSurfaceViewParams {
  const baseJourney = makeBaseNavigationJourney();
  return {
    mobileMapOpen: true,
    setMobileView: vi.fn(),
    isGroupResultsState: false,
    isNodeListingsState: false,
    isMarkerPopoverEligible: false,
    activeAreasNavigationJourney: baseJourney,
    navJourney: 'school-first',
    mapContainerRef: { current: null },
    intent: 'buy',
    pageContextController: {
      isAuthenticated: false,
      isAgriJourney: false,
    },
    pageStateController: {
      showLoader: false,
      filters: {},
      selectedSchool: null,
      panToArea: null,
      mapZoom: 12,
      mapReady: true,
      city: 'udupi',
      resolvedPanelContent: 'school-browse',
      effectiveSelectedArea: null,
      isReplaceScopeConfirmOpen: false,
      polygonDraftPhase: 'idle',
      polygonDraftBlock: null,
      drawVertexCount: 0,
      startDrawNonce: 0,
      cancelDrawNonce: 0,
      undoVertexNonce: 0,
    },
    mapDataController: {
      error: null,
      activeFocusBounds: null,
      cityCenter: [13.3409, 74.7421],
      cityZoom: 12,
      cameraIntent: null,
      pendingRemountCameraIntentSeqRef: { current: 0 },
      areaMarkerListings: [],
      schoolRadiusHasMore: false,
      markersTruncated: false,
      markersReturnedElements: 0,
      markersTotalFilteredElements: 0,
      isLoading: false,
      isErrorDiscoverAreas: false,
    },
    areaGroupsController: {
      focusedGroupAreas: null,
      focusedGroup: null,
    },
    badgeController: {
      announcedBadgeText: '',
      discoverBadge: { visible: false, count: null, areaLabel: null },
      areaResultSummaryText: null,
      groupSelectedBadgeCopy: null,
      fallbackBadgeCopy: null,
      schoolRadiusActive: false,
      schoolRadiusPillNoun: 'homes',
      cityTotal: 14,
      hasActiveAnonFilter: false,
    },
    journeyChromeController: {
      isLandingState: false,
      showSchoolMarkers: false,
      showSchoolBreadcrumb: true,
      schoolRadiusOverlay: undefined,
      isSelectedGroupState: false,
      isAreaFirstSelectedAreaState: false,
    },
    markerPopoverController: {
      currentMapMarkerListings: [],
      markerPopoverStepper: undefined,
    },
    navigationController: {
      hoveredNavigationNodeKey: null,
      focusedClusterMemberAreaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Kunjibettu'],
    },
    agriController: {
      selectedRegion: null,
      selectedMaxKm: null,
      filteredAgriListings: [],
      agriDestinationMarkers: [],
      selectedLocality: null,
      selectedLocalityName: null,
      selectedLocalityCount: 0,
      corridorTotalCount: 0,
    },
    schoolController: {
      schoolZoneLabels: [],
      schools: [],
      schoolsQuery: {} as never,
      schoolFirstAreaSchoolCount: null,
      schoolFirstZoneSchoolCount: null,
      schoolFirstLandingSchoolCount: null,
      schoolListings: [],
      journeyView: {} as never,
    },
    interactionController: {
      hoveredListingId: null,
      hoveredAreaKeyForMap: null,
    },
    cameraController: {
      memoizedInitialCenter: [13.3409, 74.7421],
      schoolMarkerFocusTick: 0,
      schoolMarkerPositions: [],
      areaRestoreArea: null,
      agriGroupFocusBounds: null,
      isColdNavigate: false,
      isSelectedNodeOutOfView: false,
      schoolFocusTick: 0,
      selectedSchoolLat: undefined,
      selectedSchoolLon: undefined,
    },
    mapLayerController: {
      overviewAreas: [MANIPAL_AREA, KUNJIBETTU_AREA],
      areaSearchMatchKeys: null,
      resolvedRegionLabel: null,
      regionOverviewMarkerKind: 'areas',
      isRegionOverview: false,
      regionOverviewShortLabel: null,
      areaJourneySegments: [],
      schoolJourneySegments: [],
      isAreaFirstCityLanding: false,
    },
    regionGuideController: {
      regionSelectNonce: 0,
      prefersReducedMotion: false,
      regionGuideVisible: false,
      regionGuideRingActive: false,
    },
    mobilePresentationController: {
      bottomOcclusionPx: 0,
      previewOcclusionPx: 0,
      isPreviewSheetOpen: false,
      selectedListingPreview: null,
    },
    viewportTrackerController: {
      handleBoundsChange: vi.fn(),
    },
    viewportSearchController: {
      isDirty: false,
      isEligible: false,
    },
    markerController: {
      markerPixelPos: null,
      selectedMarkerListing: null,
      handlePopoverDismiss: vi.fn(),
      handleSelectMarkerListing: vi.fn(),
      handleMarkerClickWithPosition: vi.fn(),
    },
    ...overrides,
  } as unknown as BuildMapSurfaceViewParams;
}

describe('buildMapSurfaceModel — #2857 L91 G3-M11 mobileCluster journey forwarding & overlay mount', () => {
  it('G3-M11 (G3-N9): forwards activeAreasNavigationJourney into view.overlays.mobileCluster.journey so clicking a school-first AREA member in MobileClusterSheet routes via handleAreaSelect (areaKey), paired with area-first goToNode control', () => {
    const handleAreaSelect = vi.fn();
    const goToNode = vi.fn();
    const goToNodeAndClearSchoolSelection = vi.fn();
    const enterSchoolsJourney = vi.fn();
    const actions = {
      goToNode,
      goToNodeAndClearSchoolSelection,
      enterSchoolsJourney,
    } as unknown as DiscoverUrlActions;

    const baseNavigationJourney = makeBaseNavigationJourney();

    // 1. Area-first control: activeAreasNavigationJourney in area-first calls actions.goToNode('a:manipal')
    const { result: areaFirstNav } = renderHook(() =>
      useDiscoverOverviewNavigationController({
        isTopGroupedAgri: false,
        corridorGroups: [],
        scopeNamespaces: { regionKeys: new Set(), groupSlugs: new Set(), groupNameSlugs: new Map() },
        mapLayerKind: 'area-markers',
        armRegionSelect: vi.fn(),
        handleAreaClick: vi.fn(),
        journey: 'area-first',
        areasNavigationJourney: baseNavigationJourney,
        discoverAreas: [MANIPAL_AREA, KUNJIBETTU_AREA],
        handleAreaSelect,
        actions,
      }),
    );

    const areaFirstView = buildMapSurfaceModel(
      makeSurfaceParams({
        navJourney: 'area-first',
        activeAreasNavigationJourney: areaFirstNav.current.activeAreasNavigationJourney,
      }),
    );
    expect(areaFirstView.overlays.mobileCluster.journey).toBe(
      areaFirstNav.current.activeAreasNavigationJourney,
    );
    expect(areaFirstView.overlays.mobileCluster.eligibilityJourney).toBe('areas');

    const areaFirstSheet = render(
      <MobileClusterSheet
        {...areaFirstView.overlays.mobileCluster}
        onClusterFocusChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('mobile-cluster-sheet-member-a:manipal'));
    expect(goToNode).toHaveBeenCalledTimes(1);
    expect(goToNode).toHaveBeenCalledWith('a:manipal');
    expect(handleAreaSelect).not.toHaveBeenCalled();
    areaFirstSheet.unmount();
    goToNode.mockClear();

    // 2. School-first G3-M11 assertion: activeAreasNavigationJourney in school-first intercepts AREA member
    //    and routes via handleAreaSelect(MANIPAL_AREA) (which writes areaKey='IN|KA|Udupi|Manipal').
    const { result: schoolFirstNav } = renderHook(() =>
      useDiscoverOverviewNavigationController({
        isTopGroupedAgri: false,
        corridorGroups: [],
        scopeNamespaces: { regionKeys: new Set(), groupSlugs: new Set(), groupNameSlugs: new Map() },
        mapLayerKind: 'area-markers',
        armRegionSelect: vi.fn(),
        handleAreaClick: vi.fn(),
        journey: 'school-first',
        areasNavigationJourney: baseNavigationJourney,
        discoverAreas: [MANIPAL_AREA, KUNJIBETTU_AREA],
        handleAreaSelect,
        actions,
      }),
    );

    const schoolFirstView = buildMapSurfaceModel(
      makeSurfaceParams({
        navJourney: 'school-first',
        activeAreasNavigationJourney: schoolFirstNav.current.activeAreasNavigationJourney,
      }),
    );
    expect(schoolFirstView.overlays.mobileCluster.journey).toBe(
      schoolFirstNav.current.activeAreasNavigationJourney,
    );
    expect(schoolFirstView.overlays.mobileCluster.eligibilityJourney).toBe('schools');

    const onClusterFocusChange = vi.fn();
    render(
      <MobileClusterSheet
        {...schoolFirstView.overlays.mobileCluster}
        onClusterFocusChange={onClusterFocusChange}
      />,
    );

    const manipalRow = screen.getByTestId('mobile-cluster-sheet-member-a:manipal');
    expect(manipalRow).toHaveTextContent('4 schools');
    fireEvent.click(manipalRow);

    expect(handleAreaSelect).toHaveBeenCalledTimes(1);
    expect(handleAreaSelect).toHaveBeenCalledWith(MANIPAL_AREA);
    expect(goToNode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('mobile-cluster-sheet-clear'));
    expect(onClusterFocusChange).toHaveBeenCalledWith(null);
  });

  it('230-233 (G3-N10): mounts mobile Map overlay (mobile-map-close-list-button) and mobile-cluster-sheet when mobileMapOpen is true, and suppresses both when mobileMapOpen is false', () => {
    const setMobileView = vi.fn();

    // Negative control: mobileMapOpen = false -> neither mobileListButton nor mobileCluster.visible is active
    const closedView = buildMapSurfaceModel(
      makeSurfaceParams({
        mobileMapOpen: false,
        setMobileView,
      }),
    );
    expect(closedView.mobile.mobileListButton).toBeNull();
    expect(closedView.overlays.mobileCluster.visible).toBe(false);

    const closedRender = render(
      <div>
        {closedView.mobile.mobileListButton}
        {closedView.overlays.mobileCluster.visible && (
          <MobileClusterSheet
            {...closedView.overlays.mobileCluster}
            onClusterFocusChange={vi.fn()}
          />
        )}
      </div>,
    );
    expect(screen.queryByTestId('mobile-map-close-list-button')).toBeNull();
    expect(screen.queryByTestId('mobile-cluster-sheet')).toBeNull();
    closedRender.unmount();

    // Positive assertion: mobileMapOpen = true -> mounts mobile-map-close-list-button and mobile-cluster-sheet
    const openView = buildMapSurfaceModel(
      makeSurfaceParams({
        mobileMapOpen: true,
        setMobileView,
      }),
    );
    expect(openView.mobile.mobileListButton).not.toBeNull();
    expect(openView.overlays.mobileCluster.visible).toBe(true);

    render(
      <div>
        {openView.mobile.mobileListButton}
        {openView.overlays.mobileCluster.visible && (
          <MobileClusterSheet
            {...openView.overlays.mobileCluster}
            onClusterFocusChange={vi.fn()}
          />
        )}
      </div>,
    );
    const listBtn = screen.getByTestId('mobile-map-close-list-button');
    expect(listBtn).toBeInTheDocument();
    expect(screen.getByTestId('mobile-cluster-sheet')).toBeInTheDocument();

    fireEvent.click(listBtn);
    expect(setMobileView).toHaveBeenCalledWith('LIST');
  });
});
