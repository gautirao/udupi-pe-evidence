import { useMemo } from 'react';
import { destinationPoint } from '@/lib/geo';
import { AGRICULTURAL_LAND_PROPERTY_TYPE } from '@/lib/listing-constants';
import type { AgriDestinationBucket } from '@/hooks/useRegionalAreaGroups';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

export interface UseAgriDestinationMarkersParams {
  agriDestinations: AgriDestinationBucket[];
  cityLat: number | undefined;
  cityLon: number | undefined;
}

/**
 * Issue #2186 — synthesizes one map marker per Level-2 agri destination (town/locality)
 * bucket, since the backend deliberately omits exact coordinates from
 * `/api/discover/agri-destinations` (anti-drift guard —
 * `agriDestinationBucketResponse_hasNoPriceOrExactCoordinateFields`). Each marker's
 * position is derived client-side from the bucket's server-computed bearing/distance,
 * projected off the SAME fixed city origin the corridor sector overlay uses
 * (SectorOverlay.tsx / CITY_CONFIG[city].center) — never a second source of truth.
 *
 * The result is shaped as AgriMapListingItem (not a new marker type) so it can be fed
 * straight into PropertyMap's existing `agriGroupListings` prop / `adaptAgriMapListingsToMarkers`
 * pipeline unchanged. `id`/`areaKey` are both the bucket's canonical `areaKey` — the two
 * are read at different points downstream (adaptAgriMapListingsToMarkers keys markers off
 * `id`; the click-to-drill routing in useMarkerSelection reads `areaKey`).
 *
 * Issue #2296 (PR #2381 review, Level-2 contract fix):
 *  - `parcelCount` is now carried straight from `AgriDestinationBucket.parcelCount`
 *    (the authoritative per-destination count) onto each returned item, so
 *    AgriMarkerClusterLayer can render the true per-destination parcel count
 *    instead of a synthetic marker/cluster-child count.
 *  - Buckets with `parcelCount === 0` are omitted entirely — a destination with
 *    zero parcels for the current filters has nothing for the marker to
 *    represent, and MUST NOT render an empty/misleading marker.
 *  - `id`/`areaKey` identity is unchanged, so click-to-drill routing
 *    (useMarkerSelection reads `areaKey`) is unaffected.
 */
export function useAgriDestinationMarkers({
  agriDestinations,
  cityLat,
  cityLon,
}: UseAgriDestinationMarkersParams): AgriMapListingItem[] {
  return useMemo(() => {
    if (cityLat == null || cityLon == null) return [];
    return agriDestinations
      .filter((bucket) => bucket.parcelCount > 0)
      .map((bucket): AgriMapListingItem => {
        const [latitude, longitude] = destinationPoint(
          cityLat,
          cityLon,
          bucket.bearingDeg,
          bucket.distanceKm,
        );
        return {
          id: bucket.areaKey,
          areaKey: bucket.areaKey,
          latitude,
          longitude,
          propertyType: AGRICULTURAL_LAND_PROPERTY_TYPE,
          title: bucket.displayName,
          locality: bucket.displayName,
          computedAreaAcres: bucket.parcelAcreage ?? null,
          parcelCount: bucket.parcelCount,
        };
      });
  }, [agriDestinations, cityLat, cityLon]);
}
