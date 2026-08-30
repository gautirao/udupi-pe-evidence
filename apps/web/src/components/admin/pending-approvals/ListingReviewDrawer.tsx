import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { formatArea, formatPrice, formatRelativeDate, humanizeEnumValue } from '@/lib/formatters';
import {
  hasNoPhotos,
  isLocationUnconfirmed,
  isMissingInfo,
  RETURN_FOR_EDITS_REASONS,
} from './pendingApprovalsHelpers';

export interface RejectionCode {
  value: string;
  label: string;
}

type DrawerMode = 'review' | 'reject' | 'return';

interface ListingReviewDrawerProps {
  listing: ListingResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rejectionCodes: RejectionCode[];
  approvePending: boolean;
  rejectPending: boolean;
  returnForEditsPending: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string, code: string, note: string) => void;
  onReturnForEdits: (id: string, note: string) => void;
}

function QualityCheckRow({
  pass,
  passLabel,
  failLabel,
  detail,
}: {
  pass: boolean;
  passLabel: string;
  failLabel: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {pass ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      )}
      <div>
        <p className="text-sm font-semibold">{pass ? passLabel : failLabel}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function ListingReviewDrawer({
  listing,
  open,
  onOpenChange,
  rejectionCodes,
  approvePending,
  rejectPending,
  returnForEditsPending,
  onApprove,
  onReject,
  onReturnForEdits,
}: ListingReviewDrawerProps) {
  const [mode, setMode] = useState<DrawerMode>('review');
  const [rejectionCode, setRejectionCode] = useState('');
  const [rejectionNote, setRejectionNote] = useState('');
  const [returnReasons, setReturnReasons] = useState<string[]>([]);
  const [returnNote, setReturnNote] = useState('');

  // Reset internal sub-panel state whenever a different listing is opened, or
  // the drawer is closed — never carry reject/return state across listings.
  useEffect(() => {
    setMode('review');
    setRejectionCode('');
    setRejectionNote('');
    setReturnReasons([]);
    setReturnNote('');
  }, [listing?.id, open]);

  if (!listing) return null;

  const isBusy = approvePending || rejectPending || returnForEditsPending;

  const missingInfo = isMissingInfo(listing);
  const noPhotos = hasNoPhotos(listing);
  const locationUnconfirmed = isLocationUnconfirmed(listing);

  const toggleReturnReason = (reason: string) => {
    setReturnReasons((prev) =>
      prev.includes(reason) ? prev.filter((item) => item !== reason) : [...prev, reason],
    );
  };

  const handleReturnSubmit = () => {
    if (returnReasons.length === 0) return;
    const combinedNote = [`Reasons: ${returnReasons.join(', ')}`, returnNote.trim()]
      .filter(Boolean)
      .join('\n\n');
    onReturnForEdits(listing.id, combinedNote);
  };

  const handleRejectSubmit = () => {
    if (!rejectionCode) return;
    onReject(listing.id, rejectionCode, rejectionNote);
  };

  const listingIdentity = `"${listing.title || 'Untitled listing'}"${
    listing.displayId ? ` (${listing.displayId})` : ''
  }`;
  const selectedRejectionLabel =
    rejectionCodes.find((code) => code.value === rejectionCode)?.label ?? rejectionCode;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
        data-testid="listing-review-drawer"
      >
        <SheetHeader>
          <SheetTitle>{listing.title || 'Untitled listing'}</SheetTitle>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {listing.displayId && <span>{listing.displayId}</span>}
            <Link
              to={`/listing/${listing.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Preview public listing
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </SheetHeader>

        {mode === 'review' && (
          <div className="mt-6 space-y-6 pb-24">
            {/* PHOTOS */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Photos
              </h3>
              {listing.firstImageUrl ? (
                <div className="flex items-center gap-3">
                  <img
                    src={listing.firstImageUrl}
                    alt={`Preview of ${listing.title || 'listing'}`}
                    className="h-20 w-28 rounded-md border object-cover"
                  />
                  <span className="text-sm text-muted-foreground">
                    {listing.imageCount} photo{listing.imageCount === 1 ? '' : 's'} submitted
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No photos submitted.</p>
              )}
            </section>

            {/* KEY FACTS */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Key facts
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Price</dt>
                  <dd className="font-medium">{listing.price ? formatPrice(listing.price) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Property type</dt>
                  <dd className="font-medium">{humanizeEnumValue(listing.propertyType)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Area</dt>
                  <dd className="font-medium">
                    {listing.builtArea
                      ? formatArea(listing.builtArea, listing.builtAreaUnit)
                      : listing.landArea
                        ? formatArea(listing.landArea, listing.landAreaUnit)
                        : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Locality</dt>
                  <dd className="font-medium">{listing.locality || '—'}</dd>
                </div>
              </dl>
            </section>

            {/* LOCATION */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Location
              </h3>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    listing.addressConfirmed
                      ? 'border-green-200 text-green-700'
                      : 'border-amber-200 text-amber-700'
                  }
                >
                  {listing.addressConfirmed ? 'Location confirmed' : 'Location not confirmed'}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {listing.latitude != null && listing.longitude != null
                  ? `${listing.latitude.toFixed(5)}, ${listing.longitude.toFixed(5)}`
                  : 'No coordinates submitted.'}
              </p>
            </section>

            {/* DESCRIPTION */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Description
              </h3>
              <p className="whitespace-pre-wrap text-sm">
                {listing.description || 'No description provided.'}
              </p>
              {listing.amenities && listing.amenities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {listing.amenities.map((amenity) => (
                    <Badge key={amenity} variant="secondary" className="font-normal">
                      {humanizeEnumValue(amenity)}
                    </Badge>
                  ))}
                </div>
              )}
            </section>

            {/* AUTOMATED QUALITY & RISK CHECKS */}
            <section>
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Automated quality &amp; risk checks
              </h3>
              <div className="divide-y">
                <QualityCheckRow
                  pass={!missingInfo}
                  passLabel="Listing details complete"
                  failLabel="Listing details incomplete"
                  detail={
                    missingInfo
                      ? 'Title, price, or locality is missing.'
                      : 'Title, price, and locality are all present.'
                  }
                />
                <QualityCheckRow
                  pass={!noPhotos}
                  passLabel="Photos submitted"
                  failLabel="No photos submitted"
                  detail={
                    noPhotos
                      ? 'The broker has not uploaded any photos yet.'
                      : `${listing.imageCount} photo${listing.imageCount === 1 ? '' : 's'} submitted.`
                  }
                />
                <QualityCheckRow
                  pass={!locationUnconfirmed}
                  passLabel="Location confirmed"
                  failLabel="Location could not be verified"
                  detail={
                    locationUnconfirmed
                      ? 'The submitted address has not been confirmed.'
                      : 'The submitted address has been confirmed.'
                  }
                />
              </div>
            </section>

            {/* SUBMISSION */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Submission
              </h3>
              <p className="text-sm text-muted-foreground">
                Submitted {formatRelativeDate(listing.createdAt)} (
                {new Date(listing.createdAt).toLocaleString('en-IN')})
              </p>
            </section>
          </div>
        )}

        {mode === 'reject' && (
          <div className="mt-6 space-y-4 pb-24">
            <p className="text-sm text-muted-foreground">
              Select a reason for rejection. The broker will be notified.
            </p>
            <div className="space-y-2">
              <Label htmlFor="drawer-rejection-code">Reason</Label>
              <Select value={rejectionCode} onValueChange={setRejectionCode}>
                <SelectTrigger id="drawer-rejection-code">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {rejectionCodes.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="drawer-rejection-note">Note to broker (optional)</Label>
              <Textarea
                id="drawer-rejection-note"
                rows={3}
                value={rejectionNote}
                onChange={(e) => setRejectionNote(e.target.value)}
              />
            </div>
          </div>
        )}

        {mode === 'return' && (
          <div className="mt-6 space-y-4 pb-24">
            <p className="text-sm text-muted-foreground">
              Tell the broker what needs to change before resubmitting.
            </p>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Reason(s)</legend>
              {RETURN_FOR_EDITS_REASONS.map((reason) => (
                <div key={reason} className="flex items-center gap-2">
                  <Checkbox
                    id={`return-reason-${reason}`}
                    checked={returnReasons.includes(reason)}
                    onCheckedChange={() => toggleReturnReason(reason)}
                  />
                  <Label htmlFor={`return-reason-${reason}`} className="text-sm font-normal">
                    {reason}
                  </Label>
                </div>
              ))}
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="drawer-return-note">Note to broker (optional)</Label>
              <Textarea
                id="drawer-return-note"
                rows={3}
                value={returnNote}
                onChange={(e) => setReturnNote(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Sticky footer */}
        <div className="sticky bottom-0 -mx-6 mt-auto flex items-center justify-end gap-2 border-t bg-background px-6 py-4">
          {mode === 'review' && (
            <>
              <Button variant="outline" disabled={isBusy} onClick={() => setMode('reject')}>
                Reject
              </Button>
              <Button variant="secondary" disabled={isBusy} onClick={() => setMode('return')}>
                Return for edits
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={isBusy}>
                    {approvePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Approve
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve this listing?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Approve {listingIdentity}? This will make the listing public and live immediately.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      data-testid="confirm-approve-action"
                      onClick={() => onApprove(listing.id)}
                    >
                      Approve
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {mode === 'reject' && (
            <>
              <Button variant="outline" disabled={rejectPending} onClick={() => setMode('review')}>
                Cancel
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={!rejectionCode || rejectPending}
                  >
                    {rejectPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reject listing
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reject this listing?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Reject {listingIdentity} with reason &quot;{selectedRejectionLabel}&quot;? This will
                      permanently reject the listing and notify the broker. This cannot be undone the way
                      Return for edits can.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction data-testid="confirm-reject-action" onClick={handleRejectSubmit}>
                      Reject listing
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {mode === 'return' && (
            <>
              <Button variant="outline" disabled={returnForEditsPending} onClick={() => setMode('review')}>
                Cancel
              </Button>
              <Button
                disabled={returnReasons.length === 0 || returnForEditsPending}
                onClick={handleReturnSubmit}
              >
                {returnForEditsPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send back to broker
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
