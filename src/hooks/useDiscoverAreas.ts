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
  medianPricePaise?: number;
  trendDirection?: string;
  confidenceTier?: string;
}

export interface DiscoverAreasResponse {
  city: string;
  areas: DiscoverArea[];
}

export function useDiscoverAreas(city: string) {
  return useQuery<DiscoverAreasResponse>({
    queryKey: ['discover-areas', city],
    queryFn: () =>
      api.get<DiscoverAreasResponse>(
        `/api/discover/areas?city=${encodeURIComponent(city)}`,
        { skipAuth: true }
      ),
    enabled: city.length > 0,
    staleTime: 300_000,
  });
}
