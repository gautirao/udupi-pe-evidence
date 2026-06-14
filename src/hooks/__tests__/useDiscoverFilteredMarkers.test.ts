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
import { useDiscoverFilteredMarkers } from '../useDiscoverFilteredMarkers';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const BASE_MARKERS = { city: 'udupi', markers: [], truncated: false };

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDiscoverFilteredMarkers', () => {
  it('does_not_fetch_when_enabled_false', () => {
    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, false),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does_not_fetch_when_city_empty', () => {
    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('', {}, true),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('multi_value_bedrooms_uses_append', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', { bedrooms: [1, 2] }, true),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.getAll('bedrooms')).toEqual(['1', '2']);
  });

  it('multi_value_propertyTypes_uses_append', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () =>
        useDiscoverFilteredMarkers('udupi', { propertyTypes: ['house', 'apartment'] }, true),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.getAll('propertyTypes')).toEqual(['house', 'apartment']);
  });

  it('dateFrom_Date_serialised_to_ISO', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () =>
        useDiscoverFilteredMarkers(
          'udupi',
          { dateFrom: new Date('2025-01-01T00:00:00Z') },
          true,
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('dateFrom')).toBe('2025-01-01T00:00:00.000Z');
  });

  it('school_proximity_included', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () =>
        useDiscoverFilteredMarkers(
          'udupi',
          { schoolLat: 13.0, schoolLon: 74.0, schoolRadiusKm: 2 },
          true,
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('schoolLat')).toBe('13');
    expect(params.get('schoolLon')).toBe('74');
    expect(params.get('schoolRadiusKm')).toBe('2');
  });

  it('boolean_flags_newToMarket_reraRegistered', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () =>
        useDiscoverFilteredMarkers(
          'udupi',
          { newToMarket: true, reraRegistered: true },
          true,
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('newToMarket')).toBe('true');
    expect(params.get('reraRegistered')).toBe('true');
  });

  it('bbox_snapped_to_grid_and_sent_as_south_west_north_east', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    // Raw bbox: south=13.341, west=74.741, north=13.359, east=74.759
    // Snapped: south=13.34, west=74.74, north=13.36, east=74.76
    const bbox: [number, number, number, number] = [13.341, 74.741, 13.359, 74.759];

    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true, bbox),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('bbox')).toBe('13.34,74.74,13.36,74.76');
  });

  it('bbox_omitted_when_not_provided', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('bbox')).toBe(false);
  });

  it('bbox_omitted_when_null', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true, null),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('bbox')).toBe(false);
  });

  it('bbox_omitted_when_contains_Infinity', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () =>
        useDiscoverFilteredMarkers(
          'udupi',
          {},
          true,
          [Infinity, 74.741, 13.359, 74.759] as unknown as [number, number, number, number],
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('bbox')).toBe(false);
  });

  // ─── Regression: Issue #1109 — school-first marker enablement ─────────────
  // MapDiscovery now sets enabled=true when schoolId is present (unauthenticated
  // school-first users). These tests guard the enabled-prop boundary in the hook.

  it('school_first_enabled_true_with_school_params_fetches', async () => {
    // Simulates: schoolId set → markersEnabled=true passed to hook
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () =>
        useDiscoverFilteredMarkers(
          'udupi',
          { schoolLat: 13.34, schoolLon: 74.74, schoolRadiusKm: 2 },
          true, // enabled=true (from !!urlState.schoolId being truthy)
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledTimes(1);
    const [url] = mockGet.mock.calls[0] as [string, unknown];
    expect(url).toContain('schoolLat=13.34');
    expect(url).toContain('schoolLon=74.74');
  });

  it('school_first_enabled_false_when_school_cleared_blocks_fetch', () => {
    // Simulates: schoolId cleared + unauthenticated → markersEnabled=false
    const { result } = renderHook(
      () =>
        useDiscoverFilteredMarkers(
          'udupi',
          { schoolLat: 13.34, schoolLon: 74.74, schoolRadiusKm: 2 },
          false, // enabled=false (schoolId absent, not authenticated, not area-first)
        ),
      { wrapper: makeWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('empty_schoolId_does_not_enable_fetch', () => {
    // Simulates: urlState.schoolId = '' → !!'' = false → markersEnabled stays false
    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, false),
      { wrapper: makeWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });
  // ─── End regression #1109 ─────────────────────────────────────────────────

  // ─── Regression: Issue #1109 run 2 — placeholderData preserves markers during school-proximity refetch ──
  it('placeholderData_preserves_previous_markers_during_school_proximity_refetch', async () => {
    // First fetch: no school filters → returns markers
    const INITIAL_MARKERS = {
      city: 'udupi',
      markers: [{ id: 'p1', lat: 13.34, lon: 74.74, pricePaise: 5000000 }],
      truncated: false,
    };
    // Second fetch: school proximity added → simulates slow in-flight refetch
    const SCHOOL_MARKERS = {
      city: 'udupi',
      markers: [{ id: 'p2', lat: 13.35, lon: 74.75, pricePaise: 6000000 }],
      truncated: false,
    };

    let resolveSecondFetch!: (value: typeof SCHOOL_MARKERS) => void;
    const secondFetchPromise = new Promise<typeof SCHOOL_MARKERS>((res) => {
      resolveSecondFetch = res;
    });

    mockGet
      .mockResolvedValueOnce(INITIAL_MARKERS)
      .mockReturnValueOnce(secondFetchPromise);

    // Use a shared QueryClient so rerenders share the same cache
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    // Render with no-school filters
    const { result, rerender } = renderHook(
      ({ filters }: { filters: Record<string, unknown> }) =>
        useDiscoverFilteredMarkers('udupi', filters, true),
      { wrapper, initialProps: { filters: {} } },
    );

    // Wait for first successful fetch
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.markers).toHaveLength(1);

    // Rerender with school proximity filters — triggers new queryKey → in-flight refetch
    rerender({ filters: { schoolLat: 13.34, schoolLon: 74.74, schoolRadiusKm: 2 } });

    // While second fetch is in-flight, placeholderData must serve previous markers (non-empty)
    // isFetching=true means the refetch is in-progress
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.data?.markers).toHaveLength(1);  // previous data preserved, not []

    // Resolve the second fetch and confirm data updates to new result
    resolveSecondFetch(SCHOOL_MARKERS);
    await waitFor(() => expect(result.current.data?.markers).toHaveLength(1));
    await waitFor(() => expect(result.current.data?.markers[0].id).toBe('p2'));
  });
  // ─── End regression #1109 run 2 ───────────────────────────────────────────────────────────────────────

  it('bbox_omitted_when_contains_NaN', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () =>
        useDiscoverFilteredMarkers(
          'udupi',
          {},
          true,
          [NaN, 74.741, 13.359, 74.759] as unknown as [number, number, number, number],
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('bbox')).toBe(false);
  });

  // ─── Integration: Issue #1240 — lat/lon field contract with backend ────────
  // Backend /api/discover/markers returns { id, lat, lon, pricePaise, locality }.
  // The DiscoverFilteredMarker interface must use lat/lon (not latitude/longitude)
  // so filteredMarkerToPropertyListing receives defined coordinates and property
  // pins render on the map.

  it('marker_response_lat_lon_fields_flow_through_hook_data', async () => {
    const MARKERS_WITH_COORDS = {
      city: 'udupi',
      markers: [
        { id: 'a1', lat: 13.3498, lon: 74.7852, pricePaise: 5000000, locality: 'Katapadi' },
        { id: 'a2', lat: 13.36, lon: 74.77, pricePaise: null, locality: null },
      ],
      truncated: false,
    };
    mockGet.mockResolvedValue(MARKERS_WITH_COORDS);

    const { result } = renderHook(
      () =>
        useDiscoverFilteredMarkers(
          'udupi',
          { schoolLat: 13.35, schoolLon: 74.78, schoolRadiusKm: 5 },
          true,
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const markers = result.current.data?.markers ?? [];
    expect(markers).toHaveLength(2);
    // Hook returns raw API shape — lat/lon must be present (not undefined)
    expect(markers[0].lat).toBe(13.3498);
    expect(markers[0].lon).toBe(74.7852);
    expect(markers[1].lat).toBe(13.36);
    expect(markers[1].lon).toBe(74.77);
  });

  it('filteredMarkerToPropertyListing_produces_defined_latitude_longitude_from_api_response', async () => {
    const { filteredMarkerToPropertyListing } = await import('@/lib/discoverMappers');
    const MARKERS_WITH_COORDS = {
      city: 'udupi',
      markers: [
        { id: 'b1', lat: 13.3498, lon: 74.7852, pricePaise: 3000000, locality: 'Katapadi' },
      ],
      truncated: false,
    };
    mockGet.mockResolvedValue(MARKERS_WITH_COORDS);

    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', { schoolLat: 13.35, schoolLon: 74.78, schoolRadiusKm: 5 }, true),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const markers = result.current.data?.markers ?? [];
    const listing = filteredMarkerToPropertyListing(markers[0], new Date().toISOString());
    // End-to-end chain: API lat/lon → hook → mapper → PropertyListing.latitude/longitude
    expect(listing.latitude).toBe(13.3498);
    expect(listing.longitude).toBe(74.7852);
    expect(typeof listing.latitude).toBe('number');
    expect(typeof listing.longitude).toBe('number');
  });
  // ─── End regression #1240 ────────────────────────────────────────────────

  // ─── AC5: keyword q param (#1245) ─────────────────────────────────────────

  // AC5a: non-blank q is appended to the markers API URL
  it('AC5a_q_non_blank_appended_to_url_params', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true, null, 'villa'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('q')).toBe('villa');
  });

  it('AC5a_q_with_surrounding_whitespace_is_trimmed', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true, null, '  villa  '),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('q')).toBe('villa');
  });

  // AC5b: empty/undefined q → NO q= in URL
  it('AC5b_q_undefined_not_appended', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true, null, undefined),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('q')).toBe(false);
  });

  it('AC5b_q_blank_string_not_appended', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true, null, '   '),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('q')).toBe(false);
  });

  it('AC5b_q_omitted_baseline_unchanged', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    // Baseline: call without the q argument — existing callers are unaffected
    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('q')).toBe(false);
  });

  // AC5c: queryKey includes trimmedQ — cache invalidates when keyword changes
  it('AC5c_different_q_produces_different_queryKey', () => {
    mockGet.mockResolvedValue(BASE_MARKERS);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { rerender } = renderHook(
      ({ q }: { q?: string }) =>
        useDiscoverFilteredMarkers('udupi', {}, true, null, q),
      { wrapper, initialProps: { q: 'sea view' } },
    );

    rerender({ q: 'garden view' });

    const keys = qc.getQueryCache().getAll().map((entry) => entry.queryKey);
    const withSeaView = keys.find((k) => JSON.stringify(k).includes('sea view'));
    const withGardenView = keys.find((k) => JSON.stringify(k).includes('garden view'));
    expect(withSeaView).toBeDefined();
    expect(withGardenView).toBeDefined();
  });

  it('AC5c_same_trimmed_q_produces_same_queryKey', () => {
    mockGet.mockResolvedValue(BASE_MARKERS);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { rerender } = renderHook(
      ({ q }: { q?: string }) =>
        useDiscoverFilteredMarkers('udupi', {}, true, null, q),
      { wrapper, initialProps: { q: 'abc' } },
    );

    rerender({ q: ' abc ' });

    const keys = qc.getQueryCache().getAll().map((entry) => entry.queryKey);
    // Both renders resolve to the same trimmed value → only one cache entry
    const abcKeys = keys.filter((k) => JSON.stringify(k).includes('"abc"'));
    expect(abcKeys.length).toBe(1);
  });

  // ─── End AC5 (#1245) ─────────────────────────────────────────────────────

  // ─── AC-F2: marker truncation metadata passthrough (#944) ─────────────────

  it('AC_F2_truncation_metadata_flows_through_hook_data', async () => {
    const TRUNCATED_RESPONSE = {
      city: 'udupi',
      markers: [{ id: 'm1', lat: 13.34, lon: 74.74, pricePaise: 5000000, locality: 'Katapadi' }],
      truncated: true,
      returnedElements: 1000,
      totalFilteredElements: 4200,
      limit: 1000,
      boundsApplied: true,
    };
    mockGet.mockResolvedValue(TRUNCATED_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.truncated).toBe(true);
    expect(result.current.data?.returnedElements).toBe(1000);
    expect(result.current.data?.totalFilteredElements).toBe(4200);
    expect(result.current.data?.limit).toBe(1000);
    expect(result.current.data?.boundsApplied).toBe(true);
  });

  it('AC_F2_not_truncated_metadata_flows_through_hook_data', async () => {
    const NOT_TRUNCATED_RESPONSE = {
      city: 'udupi',
      markers: [{ id: 'm1', lat: 13.34, lon: 74.74, pricePaise: 5000000, locality: 'Katapadi' }],
      truncated: false,
      returnedElements: 42,
      totalFilteredElements: 42,
      limit: 1000,
      boundsApplied: true,
    };
    mockGet.mockResolvedValue(NOT_TRUNCATED_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.truncated).toBe(false);
    expect(result.current.data?.returnedElements).toBe(42);
    expect(result.current.data?.totalFilteredElements).toBe(42);
  });

  // ─── End AC-F2 (#944) ─────────────────────────────────────────────────────

  // ─── Issue #1496 — listingPurpose intent filter ───────────────────────────

  it('T1_listingPurpose_rent_appended_to_url_params', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);
    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true, null, undefined, 'rent'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('listingPurpose')).toBe('rent');
  });

  it('T2_listingPurpose_sale_appended_to_url_params', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);
    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true, null, undefined, 'sale'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('listingPurpose')).toBe('sale');
  });

  it('T3_listingPurpose_absent_not_appended_backward_compat', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);
    // Caller without 6th arg — must not send listingPurpose in URL (regression / backward-compat)
    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('listingPurpose')).toBe(false);
  });

  it('T4_distinct_listingPurpose_produces_distinct_queryKey', () => {
    mockGet.mockResolvedValue(BASE_MARKERS);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { rerender } = renderHook(
      ({ lp }: { lp?: string }) =>
        useDiscoverFilteredMarkers('udupi', {}, true, null, undefined, lp),
      { wrapper, initialProps: { lp: 'sale' } },
    );

    rerender({ lp: 'rent' });

    const keys = qc.getQueryCache().getAll().map((entry) => entry.queryKey);
    const withSale = keys.find((k) => JSON.stringify(k).includes('"sale"'));
    const withRent = keys.find((k) => JSON.stringify(k).includes('"rent"'));
    expect(withSale).toBeDefined();
    expect(withRent).toBeDefined();
  });

  it('T5_same_listingPurpose_produces_same_queryKey', () => {
    mockGet.mockResolvedValue(BASE_MARKERS);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { rerender } = renderHook(
      ({ lp }: { lp?: string }) =>
        useDiscoverFilteredMarkers('udupi', {}, true, null, undefined, lp),
      { wrapper, initialProps: { lp: 'sale' } },
    );

    rerender({ lp: 'sale' });

    const keys = qc.getQueryCache().getAll().map((entry) => entry.queryKey);
    const saleKeys = keys.filter((k) => JSON.stringify(k).includes('"sale"'));
    expect(saleKeys.length).toBe(1); // Only one cache entry for same value
  });

  it('T6_listingPurpose_undefined_not_appended', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);
    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', {}, true, null, undefined, undefined),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('listingPurpose')).toBe(false);
  });

  // ─── End Issue #1496 ─────────────────────────────────────────────────────────
});
