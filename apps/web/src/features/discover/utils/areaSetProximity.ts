import type { NearbyAreaCandidate } from '@/hooks/useNearbyAreaCandidates';

// Issue #2017 reskin (design-mock parity pass) — haversine great-circle
// distance in km, used to label each nearby-area candidate row with either
// "Adjacent to {nearest selected area}" (within ADJACENCY_THRESHOLD_KM of an
// already-selected area's center) or "{X.X} km away" otherwise. Pure client-
// side derived-display logic (formatting), not a business rule — matches the
// "Frontend may contain: derived display values" boundary.
//
// Extracted (owner-directed desktop rework, issue #2017) so both the mobile
// popover (AreaSetChips.tsx) and the desktop in-panel view
// (AreaSetDraftPanel.tsx) compute this identically from one place, instead
// of two independently-maintained copies of the same formula.
const EARTH_RADIUS_KM = 6371;
const ADJACENCY_THRESHOLD_KM = 0.75;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface SelectedAreaGeo {
  name: string;
  lat: number;
  lon: number;
}

/**
 * Distance/adjacency label for a nearby-area candidate, computed against
 * whichever SELECTED area is geographically nearest to it (not just the
 * first/primary selected area) — a candidate can be adjacent to a
 * later-added area rather than the first one.
 */
export function areaSetProximityLabel(
  candidate: Pick<NearbyAreaCandidate, 'geoCenterLat' | 'geoCenterLon'>,
  selectedAreaGeoByKey: Map<string, SelectedAreaGeo>,
): string {
  let nearestName: string | null = null;
  let nearestKm = Infinity;
  selectedAreaGeoByKey.forEach((selected) => {
    const km = haversineKm(selected.lat, selected.lon, candidate.geoCenterLat, candidate.geoCenterLon);
    if (km < nearestKm) {
      nearestKm = km;
      nearestName = selected.name;
    }
  });
  if (nearestName === null) return '';
  return nearestKm <= ADJACENCY_THRESHOLD_KM ? `Adjacent to ${nearestName}` : `${nearestKm.toFixed(1)} km away`;
}
