import { cityListingToPropertyListing } from '@/lib/discoverMappers';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';

type AnonMarkerListing = PropertyListing & { images?: PropertyImage[] };

/**
 * Issue #2142 Commit 2 — R7 adapter extraction, with a stop condition.
 *
 * MapDiscovery.tsx (nodeListingsMarkers) and useDiscoverGroupResults.ts
 * (groupResultsMarkers) each independently derive map markers from an
 * anonymous city-listings teaser response. The approved plan asked for ONE
 * `anonMarkerAdapter` IF the two implementations are byte-identical
 * (differential-tested), per R7.
 *
 * They are NOT byte-identical — see anonMarkerAdapter.test.ts's R7
 * differential test. `resolveNodeListingsAnonMarkers` (moved verbatim from
 * MapDiscovery.tsx) falls back from `lat`/`lon` to `latitude`/`longitude`
 * before filtering (issue #2089's fix: the public
 * `/api/discover/cities/{city}/listings` response sends coordinates as
 * `latitude`/`longitude`, not `lat`/`lon`). `resolveGroupResultsAnonMarkers`
 * (moved verbatim from useDiscoverGroupResults.ts, NOT edited — that file
 * is outside this commit's allowed_files) filters on `lat`/`lon` ONLY, with
 * no such fallback.
 *
 * This means useDiscoverGroupResults.ts's anon marker path likely carries
 * the SAME bug #2089 fixed on the node-listings path — group-results anon
 * users may see zero map markers despite listings resolving correctly in
 * the right panel. This is a real, pre-existing, out-of-this-refactor
 * product bug (issue #2142 non-goals: "Fixing any real product bug
 * discovered during extraction (file separately)") — reported to
 * team-lead, NOT fixed here. Forcing a false convergence (silently adding
 * the fallback to a function this refactor claims is "zero-assertion-
 * change") would be exactly the kind of latent behavior change this
 * commit's zero-assertion-change bar exists to prevent.
 *
 * Two separately-named functions, per the plan's own stop-condition
 * language ("keep two separately-named adapters"), each moved verbatim —
 * no logic changed, only relocated.
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

/** Moved verbatim from useDiscoverGroupResults.ts's `groupResultsMarkers` useMemo body (anon branch). */
export function resolveGroupResultsAnonMarkers(
  groupResultsAnonRaw: DiscoverCityListingItem[],
  now: string,
): AnonMarkerListing[] {
  if (groupResultsAnonRaw.length === 0) return [];
  return groupResultsAnonRaw
    .filter((l) => l.lat != null && l.lon != null)
    .map((l) => cityListingToPropertyListing(
      { ...l, lat: l.lat as number, lon: l.lon as number },
      now,
    ));
}
