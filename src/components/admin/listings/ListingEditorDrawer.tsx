import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Link } from 'react-router-dom';
import type { AdminListingRow } from '@/hooks/useAdminData';
import { useListingEditorState } from '@/hooks/admin/useListingEditorState';
import { useListingLifecycleActions } from '@/hooks/admin/useListingLifecycleActions';
import { formatRelativeDate } from '@/lib/formatters';
import { formatDisplayId, isPubliclyVisible } from '@/lib/listingInventory';
import { ListingEditorFormBody } from '@/components/admin/listings/ListingEditorFormFields';
import { ListingEditorLifecyclePanel } from '@/components/admin/listings/ListingEditorLifecyclePanel';
import { ListingEditorDialogs } from '@/components/admin/listings/ListingEditorDialogs';
import { AlertTriangle, ExternalLink, Loader2, ShieldAlert } from 'lucide-react';

export interface ListingEditorDrawerProps {
  listing: AdminListingRow | undefined | null;
  /** True while the listing is still loading from the table's dataset (deep-link case). */
  isResolvingListing?: boolean;
  open: boolean;
  onOpenChange: (open: boolean, options?: { skipUnsavedCheck?: boolean }) => void;
  initialSection?: 'details' | 'activity';
}

export function ListingEditorDrawer({
  listing,
  isResolvingListing = false,
  open,
  onOpenChange,
  initialSection = 'details',
}: ListingEditorDrawerProps) {
  const {
    form,
    setForm,
    errors,
    isDirty,
    isStale,
    activity,
    contact,
    showContacts,
    setShowContacts,
    confirmDiscard,
    setConfirmDiscard,
    confirmStaleSave,
    setConfirmStaleSave,
    updateListing,
    doSave,
    handleSaveClick,
    requestClose,
  } = useListingEditorState(listing, open, initialSection, onOpenChange);

  const {
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
  } = useListingLifecycleActions(listing, updateListing);

  if (!open) return null;

  // Distinguish "still fetching the dataset" from "fetch finished and this id
  // genuinely isn't in it" (deleted, or outside the loaded window) — without
  // this, a stale/unresolvable ?edit=<id> deep-link left the drawer spinning
  // forever with no way out (code-reviewer finding #3, #2370 delta).
  const listingNotFound = !isResolvingListing && !listing;
  const showLoading = !listingNotFound && (isResolvingListing || !listing || !form);

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto p-0"
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            requestClose();
          }}
        >
          {listingNotFound ? (
            <div className="flex flex-col min-h-full">
              <SheetHeader className="px-6 pt-6 pb-4 border-b">
                <SheetTitle>Listing not found</SheetTitle>
                <SheetDescription>
                  This listing couldn't be found — it may have been deleted or the id is invalid.
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 flex items-center justify-center px-6 py-12 text-center">
                <div className="space-y-4">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Try closing this panel and reloading the inventory list, or search for the
                    listing again.
                  </p>
                </div>
              </div>
              <SheetFooter className="px-6 py-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false, { skipUnsavedCheck: true })}
                >
                  Close panel
                </Button>
              </SheetFooter>
            </div>
          ) : showLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col min-h-full">
              <SheetHeader className="px-6 pt-6 pb-4 border-b">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SheetTitle className="flex items-center gap-2">
                      {formatDisplayId(listing.listing_number)}
                      <Badge variant="outline">{listing.status ?? 'unknown'}</Badge>
                      {isPubliclyVisible(listing) ? (
                        <Badge className="bg-green-500/10 text-green-700 border-0">Public</Badge>
                      ) : (
                        <Badge className="bg-gray-500/10 text-gray-600 border-0">Hidden</Badge>
                      )}
                    </SheetTitle>
                    <SheetDescription>{listing.title || 'Untitled listing'}</SheetDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/listing/${listing.id}`} target="_blank" rel="noopener noreferrer">
                      {isPubliclyVisible(listing) ? 'View public listing' : 'Preview (draft)'}
                      <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </Link>
                  </Button>
                </div>

                {isStale && (
                  <div
                    role="alert"
                    className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  >
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      This listing changed elsewhere since you opened it (last updated{' '}
                      {formatRelativeDate(listing.updated_at)}). Saving may overwrite that change.
                    </span>
                  </div>
                )}

                {listing.status === 'PENDING_REVIEW' && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                    <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      This listing is awaiting moderation. Saving here only updates its fields —
                      it never approves, rejects, or changes its status. Decide approval from{' '}
                      <Link to="/admin/listings/pending" className="underline font-medium">
                        Pending approvals
                      </Link>
                      .
                    </span>
                  </div>
                )}
              </SheetHeader>

              <div className="flex-1 px-6 py-5 space-y-8">
                {Object.keys(errors).length > 0 && (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                  >
                    <p className="font-medium mb-1">Fix the following before saving:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {Object.values(errors).map((msg) => (
                        <li key={msg}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <fieldset disabled={updateListing.isPending} className="space-y-8">
                  <ListingEditorFormBody
                    listing={listing}
                    form={form}
                    setForm={setForm}
                    errors={errors}
                    showContacts={showContacts}
                    setShowContacts={setShowContacts}
                    contact={contact}
                  />

                  <Separator />

                  <ListingEditorLifecyclePanel
                    listing={listing}
                    isPublishTogglePending={updateListing.isPending}
                    onTogglePublish={handleTogglePublish}
                    onArchiveRequested={() => setConfirmArchive(true)}
                    onRestoreRequested={() => setConfirmRestore(true)}
                    onApproveScrapedRequested={() => setApproveScrapedConfirm(true)}
                    onRestoreRejectedRequested={() => setConfirmRestoreRejected(true)}
                  />

                  <Separator />

                  {/* Activity history */}
                  <section id="listing-editor-activity" className="space-y-3" data-initial-focus={initialSection === 'activity'}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Activity history
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Only actions routed through the admin API (approve, reject, archive, restore,
                      etc.) appear here. Plain field edits and publish/unpublish toggles saved from
                      this drawer are NOT recorded in this log.
                    </p>
                    {activity.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading activity…</p>
                    ) : activity.isError ? (
                      <p className="text-sm text-destructive">Could not load activity.</p>
                    ) : activity.entries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No recorded activity for this listing.</p>
                    ) : (
                      <ul className="space-y-2">
                        {activity.entries.map((entry) => (
                          <li key={entry.id} className="text-sm border rounded-md px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{entry.action.replace(/_/g, ' ')}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeDate(entry.createdAt)}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </fieldset>
              </div>

              <SheetFooter className="px-6 py-4 border-t sticky bottom-0 bg-background">
                <Button type="button" variant="outline" onClick={requestClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveClick} disabled={updateListing.isPending || !isDirty}>
                  {updateListing.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save changes
                </Button>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ListingEditorDialogs
        listing={listing}
        confirmDiscard={confirmDiscard}
        setConfirmDiscard={setConfirmDiscard}
        onDiscardConfirmed={() => onOpenChange(false, { skipUnsavedCheck: true })}
        confirmStaleSave={confirmStaleSave}
        setConfirmStaleSave={setConfirmStaleSave}
        onStaleSaveConfirmed={() => void doSave()}
        publishAction={publishAction}
        setPublishAction={setPublishAction}
        onConfirmPublishToggle={confirmPublishToggle}
        confirmArchive={confirmArchive}
        setConfirmArchive={setConfirmArchive}
        archiveReason={archiveReason}
        setArchiveReason={setArchiveReason}
        archiveMutation={archiveMutation}
        confirmRestore={confirmRestore}
        setConfirmRestore={setConfirmRestore}
        restoreMutation={restoreMutation}
        approveScrapedConfirm={approveScrapedConfirm}
        setApproveScrapedConfirm={setApproveScrapedConfirm}
        approveScrapedMutation={approveScrapedMutation}
        confirmRestoreRejected={confirmRestoreRejected}
        setConfirmRestoreRejected={setConfirmRestoreRejected}
        restoreRejectedNote={restoreRejectedNote}
        setRestoreRejectedNote={setRestoreRejectedNote}
        restoreRejectedMutation={restoreRejectedMutation}
      />
    </>
  );
}
