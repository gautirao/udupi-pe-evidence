import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

/**
 * Issue #2015 — anonymous "Search this area" (VIEWPORT `resultScope`) presentation type.
 *
 * Backed exclusively by the public, unauthenticated `GET /api/discover/cities/{city}/listings`
 * bbox-only mode (see `CityAreaListingsController`/`CityAreaListingsService`) — never the
 * auth-only `/api/discover/markers` or `/api/discover/listings` endpoints (#1118 constraint).
 *
 * `Omit<DiscoverCityListingItem, 'pricePaise' | 'monthlyRentRupees'>` is deliberate defence in
 * depth: the base type carries those exact-price fields as optional (for the authenticated
 * consumers of the same shared shape), but the backend never populates them for an anonymous
 * caller. Omitting the keys here means this type structurally CANNOT carry an exact price,
 * regardless of what `mapAnonViewportCard` is handed — anon viewport rendering must use
 * `priceBand`/`monthlyRentBand` only.
 */
export type AnonViewportListingItem = Omit<
  DiscoverCityListingItem,
  'pricePaise' | 'monthlyRentRupees'
> & {
  /**
   * Discriminant tag distinguishing this anon bbox-derived shape from the authenticated
   * marker/listing shapes elsewhere in the map data layer. Lets consumers narrow at the
   * type level without relying on `isAuthenticated`/`resultScope.kind` re-checks.
   */
  kind: 'ANON_VIEWPORT';
  /**
   * The `area_key` the backend discovered this listing under. In bbox-only mode the
   * response groups by each listing's own area (not a requested area list — see
   * `CityAreaListingsResponse` javadoc), so this is carried per-listing rather than
   * assumed from a single `selectedArea`.
   */
  areaKey: string | null;
};

/**
 * Normalizes one raw `DiscoverCityListingItem` (as returned inside a
 * `CityAreaListingsResponse.areas[].listings[]` entry) into the `AnonViewportListingItem`
 * presentation shape, tagging it with the area it was discovered under.
 *
 * Mirrors the `mapSchoolRadiusCard` precedent (`useSchoolRadiusListings.ts`): a flat,
 * anon-safe, map-consumable normalization function independent of any single-area lookup.
 */
export function mapAnonViewportCard(
  c: DiscoverCityListingItem,
  areaKey: string | null,
): AnonViewportListingItem {
  return {
    id: c.id,
    // #2015 hard constraint: never forward pricePaise/monthlyRentRupees even if a future
    // backend response were to include them — anon viewport rendering is band-only.
    priceBand: c.priceBand ?? null,
    monthlyRentBand: c.monthlyRentBand ?? null,
    propertyType: c.propertyType,
    locality: c.locality,
    primaryImageUrl: c.primaryImageUrl ?? null,
    listingPurpose: c.listingPurpose,
    bedrooms: c.bedrooms ?? null,
    title: c.title ?? null,
    bathrooms: c.bathrooms ?? null,
    builtArea: c.builtArea ?? null,
    builtAreaUnit: c.builtAreaUnit ?? null,
    landArea: c.landArea ?? null,
    landAreaUnit: c.landAreaUnit ?? null,
    totalFloors: c.totalFloors ?? null,
    parkingCount: c.parkingCount ?? null,
    furnishingStatus: c.furnishingStatus ?? null,
    createdAt: c.createdAt ?? null,
    confirmedAt: c.confirmedAt ?? null,
    trustBadge: c.trustBadge ?? null,
    lat: c.lat ?? null,
    lon: c.lon ?? null,
    latitude: c.latitude ?? null,
    longitude: c.longitude ?? null,
    kind: 'ANON_VIEWPORT',
    areaKey,
  };
}
