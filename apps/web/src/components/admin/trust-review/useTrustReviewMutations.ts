import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { BADGE_QUERY_KEY, IDENTITY_QUERY_KEY, type ApproveRejectResponse, type ReviewActionState } from './trustReviewTypes';

export interface UseTrustReviewMutationsOptions {
  /** Close the badge-reject dialog and clear its reason field. */
  closeBadgeReject: () => void;
  /** Close the identity-reject dialog and clear its reason field. */
  closeIdentityReject: () => void;
}

/**
 * Semantic workflow surface for one review category (badge or identity).
 * The composition root and presentation layer consume only this — they
 * never see a TanStack mutation client or call `.mutate()`/`.isPending`
 * directly.
 */
export interface TrustReviewCategoryWorkflow {
  action: ReviewActionState;
  approve: (id: string) => void;
  reject: (id: string, reason: string) => void;
  /** True while this category's reject mutation is in flight — drives the
   * reject dialog's own pending state (distinct from the combined `busy`,
   * which the dialog does not use). */
  isRejecting: boolean;
}

export interface TrustReviewWorkflow {
  badge: TrustReviewCategoryWorkflow;
  identity: TrustReviewCategoryWorkflow;
}

/**
 * Extracted from TrustReviewQueue.tsx (issue #2663) — the 4 badge/identity
 * approve/reject mutations, their toast side effects, and the shared `isBusy`
 * flag every approve/reject button across both tabs is gated on.
 *
 * Cross-invalidation matrix (behavior-preserving — do NOT make uniform):
 *   badge approve     -> invalidates BADGE + IDENTITY
 *   badge reject      -> invalidates BADGE only
 *   identity approve  -> invalidates BADGE + IDENTITY
 *   identity reject   -> invalidates BADGE + IDENTITY
 *
 * `isBusy` is a single OR of all 4 mutations' isPending, so it must stay
 * derived here (not recomputed ad hoc at call sites) — it globally disables
 * every approve/reject button in both tabs while any one mutation is in
 * flight.
 */
export function useTrustReviewMutations({
  closeBadgeReject,
  closeIdentityReject,
}: UseTrustReviewMutationsOptions): TrustReviewWorkflow {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: (dimensionId: string) =>
      api.post<ApproveRejectResponse>(`/api/admin/trust/${dimensionId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BADGE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: IDENTITY_QUERY_KEY });
      toast({ title: 'Badge approved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ dimensionId, reason }: { dimensionId: string; reason: string }) =>
      api.post<ApproveRejectResponse>(
        `/api/admin/trust/${dimensionId}/reject`,
        reason.trim() ? { reason: reason.trim() } : undefined,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BADGE_QUERY_KEY });
      closeBadgeReject();
      toast({ title: 'Badge submission rejected' });
    },
    onError: (err: Error) => {
      closeBadgeReject();
      toast({ title: 'Rejection failed', description: err.message, variant: 'destructive' });
    },
  });

  const approveIdentityMutation = useMutation({
    mutationFn: (evidenceId: string) =>
      api.post<ApproveRejectResponse>(`/api/admin/trust/identity/${evidenceId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IDENTITY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BADGE_QUERY_KEY });
      toast({ title: 'Identity evidence approved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    },
  });

  const rejectIdentityMutation = useMutation({
    mutationFn: ({ evidenceId, reason }: { evidenceId: string; reason: string }) =>
      api.post<ApproveRejectResponse>(`/api/admin/trust/identity/${evidenceId}/reject`, { reason: reason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IDENTITY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BADGE_QUERY_KEY });
      closeIdentityReject();
      toast({ title: 'Identity evidence rejected' });
    },
    onError: (err: Error) => {
      closeIdentityReject();
      toast({ title: 'Rejection failed', description: err.message, variant: 'destructive' });
    },
  });

  const busy = approveMutation.isPending || rejectMutation.isPending
    || approveIdentityMutation.isPending || rejectIdentityMutation.isPending;

  return {
    badge: {
      action: { busy, approving: approveMutation.isPending },
      approve: (dimensionId) => approveMutation.mutate(dimensionId),
      reject: (dimensionId, reason) => rejectMutation.mutate({ dimensionId, reason }),
      isRejecting: rejectMutation.isPending,
    },
    identity: {
      action: { busy, approving: approveIdentityMutation.isPending },
      approve: (evidenceId) => approveIdentityMutation.mutate(evidenceId),
      reject: (evidenceId, reason) => rejectIdentityMutation.mutate({ evidenceId, reason }),
      isRejecting: rejectIdentityMutation.isPending,
    },
  };
}
