import { useQuery } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * contact_phone/contact_info are revoked from browser-facing Supabase grants
 * (V128) — the only real access path is the admin_get_listing_contacts RPC
 * (see useDuplicateManagement.ts for the established pattern this mirrors).
 * That RPC isn't in the generated `Database` type, hence the narrow cast.
 */
type AdminContactRpcClient = {
  rpc(
    fn: 'admin_get_listing_contacts',
    args: { p_listing_ids: string[] },
  ): PromiseLike<{
    data: { id: string; contact_phone: string | null; contact_info: string | null }[] | null;
    error: PostgrestError | null;
  }>;
};

const adminContactRpc = supabase as unknown as AdminContactRpcClient;

export interface AdminListingContact {
  contact_phone: string | null;
  contact_info: string | null;
}

/**
 * Fetches contact details for a SINGLE listing, for display in the editor
 * drawer's broker/contact section only. Never call this in a loop or from
 * the table — the RPC is not a search mechanism and must never be used for
 * bulk enrichment or phone search (both real, deliberate gaps — see the
 * issue's real capability map).
 */
export function useAdminListingContact(listingId: string | null, enabled: boolean) {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin-listing-contact', listingId],
    queryFn: async (): Promise<AdminListingContact> => {
      if (!listingId) return { contact_phone: null, contact_info: null };
      const { data, error } = await adminContactRpc.rpc('admin_get_listing_contacts', {
        p_listing_ids: [listingId],
      });
      if (error) throw error;
      const row = data?.[0];
      return {
        contact_phone: row?.contact_phone ?? null,
        contact_info: row?.contact_info ?? null,
      };
    },
    enabled: isAdmin && enabled && !!listingId,
    staleTime: 60_000,
  });
}
