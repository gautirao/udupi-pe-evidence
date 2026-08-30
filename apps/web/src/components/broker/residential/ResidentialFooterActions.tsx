import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ListingStrengthResult } from '@/lib/listingStrength';

interface ResidentialFooterActionsProps {
  canSubmit: boolean;
  strengthResult: ListingStrengthResult;
  createPending: boolean;
  updatePending: boolean;
  isRecoveringDraft: boolean;
  onSaveDraft: () => void;
  onReview: () => void;
}

/**
 * #2387 — sticky footer (design-spec.md §footer), edit-mode Save
 * draft/Review actions. Verbatim extraction, no behaviour change.
 *
 * Issue #2040 (AC6) — must never claim "Good listing" while a real submit
 * gate is unmet; canSubmit alone (price validity only) is not sufficient.
 * Keyed off strengthResult, the byte-for-byte backend submit-gate mirror
 * (see listingStrength.ts), and surfaces the remaining-blocker count instead
 * of false positive framing.
 */
export function ResidentialFooterActions({ canSubmit, strengthResult, createPending, updatePending, isRecoveringDraft, onSaveDraft, onReview }: ResidentialFooterActionsProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {!canSubmit
            ? 'Add price and property type to continue'
            : strengthResult.isSubmittable
              ? `Good listing · ${strengthResult.percent}% complete`
              : `${strengthResult.missingItems.length} thing${strengthResult.missingItems.length === 1 ? '' : 's'} left before you can submit · ${strengthResult.percent}% complete`}
        </p>
        <div className="flex gap-3">
          {/* Issue #2039 (revision 4, finding 1) — these two actions live in the
              sticky footer, outside the <fieldset> above, so they need their own
              isRecoveringDraft guard: without it a broker could fire persistDraft()
              (and PUT/POST blank or stale field values) while the real draft is
              still loading, even though every input above is disabled. */}
          <Button type="button" variant="outline" onClick={onSaveDraft} disabled={!canSubmit || createPending || updatePending || isRecoveringDraft}>
            {(createPending || updatePending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save draft
          </Button>
          <Button type="button" onClick={onReview} disabled={!canSubmit || createPending || updatePending || isRecoveringDraft}>
            {(createPending || updatePending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Review
          </Button>
        </div>
      </div>
    </div>
  );
}
