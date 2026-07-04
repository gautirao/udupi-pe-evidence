/**
 * useDiscoverSummary — Issue #1745 P6
 *
 * Tests:
 * 1. URL/query construction includes city, propertyType, groupBy, hotspotLimit when all provided
 * 2. default groupBy is OMITTED from the querystring when not explicitly passed
 * 3. hotspotLimit default (8) sent when not provided; out-of-range values clamped to [1,20]
 * 4. propertyType included when provided, omitted when undefined/blank/whitespace
 * 5. hook is disabled (no fetch call) when city is empty string
 * 6. success response is parsed into the typed DiscoverSummaryResponse
 * 7. error handling: ApiError surfaces via isError/error
 * 8. loading state transitions before resolution
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.status = status;
      this.body = body;
    }
  },
}));

// ─── Import hook + ApiError AFTER mocks ────────────────────────
import { useDiscoverSummary } from '../useDiscoverSummary';
import { ApiError } from '@/lib/api';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const SUMMARY_RESPONSE = {
  city: 'udupi',
  propertyType: null,
  groupBy: 'area_group',
  totalActiveListings: 123,
  regions: [
    { regionKey: 'IN|KA|Udupi|Manipal', regionLabel: 'Manipal', listingCount: 42 },
  ],
  hotspots: [
    {
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      listingCount: 42,
      geoCenterLat: 13.35,
      geoCenterLon: 74.79,
    },
  ],
  generatedAt: '2026-07-04T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

function getRequestedUrl(): string {
  const [url] = mockGet.mock.calls[0] as [string, unknown];
  return url;
}

describe('useDiscoverSummary — query construction', () => {
  it('1: includes city, propertyType, groupBy, hotspotLimit when all provided', async () => {
    mockGet.mockResolvedValue(SUMMARY_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverSummary({
          city: 'udupi',
          propertyType: 'apartment',
          groupBy: 'corridor',
          hotspotLimit: 5,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = new URLSearchParams(getRequestedUrl().split('?')[1]);
    expect(params.get('city')).toBe('udupi');
    expect(params.get('propertyType')).toBe('apartment');
    expect(params.get('groupBy')).toBe('corridor');
    expect(params.get('hotspotLimit')).toBe('5');
  });

  it('2: default groupBy is omitted from the querystring when not explicitly passed', async () => {
    mockGet.mockResolvedValue(SUMMARY_RESPONSE);

    const { result } = renderHook(() => useDiscoverSummary({ city: 'udupi' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = new URLSearchParams(getRequestedUrl().split('?')[1]);
    expect(params.has('groupBy')).toBe(false);
  });

  it('3a: hotspotLimit default (8) sent when not provided', async () => {
    mockGet.mockResolvedValue(SUMMARY_RESPONSE);

    const { result } = renderHook(() => useDiscoverSummary({ city: 'udupi' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = new URLSearchParams(getRequestedUrl().split('?')[1]);
    expect(params.get('hotspotLimit')).toBe('8');
  });

  it.each([
    [0, '1'],
    [-5, '1'],
    [50, '20'],
    [21, '20'],
  ])('3b: out-of-range hotspotLimit %d is clamped to %s', async (input, expected) => {
    mockGet.mockResolvedValue(SUMMARY_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverSummary({ city: 'udupi', hotspotLimit: input }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = new URLSearchParams(getRequestedUrl().split('?')[1]);
    expect(params.get('hotspotLimit')).toBe(expected);
  });

  it.each([
    [1, '1'],
    [20, '20'],
  ])('3c: inclusive boundary hotspotLimit %d passes through unclamped as %s', async (input, expected) => {
    mockGet.mockResolvedValue(SUMMARY_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverSummary({ city: 'udupi', hotspotLimit: input }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = new URLSearchParams(getRequestedUrl().split('?')[1]);
    expect(params.get('hotspotLimit')).toBe(expected);
  });

  it('3d: fractional hotspotLimit is truncated to an integer', async () => {
    mockGet.mockResolvedValue(SUMMARY_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverSummary({ city: 'udupi', hotspotLimit: 3.7 }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = new URLSearchParams(getRequestedUrl().split('?')[1]);
    expect(params.get('hotspotLimit')).toBe('3');
  });

  it('4a: propertyType included when provided', async () => {
    mockGet.mockResolvedValue(SUMMARY_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverSummary({ city: 'udupi', propertyType: 'villa' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = new URLSearchParams(getRequestedUrl().split('?')[1]);
    expect(params.get('propertyType')).toBe('villa');
  });

  it('4b: propertyType omitted when undefined', async () => {
    mockGet.mockResolvedValue(SUMMARY_RESPONSE);

    const { result } = renderHook(() => useDiscoverSummary({ city: 'udupi' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = new URLSearchParams(getRequestedUrl().split('?')[1]);
    expect(params.has('propertyType')).toBe(false);
  });

  it('4c: propertyType omitted when blank/whitespace', async () => {
    mockGet.mockResolvedValue(SUMMARY_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverSummary({ city: 'udupi', propertyType: '   ' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = new URLSearchParams(getRequestedUrl().split('?')[1]);
    expect(params.has('propertyType')).toBe(false);
  });
});

describe('useDiscoverSummary — enabled guard', () => {
  it('5: disabled (no fetch call) when city is empty string', () => {
    const { result } = renderHook(() => useDiscoverSummary({ city: '' }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('5b: disabled (no fetch call) when city is whitespace-only', () => {
    const { result } = renderHook(() => useDiscoverSummary({ city: '   ' }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('useDiscoverSummary — response parsing', () => {
  it('6: success response is parsed into the typed DiscoverSummaryResponse', async () => {
    mockGet.mockResolvedValue(SUMMARY_RESPONSE);

    const { result } = renderHook(() => useDiscoverSummary({ city: 'udupi' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(SUMMARY_RESPONSE);
    expect(result.current.data?.totalActiveListings).toBe(123);
    expect(result.current.data?.regions[0].regionLabel).toBe('Manipal');
    expect(result.current.data?.hotspots[0].areaKey).toBe('IN|KA|Udupi|Manipal');
  });
});

describe('useDiscoverSummary — error handling', () => {
  it('7: ApiError surfaces via isError/error', async () => {
    const apiError = new ApiError('API request failed: 400 Bad Request', 400, {
      message: 'invalid groupBy',
    });
    mockGet.mockRejectedValue(apiError);

    const { result } = renderHook(() => useDiscoverSummary({ city: 'udupi' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(apiError);
  });
});

describe('useDiscoverSummary — loading state', () => {
  it('8: isLoading/isPending is true before resolution, false after', async () => {
    let resolveFn: (value: typeof SUMMARY_RESPONSE) => void = () => {};
    mockGet.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );

    const { result } = renderHook(() => useDiscoverSummary({ city: 'udupi' }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPending).toBe(true);

    resolveFn(SUMMARY_RESPONSE);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isLoading).toBe(false);
  });
});
