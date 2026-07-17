import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

/**
 * Issue #1911 PR4 — City Launch admin validation-rail hooks over the real
 * backend contract at
 * /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/validation
 * (Spring-owned; no supabase.from here per ARCHITECTURE data-access rules —
 * mirrors the react-query-over-@/lib/api pattern in useCityLaunch.ts).
 */

export interface CityLaunchValidationChecks {
  landing: boolean;
  regions: boolean;
  areaGroups: boolean;
  areas: boolean;
  listing: boolean;
}

export type CityLaunchValidationCheckKey = keyof CityLaunchValidationChecks;

export interface ValidationStateDto {
  revisionId: number;
  cityId: number;
  revisionNumber: number;
  lifecycleStatus: string;
  checks: CityLaunchValidationChecks;
  allValidated: boolean;
  editable: boolean;
  preparedAt: string | null;
  validatedAt: string | null;
  supersededBy: number | null;
}

interface RerunPreviewResponse {
  revisionId: number;
  status: string;
}

/**
 * The 5 reversible checklist items — labels/copy match
 * ui_kits/admin/admin-data.js's window.RTA_VALIDATION exactly. Shared by
 * CityLaunchPreview's rail and CityLaunchReadiness's summary so both render
 * identical labels/notes from one source.
 */
export const VALIDATION_CHECK_ITEMS: ReadonlyArray<{
  key: CityLaunchValidationCheckKey;
  label: string;
  note: string;
}> = [
  { key: 'landing', label: 'Landing', note: 'Macro-region bubbles fit the whole city.' },
  { key: 'regions', label: 'Regions', note: 'Regions read correctly and drill in.' },
  { key: 'areaGroups', label: 'Area Groups', note: 'Area groups resolve inside a region.' },
  { key: 'areas', label: 'Areas', note: 'Individual areas are visible and legible.' },
  { key: 'listing', label: 'Listing', note: 'The simulated listing shows a pin and card.' },
];

function validationQueryKey(cityId: number, revisionId: number) {
  return ['city-launch-validation', cityId, revisionId] as const;
}

function validationPath(cityId: number, revisionId: number) {
  return `/api/admin/city-launch/cities/${cityId}/revisions/${revisionId}/validation`;
}

/** GET .../validation — the current checklist/lifecycle state for a revision. */
export function useValidationState(cityId: number, revisionId: number) {
  const enabled = Number.isFinite(cityId) && Number.isFinite(revisionId) && cityId > 0 && revisionId > 0;

  return useQuery<ValidationStateDto>({
    queryKey: validationQueryKey(cityId, revisionId),
    queryFn: () => api.get<ValidationStateDto>(validationPath(cityId, revisionId)),
    enabled,
  });
}

/**
 * PUT .../validation/checks/{checkKey} {value} — toggles a single reversible
 * check. On 409 (revision no longer editable — superseded/stale) surface a
 * toast and invalidate so the rail re-reads the server's read-only state.
 */
export function useToggleCheck(cityId: number, revisionId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<
    ValidationStateDto,
    ApiError,
    { checkKey: CityLaunchValidationCheckKey; value: boolean }
  >({
    mutationFn: ({ checkKey, value }) =>
      api.put<ValidationStateDto>(
        `${validationPath(cityId, revisionId)}/checks/${checkKey}`,
        { value },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(validationQueryKey(cityId, revisionId), data);
      queryClient.invalidateQueries({ queryKey: validationQueryKey(cityId, revisionId) });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast({
          title: 'This revision is no longer current',
          description: 'It has been superseded and can no longer be validated.',
        });
        queryClient.invalidateQueries({ queryKey: validationQueryKey(cityId, revisionId) });
        return;
      }
      toast({
        title: 'Failed to update check',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * POST .../validation/mark-validated — marks the revision VALIDATED. On 422
 * (not all 5 checks ticked) or 409 (no longer current) surfaces a toast and
 * invalidates so the rail reflects the server's actual state.
 */
export function useMarkValidated(cityId: number, revisionId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<ValidationStateDto, ApiError, void>({
    mutationFn: () =>
      api.post<ValidationStateDto>(`${validationPath(cityId, revisionId)}/mark-validated`),
    onSuccess: (data) => {
      queryClient.setQueryData(validationQueryKey(cityId, revisionId), data);
      queryClient.invalidateQueries({ queryKey: validationQueryKey(cityId, revisionId) });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 422) {
        toast({
          title: 'Not all checks complete',
          description: 'Tick all five checks before marking this preview validated.',
          variant: 'destructive',
        });
        queryClient.invalidateQueries({ queryKey: validationQueryKey(cityId, revisionId) });
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        toast({
          title: 'This revision is no longer current',
          description: 'It has been superseded and can no longer be validated.',
        });
        queryClient.invalidateQueries({ queryKey: validationQueryKey(cityId, revisionId) });
        return;
      }
      toast({
        title: 'Failed to mark validated',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * POST .../validation/reset — resets all 5 checks to false (VALIDATED
 * reverts to PREPARED server-side).
 */
export function useResetValidation(cityId: number, revisionId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<ValidationStateDto, ApiError, void>({
    mutationFn: () => api.post<ValidationStateDto>(`${validationPath(cityId, revisionId)}/reset`),
    onSuccess: (data) => {
      queryClient.setQueryData(validationQueryKey(cityId, revisionId), data);
      queryClient.invalidateQueries({ queryKey: validationQueryKey(cityId, revisionId) });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast({
          title: 'This revision is no longer current',
          description: 'It has been superseded and can no longer be reset.',
        });
        queryClient.invalidateQueries({ queryKey: validationQueryKey(cityId, revisionId) });
        return;
      }
      toast({
        title: 'Failed to reset validation',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * POST .../rerun — "Preview not ready": discards this revision's readiness
 * and reruns preparation into a new revision. On 202, invalidates the
 * admin city-launch list so the queue reflects the new in-flight revision.
 */
export function useRerunPreview(cityId: number, revisionId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<RerunPreviewResponse, ApiError, void>({
    mutationFn: () =>
      api.post<RerunPreviewResponse>(
        `/api/admin/city-launch/cities/${cityId}/revisions/${revisionId}/rerun`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'city-launch', 'cities'] });
      queryClient.invalidateQueries({ queryKey: validationQueryKey(cityId, revisionId) });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast({
          title: 'This revision is no longer current',
          description: 'A rerun is already in flight or this revision has been superseded.',
        });
        queryClient.invalidateQueries({ queryKey: validationQueryKey(cityId, revisionId) });
        return;
      }
      toast({
        title: 'Failed to rerun preparation',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}
