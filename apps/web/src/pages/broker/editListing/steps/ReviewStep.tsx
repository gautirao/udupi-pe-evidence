import { Button } from '@/components/ui/button';
import { AlertTriangle, Check, CheckCircle2, Loader2, MapPin, X } from 'lucide-react';
import { PoiManager } from '@/components/poi/PoiManager';
import { SectionCard } from '@/components/broker/SectionCard';
import type { ReviewStepProps } from './stepContracts';

/**
 * Issue #1838 slice 6a — extracted final "Review & Submit" step JSX block
 * from EditListingForm.tsx. STATELESS: all values/setters/handlers arrive as
 * props; EditListingForm remains the sole state owner. The parent keeps its
 * `{currentStep === reviewStep && (<div data-testid="step-review-panel">
 * ...)}` conditional guard verbatim — this component is the inner content
 * only.
 *
 * Issue #1838 PR C commit 3 — converted to the {view, commands} contract
 * (see stepContracts.ts). The submit button's disabled expression stays
 * exactly `isSubmitting || isSaving || !allConditionsMet` (same operator
 * order as the pre-conversion `submitListing.isPending || updateListing.isPending`).
 */
export function ReviewStep({
  view: {
    listing,
    listingImages,
    id,
    isSubmittable,
    canSubmitImages,
    requiredFieldsComplete,
    allConditionsMet,
    isRent,
    isAgriListing,
    boundaryCoords,
    showTitleLocalityWarning,
    confirmedLocality,
    isSubmitting,
    isSaving,
  },
  commands: { submitForReview, editStepFromReview, editBoundary, resetTitleToLocality },
}: ReviewStepProps) {
  return (
    <>
      {/* D1 hybrid — Title/locality consistency banner (non-dismissible) */}
      {showTitleLocalityWarning && (
        <div
          role="alert"
          data-testid="title-locality-warning"
          className="mb-4 flex items-start gap-3 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-yellow-600" />
          <div className="flex-1">
            <p className="font-medium">Title doesn't reflect the selected area</p>
            <p className="text-yellow-800 mt-0.5">
              Your title doesn't mention the confirmed location ({confirmedLocality.split(',')[0].trim()}).
              Update your title or click below to reset it.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-shrink-0 border-yellow-400 text-yellow-900 hover:bg-yellow-100"
            onClick={resetTitleToLocality}
          >
            Update title
          </Button>
        </div>
      )}

      {/* Review summary */}
      <SectionCard
        className="mb-4"
        title="Review your listing"
        description="Check the details below before submitting for admin review."
        contentClassName="space-y-4"
      >
          {/* Property Details row */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Property Details</p>
              <p className="text-sm text-muted-foreground">
                {listing.propertyType || '—'} · {listing.title || '—'}
                {listing.listingPurpose === 'rent' && ' · For Rent'}
              </p>
              <p className="text-sm text-muted-foreground">
                {listing.listingPurpose === 'rent'
                  ? listing.monthlyRent != null
                    ? `₹${listing.monthlyRent.toLocaleString('en-IN')}/mo`
                    : '—'
                  : listing.price != null
                    ? `₹${listing.price.toLocaleString('en-IN')}`
                    : '—'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => editStepFromReview(1)}
            >
              Edit
            </Button>
          </div>

          <div className="border-t" />

          {/* Photos row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Photos</p>
              {listingImages.length > 0 && (
                <div className="flex gap-1.5 mt-1.5 overflow-x-auto pb-1">
                  {listingImages.slice(0, 5).map((img, i) => (
                    <img
                      key={img.id}
                      src={img.url}
                      alt={`Photo ${i + 1}`}
                      className="h-12 w-12 object-cover rounded-md flex-shrink-0"
                    />
                  ))}
                  {listingImages.length > 5 && (
                    <div className="h-12 w-12 flex-shrink-0 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground font-medium">
                      +{listingImages.length - 5}
                    </div>
                  )}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                {canSubmitImages ? 'Minimum 3 photos uploaded' : 'Fewer than 3 photos — add more before submitting'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => editStepFromReview(2)}
            >
              Edit
            </Button>
          </div>

          <div className="border-t" />

          {/* Location row */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Location</p>
              <p className="text-sm text-muted-foreground">
                {listing.addressConfirmed
                  ? `Confirmed · ${listing.locality || 'pin set'}`
                  : 'Not yet confirmed'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => editStepFromReview(3)}
            >
              Edit
            </Button>
          </div>
      </SectionCard>

      {/* Boundary review — shown for agri listings when a boundary has been drawn */}
      {isAgriListing && (
        <SectionCard className="mb-4" title="Plot boundary" contentClassName="space-y-3">
            {boundaryCoords.length > 0 ? (
              <>
                <div
                  className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                  role="note"
                  data-testid="boundary-disclaimer-review"
                >
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                  <p>
                    The boundary drawn on the map is approximate and should be legally verified
                    before purchase.
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Boundary saved ({boundaryCoords.length} vertices).
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No boundary drawn (optional).</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={editBoundary}
              data-testid="boundary-review-edit-btn"
            >
              {boundaryCoords.length > 0 ? 'Edit Boundary' : 'Draw Boundary'}
            </Button>
        </SectionCard>
      )}

      {/* POIs — shown when address is confirmed */}
      {listing.addressConfirmed ? (
        <PoiManager listingId={id!} propertyType={listing.propertyType} />
      ) : (
        <SectionCard className="mb-4" title="Nearby points of interest">
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Location not yet confirmed</p>
              <p className="text-sm text-muted-foreground">
                Confirm your listing's address in step 3 to enable POI suggestions.
              </p>
            </div>
        </SectionCard>
      )}

      {/* Submit for Review (isSubmittable only) */}
      {isSubmittable && (
        <SectionCard
          title={(
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Ready to submit?
            </span>
          )}
          description="All requirements must be met before submitting for admin review."
          contentClassName="space-y-4"
        >
            <div className="space-y-3">
              {[
                {
                  label: 'Listing photos',
                  met: canSubmitImages,
                  detail: canSubmitImages
                    ? 'Minimum 3 photos uploaded'
                    : 'At least 3 photos required',
                  step: 2,
                },
                {
                  label: 'Location confirmed',
                  met: !!listing.addressConfirmed,
                  detail: listing.addressConfirmed
                    ? 'Pin position confirmed on map'
                    : 'Confirm your pin location in step 3',
                  step: 3,
                },
                {
                  label: 'Required fields',
                  met: requiredFieldsComplete,
                  detail: requiredFieldsComplete
                    ? 'All required fields filled in'
                    : isRent
                      ? 'Monthly rent, property type, and locality required'
                      : 'Price, property type, and locality required',
                  step: 1,
                },
              ].map(({ label, met, detail, step }) => (
                <div
                  key={label}
                  className={`flex items-start gap-3 rounded-md transition-colors ${
                    !met ? 'cursor-pointer hover:bg-accent/60 px-2 py-1 -mx-2' : ''
                  }`}
                  onClick={!met ? () => editStepFromReview(step) : undefined}
                  role={!met ? 'button' : undefined}
                  tabIndex={!met ? 0 : undefined}
                  onKeyDown={!met ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { editStepFromReview(step); }
                  } : undefined}
                >
                  {met
                    ? <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    : <X className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {detail}
                      {!met && <span className="ml-1 text-primary font-medium">→ Fix now</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t">
              <Button
                type="button"
                className="w-full"
                disabled={isSubmitting || isSaving || !allConditionsMet}
                onClick={submitForReview}
              >
                {isSubmitting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
                  : 'Submit for Review'}
              </Button>
              {listing.status === 'REJECTED' && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Previously rejected — review the feedback before resubmitting.
                </p>
              )}
            </div>
        </SectionCard>
      )}
    </>
  );
}
