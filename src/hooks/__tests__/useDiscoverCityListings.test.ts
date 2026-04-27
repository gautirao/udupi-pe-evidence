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
import { useDiscoverCityListings } from '../useDiscoverCityListings';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const BASE_RESPONSE = {
  city: 'udupi',
  limitPerArea: 5,
  areas: [{ areaKey: 'udupi|manipal', areaName: 'Manipal', listings: [] }],
};

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDiscoverCityListings', () => {
  it('does not fetch when areaKeys is empty', () => {
    const { result } = renderHook(
      () => useDiscoverCityListings({ city: 'udupi', areaKeys: [] }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches with basic params when no filters provided', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          limitPerArea: 5,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('limitPerArea')).toBe('5');
    expect(params.getAll('areaKeys')).toEqual(['udupi|manipal']);
    expect(params.has('minPrice')).toBe(false);
    expect(params.has('maxPrice')).toBe(false);
    expect(params.has('bedrooms')).toBe(false);
    expect(params.has('propertyType')).toBe(false);
  });

  it('appends minPrice when provided', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          minPrice: 5_000_00, // 5 lakh in paise
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('minPrice')).toBe('500000');
  });

  it('appends maxPrice when provided', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          maxPrice: 1_00_00_000, // 1 crore in paise
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('maxPrice')).toBe('10000000');
  });

  it('appends bedrooms when provided', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          bedrooms: 3,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('bedrooms')).toBe('3');
  });

  it('appends propertyType when provided', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          propertyType: 'house',
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('propertyType')).toBe('house');
  });

  it('includes filter values in the queryKey', () => {
    // We verify the queryKey indirectly: two calls with different filters produce
    // different cache entries (the second mock call fires because the key differs).
    mockGet.mockResolvedValue(BASE_RESPONSE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { rerender } = renderHook(
      ({ bedrooms }: { bedrooms?: number }) =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          bedrooms,
        }),
      { wrapper, initialProps: { bedrooms: undefined } },
    );

    // Change bedrooms — should create a new query key and trigger a new fetch
    rerender({ bedrooms: 2 });

    // Both the initial (no bedrooms) and the re-rendered (bedrooms=2) are distinct keys,
    // so we verify the key segments contain the filter value.
    const keys = qc.getQueryCache().getAll().map((q) => q.queryKey);
    const withBedrooms = keys.find((k) => k.includes(2));
    expect(withBedrooms).toBeDefined();
  });

  it('does not append params when filter values are undefined/empty string', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          minPrice: undefined,
          maxPrice: undefined,
          bedrooms: undefined,
          propertyType: '',
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('minPrice')).toBe(false);
    expect(params.has('maxPrice')).toBe(false);
    expect(params.has('bedrooms')).toBe(false);
    expect(params.has('propertyType')).toBe(false);
  });
});
