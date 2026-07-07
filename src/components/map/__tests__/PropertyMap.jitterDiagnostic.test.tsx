/**
 * DIAGNOSTIC (Issue #1798 PR-B, regression 1 — "camera jitter").
 *
 * NOT a fix. This test exists to CONFIRM or RULE OUT the multi-tick
 * camera-collision hypothesis for the user-reported symptom:
 *   "the map jitteriness is primarily the map zooming in and out when
 *    clicked on the region, zone and area markers... the transition is
 *    not smooth and it doesn't zoom to the correct boundary immediately,
 *    looks like it goes somewhere and then it is pulled back."
 *
 * Two independent, uncoordinated call sites both hold a reference to the
 * SAME live Leaflet map instance (via useMap()) and both issue their own
 * camera command in response to a single area/zone/region marker click:
 *
 *   1. AreaMarkerLayer.tsx — marker.on('click', ...) fires a SYNCHRONOUS,
 *      imperative map.fitBounds(area.bbox, ...) / map.flyTo(...) the
 *      instant the marker is clicked, entirely outside React's render
 *      cycle (it does not go through any prop).
 *
 *   2. PropertyMap.tsx MapController — has a useEffect keyed on the
 *      `focusBounds` prop. `focusBounds` is fed by MapDiscovery's
 *      `activeFocusBounds`, which is `computeFocusBounds(filteredMarkersData,
 *      filters.localities)` — i.e. it only settles AFTER the new area's
 *      listings/markers finish fetching (a network round trip after the
 *      click). When it changes, MapController fires ANOTHER independent
 *      map.fitBounds/flyTo — usually to a different (tighter) bounds than
 *      AreaMarkerLayer's immediate area-bbox fit.
 *
 * This test proves both listeners are wired to the SAME map object and
 * that a single logical "user clicked a marker" event chain produces TWO
 * independent camera calls with different targets, landing at different
 * times — exactly the "goes somewhere, then pulled back" pattern.
 *
 * See docs/audit/evidence/discover-map-school-search-ux/jitter-diagnostic-pr-b.md
 * for the full static-analysis + verdict writeup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

// ─── Hoisted stubs ─────────────────────────────────────────────
const mapStub = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  setZoom: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  getZoom: vi.fn(() => 11),
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
  setView: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 13.3409, lng: 74.7421 })),
}));

// Captures the handlers registered via marker.on(event, cb) so the test can
// simulate a real user click by invoking the captured 'click' callback —
// the same thing Leaflet would do internally on a real DOM click.
const markerHandlers = vi.hoisted(() => new Map<string, () => void>());

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => {
      const markerObj = {
        on: vi.fn((event: string, cb: () => void) => {
          markerHandlers.set(event, cb);
          return markerObj;
        }),
        addTo: vi.fn(() => markerObj),
        remove: vi.fn(),
      };
      return markerObj;
    }),
    markerClusterGroup: vi.fn(() => ({ addLayer: vi.fn() })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
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
// NOTE: AreaMarkerLayer is intentionally the REAL implementation here (not
// mocked to null like the sibling AreaPanner test) — the whole point of this
// diagnostic is to observe its own imperative click-driven camera call
// landing on the SAME mapStub that MapController's focusBounds effect uses.
vi.mock('@/components/map/SchoolMarkerLayer', () => ({
  SchoolMarkerLayer: () => null,
}));
vi.mock('@/dev/ScaleHud', () => ({ ScaleHud: () => null }));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Imports after mocks ───────────────────────────────────────
import { PropertyMap } from '@/components/map/PropertyMap';

const AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.3525,
  geo_center_lon: 74.7869,
  bbox: [[13.34, 74.78], [13.37, 74.82]],
};

const baseProps = {
  listings: [],
  cityCenter: [13.3409, 74.7421] as [number, number],
  cityZoom: 11,
  resetMapTick: 0,
  areas: [AREA],
};

describe('Issue #1798 diagnostic — multi-tick camera collision on marker click', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setZoom.mockClear();
    mapStub.once.mockClear();
    markerHandlers.clear();
  });

  it('CONFIRMED: AreaMarkerLayer click fitBounds + a later MapController focusBounds fitBounds = 2 independent camera calls for one logical click', () => {
    const { rerender } = render(<PropertyMap {...baseProps} focusBounds={null} />);

    // Sanity: no camera calls yet — mount alone must not move the camera.
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();

    // 1) Simulate the user clicking the area marker. AreaMarkerLayer's own
    //    marker.on('click', ...) handler fires synchronously and imperatively.
    const clickHandler = markerHandlers.get('click');
    expect(clickHandler, 'AreaMarkerLayer must have registered a click handler').toBeTruthy();
    clickHandler!();

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [firstBbox, firstOpts] = mapStub.fitBounds.mock.calls[0];
    expect(firstBbox).toEqual(AREA.bbox);
    expect(firstOpts).toEqual({ padding: [40, 40], maxZoom: 16 });

    // 2) Time passes: the click also changed `filters.localities` in
    //    MapDiscovery, the new area's listings query resolves over the
    //    network, and `activeFocusBounds` recomputes to the bbox of the
    //    ACTUAL markers in the area (independent of AreaMarkerLayer, and
    //    typically not identical to the area's static bbox). MapDiscovery
    //    re-renders PropertyMap with the new `focusBounds` prop.
    const listingsBounds: [[number, number], [number, number]] = [
      [13.348, 74.784],
      [13.357, 74.79],
    ];
    rerender(<PropertyMap {...baseProps} focusBounds={listingsBounds} />);

    // MapController's focusBounds effect fires a SECOND, independent camera
    // call — on the SAME map instance — after the first one already landed.
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(2);
    const [secondBbox, secondOpts] = mapStub.fitBounds.mock.calls[1];
    expect(secondBbox).toEqual(listingsBounds);
    expect(secondOpts).toEqual({ padding: [50, 50] });

    // The two calls target DIFFERENT bounds — this is the "goes somewhere,
    // then pulled back" symptom: the camera settles once, then is
    // re-corrected to a different frame moments later.
    expect(secondBbox).not.toEqual(firstBbox);
  });

  it('CONFIRMED: non-region/group area click chains a THIRD camera call via zoomend when the fit lands at zoom <= 12', () => {
    render(<PropertyMap {...baseProps} focusBounds={null} />);

    const clickHandler = markerHandlers.get('click');
    clickHandler!();
    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);

    // AreaMarkerLayer registers a one-shot zoomend correction for non
    // region/group areas: `map.once('zoomend', () => { if (map.getZoom() <= 12)
    // map.setZoom(13, ...) })`. Simulate the fit settling at zoom 11 (a wide
    // bbox clamped by viewport) and fire the captured zoomend callback.
    expect(mapStub.once).toHaveBeenCalledWith('zoomend', expect.any(Function));
    const zoomendCb = mapStub.once.mock.calls.find(([evt]) => evt === 'zoomend')?.[1];
    expect(zoomendCb).toBeTruthy();

    mapStub.getZoom.mockReturnValue(11);
    zoomendCb();

    // A THIRD camera call (setZoom) fires, correcting the just-settled
    // fitBounds result — on top of the eventual MapController focusBounds
    // fit from the network-driven activeFocusBounds recompute.
    expect(mapStub.setZoom).toHaveBeenCalledTimes(1);
    expect(mapStub.setZoom).toHaveBeenCalledWith(13, { animate: true });
  });
});
