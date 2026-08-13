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

  // Issue #2150 — real geocoded "coincident" listings carry sub-metre jitter
  // (never byte-identical). The #2150 regression spec's own
  // `makeCoincidentListings` fixture spaces 8 members by 1e-7 degrees per
  // member (max spread ~7e-7 degrees, well under a metre) and documents that
  // spread as "never a real spatial spread". Before this fix, EPS=1e-9 read
  // that fixture as "has spread", which made PropertyMap's cluster-tap
  // handler publish a real camera fit-to-bounds for a cluster that should
  // have been treated as non-splittable — racing leaflet.markercluster's own
  // independent decision to spiderfy that same bottomed-out cluster on the
  // same click, and (live-reproduced via e2e) corrupting the render: the
  // spiderfy fan opened, then the marker layer emptied within ~300ms.
  it('sub-metre (geocoding-jitter-scale) difference → false (Issue #2150 — realistic coincident listings, not byte-identical)', () => {
    // 7e-7 degrees ≈ 7.8cm at this project's latitude band — matches the
    // #2150 fixture's max per-cluster spread (8 members × 1e-7 degrees).
    expect(hasSpatialSpread([13.05, 77.65], [13.05 + 7e-7, 77.65 + 7e-7])).toBe(false);
  });

  it('metre-plus difference → true (comfortably above the coincident-jitter threshold)', () => {
    // ~1.1e-5 degrees ≈ 1.2m — matches computeCoincidentMarkerOffsets'
    // (zoomPolicy.ts) own 5-decimal-place "coincident" rounding precedent;
    // anything spread wider than that is a genuinely distinct location.
    expect(hasSpatialSpread([13.05, 77.65], [13.05 + 2e-5, 77.65])).toBe(true);
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
