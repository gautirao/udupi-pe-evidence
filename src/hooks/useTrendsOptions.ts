import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface TrendsOption {
  areaKey: string;
  areaLabel: string;
}

export interface TrendsOptionsResponse {
  city: string;
  defaultAreas: TrendsOption[];
}

export function useTrendsOptions(city: string, fetchEnabled = true) {
  return useQuery<TrendsOptionsResponse>({
    queryKey: ['trends-options', city],
    queryFn: () =>
      api.get<TrendsOptionsResponse>(`/api/trends/options?city=${encodeURIComponent(city)}`, { skipAuth: true }),
    enabled: city.length > 0 && fetchEnabled,
    staleTime: 300_000,
  });
}
