import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { PropertyListing, PropertyType } from './usePropertyListings';
import { propertyListingSelect } from '@/integrations/supabase/propertyListingColumns';

export interface DuplicateListing extends PropertyListing {
  // contact_info/contact_phone stay PropertyListing's base-optional `string |
  // null | undefined` here: usePotentialOriginals() below casts
  // propertyListingSelect(...) rows straight to this type and never calls
  // withAdminContacts, so on those rows the keys are genuinely absent at
  // runtime. Only useDuplicateListings() enriches every row — see
  // DuplicateListingWithContacts, which is the type that actually holds that
  // stronger guarantee.
  raw_posts?: {
    images: Array<{ url: string; alt?: string | null }> | null;
    content: string;
  } | null;
}

/**
 * Returned only by useDuplicateListings(), which always enriches its rows via
 * withAdminContacts()/admin_get_listing_contacts before returning, so both
 * fields are genuinely present (non-optional) here. Do not widen this back to
 * plain DuplicateListing for that hook — usePotentialOriginals()'s rows don't
 * carry this guarantee.
 */
export interface DuplicateListingWithContacts extends DuplicateListing {
  contact_info: string | null;
  contact_phone: string | null;
}

export interface DuplicateGroup {
  key: string;
  listings: DuplicateListing[];
}

/**
 * The V128 admin-only contact RPCs (issue #2280) aren't in the generated `Database`
 * type — that file is codegen'd from the PostgREST schema cache and isn't
 * regenerated for this backend-only migration — so calling them through the typed
 * `supabase` client needs this narrow cast instead of `any`.
 */
type AdminContactRpcClient = {
  rpc(
    fn: 'admin_find_contact_duplicate_candidates',
    args: { p_duplicate_id: string; p_limit?: number },
  ): PromiseLike<{ data: { id: string }[] | null; error: PostgrestError | null }>;
  rpc(
    fn: 'admin_get_listing_contacts',
    args: { p_listing_ids: string[] },
  ): PromiseLike<{ data: { id: string; contact_phone: string | null; contact_info: string | null }[] | null; error: PostgrestError | null }>;
};

const adminContactRpc = supabase as unknown as AdminContactRpcClient;

// The RPC raises past this, but batching keeps every call comfortably under it.
const ADMIN_CONTACT_RPC_CHUNK_SIZE = 200;

async function withAdminContacts<T extends { id: string }>(listings: T[]): Promise<T[]> {
  if (listings.length === 0) return listings;

  const contactsById = new Map<string, { contact_phone: string | null; contact_info: string | null }>();
  for (let i = 0; i < listings.length; i += ADMIN_CONTACT_RPC_CHUNK_SIZE) {
    const chunkIds = listings.slice(i, i + ADMIN_CONTACT_RPC_CHUNK_SIZE).map((l) => l.id);
    const { data, error } = await adminContactRpc.rpc('admin_get_listing_contacts', { p_listing_ids: chunkIds });
    if (error) throw error;
    for (const row of data ?? []) {
      contactsById.set(row.id, { contact_phone: row.contact_phone, contact_info: row.contact_info });
    }
  }

  return listings.map((listing) => ({
    ...listing,
    ...(contactsById.get(listing.id) ?? { contact_phone: null, contact_info: null }),
  }));
}

export function useDuplicateListings() {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['duplicate-listings'],
    queryFn: async (): Promise<DuplicateListingWithContacts[]> => {
      const { data, error } = await supabase
        .from('property_listings')
        .select(propertyListingSelect('raw_posts(images, content)'))
        .eq('is_duplicate', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const listings = data as unknown as DuplicateListing[];
      // isAdmin is a UI/efficiency hint here, not the security boundary — the RPC
      // itself raises for non-admins. `enabled: isAdmin` below already keeps this
      // queryFn from running for them at all, so the `!isAdmin` branch is
      // unreachable in practice; the cast there just documents that this hook's
      // stronger (contacts-present) return type only actually holds once
      // withAdminContacts has run.
      if (!isAdmin) return listings as DuplicateListingWithContacts[];
      return withAdminContacts(listings) as Promise<DuplicateListingWithContacts[]>;
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

      // Match by contact phone if available, resolved server-side from the
      // duplicate's own id so the client never needs the phone value itself.
      if (duplicate.contact_phone) {
        const { data: candidates, error: rpcError } = await adminContactRpc.rpc(
          'admin_find_contact_duplicate_candidates',
          { p_duplicate_id: duplicate.id, p_limit: 10 },
        );
        if (rpcError) throw rpcError;

        const candidateIds = (candidates ?? []).map((row) => row.id);
        if (candidateIds.length === 0) return [];

        const { data, error } = await supabase
          .from('property_listings')
          .select(propertyListingSelect('raw_posts(images, content)'))
          .eq('is_duplicate', false)
          .in('id', candidateIds);

        if (error) throw error;
        return data as unknown as DuplicateListing[];
      }

      // Otherwise match by locality and property type
      let query = supabase
        .from('property_listings')
        .select(propertyListingSelect('raw_posts(images, content)'))
        .eq('is_duplicate', false);

      if (duplicate.locality) {
        query = query.eq('locality', duplicate.locality);
      }
      query = query.eq('property_type', duplicate.property_type);

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
      // Mark as not a duplicate (keeps the listing). No caller consumes the
      // updated row, so this intentionally skips `.select()` (Prefer:
      // return=minimal) rather than requesting the 161-column projection for a
      // value nobody reads — see propertyListingColumns.ts for why a bare
      // `.select()` here would 42501 under V128's revoked contact-column grants.
      const { error } = await supabase
        .from('property_listings')
        .update({ is_duplicate: false })
        .eq('id', listingId);

      if (error) throw error;
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
