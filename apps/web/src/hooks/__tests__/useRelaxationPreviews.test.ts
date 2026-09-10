/**
 * Issue #2018 (slice 2) — useRelaxationPreviews: deterministic filter-relaxation
 * count previews for the zero-result recovery panel. Issue #2454 (slice 4) —
 * scope-aware: AREA_SET / POLYGON / VIEWPORT.
 *
 * Follows useNearbyAreaCandidates.test.ts's conventions (vi.hoisted mock of
 * @/lib/api, preview-mode wrapper), since both are city/filter-driven GET query
 * hooks sharing discoverKey/useDiscoverSource.
 *
 * The load-bearing tests here are the stale-response guard, which the issue
 * requires explicitly ("stale preview responses cannot overwrite newer
 * filters/scope"), and the #2454 anonymous-polygon guard: there is no anonymous
 * polygon backend path, so a signed-out POLYGON scope must never issue a call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGet = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());

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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import { useRelaxationPreviews } from '../useRelaxationPreviews';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { RelaxationPreviewsResponse, RelaxationPreviewScope } from '../useRelaxationPreviews';

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

const signedOut = () => mockUseAuth.mockReturnValue({ user: null, session: null, isLoading: false });
const signedIn = () =>
  mockUseAuth.mockReturnValue({ user: { id: 'u-1' }, session: { access_token: 't' }, isLoading: false });

const AREAS = ['IN|KA|Bengaluru|Jakkur', 'IN|KA|Bengaluru|Thanisandra'];
const AREA_SET: RelaxationPreviewScope = { kind: 'AREA_SET', areaKeys: AREAS };
const COORDS: [number, number][] = [
  [12.9, 77.5],
  [12.95, 77.55],
  [12.9, 77.6],
];
const POLYGON: RelaxationPreviewScope = { kind: 'POLYGON', coordinates: COORDS };
const VIEWPORT: RelaxationPreviewScope = {
  kind: 'VIEWPORT',
  bounds: { s: 12.9, w: 77.5, n: 13.0, e: 77.6 },
};
const FILTERS: PropertyFilters = { priceMax: 5_000_000 };

const RESPONSE: RelaxationPreviewsResponse = {
  city: 'bangalore',
  scopeKind: 'AREA_SET',
  areaKeys: AREAS,
  baselineCount: 0,
  previews: [{ kind: 'PRICE_MAX', resultingCount: 7, priceMax: 6_000_000 }],
};

function sentParams(): URLSearchParams {
  const [path] = mockGet.mock.calls[0] as [string];
  return new URLSearchParams(path.split('?')[1]);
}

describe('useRelaxationPreviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedOut();
  });

  it('AREA_SET: fetches from the public endpoint anonymously and passes the response through unmodified', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const { result } = renderHook(
      () => useRelaxationPreviews('bangalore', AREA_SET, FILTERS),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(RESPONSE);

    const [path, options] = mockGet.mock.calls[0] as [string, unknown];
    expect(path).toContain('/api/discover/areas/relaxation-previews?');
    expect(path).toContain('city=bangalore');
    expect(path).toContain('areaKeys=');
    expect(path).not.toContain('viewportScope=');
    expect(path).not.toContain('polygon=');
    // Anonymous: the recovery panel must work for a signed-out shopper.
    expect(options).toEqual({ skipAuth: true });
  });

  it('AREA_SET: sends every committed area key, so counts are scoped to the whole set', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const { result } = renderHook(
      () => useRelaxationPreviews('bangalore', AREA_SET, FILTERS),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const sent = sentParams().getAll('areaKeys');
    expect(sent).toHaveLength(2);
    expect(sent).toEqual(expect.arrayContaining(AREAS));
  });

  it('VIEWPORT: uses the public endpoint with the #2015 viewportScope encoding, anonymously', async () => {
    mockGet.mockResolvedValue({ ...RESPONSE, scopeKind: 'VIEWPORT', areaKeys: [] });
    const { result } = renderHook(
      () => useRelaxationPreviews('bangalore', VIEWPORT, FILTERS),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, options] = mockGet.mock.calls[0] as [string, unknown];
    expect(path).toContain('/api/discover/areas/relaxation-previews?');
    expect(sentParams().get('viewportScope')).toBe('12.9,77.5,13,77.6');
    expect(sentParams().getAll('areaKeys')).toEqual([]);
    expect(sentParams().get('polygon')).toBeNull();
    expect(options).toEqual({ skipAuth: true });
  });

  it('POLYGON (signed in): uses the AUTHENTICATED sibling endpoint with the committed polygon, and sends the token', async () => {
    signedIn();
    mockGet.mockResolvedValue({ ...RESPONSE, scopeKind: 'POLYGON', areaKeys: [] });
    const { result } = renderHook(
      () => useRelaxationPreviews('bangalore', POLYGON, FILTERS),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, options] = mockGet.mock.calls[0] as [string, unknown];
    expect(path).toContain('/api/discover/listings/relaxation-previews?');
    expect(JSON.parse(sentParams().get('polygon') ?? 'null')).toEqual(COORDS);
    expect(sentParams().get('viewportScope')).toBeNull();
    expect(sentParams().getAll('areaKeys')).toEqual([]);
    // NOT skipAuth: this is the signed-in path and must carry the JWT.
    expect(options).toBeUndefined();
  });

  it('POLYGON (signed OUT): never calls any endpoint — there is no anonymous polygon path', async () => {
    // Mutation proof for the guard: with `scope.kind !== 'POLYGON' || isSignedIn` removed from
    // `enabled`, this test fails because the authenticated endpoint would be called (and 401).
    signedOut();
    mockGet.mockResolvedValue({ ...RESPONSE, scopeKind: 'POLYGON', areaKeys: [] });
    const { result } = renderHook(
      () => useRelaxationPreviews('bangalore', POLYGON, FILTERS),
      { wrapper: makeWrapper() },
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
  });

  it('POLYGON: signing in enables the query without a remount', async () => {
    signedOut();
    mockGet.mockResolvedValue({ ...RESPONSE, scopeKind: 'POLYGON', areaKeys: [] });
    const { result, rerender } = renderHook(
      () => useRelaxationPreviews('bangalore', POLYGON, FILTERS),
      { wrapper: makeWrapper() },
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(mockGet).not.toHaveBeenCalled();

    signedIn();
    rerender();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('a polygon left in the FILTER set is never forwarded — the scope owns geography', async () => {
    // useDiscoverPageState mirrors a committed polygon into filters.polygon. Under an
    // AREA_SET/VIEWPORT scope that stale value must not reach the public endpoint, which
    // rejects any polygon; under POLYGON the committed scope's coordinates are what is sent.
    mockGet.mockResolvedValue(RESPONSE);
    const staleFilters: PropertyFilters = { priceMax: 5_000_000, polygon: COORDS };
    const { result } = renderHook(
      () => useRelaxationPreviews('bangalore', AREA_SET, staleFilters),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sentParams().get('polygon')).toBeNull();
  });

  it('appends limit when provided', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const { result } = renderHook(
      () => useRelaxationPreviews('bangalore', AREA_SET, FILTERS, { limit: 2 }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((mockGet.mock.calls[0] as [string])[0]).toContain('limit=2');
  });

  it('forwards listingPurpose exactly as the listings query sends it — purpose is part of the never-relaxed envelope', async () => {
    // Caught by the first real-browser run of #2454: without this, two ₹0 RENT
    // listings inside the polygon were counted for a BUY search and the preview
    // said 3 where the shopper then got 1.
    mockGet.mockResolvedValue({ ...RESPONSE, scopeKind: 'POLYGON', areaKeys: [] });
    signedIn();
    const { result } = renderHook(
      () => useRelaxationPreviews('bangalore', POLYGON, FILTERS, { listingPurpose: 'sale' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sentParams().get('listingPurpose')).toBe('sale');
  });

  it('a change of purpose is a different query, never a cache hit on the other purpose', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const wrapper = makeWrapper();
    const { result, rerender } = renderHook(
      ({ p }: { p: string }) => useRelaxationPreviews('bangalore', AREA_SET, FILTERS, { listingPurpose: p }),
      { wrapper, initialProps: { p: 'sale' } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ p: 'rent' });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect((mockGet.mock.calls[1] as [string])[0]).toContain('listingPurpose=rent');
  });

  it('does not call the endpoint without a scope', async () => {
    // Answering city-wide here would be exactly the unrequested broadening the
    // issue forbids, so the correct behaviour is to not ask at all.
    renderHook(() => useRelaxationPreviews('bangalore', null, FILTERS), { wrapper: makeWrapper() });
    renderHook(
      () => useRelaxationPreviews('bangalore', { kind: 'AREA_SET', areaKeys: [] }, FILTERS),
      { wrapper: makeWrapper() },
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not call the endpoint without a city', async () => {
    renderHook(() => useRelaxationPreviews('', AREA_SET, FILTERS), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('is disabled in admin preview mode, which has no counterpart endpoint', async () => {
    renderHook(() => useRelaxationPreviews('bangalore', AREA_SET, FILTERS), {
      wrapper: makePreviewWrapper(),
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('reuses one cache entry when the same keys arrive in a different order', async () => {
    mockGet.mockResolvedValue(RESPONSE);
    const wrapper = makeWrapper();
    const { result, rerender } = renderHook(
      ({ keys }: { keys: string[] }) =>
        useRelaxationPreviews('bangalore', { kind: 'AREA_SET', areaKeys: keys }, FILTERS),
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
      ...RESPONSE,
      previews: [{ kind: 'PRICE_MAX', resultingCount: 999, priceMax: 6_000_000 }],
    };
    const FRESH: RelaxationPreviewsResponse = {
      ...RESPONSE,
      previews: [{ kind: 'PRICE_MAX', resultingCount: 3, priceMax: 12_000_000 }],
    };

    mockGet.mockReturnValueOnce(oldReply).mockResolvedValueOnce(FRESH);

    const { result, rerender } = renderHook(
      ({ f }: { f: PropertyFilters }) => useRelaxationPreviews('bangalore', AREA_SET, f),
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

  it('a response for an older SCOPE is never shown against a newer scope', async () => {
    // Same structural guard, on the scope half of the key: a reply computed for the
    // previously-selected areas cannot surface once the shopper has committed a viewport.
    signedOut();
    const wrapper = makeWrapper();
    let resolveOld: (v: RelaxationPreviewsResponse) => void = () => {};
    const oldReply = new Promise<RelaxationPreviewsResponse>((res) => {
      resolveOld = res;
    });
    const STALE_AREAS: RelaxationPreviewsResponse = {
      ...RESPONSE,
      previews: [{ kind: 'PRICE_MAX', resultingCount: 999, priceMax: 6_000_000 }],
    };
    const FRESH_VIEWPORT: RelaxationPreviewsResponse = {
      ...RESPONSE,
      scopeKind: 'VIEWPORT',
      areaKeys: [],
      previews: [{ kind: 'PRICE_MAX', resultingCount: 2, priceMax: 6_000_000 }],
    };
    mockGet.mockReturnValueOnce(oldReply).mockResolvedValueOnce(FRESH_VIEWPORT);

    const { result, rerender } = renderHook(
      ({ s }: { s: RelaxationPreviewScope }) => useRelaxationPreviews('bangalore', s, FILTERS),
      { wrapper, initialProps: { s: AREA_SET } },
    );
    rerender({ s: VIEWPORT });
    await waitFor(() => expect(result.current.data).toEqual(FRESH_VIEWPORT));

    resolveOld(STALE_AREAS);
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.data).toEqual(FRESH_VIEWPORT);
    expect(result.current.data?.scopeKind).toBe('VIEWPORT');
  });
});
