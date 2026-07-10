/**
 * useDiscoverMapData — publishClusterCameraIntent (Issue #1806 FIX-4, T17).
 *
 * publishClusterCameraIntent is the sibling producer to publishCameraIntent
 * added for area-CLUSTER clicks. It MUST share the same monotonic
 * cameraIntentSeqRef so MapController's seq-guard
 * (`if (cameraIntent.seq <= lastHandledSeqRef.current) return;`) treats both
 * producers as one stream — a fresh cluster click always wins over a stale
 * area click and vice versa, regardless of which producer fired last.
 *
 * MapController's consumption of framing='overview' (maxZoom 12, no
 * suppression armed) is already covered end-to-end by
 * PropertyMap.cameraIntent.test.tsx ("overview framing always uses fitBounds
 * with maxZoom 12" + the "an OVERVIEW intent never arms suppression"
 * regression test) — publishClusterCameraIntent always produces
 * framing='overview', so those tests apply unchanged (T18).
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
  isGroup: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('useDiscoverMapData — publishClusterCameraIntent (Issue #1806 FIX-4, T17)', () => {
  it('always publishes framing=overview', () => {
    const { result } = renderHook(() => useDiscoverMapData(BASE_PARAMS), { wrapper: makeWrapper() });

    act(() => {
      result.current.publishClusterCameraIntent(
        [[13.03, 77.6], [13.06, 77.64]],
        [13.045, 77.62],
      );
    });

    expect(result.current.cameraIntent?.framing).toBe('overview');
    expect(result.current.cameraIntent?.bounds).toEqual([[13.03, 77.6], [13.06, 77.64]]);
    expect(result.current.cameraIntent?.center).toEqual([13.045, 77.62]);
  });

  it('T17: shares cameraIntentSeqRef with publishCameraIntent — two rapid clicks (one area, one cluster) publish STRICTLY increasing seq', () => {
    const { result } = renderHook(() => useDiscoverMapData(BASE_PARAMS), { wrapper: makeWrapper() });

    act(() => {
      result.current.publishCameraIntent(AREA);
    });
    const firstSeq = result.current.cameraIntent?.seq;
    expect(firstSeq).toBeDefined();

    act(() => {
      result.current.publishClusterCameraIntent([[13.0, 77.5], [13.1, 77.7]], [13.05, 77.6]);
    });
    const secondSeq = result.current.cameraIntent?.seq;
    expect(secondSeq).toBeGreaterThan(firstSeq as number);

    act(() => {
      result.current.publishCameraIntent(AREA);
    });
    const thirdSeq = result.current.cameraIntent?.seq;
    expect(thirdSeq).toBeGreaterThan(secondSeq as number);
  });

  it('T17b: two rapid cluster clicks in a row also publish strictly increasing seq', () => {
    const { result } = renderHook(() => useDiscoverMapData(BASE_PARAMS), { wrapper: makeWrapper() });

    act(() => {
      result.current.publishClusterCameraIntent([[13.0, 77.5], [13.1, 77.7]], [13.05, 77.6]);
    });
    const first = result.current.cameraIntent?.seq as number;

    act(() => {
      result.current.publishClusterCameraIntent([[13.2, 77.8], [13.3, 77.9]], [13.25, 77.85]);
    });
    const second = result.current.cameraIntent?.seq as number;

    expect(second).toBeGreaterThan(first);
  });
});
