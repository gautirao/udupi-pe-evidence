import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { listingKeys } from '@/lib/listingQueryKeys';

/**
 * Saved-homes API (#1566). Every endpoint is JWT-gated — there is no anonymous
 * saved-listings concept — so all hooks below are `enabled: isAuthenticated` and the
 * backend derives the user id from the JWT (a listingId is the only client input).
 *
 * Compact card shape returned by GET /api/me/saved-listings. Mirrors
 * backend/.../savedlistings/SavedListingCard.java exactly (Jackson NON_NULL — absent
 * fields are omitted, not sent as null — hence the optional `?` rather than `| null`).
 */
export interface SavedListingCard {
  id: string;
  listingId: string;
  savedAt?: string;
  title?: string;
  pricePaise?: number;
  propertyType?: string;
  locality?: string;
  primaryImageUrl?: string;
  listingPurpose?: string;
  bedrooms?: number;
  bathrooms?: number;
  builtArea?: number;
  builtAreaUnit?: string;
  landArea?: number;
  landAreaUnit?: string;
  /** Listing lifecycle status (e.g. LIVE, ARCHIVED). */
  status?: string;
  /** true when the listing is LIVE and not archived; false → badge "no longer available". */
  available: boolean;
}

interface SaveListingResponse {
  listingId: string;
  saved: boolean;
}

function authRequiredToast(toast: ReturnType<typeof useToast>['toast'], action: string) {
  toast({
    title: 'Sign in required',
    description: `Sign in to ${action}.`,
    variant: 'destructive',
  });
}

/**
 * Hydration query: which listing ids the current user has saved. Used by PropertyCard
 * to derive the heart's filled/unfilled state via O(1) Set membership.
 */
export function useSavedListingIds() {
  const { session } = useAuth();
  const isAuthenticated = !!session;

  const query = useQuery<string[]>({
    queryKey: listingKeys.savedListingIds(isAuthenticated),
    queryFn: () => api.get<string[]>('/api/me/saved-listings/ids'),
    enabled: isAuthenticated,
    staleTime: 120_000,
  });

  const idSet = useMemo(() => new Set(query.data ?? []), [query.data]);

  return { ...query, idSet };
}

/** Full saved-listing cards for the "Saved homes" page. */
export function useSavedListings() {
  const { session } = useAuth();
  const isAuthenticated = !!session;

  return useQuery<SavedListingCard[]>({
    queryKey: listingKeys.savedListings(isAuthenticated),
    queryFn: () => api.get<SavedListingCard[]>('/api/me/saved-listings'),
    enabled: isAuthenticated,
  });
}

/**
 * Save a listing. Optimistically adds the id to the saved-ids cache; rolls back on
 * error. POST 200 (already saved) and 201 (newly saved) are both success — the
 * backend's idempotent-toggle contract means the caller never special-cases either.
 */
export function useSaveListing() {
  const { session } = useAuth();
  const isAuthenticated = !!session;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const idsKey = listingKeys.savedListingIds(isAuthenticated);

  return useMutation({
    mutationFn: (listingId: string) =>
      api.post<SaveListingResponse>('/api/me/saved-listings', { listingId }),
    onMutate: async (listingId: string) => {
      await queryClient.cancelQueries({ queryKey: idsKey });
      const prevIds = queryClient.getQueryData<string[]>(idsKey);
      queryClient.setQueryData<string[]>(idsKey, (prev) =>
        prev?.includes(listingId) ? prev : [...(prev ?? []), listingId],
      );
      return { prevIds };
    },
    onError: (error: Error, _listingId, context) => {
      if (context?.prevIds !== undefined) {
        queryClient.setQueryData(idsKey, context.prevIds);
      }
      if (error instanceof ApiError && error.status === 401) {
        authRequiredToast(toast, 'save this property');
        return;
      }
      toast({
        title: 'Save failed',
        description: 'Could not save this property. Please try again.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: idsKey });
      queryClient.invalidateQueries({ queryKey: listingKeys.savedListings(isAuthenticated) });
    },
  });
}

/**
 * Unsave a listing. Optimistically removes the id from both the saved-ids cache and
 * (when present) the saved-listings card list, so the "Saved homes" page's remove
 * action feels instant; rolls back both on error. DELETE is always 204 (idempotent —
 * unsaving an already-absent listing still succeeds), so there is no not-found branch.
 */
export function useUnsaveListing() {
  const { session } = useAuth();
  const isAuthenticated = !!session;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const idsKey = listingKeys.savedListingIds(isAuthenticated);
  const listKey = listingKeys.savedListings(isAuthenticated);

  return useMutation({
    mutationFn: (listingId: string) => api.delete<void>(`/api/me/saved-listings/${listingId}`),
    onMutate: async (listingId: string) => {
      await queryClient.cancelQueries({ queryKey: idsKey });
      await queryClient.cancelQueries({ queryKey: listKey });

      const prevIds = queryClient.getQueryData<string[]>(idsKey);
      const prevList = queryClient.getQueryData<SavedListingCard[]>(listKey);

      queryClient.setQueryData<string[]>(idsKey, (prev) =>
        prev?.filter((id) => id !== listingId) ?? [],
      );
      queryClient.setQueryData<SavedListingCard[]>(listKey, (prev) =>
        prev?.filter((card) => card.listingId !== listingId),
      );

      return { prevIds, prevList };
    },
    onError: (error: Error, _listingId, context) => {
      if (context?.prevIds !== undefined) {
        queryClient.setQueryData(idsKey, context.prevIds);
      }
      if (context?.prevList !== undefined) {
        queryClient.setQueryData(listKey, context.prevList);
      }
      if (error instanceof ApiError && error.status === 401) {
        authRequiredToast(toast, 'manage saved properties');
        return;
      }
      toast({
        title: 'Remove failed',
        description: 'Could not remove this property. Please try again.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: idsKey });
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}
