import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, ApiError, API_BASE_URL } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ACTIVE_PREP_STATES } from '@/lib/cityLaunchStatus';

/**
 * Issue #1911 PR2 — City Launch admin hooks over the real backend contract
 * at /api/admin/city-launch (Spring-owned; no supabase.from here per
 * ARCHITECTURE data-access rules — this is an authenticated admin
 * operation, not a public browse/search read).
 */

export interface CityLaunchStatusDto {
  cityId: number;
  citySlug: string;
  cityName: string;
  status: string;
  revisionId: number | null;
  revisionNumber: number | null;
  prepStage: number;
  prepState: string | null;
  geographyPercent: number;
  failureReason: string | null;
  preparedAt: string | null;
  geographyReady: boolean;
}

export interface CityLaunchProgressDto {
  cityId: number;
  revisionId: number;
  lifecycleStatus: string;
  prepStage: number;
  prepStageLabel: string;
  prepState: string;
  geographyPercent: number;
  failureReason: string | null;
  preparedAt: string | null;
}

interface PrepareCityResponse {
  revisionId: number;
  status: string;
}

export const CITY_LAUNCH_LIST_QUERY_KEY = ['admin', 'city-launch', 'cities'] as const;

function cityLaunchProgressQueryKey(cityId: number) {
  return ['admin', 'city-launch', 'cities', cityId, 'prepare'] as const;
}

/** GET /api/admin/city-launch/cities — the Select City launch queue. */
export function useCityLaunchList() {
  const { isAdmin } = useAuth();

  return useQuery<CityLaunchStatusDto[]>({
    queryKey: CITY_LAUNCH_LIST_QUERY_KEY,
    queryFn: () => api.get<CityLaunchStatusDto[]>('/api/admin/city-launch/cities'),
    enabled: isAdmin,
    staleTime: 15_000,
  });
}

/**
 * POST /api/admin/city-launch/cities/{cityId}/prepare — kicks off (or reruns)
 * geography preparation. Sends NO body: created_by is derived server-side
 * from the auth token. A 409 means a prepare run is already in flight for
 * this city — surfaced as an info toast, not an error, and the list is
 * refreshed so the row reflects the in-flight run.
 */
export function usePrepareCity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<PrepareCityResponse, ApiError, number>({
    mutationFn: (cityId) =>
      api.post<PrepareCityResponse>(`/api/admin/city-launch/cities/${cityId}/prepare`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CITY_LAUNCH_LIST_QUERY_KEY });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast({
          title: 'Preparation already in progress',
          description: 'This city already has a preparation run in flight.',
        });
        queryClient.invalidateQueries({ queryKey: CITY_LAUNCH_LIST_QUERY_KEY });
        return;
      }
      toast({
        title: 'Failed to start preparation',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}


/**
 * GET /api/admin/city-launch/cities/{cityId}/prepare — fetches the in-flight
 * (or most recent) prepare run's progress initially.
 *
 * Subscribes to SSE stream at /api/admin/city-launch/cities/{cityId}/prepare/events
 * if prepState is RUNNING/PENDING; stops once DONE/FAILED and invalidates the list query exactly
 * so the row's status/badge/geography meter reflect the finished run.
 */
export function useCityLaunchProgress(cityId: number | null, enabled: boolean) {
  const queryClient = useQueryClient();

  // Initial fetch only
  const query = useQuery<CityLaunchProgressDto>({
    queryKey: cityLaunchProgressQueryKey(cityId ?? -1),
    queryFn: async () => {
      const result = await api.get<CityLaunchProgressDto>(
        `/api/admin/city-launch/cities/${cityId}/prepare`,
      );
      if (!ACTIVE_PREP_STATES.has(result.prepState)) {
        // Exact invalidation to avoid request storms
        queryClient.invalidateQueries({ queryKey: CITY_LAUNCH_LIST_QUERY_KEY, exact: true });
      }
      return result;
    },
    enabled: enabled && cityId !== null,
    staleTime: Infinity,
  });

  const isPrepActive = query.data?.prepState && ACTIVE_PREP_STATES.has(query.data.prepState);

  useEffect(() => {
    if (!enabled || cityId === null || !isPrepActive) {
      return;
    }

    const abortController = new AbortController();

    let isSubscribed = true;
    let retryTimeout: ReturnType<typeof setTimeout>;

    async function streamEvents() {
      if (!isSubscribed) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const headers: Record<string, string> = { Accept: 'text/event-stream' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE_URL}/api/admin/city-launch/cities/${cityId}/prepare/events`, {
          headers,
          signal: abortController.signal
        });
        
        if (!response.ok) {
          throw new Error(`SSE failed with status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error(`SSE response has no body`);
        }
        const decoder = new TextDecoder();
        let buffer = '';

        while (isSubscribed) {
          const { done, value } = await reader.read();
          if (done) {
            throw new Error(`SSE stream closed unexpectedly`);
          }
          buffer += decoder.decode(value, { stream: true });
          
          let eventBoundary = buffer.indexOf('\n\n');
          while (eventBoundary !== -1) {
            const eventChunk = buffer.slice(0, eventBoundary);
            buffer = buffer.slice(eventBoundary + 2);
            eventBoundary = buffer.indexOf('\n\n');

            const dataPrefix = 'data:';
            const dataLine = eventChunk.split('\n').find(line => line.startsWith(dataPrefix));
            if (dataLine) {
              const dataStr = dataLine.slice(dataPrefix.length).trim();
              if (dataStr) {
                const data = JSON.parse(dataStr) as CityLaunchProgressDto;
                queryClient.setQueryData(cityLaunchProgressQueryKey(cityId), data);

                if (!ACTIVE_PREP_STATES.has(data.prepState)) {
                   abortController.abort();
                   queryClient.invalidateQueries({ queryKey: CITY_LAUNCH_LIST_QUERY_KEY, exact: true });
                   return;
                }
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || !isSubscribed) {
           return;
        }
        console.error("SSE Error, reconnecting in 3s...", err);
        // Authoritative reconciliation before retry
        queryClient.invalidateQueries({ queryKey: cityLaunchProgressQueryKey(cityId!), exact: true });
        retryTimeout = setTimeout(() => {
          streamEvents();
        }, 3000);
      }
    }
    
    streamEvents();
    
    return () => {
      isSubscribed = false;
      clearTimeout(retryTimeout);
      abortController.abort();
    };
  }, [cityId, enabled, isPrepActive, queryClient]);

  return query;
}
