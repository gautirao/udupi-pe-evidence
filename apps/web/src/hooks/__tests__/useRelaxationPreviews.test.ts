/**
 * Issue #2018 (slice 2) — useRelaxationPreviews: deterministic filter-relaxation
 * count previews for the zero-result recovery panel.
 *
 * Follows useNearbyAreaCandidates.test.ts's conventions (vi.hoisted mock of
 * @/lib/api, preview-mode wrapper), since both are city/filter-driven GET query
 * hooks sharing discoverKey/useDiscoverSource.
 *
 * The load-bearing test here is the stale-response guard, which the issue
 * requires explicitly ("stale preview responses cannot overwrite newer
 * filters/scope"). It is implemented structurally rather than with a
 * hand-rolled sequence counter, so it is worth proving rather than asserting.
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

import { useRelaxationPreviews } from '../useRelaxationPreviews';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { RelaxationPreviewsResponse } from '../useRelaxationPreviews';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makePreviewWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(DiscoverDataSourceProvider, {
        value: { mode: 'preview', cityId: 1, revisionId: 2, citySlug: 'preview-city' },
        children,
      }),
    );
}

const AREAS = ['IN|KA|Bengaluru|Jakkur', 'IN|KA|Bengaluru|Thanisandra'];
const FILTERS: PropertyFilters = { priceMax: 5_000_000 };

const RESPONSE: RelaxationPreviewsResponse = {
  city: 'bangalore',
  areaKeys: AREAS,
  baselineCount: 0,
  previews: [{ kind: 'PRICE_MAX', resultingCount: 7, priceMax: 6_000_000 }],
};

describe('useRelaxationPreviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches from the relaxation-previews endpoint and passes the response through unmodified', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const { result } = renderHook(
      () => useRelaxationPreviews('bangalore', AREAS, FILTERS),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(RESPONSE);

    const [path, options] = mockGet.mock.calls[0] as [string, unknown];
    expect(path).toContain('/api/discover/areas/relaxation-previews?');
    expect(path).toContain('city=bangalore');
    expect(path).toContain('areaKeys=');
    // Anonymous: the recovery panel must work for a signed-out shopper.
    expect(options).toEqual({ skipAuth: true });
  });

  it('sends every committed area key, so counts are scoped to the whole set', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const { result } = renderHook(
      () => useRelaxationPreviews('bangalore', AREAS, FILTERS),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path] = mockGet.mock.calls[0] as [string];
    const sent = new URLSearchParams(path.split('?')[1]).getAll('areaKeys');
    expect(sent).toHaveLength(2);
    expect(sent).toEqual(expect.arrayContaining(AREAS));
  });

  it('appends limit when provided', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const { result } = renderHook(
      () => useRelaxationPreviews('bangalore', AREAS, FILTERS, 2),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((mockGet.mock.calls[0] as [string])[0]).toContain('limit=2');
  });

  it('does not call the endpoint without a scope — a POLYGON/VIEWPORT scope has no area keys', async () => {
    // Answering city-wide here would be exactly the unrequested broadening the
    // issue forbids, so the correct behaviour is to not ask at all.
    renderHook(() => useRelaxationPreviews('bangalore', [], FILTERS), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not call the endpoint without a city', async () => {
    renderHook(() => useRelaxationPreviews('', AREAS, FILTERS), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('is disabled in admin preview mode, which has no counterpart endpoint', async () => {
    renderHook(() => useRelaxationPreviews('bangalore', AREAS, FILTERS), {
      wrapper: makePreviewWrapper(),
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('reuses one cache entry when the same keys arrive in a different order', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const wrapper = makeWrapper();
    const { result, rerender } = renderHook(
      ({ keys }: { keys: string[] }) => useRelaxationPreviews('bangalore', keys, FILTERS),
      { wrapper, initialProps: { keys: AREAS } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Removing then re-adding an area in the other order is the same scope.
    rerender({ keys: [...AREAS].reverse() });
    await new Promise((r) => setTimeout(r, 30));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('a response for older filters is never shown against newer filters', async () => {
    // THE stale-response guard. `filters` is part of the query key, so an
    // in-flight reply for the old filters resolves into the OLD key's cache
    // entry and can never surface as the new key's `data`. This test lets the
    // slow old request settle AFTER the filter change and asserts the newer
    // state is what is observed.
    const wrapper = makeWrapper();
    let resolveOld: (v: RelaxationPreviewsResponse) => void = () => {};
    const oldReply = new Promise<RelaxationPreviewsResponse>((res) => {
      resolveOld = res;
    });

    const STALE: RelaxationPreviewsResponse = {
      city: 'bangalore',
      areaKeys: AREAS,
      baselineCount: 0,
      previews: [{ kind: 'PRICE_MAX', resultingCount: 999, priceMax: 6_000_000 }],
    };
    const FRESH: RelaxationPreviewsResponse = {
      city: 'bangalore',
      areaKeys: AREAS,
      baselineCount: 0,
      previews: [{ kind: 'PRICE_MAX', resultingCount: 3, priceMax: 12_000_000 }],
    };

    mockGet.mockReturnValueOnce(oldReply).mockResolvedValueOnce(FRESH);

    const { result, rerender } = renderHook(
      ({ f }: { f: PropertyFilters }) => useRelaxationPreviews('bangalore', AREAS, f),
      { wrapper, initialProps: { f: FILTERS } },
    );

    // Filters change while the first request is still in flight.
    rerender({ f: { priceMax: 10_000_000 } });
    await waitFor(() => expect(result.current.data).toEqual(FRESH));

    // Only now does the superseded request land.
    resolveOld(STALE);
    await new Promise((r) => setTimeout(r, 50));

    expect(result.current.data).toEqual(FRESH);
    expect(result.current.data?.previews[0].resultingCount).toBe(3);
  });
});
