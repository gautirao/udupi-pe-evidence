/**
 * Issue #2858 (`trim_rows` batch) — Lower-level Vitest seam coverage for the
 * 8 mixed specs listed under `### Trim rows` in issue #2858:
 *   - L107: e2e/discover/issue-1762-listing-density-clustering.spec.ts (all non-browser seams already in PropertyMap.clusterTapFit.test.tsx / zoomPolicy.issue1762.test.ts)
 *   - L108: e2e/discover/issue-1823-camera-fit-policy.spec.ts (T3 bounded-browse no-refit, T5 group-focus unguarded fit, T6 mobile proactive bottomOcclusionPx)
 *   - L117: e2e/discover/issue-1956-pr4-listing-peek-camera-restore.spec.ts (AC4.4/AC4.5 deep-link popover hydration, close clears listing= without refitting node=, View details navigates to /listing/:id)
 *   - L122: e2e/discover/issue-1956-pr5-mobile-cluster-sheet.spec.ts (S3/S4 clusterFocus survival across mobile MAP -> LIST -> MAP toggle and "Show all areas" clear without mutating node=)
 *   - L123: e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts (AC5.8 single-AREA node= -> deriveAreaPointFromNode -> resolveEffectiveSelectedArea -> useDiscoverMapDataController -> useDiscoverMapData -> useDiscoverCityListings -> apiGet -> fetch wire seam for anon vs auth)
 *   - L137: e2e/discover/issue-2089-pan-preserves-listing-preview.spec.ts (DiscoverMapCanvas pan-drag >10px & [data-listing-id] click preserve preview vs stationary tap <=10px & MobileListingPreviewSheet close dismiss)
 *   - L158: e2e/discover/journey-switch-overlay-cleanup-1940.spec.ts (AC1/AC2/AC5 journey switch clears selectedSchool + school radius filters -> unmounts school-radius-more-hint & clears showSchoolMarkers, plus AC3 agri-first control)
 *   - L172: e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts (R5 area-cluster-marker click keeps areaKey=null & groupId intact and highlights cluster members; R6 representative area-marker click drills into areaKey and populates areaResultSummaryText)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { createRef, useState, type RefObject } from 'react';
import { render, renderHook, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';

// ─── Hoisted Leaflet & Discover mocks ─────────────────────────────────────────

type DivIconOpts = { html: string; className?: string; iconSize?: unknown; iconAnchor?: unknown };
const capturedDivIconCalls = vi.hoisted(() => [] as DivIconOpts[]);

type CapturedMarker = {
  handlers: Record<string, (...args: unknown[]) => void>;
  setIcon: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  element: HTMLElement;
  html: string;
};
const capturedMarkers = vi.hoisted(() => [] as CapturedMarker[]);

function projectLatLon(lat: number, lon: number): { x: number; y: number } {
  return { x: (lon - 74.5) * 10000, y: (13.5 - lat) * 10000 };
}

function boundsFromExpression(expr: [number, number][]) {
  const lats = expr.map((p) => p[0]);
  const lons = expr.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    getSouthWest: () => ({ lat: minLat, lng: minLon }),
    getNorthEast: () => ({ lat: maxLat, lng: maxLon }),
    getCenter: () => ({ lat: (minLat + maxLat) / 2, lng: (minLon + maxLon) / 2 }),
  };
}

const paneRegistry = vi.hoisted(() => new Map<string, HTMLElement>());
const capturedMapHandlers = vi.hoisted(() => ({} as Record<string, (...args: unknown[]) => void>));

const mapStub = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  setZoom: vi.fn(),
  setView: vi.fn(),
  panTo: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 13.0, lng: 77.6 })),
  getZoom: vi.fn(() => 11),
  getBoundsZoom: vi.fn(() => 13),
  once: vi.fn(),
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    capturedMapHandlers[event] = cb;
  }),
  off: vi.fn(),
  getSize: vi.fn(() => ({ x: 1200, y: 800 })),
  latLngToContainerPoint: vi.fn(([lat, lon]: [number, number]) => projectLatLon(lat, lon)),
  containerPointToLatLng: vi.fn((pt: { x: number; y: number }) => ({
    lat: 13.5 - pt.y / 10000,
    lng: 74.5 + pt.x / 10000,
  })),
  getPane: vi.fn((name: string) => paneRegistry.get(name)),
  createPane: vi.fn((name: string) => {
    const el = document.createElement('div');
    paneRegistry.set(name, el);
    return el;
  }),
}));

vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: vi.fn(),
      },
    },
    divIcon: vi.fn((opts: DivIconOpts) => {
      capturedDivIconCalls.push(opts);
      return { options: opts };
    }),
    point: vi.fn((x: number, y: number) => ({ x, y })),
    latLngBounds: vi.fn((expr: [number, number][]) => boundsFromExpression(expr)),
    marker: vi.fn((_latlng: [number, number], options?: { icon?: { options?: DivIconOpts } }) => {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const element = document.createElement('div');
      const html = options?.icon?.options?.html ?? '';
      if (html) {
        element.innerHTML = html;
      }
      element.addEventListener('click', () => {
        handlers.click?.();
      });
      const instance: Record<string, unknown> = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers[event] = cb;
          return instance;
        }),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        setIcon: vi.fn(),
        setLatLng: vi.fn(),
        off: vi.fn(),
        getElement: vi.fn(() => element),
      };
      capturedMarkers.push({
        handlers,
        setIcon: instance.setIcon as ReturnType<typeof vi.fn>,
        remove: instance.remove as ReturnType<typeof vi.fn>,
        element,
        html,
      });
      return instance;
    }),
  },
}));

vi.mock('react-leaflet', () => ({
  useMap: () => mapStub,
}));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: () => ({ data: undefined }),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolById: () => ({ data: undefined, isLoading: false, error: null }),
}));

const { BASE_URL_STATE, BASE_NAV, URL_ACTIONS, mockUseDiscoverShell } = vi.hoisted(() => {
  const urlState = {
    city: 'bangalore',
    areaKey: null as string | null,
    viewport: null as { lat: number; lon: number; zoom: number } | null,
    filters: {},
    schoolId: null as string | null,
    radiusKm: null as number | null,
    q: '',
    journey: 'area-first' as string | null,
    groupId: null as string | null,
    selectedGroup: null as string | null,
    intent: 'buy' as const,
    scope: null as string | null,
  };
  const nav = {
    city: urlState.city,
    areaKey: urlState.areaKey,
    filters: urlState.filters,
    schoolId: urlState.schoolId,
    radiusKm: urlState.radiusKm,
    q: urlState.q,
    journey: urlState.journey,
    groupId: urlState.groupId,
    selectedGroup: urlState.selectedGroup,
    intent: urlState.intent,
    scope: urlState.scope,
  };
  const urlActions = {
    changeCity: vi.fn(),
    setCity: vi.fn(),
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    reportViewport: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSchoolParams: vi.fn(),
    clearSchoolSelection: vi.fn(),
    clearAreaSelection: vi.fn(),
    setSearchQuery: vi.fn(),
    clearAllFiltersAndSearch: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    enterSchoolPicking: vi.fn(),
    clearSchoolPicking: vi.fn(),
    backToSchoolPicking: vi.fn(),
    enterGroupResults: vi.fn(),
    clearGroupResults: vi.fn(),
    selectRegionalGroup: vi.fn(),
    setRegion: vi.fn(),
    setScope: vi.fn(),
    setRegionWithMaxKm: vi.fn(),
    setMaxKm: vi.fn(),
    clearRegionAndMaxKm: vi.fn(),
    goToNode: vi.fn(),
    goToAncestorNode: vi.fn(),
    clearNode: vi.fn(),
    enterAreasJourney: vi.fn(),
    enterSchoolsJourney: vi.fn(),
    goToNodeAndClearSchoolSelection: vi.fn(),
    buildNodeHref: vi.fn(),
    setSelectedListing: vi.fn(),
    clearSelectedListing: vi.fn(),
    setLocality: vi.fn(),
    clearLocality: vi.fn(),
    clearAgriFilters: vi.fn(),
    setIntent: vi.fn(),
    setSchoolJourney: vi.fn(),
  };
  const shellFn = vi.fn(() => ({
    mobileView: 'LIST' as const,
    setMobileView: vi.fn(),
    isMobileShell: false,
    isAreaSetDraftOpen: false,
    openAreaSetDraft: vi.fn(),
    closeAreaSetDraft: vi.fn(),
    fitAreaSet: vi.fn(),
    focusAreaSetMember: vi.fn(),
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: vi.fn(() => null),
    setAreaSetCameraRestoreRequest: vi.fn(),
    canonicalScopeLabel: null,
    setCanonicalScopeLabel: vi.fn(),
  }));
  return { BASE_URL_STATE: urlState, BASE_NAV: nav, URL_ACTIONS: urlActions, mockUseDiscoverShell: shellFn };
});

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => BASE_NAV,
  useDiscoverViewport: () => BASE_URL_STATE.viewport,
  useDiscoverActions: () => URL_ACTIONS,
  useDiscoverShell: mockUseDiscoverShell,
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => (
    <div data-testid="property-map-mock">
      <div data-testid="mock-listing-marker" data-listing-id="listing-2089">
        ₹85 L
      </div>
    </div>
  ),
}));

// ─── Real production imports under test ───────────────────────────────────────

import {
  useDiscoverCameraOrchestration,
  type UseDiscoverCameraOrchestrationParams,
} from '@/features/discover/state/useDiscoverCameraOrchestration';
import { useDiscoverMobilePresentationController } from '@/features/discover/controllers/useDiscoverMobilePresentationController';
import { useDiscoverMarkerPopoverController } from '@/features/discover/controllers/useDiscoverMarkerPopoverController';
import { useMarkerSelection } from '@/features/discover/state/useMarkerSelection';
import { DiscoverMapMarkerPopover } from '@/components/discover/DiscoverMapMarkerPopover';
import {
  buildMapSurfaceModel,
  buildMapSurfaceCommands,
} from '@/features/discover/surfaces/buildMapSurfaceModel';
import { MobileClusterSheet } from '@/features/discover/views/mobile/MobileClusterSheet';
import { MobileListingPreviewSheet } from '@/features/discover/views/mobile/MobileListingPreviewSheet';
import { deriveAreaPointFromNode } from '@/features/discover/navigation/nodeAreaPoint';
import { resolveEffectiveSelectedArea } from '@/features/discover/selectors/effectiveArea';
import { useDiscoverMapDataController } from '@/features/discover/controllers/useDiscoverMapDataController';
import { DiscoverMapCanvas, type DiscoverMapCanvasProps } from '@/features/discover/views/DiscoverMapCanvas';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import { useDiscoverJourneyTransitions } from '@/features/discover/state/useDiscoverJourneyTransitions';
import { useDiscoverBadgeController } from '@/features/discover/controllers/useDiscoverBadgeController';
import { useDiscoverJourneyChromeController } from '@/features/discover/controllers/useDiscoverJourneyChromeController';
import { DiscoverMapStatusHints } from '@/components/discover/DiscoverMapStatusHints';
import { AreaMarkerLayer, type AreaPoint, type AreaMarkerClusterInfo } from '@/components/map/AreaMarkerLayer';
import { useDiscoverInteractionController } from '@/features/discover/controllers/useDiscoverInteractionController';
import { useDiscoverOverviewNavigationController } from '@/features/discover/controllers/useDiscoverOverviewNavigationController';
import { MOBILE_LISTING_PREVIEW_OCCLUSION_PX } from '@/shared/map/zoomPolicy';
import type { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import type { DiscoverBadgeResult } from '@/features/discover/presentation/discoverBadge';

// ─── Shared helpers & fixtures ────────────────────────────────────────────────

function makeUrlState(overrides: Partial<DiscoverUrlState> = {}): DiscoverUrlState {
  return {
    city: 'bangalore',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'area-first',
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    scope: null,
    historyAction: 'POP',
    ...overrides,
  };
}

function makeCameraParams(
  overrides: Partial<UseDiscoverCameraOrchestrationParams> = {},
): UseDiscoverCameraOrchestrationParams {
  return {
    urlState: makeUrlState(),
    selectedSchool: null,
    setPanToArea: vi.fn(),
    isLoadingAreaListings: false,
    discoverAreas: [],
    areasLoading: false,
    areaGroupsData: { city: 'bangalore', groups: [] },
    isLoadingAreaGroups: false,
    agriMapListingsData: undefined,
    cityCenter: [12.9716, 77.5946],
    focusedGroup: null,
    summaryRegions: [],
    selectedRegion: null,
    selectedMaxKm: null,
    schoolListings: [],
    ...overrides,
  };
}

function makeUrlActions(overrides: Partial<DiscoverUrlActions> = {}): DiscoverUrlActions {
  return {
    ...URL_ACTIONS,
    ...overrides,
  } as unknown as DiscoverUrlActions;
}

const SAMPLE_LISTING: PropertyListingWithImages = {
  id: 'listing-1',
  title: '3BHK in Basaveshwara Nagar',
  property_type: 'apartment',
  listing_purpose: 'sale',
  price: 12500000,
  bedrooms: 3,
  bathrooms: 3,
  area_sqft: 1650,
  locality: 'Basaveshwara Nagar',
  city: 'bangalore',
  latitude: 12.991,
  longitude: 77.541,
  verification_status: 'VERIFIED',
  status: 'LIVE',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  user_id: 'owner-1',
  images: [],
} as unknown as PropertyListingWithImages;

const SAMPLE_AREA_POINT: AreaPoint = {
  areaKey: 'IN|KA|Bengaluru|Basaveshwara Nagar',
  areaLabel: 'Basaveshwara Nagar',
  geo_center_lat: 12.99,
  geo_center_lon: 77.54,
  bbox: [
    [12.98, 77.53],
    [13.0, 77.55],
  ],
  listingCount: 14,
};

// ─── L108: e2e/discover/issue-1823-camera-fit-policy.spec.ts (T3, T5, T6) ─────

describe('L108 (issue-1823-camera-fit-policy): T3 bounded-browse no-refit, T5 group-focus unguarded fit, T6 mobile proactive bottomOcclusionPx', () => {
  it('T3: entering Bounded Browse (nodeListings=true) on the already-fitted canonical navigationNodeKey reuses the existing fit and does not call setPanToArea a second time', () => {
    const setPanToArea = vi.fn();
    const clusterBounds = {
      minLat: 13.01,
      minLon: 77.58,
      maxLat: 13.09,
      maxLon: 77.66,
      centreLat: 13.05,
      centreLon: 77.62,
    };

    const { result, rerender } = renderHook(
      (props: UseDiscoverCameraOrchestrationParams) => useDiscoverCameraOrchestration(props),
      {
        initialProps: makeCameraParams({
          setPanToArea,
          urlState: makeUrlState({
            journey: 'area-first',
            node: 'c:101',
            nodeListings: false,
            historyAction: 'PUSH',
          }),
          navigationNodeKey: 'c:101',
          navigationNodeBounds: clusterBounds,
        }),
      },
    );

    expect(setPanToArea).toHaveBeenCalledTimes(1);
    expect(setPanToArea.mock.calls[0][0]).toMatchObject({
      areaKey: 'c:101',
      reason: 'canonicalNode',
    });
    expect(result.current.canonicalNodeFitCount).toBe(1);

    // User clicks "Browse properties" on the same node: nodeListings flips to true,
    // viewport is persisted in URL, and navigationNodeKey stays 'c:101'.
    rerender(
      makeCameraParams({
        setPanToArea,
        urlState: makeUrlState({
          journey: 'area-first',
          node: 'c:101',
          nodeListings: true,
          historyAction: 'PUSH',
          viewport: { lat: 13.05, lon: 77.62, zoom: 13 },
        }),
        navigationNodeKey: 'c:101',
        navigationNodeBounds: clusterBounds,
      }),
    );

    expect(setPanToArea).toHaveBeenCalledTimes(1);
    expect(result.current.canonicalNodeFitCount).toBe(1);
  });

  it('T5: group-focus (groupId) uses unguarded publishPanToArea and fits member bounds even on an in-app POP with a persisted viewport, whereas canonical-node guardedSetPanToArea suppresses refit on POP restore', () => {
    const setPanToArea = vi.fn();
    const groupAreas: AreaPoint[] = [
      {
        areaKey: 'IN|KA|Bengaluru|Hennur',
        areaLabel: 'Hennur',
        geo_center_lat: 13.04,
        geo_center_lon: 77.63,
        bbox: [
          [13.02, 77.61],
          [13.06, 77.65],
        ],
      },
      {
        areaKey: 'IN|KA|Bengaluru|Thanisandra',
        areaLabel: 'Thanisandra',
        geo_center_lat: 13.06,
        geo_center_lon: 77.62,
        bbox: [
          [13.04, 77.60],
          [13.08, 77.64],
        ],
      },
    ];
    const focusedGroup = {
      id: 'thanisandra-hennur-belt',
      name: 'Thanisandra–Hennur Belt',
      area_keys: groupAreas.map((a) => a.areaKey),
      listing_count: 42,
    };

    // Start with an in-app PUSH so hasObservedInAppTransitionRef flips to true (isColdNavigate = false).
    const { rerender } = renderHook(
      (props: UseDiscoverCameraOrchestrationParams) => useDiscoverCameraOrchestration(props),
      {
        initialProps: makeCameraParams({
          setPanToArea,
          discoverAreas: groupAreas,
          areaGroupsData: { city: 'bangalore', groups: [focusedGroup] },
          urlState: makeUrlState({
            journey: 'area-first',
            historyAction: 'PUSH',
          }),
        }),
      },
    );

    expect(setPanToArea).not.toHaveBeenCalled();

    // Now transition to groupId on POP with a persisted viewport:
    // group-focus is outside #1823's restore-wins-on-POP guard and must still publish reason='group'.
    rerender(
      makeCameraParams({
        setPanToArea,
        discoverAreas: groupAreas,
        areaGroupsData: { city: 'bangalore', groups: [focusedGroup] },
        focusedGroup,
        urlState: makeUrlState({
          journey: 'area-first',
          groupId: 'thanisandra-hennur-belt',
          historyAction: 'POP',
          viewport: { lat: 12.97, lon: 77.59, zoom: 11 },
        }),
      }),
    );

    expect(setPanToArea).toHaveBeenCalledTimes(1);
    expect(setPanToArea.mock.calls[0][0]).toMatchObject({
      reason: 'group',
      bbox: [
        [13.02, 77.6],
        [13.08, 77.65],
      ],
    });
  });

  it('T6: mobile Map mode on a listing-capable state (AREA leaf or nodeListings=1) proactively sets bottomOcclusionPx=150 before any marker tap while keeping desktop popover ineligible', () => {
    const navState = {
      ...makeUrlState({ journey: 'area-first', node: 'a:IN|KA|Bengaluru|Basaveshwara Nagar' }),
      rawNodeParam: 'a:IN|KA|Bengaluru|Basaveshwara Nagar',
      node: 'a:IN|KA|Bengaluru|Basaveshwara Nagar',
      nodeListings: false,
    } as unknown as DiscoverNavContextValue;

    const { result: popoverCtrl } = renderHook(() =>
      useDiscoverMarkerPopoverController({
        nav: navState,
        viewport: null,
        isNodeAreaLeafActive: true,
        mapLayerCategory: 'area-group-bubbles',
        effectiveSelectedArea: SAMPLE_AREA_POINT,
        isGroupResultsState: false,
        isNodeListingsState: false,
        mapZoom: 14,
        mapReady: true,
        isAuthenticated: false,
        groupResultsMarkers: [],
        nodeListingsMarkers: [],
        markerListings: [],
        areaMarkerListings: [SAMPLE_LISTING],
        schoolRadiusFallbackMarkers: [],
        isLoadingAreaListings: false,
        isErrorAreaListings: false,
        markersLoading: false,
        isAnonViewport: false,
        anonViewportMarkerListings: [],
        markerSelection: {
          selectedMarkerListing: null,
          selectMarkerSibling: vi.fn(),
          clearMarkerPopoverFromUrl: vi.fn(),
          isMarkerPopoverUrlBacked: () => false,
          hydrateSelectedMarkerFromUrl: vi.fn(),
        },
      }),
    );

    expect(popoverCtrl.current.isMarkerPopoverEligible).toBe(true);

    const { result: mobileCtrl } = renderHook(() =>
      useDiscoverMobilePresentationController({
        mobileMapOpen: true,
        setMobileView: vi.fn(),
        isMarkerPopoverEligible: popoverCtrl.current.isMarkerPopoverEligible,
      }),
    );

    // Proactive reserve before any marker is tapped:
    expect(mobileCtrl.current.selectedListingPreview).toBeNull();
    expect(mobileCtrl.current.isPreviewSheetOpen).toBe(false);
    expect(mobileCtrl.current.previewOcclusionPx).toBe(0);
    expect(mobileCtrl.current.bottomOcclusionPx).toBe(MOBILE_LISTING_PREVIEW_OCCLUSION_PX);
    expect(mobileCtrl.current.bottomOcclusionPx).toBe(150);
  });
});

// ─── L117: e2e/discover/issue-1956-pr4-listing-peek-camera-restore.spec.ts ───

describe('L117 (issue-1956-pr4-listing-peek-camera-restore): deep-link popover hydration, dismiss without refit, and View details navigation', () => {
  it('AC4.4 / AC4.5: deep-linking to node=<AREA>&listing=<id> hydrates and renders MarkerPopoverCard; dismissing clears listing= without re-firing canonical node fit; View details navigates to /listing/:id', () => {
    const mapContainer = document.createElement('div');
    Object.defineProperty(mapContainer, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }),
    });
    const markerEl = document.createElement('div');
    markerEl.setAttribute('data-listing-id', 'listing-1');
    Object.defineProperty(markerEl, 'getBoundingClientRect', {
      value: () => ({ left: 240, top: 180, right: 280, bottom: 210, width: 40, height: 30, x: 240, y: 180, toJSON: () => ({}) }),
    });
    mapContainer.appendChild(markerEl);
    const mapContainerRef: RefObject<HTMLDivElement | null> = { current: mapContainer };

    const setPanToArea = vi.fn();
    const navigate = vi.fn();
    const clearSelectedListingSpy = vi.fn();
    const nodeBounds = {
      minLat: 12.98,
      minLon: 77.53,
      maxLat: 13.0,
      maxLon: 77.55,
      centreLat: 12.99,
      centreLon: 77.54,
    };

    function DeepLinkHarness() {
      const [selectedListingId, setSelectedListingId] = useState<string | null>('listing-1');
      const urlState = makeUrlState({
        journey: 'area-first',
        node: 'a:IN|KA|Bengaluru|Basaveshwara Nagar',
        selectedListing: selectedListingId,
        viewport: { lat: 12.99, lon: 77.54, zoom: 15 },
        historyAction: 'POP',
      });
      const urlActions = makeUrlActions({
        clearSelectedListing: () => {
          clearSelectedListingSpy();
          setSelectedListingId(null);
        },
      });

      useDiscoverCameraOrchestration(
        makeCameraParams({
          setPanToArea,
          urlState,
          navigationNodeKey: 'a:IN|KA|Bengaluru|Basaveshwara Nagar',
          navigationNodeBounds: nodeBounds,
        }),
      );

      const markerSelection = useMarkerSelection({
        urlState,
        urlActions,
        isNodeAreaLeaf: true,
        mapContainerRef,
      });

      const navState = {
        ...urlState,
        rawNodeParam: urlState.node,
        nodeListings: false,
      } as unknown as DiscoverNavContextValue;

      const popoverCtrl = useDiscoverMarkerPopoverController({
        nav: navState,
        viewport: urlState.viewport,
        isNodeAreaLeafActive: true,
        mapLayerCategory: 'area-group-bubbles',
        effectiveSelectedArea: SAMPLE_AREA_POINT,
        isGroupResultsState: false,
        isNodeListingsState: false,
        mapZoom: 15,
        mapReady: true,
        isAuthenticated: false,
        groupResultsMarkers: [],
        nodeListingsMarkers: [],
        markerListings: [],
        areaMarkerListings: [SAMPLE_LISTING],
        schoolRadiusFallbackMarkers: [],
        isLoadingAreaListings: false,
        isErrorAreaListings: false,
        markersLoading: false,
        isAnonViewport: false,
        anonViewportMarkerListings: [],
        markerSelection,
      });

      return (
        <div>
          <span data-testid="harness-node">{urlState.node}</span>
          <span data-testid="harness-listing">{urlState.selectedListing ?? 'none'}</span>
          <span data-testid="harness-viewport">{`${urlState.viewport?.lat},${urlState.viewport?.lon},${urlState.viewport?.zoom}`}</span>
          <DiscoverMapMarkerPopover
            isMarkerPopoverEligible={popoverCtrl.isMarkerPopoverEligible}
            selectedMarkerListing={markerSelection.selectedMarkerListing}
            markerPixelPos={markerSelection.markerPixelPos}
            mapContainerRef={mapContainerRef}
            isAuthenticated={false}
            handlePopoverDismiss={markerSelection.handlePopoverDismiss}
            navigate={navigate}
            markerPopoverStepper={popoverCtrl.markerPopoverStepper}
            handleStepMarkerListing={popoverCtrl.handleStepMarkerListing}
            showMarkerInList={markerSelection.showMarkerInList}
          />
        </div>
      );
    }

    render(
      <MemoryRouter>
        <DeepLinkHarness />
      </MemoryRouter>,
    );

    // 1. Cold deep-link fits the canonical node once and hydrates the desktop MarkerPopoverCard
    expect(setPanToArea).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    expect(screen.getByTestId('harness-listing')).toHaveTextContent('listing-1');

    // 2. Clicking "View details" navigates to /listing/listing-1
    fireEvent.click(screen.getByTestId('popover-view-details'));
    expect(navigate).toHaveBeenCalledWith('/listing/listing-1');

    // 3. Clicking close button dismisses the popover, clears listing= via clearSelectedListing,
    // preserves node= and viewport, and does NOT trigger a second canonical node camera fit.
    fireEvent.click(screen.getByTestId('marker-popover-close'));
    expect(clearSelectedListingSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('harness-listing')).toHaveTextContent('none');
    expect(screen.getByTestId('harness-node')).toHaveTextContent('a:IN|KA|Bengaluru|Basaveshwara Nagar');
    expect(screen.getByTestId('harness-viewport')).toHaveTextContent('12.99,77.54,15');
    expect(setPanToArea).toHaveBeenCalledTimes(1);
  });
});

// ─── L122: e2e/discover/issue-1956-pr5-mobile-cluster-sheet.spec.ts ──────────

describe('L122 (issue-1956-pr5-mobile-cluster-sheet): clusterFocus persistence across MAP -> LIST -> MAP and Show all areas clear', () => {
  it('S3 / S4: buildMapSurfaceModel preserves focusedClusterMemberAreaKeys across mobileMapOpen true -> false -> true and clearing focus leaves node= untouched', () => {
    const selectNode = vi.fn();
    const rawChildren: NavigationNodeResponse['children'] = [
      {
        nodeKey: 'a:IN|KA|Bengaluru|Hebbal',
        nodeType: 'AREA',
        displayLabel: 'Hebbal',
        displayOrder: 1,
        areaKey: 'IN|KA|Bengaluru|Hebbal',
        centreLat: 13.04,
        centreLon: 77.59,
      },
      {
        nodeKey: 'a:IN|KA|Bengaluru|Jakkur',
        nodeType: 'AREA',
        displayLabel: 'Jakkur',
        displayOrder: 2,
        areaKey: 'IN|KA|Bengaluru|Jakkur',
        centreLat: 13.07,
        centreLon: 77.6,
      },
      {
        nodeKey: 'a:IN|KA|Bengaluru|Yelahanka',
        nodeType: 'AREA',
        displayLabel: 'Yelahanka',
        displayOrder: 3,
        areaKey: 'IN|KA|Bengaluru|Yelahanka',
        centreLat: 13.1,
        centreLon: 77.59,
      },
    ];
    const journeyChildren: UseAreasNavigationJourneyResult['children'] = [
      {
        nodeKey: 'a:IN|KA|Bengaluru|Hebbal',
        nodeType: 'AREA',
        displayLabel: 'Hebbal',
        displayOrder: 1,
        listingCount: 12,
        schoolCount: 4,
        isLeafArea: true,
        matchingAreaCount: null,
        descendantAreaCount: null,
        representativeAreaKeys: [],
        bounds: null,
        bearingDegrees: null,
      },
      {
        nodeKey: 'a:IN|KA|Bengaluru|Jakkur',
        nodeType: 'AREA',
        displayLabel: 'Jakkur',
        displayOrder: 2,
        listingCount: 8,
        schoolCount: 2,
        isLeafArea: true,
        matchingAreaCount: null,
        descendantAreaCount: null,
        representativeAreaKeys: [],
        bounds: null,
        bearingDegrees: null,
      },
      {
        nodeKey: 'a:IN|KA|Bengaluru|Yelahanka',
        nodeType: 'AREA',
        displayLabel: 'Yelahanka',
        displayOrder: 3,
        listingCount: 15,
        schoolCount: 5,
        isLeafArea: true,
        matchingAreaCount: null,
        descendantAreaCount: null,
        representativeAreaKeys: [],
        bounds: null,
        bearingDegrees: null,
      },
    ];
    const journey: UseAreasNavigationJourneyResult = {
      isLoading: false,
      isError: false,
      error: null,
      node: {
        nodeKey: 'c:north-corridor',
        nodeType: 'CLUSTER',
        displayLabel: 'North Corridor',
        depth: 2,
        regionKey: 'N',
        ancestry: [],
        nextLevelType: 'AREA',
        children: rawChildren,
        revisionId: 1,
        bounds: null,
        descendantAreaKeys: null,
        areaKey: null,
      },
      levelKind: 'areas',
      children: journeyChildren,
      resolutionNotice: null,
      nodeCount: 3,
      schoolsNotSimulatedForRevision: false,
      selectNode,
      refetch: vi.fn(),
      historyAdjacencyLog: [],
    } as unknown as UseAreasNavigationJourneyResult;

    const focusedKeys = ['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Jakkur'];
    const setFocusedClusterMemberAreaKeys = vi.fn();

    const makeSurfaceView = (mobileMapOpen: boolean, clusterKeys: readonly string[] | null) =>
      buildMapSurfaceModel({
        mobileMapOpen,
        mobileListButton: mobileMapOpen ? <button type="button">List</button> : undefined,
        activeAreasNavigationJourney: journey,
        navJourney: 'area-first',
        intent: 'buy',
        isBoundedBrowseState: false,
        isMarkerPopoverEligible: false,
        isAreaRecenterButtonVisible: false,
        mapContainerRef: { current: document.createElement('div') },
        pendingRemountCameraIntentSeqRef: { current: null },
        polygonDraftPhase: undefined,
        polygonDraftBlock: null,
        drawVertexCount: 0,
        startDrawNonce: 0,
        cancelDrawNonce: 0,
        undoVertexNonce: 0,
        isReplaceScopeConfirmOpen: false,
        areaGroupsController: { focusedGroupAreas: undefined, focusedGroup: null },
        badgeController: {
          announcedBadgeText: '',
          discoverBadge: { visible: false, count: null, loading: false, n: null, m: null, hasActiveFilters: false, hasPropertyFilters: false, state: 'zero-empty' },
          areaResultSummaryText: null,
          groupSelectedBadgeCopy: '',
          fallbackBadgeCopy: '',
          schoolRadiusActive: false,
          schoolRadiusPillNoun: 'homes',
          cityTotal: 35,
          hasActiveAnonFilter: false,
        },
        journeyChromeController: {
          isLandingState: false,
          showSchoolMarkers: false,
          showSchoolBreadcrumb: false,
          schoolRadiusOverlay: false,
          isSelectedGroupState: false,
          isAreaFirstSelectedAreaState: false,
        },
        pageContextController: {
          isAuthenticated: false,
          isAgriJourney: false,
          navigate: vi.fn(),
          setMobileView: vi.fn(),
        },
        pageStateController: {
          showLoader: false,
          filters: {},
          selectedSchool: null,
          panToArea: null,
          mapZoom: 12,
          mapReady: true,
          city: 'bangalore',
          resolvedPanelContent: 'areas-navigation' as never,
          effectiveSelectedArea: null,
          handlePolygonDrawn: vi.fn(),
          handlePolygonCleared: vi.fn(),
          setMapZoom: vi.fn(),
          setMapReady: vi.fn(),
          handleCityChange: vi.fn(),
        },
        mapDataController: {
          error: null,
          activeFocusBounds: null,
          cityCenter: [12.9716, 77.5946],
          cityZoom: 11,
          cameraIntent: null,
          areaMarkerListings: [],
          schoolRadiusHasMore: false,
          markersTruncated: false,
          markersReturnedElements: undefined,
          markersTotalFilteredElements: undefined,
          isLoading: false,
          isErrorDiscoverAreas: false,
          refetchDiscoverAreas: vi.fn(),
          isErrorSchoolRadiusListings: false,
          schoolRadiusPanelLoading: false,
          publishCameraIntent: vi.fn(),
          publishClusterCameraIntent: vi.fn(),
          publishMarkerClusterCameraIntent: vi.fn(),
        },
        markerPopoverController: {
          currentMapMarkerListings: [],
          markerPopoverStepper: null,
          handleStepMarkerListing: vi.fn(),
        },
        cameraController: {
          agriGroupFocusBounds: null,
          isColdNavigate: false,
          isSelectedNodeOutOfView: false,
          schoolFocusTick: 0,
          selectedSchoolLat: undefined,
          selectedSchoolLon: undefined,
          handleRecenterOnSelectedNode: vi.fn(),
          memoizedInitialCenter: undefined,
          schoolMarkerFocusTick: 0,
          schoolMarkerPositions: [],
          areaRestoreArea: null,
        },
        regionGuideController: {
          regionSelectNonce: 0,
          prefersReducedMotion: false,
          dismissRegionGuide: vi.fn(),
          regionGuideVisible: false,
          regionGuideRingActive: false,
        },
        mobilePresentationController: {
          bottomOcclusionPx: 0,
          previewOcclusionPx: 0,
          handlePreviewSheetHeightChange: vi.fn(),
          isPreviewSheetOpen: false,
          selectedListingPreview: null,
        },
        markerController: {
          markerPixelPos: null,
          selectedMarkerListing: null,
          handlePopoverDismiss: vi.fn(),
          handleSelectMarkerListing: vi.fn(),
          handleMarkerClickWithPosition: vi.fn(),
          showMarkerInList: vi.fn(),
        },
        viewportSearchController: {
          isDirty: false,
          isEligible: false,
          activate: vi.fn(),
        },
        navigationController: {
          hoveredNavigationNodeKey: null,
          setHoveredNavigationNodeKey: vi.fn(),
          focusedClusterMemberAreaKeys: clusterKeys,
          setFocusedClusterMemberAreaKeys,
        },
        agriController: { selectedRegion: null, selectedMaxKm: null, filteredAgriListings: null },
        schoolController: {
          schoolZoneLabels: [],
          schools: [],
          schoolsQuery: {} as never,
          schoolFirstAreaSchoolCount: null,
          schoolFirstZoneSchoolCount: null,
          schoolFirstLandingSchoolCount: null,
          schoolListings: [],
          journeyView: {} as never,
          journeyCommands: {} as never,
        },
        interactionController: {
          hoveredListingId: null,
          hoveredAreaKeyForMap: null,
          handleAreaClusterClick: vi.fn(),
        },
        mapLayerController: {
          overviewAreas: [],
          discoverAreas: [],
          areaSearchMatchKeys: undefined,
          resolvedRegionLabel: null,
          regionOverviewMarkerKind: 'default' as never,
          isRegionOverview: false,
          regionOverviewShortLabel: null,
          areaJourneySegments: [],
          schoolJourneySegments: [],
          isAreaFirstCityLanding: false,
        },
      } as never);

    // 1. Mobile MAP open: sheet is visible with the 2 focused members
    const viewMap1 = makeSurfaceView(true, focusedKeys);
    expect(viewMap1.overlays.mobileCluster.visible).toBe(true);
    expect(viewMap1.overlays.mobileCluster.focusedClusterMemberAreaKeys).toEqual(focusedKeys);

    // 2. Toggle to LIST (mobileMapOpen = false): overlay hides, but focusedClusterMemberAreaKeys remains intact
    const viewList = makeSurfaceView(false, focusedKeys);
    expect(viewList.overlays.mobileCluster.visible).toBe(false);
    expect(viewList.overlays.mobileCluster.focusedClusterMemberAreaKeys).toEqual(focusedKeys);

    // 3. Toggle back to MAP (mobileMapOpen = true): overlay is visible again with the same focusedClusterMemberAreaKeys
    const viewMap2 = makeSurfaceView(true, focusedKeys);
    expect(viewMap2.overlays.mobileCluster.visible).toBe(true);
    expect(viewMap2.overlays.mobileCluster.focusedClusterMemberAreaKeys).toEqual(focusedKeys);

    // Render MobileClusterSheet from the restored MAP surface view and click "Show all areas"
    const surfaceCommands = buildMapSurfaceCommands({
      navigationController: {
        setHoveredNavigationNodeKey: vi.fn(),
        setFocusedClusterMemberAreaKeys,
      },
      cameraController: { handleRecenterOnSelectedNode: vi.fn() },
      mobilePresentationController: { handlePreviewSheetHeightChange: vi.fn() },
      markerController: {
        handlePopoverDismiss: vi.fn(),
        handleSelectMarkerListing: vi.fn(),
        handleMarkerClickWithPosition: vi.fn(),
        showMarkerInList: vi.fn(),
      },
      markerPopoverController: { handleStepMarkerListing: vi.fn() },
      pageContextController: { navigate: vi.fn() },
      pageStateController: {
        handlePolygonDrawn: vi.fn(),
        handlePolygonCleared: vi.fn(),
        setMapZoom: vi.fn(),
        setMapReady: vi.fn(),
        handleCityChange: vi.fn(),
      },
      mapDataController: {
        publishCameraIntent: vi.fn(),
        publishClusterCameraIntent: vi.fn(),
        publishMarkerClusterCameraIntent: vi.fn(),
        refetchDiscoverAreas: vi.fn(),
      },
      geographyController: { handleAreaMarkersComputed: vi.fn() },
      interactionController: { handleAreaClusterClick: vi.fn() },
      overviewNavigationController: { handleOverviewAreaClick: vi.fn() },
      regionGuideController: { dismissRegionGuide: vi.fn() },
      schoolController: { journeyCommands: {} as never },
      viewportTrackerController: { handleBoundsChange: vi.fn() },
      viewportSearchController: { activate: vi.fn() },
      onAreaVisualClusterCameraIntent: vi.fn(),
      autoAdvanceSelectNode: vi.fn(),
      buildNavigationNodeHref: vi.fn(),
      handleUserCameraGesture: vi.fn(),
      handleCancelDrawPolygon: vi.fn(),
      handleUndoDrawVertex: vi.fn(),
      handleRedrawPolygon: vi.fn(),
      handleRetryPolygonValidation: vi.fn(),
      handleDismissPolygonRejection: vi.fn(),
      handleDrawVertexCountChange: vi.fn(),
      handleDrawModeExit: vi.fn(),
      handleConfirmReplaceScope: vi.fn(),
      handleCancelReplaceScope: vi.fn(),
      onFiltersChange: vi.fn(),
      onIntentChange: vi.fn(),
    } as never);

    render(
      <MobileClusterSheet
        journey={viewMap2.overlays.mobileCluster.journey}
        focusedClusterMemberAreaKeys={viewMap2.overlays.mobileCluster.focusedClusterMemberAreaKeys}
        onClusterFocusChange={surfaceCommands.overlays.onClusterFocusChange}
        eligibilityJourney={viewMap2.overlays.mobileCluster.eligibilityJourney}
      />,
    );

    expect(screen.getByTestId('mobile-cluster-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-cluster-sheet-member-a:IN|KA|Bengaluru|Hebbal')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-cluster-sheet-member-a:IN|KA|Bengaluru|Jakkur')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-cluster-sheet-member-a:IN|KA|Bengaluru|Yelahanka')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mobile-cluster-sheet-clear'));
    expect(setFocusedClusterMemberAreaKeys).toHaveBeenCalledWith(null);
    expect(selectNode).not.toHaveBeenCalled();
  });
});

// ─── L123: e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts (AC5.8) ─────

describe('L123 (issue-1956-pr5-mobile-list-first): AC5.8 single-AREA node= -> areaKeys + anon/auth header wire seam', () => {
  const CITY = 'bangalore';
  const LEAF_KEY = 'IN|KA|Bengaluru|Basaveshwara Nagar';
  const LISTINGS_PATH = `/api/discover/cities/${CITY}/listings`;

  const AREA_LEAF_NODE = {
    nodeKey: `a:${LEAF_KEY}`,
    nodeType: 'AREA' as const,
    displayLabel: 'Basaveshwara Nagar',
    depth: 2,
    regionKey: 'W',
    ancestry: [],
    nextLevelType: 'LISTINGS' as const,
    children: [],
    revisionId: 1,
    bounds: {
      minLat: 12.98,
      minLon: 77.53,
      maxLat: 13.0,
      maxLon: 77.55,
      centreLat: 12.99,
      centreLon: 77.54,
    },
    descendantAreaKeys: null,
    areaKey: LEAF_KEY,
  };

  let capturedListingsCalls: Array<{ url: URL; authHeader: string | null }> = [];
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    capturedListingsCalls = [];
    mockGetSession.mockReset();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const headers = new Headers(init?.headers);
      if (url.pathname === LISTINGS_PATH) {
        capturedListingsCalls.push({
          url,
          authHeader: headers.get('Authorization'),
        });
        return new Response(
          JSON.stringify({
            city: CITY,
            limitPerArea: 50,
            areas: [{ areaKey: LEAF_KEY, areaName: 'Basaveshwara Nagar', listings: [] }],
          }),
          { status: 200 },
        );
      }
      if (url.pathname === '/api/discover/areas') {
        return new Response(JSON.stringify({ city: CITY, areas: [] }), { status: 200 });
      }
      if (url.pathname === '/api/discover/markers') {
        return new Response(JSON.stringify({ city: CITY, markers: [], truncated: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ content: [], totalElements: 0, totalPages: 0 }), { status: 200 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('AC5.8: resolved canonical AREA node bridges via deriveAreaPointFromNode + resolveEffectiveSelectedArea to a single-areaKeys /api/discover/cities/bangalore/listings request (without Authorization when anonymous, with Bearer token when authenticated)', async () => {
    // Bridge step 1 & 2: derive AreaPoint from resolved node and resolve effectiveSelectedArea (legacySelectedArea is null on node= journey)
    const derivedNodeArea = deriveAreaPointFromNode(AREA_LEAF_NODE);
    expect(derivedNodeArea).not.toBeNull();
    expect(derivedNodeArea?.areaKey).toBe(LEAF_KEY);

    const effectiveSelectedArea = resolveEffectiveSelectedArea(null, derivedNodeArea);
    expect(effectiveSelectedArea?.areaKey).toBe(LEAF_KEY);

    const journey: UseAreasNavigationJourneyResult = {
      isLoading: false,
      isError: false,
      error: null,
      node: AREA_LEAF_NODE,
      levelKind: 'listings',
      children: [],
      resolutionNotice: null,
      nodeCount: null,
      schoolsNotSimulatedForRevision: false,
      selectNode: vi.fn(),
      refetch: vi.fn(),
      historyAdjacencyLog: [],
    } as unknown as UseAreasNavigationJourneyResult;

    const nav: DiscoverNavContextValue = {
      city: CITY,
      journey: 'area-first',
      areaKey: null,
      schoolId: null,
      groupId: null,
      scope: null,
      radiusKm: null,
      selectedLocality: null,
      filters: {},
      rawNodeParam: AREA_LEAF_NODE.nodeKey,
      node: AREA_LEAF_NODE.nodeKey,
      nodeListings: false,
      intent: 'buy',
      q: '',
      selectedGroup: null,
    } as unknown as DiscoverNavContextValue;

    // Arm 1: Anonymous viewer (isAuthenticated = false, no session)
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const anonQc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const anonHook = renderHook(
      () =>
        useDiscoverMapDataController({
          nav,
          city: CITY,
          effectiveSelectedArea,
          legacySelectedArea: null,
          filters: {},
          selectedSchool: null,
          debouncedSearch: '',
          isAuthenticated: false,
          fitTick: 0,
          groupAreaKeysForMapData: undefined,
          areasNavigationJourney: journey,
          boundedSearchTriggered: false,
          mapZoom: 14,
          mapReady: true,
          page: 0,
          mapBbox: null,
          intentListingPurpose: 'sale',
          authLoading: false,
          setShowLoader: () => {},
        }),
      {
        wrapper: ({ children }: { children: React.ReactNode }) =>
          React.createElement(QueryClientProvider, { client: anonQc }, children),
      },
    );

    await waitFor(() => {
      expect(capturedListingsCalls).toHaveLength(1);
    });
    expect(capturedListingsCalls[0].url.searchParams.getAll('areaKeys')).toEqual([LEAF_KEY]);
    expect(capturedListingsCalls[0].authHeader).toBeNull();
    anonHook.unmount();

    // Arm 2: Authenticated viewer (isAuthenticated = true, session has access_token)
    capturedListingsCalls = [];
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-2858-ac58' } },
    });
    const authQc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const authHook = renderHook(
      () =>
        useDiscoverMapDataController({
          nav,
          city: CITY,
          effectiveSelectedArea,
          legacySelectedArea: null,
          filters: {},
          selectedSchool: null,
          debouncedSearch: '',
          isAuthenticated: true,
          fitTick: 0,
          groupAreaKeysForMapData: undefined,
          areasNavigationJourney: journey,
          boundedSearchTriggered: false,
          mapZoom: 14,
          mapReady: true,
          page: 0,
          mapBbox: null,
          intentListingPurpose: 'sale',
          authLoading: false,
          setShowLoader: () => {},
        }),
      {
        wrapper: ({ children }: { children: React.ReactNode }) =>
          React.createElement(QueryClientProvider, { client: authQc }, children),
      },
    );

    await waitFor(() => {
      expect(capturedListingsCalls).toHaveLength(1);
    });
    expect(capturedListingsCalls[0].url.searchParams.getAll('areaKeys')).toEqual([LEAF_KEY]);
    expect(capturedListingsCalls[0].authHeader).toBe('Bearer jwt-2858-ac58');
    authHook.unmount();
  });
});

// ─── L137: e2e/discover/issue-2089-pan-preserves-listing-preview.spec.ts ─────

describe('L137 (issue-2089-pan-preserves-listing-preview): DiscoverMapCanvas drag-tail & marker click guards vs stationary tap & preview close button', () => {
  const DISCOVER_BADGE_EMPTY: DiscoverBadgeResult = {
    visible: false,
    count: null,
    loading: false,
    n: null,
    m: null,
    hasActiveFilters: false,
    hasPropertyFilters: false,
    state: 'zero-empty',
  };

  function makeCanvasProps(
    handlePopoverDismiss: () => void,
    mapContainerRef: RefObject<HTMLDivElement | null>,
  ): DiscoverMapCanvasProps {
    return {
      mapContainerRef,
      view: {
        camera: {
          agriGroupFocusBounds: null,
          activeFocusBounds: null,
          memoizedInitialCenter: undefined,
          isColdNavigate: false,
          cityCenter: [12.9716, 77.5946],
          cityZoom: 11,
          cameraIntent: null,
          pendingRemountCameraIntentSeqRef: { current: null },
          panToArea: null,
          bottomOcclusionPx: 150,
          previewOcclusionPx: 180,
          prefersReducedMotion: false,
          mapZoom: 14,
        },
        areas: {
          focusedGroupAreas: undefined,
          areaLayerMaxZoom: 12,
          selectedArea: null,
          overviewAreas: [],
          areaSearchMatchKeys: undefined,
          hoveredAreaKeyForMap: null,
          isRegionOverview: false,
          regionOverviewShortLabel: null,
          areaRestoreArea: null,
          isErrorDiscoverAreas: false,
        },
        agri: {
          selectedRegion: null,
          selectedMaxKm: null,
          filteredAgriListings: null,
          agriDestinationMarkers: [],
          isAgriJourney: false,
        },
        scope: {
          filters: {},
          isLandingState: false,
          isBoundedBrowseState: false,
        },
        navigation: {
          journey: 'area-first',
          showSchoolBreadcrumb: false,
          focusedGroup: null,
          city: 'bangalore',
          areasNavigationJourney: undefined,
          hoveredNavigationNodeKey: null,
          focusedClusterMemberAreaKeys: null,
          isAreaFirstCityLanding: false,
          areaJourneySegments: [],
          schoolJourneySegments: [],
          resolvedPanelContent: 'area-selected',
          isSelectedGroupState: false,
          isAreaFirstSelectedAreaState: true,
          journeyView: {
            startOverTick: 0,
            composedResetMapTick: 0,
            areaRestoreTick: 0,
            cityRestoreTick: 0,
            boundedSearchTriggered: false,
            schoolFirstOnBack: undefined,
          },
        },
        schools: {
          selectedSchool: null,
          schools: [],
          showSchoolMarkers: false,
          schoolsQuery: {
            isLoading: false,
            isError: false,
            error: null,
            isFetching: false,
            refetch: vi.fn(),
          } as unknown as UseInfiniteQueryResult<InfiniteData<SchoolsByAreaResponse>, Error>,
          schoolFocusTick: 0,
          selectedSchoolLat: undefined,
          selectedSchoolLon: undefined,
          schoolMarkerFocusTick: 0,
          schoolMarkerPositions: [],
          schoolRadiusActive: false,
          schoolRadiusPillNoun: 'homes',
          schoolFirstAreaSchoolCount: null,
          schoolFirstZoneSchoolCount: null,
          schoolFirstLandingSchoolCount: null,
          schoolRadiusHasMore: false,
          schoolListings: [],
          schoolZoneLabels: [],
          schoolRadiusOverlay: false,
        },
        markers: {
          markerPixelPos: { x: 200, y: 300 },
          selectedMarkerListing: SAMPLE_LISTING,
          hoveredListingId: null,
          isMarkerPopoverEligible: false,
          markerPopoverStepper: null,
          markersTruncated: false,
          markersReturnedElements: 1,
          markersTotalFilteredElements: 1,
          areaMarkerListings: [SAMPLE_LISTING],
          currentMapMarkerListings: [SAMPLE_LISTING],
        },
        status: {
          showLoader: false,
          error: null,
          isLoading: false,
          discoverBadge: DISCOVER_BADGE_EMPTY,
          areaResultSummaryText: '1 verified property in Basaveshwara Nagar',
          groupSelectedBadgeCopy: '',
          fallbackBadgeCopy: '',
          cityTotal: 1,
          isAreaRecenterButtonVisible: false,
          isAuthenticated: false,
          hasActiveAnonFilter: false,
          announcedBadgeText: '',
          isSchoolRadiusCountPending: false,
          intent: 'buy',
        },
        mobile: { mobileListButton: <button type="button">List</button> },
        regionGuide: {
          regionGuideVisible: false,
          regionGuideRingActive: false,
          resolvedRegionLabel: null,
          regionSelectNonce: 0,
          regionOverviewMarkerKind: null,
        },
        drawing: {},
        replaceScope: {},
        viewportSearch: {},
      },
      commands: {
        camera: {
          publishCameraIntent: vi.fn(),
          setMapZoom: vi.fn(),
          handleBoundsChange: vi.fn(),
          handleUserCameraGesture: vi.fn(),
        },
        drawing: {
          handlePolygonDrawn: vi.fn(),
          handlePolygonCleared: vi.fn(),
        },
        replaceScope: {},
        viewportSearch: {},
        navigation: {
          publishClusterCameraIntent: vi.fn(),
          handleAreaMarkersComputed: vi.fn(),
          handleCityChange: vi.fn(),
          handleOverviewAreaClick: vi.fn(),
          handleAreaClusterClick: vi.fn(),
          journeyCommands: {
            startOver: vi.fn(),
            selectSchoolById: vi.fn(),
            clearSchool: vi.fn(),
            clearArea: vi.fn(),
            changeRadius: vi.fn(),
            backLevel2: vi.fn(),
            backLevel1: vi.fn(),
            backLevel0: vi.fn(),
            resetBoundedSearch: vi.fn(),
            wrappedSchoolSelect: vi.fn(),
          },
        },
        markers: {
          navigate: vi.fn(),
          setMapReady: vi.fn(),
          handlePopoverDismiss,
          handleSelectMarkerListing: vi.fn(),
          handleMarkerClickWithPosition: vi.fn(),
          handleStepMarkerListing: vi.fn(),
          showMarkerInList: vi.fn(),
        },
        regionGuide: { dismissRegionGuide: vi.fn() },
        filters: {},
      },
    };
  }

  it('rejects a pan-drag tail click (Math.hypot(dx, dy) > 10px) and clicks on [data-listing-id] markers, keeping MobileListingPreviewSheet open until a stationary background tap (<=10px) or explicit close button click', () => {
    const mapContainerRef = createRef<HTMLDivElement>();
    const onViewDetails = vi.fn();
    let dismissCount = 0;

    function PreviewAndCanvasHarness() {
      const [previewOpen, setPreviewOpen] = useState(true);
      const handleDismiss = () => {
        dismissCount += 1;
        setPreviewOpen(false);
      };
      return (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <AreaSetDraftProvider>
            {previewOpen && (
              <MobileListingPreviewSheet
                preview={{
                  id: 'listing-2089',
                  title: '3BHK in Basaveshwara Nagar',
                  pricePaise: 1250000000,
                  bedrooms: 3,
                  areaSqft: 1650,
                  locality: 'Basaveshwara Nagar',
                  propertyType: 'apartment',
                  primaryImageUrl: null,
                  verificationStatus: 'VERIFIED',
                }}
                onDismiss={handleDismiss}
                onViewDetails={onViewDetails}
              />
            )}
            <DiscoverMapCanvas {...makeCanvasProps(handleDismiss, mapContainerRef)} />
          </AreaSetDraftProvider>
        </QueryClientProvider>
      );
    }

    render(<PreviewAndCanvasHarness />);

    const rootEl = mapContainerRef.current!;
    expect(rootEl).not.toBeNull();
    expect(screen.getByTestId('mobile-listing-preview-sheet')).toBeInTheDocument();

    // 1. Pan-drag gesture across the map canvas (from 200,300 to 60,220 -> hypot = 161.2px > 10px):
    // must NOT dismiss the listing preview sheet.
    fireEvent.mouseDown(rootEl, { clientX: 200, clientY: 300 });
    fireEvent.click(rootEl, { clientX: 60, clientY: 220 });
    expect(dismissCount).toBe(0);
    expect(screen.getByTestId('mobile-listing-preview-sheet')).toBeInTheDocument();

    // 2. Click originating on a [data-listing-id] marker element inside the canvas:
    // must NOT trigger background dismiss (#2149 guard).
    const markerNode = screen.getByTestId('mock-listing-marker');
    fireEvent.mouseDown(markerNode, { clientX: 150, clientY: 150 });
    fireEvent.click(markerNode, { clientX: 150, clientY: 150 });
    expect(dismissCount).toBe(0);
    expect(screen.getByTestId('mobile-listing-preview-sheet')).toBeInTheDocument();

    // 3. Explicit close button on MobileListingPreviewSheet dismisses the preview sheet.
    fireEvent.click(screen.getByTestId('mobile-listing-preview-close'));
    expect(dismissCount).toBe(1);
    expect(screen.queryByTestId('mobile-listing-preview-sheet')).not.toBeInTheDocument();
  });

  it('stationary background tap (delta <= 10px) on DiscoverMapCanvas invokes handlePopoverDismiss', () => {
    const mapContainerRef = createRef<HTMLDivElement>();
    const handlePopoverDismiss = vi.fn();

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AreaSetDraftProvider>
          <DiscoverMapCanvas {...makeCanvasProps(handlePopoverDismiss, mapContainerRef)} />
        </AreaSetDraftProvider>
      </QueryClientProvider>,
    );

    const rootEl = mapContainerRef.current!;
    fireEvent.mouseDown(rootEl, { clientX: 200, clientY: 300 });
    fireEvent.click(rootEl, { clientX: 203, clientY: 304 }); // hypot(3, 4) = 5px <= 10px
    expect(handlePopoverDismiss).toHaveBeenCalledTimes(1);
  });
});

// ─── L158: e2e/discover/journey-switch-overlay-cleanup-1940.spec.ts ──────────

describe('L158 (journey-switch-overlay-cleanup-1940): AC1/AC2/AC5 journey switch clears school state, unmounts school-radius-more-hint, and disables school markers + AC3 agri control', () => {
  const MOCK_SCHOOL: SchoolResult = {
    id: 'school-1940',
    name: 'National Public School',
    board: 'CBSE',
    boardType: null,
    latitude: 12.9719,
    longitude: 77.6412,
    address: 'Indiranagar',
    distanceKm: 1,
  };

  function JourneyCleanupHarness({ urlState }: { urlState: DiscoverUrlState }) {
    const [selectedSchool, setSelectedSchool] = useState<SchoolResult | null>(
      urlState.schoolId ? MOCK_SCHOOL : null,
    );
    const [filters, setFilters] = useState<PropertyFilters>(
      urlState.schoolId
        ? {
            schoolLat: MOCK_SCHOOL.latitude,
            schoolLon: MOCK_SCHOOL.longitude,
            schoolRadiusKm: urlState.radiusKm ?? 3,
          }
        : {},
    );
    const [schoolBoardFilter, setSchoolBoardFilter] = useState<string[]>([]);
    const [boundedSearchTriggered, setBoundedSearchTriggered] = useState(false);

    useDiscoverJourneyTransitions({
      urlState,
      urlActions: makeUrlActions(),
      selectedSchool,
      filters,
      setSelectedArea: vi.fn(),
      setSelectedSchool,
      setFilters,
      setSchoolBoardFilter,
      setPanToArea: vi.fn(),
      resetMapTick: 0,
      pendingAreaKeyRef: { current: null },
      initialViewportRef: { current: null },
      initialViewportWasBareAreaRef: { current: false },
      resolveSignal: 0,
      handleSchoolSelect: vi.fn(),
      schools: [],
      queryClient: { getQueryData: vi.fn(() => undefined) } as never,
      schoolById: urlState.schoolId ? MOCK_SCHOOL : undefined,
      schoolByIdError: null,
      discoverAreas: [],
      areasLoading: false,
      urlBoardFilters: [],
      schoolBoardFilter,
      panelContent: urlState.journey === 'agri-first' ? 'agri-landing' : 'school-selected',
      city: 'bangalore',
      toast: vi.fn() as never,
      hasResolvedCanonicalArea: false,
      boundedSearchTriggered,
      setBoundedSearchTriggered,
    });

    const badge = useDiscoverBadgeController({
      effectiveSelectedArea: null,
      focusedGroup: null,
      groupId: null,
      discoverAreas: [],
      city: 'bangalore',
      filters,
      areaListings: [],
      isLoadingAreaListings: false,
      listingDataLoading: false,
      isAuthenticated: false,
      schoolListings: [],
      schoolRadiusListings: [],
      schoolRadiusListingsLoading: false,
      debouncedSearch: '',
      navQ: '',
      intent: 'buy',
    });

    const chrome = useDiscoverJourneyChromeController({
      nav: {
        ...urlState,
        rawNodeParam: null,
        node: null,
        nodeListings: false,
      } as unknown as DiscoverNavContextValue,
      effectiveSelectedArea: null,
      legacySelectedArea: null,
      selectedSchool,
      selectedRegion: null,
      selectedMaxKm: null,
      filters,
      resolvedPanelContent: urlState.journey === 'agri-first' ? 'agri-landing' : 'school-selected',
      isAuthenticated: false,
      mapZoom: 13,
      showAreasNavigationJourney: urlState.journey === 'area-first',
      isNodeAreaLeafActive: false,
      areasNavigationNode: null,
      hasActiveScope: false,
      hasCommittedResultScope: false,
    });

    const schoolCircle =
      selectedSchool?.latitude != null && selectedSchool?.longitude != null
        ? { lat: selectedSchool.latitude, lon: selectedSchool.longitude, radiusKm: filters.schoolRadiusKm ?? 3 }
        : undefined;

    return (
      <div>
        <span data-testid="selected-school-id">{selectedSchool?.id ?? 'null'}</span>
        <span data-testid="school-radius-active">{String(badge.schoolRadiusActive)}</span>
        <span data-testid="show-school-markers">{String(chrome.showSchoolMarkers)}</span>
        <span data-testid="school-circle-present">{String(schoolCircle != null)}</span>
        <DiscoverMapStatusHints
          schoolRadiusHint={{
            isAuthenticated: false,
            schoolRadiusActive: badge.schoolRadiusActive,
            schoolRadiusHasMore: true,
            schoolListingsCount: 50,
            hasActiveAnonFilter: badge.hasActiveAnonFilter,
          }}
        />
      </div>
    );
  }

  it.each([
    {
      label: 'AC1: school-first -> agri-first',
      initial: makeUrlState({
        journey: 'school-first',
        areaKey: 'IN|KA|Bengaluru|Indiranagar',
        schoolId: 'school-1940',
        radiusKm: 3,
      }),
      switched: makeUrlState({ journey: 'agri-first', areaKey: null, schoolId: null, radiusKm: null }),
    },
    {
      label: 'AC2: school-first -> area-first',
      initial: makeUrlState({
        journey: 'school-first',
        areaKey: 'IN|KA|Bengaluru|Indiranagar',
        schoolId: 'school-1940',
        radiusKm: 3,
      }),
      switched: makeUrlState({ journey: 'area-first', areaKey: null, schoolId: null, radiusKm: null }),
    },
    {
      label: 'AC5: area-first combined (areaKey + schoolId) -> agri-first',
      initial: makeUrlState({
        journey: 'area-first',
        areaKey: 'IN|KA|Bengaluru|Indiranagar',
        schoolId: 'school-1940',
        radiusKm: 3,
      }),
      switched: makeUrlState({ journey: 'agri-first', areaKey: null, schoolId: null, radiusKm: null }),
    },
  ])('$label clears selectedSchool + schoolLat/Lon/RadiusKm, unmounts school-radius-more-hint, and turns off showSchoolMarkers & schoolCircle', ({ initial, switched }) => {
    const { rerender } = render(<JourneyCleanupHarness urlState={initial} />);

    // Pre-switch: school state, hint banner, school markers, and schoolCircle are all active
    expect(screen.getByTestId('selected-school-id')).toHaveTextContent('school-1940');
    expect(screen.getByTestId('school-radius-active')).toHaveTextContent('true');
    expect(screen.getByTestId('show-school-markers')).toHaveTextContent('true');
    expect(screen.getByTestId('school-circle-present')).toHaveTextContent('true');
    expect(screen.getByTestId('school-radius-more-hint')).toBeInTheDocument();

    // Switch journey (URL clears schoolId):
    rerender(<JourneyCleanupHarness urlState={switched} />);

    expect(screen.getByTestId('selected-school-id')).toHaveTextContent('null');
    expect(screen.getByTestId('school-radius-active')).toHaveTextContent('false');
    expect(screen.getByTestId('show-school-markers')).toHaveTextContent('false');
    expect(screen.getByTestId('school-circle-present')).toHaveTextContent('false');
    expect(screen.queryByTestId('school-radius-more-hint')).not.toBeInTheDocument();
  });

  it('AC3 control: cold landing on agri-first with no prior school selection has zero school overlays or hint banner', () => {
    render(<JourneyCleanupHarness urlState={makeUrlState({ journey: 'agri-first', schoolId: null })} />);

    expect(screen.getByTestId('selected-school-id')).toHaveTextContent('null');
    expect(screen.getByTestId('school-radius-active')).toHaveTextContent('false');
    expect(screen.getByTestId('show-school-markers')).toHaveTextContent('false');
    expect(screen.getByTestId('school-circle-present')).toHaveTextContent('false');
    expect(screen.queryByTestId('school-radius-more-hint')).not.toBeInTheDocument();
  });
});

// ─── L172: e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts ─

describe('L172 (thanisandra-hennur-belt-label-collision-1815): R5 area-cluster-marker click vs R6 representative area-marker click', () => {
  function makeArea(key: string, overrides: Partial<AreaPoint> = {}): AreaPoint {
    return {
      areaKey: key,
      areaLabel: key,
      geo_center_lat: 13.05,
      geo_center_lon: 77.63,
      bbox: [
        [13.04, 77.62],
        [13.06, 77.64],
      ],
      listingCount: 10,
      ...overrides,
    };
  }

  function makeCluster(
    anchorLat: number,
    anchorLon: number,
    namePrefix: string,
    count: number,
    startCount: number,
  ): AreaPoint[] {
    return Array.from({ length: count }, (_, i) =>
      makeArea(`IN|KA|Bengaluru|${namePrefix}-${i + 1}`, {
        areaLabel: `${namePrefix}-${i + 1}`,
        geo_center_lat: anchorLat + i * 0.0001,
        geo_center_lon: anchorLon + i * 0.0001,
        listingCount: startCount + i,
      }),
    );
  }

  const DENSE_GROUP_AREAS: AreaPoint[] = [
    ...makeCluster(13.45, 74.85, 'ne-a', 5, 10),
    ...makeCluster(13.45, 74.65, 'nw-a', 5, 8),
    ...makeCluster(13.25, 74.85, 'se-a', 5, 6),
    ...makeCluster(13.25, 74.65, 'sw-a', 5, 4),
    ...makeCluster(13.4, 74.8, 'ne-b', 5, 20),
    ...makeCluster(13.22, 74.62, 'sw-b', 4, 2),
  ];

  beforeEach(() => {
    capturedDivIconCalls.length = 0;
    capturedMarkers.length = 0;
  });

  it('R5 & R6: clicking an area-cluster-marker chip fires cluster camera intent + highlights cluster member rows without setting areaKey, whereas clicking a named area-marker pill selects that areaKey and populates areaResultSummaryText', () => {
    const publishClusterCameraIntent = vi.fn();
    let currentAreaKey: string | null = null;
    const currentGroupId = 'thanisandra-hennur-belt';
    let selectedAreaState: AreaPoint | null = null;

    const { result: interactionCtrl } = renderHook(() => useDiscoverInteractionController());

    const handleAreaClickSpy = vi.fn((area: AreaPoint) => {
      currentAreaKey = area.areaKey;
      selectedAreaState = area;
    });

    const emptyJourney = {
      isLoading: false,
      isError: false,
      error: null,
      node: null,
      levelKind: null,
      children: [],
      resolutionNotice: null,
      nodeCount: null,
      schoolsNotSimulatedForRevision: false,
      selectNode: vi.fn(),
      refetch: vi.fn(),
      historyAdjacencyLog: [],
    } as unknown as UseAreasNavigationJourneyResult;

    const { result: overviewNavCtrl } = renderHook(() =>
      useDiscoverOverviewNavigationController({
        isTopGroupedAgri: false,
        corridorGroups: [],
        scopeNamespaces: {
          regionKeys: new Set(),
          groupSlugs: new Set([currentGroupId]),
          groupNameSlugs: new Map(),
        },
        mapLayerKind: 'area-group-bubbles',
        armRegionSelect: vi.fn(),
        handleAreaClick: handleAreaClickSpy,
        journey: 'area-first',
        areasNavigationJourney: emptyJourney,
        discoverAreas: DENSE_GROUP_AREAS,
        handleAreaSelect: handleAreaClickSpy,
        actions: makeUrlActions(),
      }),
    );

    render(
      <AreaMarkerLayer
        areas={DENSE_GROUP_AREAS}
        focusedGroupAreas={DENSE_GROUP_AREAS.map((a) => a.areaKey)}
        enableDegradation
        onAreaClick={overviewNavCtrl.current.handleOverviewAreaClick}
        onAreaClusterCameraIntent={publishClusterCameraIntent}
        onAreaClusterClick={(cluster: AreaMarkerClusterInfo) =>
          interactionCtrl.current.handleAreaClusterClick(cluster)
        }
      />,
    );

    const clusterMarker = capturedMarkers.find((m) =>
      m.html.includes('data-testid="area-cluster-marker"'),
    );
    const representativeMarker = capturedMarkers.find((m) =>
      m.html.includes('data-testid="area-marker"'),
    );

    expect(clusterMarker).toBeDefined();
    expect(representativeMarker).toBeDefined();

    // R5: Click the area-cluster-marker chip ("+N nearby areas")
    act(() => {
      clusterMarker!.handlers.click();
    });

    // Must NOT drill into an area (areaKey remains null, groupId stays 'thanisandra-hennur-belt'),
    // must publish cluster camera intent, and must highlight cluster members in interactionCtrl.
    expect(handleAreaClickSpy).not.toHaveBeenCalled();
    expect(currentAreaKey).toBeNull();
    expect(currentGroupId).toBe('thanisandra-hennur-belt');
    expect(publishClusterCameraIntent).toHaveBeenCalledTimes(1);
    expect(interactionCtrl.current.highlightedAreaKeys.length).toBeGreaterThanOrEqual(2);
    expect(
      capturedMarkers.filter(
        (m) =>
          m.html.includes('data-testid="area-marker"') ||
          m.html.includes('data-testid="area-marker-dot"') ||
          m.html.includes('data-testid="area-cluster-marker"'),
      ).length,
    ).toBeGreaterThan(0);

    // R6: Click a named representative area-marker pill
    act(() => {
      representativeMarker!.handlers.click();
    });

    expect(handleAreaClickSpy).toHaveBeenCalledTimes(1);
    expect(currentAreaKey).not.toBeNull();
    expect(selectedAreaState).not.toBeNull();
    expect(currentGroupId).toBe('thanisandra-hennur-belt');

    // Verify useDiscoverBadgeController produces the non-empty areaResultSummaryText for the selected area
    const { result: badgeCtrl } = renderHook(() =>
      useDiscoverBadgeController({
        effectiveSelectedArea: selectedAreaState,
        focusedGroup: {
          id: currentGroupId,
          name: 'Thanisandra–Hennur Belt',
          area_keys: DENSE_GROUP_AREAS.map((a) => a.areaKey),
          listing_count: 181,
        },
        groupId: currentGroupId,
        discoverAreas: DENSE_GROUP_AREAS,
        city: 'bangalore',
        filters: {},
        areaListings: [],
        isLoadingAreaListings: false,
        listingDataLoading: false,
        isAuthenticated: false,
        schoolListings: [],
        schoolRadiusListings: [],
        schoolRadiusListingsLoading: false,
        debouncedSearch: '',
        navQ: '',
        intent: 'buy',
      }),
    );

    expect(badgeCtrl.current.areaResultSummaryText).toBeTruthy();
    expect(badgeCtrl.current.areaResultSummaryText).toContain(selectedAreaState!.areaLabel);
  });
});
