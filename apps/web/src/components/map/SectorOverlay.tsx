/**
 * SectorOverlay — renders a directional sector polygon (wedge) on the Leaflet map
 * as a non-interactive backdrop for agri corridor-first discovery (Issue #1429).
 *
 * - Visible only when both region + maxKm are set and propertyType is agricultural_land.
 * - Geometry built with buildSectorPolygon (geodesic, no turf.js, N-wrap safe).
 * - Rendered below the marker pane using Leaflet's built-in overlayPane z-order.
 * - Non-interactive: pathOptions.interactive=false + bubblingMouseEvents so clicks
 *   pass through to polygon and marker layers.
 */

import React, { useMemo } from 'react';
import { Polygon } from 'react-leaflet';
import { buildSectorPolygon } from '@/lib/geo';

export interface SectorOverlayProps {
  /** City centre latitude (degrees). */
  centerLat: number;
  /** City centre longitude (degrees). */
  centerLon: number;
  /** Corridor direction code. */
  directionCode: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
  /** Cumulative distance tier in km. */
  maxKm: 10 | 25 | 50 | 100;
}

/**
 * Path options for standard tiers (maxKm 10|25|50).
 * Mirrors school circle styling from PropertyMap.tsx.
 */
const STANDARD_PATH_OPTIONS = {
  color: '#2563eb',
  fillColor: '#2563eb',
  fillOpacity: 0.1,
  weight: 2,
  dashArray: '6 4',
  interactive: false,
} as const;

/**
 * Path options for maxKm=100 (unbounded tier — distinct treatment).
 * More faded to signal the open-ended nature of the distance.
 */
const UNBOUNDED_PATH_OPTIONS = {
  color: '#2563eb',
  fillColor: '#2563eb',
  fillOpacity: 0.06,
  weight: 2,
  dashArray: '8 6',
  opacity: 0.5,
  interactive: false,
} as const;

export function SectorOverlay({ centerLat, centerLon, directionCode, maxKm }: SectorOverlayProps) {
  const positions = useMemo(
    () => buildSectorPolygon(centerLat, centerLon, directionCode, maxKm),
    [centerLat, centerLon, directionCode, maxKm],
  );

  const pathOptions = maxKm === 100 ? UNBOUNDED_PATH_OPTIONS : STANDARD_PATH_OPTIONS;

  return (
    <Polygon
      positions={positions}
      pathOptions={pathOptions}
      // bubblingMouseEvents ensures clicks on the polygon propagate to the map
      // so marker click handlers behind the sector still fire.
      bubblingMouseEvents={true}
      // overlayPane sits below markerPane in Leaflet's default z-order,
      // so markers remain clickable above the sector fill.
      pane="overlayPane"
    />
  );
}
