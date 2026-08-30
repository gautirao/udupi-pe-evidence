/**
 * Derive truthful school-zone (area-group) label positions for the map.
 *
 * Positioning priority (NEVER fabricated):
 *   1. The group's own focus point (AreaGroup.focus_lat/lon) — surfaced from the
 *      backend area-groups DTO (focusLat/focusLon). Durable, backend-authored.
 *   2. The bounds-centre of the group's resolved member-area coordinates
 *      (geo_center_lat/lon from the areas table) — a geometric label anchor, not
 *      a claim about a precise place.
 *
 * A group with neither a focus point nor a single resolvable member area is
 * dropped (returns no label) — the map degrades honestly rather than guessing.
 *
 * This is pure (no React/Leaflet) so it can be unit-tested directly.
 */
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { ZoneLabelPoint } from '@/components/map/SchoolZoneLabelLayer';

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Build zone label points from the loaded groups and the city's area markers.
 *
 * @param groups  Area groups for the city (from useAreaGroups).
 * @param areas   Area markers with geo_center_lat/lon (from the areas table).
 * @returns       One ZoneLabelPoint per group that has a usable position.
 */
export function computeZoneLabelPoints(
  groups: AreaGroup[],
  areas: AreaPoint[],
): ZoneLabelPoint[] {
  // Index member-area coordinates + school counts by areaKey.
  const areaByKey = new Map<string, AreaPoint>();
  for (const a of areas) areaByKey.set(a.areaKey, a);

  const points: ZoneLabelPoint[] = [];

  for (const group of groups) {
    // Resolve this group's member areas that actually carry coordinates.
    const members: AreaPoint[] = [];
    for (const key of group.area_keys) {
      const a = areaByKey.get(key);
      if (a && isFiniteNumber(a.geo_center_lat) && isFiniteNumber(a.geo_center_lon)) {
        members.push(a);
      }
    }

    // Σ schools across resolved members — only when at least one member resolved,
    // and only counting areas that report a numeric schoolCount.
    let schoolCount: number | null = null;
    if (members.length > 0) {
      let sum = 0;
      let counted = 0;
      for (const m of members) {
        if (isFiniteNumber(m.schoolCount)) {
          sum += m.schoolCount as number;
          counted += 1;
        }
      }
      schoolCount = counted > 0 ? sum : null;
    }

    // 1) Prefer the backend-authored focus point.
    let lat: number | null = null;
    let lon: number | null = null;
    if (isFiniteNumber(group.focus_lat) && isFiniteNumber(group.focus_lon)) {
      lat = group.focus_lat as number;
      lon = group.focus_lon as number;
    } else if (members.length > 0) {
      // 2) Fall back to the bounds-centre of member-area centres. Bounds-centre
      //    (midpoint of min/max) is less skewed by clustering than a plain mean.
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLon = Infinity;
      let maxLon = -Infinity;
      for (const m of members) {
        minLat = Math.min(minLat, m.geo_center_lat);
        maxLat = Math.max(maxLat, m.geo_center_lat);
        minLon = Math.min(minLon, m.geo_center_lon);
        maxLon = Math.max(maxLon, m.geo_center_lon);
      }
      lat = (minLat + maxLat) / 2;
      lon = (minLon + maxLon) / 2;
    }

    // No truthful position available → drop this label.
    if (lat == null || lon == null) continue;

    points.push({
      groupId: group.id,
      label: group.name,
      lat,
      lon,
      schoolCount,
    });
  }

  return points;
}
