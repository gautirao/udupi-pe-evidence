import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DiscoverMarker {
  id: string;
  lat: number;
  lon: number;
  pricePaise?: number;
}

export interface DiscoverMarkersResponse {
  city: string;
  markers: DiscoverMarker[];
}

export function useDiscoverMarkers(city: string) {
  return useQuery<DiscoverMarkersResponse>({
    queryKey: ['discover-markers', city],
    queryFn: () =>
      api.get<DiscoverMarkersResponse>(
        `/api/listings/markers?city=${encodeURIComponent(city)}`,
        { skipAuth: true }
      ),
    enabled: city.length > 0,
    staleTime: 300_000,
  });
}
