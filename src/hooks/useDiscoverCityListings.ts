import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DiscoverCityListingItem {
  id: string;
  pricePaise?: number;
  propertyType?: string;
  locality?: string;
  primaryImageUrl?: string | null;
  listingPurpose?: string;
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

/**
 * Fetch listings for one or more area keys within a city.
 * areaKeys are sorted before building the query key to ensure stable cache hits.
 * Each areaKey is individually encodeURIComponent-encoded (values contain '|').
 */
export function useDiscoverCityListings(
  city: string,
  areaKeys: string[],
  limitPerArea = 5,
) {
  const sortedKeys = [...areaKeys].sort();

  return useQuery<DiscoverCityListingsResponse>({
    queryKey: ['discover-city-listings', city, ...sortedKeys, limitPerArea],
    queryFn: () => {
      const params = new URLSearchParams();
      sortedKeys.forEach((k) => params.append('areaKeys', k));
      params.set('limitPerArea', String(limitPerArea));
      return api.get<DiscoverCityListingsResponse>(
        `/api/discover/cities/${encodeURIComponent(city)}/listings?${params.toString()}`,
        { skipAuth: true },
      );
    },
    enabled: areaKeys.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
