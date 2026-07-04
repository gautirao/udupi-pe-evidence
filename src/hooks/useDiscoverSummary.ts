import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type DiscoverSummaryGroupBy = 'area_group' | 'corridor';

export interface DiscoverSummaryParams {
  city: string;
  propertyType?: string;
  groupBy?: DiscoverSummaryGroupBy;
  hotspotLimit?: number;
}

export interface DiscoverSummaryRegion {
  regionKey: string;
  regionLabel: string;
  listingCount: number;
}

export interface DiscoverSummaryHotspot {
  areaKey: string;
  name: string;
  listingCount: number;
  geoCenterLat: number;
  geoCenterLon: number;
}

export interface DiscoverSummaryResponse {
  city: string;
  propertyType: string | null;
  groupBy: string;
  totalActiveListings: number;
  regions: DiscoverSummaryRegion[];
  hotspots: DiscoverSummaryHotspot[];
  generatedAt: string;
}

const DEFAULT_HOTSPOT_LIMIT = 8;
const MIN_HOTSPOT_LIMIT = 1;
const MAX_HOTSPOT_LIMIT = 20;

function clampHotspotLimit(hotspotLimit?: number): number {
  if (hotspotLimit === undefined || Number.isNaN(hotspotLimit)) {
    return DEFAULT_HOTSPOT_LIMIT;
  }
  return Math.min(MAX_HOTSPOT_LIMIT, Math.max(MIN_HOTSPOT_LIMIT, Math.trunc(hotspotLimit)));
}

/**
 * Fetch the aggregate Discover summary (region counts + hotspots) for a city.
 *
 * Visual consumption (rendering into Discover pages/components) is deferred to a
 * future P7 PR — this hook is contract-only for now.
 */
export function useDiscoverSummary({ city, propertyType, groupBy, hotspotLimit }: DiscoverSummaryParams) {
  const trimmedPropertyType = propertyType?.trim();
  const effectiveHotspotLimit = clampHotspotLimit(hotspotLimit);

  return useQuery<DiscoverSummaryResponse>({
    queryKey: [
      'discover-summary',
      city,
      trimmedPropertyType ?? null,
      groupBy ?? 'area_group',
      effectiveHotspotLimit,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('city', city);
      if (trimmedPropertyType) {
        params.set('propertyType', trimmedPropertyType);
      }
      if (groupBy) {
        params.set('groupBy', groupBy);
      }
      params.set('hotspotLimit', String(effectiveHotspotLimit));

      return api.get<DiscoverSummaryResponse>(`/api/discover/summary?${params.toString()}`, {
        skipAuth: true,
      });
    },
    enabled: city.trim().length > 0,
    staleTime: 300_000,
  });
}
