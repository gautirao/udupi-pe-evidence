import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AdminListingRow } from '@/hooks/useAdminData';
import type { UseMutationResult } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

interface ListingEditorDialogsProps {
  listing: AdminListingRow | undefined | null;

  confirmDiscard: boolean;
  setConfirmDiscard: (value: boolean) => void;
  onDiscardConfirmed: () => void;

  confirmStaleSave: boolean;
  setConfirmStaleSave: (value: boolean) => void;
  onStaleSaveConfirmed: () => void;

  publishAction: 'publish' | 'unpublish' | null;
  setPublishAction: (value: 'publish' | 'unpublish' | null) => void;
  onConfirmPublishToggle: () => void;

  confirmArchive: boolean;
  setConfirmArchive: (value: boolean) => void;
  archiveReason: string;
  setArchiveReason: (value: string) => void;
  archiveMutation: UseMutationResult<unknown, Error, { id: string; reasonNote?: string }>;

  confirmRestore: boolean;
  setConfirmRestore: (value: boolean) => void;
  restoreMutation: UseMutationResult<unknown, Error, string>;

  approveScrapedConfirm: boolean;
  setApproveScrapedConfirm: (value: boolean) => void;
  approveScrapedMutation: UseMutationResult<unknown, Error, string>;

  confirmRestoreRejected: boolean;
  setConfirmRestoreRejected: (value: boolean) => void;
  restoreRejectedNote: string;
  setRestoreRejectedNote: (value: string) => void;
  restoreRejectedMutation: UseMutationResult<unknown, Error, { id: string; moderationNote: string }>;
}

/** All confirmation dialogs owned by the listing editor drawer. */
export function ListingEditorDialogs({
  listing,
  confirmDiscard,
  setConfirmDiscard,
  onDiscardConfirmed,
  confirmStaleSave,
  setConfirmStaleSave,
  onStaleSaveConfirmed,
  publishAction,
  setPublishAction,
  onConfirmPublishToggle,
  confirmArchive,
  setConfirmArchive,
  archiveReason,
  setArchiveReason,
  archiveMutation,
  confirmRestore,
  setConfirmRestore,
  restoreMutation,
  approveScrapedConfirm,
  setApproveScrapedConfirm,
  approveScrapedMutation,
  confirmRestoreRejected,
  setConfirmRestoreRejected,
  restoreRejectedNote,
  setRestoreRejectedNote,
  restoreRejectedMutation,
}: ListingEditorDialogsProps) {
  return (
    <>
      {/* Unsaved changes */}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits on this listing. Closing now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                onDiscardConfirmed();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stale save confirmation */}
      <AlertDialog open={confirmStaleSave} onOpenChange={setConfirmStaleSave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save anyway?</AlertDialogTitle>
            <AlertDialogDescription>
              This listing was updated elsewhere since you opened it. Saving will overwrite that
              change with what you see here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmStaleSave(false);
                onStaleSaveConfirmed();
              }}
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publish / unpublish confirmation */}
      <AlertDialog open={!!publishAction} onOpenChange={(o) => !o && setPublishAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {publishAction === 'publish' ? 'Publish this listing?' : 'Unpublish this listing?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {publishAction === 'publish'
                ? 'This will make the listing visible to the public again.'
                : 'This will hide the listing from public view. It stays LIVE and can be re-published anytime.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onConfirmPublishToggle()}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive confirmation */}
      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this listing?</AlertDialogTitle>
            <AlertDialogDescription>
              The listing will be removed from active inventory and hidden from the public. You
              can restore it to draft later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="archive-reason">Reason (optional)</Label>
            <Textarea
              id="archive-reason"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveMutation.isPending}
              onClick={() =>
                listing && archiveMutation.mutate({ id: listing.id, reasonNote: archiveReason.trim() || undefined })
              }
            >
              {archiveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore (from archived) confirmation */}
      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this listing?</AlertDialogTitle>
            <AlertDialogDescription>
              The listing will move back to Draft status. It will not be public until re-approved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreMutation.isPending}
              onClick={() => listing && restoreMutation.mutate(listing.id)}
            >
              {restoreMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve-scraped confirmation (legacy SCRAPED -> LIVE path, distinct from the
          PENDING_REVIEW approve/reject workflow owned by #2369) */}
      <AlertDialog open={approveScrapedConfirm} onOpenChange={setApproveScrapedConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this scraped listing as live?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes the listing directly, without going through the pending-approval
              queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={approveScrapedMutation.isPending}
              onClick={() => listing && approveScrapedMutation.mutate(listing.id)}
            >
              {approveScrapedMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Approve as live
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore-rejected confirmation */}
      <AlertDialog open={confirmRestoreRejected} onOpenChange={setConfirmRestoreRejected}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this rejected listing to live?</AlertDialogTitle>
            <AlertDialogDescription>Provide a moderation note.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="restore-rejected-note">Moderation note</Label>
            <Textarea
              id="restore-rejected-note"
              value={restoreRejectedNote}
              onChange={(e) => setRestoreRejectedNote(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!restoreRejectedNote.trim() || restoreRejectedMutation.isPending}
              onClick={() =>
                listing &&
                restoreRejectedMutation.mutate({ id: listing.id, moderationNote: restoreRejectedNote.trim() })
              }
            >
              {restoreRejectedMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Restore to live
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
