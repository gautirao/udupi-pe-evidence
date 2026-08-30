import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { BrokerAreaInsightsResponse } from '@/types/brokerAreaInsights';

export const BROKER_AREA_INSIGHTS_QUERY_KEY_BASE = ['broker', 'area-insights'] as const;

export function brokerAreaInsightsQueryKey(citySlug: string, areaKey: string) {
  return [...BROKER_AREA_INSIGHTS_QUERY_KEY_BASE, citySlug, areaKey] as const;
}

/**
 * Fetch broker area insights from GET /api/broker/areas/{citySlug}/{areaKey}/insights.
 *
 * Identity is derived from the JWT server-side (CallerInfo.userId()).
 * No broker ID is sent in the request — the path carries citySlug/areaKey only.
 *
 * Auth race mitigation: 401 retried once after 1.5s (Supabase session restore).
 * 403 = role not broker|dealer|admin — permanent denial, not retried.
 */
export function useBrokerAreaInsights(citySlug: string, areaKey: string) {
  return useQuery<BrokerAreaInsightsResponse, ApiError>({
    queryKey: brokerAreaInsightsQueryKey(citySlug, areaKey),
    queryFn: () =>
      api.get<BrokerAreaInsightsResponse>(
        `/api/broker/areas/${citySlug}/${areaKey}/insights`,
      ),
    staleTime: 60_000, // area insights change infrequently; 60s is appropriate
    enabled: !!citySlug && !!areaKey,
    retry: (failureCount, error) => {
      // 401: token not yet available (session restoring) — retry once.
      // 403: authenticated but wrong role — permanent denial, do not retry.
      if (error instanceof ApiError && error.status === 401 && failureCount < 1) {
        return true;
      }
      return false;
    },
    retryDelay: 1_500,
  });
}
