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
 *   2. resolveMarkerRevealMode wiring: a dense reveal decision holds the
 *      cluster group's effective disableClusteringAtZoom above
 *      CLUSTER_DISABLE_AT_ZOOM instead of reverting to the static threshold.
 *      Issue #1762 fix (root-cause: manual/fresh navigation to the same
 *      settled camera as a cluster-tap never recomputed this decision,
 *      violating the AC that both paths must converge) — this is now driven
 *      by a GENERAL (persistent) `map.on('moveend', ...)` listener that
 *      recomputes on every settled camera, not a cluster-tap-only one-shot
 *      `map.once('moveend', ...)`. See the "general moveend listener
 *      lifecycle" describe block below for the registration/cleanup
 *      contract this replaced.
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
// Issue #1762 fix — MarkerClusterLayer's reveal-mode recompute is now a
// GENERAL (persistent) 'moveend' listener registered via `map.on`, not a
// cluster-tap-only one-shot `map.once` listener. Tracked separately from
// `moveendCallbacks` (which still models `.once`, used elsewhere by other
// callers in the real map).
const moveendOnCallbacks: Array<() => void> = [];
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
  | {
      disableClusteringAtZoom?: number;
      spiderfyDistanceMultiplier?: number;
      spiderLegPolylineOptions?: { interactive?: boolean };
    }
  | undefined;
// Issue #1762 fix cycle 4 — the live clusterGroup object handed back by the
// most recent L.markerClusterGroup() construction, so tests can flip its
// `_spiderfied` flag (leaflet.markercluster's own live pointer to an
// open spiderfy) before firing a pending moveend callback, exactly like the
// real plugin would while a spiderfy fan is on-screen.
let lastClusterGroupInstance:
  | { _spiderfied: unknown; options: { spiderfyDistanceMultiplier?: number } }
  | undefined;
const clusterGroupAddLayer = vi.fn();

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      // Issue #1762 fix cycle 7 — the in-place spiderfy-preserving patch path
      // calls marker.setIcon(...) instead of tearing down/rebuilding the
      // whole cluster group; tests assert on this mock directly.
      setIcon: vi.fn(),
    })),
    markerClusterGroup: vi.fn(
      (opts: {
        disableClusteringAtZoom?: number;
        spiderfyDistanceMultiplier?: number;
        spiderLegPolylineOptions?: { interactive?: boolean };
      }) => {
        lastClusterGroupOptions = opts;
        const instance = {
          addLayer: clusterGroupAddLayer,
          on: vi.fn((_types: string, fn: (e: unknown) => void) => {
            capturedClusterHandler = fn;
          }),
          off: vi.fn(),
          _spiderfied: null as unknown,
          // Issue #1762 fix-cycle 5 — real Leaflet's `L.Util.setOptions`
          // mutates the instance's own `options` object in place (it is
          // the SAME object read back via `clusterGroup.options` later),
          // not a fresh copy per read. handleClusterActivate relies on
          // this: it mutates `clusterGroup.options.spiderfyDistanceMultiplier`
          // on every cluster tap. Pointing `options` at the same `opts`
          // reference `lastClusterGroupOptions` holds means tests can
          // observe that mutation via `lastClusterGroupOptions` too.
          options: opts,
        };
        lastClusterGroupInstance = instance;
        return instance;
      },
    ),
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
import { PropertyMap, createSelectedMarkerIcon } from '@/components/map/PropertyMap';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';
import { computeCameraPadding } from '@/hooks/useDiscoverMapData';
import { CLUSTER_DISABLE_AT_ZOOM } from '@/shared/map/zoomPolicy';
import L from 'leaflet';

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
  lastClusterGroupInstance = undefined;
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
  mapStub.on.mockClear();
  moveendOnCallbacks.length = 0;
  mapStub.on.mockImplementation((type: string, cb: () => void) => {
    if (type === 'moveend') moveendOnCallbacks.push(cb);
  });
  mapStub.off.mockClear();
  // Model real Leaflet semantics for `.off('moveend', cb)`: deregister that
  // exact callback from whichever pending list it's in, so tests can tell
  // whether a still-armed listener was actually cancelled (vs. just
  // orphaned).
  mapStub.off.mockImplementation((type: string, cb: () => void) => {
    if (type !== 'moveend') return;
    const onceIdx = moveendCallbacks.indexOf(cb);
    if (onceIdx !== -1) moveendCallbacks.splice(onceIdx, 1);
    const onIdx = moveendOnCallbacks.indexOf(cb);
    if (onIdx !== -1) moveendOnCallbacks.splice(onIdx, 1);
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
  it('a dense listing set (many markers in a small viewport) holds the cluster group above CLUSTER_DISABLE_AT_ZOOM from the very first settle — no cluster tap required', () => {
    // Issue #1762 fix — the root-cause gap this proves closed: previously
    // resolveMarkerRevealMode was recomputed ONLY inside a cluster-tap's
    // one-shot moveend listener, so a manual/fresh navigation to a dense
    // camera never held the cluster group. Now the general moveend
    // listener (registered on mount, see below) ALSO recomputes it
    // synchronously once on mount for whatever camera/listings the layer
    // is rendered with, so a dense set holds immediately, cluster-tap or
    // not — the two paths converge on the same result by construction.
    const denseListings = Array.from({ length: 500 }, (_, i) => ({
      ...houseListing,
      id: `house-${i}`,
    }));
    render(<PropertyMap {...baseProps} listings={denseListings as never} />);

    expect(lastClusterGroupOptions?.disableClusteringAtZoom).toBeGreaterThan(CLUSTER_DISABLE_AT_ZOOM);

    // A subsequent moveend (e.g. a further pan/zoom at the same density)
    // recomputes to the SAME held value — idempotent, not a one-shot fluke.
    act(() => {
      moveendOnCallbacks.forEach((cb) => cb());
    });
    expect(lastClusterGroupOptions?.disableClusteringAtZoom).toBeGreaterThan(CLUSTER_DISABLE_AT_ZOOM);
  });

  it('a sparse listing set (few markers) stays at the default CLUSTER_DISABLE_AT_ZOOM, cluster tap or not', () => {
    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);
    expect(lastClusterGroupOptions?.disableClusteringAtZoom).toBe(CLUSTER_DISABLE_AT_ZOOM);

    // A splittable cluster tap (bounds/center published) still doesn't
    // change the outcome for this sparse baseProps listing set — the
    // general moveend listener recomputes the same non-dense decision.
    const cluster = makeFakeCluster({
      sw: { lat: 13.0, lng: 74.7 },
      ne: { lat: 13.1, lng: 74.8 },
      center: { lat: 13.05, lng: 74.75 },
      childCount: 4, // below MARKER_REVEAL_COUNT_FLOOR (12) -> always individualPins
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: cluster });
    });

    mapStub.getZoom.mockReturnValue(CLUSTER_DISABLE_AT_ZOOM);
    act(() => {
      moveendOnCallbacks.forEach((cb) => cb());
    });

    expect(lastClusterGroupOptions?.disableClusteringAtZoom).toBe(CLUSTER_DISABLE_AT_ZOOM);
  });
});

describe('Issue #1762 fix cycle 4 — spiderfied individual marker click regression', () => {
  it('sets spiderLegPolylineOptions.interactive to false so leaflet.markercluster\'s spider leg polylines can never capture a click meant for the marker pill they terminate at', () => {
    // Live-reproduced regression (2026-08-11): after a coincident cluster
    // spiderfies (cycle 3), clicking an individual spiderfied price-pill
    // marker did nothing — no popover, no URL change, no network request.
    // leaflet.markercluster's default spiderLegPolylineOptions has no
    // `interactive` override (defaults to true for L.Polyline), and every
    // leg is drawn terminating exactly at a marker's anchor point — which
    // for our large (~90-107px) price pills sits directly under a chunk of
    // the pill's own clickable area, letting the leg silently swallow a
    // click meant for the marker. This just asserts the construction-time
    // option that removes legs from hit-testing.
    render(<PropertyMap {...baseProps} />);
    expect(lastClusterGroupOptions?.spiderLegPolylineOptions).toEqual({ interactive: false });
  });

  it('does NOT recompute/apply a reveal-mode change on a moveend that fires while the cluster group is still spiderfied — an in-flight or just-completed spiderfy fan must not be torn down and rebuilt out from under the user', () => {
    const denseListings = Array.from({ length: 500 }, (_, i) => ({
      ...houseListing,
      id: `house-${i}`,
    }));
    render(<PropertyMap {...baseProps} listings={denseListings as never} />);
    // Dense listings against the 800x600 mock viewport hold the cluster
    // group above CLUSTER_DISABLE_AT_ZOOM from the very first settle (see
    // the "resolveMarkerRevealMode wiring" describe block above).
    expect(lastClusterGroupOptions?.disableClusteringAtZoom).toBeGreaterThan(CLUSTER_DISABLE_AT_ZOOM);

    // Simulate leaflet.markercluster's OWN internal spiderfy still being
    // active on the live clusterGroup instance (spiderfyOnMaxZoom stays on
    // regardless of the CameraIntent fit; see the zoomToBoundsOnClick
    // comment in MarkerClusterLayer).
    expect(lastClusterGroupInstance).toBeDefined();
    lastClusterGroupInstance!._spiderfied = { getAllChildMarkers: () => [] };

    // Widen the mock viewport so, absent the spiderfy guard, this SAME
    // dense listing set would no longer read as dense (500 markers over a
    // much larger area drops below the density threshold) — proving a real
    // recompute is being skipped here, not just a no-op re-confirmation of
    // the same value.
    Object.defineProperty(mockClusterContainer, 'clientWidth', { value: 8000, configurable: true });
    Object.defineProperty(mockClusterContainer, 'clientHeight', { value: 6000, configurable: true });

    const optionsBeforeMoveend = lastClusterGroupOptions;
    act(() => {
      moveendOnCallbacks.forEach((cb) => cb());
    });

    // No rebuild happened: the cluster group construction options are
    // byte-identical to before this moveend fired (same object reference —
    // L.markerClusterGroup was never called again), so the live spiderfy
    // fan (and every marker's click binding inside it) survives untouched.
    expect(lastClusterGroupOptions).toBe(optionsBeforeMoveend);
    expect(lastClusterGroupOptions?.disableClusteringAtZoom).toBeGreaterThan(CLUSTER_DISABLE_AT_ZOOM);

    // Restore the stub viewport for any later tests in this file.
    Object.defineProperty(mockClusterContainer, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(mockClusterContainer, 'clientHeight', { value: 600, configurable: true });
  });
});

describe('Issue #1762 fix — general moveend listener lifecycle (replaces the old cluster-tap-only one-shot listener)', () => {
  it('registers exactly one persistent moveend listener on mount via map.on, and cancels it via map.off with the SAME reference when the effect re-runs (e.g. hoveredListingId changes on hover)', () => {
    const { rerender } = render(
      <PropertyMap {...baseProps} hoveredListingId={null} />,
    );

    // Exactly one general listener armed for this mount — registered via
    // `map.on` (persistent), not `map.once` (one-shot).
    expect(mapStub.on).toHaveBeenCalledTimes(1);
    expect(mapStub.on).toHaveBeenCalledWith('moveend', expect.any(Function));
    expect(mapStub.once).not.toHaveBeenCalled();
    const armedHandler = mapStub.on.mock.calls[0][1];
    expect(mapStub.off).not.toHaveBeenCalledWith('moveend', armedHandler);

    // Simulate a hover on a different marker — this changes
    // hoveredListingId, a MarkerClusterLayer effect dependency, tearing the
    // effect down and rebuilding it.
    act(() => {
      rerender(<PropertyMap {...baseProps} hoveredListingId="some-other-listing" />);
    });

    // The stale listener from the torn-down effect run is explicitly
    // cancelled with the SAME function reference — no orphaned listener is
    // left armed on the persistent map instance.
    expect(mapStub.off).toHaveBeenCalledWith('moveend', armedHandler);
    // A fresh listener is armed for the new effect run.
    expect(mapStub.on).toHaveBeenCalledTimes(2);
    const secondHandler = mapStub.on.mock.calls[1][1];
    expect(secondHandler).not.toBe(armedHandler);
  });

  it('a cluster-tap fit is handled by the SAME general listener as any other camera move — the click handler itself arms no separate cluster-tap-only listener', () => {
    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);
    const onCallsBeforeClick = mapStub.on.mock.calls.length;

    const cluster = makeFakeCluster({
      sw: { lat: 13.0, lng: 74.7 },
      ne: { lat: 13.1, lng: 74.8 },
      center: { lat: 13.05, lng: 74.75 },
      childCount: 500,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: cluster });
    });

    // Issue #1762 fix — root-cause of the AC gap this closes: the OLD
    // implementation armed a fresh `map.once('moveend', ...)` from inside
    // this exact handler on every cluster tap. That mechanism is gone; the
    // handler now only publishes the CameraIntent (asserted in the
    // "MarkerClusterLayer clusterclick handler" describe block above) and
    // leaves the reveal-mode recompute entirely to the general listener
    // already registered on mount.
    expect(mapStub.on.mock.calls.length).toBe(onCallsBeforeClick);
    expect(mapStub.once).not.toHaveBeenCalled();
  });
});

describe("Issue #1762 — MapController 'cluster' framing branch", () => {
  it('setView to the fit-to-members center/zoom, capped at min(paddedRawZoom, CLUSTER_DISABLE_AT_ZOOM)', () => {
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

  it('Issue #1762 fix-cycle 10 — never advances zoom past the padded rawZoom; a tap that would be a no-op at the padded fit re-centers without forcing zoom in', () => {
    mapStub.getZoom.mockReturnValue(14);
    // getBoundsZoom here models an equal-args single stub, i.e. the padded
    // and unpadded fit agree at 14 — the padded fit does NOT justify
    // advancing past currentZoom=14, so the corrected consumer must NOT
    // force a +1 zoom-in (that was the exact bug: an unconditional
    // Math.max(currentZoom + 1, rawZoom) floor overriding the padded fit).
    mapStub.getBoundsZoom.mockReturnValue(14);
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
    // No-op-on-zoom: stays at currentZoom (does not clip members by forcing
    // a zoom the padded viewport does not actually support), but still
    // re-centers on the tapped cluster.
    expect(zoom).toBe(14);
    expect(center).toEqual({ lat: 13.05, lng: 74.75 });
  });

  it('Issue #1762 fix-cycle 10 — padded rawZoom is a hard ceiling: a fractional padded fit below currentZoom+1 is never rounded up past itself', () => {
    // Reproduces the exact WORKDONE_REVIEW BLOCKING_PARTIAL scenario at this
    // MapController consumer's single getBoundsZoom call site (always
    // padded — MarkerClusterLayer's separate unpadded clusterCanSplit
    // pre-check is a different call site, not exercised by this render
    // path, so it cannot be distinguished by a padding-conditional mock
    // here; a single mockReturnValue is the honest way to model this call
    // site). currentZoom=14, padded rawZoom=14.5 (Leaflet's real
    // getBoundsZoom can return non-integer zoom levels). The old
    // `Math.max(currentZoom + 1, rawZoom)` = Math.max(15, 14.5) = 15 would
    // have pushed the camera a full level past what the padded bounds
    // actually fit, clipping members. The fix must land at 14.5, and must
    // NEVER call setView with zoom 15.
    mapStub.getZoom.mockReturnValue(14);
    mapStub.getBoundsZoom.mockReturnValue(14.5);
    const bounds: [[number, number], [number, number]] = [[13.0, 74.7], [13.1, 74.8]];
    const intent: CameraIntent = {
      seq: 1,
      bounds,
      center: [13.05, 74.75],
      framing: 'cluster',
      padding: computeCameraPadding(1440), // desktop padding — non-empty [x, y]
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [, zoom] = mapStub.setView.mock.calls[0];
    expect(zoom).toBe(14.5);
    expect(zoom).not.toBe(15);

    mapStub.getBoundsZoom.mockReturnValue(15); // restore this file's default stub behaviour
  });

  it('Issue #1762 fix-cycle 10 — same padded-ceiling behaviour holds under asymmetric mobile padding', () => {
    // Mobile CameraIntent padding is asymmetric ([x, y] differ, per
    // computeCameraPadding) — confirms the fix is not accidentally coupled
    // to the symmetric desktop padding shape used in the scenario above.
    mapStub.getZoom.mockReturnValue(14);
    mapStub.getBoundsZoom.mockReturnValue(14.5);
    const bounds: [[number, number], [number, number]] = [[13.0, 74.7], [13.1, 74.8]];
    const intent: CameraIntent = {
      seq: 1,
      bounds,
      center: [13.05, 74.75],
      framing: 'cluster',
      padding: computeCameraPadding(390), // mobile width -> asymmetric padding
    };
    const { rerender } = render(<PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} />);
    rerender(<PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} />);

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [, zoom] = mapStub.setView.mock.calls[0];
    expect(zoom).toBe(14.5);
    expect(zoom).not.toBe(15);

    mapStub.getBoundsZoom.mockReturnValue(15); // restore this file's default stub behaviour
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

describe('Issue #1762 fix-cycle 5 — spiderfyDistanceMultiplier viewport clamp wiring', () => {
  it('a dense (8-member) coincident cluster tapped on a narrow mobile viewport mutates the LIVE cluster-group options to a value below the fix-cycle-3 base, before leaflet.markercluster\'s own spiderfy would read it', () => {
    // Narrow mobile viewport — swap the stub container's dimensions for
    // just this test (matches this file's own mobile-viewport convention:
    // mockClusterContainer is otherwise the shared 800x600 desktop stub).
    Object.defineProperty(mockClusterContainer, 'clientWidth', { value: 390, configurable: true });
    Object.defineProperty(mockClusterContainer, 'clientHeight', { value: 844, configurable: true });

    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);
    expect(lastClusterGroupOptions?.spiderfyDistanceMultiplier).toBe(3.5);

    // Coincident (non-splittable) 8-member cluster — the exact "dense
    // cluster near a narrow mobile edge" shape the WORKDONE_REVIEW
    // BLOCKING finding described. Non-splittable so onMarkerClusterCameraIntent
    // never fires and leaflet.markercluster's own bottomed-out spiderfy is
    // what would actually read this multiplier.
    const coincidentPoint = { lat: 13.05, lng: 74.75 };
    const denseCluster = makeFakeCluster({
      sw: coincidentPoint,
      ne: coincidentPoint,
      center: coincidentPoint,
      childCount: 8,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: denseCluster });
    });

    expect(onMarkerClusterCameraIntent).not.toHaveBeenCalled();
    // The LIVE options object leaflet.markercluster's spiderfy() would
    // read from was mutated below the fix-cycle-3 base...
    expect(lastClusterGroupOptions?.spiderfyDistanceMultiplier).toBeLessThan(3.5);
    // ...but never below the re-derived per-count pill-clearance floor
    // (see zoomPolicy.spiderfyClamp.test.ts for the exact derivation).
    expect(lastClusterGroupOptions?.spiderfyDistanceMultiplier).toBeGreaterThanOrEqual(2.9);
    // Same object reference throughout — confirms this is a live mutation
    // of the construction-time options, not a rebuild of the cluster group.
    expect(lastClusterGroupInstance?.options).toBe(lastClusterGroupOptions);

    // Restore the shared stub's desktop dimensions so later tests/files
    // that reuse mockClusterContainer aren't affected by this test.
    Object.defineProperty(mockClusterContainer, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(mockClusterContainer, 'clientHeight', { value: 600, configurable: true });
  });

  it('the same 8-member cluster on a spacious desktop viewport (1920x1080) is left at the fix-cycle-3 base, unchanged', () => {
    // 800x600 (this file's default mockClusterContainer size) is narrow
    // enough that even an 8-member circle-mode fan marginally exceeds the
    // safe-viewport bound (see zoomPolicy.spiderfyClamp.test.ts's
    // 1366x768 case for the same effect at a still-modest desktop size) —
    // use a genuinely spacious viewport here so this test asserts the
    // "large viewport, never clamps" case unambiguously.
    Object.defineProperty(mockClusterContainer, 'clientWidth', { value: 1920, configurable: true });
    Object.defineProperty(mockClusterContainer, 'clientHeight', { value: 1080, configurable: true });

    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);

    const coincidentPoint = { lat: 13.05, lng: 74.75 };
    const denseCluster = makeFakeCluster({
      sw: coincidentPoint,
      ne: coincidentPoint,
      center: coincidentPoint,
      childCount: 8,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: denseCluster });
    });

    expect(lastClusterGroupOptions?.spiderfyDistanceMultiplier).toBe(3.5);

    Object.defineProperty(mockClusterContainer, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(mockClusterContainer, 'clientHeight', { value: 600, configurable: true });
  });

  it('a large (500-member) spiral-mode cluster is left at the fix-cycle-3 base even on a narrow mobile viewport — spiral mode is deliberately unclamped', () => {
    Object.defineProperty(mockClusterContainer, 'clientWidth', { value: 390, configurable: true });
    Object.defineProperty(mockClusterContainer, 'clientHeight', { value: 844, configurable: true });

    const onMarkerClusterCameraIntent = vi.fn();
    render(<PropertyMap {...baseProps} onMarkerClusterCameraIntent={onMarkerClusterCameraIntent} />);

    const cluster = makeFakeCluster({
      sw: { lat: 13.0, lng: 74.7 },
      ne: { lat: 13.1, lng: 74.8 },
      center: { lat: 13.05, lng: 74.75 },
      childCount: 500,
    });
    act(() => {
      capturedClusterHandler!({ type: 'clusterclick', layer: cluster });
    });

    expect(lastClusterGroupOptions?.spiderfyDistanceMultiplier).toBe(3.5);

    Object.defineProperty(mockClusterContainer, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(mockClusterContainer, 'clientHeight', { value: 600, configurable: true });
  });
});

describe('Issue #1762 fix cycle 7 — spiderfy fan stays open across repeated clicks', () => {
  // Product requirement (verbatim): "I don't want the spider web to collapse
  // on clicking an expanded marker. I want the user to be able to
  // continuously view all the expanded markers by clicking on each."
  //
  // Root cause: `onSelectListing` writing a new `selectedListingId` used to
  // re-trigger MarkerClusterLayer's single big effect (selectedListingId/
  // hoveredListingId were in its dependency array), whose cleanup
  // unconditionally called `map.removeLayer(clusterGroup)` — destroying the
  // live cluster group (and Leaflet's own `_spiderfied` state) as an
  // accidental side effect, never via Leaflet's real unspiderfy contract.
  const listingA = { ...houseListing, id: 'listing-a' };
  const listingB = { ...houseListing, id: 'listing-b' };
  // Issue #1762 fix cycle 7 (test-authoring note) — this MUST be a single
  // stable array reference reused across every render/rerender call within
  // a test. `listings` is a real dependency of the structural effect; a
  // fresh `[listingA, listingB]` array literal in each JSX call would change
  // reference on every rerender (as any inline JSX array literal does) and
  // spuriously re-trigger the structural rebuild this suite is asserting
  // does NOT happen — exactly the kind of instability a memoized listings
  // array from a real data-fetching hook would not have.
  const twoListings = [listingA, listingB] as never;

  it('does NOT call map.removeLayer or reconstruct the cluster group when clicking marker A, then marker B, in an open spiderfy fan', () => {
    const onSelectListing = vi.fn();
    const { rerender } = render(
      <PropertyMap {...baseProps} listings={twoListings} onSelectListing={onSelectListing} />,
    );

    // `L.markerClusterGroup` is a module-level mock shared across every test
    // in this file, so its call count accumulates — assert deltas from this
    // mount, not an absolute count.
    const buildCountAfterMount = vi.mocked(L.markerClusterGroup).mock.calls.length;
    const instanceAfterMount = lastClusterGroupInstance;
    expect(instanceAfterMount).toBeDefined();

    // Simulate an open spiderfy fan — leaflet.markercluster's own live
    // pointer to the currently-spiderfied cluster.
    instanceAfterMount!._spiderfied = {};
    mapStub.removeLayer.mockClear();

    // Click marker A: the app writes the new selectedListingId to the URL,
    // which flows back down as this prop change.
    rerender(
      <PropertyMap
        {...baseProps}
        listings={twoListings}
        onSelectListing={onSelectListing}
        selectedListingId="listing-a"
      />,
    );

    expect(mapStub.removeLayer).not.toHaveBeenCalled();
    expect(vi.mocked(L.markerClusterGroup).mock.calls.length).toBe(buildCountAfterMount);
    expect(lastClusterGroupInstance).toBe(instanceAfterMount);
    // The fan is still open — nothing cleared `_spiderfied`.
    expect(instanceAfterMount!._spiderfied).toBeTruthy();

    // Click marker B in the SAME fan.
    rerender(
      <PropertyMap
        {...baseProps}
        listings={twoListings}
        onSelectListing={onSelectListing}
        selectedListingId="listing-b"
      />,
    );

    expect(mapStub.removeLayer).not.toHaveBeenCalled();
    expect(vi.mocked(L.markerClusterGroup).mock.calls.length).toBe(buildCountAfterMount);
    expect(lastClusterGroupInstance).toBe(instanceAfterMount);
    expect(instanceAfterMount!._spiderfied).toBeTruthy();
  });

  it('patches only the affected markers\' icons in place (via setIcon) instead of rebuilding, while spiderfied', () => {
    const onSelectListing = vi.fn();
    const { rerender } = render(
      <PropertyMap {...baseProps} listings={twoListings} onSelectListing={onSelectListing} />,
    );

    const markerResults = vi.mocked(L.marker).mock.results;
    // validListings.forEach constructs markers in listing order: A then B.
    const markerA = markerResults[markerResults.length - 2].value as { setIcon: ReturnType<typeof vi.fn> };
    const markerB = markerResults[markerResults.length - 1].value as { setIcon: ReturnType<typeof vi.fn> };

    lastClusterGroupInstance!._spiderfied = {};

    rerender(
      <PropertyMap
        {...baseProps}
        listings={twoListings}
        onSelectListing={onSelectListing}
        selectedListingId="listing-a"
      />,
    );

    // Marker A's icon is patched to reflect the new selection; marker B is
    // untouched (its highlight state didn't change — it was never selected).
    expect(markerA.setIcon).toHaveBeenCalledTimes(1);
    expect(markerB.setIcon).not.toHaveBeenCalled();

    rerender(
      <PropertyMap
        {...baseProps}
        listings={twoListings}
        onSelectListing={onSelectListing}
        selectedListingId="listing-b"
      />,
    );

    // Selecting B: A reverts to the normal icon, B gets the selected icon —
    // both marker icons are patched, still no cluster-group rebuild.
    expect(markerA.setIcon).toHaveBeenCalledTimes(2);
    expect(markerB.setIcon).toHaveBeenCalledTimes(1);
  });

  it('still performs a full teardown/rebuild when the selection changes and the cluster group is NOT spiderfied', () => {
    const onSelectListing = vi.fn();
    const { rerender } = render(
      <PropertyMap {...baseProps} listings={twoListings} onSelectListing={onSelectListing} />,
    );

    const buildCountAfterMount = vi.mocked(L.markerClusterGroup).mock.calls.length;
    // NOT spiderfied this time.
    expect(lastClusterGroupInstance!._spiderfied).toBeFalsy();
    mapStub.removeLayer.mockClear();

    rerender(
      <PropertyMap
        {...baseProps}
        listings={twoListings}
        onSelectListing={onSelectListing}
        selectedListingId="listing-a"
      />,
    );

    // Pre-fix (and correctly-preserved) behavior: full teardown + rebuild.
    expect(mapStub.removeLayer).toHaveBeenCalledTimes(1);
    expect(vi.mocked(L.markerClusterGroup).mock.calls.length).toBe(buildCountAfterMount + 1);
  });

  it('a real listings change still fully rebuilds the layer even while spiderfied (structural changes are never skipped)', () => {
    const onSelectListing = vi.fn();
    const { rerender } = render(
      <PropertyMap {...baseProps} listings={twoListings} onSelectListing={onSelectListing} />,
    );

    const buildCountAfterMount = vi.mocked(L.markerClusterGroup).mock.calls.length;
    lastClusterGroupInstance!._spiderfied = {};
    mapStub.removeLayer.mockClear();

    const listingC = { ...houseListing, id: 'listing-c' };
    const threeListings = [listingA, listingB, listingC] as never;
    rerender(
      <PropertyMap {...baseProps} listings={threeListings} onSelectListing={onSelectListing} />,
    );

    expect(mapStub.removeLayer).toHaveBeenCalledTimes(1);
    expect(vi.mocked(L.markerClusterGroup).mock.calls.length).toBe(buildCountAfterMount + 1);
  });

  // Code-review follow-up (APPROVE WITH COMMENTS) — same-commit double-rebuild
  // guard. If a structural dep (`listings`) AND `selectedListingId` both
  // change in the SAME commit (e.g. a listings refetch resolving in the same
  // tick as a URL-driven selection change), the structural effect's
  // `buildLayer()` call already produces a fresh, non-spiderfied cluster
  // group reflecting the CURRENT selection — the selection/hover effect must
  // NOT also call `buildLayer()` again for that same commit.
  it('collapses a same-commit structural + selection change into exactly ONE cluster-group rebuild, reflecting the new selection', () => {
    const onSelectListing = vi.fn();
    const { rerender } = render(
      <PropertyMap {...baseProps} listings={twoListings} onSelectListing={onSelectListing} />,
    );

    const buildCountAfterMount = vi.mocked(L.markerClusterGroup).mock.calls.length;
    // NOT spiderfied — this is the interleaving the reviewer flagged: without
    // the fix, the selection/hover effect would see "not spiderfied" and
    // redundantly call buildLayer() a second time in the same commit.
    expect(lastClusterGroupInstance!._spiderfied).toBeFalsy();
    mapStub.removeLayer.mockClear();

    const listingC = { ...houseListing, id: 'listing-c' };
    const threeListings = [listingA, listingB, listingC] as never;

    // `listings` (structural dep) AND `selectedListingId` change in the SAME
    // rerender — i.e. the same React commit.
    rerender(
      <PropertyMap
        {...baseProps}
        listings={threeListings}
        onSelectListing={onSelectListing}
        selectedListingId="listing-b"
      />,
    );

    // Exactly ONE `L.markerClusterGroup` construction — not two.
    expect(vi.mocked(L.markerClusterGroup).mock.calls.length).toBe(buildCountAfterMount + 1);
    // The single teardown/rebuild pair still happened (structural effect owns
    // it), never a SECOND removeLayer from a redundant selection-effect call.
    expect(mapStub.removeLayer).toHaveBeenCalledTimes(1);

    // The single build reflects the NEW selection — listing-b's marker got
    // the selected icon, not stale/plain.
    const selectedIcon = createSelectedMarkerIcon(
      listingB.property_type,
      listingB.price,
      undefined,
      undefined,
      undefined,
    );
    const markerCalls = vi.mocked(L.marker).mock.calls;
    // validListings.forEach constructs markers in listing order for the
    // fresh build: A, B, C (the last 3 L.marker() calls).
    const lastThree = markerCalls.slice(-3);
    const callB = lastThree[1] as unknown as [unknown, { icon: unknown }];
    expect(callB[1].icon).toBe(selectedIcon);
  });
});
