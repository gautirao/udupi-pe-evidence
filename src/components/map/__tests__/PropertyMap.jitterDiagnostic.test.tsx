/**
 * Issue #1801 — FIXED behaviour for the "camera jitter" regression diagnosed
 * in the original version of this file (Issue #1798 PR-B).
 *
 * Root cause (confirmed by the diagnostic this file used to contain): a
 * single area/zone/region marker click used to fire 2-3 UNCOORDINATED
 * imperative Leaflet camera calls on the SAME map instance:
 *   1. AreaMarkerLayer's own marker.on('click', ...) — synchronous
 *      map.fitBounds/flyTo, entirely outside React.
 *   2. A chained map.once('zoomend', () => setZoom(13)) correction for
 *      non-region/group areas whose fit landed at zoom <= 12.
 *   3. PropertyMap's MapController focusBounds effect — a LATER, independent
 *      fitBounds once the new area's markers finished fetching over the
 *      network, usually to a different (tighter) bbox.
 *
 * The fix consolidates all area-navigation camera ownership into
 * MapController via an optimistic `cameraIntent` (published synchronously by
 * AreaMarkerLayer's full-pin click handlers) and suppresses the one
 * network-driven focusBounds refit that follows the same click navigation.
 *
 * This test asserts the FIXED behaviour: a single area-marker click produces
 * exactly ONE area-navigation camera call, for BOTH the legacy and the
 * degraded-representatives handler, and registers NO zoomend/setZoom
 * correction. It must fail against the pre-fix code (which called
 * map.fitBounds/flyTo directly from AreaMarkerLayer AND registered
 * map.once('zoomend', ...)) and pass against the fixed code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

// ─── Hoisted stubs ─────────────────────────────────────────────
const mapStub = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  setZoom: vi.fn(),
  setView: vi.fn(),
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
    latLngBounds: vi.fn(() => ({ getCenter: () => ({ lat: 13.355, lng: 74.8 }) })),
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
// mocked to null) — the whole point of this test is to observe that clicking
// its markers no longer touches the map directly, and that the resulting
// onAreaCameraIntent → cameraIntent → MapController round trip produces
// exactly one camera call.
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

const AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.3525,
  geo_center_lon: 74.7869,
  bbox: [[13.34, 74.78], [13.37, 74.82]],
};

// Stable reference (never a fresh array literal) — MapController's city-change
// flyTo effect is keyed on cityCenter identity, so an inline array literal in
// the Harness's JSX would look like a "city changed" on every re-render and
// fire a spurious extra flyTo, unrelated to the behaviour under test here.
const CITY_CENTER: [number, number] = [13.3409, 74.7421];

/**
 * Simulates the real MapDiscovery↔useDiscoverMapData round trip: MapDiscovery
 * passes onAreaCameraIntent down to PropertyMap, and PropertyMap is
 * re-rendered with the resulting cameraIntent once "published" — exactly
 * like publishCameraIntent's setCameraIntent would trigger a MapDiscovery
 * re-render in the real app.
 */
function CameraIntentHarness({
  areas,
  focusBounds = null,
}: {
  areas: AreaPoint[];
  focusBounds?: [[number, number], [number, number]] | null;
}) {
  const [cameraIntent, setCameraIntent] = React.useState<CameraIntent | null>(null);
  const seqRef = React.useRef(0);
  const publishCameraIntent = React.useCallback((area: AreaPoint) => {
    seqRef.current += 1;
    setCameraIntent({
      seq: seqRef.current,
      bounds: area.bbox,
      center: [area.geo_center_lat, area.geo_center_lon],
      framing: area.isMacroRegion || area.isGroup ? 'overview' : 'leaf',
    });
  }, []);

  return (
    <PropertyMap
      listings={[]}
      cityCenter={CITY_CENTER}
      cityZoom={11}
      resetMapTick={0}
      areas={areas}
      onAreaCameraIntent={publishCameraIntent}
      cameraIntent={cameraIntent}
      focusBounds={focusBounds}
    />
  );
}

describe('Issue #1801 — camera consolidation fixes the multi-call jitter', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setZoom.mockClear();
    mapStub.setView.mockClear();
    mapStub.once.mockClear();
    mapStub.getBoundsZoom.mockClear();
    mapStub.getBoundsZoom.mockReturnValue(14);
    markerHandlers.clear();
  });

  it('a single legacy area-marker click produces exactly ONE area-navigation camera call (leaf framing → setView)', () => {
    render(<CameraIntentHarness areas={[AREA]} />);

    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.flyTo).not.toHaveBeenCalled();
    expect(mapStub.setView).not.toHaveBeenCalled();

    const clickHandler = markerHandlers.get('click');
    expect(clickHandler, 'AreaMarkerLayer must have registered a click handler').toBeTruthy();
    act(() => {
      clickHandler!();
    });

    // Exactly one camera call total across fitBounds/flyTo/setView.
    const totalCalls =
      mapStub.fitBounds.mock.calls.length +
      mapStub.flyTo.mock.calls.length +
      mapStub.setView.mock.calls.length;
    expect(totalCalls).toBe(1);
    expect(mapStub.setView).toHaveBeenCalledTimes(1);
  });

  // NOTE — qa-fast R4: the degraded-representatives handler (AreaMarkerLayer's
  // bucketing loop) shares the EXACT same click body as the legacy handler
  // (`onAreaClick?.(area); onAreaCameraIntent?.(area);`), so the "exactly one
  // camera call" assertion above already covers its logic byte-for-byte.
  // Precise per-marker-type click simulation for the degraded path (which
  // needs a `map.getSize()`/`latLngToContainerPoint` bucketing mock and the
  // captured-markers-by-index pattern to reliably target a REPRESENTATIVE
  // marker rather than a dot/cluster) lives in AreaMarkerLayer.test.tsx —
  // see "degraded-representatives click publishes camera intent, same as
  // the legacy handler, and the cluster/dots handlers are unaffected".

  it('NO map.once("zoomend", ...) correction is registered on area-marker click (the old 3rd camera call is gone)', () => {
    render(<CameraIntentHarness areas={[AREA]} />);

    const clickHandler = markerHandlers.get('click');
    act(() => {
      clickHandler!();
    });

    expect(mapStub.once).not.toHaveBeenCalled();
    expect(mapStub.setZoom).not.toHaveBeenCalled();
  });

  it('macro-region pin click (overview framing) fits with maxZoom 12, not setView', () => {
    const REGION: AreaPoint = {
      ...AREA,
      areaKey: 'region-1',
      isMacroRegion: true,
    };
    render(<CameraIntentHarness areas={[REGION]} />);

    const clickHandler = markerHandlers.get('click');
    act(() => {
      clickHandler!();
    });

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.setView).not.toHaveBeenCalled();
    const [bbox, opts] = mapStub.fitBounds.mock.calls[0];
    expect(bbox).toEqual(REGION.bbox);
    expect(opts).toEqual({ padding: [40, 40], maxZoom: 12 });
  });

  it('a later network-driven focusBounds change following the SAME click does NOT add a second camera call', () => {
    const { rerender } = render(<CameraIntentHarness areas={[AREA]} />);
    const clickHandler = markerHandlers.get('click');
    act(() => {
      clickHandler!();
    });

    const totalAfterClick =
      mapStub.fitBounds.mock.calls.length +
      mapStub.flyTo.mock.calls.length +
      mapStub.setView.mock.calls.length;
    expect(totalAfterClick).toBe(1);

    // Re-render the SAME Harness (preserving MapController's internal refs)
    // with a focusBounds prop change — simulating MapDiscovery's
    // activeFocusBounds settling after the area's listings fetch resolves.
    // Must NOT add a second camera call (strict fit-once suppression).
    rerender(
      <CameraIntentHarness areas={[AREA]} focusBounds={[[13.348, 74.784], [13.357, 74.79]]} />,
    );

    const totalAfterFocusBounds =
      mapStub.fitBounds.mock.calls.length +
      mapStub.flyTo.mock.calls.length +
      mapStub.setView.mock.calls.length;
    expect(totalAfterFocusBounds).toBe(1);
  });
});
