import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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

// ===== Custom Hooks =====

/**
 * Fetch average price by area (median prices per area)
 */
export function useAvgPriceByArea() {
  return useQuery<AreaPriceData[]>({
    queryKey: ['insights', 'avg-price-by-area'],
    queryFn: async () => {
      return api.get<AreaPriceData[]>('/api/insights/avg-price-by-area');
    },
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
export function useNewListings(days = 7) {
  return useQuery<NewListingData[]>({
    queryKey: ['insights', 'new-listings', days],
    queryFn: async () => {
      return api.get<NewListingData[]>(`/api/insights/new-listings?days=${days}`);
    },
  });
}

/**
 * Fetch top recommendations based on user's saved areas
 */
export function useRecommendations() {
  return useQuery<RecommendationData[]>({
    queryKey: ['insights', 'recommendations'],
    queryFn: async () => {
      return api.get<RecommendationData[]>('/api/insights/recommendations');
    },
  });
}
