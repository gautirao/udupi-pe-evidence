import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

/**
 * Synthetic areaKey written into the AreaPoint returned by computeGroupBounds.
 *
 * Callers that receive an AreaPoint from computeGroupBounds must treat this key
 * as a sentinel — it does NOT correspond to a real area and must never be passed
 * to selectArea, marker click handlers, or any API that expects a real areaKey.
 */
export const GROUP_BOUNDS_SYNTHETIC_KEY = '__group_bounds__';

/**
 * Fallback margin in degrees applied when an AreaPoint has no bbox.
 * ±0.05° ≈ 5.5 km — generous enough to give context around a single point.
 */
const FALLBACK_MARGIN_DEG = 0.05;

/**
 * Compute a synthetic AreaPoint whose bbox covers all supplied member areas.
 *
 * - 0 members  → null  (caller should skip fitBounds)
 * - 1+ members → AreaPoint with merged bbox:
 *     • If an area has a bbox, its corners contribute to the union.
 *     • If an area has no bbox, geo_center_lat/lon ± FALLBACK_MARGIN_DEG is used.
 *
 * The returned object is shaped as an AreaPoint so it can be passed directly to
 * PropertyMap's panToArea prop, which calls map.fitBounds(area.bbox, ...).
 *
 * Members whose areaKey does not appear in memberAreas are silently ignored
 * (partial membership is handled by the caller filtering discoverAreas to group.area_keys).
 */
export function computeGroupBounds(memberAreas: AreaPoint[]): AreaPoint | null {
  if (memberAreas.length === 0) return null;

  let minS = Infinity;
  let minW = Infinity;
  let maxN = -Infinity;
  let maxE = -Infinity;

  for (const area of memberAreas) {
    if (area.bbox) {
      const [[s, w], [n, e]] = area.bbox;
      if (s < minS) minS = s;
      if (w < minW) minW = w;
      if (n > maxN) maxN = n;
      if (e > maxE) maxE = e;
    } else {
      // No bbox — use center ± margin as a fallback bounding box.
      const lat = area.geo_center_lat;
      const lon = area.geo_center_lon;
      if (lat - FALLBACK_MARGIN_DEG < minS) minS = lat - FALLBACK_MARGIN_DEG;
      if (lon - FALLBACK_MARGIN_DEG < minW) minW = lon - FALLBACK_MARGIN_DEG;
      if (lat + FALLBACK_MARGIN_DEG > maxN) maxN = lat + FALLBACK_MARGIN_DEG;
      if (lon + FALLBACK_MARGIN_DEG > maxE) maxE = lon + FALLBACK_MARGIN_DEG;
    }
  }

  // Compute a representative center from the merged bbox midpoint.
  const centerLat = (minS + maxN) / 2;
  const centerLon = (minW + maxE) / 2;

  return {
    areaKey: GROUP_BOUNDS_SYNTHETIC_KEY,
    areaLabel: '',
    geo_center_lat: centerLat,
    geo_center_lon: centerLon,
    bbox: [[minS, minW], [maxN, maxE]],
  };
}
