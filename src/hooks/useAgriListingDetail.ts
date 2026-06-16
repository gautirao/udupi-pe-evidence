import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { PublicListingDetail } from '@/pages/ListingDetail';
import { listingKeys } from '@/lib/listingQueryKeys';

/**
 * Issue #1374 — fetch full agri listing detail from the public endpoint.
 *
 * Uses GET /api/public/listings/{id} (no auth required). The agri-specific
 * fields (waterSource, soilType, roadAccess, cultivationStatus, ownershipType,
 * surveyNumber, boundary, computedAreaAcres) are part of the shared
 * ListingResponse DTO and therefore included in the public response.
 *
 * Stays idle when id is null/undefined (enabled: !!id guard).
 *
 * Issue #1454 (anon agri visibility gating) — the backend withholds price /
 * pricePaise / surveyNumber and coarsens lat/lng for anonymous agri callers.
 * Issue #1462 — uses listingKeys.public(id, isAuthenticated) so the cached data
 * is shared with useListingById on the full /listing/:id detail page,
 * eliminating the duplicate fetch on peek → detail navigation.
 */
export function useAgriListingDetail(id: string | null | undefined) {
  const { session } = useAuth();
  const isAuthenticated = !!session;
  return useQuery({
    queryKey: listingKeys.public(id, isAuthenticated),
    queryFn: () => {
      if (!id) throw new Error('[useAgriListingDetail] id is required');
      return api.get<PublicListingDetail>(`/api/public/listings/${id}`);
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
