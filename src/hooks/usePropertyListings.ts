import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type PropertyType = 'land' | 'house' | 'apartment' | 'commercial' | 'other';

export interface PropertyImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface PropertyListing {
  id: string;
  property_type: PropertyType;
  locality: string | null;
  price: number | null;
  price_unit: string | null;
  land_area: number | null;
  land_area_unit: string | null;
  built_area: number | null;
  built_area_unit: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  contact_info: string | null;
  contact_phone: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence_score: number | null;
  language_detected: string | null;
  is_valid: boolean;
  is_duplicate: boolean;
  created_at: string;
  updated_at: string;
  raw_post_id: string | null;
}

export interface PropertyFilters {
  propertyTypes?: PropertyType[];
  localities?: string[];
  priceMin?: number;
  priceMax?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

export function usePropertyListings(filters?: PropertyFilters) {
  return useQuery({
    queryKey: ['property-listings', filters],
    queryFn: async () => {
      let query = supabase
        .from('property_listings')
        .select('*')
        .eq('is_valid', true)
        .eq('is_duplicate', false)
        .order('created_at', { ascending: false });

      if (filters?.propertyTypes && filters.propertyTypes.length > 0) {
        query = query.in('property_type', filters.propertyTypes);
      }

      if (filters?.localities && filters.localities.length > 0) {
        query = query.in('locality', filters.localities);
      }

      if (filters?.priceMin !== undefined) {
        query = query.gte('price', filters.priceMin);
      }

      if (filters?.priceMax !== undefined) {
        query = query.lte('price', filters.priceMax);
      }

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString());
      }

      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as PropertyListing[];
    },
  });
}

export function useLocalities() {
  return useQuery({
    queryKey: ['localities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_listings')
        .select('locality')
        .eq('is_valid', true)
        .not('locality', 'is', null);

      if (error) throw error;

      // Get unique localities
      const localities = [...new Set(data.map((d) => d.locality).filter(Boolean))] as string[];
      return localities.sort();
    },
  });
}

export function usePriceRange() {
  return useQuery({
    queryKey: ['price-range'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_listings')
        .select('price')
        .eq('is_valid', true)
        .not('price', 'is', null)
        .order('price', { ascending: true });

      if (error) throw error;

      const prices = data.map((d) => d.price).filter((p): p is number => p !== null);
      
      if (prices.length === 0) {
        return { min: 0, max: 10000000 };
      }

      return {
        min: prices[0],
        max: prices[prices.length - 1],
      };
    },
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PropertyListing> }) => {
      const { data, error } = await supabase
        .from('property_listings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-listings'] });
      toast({
        title: 'Listing Updated',
        description: 'The property listing has been updated successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function usePropertyImages(rawPostId: string | null) {
  return useQuery({
    queryKey: ['property-images', rawPostId],
    queryFn: async () => {
      if (!rawPostId) return [];
      
      const { data, error } = await supabase
        .from('raw_posts')
        .select('images')
        .eq('id', rawPostId)
        .single();

      if (error) throw error;
      
      // Parse images from JSONB - need to cast through unknown due to Json type
      const images = (data?.images as unknown) as PropertyImage[] | null;
      return Array.isArray(images) ? images : [];
    },
    enabled: !!rawPostId,
  });
}