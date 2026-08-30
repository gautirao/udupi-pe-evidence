import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface CommercialFooterActionsProps {
  canSubmit: boolean;
  strengthPercent: number;
  createPending: boolean;
  updatePending: boolean;
  isRecoveringDraft: boolean;
  onSaveDraft: () => void;
  onReview: () => void;
}

/** #2388 — sticky footer for edit mode: save-draft / review actions. */
export function CommercialFooterActions({ canSubmit, strengthPercent, createPending, updatePending, isRecoveringDraft, onSaveDraft, onReview }: CommercialFooterActionsProps) {
  const pending = createPending || updatePending;
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {canSubmit ? `Good listing · ${strengthPercent}% complete` : 'Add a subtype, purpose, and price to continue'}
        </p>
        <div className="flex gap-3">
          {/* #2348 — these two actions live in the sticky footer, outside
              the form's <fieldset>, so they need their own explicit
              isRecoveringDraft guard: without it a broker could fire
              persistDraft() (and PUT/POST blank or stale field values)
              while the real draft is still loading, even though every
              input above is disabled. Mirrors ResidentialListingForm.tsx
              (issue #2039, revision 4, finding 1). */}
          <Button type="button" variant="outline" onClick={onSaveDraft} disabled={!canSubmit || pending || isRecoveringDraft}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save draft
          </Button>
          <Button type="button" onClick={onReview} disabled={!canSubmit || pending || isRecoveringDraft}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Review
          </Button>
        </div>
      </div>
    </div>
  );
}
