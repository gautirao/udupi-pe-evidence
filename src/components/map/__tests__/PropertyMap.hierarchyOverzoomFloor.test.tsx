/**
 * Issue #1943 (Stage-B, LAST DEFECT — over-zoom past the node's own
 * containment floor).
 *
 * Root cause (established by a completed read-only investigation against
 * live backend data, reproducing measured browser pixel positions at four
 * independent real Bangalore nodes): `narrowToLegibleZoomWindow` raises the
 * resolver's candidate `minZoom` above `derivedMinZoom` (the node's own
 * fitBounds-equivalent containment floor) whenever the destinations need to
 * spread out to stay legible, but its own `largestContainableZoom` safety
 * net — meant to pull that floor back down whenever nothing in the raised
 * window is actually clip-free — returns null on every real node measured,
 * because it checks containment with an over-estimated card footprint under
 * centre-pinned placement on the anchors' arithmetic mean. Before this fix,
 * the null branch returned the legibility pass's raised floor UNCHANGED
 * instead of honouring its own comment's stated intent to widen back down.
 * With the raised floor reaching `resolveHierarchyCameraFit` unclamped,
 * EVERY candidate in `[zBase, zBase+3]` clips (the `1_000_000*clipped` term
 * saturates and cancels out of the score comparison), leaving `10_000*pairs`
 * free to reward zooming in even further on an already-unsalvageable frame.
 *
 * Fixture: a real outlier from Bangalore's `d:n` Direction — Mukkidipeta
 * (13.826627, 77.490273) — is ~66km from four tightly-packed siblings,
 * stretching the node's own bbox to a ~0.6deg lat span (this is the actual
 * geometry the investigation traced the largest measured error, 11,296px,
 * to; a fixture that drops the outlier does not exercise the defect). The
 * four siblings are spread just far enough apart that
 * `narrowToLegibleZoomWindow`'s OWN legibility pass (median-cluster-count
 * search) needs to raise the floor from 10 to 13 to keep them individually
 * selectable — while Mukkidipeta's real distance means no candidate in that
 * raised window keeps every card on screen, so `largestContainableZoom`
 * returns null. The projection stub below is linear in lat/lon, not real
 * Mercator — it preserves relative ordering/spacing (which is all the
 * resolver's containment/overlap math needs) but not real-world distances,
 * so the "66km"/"0.6deg" figures describe the real Mukkidipeta geometry the
 * fixture borrows, not what this stub renders it as.
 *
 * The fix (PropertyMap.tsx, `narrowToLegibleZoomWindow`'s null branch): when
 * `largestContainableZoom` finds nothing containable in range, widen back to
 * the caller's own `minZoom` (the node's `derivedMinZoom` floor) instead of
 * returning the legibility-raised window unchanged. `hierarchyCameraFit.ts`
 * and `destinationCardFootprint.ts` are untouched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

// ─── Hoisted stubs ─────────────────────────────────────────────
const mapStub = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
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
  invalidateSize: vi.fn(),
  setView: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 13.3409, lng: 74.7421 })),
  remove: vi.fn(),
  // Issue #1943 Slice B — the SAME deterministic linear projection this
  // slice's other camera-fit tests use (PropertyMap.areaPanner.test.tsx):
  // only the RELATIVE placement/spacing of anchors at a given zoom matters
  // to the resolver's containment/overlap math, not real Mercator accuracy.
  project: vi.fn((latlng: [number, number], zoom: number) => {
    const scale = 2 ** zoom;
    return { x: (latlng[1] + 180) * scale, y: (90 - latlng[0]) * scale };
  }),
  getSize: vi.fn(() => ({ x: 1366, y: 768 })),
  // The node's own fitBounds-equivalent containment floor (`derivedMinZoom`
  // in PropertyMap.tsx). Hard-coded at 10 for this fixture, exactly as every
  // other test in this slice hard-codes it — only its downstream effect is
  // under test, not `map.getBoundsZoom`'s own real geometry.
  getBoundsZoom: vi.fn(() => 10),
}));

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ on: vi.fn().mockReturnThis() })),
    markerClusterGroup: vi.fn(() => ({ addLayer: vi.fn(), on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis() })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
    latLngBounds: vi.fn((latlngs: [number, number][]) => {
      if (!latlngs || latlngs.length === 0) {
        return { isValid: () => false, getNorth: () => 0, getSouth: () => 0, getEast: () => 0, getWest: () => 0 };
      }
      const lats = latlngs.map((p) => p[0]);
      const lons = latlngs.map((p) => p[1]);
      return {
        isValid: () => true,
        getNorth: () => Math.max(...lats),
        getSouth: () => Math.min(...lats),
        getEast: () => Math.max(...lons),
        getWest: () => Math.min(...lons),
      };
    }),
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
}));
vi.mock('@/dev/ScaleHud', () => ({ ScaleHud: () => null }));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Imports after mocks ───────────────────────────────────────
import { PropertyMap, narrowToLegibleZoomWindow } from '@/components/map/PropertyMap';
// The resolver, used to independently compute the expected post-fix camera
// with the exact same inputs production feeds it, rather than re-deriving
// PropertyMap's internal math by hand.
import { resolveHierarchyCameraFit } from '@/features/discover/navigation/hierarchyCameraFit';
import { LEAF_FIT_MAX_ZOOM } from '@/shared/map/zoomPolicy';

const baseProps = {
  listings: [],
  cityCenter: [13.3409, 74.7421] as [number, number],
  cityZoom: 11,
  resetMapTick: 0,
  areas: [],
};

type HierarchyAreaPoint = AreaPoint & {
  seq?: number;
  reason?: 'group' | 'scope' | 'canonicalNode';
  consumedSeqRef?: { current: number };
  hierarchyChildAnchors?: Array<{
    lat: number | null | undefined;
    lon: number | null | undefined;
    footprintWidthPx: number;
    footprintHeightPx: number;
  }> | null;
};

const renderWithPan = (panToArea: HierarchyAreaPoint | null) =>
  render(<PropertyMap {...baseProps} panToArea={panToArea} />);

const projectAtZoom = (lat: number, lon: number, zoom: number) => {
  const scale = 2 ** zoom;
  return { x: (lon + 180) * scale, y: (90 - lat) * scale };
};

// Four tightly-packed siblings (real "d:n" scale destinations) — spread just
// far enough (~0.01-0.08deg) that clusterAreaMembers needs zoom>=13 to split
// them into the 3+ individually-selectable cards `narrowToLegibleZoomWindow`
// requires for this 5-destination node — plus Mukkidipeta, the real
// mis-geocoded outlier (~66km / 0.6deg away) that produced the investigation's
// largest measured error.
const dNAnchors = [
  { lat: 13.23, lon: 77.55, footprintWidthPx: 300, footprintHeightPx: 220 },
  { lat: 13.235, lon: 77.63, footprintWidthPx: 300, footprintHeightPx: 220 },
  { lat: 13.24, lon: 77.57, footprintWidthPx: 300, footprintHeightPx: 220 },
  { lat: 13.225, lon: 77.61, footprintWidthPx: 300, footprintHeightPx: 220 },
  { lat: 13.826627, lon: 77.490273, footprintWidthPx: 300, footprintHeightPx: 220 },
];

const dNBbox: [[number, number], [number, number]] = [
  [13.225, 77.490273],
  [13.826627, 77.63],
];

const derivedMinZoom = 10; // must match mapStub.getBoundsZoom's mocked return

const viewport = {
  widthPx: 1366,
  heightPx: 768,
  insetTopPx: 40,
  insetRightPx: 120,
  insetBottomPx: 40,
  insetLeftPx: 120,
};
const containmentBounds = {
  south: dNBbox[0][0],
  west: dNBbox[0][1],
  north: dNBbox[1][0],
  east: dNBbox[1][1],
};

describe('Issue #1943 (Stage-B, LAST DEFECT) — narrowToLegibleZoomWindow widens back to derivedMinZoom when nothing is containable', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
    mapStub.setView.mockClear();
    mapStub.project.mockClear();
    mapStub.getBoundsZoom.mockClear();
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  });

  const canonicalPayload: HierarchyAreaPoint = {
    areaKey: 'd:n',
    areaLabel: 'd:n',
    geo_center_lat: 13.35,
    geo_center_lon: 77.57,
    bbox: dNBbox,
    seq: 1,
    reason: 'canonicalNode',
    consumedSeqRef: { current: 0 },
    hierarchyChildAnchors: dNAnchors,
  };

  // PREMISE — calls the real, exported narrowToLegibleZoomWindow directly
  // (not hard-coded resolver inputs) to prove this fixture genuinely
  // exercises the raised-floor/null-safety-net mechanism the fix targets.
  // If a future change makes the legibility pass stop raising the floor for
  // these anchors, or makes largestContainableZoom start finding a
  // containable zoom, THIS assertion fails — not just the regression pin
  // below — so the fixture can't silently stop testing the defect.
  it('premise: legibility raises the floor to 13, and with the viewport supplied the null safety net widens it back to derivedMinZoom', () => {
    const legibilityOnly = narrowToLegibleZoomWindow(
      dNAnchors,
      projectAtZoom,
      derivedMinZoom,
      LEAF_FIT_MAX_ZOOM,
    );
    expect(legibilityOnly).toEqual({ minZoom: 13, maxZoom: LEAF_FIT_MAX_ZOOM });

    const withContainmentCheck = narrowToLegibleZoomWindow(
      dNAnchors,
      projectAtZoom,
      derivedMinZoom,
      LEAF_FIT_MAX_ZOOM,
      viewport,
    );
    // Post-fix: widened back to derivedMinZoom, not left at the raised 13.
    expect(withContainmentCheck).toEqual({ minZoom: derivedMinZoom, maxZoom: LEAF_FIT_MAX_ZOOM });
  });

  // REGRESSION PIN — updated for issue #2312. It does not pin cycle 1's
  // floor widening; the premise test above does that, and only that test
  // fails if the floor widening is reverted.
  //
  // Issue #1943 (Slice B, reroute cycle 2, Option 2) discarded any `chosen`
  // candidate that still clipped and fell back to fitBounds instead, because
  // the pre-#2312 score weighted clipping only by COUNT: even at the
  // corrected [derivedMinZoom, LEAF_FIT_MAX_ZOOM] window, Mukkidipeta's real
  // ~66km outlier distance means NO candidate in range is actually
  // clip-free, and the `1_000_000*clipped` term alone saturated and
  // cancelled out of every comparison once every candidate clipped.
  //
  // Issue #2312 added `clipOverflowPx` (a magnitude-aware overflow term) to
  // the score, so `chosen` is now genuinely ranked even in this
  // every-candidate-clips regime — proven below directly against the real
  // resolveHierarchyCameraFit, not asserted from reasoning. PropertyMap now
  // commits that ranked camera via setView instead of re-discarding it for
  // the coarser fitBounds(dNBbox) fallback.
  it('canonicalNode fit commits the resolver camera (magnitude-ranked, per #2312) even though its chosen candidate still clips', () => {
    const expectedFixed = resolveHierarchyCameraFit({
      anchors: dNAnchors,
      containmentBounds,
      viewport,
      project: projectAtZoom,
      minZoom: derivedMinZoom,
      maxZoom: LEAF_FIT_MAX_ZOOM,
    });
    expect(expectedFixed).not.toBeNull();
    // Premise: this real, calibrated fixture's resolved candidate genuinely
    // clips — this is not a synthetic always-clipping fixture invented for
    // the test, it is the exact real-Bangalore geometry that motivated
    // Option 2 (and now #2312's fix to it) in the first place.
    expect(expectedFixed?.chosen.clipped).toBeGreaterThan(0);

    renderWithPan(canonicalPayload);

    // The magnitude-ranked resolver camera is committed via setView; the
    // coarser fitBounds fallback never fires.
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
    expect(mapStub.setView).toHaveBeenCalledTimes(1);
    expect(mapStub.setView).toHaveBeenCalledWith(
      expectedFixed?.centre,
      expectedFixed?.zoom,
      expect.objectContaining({ animate: false }),
    );
  });
});
