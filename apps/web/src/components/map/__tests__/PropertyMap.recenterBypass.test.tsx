/**
 * Issue #2088 (commit 6) — Recenter / CameraIntent.bypassSuppression, R5.
 *
 * ── PREMISE CORRECTION (mandatory reading before trusting any test below) ──
 * The R5 test case as originally worded assumes `CAMERA_SUPPRESS_TTL_MS`
 * gates the `cameraIntent` consumption path in `PropertyMap.tsx`'s
 * `MapController`. IT DOES NOT — verified by direct read of `PropertyMap.tsx`
 * at the base commit (this file does not, and per this issue's edit boundary
 * may not, modify that source):
 *   - The `cameraIntent` effect (~PropertyMap.tsx:1407-1464) is guarded ONLY
 *     by `if (seq <= lastHandledSeqRef.current) return;` (~:1425). When
 *     `framing === 'leaf'` it ARMS suppression (`suppressForSeqRef`/
 *     `suppressArmedAtRef`, ~:1427-1430) but is never itself gated by the TTL.
 *   - The TTL (`CAMERA_SUPPRESS_TTL_MS = 8000`) is consumed EXCLUSIVELY by
 *     the SEPARATE `focusBounds` effect (~:1466-1487):
 *     `if (armedForMs <= CAMERA_SUPPRESS_TTL_MS) { return; }`.
 * So a Recenter republishing a `cameraIntent` with a bumped `seq` ALREADY
 * moves the camera unconditionally via the seq guard alone — `bypassSuppression`
 * is, today, INERT with respect to that path. A test asserting "the Recenter
 * bypass works" (i.e. "a Recenter intent moves the camera") would therefore
 * pass VACUOUSLY: it would still pass with `bypassSuppression` deleted from
 * the `CameraIntent` type entirely, since ANY fresh, strictly-increasing
 * `seq` moves the camera regardless of that field.
 *
 * This file instead proves the REAL mechanism honestly:
 *   (a) A Recenter `cameraIntent` with a bumped seq moves the camera even
 *       when a 'leaf' intent armed suppression moments earlier — and the
 *       SAME is true of a plain (non-Recenter, `bypassSuppression` absent)
 *       fresh-seq intent, proving the seq guard — not `bypassSuppression` —
 *       is what actually governs this path (documents the true mechanism
 *       rather than asserting a false one).
 *   (b) NEGATIVE CONTROL — the SEPARATE `focusBounds`/network-refit path
 *       REMAINS suppressed inside the 8s TTL window even immediately after a
 *       Recenter intent (`bypassSuppression: true`) armed that suppression.
 *       This is the assertion that would actually FAIL if a future change
 *       wired `bypassSuppression` into the wrong effect (the `focusBounds`
 *       suppression check) instead of leaving it as the documented-but-inert
 *       seam it is today — proving the field is genuinely inert on that path,
 *       not just "not yet observed to do anything".
 *
 * Mocking strategy is copied verbatim from `PropertyMap.cameraIntent.test.tsx`
 * (same mock shape, same `baseProps`) so this file's results are directly
 * comparable to that suite's — no second, independently-drifting harness.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';

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
  remove: vi.fn(),
}));

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ on: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
    markerClusterGroup: vi.fn(() => ({ addLayer: vi.fn(), on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis() })),
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
vi.mock('@/components/map/AreaMarkerLayer', () => ({ AreaMarkerLayer: () => null }));
vi.mock('@/components/map/SchoolMarkerLayer', () => ({ SchoolMarkerLayer: () => null }));
vi.mock('@/dev/ScaleHud', () => ({ ScaleHud: () => null }));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { PropertyMap } from '@/components/map/PropertyMap';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';

const CITY_CENTER: [number, number] = [13.3409, 74.7421];

const baseProps = {
  listings: [],
  cityCenter: CITY_CENTER,
  cityZoom: 11,
  resetMapTick: 0,
  areas: [],
};

const LEAF_BOUNDS: [[number, number], [number, number]] = [[13.34, 74.78], [13.37, 74.82]];
const RECENTER_BOUNDS: [[number, number], [number, number]] = [[13.4, 74.9], [13.42, 74.92]];

function leafIntent(seq: number, overrides: Partial<CameraIntent> = {}): CameraIntent {
  return { seq, bounds: LEAF_BOUNDS, center: [13.3525, 74.7869], framing: 'leaf', ...overrides };
}

function recenterIntent(seq: number, overrides: Partial<CameraIntent> = {}): CameraIntent {
  return {
    seq,
    bounds: RECENTER_BOUNDS,
    center: [13.41, 74.91],
    framing: 'leaf',
    bypassSuppression: true,
    ...overrides,
  };
}

function totalCameraCalls() {
  return (
    mapStub.fitBounds.mock.calls.length +
    mapStub.flyTo.mock.calls.length +
    mapStub.setView.mock.calls.length
  );
}

beforeEach(() => {
  mapStub.fitBounds.mockClear();
  mapStub.flyTo.mockClear();
  mapStub.setView.mockClear();
  mapStub.setZoom.mockClear();
  mapStub.once.mockClear();
  mapStub.getBoundsZoom.mockClear();
  mapStub.getBoundsZoom.mockReturnValue(14);
});

describe('Issue #2088 R5(a) — a Recenter intent moves the camera BECAUSE of the seq bump, not because of bypassSuppression', () => {
  it('a Recenter cameraIntent (bumped seq, bypassSuppression:true) fires a camera move immediately after a leaf intent armed suppression', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);

    // A prior leaf-framed click arms suppression for its own seq.
    rerender(<PropertyMap {...baseProps} cameraIntent={leafIntent(1)} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);

    // The Recenter republishes with a bumped seq.
    rerender(<PropertyMap {...baseProps} cameraIntent={recenterIntent(2)} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(2);
    expect(mapStub.setView).toHaveBeenCalledTimes(2);
  });

  it('CONTROL — a plain fresh-seq intent with NO bypassSuppression fires identically, proving the seq guard alone is what governs this path', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);

    rerender(<PropertyMap {...baseProps} cameraIntent={leafIntent(1)} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);

    // Same shape as the Recenter intent above (bumped seq, framing='leaf',
    // same bounds) but bypassSuppression is explicitly ABSENT — if
    // bypassSuppression were what caused the camera to move, this would fire
    // ZERO additional times. It fires exactly once, identically to the
    // Recenter case, because only lastHandledSeqRef governs this effect.
    rerender(
      <PropertyMap
        {...baseProps}
        cameraIntent={leafIntent(2, { bounds: RECENTER_BOUNDS, bypassSuppression: undefined })}
        focusBounds={null}
      />,
    );
    expect(totalCameraCalls()).toBe(2);
    expect(mapStub.setView).toHaveBeenCalledTimes(2);
  });
});

describe('Issue #2088 R5(b) — NEGATIVE CONTROL: the focusBounds/network-refit path remains suppressed inside the TTL window even after a Recenter intent armed it', () => {
  it('a focusBounds change for the SAME already-handled Recenter seq is still suppressed (bypassSuppression:true on the intent does not leak into the focusBounds effect)', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);

    // Recenter intent — framing='leaf' arms suppression exactly like any
    // other leaf intent (the arming logic reads `cameraIntent.framing`, not
    // `bypassSuppression`).
    rerender(<PropertyMap {...baseProps} cameraIntent={recenterIntent(1)} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1); // the Recenter's own camera move

    // A network-driven focusBounds refit follows, correlated to the SAME
    // seq, well within the 8s TTL. If a future change mistakenly wired
    // bypassSuppression into this effect's suppression check, this would
    // fire an EXTRA camera call here. It must not — the field is inert on
    // this path today, by design (see the module doc's premise correction).
    rerender(
      <PropertyMap
        {...baseProps}
        cameraIntent={recenterIntent(1)}
        focusBounds={[[13.405, 74.905], [13.415, 74.915]]}
      />,
    );
    expect(totalCameraCalls()).toBe(1);
  });

  it('POSITIVE CONTROL — once the TTL genuinely expires, the SAME focusBounds change fires normally (proves the suppression mechanism itself still works; the negative control above is not just a tautology)', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
      rerender(<PropertyMap {...baseProps} cameraIntent={recenterIntent(1)} focusBounds={null} />);
      expect(totalCameraCalls()).toBe(1);

      vi.advanceTimersByTime(9000); // > CAMERA_SUPPRESS_TTL_MS (8000ms)

      rerender(
        <PropertyMap
          {...baseProps}
          cameraIntent={recenterIntent(1)}
          focusBounds={[[13.405, 74.905], [13.415, 74.915]]}
        />,
      );
      expect(totalCameraCalls()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a focusBounds change with NO correlated cameraIntent ever published (Recenter or otherwise) still fires normally — suppression never leaks into unrelated state', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(0);

    rerender(
      <PropertyMap {...baseProps} cameraIntent={null} focusBounds={[[13.3, 74.7], [13.4, 74.8]]} />,
    );
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });
});

describe('Issue #2088 R5(c) at the consumer boundary — a Recenter intent republished with the SAME seq (no bump) does not re-fire, exactly like any other producer', () => {
  it('re-rendering with the SAME Recenter intent object twice fires only once', () => {
    const intent = recenterIntent(1);
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);

    rerender(<PropertyMap {...baseProps} cameraIntent={{ ...intent }} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);
  });
});
