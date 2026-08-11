/**
 * Issue #1762 — listing-cluster tap fit-to-members.
 *
 * Covers the [tests].planned items from the approved plan
 * (.claude/handoffs/issue-1762/approved-plan.toml) that are implementable as
 * unit/integration tests (the E2E spec is a separate QA step):
 *
 *   1. MarkerClusterLayer's clusterclick/clusterkeypress handler computes
 *      bounds/cappedTargetZoom/clusterCanSplit gating correctly and
 *      publishes exactly one 'cluster' CameraIntent via
 *      onMarkerClusterCameraIntent (or none when the cluster can't split) —
 *      and NEVER calls onSelectListing (no popover/preview open).
 *   2. resolveMarkerRevealMode wiring: after a cluster-tap fit settles
 *      (map.once('moveend')), a dense reveal decision holds the cluster
 *      group's effective disableClusteringAtZoom above CLUSTER_DISABLE_AT_ZOOM
 *      instead of reverting to the static threshold.
 *   3. MapController's 'cluster' framing branch does not arm the
 *      leaf-only focusBounds suppression window (a subsequent focusBounds
 *      change still fires immediately, unlike the 'leaf' framing case).
 *
 * Mirrors the PropertyMap.cameraScope.test.tsx / PropertyMap.listingClusterMarker.test.tsx
 * mock scaffolding exactly, so both of those files' own regression coverage
 * stays meaningful alongside this one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, render } from '@testing-library/react';

// ─── Hoisted stubs ─────────────────────────────────────────────
const moveendCallbacks: Array<() => void> = [];
const mockClusterContainer = document.createElement('div');
Object.defineProperty(mockClusterContainer, 'clientWidth', { value: 800, configurable: true });
Object.defineProperty(mockClusterContainer, 'clientHeight', { value: 600, configurable: true });

const mapStub = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  setView: vi.fn(),
  setZoom: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  getZoom: vi.fn(() => 13),
  getBoundsZoom: vi.fn(() => 15),
  getBounds: vi.fn(() => ({
    getNorth: () => 14,
    getSouth: () => 13,
    getEast: () => 75,
    getWest: () => 74,
  })),
  getContainer: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  invalidateSize: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 13.3409, lng: 74.7421 })),
  remove: vi.fn(),
}));

// Captures the (eventNames, handler) pair passed to L.markerClusterGroup()'s
// `.on(...)` call — this is MarkerClusterLayer's clusterclick/clusterkeypress
// handler, otherwise unreachable (not exported).
let capturedClusterHandler: ((e: unknown) => void) | undefined;
let lastClusterGroupOptions:
  | { disableClusteringAtZoom?: number; spiderfyDistanceMultiplier?: number }
  | undefined;
const clusterGroupAddLayer = vi.fn();

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ on: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
    markerClusterGroup: vi.fn((opts: { disableClusteringAtZoom?: number; spiderfyDistanceMultiplier?: number }) => {
      lastClusterGroupOptions = opts;
      return {
        addLayer: clusterGroupAddLayer,
        on: vi.fn((_types: string, fn: (e: unknown) => void) => {
          capturedClusterHandler = fn;
        }),
        off: vi.fn(),
      };
    }),
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

// ─── Imports after mocks ───────────────────────────────────────
import { PropertyMap } from '@/components/map/PropertyMap';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';
import { computeCameraPadding } from '@/hooks/useDiscoverMapData';
import { CLUSTER_DISABLE_AT_ZOOM } from '@/shared/map/zoomPolicy';

const CITY_CENTER: [number, number] = [13.3409, 74.7421];

const houseListing = {
  id: 'house-1',
  title: 'Modern House',
  property_type: 'house' as const,
  latitude: 13.35,
  longitude: 74.75,
  price: 1_000_000,
  status: 'LIVE' as const,
  locality: 'Udupi',
  created_at: '',
  updated_at: '',
};

const baseProps = {
  listings: [houseListing] as never,
  cityCenter: CITY_CENTER,
  cityZoom: 11,
  resetMapTick: 0,
  areas: [],
};

/** A fake leaflet.markercluster MarkerCluster — only the methods this handler touches. */
function makeFakeCluster(opts: {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
  center: { lat: number; lng: number };
  childCount: number;
}) {
  return {
    getBounds: () => ({
      getSouthWest: () => opts.sw,
      getNorthEast: () => opts.ne,
      getCenter: () => opts.center,
    }),
    getChildCount: () => opts.childCount,
    getAllChildMarkers: () => [],
  };
}

beforeEach(() => {
  capturedClusterHandler = undefined;
  lastClusterGroupOptions = undefined;
  clusterGroupAddLayer.mockClear();
  mapStub.fitBounds.mockClear();
  mapStub.flyTo.mockClear();
  mapStub.setView.mockClear();
  mapStub.getZoom.mockReturnValue(13);
  mapStub.getBoundsZoom.mockReturnValue(15);
  mapStub.once.mockClear();
  mapStub.getContainer.mockReturnValue(mockClusterContainer);
  moveendCallbacks.length = 0;
  mapStub.once.mockImplementation((type: string, cb: () => void) => {
    if (type === 'moveend') moveendCallbacks.push(cb);
  });
  mapStub.off.mockClear();
  // Model real Leaflet semantics for `.off('moveend', cb)`: deregister that
  // exact callback from the pending list, so tests can tell whether a
  // still-armed listener was actually cancelled (vs. just orphaned).
  mapStub.off.mockImplementation((type: string, cb: () => void) => {
    if (type !== 'moveend') return;
    const idx = moveendCallbacks.indexOf(cb);
    if (idx !== -1) moveendCallbacks.splice(idx, 1);
  });
});

describe('Issue #1762 — MarkerClusterLayer clusterclick handler', () => {
  it('splittable cluster: publishes exactly one cluster CameraIntent with the cluster bounds/center, never calls onSelectListing', () => {
    const onMarkerClusterCameraIntent = vi.fn();
    const onSelectListing = vi.fn();
    render(
      <PropertyMap
        {...baseProps}
        onSelectListing={onSelectListing}
        onMarkerClusterCameraIntent={onMarkerClusterCameraIntent}
      />,
    );

    expect(capturedClusterHandler).toBeDefined();

    // currentZoom=13, getBoundsZoom=15 -> cappedTargetZoom=15 > 13, with a
    // real spatial spread -> clusterCanSplit is true.
    const cluster = makeFakeCluster({
      sw: { lat: 13.0, lng: 74.7 },
      ne: { lat: 13.1, lng: 74.8 },
      center: { lat: 13.05, lng: 74.75 },
      childCount: 5,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: cluster });
    });

    expect(onMarkerClusterCameraIntent).toHaveBeenCalledTimes(1);
    expect(onMarkerClusterCameraIntent).toHaveBeenCalledWith(
      [[13.0, 74.7], [13.1, 74.8]],
      [13.05, 74.75],
    );
    expect(onSelectListing).not.toHaveBeenCalled();
  });

  it('non-splittable cluster (coincident bounds, no spatial spread): publishes nothing', () => {
    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);

    const coincidentPoint = { lat: 13.05, lng: 74.75 };
    const cluster = makeFakeCluster({
      sw: coincidentPoint,
      ne: coincidentPoint,
      center: coincidentPoint,
      childCount: 3,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: cluster });
    });

    expect(onMarkerClusterCameraIntent).not.toHaveBeenCalled();
  });

  it('non-splittable cluster (target zoom does not exceed current zoom): publishes nothing', () => {
    mapStub.getZoom.mockReturnValue(16);
    mapStub.getBoundsZoom.mockReturnValue(15); // capped target (min(16,15)=15) <= currentZoom (16)
    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);

    const cluster = makeFakeCluster({
      sw: { lat: 13.0, lng: 74.7 },
      ne: { lat: 13.1, lng: 74.8 },
      center: { lat: 13.05, lng: 74.75 },
      childCount: 4,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: cluster });
    });

    expect(onMarkerClusterCameraIntent).not.toHaveBeenCalled();
  });

  it('clusterkeypress with a non-Enter keyCode is ignored (mirrors leaflet.markercluster\'s own gate)', () => {
    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);

    const cluster = makeFakeCluster({
      sw: { lat: 13.0, lng: 74.7 },
      ne: { lat: 13.1, lng: 74.8 },
      center: { lat: 13.05, lng: 74.75 },
      childCount: 5,
    });
    act(() => {
      capturedClusterHandler!({
        type: 'clusterkeypress',
        layer: cluster,
        originalEvent: { keyCode: 27 }, // Escape, not Enter
      });
    });

    expect(onMarkerClusterCameraIntent).not.toHaveBeenCalled();
  });

  it('clusterkeypress with keyCode 13 (Enter) activates identically to a click', () => {
    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);

    const cluster = makeFakeCluster({
      sw: { lat: 13.0, lng: 74.7 },
      ne: { lat: 13.1, lng: 74.8 },
      center: { lat: 13.05, lng: 74.75 },
      childCount: 5,
    });
    act(() => {
      capturedClusterHandler!({
        type: 'clusterkeypress',
        layer: cluster,
        originalEvent: { keyCode: 13 },
      });
    });

    expect(onMarkerClusterCameraIntent).toHaveBeenCalledTimes(1);
  });
});

describe('Issue #1762 fix cycle 3 — tight/coincident-coordinate cluster spiderfy readability', () => {
  it('sets a wide spiderfyDistanceMultiplier so leaflet.markercluster\'s native spiderfy (which fires for a coincident-coordinate cluster our own clusterCanSplit gate correctly declines to zoom) fans large custom pill markers out legibly instead of collapsing them into an overlapping stack', () => {
    // Live-reproduced regression (2026-08-11, real browser against the dev
    // server): a "5 HOMES" cluster whose 5 members share EXACTLY coincident
    // lat/lng (verified via a debug probe: cluster.getBounds() SW === NE)
    // correctly fails clusterCanSplit (no zoom level would separate
    // coincident points) — MarkerClusterLayer publishes no CameraIntent, so
    // the map camera never moves (byte-for-byte the same as the existing
    // "non-splittable cluster" tests above). But leaflet.markercluster's OWN
    // _zoomOrSpiderfy listener (bound whenever spiderfyOnMaxZoom is true —
    // unconditional on zoomToBoundsOnClick) independently fires
    // cluster.spiderfy() for exactly this "bottomed-out, never splits below
    // the group's own max clustering zoom" case. Its default
    // spiderfyDistanceMultiplier (1) sizes the fan for small (~25-40px)
    // stock pin icons — our custom price-pill markers (createMarkerIcon) are
    // ~90px wide, so the default fan collapsed adjacent pills into an
    // unreadable overlapping stack (confirmed live: no visible leg lines,
    // pins stacked on top of each other). This test asserts the
    // L.markerClusterGroup construction options passed to
    // L.markerClusterGroup carry a materially wider
    // spiderfyDistanceMultiplier so the fan radius clears our pill width.
    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);

    expect(lastClusterGroupOptions?.spiderfyDistanceMultiplier).toBeDefined();
    // Default leaflet.markercluster value is 1 — must be raised materially
    // (not just nudged) to clear our ~90px-wide pill markers at low child
    // counts (circle radius = multiplier * 25 * (2+count) / (2*PI)).
    expect(lastClusterGroupOptions!.spiderfyDistanceMultiplier).toBeGreaterThanOrEqual(3);

    // The zoom/fit gating itself is UNCHANGED by this fix: a coincident
    // cluster still publishes no CameraIntent (mirrors the existing
    // "non-splittable cluster (coincident bounds...)" test above, using the
    // SAME real-world coincident coordinates observed in the live repro).
    const coincidentCluster = makeFakeCluster({
      sw: { lat: 12.92, lng: 77.53 },
      ne: { lat: 12.92, lng: 77.53 },
      center: { lat: 12.92, lng: 77.53 },
      childCount: 5,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: coincidentCluster });
    });
    expect(onMarkerClusterCameraIntent).not.toHaveBeenCalled();
    expect(mapStub.setView).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
  });
});

describe('Issue #1762 — resolveMarkerRevealMode wiring (post-fit reveal decision)', () => {
  it('a dense post-fit reveal (many markers in a small viewport) holds the cluster group above CLUSTER_DISABLE_AT_ZOOM on the next rebuild', () => {
    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);
    expect(lastClusterGroupOptions?.disableClusteringAtZoom).toBe(CLUSTER_DISABLE_AT_ZOOM);

    // Splittable cluster with a high child count — dense per
    // resolveMarkerRevealMode's viewport-density signal (800x600 stub
    // container from mockClusterContainer above).
    const cluster = makeFakeCluster({
      sw: { lat: 13.0, lng: 74.7 },
      ne: { lat: 13.1, lng: 74.8 },
      center: { lat: 13.05, lng: 74.75 },
      childCount: 500,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: cluster });
    });
    expect(moveendCallbacks.length).toBe(1);

    mapStub.getZoom.mockReturnValue(CLUSTER_DISABLE_AT_ZOOM); // fit settled at the declustering zoom
    act(() => {
      moveendCallbacks[0]();
    });

    expect(lastClusterGroupOptions?.disableClusteringAtZoom).toBeGreaterThan(CLUSTER_DISABLE_AT_ZOOM);
  });

  it('a sparse post-fit reveal (few markers) keeps the cluster group at the default CLUSTER_DISABLE_AT_ZOOM', () => {
    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);

    const cluster = makeFakeCluster({
      sw: { lat: 13.0, lng: 74.7 },
      ne: { lat: 13.1, lng: 74.8 },
      center: { lat: 13.05, lng: 74.75 },
      childCount: 4, // below MARKER_REVEAL_COUNT_FLOOR (12) -> always individualPins
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: cluster });
    });
    expect(moveendCallbacks.length).toBe(1);

    mapStub.getZoom.mockReturnValue(CLUSTER_DISABLE_AT_ZOOM);
    act(() => {
      moveendCallbacks[0]();
    });

    expect(lastClusterGroupOptions?.disableClusteringAtZoom).toBe(CLUSTER_DISABLE_AT_ZOOM);
  });
});

describe('Issue #1762 fix — pending cluster-tap moveend listener is cancelled on effect teardown', () => {
  it('arms exactly one moveend listener on cluster tap, then cancels it via map.off when the effect re-runs mid-animation (e.g. hoveredListingId changes on hover)', () => {
    const onMarkerClusterCameraIntent = vi.fn();
    const { rerender } = render(
      <PropertyMap
        {...baseProps}
        hoveredListingId={null}
        onMarkerClusterCameraIntent={onMarkerClusterCameraIntent}
      />,
    );

    const cluster = makeFakeCluster({
      sw: { lat: 13.0, lng: 74.7 },
      ne: { lat: 13.1, lng: 74.8 },
      center: { lat: 13.05, lng: 74.75 },
      childCount: 500,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: cluster });
    });

    // Exactly one moveend one-shot listener armed for this cluster tap.
    expect(mapStub.once).toHaveBeenCalledTimes(1);
    expect(mapStub.once).toHaveBeenCalledWith('moveend', expect.any(Function));
    const armedHandler = mapStub.once.mock.calls[0][1];
    expect(mapStub.off).not.toHaveBeenCalledWith('moveend', armedHandler);

    // Simulate a hover on a different marker while the cluster-tap fit
    // animation is still in flight — this changes hoveredListingId, a
    // MarkerClusterLayer effect dependency, tearing the effect down and
    // rebuilding it BEFORE the real 'moveend' ever fires.
    act(() => {
      rerender(
        <PropertyMap
          {...baseProps}
          hoveredListingId="some-other-listing"
          onMarkerClusterCameraIntent={onMarkerClusterCameraIntent}
        />,
      );
    });

    // The stale one-shot handler must be explicitly cancelled with the
    // SAME function reference that was armed — leaving no orphaned
    // listener on the persistent map instance to fire on a later,
    // unrelated moveend.
    expect(mapStub.off).toHaveBeenCalledWith('moveend', armedHandler);
  });

  it('a second cluster tap before the first fit settles (no effect re-run in between) cancels the first pending listener before arming the second, so only the second ever fires', () => {
    const onMarkerClusterCameraIntent = vi.fn();
    render(
      <PropertyMap
        {...baseProps}
        hoveredListingId={null}
        onMarkerClusterCameraIntent={onMarkerClusterCameraIntent}
      />,
    );

    const clusterA = makeFakeCluster({
      sw: { lat: 13.0, lng: 74.7 },
      ne: { lat: 13.1, lng: 74.8 },
      center: { lat: 13.05, lng: 74.75 },
      childCount: 500,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: clusterA });
    });
    expect(mapStub.once).toHaveBeenCalledTimes(1);
    const handlerA = mapStub.once.mock.calls[0][1];
    expect(mapStub.off).not.toHaveBeenCalled();

    // A second cluster tap lands before the first fit's real 'moveend' has
    // fired, with no rerender/prop change (no effect dependency changed) in
    // between — this is the same effect closure, so the pending-listener ref
    // is the only thing that can track it.
    const clusterB = makeFakeCluster({
      sw: { lat: 13.2, lng: 74.9 },
      ne: { lat: 13.3, lng: 75.0 },
      center: { lat: 13.25, lng: 74.95 },
      childCount: 4,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: clusterB });
    });

    // The first pending listener must be explicitly cancelled (map.off)
    // before/while the second is armed — not just silently overwritten in
    // the ref, which would leave it orphaned on the persistent map instance.
    expect(mapStub.off).toHaveBeenCalledWith('moveend', handlerA);
    expect(mapStub.once).toHaveBeenCalledTimes(2);
    const handlerB = mapStub.once.mock.calls[1][1];
    expect(handlerB).not.toBe(handlerA);

    // map.off happened strictly before the second map.once — i.e. the old
    // listener is gone before the new one is registered, so at most one is
    // ever concurrently live.
    const offOrder = mapStub.off.mock.invocationCallOrder[0];
    const secondOnceOrder = mapStub.once.mock.invocationCallOrder[1];
    expect(offOrder).toBeLessThan(secondOnceOrder);

    // Only the second (live) listener remains armed on `map` — the first was
    // actually deregistered, not just orphaned.
    expect(moveendCallbacks).toEqual([handlerB]);

    // Firing the single real 'moveend' invokes only handlerB (sparse
    // childCount=4 clusterB), never the stale handlerA (which would have
    // held a dense-reveal decision from clusterA's childCount=500).
    mapStub.getZoom.mockReturnValue(CLUSTER_DISABLE_AT_ZOOM);
    act(() => {
      moveendCallbacks.forEach((cb) => cb());
    });
    expect(lastClusterGroupOptions?.disableClusteringAtZoom).toBe(CLUSTER_DISABLE_AT_ZOOM);
  });
});

describe("Issue #1762 — MapController 'cluster' framing branch", () => {
  it('setView to the fit-to-members center/zoom, clamped to [currentZoom+1, CLUSTER_DISABLE_AT_ZOOM]', () => {
    mapStub.getZoom.mockReturnValue(13);
    mapStub.getBoundsZoom.mockReturnValue(15);
    const bounds: [[number, number], [number, number]] = [[13.0, 74.7], [13.1, 74.8]];
    const intent: CameraIntent = {
      seq: 1,
      bounds,
      center: [13.05, 74.75],
      framing: 'cluster',
      padding: computeCameraPadding(1440),
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [center, zoom] = mapStub.setView.mock.calls[0];
    expect(center).toEqual({ lat: 13.05, lng: 74.75 });
    expect(zoom).toBe(15); // within [14, 16]
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
  });

  it('clamps the target zoom to at least currentZoom + 1 (never a no-op tap)', () => {
    mapStub.getZoom.mockReturnValue(14);
    mapStub.getBoundsZoom.mockReturnValue(14); // would be a no-op without the +1 floor
    const bounds: [[number, number], [number, number]] = [[13.0, 74.7], [13.1, 74.8]];
    const intent: CameraIntent = {
      seq: 1,
      bounds,
      center: [13.05, 74.75],
      framing: 'cluster',
      padding: computeCameraPadding(1440),
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);

    const [, zoom] = mapStub.setView.mock.calls[0];
    expect(zoom).toBe(15);
  });

  it('does NOT arm the leaf-only focusBounds suppression window — a subsequent focusBounds change still fires immediately', () => {
    const bounds: [[number, number], [number, number]] = [[13.0, 74.7], [13.1, 74.8]];
    const intent: CameraIntent = {
      seq: 1,
      bounds,
      center: [13.05, 74.75],
      framing: 'cluster',
      padding: computeCameraPadding(1440),
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);
    expect(mapStub.setView).toHaveBeenCalledTimes(1);

    // Unlike a 'leaf' click (which arms an 8s suppression on the very next
    // focusBounds effect run), a 'cluster' click must never swallow a
    // correlated-looking focusBounds change that follows it.
    const nextFocusBounds: [[number, number], [number, number]] = [[13.2, 74.9], [13.3, 75.0]];
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={nextFocusBounds} />);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds).toHaveBeenCalledWith(nextFocusBounds, { padding: [50, 50] });
  });
});
