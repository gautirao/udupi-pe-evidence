export const CATEGORY_LABELS: Record<string, string> = {
  WORSHIP: 'Place of Worship',
  HOSPITAL: 'Hospital / Clinic',
  SCHOOL: 'School / University',
  HOTEL: 'Hotel',
  TRANSPORT: 'Bus / Transit',
  AIRPORT: 'Airport',
  GROCERY: 'Supermarket / Market',
};

export const CATEGORY_ICONS: Record<string, string> = {
  WORSHIP: '🛕',
  HOSPITAL: '🏥',
  SCHOOL: '🏫',
  HOTEL: '🏨',
  TRANSPORT: '🚌',
  AIRPORT: '✈',
  GROCERY: '🛒',
};

export function formatDistance(distanceMeters: number | null): string {
  if (distanceMeters == null) return 'manual';
  if (distanceMeters < 1000) return `${distanceMeters} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}
