import { useQuery, useQueries } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useListingMarketContext } from './useListingMarketContext';

// ===== Type Definitions from Backend API =====

export interface AreaPriceData {
  areaKey: string;
  listingCount: number;
  medianPricePerCentPaise: number | null;
  cityMedianPricePerCentPaise: number | null;
  priceIndex: number | null;
}

export interface PriceTrendData {
  weekStartDate: string;
  medianPricePerCentPaise: number | null;
  listingCount: number;
  p25PricePerCentPaise: number | null;
  p75PricePerCentPaise: number | null;
}

export interface NewListingData {
  id: string;
  propertyType: string;
  locality: string | null;
  areaKey: string | null;
  areaLabel: string | null;
  pricePaise: number | null;
  pricePerCentPaise: number | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string | null;
}

export interface RecommendationData {
  id: string;
  propertyType: string;
  locality: string | null;
  areaKey: string | null;
  areaLabel: string | null;
  pricePaise: number | null;
  pricePerCentPaise: number | null;
  medianPricePerCentPaise: number | null;
  undervaluationScore: number | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string | null;
}

// Spring Data Page wrapper — backend returns this for paginated endpoints.
interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

// ===== Custom Hooks =====

/**
 * Fetch average price by area (median prices per area)
 */
export function useAvgPriceByArea(options?: { enabled?: boolean }) {
  return useQuery<AreaPriceData[]>({
    queryKey: ['insights', 'avg-price-by-area'],
    queryFn: async () => {
      return api.get<AreaPriceData[]>('/api/insights/avg-price-by-area');
    },
    enabled: options?.enabled ?? true,
  });
}

/**
 * Fetch price trend for a specific area (weekly data)
 * @param areaKey - The area key to fetch trends for
 * @param enabled - Whether the query should run (default: true if areaKey exists)
 */
export function usePriceTrend(areaKey: string | null, enabled = true) {
  return useQuery<PriceTrendData[]>({
    queryKey: ['insights', 'price-trend', areaKey],
    queryFn: async () => {
      if (!areaKey) return [];
      return api.get<PriceTrendData[]>(`/api/insights/price-trend?area_key=${encodeURIComponent(areaKey)}`);
    },
    enabled: enabled && !!areaKey,
  });
}

/**
 * Fetch new listings in user's saved areas
 * @param days - Number of days to look back (default: 7)
 */
export function useNewListings(days = 7, options?: { enabled?: boolean }) {
  return useQuery<NewListingData[]>({
    queryKey: ['insights', 'new-listings', days],
    queryFn: async () => {
      // Backend returns Page<NewListingResponse> — extract the content array.
      const page = await api.get<SpringPage<NewListingData>>(`/api/insights/new-listings?days=${days}`);
      return page.content;
    },
    enabled: options?.enabled ?? true,
  });
}

/**
 * Wraps useListingMarketContext for the Insights price trend chart.
 * Uses areaKey as the locality parameter (same concept in the Udupi context).
 */
export function useAreaMarketTrend(
  areaKey: string | null,
  propertyType: 'apartment' | 'house',
  enabled = true
) {
  return useListingMarketContext({
    locality: areaKey,
    propertyType,
    bedrooms: null,
    enabled: enabled && !!areaKey,
  });
}

/**
 * Fetch price trends for multiple areas simultaneously (for comparison chart).
 * Results are ordered to match the input areaKeys array.
 */
export function useMultiAreaTrend(areaKeys: string[], enabled = true) {
  return useQueries({
    queries: areaKeys.map((areaKey) => ({
      queryKey: ['insights', 'price-trend', areaKey],
      queryFn: async () => {
        if (!areaKey) return [] as PriceTrendData[];
        return api.get<PriceTrendData[]>(`/api/insights/price-trend?area_key=${encodeURIComponent(areaKey)}`);
      },
      enabled: enabled && !!areaKey,
    })),
  });
}

/**
 * Fetch top recommendations based on user's saved areas
 */
export function useRecommendations(options?: { enabled?: boolean }) {
  return useQuery<RecommendationData[]>({
    queryKey: ['insights', 'recommendations'],
    queryFn: async () => {
      // Backend returns Page<RecommendationResponse> — extract the content array.
      const page = await api.get<SpringPage<RecommendationData>>('/api/insights/recommendations');
      return page.content;
    },
    enabled: options?.enabled ?? true,
  });
}
