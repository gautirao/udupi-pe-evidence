import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDiscoverSource, discoverPath, discoverKey } from '@/features/discover/state/DiscoverDataSourceContext';

/**
 * Client freshness for public city listings, mirroring the endpoint's
 * `Cache-Control: max-age=60, public`.
 *
 * Named and exported (Issue #1956 PR 1, FE-3) purely so the AC1.17 inequality
 * "count cache freshness <= listing cache freshness" can be asserted against the
 * REAL value rather than a duplicated literal. The value is unchanged from the
 * inline `60_000` it replaces. See `useDiscoverNavigationCounts.ts`.
 */
export const DISCOVER_CITY_LISTINGS_STALE_TIME_MS = 60_000;

export interface DiscoverCityListingItem {
  id: string;
  pricePaise?: number;
  /**
   * Coarse price band string (e.g. "₹50L–1Cr") returned by the backend for ANONYMOUS
   * callers. Mutually exclusive with pricePaise — the backend sends exactly one of the
   * two (or neither when the DB price is null). Authenticated callers receive pricePaise
   * instead. See #1616 auth-branched price contract.
   */
  priceBand?: string | null;
  /**
   * Issue #2051 — exact monthly rent in RUPEES (NOT paise — do not divide/multiply
   * by 100), returned by the backend for AUTHENTICATED callers when listingPurpose
   * is 'rent' or 'lease' and the stored monthly_rent is > 0. Mutually exclusive with
   * monthlyRentBand — the backend sends exactly one of the two (or neither when the
   * DB rent is null/absent, or the listing is a sale). Anonymous callers receive
   * monthlyRentBand instead. See #1616 auth-branched price contract for the sale
   * analogue (pricePaise/priceBand), which this mirrors.
   */
  monthlyRentRupees?: number;
  /**
   * Issue #2051 — coarse monthly-rent band string (e.g. "₹20–35K") returned by the
   * backend for ANONYMOUS callers when listingPurpose is 'rent' or 'lease'. Mutually
   * exclusive with monthlyRentRupees. Authenticated callers receive monthlyRentRupees
   * instead. Absent/null for sale listings and for rent/lease listings with no valid
   * stored rent.
   */
  monthlyRentBand?: string | null;
  propertyType?: string;
  locality?: string;
  primaryImageUrl?: string | null;
  listingPurpose?: string;
  bedrooms?: number | null;
  title?: string | null;
  bathrooms?: number | null;
  builtArea?: number | null;
  builtAreaUnit?: string | null;
  landArea?: number | null;
  landAreaUnit?: string | null;
  totalFloors?: number | null;
  parkingCount?: number | null;
  furnishingStatus?: string | null;
  createdAt?: string | null;
  /**
   * Issue #1794 Phase 1 — timestamp the listing was last confirmed/reconfirmed as LIVE.
   * Null for listings never confirmed. Never faked or defaulted from createdAt/lastUpdatedAt —
   * a null value must render as honest absence (fall back to createdAt display).
   */
  confirmedAt?: string | null;
  /**
   * Issue #1567 — public-safe trust badge word ("verified"/"trusted"/"listed"), or
   * null/absent when the listing has no badge (D tier, legacy rows, or unknown grade).
   * Never the raw internal letter grade — the backend never sends A/B/C/D on this field.
   */
  trustBadge?: 'verified' | 'trusted' | 'listed' | null;
  lat?: number | null;
  lon?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface DiscoverCityAreaResult {
  areaKey: string;
  areaName: string;
  listings: DiscoverCityListingItem[];
}

interface DiscoverCityListingsResponse {
  city: string;
  limitPerArea: number;
  areas: DiscoverCityAreaResult[];
}

export interface DiscoverCityListingsParams {
  city: string;
  areaKeys: string[];
  limitPerArea?: number;
  /** Price lower bound in paise (backend unit). */
  minPrice?: number;
  /** Price upper bound in paise (backend unit). */
  maxPrice?: number;
  /** BHK count; 4 means "4 or more". Only sent when a single value is selected. */
  bedrooms?: number;
  /** Property type string (case-insensitive on backend). Only sent when a single value is selected. */
  propertyType?: string;
  /** Free-text keyword search forwarded to the backend FTS endpoint. */
  q?: string;
  /** Issue #1494 — buy/rent intent mapped to listingPurpose for the backend. */
  listingPurpose?: string;
  /**
   * Issue #2023 — when true, restricts results to possession_status = 'READY',
   * consistent with the same filter already applied by markers/navigation-counts/
   * authenticated Browse-all via DiscoverListingPredicateBuilder.
   */
  readyToMove?: boolean;
  /**
   * Issue #1616 — auth-branched price contract. When true, the api helper attaches
   * the JWT so the backend returns exact pricePaise (no priceBand). When false/absent,
   * no JWT is sent and the backend returns a coarse priceBand string.
   *
   * This flag is also included in the TanStack Query cache key so that login/logout
   * produces a separate cache bucket — preventing a stale anon (band) response from
   * being served to a freshly-authenticated user and vice versa.
   */
  isAuthenticated?: boolean;
}

/**
 * Fetch listings for one or more area keys within a city.
 * areaKeys are sorted before building the query key to ensure stable cache hits.
 * Each areaKey is individually encodeURIComponent-encoded (values contain '|').
 * Optional filter params (minPrice, maxPrice, bedrooms, propertyType) are forwarded
 * to the backend and included in the query key so the cache invalidates on filter change.
 */
export function useDiscoverCityListings({
  city,
  areaKeys,
  limitPerArea = 5,
  minPrice,
  maxPrice,
  bedrooms,
  propertyType,
  q,
  listingPurpose,
  readyToMove,
  isAuthenticated = false,
}: DiscoverCityListingsParams) {
  // Issue #1911 PR3 — see useDiscoverRegionSummary.ts for the default-context
  // ({mode:'live'}) byte-identical-live-behaviour rationale.
  const source = useDiscoverSource();
  const sortedKeys = [...areaKeys].sort();

  return useQuery<DiscoverCityListingsResponse>({
    queryKey: discoverKey(
      source,
      'discover-city-listings',
      city,
      ...sortedKeys,
      limitPerArea,
      minPrice ?? null,
      maxPrice ?? null,
      bedrooms ?? null,
      propertyType ?? null,
      q?.trim() || null,
      listingPurpose ?? null,
      readyToMove ?? null,
      // Issue #1616: include auth state so login/logout produces a separate cache bucket.
      // Anon callers receive priceBand; authed callers receive pricePaise — they must not
      // share a cache entry or a stale band response would be served post-login.
      isAuthenticated,
    ),
    queryFn: () => {
      // Preview's /listings endpoint (E5) only understands ?areaKeys= — city,
      // price/bedroom/propertyType filters etc. have no meaning against a
      // revision's sandbox graph, so they are intentionally NOT forwarded in
      // preview mode.
      if (source.mode === 'preview') {
        const previewParams = new URLSearchParams();
        sortedKeys.forEach((k) => previewParams.append('areaKeys', k));
        const path = discoverPath(source, '', { kind: 'listings' });
        return api.get<DiscoverCityListingsResponse>(`${path}?${previewParams.toString()}`, {
          skipAuth: false,
        }).then(response => ({
          ...response,
          areas: response.areas.map(area => ({
            ...area,
            listings: area.listings.map(listing => ({
              ...listing,
              id: listing.id ?? `preview:${source.revisionId}:${area.areaKey}`,
            })),
          })),
        }));
      }

      const params = new URLSearchParams();
      sortedKeys.forEach((k) => params.append('areaKeys', k));
      params.set('limitPerArea', String(limitPerArea));
      if (minPrice != null) params.append('minPrice', String(minPrice));
      if (maxPrice != null) params.append('maxPrice', String(maxPrice));
      if (bedrooms != null) params.append('bedrooms', String(bedrooms));
      if (propertyType) params.append('propertyType', propertyType);
      if (q?.trim()) params.append('q', q.trim());
      if (listingPurpose) params.append('listingPurpose', listingPurpose);
      if (readyToMove) params.append('readyToMove', 'true');
      // Issue #1616: do NOT force skipAuth. When the user has a valid session the api
      // helper attaches the JWT (Bearer token) automatically, causing the backend to
      // return exact pricePaise. Anonymous callers have no session so no token is
      // attached and the backend returns a coarse priceBand string instead.
      return api.get<DiscoverCityListingsResponse>(
        `/api/discover/cities/${encodeURIComponent(city)}/listings?${params.toString()}`,
      );
    },
    // Issue #2189 — areaKeys resolving before `city` does previously let this fire
    // with an empty city segment (`/api/discover/cities//listings`, 401). Boolean(city)
    // mirrors the existing city-readiness idiom used by useAreasNavigationJourney.ts
    // and area.ts rather than introducing a second city-validity owner.
    enabled: areaKeys.length > 0 && Boolean(city),
    staleTime: DISCOVER_CITY_LISTINGS_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
}
