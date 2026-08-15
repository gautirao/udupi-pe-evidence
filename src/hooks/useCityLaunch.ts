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

/**
 * Body shape of the 422 CITY_PREREQUISITES_NOT_GENERATED contract returned
 * by POST .../prepare when the backend's self-materialization (Issue #2163)
 * cannot generate missing geography prerequisites (missing policy,
 * degenerate group, namespace collision, etc). Distinct from the
 * (now-defensive) GEOGRAPHY_VALIDATION_FAILED 422 and the 409
 * PREPARATION_IN_PROGRESS conflict, both unchanged.
 */
export interface PrepareErrorBody {
  error: string;
  reason: string;
  message: string;
  remediation: string;
}

/**
 * Narrows a prepare-mutation error down to the structured
 * CITY_PREREQUISITES_NOT_GENERATED contract, or returns null for every
 * other error shape (409 in-flight, defensive GEOGRAPHY_VALIDATION_FAILED,
 * network errors, etc). Exported so CityLaunch.tsx can render inline
 * message/remediation/retry UI without duplicating the parsing logic.
 */
export function getPrepareCityErrorDetails(error: unknown): PrepareErrorBody | null {
  if (!(error instanceof ApiError) || error.status !== 422) {
    return null;
  }
  const body = error.body;
  if (
    typeof body === 'object' &&
    body !== null &&
    (body as { error?: unknown }).error === 'CITY_PREREQUISITES_NOT_GENERATED'
  ) {
    return body as PrepareErrorBody;
  }
  return null;
}

export const CITY_LAUNCH_LIST_QUERY_KEY = ['admin', 'city-launch', 'cities'] as const;

function cityLaunchProgressQueryKey(cityId: number) {
  return ['admin', 'city-launch', 'cities', cityId, 'prepare'] as const;
}

/**
 * GET /api/admin/city-launch/cities — the Select City launch queue.
 *
 * `enabled` (default true) lets a caller that only needs this list
 * conditionally — e.g. PublicHeader resolving a previewed city's slug only
 * while inside an admin city-launch preview — skip the request entirely
 * rather than fire-and-discard it on every render.
 */
export function useCityLaunchList(options?: { enabled?: boolean }) {
  const { isAdmin } = useAuth();
  const enabled = isAdmin && (options?.enabled ?? true);

  return useQuery<CityLaunchStatusDto[]>({
    queryKey: CITY_LAUNCH_LIST_QUERY_KEY,
    queryFn: () => api.get<CityLaunchStatusDto[]>('/api/admin/city-launch/cities'),
    enabled,
    staleTime: 15_000,
  });
}

export interface PreviewIdentityDto {
  cityId: number;
  citySlug: string;
  cityName: string;
}

function previewIdentityQueryKey(cityId: number, revisionId: number) {
  return ['admin', 'city-launch', 'cities', cityId, 'revisions', revisionId, 'preview-identity'] as const;
}

/**
 * GET .../preview/identity — resolves a city-launch revision's real owning-city slug/name
 * (#2151 Track 1). CityLaunchPreview.tsx calls this BEFORE constructing
 * DiscoverDataSourceProvider so preview mode can thread the correct `citySlug` through
 * DiscoverContext instead of every display/data call site silently falling back to
 * DEFAULT_CITY — a preview URL carries no `city=` query param by design, only numeric
 * cityId/revisionId path segments.
 */
export function usePreviewCityIdentity(cityId: number, revisionId: number) {
  // No isAdmin gate here — matches useValidationState/useCityLaunchProgress's convention for
  // this already-admin-only page (@IsAdmin is enforced server-side; the route itself is only
  // reachable from the admin City Launch flow). Gating on isAdmin would make this hook a
  // silent no-op under any test/mount that doesn't also stub useAuth().isAdmin === true.
  const enabled = Number.isFinite(cityId) && Number.isFinite(revisionId) && cityId > 0 && revisionId > 0;

  return useQuery<PreviewIdentityDto>({
    queryKey: previewIdentityQueryKey(cityId, revisionId),
    queryFn: () =>
      api.get<PreviewIdentityDto>(
        `/api/admin/city-launch/cities/${cityId}/revisions/${revisionId}/preview/identity`,
      ),
    enabled,
    staleTime: 60_000,
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
      const prereqError = getPrepareCityErrorDetails(err);
      if (prereqError) {
        toast({
          title: 'Cannot prepare city',
          description: `${prereqError.message} ${prereqError.remediation}`,
          variant: 'destructive',
        });
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
