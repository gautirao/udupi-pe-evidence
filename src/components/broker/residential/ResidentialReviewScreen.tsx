import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResidentialReviewPreview, type ResidentialReviewFacts } from './ResidentialReviewPreview';
import type { ListingStrengthResult } from '@/lib/listingStrength';

interface ResidentialReviewScreenProps {
  listingId: string;
  addressConfirmed: boolean;
  strengthResult: ListingStrengthResult;
  onBackToEdit: () => void;
  onSubmitForReview: () => void;
  submitPending: boolean;
  facts: ResidentialReviewFacts;
}

/**
 * #2387 — review mode composition: header + ResidentialReviewPreview +
 * sticky Back/Submit bar. Verbatim extraction, no behaviour change. Mirrors
 * CommercialReviewScreen (#2388).
 */
export function ResidentialReviewScreen({ listingId, addressConfirmed, strengthResult, onBackToEdit, onSubmitForReview, submitPending, facts }: ResidentialReviewScreenProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-24">
      <button type="button" onClick={onBackToEdit} className="mb-4 text-sm font-semibold text-primary">
        &larr; Back to editing
      </button>
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Residential listing
        </p>
        <h1 className="text-2xl font-bold text-foreground">Review your listing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Check everything looks right. Nothing here is publicly verified — it shows exactly what you entered.
        </p>
      </div>

      <ResidentialReviewPreview
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
