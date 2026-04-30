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
});
