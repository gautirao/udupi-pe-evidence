import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { BADGE_QUERY_KEY, type PendingTrustReview } from './trustReviewTypes';

export interface UseTrustBadgeQueryOptions {
  enabled: boolean;
}

/**
 * Extracted from TrustReviewQueue.tsx (issue #2663) — badge-submission
 * queue fetch. Behavior-preserving: identical query key, endpoint,
 * `enabled` gating and staleTime.
 */
export function useTrustBadgeQuery({ enabled }: UseTrustBadgeQueryOptions) {
  const { data: reviews = [], isLoading, isError, error, refetch } = useQuery<PendingTrustReview[]>({
    queryKey: BADGE_QUERY_KEY,
    queryFn: () => api.get<PendingTrustReview[]>('/api/admin/trust/pending-reviews'),
    enabled,
    staleTime: 30_000,
  });

  return { reviews, isLoading, isError, error, refetch };
}
