/**
 * useAgriMapListings — Issue #1410 (B3)
 *
 * Tests:
 * AC1  Query key includes city + sorted areaKeys; different orderings → same key
 * AC2  Successful response returned with all fields, nullable handling
 * AC3  Network error → query rejects (TanStack Query surfaces as error state)
 * AC4  enabled guard: city='' → query not called
 * AC5  enabled guard: areaKeys=[] → query not called
 * AC6  skipAuth: true → api.get called with skipAuth option
 * AC7  boundaryGeoJson null handling — listing with null boundary included
 * AC8  (AC11 guard) /api/discover/agri-map-listings called; /api/discover/markers NOT called
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

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
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

  it('AC1: returns data for city + areaKeys', async () => {
    mockGet.mockResolvedValueOnce(SAMPLE_RESPONSE);
    const { result } = renderHook(
      () => useAgriMapListings('udupi', ['IN|KA|Udupi|Manipal']),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SAMPLE_RESPONSE);
  });

  it('AC1: different key orderings produce the same sorted query key', async () => {
    const keysAB = ['key-B', 'key-A'];
    const keysBA = ['key-A', 'key-B'];

    mockGet.mockResolvedValue({ city: 'udupi', listings: [] });

    const { result: rAB } = renderHook(
      () => useAgriMapListings('udupi', keysAB),
      { wrapper: makeWrapper() },
    );
    const { result: rBA } = renderHook(
      () => useAgriMapListings('udupi', keysBA),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(rAB.current.isSuccess).toBe(true));
    await waitFor(() => expect(rBA.current.isSuccess).toBe(true));

    // Both calls should have been made with the same sorted URL params
    const urlAB = mockGet.mock.calls.find(c => (c[0] as string).includes('key-A') && (c[0] as string).includes('key-B'))?.[0];
    const urlBA = mockGet.mock.calls.slice().reverse().find(c => (c[0] as string).includes('key-A') && (c[0] as string).includes('key-B'))?.[0];
    expect(urlAB).toBe(urlBA);
  });

  it('AC2: all fields preserved in response including nullable ones', async () => {
    mockGet.mockResolvedValueOnce(SAMPLE_RESPONSE);
    const { result } = renderHook(
      () => useAgriMapListings('udupi', ['IN|KA|Udupi|Manipal']),
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
      () => useAgriMapListings('udupi', ['IN|KA|Udupi|Manipal']),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('AC4: city="" → query disabled, api.get not called', () => {
    const { result } = renderHook(
      () => useAgriMapListings('', ['IN|KA|Udupi|Manipal']),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('AC5: areaKeys=[] → query disabled, api.get not called', () => {
    const { result } = renderHook(
      () => useAgriMapListings('udupi', []),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('AC6: skipAuth:true passed to api.get', async () => {
    mockGet.mockResolvedValueOnce({ city: 'udupi', listings: [] });
    const { result } = renderHook(
      () => useAgriMapListings('udupi', ['IN|KA|Udupi|Manipal']),
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
      () => useAgriMapListings('udupi', ['IN|KA|Udupi|Manipal']),
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
      () => useAgriMapListings('udupi', ['IN|KA|Udupi|Manipal']),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrls = mockGet.mock.calls.map(c => c[0] as string);
    const agriMapCalled = calledUrls.some(u => u.includes('/api/discover/agri-map-listings'));
    const markersCalled = calledUrls.some(u => u.includes('/api/discover/markers'));

    expect(agriMapCalled).toBe(true);
    expect(markersCalled).toBe(false);
  });

  it('query key includes city and sorted areaKeys', async () => {
    mockGet.mockResolvedValueOnce({ city: 'udupi', listings: [] });
    const { result } = renderHook(
      () => useAgriMapListings('udupi', ['key-Z', 'key-A']),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify that the URL params are sorted
    const calledUrl = mockGet.mock.calls[0][0] as string;
    expect(calledUrl).toContain('city=udupi');
    const firstKey = calledUrl.indexOf('key-A');
    const secondKey = calledUrl.indexOf('key-Z');
    // key-A (sorted first) should appear before key-Z
    expect(firstKey).toBeLessThan(secondKey);
  });

  it('QUERY_KEY_BASE is the expected constant', () => {
    expect(AGRI_MAP_LISTINGS_QUERY_KEY_BASE).toEqual(['agri-map-listings']);
  });
});
