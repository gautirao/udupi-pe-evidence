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
import { useDiscoverMarkers } from '../useDiscoverMarkers';

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
  markers: [],
};

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDiscoverMarkers', () => {
  it('bbox_null_omits_bbox_param_from_url', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverMarkers('udupi', null),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('bbox')).toBe(false);
  });

  it('bbox_undefined_omits_bbox_param_from_url', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverMarkers('udupi', undefined),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('bbox')).toBe(false);
  });

  it('areaKeys_appended_as_repeated_params_in_sorted_order', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () =>
        useDiscoverMarkers('udupi', null, true, [
          'IN|KA|Udupi|Manipal',
          'IN|KA|Udupi|Karkala',
        ]),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.getAll('areaKeys')).toEqual([
      'IN|KA|Udupi|Karkala',
      'IN|KA|Udupi|Manipal',
    ]);
  });

  it('empty_areaKeys_disables_fetch_guard', () => {
    const { result } = renderHook(
      () => useDiscoverMarkers('udupi', null, true, []),
      { wrapper: makeWrapper() },
    );

    // Must stay idle — empty areaKeys guard prevents request
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('bbox_valid_finite_values_serialised_to_url', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    // Raw bbox: south=13.341, west=74.741, north=13.359, east=74.759
    // Snapped to 0.02° grid:
    //   south: floor(13.341 / 0.02) * 0.02 = 667 * 0.02 = 13.34
    //   west:  floor(74.741 / 0.02) * 0.02 = 3737 * 0.02 = 74.74
    //   north: ceil(13.359 / 0.02) * 0.02  = 668 * 0.02 = 13.36
    //   east:  ceil(74.759 / 0.02) * 0.02  = 3738 * 0.02 = 74.76
    const bbox: [number, number, number, number] = [13.341, 74.741, 13.359, 74.759];

    const { result } = renderHook(
      () => useDiscoverMarkers('udupi', bbox),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('bbox')).toBe('13.34,74.74,13.36,74.76');
  });
});
