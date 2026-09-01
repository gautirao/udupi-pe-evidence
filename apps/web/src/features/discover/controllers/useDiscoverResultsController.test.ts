import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUseDiscoverListings = vi.hoisted(() => vi.fn());
const mockUseDiscoverFilteredMarkers = vi.hoisted(() => vi.fn());
const mockUseDiscoverCityListings = vi.hoisted(() => vi.fn());
const mockUseDiscoverGroupResults = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDiscoverListings', () => ({ useDiscoverListings: mockUseDiscoverListings }));
vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({ useDiscoverFilteredMarkers: mockUseDiscoverFilteredMarkers }));
vi.mock('@/hooks/useDiscoverCityListings', () => ({ useDiscoverCityListings: mockUseDiscoverCityListings }));
vi.mock('@/features/discover/presentation/useDiscoverGroupResults', () => ({
  useDiscoverGroupResults: mockUseDiscoverGroupResults,
}));

import { useDiscoverResultsController } from './useDiscoverResultsController';
import type { useAreaGroups } from '@/hooks/useAreaGroups';

const AUTHED_RESULT = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
const MARKERS_RESULT = { data: undefined };
const ANON_RESULT = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
const GROUP_RESULTS_OUTPUT = {
  groupResultsListings: [],
  groupResultsTotalElements: 0,
  isLoadingGroupResults: false,
  isGroupResultsError: false,
  refetchGroupResults: vi.fn(),
  groupResultsMarkers: [],
};

const AREA_GROUPS: ReturnType<typeof useAreaGroups>['data'] = {
  groups: [
    {
      id: 'manipal-belt',
      name: 'Manipal Belt',
      subtitle: null,
      region_label: null,
      school_count: 0,
      area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Tiger Circle'],
    },
  ],
};

describe('useDiscoverResultsController (#2142 Commit 3 — moved verbatim from MapDiscovery.tsx, composition test)', () => {
  beforeEach(() => {
    mockUseDiscoverListings.mockReset().mockReturnValue(AUTHED_RESULT);
    mockUseDiscoverFilteredMarkers.mockReset().mockReturnValue(MARKERS_RESULT);
    mockUseDiscoverCityListings.mockReset().mockReturnValue(ANON_RESULT);
    mockUseDiscoverGroupResults.mockReset().mockReturnValue(GROUP_RESULTS_OUTPUT);
  });

  it('isGroupResultsState is true only for panelContent === "area-group-results"', () => {
    const { result: notResults } = renderHook(() =>
      useDiscoverResultsController({
        panelContent: 'area-selected',
        city: 'udupi',
        groupId: null,
        areaGroupsData: AREA_GROUPS,
        intentListingPurpose: 'sale',
        urlDiscoverFilters: {},
        isAuthenticated: true,
      }),
    );
    expect(notResults.current.isGroupResultsState).toBe(false);

    const { result: isResults } = renderHook(() =>
      useDiscoverResultsController({
        panelContent: 'area-group-results',
        city: 'udupi',
        groupId: 'manipal-belt',
        areaGroupsData: AREA_GROUPS,
        intentListingPurpose: 'sale',
        urlDiscoverFilters: {},
        isAuthenticated: true,
      }),
    );
    expect(isResults.current.isGroupResultsState).toBe(true);
  });

  it('resolves the active group + its area_keys from areaGroupsData only when in group-results state', () => {
    const { result } = renderHook(() =>
      useDiscoverResultsController({
        panelContent: 'area-group-results',
        city: 'udupi',
        groupId: 'manipal-belt',
        areaGroupsData: AREA_GROUPS,
        intentListingPurpose: 'sale',
        urlDiscoverFilters: {},
        isAuthenticated: true,
      }),
    );
    expect(result.current.resolvedGroupForResults?.id).toBe('manipal-belt');
    expect(result.current.resolvedGroupAreaKeys).toEqual(['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Tiger Circle']);
  });

  it('gates the authed listings/markers queries on isGroupResultsState && isAuthenticated', () => {
    renderHook(() =>
      useDiscoverResultsController({
        panelContent: 'area-group-results',
        city: 'udupi',
        groupId: 'manipal-belt',
        areaGroupsData: AREA_GROUPS,
        intentListingPurpose: 'rent',
        urlDiscoverFilters: {},
        isAuthenticated: true,
      }),
    );
    expect(mockUseDiscoverListings).toHaveBeenCalledWith(
      expect.objectContaining({
        city: 'udupi',
        enabled: true,
        listingPurpose: 'rent',
        areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Tiger Circle'],
      }),
    );
    expect(mockUseDiscoverFilteredMarkers).toHaveBeenCalledWith(
      'udupi',
      {},
      true, // isGroupResultsState && isAuthenticated
      null, // bbox — no viewport clipping for group-results
      undefined,
      'rent',
      undefined,
      { kind: 'areas', areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Tiger Circle'] },
      // Issue #2016 — the group-results surface's own committed AREA_SET
      // ResultScope, threaded through for the shared scopeFingerprint.
      { kind: 'AREA_SET', areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Tiger Circle'] },
    );
  });

  it('routes the anon path through cityListingsQueryParams with areaKeys only for unauthenticated group-results', () => {
    renderHook(() =>
      useDiscoverResultsController({
        panelContent: 'area-group-results',
        city: 'udupi',
        groupId: 'manipal-belt',
        areaGroupsData: AREA_GROUPS,
        intentListingPurpose: 'sale',
        urlDiscoverFilters: { propertyTypes: ['house'] },
        isAuthenticated: false,
      }),
    );
    expect(mockUseDiscoverCityListings).toHaveBeenCalledWith(
      expect.objectContaining({
        city: 'udupi',
        areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Tiger Circle'],
        limitPerArea: 20,
        propertyType: 'house',
        listingPurpose: 'sale',
      }),
    );
  });

  it('returns the unified output from useDiscoverGroupResults unchanged', () => {
    const { result } = renderHook(() =>
      useDiscoverResultsController({
        panelContent: 'area-group-results',
        city: 'udupi',
        groupId: 'manipal-belt',
        areaGroupsData: AREA_GROUPS,
        intentListingPurpose: 'sale',
        urlDiscoverFilters: {},
        isAuthenticated: true,
      }),
    );
    expect(result.current.groupResultsListings).toBe(GROUP_RESULTS_OUTPUT.groupResultsListings);
    expect(result.current.groupResultsMarkers).toBe(GROUP_RESULTS_OUTPUT.groupResultsMarkers);
  });
});
