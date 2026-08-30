import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommercialReviewPreview, type CommercialReviewFacts } from '@/components/broker/commercial/CommercialReviewPreview';
import type { ListingStrengthResult } from '@/lib/listingStrength';

export interface CommercialReviewScreenProps {
  listingId: string;
  addressConfirmed: boolean;
  strengthResult: ListingStrengthResult;
  facts: CommercialReviewFacts;
  onBackToEdit: () => void;
  onSubmitForReview: () => void;
  submitPending: boolean;
}

/**
 * #2388 — the "review" mode screen: read-only summary + submit-for-review
 * sticky footer. Deliberately does NOT render the location bridge itself —
 * the composition root keeps it at a stable position across edit<->review
 * so switching modes never remounts the single useResidentialLocation
 * instance (a sibling component boundary here would change React's
 * reconciliation and replay its one-time mount-hydration effect).
 */
export function CommercialReviewScreen({ listingId, addressConfirmed, strengthResult, facts, onBackToEdit, onSubmitForReview, submitPending }: CommercialReviewScreenProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <button type="button" onClick={onBackToEdit} className="mb-4 text-sm font-semibold text-primary">
          &larr; Back to editing
        </button>
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Commercial listing
          </p>
          <h1 className="text-2xl font-bold text-foreground">Review your listing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Check everything looks right. Nothing here is publicly verified — it shows exactly what you entered.
          </p>
        </div>

        <CommercialReviewPreview
          listingId={listingId}
          addressConfirmed={addressConfirmed}
          strengthResult={strengthResult}
          onEditSection={onBackToEdit}
          facts={facts}
        />

        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {strengthResult.isSubmittable ? 'Ready to submit for review' : `${strengthResult.missingItems.length} item(s) still needed`}
            </p>
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={onBackToEdit}>
                Back to editing
              </Button>
              <Button
                type="button"
                onClick={onSubmitForReview}
                disabled={!strengthResult.isSubmittable || submitPending}
              >
                {submitPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit for review
              </Button>
            </div>
          </div>
        </div>
    </div>
  );
}
