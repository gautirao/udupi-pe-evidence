import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { useUpdateListing } from '@/hooks/usePropertyListings';
import type { AdminListingRow } from '@/hooks/useAdminData';
import { canTogglePublish, stripStatusFromUpdate } from '@/lib/listingInventory';
import { invalidateListingQueries } from '@/hooks/admin/invalidateListingQueries';

/**
 * Owns the editor drawer's lifecycle actions — archive, restore,
 * approve-scraped, restore-rejected, and publish/unpublish — along with the
 * confirm-dialog state each one needs. Every mutation here invalidates the
 * same shared query-key set (`invalidateListingQueries`) so the inventory
 * table/tab-counts never go stale after an action taken from the drawer.
 *
 * `updateListing` is passed in (not instantiated here) — it's the *same*
 * mutation instance `useListingEditorState` uses for saving field edits, so
 * `.isPending` correctly reflects both a save and a publish-toggle in
 * flight, matching the pre-decomposition single-hook behavior.
 */
export function useListingLifecycleActions(
  listing: AdminListingRow | undefined | null,
  updateListing: ReturnType<typeof useUpdateListing>,
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [publishAction, setPublishAction] = useState<'publish' | 'unpublish' | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [approveScrapedConfirm, setApproveScrapedConfirm] = useState(false);
  const [restoreRejectedNote, setRestoreRejectedNote] = useState('');
  const [confirmRestoreRejected, setConfirmRestoreRejected] = useState(false);

  const archiveMutation = useMutation({
    mutationFn: (payload: { id: string; reasonNote?: string }) =>
      api.post(`/api/admin/listings/${payload.id}/archive`, payload.reasonNote ? { reasonNote: payload.reasonNote } : undefined),
    onSuccess: () => {
      invalidateListingQueries(queryClient);
      toast({ title: 'Listing archived' });
      setConfirmArchive(false);
      setArchiveReason('');
    },
    onError: (error: Error) => {
      toast({ title: 'Archive failed', description: error.message, variant: 'destructive' });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/listings/${id}/restore`),
    onSuccess: () => {
      invalidateListingQueries(queryClient);
      toast({ title: 'Listing restored to draft' });
      setConfirmRestore(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Restore failed', description: error.message, variant: 'destructive' });
    },
  });

  const approveScrapedMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/listings/${id}/approve-scraped`),
    onSuccess: () => {
      invalidateListingQueries(queryClient);
      toast({ title: 'Listing approved as live' });
      setApproveScrapedConfirm(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Approval failed', description: error.message, variant: 'destructive' });
    },
  });

  const restoreRejectedMutation = useMutation({
    mutationFn: ({ id, moderationNote }: { id: string; moderationNote: string }) =>
      api.post(`/api/admin/listings/${id}/restore-rejected`, { moderationNote }),
    onSuccess: () => {
      invalidateListingQueries(queryClient);
      toast({ title: 'Listing restored to live' });
      setConfirmRestoreRejected(false);
      setRestoreRejectedNote('');
    },
    onError: (error: Error) => {
      toast({ title: 'Restore failed', description: error.message, variant: 'destructive' });
    },
  });

  function handleTogglePublish(nextChecked: boolean) {
    setPublishAction(nextChecked ? 'publish' : 'unpublish');
  }

  async function confirmPublishToggle() {
    if (!listing || !publishAction) return;
    // Re-check at confirm-time, not just at click-time: the confirm dialog can
    // stay open across a background refetch. If listing.status moved away
    // from LIVE while the dialog was open, flipping is_valid here would
    // create exactly the contradictory-visibility state this page is meant
    // to detect and flag (code-reviewer finding #1, #2370 delta).
    if (!canTogglePublish(listing)) {
      setPublishAction(null);
      toast({
        title: 'No longer available',
        description: 'This listing is no longer LIVE, so it can’t be published or unpublished from here.',
        variant: 'destructive',
      });
      return;
    }
    await updateListing.mutateAsync({
      id: listing.id,
      updates: stripStatusFromUpdate({ is_valid: publishAction === 'publish' }),
    });
    // Same gap as doSave(): useUpdateListing only invalidates
    // ['property-listings'], so without this the Switch (bound directly to
    // `listing.is_valid` from the admin-listings-page/admin-listing-by-id
    // cache) never flips after a successful publish/unpublish confirm.
    await invalidateListingQueries(queryClient);
    setPublishAction(null);
  }

  return {
    archiveMutation,
    restoreMutation,
    approveScrapedMutation,
    restoreRejectedMutation,

    publishAction,
    setPublishAction,
    archiveReason,
    setArchiveReason,
    confirmArchive,
    setConfirmArchive,
    confirmRestore,
    setConfirmRestore,
    approveScrapedConfirm,
    setApproveScrapedConfirm,
    restoreRejectedNote,
    setRestoreRejectedNote,
    confirmRestoreRejected,
    setConfirmRestoreRejected,

    handleTogglePublish,
    confirmPublishToggle,
  };
}
