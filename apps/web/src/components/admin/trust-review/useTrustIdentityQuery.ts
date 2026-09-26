import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IDENTITY_QUERY_KEY, type IdentityPendingResponse } from './trustReviewTypes';

export interface UseTrustIdentityQueryOptions {
  enabled: boolean;
}

/**
 * Extracted from TrustReviewQueue.tsx (issue #2663) — identity-evidence
 * queue fetch. Behavior-preserving: identical query key, endpoint,
 * `enabled` gating and staleTime.
 */
export function useTrustIdentityQuery({ enabled }: UseTrustIdentityQueryOptions) {
  const { data, isLoading, isError, refetch } = useQuery<IdentityPendingResponse>({
    queryKey: IDENTITY_QUERY_KEY,
    queryFn: () => api.get<IdentityPendingResponse>('/api/admin/trust/identity/pending?size=50'),
    enabled,
    staleTime: 30_000,
  });

  const items = data?.items ?? [];

  return { items, isLoading, isError, refetch };
}
