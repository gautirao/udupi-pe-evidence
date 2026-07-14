/**
 * Unit tests for zoomPolicy (Issue #1882 Track A PR2 Slice S1) — the sole
 * Discover area/cluster/marker zoom-band source.
 */

import { describe, it, expect } from 'vitest';
import { AREA_LAYER_MAX_ZOOM, shouldShowMarkers, isOverviewZoomBand } from '../zoomPolicy';

describe('AREA_LAYER_MAX_ZOOM', () => {
  it('is 12 — the canonical area/cluster/marker zoom-band boundary', () => {
    expect(AREA_LAYER_MAX_ZOOM).toBe(12);
  });
});

describe('shouldShowMarkers', () => {
  it('false at zoom below the band boundary', () => {
    expect(shouldShowMarkers(11)).toBe(false);
  });

  it('false exactly at the band boundary (inclusive to overview)', () => {
    expect(shouldShowMarkers(12)).toBe(false);
  });

  it('true one zoom level above the boundary (strict >)', () => {
    expect(shouldShowMarkers(13)).toBe(true);
  });

  it('true well above the boundary', () => {
    expect(shouldShowMarkers(16)).toBe(true);
  });
});

describe('isOverviewZoomBand', () => {
  it('true below the boundary', () => {
    expect(isOverviewZoomBand(11)).toBe(true);
  });

  it('true exactly at the boundary', () => {
    expect(isOverviewZoomBand(12)).toBe(true);
  });

  it('false above the boundary', () => {
    expect(isOverviewZoomBand(13)).toBe(false);
  });

  it('is the exact logical negation of shouldShowMarkers at every tested zoom', () => {
    for (const zoom of [0, 5, 11, 12, 13, 14, 20]) {
      expect(isOverviewZoomBand(zoom)).toBe(!shouldShowMarkers(zoom));
    }
  });
});
