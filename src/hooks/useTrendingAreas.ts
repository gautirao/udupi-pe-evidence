import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDiscoverSource } from '@/features/discover/state/DiscoverDataSourceContext';

interface TrendingArea {
  areaKey: string;
  areaLabel: string;
  districtLabel: string | null;
  medianPricePaise: number | null;
  listingCount90d: number;
}

interface TrendingAreasResponse {
  areas: TrendingArea[];
}

const QUERY_KEY_BASE = ['trending-areas'] as const;

export function useTrendingAreas() {
  const source = useDiscoverSource();
  const { data, isLoading, isError } = useQuery<TrendingAreasResponse>({
    queryKey: [...QUERY_KEY_BASE, source.mode],
    queryFn: () =>
      api.get<TrendingAreasResponse>('/api/public/areas/trending?limit=6', {
        skipAuth: true,
      }),
    staleTime: 300_000,
    enabled: source.mode !== 'preview',
  });

  return {
    areas: data?.areas ?? [],
    isLoading,
    isError,
  };
}
