import { cityListingToPropertyListing } from '@/lib/discoverMappers';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';

type AnonMarkerListing = PropertyListing & { images?: PropertyImage[] };

/**
 * Issue #2142 Commit 2 extracted these two functions verbatim, deliberately
 * NOT byte-identical: `resolveGroupResultsAnonMarkers` filtered on
 * `lat`/`lon` only, with no fallback to `latitude`/`longitude` like its
 * `resolveNodeListingsAnonMarkers` sibling (issue #2089's fix for the public
 * `/api/discover/cities/{city}/listings` response, which sends coordinates
 * as `latitude`/`longitude`). That divergence was filed as issue #2145 —
 * group-results anon users saw a populated list but zero map markers
 * whenever the backend response only populated `latitude`/`longitude`.
 *
 * Fixed in #2145 by adding the same fallback to `resolveGroupResultsAnonMarkers`
 * and wiring it into useDiscoverGroupResults.ts's `groupResultsMarkers` anon
 * branch (previously inlined duplicate logic, not this adapter).
 */

/** Moved verbatim from MapDiscovery.tsx's `nodeListingsMarkers` useMemo body. */
export function resolveNodeListingsAnonMarkers(
  nodeListingsAnonData: { areas?: Array<{ listings: DiscoverCityListingItem[] }> } | null | undefined,
  now: string,
): AnonMarkerListing[] {
  const raw = (nodeListingsAnonData?.areas ?? []).flatMap((a) => a.listings);
  return raw
    .map((l) => ({ ...l, lat: l.lat ?? l.latitude, lon: l.lon ?? l.longitude }))
    .filter((l): l is typeof l & { lat: number; lon: number } => l.lat != null && l.lon != null)
    .map((l) => cityListingToPropertyListing({ ...l, lat: l.lat, lon: l.lon }, now));
}

/**
 * Originally moved verbatim from useDiscoverGroupResults.ts's
 * `groupResultsMarkers` useMemo body (anon branch); issue #2145 added the
 * `latitude`/`longitude` fallback to match `resolveNodeListingsAnonMarkers`.
 */
export function resolveGroupResultsAnonMarkers(
  groupResultsAnonRaw: DiscoverCityListingItem[],
  now: string,
): AnonMarkerListing[] {
  if (groupResultsAnonRaw.length === 0) return [];
  return groupResultsAnonRaw
    .map((l) => ({ ...l, lat: l.lat ?? l.latitude, lon: l.lon ?? l.longitude }))
    .filter((l): l is typeof l & { lat: number; lon: number } => l.lat != null && l.lon != null)
    .map((l) => cityListingToPropertyListing({ ...l, lat: l.lat, lon: l.lon }, now));
}
