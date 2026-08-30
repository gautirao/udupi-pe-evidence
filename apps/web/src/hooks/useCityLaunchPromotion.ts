import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

/**
 * Issue #1911 PR5 — City Launch promotion hook over the real backend
 * contract at
 * /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/launch
 * (Spring-owned; mirrors the react-query-over-@/lib/api pattern used by
 * useRerunPreview in useCityLaunchValidation.ts).
 *
 * The `confirmCityName` field in the request body is a UI-only
 * type-to-confirm guard — the server's write authority is its own CAS +
 * checksum, and it deliberately IGNORES this field. It is still sent for
 * forward-compat / telemetry parity.
 */

/** Response shape of a Jackson-serialized PromotionReport record (camelCase, exact field names). */
export interface PromotionReport {
  revisionId: number;
  lifecycleStatus: string;
  promotedAt: string;
  areasPromoted: number;
  aliasesPromoted: number;
  regionsPromoted: number;
  membershipsPromoted: number;
  groupsPromoted: number;
  groupMembersPromoted: number;
  cityActivated: boolean;
  idempotentNoop: boolean;
}

function launchPath(cityId: number, revisionId: number) {
  return `/api/admin/city-launch/cities/${cityId}/revisions/${revisionId}/launch`;
}

/**
 * POST .../launch {confirmCityName} — promotes a VALIDATED revision's
 * sandbox_* tables into production geography and activates the city.
 * 200 (idempotentNoop=true on a retry after an already-PROMOTED revision)
 * is still a success. 409 (not promotable — not VALIDATED / already
 * PROMOTING / superseded), 422 (checksum mismatch / canonical drift — the
 * fix is "re-run prepare and re-validate"), and 404 (revision not found for
 * that city) surface as distinct ApiError states for the caller to render.
 * On success, invalidates the validation/readiness query keys so the screen
 * re-reads the server's now-PROMOTED state.
 */
export function useCityLaunchPromotion(cityId: number, revisionId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<PromotionReport, ApiError, { confirmCityName: string }>({
    mutationFn: ({ confirmCityName }) =>
      api.post<PromotionReport>(launchPath(cityId, revisionId), { confirmCityName }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['city-launch-validation', cityId, revisionId],
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'city-launch', 'cities'] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast({
          title: 'City is not ready to launch',
          description: 'This revision is not currently promotable — it may no longer be VALIDATED.',
          variant: 'destructive',
        });
        return;
      }
      if (err instanceof ApiError && err.status === 422) {
        toast({
          title: 'Preview has drifted from what was validated',
          description: 'Re-run prepare and re-validate before launching.',
          variant: 'destructive',
        });
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        toast({
          title: 'Revision not found',
          description: 'This revision could not be found for this city.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Failed to launch',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}
