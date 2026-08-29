import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { isBulkApprovalEligible } from './pendingApprovalsHelpers';
import { QUERY_KEY_BASE } from './usePendingListingsQuery';
import type { BulkApproveOutcome } from './usePendingListingsSelection';

export interface UsePendingListingsMutationsOptions {
  /** Advance the review drawer to the next queue item, or close it if none remain. */
  advanceOrClose: (decidedId: string) => void;
  /** Close the review drawer (used on the 409-conflict "already processed" path). */
  closeReview: () => void;
  setStatusAnnouncement: (message: string) => void;
  setSelectedIds: (updater: (prev: Set<string>) => Set<string>) => void;
  setBulkFailures: (failures: BulkApproveOutcome[]) => void;
}

/**
 * Extracted from PendingListings.tsx (issue #2380) — the approve / reject /
 * return-for-edits / bulk-approve mutations and their toast + query-
 * invalidation side effects, including the shared 409-conflict handler.
 * Behavior-preserving: identical request bodies, identical toast copy,
 * identical partial-failure semantics for bulk approve.
 */
export function usePendingListingsMutations({
  advanceOrClose,
  closeReview,
  setStatusAnnouncement,
  setSelectedIds,
  setBulkFailures,
}: UsePendingListingsMutationsOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /**
   * Shared error handler for all mutations below. On a 409 (another admin
   * already actioned this listing — ListingStatusException server-side) we
   * must invalidate the queue so the stale row disappears, close the drawer,
   * and tell the admin plainly what happened — previously the queue was left
   * stale and the toast was generic (issue #2369 bug fix).
   */
  const handleMutationError = (error: unknown, fallbackTitle: string) => {
    if (error instanceof ApiError && error.status === 409) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      closeReview();
      const message = 'This listing was already processed by another admin.';
      toast({ title: 'Already processed', description: message, variant: 'destructive' });
      setStatusAnnouncement(message);
      return;
    }
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    toast({ title: fallbackTitle, description: message, variant: 'destructive' });
    setStatusAnnouncement(`${fallbackTitle}: ${message}`);
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/listings/${id}/approve`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      advanceOrClose(id);
      toast({ title: 'Listing approved', description: 'The listing is now live.' });
      setStatusAnnouncement('Listing approved. The listing is now live.');
    },
    onError: (error) => handleMutationError(error, 'Approval failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, code, note }: { id: string; code: string; note: string }) => {
      const reason = note.trim() ? `${code}: ${note.trim()}` : code;
      return api.post(`/api/admin/listings/${id}/reject`, { rejectionReason: reason });
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      advanceOrClose(id);
      toast({ title: 'Listing rejected', description: 'The broker has been notified.' });
      setStatusAnnouncement('Listing rejected. The broker has been notified.');
    },
    onError: (error) => handleMutationError(error, 'Rejection failed'),
  });

  const returnForEditsMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post(`/api/admin/listings/${id}/return-for-edits`, { note }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      advanceOrClose(id);
      toast({ title: 'Returned for edits', description: 'The broker has been notified.' });
      setStatusAnnouncement('Listing returned for edits. The broker has been notified.');
    },
    onError: (error) => handleMutationError(error, 'Return failed'),
  });

  /**
   * Bulk approval (#2369 Part 2): no dedicated bulk-approval backend endpoint
   * exists (see AdminListingController — only per-listing /approve). Rather
   * than build a new endpoint and a parallel authorization path, this issues
   * one call per eligible listing to the EXISTING /approve endpoint via
   * Promise.allSettled, so every item goes through the exact same
   * @PreAuthorize + status-transition validation as the single-item Approve
   * flow (including the 409 "already processed" case above). Eligibility is
   * computed fresh from each listing's real review flags immediately before
   * dispatch, so an accidentally-selected flagged listing is never sent.
   * Partial failures are surfaced explicitly, never hidden as a false
   * success — see bulkFailures below.
   */
  const bulkApproveMutation = useMutation({
    mutationFn: async (items: ListingResponse[]): Promise<BulkApproveOutcome[]> => {
      const eligibleItems = items.filter(isBulkApprovalEligible);
      const settled = await Promise.allSettled(
        eligibleItems.map((item) => api.post(`/api/admin/listings/${item.id}/approve`)),
      );
      return eligibleItems.map((item, index) => {
        const outcome = settled[index];
        const title = item.title || item.displayId || 'Untitled listing';
        if (outcome.status === 'fulfilled') {
          return { id: item.id, title, status: 'fulfilled' as const };
        }
        const reason = outcome.reason;
        const message =
          reason instanceof ApiError && reason.status === 409
            ? 'Already processed by another admin.'
            : reason instanceof Error
              ? reason.message
              : 'Something went wrong.';
        return { id: item.id, title, status: 'rejected' as const, message };
      });
    },
    onSuccess: (outcomes) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
      const failed = outcomes.filter((o) => o.status === 'rejected');
      setSelectedIds((prev) => {
        const next = new Set(prev);
        succeeded.forEach((o) => next.delete(o.id));
        return next;
      });
      setBulkFailures(failed);
      if (failed.length === 0) {
        toast({
          title: `${succeeded.length} listing${succeeded.length === 1 ? '' : 's'} approved`,
          description: 'The approved listings are now live.',
        });
        setStatusAnnouncement(`${succeeded.length} listings approved and now live.`);
      } else {
        toast({
          title: 'Bulk approval partially failed',
          description: `${succeeded.length} approved, ${failed.length} failed. See details below the queue toolbar.`,
          variant: 'destructive',
        });
        setStatusAnnouncement(
          `${succeeded.length} listings approved, ${failed.length} failed to approve.`,
        );
      }
    },
    onError: (error) => handleMutationError(error, 'Bulk approval failed'),
  });

  return { approveMutation, rejectMutation, returnForEditsMutation, bulkApproveMutation };
}
