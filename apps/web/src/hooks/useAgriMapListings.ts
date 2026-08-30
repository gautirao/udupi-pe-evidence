import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDiscoverSource, discoverPath, discoverKey } from '@/features/discover/state/DiscoverDataSourceContext';

/**
 * Issue #1410 (B3) — fetch agri map listings for a single area key from the
 * public endpoint. Used by MapDiscovery to populate AgriMarkerClusterLayer and
 * AgriPolygonLayer when a destination (town/locality) is selected on the
 * agri-first landing.
 *
 * Issue #2151 PR C (C-F2) — cut over from the legacy repeated `areaKeys` param
 * to the canonical single `areaKey` param. The backend no longer accepts
 * `areaKeys` at all (400 `area_key_required_legacy_area_keys_param_removed`);
 * the corridor-wide "all towns" fetch this hook used to power is replaced by
 * server-computed destination buckets (see useAgriDestinations in
 * useRegionalAreaGroups.ts) — this hook now only ever scopes to ONE selected
 * destination's areaKey (the Level-3 locality drill-down).
 *
 * Query is disabled when city or areaKey is empty so the hook is a no-op
 * when no destination is selected.
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
  /**
   * Issue #2296 (PR #2381 review) — authoritative parcel count for a Level-2
   * agri destination-bucket marker, carried straight from
   * `AgriDestinationBucket.parcelCount` by useAgriDestinationMarkers. Never
   * populated for real Level-3 parcel listings returned by this hook's own
   * endpoint — those don't come from destination buckets, so this field is
   * always `undefined` for them.
   */
  parcelCount?: number | null;
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
  areaKey: string,
  listingPurpose?: string,
  isAuthenticated = false,
) {
  const source = useDiscoverSource();

  // Auth-scope literal — must be FIRST dimension after base key so anon and authed
  // responses never collide in the TanStack Query cache. #2151 Track 3: discoverKey's
  // ['preview', cityId, revisionId] prefix is prepended OUTSIDE/BEFORE this array (not
  // interleaved with authScope) — preserves the existing anon/authed cache-isolation
  // ordering (Issue #1551) while adding preview/live cache isolation on top.
  const authScope = isAuthenticated ? 'authed' : 'anon';
  return useQuery<AgriMapListingsResponse>({
    queryKey: discoverKey(
      source,
      ...AGRI_MAP_LISTINGS_QUERY_KEY_BASE,
      authScope,
      city,
      listingPurpose ?? null,
      areaKey,
    ),
    queryFn: async () => {
      const params = new URLSearchParams({ city, areaKey });
      if (listingPurpose) params.set('listingPurpose', listingPurpose);
      const livePath = `/api/discover/agri-map-listings?${params.toString()}`;
      const path = discoverPath(source, livePath, {
        kind: 'agriMapListings',
        areaKey,
        listingPurpose: listingPurpose ?? null,
      });
      // Live mode: preserve the existing anon/authed skipAuth behaviour unchanged.
      // Preview mode: preview endpoints are admin-authed — skipAuth must be false so
      // the admin JWT is attached, regardless of isAuthenticated (a preview-mode
      // caller is always the admin).
      const options =
        source.mode === 'live'
          ? isAuthenticated
            ? undefined
            : { skipAuth: true as const }
          : { skipAuth: false as const };
      const data = await api.get<AgriMapListingsResponse>(path, options);
      return data;
    },
    enabled: city.length > 0 && areaKey.length > 0,
    staleTime: 120_000,
  });
}
