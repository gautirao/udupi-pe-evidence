import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AgriculturalFooterActionsProps {
  canSubmit: boolean;
  strengthPercent: number;
  createPending: boolean;
  updatePending: boolean;
  onSaveDraft: () => void;
  onReview: () => void;
}

/** #2398 — sticky footer, edit-mode Save draft/Review actions. Verbatim extraction, no behaviour change. */
export function AgriculturalFooterActions({ canSubmit, strengthPercent, createPending, updatePending, onSaveDraft, onReview }: AgriculturalFooterActionsProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {canSubmit ? `Good listing · ${strengthPercent}% complete` : 'Add a price to continue'}
        </p>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onSaveDraft} disabled={!canSubmit || createPending || updatePending}>
            {(createPending || updatePending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save draft
          </Button>
          <Button type="button" onClick={onReview} disabled={!canSubmit || createPending || updatePending}>
            {(createPending || updatePending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Review
          </Button>
        </div>
      </div>
    </div>
  );
}
