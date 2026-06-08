import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DiscoverArea {
  areaKey: string;
  name: string;
  geoCenterLat: number;
  geoCenterLon: number;
  minLat?: number;
  minLon?: number;
  maxLat?: number;
  maxLon?: number;
  listingCount: number;
  schoolCount: number;
  medianPricePaise?: number;
  trendDirection?: string;
  confidenceTier?: string;
  /**
   * Issue #1371 — agri-only acreage summary. Present ONLY in filtered responses
   * (?propertyType=agricultural_land) where the backend can derive an aggregate
   * from parseable land-area data. Absent (undefined) in blended responses.
   */
  agriAcreage?: number;
}

export interface DiscoverAreasResponse {
  city: string;
  areas: DiscoverArea[];
}

/**
 * Fetch area summaries for a city.
 *
 * @param city - City identifier (e.g. 'udupi'). Empty string disables the query.
 * @param propertyType - Optional singular filter. When provided (e.g. 'agricultural_land'),
 *   appended as &propertyType=... AND included in the queryKey so React Query cannot
 *   cross-serve the blended and filtered caches (AC10 cache-key requirement).
 *   Omitting it preserves byte-identical behaviour + queryKey vs. the prior signature.
 */
export function useDiscoverAreas(city: string, propertyType?: string) {
  return useQuery<DiscoverAreasResponse>({
    queryKey: propertyType
      ? ['discover-areas', city, propertyType]
      : ['discover-areas', city],
    queryFn: () => {
      const url = propertyType
        ? `/api/discover/areas?city=${encodeURIComponent(city)}&propertyType=${encodeURIComponent(propertyType)}`
        : `/api/discover/areas?city=${encodeURIComponent(city)}`;
      return api.get<DiscoverAreasResponse>(url, { skipAuth: true });
    },
    enabled: city.length > 0,
    staleTime: 300_000,
  });
}
