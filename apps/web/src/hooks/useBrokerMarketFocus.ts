import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarketFocusItem {
  citySlug: string;
  areaKey: string;
  propertyType: string;
  listingPurpose: string;
  source: 'seeded' | 'manual';
  createdAt: string;
}

/**
 * Full tuple used for DELETE — includes server-resolved citySlug returned by GET.
 */
export interface MarketFocusTuple {
  citySlug: string;
  areaKey: string;
  propertyType: string;
  listingPurpose: string;
}

/**
 * Add-only input — citySlug intentionally omitted.
 * The server resolves citySlug from areaKey via the authoritative areas→cities join.
 */
export interface AddMarketFocusInput {
  areaKey: string;
  propertyType: string;
  listingPurpose: string;
}

export interface SeedResult {
  inserted: number;
}

// ─── Query key ────────────────────────────────────────────────────────────────

export const MARKET_FOCUS_QUERY_KEY = ['broker', 'market-focus'] as const;

// ─── Query hook ───────────────────────────────────────────────────────────────

/**
 * Fetch the broker's market focus buckets from GET /api/broker/market-focus.
 *
 * Auth race mitigation: on initial page load Supabase may not have restored the
 * session yet, producing a 401. We retry once after 1.5 s so Supabase has time
 * to restore the session. 403 (wrong role) must NOT be retried.
 */
export function useBrokerMarketFocus() {
  return useQuery<MarketFocusItem[], ApiError>({
    queryKey: MARKET_FOCUS_QUERY_KEY,
    queryFn: () => api.get<MarketFocusItem[]>('/api/broker/market-focus'),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401 && failureCount < 1) {
        return true;
      }
      return false;
    },
    retryDelay: 1_500,
  });
}

// ─── Add mutation ─────────────────────────────────────────────────────────────

/**
 * POST /api/broker/market-focus — adds a focus tuple (idempotent).
 * Body: { areaKey, propertyType, listingPurpose } — server resolves citySlug.
 * 422: areaKey has no matching area — surfaced as a non-fatal user-visible toast.
 * Invalidates the list on success.
 */
export function useAddMarketFocus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<void, ApiError, AddMarketFocusInput>({
    mutationFn: (input) =>
      api.post<void>('/api/broker/market-focus', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MARKET_FOCUS_QUERY_KEY });
      toast({ title: 'Focus area added' });
    },
    onError: (error) => {
      if (error.status === 422) {
        // Unknown area — non-fatal; do not retry
        toast({
          title: 'Unknown area',
          description: 'The selected area is not recognised. Please choose a different area.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Failed to add focus area',
        description:
          error.status === 403
            ? 'Access denied. Broker or admin role required.'
            : 'Please try again.',
        variant: 'destructive',
      });
    },
  });
}

// ─── Remove mutation ──────────────────────────────────────────────────────────

/**
 * DELETE /api/broker/market-focus — removes a focus tuple.
 * 404 (row not owned / already deleted) is treated as a non-fatal warning:
 * it surfaces a toast and refreshes the list so the UI stays in sync.
 */
export function useRemoveMarketFocus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<void, ApiError, MarketFocusTuple>({
    mutationFn: (tuple) =>
      // api.delete spreads options into apiRequest which respects body from RequestInit.
      // Content-Type: application/json is set by apiRequest unconditionally.
      api.delete<void>('/api/broker/market-focus', {
        body: JSON.stringify(tuple),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MARKET_FOCUS_QUERY_KEY });
      toast({ title: 'Focus area removed' });
    },
    onError: (error) => {
      if (error.status === 404) {
        // Row was already removed — non-fatal; refresh so the UI is consistent
        queryClient.invalidateQueries({ queryKey: MARKET_FOCUS_QUERY_KEY });
        toast({
          title: 'Already removed',
          description: 'That focus area no longer exists.',
        });
      } else {
        toast({
          title: 'Failed to remove focus area',
          description:
            error.status === 403
              ? 'Access denied. Broker or admin role required.'
              : 'Please try again.',
          variant: 'destructive',
        });
      }
    },
  });
}

// ─── Seed mutation ────────────────────────────────────────────────────────────

/**
 * POST /api/broker/market-focus/seed — re-seeds from the caller's LIVE listings.
 * After success the list is invalidated (manual rows persist — backend guarantees it).
 */
export function useSeedMarketFocus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<SeedResult, ApiError, void>({
    mutationFn: () => api.post<SeedResult>('/api/broker/market-focus/seed'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: MARKET_FOCUS_QUERY_KEY });
      toast({
        title: result.inserted > 0
          ? `Seeded ${result.inserted} focus ${result.inserted === 1 ? 'area' : 'areas'} from your listings`
          : 'No new focus areas found in your live listings',
      });
    },
    onError: (error) => {
      toast({
        title: 'Seed failed',
        description:
          error.status === 403
            ? 'Access denied. Broker or admin role required.'
            : 'Please try again.',
        variant: 'destructive',
      });
    },
  });
}
