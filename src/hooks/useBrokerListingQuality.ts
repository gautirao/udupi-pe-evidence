import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { ListingQualityResponse } from '@/types/listingQuality';

export const LISTING_QUALITY_QUERY_KEY = ['broker', 'listing-quality'] as const;

/**
 * Fetch broker listing quality data from /api/broker/listing-quality.
 *
 * Auth race mitigation: on initial page load Supabase may not have restored the
 * session yet, so the first request goes out with no Authorization header.
 * Spring Boot's /api/broker/* endpoints are not permitAll — they return HTTP 401
 * (not 403) when the token is absent. We retry once after a short delay so
 * Supabase has time to restore the session before we surface a hard error.
 *
 * HTTP 403 means the user IS authenticated but lacks the broker/admin role — a
 * permanent role-denial that must NOT be retried (retrying cannot fix it).
 */
export function useBrokerListingQuality() {
  return useQuery<ListingQualityResponse, ApiError>({
    queryKey: LISTING_QUALITY_QUERY_KEY,
    queryFn: () => api.get<ListingQualityResponse>('/api/broker/listing-quality'),
    staleTime: 60_000, // 1 min — quality scores don't change on every keystroke
    retry: (failureCount, error) => {
      // 401: token not yet available (session restoring) — retry once.
      // 403: authenticated but wrong role — permanent denial, do not retry.
      // All other errors: do not retry.
      if (error instanceof ApiError && error.status === 401 && failureCount < 1) {
        return true;
      }
      return false;
    },
    retryDelay: 1_500, // give Supabase 1.5s to restore session before retrying
  });
}
