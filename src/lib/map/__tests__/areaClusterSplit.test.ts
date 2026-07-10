/**
 * Unit tests for the pure area-cluster "splittable" predicates (Issue #1806 FIX-5).
 */

import { describe, it, expect } from 'vitest';
import { AREA_LAYER_MAX_ZOOM, clusterCanSplit, hasSpatialSpread } from '../areaClusterSplit';

describe('hasSpatialSpread', () => {
  it('identical southWest/northEast → false (coincident member centres)', () => {
    expect(hasSpatialSpread([13.34, 74.74], [13.34, 74.74])).toBe(false);
  });

  it('sub-epsilon difference → false (floating-point noise, not real spread)', () => {
    expect(hasSpatialSpread([13.34, 74.74], [13.34 + 1e-12, 74.74])).toBe(false);
  });

  it('distinct southWest/northEast → true', () => {
    expect(hasSpatialSpread([13.3, 74.7], [13.4, 74.8])).toBe(true);
  });
});

describe('clusterCanSplit', () => {
  it('coincident centres (no spatial spread) → false, even when targetZoom > currentZoom', () => {
    expect(clusterCanSplit(9, 12, false)).toBe(false);
  });

  it('targetZoom <= currentZoom → false, even with spatial spread', () => {
    expect(clusterCanSplit(12, 12, true)).toBe(false);
    expect(clusterCanSplit(13, 12, true)).toBe(false);
  });

  it('spatial spread + targetZoom > currentZoom → true', () => {
    expect(clusterCanSplit(9, 12, true)).toBe(true);
  });
});

// Issue #1806 R2/DIRECTIVE 2 — drift guard. The predicate's zoom cap,
// MapController's 'overview' branch maxZoom (PropertyMap.tsx, literal
// `maxZoom: 12` passed to map.fitBounds), and MapDiscovery.tsx's private
// AREA_LAYER_MAX_ZOOM (=12) must all agree. If they ever diverge, a cluster
// click can drill the camera past the area-marker degradation layer and
// reproduce the "empty map after clicking +N areas" bug even after this fix.
describe('AREA_LAYER_MAX_ZOOM drift guard', () => {
  it('equals 12 — the same maxZoom MapController.overview and MapDiscovery.AREA_LAYER_MAX_ZOOM use', () => {
    expect(AREA_LAYER_MAX_ZOOM).toBe(12);
  });
});
