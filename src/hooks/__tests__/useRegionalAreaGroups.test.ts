/**
 * Unit tests for useRegionalAreaGroups
 *
 * Covers:
 * - normalizeRegionalAreaGroupsResponse: all fields mapped correctly
 * - normalizeRegionalAreaGroupsResponse: agriAcreage=null when absent
 * - normalizeRegionalAreaGroupsResponse: rows without label are skipped
 * - normalizeRegionalAreaGroupsResponse: areaKeys defaults to []
 * - normalizeRegionalAreaGroupsResponse: distanceBandKey '50_up' round-trips correctly
 * - Hook: query key is ['regional-area-groups', city, 'agricultural_land']
 * - Hook: enabled=false when city is empty
 * - Hook: error → { city, groups: [] } (no throw)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  normalizeRegionalAreaGroupsResponse,
  useRegionalAreaGroups,
  REGIONAL_AREA_GROUPS_QUERY_KEY_BASE,
  type RegionalAreaGroup,
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
  it('maps all fields correctly for a complete DTO row', () => {
    const dto = {
      city: 'udupi',
      groups: [
        {
          label: 'North of Udupi · 10–25 km',
          directionKey: 'N',
          distanceBandKey: '10_25',
          listingCount: 7,
          agriAcreage: 125.5,
          areaKeys: ['IN|KA|Udupi|Area1', 'IN|KA|Udupi|Area2'],
        },
      ],
    };

    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');

    expect(result.city).toBe('udupi');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toEqual<RegionalAreaGroup>({
      label: 'North of Udupi · 10–25 km',
      directionKey: 'N',
      distanceBandKey: '10_25',
      listingCount: 7,
      agriAcreage: 125.5,
      areaKeys: ['IN|KA|Udupi|Area1', 'IN|KA|Udupi|Area2'],
    });
  });

  it('maps agriAcreage to null when the backend omits the field', () => {
    const dto = {
      city: 'udupi',
      groups: [
        {
          label: 'South of Udupi · 0–10 km',
          directionKey: 'S',
          distanceBandKey: '0_10',
          listingCount: 3,
          // agriAcreage intentionally absent (backend @JsonInclude NON_NULL)
          areaKeys: ['IN|KA|Udupi|SouthArea'],
        },
      ],
    };

    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');
    expect(result.groups[0].agriAcreage).toBeNull();
  });

  it('maps agriAcreage to null when explicitly null', () => {
    const dto = {
      city: 'udupi',
      groups: [{ label: 'East · 25–50 km', directionKey: 'E', distanceBandKey: '25_50', listingCount: 0, agriAcreage: null, areaKeys: [] }],
    };
    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');
    expect(result.groups[0].agriAcreage).toBeNull();
  });

  it('handles distanceBandKey of 50_up correctly (not 50_PLUS)', () => {
    const dto = {
      city: 'udupi',
      groups: [
        {
          label: 'North of Udupi · 50+ km',
          directionKey: 'N',
          distanceBandKey: '50_up',
          listingCount: 2,
          areaKeys: ['IN|KA|Udupi|FarNorth'],
        },
      ],
    };

    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');
    expect(result.groups[0].distanceBandKey).toBe('50_up');
  });

  it('skips rows without a label', () => {
    const dto = {
      city: 'udupi',
      groups: [
        { directionKey: 'N', distanceBandKey: '0_10', listingCount: 5, areaKeys: [] }, // no label
        { label: 'Has Label', directionKey: 'S', distanceBandKey: '0_10', listingCount: 1, areaKeys: [] },
      ],
    };

    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].label).toBe('Has Label');
  });

  it('defaults areaKeys to empty array when absent or null', () => {
    const dto = {
      groups: [
        { label: 'No Keys', directionKey: 'W', distanceBandKey: '10_25', listingCount: 0 },
        { label: 'Null Keys', directionKey: 'E', distanceBandKey: '10_25', listingCount: 0, areaKeys: null },
      ],
    };

    const result = normalizeRegionalAreaGroupsResponse(dto, 'udupi');
    expect(result.groups[0].areaKeys).toEqual([]);
    expect(result.groups[1].areaKeys).toEqual([]);
  });

  it('returns empty groups when input groups is null', () => {
    const result = normalizeRegionalAreaGroupsResponse({ city: 'udupi', groups: null }, 'udupi');
    expect(result.groups).toEqual([]);
  });

  it('returns empty groups when input groups is missing', () => {
    const result = normalizeRegionalAreaGroupsResponse({} as any, 'udupi');
    expect(result.groups).toEqual([]);
  });

  it('uses city fallback from second arg when dto.city is missing', () => {
    const result = normalizeRegionalAreaGroupsResponse({ groups: [] }, 'kundapur');
    expect(result.city).toBe('kundapur');
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

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify the api.get call used the correct URL
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

  it('returns normalized data on success', async () => {
    mockApiGet.mockResolvedValueOnce({
      city: 'udupi',
      groups: [
        {
          label: 'North of Udupi · 10–25 km',
          directionKey: 'N',
          distanceBandKey: '10_25',
          listingCount: 4,
          agriAcreage: 88.0,
          areaKeys: ['area1'],
        },
        {
          label: 'North of Udupi · 50+ km',
          directionKey: 'N',
          distanceBandKey: '50_up',
          listingCount: 1,
          areaKeys: [],
        },
      ],
    });

    const { result } = renderHook(() => useRegionalAreaGroups('udupi'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.groups).toHaveLength(2);
    expect(result.current.data?.groups[0].label).toBe('North of Udupi · 10–25 km');
    expect(result.current.data?.groups[0].agriAcreage).toBe(88.0);
    expect(result.current.data?.groups[1].distanceBandKey).toBe('50_up');
    expect(result.current.data?.groups[1].agriAcreage).toBeNull();
  });

  it('returns { city, groups: [] } on API error without throwing', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useRegionalAreaGroups('udupi'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ city: 'udupi', groups: [] });
  });

  it('query key base constant is correct', () => {
    expect(REGIONAL_AREA_GROUPS_QUERY_KEY_BASE).toEqual(['regional-area-groups']);
  });
});
