/**
 * Issue #1882 (Track A PR2 Slice S4) — camera/scope CONTRACT.
 *
 * MapController (PropertyMap.tsx) remains the SOLE camera owner; this file
 * exercises the EXTENDED CameraIntent contract built by
 * resolveCameraFraming/computeCameraPadding (useDiscoverMapData.ts):
 *   - per-scope camera intent: region (canonical bounds), group (union
 *     bbox), area (bbox) — via the EXISTING 'overview'/'leaf' framings.
 *   - Hebbal exact-fit + responsive panel-aware padding, fires once.
 *   - fallback chain (valid bbox → centroid fallback → city bounds → city
 *     centre), including the REAL degenerate Basavanagudi point-only bbox
 *     case — routes to flyTo, never a degenerate fitBounds.
 *   - the existing fit-once suppression (lastHandledSeqRef/TTL) and
 *     manual-zoom-preserves-scope invariants are unaffected by the padding
 *     extension.
 *
 * Mirrors the PropertyMap.cameraIntent.test.tsx mock scaffolding exactly
 * (that file MUST stay green, unedited, as its own regression guard).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';

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
    latLngBounds: vi.fn((bounds: [[number, number], [number, number]]) => ({
      getCenter: () => ({ lat: (bounds[0][0] + bounds[1][0]) / 2, lng: (bounds[0][1] + bounds[1][1]) / 2 }),
    })),
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
vi.mock('@/components/map/AreaMarkerLayer', () => ({
  AreaMarkerLayer: () => null,
}));
vi.mock('@/components/map/SchoolMarkerLayer', () => ({
  SchoolMarkerLayer: () => null,
}));
vi.mock('@/dev/ScaleHud', () => ({ ScaleHud: () => null }));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Imports after mocks ───────────────────────────────────────
import { PropertyMap } from '@/components/map/PropertyMap';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';
import {
  resolveCameraFraming,
  computeCameraPadding,
  deriveDiscoverScopeKind,
} from '@/hooks/useDiscoverMapData';

const CITY_CENTER: [number, number] = [13.3409, 74.7421];

const baseProps = {
  listings: [],
  cityCenter: CITY_CENTER,
  cityZoom: 11,
  resetMapTick: 0,
  areas: [],
};

function totalCameraCalls() {
  return (
    mapStub.fitBounds.mock.calls.length +
    mapStub.flyTo.mock.calls.length +
    mapStub.setView.mock.calls.length
  );
}

// Real coordinates from the plan's fixtures.
const HEBBAL_BBOX: [[number, number], [number, number]] = [[13.03, 77.58], [13.06, 77.62]];
const HEBBAL_CENTROID: [number, number] = [13.045, 77.6];
// Real degenerate (point-only) case — a single-area group with no spatial spread.
const BASAVANAGUDI_POINT: [[number, number], [number, number]] = [[12.9425, 77.5738], [12.9425, 77.5738]];
const BASAVANAGUDI_CENTROID: [number, number] = [12.9425, 77.5738];

beforeEach(() => {
  mapStub.fitBounds.mockClear();
  mapStub.flyTo.mockClear();
  mapStub.setView.mockClear();
  mapStub.getBoundsZoom.mockReturnValue(14);
});

describe('Issue #1882 — per-scope camera intent (region/group/area)', () => {
  it('region scope: fits the canonical region bounds via overview framing', () => {
    const framed = resolveCameraFraming({
      bbox: [[13.0, 77.5], [13.2, 77.8]],
      centroid: [13.1, 77.65],
    });
    const intent: CameraIntent = {
      seq: 1,
      bounds: framed.bounds,
      center: framed.center,
      framing: 'overview',
      padding: computeCameraPadding(1440),
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    // Leaflet-native [horizontalPx, verticalPx] — desktop's 120px is
    // horizontal (right-panel-side breathing room), not vertical.
    expect(mapStub.fitBounds).toHaveBeenCalledWith(framed.bounds, { padding: [120, 40], maxZoom: 12 });
    expect(totalCameraCalls()).toBe(1);
  });

  it('group scope: fits the group union bbox via overview framing', () => {
    const groupBbox: [[number, number], [number, number]] = [[13.34, 74.74], [13.36, 74.76]];
    const framed = resolveCameraFraming({ bbox: groupBbox, centroid: [13.35, 74.75] });
    const intent: CameraIntent = {
      seq: 1,
      bounds: framed.bounds,
      center: framed.center,
      framing: 'overview',
      padding: computeCameraPadding(1440),
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds).toHaveBeenCalledWith(groupBbox, { padding: [120, 40], maxZoom: 12 });
  });

  it('area scope (Hebbal): exact bbox fit, responsive desktop padding, fires exactly once', () => {
    expect(deriveDiscoverScopeKind({ areaKey: 'IN|KA|Bengaluru|Hebbal' })).toBe('area');
    const framed = resolveCameraFraming({ bbox: HEBBAL_BBOX, centroid: HEBBAL_CENTROID });
    expect(framed.bounds).toEqual(HEBBAL_BBOX);

    const intent: CameraIntent = {
      seq: 1,
      bounds: framed.bounds,
      center: framed.center,
      framing: 'leaf',
      padding: computeCameraPadding(1440), // desktop viewport
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);

    expect(totalCameraCalls()).toBe(1);
    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    // Desktop padding [120, 40] (Leaflet-native [x, y]) passed through to
    // getBoundsZoom's L.point(x, y) — corrected order, not reversed.
    expect(mapStub.getBoundsZoom).toHaveBeenCalledWith(HEBBAL_BBOX, false, { x: 120, y: 40 });
  });

  // NOTE (camera-padding rework): this test exercises MapController's
  // CONSUMPTION of an already-built padding value (computeCameraPadding
  // called directly here, at test-construction time, mirroring how a
  // producer would build the intent). It does NOT by itself prove the real
  // browser click path selects mobile padding — that requires calling the
  // REAL publishCameraIntent/publishClusterCameraIntent producer signature
  // with window.innerWidth set, which is covered separately in
  // useDiscoverMapData.clusterCameraIntent.test.ts's "responsive camera
  // padding derives window.innerWidth internally" describe block.
  it('area scope (Hebbal) on a mobile viewport uses the mobile padding instead', () => {
    const framed = resolveCameraFraming({ bbox: HEBBAL_BBOX, centroid: HEBBAL_CENTROID });
    const intent: CameraIntent = {
      seq: 1,
      bounds: framed.bounds,
      center: framed.center,
      framing: 'leaf',
      padding: computeCameraPadding(390), // mobile viewport
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);

    expect(mapStub.getBoundsZoom).toHaveBeenCalledWith(HEBBAL_BBOX, false, { x: 40, y: 40 });
  });

  it('a CameraIntent with no padding (pre-#1882 producer/legacy literal) still defaults to [40, 40]', () => {
    const intent: CameraIntent = {
      seq: 1,
      bounds: HEBBAL_BBOX,
      center: HEBBAL_CENTROID,
      framing: 'overview',
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);

    expect(mapStub.fitBounds).toHaveBeenCalledWith(HEBBAL_BBOX, { padding: [40, 40], maxZoom: 12 });
  });
});

describe('Issue #1882 — fallback chain', () => {
  it('valid bbox is fit directly (no fallback engaged)', () => {
    const framed = resolveCameraFraming({ bbox: HEBBAL_BBOX, centroid: HEBBAL_CENTROID });
    expect(framed).toEqual({ bounds: HEBBAL_BBOX, center: [13.045, 77.6], usedCentroidFallback: false });
  });

  it('a null bbox with a valid centroid falls back to the centroid (bounds null)', () => {
    const framed = resolveCameraFraming({ bbox: null, centroid: [13.5, 74.9] });
    expect(framed.bounds).toBeNull();
    expect(framed.center).toEqual([13.5, 74.9]);
    expect(framed.usedCentroidFallback).toBe(true);
  });

  it('the REAL degenerate Basavanagudi point-only bbox (min === max) routes to the centroid fallback — never fit directly', () => {
    const framed = resolveCameraFraming({ bbox: BASAVANAGUDI_POINT, centroid: BASAVANAGUDI_CENTROID });
    expect(framed.bounds).toBeNull();
    expect(framed.center).toEqual(BASAVANAGUDI_CENTROID);
    expect(framed.usedCentroidFallback).toBe(true);
  });

  it('the degenerate Basavanagudi case renders as a flyTo, never a fitBounds, on the actual map', () => {
    const framed = resolveCameraFraming({ bbox: BASAVANAGUDI_POINT, centroid: BASAVANAGUDI_CENTROID });
    const intent: CameraIntent = {
      seq: 1,
      bounds: framed.bounds,
      center: framed.center,
      framing: 'overview',
      padding: computeCameraPadding(1440),
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);

    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.flyTo).toHaveBeenCalledTimes(1);
    expect(mapStub.flyTo).toHaveBeenCalledWith(BASAVANAGUDI_CENTROID, 12);
  });

  it('no bbox AND no centroid falls back to city bounds', () => {
    const cityBounds: [[number, number], [number, number]] = [[12.8, 77.4], [13.2, 77.9]];
    const framed = resolveCameraFraming({ bbox: null, centroid: null, cityBounds });
    expect(framed.bounds).toEqual(cityBounds);
    expect(framed.usedCentroidFallback).toBe(false);
  });

  it('nothing resolves (no bbox, no centroid, no city bounds) — falls back to city centre, bounds null', () => {
    const framed = resolveCameraFraming({ bbox: null, centroid: null, cityCentre: CITY_CENTER });
    expect(framed.bounds).toBeNull();
    expect(framed.center).toEqual(CITY_CENTER);
  });
});

describe('Issue #1882 — scope-before-camera / manual-zoom-preserves-scope invariants', () => {
  it('a manual zoom (no new cameraIntent seq) performs no camera call and cannot clear an existing intent', () => {
    const intent: CameraIntent = {
      seq: 1,
      bounds: HEBBAL_BBOX,
      center: HEBBAL_CENTROID,
      framing: 'leaf',
      padding: computeCameraPadding(1440),
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setView.mockClear();

    // Simulate a manual zoom: re-render with the SAME cameraIntent (no new
    // seq published) — MapController's seq-guard must not re-fire, and
    // nothing in this contract ever mutates URL scope from a zoom event.
    rerender(<PropertyMap {...baseProps} cameraIntent={{ ...intent }} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(0);
  });

  it('deriveDiscoverScopeKind never reads zoom — scope is a pure function of URL selection state, so a manual zoom cannot change it', () => {
    // A manual zoom changes only the map's `zoom`/`center` representation;
    // it carries no areaKey/groupId/scope input, so scope kind derivation
    // (which only ever reads those three fields) is structurally unaffected.
    expect(deriveDiscoverScopeKind({ areaKey: 'IN|KA|Bengaluru|Hebbal' })).toBe('area');
    expect(deriveDiscoverScopeKind({ groupId: 'university-belt' })).toBe('group');
    expect(deriveDiscoverScopeKind({ scope: 'north' })).toBe('region');
  });
});

describe('Issue #1882 — back/forward (Back-ladder) restoration', () => {
  it('a fresh higher-seq cameraIntent after a back/forward navigation still fires exactly once (existing seq-guard, unaffected by padding)', () => {
    const forward: CameraIntent = {
      seq: 1,
      bounds: HEBBAL_BBOX,
      center: HEBBAL_CENTROID,
      framing: 'leaf',
      padding: computeCameraPadding(1440),
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={forward} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);

    // Back navigation restores a DIFFERENT scope (region-level, seq 2) —
    // a strictly higher seq must still fire once, even with a different
    // framing/padding shape than the previous intent.
    const back: CameraIntent = {
      seq: 2,
      bounds: [[13.0, 74.5], [13.8, 75.2]],
      center: [13.34, 74.75],
      framing: 'overview',
      padding: computeCameraPadding(390),
    };
    rerender(<PropertyMap {...baseProps} cameraIntent={back} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(2);
    expect(mapStub.fitBounds).toHaveBeenLastCalledWith(back.bounds, { padding: [40, 40], maxZoom: 12 });
  });

  it('a stale (lower/equal) seq delivered after a back/forward navigation does not re-fire (idempotent guard preserved)', () => {
    const intent: CameraIntent = {
      seq: 5,
      bounds: HEBBAL_BBOX,
      center: HEBBAL_CENTROID,
      framing: 'leaf',
      padding: computeCameraPadding(1440),
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);

    rerender(<PropertyMap {...baseProps} cameraIntent={{ ...intent, seq: 5 }} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);
    rerender(<PropertyMap {...baseProps} cameraIntent={{ ...intent, seq: 3 }} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);
  });
});
