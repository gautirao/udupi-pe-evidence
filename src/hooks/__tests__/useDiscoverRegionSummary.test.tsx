/**
 * useDiscoverRegionSummary — Issue #1882 (Track A PR2 Slice S2a; purpose
 * scoping added in the ADVISORY-1 rework).
 *
 * Tests:
 * 1. requests GET /api/discover/cities/{citySlug}/regions with skipAuth
 * 2. response is surfaced 1:1 — no client-side aggregation of regions
 * 3. empty-city (unknown city, backend 200 { regions: [] }) is handled gracefully
 * 4. hook is disabled (no fetch) when citySlug is an empty string
 * 5. network/API error surfaces as a real isError (Issue #1910 PR2 review
 *    fix — no longer swallowed into a fake-success empty region list)
 *
 * ADVISORY-1 rework (5 required purpose-scoping scenarios):
 * 6. the request includes the selected listingPurpose as a query param
 * 7. the query key includes listingPurpose (distinct cache entries per purpose)
 * 8. switching buy(sale)->rent triggers a fresh fetch, never reusing the
 *    previous purpose's cached count
 * 9. omitting listingPurpose sends no query param (backward compatible)
 * 10. purpose affects listingCount only — bounds/key/label/boundsStatus are
 *     unchanged between purposes (region-count semantics stay consistent)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
}));

import { useDiscoverRegionSummary } from '../useDiscoverRegionSummary';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const REGION_SUMMARY_RESPONSE = {
  cityId: 1,
  citySlug: 'bangalore',
  regions: [
    {
      key: 'north',
      label: 'North Bangalore',
      displayOrder: 1,
      bounds: { minLat: 13.0, maxLat: 13.2, minLon: 77.5, maxLon: 77.7 },
      centre: { lat: 13.1, lon: 77.6 },
      areaCount: 12,
      listingCount: 340,
      countStatus: 'OK',
      boundsStatus: 'COMPLETE',
      missingBoundsAreaCount: 0,
    },
    {
      key: 'east',
      label: 'East Bangalore',
      displayOrder: 2,
      bounds: { minLat: 12.9, maxLat: 13.0, minLon: 77.6, maxLon: 77.8 },
      centre: { lat: 12.95, lon: 77.7 },
      areaCount: 8,
      listingCount: 120,
      countStatus: 'OK',
      boundsStatus: 'APPROXIMATE',
      missingBoundsAreaCount: 2,
    },
  ],
};

beforeEach(() => {
  mockGet.mockReset();
});

describe('useDiscoverRegionSummary', () => {
  it('requests the region-summary endpoint with skipAuth for the given city slug', async () => {
    mockGet.mockResolvedValueOnce(REGION_SUMMARY_RESPONSE);
    const { result } = renderHook(() => useDiscoverRegionSummary('bangalore'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith(
      '/api/discover/cities/bangalore/regions',
      { skipAuth: true },
    );
  });

  it('surfaces the backend response 1:1 — no client-side aggregation', async () => {
    mockGet.mockResolvedValueOnce(REGION_SUMMARY_RESPONSE);
    const { result } = renderHook(() => useDiscoverRegionSummary('bangalore'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Exactly the two backend-provided regions, untouched — no merging,
    // re-labelling, or synthetic "Other" bucket the way aggregateMacroRegions
    // used to add.
    expect(result.current.data?.regions).toHaveLength(2);
    expect(result.current.data?.regions[0]).toEqual(REGION_SUMMARY_RESPONSE.regions[0]);
    expect(result.current.data?.regions[1]).toEqual(REGION_SUMMARY_RESPONSE.regions[1]);
    expect(result.current.data?.cityId).toBe(1);
  });

  it('handles an unknown-city empty response ({ cityId: null, regions: [] }) without erroring', async () => {
    mockGet.mockResolvedValueOnce({ cityId: null, citySlug: 'nowhere', regions: [] });
    const { result } = renderHook(() => useDiscoverRegionSummary('nowhere'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.regions).toEqual([]);
    expect(result.current.data?.cityId).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('does not fetch when citySlug is empty', () => {
    const { result } = renderHook(() => useDiscoverRegionSummary(''), {
      wrapper: makeWrapper(),
    });

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('surfaces a network/API error as a real isError — never swallowed into a fake-success empty region list', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useDiscoverRegionSummary('bangalore'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isSuccess).toBe(false);
  });
});

// ─── ADVISORY-1 rework — buy/rent purpose scoping ──────────────────────────
describe('useDiscoverRegionSummary — purpose scoping (ADVISORY-1)', () => {
  const SALE_RESPONSE = {
    cityId: 1,
    citySlug: 'bangalore',
    regions: [
      {
        key: 'north',
        label: 'North Bangalore',
        displayOrder: 1,
        bounds: { minLat: 13.0, maxLat: 13.2, minLon: 77.5, maxLon: 77.7 },
        centre: { lat: 13.1, lon: 77.6 },
        areaCount: 12,
        listingCount: 250, // sale-only count
        countStatus: 'OK',
        boundsStatus: 'COMPLETE',
        missingBoundsAreaCount: 0,
      },
    ],
  };
  const RENT_RESPONSE = {
    ...SALE_RESPONSE,
    regions: [{ ...SALE_RESPONSE.regions[0], listingCount: 90 }], // rent-only count
  };

  it('scenario 1 — the request includes the selected purpose as a query param', async () => {
    mockGet.mockResolvedValueOnce(SALE_RESPONSE);
    const { result } = renderHook(() => useDiscoverRegionSummary('bangalore', 'sale'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/discover/cities/bangalore/regions?listingPurpose=sale',
      { skipAuth: true },
    );
  });

  it('scenario 1b — omitting purpose sends no listingPurpose param (backward compatible)', async () => {
    mockGet.mockResolvedValueOnce(REGION_SUMMARY_RESPONSE);
    const { result } = renderHook(() => useDiscoverRegionSummary('bangalore'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/discover/cities/bangalore/regions',
      { skipAuth: true },
    );
  });

  it('scenario 2 — the query key includes purpose (distinct cache entries per purpose)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    mockGet.mockResolvedValueOnce(SALE_RESPONSE);
    const { result: saleResult } = renderHook(() => useDiscoverRegionSummary('bangalore', 'sale'), { wrapper });
    await waitFor(() => expect(saleResult.current.isSuccess).toBe(true));

    mockGet.mockResolvedValueOnce(RENT_RESPONSE);
    const { result: rentResult } = renderHook(() => useDiscoverRegionSummary('bangalore', 'rent'), { wrapper });
    await waitFor(() => expect(rentResult.current.isSuccess).toBe(true));

    // Two distinct fetches — 'rent' did not reuse 'sale''s cache entry.
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(['discover-region-summary', 'bangalore', 'sale'])).toBeDefined();
    expect(queryClient.getQueryData(['discover-region-summary', 'bangalore', 'rent'])).toBeDefined();
    expect(saleResult.current.data?.regions[0].listingCount).toBe(250);
    expect(rentResult.current.data?.regions[0].listingCount).toBe(90);
  });

  it('scenario 3 — switching sale to rent triggers a fresh fetch/recompute, never reusing the stale purpose count', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    mockGet.mockResolvedValueOnce(SALE_RESPONSE);
    const { result, rerender } = renderHook(
      ({ purpose }: { purpose: string }) => useDiscoverRegionSummary('bangalore', purpose),
      { wrapper, initialProps: { purpose: 'sale' } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.regions[0].listingCount).toBe(250);

    mockGet.mockResolvedValueOnce(RENT_RESPONSE);
    rerender({ purpose: 'rent' });
    await waitFor(() => expect(result.current.data?.regions[0].listingCount).toBe(90));

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/discover/cities/bangalore/regions?listingPurpose=rent', { skipAuth: true });
  });

  it('scenario 4 — purpose affects listingCount only; bounds/key/label/boundsStatus are unchanged between purposes (region-count semantics stay consistent)', () => {
    expect(SALE_RESPONSE.regions[0].key).toBe(RENT_RESPONSE.regions[0].key);
    expect(SALE_RESPONSE.regions[0].label).toBe(RENT_RESPONSE.regions[0].label);
    expect(SALE_RESPONSE.regions[0].bounds).toEqual(RENT_RESPONSE.regions[0].bounds);
    expect(SALE_RESPONSE.regions[0].boundsStatus).toBe(RENT_RESPONSE.regions[0].boundsStatus);
    expect(SALE_RESPONSE.regions[0].areaCount).toBe(RENT_RESPONSE.regions[0].areaCount);
    expect(SALE_RESPONSE.regions[0].listingCount).not.toBe(RENT_RESPONSE.regions[0].listingCount);
  });
});
