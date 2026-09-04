import type { CameraIntent } from '@/hooks/useDiscoverMapData';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

// Issue #2017 (Step 7) — pure union-bbox helper for the multi-area AREA_SET
// "commit search" camera intent. Mirrors nearbyAreaSuggestions.ts's
// null-safety idiom: DiscoverArea.minLat/minLon/maxLat/maxLon are ALL
// optional, so any area missing bounds falls back to its geoCenterLat/
// geoCenterLon point (guaranteed present) instead of being dropped from the
// union entirely.

export interface AreaSetCameraTarget {
  bounds: CameraIntent['bounds'];
  center: [number, number];
}

/**
 * Computes ONE bounding box + centre spanning every area in `areaKeys`,
 * resolved against `areas` (the full DiscoverArea rows, with bounds). Areas
 * not found in `areas` (not yet loaded, or an unknown key) are skipped.
 * Returns null when nothing resolves — callers should no-op in that case
 * rather than publish a degenerate/city-wide camera intent.
 */
export function computeAreaSetCameraTarget(
  areaKeys: string[],
  areas: DiscoverArea[],
): AreaSetCameraTarget | null {
  const byKey = new Map(areas.map((area) => [area.areaKey, area]));
  const selected = areaKeys.flatMap((key) => {
    const area = byKey.get(key);
    return area ? [area] : [];
  });

  if (selected.length === 0) return null;

  let south = Number.POSITIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let hasBounds = false;

  let latSum = 0;
  let lonSum = 0;

  for (const area of selected) {
    latSum += area.geoCenterLat;
    lonSum += area.geoCenterLon;

    if (
      area.minLat != null &&
      area.minLon != null &&
      area.maxLat != null &&
      area.maxLon != null
    ) {
      hasBounds = true;
      south = Math.min(south, area.minLat);
      west = Math.min(west, area.minLon);
      north = Math.max(north, area.maxLat);
      east = Math.max(east, area.maxLon);
    } else {
      // No bbox for this area — fold its centre point into the union so a
      // single unbounded area doesn't get excluded from framing, but do NOT
      // set hasBounds here: a point has no extent, so if EVERY selected area
      // lacks a real bbox, `bounds` should stay null and the caller should
      // fall back to `center`-only framing instead of a degenerate box.
      south = Math.min(south, area.geoCenterLat);
      west = Math.min(west, area.geoCenterLon);
      north = Math.max(north, area.geoCenterLat);
      east = Math.max(east, area.geoCenterLon);
    }
  }

  const center: [number, number] = [latSum / selected.length, lonSum / selected.length];

  return {
    bounds: hasBounds ? [[south, west], [north, east]] : null,
    center,
  };
}
