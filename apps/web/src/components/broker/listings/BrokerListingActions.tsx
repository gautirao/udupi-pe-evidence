import { useNavigate, Link } from 'react-router-dom';
import {
  useDeleteListing,
  useDuplicateListing,
  useSubmitListing,
  useArchiveListing,
  useWithdrawListing,
  useReopenListing,
  useReopenAsDraftListing,
  useResubmitArchivedListing,
  useRestoreListing,
  type ListingResponse,
} from '@/hooks/useBrokerListings';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { CalendarDays, Copy, Eye, Loader2 } from 'lucide-react';

const EDITABLE_STATUSES = ['DRAFT', 'REJECTED'];

/**
 * Submit button for DRAFT listings only.
 *
 * Rendered as a separate component so that `useSubmitListing` (a hook) can be
 * called at the top level rather than inside the parent's `.map()`.
 */
function DraftSubmitButton({ listing }: { listing: ListingResponse }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const submitMutation = useSubmitListing(listing.id);

  const isReady = listing.addressConfirmed && listing.imageCount >= 3;

  if (isReady) {
    return (
      <Button
        size="sm"
        disabled={submitMutation.isPending}
        onClick={() => {
          submitMutation.mutate(undefined, {
            onSuccess: () => {
              toast({ title: 'Submitted for review' });
            },
          });
        }}
      >
        {submitMutation.isPending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Submitting…
          </>
        ) : (
          'Submit for Review'
        )}
      </Button>
    );
  }

  const bothMissing = !listing.addressConfirmed && listing.imageCount < 3;
  const hint = bothMissing
    ? 'Add images & confirm address to submit'
    : listing.imageCount < 3
      ? `Need ${3 - listing.imageCount} more image(s)`
      : 'Confirm address to submit';

  // Deep-link to the blocking wizard step: images (step 2) takes priority
  const targetStep = listing.imageCount < 3 ? 2 : 3;

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate(`/broker/listings/${listing.id}/edit?step=${targetStep}`)}
      >
        Complete &amp; Submit
      </Button>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

/**
 * Duplicate button — creates a new DRAFT by copying core fields from an existing listing.
 * Separate component so hooks are called at top level (not inside .map()).
 */
function DuplicateButton({ listing }: { listing: ListingResponse }) {
  const navigate = useNavigate();
  const duplicateMutation = useDuplicateListing();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={duplicateMutation.isPending}
      onClick={() => {
        duplicateMutation.mutate(listing.id, {
          onSuccess: (newListing) => {
            navigate(`/broker/listings/${newListing.id}/edit`);
          },
        });
      }}
    >
      {duplicateMutation.isPending ? (
        <Loader2 className="h-3 w-3 animate-spin mr-1" />
      ) : (
        <Copy className="h-3.5 w-3.5 mr-1" />
      )}
      Duplicate
    </Button>
  );
}

/**
 * Archive button — LIVE and REJECTED listings.
 * Requires confirmation before POSTing /archive.
 */
function ArchiveButton({ listing }: { listing: ListingResponse }) {
  const archiveMutation = useArchiveListing(listing.id);
  const { toast } = useToast();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={archiveMutation.isPending}>
          {archiveMutation.isPending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Archiving…
            </>
          ) : (
            'Archive'
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive Listing</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to archive this listing?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              archiveMutation.mutate(undefined, {
                onSuccess: () => {
                  toast({ title: 'Listing archived' });
                },
              });
            }}
          >
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Withdraw button — PENDING_REVIEW listings.
 * Requires confirmation before PUTting /withdraw (returns 204 No Content).
 */
function WithdrawButton({ listing }: { listing: ListingResponse }) {
  const withdrawMutation = useWithdrawListing(listing.id);
  const { toast } = useToast();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={withdrawMutation.isPending}>
          {withdrawMutation.isPending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Withdrawing…
            </>
          ) : (
            'Withdraw'
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Withdraw Listing</AlertDialogTitle>
          <AlertDialogDescription>
            This will move the listing back to Draft.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              withdrawMutation.mutate(undefined, {
                onSuccess: () => {
                  toast({ title: 'Listing withdrawn to draft' });
                },
              });
            }}
          >
            Withdraw
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Reopen button — REJECTED listings only, no confirm required.
 * POSTs /reopen to move listing back to DRAFT.
 */
function ReopenButton({ listing }: { listing: ListingResponse }) {
  const reopenMutation = useReopenListing(listing.id);
  const { toast } = useToast();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={reopenMutation.isPending}
      onClick={() => {
        reopenMutation.mutate(undefined, {
          onSuccess: () => {
            toast({ title: 'Listing reopened for editing' });
          },
        });
      }}
    >
      {reopenMutation.isPending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          Reopening…
        </>
      ) : (
        'Reopen for Editing'
      )}
    </Button>
  );
}

/**
 * Reopen as Draft button — ARCHIVED listings only, no confirm required.
 * POSTs /reopen-as-draft to move listing to DRAFT.
 */
function ReopenAsDraftButton({ listing }: { listing: ListingResponse }) {
  const reopenAsDraftMutation = useReopenAsDraftListing(listing.id);
  const { toast } = useToast();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={reopenAsDraftMutation.isPending}
      onClick={() => {
        reopenAsDraftMutation.mutate(undefined, {
          onSuccess: () => {
            toast({ title: 'Listing reopened as draft' });
          },
        });
      }}
    >
      {reopenAsDraftMutation.isPending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          Reopening…
        </>
      ) : (
        'Reopen as Draft'
      )}
    </Button>
  );
}

/**
 * Resubmit button — ARCHIVED listings only, no confirm required.
 * POSTs /submit to move listing to PENDING_REVIEW.
 */
function ResubmitArchivedButton({ listing }: { listing: ListingResponse }) {
  const resubmitMutation = useResubmitArchivedListing(listing.id);
  const { toast } = useToast();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={resubmitMutation.isPending}
      onClick={() => {
        resubmitMutation.mutate(undefined, {
          onSuccess: () => {
            toast({ title: 'Listing resubmitted for review' });
          },
        });
      }}
    >
      {resubmitMutation.isPending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          Resubmitting…
        </>
      ) : (
        'Resubmit'
      )}
    </Button>
  );
}

/**
 * Restore to Live button — ARCHIVED listings only, no confirm required.
 * Always shown; backend returns 422 if ineligible.
 * PUTs /restore to move listing back to LIVE.
 */
function RestoreButton({ listing }: { listing: ListingResponse }) {
  const restoreMutation = useRestoreListing(listing.id);
  const { toast } = useToast();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={restoreMutation.isPending}
      onClick={() => {
        restoreMutation.mutate(undefined, {
          onSuccess: () => {
            toast({ title: 'Listing restored to live' });
          },
        });
      }}
    >
      {restoreMutation.isPending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          Restoring…
        </>
      ) : (
        'Restore to Live'
      )}
    </Button>
  );
}

/**
 * Delete button — DRAFT and REJECTED listings only.
 * Requires confirmation before permanently deleting the listing.
 */
function DeleteListingButton({ listing }: { listing: ListingResponse }) {
  const deleteListingMutation = useDeleteListing();
  const { toast } = useToast();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete listing?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete your listing. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              deleteListingMutation.mutate(listing.id, {
                onSuccess: () => {
                  toast({ title: 'Listing deleted' });
                },
              });
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Centralises which lifecycle actions are legal/visible for a given listing
 * status (DRAFT/PENDING_REVIEW/LIVE/REJECTED/ARCHIVED). Does not duplicate
 * backend lifecycle rules — it only mirrors which actions the backend exposes
 * for each status, matching the previous inline BrokerListings.tsx JSX.
 */
export function BrokerListingActions({ listing }: { listing: ListingResponse }) {
  return (
    <div className="flex gap-2 flex-wrap items-start">
      <Button variant="outline" size="sm" asChild>
        <Link
          to={
            listing.status === 'LIVE'
              ? `/listing/${listing.id}`
              : `/listing/${listing.id}?preview=true`
          }
        >
          <Eye className="h-3.5 w-3.5 mr-1" />
          {listing.status === 'LIVE' ? 'View' : 'Preview'}
        </Link>
      </Button>
      <DuplicateButton listing={listing} />
      {listing.status === 'LIVE' && (
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/broker/bookings?listingId=${listing.id}`}>
              <CalendarDays className="h-3.5 w-3.5 mr-1" />
              Booking enquiries
            </Link>
          </Button>
          <ArchiveButton listing={listing} />
        </>
      )}
      {listing.status === 'PENDING_REVIEW' && <WithdrawButton listing={listing} />}
      {EDITABLE_STATUSES.includes(listing.status) && (
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/broker/listings/${listing.id}/edit`}>Edit</Link>
          </Button>
          {listing.status === 'DRAFT' ? (
            <DraftSubmitButton listing={listing} />
          ) : (
            <>
              <Button size="sm" asChild>
                <Link to={`/broker/listings/${listing.id}/edit`}>Edit &amp; Resubmit</Link>
              </Button>
              <ReopenButton listing={listing} />
              <ArchiveButton listing={listing} />
            </>
          )}
        </>
      )}
      {listing.status === 'ARCHIVED' && (
        <>
          <ReopenAsDraftButton listing={listing} />
          <ResubmitArchivedButton listing={listing} />
          <RestoreButton listing={listing} />
        </>
      )}
      {(listing.status === 'DRAFT' || listing.status === 'REJECTED') && (
        <DeleteListingButton listing={listing} />
      )}
    </div>
  );
}
