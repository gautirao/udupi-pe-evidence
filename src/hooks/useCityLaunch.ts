import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
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
 * GET /api/admin/city-launch/cities/{cityId}/prepare — polls the in-flight
 * (or most recent) prepare run's progress. Polls every 2s while prepState is
 * RUNNING/PENDING; stops once DONE/FAILED and invalidates the list query so
 * the row's status/badge/geography meter reflect the finished run.
 */
export function useCityLaunchProgress(cityId: number | null, enabled: boolean) {
  const queryClient = useQueryClient();

  return useQuery<CityLaunchProgressDto>({
    queryKey: cityLaunchProgressQueryKey(cityId ?? -1),
    queryFn: async () => {
      const result = await api.get<CityLaunchProgressDto>(
        `/api/admin/city-launch/cities/${cityId}/prepare`,
      );
      if (!ACTIVE_PREP_STATES.has(result.prepState)) {
        queryClient.invalidateQueries({ queryKey: CITY_LAUNCH_LIST_QUERY_KEY });
      }
      return result;
    },
    enabled: enabled && cityId !== null,
    refetchInterval: (query) => {
      const prepState = query.state.data?.prepState;
      return prepState && ACTIVE_PREP_STATES.has(prepState) ? 2000 : false;
    },
  });
}
