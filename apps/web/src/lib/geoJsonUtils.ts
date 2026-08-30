/**
 * GeoJSON serialization helpers for agricultural plot boundary drawing.
 *
 * Coordinate ordering:
 *   DrawControl emits / accepts [lat, lng][]
 *   GeoJSON Polygon requires [lng, lat][][] (closed ring)
 *
 * Backend contract: boundary is a stringified GeoJSON Polygon, NOT a nested object.
 */

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // [[[lng, lat], ...]] — closed ring
}

/**
 * Returns true if coords has >=3 distinct points (ignoring consecutive duplicates).
 */
export function isValidPolygon(coords: [number, number][]): boolean {
  if (coords.length < 3) return false;
  // Deduplicate consecutive identical points
  const distinct: [number, number][] = [];
  for (const pt of coords) {
    const last = distinct[distinct.length - 1];
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) {
      distinct.push(pt);
    }
  }
  return distinct.length >= 3;
}

/**
 * Convert DrawControl's [lat, lng][] to a GeoJSON Polygon string for the PUT API.
 * Returns null if fewer than 3 distinct points.
 * Coordinate order: DrawControl gives [lat, lng]; GeoJSON requires [lng, lat].
 */
export function toGeoJsonString(coords: [number, number][]): string | null {
  if (!isValidPolygon(coords)) return null;

  // Map [lat, lng] → [lng, lat] for GeoJSON
  const ring: number[][] = coords.map(([lat, lng]) => [lng, lat]);
  // Append closing point to form a closed ring; read from ring[0] (already flipped)
  ring.push(ring[0]);

  const polygon: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [ring],
  };
  return JSON.stringify(polygon);
}

/**
 * Parse the API's boundary string back to [lat, lng][] for DrawControl.polygon prop.
 * Returns [] on parse error or empty/null input.
 * Strips the closing ring duplicate.
 */
export function fromGeoJsonString(
  boundaryStr: string | null | undefined,
): [number, number][] {
  if (!boundaryStr) return [];
  try {
    const parsed = JSON.parse(boundaryStr) as GeoJsonPolygon;
    // AC8: only proceed for Polygon type — Point, LineString etc. return []
    if (!parsed || typeof parsed !== 'object' || parsed.type !== 'Polygon') {
      return [];
    }
    const ring: number[][] = parsed.coordinates[0];
    if (!Array.isArray(ring) || ring.length < 4) return [];
    // Drop the closing duplicate (last point equals first)
    const open = ring.slice(0, ring.length - 1);
    // Map [lng, lat] → [lat, lng]
    return open.map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch {
    return [];
  }
}
