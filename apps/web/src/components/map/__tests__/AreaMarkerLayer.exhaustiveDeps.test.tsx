/**
 * Issue #2005 (Slice 2 PR6) — Category C (tests-only) regression for
 * AreaMarkerLayer.tsx:659's bucketing useMemo.
 *
 * Site comment (verbatim, unchanged production code):
 *   "map is stable per PropertyMap instance; zoomTick is the deliberate
 *    zoom-only recompute trigger. Pan is intentionally NOT a dependency."
 *   deps: [enableDegradation, areas, focusedGroupAreas, zoomTick,
 *          selectedAreaKey, searchMatchKeys, hoveredAreaKey]
 *
 * This file makes ZERO production edits to AreaMarkerLayer.tsx — it only
 * imports it. Uses the NEW shared createMapStub() factory (not the existing
 * file-local mapStub in AreaMarkerLayer.test.tsx, which this PR does not
 * touch — see [mapstub_reuse] in the approved plan).
 *
 * Signal used to detect a bucketing recompute: `map.getSize()` is called
 * exactly once per bucketing useMemo evaluation (inside the memo body, to
 * build the pixel-projection viewport). Counting calls to that spy across
 * renders is a direct, production-code-agnostic proxy for "did the memo
 * recompute" — no need to reach into React internals.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { createMapStub, type MapStub } from './helpers/leafletMapStub';

type DivIconOpts = { html: string; className?: string; iconSize?: unknown; iconAnchor?: unknown };

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn((opts: DivIconOpts) => ({ options: opts })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
    latLngBounds: vi.fn((expr: [number, number][]) => {
      const lats = expr.map((p) => p[0]);
      const lons = expr.map((p) => p[1]);
      return {
        getSouthWest: () => ({ lat: Math.min(...lats), lng: Math.min(...lons) }),
        getNorthEast: () => ({ lat: Math.max(...lats), lng: Math.max(...lons) }),
        getCenter: () => ({ lat: 13.35, lng: 74.75 }),
      };
    }),
    marker: vi.fn(() => {
      const instance: Record<string, unknown> = {
        on: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        setIcon: vi.fn(),
        getElement: vi.fn(() => document.createElement('div')),
      };
      return instance;
    }),
  },
}));

const mapStub = vi.hoisted(() => ({ current: null as MapStub | null }));

vi.mock('react-leaflet', () => ({
  useMap: () => mapStub.current,
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

import { AreaMarkerLayer } from '../AreaMarkerLayer';
import type { AreaPoint } from '../AreaMarkerLayer';

function makeArea(areaKey: string, lat: number, lon: number): AreaPoint {
  return {
    areaKey,
    areaLabel: areaKey,
    geo_center_lat: lat,
    geo_center_lon: lon,
    bbox: null,
    listingCount: 5,
  };
}

const AREAS: AreaPoint[] = [
  makeArea('area-a', 13.30, 74.70),
  makeArea('area-b', 13.40, 74.80),
  makeArea('area-c', 13.50, 74.90),
];

describe('AreaMarkerLayer.tsx:659 — zoom-only bucketing recompute (Category C)', () => {
  beforeEach(() => {
    mapStub.current = createMapStub({ zoom: 11 });
  });

  it('recomputes bucketing on a zoom change (zoomend fires -> zoomTick advances)', () => {
    render(<AreaMarkerLayer areas={AREAS} enableDegradation />);
    const stub = mapStub.current as MapStub;
    const getSizeCallsAtMount = stub.getSize.mock.calls.length;
    expect(getSizeCallsAtMount).toBeGreaterThan(0);

    // Capture the zoomend handler AreaMarkerLayer registered via map.on.
    const zoomendCall = stub.on.mock.calls.find(([event]) => event === 'zoomend');
    expect(zoomendCall).toBeDefined();
    const onZoomEnd = zoomendCall?.[1] as () => void;

    // Simulate a real zoom change: getZoom() now returns a new value, then
    // the registered zoomend handler fires (mirrors Leaflet's own contract).
    stub.getZoom.mockReturnValue(14);
    act(() => {
      onZoomEnd();
    });

    expect(stub.getSize.mock.calls.length).toBeGreaterThan(getSizeCallsAtMount);
  });

  it('does NOT recompute bucketing on a re-render where none of the bucketing deps changed (pan-equivalent — no zoomTick advance)', () => {
    const onAreaClick = vi.fn();
    const { rerender } = render(
      <AreaMarkerLayer areas={AREAS} enableDegradation onAreaClick={onAreaClick} />,
    );
    const stub = mapStub.current as MapStub;
    const getSizeCallsAfterMount = stub.getSize.mock.calls.length;

    // Re-render with the SAME `areas` reference and a prop that is NOT one of
    // the bucketing memo's deps (onAreaClick is not in
    // [enableDegradation, areas, focusedGroupAreas, zoomTick, selectedAreaKey,
    // searchMatchKeys, hoveredAreaKey]). No zoomend fired — zoomTick unchanged.
    const onAreaClickV2 = vi.fn();
    rerender(<AreaMarkerLayer areas={AREAS} enableDegradation onAreaClick={onAreaClickV2} />);

    expect(stub.getSize.mock.calls.length).toBe(getSizeCallsAfterMount);
  });

  it('recomputes when a bucketing dep DOES change (selectedAreaKey), independent of zoom', () => {
    const { rerender } = render(
      <AreaMarkerLayer areas={AREAS} enableDegradation selectedAreaKey={null} />,
    );
    const stub = mapStub.current as MapStub;
    const getSizeCallsAfterMount = stub.getSize.mock.calls.length;

    rerender(<AreaMarkerLayer areas={AREAS} enableDegradation selectedAreaKey="area-a" />);

    expect(stub.getSize.mock.calls.length).toBeGreaterThan(getSizeCallsAfterMount);
  });
});
