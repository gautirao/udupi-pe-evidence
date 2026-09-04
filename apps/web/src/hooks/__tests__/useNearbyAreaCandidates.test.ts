/**
 * Issue #2017 code-review Finding 2 (PR #2424) — useNearbyAreaCandidates: the
 * bounded, filter-aware "nearby area" suggestion hook backing the AREA_SET
 * multi-area chip strip's "Add area" dropdown, replacing the pure
 * client-side selectNearbyAreaSuggestions selector. Follows the
 * useDiscoverAreas.test.ts conventions (vi.hoisted mock of @/lib/api,
 * preview-mode wrapper) since both are simple city/filter-driven GET query
 * hooks sharing discoverKey/useDiscoverSource.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

import { useNearbyAreaCandidates } from '../useNearbyAreaCandidates';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { NearbyAreaCandidatesResponse } from '../useNearbyAreaCandidates';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makePreviewWrapper(cityId: number, revisionId: number) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(DiscoverDataSourceProvider, {
        value: { mode: 'preview', cityId, revisionId, citySlug: 'preview-city' },
        children,
      }),
    );
}

const NO_FILTERS: PropertyFilters = {};

const RESPONSE: NearbyAreaCandidatesResponse = {
  city: 'udupi',
  selectedAreaKeys: ['area:manipal'],
  candidates: [
    {
      areaKey: 'area:kaup',
      name: 'Kaup',
      geoCenterLat: 13.21,
      geoCenterLon: 74.74,
      eligibleListingCount: 12,
      schoolCount: 3,
    },
  ],
};

describe('useNearbyAreaCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches from the nearby-candidates endpoint and passes the response through unmodified', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const { result } = renderHook(
      () => useNearbyAreaCandidates('udupi', ['area:manipal'], NO_FILTERS),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(RESPONSE);

    const [path, options] = mockGet.mock.calls[0] as [string, unknown];
    expect(path).toContain('/api/discover/areas/nearby-candidates?');
    expect(path).toContain('city=udupi');
    expect(path).toContain('selected=area%3Amanipal');
    expect(options).toEqual({ skipAuth: true });
  });

  it('appends limit to the request when provided', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const { result } = renderHook(
      () => useNearbyAreaCandidates('udupi', [], NO_FILTERS, 6),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path] = mockGet.mock.calls[0] as [string];
    expect(path).toContain('limit=6');
  });

  it('registers a queryKey of [discover-nearby-area-candidates, city, sortedSelected, filters, limit] in live mode', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(
      () => useNearbyAreaCandidates('udupi', ['area:manipal'], NO_FILTERS),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual([
      'discover-nearby-area-candidates',
      'udupi',
      ['area:manipal'],
      NO_FILTERS,
      null,
    ]);
  });

  it('sorts the selected area keys before entering the queryKey, so reordering the selection does not bust the cache', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result, rerender } = renderHook(
      ({ selected }: { selected: string[] }) =>
        useNearbyAreaCandidates('udupi', selected, NO_FILTERS),
      { wrapper, initialProps: { selected: ['area:b', 'area:a'] } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Same members, different insertion order — sortedSelected should
    // produce the SAME queryKey, so no second fetch happens.
    rerender({ selected: ['area:a', 'area:b'] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual([
      'discover-nearby-area-candidates',
      'udupi',
      ['area:a', 'area:b'],
      NO_FILTERS,
      null,
    ]);
  });

  it('busts the cache and refetches when filters change', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const { result, rerender } = renderHook(
      ({ filters }: { filters: PropertyFilters }) =>
        useNearbyAreaCandidates('udupi', [], filters),
      { wrapper: makeWrapper(), initialProps: { filters: NO_FILTERS } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);

    rerender({ filters: { bedrooms: [2, 3] } });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('is disabled (idle, no fetch) when city is an empty string', () => {
    const { result } = renderHook(() => useNearbyAreaCandidates('', [], NO_FILTERS), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('is disabled (idle, no fetch) in preview mode — NearbyAreaCandidatesController has no preview counterpart', () => {
    const { result } = renderHook(
      () => useNearbyAreaCandidates('udupi', ['area:manipal'], NO_FILTERS),
      { wrapper: makePreviewWrapper(7, 42) },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });
});
