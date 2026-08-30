import type { NavigationBounds } from '@/lib/schemas/navigationHierarchy';

/** `min, max` lat/lon rounded for a compact cell; full precision centre is left in the tooltip title. */
export function formatBoundsCell(bounds: NavigationBounds | null | undefined): string {
  if (!bounds || bounds.minLat == null || bounds.minLon == null || bounds.maxLat == null || bounds.maxLon == null) {
    return '—';
  }
  return `${bounds.minLat.toFixed(3)}, ${bounds.minLon.toFixed(3)} — ${bounds.maxLat.toFixed(3)}, ${bounds.maxLon.toFixed(3)}`;
}

export function formatBoundsTitle(bounds: NavigationBounds | null | undefined): string {
  if (!bounds || bounds.centreLat == null || bounds.centreLon == null) {
    return '';
  }
  return `centre ${bounds.centreLat}, ${bounds.centreLon}`;
}
