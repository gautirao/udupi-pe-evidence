import { Loader2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';

interface BulkActionBarProps {
  selectedCount: number;
  eligibleCount: number;
  pending: boolean;
  onClear: () => void;
  onApprove: () => void;
}

export function BulkActionBar({ selectedCount, eligibleCount, pending, onClear, onApprove }: BulkActionBarProps) {
  const excludedCount = selectedCount - eligibleCount;

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-secondary px-4 py-2.5"
      data-testid="bulk-action-bar"
    >
      <p className="text-sm text-secondary-foreground">
        <span className="font-semibold">{selectedCount} selected</span>
        {excludedCount > 0 && (
          <span className="ml-2 text-amber-800">
            · {excludedCount} flagged, excluded from bulk approval
          </span>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear} disabled={pending}>
          Clear selection
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" data-testid="bulk-approve-trigger" disabled={eligibleCount === 0 || pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Approve {eligibleCount} eligible
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve {eligibleCount} listing{eligibleCount === 1 ? '' : 's'}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will make {eligibleCount} listing{eligibleCount === 1 ? '' : 's'} public and live
                immediately.
                {excludedCount > 0 &&
                  ` The ${excludedCount} flagged listing${excludedCount === 1 ? '' : 's'} in your selection will not be approved.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction data-testid="confirm-bulk-approve-action" onClick={onApprove}>
                Approve {eligibleCount} eligible
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
