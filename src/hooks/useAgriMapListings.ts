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
}

export interface AgriMapListingsResponse {
  city: string;
  listings: AgriMapListingItem[];
}

export const AGRI_MAP_LISTINGS_QUERY_KEY_BASE = ['agri-map-listings'] as const;

export function useAgriMapListings(city: string, areaKeys: string[], listingPurpose?: string) {
  const sortedKeys = [...areaKeys].sort();
  return useQuery<AgriMapListingsResponse>({
    queryKey: [...AGRI_MAP_LISTINGS_QUERY_KEY_BASE, city, listingPurpose ?? null, ...sortedKeys],
    queryFn: async () => {
      const params = new URLSearchParams({ city });
      sortedKeys.forEach(k => params.append('areaKeys', k));
      if (listingPurpose) params.set('listingPurpose', listingPurpose);
      const data = await api.get<AgriMapListingsResponse>(
        `/api/discover/agri-map-listings?${params.toString()}`,
        { skipAuth: true },
      );
      return data;
    },
    enabled: city.length > 0 && areaKeys.length > 0,
    staleTime: 60_000,
  });
}
