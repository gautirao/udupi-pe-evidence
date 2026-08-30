/**
 * Issue #2382 — direct-import ownership tests for the journey-specific
 * Leaflet layer controllers extracted out of PropertyMap.tsx (page-health
 * follow-up from #2296).
 *
 * These tests import each extracted module directly from
 * src/components/map/layers/ (not via PropertyMap.tsx's re-exports), to
 * prove the layers are genuinely owned by their own files — a component
 * elsewhere in the app (or a future PropertyMap successor) could import
 * them without going through PropertyMap.tsx at all. Full behavioral
 * regression coverage (marker selection/hover/click-routing, clustering
 * policy, camera intents, teardown semantics) continues to live in the
 * existing PropertyMap.*.test.tsx suites, which mount these same layers
 * through <PropertyMap> and are unchanged/still passing after this move.
 */

// ─── Mocks (must precede imports) ────────────────────────────────────────────

const mockAddLayer = vi.fn();
const mockRemoveLayer = vi.fn();
const mockMap = {
  addLayer: mockAddLayer,
  removeLayer: mockRemoveLayer,
  flyTo: vi.fn(),
  fitBounds: vi.fn(),
  getBounds: vi.fn(() => ({
    getNorth: vi.fn(() => 14),
    getSouth: vi.fn(() => 13),
    getEast: vi.fn(() => 75),
    getWest: vi.fn(() => 74),
  })),
  getCenter: vi.fn(() => ({ lat: 13.5, lng: 74.7 })),
  getZoom: vi.fn(() => 12),
  getBoundsZoom: vi.fn(() => 14),
  setView: vi.fn().mockReturnThis(),
  getContainer: vi.fn(() => document.body),
  invalidateSize: vi.fn(),
  remove: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TileLayer: () => null,
  ZoomControl: () => null,
  Circle: (props: { center: [number, number]; radius: number }) => (
    <div data-testid="school-radius-circle" data-radius={props.radius} />
  ),
  Marker: (props: { position: [number, number]; pane?: string }) => (
    <div data-testid="school-radius-marker" data-pane={props.pane} />
  ),
  Polygon: ({
    positions,
    pathOptions,
  }: {
    positions: [number, number][];
    pathOptions?: Record<string, unknown>;
  }) => (
    <div
      data-testid="agri-polygon"
      data-positions={JSON.stringify(positions)}
      data-fill={pathOptions?.fillColor as string}
    />
  ),
  useMap: vi.fn(() => mockMap),
}));

const markerClusterGroupInstance = {
  addLayer: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: vi.fn(),
      },
    },
    divIcon: vi.fn((opts: { html: string }) => ({ options: opts })),
    marker: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      bindTooltip: vi.fn().mockReturnThis(),
      getElement: vi.fn(() => null),
      setIcon: vi.fn(),
    })),
    markerClusterGroup: vi.fn(() => markerClusterGroupInstance),
    layerGroup: vi.fn(() => ({ addLayer: vi.fn() })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
    latLngBounds: vi.fn(() => ({
      getSouthWest: vi.fn(() => ({ lat: 13, lng: 74 })),
      getNorthEast: vi.fn(() => ({ lat: 14, lng: 75 })),
      getCenter: vi.fn(() => ({ lat: 13.5, lng: 74.5 })),
    })),
  },
}));

vi.mock('@/components/map/SchoolMarkerLayer', () => ({
  SchoolMarkerLayer: () => null,
  SELECTED_SCHOOL_PANE_NAME: 'selected-school-pane',
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  deriveMarkerLabel,
  createMarkerIcon,
  createSelectedMarkerIcon,
  createAgriDestinationBadgeIcon,
} from '../markerIcons';
import { MarkerClusterLayer } from '../ResidentialMarkerClusterLayer';
import { AgriMarkerClusterLayer, AgriPolygonLayer, buildAgriMarkerLabel } from '../AgriParcelLayer';
import { AgriDestinationMarkerLayer } from '../AgriDestinationMarkerLayer';
import { SchoolRadiusOverlay } from '../SchoolRadiusOverlay';

describe('layers/markerIcons — direct import (Issue #2382)', () => {
  it('deriveMarkerLabel is importable and behaves per its existing contract', () => {
    expect(deriveMarkerLabel('house', 1500000, null)).toMatchObject({ isPricePill: true, isBand: false });
    expect(deriveMarkerLabel('house', null, null)).toEqual({ label: '—', isPricePill: false, isBand: false });
  });

  it('createMarkerIcon and createSelectedMarkerIcon are importable and construct a divIcon', () => {
    const icon = createMarkerIcon('house', 1500000, null);
    const selectedIcon = createSelectedMarkerIcon('house', 1500000, null);
    expect(icon).toBeTruthy();
    expect(selectedIcon).toBeTruthy();
    expect(icon).not.toBe(selectedIcon);
  });

  it('createAgriDestinationBadgeIcon is importable and constructs a divIcon with the parcel count', () => {
    const icon = createAgriDestinationBadgeIcon('Brahmavar', 12, false) as unknown as {
      options: { html: string };
    };
    expect(icon.options.html).toContain('Brahmavar');
    expect(icon.options.html).toContain('12');
  });
});

describe('layers/ResidentialMarkerClusterLayer — direct import (Issue #2382)', () => {
  it('mounts, builds a markerClusterGroup, and adds it to the map', () => {
    render(
      <MarkerClusterLayer
        listings={[
          { id: 'l1', property_type: 'house', price: 1500000, latitude: 13.34, longitude: 74.74 } as never,
        ]}
      />,
    );
    expect(mockAddLayer).toHaveBeenCalledWith(markerClusterGroupInstance);
  });
});

describe('layers/AgriParcelLayer — direct import (Issue #2382)', () => {
  it('buildAgriMarkerLabel is importable and never returns "undefined"/"null"/empty', () => {
    expect(buildAgriMarkerLabel(null, null, null, null)).toBe('Agricultural land');
  });

  it('AgriMarkerClusterLayer mounts and adds a markerClusterGroup to the map', () => {
    render(
      <AgriMarkerClusterLayer
        listings={[
          {
            id: 'a1',
            property_type: 'agricultural_land',
            price: null,
            latitude: 13.5,
            longitude: 74.8,
            title: 'Paddy field',
            locality: null,
            land_area: null,
            land_area_unit: null,
          } as never,
        ]}
      />,
    );
    expect(mockAddLayer).toHaveBeenCalledWith(markerClusterGroupInstance);
  });

  it('AgriPolygonLayer transforms GeoJSON [lng,lat] into Leaflet [lat,lng] positions', () => {
    const geojson = JSON.stringify({
      type: 'Polygon',
      coordinates: [[[74.74, 13.34], [74.75, 13.34], [74.75, 13.35], [74.74, 13.34]]],
    });
    render(
      <AgriPolygonLayer
        listings={[
          { id: 'p1', property_type: 'agricultural_land', boundary_geojson: geojson } as never,
        ]}
        mapZoom={16}
      />,
    );
    const polygon = screen.getByTestId('agri-polygon');
    const positions: [number, number][] = JSON.parse(polygon.getAttribute('data-positions') ?? '[]');
    expect(positions[0]).toEqual([13.34, 74.74]);
  });
});

describe('layers/AgriDestinationMarkerLayer — direct import (Issue #2382)', () => {
  it('mounts and adds a layerGroup to the map for valid Level-2 destinations', () => {
    render(
      <AgriDestinationMarkerLayer
        destinations={[
          {
            id: 'd1',
            areaKey: 'brahmavar',
            title: 'Brahmavar',
            locality: null,
            latitude: 13.4,
            longitude: 74.75,
            parcelCount: 4,
          } as never,
        ]}
      />,
    );
    expect(mockAddLayer).toHaveBeenCalled();
  });
});

describe('layers/SchoolRadiusOverlay — direct import (Issue #2382)', () => {
  it('renders nothing when schoolCircle is absent', () => {
    const { container } = render(<SchoolRadiusOverlay schoolCircle={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the radius circle + pin into the selected-school pane when schoolCircle is set', () => {
    render(
      <SchoolRadiusOverlay
        schoolCircle={{ lat: 13.34, lon: 74.74, radiusKm: 5, name: 'Test School' }}
      />,
    );
    const circle = screen.getByTestId('school-radius-circle');
    expect(circle.getAttribute('data-radius')).toBe('5000');
    const marker = screen.getByTestId('school-radius-marker');
    expect(marker.getAttribute('data-pane')).toBe('selected-school-pane');
  });
});
