import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AreaOverviewResponse {
  areaKey: string;
  areaLabel: string;
  districtKey: string;
  districtLabel: string;
  confidence: 'full' | 'limited' | 'fallback';
  listingCount90d: number;
  snapshot: {
    medianPricePaise: number | null;
    priceP10Paise: number | null;
    priceP90Paise: number | null;
    propertyTypeDist: Record<string, number> | null;
    trendDirection: 'rising' | 'falling' | 'stable' | null;
    trendPctChange: number | null;
  } | null;
  fallback: {
    level: string;
    districtKey: string;
    districtLabel: string;
    listingCount90d: number;
  } | null;
  comparison: Array<{
    areaKey: string;
    areaLabel: string;
    medianPricePaise: number | null;
    listingCount90d: number;
    trendDirection: 'rising' | 'falling' | 'stable' | null;
    isApproximate: boolean;
  }>;
  schools: Array<{
    id: string;
    name: string;
    distanceKm: number;
    board: string | null;
    prominenceTier: 'notable' | 'directory' | null;
  }>;
  activity: { activeCount: number; new30d: number } | null;
}

const QUERY_KEY_BASE = ['area-overview'] as const;

export function useAreaOverview(areaKey: string) {
  return useQuery<AreaOverviewResponse>({
    queryKey: [...QUERY_KEY_BASE, areaKey],
    queryFn: () =>
      api.get<AreaOverviewResponse>(
        `/api/public/areas/${encodeURIComponent(areaKey)}/overview`,
        { skipAuth: true },
      ),
    enabled: areaKey.length > 0,
    staleTime: 300_000,
  });
}
