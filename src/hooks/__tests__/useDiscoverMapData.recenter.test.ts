/**
 * useDiscoverMapData — publishRecenterCameraIntent / bypassSuppression scoping
 * (Issue #2088, commit 6, R5).
 *
 * ── PREMISE CORRECTION (orchestrator-verified, read against PropertyMap.tsx
 *    at the base commit — PropertyMap.tsx is NOT in this issue's edit
 *    boundary and is not touched here) ──
 * The `bypassSuppression` field's own doc comment on `CameraIntent`
 * (useDiscoverMapData.ts) claims a Recenter click "already moves the camera
 * unconditionally today, with NO PropertyMap.tsx change required" — because
 * the `cameraIntent` effect there is gated ONLY by
 * `if (seq <= lastHandledSeqRef.current) return;`, never by
 * `CAMERA_SUPPRESS_TTL_MS` (that TTL gates a SEPARATE `focusBounds` effect
 * only). This means `bypassSuppression` is, today, INERT with respect to the
 * `cameraIntent` consumption path — a test asserting "Recenter's bypass makes
 * the camera move" would pass VACUOUSLY (it would still pass with the field
 * deleted entirely, since ANY fresh seq moves the camera regardless of the
 * field's value). That non-vacuous camera-mechanics proof instead lives in
 * `PropertyMap.recenterBypass.test.tsx` (which documents and exercises the
 * real seq-guard mechanism, plus a negative control on the actually-gated
 * `focusBounds` path).
 *
 * This file's job is narrower and fully provable at the PRODUCER level: (c)
 * from the R5 premise-correction brief — prove `bypassSuppression` is set
 * ONLY by the explicit-user-action producer (`publishRecenterCameraIntent`)
 * and NEVER by the two automatic/click-derived producers
 * (`publishCameraIntent`, `publishClusterCameraIntent`) — so the
 * explicit-action SCOPING is real and testable at the point where the field
 * is actually written, even though its consumer-side effect is currently a
 * no-op.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockFilteredMarkers = vi.hoisted(() => vi.fn());
const mockDiscoverListings = vi.hoisted(() => vi.fn());
const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());
const mockDiscoverAreasGet = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: mockFilteredMarkers,
}));
vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: mockDiscoverListings,
}));
vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: mockTrendsOptions,
}));
vi.mock('@/hooks/useSchoolRadiusListings', () => ({
  useSchoolRadiusListings: mockSchoolRadiusListings,
  mapSchoolRadiusCard: vi.fn((x: unknown) => x),
}));
vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolById: mockSchoolById,
}));
vi.mock('@/lib/api', () => ({
  api: { get: mockDiscoverAreasGet },
  ApiError: class extends Error {},
}));

import { useDiscoverMapData } from '../useDiscoverMapData';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function setupDefaultMocks() {
  mockFilteredMarkers.mockReturnValue({ data: undefined, isLoading: false, isFetching: false });
  mockDiscoverListings.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: null });
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockDiscoverAreasGet.mockResolvedValue({ city: 'bangalore', areas: [] });
}

const BASE_PARAMS = {
  city: 'bangalore',
  selectedArea: null as null,
  filters: {},
  debouncedSearch: '',
  urlSchoolId: null as null,
  isAuthenticated: true,
  fitTick: 0,
  markersEnabled: false,
  page: 0,
  bbox: null as null,
};

const AREA: AreaPoint = {
  areaKey: 'IN|KA|Bengaluru|Hebbal',
  areaLabel: 'Hebbal',
  geo_center_lat: 13.045,
  geo_center_lon: 77.62,
  bbox: null,
  isGroup: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('useDiscoverMapData — publishRecenterCameraIntent sets bypassSuppression (Issue #2088 R5c)', () => {
  it('publishRecenterCameraIntent always sets bypassSuppression: true, regardless of framing', () => {
    const { result } = renderHook(() => useDiscoverMapData(BASE_PARAMS), { wrapper: makeWrapper() });

    act(() => {
      result.current.publishRecenterCameraIntent(
        [[13.03, 77.6], [13.06, 77.64]],
        [13.045, 77.62],
        'leaf',
      );
    });
    expect(result.current.cameraIntent?.bypassSuppression).toBe(true);
    expect(result.current.cameraIntent?.framing).toBe('leaf');

    act(() => {
      result.current.publishRecenterCameraIntent(null, [13.0, 77.6], 'overview');
    });
    expect(result.current.cameraIntent?.bypassSuppression).toBe(true);
    expect(result.current.cameraIntent?.framing).toBe('overview');
  });

  it('publishRecenterCameraIntent shares the SAME monotonic seq stream as the other two producers', () => {
    const { result } = renderHook(() => useDiscoverMapData(BASE_PARAMS), { wrapper: makeWrapper() });

    act(() => {
      result.current.publishCameraIntent(AREA);
    });
    const firstSeq = result.current.cameraIntent?.seq as number;

    act(() => {
      result.current.publishRecenterCameraIntent([[13.0, 77.5], [13.1, 77.7]], [13.05, 77.6], 'leaf');
    });
    const secondSeq = result.current.cameraIntent?.seq as number;
    expect(secondSeq).toBeGreaterThan(firstSeq);

    act(() => {
      result.current.publishClusterCameraIntent([[13.2, 77.8], [13.3, 77.9]], [13.25, 77.85]);
    });
    const thirdSeq = result.current.cameraIntent?.seq as number;
    expect(thirdSeq).toBeGreaterThan(secondSeq);
  });
});

describe('useDiscoverMapData — automatic producers NEVER set bypassSuppression (Issue #2088 R5c, explicit-action scoping)', () => {
  it('publishCameraIntent (area-marker click) leaves bypassSuppression undefined', () => {
    const { result } = renderHook(() => useDiscoverMapData(BASE_PARAMS), { wrapper: makeWrapper() });

    act(() => {
      result.current.publishCameraIntent(AREA);
    });

    expect(result.current.cameraIntent).not.toBeNull();
    expect(result.current.cameraIntent?.bypassSuppression).toBeUndefined();
  });

  it('publishClusterCameraIntent (area-cluster click) leaves bypassSuppression undefined', () => {
    const { result } = renderHook(() => useDiscoverMapData(BASE_PARAMS), { wrapper: makeWrapper() });

    act(() => {
      result.current.publishClusterCameraIntent([[13.0, 77.5], [13.1, 77.7]], [13.05, 77.6]);
    });

    expect(result.current.cameraIntent).not.toBeNull();
    expect(result.current.cameraIntent?.bypassSuppression).toBeUndefined();
  });

  it('POSITIVE CONTROL — a Recenter intent published immediately after an automatic one is the ONLY one carrying bypassSuppression:true, proving the two producer classes are genuinely distinguishable on the same cameraIntent stream', () => {
    const { result } = renderHook(() => useDiscoverMapData(BASE_PARAMS), { wrapper: makeWrapper() });

    act(() => {
      result.current.publishCameraIntent(AREA);
    });
    expect(result.current.cameraIntent?.bypassSuppression).toBeUndefined();

    act(() => {
      result.current.publishRecenterCameraIntent(
        AREA.bbox,
        [AREA.geo_center_lat, AREA.geo_center_lon],
        'leaf',
      );
    });
    expect(result.current.cameraIntent?.bypassSuppression).toBe(true);
  });
});
