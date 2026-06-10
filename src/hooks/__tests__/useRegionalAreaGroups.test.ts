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
  REGIONAL_AREA_GROUPS_QUERY_KEY_BASE,
  type CorridorGroupData,
  type CumulativeDistanceTier,
} from '../useRegionalAreaGroups';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
  ApiError: class ApiError extends Error {},
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
});
