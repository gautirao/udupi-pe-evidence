/**
 * Issue #1069 — AreaPanner must clamp `maxZoom` to AREA_LAYER_MAX_ZOOM (=12)
 * when fitBounds is invoked with a synthetic group-bounds AreaPoint.
 *
 * Without the clamp, narrow groups (e.g. University Belt: Manipal + Katapadi
 * ~4 km apart) fit at zoom ~14, which then exceeds MapDiscovery's
 * `mapZoom <= AREA_LAYER_MAX_ZOOM` filter and hides every area marker the
 * user was meant to see.
 *
 * For real (non-synthetic) areas the behaviour must remain unchanged
 * (maxZoom=16) so single-area focus continues to frame tightly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import {
  GROUP_BOUNDS_SYNTHETIC_KEY,
} from '@/utils/discoverGroupBounds';

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
}));

// ─── Mocks (must come before importing PropertyMap) ───────────
vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ on: vi.fn().mockReturnThis() })),
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
  Marker: () => null,
  Circle: () => null,
  Tooltip: () => null,
  useMap: () => mapStub,
}));

vi.mock('@/components/map/DrawControl', () => ({ DrawControl: () => null }));
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
import { PropertyMap, AREA_PANNER_GROUP_MAX_ZOOM } from '@/components/map/PropertyMap';

const baseProps = {
  listings: [],
  cityCenter: [13.3409, 74.7421] as [number, number],
  cityZoom: 11,
  resetMapTick: 0,
  areas: [],
};

const renderWithPan = (panToArea: AreaPoint | null) =>
  render(<PropertyMap {...baseProps} panToArea={panToArea} />);

describe('Issue #1069 — AreaPanner.fitBounds maxZoom clamp', () => {
  beforeEach(() => {
    mapStub.fitBounds.mockClear();
    mapStub.flyTo.mockClear();
  });

  it('clamps maxZoom to AREA_PANNER_GROUP_MAX_ZOOM for synthetic group bounds', () => {
    // University-Belt-shaped bbox (Manipal + Katapadi ~4 km apart)
    const groupBounds: AreaPoint = {
      areaKey: GROUP_BOUNDS_SYNTHETIC_KEY,
      areaLabel: '',
      geo_center_lat: 13.355,
      geo_center_lon: 74.79,
      bbox: [[13.34, 74.76], [13.37, 74.82]],
    };

    renderWithPan(groupBounds);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [bbox, opts] = mapStub.fitBounds.mock.calls[0];
    expect(bbox).toEqual(groupBounds.bbox);
    expect(opts).toEqual({
      padding: [40, 40],
      maxZoom: AREA_PANNER_GROUP_MAX_ZOOM,
    });
    expect(AREA_PANNER_GROUP_MAX_ZOOM).toBe(12);
  });

  it('keeps maxZoom=16 for real (non-synthetic) area focus', () => {
    const realArea: AreaPoint = {
      areaKey: 'IN|KA|Udupi|Manipal',
      areaLabel: 'Manipal',
      geo_center_lat: 13.3525,
      geo_center_lon: 74.7869,
      bbox: [[13.34, 74.78], [13.37, 74.82]],
    };

    renderWithPan(realArea);

    expect(mapStub.fitBounds).toHaveBeenCalledTimes(1);
    const [, opts] = mapStub.fitBounds.mock.calls[0];
    expect(opts).toEqual({ padding: [40, 40], maxZoom: 16 });
  });

  it('does not call fitBounds when panToArea is null', () => {
    renderWithPan(null);
    expect(mapStub.fitBounds).not.toHaveBeenCalled();
  });
});

// ─── Drift-guard ───────────────────────────────────────────────
// AREA_LAYER_MAX_ZOOM (canonical) is defined in MapDiscovery.tsx but is not
// exported (importing it from PropertyMap would close an import cycle).
// We re-read the source file and assert the two constants stay in sync.
import fs from 'node:fs';
import path from 'node:path';

describe('Issue #1069 drift-guard — AREA_PANNER_GROUP_MAX_ZOOM matches AREA_LAYER_MAX_ZOOM', () => {
  it('PropertyMap clamp constant matches MapDiscovery threshold', () => {
    const mapDiscoveryPath = path.resolve(
      __dirname,
      '../../../pages/MapDiscovery.tsx',
    );
    const src = fs.readFileSync(mapDiscoveryPath, 'utf-8');
    const match = src.match(/const\s+AREA_LAYER_MAX_ZOOM\s*=\s*(\d+)\s*;/);
    expect(match, 'AREA_LAYER_MAX_ZOOM declaration not found in MapDiscovery.tsx').not.toBeNull();
    const canonical = Number(match![1]);
    expect(canonical).toBe(AREA_PANNER_GROUP_MAX_ZOOM);
  });
});
