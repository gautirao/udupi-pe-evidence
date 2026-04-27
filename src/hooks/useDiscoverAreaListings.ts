import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DiscoverAreaListingItem {
  id: string;
  title?: string;
  pricePaise?: number;
  propertyType?: string;
  locality?: string;
  listingPurpose?: string;
  primaryImageUrl?: string;
  areaKey?: string;
}

export interface DiscoverAreaListingsResponse {
  areaKey: string;
  page: number;
  size: number;
  listings: DiscoverAreaListingItem[];
}

export function useDiscoverAreaListings(areaKey: string, page = 0, size = 20) {
  return useQuery<DiscoverAreaListingsResponse>({
    queryKey: ['discover-area-listings', areaKey, page, size],
    queryFn: () =>
      api.get<DiscoverAreaListingsResponse>(
        `/api/discover/areas/${encodeURIComponent(areaKey)}/listings?page=${page}&size=${size}`,
        { skipAuth: true }
      ),
    enabled: areaKey.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
