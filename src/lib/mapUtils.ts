/** Pure utilities for map locality computations. */

export interface WithCoords {
  latitude?: number | null;
  longitude?: number | null;
  locality?: string | null;
}

/**
 * Compute the bounding box that fits all listings whose locality is in the
 * given set. Returns null when the set is empty or no matching listing has
 * coordinates.
 */
export function computeFocusBounds(
  listingsWithCoords: WithCoords[],
  localities: string[]
): [[number, number], [number, number]] | null {
  if (localities.length === 0) return null;
  const matched = listingsWithCoords.filter(
    (l) => l.locality && localities.includes(l.locality)
  );
  if (matched.length === 0) return null;
  const lats = matched.map((l) => l.latitude!);
  const lngs = matched.map((l) => l.longitude!);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

/**
 * Returns the top-N localities by listing count, sorted descending.
 */
export function computeTopLocalities(
  listingsWithCoords: WithCoords[],
  n = 6
): { locality: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const l of listingsWithCoords) {
    if (l.locality) counts.set(l.locality, (counts.get(l.locality) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([locality, count]) => ({ locality, count }));
}
