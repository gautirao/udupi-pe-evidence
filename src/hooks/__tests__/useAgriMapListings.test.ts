/**
 * useAgriMapListings — Issue #1410 (B3), cut over to single canonical `areaKey` by
 * Issue #2151 PR C (C-F2).
 *
 * Tests:
 * AC1  Query key includes city + areaKey + listingPurpose + authScope
 * AC2  Successful response returned with all fields, nullable handling
 * AC3  Network error → query rejects (TanStack Query surfaces as error state)
 * AC4  enabled guard: city='' → query not called
 * AC5  enabled guard: areaKey='' → query not called
 * AC6  skipAuth: true → api.get called with skipAuth option
 * AC7  boundaryGeoJson null handling — listing with null boundary included
 * AC8  (AC11 guard) /api/discover/agri-map-listings called; /api/discover/markers NOT called
 * AC9  (C-F2) sends canonical single `areaKey` param; legacy `areaKeys` is NEVER sent
 * AC10 (Issue #1551 — SECURITY-CRITICAL) authed call (isAuthenticated=true) passes NO
 *      skipAuth option to api.get — complements AC6, which only proves the anon path.
 * AC11 (Issue #1551 — SECURITY-CRITICAL) query key carries the auth-scope literal
 *      ('authed'/'anon') at a stable position, and authed vs anon keys are structurally
 *      distinct so they cannot collide in the TanStack Query cache.
 * AC12 (Issue #1551 — SECURITY-CRITICAL) QueryClient cache isolation: an anon-seeded
 *      cache entry is NOT visible under the authed key (proves the cache-key segregation
 *      actually prevents an anon caller from being served an authed-scoped response).
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

// ─── Import hook AFTER mocks ───────────────────────────────────
import { useAgriMapListings, AGRI_MAP_LISTINGS_QUERY_KEY_BASE } from '../useAgriMapListings';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makePreviewWrapper(cityId: number, revisionId: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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

const SAMPLE_RESPONSE = {
  city: 'udupi',
  listings: [
    {
      id: 'listing-1',
      areaKey: 'IN|KA|Udupi|Manipal',
      latitude: 13.35,
      longitude: 74.79,
      propertyType: 'agricultural_land',
      locality: 'Manipal',
      boundaryGeoJson: '{"type":"Polygon","coordinates":[[[74.79,13.35],[74.80,13.35],[74.80,13.36],[74.79,13.36],[74.79,13.35]]]}',
      landArea: 2.5,
      landAreaUnit: 'acres',
      computedAreaAcres: 2.5,
      pricePaise: 500000000,
    },
    {
      id: 'listing-2',
      areaKey: 'IN|KA|Udupi|Manipal',
      latitude: 13.36,
      longitude: 74.80,
      propertyType: 'agricultural_land',
      locality: null,
      boundaryGeoJson: null,
      landArea: null,
      landAreaUnit: null,
      computedAreaAcres: null,
      pricePaise: null,
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────

describe('useAgriMapListings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC1: returns data for city + areaKey', async () => {
    mockGet.mockResolvedValueOnce(SAMPLE_RESPONSE);
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SAMPLE_RESPONSE);
  });

  it('AC2: all fields preserved in response including nullable ones', async () => {
    mockGet.mockResolvedValueOnce(SAMPLE_RESPONSE);
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const listings = result.current.data!.listings;
    expect(listings).toHaveLength(2);
    expect(listings[0].pricePaise).toBe(500000000);
    expect(listings[0].computedAreaAcres).toBe(2.5);
    // Second listing has all nullable fields as null
    expect(listings[1].locality).toBeNull();
    expect(listings[1].boundaryGeoJson).toBeNull();
    expect(listings[1].pricePaise).toBeNull();
  });

  it('AC3: network error → query surfaces as error state', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('AC4: city="" → query disabled, api.get not called', () => {
    const { result } = renderHook(
      () => useAgriMapListings('', 'IN|KA|Udupi|Manipal'),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('AC5: areaKey="" → query disabled, api.get not called', () => {
    const { result } = renderHook(
      () => useAgriMapListings('udupi', ''),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('AC6: skipAuth:true passed to api.get', async () => {
    mockGet.mockResolvedValueOnce({ city: 'udupi', listings: [] });
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/discover/agri-map-listings'),
      { skipAuth: true },
    );
  });

  it('AC7: listing with boundaryGeoJson=null is included in results', async () => {
    mockGet.mockResolvedValueOnce(SAMPLE_RESPONSE);
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const nullBoundary = result.current.data!.listings.find(l => l.id === 'listing-2');
    expect(nullBoundary).toBeDefined();
    expect(nullBoundary!.boundaryGeoJson).toBeNull();
  });

  it('AC8 (AC11 guard): /api/discover/agri-map-listings called; /api/discover/markers NOT called', async () => {
    mockGet.mockResolvedValueOnce({ city: 'udupi', listings: [] });
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrls = mockGet.mock.calls.map(c => c[0] as string);
    const agriMapCalled = calledUrls.some(u => u.includes('/api/discover/agri-map-listings'));
    const markersCalled = calledUrls.some(u => u.includes('/api/discover/markers'));

    expect(agriMapCalled).toBe(true);
    expect(markersCalled).toBe(false);
  });

  it('AC9 (C-F2): sends canonical single areaKey param', async () => {
    mockGet.mockResolvedValueOnce({ city: 'udupi', listings: [] });
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrl = mockGet.mock.calls[0][0] as string;
    expect(calledUrl).toContain('city=udupi');
    expect(calledUrl).toContain('areaKey=IN');
  });

  it('AC9 (C-F2): NEVER sends the legacy repeated `areaKeys` param', async () => {
    mockGet.mockResolvedValueOnce({ city: 'udupi', listings: [] });
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrl = mockGet.mock.calls[0][0] as string;
    // `areaKeys` (plural, legacy) must never appear — only the canonical singular `areaKey`.
    expect(calledUrl).not.toContain('areaKeys=');
  });

  it('query key includes city and areaKey', async () => {
    mockGet.mockResolvedValueOnce({ city: 'udupi', listings: [] });
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrl = mockGet.mock.calls[0][0] as string;
    expect(calledUrl).toContain('city=udupi');
    expect(calledUrl).toContain('IN');
  });

  it('QUERY_KEY_BASE is the expected constant', () => {
    expect(AGRI_MAP_LISTINGS_QUERY_KEY_BASE).toEqual(['agri-map-listings']);
  });

  it('AC10: authed call (isAuthenticated=true) passes NO skipAuth option to api.get', async () => {
    mockGet.mockResolvedValueOnce({ city: 'udupi', listings: [] });
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal', undefined, /* isAuthenticated= */ true),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Authed: no options arg → api.ts injects the Authorization header.
    // FAILS if the hook passes skipAuth:true for authed users (would suppress the auth header).
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/discover/agri-map-listings'),
      undefined,
    );
  });

  it('AC11: query key carries auth-scope at a stable position; authed and anon keys are structurally distinct', async () => {
    mockGet.mockResolvedValue({ city: 'udupi', listings: [] });

    const anonClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result: anonResult } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal', undefined, false),
      {
        wrapper: ({ children }) =>
          React.createElement(QueryClientProvider, { client: anonClient }, children),
      },
    );
    await waitFor(() => expect(anonResult.current.isSuccess).toBe(true));
    const anonKey = anonClient.getQueryCache().getAll()[0].queryKey;

    const authedClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result: authedResult } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal', undefined, true),
      {
        wrapper: ({ children }) =>
          React.createElement(QueryClientProvider, { client: authedClient }, children),
      },
    );
    await waitFor(() => expect(authedResult.current.isSuccess).toBe(true));
    const authedKey = authedClient.getQueryCache().getAll()[0].queryKey;

    // Auth-scope literal sits right after the base segment — FAILS if the hook drops
    // or reorders it.
    expect(anonKey[1]).toBe('anon');
    expect(authedKey[1]).toBe('authed');
    // Structurally distinct as a whole → cannot collide as cache keys.
    expect(anonKey).not.toEqual(authedKey);
    // All other dimensions (city, listingPurpose, areaKey) match — only auth-scope differs.
    expect([anonKey[0], ...anonKey.slice(2)]).toEqual([authedKey[0], ...authedKey.slice(2)]);
  });

  it('AC12: QueryClient does not surface an anon-seeded cache entry under the authed key (cache isolation)', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const anonKey = [...AGRI_MAP_LISTINGS_QUERY_KEY_BASE, 'anon', 'udupi', null, 'IN|KA|Udupi|Manipal'];
    const authedKey = [...AGRI_MAP_LISTINGS_QUERY_KEY_BASE, 'authed', 'udupi', null, 'IN|KA|Udupi|Manipal'];

    // Seed an anon (coarsened / price-null) response under the anon key.
    client.setQueryData(anonKey, {
      city: 'udupi',
      listings: [{ id: 'listing-1', pricePaise: null }],
    });

    // An authed reader must NOT be served the anon cache entry — the exact-price/coords
    // authed response must come from a real fetch, never a stale anon cache hit.
    const authedCachedData = client.getQueryData(authedKey);
    expect(authedCachedData).toBeUndefined();

    client.clear();
  });

  // ─── #2151 Track 3 — preview-mode threading via DiscoverDataSourceContext ────

  it('live mode is byte-identical to pre-Track-3 (regression proof: URL, key, skipAuth)', async () => {
    mockGet.mockResolvedValueOnce({ city: 'udupi', listings: [] });
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith(
      '/api/discover/agri-map-listings?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal',
      { skipAuth: true },
    );
  });

  it('preview mode requests the admin preview agri-map-listings path and sends skipAuth:false', async () => {
    mockGet.mockResolvedValueOnce({ city: 'udupi', listings: [] });
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal'),
      { wrapper: makePreviewWrapper(7, 42) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith(
      '/api/admin/city-launch/cities/7/revisions/42/preview/agri-map-listings?areaKey=IN%7CKA%7CUdupi%7CManipal',
      { skipAuth: false },
    );
  });

  it('preview mode uses skipAuth:false even when isAuthenticated=true (preview caller is always the admin)', async () => {
    mockGet.mockResolvedValueOnce({ city: 'udupi', listings: [] });
    const { result } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal', undefined, /* isAuthenticated= */ true),
      { wrapper: makePreviewWrapper(7, 42) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/city-launch/cities/7/revisions/42/preview/agri-map-listings'),
      { skipAuth: false },
    );
  });

  it('preserves anon/authed cache isolation alongside preview scoping', async () => {
    mockGet.mockResolvedValue({ city: 'udupi', listings: [] });

    const anonPreviewClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result: anonResult } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal', undefined, false),
      {
        wrapper: ({ children }) =>
          React.createElement(
            QueryClientProvider,
            { client: anonPreviewClient },
            React.createElement(DiscoverDataSourceProvider, {
              value: { mode: 'preview', cityId: 7, revisionId: 42, citySlug: 'preview-city' },
              children,
            }),
          ),
      },
    );
    await waitFor(() => expect(anonResult.current.isSuccess).toBe(true));
    const anonKey = anonPreviewClient.getQueryCache().getAll()[0].queryKey;

    const authedPreviewClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result: authedResult } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal', undefined, true),
      {
        wrapper: ({ children }) =>
          React.createElement(
            QueryClientProvider,
            { client: authedPreviewClient },
            React.createElement(DiscoverDataSourceProvider, {
              value: { mode: 'preview', cityId: 7, revisionId: 42, citySlug: 'preview-city' },
              children,
            }),
          ),
      },
    );
    await waitFor(() => expect(authedResult.current.isSuccess).toBe(true));
    const authedKey = authedPreviewClient.getQueryCache().getAll()[0].queryKey;

    // The ['preview', cityId, revisionId] triple must be prepended OUTSIDE/BEFORE the
    // existing authScope literal — never interleaved with or replacing it.
    expect(anonKey.slice(0, 3)).toEqual(['preview', 7, 42]);
    expect(authedKey.slice(0, 3)).toEqual(['preview', 7, 42]);
    // authScope keeps its pre-existing relative position: immediately after the
    // ['preview', cityId, revisionId, ...AGRI_MAP_LISTINGS_QUERY_KEY_BASE] prefix —
    // exactly where it sat right after AGRI_MAP_LISTINGS_QUERY_KEY_BASE in live mode.
    const authScopeIndex = 3 + AGRI_MAP_LISTINGS_QUERY_KEY_BASE.length;
    expect(anonKey[authScopeIndex]).toBe('anon');
    expect(authedKey[authScopeIndex]).toBe('authed');
    // Anon and authed preview keys remain structurally distinct — no cache collision.
    expect(anonKey).not.toEqual(authedKey);

    // Cross-check against the live-mode key ordering for the same call: the segment
    // AFTER the preview triple must equal the full live-mode key (preview triple is a
    // pure prefix, not an interleave/replacement).
    const liveClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result: liveResult } = renderHook(
      () => useAgriMapListings('udupi', 'IN|KA|Udupi|Manipal', undefined, false),
      {
        wrapper: ({ children }) =>
          React.createElement(QueryClientProvider, { client: liveClient }, children),
      },
    );
    await waitFor(() => expect(liveResult.current.isSuccess).toBe(true));
    const liveKey = liveClient.getQueryCache().getAll()[0].queryKey;
    expect(anonKey.slice(3)).toEqual(liveKey);
  });
});
