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
});
