/**
 * Issue #1943 (Stage-B fix-cycle — cluster drill-in never zooms out).
 *
 * Root cause: MapController's 'overview' framing branch widens its zoom
 * ceiling from AREA_LAYER_MAX_ZOOM (12) to LEAF_FIT_MAX_ZOOM (16) whenever
 * `isDestinationClusterLevel` is true (canonical Areas hierarchy showing its
 * 'clusters'/'directions' level). That widening PERMITS a closer fit but does
 * not FORCE one: fitting the clicked cluster's own member bounds can
 * legitimately compute a zoom AT OR BELOW the zoom at click time (wide member
 * bounds relative to the viewport, or near-coincident members) — which is
 * fine for a macro-region-pin/area-group-chip 'overview' intent (that is
 * simply the pin's own natural fit) but actively WRONG for a
 * destination-cluster-card drill-in click: the real-browser pass showed a
 * click on a "BTM Layout, Bilekahalli +1" cluster at zoom 13 landing at zoom
 * 12 — the camera zoomed OUT, the bubble stayed collapsed, and three
 * previously-visible sibling cards vanished.
 *
 * The fix: PropertyMap wraps the `onAreaVisualClusterCameraIntent` prop it
 * hands to `AreaDestinationMarkerLayer` with `handleAreaVisualClusterCameraIntent`,
 * which arms a ref (`isClusterDrillIntentRef`) synchronously before
 * forwarding the click to the real publisher. MapController's 'overview'
 * branch reads-then-resets that ref: when armed, it computes an explicit
 * target zoom that is always strictly greater than the zoom at click time
 * (capped at the existing ceiling), instead of deferring to
 * fitBounds/flyTo's own maxZoom-capped-but-otherwise-unconstrained fit.
 *
 * This file exercises MapController's camera decision directly (mirrors
 * PropertyMap.cameraScope.test.tsx's / PropertyMap.clusterTapFit.test.tsx's
 * mock scaffolding), simulating the click -> publish -> cameraIntent-prop-
 * update sequence a real AreaDestinationMarkerLayer click produces: calling
 * the CAPTURED wrapped handler (arms the ref, exactly like a real click)
 * followed by a rerender with the new CameraIntent the publisher would have
 * produced (exactly like the resulting React state update).
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
  panTo: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  getZoom: vi.fn(() => 13),
  getBoundsZoom: vi.fn(() => 12),
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
    latLng: vi.fn((lat: number, lng: number) => ({ lat, lng })),
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
  Polygon: () => null,
  Tooltip: () => null,
  useMap: () => mapStub,
}));

vi.mock('@/components/map/DrawControl', () => ({ DrawControl: () => null }));

// Captures the props (specifically the WRAPPED onAreaVisualClusterCameraIntent
// handler) PropertyMap passes down to AreaDestinationMarkerLayer, without
// mounting any of that layer's real Leaflet-marker machinery — irrelevant to
// this file's concern, which is MapController's camera decision, not how a
// click is discovered/dispatched (that is AreaMarkerLayer.destinations.test.tsx's
// job, unaffected by this fix).
let capturedOnAreaVisualClusterCameraIntent:
  | ((bounds: [[number, number], [number, number]] | null, center: [number, number]) => void)
  | undefined;
vi.mock('@/components/map/AreaMarkerLayer', () => ({
  AreaMarkerLayer: () => null,
  AreaDestinationMarkerLayer: (props: {
    onAreaVisualClusterCameraIntent?: (
      bounds: [[number, number], [number, number]] | null,
      center: [number, number],
    ) => void;
  }) => {
    capturedOnAreaVisualClusterCameraIntent = props.onAreaVisualClusterCameraIntent;
    return null;
  },
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
import type { CameraIntent } from '@/hooks/useDiscoverMapData';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

const CITY_CENTER: [number, number] = [13.3409, 74.7421];

function makeAreasNavigationJourney(
  overrides: Partial<UseAreasNavigationJourneyResult> = {},
): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: null,
    levelKind: 'clusters',
    children: [],
    resolutionNotice: null,
    nodeCount: null,
    schoolsNotSimulatedForRevision: false,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  } as UseAreasNavigationJourneyResult;
}

// A wide member-bounds pair — the real-world shape that produces a
// getBoundsZoom below the current zoom (mapStub.getBoundsZoom is stubbed to
// 12 above, mirroring the real "BTM Layout, Bilekahalli +1" case where the
// fit-to-members zoom (12) landed BELOW the click-time zoom (13)).
const CLUSTER_MEMBERS_BOUNDS: [[number, number], [number, number]] = [
  [12.9, 77.55],
  [13.1, 77.7],
];
const CLUSTER_CENTER: [number, number] = [13.0, 77.62];

const baseProps = {
  listings: [],
  cityCenter: CITY_CENTER,
  cityZoom: 11,
  resetMapTick: 0,
  areas: [],
  showAreasNavigationDestinations: true,
  areasNavigationJourney: makeAreasNavigationJourney(),
};

beforeEach(() => {
  mapStub.fitBounds.mockClear();
  mapStub.flyTo.mockClear();
  mapStub.setView.mockClear();
  mapStub.panTo.mockClear();
  mapStub.getZoom.mockReturnValue(13);
  mapStub.getBoundsZoom.mockReturnValue(12);
  capturedOnAreaVisualClusterCameraIntent = undefined;
});

describe('Issue #1943 — cluster-card drill-in must always zoom in, never out', () => {
  it('FALSIFIABLE: a cluster drill-in from zoom 13 whose own member-bounds fit computes zoom 12 still lands STRICTLY ABOVE 13 (not 12) — the forced, containment-not-guaranteed exception, since rawZoom(12) <= currentZoom(13) means no zoom above 13 is a real fit', () => {
    const { rerender } = render(
      <PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );
    expect(capturedOnAreaVisualClusterCameraIntent).toBeDefined();

    // Simulate the real click: the wrapped handler arms the ref synchronously,
    // exactly as AreaDestinationMarkerLayer's real onClick does.
    capturedOnAreaVisualClusterCameraIntent!(CLUSTER_MEMBERS_BOUNDS, CLUSTER_CENTER);

    // Simulate the resulting cameraIntent state update the real
    // publishClusterCameraIntent producer performs synchronously afterwards.
    const intent: CameraIntent = {
      seq: 1,
      bounds: CLUSTER_MEMBERS_BOUNDS,
      center: CLUSTER_CENTER,
      framing: 'overview',
    };
    rerender(
      <PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );

    // The old (pre-fix) code called map.fitBounds(bounds, { maxZoom: 16 })
    // here, which — with getBoundsZoom stubbed to 12 — is exactly the
    // real-browser zoom-13-to-12 regression. This assertion fails against
    // that code (fitBounds is called, setView is not, and even if it were,
    // fitBounds carries no explicit zoom this test can inspect at all).
    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [center, targetZoom] = mapStub.setView.mock.calls[0];
    // Center is the BOUNDS' own centroid (L.latLngBounds(bounds).getCenter()),
    // not the raw `center` argument the click handler also received — same
    // convention MapController's pre-existing 'cluster' framing branch uses.
    expect(center).toEqual({ lat: 13, lng: 77.625 });
    // Issue #1943 (Stage-B fix-cycle — HIGH finding). rawZoom(12) <=
    // currentZoom(13): there is no zoom above 13 at which these members are
    // actually contained, so this is the NAMED forced-progress exception —
    // the camera advances by EXACTLY one level (14), never further. This is
    // NOT a containment guarantee for this specific scenario (see the
    // "still contained" test below for the case where one IS possible); it
    // only proves forward progress never regresses to a zoom-out or no-op.
    expect(targetZoom).toBe(14);
    expect(targetZoom).toBeLessThanOrEqual(16);
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.panTo).not.toHaveBeenCalled();
  });

  it('FORWARD-COMPATIBILITY GUARD (not a regression test for the shipped bug): if zoomSnap ever changed and getBoundsZoom returned a fractional rawZoom between currentZoom and currentZoom+1, the camera lands EXACTLY there, never past it', () => {
    // SCOPE, stated plainly: this input is UNREACHABLE under the current map
    // configuration. MapContainer sets no zoomSnap/zoomDelta, so Leaflet
    // defaults to zoomSnap = 1 and `getBoundsZoom` floors to it — map zoom is
    // INTEGER-only (zoomPolicy.ts:47-48 documents this invariant). With
    // integer inputs the pre-fix and post-fix expressions agree, so this case
    // is NOT the proof of the shipped fix; the `toBe(14)` assertion in the
    // first test is. This guards a future zoomSnap change.
    // Note if that change ever came: `setView` -> `_limitZoom` rounds a
    // fractional target back down, which could silently cost the strict
    // forward-progress property, so this branch would need revisiting rather
    // than merely working.
    //
    // Mechanically: pre-fix `Math.max(currentZoom + 1, rawZoom)` =
    // Math.max(14, 13.4) = 14, one full level past what the members' padded
    // bounds fit. The fix lands at 13.4 — still > currentZoom, so forward
    // progress holds — rather than rounding up past the containment ceiling.
    mapStub.getZoom.mockReturnValue(13);
    mapStub.getBoundsZoom.mockReturnValue(13.4);
    const { rerender } = render(
      <PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );
    capturedOnAreaVisualClusterCameraIntent!(CLUSTER_MEMBERS_BOUNDS, CLUSTER_CENTER);
    const intent: CameraIntent = {
      seq: 1,
      bounds: CLUSTER_MEMBERS_BOUNDS,
      center: CLUSTER_CENTER,
      framing: 'overview',
    };
    rerender(
      <PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [, targetZoom] = mapStub.setView.mock.calls[0];
    expect(targetZoom).toBe(13.4);
    expect(targetZoom).toBeGreaterThan(13);
  });

  it('a second click whose fit-to-members zoom is exactly the current zoom (Udupi 2-member residual cluster: pan-only, no split) still advances by at least one level', () => {
    mapStub.getZoom.mockReturnValue(12);
    mapStub.getBoundsZoom.mockReturnValue(12); // near-coincident members: raw fit == current zoom
    const { rerender } = render(
      <PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );
    capturedOnAreaVisualClusterCameraIntent!(CLUSTER_MEMBERS_BOUNDS, CLUSTER_CENTER);
    const intent: CameraIntent = {
      seq: 1,
      bounds: CLUSTER_MEMBERS_BOUNDS,
      center: CLUSTER_CENTER,
      framing: 'overview',
    };
    rerender(
      <PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );

    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [, targetZoom] = mapStub.setView.mock.calls[0];
    expect(targetZoom).toBeGreaterThan(12);
  });

  it('at the LEAF_FIT_MAX_ZOOM ceiling (already 16): an explicit no-op recenter, not a silent fall-through that could zoom out', () => {
    mapStub.getZoom.mockReturnValue(16);
    const { rerender } = render(
      <PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );
    capturedOnAreaVisualClusterCameraIntent!(CLUSTER_MEMBERS_BOUNDS, CLUSTER_CENTER);
    const intent: CameraIntent = {
      seq: 1,
      bounds: CLUSTER_MEMBERS_BOUNDS,
      center: CLUSTER_CENTER,
      framing: 'overview',
    };
    rerender(
      <PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );

    expect(mapStub.panTo).toHaveBeenCalledTimes(1);
    expect(mapStub.panTo).toHaveBeenCalledWith({ lat: 13, lng: 77.625 });
    expect(mapStub.setView).not.toHaveBeenCalled();
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
  });

  it('REGRESSION GUARD: a non-cluster overview intent (macro-region pin) at the SAME clusters level is completely unaffected — unmodified fitBounds(maxZoom) behaviour, even though the fit zoom (12) is below the current zoom (13)', () => {
    const { rerender } = render(
      <PropertyMap {...baseProps} cameraIntent={null} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );
    // Deliberately do NOT invoke capturedOnAreaVisualClusterCameraIntent —
    // this intent originates from a different producer (e.g. the
    // macro-region pin / legacy area-group chip), so the drill-in ref is
    // never armed.
    const intent: CameraIntent = {
      seq: 1,
      bounds: CLUSTER_MEMBERS_BOUNDS,
      center: CLUSTER_CENTER,
      framing: 'overview',
    };
    rerender(
      <PropertyMap {...baseProps} cameraIntent={intent} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds).toHaveBeenCalledWith(CLUSTER_MEMBERS_BOUNDS, { padding: [40, 40], maxZoom: 16 });
    expect(mapStub.setView).not.toHaveBeenCalled();
    expect(mapStub.panTo).not.toHaveBeenCalled();
  });
});

describe("Issue #1943 (owner repro, 2026-08-28) — a multi-group 'Zoom in' AREA marker's drill-in click must also always zoom in, never pan-only", () => {
  // Real-browser repro: a genuine multi-group AREA-level visual-cluster card
  // ("Budigere Cross, Katamnallur +1") at zoom 14 produced NO visible change
  // on a single click — only Leaflet's native double-click-zoom (a completely
  // separate code path) revealed the members. Root cause: `isDestinationClusterLevel`
  // (PropertyMap.tsx) only recognised `levelKind === 'clusters' | 'directions'`,
  // so at `levelKind === 'areas'` `overviewMaxZoom` stayed clamped to the legacy
  // AREA_LAYER_MAX_ZOOM (12) instead of widening to LEAF_FIT_MAX_ZOOM (16) —
  // and because AREA-level browsing routinely sits at or above zoom 12 already,
  // the "already at the ceiling" branch fired on the very first click, so the
  // camera could only ever pan, never zoom in. These tests mirror the
  // 'clusters'-level tests above exactly, with `levelKind: 'areas'` — they FAIL
  // against the pre-fix code (setView is never called; only panTo fires).
  it("a drill-in click on an 'areas'-level multi-group card zooms in strictly past the click-time zoom, mirroring the 'clusters'-level behaviour above", () => {
    const areasBaseProps = {
      ...baseProps,
      areasNavigationJourney: makeAreasNavigationJourney({ levelKind: 'areas' }),
    };
    const { rerender } = render(
      <PropertyMap {...areasBaseProps} cameraIntent={null} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );
    expect(capturedOnAreaVisualClusterCameraIntent).toBeDefined();

    capturedOnAreaVisualClusterCameraIntent!(CLUSTER_MEMBERS_BOUNDS, CLUSTER_CENTER);
    const intent: CameraIntent = {
      seq: 1,
      bounds: CLUSTER_MEMBERS_BOUNDS,
      center: CLUSTER_CENTER,
      framing: 'overview',
    };
    rerender(
      <PropertyMap {...areasBaseProps} cameraIntent={intent} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );

    // Pre-fix: overviewMaxZoom stayed AREA_LAYER_MAX_ZOOM (12), currentZoom
    // (13) >= 12 hit the "already at the ceiling" branch, and ONLY panTo
    // fired — no zoom change at all, reproducing the exact bug report.
    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [, targetZoom] = mapStub.setView.mock.calls[0];
    expect(targetZoom).toBeGreaterThan(13);
    expect(mapStub.panTo).not.toHaveBeenCalled();
  });

  it("reproduces the exact owner repro geometry: currentZoom 14 (already past legacy AREA_LAYER_MAX_ZOOM=12) still advances on a single 'areas'-level drill-in click, never a pan-only no-op", () => {
    mapStub.getZoom.mockReturnValue(14);
    mapStub.getBoundsZoom.mockReturnValue(16);
    const areasBaseProps = {
      ...baseProps,
      areasNavigationJourney: makeAreasNavigationJourney({ levelKind: 'areas' }),
    };
    const { rerender } = render(
      <PropertyMap {...areasBaseProps} cameraIntent={null} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );
    capturedOnAreaVisualClusterCameraIntent!(CLUSTER_MEMBERS_BOUNDS, CLUSTER_CENTER);
    const intent: CameraIntent = {
      seq: 1,
      bounds: CLUSTER_MEMBERS_BOUNDS,
      center: CLUSTER_CENTER,
      framing: 'overview',
    };
    rerender(
      <PropertyMap {...areasBaseProps} cameraIntent={intent} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );

    expect(mapStub.panTo).not.toHaveBeenCalled();
    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    const [, targetZoom] = mapStub.setView.mock.calls[0];
    expect(targetZoom).toBeGreaterThan(14);
    expect(targetZoom).toBeLessThanOrEqual(16);
  });

  it("REGRESSION GUARD: the 'listings'/'empty' levels (never a destination-cluster-card producer) remain unaffected — unmodified AREA_LAYER_MAX_ZOOM ceiling", () => {
    mapStub.getZoom.mockReturnValue(13);
    const listingsBaseProps = {
      ...baseProps,
      areasNavigationJourney: makeAreasNavigationJourney({ levelKind: 'listings' }),
    };
    const { rerender } = render(
      <PropertyMap {...listingsBaseProps} cameraIntent={null} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );
    // No real 'listings'-level producer ever arms this ref in production,
    // but proving the ceiling itself stayed narrow for this level (unlike
    // 'areas' above) is the point of this guard.
    const intent: CameraIntent = {
      seq: 1,
      bounds: CLUSTER_MEMBERS_BOUNDS,
      center: CLUSTER_CENTER,
      framing: 'overview',
    };
    rerender(
      <PropertyMap {...listingsBaseProps} cameraIntent={intent} focusBounds={null} onAreaVisualClusterCameraIntent={vi.fn()} />,
    );

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapStub.fitBounds).toHaveBeenCalledWith(CLUSTER_MEMBERS_BOUNDS, { padding: [40, 40], maxZoom: 12 });
  });
});
