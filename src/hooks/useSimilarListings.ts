import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PropertyImage, PropertyListing } from './usePropertyListings';

export type SimilarListing = PropertyListing & { images: PropertyImage[] };

export function useSimilarListings(
  listingId: string | undefined,
  locality: string | null | undefined,
  propertyType: string | null | undefined
) {
  return useQuery<SimilarListing[]>({
    queryKey: ['similar-listings', listingId, locality, propertyType],
    queryFn: async () => {
      if (!listingId || !locality || !propertyType) return [];

      const { data, error } = await supabase
        .from('property_listings')
        .select('*, raw_posts(images)')
        .eq('locality', locality)
        .eq('property_type', propertyType)
        .eq('is_valid', true)
        .neq('id', listingId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      if (!data) return [];

      return data.map((row: any) => {
        const rawImages = row.raw_posts?.images;
        const images: PropertyImage[] = Array.isArray(rawImages) ? rawImages : [];
        return { ...row, images } as SimilarListing;
      });
    },
    enabled: !!listingId && !!locality && !!propertyType,
    staleTime: 2 * 60 * 1000,
  });
}
