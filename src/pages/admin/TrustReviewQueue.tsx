import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/formatters';

interface PendingTrustReview {
  dimensionId: string;
  listingId: string;
  dimensionType: 'PHOTOS' | 'AUTHORITY' | 'IDENTITY' | 'LOCATION';
  badgeState: 'PENDING';
  submittedAt: string;
  verificationAssetUrl: string | null;
  listingTitle: string | null;
  listingLocality: string | null;
  listingSellerType: 'owner' | 'broker';
}

interface ApproveRejectResponse {
  message: string;
}

const DIMENSION_TYPE_LABELS: Record<PendingTrustReview['dimensionType'], string> = {
  PHOTOS: 'Photos',
  AUTHORITY: 'Authority',
  IDENTITY: 'Identity',
  LOCATION: 'Location',
};

const SELLER_TYPE_LABELS: Record<PendingTrustReview['listingSellerType'], string> = {
  owner: 'Owner',
  broker: 'Broker',
};

const QUERY_KEY = ['admin', 'trust', 'pending-reviews'] as const;

export default function TrustReviewQueue() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [rejectTarget, setRejectTarget] = useState<PendingTrustReview | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const {
    data: reviews = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PendingTrustReview[]>({
    queryKey: [...QUERY_KEY],
    queryFn: () => api.get<PendingTrustReview[]>('/api/admin/trust/pending-reviews'),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (dimensionId: string) =>
      api.post<ApproveRejectResponse>(`/api/admin/trust/${dimensionId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
      toast({ title: 'Badge approved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ dimensionId, reason }: { dimensionId: string; reason: string }) =>
      api.post<ApproveRejectResponse>(`/api/admin/trust/${dimensionId}/reject`, reason.trim() ? { reason: reason.trim() } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
      setRejectTarget(null);
      setRejectReason('');
      toast({ title: 'Badge submission rejected' });
    },
    onError: (err: Error) => {
      setRejectTarget(null);
      setRejectReason('');
      toast({ title: 'Rejection failed', description: err.message, variant: 'destructive' });
    },
  });

  const isBusy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <AppLayout>
      <div className="container py-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Trust Review Queue
            </h1>
            <p className="text-muted-foreground">
              Review pending trust badge submissions
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {reviews.length} pending
          </Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
              <p className="text-destructive font-medium mb-1">Failed to load submissions</p>
              <p className="text-sm text-muted-foreground mb-4">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : reviews.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
              No pending submissions
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dimension Type</TableHead>
                  <TableHead>Listing</TableHead>
                  <TableHead>Seller Type</TableHead>
                  <TableHead>Submitted At</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review) => (
                  <TableRow key={review.dimensionId}>
                    <TableCell>
                      <Badge variant="outline">
                        {DIMENSION_TYPE_LABELS[review.dimensionType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="font-medium truncate">
                        {review.listingTitle || 'Untitled'}
                      </p>
                      {review.listingLocality && (
                        <p className="text-xs text-muted-foreground truncate">
                          {review.listingLocality}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {SELLER_TYPE_LABELS[review.listingSellerType]}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatRelativeDate(review.submittedAt)}
                    </TableCell>
                    <TableCell>
                      {review.verificationAssetUrl ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-xs h-7 px-2"
                          asChild
                        >
                          <a
                            href={review.verificationAssetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View Asset
                          </a>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-200 hover:bg-green-50"
                          disabled={isBusy}
                          onClick={() => approveMutation.mutate(review.dimensionId)}
                          aria-label={`Approve ${DIMENSION_TYPE_LABELS[review.dimensionType]} badge`}
                        >
                          {approveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          disabled={isBusy}
                          onClick={() => setRejectTarget(review)}
                          aria-label={`Reject ${DIMENSION_TYPE_LABELS[review.dimensionType]} badge`}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Reject confirmation dialog */}
        <Dialog
          open={!!rejectTarget}
          onOpenChange={(open) => {
            if (!open) {
              setRejectTarget(null);
              setRejectReason('');
            }
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
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                maxLength={500}
                rows={3}
                disabled={rejectMutation.isPending}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                disabled={rejectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={rejectMutation.isPending}
                onClick={() => {
                  if (rejectTarget) rejectMutation.mutate({ dimensionId: rejectTarget.dimensionId, reason: rejectReason });
                }}
              >
                {rejectMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
