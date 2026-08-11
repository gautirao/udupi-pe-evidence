/**
 * Issue #1940 — byte-identical snapshot guard for PropertyMap's school-radius
 * Circle overlay (schoolCircle prop, ~L1811-1832).
 *
 * The #1940 fix is a STATE-ONLY teardown (useDiscoverJourneyTransitions clears
 * selectedSchool + filters.schoolLat/Lon/RadiusKm on journey change) — it must
 * NOT touch PropertyMap.tsx's Circle pathOptions in any way. This test captures
 * the exact pathOptions PropertyMap passes to react-leaflet's <Circle> when
 * schoolCircle is set, so any accidental attribute drift (color, fillColor,
 * fillOpacity, weight, dashArray) fails this test — independent of the #1940
 * state-teardown change, which lives entirely outside this file.
 *
 * Mirrors the existing PropertyMap.agriPolygon.test.tsx react-leaflet mocking
 * pattern (Circle is mocked here instead of stubbed to `() => null` so its
 * props can be captured).
 */

// ─── Mocks (must precede imports) ────────────────────────────────────────────

const capturedCircles: Array<{
  center: [number, number];
  radius: number;
  pathOptions?: Record<string, unknown>;
}> = [];

const capturedMarkers: Array<{
  position: [number, number];
  pane?: string;
}> = [];

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TileLayer: () => null,
  ZoomControl: () => null,
  Circle: ({
    center,
    radius,
    pathOptions,
  }: {
    center: [number, number];
    radius: number;
    pathOptions?: Record<string, unknown>;
  }) => {
    capturedCircles.push({ center, radius, pathOptions });
    return <div data-testid="school-circle" />;
  },
  Marker: ({
    position,
    pane,
  }: {
    position: [number, number];
    pane?: string;
  }) => {
    capturedMarkers.push({ position, pane });
    return <div data-testid="school-marker" />;
  },
  Tooltip: () => null,
  Polygon: () => null,
  useMap: vi.fn(() => ({
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
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
    invalidateSize: vi.fn(),
    remove: vi.fn(),
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
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
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
import { SELECTED_SCHOOL_PANE_NAME } from '@/components/map/SchoolMarkerLayer';

describe('PropertyMap — schoolCircle pathOptions (Issue #1940 byte-identical guard)', () => {
  beforeEach(() => {
    capturedCircles.length = 0;
    capturedMarkers.length = 0;
  });

  it('renders the school-radius Circle with the exact, unchanged pathOptions', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(
      <PropertyMap
        listings={[]}
        schoolCircle={{ lat: 13.35, lon: 74.79, radiusKm: 2, name: 'Test School' }}
      />,
    );

    expect(screen.getByTestId('school-circle')).toBeTruthy();
    expect(capturedCircles).toHaveLength(1);
    expect(capturedCircles[0].center).toEqual([13.35, 74.79]);
    expect(capturedCircles[0].radius).toBe(2000);
    // Byte-identical assertion 3 (issue_1738_regression carry-forward, #1940 AC5) —
    // these five fields must be unchanged by the state-only #1940 teardown fix.
    expect(capturedCircles[0].pathOptions).toEqual({
      color: 'hsl(var(--plum))',
      fillColor: 'hsl(var(--plum))',
      fillOpacity: 0.08,
      weight: 2,
      dashArray: '6 4',
    });
    // Issue #2130 — the school location marker must be routed into the
    // dedicated selected-school pane (below the default markerPane) so it
    // can never occlude an overlapping property marker's tap target.
    expect(screen.getByTestId('school-marker')).toBeTruthy();
    expect(capturedMarkers).toHaveLength(1);
    expect(capturedMarkers[0].position).toEqual([13.35, 74.79]);
    expect(capturedMarkers[0].pane).toBe(SELECTED_SCHOOL_PANE_NAME);
  });

  it('renders no Circle when schoolCircle is undefined (post-teardown state)', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(<PropertyMap listings={[]} />);

    expect(screen.queryByTestId('school-circle')).toBeNull();
    expect(capturedCircles).toHaveLength(0);
  });
});
