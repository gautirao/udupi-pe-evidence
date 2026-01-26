import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { PropertyListing, PropertyType } from './usePropertyListings';

export interface DuplicateListing extends PropertyListing {
  raw_posts?: {
    images: Array<{ url: string; alt?: string | null }> | null;
    content: string;
  } | null;
}

export interface DuplicateGroup {
  key: string;
  listings: DuplicateListing[];
}

export function useDuplicateListings() {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['duplicate-listings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_listings')
        .select('*, raw_posts(images, content)')
        .eq('is_duplicate', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as DuplicateListing[];
    },
    enabled: isAdmin,
  });
}

// Find potential originals for a duplicate
export function usePotentialOriginals(duplicate: DuplicateListing | null) {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['potential-originals', duplicate?.id],
    queryFn: async () => {
      if (!duplicate) return [];

      // Build query to find similar non-duplicate listings
      let query = supabase
        .from('property_listings')
        .select('*, raw_posts(images, content)')
        .eq('is_duplicate', false);

      // Match by contact phone if available
      if (duplicate.contact_phone) {
        query = query.eq('contact_phone', duplicate.contact_phone);
      } else {
        // Otherwise match by locality and property type
        if (duplicate.locality) {
          query = query.eq('locality', duplicate.locality);
        }
        query = query.eq('property_type', duplicate.property_type);
      }

      const { data, error } = await query.limit(10);

      if (error) throw error;
      return data as unknown as DuplicateListing[];
    },
    enabled: isAdmin && !!duplicate,
  });
}

export function useDismissDuplicate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (listingId: string) => {
      // Mark as not a duplicate (keeps the listing)
      const { data, error } = await supabase
        .from('property_listings')
        .update({ is_duplicate: false })
        .eq('id', listingId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-listings'] });
      queryClient.invalidateQueries({ queryKey: ['property-listings'] });
      queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
      toast({
        title: 'Duplicate Dismissed',
        description: 'Listing marked as unique.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteDuplicate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (listingId: string) => {
      const { error } = await supabase
        .from('property_listings')
        .delete()
        .eq('id', listingId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-listings'] });
      queryClient.invalidateQueries({ queryKey: ['property-listings'] });
      queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
      toast({
        title: 'Duplicate Deleted',
        description: 'Listing permanently removed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useMergeDuplicate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      duplicateId,
      originalId,
      mergeData,
    }: {
      duplicateId: string;
      originalId: string;
      mergeData?: Partial<PropertyListing>;
    }) => {
      // Update original with merged data if provided
      if (mergeData && Object.keys(mergeData).length > 0) {
        const { error: updateError } = await supabase
          .from('property_listings')
          .update(mergeData)
          .eq('id', originalId);

        if (updateError) throw updateError;
      }

      // Delete the duplicate
      const { error: deleteError } = await supabase
        .from('property_listings')
        .delete()
        .eq('id', duplicateId);

      if (deleteError) throw deleteError;

      return { duplicateId, originalId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-listings'] });
      queryClient.invalidateQueries({ queryKey: ['property-listings'] });
      queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
      toast({
        title: 'Duplicates Merged',
        description: 'Listings merged successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Merge Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Group duplicates by similar properties for easier management
export function groupDuplicates(duplicates: DuplicateListing[]): DuplicateGroup[] {
  const groups = new Map<string, DuplicateListing[]>();

  for (const dup of duplicates) {
    // Create a grouping key based on contact_phone or locality+type
    const key = dup.contact_phone 
      ? `phone:${dup.contact_phone}`
      : `loc:${dup.locality || 'unknown'}_${dup.property_type}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(dup);
  }

  return Array.from(groups.entries()).map(([key, listings]) => ({
    key,
    listings,
  }));
}
