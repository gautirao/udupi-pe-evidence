/**
 * Tests for SectorOverlay (Issue #1429)
 *
 * Tests:
 * 1. Renders a Polygon with at least 20 positions for any direction + maxKm
 * 2. First and last position are identical (closed polygon)
 * 3. Standard tier (maxKm=25): fillOpacity=0.1, dashArray='6 4'
 * 4. Unbounded tier (maxKm=100): fillOpacity=0.06, dashArray='8 6'
 * 5. interactive=false in pathOptions (non-interactive overlay)
 * 6. bubblingMouseEvents=true (click-through)
 * 7. pane="overlayPane" (rendered below marker pane)
 * 8. Polygon positions are recomputed when directionCode changes
 * 9. Polygon positions are recomputed when maxKm changes
 */

// ─── Mocks (must precede imports) ────────────────────────────────────────────

// Capture what Polygon receives so we can inspect pathOptions and positions.
const capturedPolygonProps: Array<{
  positions: [number, number][];
  pathOptions: Record<string, unknown>;
  bubblingMouseEvents?: boolean;
  pane?: string;
}> = [];

const mockPolygon = vi.fn((props: {
  positions: [number, number][];
  pathOptions: Record<string, unknown>;
  bubblingMouseEvents?: boolean;
  pane?: string;
}) => {
  capturedPolygonProps.push({
    positions: props.positions,
    pathOptions: props.pathOptions,
    bubblingMouseEvents: props.bubblingMouseEvents,
    pane: props.pane,
  });
  return null;
});

vi.mock('react-leaflet', () => ({
  Polygon: (props: {
    positions: [number, number][];
    pathOptions: Record<string, unknown>;
    bubblingMouseEvents?: boolean;
    pane?: string;
  }) => {
    mockPolygon(props);
    return null;
  },
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SectorOverlay } from '../SectorOverlay';

// ─── Constants ────────────────────────────────────────────────────────────────

const UDUPI_LAT = 13.3409;
const UDUPI_LON = 74.7421;

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedPolygonProps.length = 0;
  mockPolygon.mockClear();
});

describe('SectorOverlay — polygon geometry', () => {
  it('renders a Polygon with at least 20 positions (>20 vertices)', () => {
    render(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="N"
        maxKm={25}
      />,
    );

    expect(capturedPolygonProps).toHaveLength(1);
    expect(capturedPolygonProps[0].positions.length).toBeGreaterThan(20);
  });

  it('produces a closed polygon: first and last position are identical', () => {
    render(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="NW"
        maxKm={50}
      />,
    );

    const positions = capturedPolygonProps[0].positions;
    expect(positions[0]).toEqual(positions[positions.length - 1]);
  });
});

describe('SectorOverlay — path options', () => {
  it('uses STANDARD path options for maxKm=10 (fillOpacity=0.1, dashArray="6 4")', () => {
    render(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="E"
        maxKm={10}
      />,
    );

    const pathOptions = capturedPolygonProps[0].pathOptions;
    expect(pathOptions.fillOpacity).toBe(0.1);
    expect(pathOptions.dashArray).toBe('6 4');
    expect(pathOptions.interactive).toBe(false);
  });

  it('uses STANDARD path options for maxKm=25 (fillOpacity=0.1, dashArray="6 4")', () => {
    render(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="N"
        maxKm={25}
      />,
    );

    const pathOptions = capturedPolygonProps[0].pathOptions;
    expect(pathOptions.fillOpacity).toBe(0.1);
    expect(pathOptions.dashArray).toBe('6 4');
  });

  it('uses STANDARD path options for maxKm=50 (fillOpacity=0.1, dashArray="6 4")', () => {
    render(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="S"
        maxKm={50}
      />,
    );

    const pathOptions = capturedPolygonProps[0].pathOptions;
    expect(pathOptions.fillOpacity).toBe(0.1);
    expect(pathOptions.dashArray).toBe('6 4');
  });

  it('uses UNBOUNDED path options for maxKm=100 (fillOpacity=0.06, dashArray="8 6")', () => {
    render(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="SW"
        maxKm={100}
      />,
    );

    const pathOptions = capturedPolygonProps[0].pathOptions;
    expect(pathOptions.fillOpacity).toBe(0.06);
    expect(pathOptions.dashArray).toBe('8 6');
    expect(pathOptions.interactive).toBe(false);
  });

  it('interactive is always false in pathOptions', () => {
    for (const maxKm of [10, 25, 50, 100] as const) {
      capturedPolygonProps.length = 0;
      render(
        <SectorOverlay
          centerLat={UDUPI_LAT}
          centerLon={UDUPI_LON}
          directionCode="N"
          maxKm={maxKm}
        />,
      );
      expect(capturedPolygonProps[0].pathOptions.interactive).toBe(false);
    }
  });
});

describe('SectorOverlay — Leaflet pane and event options', () => {
  it('passes bubblingMouseEvents=true for click passthrough', () => {
    render(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="NE"
        maxKm={25}
      />,
    );

    expect(capturedPolygonProps[0].bubblingMouseEvents).toBe(true);
  });

  it('renders in overlayPane (below markerPane)', () => {
    render(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="SE"
        maxKm={50}
      />,
    );

    expect(capturedPolygonProps[0].pane).toBe('overlayPane');
  });
});

describe('SectorOverlay — useMemo recomputes positions on prop change', () => {
  it('produces different positions for N vs NW direction codes', () => {
    const { rerender } = render(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="N"
        maxKm={25}
      />,
    );

    const positionsN = capturedPolygonProps[0].positions.map(([lat, lon]) => `${lat},${lon}`).join('|');

    capturedPolygonProps.length = 0;

    rerender(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="NW"
        maxKm={25}
      />,
    );

    const positionsNW = capturedPolygonProps[0].positions.map(([lat, lon]) => `${lat},${lon}`).join('|');
    expect(positionsN).not.toBe(positionsNW);
  });

  it('produces different positions for maxKm=10 vs maxKm=50 (same direction)', () => {
    const { rerender } = render(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="N"
        maxKm={10}
      />,
    );

    const positions10 = capturedPolygonProps[0].positions.map(([lat, lon]) => `${lat},${lon}`).join('|');

    capturedPolygonProps.length = 0;

    rerender(
      <SectorOverlay
        centerLat={UDUPI_LAT}
        centerLon={UDUPI_LON}
        directionCode="N"
        maxKm={50}
      />,
    );

    const positions50 = capturedPolygonProps[0].positions.map(([lat, lon]) => `${lat},${lon}`).join('|');
    expect(positions10).not.toBe(positions50);
  });
});
