import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUseRegionalAreaGroups = vi.hoisted(() => vi.fn());
const mockUseAgriDestinations = vi.hoisted(() => vi.fn());
const mockUseAgriMapListings = vi.hoisted(() => vi.fn());
const mockUseFilteredAgriListings = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useRegionalAreaGroups: mockUseRegionalAreaGroups,
  useAgriDestinations: mockUseAgriDestinations,
}));
vi.mock('@/hooks/useAgriMapListings', () => ({ useAgriMapListings: mockUseAgriMapListings }));
vi.mock('@/features/discover/presentation/useFilteredAgriListings', () => ({
  useFilteredAgriListings: mockUseFilteredAgriListings,
}));

import { useDiscoverAgriController } from './useDiscoverAgriController';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';

function makeNav(overrides: Partial<DiscoverNavContextValue> = {}): DiscoverNavContextValue {
  return {
    city: 'udupi',
    journey: null,
    areaKey: null,
    schoolId: null,
    groupId: null,
    scope: null,
    radiusKm: null,
    selectedLocality: null,
    filters: {},
    rawNodeParam: null,
    intent: null,
    selectedRegion: null,
    selectedMaxKm: null,
    selectedListing: null,
    ...overrides,
  } as DiscoverNavContextValue;
}

const CORRIDOR_GROUPS = [
  {
    directionCode: 'E',
    groupName: 'East Corridor',
    availableMaxDistances: [{ maxKm: 25, distanceLabel: '25 km', areaKeys: ['IN|KA|Udupi|A'] }],
  },
];
const REGIONAL_RESULT = { groups: CORRIDOR_GROUPS, isLoading: false, isError: false, refetch: vi.fn() };
const AGRI_LISTINGS_RESULT = {
  data: { listings: [{ id: 'listing-1' }] },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};
const AGRI_DESTINATIONS_RESULT = {
  destinations: [{ areaKey: 'IN|KA|Udupi|Manipal', displayName: 'Manipal', distanceKm: 12, bearingDeg: 90, direction: 'E', parcelCount: 3 }],
  isLoading: false,
  isError: false,
  isNotYetPromoted: false,
  isNotGeneratedForRevision: false,
  error: null,
  refetch: vi.fn(),
};

describe('useDiscoverAgriController (#2142 Commit 3 — moved verbatim from MapDiscovery.tsx, composition test)', () => {
  beforeEach(() => {
    mockUseRegionalAreaGroups.mockReset().mockReturnValue(REGIONAL_RESULT);
    mockUseAgriDestinations.mockReset().mockReturnValue(AGRI_DESTINATIONS_RESULT);
    mockUseAgriMapListings.mockReset().mockReturnValue(AGRI_LISTINGS_RESULT);
    mockUseFilteredAgriListings.mockReset().mockReturnValue(null);
  });

  it('resolves selectedCorridorData/selectedTierData when both selectedRegion and selectedMaxKm match', () => {
    const { result } = renderHook(() =>
      useDiscoverAgriController({
        nav: makeNav({ selectedRegion: 'E', selectedMaxKm: 25 }),
        intentListingPurpose: 'sale',
        isAuthenticated: true,
      }),
    );
    expect(result.current.selectedCorridorData?.groupName).toBe('East Corridor');
    expect(result.current.selectedTierData?.distanceLabel).toBe('25 km');
    expect(result.current.selectedGroupAreaKeys).toEqual(['IN|KA|Udupi|A']);
  });

  it('selectedCorridorData/selectedTierData are null when selectedRegion is unset', () => {
    const { result } = renderHook(() =>
      useDiscoverAgriController({
        nav: makeNav(),
        intentListingPurpose: 'sale',
        isAuthenticated: true,
      }),
    );
    expect(result.current.selectedCorridorData).toBeNull();
    expect(result.current.selectedTierData).toBeNull();
    expect(result.current.selectedGroupAreaKeys).toEqual([]);
  });

  it('agriGroupLabel combines groupName + distanceLabel when both resolved, falls back to groupName alone otherwise', () => {
    const { result: both } = renderHook(() =>
      useDiscoverAgriController({
        nav: makeNav({ selectedRegion: 'E', selectedMaxKm: 25 }),
        intentListingPurpose: 'sale',
        isAuthenticated: true,
      }),
    );
    expect(both.current.agriGroupLabel).toBe('East Corridor · 25 km');

    const { result: corridorOnly } = renderHook(() =>
      useDiscoverAgriController({
        nav: makeNav({ selectedRegion: 'E', selectedMaxKm: null }),
        intentListingPurpose: 'sale',
        isAuthenticated: true,
      }),
    );
    expect(corridorOnly.current.agriGroupLabel).toBe('East Corridor');
  });

  it('useAgriMapListings is called with the single canonical selectedLocality areaKey and isAuthenticated (#2151 PR C, C-F2 — no more repeated areaKeys[])', () => {
    renderHook(() =>
      useDiscoverAgriController({
        nav: makeNav({
          selectedRegion: 'E',
          selectedMaxKm: 25,
          city: 'bangalore',
          selectedLocality: 'IN|KA|Udupi|A',
        }),
        intentListingPurpose: 'rent',
        isAuthenticated: false,
      }),
    );
    expect(mockUseAgriMapListings).toHaveBeenCalledWith('bangalore', 'IN|KA|Udupi|A', 'rent', false);
  });

  it('useAgriMapListings is called with an empty areaKey when nav.selectedLocality is unset', () => {
    renderHook(() =>
      useDiscoverAgriController({
        nav: makeNav({ city: 'bangalore' }),
        intentListingPurpose: 'sale',
        isAuthenticated: true,
      }),
    );
    expect(mockUseAgriMapListings).toHaveBeenCalledWith('bangalore', '', 'sale', true);
  });

  it('useRegionalAreaGroups is called with city and intentListingPurpose (#2151 PR C carry-over, C-F3)', () => {
    renderHook(() =>
      useDiscoverAgriController({
        nav: makeNav({ city: 'bangalore' }),
        intentListingPurpose: 'rent',
        isAuthenticated: true,
      }),
    );
    expect(mockUseRegionalAreaGroups).toHaveBeenCalledWith('bangalore', 'rent');
  });

  it('useAgriDestinations is called with city/selectedRegion/selectedMaxKm/intentListingPurpose and its result is exposed as agriDestinations (#2151 PR C, C-F4/C-F7)', () => {
    const { result } = renderHook(() =>
      useDiscoverAgriController({
        nav: makeNav({ selectedRegion: 'E', selectedMaxKm: 25, city: 'bangalore' }),
        intentListingPurpose: 'sale',
        isAuthenticated: true,
      }),
    );
    expect(mockUseAgriDestinations).toHaveBeenCalledWith('bangalore', 'E', 25, 'sale');
    expect(result.current.agriDestinations).toEqual(AGRI_DESTINATIONS_RESULT.destinations);
    expect(result.current.isLoadingAgriDestinations).toBe(false);
    expect(result.current.isAgriDestinationsError).toBe(false);
    expect(result.current.isAgriDestinationsNotYetPromoted).toBe(false);
    expect(result.current.isAgriDestinationsNotGeneratedForRevision).toBe(false);
  });

  it('selectedGroupListingItem finds the matching listing by nav.selectedListing id, null when absent/not found', () => {
    const { result: found } = renderHook(() =>
      useDiscoverAgriController({
        nav: makeNav({ selectedListing: 'listing-1' }),
        intentListingPurpose: 'sale',
        isAuthenticated: true,
      }),
    );
    expect(found.current.selectedGroupListingItem?.id).toBe('listing-1');

    const { result: notFound } = renderHook(() =>
      useDiscoverAgriController({
        nav: makeNav({ selectedListing: 'missing' }),
        intentListingPurpose: 'sale',
        isAuthenticated: true,
      }),
    );
    expect(notFound.current.selectedGroupListingItem).toBeNull();
  });

  it('threads agriMapListingsData/filters/isAuthenticated into useFilteredAgriListings', () => {
    renderHook(() =>
      useDiscoverAgriController({
        nav: makeNav({ filters: { propertyTypes: ['agricultural_land'] } }),
        intentListingPurpose: 'sale',
        isAuthenticated: true,
      }),
    );
    expect(mockUseFilteredAgriListings).toHaveBeenCalledWith({
      agriMapListingsData: AGRI_LISTINGS_RESULT.data,
      filters: { propertyTypes: ['agricultural_land'] },
      isAuthenticated: true,
    });
  });
});
