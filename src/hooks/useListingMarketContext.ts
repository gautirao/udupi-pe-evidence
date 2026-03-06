import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MarketContextDataPoint {
  month: string;
  listingCount: number;
  medianPricePerUnit: number | null;
  p25PricePerUnit: number | null;
  p75PricePerUnit: number | null;
  priceBasis: 'per_sqft' | 'per_cent';
  totalSimilarCount: number;
}

interface UseListingMarketContextParams {
  locality: string | null;
  propertyType: string | null;
  bedrooms?: number | null;
  months?: number;
  enabled?: boolean;
}

export function useListingMarketContext({
  locality,
  propertyType,
  bedrooms = null,
  months = 6,
  enabled = true,
}: UseListingMarketContextParams) {
  return useQuery<MarketContextDataPoint[]>({
    queryKey: ['listing-market-context', locality, propertyType, bedrooms, months],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_listing_market_context', {
        p_locality: locality,
        p_property_type: propertyType,
        p_bedrooms: bedrooms ?? null,
        p_months: months,
      });

      if (error) throw error;
      if (!data || !Array.isArray(data)) return [];

      return (data as any[]).map((row) => ({
        month: row.month as string,
        listingCount: row.listing_count as number,
        medianPricePerUnit: row.median_price_per_unit as number | null,
        p25PricePerUnit: row.p25_price_per_unit as number | null,
        p75PricePerUnit: row.p75_price_per_unit as number | null,
        priceBasis: row.price_basis as 'per_sqft' | 'per_cent',
        totalSimilarCount: row.total_similar_count as number,
      }));
    },
    enabled: enabled && !!locality && !!propertyType,
    staleTime: 5 * 60 * 1000,
  });
}
