import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Issue #1410 (B3) — fetch agri map listings for a set of area keys from the
 * public endpoint. Used by MapDiscovery to populate AgriMarkerClusterLayer and
 * AgriPolygonLayer when a regional group is selected on the agri-first landing.
 *
 * Query is disabled when city or areaKeys are empty so the hook is a no-op
 * when no group is selected.
 */

export interface AgriMapListingItem {
  id: string;
  areaKey: string;
  latitude: number;
  longitude: number;
  propertyType: string;
  title?: string | null;
  locality?: string | null;
  boundaryGeoJson?: string | null;
  landArea?: number | null;
  landAreaUnit?: string | null;
  computedAreaAcres?: number | null;
  pricePaise?: number | null;
  /** Issue #1494 — buy/rent purpose. Backend 13th field. */
  listingPurpose?: string | null;
  /** Issue #1458 — land category enum (FARMLAND|PLANTATION|FARM_PLOT|AGRICULTURAL_PLOT|OTHER). */
  landCategory?: string | null;
  /** Issue #1458 — whether a farmhouse is available on the plot. */
  farmhouseAvailable?: boolean | null;
  /** Issue #1458 — whether the plot boundary has fencing. */
  fencingDone?: boolean | null;
  /** Issue #1458 — water source enum (WELL|BOREWELL|POND|STREAM|NOT_AVAILABLE|OTHER). */
  waterSource?: string | null;
  /** Issue #1551 — road access enum (TARRED_ROAD|KACHCHA_ROAD|HIGHWAY_FRONTAGE|NO_ROAD_ACCESS|OTHER). Omitted when null. */
  roadAccess?: string | null;
  /** Issue #1551 — soil type enum (RED_LATERITE|BLACK_COTTON|ALLUVIAL|SANDY_LOAM|CLAY|OTHER). Omitted when null. */
  soilType?: string | null;
  /** Issue #1551 — cultivation status enum (CULTIVATED|FALLOW|ARECA_PLANTATION|COCONUT_PLANTATION|PARTIALLY_CULTIVATED|OTHER). Omitted when null. */
  cultivationStatus?: string | null;
  /** Issue #1551 — ownership type enum (FREEHOLD|INHERITED|PATTA|SURVEY_SETTLEMENT|KATHA|REVENUE|OTHER). Omitted when null. */
  ownershipType?: string | null;
  /** Issue #1551 — ISO-8601 timestamp of last update. Omitted when null. */
  updatedAt?: string | null;
}

export interface AgriMapListingsResponse {
  city: string;
  listings: AgriMapListingItem[];
  /** Issue #1460 — true when results were capped at `limit`. */
  truncated: boolean;
  /** Issue #1460 — the cap applied by the backend (e.g. 250). */
  limit: number;
}

export const AGRI_MAP_LISTINGS_QUERY_KEY_BASE = ['agri-map-listings'] as const;

/**
 * Issue #1551 (A5 — SECURITY-CRITICAL):
 * Auth scope is encoded as a LITERAL ('authed' | 'anon') in the cache key BEFORE
 * the skipAuth flag is toggled. This ordering ensures an anon user can never read
 * a cached authed-price response — the two scopes are distinct cache entries.
 *
 * Authed callers: no skipAuth → Authorization header sent → backend returns exact
 *   coords + pricePaise (exact).
 * Anon callers: skipAuth:true → no Authorization header → backend returns coarsened
 *   coords (2 d.p.) + pricePaise: null.
 *
 * Reference: same auth-scope literal pattern used in listingQueryKeys.ts (#1462).
 */
export function useAgriMapListings(
  city: string,
  areaKeys: string[],
  listingPurpose?: string,
  isAuthenticated = false,
) {
  const sortedKeys = [...areaKeys].sort();
  // Auth-scope literal — must be FIRST dimension after base key so anon and authed
  // responses never collide in the TanStack Query cache.
  const authScope = isAuthenticated ? 'authed' : 'anon';
  return useQuery<AgriMapListingsResponse>({
    queryKey: [...AGRI_MAP_LISTINGS_QUERY_KEY_BASE, authScope, city, listingPurpose ?? null, ...sortedKeys],
    queryFn: async () => {
      const params = new URLSearchParams({ city });
      sortedKeys.forEach(k => params.append('areaKeys', k));
      if (listingPurpose) params.set('listingPurpose', listingPurpose);
      const data = await api.get<AgriMapListingsResponse>(
        `/api/discover/agri-map-listings?${params.toString()}`,
        // Authed: send Authorization header so backend returns exact price + coords.
        // Anon: skipAuth:true → no header → backend returns coarsened coords + null price.
        isAuthenticated ? undefined : { skipAuth: true },
      );
      return data;
    },
    enabled: city.length > 0 && areaKeys.length > 0,
    staleTime: 120_000,
  });
}
