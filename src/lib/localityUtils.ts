import { toast } from '@/hooks/use-toast';

// === City Configuration ===
export interface CityConfig {
  label: string;
  center: [number, number];
  zoom: number;
}

export const CITY_CONFIG: Record<string, CityConfig> = {
  udupi: { label: 'Udupi', center: [13.3409, 74.7421], zoom: 11 },
  kundapur: { label: 'Kundapur', center: [13.6218, 74.6943], zoom: 12 },
  mangalore: { label: 'Mangalore', center: [12.9141, 74.856], zoom: 12 },
  bangalore: { label: 'Bangalore', center: [12.9716, 77.5946] as [number, number], zoom: 11 },
};

export const DEFAULT_CITY = 'udupi';
export const LOCALITY_CAP = 3;

/** Maps the district segment (pipe-index 2) of an areaKey to its URL city slug. */
export const DISTRICT_TO_CITY_SLUG: Record<string, string> = {
  Bengaluru: 'bangalore',
  Mangalore: 'mangalore',
  Udupi: 'udupi',
};

// === Shared Locality Toggle ===
/**
 * Toggle a locality in the selection. Returns the new localities array, or
 * undefined if the array is empty. Returns null (no-op) if at cap and trying to add.
 */
export function toggleLocality(
  currentLocalities: string[] | undefined,
  locality: string,
  cap: number = LOCALITY_CAP,
): string[] | undefined | null {
  const current = currentLocalities ?? [];
  if (current.includes(locality)) {
    // Always allow deselect
    const next = current.filter((l) => l !== locality);
    return next.length > 0 ? next : undefined;
  }
  // Adding — check cap
  if (current.length >= cap) {
    toast({
      title: 'Maximum 3 areas selected',
      description: 'Remove one to add another.',
    });
    return null; // signal: no change
  }
  return [...current, locality];
}

/** Check if locality selection is at cap */
export function isAtCap(localities: string[] | undefined, cap: number = LOCALITY_CAP): boolean {
  return (localities?.length ?? 0) >= cap;
}

// === City Filtering ===
/** Filter items to those whose district-level areaKey resolves to citySlug. */
export function filterByCity<T extends { areaKey: string | null }>(
  items: T[],
  citySlug: string
): T[] {
  if (!CITY_CONFIG[citySlug]) return [];
  return items.filter((item) => {
    if (!item.areaKey) return false;
    const sep = item.areaKey.indexOf(':');
    if (sep < 0) return false;
    return (
      item.areaKey.slice(0, sep) === 'district' &&
      DISTRICT_TO_CITY_SLUG[item.areaKey.slice(sep + 1)] === citySlug
    );
  });
}

// === Adjacency / Nearby ===
interface LocalityWithCoords {
  locality: string;
  lat: number;
  lng: number;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Compute centroids for each locality from listing coordinates,
 * then return nearby localities sorted by distance.
 */
export function computeNearbyLocalities(
  listings: { latitude?: number | null; longitude?: number | null; locality?: string | null }[],
  selectedLocality: string,
  maxDistanceKm: number = 15,
  maxResults: number = 5,
): string[] {
  // Compute centroids per locality
  const sums = new Map<string, { lat: number; lng: number; count: number }>();
  for (const l of listings) {
    if (!l.locality || !l.latitude || !l.longitude) continue;
    const existing = sums.get(l.locality) ?? { lat: 0, lng: 0, count: 0 };
    existing.lat += l.latitude;
    existing.lng += l.longitude;
    existing.count += 1;
    sums.set(l.locality, existing);
  }

  const centroids: LocalityWithCoords[] = [];
  for (const [locality, { lat, lng, count }] of sums) {
    centroids.push({ locality, lat: lat / count, lng: lng / count });
  }

  const selectedCentroid = centroids.find((c) => c.locality === selectedLocality);
  if (!selectedCentroid) return [];

  return centroids
    .filter((c) => c.locality !== selectedLocality)
    .map((c) => ({
      locality: c.locality,
      distance: haversineKm(selectedCentroid.lat, selectedCentroid.lng, c.lat, c.lng),
    }))
    .filter((c) => c.distance <= maxDistanceKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults)
    .map((c) => c.locality);
}
