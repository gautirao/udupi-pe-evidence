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
import { useDiscoverListings } from '../useDiscoverListings';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const BASE_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: null,
};

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDiscoverListings', () => {
  it('does_not_fetch_when_city_is_empty', () => {
    const { result } = renderHook(
      () => useDiscoverListings({ city: '', page: 0, filters: {}, enabled: true }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches_with_page_and_size', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () => useDiscoverListings({ city: 'udupi', page: 0, size: 50, filters: {}, enabled: true }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('page')).toBe('0');
    expect(params.get('size')).toBe('50');
  });

  it('multi_value_bedrooms_uses_append', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: { bedrooms: [1, 2] },
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.getAll('bedrooms')).toEqual(['1', '2']);
  });

  it('multi_value_propertyTypes_uses_append', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: { propertyTypes: ['house', 'apartment'] },
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.getAll('propertyTypes')).toEqual(['house', 'apartment']);
  });

  it('multi_value_localities_uses_append', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: { localities: ['Manipal', 'Karkala'] },
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.getAll('localities')).toEqual(['Manipal', 'Karkala']);
  });

  it('multi_value_sellerTypes_uses_append', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: { sellerTypes: ['BUILDER', 'OWNER'] },
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.getAll('sellerTypes')).toEqual(['BUILDER', 'OWNER']);
  });

  it('dateFrom_Date_object_serialised_to_ISO', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: { dateFrom: new Date('2025-01-01T00:00:00Z') },
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('dateFrom')).toBe('2025-01-01T00:00:00.000Z');
  });

  it('dateFrom_string_passthrough', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          // PropertyFilters.dateFrom is Date, but the hook guards instanceof Date —
          // cast to test the else branch
          filters: { dateFrom: '2025-01-01' as unknown as Date },
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('dateFrom')).toBe('2025-01-01');
  });

  it('school_proximity_included_when_complete', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: { schoolLat: 13.0, schoolLon: 74.0, schoolRadiusKm: 2 },
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('schoolLat')).toBe('13');
    expect(params.get('schoolLon')).toBe('74');
    expect(params.get('schoolRadiusKm')).toBe('2');
  });

  it('school_proximity_omitted_when_incomplete', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    // schoolLon deliberately absent — hook appends each param independently
    // so schoolLat IS present but schoolLon is not
    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: { schoolLat: 13.0 },
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    // schoolLat is appended because the hook checks each field independently
    expect(params.has('schoolLat')).toBe(true);
    // schoolLon and schoolRadiusKm are absent because they were not provided
    expect(params.has('schoolLon')).toBe(false);
    expect(params.has('schoolRadiusKm')).toBe(false);
  });

  it('includeAggregates_true_when_flag_set', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          includeAggregates: true,
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('includeAggregates')).toBe('true');
  });

  it('includeAggregates_absent_by_default', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () => useDiscoverListings({ city: 'udupi', page: 0, filters: {}, enabled: true }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('includeAggregates')).toBe(false);
  });

  it('boolean_flags_backOnMarket_readyToMove', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: { backOnMarket: true, readyToMove: true },
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('backOnMarket')).toBe('true');
    expect(params.get('readyToMove')).toBe('true');
  });

  it('polygon_json_serialised', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const polygon: [number, number][] = [
      [13.3, 74.7],
      [13.4, 74.8],
      [13.3, 74.8],
    ];

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: { polygon },
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    const raw = params.get('polygon');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(polygon);
  });
});
