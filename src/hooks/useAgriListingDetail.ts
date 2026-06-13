import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { PublicListingDetail } from '@/pages/ListingDetail';

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
 * The auth tier (isAuthenticated) is therefore part of the cache key: an authed
 * exact-coord/price response must never be served from cache to an anon caller
 * (and vice versa) after a session change.
 */
export function useAgriListingDetail(id: string | null | undefined) {
  const { session } = useAuth();
  const isAuthenticated = !!session;
  return useQuery({
    queryKey: ['agri-listing-detail', id, isAuthenticated] as const,
    queryFn: () => api.get<PublicListingDetail>(`/api/public/listings/${id}`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
