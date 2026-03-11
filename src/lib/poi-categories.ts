export const CATEGORY_LABELS: Record<string, string> = {
  WORSHIP: 'Place of Worship',
  HOSPITAL: 'Hospital / Clinic',
  SCHOOL: 'School / University',
  HOTEL: 'Hotel',
  TRANSPORT: 'Bus / Transit',
  AIRPORT: 'Airport',
  GROCERY: 'Supermarket / Market',
  TOWN_CENTER: 'Town center',
  VILLAGE_CENTER: 'Village',
  HIGHWAY: 'Road access',
};

export const CATEGORY_ICONS: Record<string, string> = {
  WORSHIP: '🛕',
  HOSPITAL: '🏥',
  SCHOOL: '🏫',
  HOTEL: '🏨',
  TRANSPORT: '🚌',
  AIRPORT: '✈',
  GROCERY: '🛒',
  TOWN_CENTER: '🏙',
  VILLAGE_CENTER: '🏘',
  HIGHWAY: '🛣',
};

/** Settlement categories — auto-computed by backend, never curated by dealers. */
export const SETTLEMENT_CATEGORIES = new Set(['TOWN_CENTER', 'VILLAGE_CENTER', 'HIGHWAY']);

/** Amenity categories — curated by dealers. */
export const AMENITY_CATEGORY_ORDER = [
  'TRANSPORT', 'GROCERY', 'HOSPITAL', 'SCHOOL', 'WORSHIP', 'HOTEL', 'AIRPORT',
] as const;

/** Commercial visible amenity categories (SCHOOL and WORSHIP suppressed). */
export const COMMERCIAL_AMENITY_ORDER = ['TRANSPORT', 'HOSPITAL', 'GROCERY', 'HOTEL', 'AIRPORT'] as const;

export function formatDistance(distanceMeters: number | null): string {
  if (distanceMeters == null) return 'manual';
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  } else if (distanceMeters < 10_000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  } else {
    return `${Math.round(distanceMeters / 1000)} km`;
  }
}

/** Format distance — alias kept for call-sites that want "(approx.)" semantics. */
export function formatDistanceApprox(distanceMeters: number | null): string {
  return formatDistance(distanceMeters);
}
