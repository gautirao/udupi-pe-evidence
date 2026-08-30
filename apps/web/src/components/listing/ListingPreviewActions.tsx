import { Button } from '@/components/ui/button';
import { useArchiveListing, useReopenAsDraftListing } from '@/hooks/useBrokerListings';
import { useToast } from '@/hooks/use-toast';
import { Archive, RotateCcw } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function TakeOfflineButton({ listingId }: { listingId: string }) {
  const archiveMutation = useArchiveListing(listingId);
  const { toast } = useToast();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={archiveMutation.isPending}>
          <Archive className="h-4 w-4 mr-1" />
          {archiveMutation.isPending ? 'Archiving…' : 'Take Offline'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Take Listing Offline</AlertDialogTitle>
          <AlertDialogDescription>
            This will archive your listing and remove it from public search results.
            You can reopen it for editing later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => archiveMutation.mutate(undefined, {
            onSuccess: () => toast({ title: 'Listing archived', description: 'Your listing has been taken offline.' }),
          })}>
            Take Offline
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ReopenForEditingButton({ listingId }: { listingId: string }) {
  const reopenMutation = useReopenAsDraftListing(listingId);
  const { toast } = useToast();
  return (
    <Button variant="outline" size="sm" disabled={reopenMutation.isPending}
      onClick={() => reopenMutation.mutate(undefined, {
        onSuccess: () => toast({ title: 'Listing reopened', description: 'Your listing is now a draft. You can edit and resubmit it.' }),
      })}
    >
      <RotateCcw className="h-4 w-4 mr-1" />
      {reopenMutation.isPending ? 'Reopening…' : 'Reopen for Editing'}
    </Button>
  );
}
