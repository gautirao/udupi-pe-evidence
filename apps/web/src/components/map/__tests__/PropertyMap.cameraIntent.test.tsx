/**
 * Issue #1801 — MapController is the SOLE camera owner for area-marker
 * navigation. These tests exercise the `cameraIntent` prop contract directly
 * (bypassing AreaMarkerLayer entirely — that click→publish wiring is covered
 * by PropertyMap.jitterDiagnostic.test.tsx and AreaMarkerLayer.test.tsx).
 *
 * Contract under test:
 *   - a NEW cameraIntent.seq fires exactly one camera call, synchronously,
 *     independent of `focusBounds`.
 *   - the ONE network-driven focusBounds refit that follows a handled intent
 *     is suppressed (strict fit-once).
 *   - a focusBounds/fitTick-style change with NO cameraIntent ever published
 *     still fires normally (suppression must not leak into unrelated state).
 *   - leaf framing clamps the computed zoom into [13,16]; overview framing
 *     always uses maxZoom 12.
 *   - rapid distinct clicks (strictly increasing seq) each fire exactly once.
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
// AreaMarkerLayer is mocked to null here — this file tests MapController's
// consumption of `cameraIntent` directly via props, not the click→publish path.
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

const CITY_CENTER: [number, number] = [13.3409, 74.7421];

const baseProps = {
  listings: [],
  cityCenter: CITY_CENTER,
  cityZoom: 11,
  resetMapTick: 0,
  areas: [],
};

const LEAF_BOUNDS: [[number, number], [number, number]] = [[13.34, 74.78], [13.37, 74.82]];
const REGION_BOUNDS: [[number, number], [number, number]] = [[13.0, 74.5], [13.8, 75.2]];

function leafIntent(seq: number, bounds: [[number, number], [number, number]] | null = LEAF_BOUNDS): CameraIntent {
  return { seq, bounds, center: [13.3525, 74.7869], framing: 'leaf' };
}

function overviewIntent(seq: number, bounds: [[number, number], [number, number]] | null = REGION_BOUNDS): CameraIntent {
  return { seq, bounds, center: [13.34, 74.75], framing: 'overview' };
}

function totalCameraCalls() {
  return (
    mapStub.fitBounds.mock.calls.length +
    mapStub.flyTo.mock.calls.length +
    mapStub.setView.mock.calls.length
  );
}

describe('Issue #1801 — PropertyMap cameraIntent → MapController contract', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setView.mockClear();
    mapStub.setZoom.mockClear();
    mapStub.once.mockClear();
    mapStub.getBoundsZoom.mockClear();
    mapStub.getBoundsZoom.mockReturnValue(14);
  });

  it('a published intent fires exactly one fit synchronously, independent of focusBounds', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(0);

    rerender(<PropertyMap {...baseProps} cameraIntent={leafIntent(1)} focusBounds={null} />);

    expect(totalCameraCalls()).toBe(1);
    expect(mapStub.setView).toHaveBeenCalledTimes(1);
  });

  it('a subsequent activeFocusBounds rerender for the SAME handled seq does NOT add an extra fit (suppression)', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={leafIntent(1)} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);

    // Same seq (1) still — the network-driven focusBounds settles afterwards.
    rerender(
      <PropertyMap
        {...baseProps}
        cameraIntent={leafIntent(1)}
        focusBounds={[[13.348, 74.784], [13.357, 74.79]]}
      />,
    );

    expect(totalCameraCalls()).toBe(1);
  });

  it('a focusBounds change with NO cameraIntent ever published still fires (AC6 — non-click refits are not suppressed)', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(0);

    // No intent was ever published (cameraIntent stays null throughout) — this
    // models the "Fit to selected areas" button / a locality filter change.
    rerender(
      <PropertyMap {...baseProps} cameraIntent={null} focusBounds={[[13.3, 74.7], [13.4, 74.8]]} />,
    );

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds).toHaveBeenCalledWith(
      [[13.3, 74.7], [13.4, 74.8]],
      { padding: [50, 50] },
    );
  });

  it('leaf framing clamps a computed zoom ABOVE the band down to 16', () => {
    mapStub.getBoundsZoom.mockReturnValue(19);
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={leafIntent(1)} focusBounds={null} />);

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [, zoom] = mapStub.setView.mock.calls[0];
    expect(zoom).toBe(16);
  });

  it('leaf framing clamps a computed zoom BELOW the band up to 13', () => {
    mapStub.getBoundsZoom.mockReturnValue(8);
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={leafIntent(1)} focusBounds={null} />);

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [, zoom] = mapStub.setView.mock.calls[0];
    expect(zoom).toBe(13);
  });

  it('leaf framing passes a computed zoom already inside [13,16] through unclamped', () => {
    mapStub.getBoundsZoom.mockReturnValue(15);
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={leafIntent(1)} focusBounds={null} />);

    const [, zoom] = mapStub.setView.mock.calls[0];
    expect(zoom).toBe(15);
  });

  it('leaf framing with null bounds flies to center at zoom 13', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={leafIntent(1, null)} focusBounds={null} />);

    expect(mapStub.flyTo).toHaveBeenCalledTimes(1);
    expect(mapStub.flyTo).toHaveBeenCalledWith([13.3525, 74.7869], 13);
    expect(mapStub.setView).not.toHaveBeenCalled();
  });

  it('overview framing always uses fitBounds with maxZoom 12', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={overviewIntent(1)} focusBounds={null} />);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds).toHaveBeenCalledWith(REGION_BOUNDS, { padding: [40, 40], maxZoom: 12 });
    expect(mapStub.setView).not.toHaveBeenCalled();
  });

  it('overview framing with null bounds flies to center at zoom 12', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={overviewIntent(1, null)} focusBounds={null} />);

    expect(mapStub.flyTo).toHaveBeenCalledTimes(1);
    expect(mapStub.flyTo).toHaveBeenCalledWith([13.34, 74.75], 12);
  });

  it('rapid distinct clicks (strictly increasing seq) each fire exactly once', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);

    rerender(<PropertyMap {...baseProps} cameraIntent={leafIntent(1)} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);

    rerender(
      <PropertyMap
        {...baseProps}
        cameraIntent={leafIntent(2, [[13.4, 74.9], [13.42, 74.92]])}
        focusBounds={null}
      />,
    );
    expect(totalCameraCalls()).toBe(2);

    rerender(
      <PropertyMap
        {...baseProps}
        cameraIntent={overviewIntent(3)}
        focusBounds={null}
      />,
    );
    expect(totalCameraCalls()).toBe(3);
  });

  it('re-rendering with the SAME seq object does not re-fire (idempotent guard)', () => {
    const intent = leafIntent(1);
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);

    // A brand-new object with the SAME seq (e.g. a stale prop re-delivered) must not re-fire.
    rerender(<PropertyMap {...baseProps} cameraIntent={{ ...intent }} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);
  });

  it('REGRESSION (rework) — an OVERVIEW intent never arms suppression, so a later UNRELATED focusBounds change still fires (no seq correlation → leak)', () => {
    // Overview clicks (setScope/selectGroup) keep zoom <= AREA_LAYER_MAX_ZOOM, so
    // markersEnabled stays false and no activeFocusBounds/agriGroupFocusBounds
    // refit can ever follow one. Under the OLD bare-boolean implementation,
    // suppressNextFocusFitRef was armed unconditionally on ANY cameraIntent
    // (including 'overview'), then never consumed (no focusBounds change ever
    // followed it) — so it stayed armed and silently swallowed the NEXT
    // legitimate refit, no matter how unrelated (e.g. a later agri corridor
    // refit for a completely different navigation). This test fires an
    // overview intent (seq=1) and then a later, unrelated focusBounds change
    // with no resetMapTick bump and no cityCenter change (both of which would
    // mask the bug by clearing the flag through an unrelated path) — the fit
    // MUST still fire. Fails against the pre-fix bare-boolean logic.
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={overviewIntent(1)} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1); // the overview intent's own fitBounds
    mapStub.fitBounds.mockClear();

    // Later, unrelated refit — e.g. an agriGroupFocusBounds sync for a
    // different navigation — with the SAME (already-handled) cameraIntent
    // still in props, no resetMapTick bump, no cityCenter change.
    rerender(
      <PropertyMap
        {...baseProps}
        cameraIntent={overviewIntent(1)}
        focusBounds={[[13.5, 74.9], [13.6, 75.0]]}
      />,
    );

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds).toHaveBeenCalledWith(
      [[13.5, 74.9], [13.6, 75.0]],
      { padding: [50, 50] },
    );
  });

  it('a resetMapTick bump (area deselect/back) clears a pending suppression so the next focusBounds change still fires', () => {
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={leafIntent(1)} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);
    mapStub.flyTo.mockClear();
    mapStub.fitBounds.mockClear();
    mapStub.setView.mockClear();

    // Back button: resetMapTick increments (city flyTo fires — expected/pre-existing).
    rerender(
      <PropertyMap {...baseProps} cameraIntent={leafIntent(1)} focusBounds={null} resetMapTick={1} />,
    );
    expect(mapStub.flyTo).toHaveBeenCalledTimes(1); // the existing city-overview reset flyTo

    mapStub.flyTo.mockClear();

    // A later, unrelated focusBounds change (e.g. re-selecting a different area
    // by locality filter) must still fire — the earlier intent's suppression
    // must not have leaked past the deselect.
    rerender(
      <PropertyMap
        {...baseProps}
        cameraIntent={leafIntent(1)}
        focusBounds={[[13.5, 74.9], [13.6, 75.0]]}
        resetMapTick={1}
      />,
    );
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
  });
});

describe('Issue #1953 (RH1, sixth site) — lastHandledSeqRef survives a real DiscoverMapMount unmount/remount', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setView.mockClear();
    mapStub.getBoundsZoom.mockClear();
    mapStub.getBoundsZoom.mockReturnValue(14);
  });

  it('a remount with the SAME already-consumed cameraIntent does not re-fire; a genuinely new intent afterwards fires exactly once', () => {
    const intent = leafIntent(1);

    // Genuine first mount: cameraIntent starts null (useDiscoverMapData's
    // cameraIntent is useState(null), never pre-populated before a click),
    // then the user clicks an area marker and cameraIntent becomes seq=1 via
    // a rerender of this SAME instance — fires once. This mirrors the real
    // sequence and is what distinguishes a genuine first mount (which can
    // only ever observe seq 0) from a remount (which can observe a
    // already-nonzero seq on its very first render).
    const first = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(0);
    first.rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);
    expect(totalCameraCalls()).toBe(1);
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setView.mockClear();

    // Real unmount — mirrors DiscoverMapMount returning `null` when the mobile
    // shell switches to List view (a true unmount, not hidden/display:none).
    first.unmount();

    // Remount — mirrors tapping Map again. cameraIntent is state owned by
    // useDiscoverMapData, which lives ABOVE DiscoverMapMount's unmount
    // boundary and never resets the intent after consumption, so the SAME
    // already-handled seq=1 object is the prop on the very first render of
    // this brand-new MapController instance.
    const second = render(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);

    // MUST NOT re-fire. Pre-fix, lastHandledSeqRef is a fresh useRef(0) on
    // this new instance, so `1 <= 0` is false, the guard does not skip, and
    // the stale intent's camera move fires again — discarding whatever
    // viewport the remounted map had just re-initialised to from the URL.
    // This assertion is the one that fails before the adopt-on-mount fix.
    expect(totalCameraCalls()).toBe(0);

    // A genuinely NEW intent arriving after the remount must still fire
    // exactly once — guards against a fix that simply never fires at all.
    second.rerender(
      <PropertyMap
        {...baseProps}
        cameraIntent={leafIntent(2, [[13.4, 74.9], [13.42, 74.92]])}
        focusBounds={null}
      />,
    );
    expect(totalCameraCalls()).toBe(1);
  });
});
