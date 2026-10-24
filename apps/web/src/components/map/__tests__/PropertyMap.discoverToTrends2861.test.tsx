/**
 * Issue #2861 — Lower-level replacement suite for L94
 * (`e2e/discover-to-trends.spec.ts` Test 1: "listing markers appear at zoom > 12 (C-switch layer active)").
 *
 * Proves the residual non-obsolete assertions in `e2e/discover-to-trends.spec.ts`
 * (lines 20-50) at the real `PropertyMap` + `useZoomBand` + `selectPrimaryMapLayer`
 * + `MarkerClusterLayer` + `createMarkerIcon` prop boundary (URL query parsing for
 * `?lat&lon&zoom` is covered separately in `useDiscoverUrlState.test.ts`):
 *   - Step 1 (zoom <= AREA_LAYER_MAX_ZOOM = 12, default city overview zoom = 11):
 *     `primaryMapLayer` resolves to `'area'`, mounting `AreaMarkerLayer`
 *     (`.area-marker`) and suppressing `MarkerClusterLayer` (`.custom-marker`).
 *   - Step 2 & 3 (`initialCenter={[13.3525, 74.7925]}`, `initialZoom={14}`, `mapZoom={14}`,
 *     zoom = 14 > AREA_LAYER_MAX_ZOOM = 12):
 *     `URLViewportController` applies `map.setView([13.3525, 74.7925], 14)` from props,
 *     `useZoomBand(14)` transitions to `'markers'`, `selectPrimaryMapLayer`
 *     switches to `'residentialMarkers'`, unmounting `AreaMarkerLayer`
 *     (0 area markers) and mounting `MarkerClusterLayer` with `.custom-marker`
 *     DivIcons containing `.marker-pill` price labels (`₹45 L`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockMapInstance,
  capturedDivIconCalls,
  capturedMarkerPositions,
  mockClusterGroupAddLayer,
} = vi.hoisted(() => {
  const divIcons: Array<{ className?: string; html: string }> = [];
  const markerPositions: Array<[number, number]> = [];
  const clusterAddLayer = vi.fn();
  const instance = {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    flyTo: vi.fn(),
    flyToBounds: vi.fn(),
    fitBounds: vi.fn(),
    getBounds: vi.fn(() => ({
      getNorth: vi.fn(() => 14),
      getSouth: vi.fn(() => 13),
      getEast: vi.fn(() => 75),
      getWest: vi.fn(() => 74),
      contains: vi.fn(() => true),
      isValid: vi.fn(() => true),
    })),
    getCenter: vi.fn(() => ({ lat: 13.3409, lng: 74.7421 })),
    getZoom: vi.fn(() => 11),
    setView: vi.fn().mockReturnThis(),
    setMaxBounds: vi.fn(),
    setMinZoom: vi.fn(),
    getMinZoom: vi.fn(() => 9),
    getBoundsZoom: vi.fn(() => 9),
    getContainer: vi.fn(() => document.body),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    stop: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  };
  return {
    mockMapInstance: instance,
    capturedDivIconCalls: divIcons,
    capturedMarkerPositions: markerPositions,
    mockClusterGroupAddLayer: clusterAddLayer,
  };
});

vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: vi.fn(),
      },
    },
    divIcon: vi.fn((opts: { className?: string; html: string }) => {
      capturedDivIconCalls.push(opts);
      return { options: opts };
    }),
    marker: vi.fn((pos: [number, number]) => {
      capturedMarkerPositions.push(pos);
      return {
        on: vi.fn().mockReturnThis(),
      };
    }),
    markerClusterGroup: vi.fn(() => ({
      addLayer: mockClusterGroupAddLayer,
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
    })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
    latLngBounds: vi.fn(() => ({
      isValid: () => true,
      pad: () => ({}),
      contains: () => true,
    })),
  },
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  ZoomControl: () => null,
  useMap: vi.fn(() => mockMapInstance),
  useMapEvents: vi.fn(() => mockMapInstance),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet-draw', () => ({}));
vi.mock('leaflet-draw/dist/leaflet.draw.css', () => ({}));

vi.mock('@/components/map/DrawControl', () => ({
  DrawControl: () => null,
}));

vi.mock('../AreaMarkerLayer', () => ({
  AreaMarkerLayer: ({ areas }: { areas: Array<{ areaKey: string; areaLabel: string }> }) => (
    <div data-testid="area-marker-layer">
      {areas.map((a) => (
        <div
          key={a.areaKey}
          className="leaflet-marker-icon area-marker"
          data-testid={`area-marker-${a.areaKey}`}
        >
          {a.areaLabel}
        </div>
      ))}
    </div>
  ),
}));

import React from 'react';
import { render } from '@testing-library/react';
import { PropertyMap, type PropertyListingWithImages } from '../PropertyMap';
import type { AreaPoint } from '@/hooks/useDiscoverAreas';

const MOCK_AREAS: AreaPoint[] = [
  {
    areaKey: 'manipal',
    areaLabel: 'Manipal',
    lat: 13.3525,
    lon: 74.7925,
    listingCount: 12,
  } as AreaPoint,
];

const MOCK_LISTINGS = [
  {
    id: 'listing-manipal-1',
    title: 'Manipal 2BHK Apartment',
    property_type: 'apartment' as const,
    latitude: 13.3525,
    longitude: 74.7925,
    price: 4_500_000,
    price_paise: 450_000_000,
    status: 'LIVE' as const,
    locality: 'Manipal',
    area_sqft: 1200,
    bedrooms: 2,
    bathrooms: 2,
    description: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: 'user-1',
    slug: 'manipal-2bhk-apartment',
    is_price_reduced: false,
    is_new_to_market: false,
    is_back_on_market: false,
    is_rera_registered: false,
    is_ready_to_move: false,
  },
] as unknown as PropertyListingWithImages[];

describe('PropertyMap — #2861 L94 C-switch layer transition (discover-to-trends Test 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedDivIconCalls.length = 0;
    capturedMarkerPositions.length = 0;
  });

  it('Step 1 (zoom = 11 <= AREA_LAYER_MAX_ZOOM = 12): renders .area-marker layer and suppresses .custom-marker listing layer', () => {
    mockMapInstance.getZoom.mockReturnValue(11);

    const { container, queryByTestId } = render(
      <PropertyMap
        listings={MOCK_LISTINGS}
        areas={MOCK_AREAS}
        initialCenter={[13.3409, 74.7421]}
        initialZoom={11}
        mapZoom={11}
      />,
    );

    // AreaMarkerLayer is mounted with .leaflet-marker-icon.area-marker
    expect(queryByTestId('area-marker-layer')).not.toBeNull();
    expect(container.querySelectorAll('.leaflet-marker-icon.area-marker')).toHaveLength(1);

    // Listing marker cluster layer is NOT mounted at overview zoom <= 12
    expect(capturedDivIconCalls).toHaveLength(0);
    expect(mockClusterGroupAddLayer).not.toHaveBeenCalled();
  });

  it('Step 2 & 3 (zoom = 14 > AREA_LAYER_MAX_ZOOM = 12 at Manipal coords): unmounts .area-marker and mounts .custom-marker listing layer', () => {
    mockMapInstance.getZoom.mockReturnValue(14);

    const { container, queryByTestId } = render(
      <PropertyMap
        listings={MOCK_LISTINGS}
        areas={MOCK_AREAS}
        initialCenter={[13.3525, 74.7925]}
        initialZoom={14}
        mapZoom={14}
      />,
    );

    // URLViewportController applies the URL lat/lon/zoom=14 camera target
    expect(mockMapInstance.setView).toHaveBeenCalledWith([13.3525, 74.7925], 14);

    // Step 2: Area markers disappear (count === 0) above AREA_LAYER_MAX_ZOOM (12)
    expect(queryByTestId('area-marker-layer')).toBeNull();
    expect(container.querySelectorAll('.leaflet-marker-icon.area-marker')).toHaveLength(0);

    // Step 3: Custom listing marker layer (.custom-marker) is active with price pill ₹45 L
    expect(mockClusterGroupAddLayer).toHaveBeenCalledTimes(1);
    expect(capturedMarkerPositions).toEqual([[13.3525, 74.7925]]);
    expect(capturedDivIconCalls).toHaveLength(1);
    expect(capturedDivIconCalls[0].className).toBe('custom-marker property-marker');
    expect(capturedDivIconCalls[0].html).toContain('data-testid="property-marker"');
    expect(capturedDivIconCalls[0].html).toContain('₹45 L');
  });
});
