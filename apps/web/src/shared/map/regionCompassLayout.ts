/**
 * Pure, Leaflet-free geometry for the top-level Discover map's 9 macro-region
 * cluster markers (city landing — mapLayerKind === 'macro-region-bubbles').
 *
 * These markers are navigational compass selectors, not geographic centroid
 * pins: `region_key` is expected to be a stable backend-derived direction
 * code — one of the 9 CENTRAL_CARDINAL_8 keys (CityRegionProjection.java,
 * backend) — CENTRAL, N, NE, E, SE, S, SW, W, NW. In practice the backend
 * also emits full-word direction codes (e.g. "southeast", "northeast",
 * "southwest"); those are normalised to the short form at the client
 * boundary before reaching this module. This module maps the (normalised)
 * key to a presentation position on a single screen-space circle around a
 * layout centre, so the
 * on-screen arrangement visibly matches its compass meaning regardless of
 * each region's real (often irregular) aggregated centroid.
 *
 * Callers (AreaMarkerLayer.tsx) convert the returned {x,y} container point
 * to a lat/lng via `map.containerPointToLatLng` ONLY for where the marker is
 * DRAWN — the region's real geo_center_lat/lon and bbox are untouched and
 * still used for click navigation / camera fitting. Never apply this to
 * zone, corridor, area, or listing markers — those need real geo positions.
 */

/** The 8 outer CENTRAL_CARDINAL_8 direction keys (CENTRAL has no angle — it IS the centre). */
export type CompassDirectionKey = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export const CENTRAL_REGION_KEY = 'CENTRAL';

/**
 * Canonical compass angle in degrees, clockwise from screen "up" (12 o'clock),
 * matching standard screen-space trig where y increases downward:
 *   x = centerX + radius * cos(angle), y = centerY + radius * sin(angle)
 * N (12 o'clock) needs (dx=0, dy=-1) → angle -90°; E (3 o'clock) needs
 * (dx=1, dy=0) → angle 0°; S (6 o'clock) → 90°; W (9 o'clock) → 180°.
 */
export const COMPASS_ANGLE_DEG: Record<CompassDirectionKey, number> = {
  N: -90,
  NE: -45,
  E: 0,
  SE: 45,
  S: 90,
  SW: 135,
  W: 180,
  NW: 225,
};

export function isCentralRegionKey(regionKey: string): boolean {
  return regionKey === CENTRAL_REGION_KEY;
}

function isCompassDirectionKey(regionKey: string): regionKey is CompassDirectionKey {
  return Object.prototype.hasOwnProperty.call(COMPASS_ANGLE_DEG, regionKey);
}

export interface CompassLayout {
  /** Layout-centre container-point X (the point CENTRAL renders at). */
  centerX: number;
  /** Layout-centre container-point Y. */
  centerY: number;
  /** Shared screen-space radius for all 8 outer markers. */
  radius: number;
}

export interface ContainerPoint {
  x: number;
  y: number;
}

/**
 * Deterministic fallback angle (degrees, same clockwise-from-12-o'clock
 * convention as `COMPASS_ANGLE_DEG`) for a region/direction code that isn't
 * in the known CENTRAL_CARDINAL_8 vocabulary. Derived purely from the
 * code's own characters (a small FNV-1a-style hash), so:
 *   - it is a pure function of the input (same unknown code -> same angle,
 *     every render, no hidden state);
 *   - two DIFFERENT unknown codes land at different angles instead of both
 *     collapsing onto the layout centre and stacking into one invisible,
 *     unclickable control (issue #1956 AC6.9 — see compassPointFor below).
 * This is a presentation safety net only: it never invents a "correct"
 * position for an unrecognised code, it just guarantees unrecognised codes
 * don't silently overlap each other or a real marker at the exact centre.
 */
function fallbackAngleDegForUnknownCode(code: string): number {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = (Math.imul(hash, 31) + code.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/**
 * Presentation container-point for a macro-region marker, given its stable
 * `region_key` and the shared circle layout. CENTRAL always resolves to the
 * exact layout centre; every other (8-sector) key resolves to the same
 * `radius` distance from that centre, at its canonical compass angle.
 *
 * An unrecognised key (never expected under the CENTRAL_CARDINAL_8 model,
 * but reachable if a caller passes through a code this table doesn't know —
 * see AreaMarkerLayer.tsx's shared normalizeCompassRegionCode(), used by
 * BOTH its Direction-marker caller (issue #1956 AC6.9) and its macro-region
 * bubble caller (issue #1956 macro-region sibling ruling, 2026-08-03)) is a
 * data anomaly this function must survive without throwing, but
 * it must NOT silently collapse to the layout centre either: that previously
 * turned every unrecognised code into the SAME point, so several unrelated
 * unknown codes stacked into one invisible, unclickable marker. Instead it
 * emits a dev-visible diagnostic and resolves to a deterministic off-centre
 * position (still on the shared radius, so it renders as a real, clickable
 * marker) derived from the code itself, so distinct unknown codes fan out
 * instead of colliding.
 */
export function compassPointFor(regionKey: string, layout: CompassLayout): ContainerPoint {
  if (isCentralRegionKey(regionKey)) {
    return { x: layout.centerX, y: layout.centerY };
  }
  if (!isCompassDirectionKey(regionKey)) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[regionCompassLayout] Unrecognised compass/direction code "${regionKey}" — ` +
          'rendering at a deterministic fallback position instead of the layout centre ' +
          'so it does not silently overlap another marker.',
      );
    }
    const angleRad = (fallbackAngleDegForUnknownCode(regionKey) * Math.PI) / 180;
    return {
      x: layout.centerX + layout.radius * Math.cos(angleRad),
      y: layout.centerY + layout.radius * Math.sin(angleRad),
    };
  }
  const angleRad = (COMPASS_ANGLE_DEG[regionKey] * Math.PI) / 180;
  return {
    x: layout.centerX + layout.radius * Math.cos(angleRad),
    y: layout.centerY + layout.radius * Math.sin(angleRad),
  };
}

/** Circle radius bounds (px) — never smaller/larger regardless of viewport. */
const MIN_RADIUS_PX = 70;
const MAX_RADIUS_PX = 160;
/** Half the 92px marker circle (AreaMarkerLayer.tsx makeAreaCard isMacroRegion branch). */
const MARKER_RADIUS_PX = 46;
/** Vertical room for the "Tap to zoom in ›" pill rendered below the marker on hover/focus. */
const CAPTION_ALLOWANCE_PX = 34;
/** Clearance from the map's own edges/controls (zoom control, attribution, etc). */
const EDGE_PADDING_PX = 24;

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Derives the single shared radius for all 8 outer markers from the map
 * container's current pixel dimensions, so the full circle (marker diameter
 * + hover caption + edge padding) always fits inside the viewport. Every
 * outer marker uses this SAME radius — never adjusted per-marker.
 */
export function computeSafeCompassRadius(containerWidth: number, containerHeight: number): number {
  const usableHalfWidth = containerWidth / 2 - MARKER_RADIUS_PX - EDGE_PADDING_PX;
  const usableHalfHeight =
    containerHeight / 2 - MARKER_RADIUS_PX - CAPTION_ALLOWANCE_PX - EDGE_PADDING_PX;
  const safeRadius = Math.min(usableHalfWidth, usableHalfHeight);
  return clamp(MIN_RADIUS_PX, safeRadius, MAX_RADIUS_PX);
}

/**
 * Builds the full compass layout (centre + shared radius) from the map
 * container's current pixel size. The layout centre is the container's own
 * midpoint — at the bare city landing the map is already fit to the city's
 * bounds, so this reads as "the city centre" without depending on any single
 * region's (often approximate/aggregated) centroid, and stays correct if the
 * user pans before the layout next recomputes.
 */
export function computeCompassLayout(containerWidth: number, containerHeight: number): CompassLayout {
  return {
    centerX: containerWidth / 2,
    centerY: containerHeight / 2,
    radius: computeSafeCompassRadius(containerWidth, containerHeight),
  };
}
