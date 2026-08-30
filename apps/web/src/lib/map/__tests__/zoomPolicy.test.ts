/**
 * Unit tests for zoomPolicy (Issue #1882 Track A PR2 Slice S1, extended in
 * PR3 Slice S1) — the sole Discover area/cluster/marker zoom-band source.
 */

import { describe, it, expect } from 'vitest';
import {
  AREA_LAYER_MAX_ZOOM,
  shouldShowMarkers,
  isOverviewZoomBand,
  AREA_LAYER_MARKERS_EXIT_ZOOM,
  resolveZoomBand,
  CLUSTER_DISABLE_AT_ZOOM,
  CLUSTER_MAX_RADIUS_PX,
  selectPrimaryMapLayer,
} from '../zoomPolicy';

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

// ─── Issue #1882 Track A PR3 Slice S1 — hysteresis dead-band ───────────────

describe('AREA_LAYER_MARKERS_EXIT_ZOOM', () => {
  it('is 11.5 — the exit-to-overview threshold, making the dead band exactly {zoom === 12} under integer zoomSnap', () => {
    expect(AREA_LAYER_MARKERS_EXIT_ZOOM).toBe(11.5);
  });
});

describe('resolveZoomBand', () => {
  it('dead band: zoom === 12 holds the previously-committed band (markers)', () => {
    expect(resolveZoomBand(12, 'markers')).toBe('markers');
  });

  it('dead band: zoom === 12 holds the previously-committed band (overview)', () => {
    expect(resolveZoomBand(12, 'overview')).toBe('overview');
  });

  it('enters markers strictly above AREA_LAYER_MAX_ZOOM (13)', () => {
    expect(resolveZoomBand(13, 'overview')).toBe('markers');
  });

  it('stays in markers on a further zoom-in (16)', () => {
    expect(resolveZoomBand(16, 'markers')).toBe('markers');
  });

  it('exits to overview at the exit threshold (11.5) regardless of prevBand', () => {
    expect(resolveZoomBand(11.5, 'markers')).toBe('overview');
  });

  it('exits to overview below the exit threshold (11) regardless of prevBand', () => {
    expect(resolveZoomBand(11, 'markers')).toBe('overview');
  });

  it('stays in overview on a further zoom-out (5)', () => {
    expect(resolveZoomBand(5, 'overview')).toBe('overview');
  });

  it('a 12<->13 oscillation never drops below markers once entered (no flip-flop)', () => {
    let band: 'overview' | 'markers' = 'overview';
    for (const zoom of [13, 12, 13, 12, 13, 12]) {
      band = resolveZoomBand(zoom, band);
      expect(band).toBe('markers');
    }
  });
});

describe('CLUSTER_DISABLE_AT_ZOOM / CLUSTER_MAX_RADIUS_PX', () => {
  it('CLUSTER_DISABLE_AT_ZOOM is 16 (behaviour-preserving extraction)', () => {
    expect(CLUSTER_DISABLE_AT_ZOOM).toBe(16);
  });

  it('CLUSTER_MAX_RADIUS_PX is 50 (behaviour-preserving extraction)', () => {
    expect(CLUSTER_MAX_RADIUS_PX).toBe(50);
  });
});

describe('selectPrimaryMapLayer', () => {
  it('no areas → residential markers win, regardless of band', () => {
    expect(selectPrimaryMapLayer({ band: 'overview', isAgriMode: false, hasAreas: false })).toBe('residentialMarkers');
    expect(selectPrimaryMapLayer({ band: 'markers', isAgriMode: false, hasAreas: false })).toBe('residentialMarkers');
  });

  it('areas present + overview band → area layer wins (residential cluster suppressed)', () => {
    expect(selectPrimaryMapLayer({ band: 'overview', isAgriMode: false, hasAreas: true })).toBe('area');
  });

  it('areas present + markers band → residential cluster wins (area layer suppressed)', () => {
    expect(selectPrimaryMapLayer({ band: 'markers', isAgriMode: false, hasAreas: true })).toBe('residentialMarkers');
  });

  it('agri mode always coexists, regardless of band or areas presence (pre-#1882 behaviour preserved)', () => {
    expect(selectPrimaryMapLayer({ band: 'overview', isAgriMode: true, hasAreas: true })).toBe('agriCoexist');
    expect(selectPrimaryMapLayer({ band: 'markers', isAgriMode: true, hasAreas: true })).toBe('agriCoexist');
    expect(selectPrimaryMapLayer({ band: 'overview', isAgriMode: true, hasAreas: false })).toBe('agriCoexist');
    expect(selectPrimaryMapLayer({ band: 'markers', isAgriMode: true, hasAreas: false })).toBe('agriCoexist');
  });
});
