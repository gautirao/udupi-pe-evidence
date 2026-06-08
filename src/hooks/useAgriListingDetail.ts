import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
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
 */
export function useAgriListingDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: ['agri-listing-detail', id] as const,
    queryFn: () => api.get<PublicListingDetail>(`/api/public/listings/${id}`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
