/**
 * Issue #1882 (Track A PR3, Slice S6, AC7) — request-churn guard.
 *
 * Without zoom hysteresis, a raw 12<->13 zoom oscillation would flip
 * MapDiscovery's `markersEnabled` gate (`shouldShowMarkers(mapZoom)`) true/
 * false/true on every step. This test proves the EXISTING
 * useDiscoverFilteredMarkers configuration — `staleTime: 60_000` +
 * `placeholderData: (prev) => prev` (Issue #1109) — already absorbs that
 * oscillation at the network layer: the underlying queryFn fires ONCE for
 * the whole oscillation (not once per `enabled` flip), because the query
 * key is unchanged and the data is still fresh when re-enabled.
 *
 * This is why PR3 intentionally does NOT touch MapDiscovery's
 * `markersEnabled` fetch gate (or wire useZoomBand there) — the render-side
 * fix (PropertyMap's committed zoom band + one-primary-layer selector) is
 * sufficient on its own; this test is the evidence for that call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { shouldShowMarkers } from '@/lib/map/zoomPolicy';

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
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const BASE_MARKERS = { city: 'udupi', markers: [], truncated: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Issue #1882 PR3 — useDiscoverFilteredMarkers request-churn guard (AC7)', () => {
  it('a raw 13->12->13->12->11->12->13 zoom oscillation (no hysteresis) fires the underlying queryFn exactly once', async () => {
    mockGet.mockResolvedValue(BASE_MARKERS);

    const zoomSequence = [13, 12, 13, 12, 11, 12, 13];
    const wrapper = makeWrapper();

    const { result, rerender } = renderHook(
      ({ zoom }: { zoom: number }) => useDiscoverFilteredMarkers('udupi', {}, shouldShowMarkers(zoom)),
      { wrapper, initialProps: { zoom: zoomSequence[0] } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);

    for (const zoom of zoomSequence.slice(1)) {
      rerender({ zoom });
    }

    // Give any (incorrect) extra refetch a chance to fire before asserting.
    await waitFor(() => expect(result.current.fetchStatus).not.toBe('fetching'));

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('once disabled (zoom back in the overview band), the previous markers stay in data (placeholderData, no flash-empty)', async () => {
    mockGet.mockResolvedValue({
      city: 'udupi',
      markers: [{ id: 'm1', lat: 13.34, lon: 74.74, pricePaise: 5_000_000, locality: 'Katapadi' }],
      truncated: false,
    });

    const wrapper = makeWrapper();
    const { result, rerender } = renderHook(
      ({ zoom }: { zoom: number }) => useDiscoverFilteredMarkers('udupi', {}, shouldShowMarkers(zoom)),
      { wrapper, initialProps: { zoom: 13 } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.markers).toHaveLength(1);

    // Oscillate back into the overview band (enabled=false) then back out.
    rerender({ zoom: 12 });
    rerender({ zoom: 13 });

    expect(result.current.data?.markers).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
