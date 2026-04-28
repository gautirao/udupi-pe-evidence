import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DiscoverCityListingItem {
  id: string;
  pricePaise?: number;
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
  trustTier?: string | null;
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
}: DiscoverCityListingsParams) {
  const sortedKeys = [...areaKeys].sort();

  return useQuery<DiscoverCityListingsResponse>({
    queryKey: [
      'discover-city-listings',
      city,
      ...sortedKeys,
      limitPerArea,
      minPrice ?? null,
      maxPrice ?? null,
      bedrooms ?? null,
      propertyType ?? null,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      sortedKeys.forEach((k) => params.append('areaKeys', k));
      params.set('limitPerArea', String(limitPerArea));
      if (minPrice != null) params.append('minPrice', String(minPrice));
      if (maxPrice != null) params.append('maxPrice', String(maxPrice));
      if (bedrooms != null) params.append('bedrooms', String(bedrooms));
      if (propertyType) params.append('propertyType', propertyType);
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
