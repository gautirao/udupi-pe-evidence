/**
 * Issue #1373 — AgriPolygonLayer rendering tests.
 *
 * Confirms that:
 *   1. Coordinate transform: GeoJSON [lng, lat] → Leaflet [lat, lng] (fails-without-fix).
 *   2. Zoom gate: polygons only render at mapZoom >= 16.
 *   3. Null-boundary agri listings do NOT render a polygon (fall back to cluster marker).
 */

// ─── Mocks (must precede imports) ────────────────────────────────────────────

const mockAddLayer = vi.fn();
const mockRemoveLayer = vi.fn();

// Capture Polygon render calls so tests can inspect positions and pathOptions.
const capturedPolygons: Array<{
  positions: [number, number][];
  pathOptions?: Record<string, unknown>;
}> = [];

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TileLayer: () => null,
  Circle: () => null,
  Marker: () => null,
  Tooltip: () => null,
  Polygon: ({
    positions,
    pathOptions,
    eventHandlers,
  }: {
    positions: [number, number][];
    pathOptions?: Record<string, unknown>;
    eventHandlers?: { click?: () => void };
  }) => {
    capturedPolygons.push({ positions, pathOptions });
    return (
      <div
        data-testid="agri-polygon"
        data-positions={JSON.stringify(positions)}
        data-fill={pathOptions?.fillColor as string}
        onClick={eventHandlers?.click}
      />
    );
  },
  useMap: vi.fn(() => ({
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
    getZoom: vi.fn(() => 16),
    setView: vi.fn().mockReturnThis(),
    getContainer: vi.fn(() => document.body),
  })),
  useMapEvents: vi.fn(() => ({
    getBounds: vi.fn(() => ({
      getNorth: vi.fn(() => 14),
      getSouth: vi.fn(() => 13),
      getEast: vi.fn(() => 75),
      getWest: vi.fn(() => 74),
    })),
    getZoom: vi.fn(() => 16),
    getContainer: vi.fn(() => document.body),
  })),
}));

vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: vi.fn(),
      },
    },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      bindTooltip: vi.fn().mockReturnThis(),
    })),
    markerClusterGroup: vi.fn(() => ({
      addLayer: vi.fn(),
    })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
  },
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

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Fixtures ────────────────────────────────────────────────────────────────

// GeoJSON stores coordinates as [longitude, latitude].
// First ring point: [74.74, 13.34] → Leaflet expects [13.34, 74.74].
const SAMPLE_GEOJSON = JSON.stringify({
  type: 'Polygon',
  coordinates: [
    [
      [74.74, 13.34],
      [74.75, 13.34],
      [74.75, 13.35],
      [74.74, 13.35],
      [74.74, 13.34],
    ],
  ],
});

function makeAgriListing(id: string, boundaryGeoJson?: string | null) {
  return {
    id,
    property_type: 'agricultural_land' as const,
    latitude: 13.35,
    longitude: 74.79,
    title: null,
    price: null,
    price_unit: null,
    land_area: null,
    land_area_unit: null,
    built_area: null,
    built_area_unit: null,
    bedrooms: null,
    bathrooms: null,
    contact_info: null,
    contact_phone: null,
    description: null,
    confidence_score: null,
    language_detected: null,
    price_per_cent_paise: null,
    is_valid: true,
    is_duplicate: false,
    status: 'LIVE' as const,
    created_at: '',
    updated_at: '',
    listing_purpose: '',
    carpet_area: null,
    carpet_area_unit: null,
    floor_number: null,
    total_floors: null,
    furnishing_status: null,
    washrooms: null,
    parking_count: null,
    road_frontage_ft: null,
    commercial_usage: null,
    number_of_units: null,
    monthly_rent: null,
    security_deposit_months: null,
    lock_in_months: null,
    seller_type: null,
    raw_post_id: null,
    locality: null,
    boundary_geojson: boundaryGeoJson,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgriPolygonLayer — coordinate transform (AC8, fails-without-fix)', () => {
  beforeEach(() => {
    capturedPolygons.length = 0;
  });

  it('converts GeoJSON [lng, lat] pairs to Leaflet [lat, lng] positions', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(
      <PropertyMap
        listings={[makeAgriListing('l1', SAMPLE_GEOJSON)]}
        isAgriMode={true}
        mapZoom={16}
      />,
    );

    const polygon = screen.getByTestId('agri-polygon');
    const positions: [number, number][] = JSON.parse(
      polygon.getAttribute('data-positions') ?? '[]',
    );

    // First ring point in GeoJSON: [74.74 (lng), 13.34 (lat)]
    // Leaflet expects: [13.34 (lat), 74.74 (lng)]
    expect(positions[0]).toEqual([13.34, 74.74]);
    // Fails-without-fix guard: raw GeoJSON order must NOT be present
    expect(positions[0]).not.toEqual([74.74, 13.34]);
  });
});

describe('AgriPolygonLayer — zoom gate (AC5)', () => {
  beforeEach(() => {
    capturedPolygons.length = 0;
  });

  it('renders no polygon at zoom < 16', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(
      <PropertyMap
        listings={[makeAgriListing('l1', SAMPLE_GEOJSON)]}
        isAgriMode={true}
        mapZoom={15}
      />,
    );

    expect(screen.queryByTestId('agri-polygon')).toBeNull();
  });

  it('renders polygon at zoom = 16', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(
      <PropertyMap
        listings={[makeAgriListing('l1', SAMPLE_GEOJSON)]}
        isAgriMode={true}
        mapZoom={16}
      />,
    );

    expect(screen.getByTestId('agri-polygon')).toBeTruthy();
  });

  it('renders polygon at zoom > 16', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(
      <PropertyMap
        listings={[makeAgriListing('l1', SAMPLE_GEOJSON)]}
        isAgriMode={true}
        mapZoom={18}
      />,
    );

    expect(screen.getByTestId('agri-polygon')).toBeTruthy();
  });
});

describe('AgriPolygonLayer — null-boundary fallback (AC4)', () => {
  beforeEach(() => {
    capturedPolygons.length = 0;
  });

  it('renders no polygon for agri listing with null boundary_geojson', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(
      <PropertyMap
        listings={[makeAgriListing('l1', null)]}
        isAgriMode={true}
        mapZoom={16}
      />,
    );

    expect(screen.queryByTestId('agri-polygon')).toBeNull();
  });

  it('renders no polygon for agri listing with undefined boundary_geojson', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(
      <PropertyMap
        listings={[makeAgriListing('l1', undefined)]}
        isAgriMode={true}
        mapZoom={16}
      />,
    );

    expect(screen.queryByTestId('agri-polygon')).toBeNull();
  });
});

describe('AgriPolygonLayer — click handler (AC3)', () => {
  beforeEach(() => {
    capturedPolygons.length = 0;
  });

  it('calls onSelectListing with the listing when polygon is clicked', async () => {
    const { PropertyMap } = await import('../PropertyMap');
    const onSelectListing = vi.fn();
    const listing = makeAgriListing('l1', SAMPLE_GEOJSON);

    render(
      <PropertyMap
        listings={[listing]}
        isAgriMode={true}
        mapZoom={16}
        onSelectListing={onSelectListing}
      />,
    );

    const polygon = screen.getByTestId('agri-polygon');
    polygon.click();

    expect(onSelectListing).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }));
  });
});

describe('AgriPolygonLayer — selected highlight (AC2)', () => {
  beforeEach(() => {
    capturedPolygons.length = 0;
  });

  it('renders with orange highlight color when selectedPolygonListing matches', async () => {
    const { PropertyMap } = await import('../PropertyMap');
    const listing = makeAgriListing('l1', SAMPLE_GEOJSON);

    render(
      <PropertyMap
        listings={[listing]}
        isAgriMode={true}
        mapZoom={16}
        selectedPolygonListing={listing}
      />,
    );

    const polygon = screen.getByTestId('agri-polygon');
    expect(polygon.getAttribute('data-fill')).toBe('#f97316');
  });

  it('renders with green default color when not selected', async () => {
    const { PropertyMap } = await import('../PropertyMap');
    const listing = makeAgriListing('l1', SAMPLE_GEOJSON);

    render(
      <PropertyMap
        listings={[listing]}
        isAgriMode={true}
        mapZoom={16}
      />,
    );

    const polygon = screen.getByTestId('agri-polygon');
    expect(polygon.getAttribute('data-fill')).toBe('#65a30d');
  });
});
