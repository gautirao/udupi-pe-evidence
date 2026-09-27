/**
 * Distance-to-school sort pairing shared by SchoolSelectedPanel and
 * AreaSchoolCombinedPanel — extracted verbatim from SchoolJourneyPanels.tsx
 * (Issue #2661 commit 2, pure-function extraction, no logic changes).
 *
 * Issue #1974 — compute distance once per listing, then sort ascending so the
 * visible card order matches "nearest to school first" instead of server order
 * (created_at DESC). Listings without usable coordinates sort last.
 */
import { haversineKm, sortByDistanceKmAscending } from '@/lib/geo';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

export interface ListingWithDistance {
  listing: DiscoverCityListingItem;
  distanceKm: number | null;
}

/**
 * `school` is typed with non-null latitude/longitude (SchoolResult), but legacy
 * rows may have null at runtime — hence the `as unknown` guards below, preserved
 * verbatim from the pre-extraction source rather than "cleaned up".
 */
export function sortListingsBySchoolDistance(
  listings: DiscoverCityListingItem[],
  school: SchoolResult | null,
): ListingWithDistance[] {
  const withDistance = listings.map((listing) => {
    // Compute real haversine distance — only when both school and listing have coords.
    const distanceKm =
      school != null &&
      (school.latitude as unknown) != null &&
      (school.longitude as unknown) != null &&
      listing.lat != null &&
      listing.lon != null
        ? haversineKm(school.latitude, school.longitude, listing.lat, listing.lon)
        : null;
    return { listing, distanceKm };
  });
  return sortByDistanceKmAscending(withDistance, (pair) => pair.distanceKm);
}
