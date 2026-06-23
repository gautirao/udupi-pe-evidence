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

  it('bbox_snapped_to_grid_and_sent_as_south_west_north_east', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    // Raw bbox: south=13.341, west=74.741, north=13.359, east=74.759
    // Snapped to 0.02° grid:
    //   south: floor(13.341 / 0.02) * 0.02 = floor(667.05) * 0.02 = 667 * 0.02 = 13.34
    //   west:  floor(74.741 / 0.02) * 0.02 = floor(3737.05) * 0.02 = 3737 * 0.02 = 74.74
    //   north: ceil(13.359 / 0.02) * 0.02 = ceil(667.95) * 0.02 = 668 * 0.02 = 13.36
    //   east:  ceil(74.759 / 0.02) * 0.02 = ceil(3737.95) * 0.02 = 3738 * 0.02 = 74.76
    const bbox: [number, number, number, number] = [13.341, 74.741, 13.359, 74.759];

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
          bbox,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('bbox')).toBe('13.34,74.74,13.36,74.76');
  });

  it('bbox_omitted_when_not_provided', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('bbox')).toBe(false);
  });

  it('bbox_omitted_when_null', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
          bbox: null,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('bbox')).toBe(false);
  });

  it('bbox_omitted_when_contains_NaN', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
          bbox: [NaN, 74.741, 13.359, 74.759] as unknown as [number, number, number, number],
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('bbox')).toBe(false);
  });

  it('bbox_omitted_when_contains_Infinity', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
          bbox: [Infinity, 74.741, 13.359, 74.759] as unknown as [number, number, number, number],
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('bbox')).toBe(false);
  });

  // ─── T12–T15: keyword q param (#1187) ─────────────────────────

  // T12: non-blank q is appended to URLSearchParams
  it('T12_q_non_blank_appended_to_url_params', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
          q: 'garden view',
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('q')).toBe('garden view');
  });

  // T13: blank or null q is NOT appended to URLSearchParams
  it('T13_q_blank_not_appended', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
          q: '   ',
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('q')).toBe(false);
  });

  it('T13_q_undefined_not_appended', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
          q: undefined,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('q')).toBe(false);
  });

  // T14: different q values produce different queryKey entries
  it('T14_different_q_produces_different_queryKey', () => {
    mockGet.mockResolvedValue(BASE_PAGE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { rerender } = renderHook(
      ({ q }: { q?: string }) =>
        useDiscoverListings({ city: 'udupi', page: 0, filters: {}, enabled: true, q }),
      { wrapper, initialProps: { q: 'sea view' } },
    );

    rerender({ q: 'garden view' });

    const keys = qc.getQueryCache().getAll().map((entry) => entry.queryKey);
    const withSeaView = keys.find((k) => k.includes('sea view'));
    const withGardenView = keys.find((k) => k.includes('garden view'));
    expect(withSeaView).toBeDefined();
    expect(withGardenView).toBeDefined();
  });

  // T15: same trimmed q produces same queryKey (leading/trailing whitespace is normalised)
  it('T15_same_trimmed_q_produces_same_queryKey', () => {
    mockGet.mockResolvedValue(BASE_PAGE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { rerender } = renderHook(
      ({ q }: { q?: string }) =>
        useDiscoverListings({ city: 'udupi', page: 0, filters: {}, enabled: true, q }),
      { wrapper, initialProps: { q: 'abc' } },
    );

    rerender({ q: ' abc ' });

    const keys = qc.getQueryCache().getAll().map((entry) => entry.queryKey);
    // Both renders should resolve to the same cache key ('abc' after trim)
    const allKeys = keys.filter((k) => k.includes('abc'));
    // Only one distinct cache entry should exist (same trimmed value)
    expect(allKeys.length).toBe(1);
  });
});

// ─── Issue #1597: areaKeys filter ─────────────────────────────────────────────

describe('useDiscoverListings — areaKeys filter (Issue #1597)', () => {
  it('appends multiple areaKeys as repeated params in sorted order', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
          areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Karkala'],
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    // Backend accepts repeated areaKeys; they must be sorted (stable cache key)
    expect(params.getAll('areaKeys')).toEqual([
      'IN|KA|Udupi|Karkala',
      'IN|KA|Udupi|Manipal',
    ]);
  });

  it('does NOT fetch when areaKeys is an empty array (empty-areaKeys guard)', () => {
    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
          areaKeys: [],
        }),
      { wrapper: makeWrapper() },
    );

    // Hook must stay idle — never sends the request
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches normally when areaKeys is undefined (no filter applied)', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
          // areaKeys intentionally absent
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('areaKeys')).toBe(false);
  });

  it('areaKeys cache key is distinct from no-areaKeys query', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const w = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    // Render both in sequence — they must produce different cache entries
    const { rerender } = renderHook(
      ({ areaKeys }: { areaKeys?: string[] }) =>
        useDiscoverListings({ city: 'udupi', page: 0, filters: {}, enabled: true, areaKeys }),
      { wrapper: w, initialProps: { areaKeys: undefined } },
    );

    rerender({ areaKeys: ['IN|KA|Udupi|Manipal'] });

    const allKeys = qc.getQueryCache().getAll().map((entry) => JSON.stringify(entry.queryKey));
    // Two distinct cache entries must exist
    const uniqueKeys = new Set(allKeys);
    expect(uniqueKeys.size).toBeGreaterThanOrEqual(2);
  });

  it('areaKeys are sorted stably regardless of input order', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'udupi',
          page: 0,
          filters: {},
          enabled: true,
          areaKeys: ['IN|KA|Udupi|Kundapur', 'IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Karkala'],
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    const sent = params.getAll('areaKeys');
    const expected = [...sent].sort();
    expect(sent).toEqual(expected);
  });
});
