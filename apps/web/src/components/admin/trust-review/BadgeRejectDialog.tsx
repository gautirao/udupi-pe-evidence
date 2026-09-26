import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { PendingTrustReview } from './trustReviewTypes';

interface BadgeRejectDialogProps {
  target: PendingTrustReview | null;
  reason: string;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

/**
 * Extracted from TrustReviewQueue.tsx (issue #2663) — the badge-reject
 * dialog. Reason is OPTIONAL here (unlike IdentityRejectDialog) — do not
 * make this uniform with the identity dialog's required-reason behavior.
 */
export function BadgeRejectDialog({
  target,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  isPending,
}: BadgeRejectDialogProps) {
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Submission</DialogTitle>
          <DialogDescription>
            This will return the badge to Available state. You may optionally add a reason
            visible to the broker.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="reject-reason" className="text-sm mb-1.5 block">
            Reason <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="reject-reason"
            placeholder="e.g. Document appears to be expired"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            maxLength={500}
            rows={3}
            disabled={isPending}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
