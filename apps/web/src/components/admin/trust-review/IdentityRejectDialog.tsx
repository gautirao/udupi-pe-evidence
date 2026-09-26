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
import type { PendingIdentityEvidence } from './trustReviewTypes';

interface IdentityRejectDialogProps {
  target: PendingIdentityEvidence | null;
  reason: string;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

/**
 * Extracted from TrustReviewQueue.tsx (issue #2663) — the identity-evidence
 * reject dialog. Reason is REQUIRED here (unlike BadgeRejectDialog) — the
 * confirm button stays disabled while the trimmed reason is empty.
 */
export function IdentityRejectDialog({
  target,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  isPending,
}: IdentityRejectDialogProps) {
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Identity Evidence</DialogTitle>
          <DialogDescription>
            This will reset the identity badge to Available state and allow the user to resubmit.
            A reason is required.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="identity-reject-reason" className="text-sm mb-1.5 block">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="identity-reject-reason"
            placeholder="e.g. Document is blurry or name does not match"
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
          <Button
            variant="destructive"
            disabled={isPending || !reason.trim()}
            onClick={onConfirm}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
