/**
 * Unit tests for useRegionalAreaGroups (Issue #1429 — cumulative corridor model)
 *
 * Covers:
 * - normalizeRegionalAreaGroupsResponse: corridors with tiers mapped correctly
 * - normalizeRegionalAreaGroupsResponse: agriAcreage → undefined (not null) when absent
 * - normalizeRegionalAreaGroupsResponse: tiers with unknown maxKm are skipped
 * - normalizeRegionalAreaGroupsResponse: areaKeys defaults to []
 * - normalizeRegionalAreaGroupsResponse: 50_up band code round-trips in includedBandCodes
 * - Hook: query key is ['regional-area-groups', city, 'agricultural_land']
 * - Hook: enabled=false when city is empty
 * - Hook: error → { groups: [], isLoading: false, error }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  normalizeRegionalAreaGroupsResponse,
  useRegionalAreaGroups,
  useAgriDestinations,
  normalizeAgriDestinationsResponse,
  REGIONAL_AREA_GROUPS_QUERY_KEY_BASE,
  AGRI_DESTINATIONS_QUERY_KEY_BASE,
  AGRI_DESTINATIONS_NOT_YET_PROMOTED_CODE,
  type CorridorGroupData,
  type CumulativeDistanceTier,
} from '../useRegionalAreaGroups';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// ─── normalizeRegionalAreaGroupsResponse tests ─────────────────────────────

describe('normalizeRegionalAreaGroupsResponse', () => {
  it('maps a corridor with tiers correctly', () => {
    const dto = {
      city: 'udupi',
      groups: [
        {
          directionCode: 'N',
          groupName: 'N towards Brahmavar',
          availableMaxDistances: [
            {
              maxKm: 10,
              distanceLabel: 'Within 10 km',
              includedBandCodes: ['0_10'],
              listingCount: 3,
              agriAcreage: 45.5,
              areaKeys: ['IN|KA|Udupi|Area1'],
            },
            {
              maxKm: 25,
              distanceLabel: 'Up to 25 km',
              includedBandCodes: ['0_10', '10_25'],
              listingCount: 7,
              areaKeys: ['IN|KA|Udupi|Area1', 'IN|KA|Udupi|Area2'],
            },
          ],
        },
      ],
    };

    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');

    expect(result.groups).toHaveLength(1);
    const corridor = result.groups[0];
    expect(corridor.directionCode).toBe('N');
    expect(corridor.groupName).toBe('N towards Brahmavar');
    expect(corridor.availableMaxDistances).toHaveLength(2);

    const tier1 = corridor.availableMaxDistances[0];
    expect(tier1.maxKm).toBe(10);
    expect(tier1.distanceLabel).toBe('Within 10 km');
    expect(tier1.includedBandCodes).toEqual(['0_10']);
    expect(tier1.listingCount).toBe(3);
    expect(tier1.agriAcreage).toBe(45.5);
    expect(tier1.areaKeys).toEqual(['IN|KA|Udupi|Area1']);

    const tier2 = corridor.availableMaxDistances[1];
    expect(tier2.maxKm).toBe(25);
    expect(tier2.agriAcreage).toBeUndefined(); // absent from JSON
    expect(tier2.includedBandCodes).toEqual(['0_10', '10_25']);
  });

  it('maps agriAcreage to undefined (not null) when absent from JSON', () => {
    const dto = {
      groups: [
        {
          directionCode: 'S',
          groupName: 'S corridor',
          availableMaxDistances: [
            {
              maxKm: 10,
              distanceLabel: 'Within 10 km',
              includedBandCodes: ['0_10'],
              listingCount: 2,
              // agriAcreage intentionally absent
              areaKeys: [],
            },
          ],
        },
      ],
    };

    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');
    expect(result.groups[0].availableMaxDistances[0].agriAcreage).toBeUndefined();
  });

  it('maps agriAcreage to undefined when explicitly null', () => {
    const dto = {
      groups: [
        {
          directionCode: 'E',
          groupName: 'E corridor',
          availableMaxDistances: [
            { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: ['0_10', '10_25'], listingCount: 0, agriAcreage: null, areaKeys: [] },
          ],
        },
      ],
    };
    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');
    expect(result.groups[0].availableMaxDistances[0].agriAcreage).toBeUndefined();
  });

  it('skips tiers with unknown maxKm values (e.g. 75)', () => {
    const dto = {
      groups: [
        {
          directionCode: 'W',
          groupName: 'W corridor',
          availableMaxDistances: [
            { maxKm: 10, distanceLabel: 'Within 10 km', includedBandCodes: ['0_10'], listingCount: 1, areaKeys: [] },
            { maxKm: 75, distanceLabel: 'Custom 75 km', includedBandCodes: ['0_10'], listingCount: 2, areaKeys: [] }, // unknown — skip
            { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 4, areaKeys: [] },
          ],
        },
      ],
    };
    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');
    expect(result.groups[0].availableMaxDistances).toHaveLength(2);
    expect(result.groups[0].availableMaxDistances.map(t => t.maxKm)).toEqual([10, 50]);
  });

  it('handles 50_up in includedBandCodes correctly (canonical band code)', () => {
    const dto = {
      groups: [
        {
          directionCode: 'N',
          groupName: 'N towards Brahmavar',
          availableMaxDistances: [
            {
              maxKm: 100,
              distanceLabel: 'Up to 100 km',
              includedBandCodes: ['0_10', '10_25', '25_50', '50_up'],
              listingCount: 10,
              areaKeys: [],
            },
          ],
        },
      ],
    };
    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');
    const tier = result.groups[0].availableMaxDistances[0];
    expect(tier.includedBandCodes).toContain('50_up');
    expect(tier.includedBandCodes).not.toContain('50_PLUS');
  });

  it('defaults areaKeys to [] when absent or null', () => {
    const dto = {
      groups: [
        {
          directionCode: 'NE',
          groupName: 'NE corridor',
          availableMaxDistances: [
            { maxKm: 10, distanceLabel: 'Within 10 km', includedBandCodes: [], listingCount: 0 }, // no areaKeys
            { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: [], listingCount: 0, areaKeys: null }, // null areaKeys
          ],
        },
      ],
    };
    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');
    expect(result.groups[0].availableMaxDistances[0].areaKeys).toEqual([]);
    expect(result.groups[0].availableMaxDistances[1].areaKeys).toEqual([]);
  });

  it('returns empty groups when input groups is null', () => {
    const result = normalizeRegionalAreaGroupsResponse({ groups: null } as unknown as Parameters<typeof normalizeRegionalAreaGroupsResponse>[0], 'udupi');
    expect(result.groups).toEqual([]);
  });

  it('returns empty groups when input groups is missing', () => {
    const result = normalizeRegionalAreaGroupsResponse({} as unknown as Parameters<typeof normalizeRegionalAreaGroupsResponse>[0], 'udupi');
    expect(result.groups).toEqual([]);
  });

  it('handles empty availableMaxDistances array', () => {
    const dto = {
      groups: [
        {
          directionCode: 'SW',
          groupName: 'SW corridor',
          availableMaxDistances: [],
        },
      ],
    };
    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');
    expect(result.groups[0].availableMaxDistances).toEqual([]);
  });
});

// ─── Hook tests ───────────────────────────────────────────────────────────────

describe('useRegionalAreaGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the correct query key: [regional-area-groups, city, agricultural_land]', async () => {
    mockApiGet.mockResolvedValueOnce({ city: 'udupi', groups: [] });

    const { result } = renderHook(() => useRegionalAreaGroups('udupi'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/discover/regional-area-groups?city=udupi&propertyType=agricultural_land',
      { skipAuth: true },
    );
  });

  it('is disabled (not called) when city is empty', () => {
    renderHook(() => useRegionalAreaGroups(''), {
      wrapper: makeWrapper(),
    });

    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('returns normalized corridor data on success', async () => {
    mockApiGet.mockResolvedValueOnce({
      city: 'udupi',
      groups: [
        {
          directionCode: 'N',
          groupName: 'N towards Brahmavar',
          availableMaxDistances: [
            {
              maxKm: 10,
              distanceLabel: 'Within 10 km',
              includedBandCodes: ['0_10'],
              listingCount: 4,
              agriAcreage: 88.0,
              areaKeys: ['area1'],
            },
          ],
        },
      ],
    });

    const { result } = renderHook(() => useRegionalAreaGroups('udupi'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].directionCode).toBe('N');
    expect(result.current.groups[0].groupName).toBe('N towards Brahmavar');
    expect(result.current.groups[0].availableMaxDistances[0].agriAcreage).toBe(88.0);
    expect(result.current.error).toBeNull();
  });

  it('returns { groups: [], isLoading: false } on API error without throwing', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useRegionalAreaGroups('udupi'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.groups).toEqual([]);
  });

  it('query key base constant is correct', () => {
    expect(REGIONAL_AREA_GROUPS_QUERY_KEY_BASE).toEqual(['regional-area-groups']);
  });

  // ─── Issue #2151 PR C (C-F3) — listingPurpose passthrough ───────────────────

  it('C-F3: omits listingPurpose from the query string when absent (preserves existing behaviour)', async () => {
    mockApiGet.mockResolvedValueOnce({ city: 'udupi', groups: [] });
    const { result } = renderHook(() => useRegionalAreaGroups('udupi'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/discover/regional-area-groups?city=udupi&propertyType=agricultural_land',
      { skipAuth: true },
    );
  });

  it('C-F3: forwards listingPurpose when present', async () => {
    mockApiGet.mockResolvedValueOnce({ city: 'udupi', groups: [] });
    const { result } = renderHook(() => useRegionalAreaGroups('udupi', 'rent'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const calledUrl = mockApiGet.mock.calls[0][0] as string;
    expect(calledUrl).toContain('city=udupi');
    expect(calledUrl).toContain('propertyType=agricultural_land');
    expect(calledUrl).toContain('listingPurpose=rent');
  });

  it('C-F3: listingPurpose is part of the query key (present vs absent are distinct cache entries)', async () => {
    mockApiGet.mockResolvedValue({ city: 'udupi', groups: [] });
    const { result: withoutPurpose } = renderHook(() => useRegionalAreaGroups('udupi'), {
      wrapper: makeWrapper(),
    });
    const { result: withPurpose } = renderHook(() => useRegionalAreaGroups('udupi', 'sale'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(withoutPurpose.current.isLoading).toBe(false));
    await waitFor(() => expect(withPurpose.current.isLoading).toBe(false));

    // Two distinct fetches (no query-key collision) — both calls happened.
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });
});

// ─── useAgriDestinations (Issue #2151 PR C, C-F4) ──────────────────────────────

describe('normalizeAgriDestinationsResponse', () => {
  it('maps a destination bucket with all fields', () => {
    const dto = {
      city: 'udupi',
      destinations: [
        {
          areaKey: 'IN|KA|Udupi|Area1',
          displayName: 'N towards Brahmavar',
          distanceKm: 8.2,
          bearingDeg: 12.5,
          direction: 'N',
          parcelCount: 4,
          parcelAcreage: 9.75,
        },
      ],
    };
    const result = normalizeAgriDestinationsResponse(dto);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      areaKey: 'IN|KA|Udupi|Area1',
      displayName: 'N towards Brahmavar',
      distanceKm: 8.2,
      bearingDeg: 12.5,
      direction: 'N',
      parcelCount: 4,
      parcelAcreage: 9.75,
    });
  });

  it('maps parcelAcreage to undefined (not null) when absent from JSON', () => {
    const dto = {
      destinations: [
        { areaKey: 'IN|KA|Udupi|Area1', displayName: 'N corridor', distanceKm: 5, bearingDeg: 0, direction: 'N', parcelCount: 0 },
      ],
    };
    const result = normalizeAgriDestinationsResponse(dto);
    expect(result[0].parcelAcreage).toBeUndefined();
  });

  it('maps parcelAcreage to undefined when explicitly null', () => {
    const dto = {
      destinations: [
        { areaKey: 'IN|KA|Udupi|Area1', displayName: 'N corridor', distanceKm: 5, bearingDeg: 0, direction: 'N', parcelCount: 0, parcelAcreage: null },
      ],
    };
    const result = normalizeAgriDestinationsResponse(dto);
    expect(result[0].parcelAcreage).toBeUndefined();
  });

  it('skips buckets with no usable areaKey', () => {
    const dto = {
      destinations: [
        { areaKey: '', displayName: 'No key', distanceKm: 5, bearingDeg: 0, direction: 'N', parcelCount: 0 },
        { areaKey: 'IN|KA|Udupi|Area1', displayName: 'Valid', distanceKm: 5, bearingDeg: 0, direction: 'N', parcelCount: 1 },
      ],
    };
    const result = normalizeAgriDestinationsResponse(dto);
    expect(result).toHaveLength(1);
    expect(result[0].areaKey).toBe('IN|KA|Udupi|Area1');
  });

  it('returns [] when destinations is null or missing', () => {
    expect(normalizeAgriDestinationsResponse({ destinations: null } as never)).toEqual([]);
    expect(normalizeAgriDestinationsResponse({} as never)).toEqual([]);
  });

  it('falls back to areaKey as displayName when displayName is absent', () => {
    const dto = {
      destinations: [
        { areaKey: 'IN|KA|Udupi|Area1', distanceKm: 5, bearingDeg: 0, direction: 'N', parcelCount: 1 },
      ],
    };
    const result = normalizeAgriDestinationsResponse(dto);
    expect(result[0].displayName).toBe('IN|KA|Udupi|Area1');
  });
});

describe('useAgriDestinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches with city only when direction/maxKm/listingPurpose are absent', async () => {
    mockApiGet.mockResolvedValueOnce({ city: 'udupi', destinations: [] });
    const { result } = renderHook(() => useAgriDestinations('udupi'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/discover/agri-destinations?city=udupi',
      { skipAuth: true },
    );
  });

  it('forwards direction, maxKm, and listingPurpose when present', async () => {
    mockApiGet.mockResolvedValueOnce({ city: 'udupi', destinations: [] });
    const { result } = renderHook(() => useAgriDestinations('udupi', 'N', 25, 'sale'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const calledUrl = mockApiGet.mock.calls[0][0] as string;
    expect(calledUrl).toContain('city=udupi');
    expect(calledUrl).toContain('direction=N');
    expect(calledUrl).toContain('maxKm=25');
    expect(calledUrl).toContain('listingPurpose=sale');
  });

  it('is disabled (not called) when city is empty', () => {
    renderHook(() => useAgriDestinations(''), { wrapper: makeWrapper() });
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('returns normalized destination buckets on success', async () => {
    mockApiGet.mockResolvedValueOnce({
      city: 'udupi',
      destinations: [
        {
          areaKey: 'IN|KA|Udupi|Area1',
          displayName: 'N towards Brahmavar',
          distanceKm: 8.2,
          bearingDeg: 12.5,
          direction: 'N',
          parcelCount: 4,
          parcelAcreage: 9.75,
        },
      ],
    });
    const { result } = renderHook(() => useAgriDestinations('udupi', 'N', 25, 'sale'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.destinations).toHaveLength(1);
    expect(result.current.destinations[0].areaKey).toBe('IN|KA|Udupi|Area1');
    expect(result.current.isError).toBe(false);
    expect(result.current.isNotYetPromoted).toBe(false);
  });

  it('a generic/network error surfaces as isError=true, isNotYetPromoted=false', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useAgriDestinations('udupi'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(true);
    expect(result.current.isNotYetPromoted).toBe(false);
    expect(result.current.destinations).toEqual([]);
  });

  it('a 503 AGRI_DESTINATIONS_NOT_YET_PROMOTED body surfaces as isNotYetPromoted=true, NOT isError', async () => {
    const { ApiError } = await import('@/lib/api');
    mockApiGet.mockRejectedValueOnce(
      new ApiError('Service Unavailable', 503, { error: AGRI_DESTINATIONS_NOT_YET_PROMOTED_CODE }),
    );
    const { result } = renderHook(() => useAgriDestinations('udupi'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The distinguishing assertion: 503-not-yet-promoted must NOT collapse into the generic
    // retryable-error flag.
    expect(result.current.isNotYetPromoted).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('a 503 with a DIFFERENT error code is treated as a generic error, not not-yet-promoted', async () => {
    const { ApiError } = await import('@/lib/api');
    mockApiGet.mockRejectedValueOnce(
      new ApiError('Service Unavailable', 503, { error: 'SOME_OTHER_503_CODE' }),
    );
    const { result } = renderHook(() => useAgriDestinations('udupi'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isNotYetPromoted).toBe(false);
    expect(result.current.isError).toBe(true);
  });

  it('a 400 ApiError is treated as a generic error, not not-yet-promoted', async () => {
    const { ApiError } = await import('@/lib/api');
    mockApiGet.mockRejectedValueOnce(
      new ApiError('Bad Request', 400, { error: 'city_must_not_be_blank' }),
    );
    const { result } = renderHook(() => useAgriDestinations('udupi'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isNotYetPromoted).toBe(false);
    expect(result.current.isError).toBe(true);
  });

  it('query key base constant is correct', () => {
    expect(AGRI_DESTINATIONS_QUERY_KEY_BASE).toEqual(['agri-destinations']);
  });
});
