import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockResolveMarkerPopover = vi.hoisted(() => vi.fn());
const mockIsMarkerPopoverEligible = vi.hoisted(() => vi.fn());

vi.mock('@/features/discover/map/resolveMarkerPopover', () => ({
  resolveMarkerPopover: mockResolveMarkerPopover,
}));
vi.mock('@/features/discover/navigation/markerPopoverEligibility', () => ({
  isMarkerPopoverEligible: mockIsMarkerPopoverEligible,
}));

import { useDiscoverMarkerPopoverController } from '../useDiscoverMarkerPopoverController';
import type { UseDiscoverMarkerPopoverControllerParams } from '../useDiscoverMarkerPopoverController';

function makeListing(id: string) {
  return { id } as never;
}

const LISTING_1 = makeListing('L1');
const LISTING_2 = makeListing('L2');

function baseMarkerSelection(
  overrides: Partial<UseDiscoverMarkerPopoverControllerParams['markerSelection']> = {},
): UseDiscoverMarkerPopoverControllerParams['markerSelection'] {
  return {
    selectedMarkerListing: null,
    selectMarkerSibling: vi.fn(),
    clearMarkerPopoverFromUrl: vi.fn(),
    isMarkerPopoverUrlBacked: vi.fn().mockReturnValue(false),
    hydrateSelectedMarkerFromUrl: vi.fn(),
    ...overrides,
  };
}

function baseParams(
  overrides: Partial<UseDiscoverMarkerPopoverControllerParams> = {},
): UseDiscoverMarkerPopoverControllerParams {
  return {
    nav: { selectedListing: null, journey: 'area-first', areaKey: 'a:1', schoolId: null } as never,
    viewport: null,
    isNodeAreaLeafActive: false,
    mapLayerCategory: 'area-selected' as never,
    effectiveSelectedArea: null,
    isGroupResultsState: false,
    isNodeListingsState: false,
    mapZoom: 12,
    mapReady: true,
    isAuthenticated: false,
    groupResultsMarkers: [],
    nodeListingsMarkers: [],
    markerListings: [],
    areaMarkerListings: [],
    schoolRadiusFallbackMarkers: [],
    isLoadingAreaListings: false,
    isErrorAreaListings: false,
    markersLoading: false,
    markerSelection: baseMarkerSelection(),
    ...overrides,
  };
}

describe('useDiscoverMarkerPopoverController (#2142 correction — #2139 ordering + #1939 URL<->popover reconciliation)', () => {
  beforeEach(() => {
    mockResolveMarkerPopover.mockReset().mockReturnValue({
      currentMapMarkerListings: [],
      markerPopoverStepper: null,
    });
    mockIsMarkerPopoverEligible.mockReset().mockReturnValue(true);
  });

  describe('#1939 URL -> popover reconciliation effect', () => {
    it('hydrates selectedMarkerListing from the URL when nav.selectedListing resolves against currentMapMarkerListings and nothing is locally selected', () => {
      mockResolveMarkerPopover.mockReturnValue({
        currentMapMarkerListings: [LISTING_1],
        markerPopoverStepper: null,
      });
      const markerSelection = baseMarkerSelection({ selectedMarkerListing: null });

      const { result } = renderHook(() =>
        useDiscoverMarkerPopoverController(
          baseParams({
            nav: { selectedListing: 'L1', journey: 'area-first', areaKey: 'a:1', schoolId: null } as never,
            markerSelection,
          }),
        ),
      );

      expect(markerSelection.hydrateSelectedMarkerFromUrl).toHaveBeenCalledWith(LISTING_1);
      expect(markerSelection.clearMarkerPopoverFromUrl).not.toHaveBeenCalled();
      expect(result.current.urlHydratedMarkerListing).toBe(LISTING_1);
    });

    it('reverse-clears the URL param when a URL-backed popover is showing and the URL genuinely drops the listing id (nav.selectedListing == null)', () => {
      const markerSelection = baseMarkerSelection({
        selectedMarkerListing: LISTING_1,
        isMarkerPopoverUrlBacked: vi.fn().mockReturnValue(true),
      });

      renderHook(() =>
        useDiscoverMarkerPopoverController(
          baseParams({
            nav: { selectedListing: null, journey: 'area-first', areaKey: 'a:1', schoolId: null } as never,
            markerSelection,
          }),
        ),
      );

      expect(markerSelection.clearMarkerPopoverFromUrl).toHaveBeenCalledTimes(1);
      expect(markerSelection.hydrateSelectedMarkerFromUrl).not.toHaveBeenCalled();
    });

    it('does NOT clear a pure click-set (not URL-backed) popover when the URL has no listing id — issue #1973 rev-2 (A1) guard', () => {
      const markerSelection = baseMarkerSelection({
        selectedMarkerListing: LISTING_1,
        isMarkerPopoverUrlBacked: vi.fn().mockReturnValue(false),
      });

      renderHook(() =>
        useDiscoverMarkerPopoverController(
          baseParams({
            nav: { selectedListing: null, journey: 'school-first', areaKey: null, schoolId: 's:1' } as never,
            markerSelection,
          }),
        ),
      );

      expect(markerSelection.clearMarkerPopoverFromUrl).not.toHaveBeenCalled();
      expect(markerSelection.hydrateSelectedMarkerFromUrl).not.toHaveBeenCalled();
    });

    it('LEAVE_PARAM_NO_POPOVER: nav.selectedListing names an id not (yet) in currentMapMarkerListings and nothing is locally selected — no popover shown, no clear/hydrate call', () => {
      mockResolveMarkerPopover.mockReturnValue({
        currentMapMarkerListings: [],
        markerPopoverStepper: null,
      });
      const markerSelection = baseMarkerSelection({ selectedMarkerListing: null });

      const { result } = renderHook(() =>
        useDiscoverMarkerPopoverController(
          baseParams({
            nav: { selectedListing: 'L-not-loaded', journey: 'area-first', areaKey: 'a:1', schoolId: null } as never,
            markerSelection,
          }),
        ),
      );

      expect(markerSelection.hydrateSelectedMarkerFromUrl).not.toHaveBeenCalled();
      expect(markerSelection.clearMarkerPopoverFromUrl).not.toHaveBeenCalled();
      expect(result.current.urlHydratedMarkerListing).toBeNull();
    });

    it('F3: clears a DIFFERENT, currently-displayed local popover when the URL has moved to an unresolvable id (stale-different-id clear)', () => {
      mockResolveMarkerPopover.mockReturnValue({
        currentMapMarkerListings: [],
        markerPopoverStepper: null,
      });
      const markerSelection = baseMarkerSelection({ selectedMarkerListing: LISTING_2 });

      renderHook(() =>
        useDiscoverMarkerPopoverController(
          baseParams({
            nav: { selectedListing: 'L-not-loaded', journey: 'area-first', areaKey: 'a:1', schoolId: null } as never,
            markerSelection,
          }),
        ),
      );

      expect(markerSelection.clearMarkerPopoverFromUrl).toHaveBeenCalledTimes(1);
    });

    it('is a no-op regardless of nav.selectedListing when the popover is ineligible or the map is not ready', () => {
      mockIsMarkerPopoverEligible.mockReturnValue(false);
      const markerSelection = baseMarkerSelection({ selectedMarkerListing: LISTING_1 });

      renderHook(() =>
        useDiscoverMarkerPopoverController(
          baseParams({
            nav: { selectedListing: null, journey: 'agri-first', areaKey: null, schoolId: null } as never,
            markerSelection,
          }),
        ),
      );

      expect(markerSelection.clearMarkerPopoverFromUrl).not.toHaveBeenCalled();
      expect(markerSelection.hydrateSelectedMarkerFromUrl).not.toHaveBeenCalled();

      const markerSelection2 = baseMarkerSelection({ selectedMarkerListing: LISTING_1 });
      mockIsMarkerPopoverEligible.mockReturnValue(true);
      renderHook(() =>
        useDiscoverMarkerPopoverController(
          baseParams({ mapReady: false, markerSelection: markerSelection2 }),
        ),
      );
      expect(markerSelection2.clearMarkerPopoverFromUrl).not.toHaveBeenCalled();
      expect(markerSelection2.hydrateSelectedMarkerFromUrl).not.toHaveBeenCalled();
    });
  });

  describe('#2139 controller-boundary wiring into resolveMarkerPopover', () => {
    it('feeds isMarkerPopoverEligible + the caller-supplied marker sets + selectedMarkerListing into resolveMarkerPopover, and re-exposes its ordered set/stepper unchanged', () => {
      const stepper = { index: 1, total: 3 };
      const orderedListings = [LISTING_1, LISTING_2];
      mockResolveMarkerPopover.mockReturnValue({
        currentMapMarkerListings: orderedListings,
        markerPopoverStepper: stepper,
      });
      mockIsMarkerPopoverEligible.mockReturnValue(true);
      const markerSelection = baseMarkerSelection({ selectedMarkerListing: LISTING_1 });

      const { result } = renderHook(() =>
        useDiscoverMarkerPopoverController(
          baseParams({
            mapLayerCategory: 'listing-markers' as never,
            markerSelection,
          }),
        ),
      );

      expect(mockResolveMarkerPopover).toHaveBeenCalledWith(
        expect.objectContaining({
          mapLayerCategory: 'listing-markers',
          isMarkerPopoverEligible: true,
          selectedMarkerListing: LISTING_1,
        }),
      );
      expect(result.current.currentMapMarkerListings).toBe(orderedListings);
      expect(result.current.markerPopoverStepper).toBe(stepper);
      expect(result.current.isMarkerPopoverEligible).toBe(true);
    });

    it('handleStepMarkerListing steps to the sibling at index+direction within currentMapMarkerListings via selectMarkerSibling, and is a no-op past the array bounds', () => {
      mockResolveMarkerPopover.mockReturnValue({
        currentMapMarkerListings: [LISTING_1, LISTING_2],
        markerPopoverStepper: { index: 0, total: 2 },
      });
      const markerSelection = baseMarkerSelection({ selectedMarkerListing: LISTING_1 });

      const { result } = renderHook(() =>
        useDiscoverMarkerPopoverController(baseParams({ markerSelection })),
      );

      result.current.handleStepMarkerListing(1);
      expect(markerSelection.selectMarkerSibling).toHaveBeenCalledWith(LISTING_2);
      expect(markerSelection.selectMarkerSibling).toHaveBeenCalledTimes(1);

      const outOfBoundsMarkerSelection = baseMarkerSelection({ selectedMarkerListing: LISTING_1 });
      const { result: outOfBoundsResult } = renderHook(() =>
        useDiscoverMarkerPopoverController(baseParams({ markerSelection: outOfBoundsMarkerSelection })),
      );
      outOfBoundsResult.current.handleStepMarkerListing(-1);
      expect(outOfBoundsMarkerSelection.selectMarkerSibling).not.toHaveBeenCalled();
    });
  });
});
