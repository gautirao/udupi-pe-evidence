/**
 * Unit tests for AreaMarkerLayer's macro-region (city-landing) marker
 * placement — the compass-circle layout from regionCompassLayout.ts wired
 * into the legacy marker-creation loop.
 *
 * Strategy: mock `leaflet` and `react-leaflet` with a map stub whose
 * `containerPointToLatLng` is the exact inverse of a linear
 * `latLngToContainerPoint`-style projection, then assert on the lat/lng
 * `L.marker` is actually constructed with for each `isMacroRegion` area —
 * converting back through the same inverse recovers the container point the
 * compass layout computed, which is what the placement spec requires.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type CapturedMarker = {
  handlers: Record<string, (...args: unknown[]) => void>;
  addTo: ReturnType<typeof vi.fn>;
  getElement: ReturnType<typeof vi.fn>;
};
const capturedMarkers: CapturedMarker[] = [];
const markerLatLngCalls: [number, number][] = [];

// Container size used by the map stub below — must match MAP_SIZE in the test body.
const MAP_SIZE = { x: 1200, y: 800 };

// Linear stand-in for Leaflet's real lat/lng <-> container-point projection,
// with an exact inverse (containerPointToLatLng) so a marker's constructed
// lat/lng can be projected back to the container point the compass layout
// intended and compared directly against expected {x,y}.
const LAT0 = 13.34;
const LON0 = 74.74;
const SCALE = 10000; // degrees-per-pixel scale factor, arbitrary but exact-invertible

function containerPointToLatLng([x, y]: [number, number]): { lat: number; lng: number } {
  return { lat: LAT0 - y / SCALE, lng: LON0 + x / SCALE };
}

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn((opts: { html: string }) => ({ options: opts })),
    marker: vi.fn((latlng: [number, number]) => {
      markerLatLngCalls.push(latlng);
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const el = document.createElement('div');
      el.innerHTML = '<div class="dp-region" tabindex="0"></div>';
      const instance: Record<string, unknown> = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers[event] = cb;
          return instance;
        }),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        setIcon: vi.fn(),
        getElement: vi.fn(() => el),
      };
      capturedMarkers.push({
        handlers,
        addTo: instance.addTo as ReturnType<typeof vi.fn>,
        getElement: instance.getElement as ReturnType<typeof vi.fn>,
      });
      return instance;
    }),
  },
}));

const mapStub = {
  getSize: vi.fn(() => MAP_SIZE),
  getZoom: vi.fn(() => 11),
  containerPointToLatLng: vi.fn(([x, y]: [number, number]) => containerPointToLatLng([x, y])),
  getContainer: vi.fn(() => document.createElement('div')),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => mapStub),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

import React from 'react';
import { render } from '@testing-library/react';
import { AreaMarkerLayer } from '../AreaMarkerLayer';
import type { AreaPoint } from '../AreaMarkerLayer';
import { computeCompassLayout, compassPointFor } from '@/lib/map/regionCompassLayout';

function makeRegion(regionKey: string, overrides: Partial<AreaPoint> = {}): AreaPoint {
  return {
    areaKey: regionKey,
    areaLabel: `${regionKey} Bangalore`,
    // Deliberately irregular real-world aggregated centroids (never used for
    // the on-screen placement of a macro-region marker) — proves the layout
    // ignores these entirely.
    geo_center_lat: 13.3 + Math.random() * 0.1,
    geo_center_lon: 74.7 + Math.random() * 0.1,
    bbox: null,
    listingCount: 10,
    isMacroRegion: true,
    isSelected: false,
    ...overrides,
  };
}

const NINE_REGIONS: AreaPoint[] = [
  makeRegion('CENTRAL'),
  makeRegion('N'),
  makeRegion('NE'),
  makeRegion('E'),
  makeRegion('SE'),
  makeRegion('S'),
  makeRegion('SW'),
  makeRegion('W'),
  makeRegion('NW'),
];

function containerPointFromMarkerCall(latlng: [number, number]): { x: number; y: number } {
  // Inverse of containerPointToLatLng — recovers the container point a
  // marker's constructed lat/lng corresponds to, so it can be compared
  // against the layout's intended {x,y}.
  const [lat, lng] = latlng;
  return { x: (lng - LON0) * SCALE, y: (LAT0 - lat) * SCALE };
}

beforeEach(() => {
  capturedMarkers.length = 0;
  markerLatLngCalls.length = 0;
  vi.clearAllMocks();
});

describe('AreaMarkerLayer — macro-region compass placement (city landing)', () => {
  it('places CENTRAL exactly at the layout centre', () => {
    render(<AreaMarkerLayer areas={NINE_REGIONS} />);
    const expectedLayout = computeCompassLayout(MAP_SIZE.x, MAP_SIZE.y);

    const centralIdx = NINE_REGIONS.findIndex((a) => a.areaKey === 'CENTRAL');
    const point = containerPointFromMarkerCall(markerLatLngCalls[centralIdx]);
    expect(point.x).toBeCloseTo(expectedLayout.centerX, 6);
    expect(point.y).toBeCloseTo(expectedLayout.centerY, 6);
  });

  it('places all 8 outer markers at the same projected distance from CENTRAL', () => {
    render(<AreaMarkerLayer areas={NINE_REGIONS} />);
    const layout = computeCompassLayout(MAP_SIZE.x, MAP_SIZE.y);
    const centralPoint = { x: layout.centerX, y: layout.centerY };

    const outer = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (const key of outer) {
      const idx = NINE_REGIONS.findIndex((a) => a.areaKey === key);
      const point = containerPointFromMarkerCall(markerLatLngCalls[idx]);
      const dist = Math.hypot(point.x - centralPoint.x, point.y - centralPoint.y);
      expect(dist).toBeCloseTo(layout.radius, 6);
    }
  });

  it('North renders vertically above Central; South vertically below', () => {
    render(<AreaMarkerLayer areas={NINE_REGIONS} />);
    const centralPoint = containerPointFromMarkerCall(
      markerLatLngCalls[NINE_REGIONS.findIndex((a) => a.areaKey === 'CENTRAL')],
    );
    const northPoint = containerPointFromMarkerCall(
      markerLatLngCalls[NINE_REGIONS.findIndex((a) => a.areaKey === 'N')],
    );
    const southPoint = containerPointFromMarkerCall(
      markerLatLngCalls[NINE_REGIONS.findIndex((a) => a.areaKey === 'S')],
    );
    expect(northPoint.x).toBeCloseTo(centralPoint.x, 6);
    expect(northPoint.y).toBeLessThan(centralPoint.y);
    expect(southPoint.x).toBeCloseTo(centralPoint.x, 6);
    expect(southPoint.y).toBeGreaterThan(centralPoint.y);
  });

  it('East and West render horizontally aligned with Central', () => {
    render(<AreaMarkerLayer areas={NINE_REGIONS} />);
    const centralPoint = containerPointFromMarkerCall(
      markerLatLngCalls[NINE_REGIONS.findIndex((a) => a.areaKey === 'CENTRAL')],
    );
    const eastPoint = containerPointFromMarkerCall(
      markerLatLngCalls[NINE_REGIONS.findIndex((a) => a.areaKey === 'E')],
    );
    const westPoint = containerPointFromMarkerCall(
      markerLatLngCalls[NINE_REGIONS.findIndex((a) => a.areaKey === 'W')],
    );
    expect(eastPoint.y).toBeCloseTo(centralPoint.y, 6);
    expect(westPoint.y).toBeCloseTo(centralPoint.y, 6);
    expect(eastPoint.x).toBeGreaterThan(centralPoint.x);
    expect(westPoint.x).toBeLessThan(centralPoint.x);
  });

  it('diagonal directions render in the correct screen quadrant relative to Central', () => {
    render(<AreaMarkerLayer areas={NINE_REGIONS} />);
    const centralPoint = containerPointFromMarkerCall(
      markerLatLngCalls[NINE_REGIONS.findIndex((a) => a.areaKey === 'CENTRAL')],
    );
    const at = (key: string) =>
      containerPointFromMarkerCall(markerLatLngCalls[NINE_REGIONS.findIndex((a) => a.areaKey === key)]);

    const ne = at('NE');
    expect(ne.x).toBeGreaterThan(centralPoint.x);
    expect(ne.y).toBeLessThan(centralPoint.y);

    const se = at('SE');
    expect(se.x).toBeGreaterThan(centralPoint.x);
    expect(se.y).toBeGreaterThan(centralPoint.y);

    const sw = at('SW');
    expect(sw.x).toBeLessThan(centralPoint.x);
    expect(sw.y).toBeGreaterThan(centralPoint.y);

    const nw = at('NW');
    expect(nw.x).toBeLessThan(centralPoint.x);
    expect(nw.y).toBeLessThan(centralPoint.y);
  });

  it('array ordering of the input regions does not affect any marker placement', () => {
    render(<AreaMarkerLayer areas={NINE_REGIONS} />);
    const forwardPoints = new Map(
      NINE_REGIONS.map((a, i) => [a.areaKey, containerPointFromMarkerCall(markerLatLngCalls[i])]),
    );

    capturedMarkers.length = 0;
    markerLatLngCalls.length = 0;
    const shuffled = [...NINE_REGIONS].reverse();
    render(<AreaMarkerLayer areas={shuffled} />);
    const reversedPoints = new Map(
      shuffled.map((a, i) => [a.areaKey, containerPointFromMarkerCall(markerLatLngCalls[i])]),
    );

    for (const key of NINE_REGIONS.map((a) => a.areaKey)) {
      const a = forwardPoints.get(key)!;
      const b = reversedPoints.get(key)!;
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
  });

  it('clicking a region marker still fires onAreaClick/onAreaCameraIntent with the REAL area object (true geo_center_lat/lon), never the synthetic compass position', () => {
    const onAreaClick = vi.fn();
    const onAreaCameraIntent = vi.fn();
    const central = NINE_REGIONS.find((a) => a.areaKey === 'CENTRAL')!;
    render(
      <AreaMarkerLayer areas={NINE_REGIONS} onAreaClick={onAreaClick} onAreaCameraIntent={onAreaCameraIntent} />,
    );

    const centralIdx = NINE_REGIONS.findIndex((a) => a.areaKey === 'CENTRAL');
    capturedMarkers[centralIdx].handlers.click?.();

    expect(onAreaClick).toHaveBeenCalledWith(central);
    expect(onAreaCameraIntent).toHaveBeenCalledWith(central);
    // The exact same object reference — proves the callback never receives a
    // synthetic/compass-derived stand-in, only the real AreaPoint (its real
    // geo_center_lat/lon and bbox are what MapController uses to fit bounds).
    expect(onAreaClick.mock.calls[0][0]).toBe(central);
  });

  it("computeCompassLayout/compassPointFor stay the single source of truth the component's positions are checked against (drift guard)", () => {
    render(<AreaMarkerLayer areas={NINE_REGIONS} />);
    const layout = computeCompassLayout(MAP_SIZE.x, MAP_SIZE.y);
    const seIdx = NINE_REGIONS.findIndex((a) => a.areaKey === 'SE');
    const expected = compassPointFor('SE', layout);
    const actual = containerPointFromMarkerCall(markerLatLngCalls[seIdx]);
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
  });
});

// Issue #1956 macro-region sibling ruling (2026-08-03) — the same
// full-word/abbreviation input-contract defect the AC6.9 fix closed for the
// canonical Direction markers exists at THIS component's other
// `compassPointFor` caller: the `isMacroRegion` city-landing bubble path
// exercised above, keyed on the backend's bare `region_key`
// (`area.areaKey`), which is dormant today (empty `city_regions`, #1899) but
// activates automatically once real data arrives. These tests drive the
// ACTUAL second caller (via `<AreaMarkerLayer>` render), not `compassPointFor`
// in isolation — the caller was the gap, so a pure-function-only test would
// not have caught the original bug and would not catch a regression here.
describe('AreaMarkerLayer — macro-region compass placement: full-word region_key normalisation (#1956)', () => {
  it('full-word region keys map to their INTENDED compass position — same point as their abbreviation, through the actual isMacroRegion render path', () => {
    const fullWordRegions: AreaPoint[] = [
      makeRegion('central'),
      makeRegion('north'),
      makeRegion('northeast'),
      makeRegion('east'),
      makeRegion('southeast'),
      makeRegion('south'),
      makeRegion('southwest'),
      makeRegion('west'),
      makeRegion('northwest'),
    ];
    render(<AreaMarkerLayer areas={fullWordRegions} />);
    const layout = computeCompassLayout(MAP_SIZE.x, MAP_SIZE.y);

    const expectedByFullWord: Record<string, string> = {
      central: 'CENTRAL',
      north: 'N',
      northeast: 'NE',
      east: 'E',
      southeast: 'SE',
      south: 'S',
      southwest: 'SW',
      west: 'W',
      northwest: 'NW',
    };

    for (const [fullWord, abbrev] of Object.entries(expectedByFullWord)) {
      const idx = fullWordRegions.findIndex((a) => a.areaKey === fullWord);
      const actual = containerPointFromMarkerCall(markerLatLngCalls[idx]);
      const expected = compassPointFor(abbrev, layout);
      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
    }
  });

  it('abbreviated and full-word region keys for the SAME direction land at the SAME point through the actual render path (not merely distinct positions)', () => {
    const mixed: AreaPoint[] = [makeRegion('SE'), makeRegion('southeast')];
    render(<AreaMarkerLayer areas={mixed} />);

    const abbrevIdx = mixed.findIndex((a) => a.areaKey === 'SE');
    const fullWordIdx = mixed.findIndex((a) => a.areaKey === 'southeast');
    const abbrevPoint = containerPointFromMarkerCall(markerLatLngCalls[abbrevIdx]);
    const fullWordPoint = containerPointFromMarkerCall(markerLatLngCalls[fullWordIdx]);

    expect(fullWordPoint.x).toBeCloseTo(abbrevPoint.x, 6);
    expect(fullWordPoint.y).toBeCloseTo(abbrevPoint.y, 6);
  });

  it('an unsupported region_key takes the explicit safe diagnostic/fallback path (dev warning + deterministic off-centre point), never the silent centre collapse', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unknownRegions: AreaPoint[] = [
      makeRegion('totally-unknown-region-a'),
      makeRegion('totally-unknown-region-b'),
    ];
    render(<AreaMarkerLayer areas={unknownRegions} />);
    const layout = computeCompassLayout(MAP_SIZE.x, MAP_SIZE.y);
    const centralPoint = { x: layout.centerX, y: layout.centerY };

    const idxA = unknownRegions.findIndex((a) => a.areaKey === 'totally-unknown-region-a');
    const idxB = unknownRegions.findIndex((a) => a.areaKey === 'totally-unknown-region-b');
    const pointA = containerPointFromMarkerCall(markerLatLngCalls[idxA]);
    const pointB = containerPointFromMarkerCall(markerLatLngCalls[idxB]);

    // Neither unknown code silently collapses onto the layout centre...
    expect(Math.hypot(pointA.x - centralPoint.x, pointA.y - centralPoint.y)).not.toBeCloseTo(0, 3);
    expect(Math.hypot(pointB.x - centralPoint.x, pointB.y - centralPoint.y)).not.toBeCloseTo(0, 3);
    // ...and two DIFFERENT unknown codes fan out to different points instead
    // of stacking into one shared invisible marker.
    expect(pointA.x === pointB.x && pointA.y === pointB.y).toBe(false);
    // The dev diagnostic fired for the unrecognised codes (explicit failure
    // path, not a silently-plausible misplaced control).
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
