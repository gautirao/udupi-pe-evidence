/**
 * Unit tests for the pure area-cluster "splittable" predicates (Issue #1806 FIX-5).
 */

import { describe, it, expect } from 'vitest';
import { clusterCanSplit, hasSpatialSpread } from '../areaClusterSplit';
import { AREA_LAYER_MAX_ZOOM } from '../zoomPolicy';

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

// Issue #1806 R2/DIRECTIVE 2 — drift guard, re-anchored to the canonical
// src/lib/map/zoomPolicy.ts source (Issue #1882 Track A PR2 Slice S1).
// MapController's 'overview' branch (PropertyMap.tsx) and MapDiscovery.tsx
// now both import AREA_LAYER_MAX_ZOOM from zoomPolicy directly instead of
// each keeping a private copy, so this guard's job is now to pin the shared
// value itself: if it ever changes without an explicit, deliberate update
// here, a cluster click could drill the camera past the area-marker
// degradation layer and reproduce the "empty map after clicking +N areas"
// bug (#1806) even after this fix.
describe('AREA_LAYER_MAX_ZOOM drift guard', () => {
  it('equals 12 — the same value MapController.overview and MapDiscovery import from zoomPolicy', () => {
    expect(AREA_LAYER_MAX_ZOOM).toBe(12);
  });
});
