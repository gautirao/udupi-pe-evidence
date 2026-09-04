/**
 * Issue #2426 — BoundsWatcher must not re-dirty a committed viewport on
 * layout resize.
 *
 * Root cause: `BoundsWatcher` (PropertyMap.tsx) forwards EVERY `moveend`/
 * `zoomend` to `onBoundsChange` unconditionally. `MapContainerResizeSync`
 * (issue #2049) calls `map.invalidateSize({ debounceMoveend: true })`
 * whenever the container's on-screen size actually changes (a pure layout
 * effect — e.g. a ResizeObserver firing after some other panel mounts),
 * which schedules exactly one debounced `moveend` carrying the recomputed
 * bounds. That `moveend` is not a genuine user pan/zoom, but
 * `useDiscoverViewportSearch`'s dirty-baseline reset only resets on a
 * `cameraIntent.seq` bump (the imperative camera calls), which this resize
 * path never triggers — so a real container resize after a VIEWPORT commit
 * could re-trip "Search this area" with no user interaction at all.
 *
 * This test exercises the REAL event wiring end-to-end (a real Leaflet
 * `resize` → debounced `moveend` sequence, simulated by invoking the actual
 * handlers `BoundsWatcher` registered via `map.on`) rather than calling any
 * pure helper function in isolation. It must fail against the pre-fix
 * `BoundsWatcher` (which has no `resize` listener / suppression) and pass
 * against the fixed one.
 *
 * Recovered from a crash-orphaned fix parked at
 * `parked/2426-cta-resize-veto-fix` (commit bb4cffba), ported onto current
 * main's PropertyMap.tsx test conventions (mock set mirrors
 * PropertyMap.areaPanner.test.tsx, the sibling test already passing against
 * this file's current import surface post-#2017/#2420).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';

// ─── Hoisted stubs ─────────────────────────────────────────────
// Real Leaflet invokes every listener registered for an event, in
// registration order — several PropertyMap sub-components (BoundsWatcher,
// ViewportWatcher, ZoomWatcher, AreaMarkerLayer, MarkerClusterLayer, ...)
// all register their own 'moveend'/'zoomend'/'resize' handlers on the SAME
// map instance. A single vi.fn() per event (as in some sibling test files)
// would silently drop everything but the LAST registrant, so this stub
// keeps an array of handlers per event name and fires them all — the same
// approach used by PropertyMap.clusterTapFit.test.tsx's moveend arrays.
const handlersByEvent = vi.hoisted(() => new Map<string, Array<() => void>>());

function fireMapEvent(event: string) {
  const handlers = handlersByEvent.get(event) ?? [];
  // Snapshot before firing — a handler could synchronously register/deregister.
  handlers.slice().forEach((cb) => cb());
}

const mapStub = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  setZoom: vi.fn(),
  setView: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  getZoom: vi.fn(() => 13),
  getBoundsZoom: vi.fn(() => 14),
  getBounds: vi.fn(() => ({
    getNorth: () => 13.4,
    getSouth: () => 13.3,
    getEast: () => 74.85,
    getWest: () => 74.75,
  })),
  getContainer: vi.fn(() => document.body),
  getSize: vi.fn(() => ({ x: 1024, y: 768 })),
  containerPointToLatLng: vi.fn(() => ({ lat: 13.355, lng: 74.8 })),
  latLngToContainerPoint: vi.fn(() => ({ x: 500, y: 400 })),
  on: vi.fn((event: string, cb: () => void) => {
    const arr = handlersByEvent.get(event) ?? [];
    arr.push(cb);
    handlersByEvent.set(event, arr);
  }),
  off: vi.fn((event: string, cb: () => void) => {
    const arr = handlersByEvent.get(event);
    if (!arr) return;
    const idx = arr.indexOf(cb);
    if (idx !== -1) arr.splice(idx, 1);
  }),
  once: vi.fn(),
  invalidateSize: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 13.3409, lng: 74.7421 })),
  project: vi.fn((latlng: [number, number], zoom: number) => {
    const scale = 2 ** zoom;
    return { x: (latlng[1] + 180) * scale, y: (90 - latlng[0]) * scale };
  }),
  remove: vi.fn(),
}));

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      getElement: vi.fn(() => null),
    })),
    markerClusterGroup: vi.fn(() => ({ addLayer: vi.fn(), on: vi.fn(), off: vi.fn() })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
    latLngBounds: vi.fn(() => ({ getCenter: () => ({ lat: 13.355, lng: 74.8 }), isValid: () => true })),
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
  AreaDestinationMarkerLayer: () => null,
}));
vi.mock('@/components/map/SchoolMarkerLayer', () => ({
  SchoolMarkerLayer: () => null,
  SELECTED_SCHOOL_PANE_NAME: 'selected-school-pane',
}));
vi.mock('@/dev/ScaleHud', () => ({ ScaleHud: () => null }));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Imports after mocks ───────────────────────────────────────
import { PropertyMap } from '@/components/map/PropertyMap';

const CITY_CENTER: [number, number] = [13.3409, 74.7421];

describe('Issue #2426 — BoundsWatcher must not re-dirty a committed viewport on layout resize', () => {
  beforeEach(() => {
    handlersByEvent.clear();
    mapStub.invalidateSize.mockClear();
  });

  it('a resize-driven moveend (MapContainerResizeSync/invalidateSize path) does NOT call onBoundsChange', () => {
    const onBoundsChange = vi.fn();
    render(
      <PropertyMap listings={[]} cityCenter={CITY_CENTER} cityZoom={11} onBoundsChange={onBoundsChange} />,
    );

    // Consume BoundsWatcher's mount-suppression fire (its very first
    // moveend/zoomend is always ignored — see hasMountedRef).
    act(() => {
      fireMapEvent('moveend');
    });
    onBoundsChange.mockClear();

    // Simulate MapContainerResizeSync's real sequence: Leaflet's
    // invalidateSize fires a synchronous 'resize' event, then (debounced)
    // a single 'moveend' with the recomputed bounds — no drag/zoomstart
    // ever occurs, exactly like a real container-resize-only layout event.
    act(() => {
      fireMapEvent('resize');
      fireMapEvent('moveend');
    });

    expect(
      onBoundsChange,
      'a layout-resize-driven moveend must not be reported as a viewport bounds change',
    ).not.toHaveBeenCalled();
  });

  it('two settle events from ONE resize (invalidateSize({pan:true})\'s own panBy firing a second, separate moveend) are BOTH suppressed', () => {
    // Regression for the mobile 390x844 E2E finding: MapContainerResizeSync
    // calls invalidateSize({ pan: true, ... }), and when the shrunk container
    // would otherwise crop the current center out of view, Leaflet's own
    // internal panBy() fires a SEPARATE movestart/moveend cycle in addition
    // to the resize's own — two settles from one resize, not one. A relative
    // width change large enough to need that repositioning (much more likely
    // on a 390px-wide mobile viewport than a 1366px desktop one) must not
    // leak a second, un-suppressed bounds report.
    const onBoundsChange = vi.fn();
    render(
      <PropertyMap listings={[]} cityCenter={CITY_CENTER} cityZoom={11} onBoundsChange={onBoundsChange} />,
    );

    act(() => {
      fireMapEvent('moveend'); // mount-suppression fire
    });
    onBoundsChange.mockClear();

    act(() => {
      fireMapEvent('resize');
      fireMapEvent('moveend'); // the resize's own debounced settle
      fireMapEvent('moveend'); // panBy's separate settle — must ALSO be suppressed
    });

    expect(
      onBoundsChange,
      'every settle following a resize must stay suppressed until a genuine user gesture, not just the first one',
    ).not.toHaveBeenCalled();
  });

  it('a genuine user drag (dragstart) after a resize clears the suppression, so the resulting moveend reports bounds', () => {
    const onBoundsChange = vi.fn();
    render(
      <PropertyMap listings={[]} cityCenter={CITY_CENTER} cityZoom={11} onBoundsChange={onBoundsChange} />,
    );

    act(() => {
      fireMapEvent('moveend'); // mount-suppression fire
    });
    onBoundsChange.mockClear();

    // A resize-driven settle first (must be suppressed)...
    act(() => {
      fireMapEvent('resize');
      fireMapEvent('moveend');
    });
    expect(onBoundsChange).not.toHaveBeenCalled();

    // ...then a genuine user drag begins (Leaflet only fires 'dragstart' for
    // real mouse/touch dragging, never for a programmatic pan) — this must
    // clear the suppression so the drag's own resulting moveend is reported.
    act(() => {
      fireMapEvent('dragstart');
      fireMapEvent('moveend');
    });
    expect(
      onBoundsChange,
      'a real user drag following a resize must not be swallowed by the resize veto',
    ).toHaveBeenCalledTimes(1);
  });

  it('clicking the Leaflet zoom-in control after a resize clears the suppression', () => {
    // Leaflet's ZoomControl +/- buttons live inside the map container's own
    // DOM subtree (.leaflet-control-zoom-in/-out) and call
    // map.zoomIn()/zoomOut() internally, which fires zoomstart/zoomend —
    // NEVER 'dragstart'. Team-lead review (#2426 fix cycle 2) — the
    // dragstart-only clear set missed this, so a shopper who resizes then
    // clicks the zoom-in control would see no CTA on their next pan, a
    // regression against #2015's "first material user pan/zoom" activation
    // contract. Fix cycle 3 narrowed the clear-on-click to ONLY a click
    // whose target is inside the zoom control (see BoundsWatcher's own doc
    // comment) — this test dispatches the click on an actual zoom-control
    // element, not the bare container, to prove that scoping still clears.
    const onBoundsChange = vi.fn();
    render(
      <PropertyMap listings={[]} cityCenter={CITY_CENTER} cityZoom={11} onBoundsChange={onBoundsChange} />,
    );

    act(() => {
      fireMapEvent('moveend'); // mount-suppression fire
    });
    onBoundsChange.mockClear();

    act(() => {
      fireMapEvent('resize');
      fireMapEvent('moveend');
    });
    expect(onBoundsChange).not.toHaveBeenCalled();

    const zoomInButton = document.createElement('a');
    zoomInButton.className = 'leaflet-control-zoom-in';
    document.body.appendChild(zoomInButton);
    act(() => {
      zoomInButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Leaflet fires zoomend then moveend in succession for a zoom-control
      // click, same coalescing this file's own header doc already notes for
      // pinch/scroll zoom — both settles must now report (BoundsWatcher has
      // no dedup of its own; the caller's debounce collapses these).
      fireMapEvent('zoomend');
      fireMapEvent('moveend');
    });
    expect(
      onBoundsChange,
      'a zoom-control click following a resize must not be swallowed by the resize veto',
    ).toHaveBeenCalledTimes(2);
    document.body.removeChild(zoomInButton);
  });

  it('a double-click (double-click zoom) after a resize clears the suppression', () => {
    // Fix cycle 3 — `click` is now scoped to the zoom control, so
    // double-click zoom (which is real camera intent) is driven directly
    // off a native `dblclick` listener instead of relying on the two
    // `click`s the browser fires before it.
    const onBoundsChange = vi.fn();
    render(
      <PropertyMap listings={[]} cityCenter={CITY_CENTER} cityZoom={11} onBoundsChange={onBoundsChange} />,
    );

    act(() => {
      fireMapEvent('moveend'); // mount-suppression fire
    });
    onBoundsChange.mockClear();

    act(() => {
      fireMapEvent('resize');
      fireMapEvent('moveend');
    });
    expect(onBoundsChange).not.toHaveBeenCalled();

    act(() => {
      document.body.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      fireMapEvent('zoomend');
      fireMapEvent('moveend');
    });
    expect(
      onBoundsChange,
      'a double-click (double-click zoom) following a resize must not be swallowed by the resize veto',
    ).toHaveBeenCalledTimes(2);
  });

  it('a multi-touch (pinch-zoom) touchstart after a resize clears the suppression, but a single-finger touchstart does NOT (fix cycle 5)', () => {
    // Team-lead BLOCKING finding on fix cycle 4: an undifferentiated
    // single-finger touchstart is not camera intent by itself (it can be a
    // tap on a marker/background/control, same ambiguity as `click`), yet
    // it was clearing suppression unconditionally — letting a resize-origin
    // settle escape on mobile the same way an unscoped click could on
    // desktop. A genuine one-finger pan already fires Leaflet's own
    // `dragstart` once the drag begins, so only a MULTI-finger touchstart
    // (pinch-zoom start) should clear here.
    const onBoundsChange = vi.fn();
    render(
      <PropertyMap listings={[]} cityCenter={CITY_CENTER} cityZoom={11} onBoundsChange={onBoundsChange} />,
    );

    act(() => {
      fireMapEvent('moveend'); // mount-suppression fire
    });
    onBoundsChange.mockClear();

    act(() => {
      fireMapEvent('resize');
    });

    // Single-finger touchstart (a tap) must NOT clear suppression.
    act(() => {
      const singleFingerTouch = new Event('touchstart', { bubbles: true });
      Object.defineProperty(singleFingerTouch, 'touches', { value: [{}], configurable: true });
      document.body.dispatchEvent(singleFingerTouch);
    });
    act(() => {
      fireMapEvent('moveend');
    });
    expect(
      onBoundsChange,
      'a single-finger touchstart must not clear the resize veto',
    ).not.toHaveBeenCalled();

    // Multi-finger touchstart (pinch-zoom start) DOES clear suppression.
    act(() => {
      const pinchTouch = new Event('touchstart', { bubbles: true });
      Object.defineProperty(pinchTouch, 'touches', { value: [{}, {}], configurable: true });
      document.body.dispatchEvent(pinchTouch);
      fireMapEvent('moveend');
    });
    expect(
      onBoundsChange,
      'a multi-finger touchstart (pinch-zoom) must clear the resize veto',
    ).toHaveBeenCalledTimes(1);
  });

  it('Leaflet box-zoom (Shift+drag, boxzoomstart) after a resize clears the suppression (fix cycle 5)', () => {
    // Leaflet's box zoom is enabled by default in this repo and fires
    // `boxzoomstart`, never `dragstart` — a real bounds-changing gesture
    // that must clear suppression the same as any other camera gesture.
    const onBoundsChange = vi.fn();
    render(
      <PropertyMap listings={[]} cityCenter={CITY_CENTER} cityZoom={11} onBoundsChange={onBoundsChange} />,
    );

    act(() => {
      fireMapEvent('moveend'); // mount-suppression fire
    });
    onBoundsChange.mockClear();

    act(() => {
      fireMapEvent('resize');
      fireMapEvent('moveend');
    });
    expect(onBoundsChange).not.toHaveBeenCalled();

    act(() => {
      fireMapEvent('boxzoomstart');
      fireMapEvent('moveend');
    });
    expect(
      onBoundsChange,
      'a box-zoom (boxzoomstart) following a resize must not be swallowed by the resize veto',
    ).toHaveBeenCalledTimes(1);
  });

  it('a keyboard pan/zoom (arrow keys / +/-) after a resize clears the suppression', () => {
    // Leaflet's Keyboard handler gives the map container a tabindex and
    // listens for arrow-key pan / +/- zoom keydowns directly on it — a
    // programmatic panBy/setZoom call under the hood, never 'dragstart' or
    // 'wheel'/'touchstart'. Team-lead review (#2426 fix cycle 2).
    const onBoundsChange = vi.fn();
    render(
      <PropertyMap listings={[]} cityCenter={CITY_CENTER} cityZoom={11} onBoundsChange={onBoundsChange} />,
    );

    act(() => {
      fireMapEvent('moveend'); // mount-suppression fire
    });
    onBoundsChange.mockClear();

    act(() => {
      fireMapEvent('resize');
      fireMapEvent('moveend');
    });
    expect(onBoundsChange).not.toHaveBeenCalled();

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      fireMapEvent('moveend');
    });
    expect(
      onBoundsChange,
      'a keyboard pan/zoom following a resize must not be swallowed by the resize veto',
    ).toHaveBeenCalledTimes(1);
  });

  it('a non-camera click (marker/background) and a non-camera keydown after a resize do NOT clear the suppression (fix cycle 3)', () => {
    // Team-lead BLOCKING finding on the fix-cycle-2 widening: clearing on
    // ANY click/keydown in the map container is too broad — a marker or
    // background click, or a non-camera key, arriving while a resize-origin
    // settle is still queued would clear suppression before that settle
    // fires, letting the resize's bbox escape through onBoundsChange and
    // fabricate a dirty VIEWPORT. Neither of these must clear here.
    const onBoundsChange = vi.fn();
    render(
      <PropertyMap listings={[]} cityCenter={CITY_CENTER} cityZoom={11} onBoundsChange={onBoundsChange} />,
    );

    act(() => {
      fireMapEvent('moveend'); // mount-suppression fire
    });
    onBoundsChange.mockClear();

    act(() => {
      fireMapEvent('resize');
    });

    // A click on an ordinary element in the map container (a marker or the
    // background) — NOT the zoom control — must not clear suppression.
    const markerEl = document.createElement('div');
    markerEl.className = 'leaflet-marker-icon';
    document.body.appendChild(markerEl);
    act(() => {
      markerEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    document.body.removeChild(markerEl);

    // A non-camera key (e.g. Tab) must not clear suppression either.
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });

    // The resize-origin settle, queued the whole time, must still be suppressed.
    act(() => {
      fireMapEvent('moveend');
    });
    expect(
      onBoundsChange,
      'a non-camera click/keydown must not clear the resize veto, so the queued resize settle stays suppressed',
    ).not.toHaveBeenCalled();
  });

  it('onUserCameraGesture fires for genuine camera gestures and NOT for a marker click or non-camera keydown (Issue #2426 fix cycle 4)', () => {
    // Fix cycle 4 (team-lead ruling) — BoundsWatcher reports the SAME
    // camera-gesture classification it already uses to clear its own resize
    // veto OUTWARD via onUserCameraGesture, so useDiscoverViewportSearch can
    // gate isDirty on "a real gesture happened since the last commit"
    // (closes the trailing-inertia-settle fabricated-dirty variant).
    const onBoundsChange = vi.fn();
    const onUserCameraGesture = vi.fn();
    render(
      <PropertyMap
        listings={[]}
        cityCenter={CITY_CENTER}
        cityZoom={11}
        onBoundsChange={onBoundsChange}
        onUserCameraGesture={onUserCameraGesture}
      />,
    );

    act(() => {
      fireMapEvent('moveend'); // mount-suppression fire
    });
    onUserCameraGesture.mockClear();

    // A genuine drag gesture fires it.
    act(() => {
      fireMapEvent('dragstart');
    });
    expect(onUserCameraGesture).toHaveBeenCalledTimes(1);

    // A zoom-control click fires it.
    const zoomInButton = document.createElement('a');
    zoomInButton.className = 'leaflet-control-zoom-in';
    document.body.appendChild(zoomInButton);
    act(() => {
      zoomInButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    document.body.removeChild(zoomInButton);
    expect(onUserCameraGesture).toHaveBeenCalledTimes(2);

    // A marker/background click must NOT fire it.
    const markerEl = document.createElement('div');
    markerEl.className = 'leaflet-marker-icon';
    document.body.appendChild(markerEl);
    act(() => {
      markerEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    document.body.removeChild(markerEl);
    expect(
      onUserCameraGesture,
      'a click outside the zoom control must not report a camera gesture',
    ).toHaveBeenCalledTimes(2);

    // A non-camera keydown must NOT fire it.
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(
      onUserCameraGesture,
      'a non-camera keydown must not report a camera gesture',
    ).toHaveBeenCalledTimes(2);

    // A camera keydown DOES fire it.
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(onUserCameraGesture).toHaveBeenCalledTimes(3);
  });

  it('a genuine user pan/zoom with no resize in play calls onBoundsChange as before (no regression)', () => {
    const onBoundsChange = vi.fn();
    render(
      <PropertyMap listings={[]} cityCenter={CITY_CENTER} cityZoom={11} onBoundsChange={onBoundsChange} />,
    );

    act(() => {
      fireMapEvent('moveend'); // mount-suppression fire
    });
    onBoundsChange.mockClear();

    act(() => {
      fireMapEvent('zoomend');
    });
    act(() => {
      fireMapEvent('moveend');
    });

    expect(onBoundsChange).toHaveBeenCalledTimes(2);
  });
});
