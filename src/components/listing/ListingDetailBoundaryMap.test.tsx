/**
 * ListingDetailBoundaryMap — Issue #1406
 *
 * 1. Renders a Polygon when boundary is a valid GeoJSON Polygon string with ≥3 coords.
 * 2. Renders a Marker (centre-marker fallback) when boundary is null.
 * 3. Renders without crashing when boundary is malformed JSON.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Mock react-leaflet ───────────────────────────────────────────────────────
// Pattern from src/components/map/__tests__/PropertyMap.test.tsx
const mockFitBounds = vi.hoisted(() => vi.fn());
const mockUseMap = vi.hoisted(() =>
  vi.fn(() => ({
    fitBounds: mockFitBounds,
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    flyTo: vi.fn(),
    getBounds: vi.fn(),
    getZoom: vi.fn(() => 15),
    setView: vi.fn().mockReturnThis(),
    getContainer: vi.fn(() => document.body),
  })),
);

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Polygon: ({ positions }: { positions: [number, number][] }) => (
    <div
      data-testid="boundary-polygon"
      data-positions={JSON.stringify(positions)}
    />
  ),
  Marker: ({ position }: { position: [number, number] }) => (
    <div
      data-testid="centre-marker"
      data-position={JSON.stringify(position)}
    />
  ),
  useMap: mockUseMap,
}));

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ on: vi.fn().mockReturnThis() })),
  },
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

// ─── Component under test ─────────────────────────────────────────────────────
import { ListingDetailBoundaryMap } from './ListingDetailBoundaryMap';

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const VALID_POLYGON_BOUNDARY = JSON.stringify({
  type: 'Polygon',
  coordinates: [
    [
      [74.8, 13.2],
      [74.81, 13.2],
      [74.81, 13.21],
      [74.8, 13.21],
      [74.8, 13.2], // closing point
    ],
  ],
});

describe('ListingDetailBoundaryMap', () => {
  // Reset mock state between tests to prevent call-count leakage
  beforeEach(() => {
    mockFitBounds.mockClear();
  });

  // 1 — Valid polygon boundary → Polygon rendered
  it('renders a Polygon when boundary is a valid GeoJSON Polygon with ≥3 coords', () => {
    render(
      <ListingDetailBoundaryMap
        boundary={VALID_POLYGON_BOUNDARY}
        lat={13.2}
        lng={74.8}
      />,
    );

    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('boundary-polygon')).toBeInTheDocument();
    // Centre-marker should not appear when a polygon is available
    expect(screen.queryByTestId('centre-marker')).not.toBeInTheDocument();
    // FitBoundsOnMount should have been called once with the polygon coords
    expect(mockFitBounds).toHaveBeenCalledOnce();
  });

  // 2 — Boundary null → Marker fallback rendered
  it('renders a centre-marker fallback when boundary is null', () => {
    render(
      <ListingDetailBoundaryMap
        boundary={null}
        lat={13.2}
        lng={74.8}
      />,
    );

    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('centre-marker')).toBeInTheDocument();
    expect(screen.queryByTestId('boundary-polygon')).not.toBeInTheDocument();
    // fitBounds should NOT be called when there is no polygon
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  // 3 — Malformed JSON → no crash, falls back to Marker
  it('renders without crashing when boundary is malformed JSON', () => {
    render(
      <ListingDetailBoundaryMap
        boundary="not-valid-json{{{"
        lat={13.2}
        lng={74.8}
      />,
    );

    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    // fromGeoJsonString returns [] on parse error → centre-marker fallback
    expect(screen.getByTestId('centre-marker')).toBeInTheDocument();
  });

  // ── Issue #2005 (Slice 2 PR6) — Category A: useMountEffect regression ────────
  // fitBounds must fire once, on mount, using the coords present at that moment —
  // "after this the user controls the map". A later coords/props change must NOT
  // re-trigger fitBounds and fight the user's own pan/zoom.
  it('does not call fitBounds again after a later coords/props change (fires once, on mount, only)', () => {
    const { rerender } = render(
      <ListingDetailBoundaryMap
        boundary={VALID_POLYGON_BOUNDARY}
        lat={13.2}
        lng={74.8}
      />,
    );
    expect(mockFitBounds).toHaveBeenCalledOnce();

    const laterBoundary = JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [75.0, 13.4],
          [75.01, 13.4],
          [75.01, 13.41],
          [75.0, 13.41],
          [75.0, 13.4],
        ],
      ],
    });
    rerender(
      <ListingDetailBoundaryMap
        boundary={laterBoundary}
        lat={13.4}
        lng={75.0}
      />,
    );

    // Still only the one, mount-time call — the user now controls the map.
    expect(mockFitBounds).toHaveBeenCalledOnce();
  });
});
