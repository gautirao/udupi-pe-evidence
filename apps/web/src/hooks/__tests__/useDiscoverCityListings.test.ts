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

  // ─── Issue #2189 — city-resolved guard ─────────────────────────

  it('does not fetch when city is empty even if areaKeys is populated (Issue #2189)', () => {
    const { result } = renderHook(
      () => useDiscoverCityListings({ city: '', areaKeys: ['udupi|manipal'] }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('never issues a request with an empty city path segment, even transiently (Issue #2189)', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result, rerender } = renderHook(
      ({ city, areaKeys }: { city: string; areaKeys: string[] }) =>
        useDiscoverCityListings({ city, areaKeys }),
      { wrapper: makeWrapper(), initialProps: { city: '', areaKeys: ['udupi|manipal'] } },
    );

    // areaKeys resolved first, city still empty — must stay disabled.
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();

    // city subsequently resolves — exactly one, correctly-formed request fires.
    rerender({ city: 'udupi', areaKeys: ['udupi|manipal'] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledTimes(1);
    const [url] = mockGet.mock.calls[0] as [string, unknown];
    expect(url.startsWith('/api/discover/cities/udupi/listings?')).toBe(true);
    expect(url).not.toContain('/api/discover/cities//listings');
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

  // Issue #2023 (BLOCKING review fix) — readyToMove now forwarded to the backend,
  // consistent with minPrice/maxPrice above (CityAreaListingsService filters on
  // possession_status = 'READY').
  it('appends readyToMove when true', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          readyToMove: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('readyToMove')).toBe('true');
  });

  it('omits readyToMove when false or absent', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          readyToMove: false,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('readyToMove')).toBe(false);
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

  // ─── q (keyword search) ───────────────────────────────────────

  it('appends q to URL params when provided', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          q: 'garden view',
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('q')).toBe('garden view');
  });

  it('does NOT append q to URL params when q is undefined', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('q')).toBe(false);
  });

  it('does NOT append q to URL params when q is empty string', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          q: '',
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('q')).toBe(false);
  });

  it('includes trimmed q value in the queryKey', () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          q: 'pool',
        }),
      { wrapper },
    );

    const keys = qc.getQueryCache().getAll().map((query) => query.queryKey);
    const withQ = keys.find((k) => k.includes('pool'));
    expect(withQ).toBeDefined();
  });

  it('includes both q and propertyType in the queryKey when both are provided', () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          q: 'pool',
          propertyType: 'apartment',
        }),
      { wrapper },
    );

    const keys = qc.getQueryCache().getAll().map((query) => query.queryKey);
    const composedKey = keys.find((k) => k.includes('pool') && k.includes('apartment'));
    expect(composedKey).toBeDefined();
  });
});

// ─── Issue #1911 PR3 — preview-mode threading (AC10 cache-key isolation) ──

import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';

function makePreviewWrapper(cityId: number, revisionId: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        DiscoverDataSourceProvider,
        { value: { mode: 'preview', cityId, revisionId, citySlug: 'udupi' }, children },
      ),
    );
}

describe('useDiscoverCityListings — preview mode (Issue #1911 PR3)', () => {
  it('preview mode requests the admin preview /listings path with only ?areaKeys=', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);
    const { result } = renderHook(
      () =>
        useDiscoverCityListings({
          city: 'udupi',
          areaKeys: ['udupi|manipal'],
          limitPerArea: 5,
          minPrice: 5000000,
        }),
      { wrapper: makePreviewWrapper(7, 42) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, options] = mockGet.mock.calls[0] as [string, unknown];
    expect(path).toBe('/api/admin/city-launch/cities/7/revisions/42/preview/listings?areaKeys=udupi%7Cmanipal');
    expect(options).toEqual({ skipAuth: false });
  });

  it('preview and live cache entries for the same params are distinct — no cross-serve (AC10)', () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const liveWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const previewWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(
          DiscoverDataSourceProvider,
          { value: { mode: 'preview' as const, cityId: 7, revisionId: 42, citySlug: 'udupi' }, children },
        ),
      );

    renderHook(() => useDiscoverCityListings({ city: 'udupi', areaKeys: ['udupi|manipal'] }), { wrapper: liveWrapper });
    renderHook(() => useDiscoverCityListings({ city: 'udupi', areaKeys: ['udupi|manipal'] }), { wrapper: previewWrapper });

    const keys = qc.getQueryCache().getAll().map((q) => q.queryKey);
    const liveKey = keys.find((k) => k[0] === 'discover-city-listings');
    const previewKey = keys.find((k) => k[0] === 'preview');
    expect(liveKey).toBeDefined();
    expect(previewKey).toBeDefined();
    expect(previewKey).toEqual(['preview', 7, 42, ...(liveKey as unknown[])]);
  });
});
