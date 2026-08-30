import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { destinationPoint } from '@/lib/geo';
import {
  useAgriDestinationMarkers,
  type UseAgriDestinationMarkersParams,
} from './useAgriDestinationMarkers';
import type { AgriDestinationBucket } from '@/hooks/useRegionalAreaGroups';

const UDUPI_LAT = 13.3409;
const UDUPI_LON = 74.7421;

function makeBucket(overrides: Partial<AgriDestinationBucket> = {}): AgriDestinationBucket {
  return {
    areaKey: 'IN|KA|Udupi|Brahmavar',
    displayName: 'Brahmavar',
    distanceKm: 15,
    bearingDeg: 45,
    direction: 'NE',
    parcelCount: 8,
    ...overrides,
  };
}

function makeParams(
  overrides: Partial<UseAgriDestinationMarkersParams> = {},
): UseAgriDestinationMarkersParams {
  return {
    agriDestinations: [makeBucket()],
    cityLat: UDUPI_LAT,
    cityLon: UDUPI_LON,
    ...overrides,
  };
}

describe('useAgriDestinationMarkers', () => {
  it('AC4: derives a non-empty marker array from non-empty agriDestinations, positionally derived from bucket bearing/distance', () => {
    const { result } = renderHook(() => useAgriDestinationMarkers(makeParams()));

    expect(result.current).toHaveLength(1);
    const [marker] = result.current;
    expect(marker.id).toBe('IN|KA|Udupi|Brahmavar');
    expect(marker.areaKey).toBe('IN|KA|Udupi|Brahmavar');
    expect(marker.propertyType).toBe('agricultural_land');
    expect(marker.title).toBe('Brahmavar');

    const [expectedLat, expectedLon] = destinationPoint(UDUPI_LAT, UDUPI_LON, 45, 15);
    expect(marker.latitude).toBeCloseTo(expectedLat, 6);
    expect(marker.longitude).toBeCloseTo(expectedLon, 6);
    // Sanity: the derived position must differ from the city origin itself —
    // proves the marker is genuinely projected, not just pinned at the centroid.
    expect(marker.latitude).not.toBeCloseTo(UDUPI_LAT, 3);
  });

  it('derives one marker per bucket, each at its own bearing/distance', () => {
    const buckets = [
      makeBucket({ areaKey: 'a1', displayName: 'Town A', bearingDeg: 0, distanceKm: 10 }),
      makeBucket({ areaKey: 'a2', displayName: 'Town B', bearingDeg: 180, distanceKm: 20 }),
    ];
    const { result } = renderHook(() =>
      useAgriDestinationMarkers(makeParams({ agriDestinations: buckets })),
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0].id).toBe('a1');
    expect(result.current[1].id).toBe('a2');
    expect(result.current[0].latitude).not.toBeCloseTo(result.current[1].latitude, 3);
  });

  it('returns [] when agriDestinations is empty', () => {
    const { result } = renderHook(() =>
      useAgriDestinationMarkers(makeParams({ agriDestinations: [] })),
    );
    expect(result.current).toEqual([]);
  });

  it('returns [] when the city origin is not yet resolved (cityLat/cityLon undefined)', () => {
    const { result } = renderHook(() =>
      useAgriDestinationMarkers(makeParams({ cityLat: undefined, cityLon: undefined })),
    );
    expect(result.current).toEqual([]);
  });

  it('carries parcelAcreage through as computedAreaAcres, null when absent', () => {
    const withAcreage = renderHook(() =>
      useAgriDestinationMarkers(
        makeParams({ agriDestinations: [makeBucket({ parcelAcreage: 42 })] }),
      ),
    );
    expect(withAcreage.result.current[0].computedAreaAcres).toBe(42);

    const withoutAcreage = renderHook(() => useAgriDestinationMarkers(makeParams()));
    expect(withoutAcreage.result.current[0].computedAreaAcres).toBeNull();
  });

  // Issue #2296 (PR #2381 review) — Level-2 marker must carry the authoritative
  // per-destination parcelCount straight from AgriDestinationBucket, not a
  // synthetic marker/cluster-child count.
  it('carries parcelCount through from the bucket unchanged', () => {
    const { result } = renderHook(() =>
      useAgriDestinationMarkers(
        makeParams({ agriDestinations: [makeBucket({ parcelCount: 8 })] }),
      ),
    );
    expect(result.current[0].parcelCount).toBe(8);
  });

  // Issue #2296 (PR #2381 review) — zero-count rule: a destination bucket with
  // no parcels for the current filters must not produce a marker at all.
  it('omits buckets with parcelCount === 0', () => {
    const buckets = [
      makeBucket({ areaKey: 'has-parcels', displayName: 'Brahmavar', parcelCount: 4 }),
      makeBucket({ areaKey: 'zero-parcels', displayName: 'Udupi', parcelCount: 0 }),
    ];
    const { result } = renderHook(() =>
      useAgriDestinationMarkers(makeParams({ agriDestinations: buckets })),
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].areaKey).toBe('has-parcels');
    expect(result.current.some((m) => m.areaKey === 'zero-parcels')).toBe(false);
  });

  it('returns [] when every bucket has parcelCount === 0', () => {
    const { result } = renderHook(() =>
      useAgriDestinationMarkers(
        makeParams({ agriDestinations: [makeBucket({ parcelCount: 0 })] }),
      ),
    );
    expect(result.current).toEqual([]);
  });

  // Stable-identity contract (reviewer requirement): id/areaKey must remain the
  // bucket's areaKey after the parcelCount/zero-count changes, so click-to-drill
  // routing (useMarkerSelection reads areaKey) is unaffected.
  it('keeps id/areaKey identity keyed on the bucket areaKey (stable click routing)', () => {
    const { result } = renderHook(() =>
      useAgriDestinationMarkers(
        makeParams({ agriDestinations: [makeBucket({ areaKey: 'IN|KA|Udupi|Brahmavar', parcelCount: 4 })] }),
      ),
    );
    expect(result.current[0].id).toBe('IN|KA|Udupi|Brahmavar');
    expect(result.current[0].areaKey).toBe('IN|KA|Udupi|Brahmavar');
  });
});
