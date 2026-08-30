/** Haversine great-circle distance in kilometres between two lat/lon points. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Sorts items ascending by a precomputed distanceKm, so callers compute distance
 * once (e.g. via haversineKm) and this only orders it — never recomputes it.
 * Items with a non-finite distance (null/undefined/NaN — no usable coordinates)
 * sort after all finite-distance items. Array.prototype.sort is stable in all
 * supported engines, so equal-distance items and items that are all non-finite
 * keep their original relative order (deterministic tie behaviour).
 */
export function sortByDistanceKmAscending<T>(
  items: readonly T[],
  distanceOf: (item: T) => number | null | undefined,
): T[] {
  return [...items].sort((a, b) => {
    const da = distanceOf(a);
    const db = distanceOf(b);
    const aFinite = typeof da === 'number' && Number.isFinite(da);
    const bFinite = typeof db === 'number' && Number.isFinite(db);
    if (aFinite && bFinite) return (da as number) - (db as number);
    if (aFinite !== bFinite) return aFinite ? -1 : 1;
    return 0;
  });
}

/**
 * Geodesic destination point using haversine/spherical earth model.
 * Returns [lat, lon] of the point at distance distanceKm from (lat, lon)
 * along initial bearing bearingDeg (degrees, 0=N, 90=E, 180=S, 270=W).
 * Uses R = 6371 km.
 */
export function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceKm: number,
): [number, number] {
  const R = 6371;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const θ = (bearingDeg * Math.PI) / 180;
  const d = distanceKm;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(d / R) +
      Math.cos(φ1) * Math.sin(d / R) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(d / R) * Math.cos(φ1),
      Math.cos(d / R) - Math.sin(φ1) * Math.sin(φ2),
    );

  return [(φ2 * 180) / Math.PI, (λ2 * 180) / Math.PI];
}

/** Centre bearings for each cardinal/intercardinal direction. */
const DIRECTION_CENTRE_BEARING: Record<
  'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW',
  number
> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

/**
 * Build sector polygon vertices for a directional search-area overlay.
 * Returns array of [lat, lon] pairs forming a closed wedge.
 *
 * Direction → centre bearing:
 *   N=0, NE=45, E=90, SE=135, S=180, SW=225, W=270, NW=315
 * Angular span: 45° total (±22.5° from centre).
 * N wraps: startBearing=337.5°, endBearing=22.5° (crosses 0°/360° meridian).
 *   Sampled from 337.5° to 382.5° using bearing % 360 to normalise each vertex.
 * maxKm=10: apex at centroid (wedge from origin).
 * maxKm=100: outer radius capped at 100 km.
 * Arc sampling step: 2° (≥23 vertices for a 45° arc).
 * Polygon: [apex/centroid, ...outerArcVertices, apex/centroid] (closed).
 *
 * No turf.js. No planar degree-offset (uses destinationPoint for all vertices).
 */
export function buildSectorPolygon(
  centerLat: number,
  centerLon: number,
  directionCode: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW',
  maxKm: 10 | 25 | 50 | 100,
): [number, number][] {
  const centreBearing = DIRECTION_CENTRE_BEARING[directionCode];
  // Half-span of 22.5° on each side of centre bearing.
  // For N (centre=0): start=337.5, sample from 337.5 to 337.5+45=382.5,
  // then normalise each bearing with % 360 to avoid discontinuity.
  const startBearing = centreBearing - 22.5;
  const ARC_STEP = 2; // degrees
  const ARC_SPAN = 45; // degrees
  const apex: [number, number] = [centerLat, centerLon];

  const arcVertices: [number, number][] = [];
  // Sample from startBearing to startBearing+ARC_SPAN (inclusive) at ARC_STEP intervals.
  // Using raw (possibly > 360) bearings and normalising: avoids N-wrap discontinuity.
  for (let rawBearing = startBearing; rawBearing <= startBearing + ARC_SPAN + 1e-9; rawBearing += ARC_STEP) {
    const normBearing = ((rawBearing % 360) + 360) % 360;
    arcVertices.push(destinationPoint(centerLat, centerLon, normBearing, maxKm));
  }

  // Closed polygon: apex → outer arc → back to apex
  return [apex, ...arcVertices, apex];
}

/**
 * Returns the tightest axis-aligned bounding box that encloses the full sector
 * polygon computed by buildSectorPolygon. Used by map-fit logic to frame the
 * directional cone in the viewport.
 */
export function getSectorBounds(
  centerLat: number,
  centerLon: number,
  directionCode: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW',
  maxKm: 10 | 25 | 50 | 100,
): [[number, number], [number, number]] | null {
  const polygon = buildSectorPolygon(centerLat, centerLon, directionCode, maxKm);
  if (!polygon.length) return null;
  const lats = polygon.map(p => p[0]);
  const lons = polygon.map(p => p[1]);
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
}
