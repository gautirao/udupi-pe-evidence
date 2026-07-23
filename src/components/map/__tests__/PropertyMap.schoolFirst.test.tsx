/**
 * Issue #1882 (Track A PR3, Slice S5, AC6) — school-first no-loop invariant.
 *
 * Guards SchoolMarkerFocusPanner's tick-guarded fitBounds against re-firing:
 *   1. schoolMarkerFocusTick 0->1 fires fitBounds exactly once, capped at
 *      SCHOOL_MARKER_FOCUS_MAX_ZOOM (the school-first camera contract,
 *      issue #1160 GAP 1 / #1240).
 *   2. A zoom/viewport change with NO tick bump (e.g. PropertyMap's new
 *      committed-zoom-band recompute via useZoomBand) must NOT add a second
 *      fitBounds — the school-panner effect's dependency array is scoped to
 *      schoolMarkerFocusTick/lat/lon/radiusKm/markerPositions/map only.
 *   3. Toggling isAgriMode must not change the school-panner fit count —
 *      school-first and agri-first camera paths are orthogonal and must
 *      never cross-trigger each other.
 *
 * Mirrors the mock scaffolding used by PropertyMap.cameraIntent.test.tsx /
 * PropertyMap.cameraScope.test.tsx (both KEEP-GREEN, unedited).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// ─── Hoisted stubs ─────────────────────────────────────────────
const mapStub = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  setView: vi.fn(),
  setZoom: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  getZoom: vi.fn(() => 11),
  getBoundsZoom: vi.fn(() => 14),
  getBounds: vi.fn(() => ({
    getNorth: () => 14,
    getSouth: () => 13,
    getEast: () => 75,
    getWest: () => 74,
  })),
  getContainer: vi.fn(() => document.body),
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  invalidateSize: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 13.3409, lng: 74.7421 })),
}));

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ on: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
    markerClusterGroup: vi.fn(() => ({ addLayer: vi.fn() })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
    // Fixed, always-valid bounds — sufficient for SchoolMarkerFocusPanner's
    // markerBounds ∩ radiusBounds intersection to be non-degenerate
    // (south < north && west < east) so the radius-fit branch always fires.
    latLngBounds: vi.fn(() => ({
      getSouth: () => 13,
      getWest: () => 74,
      getNorth: () => 14,
      getEast: () => 75,
      isValid: () => true,
    })),
    latLng: vi.fn((lat: number, lng: number) => ({ lat, lng })),
  },
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  ZoomControl: () => null,
  Marker: () => null,
  Circle: () => null,
  Tooltip: () => null,
  useMap: () => mapStub,
}));

vi.mock('@/components/map/DrawControl', () => ({ DrawControl: () => null }));
// Renders a detectable stub (rather than null) so the AC4 exclusivity tests
// below can assert its presence/absence via testid. Harmless for the
// school-first tests above — they never pass a non-empty `areas` prop, so
// this mock is never invoked for them either way.
vi.mock('@/components/map/AreaMarkerLayer', () => ({
  AreaMarkerLayer: () => <div data-testid="area-marker-layer-mounted" />,
}));
vi.mock('@/components/map/SchoolMarkerLayer', () => ({
  SchoolMarkerLayer: () => null,
}));
vi.mock('@/dev/ScaleHud', () => ({ ScaleHud: () => null }));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Imports after mocks ───────────────────────────────────────
import { PropertyMap, SCHOOL_MARKER_FOCUS_MAX_ZOOM } from '@/components/map/PropertyMap';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

const CITY_CENTER: [number, number] = [13.3409, 74.7421];

const baseProps = {
  listings: [],
  areas: [],
  cityCenter: CITY_CENTER,
  cityZoom: 11,
  resetMapTick: 0,
  schoolFocusLat: 13.35,
  schoolFocusLon: 74.79,
  schoolFocusRadiusKm: 2,
  schoolMarkerPositions: [{ lat: 13.351, lon: 74.791 }],
};

describe('Issue #1882 PR3 — school-first no-loop invariant (SchoolMarkerFocusPanner)', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
  });

  it('schoolMarkerFocusTick 0->1 fires fitBounds exactly once, capped at SCHOOL_MARKER_FOCUS_MAX_ZOOM', () => {
    const { rerender } = render(<PropertyMap {...baseProps} schoolMarkerFocusTick={0} />);
    expect(mapStub.fitBounds).not.toHaveBeenCalled();

    rerender(<PropertyMap {...baseProps} schoolMarkerFocusTick={1} />);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [, opts] = mapStub.fitBounds.mock.calls[0] as [unknown, { maxZoom?: number }];
    expect(opts).toMatchObject({ maxZoom: SCHOOL_MARKER_FOCUS_MAX_ZOOM });
  });

  it('a mapZoom change with no tick bump (e.g. useZoomBand recompute) does not add a second fitBounds', () => {
    // Issue #1953 (RH1 adopt-on-mount) — a genuine first mount always sees
    // schoolMarkerFocusTick=0 (see the test above); mount at 0 then bump to 1
    // mirrors the real sequence instead of asserting on an unreachable
    // mount-directly-at-1 state.
    const { rerender } = render(<PropertyMap {...baseProps} mapZoom={11} schoolMarkerFocusTick={0} />);
    expect(mapStub.fitBounds).not.toHaveBeenCalled();

    rerender(<PropertyMap {...baseProps} mapZoom={11} schoolMarkerFocusTick={1} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);

    rerender(<PropertyMap {...baseProps} mapZoom={13} schoolMarkerFocusTick={1} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);

    rerender(<PropertyMap {...baseProps} mapZoom={12} schoolMarkerFocusTick={1} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('toggling isAgriMode does not change the school-panner fit count (no cross-trigger)', () => {
    // Issue #1953 (RH1 adopt-on-mount) — mount at tick=0 first (see rationale above).
    const { rerender } = render(
      <PropertyMap {...baseProps} schoolMarkerFocusTick={0} isAgriMode={false} />,
    );
    expect(mapStub.fitBounds).not.toHaveBeenCalled();

    rerender(<PropertyMap {...baseProps} schoolMarkerFocusTick={1} isAgriMode={false} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);

    rerender(<PropertyMap {...baseProps} schoolMarkerFocusTick={1} isAgriMode={true} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);

    rerender(<PropertyMap {...baseProps} schoolMarkerFocusTick={1} isAgriMode={false} />);
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });
});

// ─── Issue #1882 PR3 Slice S1/S3, AC4 — one-primary-layer render-gate ──────
// exclusivity (added post code-review: the pure selector + the tests above
// only exercise the `areas: []` path, which never reaches the actual
// exclusivity branch since selectPrimaryMapLayer short-circuits to
// 'residentialMarkers' whenever hasAreas is false. These tests mount
// PropertyMap with a non-empty `areas` prop so the render-gate itself is
// exercised end-to-end.)

describe('Issue #1882 PR3 — one-primary-layer render-gate exclusivity (AC4)', () => {
  const AREA: AreaPoint = {
    areaKey: 'IN|KA|Udupi|Manipal',
    areaLabel: 'Manipal',
    geo_center_lat: 13.3525,
    geo_center_lon: 74.7869,
    bbox: [[13.34, 74.78], [13.37, 74.82]],
  };

  beforeEach(() => {
    mapStub.addLayer.mockClear();
    mapStub.removeLayer.mockClear();
  });

  /**
   * MarkerClusterLayer/AgriMarkerClusterLayer are NOT separately importable
   * modules — they are local, unexported function components declared
   * inside PropertyMap.tsx — so `vi.mock` cannot target them directly
   * without a production-code export change (out of scope for this
   * test-only addition). Both call `map.addLayer(clusterGroup)` exactly
   * once per mount/dependency-change and `map.removeLayer(clusterGroup)`
   * on cleanup, and in this test file they are the ONLY callers of
   * `mapStub.addLayer`/`removeLayer` (AreaMarkerLayer is mocked to a plain
   * div above; DrawControl/SchoolMarkerLayer are mocked to null; Polygon/
   * Marker/Circle are stubbed too). Net (addLayer calls - removeLayer
   * calls) is therefore a reliable proxy for "a cluster layer is currently
   * mounted" across these renders.
   */
  function isClusterLayerMounted(): boolean {
    return mapStub.addLayer.mock.calls.length > mapStub.removeLayer.mock.calls.length;
  }

  it('non-agri: AreaMarkerLayer and the residential cluster layer are mutually exclusive across an 11->13->12 zoom walk (no transient double-mount; hysteresis holds the band at 12)', () => {
    const { rerender } = render(
      <PropertyMap {...baseProps} areas={[AREA]} isAgriMode={false} mapZoom={11} schoolMarkerFocusTick={0} />,
    );
    // Step 1 — overview band (zoom 11): AreaMarkerLayer is primary, residential cluster suppressed.
    expect(screen.queryByTestId('area-marker-layer-mounted')).toBeInTheDocument();
    expect(isClusterLayerMounted()).toBe(false);

    rerender(
      <PropertyMap {...baseProps} areas={[AREA]} isAgriMode={false} mapZoom={13} schoolMarkerFocusTick={0} />,
    );
    // Step 2 — enters the markers band (zoom 13): residential cluster is primary, AreaMarkerLayer suppressed.
    expect(screen.queryByTestId('area-marker-layer-mounted')).not.toBeInTheDocument();
    expect(isClusterLayerMounted()).toBe(true);

    rerender(
      <PropertyMap {...baseProps} areas={[AREA]} isAgriMode={false} mapZoom={12} schoolMarkerFocusTick={0} />,
    );
    // Step 3 — dead band (zoom 12): hysteresis HOLDS the committed 'markers'
    // band — the residential cluster stays primary and AreaMarkerLayer stays
    // suppressed. This is the actual PR3 fix: before it, AreaMarkerLayer would
    // have remounted here because `areas.length > 0` was the ONLY gate.
    expect(screen.queryByTestId('area-marker-layer-mounted')).not.toBeInTheDocument();
    expect(isClusterLayerMounted()).toBe(true);
  });

  it('agri mode: AreaMarkerLayer and AgriMarkerClusterLayer coexist (not collapsed by the one-primary-layer rule)', () => {
    render(
      <PropertyMap {...baseProps} areas={[AREA]} isAgriMode={true} mapZoom={11} schoolMarkerFocusTick={0} />,
    );

    expect(screen.queryByTestId('area-marker-layer-mounted')).toBeInTheDocument();
    expect(isClusterLayerMounted()).toBe(true);
  });
});
